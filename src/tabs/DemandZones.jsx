// Demand → Zones: why demand changed, by zone, traffic, time of week and real-world context (weather, Missouri).
import { useModel } from '../modelContext.js';
import { useNav } from '../nav.jsx';
import { Chart, How, Line, Note, Panel, Table, Takeaway } from '../components/ui.jsx';
import { Heatmap } from '../components/Heatmap.jsx';
import { SERIES, by, cash, compact, month, months, n, pct, ratio, signedPct, sum } from '../lib/format.js';
import { heatGrid, missouriMonthly, zoneContribution, zoneMonthly, zoneTraffic } from '../lib/zones.js';

const signedCash = v => v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + cash(v);
const interval = ([, lo, hi], f) => f(lo) + ' to ' + f(hi);
const excludesZero = ([, lo, hi]) => lo > 0 || hi < 0;

/** Comparison months: April → June when both are selected, otherwise the first and last selected months. */
export const comparisonMonths = (from, to) => from <= 3 && to >= 5 ? [3, 5] : [from, to];

export default function DemandZones() {
  const m = useModel();
  const { data, zones: zoneNames, scope, bankZone, weekdayAdjusted } = m;
  const { state } = useNav();
  const floor = scope({ from: state.from, to: state.to, bank: '' });
  const bank = state.bank ? scope(state) : null;
  const ownZone = state.bank ? bankZone[state.bank] : state.zone || null;
  const [a, b] = comparisonMonths(state.from, state.to);
  const name = z => zoneNames[z] ?? z;
  const mark = z => z === ownZone ? <span className="zone-focus">{name(z) + (state.bank ? ' · selected bank’s zone' : ' · selected zone')}</span> : name(z);

  const zm = zoneMonthly(floor.rows, data.dates);
  const contribution = a !== b ? zoneContribution(floor.rows, data.dates, weekdayAdjusted, a, b) : null;
  const biggest = contribution?.zones.slice().sort((x, y) => Math.abs(y.change) - Math.abs(x.change))[0];
  const steepest = contribution?.zones.filter(r => r.a.rate && r.b.rate).sort((x, y) => x.b.rate / x.a.rate - y.b.rate / y.a.rate)[0];
  const focus = ownZone ?? biggest?.zone ?? floor.rows[0]?.zone;
  const zoneIds = [...new Set(floor.rows.map(r => r.zone))].sort();
  const rateOf = rows => zm.months.map(mo => (g => ratio(sum(g, r => r.coin), sum(g, r => r.h)))(rows.filter(r => month(data.dates[r.d]) === mo)));
  const labels = zm.months.map(mo => months[mo]);
  const series = [
    { name: name(focus), color: SERIES.gold, values: zm.months.map(mo => zm.get(focus, mo)?.rate) },
    bank ? { name: 'Bank ' + state.bank, color: SERIES.blue, values: rateOf(bank.rows) } : { name: 'Whole floor', color: SERIES.blue, dash: '7 5', values: rateOf(floor.rows) },
    ...zoneIds.filter(z => z !== focus).map(z => ({ name: name(z), color: SERIES.muted, muted: true, values: zm.months.map(mo => zm.get(z, mo)?.rate) })),
  ];

  const traffic = zoneTraffic(data.zoneTraffic, data.dates, floor.start, floor.end);
  const heatZone = ownZone && data.heat.zones.includes(ownZone) ? ownZone : null;
  const cells = heatGrid(data.heat, heatZone, state.from, state.to);
  const peak = cells.reduce((x, c) => (c.value > x.value ? c : x)), trough = cells.reduce((x, c) => (c.value < x.value ? c : x));
  const weekdays = data.heat.weekdays;
  const clock = h => String(h).padStart(2, '0') + ':00';

  const wx = data.weather;
  const rainIn = mo => wx.days.filter(([, mm], d) => mm >= 1 && month(data.dates[d]) === mo).length;
  const heatPer10 = v => signedCash(10 * v);
  const mo = missouriMonthly(data.missouri);
  const propertyPerDay = mo2 => (rows => ratio(sum(rows, r => r[3]), rows.length))(data.property.filter(r => month(r[0]) === mo2));
  const selected = mo.state.filter(r => r.m >= state.from && r.m <= state.to);
  const base = selected[0];
  const ownIndex = selected.map(r => 100 * propertyPerDay(r.m) / propertyPerDay(base.m));
  const moIndex = selected.map(r => 100 * r.perDay / base.perDay);
  const moChange = a !== b ? mo.state[b].perDay / mo.state[a].perDay - 1 : null;
  const ownChange = a !== b ? propertyPerDay(b) / propertyPerDay(a) - 1 : null;
  const propertyChanges = a !== b ? mo.propertyChange(a, b) : [];
  const span = months[a] + '→' + months[b];
  // More rain days in the later month would push wagers down (the test finds rain days run below expectation).
  const rainExplains = ownChange != null && (ownChange < 0 ? rainIn(b) > rainIn(a) : rainIn(a) > rainIn(b));

  return (
    <>
      {!state.bank && state.zone && <Note>{name(state.zone) + ' is highlighted below. Zone-level panels always show every zone for comparison; the zone filter narrows the machine rows in the other Demand views.'}</Note>}
      {state.bank && <Note>{'Bank ' + state.bank + ' sits in ' + name(ownZone) + '. Traffic counters and the hourly heat map are zone-level, so that zone is highlighted; the bank’s own coin-in appears in the first chart and the contribution panel.'}</Note>}
      <Panel title="Zone demand per available hour">
        <Note>{'Coin-in per available machine-hour by zone, so zones with more cabinets or more downtime compare fairly. Gold: ' + name(focus) +
          (ownZone ? (state.bank ? ' (the selected bank’s zone)' : ' (the selected zone)') : ' (the zone that moved property coin-in most between the comparison months)') + '. Other zones are muted.'}</Note>
        <Chart title="Zone demand per available hour" labels={labels} format={v => cash(v)} height={260} markers series={series} />
        <Table headers={['Zone', ...labels, 'Change ' + span]}
          rows={zoneIds.map(z => [mark(z), ...zm.months.map(mo2 => cash(zm.get(z, mo2)?.rate)),
            (ra => (rb => signedPct(ra && rb && a !== b ? rb / ra - 1 : null))(zm.get(z, b)?.rate))(zm.get(z, a)?.rate)])} />
      </Panel>

      <Panel title="Which zones drove the change?" id="zones-check">
        {contribution ? (
          <>
            <Takeaway>{'From ' + months[a] + ' to ' + months[b] + ', property coin-in moved ' + signedCash(contribution.total) + ' per day (' + signedPct(contribution.after / contribution.before - 1) + '). ' +
              name(biggest.zone) + ' moved the most, ' + signedCash(biggest.change) + ' per day' + (biggest.share > 0 ? ' (' + pct(biggest.share, 0) + ' of the change)' : ', against the overall direction') +
              (steepest ? '; ' + name(steepest.zone) + ' had the steepest change in coin-in per available hour (' + signedPct(steepest.b.rate / steepest.a.rate - 1) + ').' : '.') +
              ' Across zones, available machine-hours account for ' + signedCash(sum(contribution.zones, r => r.hoursEffect)) + ' per day and coin-in per available hour for ' + signedCash(sum(contribution.zones, r => r.rateEffect)) + '.'}</Takeaway>
            <Table headers={['Zone', months[a] + ' $/day', months[b] + ' $/day', 'Change $/day', 'Share of change', 'Machine-hours effect', 'Rate effect', 'Event-free weekday-adjusted change']}
              rows={[...contribution.zones.map(r => [mark(r.zone), cash(r.a.coin), cash(r.b.coin), signedCash(r.change), pct(r.share, 0), signedCash(r.hoursEffect), signedCash(r.rateEffect), signedCash(r.adjustedChange)]),
                [<strong key="t">Property total</strong>, cash(contribution.before), cash(contribution.after), signedCash(contribution.total), pct(1, 0),
                  signedCash(sum(contribution.zones, r => r.hoursEffect)), signedCash(sum(contribution.zones, r => r.rateEffect)), signedCash(contribution.adjustedTotal)]]} />
            {bank && (b2 => <Line label="Selected bank coin-in per day · comparison months" value={cash(b2.before) + ' → ' + cash(b2.after) + ' (' + signedCash(b2.total) + ')'} />)(zoneContribution(bank.rows, data.dates, weekdayAdjusted, a, b))}
            <How>{'Additive decomposition. Property coin-in per day is the sum of zone coin-in per day, so each zone’s contribution is its own change and the column sums to the total exactly. Each zone’s change splits into a machine-hours effect (change in available machine-hours per day × average coin-in per hour) and a rate effect (change in coin-in per available hour × average machine-hours), weighted by the two-month averages so they also add up. The adjusted column drops recorded event days and weights the seven weekdays equally within each zone; it is linear in coin-in, so it also sums to the adjusted property change. Comparison months are April and June when both are selected, otherwise the first and last selected months. The split shows where wagers moved, not why.'}</How>
          </>
        ) : <Note>Select at least two months to compare zones.</Note>}
      </Panel>

      <Panel title="Zone traffic">
        <Note>Zone counters count entries (door and zone crossings), not unique guests, and seated players do not cross sensors. An offline hour is excluded, never counted as zero; entries per day are scaled to a full gaming day from the minutes each counter was working.</Note>
        <Table headers={['Zone', ...labels.map(l => l + ' entries/day'), ...(a !== b ? ['Entries ' + span, 'Coin-in/day ' + span] : []), 'Counter coverage', 'Offline hours']}
          rows={data.zoneTraffic.zones.map(z => {
            const t = traffic.total(z);
            const ea = traffic.get(z, a)?.perDay, eb = traffic.get(z, b)?.perDay;
            const ca = zm.get(z, a)?.perDay, cb = zm.get(z, b)?.perDay;
            return [mark(z), ...zm.months.map(mo2 => n(traffic.get(z, mo2)?.perDay)),
              ...(a !== b ? [signedPct(ea && eb ? eb / ea - 1 : null), signedPct(ca && cb ? cb / ca - 1 : null)] : []), pct(t.coverage, 1), n(t.offline)];
          })} />
        {a !== b && (() => {
          const all = data.zoneTraffic.zones.map(z => ({ z, e: (traffic.get(z, b)?.perDay ?? NaN) / (traffic.get(z, a)?.perDay ?? NaN) - 1 }));
          const fell = all.filter(x => x.e < 0).length;
          return <Line label="Zones with fewer entries per day · comparison months" value={n(fell) + ' of ' + n(all.length)} />;
        })()}
      </Panel>

      <Panel title="When the floor plays">
        <Note>{'Average ' + (heatZone ? name(heatZone) + ' ' : 'floor ') + 'coin-in in each local clock hour, by gaming-day weekday (a gaming day runs 06:00 to 06:00, so the 02:00 column of Friday is early Saturday morning). From the hourly machine meters, selected months.'}</Note>
        <Takeaway>{'Busiest hour: ' + weekdays[peak.weekday] + ' ' + clock(peak.hour) + ' at ' + cash(peak.value) + '. Quietest: ' + weekdays[trough.weekday] + ' ' + clock(trough.hour) + ' at ' + cash(trough.value) + '.'}</Takeaway>
        <Heatmap cells={cells} rows={weekdays} format={v => cash(v)} unit="per hour" title="When the floor plays"
          caption={'Average ' + (heatZone ? name(heatZone) : 'floor') + ' coin-in per clock hour, weekday by hour'} />
      </Panel>

      <Panel title="Weather as a competing explanation">
        <Takeaway>{(excludesZero(wx.weekday.heat) ? 'Hotter days moved wagers: ' : 'No detectable heat effect: ') + heatPer10(wx.weekday.heat[0]) + ' per day for each +10 °C of daily high (95% interval ' + interval(wx.weekday.heat.map(v => 10 * v), signedCash) + '). ' +
          'The ' + n(wx.rainDays) + ' rain days ran ' + signedCash(wx.rainGap) + ' per day versus weekday expectation' + (a !== b ? '. ' + months[a] + ' had ' + n(rainIn(a)) + ' and ' + months[b] + ' had ' + n(rainIn(b)) + (rainExplains ? ', so rain may account for part of the ' + span + ' change.' : ', so rain can’t explain the ' + span + ' change.') : '.')}</Takeaway>
        <Line label="Heat effect per +10 °C · weekday-adjusted" value={heatPer10(wx.weekday.heat[0]) + ' (' + interval(wx.weekday.heat.map(v => 10 * v), signedCash) + ')'} />
        <Line label="Heat effect per +10 °C · weekday and month adjusted" value={heatPer10(wx.month.heat[0]) + ' (' + interval(wx.month.heat.map(v => 10 * v), signedCash) + ')'} />
        <Line label="Rain day effect · weekday-adjusted" value={signedCash(wx.weekday.rain[0]) + ' (' + interval(wx.weekday.rain, signedCash) + ')'} />
        <Line label="Random same-size day sets as low as the rain days" value={wx.placebo === 0 ? 'none of 10,000' : pct(wx.placebo, 2)} />
        <Note>{'Rain days (at least 1 mm): ' + wx.rainDates.join(', ') + '. Three are consecutive, so this is close to one storm and can’t be separated from anything else that happened that week.'}</Note>
        <How>{'Ordinary least squares on ' + n(wx.weekday.days) + ' event-free gaming days: daily coin-in on weekday effects, the airport’s daily high temperature and a rain-day indicator. The second specification adds month effects, so heat is judged only within a month and can’t stand in for seasonality. Intervals use Newey–West standard errors with a seven-day lag, because neighbouring days share shocks. The placebo draws 10,000 random sets of the same number of event-free days and compares their weekday-adjusted average with the rain days. NOAA reports calendar days; each is matched to the gaming day starting at 06:00 that date (18 of 24 hours overlap). Whole property and full period; the bank and month filters don’t apply. Weather is context, never a forecast input.'}</How>
        <Note>Source: <a href={wx.url}>{wx.source}</a>. Observed after the fact; not used by any forecast on this dashboard.</Note>
      </Panel>

      <Panel title="Missouri market comparison">
        {a !== b && <Takeaway>{span + ', Gilded Ace coin-in per day changed ' + signedPct(ownChange) + ' and Missouri statewide slot handle per day changed ' + signedPct(moChange) + '; ' +
          n(propertyChanges.filter(r => r.change < 0).length) + ' of ' + n(propertyChanges.length) + ' Missouri casinos fell. ' +
          (Math.sign(ownChange) === Math.sign(moChange) ? 'The outside market moved the same way, so a market-wide softening is a plausible part of the story.' : 'The outside market moved the other way, so market softness does not explain it.')}</Takeaway>}
        <Chart title="Missouri market comparison" labels={selected.map(r => months[r.m])} format={v => n(v, 1)} height={240} markers
          series={[{ name: 'Gilded Ace coin-in per day (index)', color: SERIES.gold, values: ownIndex }, { name: 'Missouri slot handle per day (index)', color: SERIES.blue, dash: '7 5', values: moIndex }]} />
        <Table headers={['Month', 'Gilded Ace $/day', 'Missouri handle $/day', 'Missouri slot units', 'Missouri handle per unit per day']}
          rows={selected.map(r => [months[r.m], cash(propertyPerDay(r.m)), compact(r.perDay), n(r.units), cash(r.perUnitDay)])} />
        <How>{'Both series are divided by days in the month and indexed to the first selected month (= 100). Missouri figures are the commission’s published statewide totals for its 13 casinos, a different market with its own seasonality, so this is a direction check, not a benchmark level. Whole property; the bank filter doesn’t apply. Context only, never a forecast input: these reports were published after each month closed.'}</How>
        <Note>Source: <a href={data.missouri.publisher}>{data.missouri.source}</a>{', monthly files: '}{mo.state.map((r, i) => <span key={r.m}>{i ? ', ' : ''}<a href={r.url}>{months[r.m]}</a></span>)}.</Note>
      </Panel>
    </>
  );
}
