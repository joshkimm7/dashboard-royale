// Shared building blocks. Each renders the same markup and class names as the original string helpers.
import { InfoFor } from './Info.jsx';
import { SUBTABS, useNav } from '../nav.jsx';

export function Panel({ title, id, children }) {
  return (
    <section className="panel" id={id} tabIndex={id ? -1 : undefined}>
      <h2>{title}<InfoFor kind="panel" label={title} /></h2>
      {children}
    </section>
  );
}

export function Card({ label, value, sub = '' }) {
  return (
    <div className="card">
      <small>{label}<InfoFor kind="card" label={label} /></small>
      <strong className="metric">{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

export const Metrics = ({ children }) => <div className="grid metrics">{children}</div>;
export const Note = ({ children }) => <p className="muted">{children}</p>;
export const Takeaway = ({ children }) => <p className="takeaway">{children}</p>;

export function Line({ label, value }) {
  return <div className="statline"><span>{label}<InfoFor kind="line" label={label} /></span><strong>{value}</strong></div>;
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

export { Chart } from './Chart.jsx';
