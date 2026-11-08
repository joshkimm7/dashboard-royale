// Themed SVG charts: line (optional area wash), columns (grouped or diverging around a baseline), or a mix.
// Hover or arrow keys move a crosshair/band highlight with one tooltip listing every series; a data table
// sits under every chart so no value is hover-only.
import { useId, useRef, useState } from 'react';
import { n } from '../lib/format.js';
import { Info, infoFor } from './Info.jsx';

const W = 720, LEFT = 66, RIGHT = 90, TOP = 20, BOTTOM = 32;

/** Rounded tick step (1, 2, 2.5, 5 × 10^k) giving about `count` intervals. */
export function niceTicks(lo, hi, count = 4) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / count, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw);
  const start = Math.floor(lo / step + 1e-9) * step, end = Math.ceil(hi / step - 1e-9) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
  return ticks;
}

/** Bar with a 4px rounded data end and a square baseline end; grows up or down from y0. */
function barPath(x, w, y0, y1) {
  const h = Math.abs(y1 - y0), r = Math.min(4, w / 2, h);
  if (h < .5) return '';
  if (y1 < y0) return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
  return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
}

/**
 * series: [{ name, color, values, kind?: 'line'|'bar', dash?, area?, muted?, diverging?: {below, above, sides?, neutral?} }]
 * type: default kind for series without one. baseline: label for the zero line (shown when 0 is in range).
 * title: the panel title, used to look up the chart's "i" explanation.
 */
export function Chart({ series, labels, format = n, min = null, max = null, height = 240, annotations = [], type = 'line', baseline = null, title = null, valueLabels = true, markers = false, fillBetween = null }) {
  const [hover, setHover] = useState(null);
  const frameRef = useRef(null);
  const tableId = useId();
  const all = series.flatMap(s => s.values).filter(Number.isFinite);
  if (!all.length) return <p className="muted">No observations for this selection.</p>;

  const kinds = series.map(s => s.kind ?? type);
  const hasBars = kinds.includes('bar');
  let lo = min ?? Math.min(...all), hi = max ?? Math.max(...all);
  if (hasBars) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  const ticks = niceTicks(lo, hi);
  lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks.at(-1));
  const range = hi - lo || 1;
  const plotW = W - LEFT - RIGHT, plotH = height - TOP - BOTTOM;
  const band = plotW / labels.length;
  const x = i => hasBars ? LEFT + band * (i + .5) : LEFT + plotW * (labels.length === 1 ? .5 : i / (labels.length - 1));
  const y = v => TOP + plotH * (1 - (v - lo) / range);
  const y0 = y(Math.min(Math.max(0, lo), hi));

  const barSeries = series.filter((_, i) => kinds[i] === 'bar');
  const gap = 2, barW = Math.max(3, Math.min(24, (band * .72 - gap * (barSeries.length - 1)) / Math.max(1, barSeries.length)));
  const groupW = barW * barSeries.length + gap * (barSeries.length - 1);
  const tickStep = Math.ceil(labels.length / 7);
  const showX = i => labels.length <= 8 || i === labels.length - 1 || (i % tickStep === 0 && labels.length - 1 - i >= tickStep * .8);
  const anchor = i => hasBars ? 'middle' : i === 0 && labels.length > 1 ? 'start' : i === labels.length - 1 && labels.length > 1 ? 'end' : 'middle';
  // Diverging colors follow the value's sign, or an explicit side per column (-1 below, 0 neutral, 1 above) for histograms.
  const colorAt = (s, v, i) => !s.diverging ? s.color
    : s.diverging.sides ? [s.diverging.below, s.diverging.neutral ?? s.color, s.diverging.above][Math.sign(s.diverging.sides[i]) + 1]
    : v < 0 ? s.diverging.below : s.diverging.above;

  const linePath = values => {
    let d = '', prev = false;
    values.forEach((v, i) => { if (!Number.isFinite(v)) { prev = false; return; } d += (prev ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' '; prev = true; });
    return d;
  };
  const areaPath = values => {
    const pts = values.map((v, i) => [i, v]).filter(([, v]) => Number.isFinite(v));
    if (pts.length < 2) return '';
    return 'M' + x(pts[0][0]) + ' ' + y0 + pts.map(([i, v]) => 'L' + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join('') + 'L' + x(pts.at(-1)[0]) + ' ' + y0 + 'Z';
  };

  // Selective direct labels: line ends (skipping collisions), or the peak and latest column of a single bar series.
  const endLabels = [];
  if (valueLabels && !hasBars) {
    for (const s of series) {
      if (s.muted) continue;
      const i = s.values.findLastIndex(Number.isFinite);
      if (i < 0) continue;
      const ly = y(s.values[i]);
      // Converging ends: push the label below the previous one and connect it with a short leader.
      let labelY = ly;
      while (endLabels.some(l => Math.abs(l.y - labelY) < 16)) labelY += 16;
      endLabels.push({ x: x(i) + 14, y: labelY, lineY: ly, endX: x(i), text: format(s.values[i]), key: s.name, color: s.color });
    }
  }
  const capLabels = [];
  if (valueLabels && barSeries.length === 1 && series.length === 1 && labels.length <= 12) {
    const vals = series[0].values;
    const peak = vals.reduce((b, v, i) => Number.isFinite(v) && (b < 0 || Math.abs(v) > Math.abs(vals[b])) ? i : b, -1);
    const lastI = vals.findLastIndex(Number.isFinite);
    for (const i of new Set([peak, lastI])) if (i >= 0) capLabels.push({ x: x(i), y: vals[i] < 0 ? y(vals[i]) + 14 : y(vals[i]) - 7, text: format(vals[i]) });
  }

  const indexAt = clientX => {
    const r = frameRef.current.querySelector('svg').getBoundingClientRect();
    const px = (clientX - r.left) / r.width * W;
    if (hasBars) return Math.max(0, Math.min(labels.length - 1, Math.floor((px - LEFT) / band)));
    return Math.max(0, Math.min(labels.length - 1, Math.round((px - LEFT) / plotW * (labels.length - 1))));
  };
  const onKey = e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setHover(h => Math.max(0, Math.min(labels.length - 1, (h ?? labels.length - 1) + (e.key === 'ArrowRight' ? 1 : -1))));
    } else if (e.key === 'Escape') setHover(null);
  };
  const tipLeft = hover == null ? 0 : x(hover) / W * 100;
  const chartInfo = infoFor('chart', title);

  return (
    <figure className="chart-block">
      <div className="chart-frame" ref={frameRef} tabIndex={0} role="group"
        aria-label={series.map(s => s.name).join(', ') + '. Use left and right arrow keys to read values.'}
        onPointerMove={e => setHover(indexAt(e.clientX))} onPointerLeave={() => setHover(null)}
        onFocus={() => setHover(h => h ?? labels.length - 1)} onBlur={() => setHover(null)} onKeyDown={onKey}>
        <svg className="chart" viewBox={'0 0 ' + W + ' ' + height} aria-hidden="true">
          <defs>
            {series.map((s, si) => s.area && (
              <linearGradient key={si} id={tableId + 'g' + si} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={s.color} stopOpacity=".22" /><stop offset="1" stopColor={s.color} stopOpacity=".02" />
              </linearGradient>
            ))}
          </defs>
          {ticks.map(v => (
            <g key={'t' + v}>
              <path className={v === 0 && baseline ? 'baseline' : 'grid'} d={'M' + LEFT + ' ' + y(v) + 'H' + (W - RIGHT)} />
              <text className="tick" x={LEFT - 8} y={y(v) + 4} textAnchor="end">{format(v)}</text>
            </g>
          ))}
          {baseline && <text className="baseline-label" x={W - RIGHT + 6} y={y0 + 4}>{baseline}</text>}
          {labels.map((label, i) => showX(i) ? <text key={'x' + i} className="tick" x={x(i)} y={height - 9} textAnchor={anchor(i)}>{label}</text> : null)}
          {hover != null && <rect className="hover-band" x={hasBars ? LEFT + band * hover : x(hover) - 0.5} y={TOP} width={hasBars ? band : 1} height={plotH} />}

          {barSeries.map((s, bi) => s.values.map((v, i) => Number.isFinite(v) ? (
            <path key={s.name + i} className={'bar' + (hover === i ? ' lit' : '')} fill={colorAt(s, v, i)}
              d={barPath(x(i) - groupW / 2 + bi * (barW + gap), barW, y0, y(v))} />
          ) : null))}
          {fillBetween && (() => {
            // Shade the gap between two line series (e.g. forecast vs actual) so the difference itself is visible.
            const a = series[fillBetween.a].values, b = series[fillBetween.b].values;
            const idx = labels.map((_, i) => i).filter(i => Number.isFinite(a[i]) && Number.isFinite(b[i]));
            if (idx.length < 2) return null;
            const d = 'M' + idx.map(i => x(i).toFixed(1) + ' ' + y(a[i]).toFixed(1)).join('L') + 'L' + idx.slice().reverse().map(i => x(i).toFixed(1) + ' ' + y(b[i]).toFixed(1)).join('L') + 'Z';
            return <path className="gap-fill" d={d} fill={fillBetween.color} />;
          })()}
          {series.map((s, si) => kinds[si] === 'line' && (
            <g key={s.name} className={s.muted ? 'muted-series' : undefined}>
              {s.area && <path d={areaPath(s.values)} fill={'url(#' + tableId + 'g' + si + ')'} />}
              <path className="line" d={linePath(s.values)} stroke={s.color} strokeWidth={s.muted ? 1.5 : 2} strokeDasharray={s.dash} />
            </g>
          ))}
          {hover != null && series.map((s, si) => kinds[si] === 'line' && Number.isFinite(s.values[hover]) && (
            <circle key={'h' + si} className="hover-dot" cx={x(hover)} cy={y(s.values[hover])} r="4.5" fill={s.color} />
          ))}
          {annotations.map(({ index, value, label, yOffset }) => (
            <g key={label} className="annotation-mark">
              <path d={'M' + x(index) + ' ' + y(value) + 'V' + (yOffset + 3)} />
              <circle cx={x(index)} cy={y(value)} r="4" />
              <text className="annotation" x={x(index) + 6} y={yOffset}>{label}</text>
            </g>
          ))}
          {markers && series.map((s, si) => kinds[si] === 'line' && !s.muted && labels.length <= 12 && s.values.map((v, i) => Number.isFinite(v) && (
            <circle key={s.name + 'm' + i} className="marker" cx={x(i)} cy={y(v)} r="4" fill={s.color} />
          )))}
          {endLabels.map(l => (
            <g key={l.key}>
              {Math.abs(l.y - l.lineY) > 1 && <path className="leader" d={'M' + (l.endX + 5) + ' ' + l.lineY + 'L' + (l.x - 3) + ' ' + l.y} stroke={l.color} />}
              <text className="value-label" x={l.x} y={l.y + 4}>{l.text}</text>
            </g>
          ))}
          {capLabels.map(l => <text key={l.x} className="value-label" x={l.x} y={l.y} textAnchor="middle">{l.text}</text>)}
        </svg>
        {hover != null && (
          <div className={'chart-tip' + (tipLeft > 62 ? ' flip' : '')} style={{ left: tipLeft + '%' }} role="status">
            <div className="chart-tip-head">{labels[hover]}</div>
            {series.map((s, si) => (
              <div className="chart-tip-row" key={s.name}>
                <i className={kinds[si] === 'bar' ? 'key-rect' : 'key-line'} style={{ '--c': colorAt(s, s.values[hover] ?? 0, hover) }} />
                <strong>{format(s.values[hover])}</strong><span>{s.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <figcaption className="legend">
        {series.length > 1 && series.map((s, si) => (
          <span key={s.name}>
            {kinds[si] === 'bar'
              ? <i className="key-rect" style={{ '--c': s.diverging ? s.diverging.below : s.color }} />
              : <i className="key-line" style={{ '--c': s.color, borderTopStyle: s.dash ? (s.dash.startsWith('2') ? 'dotted' : 'dashed') : 'solid' }} />}
            {s.name}{s.diverging ? ' (below / above)' : ''}
          </span>
        ))}
        {chartInfo && <span className="legend-info">How to read this chart<Info text={chartInfo} label={'the chart in ' + title} /></span>}
      </figcaption>
      <details className="chart-data">
        <summary>Chart data</summary>
        <div className="tablewrap">
          <table>
            <thead><tr><th scope="col">Period</th>{series.map(s => <th key={s.name} scope="col">{s.name}</th>)}</tr></thead>
            <tbody>{labels.map((label, i) => <tr key={i}><td>{label}</td>{series.map(s => <td key={s.name}>{format(s.values[i])}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
