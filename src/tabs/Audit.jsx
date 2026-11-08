// Q1 · Machine audit: bottom-ten verdicts, machine file, floor bank map and the M-1158 weekly payout check.
import { useRef } from 'react';
import { useModel } from '../modelContext.js';
import { useNav } from '../nav.jsx';
import { by, cash, compact, gold, green, month, months, n, pct, pp, qText, ratio, red, sum } from '../lib/format.js';
import { hasPeerBenchmark, peerDemandCutoff, summarize, underPeerCutoff } from '../lib/model.js';
import { Card, Chart, Details, Line, Metrics, Note, Panel, Table, Tabbed, Takeaway } from '../components/ui.jsx';

const TAG_LABELS = { 'Inspect hold': 'Payout flag', 'Quiet zone': 'Quiet placement', 'Short exposure': 'Short exposure', 'Low peer demand': 'Weak local demand', 'Downtime': 'Downtime flag' };

function CompactVerdicts({ bottom }) {
  const m = useModel();
  const nav = useNav();
  if (!bottom.length) return <Note>No cabinets in this selection.</Note>;
  return (
    <div className="verdict-list">
      {bottom.map((x, i) => {
        const signals = [
          ['Inspect hold', pp(x.res) + ' payout gap'],
          ['Downtime', pct(1 - x.availability, 1) + ' of scheduled time unavailable'],
          ['Short exposure', n(x.days) + ' days in scope'],
          ['Low peer demand', pct(x.local, 0) + ' of comparable local play'],
          ['Quiet zone', pct(x.zone, 0) + ' of comparable floor play in this zone'],
        ];
        const evidence = signals.find(([flag]) => x.flags.includes(flag))?.[1] ?? 'No screening flag';
        const facts = [['Raw house win', cash(x.win)], ['Days in scope', n(x.days)], ['Availability', pct(x.availability, 1)], ['Play vs local peers', pct(x.local, 0)],
          ['Zone vs floor', pct(x.zone, 0)], ['Payout gap', pp(x.res)], ['Matched peer coverage', pct(x.zoneCover, 0)]];
        return (
          <details key={x.id}>
            <summary>
              <span className="verdict-id"><strong>{x.id}</strong><small>{'Raw rank ' + n(i + 1)}</small></span>
              <span>{evidence}</span>
              <span className="verdict-action">{m.reviewAction(x)}</span>
            </summary>
            <div className="verdict-detail">
              <dl>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
              <button data-machine={x.id} data-section="machine-check" onClick={() => nav.selectMachine(x.id, 'machine-check')}>{'Open ' + x.id + ' machine file'}</button>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function PlacementCoverage({ bottom }) {
  const high = bottom.filter(x => x.zoneCover >= .9 && x.zone != null);
  const changed = bottom.filter(x => underPeerCutoff(x, 'zone') && !high.includes(x));
  const direct = bottom.map(x => {
    const rows = x.g.filter(r => r.zonePeer === 2 && r.floor != null && r.local != null);
    const coverage = ratio(sum(rows, r => r.h), x.h);
    const zone = ratio(sum(rows, r => r.h * r.local), sum(rows, r => r.h * r.floor));
    return { id: x.id, coverage, zone };
  }).filter(x => x.coverage >= .9 && x.zone != null);
  const quiet = machines => machines.filter(x => x.zone < peerDemandCutoff);
  const ids = machines => machines.map(x => x.id).join(', ');
  const directFlags = quiet(direct).length;
  return (
    <>
      <Note>{'At 90% matched-hour coverage, ' + n(quiet(high).length) + ' of ' + n(high.length) + ' eligible cabinets flag for quiet placement. ' +
        (changed.length ? 'Previously flagged cabinets without enough coverage: ' + ids(changed) + '.' : 'No quiet-placement flags were dropped by the stricter coverage rule.')}</Note>
      <Note>{'Requiring direct same-day peers for 90% of hours leaves ' + n(direct.length) + ' eligible' + (direct.length ? ' (' + ids(direct) + ')' : '') + '. ' +
        n(directFlags) + (directFlags === 1 ? ' cabinet flags' : ' cabinets flag') +
        ' for quiet placement in that comparison. This stricter check excludes the 28-day pooled fallback, so cabinets with sparse peers are unclassified in this check.'}</Note>
    </>
  );
}

function VerdictSensitivity({ bottom }) {
  if (!bottom.length) return null;
  const count = (key, cutoff) => bottom.filter(x => underPeerCutoff(x, key, cutoff)).length;
  return (
    <details>
      <summary>How sensitive are the demand flags?</summary>
      <Note>{'Flag counts for the same ' + n(bottom.length) + ' cabinets at other cutoffs (default 80%). Only cabinets with a peer benchmark for at least half their hours are eligible.'}</Note>
      <Table headers={['Cutoff', 'Quiet placement flags', 'Weak local demand flags']} rows={[.75, peerDemandCutoff, .85].map(c => [pct(c, 0),
        n(count('zone', c)) + ' of ' + n(bottom.filter(x => hasPeerBenchmark(x, 'zone')).length) + ' eligible',
        n(count('local', c)) + ' of ' + n(bottom.filter(x => hasPeerBenchmark(x, 'local')).length) + ' eligible'])} />
      <PlacementCoverage bottom={bottom} />
    </details>
  );
}

function MatchedPayoutPeers() {
  const m = useModel();
  const result = m.matchedPayoutPeers();
  if (!result) return <Note>No same-game cabinets meet the matched-week and exposure screen.</Note>;
  const { weekCount, peers, median, asLow } = result;
  return (
    <>
      <h3>How unusual was the gap among comparable cabinets?</h3>
      <Line label="Peers with gaps as low as M-1158" value={n(asLow) + ' of ' + n(peers.length)} />
      <Line label="Median peer payout gap" value={pp(median)} />
      <Line label="Peer range" value={pp(peers[0]) + ' to ' + pp(peers.at(-1))} />
      <Note>{'Peers share M-1158’s configuration, played all ' + n(weekCount) + ' weeks and wagered 50–200% of its total. This is context, not a fault probability.'}</Note>
    </>
  );
}

function HoldCheck() {
  const m = useModel();
  const { inspect, focalWeeks, holdGap, peerWeeks, weekLabel, withoutWorst, maxLeaveOneOutQ } = m;
  const labels = focalWeeks.map(([w]) => weekLabel(w));
  const values = focalWeeks.map(([, g]) => holdGap(g));
  const peerValues = focalWeeks.map(([w]) => holdGap(peerWeeks.get(w) ?? []));
  const negative = values.filter(v => v < 0).length;
  return (
    <Panel title="M-1158 · Weekly payout check" id="hold-check">
      <Takeaway>{'M-1158 earned ' + cash(inspect.theo - inspect.win) + ' less than its payout settings implied.'}</Takeaway>
      <Line label="Weeks below expectation" value={n(negative) + ' of ' + n(values.length)} />
      <Line label="Payout gap after dropping the worst week" value={pp(withoutWorst.res)} />
      <Note>January–June. Peers share M-1158’s game settings and are weighted by wagers.</Note>
      <Chart series={[{ name: 'M-1158 hold gap', color: red, values }, { name: 'Same-configuration peers', color: green, values: peerValues },
        { name: 'Configured expectation', color: gold, dash: '6 5', values: labels.map(() => 0) }]} labels={labels} format={pp} />
      <Line label="Full-period payout gap" value={pp(inspect.res)} />
      <MatchedPayoutPeers />
      <Line label="Sensitivity interval and adjusted q" value={pp(withoutWorst.lo) + ' to ' + pp(withoutWorst.hi) + ' · q ' + qText(withoutWorst.q, true)} />
      <Line label="Largest adjusted q after dropping any one week" value={qText(maxLeaveOneOutQ, true)} />
      <Details title="How this check works">Drop the week with the most negative observed hold gap, recalculate the machine’s weekly-clustered interval and reapply the multiple-test adjustment with the other cabinets unchanged. Repeat for every single week to check sensitivity to any choice of excluded week. Peer gaps provide context for whether the configuration broadly behaved the same way. The first and last gaming weeks are partial.</Details>
    </Panel>
  );
}

function Drill({ x }) {
  const m = useModel();
  if (!x) return <Note>No machines in this bank and period.</Note>;
  const latest = x.g.at(-1);
  const blocks = [...by(x.g, r => m.data.dates[r.d].slice(0, 7)).entries()];
  return (
    <>
      <div className="eyebrow">{latest.theme + ' · ' + latest.volatility + ' volatility'}</div>
      <Line label="Banks during selection" value={x.banks.join(', ')} />
      <Line label="Zones during selection" value={x.zones.map(z => m.zones[z]).join(', ')} />
      <Line label="Latest slot in selection" value={latest.slot} />
      <Line label="Expected house win" value={cash(x.theo)} />
      <Line label="Coin-in per available hour" value={cash(x.rate)} />
      <Line label="Review signals" value={x.flags.join(' · ') || 'No threshold crossed'} />
      <Line label="Observed vs configured hold" value={pct(x.hold, 2) + ' / ' + pct(ratio(x.theo, x.coin), 2)} />
      <Line label="Hold gap, approximate 95% interval" value={x.lo == null ? 'Insufficient weeks' : pp(x.lo) + ' to ' + pp(x.hi)} />
      <Line label="Adjusted q · weeks with play" value={qText(x.q) + ' · ' + x.k} />
      <Line label="Hold gap, first / second half" value={x.halves.map(v => pp(v)).join(' / ')} />
      <Line label="Zone peers vs floor peers" value={pct(x.zone, 0)} />
      <Line label="Hours with zone-specific benchmark" value={pct(x.zoneCover, 0)} />
      <Line label="Availability" value={pct(ratio(x.h, x.h + x.down), 2)} />
      <Line label="Estimated downtime coin-in / theo" value={cash(x.lost) + ' / ' + cash(x.lostTheo)} />
      <Line label="Contribution after supplied machine costs" value={cash(x.contrib)} />
      <p className="muted">Monthly house win and configured expectation</p>
      <Chart series={[{ name: 'House win', color: gold, values: blocks.map(([, a]) => sum(a, r => r.win)) }, { name: 'Expected win', color: green, values: blocks.map(([, a]) => sum(a, r => r.theo)) }]}
        labels={blocks.map(([mo]) => months[month(mo + '-01')])} format={compact} height={200} />
    </>
  );
}

function BankMap({ mapHot }) {
  const m = useModel();
  const nav = useNav();
  return (
    <div className="bank-map" aria-label="Floor banks grouped by zone">
      {[...by(m.zoneBanks, r => r[2])].map(([zone, banks]) => (
        <div className="bank-zone" key={zone}>
          <strong>{m.zones[zone]}</strong>
          <div className="bank-targets">
            {banks.map(r => {
              const hot = mapHot.has(r[0]);
              return (
                <button key={r[0]} className={hot ? 'hot' : ''} data-bank={r[0]} aria-pressed={nav.state.bank === r[0]}
                  aria-label={r[0] + ', ' + m.zones[zone] + (hot ? ', shortlist bank' : '')} onClick={() => nav.toggleBank(r[0])}>{r[0].slice(2)}</button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Audit({ scope: s }) {
  const m = useModel();
  const nav = useNav();
  const { state } = nav;
  const all = summarize(s.rows, s.dates.length).sort((a, b) => a.win - b.win);
  const bottom = all.slice(0, 10);
  const mapHot = new Set(bottom.flatMap(x => x.banks));
  const machine = all.some(x => x.id === state.machine) ? state.machine : bottom[0]?.id ?? '';
  const chosen = all.find(x => x.id === machine);
  const displayed = (state.all ? all : bottom).slice().sort((a, b) => {
    const x = a[state.sort], y = b[state.sort];
    if (x == null) return y == null ? 0 : 1; if (y == null) return -1;
    return (state.reverse ? -1 : 1) * (typeof x === 'string' ? x.localeCompare(y) : x - y);
  });
  const columns = [['id', 'Machine'], ['win', 'House win'], ['days', state.bank ? 'Days in bank' : 'Days on floor'], ['availability', 'Availability'],
    ['local', 'Play vs local peers'], ['zone', 'Zone vs floor'], ['res', 'Payout gap']];
  const headers = ['#', ...columns.map(([key, title]) => ({
    sort: state.sort === key ? (state.reverse ? 'descending' : 'ascending') : null,
    label: <button data-sort={key} title={'Sort by ' + title} onClick={() => nav.sortBy(key)}>{title + (state.sort === key ? (state.reverse ? ' ↓' : ' ↑') : '')}</button>,
  })), 'Suggested action'];
  const rows = displayed.map(x => [all.indexOf(x) + 1,
    <button data-machine={x.id} aria-pressed={x.id === machine} onClick={() => nav.selectMachine(x.id)}>{x.id}</button>,
    cash(x.win), n(x.days), pct(x.availability, 1), pct(x.local, 0), pct(x.zone, 0), pp(x.res),
    <><strong>{m.reviewAction(x)}</strong>{x.flags.length ? <span className="review-tags">{x.flags.map(flag => TAG_LABELS[flag]).join(' · ')}</span> : null}</>]);
  const isInspect = chosen?.id === m.inspect.id;
  // Like the original comparisonOpen: open when showing all machines, and never forced closed by a redraw.
  const comparisonOpen = useRef(false);
  if (state.all) comparisonOpen.current = true;

  return (
    <>
      <Metrics>
        <Card label="Bottom cohort" value={n(bottom.length) + ' / ' + n(all.length)} sub="Machines by raw house win" />
        <Card label="Cabinets to inspect" value={n(bottom.filter(x => x.flags.includes('Inspect hold')).length) + ' of ' + n(bottom.length)} sub="Persistent payout shortfall" />
        <Card label="Cabinets with weak local demand" value={n(bottom.filter(x => x.flags.includes('Low peer demand')).length) + ' of ' + n(bottom.length)} sub="Under 80% of comparable local play" />
        <Card label="Bottom cohort downtime" value={n(sum(bottom, x => x.down), 1) + ' h'} sub={cash(sum(bottom, x => x.lost)) + ' estimated coin-in at risk'} />
      </Metrics>
      <Tabbed tab="audit" views={{
        verdicts: () => (
          <Panel title="Bottom-ten verdicts" id="verdict-check">
            <Note>The ten lowest earners for the selected months and bank. Expand a row for its evidence.</Note>
            <CompactVerdicts bottom={bottom} />
            <details id="comparison-details" open={comparisonOpen.current || undefined}>
              <summary>Full sortable cabinet comparison</summary>
              <Note><b>Play vs local peers</b>: wagers vs similar nearby cabinets at the same hours. <b>Zone vs floor</b>: how busy the location is. <b>Payout gap</b>: actual minus configured house win per dollar wagered.</Note>
              <div className="controls"><button id="show-all" aria-pressed={state.all} onClick={nav.toggleAll}>{state.all ? 'Show bottom 10' : 'Show all machines'}</button></div>
              <div className="verdict-table"><Table headers={headers} rows={rows} /></div>
            </details>
            <VerdictSensitivity bottom={bottom} />
          </Panel>
        ),
        machine: () => (
          <>
            <div className="grid split">
              <Panel title={chosen ? 'Machine file · ' + chosen.id : 'Machine file'} id="machine-check">
                {all.length ? (
                  <div className="machine-pick">
                    <label>Machine (ranked by house win)<select id="machine-pick" value={machine} onChange={e => nav.setFilter('machine-pick', e.target.value)}>
                      {all.map((x, i) => <option key={x.id} value={x.id}>{'#' + (i + 1) + ' · ' + x.id}</option>)}
                    </select></label>
                  </div>
                ) : null}
                <Drill x={chosen} />
                {isInspect ? <button data-evidence="M-1158" data-section="hold-check" onClick={() => nav.openEvidence('M-1158', 'hold-check')}>Open weekly payout check</button> : null}
              </Panel>
              <Panel title="Floor banks by zone">
                <Note>Gold banks hold a bottom-ten cabinet. Click a bank to filter; click again to clear.</Note>
                <BankMap mapHot={mapHot} />
              </Panel>
            </div>
            {isInspect ? <HoldCheck /> : null}
          </>
        ),
        method: () => (
          <Panel title="How to read the audit">
            <Details title="Exposure, local demand and placement">We compare observed coin-in with expected coin-in at the same available hours. Each day uses other cabinets with the same configuration in the same zone when at least four peers exist. Sparse groups use only the prior 28 gaming days to estimate a zone index, excluding the focal cabinet from the historical totals. The index uses historical observed wagers divided by historical matched floor wagers, then scales the current same-day floor rate. With less than $5,000 in matched historical exposure, there is no local estimate. Local and zone ratios use covered days only. Both demand flags require at least half of available hours to have a zone comparison. Same-day peer matching is descriptive. Moves are reflected on their effective dates.</Details>
            <Details title="Payout variation and review thresholds">Hold gap = (house win − configured theoretical win) ÷ total coin-in. Intervals use a weekly clustered standard error with a normal approximation and at least six wagering weeks. Two-sided p-values receive Benjamini–Hochberg adjustment across eligible machines in the current scope. An inspection flag also requires negative gaps in both halves. Intervals are pointwise and are less reliable with few weeks or rare jackpots. Thresholds of 80% peer demand, 70% exposure and 2% downtime are screening rules. The peer demand analysis is retrospective and cannot establish placement causality.</Details>
          </Panel>
        ),
      }} />
    </>
  );
}
