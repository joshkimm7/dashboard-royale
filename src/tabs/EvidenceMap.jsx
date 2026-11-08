// Evidence map as a left-to-right flow: data sources → evidence (grouped by question) → actions → the July plan.
// Hovering, focusing or selecting a box traces its full line of evidence; the assistant can point at boxes too.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useModel } from '../modelContext.js';
import { useNav } from '../nav.jsx';
import { Note, Panel } from '../components/ui.jsx';
import { STAGES, buildEvidenceGraph, evidenceByQuestion, flowLinks, lineage } from '../lib/evidence.js';
import { setMapFocus, useMapFocus } from '../assistant/focus.js';

const TYPE_LABEL = { source: 'Data source', evidence: 'Evidence', action: 'Action', decision: 'Decision', question: 'Question', machine: 'Bottom-ten machine', flag: 'Review flag' };
/** Session-level selection: survives leaving and returning to the tab. */
const mapView = { selected: 'plan' };

export function GoButton({ go, label }) {
  const nav = useNav();
  if (!go) return null;
  if (go.jump) return <button data-jump={go.jump} onClick={() => nav.jump(go.jump)}>{label}</button>;
  if (go.evidence) return <button data-evidence={go.evidence} data-section={go.section || undefined} onClick={() => nav.openEvidence(go.evidence, go.section || undefined)}>{label}</button>;
  return <button data-goto={go.goto} onClick={() => nav.goto(go.goto)}>{label}</button>;
}

function FlowNode({ node, state, onHover, onSelect, nodeRef }) {
  return (
    <button ref={nodeRef} className={'flow-node t-' + node.type + (state ? ' ' + state : '')} data-id={node.id}
      aria-pressed={state.includes('sel')} onMouseEnter={() => onHover(node.id)} onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(node.id)} onBlur={() => onHover(null)} onClick={() => onSelect(node.id)}>
      <span className="flow-label">{node.label}</span>
      {node.value && <span className="flow-value">{node.value}</span>}
    </button>
  );
}

function DetailCard({ graph, id, onSelect }) {
  const nd = graph.byId.get(id);
  const nav = useNav();
  if (!nd) return <Note>Select a box to see what it is.</Note>;
  const related = type => [...nd.nb].map(o => graph.byId.get(o)).filter(o => o.type === type);
  const chips = (title, list) => list.length > 0 && (
    <>
      <p className="muted flow-conn">{title}</p>
      <div className="map-chips">{list.map(o => <button key={o.id} data-mapselect={o.id} onClick={() => onSelect(o.id)}><span className={'dot t-' + o.type} />{o.label}</button>)}</div>
    </>
  );
  const upstream = { evidence: 'source', action: 'evidence', decision: 'action', question: 'evidence' }[nd.type];
  const downstream = { source: 'evidence', evidence: 'action', action: 'decision' }[nd.type];
  const machines = related('machine');
  return (
    <>
      <span className={'eyebrow t-' + nd.type}>{TYPE_LABEL[nd.type]}</span>
      <h3>{nd.label}</h3>
      {nd.value && <strong className="metric">{nd.value}</strong>}
      <p>{nd.summary}</p>
      {nd.go && <GoButton go={nd.go} label={nd.type === 'question' ? 'Open this tab →' : 'Open evidence →'} />}
      {chips(nd.type === 'question' ? 'Evidence for this question' : nd.type === 'decision' ? 'Made up of' : 'Built from', upstream ? related(upstream) : [])}
      {chips(nd.type === 'source' ? 'Feeds' : 'Supports', downstream ? related(downstream) : [])}
      {machines.length > 0 && (
        <>
          <p className="muted flow-conn">Machines</p>
          <div className="map-chips">{machines.map(mc => <button key={mc.id} data-evidence={mc.label} onClick={() => nav.openEvidence(mc.label)}>{mc.label}</button>)}</div>
        </>
      )}
    </>
  );
}

export default function EvidenceMap() {
  const m = useModel();
  const graph = useMemo(() => buildEvidenceGraph(m), [m]);
  const groups = useMemo(() => evidenceByQuestion(graph), [graph]);
  const links = useMemo(() => flowLinks(graph), [graph]);
  const focus = useMapFocus();
  const [hover, setHover] = useState(null);
  const [selected, setSelectedState] = useState(graph.byId.has(mapView.selected) ? mapView.selected : 'plan');
  // A click takes over from the assistant: the clicked box's pathway stays lit until something else is chosen.
  const select = id => { mapView.selected = id; setSelectedState(id); if (focus) setMapFocus(null); };
  const [paths, setPaths] = useState([]);
  const flowRef = useRef(null);
  const nodeEls = useRef(new Map());
  const refFor = id => el => { if (el) nodeEls.current.set(id, el); else nodeEls.current.delete(id); };

  // Priority: what the pointer is on, then what the assistant is pointing at, then the selection.
  const active = useMemo(() => {
    if (hover) return lineage(graph, [hover]);
    if (focus) return lineage(graph, focus.ids);
    return lineage(graph, [selected]);
  }, [graph, hover, focus, selected]);
  const stateOf = id => [active.has(id) ? 'on' : 'dim', id === selected ? 'sel' : '', focus?.ids.includes(id) ? 'ask' : ''].filter(Boolean).join(' ');

  // Draw curved links between box edges; re-measure whenever the layout can change.
  useLayoutEffect(() => {
    const flow = flowRef.current;
    if (!flow) return;
    const measure = () => {
      const base = flow.getBoundingClientRect();
      setPaths(links.map(l => {
        const a = nodeEls.current.get(l.from)?.getBoundingClientRect(), b = nodeEls.current.get(l.to)?.getBoundingClientRect();
        if (!a || !b) return null;
        const x1 = a.right - base.left, y1 = a.top + a.height / 2 - base.top, x2 = b.left - base.left, y2 = b.top + b.height / 2 - base.top;
        const dx = Math.max(24, (x2 - x1) / 2);
        return { ...l, d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` };
      }).filter(Boolean));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(flow);
    return () => ro.disconnect();
  }, [links]);

  const column = type => graph.nodes.filter(nd => nd.type === type);
  const node = nd => <FlowNode key={nd.id} node={nd} state={stateOf(nd.id)} onHover={setHover} onSelect={select} nodeRef={refFor(nd.id)} />;
  const stageBody = {
    source: column('source').map(node),
    evidence: groups.map(({ question, evidence }) => (
      <div className="flow-group" key={question.id}>
        <button className={'flow-q ' + stateOf(question.id)} data-id={question.id} onClick={() => select(question.id)}
          onMouseEnter={() => setHover(question.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(question.id)} onBlur={() => setHover(null)}>{question.label}</button>
        {evidence.map(node)}
      </div>
    )),
    action: column('action').map(node),
    decision: column('decision').map(node),
  };

  return (
    <div className="stack">
      <Panel title="Evidence map" id="evidence-map">
        <Note>Read left to right: raw data feeds each piece of evidence, evidence supports an action, and the actions make up the July plan. Hover or tap a box to trace its line of evidence.</Note>
        {focus && (
          <div className="flow-focus" role="status">
            <span>Assistant is showing: <strong>{focus.label}</strong></span>
            <button onClick={() => setMapFocus(null)}>Clear</button>
          </div>
        )}
        <div className="flow-layout">
          <div className={'flow' + (hover || focus ? ' tracing' : '')} ref={flowRef}>
            <svg className="flow-links" aria-hidden="true">
              {paths.map(p => <path key={p.from + p.to} d={p.d} className={active.has(p.from) && active.has(p.to) ? 'on' : ''} />)}
            </svg>
            {STAGES.map(([type, title]) => (
              <div className={'flow-col c-' + type} key={type}>
                <h3 className="flow-head"><span className={'dot t-' + type} />{title}</h3>
                {stageBody[type]}
              </div>
            ))}
          </div>
          <aside className="flow-card card" id="map-card" aria-live="polite"><DetailCard key={selected} graph={graph} id={selected} onSelect={select} /></aside>
        </div>
        <details className="map-list">
          <summary>View as list</summary>
          {STAGES.map(([type, title]) => (
            <div key={type}>
              <h3>{title}</h3>
              <ul>{column(type).map(nd => <li key={nd.id}><strong>{nd.label}</strong>{nd.value ? ' · ' + nd.value : ''}{' — ' + nd.summary + ' '}<GoButton go={nd.go} label="Open" /></li>)}</ul>
            </div>
          ))}
        </details>
      </Panel>
    </div>
  );
}
