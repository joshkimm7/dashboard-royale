import { useModel } from '../modelContext.js';
import { useNav } from '../nav.jsx';
import { Card, Chart, Details, How, Line, Metrics, Note, Panel, Table, Tabbed, Takeaway } from '../components/ui.jsx';
import { by, cash, compact, gold, green, month, months, n, pct, ratio, red, shifts, signedPct, sum } from '../lib/format.js';

/** Splits the first-to-last change in daily wagers into playing time and wagers per occupied hour. */
function DemandBridge({ base, current }) {
  if (!base || !current || base.m === current.m || !base.intensity || !current.intensity) {
    return <Note>Select at least two months to compare.</Note>;
  }
  const timeEffect = (current.occupied - base.occupied) * (base.intensity + current.intensity) / 2;
  const rateEffect = (current.intensity - base.intensity) * (base.occupied + current.occupied) / 2;
  const change = (a, b) => a ? signedPct(b / a - 1) : '—';
  return (
    <>
      <Note>{'From ' + months[base.m] + ' to ' + months[current.m] + ', daily wagers changed ' + change(base.coin, current.coin) +
        '. Playing time contributed ' + cash(timeEffect) + ' per day and wagers per occupied hour contributed ' + cash(rateEffect) + ' per day.'}</Note>
      <Table headers={['Driver', months[base.m], months[current.m], 'Change']} rows={[
        ['Coin-in per day', cash(base.coin), cash(current.coin), change(base.coin, current.coin)],
        ['Available machine-hours per day', n(base.available, 1), n(current.available, 1), change(base.available, current.available)],
        ['Occupied machine-hours per day', n(base.occupied, 1), n(current.occupied, 1), change(base.occupied, current.occupied)],
        ['Coin-in per occupied hour', cash(base.intensity), cash(current.intensity), change(base.intensity, current.intensity)],
      ]} />
      <How>Daily wagers = occupied hours × wagers per occupied hour. Each effect is weighted by the other factor’s two-month average, so the two add up to the total. This shows where wagers changed, not why.</How>
    </>
  );
}

function DemandTrend({ monthly, perDay }) {
  const { data } = useModel();
  const { state } = useNav();
  const first = monthly[0], last = monthly.at(-1);
  const feb = perDay.filter(r => month(r.date) === 1);
  const nonSuperBowl = feb.filter(r => !(data.property[r.d][2] ?? '').includes('Super Bowl'));
  const football = nonSuperBowl.length < feb.length
    ? <Note>{'February averaged ' + cash(sum(feb, r => r.coin) / feb.length) + ' per day. Removing the three Super Bowl weekend days alone reduces it to ' + cash(sum(nonSuperBowl, r => r.coin) / nonSuperBowl.length) + '.'}</Note>
    : null;
  const comparable = first && last && first !== last && first.adjusted && last.adjusted;
  const peak = monthly.filter(r => r.adjusted != null).reduce((best, r) => !best || r.adjusted > best.adjusted ? r : best, null);
  const after = comparable
    ? <Note>{'The adjusted series changed ' + signedPct(last.adjusted / first.adjusted - 1) + ' from ' + months[first.m] + ' to ' + months[last.m] +
      '. It peaked in ' + months[peak.m] + ' at ' + cash(peak.adjusted) + ' per day.'}</Note>
    : null;

  const april = monthly.find(r => r.m === 3), june = monthly.find(r => r.m === 5);
  const wagerChange = april?.adjusted && june?.adjusted ? june.adjusted / april.adjusted - 1 : null;
  const visitorChange = april?.city && june?.city ? june.city / april.city - 1 : null;
  const entranceChange = april?.entrance && june?.entrance ? june.entrance / april.entrance - 1 : null;
  let comparison = null;
  if (wagerChange != null && visitorChange != null) {
    const headline = (
      <Takeaway>{'April to June, adjusted ' + (state.bank ? 'bank' : 'property') + ' wagers changed ' + signedPct(wagerChange) +
        ' and Las Vegas visitors per day changed ' + signedPct(visitorChange) + '.'}</Takeaway>
    );
    if (state.bank) {
      comparison = <>{headline}<Note>City visitation is market context; a single bank also depends on its cabinet mix and placement.</Note></>;
    } else {
      const bothFell = wagerChange < 0 && visitorChange < 0;
      const ordering = Math.abs(wagerChange - visitorChange) < .0005 ? 'Both fell by about the same proportion.' :
        visitorChange < wagerChange ? 'City visitation fell more.' : 'Property wagers fell more.';
      comparison = (
        <>
          {headline}
          <Note>{(bothFell ? ordering + ' The shared decline is consistent with market softness or seasonality. ' : '') +
            'Six months of data can’t separate seasonality from other causes.'}</Note>
          {entranceChange != null && (
            <>
              <Line label="Observed entrances per day · April to June" value={signedPct(entranceChange)} />
              <Line label="Adjusted wagers per observed entrance · April to June" value={signedPct((1 + wagerChange) / (1 + entranceChange) - 1)} />
              <Note>Entrances count door crossings, not unique guests, so this is a rough traffic proxy.</Note>
            </>
          )}
        </>
      );
    }
  }
  return (
    <>
      {comparison}
      {football}
      {after}
      <Chart series={[{ name: 'Observed daily wagers', color: gold, values: monthly.map(r => r.coin) }, { name: 'Excluding listed events · equal weekday mix', color: green, values: monthly.map(r => r.adjusted) }]}
        labels={monthly.map(r => months[r.m])} format={compact} min={0} />
      <Table headers={['Month', 'Days', 'Observed $/day', 'Event-free days', 'Weekday-adjusted $/day', 'Entrance counts/day', 'Counter coverage', 'Vegas visitors/day']}
        rows={monthly.map(r => [months[r.m], n(r.days), cash(r.coin), n(r.eventFree), cash(r.adjusted), n(r.entrance), pct(r.coverage), n(r.city)])} />
      <How>The adjusted series drops days with a recorded event, then weights all seven weekdays equally (each month needs every weekday). Unrecorded events and seasonality can still affect it.</How>
    </>
  );
}

function DowntimeScale({ monthly, days, total }) {
  const first = monthly[0], last = monthly.at(-1);
  const sized = first && last && first !== last && first.adjusted != null && last.adjusted != null;
  const feb = monthly.find(r => r.m === 1), june = monthly.find(r => r.m === 5);
  const rawComparison = feb && june
    ? <Line label="Raw Feb–Jun change · wagers/day vs downtime risk/day" value={cash(june.coin - feb.coin) + ' / ' + cash(june.lost / june.days - feb.lost / feb.days)} />
    : null;
  const wagers = sized ? last.adjusted - first.adjusted : null, risk = sized ? last.adjustedRisk - first.adjustedRisk : null;
  const recovered = wagers + risk;
  const changeWords = value => value === 0 ? ' were unchanged' : ' ' + (value < 0 ? 'fell ' : 'rose ') + cash(Math.abs(value)) + '/day';
  let verdict = 'Select at least two months with all seven weekdays represented after event exclusions.';
  if (sized) {
    const period = 'From ' + months[first.m] + ' to ' + months[last.m] + ', adjusted wagers' + changeWords(wagers) + ' and adjusted downtime risk' + changeWords(risk) + '.';
    const answer = wagers >= 0 ? 'There was no adjusted wager decline over this period.' :
      recovered < 0 ? 'No. Even with full recovery of modeled downtime, adjusted wagers would still have fallen ' + cash(-recovered) + '/day.' :
        'Full recovery of modeled downtime could account for the decline under this counterfactual.';
    verdict = answer + ' ' + period;
  }
  return (
    <>
      <Takeaway>{verdict}</Takeaway>
      <Line label="Average daily wagers at risk" value={cash(ratio(total, days))} />
      {rawComparison}
      {sized && (
        <>
          <Line label="Change in adjusted wagers per day" value={cash(last.adjusted - first.adjusted)} />
          <Line label="Change in adjusted downtime risk per day" value={cash(last.adjustedRisk - first.adjustedRisk)} />
          <Line label="Adjusted wager change even with no modeled downtime" value={cash(recovered)} />
        </>
      )}
      <Note>Wagers at risk = estimated play lost while machines were down. “Full recovery” is a generous upper bound.</Note>
      <Table headers={['Month', 'Downtime risk/day', 'Event-free weekday-adjusted risk/day']}
        rows={monthly.map(r => [months[r.m], cash(r.lost / r.days), cash(r.adjustedRisk)])} />
    </>
  );
}

function DowntimeMethod({ theo }) {
  return (
    <Panel title="Downtime estimate">
      <Details title="Counterfactual and uncertainty">{'For each placed cabinet-day, subtract available time from the actual gaming-day length, including the 23-hour daylight-saving day. Multiply the lost hours by that cabinet’s wager rate on other fully available days of the same weekday, requiring at least 48 such hours. Otherwise use the matched peer rate. Expected house win at risk multiplies by configured hold. This retrospective estimate assumes equal demand across available and unavailable hours within the day. A low-to-high recovery scenario of 25%–75% implies ' + cash(.25 * theo) + '–' + cash(.75 * theo) + ' in expected win for the selected historical period before cost. The remainder can reflect substitution, timing or downtime that can’t be avoided.'}</Details>
    </Panel>
  );
}

export default function Demand({ scope: s }) {
  const { data, weekdayAdjusted } = useModel();
  const { state } = useNav();
  const daily = [...by(s.rows, r => r.d).entries()].sort((a, b) => a[0] - b[0]);
  const blocks = [...by(daily, ([d]) => month(data.dates[d])).entries()];
  const monthly = blocks.map(([m, days]) => {
    const records = days.flatMap(([, r]) => r);
    const p = s.props.filter(r => month(r[0]) === m);
    const coverage = sum(p, r => r[7]) / p.length;
    const coin = sum(records, r => r.coin), occupied = sum(records, r => r.occupied);
    const observations = days.map(([d, group]) => ({ d, coin: sum(group, r => r.coin), lost: sum(group, r => r.lost) }));
    return {
      m, coin: coin / days.length, days: days.length, lost: sum(records, r => r.lost),
      adjusted: weekdayAdjusted(observations, r => r.coin), adjustedRisk: weekdayAdjusted(observations, r => r.lost),
      eventFree: observations.filter(r => !data.property[r.d][2]).length,
      available: sum(records, r => r.h) / days.length, occupied: occupied / days.length, intensity: ratio(coin, occupied),
      entrance: sum(p, r => r[6]) / p.length, coverage, city: data.city.find(c => month(c[0] + '-01') === m)?.[1],
    };
  });
  const perDay = daily.map(([d, r]) => ({ d, date: data.dates[d], coin: sum(r, x => x.coin), lost: sum(r, x => x.lost), down: sum(r, x => x.down) }));
  const events = data.events.map(([name, start, end, scopeName]) => {
    const treated = perDay.filter(r => r.date >= start && r.date <= end);
    const reference = treated.map(r => {
      const candidates = perDay.filter(x => x.date.slice(0, 7) === r.date.slice(0, 7) && data.property[data.dates.indexOf(x.date)][1] === data.property[data.dates.indexOf(r.date)][1] && !data.property[data.dates.indexOf(x.date)][2]);
      return { observed: r.coin, base: ratio(sum(candidates, x => x.coin), candidates.length) };
    }).filter(x => x.base != null);
    return { name, scopeName, days: reference.length, lift: ratio(sum(reference, x => x.observed), sum(reference, x => x.base)) };
  }).filter(x => x.days);
  const down = sum(s.rows, r => r.down), lost = sum(s.rows, r => r.lost), theo = sum(s.rows, r => r.lostTheo);
  const byMake = [...by(s.rows, r => r.make).entries()].map(([name, g]) => [name, sum(g, r => r.down), sum(g, r => r.lostTheo), ratio(sum(g, r => r.down), sum(g, r => r.down + r.h))]).sort((a, b) => b[1] - a[1]);
  const worst = perDay.slice().sort((a, b) => b.lost - a.lost).slice(0, 5);
  const tickets = data.shifts.filter(r => r[0] >= s.dates[0] && r[0] <= s.dates.at(-1) && (!state.bank || r[1] === state.bank));
  const first = monthly[0], last = monthly.at(-1);

  return (
    <>
      <Metrics>
        <Card label="Coin-in" value={cash(sum(s.rows, r => r.coin))} sub="Total wagered, incl. replayed credits" />
        <Card label="Out-of-service time" value={n(down, 1) + ' h'} sub="Machine hours lost to downtime" />
        <Card label="Estimated coin-in at risk" value={cash(lost)} sub="Wagers likely lost while down" />
        <Card label="Estimated theo at risk" value={cash(theo)} sub="House win lost · upper bound" />
      </Metrics>
      <Tabbed tab="demand" views={{
        trend: () => (
          <>
            <Panel title="Demand across the period">
              <DemandTrend monthly={monthly} perDay={perDay} />
              <Note>Counter coverage = share of entrance sensors reporting. Visitor figures: <a href={data.city[0][2]}>LVCVA 2025 summary</a>.</Note>
            </Panel>
            <Panel title="What drove the raw change in wagers?">
              <Note>First vs last selected month (unadjusted), split into playing time and wagers per hour played.</Note>
              <DemandBridge base={first} current={last} />
            </Panel>
          </>
        ),
        downtime: () => (
          <>
            <Panel title="Can downtime explain the demand trend?">
              <DowntimeScale monthly={monthly} days={s.dates.length} total={lost} />
            </Panel>
            <Panel title="When downtime cost the most">
              <Note>Daily averages, so months of different lengths compare fairly.</Note>
              <Chart series={[{ name: 'Estimated wagers at risk per day', color: red, values: monthly.map(r => r.lost / r.days) }]}
                labels={monthly.map(r => months[r.m])} format={cash} height={190} min={0} />
              <Table headers={['Highest-risk days', 'Down hours', 'Coin-in at risk']} rows={worst.map(r => [r.date, n(r.down, 1), cash(r.lost)])} />
            </Panel>
            <DowntimeMethod theo={theo} />
          </>
        ),
        repairs: () => (
          <Panel title="Where to look for repairs">
            <Table headers={['Manufacturer', 'Down hours', 'Scheduled share', 'Expected win at risk']}
              rows={byMake.map(r => [r[0], n(r[1], 1), pct(r[3], 2), cash(r[2])])} />
            <h3 style={{ marginTop: 16 }}>Fault ticket hours by Vegas shift</h3>
            <Table headers={['Shift', 'Open → restored', 'Before work started']}
              rows={shifts.map((name, i) => [name, n(sum(tickets.filter(r => r[2] === i), r => r[3]), 1), n(sum(tickets.filter(r => r[2] === i), r => r[4]), 1)])} />
            <Note>Tickets cover fault repairs only and can overlap; lost-play estimates use meter downtime.</Note>
          </Panel>
        ),
        events: () => (
          <Panel title="Event days vs similar weekdays">
            <Table headers={['Event', 'Scope', 'Matched days', 'Coin-in vs non-event days']}
              rows={events.map(r => [r.name, r.scopeName, r.days, (r.lift >= 1 ? '+' : '') + pct(r.lift - 1)])} />
            <Note>Each event is compared with same-weekday, same-month days that had no event. Other changes can still blur the comparison.</Note>
          </Panel>
        ),
      }} />
    </>
  );
}
