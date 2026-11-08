// View state, URL-hash sync and navigation actions (tab/sub-tab switches, evidence jumps, filters).
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CLAIM_IDS } from './lib/claims.js';
import { SENSITIVITY } from './lib/plan.js';

export const SUBTABS = {
  overview: [],
  map: [],
  audit: [['verdicts', 'Bottom-ten verdicts'], ['adjusted', 'Adjusted ranking'], ['machine', 'Machine file & floor map'], ['method', 'How to read the audit']],
  demand: [['trend', 'Demand trend'], ['zones', 'Zones & context'], ['downtime', 'Downtime impact'], ['repairs', 'Repairs & tickets'], ['response', 'Response times'], ['events', 'Event days']],
  guests: [['players', 'Player concentration'], ['comps', 'Comps & loyalty']],
  model: [['holdout', 'Holdout test'], ['staffing', 'Staffing calls'], ['july', 'July forecast']],
  plan: [['summary', 'Action summary'], ['inspection', 'Inspect & defer'], ['moves', 'Past moves'], ['promotion', 'Promotion'], ['catalog', 'Full catalog'], ['builder', 'Build your own plan']],
  claims: [],
};
export const TABS = [['overview', 'Overview'], ['map', 'Evidence map'], ['audit', 'Q1 · Machine audit'], ['demand', 'Q2/Q3 · Demand & uptime'],
  ['guests', 'Q4/Q5 · Guests & comps'], ['model', 'Model validation'], ['plan', 'Q6 · July decision'], ['claims', 'Claims & evidence']];
/** Evidence sections reachable by deep link, and the tab/sub-tab that renders each. */
export const SECTION_SUB = {
  'verdict-check': ['audit', 'verdicts'], 'adjusted-check': ['audit', 'adjusted'], 'funnel-check': ['audit', 'adjusted'], 'config-check': ['audit', 'adjusted'], 'hit-check': ['audit', 'adjusted'],
  'machine-check': ['audit', 'machine'], 'hold-check': ['audit', 'machine'],
  'staffing-check': ['model', 'staffing'], 'action-summary': ['plan', 'summary'], 'inspection-plan': ['plan', 'inspection'],
  'move-check': ['plan', 'moves'], 'promotion-check': ['plan', 'promotion'], 'catalog-check': ['plan', 'catalog'], 'plan-builder': ['plan', 'builder'], 'budget-ledger': ['plan', 'summary'],
  'players-check': ['guests', 'players'], 'zones-check': ['demand', 'zones'], 'response-check': ['demand', 'response'], 'comp-break-check': ['guests', 'comps'], 'comp-visits-check': ['guests', 'comps'],
  'holdout-check': ['model', 'holdout'],
  // One deep-link section per row of the Claims & evidence page.
  ...Object.fromEntries(CLAIM_IDS.map(id => [id, ['claims', '']])),
};
export const firstSub = tab => SUBTABS[tab]?.[0]?.[0] ?? '';

export const DEFAULTS = { from: 0, to: 5, zone: '', bank: '', tab: 'overview', sub: '', machine: '', sort: 'win', reverse: false, all: false, region: '', tier: '', age: '',
  // July plan builder: '' is the recommended plan (see src/lib/plan.js); sensitivities are whole percents.
  plan: '', fix: SENSITIVITY.fix, cap: SENSITIVITY.cap, dis: SENSITIVITY.dis, keep: SENSITIVITY.keep };
const HASH_KEYS = ['tab', 'sub', 'from', 'to', 'zone', 'bank', 'machine', 'sort', 'reverse', 'all', 'region', 'tier', 'age', 'plan', 'fix', 'cap', 'dis', 'keep'];
/** Quick period presets (month indexes, January = 0). The data is month-granular, so presets are whole months. */
export const PERIOD_PRESETS = [['Full period', 0, 5], ['Q1', 0, 2], ['Q2', 3, 5], ['Last 2 months', 4, 5]];
const SORT_KEYS = ['id', 'win', 'days', 'availability', 'local', 'zone', 'down', 'res'];

const normalize = s => ({ ...s, sub: SUBTABS[s.tab].some(([k]) => k === s.sub) ? s.sub : firstSub(s.tab) });

/** Reads view state and an optional evidence section from the URL hash, validating every value. */
function readHash(model) {
  const params = new URLSearchParams(location.hash.slice(1));
  const s = { ...DEFAULTS };
  for (const key of ['from', 'to']) {
    const value = params.get(key);
    if (value !== null && /^[0-5]$/.test(value)) s[key] = Number(value);
  }
  if (s.from > s.to) s.to = s.from;
  const allowed = { tab: Object.keys(SUBTABS), zone: Object.keys(model.zones), bank: model.zoneBanks.map(r => r[0]), machine: model.dict.machine_id, sort: SORT_KEYS, region: model.regions, tier: model.tiers, age: model.ageBands };
  for (const [key, values] of Object.entries(allowed)) {
    const value = params.get(key);
    if (values.includes(value)) s[key] = value;
  }
  for (const key of ['reverse', 'all']) s[key] = params.get(key) === '1';
  // Plan builder: the whole plan must parse and pass every catalog rule, or the recommended plan stands.
  const plan = params.get('plan');
  const parsed = plan === null ? null : model.planner.parse(plan);
  if (parsed) s.plan = model.planner.encode(parsed);
  for (const key of ['fix', 'cap', 'dis', 'keep']) {
    const value = params.get(key);
    if (value !== null && /^(100|[1-9]?[0-9])$/.test(value)) s[key] = Number(value);
  }
  // A bank always sits in the selected zone: a bank from another zone moves the zone to the bank's.
  if (s.bank && s.zone && model.bankZone[s.bank] !== s.zone) s.zone = model.bankZone[s.bank];
  s.sub = params.get('sub') ?? '';
  let section = params.get('section');
  if (SECTION_SUB[section]) [s.tab, s.sub] = SECTION_SUB[section];
  else section = null;
  return { state: normalize(s), section };
}

function hashFor(s, section) {
  const params = new URLSearchParams();
  for (const key of HASH_KEYS) {
    if (key === 'sub' && s.sub === firstSub(s.tab)) continue;
    if (s[key] !== DEFAULTS[key]) params.set(key, typeof s[key] === 'boolean' ? '1' : s[key]);
  }
  if (section) params.set('section', section);
  return params.size ? '#' + params.toString() : '';
}

/** Moves focus to an evidence section and scrolls it below the sticky sub-tab bar. */
export function revealSection(section) {
  const target = section && document.getElementById(section);
  if (!target) return;
  target.style.scrollMarginTop = (document.querySelector('.topbar')?.offsetHeight ?? 0) + (document.querySelector('.subnav')?.offsetHeight ?? 0) + 12 + 'px';
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'start' });
}

const NavContext = createContext(null);
export const useNav = () => useContext(NavContext);

export function NavProvider({ model, children }) {
  const initial = useMemo(() => readHash(model), [model]);
  const [state, setState] = useState(initial.state);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Work to do after the next commit: scroll to a section, focus an element, keep the tab bar in view.
  const pending = useRef({ section: initial.section, focus: null, toTop: false });
  const ignoredHashChanges = useRef([]);

  const pushHash = useCallback((s, section, replace = false) => {
    const hash = hashFor(s, section);
    if (hash === location.hash) return;
    try { history[replace ? 'replaceState' : 'pushState'](null, '', hash || location.pathname + location.search); }
    catch (error) {
      // Some file:// contexts reject pushState; fall back to a hash change we then ignore.
      if (error.name !== 'SecurityError') throw error;
      const oldURL = location.href;
      location.hash = hash;
      ignoredHashChanges.current.push({ oldURL, newURL: location.href });
    }
  }, []);

  /** Applies a state change, records it in the URL, and schedules scroll/focus work for after render. */
  /** `replace` updates the URL without a new history entry (used while dragging a slider). */
  const go = useCallback((patch, { section = null, focus = null, toTop = false, replace = false } = {}) => {
    const next = normalize({ ...stateRef.current, ...(typeof patch === 'function' ? patch(stateRef.current) : patch) });
    pending.current = { section, focus, toTop };
    stateRef.current = next;
    setState(next);
    pushHash(next, section, replace);
  }, [pushHash]);

  useLayoutEffect(() => {
    const { section, focus, toTop } = pending.current;
    pending.current = { section: null, focus: null, toTop: false };
    if (focus) document.querySelector(focus)?.focus({ preventScroll: true });
    revealSection(section);
    if (toTop) {
      // Bring the page header back under the sticky top bar after switching tab or sub-tab.
      const top = document.getElementById('main')?.getBoundingClientRect().top ?? 0;
      const bar = document.querySelector('.topbar')?.offsetHeight ?? 0;
      if (top < bar) window.scrollBy(0, top - bar);
    }
  }, [state]);

  useEffect(() => {
    const onHash = event => {
      const ignored = ignoredHashChanges.current;
      const index = ignored.findIndex(c => c.oldURL === event.oldURL && c.newURL === event.newURL);
      if (index >= 0) { ignored.splice(index, 1); return; }
      const { state: next, section } = readHash(model);
      // The original rebuilt the view on history moves, dropping focus; match that unless a section takes it.
      if (!section) document.activeElement?.blur();
      pending.current = { section, focus: null, toTop: false };
      stateRef.current = next;
      setState(next);
    };
    // Back/forward between pushed entries also fires hashchange, because the fragments differ.
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [model]);

  const actions = useMemo(() => ({
    go,
    setTab: tab => go({ tab, sub: firstSub(tab) }, { toTop: true }),
    setSub: sub => go({ sub }, { focus: '[data-sub="' + sub + '"]', toTop: true }),
    /** 'tab' or 'tab/sub' */
    goto: spec => { const [tab, sub] = spec.split('/'); go({ tab, sub: sub || firstSub(tab) }, { toTop: true }); },
    /** Opens the tab/sub-tab holding an evidence section and scrolls to it. */
    jump: section => {
      const [tab, sub] = SECTION_SUB[section];
      const s = stateRef.current;
      if (s.tab === tab && s.sub === sub) { pushHash(s, section); revealSection(section); return; }
      go({ tab, sub }, { section });
    },
    /** Opens a machine's audit file over the full period (optionally at a section such as hold-check). */
    openEvidence: (machine, section = 'machine-check') => go({ from: 0, to: 5, zone: '', bank: '', tab: 'audit', sub: SECTION_SUB[section][1], machine, all: false, sort: 'win', reverse: false }, { section }),
    selectMachine: (machine, section = 'machine-check') => go({ machine, sub: 'machine' }, { section }),
    toggleBank: bank => go(s => ({ bank: s.bank === bank ? '' : bank, zone: s.zone && s.bank !== bank ? model.bankZone[bank] : s.zone, machine: '' }), { focus: '[data-bank="' + bank + '"]' }),
    /** Opens a machine file in the audit, keeping the period, zone and bank filters. */
    openMachine: machine => go({ tab: 'audit', sub: 'machine', machine }, { section: 'machine-check' }),
    setPeriod: (from, to) => go({ from, to, machine: '' }),
    /** Opens a full-period evidence view (all banks, zones and guests): a section id, or a 'tab/sub' spec. Used by Claims & evidence. */
    trace: target => {
      const full = { from: 0, to: 5, zone: '', bank: '', region: '', tier: '', age: '', machine: '' };
      if (SECTION_SUB[target]) { const [tab, sub] = SECTION_SUB[target]; go({ ...full, tab, sub }, { section: target }); }
      else { const [tab, sub] = target.split('/'); go({ ...full, tab, sub: sub || firstSub(tab) }, { toTop: true }); }
    },
    sortBy: key => go(s => ({ reverse: s.sort === key && !s.reverse, sort: key }), { focus: '[data-sort="' + key + '"]' }),
    toggleAll: () => go(s => ({ all: !s.all }), { focus: '#show-all' }),
    reset: () => go({ from: 0, to: 5, zone: '', bank: '', region: '', tier: '', age: '', machine: '', sort: 'win', reverse: false, all: false }),
    /** Mirrors the original change handler for the filter and picker selects. */
    setFilter: (id, value) => {
      const patch = {
        from: s => ({ from: Number(value), to: Math.max(s.to, Number(value)), machine: '' }),
        through: s => ({ to: Number(value), from: Math.min(Number(value), s.from), machine: '' }),
        // Keep zone and bank consistent: a bank outside the zone moves the zone; a zone that excludes the bank clears it.
        bank: s => ({ bank: value, zone: value && s.zone ? model.bankZone[value] : s.zone, machine: '' }),
        zone: s => ({ zone: value, bank: s.bank && value && model.bankZone[s.bank] !== value ? '' : s.bank, machine: '' }),
        region: () => ({ region: value }),
        tier: () => ({ tier: value }),
        age: () => ({ age: value }),
        'machine-pick': () => ({ machine: value }),
      }[id];
      go(patch, { focus: '#' + id });
    },
  }), [go, pushHash, model]);

  const value = useMemo(() => ({ state, ...actions }), [state, actions]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}
