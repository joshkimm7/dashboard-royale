// Q1 · Machine audit: bottom-ten verdicts, adjusted ranking with a luck funnel and payout-config check, machine file,
// floor bank map and the M-1158 weekly payout check.
import { useId, useRef, useState } from 'react';
import { useModel } from '../modelContext.js';
import { useNav } from '../nav.jsx';
import { SERIES, by, cash, compact, month, months, n, pct, pp, qText, ratio, sum } from '../lib/format.js';
import { adjustRanking, hasPeerBenchmark, peerDemandCutoff, summarize, underPeerCutoff } from '../lib/model.js';
import { Card, Chart, Details, Line, Metrics, Note, Panel, Table, Tabbed, Takeaway } from '../components/ui.jsx';
import { niceTicks } from '../components/Chart.jsx';
import { Info, infoFor } from '../components/Info.jsx';

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
      <Chart type="bar" title="M-1158 · Weekly payout check" baseline="As configured" labels={labels} format={pp}
        series={[{ name: 'M-1158 hold gap', color: SERIES.rose, diverging: { below: SERIES.rose, above: SERIES.blue }, values },
          { name: 'Same-configuration peers', kind: 'line', color: SERIES.muted, values: peerValues }]} />
      <Line label="Full-period payout gap" value={pp(inspect.res)} />
      <MatchedPayoutPeers />
      <Line label="Sensitivity interval and adjusted q" value={pp(withoutWorst.lo) + ' to ' + pp(withoutWorst.hi) + ' · q ' + qText(withoutWorst.q, true)} />
      <Line label="Largest adjusted q after dropping any one week" value={qText(maxLeaveOneOutQ, true)} />
      <Details title="How this check works">Drop the week with the most negative observed hold gap, recalculate the machine’s weekly-clustered interval and reapply the multiple-test adjustment with the other cabinets unchanged. Repeat for every single week to check sensitivity to any choice of excluded week. Peer gaps provide context for whether the configuration broadly behaved the same way. The first and last gaming weeks are partial.</Details>
    </Panel>
  );
}

// ---- Adjusted ranking ----------------------------------------------------------------------------------------

const VOLATILITY = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['very_high', 'Very high']];
const volatilityLabel = v => VOLATILITY.find(([k]) => k === v)?.[1] ?? v;
const signedInt = v => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + n(Math.abs(v));

/** Marker shape per volatility class, centred on (x, y), so class never relies on color. */
function Shape({ volatility, x, y, r = 5, ...rest }) {
  if (volatility === 'medium') return <rect x={x - r * .85} y={y - r * .85} width={r * 1.7} height={r * 1.7} {...rest} />;
  if (volatility === 'high') return <path d={`M${x},${y - r * 1.1}L${x + r * 1.05},${y + r * .8}L${x - r * 1.05},${y + r * .8}Z`} {...rest} />;
  if (volatility === 'very_high') return <path d={`M${x},${y - r * 1.2}L${x + r},${y}L${x},${y + r * 1.2}L${x - r},${y}Z`} {...rest} />;
  return <circle cx={x} cy={y} r={r} {...rest} />;
}
const ShapeKey = ({ volatility, color = '#cdb59b' }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }}>
    <Shape volatility={volatility} x={7} y={7} r={4.6} fill={color} />
  </svg>
);
const outsideColor = z => z == null || Math.abs(z) <= 1.96 ? SERIES.muted : z < 0 ? SERIES.rose : SERIES.blue;

const FW = 720, FH = 330, FL = 66, FR = 90, FT = 30, FB = 34;

/**
 * Funnel plot: payout gap (actual minus configured win per dollar) against coin-in on a log scale, with ±1.96·SE
 * luck bounds for one volatility class. Same chart language as Chart: grid, ticks, keyboard-readable tooltip and
 * a data table underneath.
 */
function FunnelPlot({ points, title, label }) {
  const classes = VOLATILITY.filter(([k]) => points.some(p => p.volatility === k));
  const focal = points.find(p => p.id === label);
  const [bounds, setBounds] = useState(null);
  const active = classes.some(([k]) => k === bounds) ? bounds : focal?.volatility ?? classes[0]?.[0];
  const [hover, setHover] = useState(null);
  const frameRef = useRef(null);
  const tableId = useId();
  const plotted = points.filter(p => p.x.coin > 0 && p.x.res != null).sort((a, b) => a.x.coin - b.x.coin);
  if (!plotted.length) return <p className="muted">No observations for this selection.</p>;

  // Pooled luck variance per dollar wagered for the selected class: SE(coin) = sqrt(c / coin).
  const inClass = plotted.filter(p => p.volatility === active && p.luckVar != null);
  const c = ratio(sum(inClass, p => p.luckVar), sum(inClass, p => p.x.coin));
  const lx0 = Math.log10(plotted[0].x.coin), lx1 = Math.log10(plotted.at(-1).x.coin);
  const span = Math.max(lx1 - lx0, .2), xlo = lx0 - span * .04, xhi = lx1 + span * .04;
  const values = plotted.map(p => p.x.res);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 5);
  const lo = Math.min(ticks[0], ...values), hi = Math.max(ticks.at(-1), ...values);
  const tickDigits = ticks.every(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6) ? 0 : 1;
  const plotW = FW - FL - FR, plotH = FH - FT - FB;
  const X = coin => FL + plotW * (Math.log10(coin) - xlo) / (xhi - xlo);
  const Y = v => FT + plotH * (1 - (v - lo) / (hi - lo));
  const xTicks = [];
  for (let e = Math.floor(xlo); e <= Math.ceil(xhi); e++) for (const f of [1, 2, 5]) {
    const v = f * 10 ** e;
    if (Math.log10(v) >= xlo && Math.log10(v) <= xhi) xTicks.push(v);
  }
  const shownX = xTicks.length > 7 ? xTicks.filter(v => String(v)[0] === '1') : xTicks;
  const bound = sign => {
    if (!c) return '';
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const coin = 10 ** (xlo + (xhi - xlo) * i / 80), v = sign * 1.96 * Math.sqrt(c / coin);
      if (v >= lo && v <= hi) pts.push(X(coin).toFixed(1) + ' ' + Y(v).toFixed(1));
    }
    return pts.length > 1 ? 'M' + pts.join('L') : '';
  };

  const nearest = (clientX, clientY) => {
    const r = frameRef.current.querySelector('svg').getBoundingClientRect();
    const px = (clientX - r.left) / r.width * FW, py = (clientY - r.top) / r.height * FH;
    let best = null, dist = 26 ** 2;
    plotted.forEach((p, i) => { const d = (X(p.x.coin) - px) ** 2 + (Y(p.x.res) - py) ** 2; if (d < dist) { dist = d; best = i; } });
    return best;
  };
  const onKey = e => {
    const last = plotted.length - 1, start = Math.max(0, plotted.indexOf(focal));
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (step) { e.preventDefault(); setHover(h => Math.max(0, Math.min(last, (h ?? start) + step))); }
    else if (e.key === 'Home') { e.preventDefault(); setHover(0); }
    else if (e.key === 'End') { e.preventDefault(); setHover(last); }
    else if (e.key === 'Escape') setHover(null);
  };
  const tip = hover == null ? null : plotted[hover];
  const tipLeft = tip ? X(tip.x.coin) / FW * 100 : 0;
  const chartInfo = infoFor('chart', title);
  const focalPoint = plotted.find(p => p.id === label);

  return (
    <figure className="chart-block">
      <div className="controls" role="group" aria-label="Luck bounds for volatility class">
        {classes.map(([k, name]) => (
          <button key={k} data-bounds={k} aria-pressed={k === active} onClick={() => setBounds(k)}><ShapeKey volatility={k} />{name + ' bounds'}</button>
        ))}
      </div>
      <div className="chart-frame" ref={frameRef} tabIndex={0} role="group"
        aria-label={'Payout gap against coin-in for ' + n(plotted.length) + ' cabinets, with 95% luck bounds for ' + volatilityLabel(active).toLowerCase() + ' volatility. Use arrow keys to step through cabinets by coin-in.'}
        onPointerMove={e => setHover(nearest(e.clientX, e.clientY))} onPointerLeave={() => setHover(null)}
        onFocus={() => setHover(h => h ?? Math.max(0, plotted.indexOf(focalPoint)))} onBlur={() => setHover(null)} onKeyDown={onKey}>
        <svg className="chart" viewBox={'0 0 ' + FW + ' ' + FH} aria-hidden="true">
          {ticks.map(v => (
            <g key={'t' + v}>
              <path className={v === 0 ? 'baseline' : 'grid'} d={'M' + FL + ' ' + Y(v) + 'H' + (FW - FR)} />
              <text className="tick" x={FL - 8} y={Y(v) + 4} textAnchor="end">{(v > 0 ? '+' : '') + n(v * 100, tickDigits)}</text>
            </g>
          ))}
          {shownX.map(v => (
            <g key={'x' + v}>
              <path className="grid" d={'M' + X(v) + ' ' + FT + 'V' + (FT + plotH)} />
              <text className="tick" x={X(v)} y={FH - 12} textAnchor="middle">{compact(v)}</text>
            </g>
          ))}
          <text className="tick" x={FL - 8} y={FT - 14} textAnchor="start">Payout gap, pp</text>
          <text className="baseline-label" x={FW - FR + 6} y={Y(0) + 4}>As configured</text>
          {[1, -1].map(sign => <path key={sign} className="line" d={bound(sign)} stroke={SERIES.gold} strokeWidth="1.6" strokeDasharray="5 4" />)}
          {plotted.map((p, i) => (
            <Shape key={p.id} volatility={p.volatility} x={X(p.x.coin)} y={Y(p.x.res)} r={hover === i ? 6.5 : 4.4}
              fill={outsideColor(p.z)} opacity={p.volatility === active || hover === i ? 1 : .32}
              stroke={hover === i ? '#fff7e2' : '#3a0f14'} strokeWidth={hover === i ? 2 : 1} />
          ))}
          {focalPoint && (
            <g className="annotation-mark">
              <path d={'M' + X(focalPoint.x.coin) + ' ' + (Y(focalPoint.x.res) - 7) + 'V' + (Y(focalPoint.x.res) - 22)} />
              <text className="annotation" x={X(focalPoint.x.coin)} y={Y(focalPoint.x.res) - 26} textAnchor="middle">{focalPoint.id}</text>
            </g>
          )}
          <text className="tick" x={FL + plotW / 2} y={FH} textAnchor="middle">Coin-in (log scale)</text>
        </svg>
        {tip && (
          <div className={'chart-tip' + (tipLeft > 62 ? ' flip' : '')} style={{ left: tipLeft + '%' }} role="status">
            <div className="chart-tip-head">{tip.id + ' · ' + volatilityLabel(tip.volatility) + ' volatility'}</div>
            <div className="chart-tip-row"><ShapeKey volatility={tip.volatility} color={outsideColor(tip.z)} /><strong>{pp(tip.x.res)}</strong><span>Payout gap</span></div>
            <div className="chart-tip-row"><i className="key-line" style={{ '--c': SERIES.gold }} /><strong>{tip.luckSE == null ? '—' : '±' + pp(1.96 * tip.luckSE).replace('+', '')}</strong><span>Own luck bound</span></div>
            <div className="chart-tip-row"><i className="key-rect" style={{ '--c': SERIES.muted }} /><strong>{cash(tip.x.coin)}</strong><span>Coin-in</span></div>
            <div className="chart-tip-row"><i className="key-rect" style={{ '--c': outsideColor(tip.z) }} /><strong>{tip.z == null ? '—' : n(tip.z, 2)}</strong><span>Standard errors from zero</span></div>
          </div>
        )}
      </div>
      <figcaption className="legend">
        {classes.map(([k, name]) => <span key={k}><ShapeKey volatility={k} />{name + ' volatility'}</span>)}
        <span><i className="key-rect" style={{ '--c': SERIES.rose }} />Below own luck bounds</span>
        <span><i className="key-rect" style={{ '--c': SERIES.blue }} />Above own luck bounds</span>
        <span><i className="key-rect" style={{ '--c': SERIES.muted }} />Within luck</span>
        <span><i className="key-line" style={{ '--c': SERIES.gold, borderTopStyle: 'dashed' }} />{'95% luck bounds · ' + volatilityLabel(active).toLowerCase()}</span>
        {chartInfo && <span className="legend-info">How to read this chart<Info text={chartInfo} label={'the chart in ' + title} /></span>}
      </figcaption>
      <details className="chart-data">
        <summary>Chart data</summary>
        <div className="tablewrap">
          <table aria-describedby={tableId}>
            <caption id={tableId} className="muted">Cabinets in coin-in order. Own luck bound is ±1.96 standard errors from game math.</caption>
            <thead><tr>{['Machine', 'Volatility', 'Coin-in', 'Payout gap', 'Own luck bound', 'Standard errors'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{plotted.map(p => (
              <tr key={p.id}><td>{p.id}</td><td>{volatilityLabel(p.volatility)}</td><td>{cash(p.x.coin)}</td><td>{pp(p.x.res)}</td>
                <td>{p.luckSE == null ? '—' : '±' + pp(1.96 * p.luckSE).replace('+', '')}</td><td>{p.z == null ? '—' : n(p.z, 2)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Why each of the raw bottom ten does or doesn't make the adjusted bottom ten, from its own computed signals. */
function rawTenReason(r, size) {
  const x = r.x, parts = [];
  if (r.adjRank != null && r.adjRank <= size) parts.push('Weak cabinet: earns ' + pct(r.index, 0) + ' of matched peers’ expected win per hour');
  else parts.push('Earns ' + pct(r.index, 0) + ' of matched peers’ expected win per hour');
  if (x.flags.includes('Short exposure')) parts.push('only ' + n(x.days) + ' of ' + n(x.totalDays) + ' days in scope');
  if (underPeerCutoff(x, 'zone')) parts.push('its zone draws ' + pct(x.zone, 0) + ' of floor play for this game');
  if (r.z != null && r.z < -1.96) parts.push('paid ' + cash(x.theo - x.win) + ' more than configured, outside its luck bound' +
    (x.flags.includes('Inspect hold') ? ' and flagged after testing every cabinet: inspect' : ', but not flagged once every cabinet is tested: monitor'));
  else if (x.win < x.theo) parts.push('paid ' + cash(x.theo - x.win) + ' more than configured, within luck');
  return parts.join(' · ');
}

function AdjustedRanking({ ranking, sensitivity, size = 10 }) {
  const m = useModel();
  const [sort, setSort] = useState({ key: 'adjRank', reverse: false });
  const [showAll, setShowAll] = useState(false);
  const { rawTen, adjustedTen, both, rawOnly, atOrAbovePeers, outsideLuck } = m.rankingOverlap(ranking, size);
  if (!ranking.ordered.length) return <Note>No cabinets with a matched-peer benchmark in this selection.</Note>;
  const ids = list => list.map(r => r.id).join(', ');
  const overlapText = ranking.ordered.length <= size
    ? 'This selection has only ' + n(ranking.ordered.length) + ' benchmarked cabinets, so both lists hold all of them; compare their ranks in the table below.'
    : both.length
    ? n(both.length) + ' of the ' + n(rawTen.length) + ' lowest raw earners (' + ids(both) + ') ' + (both.length === 1 ? 'is' : 'are') + ' also in the adjusted bottom ' + n(adjustedTen.length) + '.'
    : 'None of the ' + n(rawTen.length) + ' lowest raw earners is in the adjusted bottom ' + n(adjustedTen.length) + '.';
  const implication = ranking.ordered.length <= size ? '' : rawOnly.length
    ? ' Replacing the other ' + n(rawOnly.length) + ' would mostly pay to fix exposure, placement or luck rather than the weakest cabinets; ' + n(atOrAbovePeers.length) +
      ' of them earn at least their matched peers’ expected win per hour.'
    : ' The raw list already names the weakest cabinets.';
  const columns = [['id', 'Machine'], ['rawRank', 'Raw rank'], ['adjRank', 'Adjusted rank'], ['change', 'Change'], ['score', 'Adjusted score'],
    ['index', 'Unshrunk index'], ['hours', 'Benchmark hours'], ['w', 'Credibility weight']];
  const sorted = ranking.ordered.slice().sort((a, b) => {
    const x = a[sort.key], y = b[sort.key];
    if (x == null) return y == null ? 0 : 1; if (y == null) return -1;
    return (sort.reverse ? -1 : 1) * (typeof x === 'string' ? x.localeCompare(y) : x - y);
  });
  const shown = showAll ? sorted : sorted.slice(0, 20);
  const headers = columns.map(([key, title]) => ({
    sort: sort.key === key ? (sort.reverse ? 'descending' : 'ascending') : null,
    label: <button data-adj-sort={key} title={'Sort by ' + title} onClick={() => setSort(s => ({ key, reverse: s.key === key && !s.reverse }))}>{title + (sort.key === key ? (sort.reverse ? ' ↓' : ' ↑') : '')}</button>,
  }));
  const rows = shown.map(r => [<strong>{r.id}</strong>, n(r.rawRank), n(r.adjRank), signedInt(r.change), pct(r.score, 1), pct(r.index, 1), n(r.hours), n(r.w, 2)]);
  return (
    <>
      <Takeaway>{overlapText + implication}</Takeaway>
      <Line label="Overlap with the raw bottom ten" value={n(both.length) + ' of ' + n(rawTen.length)} />
      <Line label="Credibility constant k" value={n(m.credibility.k) + ' benchmark hours'} />
      <Line label="Adjusted bottom ten kept at half / double k" value={sensitivity.filter(x => x.factor).map(x => n(x.kept) + ' of ' + n(Math.min(size, ranking.ordered.length))).join(' / ')} />
      <Line label="Raw overlap with no shrinkage" value={n(sensitivity.find(x => !x.factor).overlap) + ' of ' + n(rawTen.length)} />
      <Line label="Cabinets outside their own luck bounds" value={n(outsideLuck.length) + ' of ' + n(ranking.rows.filter(r => r.z != null).length)} />
      <h3>Why each raw bottom-ten cabinet ranks where it does</h3>
      <div className="verdict-table"><Table headers={['ID', 'Raw rank', 'Adjusted rank', 'Why']} rows={rawTen.map(r => [<strong>{r.id}</strong>, n(r.rawRank), n(r.adjRank), rawTenReason(r, size)])} /></div>
      <h3>Every cabinet, adjusted</h3>
      <Note>Adjusted score: expected win per available hour against same-game cabinets in the same zone over the same hours, pulled toward 100% when hours are few. Below 100% means the cabinet draws less play than its matched peers. Change is adjusted rank minus raw rank; positive means the cabinet looks stronger once exposure, luck and placement are removed.</Note>
      <div className="controls"><button id="adjusted-all" aria-pressed={showAll} onClick={() => setShowAll(v => !v)}>{showAll ? 'Show weakest 20' : 'Show all ' + n(sorted.length) + ' machines'}</button></div>
      <Table headers={headers} rows={rows} />
      <Details title="How the adjusted score works">{'Expected win (theo = coin-in × configured hold) removes payout luck. For each cabinet, total theo is divided by the theo its matched peers would have earned over the same available hours (ratio of sums): same-configuration cabinets in the same zone on the same day when at least four exist, otherwise a 28-day zone history, otherwise same-day floor peers. Downtime hours are excluded, so breakdowns are not counted as weakness. The score is w × index + (1 − w) × 100%, with w = hours ÷ (hours + k). k = ' +
        n(m.credibility.k) + ' hours is the Bühlmann–Straub ratio of day-to-day noise in the index to the real spread between cabinets (between-cabinet SD ' + pct(Math.sqrt(m.credibility.between), 1) + ', ' + n(m.credibility.cabinets) +
        ' cabinets), fitted once on January–June. A cabinet with k hours of history gets half weight on its own record. Payout gaps are tested separately in the funnel below, so a payout fault does not make a cabinet look weak here.'}</Details>
    </>
  );
}

function PayoutConfigCheck() {
  const m = useModel();
  const c = m.payoutConfig;
  const leads = [
    ...c.rtpMismatches.map(([id, config, rtp, days]) => [id, 'Daily RTP ' + pct(rtp, 2) + ' differs from published ' + config + ' on ' + n(days) + ' days']),
    ...c.meterMismatches.map(([id, days]) => [id, 'Raw meter theo implies a different RTP on ' + n(days) + ' days']),
    ...c.dailyChanges.map(([id, path]) => [id, 'Configuration changed mid-period in the daily view: ' + path]),
    ...c.placementChanges.map(([id, path]) => [id, 'Configuration changed across placements: ' + path]),
  ];
  return (
    <Panel title="Payout-configuration check" id="config-check">
      <Takeaway>{leads.length ? n(new Set(leads.map(l => l[0])).size) + ' cabinets have a configuration record to inspect. These are leads, not findings of wrongdoing.'
        : 'No configuration mismatches or mid-period changes: every cabinet ran the published payout rate for its game all period.'}</Takeaway>
      <Line label="Configured RTP vs published game math" value={n(c.rtpMismatches.length) + ' mismatches in ' + n(c.machineDays) + ' machine-days'} />
      <Line label="Raw meter theo vs published RTP" value={n(c.meterMismatches.length) + ' of ' + n(c.machines) + ' cabinets differ'} />
      <Line label="Mid-period configuration changes" value={n(c.dailyChanges.length) + ' in daily records · ' + n(c.placementChanges.length) + ' across ' + n(c.placements) + ' placements'} />
      {leads.length ? <Table headers={['Machine', 'Inspect lead']} rows={leads} /> : null}
      <Note>{'Checked against ' + n(c.configs) + ' published game configurations. A clean result means payout gaps such as M-1158’s are not explained by a mislabelled configuration; the meters or paytable themselves remain the thing to inspect.'}</Note>
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
      <Chart type="bar" title="Machine file" labels={blocks.map(([mo]) => months[month(mo + '-01')])} format={compact} height={210}
        series={[{ name: 'House win', color: SERIES.gold, values: blocks.map(([, a]) => sum(a, r => r.win)) }, { name: 'Expected win', color: SERIES.blue, values: blocks.map(([, a]) => sum(a, r => r.theo)) }]} />
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
        adjusted: () => {
          const luck = m.luckFor(s);
          const ranking = adjustRanking(all, { k: m.credibility.k, hold: m.configHold, luck });
          return (
            <>
              <Panel title="Adjusted ranking" id="adjusted-check">
                <AdjustedRanking ranking={ranking} sensitivity={m.kSensitivity(all, luck, ranking)} />
              </Panel>
              <Panel title="Payout gap vs luck bounds" id="funnel-check">
                <Note>Each mark is a cabinet in the selection. Bounds narrow as wagers grow because luck averages out; marks outside their own bounds paid out differently from their settings by more than chance usually explains, though about one cabinet in twenty lands there by luck alone. Outliers are leads to inspect, not accusations.</Note>
                <FunnelPlot points={ranking.rows} title="Payout gap vs luck bounds" label={m.inspect.id} />
              </Panel>
              <PayoutConfigCheck />
            </>
          );
        },
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
