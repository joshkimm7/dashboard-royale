// Recomputes every figure quoted in README.md and CLAIMS-AND-EVIDENCE.md from the dashboard's own model
// and fails if a document no longer contains the freshly computed value (e.g. after a data release or a
// method change). Run with `npm run check` after `python build_data.py <official-data>`.
import { readFileSync } from 'node:fs';
import { createModel } from '../src/lib/model.js';
import { by, cash, month, n, pct, ratio, sum } from '../src/lib/format.js';

const data = JSON.parse(readFileSync('data/dashboard.json', 'utf8'));
const m = createModel(data);
const docs = { readme: readFileSync('README.md', 'utf8'), claims: readFileSync('CLAIMS-AND-EVIDENCE.md', 'utf8') };
// The docs use a typographic minus; some formatters emit a hyphen. Compare on one form.
const norm = s => s.replace(/−/g, '-');

const signed = v => (v > 0 ? '+' : '') + cash(v);
const signedPct1 = v => (v > 0 ? '+' : '') + pct(v);
const millions = (v, d = 2) => (v < 0 ? '−' : '') + '$' + (Math.abs(v) / 1e6).toFixed(d) + 'm';
const thousands = v => '$' + Math.round(v / 1000) + 'k';
const pp2 = v => (v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(2);

// ---- Guests (same aggregation as src/tabs/Guests.jsx, full period, all groups) ----
const people = new Map();
for (const r of data.players) {
  const x = people.get(r[0]) ?? [0, 0];
  x[0] += r[4]; x[1] += Math.round(r[6] * 100); people.set(r[0], x);
}
const p = [...people.values()], active = p.filter(r => r[0] > 0), cut = Math.ceil(active.length * .01);
const cardedCoin = sum(data.players, r => r[4]), cardedPayout = sum(data.players, r => r[5]), cardedNet = sum(p, r => r[1]) / 100;
const grossLoss = sum(p, r => Math.max(0, -r[1]));
const topCoin = sum(active.slice().sort((a, b) => b[0] - a[0]).slice(0, cut), r => r[0]);
const topLoss = sum(active.slice().sort((a, b) => a[1] - b[1]).slice(0, cut), r => Math.max(0, -r[1]));

// ---- Demand and downtime (same monthly logic as src/tabs/Demand.jsx, full period, all banks) ----
const daily = [...by(m.auditRows, r => r.d).entries()].sort((a, b) => a[0] - b[0]);
const monthly = [...by(daily, ([d]) => month(data.dates[d])).entries()].map(([mo, days]) => {
  const obs = days.map(([d, g]) => ({ d, coin: sum(g, r => r.coin), lost: sum(g, r => r.lost) }));
  return { m: mo, days: days.length, coin: sum(obs, r => r.coin) / days.length, lost: sum(obs, r => r.lost) / days.length,
    adjusted: m.weekdayAdjusted(obs, r => r.coin), adjustedRisk: m.weekdayAdjusted(obs, r => r.lost),
    city: data.city.find(c => month(c[0] + '-01') === mo)?.[1],
    entrance: (rows => sum(rows, r => r[6]) / rows.length)(data.property.filter(r => month(r[0]) === mo)) };
});
const M = i => monthly.find(r => r.m === i);
const febDays = daily.filter(([d]) => month(data.dates[d]) === 1).map(([d, g]) => ({ d, coin: sum(g, r => r.coin) }));
const febNoSB = febDays.filter(r => !(data.property[r.d][2] ?? '').includes('Super Bowl'));
const peak = monthly.reduce((b, r) => (!b || r.adjusted > b.adjusted ? r : b), null);
const makeDown = [...by(m.auditRows, r => r.make).entries()].map(([k, g]) => [k, sum(g, r => r.down)]);
const ridgeShare = makeDown.find(([k]) => k === 'Ridgeline')[1] / sum(m.auditRows, r => r.down);

// ---- Forecast ----
const score = (tier, col, cls) => m.schedulingScore(tier, col, cls);
const peakAt = (cutoff, col) => { const s = score('Peak', col, c => (c >= cutoff ? 'Peak' : 'Other')); return { caught: s.hits, peaks: s.hits + s.missed, coverage: s.hits + s.falseFlags }; };
const tierOk = tier => { const s = score(tier, 10); return n(s.hits) + '/' + n(s.hits + s.missed); };
const juneEvents = m.holdout.filter(r => month(r[0]) === 5 && r[16]);
const v = data.validation;

// ---- Moves, inspection, promotion, alternatives ----
const captures = data.moves.filter(r => r.main?.capture != null).map(r => r.main.capture);
const pairPcts = m.moveCases.map(r => r.main.bankPct);
const slot = m.inspectionSlot, hold = m.windowHold;
const [tournament, locals] = data.promotions;
const daysAfterLead = a => Math.max(0, 30 - a[4]);
const ridge = m.auditRows.filter(r => r.make === 'Ridgeline');
const maint = m.catalogue['A-PREVENTIVE'], tech = m.catalogue['A-TECH-SHIFT'], comp = m.catalogue['A-COMP-PILOT'];
const ridgeRisk = sum(ridge, r => r.lostTheo) / m.fullDays * daysAfterLead(maint);
const techRisk = sum(m.auditRows, r => r.lostTheo) / m.fullDays * daysAfterLead(tech);
const compSpend = sum(data.property, r => r[9]) / m.fullDays * daysAfterLead(comp);

const CHECKS = [
  // Headline decision (README + appendix)
  ['reserve', cash(m.reserve), ['readme', 'claims']],
  ['inspection cost', cash(m.inspectionCost), ['readme', 'claims']],
  ['M-1158 shortfall', cash(m.inspect.theo - m.inspect.win), ['readme']],
  ['move net, 50% capture, no displacement', signed(m.netMove(.5, 0)), ['claims']],
  ['move net, 50% capture, 10% displacement', cash(m.netMove(.5, .10)), ['claims']],
  ['conditional July recovery', cash(m.inspectionCeiling), ['claims']],
  ['inspection break-even', pct(m.inspectionBreakEven, 1), ['claims']],
  // Q1
  ['quiet cohort', ['Nine', 'Ten'][m.quietCohort.length - 9] ?? n(m.quietCohort.length), ['claims']],
  ['M-1158 actual win', cash(m.inspect.win), ['claims']],
  ['M-1158 expected win', cash(m.inspect.theo), ['claims']],
  ['M-1158 payout gap', pp2(m.inspect.res), ['claims']],
  ['M-1158 gap without worst week', pp2(m.withoutWorst.res), ['claims']],
  ['interval without worst week', pp2(m.withoutWorst.lo) + ' to ' + pp2(m.withoutWorst.hi), ['claims']],
  ['weeks below configured hold', n(m.weeksBelow) + ' of ' + n(m.focalWeeks.length), ['claims']],
  ['M-1158 local demand', pct(m.inspect.local, 0), ['claims']],
  // Q2
  ['February with Super Bowl', millions(sum(febDays, r => r.coin) / febDays.length, 3), ['claims']],
  ['February without Super Bowl', millions(sum(febNoSB, r => r.coin) / febNoSB.length, 3), ['claims']],
  ['adjusted peak', millions(peak.adjusted, 3), ['claims']],
  ['adjusted peak month', 'peaks in ' + ['January', 'February', 'March', 'April', 'May', 'June'][peak.m], ['claims']],
  ['June vs January adjusted', pct(Math.abs(M(5).adjusted / M(0).adjusted - 1)), ['claims']],
  ['April to June adjusted wagers', pct(Math.abs(M(5).adjusted / M(3).adjusted - 1)), ['claims']],
  ['April to June visitors', pct(Math.abs(M(5).city / M(3).city - 1)), ['claims']],
  ['April to June entrances', pct(Math.abs(M(5).entrance / M(3).entrance - 1)), ['claims']],
  // Q3
  ['meter down hours', n(sum(m.auditRows, r => r.down)), ['claims']],
  ['wagers at risk', millions(sum(m.auditRows, r => r.lost), 3), ['claims']],
  ['theo at risk', cash(sum(m.auditRows, r => r.lostTheo)), ['claims']],
  ['risk per day', cash(sum(m.auditRows, r => r.lost) / m.fullDays), ['claims']],
  ['Ridgeline downtime share', pct(ridgeShare), ['claims']],
  ['Feb→Jun risk change', cash(Math.abs(M(5).lost - M(1).lost)), ['claims']],
  ['Feb→Jun raw wager change', cash(Math.abs(M(5).coin - M(1).coin)), ['claims']],
  ['Jan→Jun adjusted risk change', cash(Math.abs(M(5).adjustedRisk - M(0).adjustedRisk)), ['claims']],
  ['Jan→Jun adjusted wager change', cash(Math.abs(M(5).adjusted - M(0).adjusted)), ['claims']],
  // Q4
  ['carded coin-in', millions(cardedCoin), ['claims']],
  ['carded payout', millions(cardedPayout), ['claims']],
  ['carded net', millions(cardedNet), ['claims']],
  ['cardholders', n(p.length), ['claims']],
  ['active cardholders', n(active.length), ['claims']],
  ['ahead / behind / even', n(active.filter(r => r[1] > 0).length) + ' ended ahead, ' + n(active.filter(r => r[1] < 0).length) + ' behind and ' + n(active.filter(r => r[1] === 0).length) + ' even', ['claims']],
  ['top 1% wagers', pct(ratio(topCoin, cardedCoin)), ['claims']],
  ['top 1% losses', pct(ratio(topLoss, grossLoss)), ['claims']],
  // Q5
  ['comp cost', cash(sum(data.property, r => r[9])), ['claims']],
  ['comp face value', cash(sum(data.property, r => r[8])), ['claims']],
  ['comp intensity January', pct(sum(data.property.filter(r => month(r[0]) === 0), r => r[9]) / sum(data.property.filter(r => month(r[0]) === 0), r => r[5]), 2), ['claims']],
  ['comp intensity June', pct(sum(data.property.filter(r => month(r[0]) === 5), r => r[9]) / sum(data.property.filter(r => month(r[0]) === 5), r => r[5]), 2), ['claims']],
  // Model
  ['weekday MAE', cash(m.m1), ['claims']],
  ['last-week MAE', cash(m.m7), ['claims']],
  ['constant MAE', cash(m.mae(m.holdout, 11)), ['claims']],
  ['paired wins', n(v.frozen.wins) + ' of ' + n(v.frozen.days), ['claims']],
  ['paired interval', signed(v.frozen.interval[0]) + ' to ' + signed(v.frozen.interval[1]), ['claims']],
  ['calendar MAE improvement', cash(m.m1 - m.mCalendar), ['claims']],
  ['calendar paired interval', signed(v.calendar.interval[0]) + ' to ' + signed(v.calendar.interval[1]), ['claims']],
  ['June event-day MAE', cash(m.mae(juneEvents, 10)) + ' to ' + cash(m.mae(juneEvents, 14)), ['claims']],
  ['peak/quiet/regular classified', tierOk('Peak') + ' peak, ' + tierOk('Quiet') + ' quiet and ' + tierOk('Regular') + ' regular', ['claims']],
  ['expanding-window days', n(data.property.filter(r => r[0] >= '2025-03-01').length) + '-day', ['claims']],
  // Staffing replay
  ...[1450000, m.peakThreshold, 1550000].map(c => {
    const w = peakAt(c, 10), l = peakAt(c, 12);
    return ['staffing at ' + c, w.caught === l.caught ? n(w.caught) + ' of ' + n(w.peaks) : n(w.caught) + ' vs ' + n(l.caught), ['claims']];
  }),
  // Moves
  ['capture range', signedPct1(Math.max(...captures)) + ' and ' + signedPct1(Math.min(...captures)), ['claims']],
  ['pair change range', signedPct1(Math.min(...pairPcts)) + ' to ' + signedPct1(Math.max(...pairPcts)), ['claims']],
  ['closest route pre-trend', signedPct1(m.closestCase.main.pretrend), ['claims']],
  // Inspection window
  ['comparable windows', n(slot.n) + ' comparable windows', ['claims']],
  ['window theo at risk', cash(slot.coin * hold), ['claims']],
  ['average window theo', cash(slot.typical * hold), ['claims']],
  ['window saving', cash((slot.typical - slot.coin) * hold), ['claims']],
  // Promotion
  ['promotion cost', cash(m.promoCost), ['claims']],
  ['event wager lifts', thousands(tournament.during.coin) + ' and ' + thousands(locals.during.coin), ['claims']],
  ['retained expected win', cash(m.retainedTheo(tournament)) + ' and ' + cash(m.retainedTheo(locals)), ['claims']],
  ['promotion hurdles', pct(m.promoCost / m.retainedTheo(tournament), 1) + ' or ' + pct(m.promoCost / m.retainedTheo(locals), 1), ['claims']],
  // Repair
  ['repair gross benefits', (vals => vals.slice(0, -1).join(', ') + ', and ' + vals.at(-1))(m.repairScenarios.map(s => cash(m.inspectionGapPerDay * s * m.repairPaybackDays))), ['claims']],
  // Alternatives
  ['Ridgeline sweep', cash(m.actionCost(maint)) + ' Ridgeline sweep vs ' + cash(ridgeRisk), ['claims']],
  ['technician shift', cash(m.actionCost(tech)) + ' technician needs ' + pct(m.actionCost(tech) / techRisk, 0) + ' of ' + cash(techRisk), ['claims']],
  ['comp pilot', cash(m.actionCost(comp)) + ' comp pilot needs about ' + pct(m.actionCost(comp) / compSpend, 0) + ' savings on ' + cash(compSpend), ['claims']],
];

let failed = 0;
for (const [label, expected, where] of CHECKS) {
  for (const doc of where) {
    if (norm(docs[doc]).includes(norm(expected))) continue;
    failed++;
    console.log('✗ ' + label + ': ' + (doc === 'readme' ? 'README.md' : 'CLAIMS-AND-EVIDENCE.md') + ' should contain "' + expected + '"');
  }
}
const total = CHECKS.reduce((a, c) => a + c[2].length, 0);
console.log(failed ? '\n' + failed + ' of ' + total + ' quoted figures are stale.' : 'All ' + total + ' quoted figures match the model.');
process.exit(failed ? 1 : 0);
