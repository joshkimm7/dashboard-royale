// The evidence graph: how data sources feed evidence panels, which support actions and the July plan.
// Built from the same analysis objects the tabs use, so the map and the assistant can't drift from them.
import { cash, month, months, n, pct, pp, signedPct, sum } from './format.js';

export const FLAG_LABELS = { 'Inspect hold': 'Payout flag', 'Quiet zone': 'Quiet placement', 'Short exposure': 'Short exposure', 'Low peer demand': 'Weak local demand', 'Downtime': 'Downtime flag' };
/** Left-to-right stages of the flow diagram. Questions group the evidence; machines and flags live in the assistant. */
export const STAGES = [['source', 'Data sources'], ['evidence', 'Evidence'], ['action', 'Actions'], ['decision', 'Decision']];
const RANK = { source: 0, evidence: 1, action: 2, decision: 3 };

// Builds nodes and links from the same analysis objects the tabs use, so the map can't drift from them.
export function buildEvidenceGraph(m) {
  const { reserve, inspect, inspectionCost, moveCases, peakThreshold, promoCost, quietCohort, payoutCohort, moveBreakEven, m1, m7,
    schedulingScore, auditRows, fullDays, promoHurdle, cohort, reviewAction, move, data, fullOverlap, payoutConfig, compFinding, zoneFinding: zf, zones, downtime: dt } = m;
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
  add('act-comp', 'action', 'Hold comp changes', 'No comp pilot and no floor-wide comp change in July; the two are mutually exclusive' + (compFinding.detected ? ', and the ' + compFinding.date + ' repricing needs reading first.' : '.'), '$0', { jump: 'catalog-check' });
  const minutes = v => n(v, 0) + ' min';
  add('act-tech', 'action', dt.tech.best.value >= dt.tech.cost ? 'Add a technician' : 'No added technician', 'A second ' + ['day', 'swing', 'grave'][dt.tech.best.shift] + '-shift technician would recover about ' + cash(dt.tech.best.value) +
    ' of expected win in July, against a ' + cash(dt.tech.cost) + ' cost.', dt.tech.best.value >= dt.tech.cost ? cash(dt.tech.cost) : '$0', { jump: 'catalog-check' });
  add('act-pm', 'action', dt.pm.breakEven <= .5 ? 'Preventive sweep' : 'No preventive sweep', 'A ' + dt.pm.full.make + ' sweep breaks even only if it removes ' + pct(dt.pm.breakEven, 0) + ' of that make’s excess faults.',
    dt.pm.breakEven <= .5 ? cash(dt.pm.cost) : '$0', { jump: 'catalog-check' });
  for (const a of ['act-inspect', 'act-move', 'act-staff', 'act-promo', 'act-reserve', 'act-comp', 'act-tech', 'act-pm']) link('plan', a);

  add('q1', 'question', 'Q1 · Machine audit', 'Why do the lowest earners earn so little?', '', { goto: 'audit' });
  add('q2', 'question', 'Q2/Q3 · Demand & uptime', 'How did demand and machine uptime change?', '', { goto: 'demand' });
  add('q4', 'question', 'Q4/Q5 · Guests & comps', 'Who plays, what do comps cost, and did the comp program change?', '', { goto: 'guests' });
  add('qm', 'question', 'Model validation', 'Is the forecast good enough to staff from?', '', { goto: 'model' });
  add('q6', 'question', 'Q6 · July decision', 'What should July’s budget fund?', '', { goto: 'plan' });
  link('q6', 'plan');

  add('ev-verdicts', 'evidence', 'Bottom-ten verdicts', n(quietCohort.length) + ' of 10 lowest earners sit in quiet zones; ' + n(payoutCohort.length) + ' has a payout flag.', '', { jump: 'verdict-check' });
  const configLeads = payoutConfig.rtpMismatches.length + payoutConfig.meterMismatches.length + payoutConfig.dailyChanges.length + payoutConfig.placementChanges.length;
  add('ev-adjusted', 'evidence', 'Adjusted ranking', n(fullOverlap.both.length) + ' of the 10 lowest raw earners stay in the bottom ten once exposure, luck and placement are removed; ' +
    n(fullOverlap.outsideLuck.length) + ' cabinets fall outside their luck bounds. Payout-config check: ' + (configLeads ? n(configLeads) + ' leads to inspect.' : 'no mismatches or changes.'),
    n(fullOverlap.both.length) + ' of 10 overlap', { jump: 'adjusted-check' });
  add('ev-hold', 'evidence', 'Weekly payout check', 'M-1158’s week-by-week payout gap against same-configuration peers.', pp(inspect.res), { evidence: inspect.id, section: 'hold-check' });
  const hit = m.hitFinding, hitLead = hit.lead;
  add('ev-hit', 'evidence', 'Hit-frequency check', hitLead
    ? hitLead.id + '’s spins paid something ' + pct(hitLead.observed, 1) + ' of the time against ' + pct(hitLead.published, 1) + ' in its published game math, in ' + n(hit.detail.above) + ' of ' + n(hit.detail.weeks.length) +
      ' weeks and for carded and uncarded play alike; every other cabinet sits within luck (largest |z| ' + n(hit.maxOther, 1) + '). A paytable lead to inspect, and a one-day check after any fix.'
    : 'No cabinet’s share of paying spins differs from its published game math.', hitLead ? 'z ' + n(hitLead.z, 0) : 'No flag', { jump: 'hit-check' });
  add('ev-moves', 'evidence', 'Past moves', 'What happened to cabinets and banks after four historical moves.', pairsGained + ' of ' + moveCases.length + ' pairs gained', { jump: 'move-check' });
  add('ev-move-econ', 'evidence', 'Relocation economics', 'Net July value of moving M-1181 under capture and displacement scenarios.', pct(moveBreakEven, 0) + ' break-even', { goto: 'plan/moves' });
  add('ev-holdout', 'evidence', 'Forecast holdout test', 'Weekday averages vs “same day last week” on 61 unseen days.', pct(1 - m1 / m7) + ' lower error', { goto: 'model/holdout' });
  add('ev-staffing', 'evidence', 'Staffing replay', 'Simulated May–June staffing calls from each forecast.', n(staffing.hits) + ' of ' + n(staffing.hits + staffing.missed) + ' peaks caught', { jump: 'staffing-check' });
  add('ev-demand', 'evidence', 'Demand trend', 'Monthly wagers alongside events, entrances and city visitors.', '', { goto: 'demand/trend' });
  add('ev-downtime', 'evidence', 'Downtime impact', 'Whether lost play from downtime explains the demand trend, which days it struck and which weekday hours machines are down.', cash(sum(auditRows, r => r.lost) / fullDays) + '/day at risk', { goto: 'demand/downtime' });
  const signedCash = v => (v > 0 ? '+' : '') + cash(v);
  add('ev-zones', 'evidence', 'Zones, traffic & hours', 'April to June, property coin-in moved ' + signedCash(zf.contribution.total) + ' per day: ' + zones[zf.biggest.zone] + ' moved most (' + signedCash(zf.biggest.change) +
    '), and coin-in per available hour accounts for ' + signedCash(zf.rate) + ' of it versus ' + signedCash(zf.hours) + ' from machine-hours. Entries fell in ' + n(zf.trafficFell) + ' of ' + n(zf.trafficZones) + ' zones; play peaks ' + zf.peak.day + ' ' + String(zf.peak.hour).padStart(2, '0') + ':00.',
    signedCash(zf.contribution.total) + '/day', { jump: 'zones-check' });
  add('ev-context', 'evidence', 'Weather & Missouri context', 'Competing explanations from real outside data: ' + (zf.heat[1] < 0 && zf.heat[2] > 0 ? 'no detectable heat effect' : 'a measurable heat effect') + ' on weekday-adjusted wagers, ' + n(zf.rainDays) +
    ' rain days below expectation, and Missouri slot handle per day ' + signedPct(zf.moChange) + ' April to June against ' + signedPct(zf.ownChange) + ' here. Context only, never a forecast input.',
    'Missouri ' + signedPct(zf.moChange), { goto: 'demand/zones' });
  const [dayTest, swingTest] = dt.tests;
  add('ev-response', 'evidence', 'Repair response times', 'Faults wait longer for work to start with one technician on duty: weekday day shifts ' + minutes(dayTest.mean1) + ' vs ' + minutes(dayTest.mean2) + ', swing ' + minutes(swingTest.mean1) + ' vs ' + minutes(swingTest.mean2) +
    '. ' + dt.pm.full.make + ' faults ' + n(dt.pm.full.rate / dt.pm.full.others, 1) + '× as often as the other makes. A technician shift could avoid about ' + pct(dt.avoid.tech / dt.avoid.meter, 0) + ' of downtime and preventive maintenance at most ' + pct(dt.avoid.pm / dt.avoid.meter, 0) + '.',
    minutes(dayTest.mean1) + ' vs ' + minutes(dayTest.mean2), { jump: 'response-check' });
  add('ev-events', 'evidence', 'Event days', 'Wagers on event days vs similar ordinary days.', n(data.events.length) + ' events', { goto: 'demand/events' });
  add('ev-promo', 'evidence', 'Promotion evidence', 'Lift from past promotions and the hurdle a July pilot must clear.', pct(promoHurdle, 1) + ' hurdle', { jump: 'promotion-check' });
  const outcomes = m.fullOutcomes;
  add('ev-players', 'evidence', 'Player concentration', 'The top 10% of active carded players placed ' + pct(outcomes.wagers.top10) + ' of tracked wagers and ' + pct(outcomes.losses.top10) +
    ' of gross losses; ' + n(outcomes.behind) + ' of ' + n(outcomes.active) + ' ended behind. Concentrated losses call for safeguards, not targeting; carded play is reconciled with the machine meters.',
    'Loss Gini ' + n(outcomes.losses.gini, 2), { jump: 'players-check' });
  add('ev-comps', 'evidence', 'Comps & loyalty', 'What comps cost relative to play, month by month.', '', { goto: 'guests/comps' });
  add('ev-comp-break', 'evidence', 'Comp program change', compFinding.detected
    ? 'On ' + compFinding.date + ' comps were repriced from ' + compFinding.price + ' (' + compFinding.priceChange + ', ' + compFinding.rank + '), within every tier; earn rates' + (compFinding.costFaceFlat ? ' and cost per face-value dollar' : '') + (m.tierRules.stable ? ' held, and so did tier rules.' : ' held, but tier-rule brackets moved.')
    : 'No break in comp prices, earn rates or tier rules across January–June.', compFinding.detected ? compFinding.date + ' · ' + compFinding.priceChange : 'No break', { jump: 'comp-break-check' });
  const cv = m.compVisits.real;
  add('ev-comp-visits', 'evidence', 'Comp repricing and visits', 'After the ' + months[month(cv.split)] + ' ' + Number(cv.split.slice(8)) + ' repricing, comp users’ visits moved ' + signedPct(cv.did) + ' relative to other recent guests (95% interval ' + signedPct(cv.interval[0]) + ' to ' + signedPct(cv.interval[1]) +
    '), within the drift seen at placebo dates: cheaper comps bought no measurable extra visits.', signedPct(cv.did) + ' visits', { jump: 'comp-visits-check' });
  add('ev-catalog', 'evidence', 'Action catalog', 'Every priced action and why it was funded, deferred or passed.', n(data.actions.length) + ' actions', { jump: 'catalog-check' });

  for (const [a, list] of Object.entries({ 'act-inspect': ['ev-hold', 'ev-hit', 'ev-verdicts', 'ev-adjusted'], 'act-move': ['ev-moves', 'ev-move-econ'], 'act-staff': ['ev-staffing', 'ev-holdout', 'ev-zones'],
    'act-promo': ['ev-promo', 'ev-events'], 'act-reserve': ['ev-catalog', 'ev-adjusted'],
    q1: ['ev-verdicts', 'ev-adjusted', 'ev-hold', 'ev-hit'], q2: ['ev-demand', 'ev-zones', 'ev-context', 'ev-downtime', 'ev-response', 'ev-events'],
    'act-tech': ['ev-response', 'ev-downtime', 'ev-catalog'], 'act-pm': ['ev-response', 'ev-downtime', 'ev-catalog'], q4: ['ev-players', 'ev-comps', 'ev-comp-break', 'ev-comp-visits'], 'ev-comps': ['ev-catalog'], 'act-comp': ['ev-comp-break', 'ev-comp-visits', 'ev-comps', 'ev-players'], 'ev-comp-break': ['ev-catalog'], qm: ['ev-holdout', 'ev-staffing'], q6: ['ev-catalog', 'ev-moves', 'ev-move-econ', 'ev-promo'] }))
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
  add('src-gamemath', 'source', 'Game math & placements', 'Published payout rate and variance per game, and which configuration each cabinet ran.', n(payoutConfig.configs) + ' configurations');
  add('src-ledger', 'source', 'Loyalty ledger', 'Every points award and comp redemption, with tier, face value and cost.', n(sum(data.loyalty.rows, r => r[7])) + ' redemptions');
  add('src-trips', 'source', 'Recorded visits', 'Each loyalty card’s recorded visits to this casino (not whole Las Vegas trips).', n(m.compVisits.real.cohort) + ' guests in the visit test');
  add('src-sessions', 'source', 'Carded sessions', 'Carded play segments with spins and paying spins, used to split hit rates by player group and bet size.', hitLead ? n(hit.detail.cardedSpins) + ' carded spins on ' + hitLead.id : '');
  add('src-roster', 'source', 'Shift roster', 'Slot technicians planned and actually on duty for every day, swing and grave shift.', n(data.downtime.roster.length) + ' technician shifts');
  add('src-tickets', 'source', 'Fault tickets', 'Repair tickets with the time each fault opened, work started and the machine came back.', n(data.downtime.tickets.length) + ' tickets');
  add('src-catalog', 'source', 'Action catalog', 'Costs and lead times for every July action.', n(data.actions.length) + ' actions');
  add('src-city', 'source', 'LVCVA visitation', 'Monthly Las Vegas visitor counts for market context.', n(data.city.length) + ' months');
  add('src-hourly', 'source', 'Hourly machine meters', 'Wagers and available time by cabinet and local clock hour, aggregated to weekday × hour cells.', '7 × 24 cells');
  add('src-traffic', 'source', 'Zone traffic counters', 'Hourly door and zone entries; offline hours excluded, entries are not unique guests.', pct(zf.coverage, 1) + ' coverage');
  add('src-weather', 'source', 'NOAA weather', 'Daily high temperature and rain at Las Vegas airport (real data, context only).', n(data.weather.days.length) + ' days');
  add('src-missouri', 'source', 'Missouri benchmark', 'Missouri Gaming Commission monthly slot handle for 13 casinos (real data, context only).', n(data.missouri.state.length) + ' months');
  for (const [a, list] of Object.entries({ 'src-roster': ['ev-response'], 'src-tickets': ['ev-response', 'ev-downtime'], 'src-hourly': ['ev-zones', 'ev-downtime'], 'src-traffic': ['ev-zones'], 'src-weather': ['ev-context'], 'src-missouri': ['ev-context'], 'src-meters': ['ev-verdicts', 'ev-adjusted', 'ev-hold', 'ev-hit', 'ev-downtime', 'ev-moves', 'ev-demand', 'ev-players', 'ev-zones'], 'src-property': ['ev-demand', 'ev-context', 'ev-holdout', 'ev-staffing', 'ev-events'],
    'src-players': ['ev-players', 'ev-comps'], 'src-ledger': ['ev-comp-break', 'ev-comp-visits'], 'src-trips': ['ev-comp-visits'], 'src-events': ['ev-events', 'ev-holdout', 'ev-promo'], 'src-moves': ['ev-moves'], 'src-gamemath': ['ev-adjusted', 'ev-hit'], 'src-sessions': ['ev-hit'], 'src-catalog': ['ev-catalog', 'ev-move-econ'], 'src-city': ['ev-demand'] }))
    for (const b of list) link(a, b);

  const byId = new Map(nodes.map(nd => [nd.id, nd]));
  for (const nd of nodes) nd.nb = new Set();
  const valid = links.filter(l => byId.has(l.a) && byId.has(l.b));
  for (const l of valid) { byId.get(l.a).nb.add(l.b); byId.get(l.b).nb.add(l.a); }
  return { nodes, links: valid, byId };
}

/** Which question (tab) each evidence node answers, in display order. */
export function evidenceByQuestion(graph) {
  const groups = graph.nodes.filter(nd => nd.type === 'question').map(q => ({
    question: q,
    evidence: [...q.nb].map(id => graph.byId.get(id)).filter(nd => nd.type === 'evidence' && firstQuestion(graph, nd) === q.id),
  })).filter(g => g.evidence.length);
  // Never drop evidence that no question claims; show it in its own group.
  const placed = new Set(groups.flatMap(g => g.evidence.map(ev => ev.id)));
  const orphans = graph.nodes.filter(nd => nd.type === 'evidence' && !placed.has(nd.id));
  if (orphans.length) groups.push({ question: { id: 'q-other', type: 'question', label: 'Other evidence', summary: 'Evidence not tied to a single question.', nb: new Set(orphans.map(o => o.id)) }, evidence: orphans });
  return groups;
}
/** An evidence node can serve two questions; it is drawn under the first one listed. */
function firstQuestion(graph, ev) {
  return graph.nodes.find(nd => nd.type === 'question' && nd.nb.has(ev.id))?.id;
}

/** Flow links between adjacent stages, oriented left to right. */
export function flowLinks(graph) {
  const out = [];
  for (const { a, b } of graph.links) {
    const A = graph.byId.get(a), B = graph.byId.get(b);
    if (!(A.type in RANK) || !(B.type in RANK) || RANK[A.type] === RANK[B.type]) continue;
    out.push(RANK[A.type] < RANK[B.type] ? { from: A.id, to: B.id } : { from: B.id, to: A.id });
  }
  return out;
}

/** Everything upstream and downstream of the given nodes along the flow: its full line of evidence. */
export function lineage(graph, ids) {
  const links = flowLinks(graph), keep = new Set(ids);
  const walk = (start, dir) => {
    const stack = [start];
    while (stack.length) {
      const cur = stack.pop();
      for (const l of links) {
        const next = dir > 0 ? (l.from === cur ? l.to : null) : (l.to === cur ? l.from : null);
        if (next && !keep.has(next)) { keep.add(next); stack.push(next); }
      }
    }
  };
  for (const id of ids) { walk(id, 1); walk(id, -1); }
  return keep;
}
