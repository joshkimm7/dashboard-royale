// Obsidian-style evidence map: a force-directed graph of the decisions, evidence, machines and data sources.
// React renders the SVG once; the simulation moves it through the DOM so frames never re-render the tree.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useModel } from '../modelContext.js';
import { useNav } from '../nav.jsx';
import { by, cash, n, pct, pp, sum } from '../lib/format.js';
import { Note, Panel } from '../components/ui.jsx';

const MAP_TYPES = [['decision', 'Decision', '#f5cc78'], ['action', 'Action', '#b9deb5'], ['question', 'Question', '#d5c3f0'],
  ['evidence', 'Evidence', '#f0a46b'], ['machine', 'Bottom-ten machine', '#ff8f87'], ['flag', 'Review flag', '#8fc3e8'], ['source', 'Data source', '#b5a69a']];
const MAP_COLOR = Object.fromEntries(MAP_TYPES.map(([t, , c]) => [t, c]));
const MAP_LABEL = Object.fromEntries(MAP_TYPES.map(([t, l]) => [t, l]));
const MAP_R = { decision: 15, action: 10, question: 9, evidence: 7.5, machine: 5.5, flag: 7, source: 7 };
const FLAG_LABELS = { 'Inspect hold': 'Payout flag', 'Quiet zone': 'Quiet placement', 'Short exposure': 'Short exposure', 'Low peer demand': 'Weak local demand', 'Downtime': 'Downtime flag' };
// Deterministic ring start so the layout looks the same on every visit.
const RING = { decision: 0, action: 95, question: 185, evidence: 150, machine: 270, flag: 225, source: 300 };
const MAJOR = ['decision', 'action', 'question'];

/** Session-level view state: survives leaving and returning to the tab. */
const mapView = { hidden: new Set(), selected: 'plan', pos: new Map(), t: null };

// Builds nodes and links from the same analysis objects the tabs use, so the map can't drift from them.
function buildEvidenceGraph(m) {
  const { reserve, inspect, inspectionCost, moveCases, peakThreshold, promoCost, quietCohort, payoutCohort, moveBreakEven, m1, m7,
    schedulingScore, auditRows, fullDays, promoHurdle, cohort, reviewAction, move, data } = m;
  const nodes = [], links = [];
  const add = (id, type, label, summary, value, go) => nodes.push({ id, type, label, summary, value: value ?? '', go: go ?? null });
  const link = (a, b) => links.push({ a, b });
  const staffing = schedulingScore('Peak', 10);
  const pairsGained = moveCases.filter(r => r.main.bankPct > 0).length;

  add('plan', 'decision', 'July plan', 'Cancel the blanket replacement, inspect one cabinet, and keep the rest in reserve.', cash(reserve) + ' reserve', { jump: 'action-summary' });

  add('act-inspect', 'action', 'Inspect M-1158', 'Its payout ran ' + cash(inspect.theo - inspect.win) + ' below what its settings imply.', cash(inspectionCost), { jump: 'inspection-plan' });
  add('act-move', 'action', 'Defer M-1181 move', 'Only ' + pairsGained + ' of ' + moveCases.length + ' past moves gained across both banks.', 'Defer', { jump: 'move-check' });
  add('act-staff', 'action', 'Flex staffing', 'Add coverage when forecast wagers reach ' + cash(peakThreshold) + '.', cash(peakThreshold), { jump: 'staffing-check' });
  add('act-promo', 'action', 'Promotion (conditional)', 'Pilot only with registrations above the break-even hurdle.', cash(promoCost), { jump: 'promotion-check' });
  add('act-reserve', 'action', 'Hold reserve', 'Keep unspent budget until other actions have stronger evidence.', cash(reserve), { jump: 'catalog-check' });
  for (const a of ['act-inspect', 'act-move', 'act-staff', 'act-promo', 'act-reserve']) link('plan', a);

  add('q1', 'question', 'Q1 · Machine audit', 'Why do the lowest earners earn so little?', '', { goto: 'audit' });
  add('q2', 'question', 'Q2/Q3 · Demand & uptime', 'How did demand and machine uptime change?', '', { goto: 'demand' });
  add('q4', 'question', 'Q4/Q5 · Guests & comps', 'Who plays, and what do comps cost?', '', { goto: 'guests' });
  add('qm', 'question', 'Model validation', 'Is the forecast good enough to staff from?', '', { goto: 'model' });
  add('q6', 'question', 'Q6 · July decision', 'What should July’s budget fund?', '', { goto: 'plan' });
  link('q6', 'plan');

  add('ev-verdicts', 'evidence', 'Bottom-ten verdicts', n(quietCohort.length) + ' of 10 lowest earners sit in quiet zones; ' + n(payoutCohort.length) + ' has a payout flag.', '', { jump: 'verdict-check' });
  add('ev-hold', 'evidence', 'Weekly payout check', 'M-1158’s week-by-week payout gap against same-configuration peers.', pp(inspect.res), { evidence: inspect.id, section: 'hold-check' });
  add('ev-moves', 'evidence', 'Past moves', 'What happened to cabinets and banks after four historical moves.', pairsGained + ' of ' + moveCases.length + ' pairs gained', { jump: 'move-check' });
  add('ev-move-econ', 'evidence', 'Relocation economics', 'Net July value of moving M-1181 under capture and displacement scenarios.', pct(moveBreakEven, 0) + ' break-even', { goto: 'plan/moves' });
  add('ev-holdout', 'evidence', 'Forecast holdout test', 'Weekday averages vs “same day last week” on 61 unseen days.', pct(1 - m1 / m7) + ' lower error', { goto: 'model/holdout' });
  add('ev-staffing', 'evidence', 'Staffing replay', 'Simulated May–June staffing calls from each forecast.', n(staffing.hits) + ' of ' + n(staffing.hits + staffing.missed) + ' peaks caught', { jump: 'staffing-check' });
  add('ev-demand', 'evidence', 'Demand trend', 'Monthly wagers alongside events, entrances and city visitors.', '', { goto: 'demand/trend' });
  add('ev-downtime', 'evidence', 'Downtime impact', 'Whether lost play from downtime explains the demand trend.', cash(sum(auditRows, r => r.lost) / fullDays) + '/day at risk', { goto: 'demand/downtime' });
  add('ev-events', 'evidence', 'Event days', 'Wagers on event days vs similar ordinary days.', n(data.events.length) + ' events', { goto: 'demand/events' });
  add('ev-promo', 'evidence', 'Promotion evidence', 'Lift from past promotions and the hurdle a July pilot must clear.', pct(promoHurdle, 1) + ' hurdle', { jump: 'promotion-check' });
  add('ev-players', 'evidence', 'Player concentration', 'How much of carded play and losses came from the top 1%.', '', { goto: 'guests/players' });
  add('ev-comps', 'evidence', 'Comps & loyalty', 'What comps cost relative to play, month by month.', '', { goto: 'guests/comps' });
  add('ev-catalog', 'evidence', 'Action catalog', 'Every priced action and why it was funded, deferred or passed.', n(data.actions.length) + ' actions', { jump: 'catalog-check' });

  for (const [a, list] of Object.entries({ 'act-inspect': ['ev-hold', 'ev-verdicts'], 'act-move': ['ev-moves', 'ev-move-econ'], 'act-staff': ['ev-staffing', 'ev-holdout'],
    'act-promo': ['ev-promo', 'ev-events'], 'act-reserve': ['ev-catalog'],
    q1: ['ev-verdicts', 'ev-hold'], q2: ['ev-demand', 'ev-downtime', 'ev-events'], q4: ['ev-players', 'ev-comps'], 'ev-comps': ['ev-catalog'], qm: ['ev-holdout', 'ev-staffing'], q6: ['ev-catalog', 'ev-move-econ', 'ev-promo'] }))
    for (const b of list) link(a, b);

  const flagsSeen = new Set();
  cohort.forEach((x, i) => {
    add('m-' + x.id, 'machine', x.id, 'Rank ' + (i + 1) + ' by house win · ' + reviewAction(x) + '.', cash(x.win), { evidence: x.id });
    link('m-' + x.id, 'ev-verdicts');
    for (const f of x.flags) { flagsSeen.add(f); link('m-' + x.id, 'flag-' + f); }
  });
  for (const f of flagsSeen) {
    const count = cohort.filter(x => x.flags.includes(f)).length;
    add('flag-' + f, 'flag', FLAG_LABELS[f] ?? f, n(count) + ' of ' + n(cohort.length) + ' bottom-ten cabinets carry this flag.', n(count) + ' of ' + n(cohort.length), { jump: 'verdict-check' });
  }
  link('act-inspect', 'm-' + inspect.id); link('act-move', 'm-' + move.id);

  add('src-meters', 'source', 'Machine-day meters', 'Daily wagers, payouts, hours and downtime for every cabinet.', n(data.daily.length) + ' machine-days');
  add('src-property', 'source', 'Property daily totals', 'Whole-floor wagers, traffic and forecasts by gaming day.', n(data.property.length) + ' days');
  add('src-players', 'source', 'Loyalty-card play', 'Carded wagers, results and comps by player and month.', n(data.players.length) + ' records');
  add('src-events', 'source', 'Event calendar', 'Listed events and holidays used to adjust comparisons.', n(data.events.length) + ' events');
  add('src-moves', 'source', 'Move history', 'Past cabinet relocations and their comparison groups.', n(data.moves.length) + ' moves');
  add('src-catalog', 'source', 'Action catalog', 'Costs and lead times for every July action.', n(data.actions.length) + ' actions');
  add('src-city', 'source', 'LVCVA visitation', 'Monthly Las Vegas visitor counts for market context.', n(data.city.length) + ' months');
  for (const [a, list] of Object.entries({ 'src-meters': ['ev-verdicts', 'ev-hold', 'ev-downtime', 'ev-moves', 'ev-demand'], 'src-property': ['ev-demand', 'ev-holdout', 'ev-staffing', 'ev-events'],
    'src-players': ['ev-players', 'ev-comps'], 'src-events': ['ev-events', 'ev-holdout', 'ev-promo'], 'src-moves': ['ev-moves'], 'src-catalog': ['ev-catalog', 'ev-move-econ'], 'src-city': ['ev-demand'] }))
    for (const b of list) link(a, b);

  const byId = new Map(nodes.map(nd => [nd.id, nd]));
  for (const nd of nodes) nd.nb = new Set();
  const valid = links.filter(l => byId.has(l.a) && byId.has(l.b));
  for (const l of valid) { byId.get(l.a).nb.add(l.b); byId.get(l.b).nb.add(l.a); }
  for (const nd of nodes) nd.r = MAP_R[nd.type] + Math.min(4, nd.nb.size * .35);
  return { nodes, links: valid, byId };
}

/** The original mapGoButton: a data-jump, data-evidence(+data-section) or data-goto button. */
function GoButton({ go, label }) {
  const nav = useNav();
  if (!go) return null;
  if (go.jump) return <button data-jump={go.jump} onClick={() => nav.jump(go.jump)}>{label}</button>;
  if (go.evidence) return <button data-evidence={go.evidence} data-section={go.section || undefined} onClick={() => nav.openEvidence(go.evidence, go.section || undefined)}>{label}</button>;
  return <button data-goto={go.goto} onClick={() => nav.goto(go.goto)}>{label}</button>;
}

function MapCard({ graph, id, hidden, onSelect }) {
  const nd = graph.byId.get(id);
  if (!nd) return <Note>Select a dot to see what it is.</Note>;
  const chips = [...nd.nb].map(o => graph.byId.get(o)).filter(o => !hidden.has(o.type));
  return (
    <>
      <span className="eyebrow" style={{ color: MAP_COLOR[nd.type] }}>{MAP_LABEL[nd.type]}</span>
      <h3>{nd.label}</h3>
      {nd.value ? <strong className="metric">{nd.value}</strong> : null}
      <p>{nd.summary}</p>
      {nd.go ? <GoButton go={nd.go} label={nd.type === 'source' ? 'Open' : 'Open evidence →'} /> : <p className="muted">Raw data feeding the evidence below.</p>}
      {chips.length ? (
        <>
          <p className="muted map-conn">Connected to</p>
          <div className="map-chips">
            {chips.map(o => (
              <button key={o.id} data-mapselect={o.id} onClick={() => onSelect(o.id)}>
                <span className="dot" style={{ background: MAP_COLOR[o.type] }} />{o.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

export default function EvidenceMap() {
  const model = useModel();
  const graph = useMemo(() => buildEvidenceGraph(model), [model]);
  if (!graph.byId.has(mapView.selected)) mapView.selected = 'plan';
  const [selected, setSelected] = useState(mapView.selected);
  const [hidden, setHidden] = useState(() => new Set(mapView.hidden));
  const svgRef = useRef(null), worldRef = useRef(null), edgesRef = useRef(null), nodesRef = useRef(null);
  // Imperative handles installed by the simulation effect (select, fit, zoom, applyHidden).
  const api = useRef(null);

  const select = id => api.current?.select(id);
  const toggleType = t => {
    if (mapView.hidden.has(t)) mapView.hidden.delete(t); else mapView.hidden.add(t);
    setHidden(new Set(mapView.hidden));
    api.current?.applyHidden();
  };

  useLayoutEffect(() => {
    const svg = svgRef.current, world = worldRef.current;
    let cancelled = false, raf = 0;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = svg.clientWidth, H = svg.clientHeight;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    // Simulation copies, so the memoised graph is never mutated.
    const nodes = graph.nodes.map(nd => ({ id: nd.id, type: nd.type, nb: nd.nb, r: nd.r }));
    const byId = new Map(nodes.map(nd => [nd.id, nd]));
    const fresh = nodes.some(nd => !mapView.pos.has(nd.id));
    for (const [type, list] of by(nodes, nd => nd.type)) list.forEach((nd, i) => {
      const saved = mapView.pos.get(nd.id);
      const angle = 2 * Math.PI * i / list.length + Object.keys(RING).indexOf(type) * .7;
      nd.x = saved?.x ?? Math.cos(angle) * RING[type]; nd.y = saved?.y ?? Math.sin(angle) * RING[type];
      nd.vx = 0; nd.vy = 0; nd.fixed = false;
    });
    const L = graph.links.map(l => ({ s: byId.get(l.a), t: byId.get(l.b) }));
    for (const l of L) l.d = l.s.type === 'machine' && l.t.type === 'flag' ? 42 : l.s.type === 'source' ? 85 : 62;
    const edgeEls = [...edgesRef.current.children];
    const nodeEls = new Map([...nodesRef.current.children].map(g => [g.dataset.id, g]));
    let alpha = fresh ? 1 : .06, alphaTarget = 0, running = false, dragging = null;
    const savePositions = () => { for (const nd of nodes) mapView.pos.set(nd.id, { x: nd.x, y: nd.y }); };

    function tick() {
      alpha += (alphaTarget - alpha) * .03;
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]; let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = (i - j) * .1 || .1; dy = .1; d2 = dx * dx + dy * dy; }
        const f = -260 * alpha / d2; a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
        const min = a.r + b.r + 8, d = Math.sqrt(d2);
        if (d < min) { const p = (min - d) / d * .25; a.x -= dx * p; a.y -= dy * p; b.x += dx * p; b.y += dy * p; }
      }
      for (const l of L) {
        const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, d = Math.sqrt(dx * dx + dy * dy) || 1, k = (d - l.d) / d * alpha * .35;
        l.t.vx -= dx * k; l.t.vy -= dy * k; l.s.vx += dx * k; l.s.vy += dy * k;
      }
      for (const nd of nodes) {
        nd.vx -= nd.x * .02 * alpha; nd.vy -= nd.y * .02 * alpha;
        if (nd.fixed) { nd.x = nd.fx; nd.y = nd.fy; nd.vx = nd.vy = 0; continue; }
        nd.vx *= .6; nd.vy *= .6; nd.x += nd.vx; nd.y += nd.vy;
      }
    }
    function paint() {
      L.forEach((l, i) => { const e = edgeEls[i]; e.setAttribute('x1', l.s.x); e.setAttribute('y1', l.s.y); e.setAttribute('x2', l.t.x); e.setAttribute('y2', l.t.y); });
      for (const nd of nodes) nodeEls.get(nd.id).setAttribute('transform', 'translate(' + nd.x.toFixed(1) + ',' + nd.y.toFixed(1) + ')');
    }
    let view = mapView.t ?? { k: 1, x: W / 2, y: H / 2 };
    function applyView() {
      world.setAttribute('transform', 'translate(' + view.x + ',' + view.y + ') scale(' + view.k + ')');
      svg.classList.toggle('zoomed', view.k > 1.3); mapView.t = view;
    }
    function fit() {
      const shown = nodes.filter(nd => !mapView.hidden.has(nd.type)); if (!shown.length) return;
      const xs = shown.map(nd => nd.x), ys = shown.map(nd => nd.y);
      const x0 = Math.min(...xs) - 40, x1 = Math.max(...xs) + 40, y0 = Math.min(...ys) - 30, y1 = Math.max(...ys) + 40;
      const k = Math.min(2, W / (x1 - x0), H / (y1 - y0)); view = { k, x: W / 2 - k * (x0 + x1) / 2, y: H / 2 - k * (y0 + y1) / 2 }; applyView();
    }
    function frame() {
      if (cancelled) { running = false; return; }
      tick(); paint();
      if (alpha > .004 || dragging) raf = requestAnimationFrame(frame);
      else { running = false; savePositions(); }
    }
    function heat(a) { alpha = Math.max(alpha, a); if (!running && !reduce) { running = true; raf = requestAnimationFrame(frame); } }
    // Pre-settle off screen so the graph opens composed, then let it breathe into place.
    if (fresh) { for (let i = 0; i < (reduce ? 400 : 300); i++) tick(); }
    if (reduce) { while (alpha > .004) tick(); savePositions(); }
    paint();
    if (fresh || !mapView.t) fit(); else applyView();
    if (!reduce && fresh) { alpha = .12; heat(.12); }

    function highlight(id) {
      const nd = id && byId.get(id);
      svg.classList.toggle('hl', !!nd);
      for (const [nid, g] of nodeEls) g.classList.toggle('on', !!nd && (nid === id || nd.nb.has(nid)));
      L.forEach((l, i) => edgeEls[i].classList.toggle('on', !!nd && (l.s === nd || l.t === nd)));
    }
    function applyHidden() {
      for (const [nid, g] of nodeEls) g.classList.toggle('off', mapView.hidden.has(byId.get(nid).type));
      L.forEach((l, i) => edgeEls[i].classList.toggle('off', mapView.hidden.has(l.s.type) || mapView.hidden.has(l.t.type)));
    }
    const markSelected = id => { for (const [nid, g] of nodeEls) g.classList.toggle('sel', nid === id); };
    function selectNode(id) {
      mapView.selected = id;
      markSelected(id);
      setSelected(id);
      highlight(id);
    }
    markSelected(mapView.selected);
    applyHidden();
    const toWorld = (cx, cy) => { const r = svg.getBoundingClientRect(); return [(cx - r.left - view.x) / view.k, (cy - r.top - view.y) / view.k]; };
    const zoomAt = (factor, cx, cy) => { const k = Math.max(.35, Math.min(4, view.k * factor)); view = { k, x: cx - (cx - view.x) * k / view.k, y: cy - (cy - view.y) * k / view.k }; applyView(); };

    let pan = null, start = null, moved = false;
    const onDown = e => {
      const g = e.target.closest('.node'); start = [e.clientX, e.clientY]; moved = false; svg.setPointerCapture(e.pointerId);
      if (g) { dragging = byId.get(g.dataset.id); [dragging.fx, dragging.fy] = toWorld(e.clientX, e.clientY); dragging.fixed = true; alphaTarget = .2; heat(.2); }
      else { pan = { x: view.x, y: view.y }; svg.classList.add('panning'); }
    };
    const onMove = e => {
      if (!start) return;
      if (Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 4) moved = true;
      if (dragging) { [dragging.fx, dragging.fy] = toWorld(e.clientX, e.clientY); if (reduce) { tick(); paint(); } }
      else if (pan) { view = { ...view, x: pan.x + e.clientX - start[0], y: pan.y + e.clientY - start[1] }; applyView(); }
    };
    const onEnd = () => {
      if (dragging) { dragging.fixed = false; alphaTarget = 0; if (!moved) selectNode(dragging.id); else savePositions(); dragging = null; }
      pan = null; start = null; svg.classList.remove('panning');
    };
    const onWheel = e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * .0015), e.clientX - r.left, e.clientY - r.top); };
    const onOver = e => { const g = e.target.closest('.node'); if (g && !dragging) highlight(g.dataset.id); };
    const onOut = e => { const g = e.target.closest('.node'); if (g && !dragging && !g.contains(e.relatedTarget)) highlight(null); };
    const onFocusIn = e => { const g = e.target.closest('.node'); if (g) highlight(g.dataset.id); };
    const onFocusOut = () => highlight(null);
    const onKey = e => { const g = e.target.closest('.node'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectNode(g.dataset.id); } };
    const listeners = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onEnd], ['pointercancel', onEnd], ['wheel', onWheel, { passive: false }],
      ['pointerover', onOver], ['pointerout', onOut], ['focusin', onFocusIn], ['focusout', onFocusOut], ['keydown', onKey]];
    for (const [type, fn, opts] of listeners) svg.addEventListener(type, fn, opts);
    highlight(null);

    const ro = new ResizeObserver(() => {
      const w = svg.clientWidth, h = svg.clientHeight; if (!w || (w === W && h === H)) return;
      view = { ...view, x: view.x + (w - W) / 2, y: view.y + (h - H) / 2 }; W = w; H = h; svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); applyView();
    });
    ro.observe(svg);

    api.current = {
      select: selectNode,
      applyHidden,
      fit,
      zoom: dir => zoomAt(dir === 'in' ? 1.3 : 1 / 1.3, W / 2, H / 2),
    };
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      for (const [type, fn, opts] of listeners) svg.removeEventListener(type, fn, opts);
      api.current = null;
    };
  }, [graph]);

  return (
    <div className="stack">
      <Panel title="Evidence map" id="evidence-map">
        <Note>Each dot is a decision, piece of evidence, machine or data source; lines show what supports what. Hover or tap a dot to trace its links and open its evidence. Drag to rearrange; scroll or use + / − to zoom.</Note>
        <div className="map-legend" role="group" aria-label="Show or hide dot types">
          {MAP_TYPES.map(([t, l, c]) => (
            <button key={t} data-maptype={t} aria-pressed={!hidden.has(t)} onClick={() => toggleType(t)}>
              <span className="dot" style={{ background: c }} />{l}
            </button>
          ))}
        </div>
        <div className="map-layout">
          <div className="map-stage">
            <svg id="map-svg" className="map-svg" ref={svgRef} role="img" aria-label="Network graph of the dashboard’s decisions, evidence, machines and data sources. Use the list view below for an accessible version.">
              <g id="map-world" ref={worldRef}>
                <g id="map-edges" ref={edgesRef}>
                  {graph.links.map((l, i) => <line key={i} className="edge" />)}
                </g>
                <g id="map-nodes" ref={nodesRef}>
                  {graph.nodes.map(nd => (
                    // className stays constant so React never clobbers the sel/on/off classes the simulation toggles.
                    <g key={nd.id} className="node" data-id={nd.id} tabIndex={0} role="button" aria-label={MAP_LABEL[nd.type] + ': ' + nd.label}>
                      <circle r={nd.r} fill={MAP_COLOR[nd.type]} />
                      <text y={nd.r + 13} className={MAJOR.includes(nd.type) ? 'major' : 'minor'}>{nd.label}</text>
                    </g>
                  ))}
                </g>
              </g>
            </svg>
            <div className="map-toolbar">
              <button data-mapzoom="in" aria-label="Zoom in" onClick={() => api.current?.zoom('in')}>+</button>
              <button data-mapzoom="out" aria-label="Zoom out" onClick={() => api.current?.zoom('out')}>−</button>
              <button data-mapzoom="fit" aria-label="Fit graph to view" onClick={() => api.current?.fit()}>⤢</button>
            </div>
          </div>
          <aside className="map-card card" id="map-card" aria-live="polite">
            {/* Keyed by selection so each pick replaces the card, as the original's innerHTML swap did. */}
            <MapCard key={selected} graph={graph} id={selected} hidden={hidden} onSelect={select} />
          </aside>
        </div>
        <details className="map-list">
          <summary>View as list</summary>
          {MAP_TYPES.map(([t, l]) => [
            <h3 key={t + '-h'}>{l}</h3>,
            <ul key={t}>
              {graph.nodes.filter(nd => nd.type === t).map(nd => (
                <li key={nd.id}>
                  <strong>{nd.label}</strong>{(nd.value ? ' · ' + nd.value : '') + ' — ' + nd.summary + ' '}<GoButton go={nd.go} label="Open" />
                </li>
              ))}
            </ul>,
          ])}
        </details>
      </Panel>
    </div>
  );
}
