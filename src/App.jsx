import { useLayoutEffect, useRef } from 'react';
import { ModelContext } from './modelContext.js';
import { NavProvider, TABS, useNav } from './nav.jsx';
import { months } from './lib/format.js';
import Overview from './tabs/Overview.jsx';
import EvidenceMap from './tabs/EvidenceMap.jsx';
import Audit from './tabs/Audit.jsx';
import Demand from './tabs/Demand.jsx';
import Guests from './tabs/Guests.jsx';
import Model from './tabs/Model.jsx';
import Plan from './tabs/Plan.jsx';

const VIEWS = { overview: () => null, map: EvidenceMap, audit: Audit, demand: Demand, guests: Guests, model: Model, plan: Plan };

export default function App({ model }) {
  return (
    <ModelContext.Provider value={model}>
      <NavProvider model={model}>
        <Shell model={model} />
      </NavProvider>
    </ModelContext.Provider>
  );
}

function Shell({ model }) {
  const nav = useNav();
  const { state } = nav;
  const scope = model.scope(state);
  const View = VIEWS[state.tab];
  const viewRef = useRef(null), heroRef = useRef(null), lastViewKey = useRef(null);

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

  const fixed = ['model', 'plan'].includes(state.tab);
  const bankAllowed = ['audit', 'demand'].includes(state.tab);
  const scopeText = (fixed ? 'Fixed evidence window' : scope.dates[0] + ' – ' + scope.dates.at(-1)) + ' · ' + (state.bank && bankAllowed ? state.bank : 'Property scope');
  const monthOptions = months.map((m, i) => <option key={i} value={i}>{m + ' 2025'}</option>);

  return (
    <>
      <a className="skip" href="#main">Skip to dashboard</a>
      <header><div className="wrap brand"><strong><span className="mark" aria-hidden="true">♦</span>The Gilded Ace</strong><span className="sub">Dashboard Royale / Las Vegas, NV</span></div></header>
      <main className="wrap" id="main">
        <nav className="nav" aria-label="Dashboard sections">
          {TABS.map(([tab, label]) => <button key={tab} data-tab={tab} aria-pressed={state.tab === tab} onClick={() => nav.setTab(tab)}>{label}</button>)}
        </nav>
        <Overview heroRef={heroRef} hidden={state.tab !== 'overview'} />
        <div className={'dashboard-tools' + (fixed ? ' fixed' : '')} id="tools" hidden={state.tab === 'overview' || state.tab === 'map'}>
          <div className="filters" aria-label="Analysis filters">
            <label data-filter="period" hidden={fixed}>From month<select id="from" value={state.from} disabled={fixed} onChange={e => nav.setFilter('from', e.target.value)}>{monthOptions}</select></label>
            <label data-filter="period" hidden={fixed}>Through month<select id="through" value={state.to} disabled={fixed} onChange={e => nav.setFilter('through', e.target.value)}>{monthOptions}</select></label>
            <label data-filter="bank" hidden={!bankAllowed}>Bank<select id="bank" value={state.bank} disabled={!bankAllowed} onChange={e => nav.setFilter('bank', e.target.value)}>
              <option value="">All banks</option>
              {model.zoneBanks.map(r => <option key={r[0]} value={r[0]}>{r[0] + ' · ' + model.zones[r[2]]}</option>)}
            </select></label>
            <button id="reset" hidden={fixed} onClick={nav.reset}>Reset filters</button>
            <span className="scope" id="scope" role="status">{scopeText}</span>
          </div>
        </div>
        <div id="view" ref={viewRef}><View scope={scope} /></div>
        <footer>The Gilded Ace is a fictional casino · Synthetic property and player data · <a href="https://github.com/tamu-datathon-org/dashboard-royale">Official challenge data and guide</a> · <span id="revision">{'Data revision ' + model.data.revision.slice(0, 7)}</span></footer>
      </main>
    </>
  );
}

