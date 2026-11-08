// Q3 downtime: when machines are down, how fast fault tickets are answered, and which downtime a technician shift or a
// preventive sweep could plausibly avoid. Pure functions over the shipped data, shared by src/tabs/DemandResponse.jsx,
// the downtime timeline and heat map in src/tabs/Demand.jsx, the July catalog, the evidence graph and scripts/check-claims.mjs.
import { by, month, ratio, sum } from './format.js';

export const SHIFT_NAMES = ['Day', 'Swing', 'Grave'];
export const SHIFT_HOURS = ['06:00–14:00', '14:00–22:00', '22:00–06:00'];

/** Fault tickets as objects. Response = opened → work started, repair = work started → restored, both in minutes. */
export function ticketRows(data) {
  const dt = data.downtime;
  return dt.tickets.map(([d, bank, shift, techs, make, response, repair, cost, weekday, repeat]) => ({
    d, bank, shift, techs, make: dt.makes[make], response, repair, cost, weekday, repeat,
  }));
}

/** Tickets opened inside the selected gaming days and bank. */
export const scopeTickets = (tickets, { start, end, bank }) => tickets.filter(t => t.d >= start && t.d <= end && (!bank || t.bank === bank));

export const median = values => {
  if (!values.length) return null;
  const v = values.slice().sort((a, b) => a - b), mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

/** Response and repair summary for a list of tickets. */
export function responseStats(list) {
  return {
    n: list.length,
    response: ratio(sum(list, t => t.response), list.length), responseMedian: median(list.map(t => t.response)),
    immediate: ratio(list.filter(t => t.response === 0).length, list.length),
    repair: ratio(sum(list, t => t.repair), list.length), repairMedian: median(list.map(t => t.repair)),
    waitHours: sum(list, t => t.response) / 60, repairHours: sum(list, t => t.repair) / 60,
    cost: ratio(sum(list, t => t.cost), list.length), repeat: ratio(sum(list, t => t.repeat), list.length),
  };
}

/** Slot-technician roster rows: {d, shift, planned, techs, tickets}. */
export const rosterRows = data => data.downtime.roster.map(([d, shift, planned, techs, tickets]) => ({ d, shift, planned, techs, tickets }));

/** Average down machine-hours per gaming day for each weekday × clock-hour cell (rows Mon–Sun gaming days, 06:00–05:00). */
export function downHeat(data, bank, from, to) {
  const dt = data.downtime, b = bank ? dt.banks.indexOf(bank) : null;
  const tenths = new Float64Array(168);
  for (const [bi, m, cell, v] of dt.heat) if (m >= from && m <= to && (b == null || bi === b)) tenths[cell] += v;
  return Array.from({ length: 168 }, (_, cell) => {
    let count = 0;
    for (let m = from; m <= to; m++) count += data.heat.n[m][cell];
    return { weekday: Math.floor(cell / 24), hour: (cell % 24 + 6) % 24, down: tenths[cell] / 10, count, value: ratio(tenths[cell] / 10, count) };
  });
}

/** Faults per machine-day by manufacturer and each one's excess over the other makes combined. */
export function makeRates(tickets, rows) {
  const days = by(rows, r => r.make), counts = by(tickets, t => t.make);
  const totalDays = rows.length, totalTickets = tickets.length;
  return [...days.entries()].map(([make, g]) => {
    const own = counts.get(make) ?? [];
    const rate = ratio(own.length, g.length), others = ratio(totalTickets - own.length, totalDays - g.length);
    return { make, tickets: own.length, machineDays: g.length, rate, others, excessShare: rate > others ? 1 - others / rate : 0,
      theoPerHour: ratio(sum(g, r => r.theo), sum(g, r => r.h)), ...responseStats(own) };
  }).sort((a, b) => b.rate - a.rate);
}

/**
 * Downtime a technician shift or a preventive sweep could plausibly avoid, for a selection of tickets and machine-days.
 * Technician: the waiting on tickets opened while one technician (or none) was on duty, times the share of waiting a second
 * technician removed in the like-for-like test. Preventive: every hour of a make's tickets above the other makes' fault rate.
 * The two overlap where an excess ticket also waited for a lone technician; that overlap is counted once in `either`.
 */
export function avoidable(tickets, rows, share) {
  const meter = sum(rows, r => r.down), fault = sum(tickets, t => t.response + t.repair) / 60;
  const lone = tickets.filter(t => t.techs <= 1);
  const tech = sum(lone, t => t.response) / 60 * share;
  const rates = makeRates(tickets, rows);
  const pm = sum(rates, r => r.excessShare * (r.waitHours + r.repairHours));
  const overlap = sum(rates, r => r.excessShare * sum(lone.filter(t => t.make === r.make), t => t.response) / 60 * share);
  return { meter, fault, wait: sum(tickets, t => t.response) / 60, repair: sum(tickets, t => t.repair) / 60, lone: lone.length,
    tech, pm, overlap, either: tech + pm - overlap, remaining: meter - (tech + pm - overlap) };
}

/** Full-period evidence for the July technician-shift and preventive-maintenance decisions. */
export function downtimeFinding({ data, auditRows, fullDays, catalogue, actionCost }) {
  const dt = data.downtime, tickets = ticketRows(data);
  const tech = catalogue['A-TECH-SHIFT'], maint = catalogue['A-PREVENTIVE'];
  const after = action => Math.max(0, 30 - action[4]);

  // Technician: value of the waiting a second technician would remove, per shift, priced at that shift's expected win per hour.
  const shifts = [0, 1, 2].map(s => {
    const lone = tickets.filter(t => t.shift === s && t.techs <= 1);
    const hoursPerDay = sum(lone, t => t.response) / 60 / fullDays;
    const value = share => hoursPerDay * share * dt.rates.theo[s] * after(tech);
    const days = dt.roster.filter(r => r[1] === s);
    return { shift: s, lone: lone.length, loneDays: days.filter(r => r[3] <= 1).length, days: days.length, hoursPerDay,
      avoidedPerDay: hoursPerDay * dt.share.share, value: value(dt.share.share), low: value(dt.share.lo), high: value(dt.share.hi), all: value(1) };
  });
  const best = shifts.reduce((a, b) => b.value > a.value ? b : a);
  const techCost = actionCost(tech);

  // Preventive: the make with the highest fault rate, priced as if a sweep brought it to the other makes' rate for July.
  const sweep = (from, to) => {
    const rows = auditRows.filter(r => month(data.dates[r.d]) >= from && month(data.dates[r.d]) <= to);
    const span = new Set(rows.map(r => r.d)).size;
    const list = tickets.filter(t => month(data.dates[t.d]) >= from && month(data.dates[t.d]) <= to);
    const top = makeRates(list, rows)[0];
    const excessPerDay = (top.rate - top.others) * top.machineDays / span;
    // Each avoided ticket saves its average out-of-service hours at the make's expected win per hour, plus its repair bill.
    const perTicket = (top.waitHours + top.repairHours) / top.tickets * top.theoPerHour + top.cost;
    return { ...top, excessPerDay, perTicket, upper: excessPerDay * perTicket * after(maint) };
  };
  const full = sweep(0, 5), recent = sweep(3, 5);
  const cabinets = new Set(auditRows.filter(r => r.d === fullDays - 1 && r.make === full.make).map(r => r.id)).size;
  const sweepDowntime = cabinets * maint[5] / 60 * Math.min(...dt.rates.theo);
  const pmCost = actionCost(maint);

  const test = dt.tests, overall = responseStats(tickets);
  return {
    tickets, overall, tests: test, robust: dt.robust, share: dt.share, overlap: dt.overlap, rates: dt.rates,
    tech: { action: tech, cost: techCost, days: after(tech), shifts, best, need: ratio(techCost, best.value), needAll: ratio(techCost, best.all) },
    pm: { action: maint, cost: pmCost, days: after(maint), full, recent, cabinets, sweepDowntime,
      breakEven: ratio(pmCost + sweepDowntime, full.upper), breakEvenRecent: ratio(pmCost + sweepDowntime, recent.upper) },
    avoid: avoidable(tickets, auditRows, dt.share.share),
  };
}
