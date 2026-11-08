// The July budget as data: a plan is a list of funded catalog actions with quantities and targets.
// One module prices it with the guide's cost formula, checks it against the catalog rules, estimates
// benefits from the model's existing economics, and reads/writes it from the URL hash, so the ledger,
// the plan builder, the claims check and the assistant all agree.
import { cash, n, shifts as SHIFT_HOURS } from './format.js';

export const BUDGET = 100000;
export const MAX_TYPES = 3;
export const SHIFT_NAMES = ['day', 'swing', 'grave'];
/** Sensitivity defaults (whole percents). 25% chance of full correction is the downside repair scenario; 50% capture and
 * 10% displacement are the move case quoted throughout; 25% of the weaker past promotion lift sits at its break-even. */
export const SENSITIVITY = { fix: 25, cap: 50, dis: 10, keep: 25 };

// What each targeted action is aimed at; untargeted actions (comp, promotion, survey) only take a quantity.
const TARGET = { 'A-MOVE-MACHINE': 'machine', 'A-REPLACE-LEASE': 'machine', 'A-REPLACE-BUY': 'machine', 'A-INSPECT': 'machine',
  'A-MOVE-BANK': 'bank', 'A-TECH-SHIFT': 'shift', 'A-PREVENTIVE': 'make', 'A-WAYFINDING': 'zone' };
// The catalog's `same_machine` group forbids two of its actions on one machine; any other shared group (comp_policy)
// makes the actions mutually exclusive outright (guide §6: never combine the comp pilot with the floor-wide change).
const PER_MACHINE = 'same_machine';

export const afterLead = action => Math.max(0, 30 - action[4]);

/**
 * m: the model fields the plan needs (catalogue, actionCost, the June 30 floor, the inspection, move, promotion and downtime economics).
 */
export function createPlanner(m) {
  const { data, catalogue, actionCost, auditRows, fullDays, zones, inspect, move, cohort, payoutCohort, inspectionCeiling, netMove, moveCost,
    promoCost, retainedTheo, downtime: dt } = m;
  const actions = data.actions.filter(a => a[0] !== 'A-HOLD');
  const floor = auditRows.filter(r => r.d === fullDays - 1);
  const bankMachines = new Map();
  for (const r of floor) bankMachines.set(r.bank, [...(bankMachines.get(r.bank) ?? []), r.id]);
  const machines = floor.map(r => r.id).sort();
  const options = {
    machine: machines.map(id => ({ value: id, label: id })),
    bank: [...bankMachines.keys()].sort().map(b => ({ value: b, label: b + ' · ' + bankMachines.get(b).length + ' machines' })),
    zone: Object.entries(zones).map(([value, label]) => ({ value, label })),
    make: [...new Set(floor.map(r => r.make))].sort().map(value => ({ value, label: value })),
    shift: SHIFT_NAMES.map((value, i) => ({ value, label: value[0].toUpperCase() + value.slice(1) + ' shift · ' + SHIFT_HOURS[i] })),
  };
  const allowed = Object.fromEntries(Object.entries(options).map(([k, list]) => [k, new Set(list.map(o => o.value))]));
  const labelOf = (kind, value) => options[kind].find(o => o.value === value)?.label ?? value;
  const kindOf = id => TARGET[id] ?? null;
  const group = id => catalogue[id][7] ?? null;
  const limit = id => catalogue[id][6];

  // Preferred targets when a builder row adds one: the evidence's own candidates first, then the rest of the floor.
  const ids = list => list.map(r => r.id);
  const preference = {
    'A-INSPECT': [inspect.id, ...ids(payoutCohort), ...ids(cohort)], 'A-MOVE-MACHINE': [move.id, ...ids(cohort)],
    'A-REPLACE-LEASE': ids(cohort), 'A-REPLACE-BUY': ids(cohort), 'A-MOVE-BANK': [move.g.at(-1).bank],
    'A-TECH-SHIFT': [SHIFT_NAMES[dt.tech.best.shift]], 'A-PREVENTIVE': [dt.pm.full.make],
  };

  /** Machines an item occupies for the per-machine rule: its machines, or every machine in its banks. */
  const machinesOf = item => kindOf(item.id) === 'bank' ? item.targets.flatMap(b => bankMachines.get(b) ?? []) : kindOf(item.id) === 'machine' ? item.targets : [];
  const perMachine = item => group(item.id) === PER_MACHINE;
  /** Machines already held by other per-machine actions in the plan. */
  const booked = (items, except) => new Set(items.filter((x, i) => i !== except && perMachine(x)).flatMap(machinesOf));

  /** Whether `value` can be added as a target of items[index] without breaking a rule. */
  function canTarget(items, index, value, slot = -1) {
    const item = items[index];
    if (item.targets.some((t, i) => i !== slot && t === value)) return false;
    if (!perMachine(item)) return true;
    const held = booked(items, index);
    const occupies = kindOf(item.id) === 'bank' ? bankMachines.get(value) ?? [] : [value];
    return !occupies.some(id => held.has(id));
  }
  /** Why a catalog action cannot join the plan right now, or null if it can. */
  function blockReason(items, id) {
    if (items.some(x => x.id === id)) return 'already in the plan';
    if (items.length >= MAX_TYPES) return 'the plan already funds ' + MAX_TYPES + ' action types';
    const g = group(id), clash = g && g !== PER_MACHINE && items.find(x => group(x.id) === g);
    if (clash) return 'cannot run with ' + catalogue[clash.id][1].toLowerCase() + ' (catalog group ' + g + ')';
    if (!afterLead(catalogue[id])) return 'its lead time leaves no July days';
    return null;
  }
  /** A new item with sensible defaults (one unit, the first allowed preferred target), or null if no target is free. */
  function newItem(items, id) {
    const item = { id, qty: 1, targets: [] };
    if (!kindOf(id)) return item;
    const next = [...items, item];
    const value = nextTarget(next, next.length - 1);
    return value == null ? null : { ...item, targets: [value] };
  }
  function nextTarget(items, index) {
    const id = items[index].id, list = [...(preference[id] ?? []), ...options[kindOf(id)].map(o => o.value)];
    return list.find(v => allowed[kindOf(id)].has(v) && canTarget(items, index, v)) ?? null;
  }

  /** Every rule the plan must satisfy, as visible checks. */
  function checks(items) {
    const name = id => catalogue[id][1];
    const comp = items.filter(x => group(x.id) && group(x.id) !== PER_MACHINE);
    const compClash = comp.find(x => comp.some(y => y !== x && group(y.id) === group(x.id)));
    const overlap = [];
    items.forEach((x, i) => { if (perMachine(x)) for (const id of machinesOf(x)) if (booked(items, i).has(id)) overlap.push(id); });
    const repeats = items.filter(x => new Set(x.targets).size !== x.targets.length);
    const spent = items.reduce((a, x) => a + cost(x), 0);
    const late = items.filter(x => !afterLead(catalogue[x.id]));
    return [
      { key: 'types', label: 'At most ' + MAX_TYPES + ' funded action types', pass: items.length <= MAX_TYPES,
        detail: n(items.length) + ' of ' + MAX_TYPES + ' used; keeping the budget does not use a slot.' },
      { key: 'limits', label: 'Every quantity within its catalog limit', pass: items.every(x => x.qty >= 1 && x.qty <= limit(x.id)),
        detail: items.length ? items.map(x => name(x.id) + ': ' + n(x.qty) + ' of ' + n(limit(x.id))).join('; ') + '.' : 'No action is funded.' },
      { key: 'lead', label: 'Lead time fits July', pass: !late.length,
        detail: items.length ? items.map(x => name(x.id) + ': ' + n(catalogue[x.id][4]) + '-day lead leaves ' + n(afterLead(catalogue[x.id])) + ' July days').join('; ') + '.' : 'No action is funded.' },
      { key: 'incompatible', label: 'No incompatible pair', pass: !compClash && !overlap.length,
        detail: compClash ? 'The comp pilot and the floor-wide comp change are both funded; the catalog allows only one.'
          : overlap.length ? 'Conflicting moves or replacements on ' + [...new Set(overlap)].join(', ') + '.'
          : 'No comp pilot with a floor-wide comp change, and no machine gets two moves or replacements (bank moves count every machine in the bank).' },
      { key: 'double', label: 'No machine double-booked', pass: !repeats.length,
        detail: repeats.length ? 'A target is listed twice in ' + repeats.map(x => name(x.id)).join(', ') + '.' : 'Each action lists every target once.' },
      { key: 'budget', label: 'Total within ' + cash(BUDGET), pass: spent <= BUDGET,
        detail: cash(spent) + ' funded + ' + cash(BUDGET - spent) + ' reserve = ' + cash(BUDGET) + '.' },
    ];
  }
  const cost = item => item.qty * actionCost(catalogue[item.id]);

  /** Guide §6 cost formula per funded action, the benefit window after lead, and the reserve. */
  function ledger(items) {
    const lines = items.map(item => {
      const a = catalogue[item.id], days = afterLead(a);
      return { item, action: a, unit: a[2] / 100, recurring: a[3] / 100, days, cost: cost(item),
        targets: item.targets.map(t => labelOf(kindOf(item.id), t)),
        formula: n(item.qty) + ' × (' + cash(a[2] / 100) + ' + ' + cash(a[3] / 100) + '/day × max(0, 30 − ' + n(a[4]) + '))',
        window: days ? (days === 30 ? 'July 1–30' : 'July ' + (a[4] + 1) + '–30') + ' · ' + n(days) + ' days' : 'No July days' };
    });
    const spent = lines.reduce((a, l) => a + l.cost, 0);
    return { lines, spent, reserve: BUDGET - spent, checks: checks(items),
      arithmetic: [...lines.map(l => cash(l.cost)), cash(BUDGET - spent) + ' reserve'].join(' + ') + ' = ' + cash(BUDGET) };
  }

  /**
   * July gross benefit (before the action's own cost) from the model's existing economics, or null where the evidence has none.
   * s: sensitivity as fractions {fix, cap, dis, keep}. Returns {lo, hi, expected|null, covered, note}.
   */
  function benefit(item, s) {
    const per = item.targets.length ? item.targets : [];
    const parts = [];
    let note = '';
    if (item.id === 'A-INSPECT') {
      if (per.includes(inspect.id)) parts.push({ lo: 0, hi: inspectionCeiling, expected: s.fix * inspectionCeiling });
      note = 'Payout gap recovery on ' + inspect.id + ' only, from no fault (zero) to a full fix; repair cost and interruption excluded.';
    } else if (item.id === 'A-MOVE-MACHINE') {
      const gross = (c, d) => netMove(c, d) + moveCost;
      if (per.includes(move.id)) parts.push({ lo: gross(.25, .5), hi: gross(.75, 0), expected: gross(s.cap, s.dis) });
      note = move.id + ' to the vacant slot only, 25–75% capture and 0–50% displacement, after three hours of disruption.';
    } else if (item.id === 'A-TECH-SHIFT') {
      for (const t of per) { const x = dt.tech.shifts[SHIFT_NAMES.indexOf(t)]; parts.push({ lo: x.low, hi: x.high, expected: x.value }); }
      note = 'Waiting a second technician removes on that shift, priced at its expected win per hour (95% interval of the waiting share).';
    } else if (item.id === 'A-PREVENTIVE') {
      if (per.includes(dt.pm.full.make)) parts.push({ lo: -dt.pm.sweepDowntime, hi: dt.pm.full.upper - dt.pm.sweepDowntime, expected: null });
      note = dt.pm.full.make + ' only, from removing none of its excess faults to all of them, after sweep downtime; no evidence for a point estimate.';
    } else if (item.id === 'A-PROMO') {
      const lifts = data.promotions.map(retainedTheo), weak = Math.min(...lifts), strong = Math.max(...lifts);
      for (let i = 0; i < item.qty; i++) parts.push({ lo: .15 * weak, hi: .5 * strong, expected: s.keep * weak });
      note = '15–50% of a past event’s expected-win lift through the following week; expected uses your share of the weaker event.';
    }
    if (!parts.length) return null;
    const total = k => parts.some(p => p[k] == null) ? null : parts.reduce((a, p) => a + p[k], 0);
    return { lo: total('lo'), hi: total('hi'), expected: total('expected'), covered: parts.length, note };
  }

  // URL form: "A-INSPECT:M-1158,M-1170|A-PROMO:2". '' means the recommended plan; 'none' keeps the whole budget.
  const encodeRaw = items => items.length ? items.map(x => x.id + ':' + (kindOf(x.id) ? x.targets.join(',') : x.qty)).join('|') : 'none';
  /** Strictly parses a plan string; any unknown id, target, quantity or broken rule rejects the whole plan (null). */
  function parse(text) {
    if (text === '' || text == null) return recommended;
    if (text === 'none') return [];
    const items = [];
    for (const part of text.split('|')) {
      const match = /^(A-[A-Z-]+):([A-Za-z0-9,-]+)$/.exec(part);
      if (!match || !catalogue[match[1]] || match[1] === 'A-HOLD' || blockReason(items, match[1])) return null;
      const [, id, rest] = match, kind = kindOf(id);
      let item;
      if (kind) {
        const targets = rest.split(',');
        if (targets.some(t => !allowed[kind].has(t))) return null;
        item = { id, qty: targets.length, targets };
      } else {
        if (!/^[1-9][0-9]?$/.test(rest)) return null;
        item = { id, qty: Number(rest), targets: [] };
      }
      if (item.qty > limit(id)) return null;
      items.push(item);
      if (item.targets.some((t, j) => !canTarget(items, items.length - 1, t, j))) return null;
    }
    return items;
  }

  const recommended = [{ id: 'A-INSPECT', qty: 1, targets: [inspect.id] }];
  // The downtime evidence funds a technician or sweep only if it clears its cost (same rule as the catalog table).
  if (dt.tech.best.value >= dt.tech.cost) recommended.push({ id: 'A-TECH-SHIFT', qty: 1, targets: [SHIFT_NAMES[dt.tech.best.shift]] });
  if (dt.pm.breakEven <= .5) recommended.push({ id: 'A-PREVENTIVE', qty: 1, targets: [dt.pm.full.make] });
  const encode = items => { const raw = encodeRaw(items); return raw === encodeRaw(recommended) ? '' : raw; };

  return { actions, options, labelOf, kindOf, limit, group, recommended, ledger, checks, benefit, parse, encode, newItem, nextTarget, canTarget, blockReason, cost, machinesOf };
}
