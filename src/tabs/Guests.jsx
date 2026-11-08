import { useModel } from '../modelContext.js';
import { useNav } from '../nav.jsx';
import { Card, Chart, Line, Metrics, Note, Panel, Table, Tabbed, Takeaway } from '../components/ui.jsx';
import { by, cash, gold, month, months, n, pct, ratio, signedPct, sum } from '../lib/format.js';

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
            <Panel title="Monthly loyalty economics">
              {compTakeaway}
              <Chart series={[{ name: 'Property comp cost / expected win from all slot play', color: gold, values: blocks.map(r => r[3] ? r[2] / r[3] : null) }]}
                labels={blocks.map(r => months[r[0]])} format={v => pct(v, 2)} height={190} />
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
