import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ModelContext } from './modelContext.js';
import { NavProvider, useNav } from './nav.jsx';
import { months } from './lib/format.js';
import { ICONS } from './components/Icons.jsx';
import Overview from './tabs/Overview.jsx';
import EvidenceMap from './tabs/EvidenceMap.jsx';
import Audit from './tabs/Audit.jsx';
import Demand from './tabs/Demand.jsx';
import Guests from './tabs/Guests.jsx';
import Model from './tabs/Model.jsx';
import Plan from './tabs/Plan.jsx';
import Assistant from './assistant/Assistant.jsx';
import { requestAssistant } from './assistant/focus.js';

const VIEWS = { overview: () => null, map: EvidenceMap, audit: Audit, demand: Demand, guests: Guests, model: Model, plan: Plan };
/** Sidebar sections, in the order the review is read. Labels match the original tab names. */
const SECTIONS = [
  ['General', [['overview', 'Overview'], ['map', 'Evidence map']]],
  ['Analysis', [['audit', 'Q1 · Machine audit'], ['demand', 'Q2/Q3 · Demand & uptime'], ['guests', 'Q4/Q5 · Guests & comps'], ['model', 'Model validation']]],
  ['Decision', [['plan', 'Q6 · July decision']]],
];
const PAGES = {
  overview: ['Overview', 'July 2025 recommendation for the slot floor'],
  map: ['Evidence map', 'How the data, evidence and actions connect'],
  audit: ['Machine audit', 'Q1 · Why do the lowest earners earn so little?'],
  demand: ['Demand & uptime', 'Q2/Q3 · How did demand and machine uptime change?'],
  guests: ['Guests & comps', 'Q4/Q5 · Who plays, and what do comps cost?'],
  model: ['Model validation', 'Is the forecast good enough to staff from?'],
  plan: ['July decision', 'Q6 · What should July’s budget fund?'],
};

const readCollapsed = () => { try { return localStorage.getItem('sidebar-collapsed') === '1'; } catch { return false; } };

export default function App({ model }) {
  return (
    <ModelContext.Provider value={model}>
      <NavProvider model={model}>
        <Shell model={model} />
      </NavProvider>
    </ModelContext.Provider>
  );
}

function Sidebar({ model, collapsed, onCollapse, onNavigate }) {
  const nav = useNav();
  const badges = { map: 'NEW', audit: String(model.payoutCohort.length) };
  return (
    <aside className="sidebar" aria-label="Dashboard navigation">
      <div className="side-brand">
        <span className="mark" aria-hidden="true">♦</span>
        <strong>The Gilded Ace</strong>
        <button className="side-collapse" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={collapsed} onClick={onCollapse}>{ICONS.collapse}</button>
      </div>
      <nav className="nav side-nav" aria-label="Dashboard sections">
        {SECTIONS.map(([title, tabs]) => (
          <div className="side-section" key={title}>
            <p className="side-title">{title}</p>
            {tabs.map(([tab, label]) => (
              <button key={tab} data-tab={tab} aria-pressed={nav.state.tab === tab} title={collapsed ? label : undefined}
                onClick={() => { nav.setTab(tab); onNavigate(); }}>
                {ICONS[tab]}<span className="side-label">{label}</span>
                {badges[tab] && <span className={'side-badge' + (tab === 'map' ? ' new' : '')} aria-hidden="true">{badges[tab]}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="side-foot">
        <div className="side-team">
          <span className="mark" aria-hidden="true">♦</span>
          <div className="side-label"><small>Floor review</small><strong>July 2025 plan</strong></div>
        </div>
        <button className="side-ask" onClick={() => { requestAssistant(); onNavigate(); }}>{ICONS.spark}<span className="side-label">Ask the floor assistant</span></button>
        <p className="side-credit side-label">The Gilded Ace is a fictional casino · Synthetic property and player data · <a href="https://github.com/tamu-datathon-org/dashboard-royale">Official challenge data and guide</a> · <span id="revision">{'Data revision ' + model.data.revision.slice(0, 7)}</span></p>
      </div>
    </aside>
  );
}

function Shell({ model }) {
  const nav = useNav();
  const { state } = nav;
  const scope = model.scope(state);
  const View = VIEWS[state.tab];
  const viewRef = useRef(null), heroRef = useRef(null), lastViewKey = useRef(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);

  // Replays the entrance animation on a new tab/sub-tab, or a light fade when filters redraw the same view.
  useLayoutEffect(() => {
    const viewKey = state.tab + '/' + state.sub;
    const kind = viewKey !== lastViewKey.current ? 'enter' : 'refresh';
    const targets = [viewRef.current];
    if (kind === 'enter' && state.tab === 'overview') targets.push(heroRef.current);
    for (const el of [viewRef.current, heroRef.current]) el?.classList.remove('enter', 'refresh');
    if (lastViewKey.current !== null) {
      void viewRef.current.offsetWidth;
      for (const el of targets) el?.classList.add(kind);
    }
    lastViewKey.current = viewKey;
  }, [state]);

  // "/" focuses the search box, like most dashboards.
  useEffect(() => {
    const onKey = e => {
      if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Escape') setDrawer(false);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const toggleCollapsed = () => setCollapsed(c => { try { localStorage.setItem('sidebar-collapsed', c ? '0' : '1'); } catch { /* storage unavailable */ } return !c; });
  const fixed = ['model', 'plan'].includes(state.tab);
  const bankAllowed = ['audit', 'demand'].includes(state.tab);
  const scopeText = (fixed ? 'Fixed evidence window' : scope.dates[0] + ' – ' + scope.dates.at(-1)) + ' · ' + (state.bank && bankAllowed ? state.bank : 'Property scope');
  const monthOptions = months.map((m, i) => <option key={i} value={i}>{m + ' 2025'}</option>);
  const [title, subtitle] = PAGES[state.tab];

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '') + (drawer ? ' drawer-open' : '')}>
      <a className="skip" href="#main">Skip to dashboard</a>
      <Sidebar model={model} collapsed={collapsed} onCollapse={toggleCollapsed} onNavigate={() => setDrawer(false)} />
      <div className="scrim" onClick={() => setDrawer(false)} aria-hidden="true" />
      <div className="app-main">
        <header className="topbar">
          <button className="menu-btn" aria-label="Open navigation" aria-expanded={drawer} onClick={() => setDrawer(true)}>{ICONS.menu}</button>
          <form className="search" role="search" onSubmit={e => { e.preventDefault(); requestAssistant(query); setQuery(''); }}>
            {ICONS.search}
            <input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Ask about a tab, machine or action…" aria-label="Ask the floor assistant" />
            <kbd aria-hidden="true">/</kbd>
          </form>
          <div className="topbar-right">
            <span className="topbar-pill">Dashboard Royale</span>
            <div className="who">
              <span className="avatar" aria-hidden="true">♦</span>
              <div><strong>Floor review</strong><small>Las Vegas, NV</small></div>
            </div>
          </div>
        </header>
        <main id="main" className="content">
          <div className="page-head">
            <div>
              <h1 className="page-title">{title}</h1>
              <p className="page-sub">{subtitle}</p>
            </div>
            <div className={'dashboard-tools' + (fixed ? ' fixed' : '')} id="tools" hidden={state.tab === 'overview' || state.tab === 'map'}>
              <div className="filters" aria-label="Analysis filters">
                <label data-filter="period" hidden={fixed}>From month<select id="from" value={state.from} disabled={fixed} onChange={e => nav.setFilter('from', e.target.value)}>{monthOptions}</select></label>
                <label data-filter="period" hidden={fixed}>Through month<select id="through" value={state.to} disabled={fixed} onChange={e => nav.setFilter('through', e.target.value)}>{monthOptions}</select></label>
                <label data-filter="bank" hidden={!bankAllowed}>Bank<select id="bank" value={state.bank} disabled={!bankAllowed} onChange={e => nav.setFilter('bank', e.target.value)}>
                  <option value="">All banks</option>
                  {model.zoneBanks.map(r => <option key={r[0]} value={r[0]}>{r[0] + ' · ' + model.zones[r[2]]}</option>)}
                </select></label>
                <button id="reset" hidden={fixed} onClick={nav.reset}>{ICONS.reset}Reset filters</button>
                <span className="scope" id="scope" role="status">{ICONS.calendar}{scopeText}</span>
              </div>
            </div>
          </div>
          <Overview heroRef={heroRef} hidden={state.tab !== 'overview'} />
          <div id="view" ref={viewRef}><View scope={scope} /></div>
        </main>
      </div>
      <Assistant />
    </div>
  );
}
