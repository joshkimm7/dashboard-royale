// Weekday × clock-hour heat map as an HTML grid: one gold hue for magnitude, a legend scale, a title and label per
// cell, arrow-key navigation (roving tab stop) with a live readout, and the full 7 × 24 table as a fallback.
import { useState } from 'react';
import { Info, infoFor } from './Info.jsx';

// Dark surface, so the sequential ramp anchors low values near the panel (deep gold) and high values light.
const LOW = [94, 59, 23], HIGH = [246, 220, 150];
const shade = t => 'rgb(' + LOW.map((v, i) => Math.round(v + (HIGH[i] - v) * t)).join(',') + ')';
const hourLabel = h => String(h).padStart(2, '0') + ':00';

/** cells: 168 entries {weekday, hour, value, count} in row-major order; rows = weekday names. */
export function Heatmap({ cells, rows, format, title, caption, unit }) {
  const [active, setActive] = useState(null);
  const [focus, setFocus] = useState(0);
  const values = cells.map(c => c.value).filter(Number.isFinite);
  if (!values.length) return <p className="muted">No observations for this selection.</p>;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const describe = c => rows[c.weekday] + ' ' + hourLabel(c.hour) + ': ' + format(c.value) + ' ' + unit + ' (' + c.count + ' gaming days)';
  const move = (i, e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 24, ArrowUp: -24 }[e.key];
    let next = null;
    if (step != null) next = i + step;
    else if (e.key === 'Home') next = i - (i % 24);
    else if (e.key === 'End') next = i - (i % 24) + 23;
    else if (e.key === 'Escape') { setActive(null); return; }
    if (next == null || next < 0 || next >= cells.length) return;
    e.preventDefault();
    setFocus(next); setActive(next);
    e.currentTarget.parentElement.parentElement.querySelectorAll('[role="gridcell"]')[next]?.focus();
  };
  const info = infoFor('chart', title);
  const shown = active ?? null;

  return (
    <figure className="chart-block heat">
      <div className="heat-grid" role="grid" aria-label={caption + '. Use arrow keys to move between cells.'} aria-rowcount={rows.length + 1} aria-colcount={25}
        onPointerLeave={() => setActive(null)}>
        <div role="row" className="heat-row heat-head">
          <span role="columnheader" className="heat-corner">Gaming day</span>
          {cells.slice(0, 24).map(c => <span role="columnheader" key={c.hour} aria-label={hourLabel(c.hour)}>{c.hour % 3 === 0 ? String(c.hour).padStart(2, '0') : ''}</span>)}
        </div>
        {rows.map((name, r) => (
          <div role="row" className="heat-row" key={name}>
            <span role="rowheader">{name}</span>
            {cells.slice(r * 24, r * 24 + 24).map((c, j) => {
              const i = r * 24 + j;
              return (
                <span key={i} role="gridcell" tabIndex={i === focus ? 0 : -1} title={describe(c)} aria-label={describe(c)}
                  className={'heat-cell' + (i === shown ? ' on' : '')}
                  style={{ background: Number.isFinite(c.value) ? shade((c.value - lo) / span) : 'transparent' }}
                  onPointerEnter={() => setActive(i)} onFocus={() => { setFocus(i); setActive(i); }} onKeyDown={e => move(i, e)} />
              );
            })}
          </div>
        ))}
      </div>
      <p className="heat-readout" role="status">{shown != null ? describe(cells[shown]) : 'Hover or focus a cell to read its value.'}</p>
      <figcaption className="legend heat-legend">
        <span className="heat-scale" aria-hidden="true"><i style={{ background: 'linear-gradient(90deg,' + shade(0) + ',' + shade(.5) + ',' + shade(1) + ')' }} /></span>
        <span>{format(lo)} (lowest)</span><span>{format((lo + hi) / 2)}</span><span>{format(hi)} (highest) {unit}</span>
        {info && <span className="legend-info">How to read this chart<Info text={info} label={'the chart in ' + title} /></span>}
      </figcaption>
      <details className="chart-data">
        <summary>Chart data</summary>
        <div className="tablewrap">
          <table>
            <thead><tr><th scope="col">Gaming day</th>{cells.slice(0, 24).map(c => <th key={c.hour} scope="col">{hourLabel(c.hour)}</th>)}</tr></thead>
            <tbody>{rows.map((name, r) => <tr key={name}><th scope="row">{name}</th>{cells.slice(r * 24, r * 24 + 24).map((c, j) => <td key={j}>{format(c.value)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
