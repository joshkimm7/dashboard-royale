import { useModel } from '../modelContext.js';
import { useNav } from '../nav.jsx';
import { Card, Chart, How, Line, Metrics, Note, Panel, Table, Tabbed, Takeaway } from '../components/ui.jsx';
import { SERIES, by, cash, month, months, n, pct, ratio, signedPct, sum, week } from '../lib/format.js';

const dayLabel = d => months[month(d)] + ' ' + Number(d.slice(8));
/** A loyalty metric value in its own units: dollars for cost metrics, plain numbers otherwise. */
const metricText = (metric, v, signed = false) => {
  if (v == null || !Number.isFinite(v)) return '—';
  const digits = n(Math.abs(v), metric.digits), zero = !/[1-9]/.test(digits);
  return (zero ? '' : signed && v > 0 ? '+' : v < 0 ? '−' : '') + (metric.money ? '$' : '') + digits;
};
const intervalText = (metric, r) => r ? metricText(metric, r[0], true) + ' to ' + metricText(metric, r[1], true) : '—';
const TIER_COLORS = [SERIES.gold, SERIES.blue, SERIES.rose];
const rel = v => v == null || !Number.isFinite(v) ? '—' : (Math.abs(v) < .0005 ? '' : v > 0 ? '+' : '−') + pct(Math.abs(v));
const capitalize = t => t.charAt(0).toUpperCase() + t.slice(1);

/** Q5: did anything change in the comp program? Break search, before/after test, placebo dates and mix vs policy. */
function CompBreak({ state }) {
  const { compBreak, data, tierRules, weekLabel } = useModel();
  const b = compBreak(state);
  const scopeNote = 'Uses all six months for ' + (state.region || 'every region') + ' and ' + (state.tier ? state.tier + ' opening tier' : 'every opening tier') + '; the month filter does not apply, because a break test needs the whole timeline.';
  if (!b) {
    return (
      <Panel title="Did the comp program change?" id="comp-break-check">
        <Note>No ledger activity in this group, or too little to test for a change. {scopeNote}</Note>
      </Panel>
    );
  }
  const date = data.dates[b.breakDay], price = b.lead.metric;
  const lead = b.leadResult;
  const get = key => b.results.find(r => r.metric.key === key);
  const unchanged = b.results.filter(r => r.metric !== price && !r.excludesZero);
  const changed = b.results.filter(r => r.metric !== price && r.excludesZero);
  const weekIndex = b.weeks.findIndex(w => w.w === week(b.breakDay));
  const pooled = b.weeklyAll(price);
  const tierSeries = data.loyalty.dicts.tier_before.map((name, t) => ({ name: name + ' tier (at redemption)', color: TIER_COLORS[t], values: b.weeklyTier(t, price) }))
    .filter(s => s.values.some(Number.isFinite));
  const total = b.mix + b.within;
  const window = dayLabel(data.dates[b.before[0]]) + '–' + dayLabel(data.dates[b.before.at(-1)]) + ' vs ' + dayLabel(data.dates[b.after[0]]) + '–' + dayLabel(data.dates[b.after.at(-1)]);
  const tierText = b.tierResults.filter(r => r.change != null).map(r => r.name + ' ' + n(r.before, 2) + '→' + n(r.after, 2)).join(', ');
  const placeboLabel = 'Rank ' + n(b.rank) + ' of ' + n(b.placebo.length) + ' split dates';

  return (
    <>
      <Panel title="Did the comp program change?" id="comp-break-check">
        <Takeaway>{b.detected
          ? 'Yes. On ' + dayLabel(date) + ' the points price of comps was cut: ' + price.label.toLowerCase() + ' fell from ' + n(lead.before, 2) + ' to ' + n(lead.after, 2) + ' (' + rel(lead.rel) + '; 95% interval ' + intervalText(price, lead.interval) + ' points). ' +
            'It fell within every tier (' + tierText + '), so this is a rule change, not a shift in tier mix. ' +
            (unchanged.length ? capitalize(unchanged.map(r => r.metric.label.toLowerCase()).join(' and ')) + ' did not change.' : '')
          : 'No clear break. The best split for ' + price.label.toLowerCase() + ' falls on ' + dayLabel(date) + ', but its change ' + (lead.excludesZero ? 'is no larger than shifts at placebo dates' : 'has an interval that includes zero') + '.'}</Takeaway>
        <Line label="Detected break · best single split" value={dayLabel(date) + ' (week of ' + weekLabel(week(b.breakDay)) + ')'} />
        <Line label="Weekly variation explained by the split" value={pct(b.lead.split.r2, 1)} />
        <Line label="Placebo rank of the real break" value={placeboLabel} />
        <Line label="Largest shift at a placebo date clear of the break" value={b.largestClean ? metricText(price, b.largestClean.change, true) + ' points on ' + dayLabel(data.dates[b.largestClean.day]) + ' vs ' + metricText(price, lead.change, true) : '—'} />
        <Line label="Tier thresholds (lifetime points)" value={tierRules.stable ? 'Gold ' + n(tierRules.gold.high) + ' · Platinum ' + n(tierRules.platinum.high) + ', unchanged in all ' + tierRules.months + ' months' : 'Brackets overlap across months; inspect tier rules'} />
        <Chart title="Did the comp program change?" labels={b.weeks.map(w => weekLabel(w.w))} format={v => n(v, 1)} height={240} min={0}
          series={[...tierSeries, { name: 'All tiers', color: SERIES.muted, values: pooled, dash: '4 3', muted: true }]}
          annotations={weekIndex >= 0 && Number.isFinite(pooled[weekIndex]) ? [{ index: weekIndex, value: pooled[weekIndex], label: 'Break · ' + dayLabel(date), yOffset: 14 }] : []} />
        <Note>{'Weekly ratio of sums, weeks starting Monday. The week of ' + weekLabel(week(b.breakDay)) + ' mixes both prices. ' + scopeNote}</Note>
      </Panel>
      <Panel title="Before and after the break">
        <Table headers={['Metric', 'Best split', 'Weekly variation explained', 'Before', 'After', 'Change', '95% interval']}
          rows={b.results.map(r => {
            const search = b.searches.find(s => s.metric === r.metric);
            return [r.metric.label, search ? dayLabel(data.dates[search.day]) : '—', search ? pct(search.split.r2, 0) : '—', metricText(r.metric, r.before), metricText(r.metric, r.after),
              metricText(r.metric, r.change, true) + (r.rel != null ? ' (' + rel(r.rel) + ')' : ''), intervalText(r.metric, r.interval) + (r.excludesZero ? '' : ' · no change')];
          })} />
        <Note>{'Windows: ' + window + ', ' + n(b.span / 7) + ' of each weekday on both sides. Intervals resample days within weekday, 2,000 times. ' +
          (changed.length ? 'Besides the price, ' + changed.map(r => r.metric.label.toLowerCase() + ' (' + rel(r.rel) + ')').join(', ') + ' also moved.' : '')}</Note>
        <How>Every metric is a ratio of sums over the days in a window, never an average of daily ratios. The break search fits one step to each metric’s full weeks and keeps the split that removes the most squared error, with at least four weeks on each side; the daily series then places it within a week. Redemptions use the 06:00–06:00 gaming day; awards use the gaming day of the play that earned them. Comp cost is the ledger’s economic cost, which already equals the linked food-and-drink cost of goods, so it is counted once.</How>
      </Panel>
      <Panel title="Placebo dates">
        <Chart title="Placebo dates" labels={b.placebo.map(p => dayLabel(data.dates[p.day]))} format={v => n(v, 2)} height={200}
          series={[{ name: 'Change at this split date', color: SERIES.gold, values: b.placebo.map(p => p.change) }]}
          annotations={(i => i >= 0 ? [{ index: i, value: b.placebo[i].change, label: 'Real break', yOffset: 14 }] : [])(b.placebo.findIndex(p => p.day === b.breakDay))} />
        <Note>{'The same ' + n(b.span) + '-day before/after comparison of ' + price.label.toLowerCase() + ', repeated at every date where both windows fit. ' + n(b.cleanCount) + ' of these dates have windows that do not touch ' + dayLabel(date) + '.'}</Note>
      </Panel>
      <Panel title="Policy or tier mix?">
        <Table headers={['Tier at redemption', 'Before', 'After', 'Change', '95% interval']}
          rows={b.tierResults.filter(r => r.before != null || r.after != null).map(r => [r.name, metricText(price, r.before), metricText(price, r.after), metricText(price, r.change, true) + (r.rel != null ? ' (' + rel(r.rel) + ')' : ''), intervalText(price, r.interval)])} />
        <Line label="Change explained by tier mix" value={metricText(price, b.mix, true) + ' of ' + metricText(price, total, true) + ' points'} />
        <Line label="Change within tiers (policy)" value={metricText(price, b.within, true) + ' points (' + pct(ratio(b.within, total), 0) + ')'} />
        <Note>Players earn better prices as they move up tiers, so a growing Platinum share alone would lower the floor-wide price. The split holds each tier’s price at its before value and weights tiers by their share of face value redeemed after the break.</Note>
      </Panel>
    </>
  );
}

/** Comp reinvestment (comp cost ÷ theo) by opening tier and home region, from player_period for the selected months. */
function Reinvestment({ filtered }) {
  const regions = [...new Set(filtered.map(r => r[2]))].sort(), tiers = [...new Set(filtered.map(r => r[3]))].sort();
  const cell = rows => (v => v == null ? '—' : pct(v, 2))(ratio(sum(rows, r => r[8]), sum(rows, r => r[9])));
  const all = regions.length > 1 ? ['All regions'] : [];
  const cells = tiers.flatMap(t => regions.map(g => {
    const rows = filtered.filter(r => r[3] === t && r[2] === g);
    return { label: t + ' · ' + g, value: ratio(sum(rows, r => r[8]), sum(rows, r => r[9])) };
  })).filter(c => c.value != null).sort((a, b) => b.value - a.value);
  return (
    <Panel title="Comp reinvestment by tier and region">
      {cells.length > 1 && <Takeaway>{'Highest: ' + cells[0].label + ' at ' + pct(cells[0].value, 2) + '. Lowest: ' + cells.at(-1).label + ' at ' + pct(cells.at(-1).value, 2) + '. Empty cells mean no players in that tier and region.'}</Takeaway>}
      <Table headers={['Opening tier', ...regions, ...all]}
        rows={[...tiers, ...(tiers.length > 1 ? ['All tiers'] : [])].map(t => {
          const rows = t === 'All tiers' ? filtered : filtered.filter(r => r[3] === t);
          return [t, ...regions.map(g => cell(rows.filter(r => r[2] === g))), ...(all.length ? [cell(rows)] : [])];
        })} />
      <Note>Redeemed comp cost ÷ expected win (theo) from the same players’ carded play in the selected months, from the player-month table. Uncarded play is invisible, so this covers tracked guests only. A dash means no players in that tier and region, or no carded expected win.</Note>
    </Panel>
  );
}

export default function Guests({ scope: s }) {
  const { data, regions, tiers } = useModel();
  const { state, setFilter } = useNav();
  const filtered = data.players.filter(r => r[1] >= state.from && r[1] <= state.to && (!state.region || state.region === r[2]) && (!state.tier || state.tier === r[3]));
  const people = new Map();
  for (const r of filtered) {
    const x = people.get(r[0]) ?? [0, 0];
    x[0] += r[4]; x[1] += Math.round(r[6] * 100); people.set(r[0], x);
  }
  const p = [...people.values()], active = p.filter(r => r[0] > 0), cut = Math.ceil(active.length * .01);
  const even = active.filter(r => r[1] === 0).length;
  const coin = sum(filtered, r => r[4]), payout = sum(filtered, r => r[5]), net = sum(p, r => r[1]) / 100;
  const grossLoss = sum(p, r => Math.max(0, -r[1]));
  const topCoin = sum(active.slice().sort((a, b) => b[0] - a[0]).slice(0, cut), r => r[0]);
  const topLoss = sum(active.slice().sort((a, b) => a[1] - b[1]).slice(0, cut), r => Math.max(0, -r[1]));
  const groupCost = sum(filtered, r => r[8]), allCost = sum(s.props, r => r[9]), face = sum(s.props, r => r[8]);
  const blocks = [...by(s.props, r => month(r[0])).entries()].map(([m, r]) => [m, sum(r, x => x[8]), sum(r, x => x[9]), sum(r, x => x[5]), sum(filtered.filter(p => p[1] === m), p => p[8]), r.length]);
  const rates = blocks.map(r => ratio(r[2], r[1])).filter(Number.isFinite);
  const first = blocks[0], last = blocks.at(-1);
  const faceChange = first && last && first[1] ? last[1] / last[5] / (first[1] / first[5]) - 1 : null;
  const compTakeaway = blocks.length > 1 && rates.length && faceChange != null
    ? <Takeaway>{'From ' + months[first[0]] + ' to ' + months[last[0]] + ', face value redeemed per day changed ' + signedPct(faceChange) + ' (' + cash(first[1] / first[5]) + ' to ' + cash(last[1] / last[5]) + '). Cost per face-value dollar ranged from ' + pct(Math.min(...rates), 1) + ' to ' + pct(Math.max(...rates), 1) + '. ' + (Math.max(...rates) - Math.min(...rates) < .003 && faceChange > .01 ? 'The cost increase reflects more face value redeemed, with a stable cost rate.' : '')}</Takeaway>
    : null;
  const high = n(active.filter(r => r[1] > 0).length), low = n(active.filter(r => r[1] < 0).length);

  return (
    <>
      <div className="controls">
        <label>Home region<select id="region" value={state.region} onChange={e => setFilter('region', e.target.value)}>
          <option value="">All regions</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select></label>
        <label>Opening tier<select id="tier" value={state.tier} onChange={e => setFilter('tier', e.target.value)}>
          <option value="">All tiers</option>
          {tiers.map(t => <option key={t} value={t}>{t}</option>)}
        </select></label>
        <small>Filters apply to loyalty-card play and comps. The bank filter doesn’t apply here.</small>
      </div>
      <Metrics>
        <Card label="Carded coin-in" value={cash(coin)} sub={n(active.length) + ' active carded players'} />
        <Card label="Returned to players" value={cash(payout)} sub="Payouts on tracked play" />
        <Card label="Player net" value={cash(net)} sub="Payouts minus wagers" />
        <Card label="Property comp cost" value={cash(allCost)} sub={cash(face) + ' face value · selected months'} />
      </Metrics>
      <Tabbed tab="guests" views={{
        players: () => (
          <Panel title="Who accounted for play and losses">
            <Line label="Top 1% of players by wagers" value={pct(ratio(topCoin, coin)) + ' of tracked wagers'} />
            <Line label="Top 1% by losses" value={pct(ratio(topLoss, grossLoss)) + ' of gross tracked losses'} />
            <Line label="Active players ahead / behind / even" value={high + ' / ' + low + ' / ' + n(even)} />
            <Line label="Cardholders with zero recorded wagers" value={n(p.length - active.length) + ' of ' + n(p.length)} />
            <Line label="Gross losses among losing players" value={cash(grossLoss / 100)} />
            <Note>“Active” means the player recorded card play in the selected group and months. Results are totaled per player.</Note>
          </Panel>
        ),
        comps: () => (
          <>
            <Panel title="What comps actually cost">
              <Line label="Selected group cost" value={cash(groupCost)} />
              <Line label="Group comp face value" value={cash(sum(filtered, r => r[7]))} />
              <Line label="Selected group comp cost / expected win from that group’s carded play" value={pct(ratio(groupCost, sum(filtered, r => r[9])), 2)} />
              <Line label="Property cost / face value" value={pct(ratio(allCost, face), 2)} />
              <Note>Comp cost is already inside POS cost of goods, so don’t subtract it twice.</Note>
            </Panel>
            <CompBreak state={state} />
            <Reinvestment filtered={filtered} />
            <Panel title="Monthly loyalty economics">
              {compTakeaway}
              <Chart type="bar" title="Monthly loyalty economics" labels={blocks.map(r => months[r[0]])} format={v => pct(v, 2)} height={200}
                series={[{ name: 'Property comp cost / expected win from all slot play', color: SERIES.gold, values: blocks.map(r => r[3] ? r[2] / r[3] : null) }]} />
              <Table headers={['Month', 'Property face value/day', 'Property comp cost', 'Cost / face value', 'Cost / expected win from all slot play', 'Selected group cost']}
                rows={blocks.map(r => [months[r[0]], cash(r[1] / r[5]), cash(r[2]), pct(ratio(r[2], r[1]), 2), pct(ratio(r[2], r[3]), 2), cash(r[4])])} />
              <Note>Higher cost can mean more redemptions or a different mix, not necessarily a policy change.</Note>
            </Panel>
          </>
        ),
      }} />
    </>
  );
}
