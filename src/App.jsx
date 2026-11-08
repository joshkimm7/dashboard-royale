import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ModelContext } from './modelContext.js';
import { NavProvider, PERIOD_PRESETS, useNav } from './nav.jsx';
import { months } from './lib/format.js';
import { ICONS } from './components/Icons.jsx';
import Overview from './tabs/Overview.jsx';
import EvidenceMap from './tabs/EvidenceMap.jsx';
import Audit from './tabs/Audit.jsx';
import Demand from './tabs/Demand.jsx';
import Guests from './tabs/Guests.jsx';
import Model from './tabs/Model.jsx';
import Plan from './tabs/Plan.jsx';
import Claims from './tabs/Claims.jsx';
import Assistant from './assistant/Assistant.jsx';
import { requestAssistant } from './assistant/focus.js';

const VIEWS = { overview: () => null, map: EvidenceMap, audit: Audit, demand: Demand, guests: Guests, model: Model, plan: Plan, claims: Claims };
/** Sidebar sections, in the order the review is read. Labels match the original tab names. */
const SECTIONS = [
  ['General', [['overview', 'Overview'], ['map', 'Evidence map']]],
  ['Analysis', [['audit', 'Q1 · Machine audit'], ['demand', 'Q2/Q3 · Demand & uptime'], ['guests', 'Q4/Q5 · Guests & comps'], ['model', 'Model validation']]],
  ['Decision', [['plan', 'Q6 · July decision'], ['claims', 'Claims & evidence']]],
];
const PAGES = {
  overview: ['Overview', 'July 2025 recommendation for the slot floor'],
  map: ['Evidence map', 'How the data, evidence and actions connect'],
  audit: ['Machine audit', 'Q1 · Why do the lowest earners earn so little?'],
  demand: ['Demand & uptime', 'Q2/Q3 · How did demand and machine uptime change?'],
  guests: ['Guests & comps', 'Q4/Q5 · Who plays, and what do comps cost?'],
  model: ['Model validation', 'Is the forecast good enough to staff from?'],
  plan: ['July decision', 'Q6 · What should July’s budget fund?'],
  claims: ['Claims & evidence', 'Every claim, its calculation, result and limitation, linked to its evidence'],
};
/** Pages whose figures are fixed to the full period, and why (shown under the disabled period control). */
const FIXED_REASON = {
  overview: 'Overview figures use the full January–June period.',
  map: 'The evidence map summarizes full-period findings.',
  model: 'The forecast learns from Jan–Apr and is scored on May–Jun, so its window is fixed.',
  plan: 'The July plan rests on the full January–June audit.',
  claims: 'Claims quote full-period figures from the appendix.',
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
  const badges = { audit: String(model.payoutCohort.length) };
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
                {badges[tab] && <span className="side-badge" aria-hidden="true">{badges[tab]}</span>}
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

  // Printing opens every collapsed section, then restores the ones that were closed.
  useEffect(() => {
    let opened = [];
    const before = () => { opened = [...document.querySelectorAll('details:not([open])')]; for (const d of opened) d.open = true; };
    const after = () => { for (const d of opened) d.open = false; opened = []; };
    addEventListener('beforeprint', before);
    addEventListener('afterprint', after);
    return () => { removeEventListener('beforeprint', before); removeEventListener('afterprint', after); };
  }, []);

  const toggleCollapsed = () => setCollapsed(c => { try { localStorage.setItem('sidebar-collapsed', c ? '0' : '1'); } catch { /* storage unavailable */ } return !c; });
  const fixed = Boolean(FIXED_REASON[state.tab]);
  const bankAllowed = ['audit', 'demand'].includes(state.tab);
  const from = fixed ? 0 : state.from, to = fixed ? 5 : state.to;
  const place = bankAllowed && state.bank ? state.bank + ' · ' + model.zones[model.bankZone[state.bank]] : bankAllowed && state.zone ? model.zones[state.zone] : 'Property scope';
  const scopeText = (fixed ? 'Jan 1 – Jun 30 · full period' : scope.dates[0] + ' – ' + scope.dates.at(-1)) + ' · ' + place;
  const monthOptions = months.map((m, i) => <option key={i} value={i}>{m + ' 2025'}</option>);
  const bankOptions = model.zoneBanks.filter(r => !state.zone || r[2] === state.zone);
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
            <div className={'dashboard-tools' + (fixed ? ' fixed' : '')} id="tools">
              <div className="filters" aria-label="Analysis filters">
                <label data-filter="period">From month<select id="from" value={from} disabled={fixed} aria-describedby={fixed ? 'period-reason' : undefined} onChange={e => nav.setFilter('from', e.target.value)}>{monthOptions}</select></label>
                <label data-filter="period">Through month<select id="through" value={to} disabled={fixed} aria-describedby={fixed ? 'period-reason' : undefined} onChange={e => nav.setFilter('through', e.target.value)}>{monthOptions}</select></label>
                {fixed ? null : (
                  <div className="presets" role="group" aria-label="Quick period">
                    {PERIOD_PRESETS.map(([label, a, b]) => (
                      <button key={label} data-preset={label} aria-pressed={state.from === a && state.to === b} onClick={() => nav.setPeriod(a, b)}>{label}</button>
                    ))}
                  </div>
                )}
                <label data-filter="zone" hidden={!bankAllowed}>Zone<select id="zone" value={state.zone} disabled={!bankAllowed} onChange={e => nav.setFilter('zone', e.target.value)}>
                  <option value="">All zones</option>
                  {Object.entries(model.zones).sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select></label>
                <label data-filter="bank" hidden={!bankAllowed}>Bank<select id="bank" value={state.bank} disabled={!bankAllowed} onChange={e => nav.setFilter('bank', e.target.value)}>
                  <option value="">{state.zone ? 'All banks in zone' : 'All banks'}</option>
                  {bankOptions.map(r => <option key={r[0]} value={r[0]}>{r[0] + ' · ' + model.zones[r[2]]}</option>)}
                </select></label>
                <button id="reset" hidden={fixed} onClick={nav.reset}>{ICONS.reset}Reset filters</button>
                <span className="scope" id="scope" role="status">{ICONS.calendar}{scopeText}</span>
              </div>
              {fixed ? (
                <p className="period-reason" id="period-reason">
                  <span>{FIXED_REASON[state.tab]}</span>
                  <button className="link-button" data-goto="audit" onClick={() => nav.goto('audit')}>Change the period in Machine audit →</button>
                </p>
              ) : null}
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
