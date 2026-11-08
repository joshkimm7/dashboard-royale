import { useModel } from '../modelContext.js';
import { Card, Chart, Details, Metrics, Note, Panel, Table, Tabbed, Takeaway } from '../components/ui.jsx';
import { SERIES, by, cash, compact, month, months, n, pct, ratio } from '../lib/format.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function SchedulingScores() {
  const { schedulingScore, peakThreshold, quietThreshold } = useModel();
  const rows = ['Peak', 'Regular', 'Quiet'].flatMap(tier => [['Weekday forecast', 10], ['Same weekday last week', 12], ['Calendar-adjusted weekday', 14]].map(([model, column]) => {
    const { hits, missed, falseFlags } = schedulingScore(tier, column);
    return [tier, model, n(hits + missed), n(hits), n(missed), n(falseFlags)];
  }));
  return (
    <>
      <Note>{'Same 61 holdout days. Peak ≥ ' + cash(peakThreshold) + ', quiet < ' + cash(quietThreshold) + ', regular in between. A false flag means the forecast tier was wrong.'}</Note>
      <Table headers={['Day type', 'Model', 'Actual days', 'Correct flags', 'Missed days', 'False flags']} rows={rows} />
    </>
  );
}

function StaffingReplay() {
  const { schedulingScore, schedulingTier, peakThreshold, holdout } = useModel();
  const models = [['Weekday forecast', 10], ['Same weekday last week', 12]];
  const cutoffs = [1450000, peakThreshold, 1550000];
  const rows = cutoffs.flatMap(cutoff => models.map(([name, column]) => {
    const { hits, missed, falseFlags } = schedulingScore('Peak', column, coin => coin >= cutoff ? 'Peak' : 'Other');
    return [compact(cutoff), name, n(hits + missed), n(hits + falseFlags), n(hits), n(missed), n(falseFlags)];
  }));
  const weekdayMisses = holdout.filter(day => schedulingTier(day[3]) === 'Peak' && schedulingTier(day[10]) !== 'Peak');
  const falseLag = holdout.filter(day => schedulingTier(day[3]) !== 'Peak' && schedulingTier(day[12]) === 'Peak');
  return (
    <Panel title="Staffing decision · holdout replay" id="staffing-check">
      <Takeaway>{'Schedule routine flex coverage when forecast wagers reach ' + cash(peakThreshold) + '. Review announced events separately using bookings and live traffic.'}</Takeaway>
      <Table headers={['Cutoff', 'Forecast', 'Actual peaks', 'Coverage days', 'Peaks caught', 'Peaks missed', 'Unneeded coverage']} rows={rows} />
      <Note>Simulated May–June. At $1.45m the weekday rule caught one more peak but added seven coverage days. At $1.50m both rules caught 18 of 19 peaks, with 18 vs 19 coverage days. The cost of a missed peak wasn’t measured.</Note>
      <Details title="Which days changed the call?">{'The weekday rule missed ' + weekdayMisses.map(r => r[0] + ' (actual ' + cash(r[3]) + ', forecast ' + cash(r[10]) + ')').join(', ') +
        '. The last-week rule scheduled unneeded coverage on ' + falseLag.map(r => r[0] + ' (actual ' + cash(r[3]) + ', forecast ' + cash(r[12]) + ')').join(', ') + '.'}</Details>
    </Panel>
  );
}

/**
 * One small chart per forecast, each against actual wagers on a shared y-scale, so the three can be
 * compared side by side instead of reading four tangled lines on one plot.
 */
function ForecastMultiples({ holdout, mae, spike, replay, eventDay, replayDay }) {
  const labels = holdout.map(r => months[month(r[0])] + ' ' + Number(r[0].slice(8)));
  const all = holdout.flatMap(r => [r[3], r[10], r[12], r[14]]);
  const lo = Math.min(...all), hi = Math.max(...all);
  const edc = { index: spike, value: eventDay[3], label: 'May 17 · EDC weekend', yOffset: 13 };
  const panels = [
    ['Weekday forecast', 10, [edc]],
    ['Same weekday last week', 12, [{ index: replay, value: replayDay[12], label: 'May 24 · spike repeated', yOffset: 13 }]],
    ['Calendar-adjusted weekday', 14, [edc]],
  ];
  return (
    <div className="multiples">
      {panels.map(([name, col, annotations], i) => (
        <div className="multiple" key={name}>
          <h3 className="multiple-title">
            <span><i className="key-line" style={{ '--c': SERIES.blue }} />{name}<span className="multiple-vs"> vs <i className="key-line" style={{ '--c': SERIES.gold }} />actual</span></span>
            <span className="multiple-stat"><i className="miss-key" aria-hidden="true" />Shaded = miss · average <strong>{cash(mae(holdout, col))}</strong> a day</span>
          </h3>
          <Chart title={i === 0 ? 'A fair test on future days' : null} labels={labels} format={compact} height={200} min={lo} max={hi} annotations={annotations} fillBetween={{ a: 0, b: 1, color: SERIES.rose }}
            series={[{ name: 'Actual', color: SERIES.gold, values: holdout.map(r => r[3]) }, { name, color: SERIES.blue, values: holdout.map(r => r[col]) }]} />
        </div>
      ))}
    </div>
  );
}

export default function Model() {
  const m = useModel();
  const { data, holdout, mae, pairedSummary, m1, m7, mCalendar, schedulingTier, inspect } = m;
  const july = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2025, 6, i + 1))).map(d => ({ date: d.toISOString().slice(0, 10), day: WEEKDAYS[(d.getUTCDay() + 6) % 7] }));
  const sample = Object.fromEntries(data.property.slice(0, 14).map(r => [r[1], r[10]]));
  const scheduled = july.map(d => {
    const [, holiday, event] = data.julyFlags.find(r => r[0] === d.date) ?? [];
    return [d.date, d.day, sample[d.day], sample[d.day] + (holiday ? data.validation.effects[0] : 0) + (event ? data.validation.effects[1] : 0), [holiday, event].filter(Boolean).join(' · ')];
  });
  const monthly = [...by(holdout, r => month(r[0])).entries()];
  const spike = holdout.findIndex(r => r[0] === '2025-05-17'), replay = spike + 7;
  const eventDay = holdout[spike], replayDay = holdout[replay];
  const juneEvents = holdout.filter(r => month(r[0]) === 5 && r[16]);

  const views = {
    holdout: () => (
      <>
        <Panel title="A fair test on future days">
          <Takeaway>Use weekday averages to plan routine staffing. Calendar flags made little difference overall and were less accurate on June event days.</Takeaway>
          <Note>Models learn from Jan–Apr and are scored on the same 61 days (May 1–Jun 30). “Last week” simply repeats the total from seven days earlier.</Note>
          <ForecastMultiples holdout={holdout} mae={mae} spike={spike} replay={replay} eventDay={eventDay} replayDay={replayDay} />
          <Note>{'EDC weekend (May 17): actual ' + cash(eventDay[3]) + ', weekday forecast ' + cash(eventDay[10]) + ', calendar-adjusted ' + cash(eventDay[14]) + '. A week later, “last week” repeated the spike (' + cash(replayDay[12]) + ' vs ' + cash(replayDay[3]) + ' actual); the weekday forecast didn’t.'}</Note>
          <Table headers={['Holdout', 'Days', 'Frozen weekday MAE', 'Same weekday last week MAE', 'Calendar-adjusted MAE', 'Constant mean MAE']}
            rows={[...monthly.map(([mo, r]) => [months[mo], r.length, cash(mae(r, 10)), cash(mae(r, 12)), cash(mae(r, 14)), cash(mae(r, 11))]), ['May–Jun', holdout.length, cash(m1), cash(m7), cash(mCalendar), cash(mae(holdout, 11))]]} />
          <Note>{'Frozen weekday vs. last week: ' + pairedSummary(data.validation.frozen) + ' The interval crosses zero.'}</Note>
          <Note>{'Calendar-adjusted vs. frozen weekday: ' + pairedSummary(data.validation.calendar) + ' The interval crosses zero. On ' + juneEvents.length + ' Locals Week days, error rose from ' + cash(mae(juneEvents, 10)) + ' to ' + cash(mae(juneEvents, 14)) + ': the ' + cash(data.validation.effects[1]) + ' event adjustment overshot.'}</Note>
          <Details title="Calendar flags and paired uncertainty">{'The calendar adjustment fits January–April weekday residuals to two flags, federal holiday and events announced before the forecast date. It shrinks each adjustment with four zero-effect pseudo-observations. Training included ' + data.validation.trainingFlagDays[0] + ' holiday days and ' + data.validation.trainingFlagDays[1] + ' known event days. The event effect is pooled across events. The paired interval resamples seven-day circular blocks of daily error differences 10,000 times, keeping forecasts fixed.'}</Details>
        </Panel>
        <Panel title="Does it hold over an earlier window?">
          <Takeaway>{'Expanding weekday vs. last week: ' + pairedSummary(data.validation.expanding) + ' This interval stays above zero.'}</Takeaway>
          <Note>Refits weekday averages using only earlier days, from March onward (122 days). May–June overlaps the main holdout.</Note>
          <Table headers={['Period', 'Days', 'Expanding weekday MAE', 'Same weekday last week MAE']}
            rows={[['Mar–Apr', data.property.filter(r => r[0] >= '2025-03-01' && r[0] < '2025-05-01')], ['May–Jun', holdout], ['Mar–Jun', data.property.filter(r => r[0] >= '2025-03-01')]].map(([label, r]) => [label, r.length, cash(mae(r, 13)), cash(mae(r, 12))])} />
        </Panel>
      </>
    ),
    staffing: () => (
      <>
        <StaffingReplay />
        <Panel title="Did the forecast flag the right days?">
          <SchedulingScores />
          <details>
            <summary>Calendar flags in the holdout</summary>
            <Table headers={['Gaming date', 'Holiday', 'Announced event', 'Actual wagers', 'Weekday forecast', 'Calendar-adjusted forecast']}
              rows={holdout.filter(r => r[15] || r[16]).map(r => [r[0], r[15] || '—', r[16] ? 'Yes' : '—', cash(r[3]), cash(r[10]), cash(r[14])])} />
          </details>
        </Panel>
      </>
    ),
    july: () => (
      <Panel title="Use the forecast to staff routine days">
        <Takeaway>Use routine weekday tiers to plan flex coverage. Keep event staffing separate and confirm the roster using bookings and live traffic.</Takeaway>
        <Note>The base forecast repeats each weekday. July 4 gets a holiday adjustment (based on few past holidays). No July events are announced yet, so check the calendar. Staff any promotion on top of this base using registrations.</Note>
        <Table headers={['Flagged date', 'Weekday', 'Base daily wagers', 'Calendar-adjusted wagers', 'Known flags']} rows={scheduled.filter(r => r[4]).map(r => [r[0], r[1], cash(r[2]), cash(r[3]), r[4]])} />
        <Table headers={['Weekday', 'Base daily wagers', 'Scheduling tier']} rows={WEEKDAYS.map(day => [day, cash(sample[day]), schedulingTier(sample[day])])} />
        <Note>{'Timing the M-1158 inspection in a quiet window saves about ' + cash((data.inspectionWindow.typical - data.inspectionWindow.coin) * ratio(inspect.theo, inspect.coin)) + ' in expected win, which is small next to staffing.'}</Note>
        <Details title="Inputs, limits and reproducibility">The weekday forecast is the training-set mean coin-in for each weekday. The constant benchmark is the training-set daily mean. MAE averages the absolute dollar error per holdout day. Rolling methods can use outcomes already known on the forecast date. The models exclude future wagers, traffic, revised tourism data and event outcomes. Calendar flags use schedules known before the forecast date. Six months limit evidence about other seasons. The $1.5m and $1.25m tiers are operational planning assumptions. The model ranks days at property level. For within-day scheduling, confirm low bank traffic with live observations.</Details>
      </Panel>
    ),
  };

  return (
    <>
      <Metrics>
        <Card label="Weekday forecast MAE" value={cash(m1)} sub="May–Jun holdout · 61 gaming days" />
        <Card label="Same weekday last week MAE" value={cash(m7)} sub="Same holdout · rolling day-ahead" />
        <Card label="Error reduction" value={pct(1 - m1 / m7)} sub="Versus same weekday last week" />
        <Card label="Calendar-adjusted MAE" value={cash(mCalendar)} sub="Holiday and announced-event flags" />
      </Metrics>
      {/* Remount per sub-tab: the original redrew the sub-tab bar, so Back/forward left focus on the body. */}
      <Tabbed tab="model" views={views} />
    </>
  );
}
