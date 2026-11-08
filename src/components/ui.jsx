// Shared building blocks. Each renders the same markup and class names as the original string helpers.
import { n } from '../lib/format.js';
import { SUBTABS, useNav } from '../nav.jsx';

export function Panel({ title, id, children }) {
  return (
    <section className="panel" id={id} tabIndex={id ? -1 : undefined}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Card({ label, value, sub = '' }) {
  return (
    <div className="card">
      <small>{label}</small>
      <strong className="metric">{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

export const Metrics = ({ children }) => <div className="grid metrics">{children}</div>;
export const Note = ({ children }) => <p className="muted">{children}</p>;
export const Takeaway = ({ children }) => <p className="takeaway">{children}</p>;

export function Line({ label, value }) {
  return <div className="statline"><span>{label}</span><strong>{value}</strong></div>;
}

/** Collapsed section whose body sits in a paragraph, like the original details() helper. */
export function Details({ title, children }) {
  return <details><summary>{title}</summary><p>{children}</p></details>;
}
export const How = ({ children }) => <Details title="How this works">{children}</Details>;

/**
 * headers: strings, or {label, sort} objects (sort = 'ascending' | 'descending' | null).
 * rows: arrays of cell contents (strings, numbers or elements).
 */
export function Table({ headers, rows }) {
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            {headers.map((h, i) => typeof h === 'string'
              ? <th key={i} scope="col">{h}</th>
              : <th key={i} scope="col" aria-sort={h.sort ?? undefined}>{h.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

/** Sub-tab bar for the active tab plus only the selected sub-tab's content. */
export function Tabbed({ tab, views }) {
  const { state, setSub } = useNav();
  return (
    <>
      <nav className="subnav" aria-label="Sections in this tab">
        {SUBTABS[tab].map(([key, label]) => (
          <button key={key} data-sub={key} aria-pressed={key === state.sub} onClick={() => setSub(key)}>{label}</button>
        ))}
      </nav>
      <div className="stack">{views[state.sub]?.()}</div>
    </>
  );
}

/** Line chart. series: [{name, color, values, dash?}]; annotations: [{index, value, label, yOffset}]. */
export function Chart({ series, labels, format = n, min = null, max = null, height = 240, annotations = [] }) {
  const width = 720, left = 78, right = 18, top = 16, bottom = 32;
  const all = series.flatMap(s => s.values).filter(Number.isFinite);
  if (!all.length) return <Note>No observations for this selection.</Note>;
  const lo = min ?? Math.min(...all), hi = max ?? Math.max(...all);
  const range = hi - lo || 1;
  const x = i => left + (width - left - right) * (labels.length === 1 ? .5 : i / (labels.length - 1));
  const y = v => top + (height - top - bottom) * (1 - (v - lo) / range);
  const ticks = Array.from({ length: 5 }, (_, i) => lo + range * i / 4);
  const tickStep = Math.ceil((labels.length - 1) / 6);
  const showLabel = i => labels.length <= 8 || i === labels.length - 1 || (i % tickStep === 0 && labels.length - 1 - i >= tickStep / 2);
  const anchor = i => i === 0 && labels.length > 1 ? 'start' : i === labels.length - 1 && labels.length > 1 ? 'end' : 'middle';
  const pathFor = values => {
    let path = '', prev = false;
    values.forEach((v, i) => { if (!Number.isFinite(v)) { prev = false; return; } path += (prev ? 'L' : 'M') + x(i) + ' ' + y(v) + ' '; prev = true; });
    return path;
  };
  return (
    <>
      <div className="chart-scroll" tabIndex={0} aria-label="Chart viewport">
        <svg className="chart" viewBox={'0 0 ' + width + ' ' + height} role="group" aria-label={series.map(s => s.name).join(', ')}>
          {ticks.map((v, i) => (
            <g key={'t' + i}>
              <path className="axis" d={'M' + left + ' ' + y(v) + 'H' + (width - right)} />
              <text x={left - 8} y={y(v) + 4} textAnchor="end">{format(v)}</text>
            </g>
          ))}
          {labels.map((label, i) => showLabel(i) ? <text key={'x' + i} x={x(i)} y={height - 8} textAnchor={anchor(i)}>{label}</text> : null)}
          {series.map(s => (
            <g key={s.name}>
              <path d={pathFor(s.values)} fill="none" stroke={s.color} strokeWidth="2.6" strokeDasharray={s.dash} />
              {labels.length <= 12 && s.values.map((v, i) => Number.isFinite(v) ? (
                <circle key={i} data-point="" tabIndex={0} aria-label={labels[i] + ' ' + s.name + ' ' + format(v)} cx={x(i)} cy={y(v)} r="4" fill={s.color}>
                  <title>{labels[i] + ' · ' + s.name + ' · ' + format(v)}</title>
                </circle>
              ) : null)}
            </g>
          ))}
          {annotations.map(({ index, value, label, yOffset }) => {
            const cx = x(index), cy = y(value);
            return (
              <g key={label}>
                <path d={'M' + cx + ' ' + cy + 'V' + (yOffset + 3)} stroke="#f1d9ca" strokeWidth="1" />
                <circle cx={cx} cy={cy} r="4" fill="#fff" />
                <text className="annotation" x={cx + 5} y={yOffset}>{label}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="legend">
        {series.map(s => (
          <span key={s.name}>
            <i className="key" style={{ background: 'none', height: 0, borderTop: '2px ' + (s.dash ? (s.dash === '2 4' ? 'dotted' : 'dashed') : 'solid') + ' ' + s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </>
  );
}
