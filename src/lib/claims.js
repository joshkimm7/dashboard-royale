// The claims appendix (CLAIMS-AND-EVIDENCE.md) as data for the in-dashboard "Claims & evidence" page.
// Every `result` fragment (optionally after a short display lead-in that is not quoted) is computed from the model with the same expressions as scripts/check-claims.mjs, and that
// script fails if a fragment or a claim title no longer appears verbatim in the appendix, so the page and the
// appendix cannot drift apart. Method and limitation texts are short static summaries of the appendix columns.
import { by, cash, month, n, pct, ratio, sum } from './format.js';
import { downHeat, responseStats } from './downtime.js';
import { playerBreakdown, playerOutcomes } from './model.js';

/** Row ids, in display order. Each is a deep-link section (`#section=claim-…`) on the Claims page. */
export const CLAIM_IDS = ['claim-raw-win', 'claim-adjusted', 'claim-m1158', 'claim-hit', 'claim-demand', 'claim-zones', 'claim-traffic', 'claim-heat',
  'claim-weather', 'claim-missouri', 'claim-downtime', 'claim-downtime-when', 'claim-response', 'claim-avoidable', 'claim-carded', 'claim-lorenz',
  'claim-outcomes', 'claim-age', 'claim-reconcile', 'claim-comp-cost', 'claim-comp-break', 'claim-comp-visits', 'claim-reinvest', 'claim-forecast',
  'claim-staffing', 'claim-moves', 'claim-decision', 'claim-ledger', 'claim-inspection', 'claim-window', 'claim-promotion', 'claim-alternatives', 'claim-repair'];

const signed = v => (v > 0 ? '+' : '') + cash(v);
const signedPct1 = v => (v > 0 ? '+' : v < 0 ? '−' : '') + pct(Math.abs(v));
const signedN = (v, d) => (v > 0 ? '+' : v < 0 ? '−' : '') + n(Math.abs(v), d);
const millions = (v, d = 2) => (v < 0 ? '−' : '') + '$' + (Math.abs(v) / 1e6).toFixed(d) + 'm';
const thousands = v => '$' + Math.round(v / 1000) + 'k';
const pp2 = v => (v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(2);
const sc = v => (v > 0 ? '+' : '') + cash(v);
const WORDS = ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const word = v => WORDS[v] ?? n(v);
const fell = v => (v < 0 ? 'fell ' : 'rose ') + pct(Math.abs(v));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June'];

/**
 * Claim rows: { id, group, claim, method, result: [fragment | [display lead, fragment]], alt, evidence: [{ label, section } | { label, goto } | { label, machine, section }] }.
 * Heavy guest aggregates run here, so call once per model (the page memoizes it).
 */
export function buildClaims(m) {
  const data = m.data, v = data.validation;
  const dayName = d => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'][month(d)] + ' ' + Number(d.slice(8));

  // Demand (same monthly logic as Demand.jsx and check-claims.mjs, full period, all banks)
  const daily = [...by(m.auditRows, r => r.d).entries()].sort((a, b) => a[0] - b[0]);
  const monthly = [...by(daily, ([d]) => month(data.dates[d])).entries()].map(([mo, days]) => {
    const obs = days.map(([d, g]) => ({ d, coin: sum(g, r => r.coin), lost: sum(g, r => r.lost) }));
    return { m: mo, coin: sum(obs, r => r.coin) / days.length, adjusted: m.weekdayAdjusted(obs, r => r.coin),
      city: data.city.find(c => month(c[0] + '-01') === mo)?.[1],
      entrance: (rows => sum(rows, r => r[6]) / rows.length)(data.property.filter(r => month(r[0]) === mo)) };
  });
  const M = i => monthly.find(r => r.m === i);
  const febDays = daily.filter(([d]) => month(data.dates[d]) === 1).map(([d, g]) => ({ d, coin: sum(g, r => r.coin) }));
  const febNoSB = febDays.filter(r => !(data.property[r.d][2] ?? '').includes('Super Bowl'));
  const peak = monthly.reduce((b, r) => (!b || r.adjusted > b.adjusted ? r : b), null);
  const makeDown = [...by(m.auditRows, r => r.make).entries()].map(([k, g]) => [k, sum(g, r => r.down)]).sort((a, b) => b[1] - a[1]);
  const totalDown = sum(m.auditRows, r => r.down);

  // Q1
  const adj = m.fullOverlap, cfg = m.payoutConfig, focalRank = m.fullRanking.rows.find(r => r.id === m.inspect.id), hit = m.hitFinding;
  const quiet = m.quietCohort.length;

  // Q2 zones and context
  const zf = m.zoneFinding, zc = zf.contribution, zname = z => m.zones[z];
  const ci = (x, f = sc) => f(x[0]) + ' (95% interval ' + f(x[1]) + ' to ' + f(x[2]) + ')';

  // Q3 downtime
  const dt = m.downtime, [dayTest, swingTest] = dt.tests, av = dt.avoid, shiftName = ['day', 'swing', 'grave'][dt.tech.best.shift];
  const testText = t => n(t.mean1, 0) + ' vs ' + n(t.mean2, 0) + ' minutes (gap 95% interval ' + n(t.lo, 0) + ' to ' + n(t.hi, 0) + ')';
  const downCells = downHeat(data, '', 0, 5), downTotal = sum(downCells, c => c.down);
  const shiftShare = k => pct(sum(downCells.filter(c => Math.floor(((c.hour - 6 + 24) % 24) / 8) === k), c => c.down) / downTotal, 0);
  const downPeak = downCells.reduce((a, b) => b.value > a.value ? b : a);
  const perDayDown = daily.map(([d, g]) => ({ date: data.dates[d], down: sum(g, r => r.down) }));
  const worstDay = perDayDown.reduce((a, b) => b.down > a.down ? b : a);

  // Q4 guests (per-player totals, as in Guests.jsx)
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
  const fo = m.fullOutcomes;
  const lorenzPart = c => [c.top1, c.top10, c.top20].map(x => pct(x)).join(' / ');
  const mostBin = fo.bins.reduce((b, x) => x.players > b.players ? x : b);
  const ageGroups = playerBreakdown(data.players, r => m.ageOf(r[0]));
  const ageGini = m.ageBands.map(age => playerOutcomes(m.playerRows({ age })).wagers.gini);
  const cardedTot = i => sum(data.carded, r => r[i]);
  const allWin = cardedTot(1) - cardedTot(2), cardedWin = cardedTot(4) - cardedTot(5);

  // Q5 comps
  const cb = m.fullBreak, cf = m.compFinding, cv = m.compVisits.real;
  const monthComp = mo => (rows => sum(rows, r => r[9]) / sum(rows, r => r[5]))(data.property.filter(r => month(r[0]) === mo));
  const reinvestBy = col => [...by(data.players, r => r[col]).entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, rows]) => [k, pct(sum(rows, r => r[8]) / sum(rows, r => r[9]), 2)]);
  const [tierCells, regionCells] = [reinvestBy(3), reinvestBy(2)];
  const visitorCells = regionCells.filter(([k]) => k !== 'Local');

  // Model, staffing, July actions
  const peakAt = cutoff => {
    const at = col => { const s = m.schedulingScore('Peak', col, c => (c >= cutoff ? 'Peak' : 'Other')); return { caught: s.hits, peaks: s.hits + s.missed }; };
    const w = at(10), l = at(12);
    return w.caught === l.caught ? 'At ' + millions(cutoff) + ' both forecasts catch ' + n(w.caught) + ' of ' + n(w.peaks) + ' peaks' : 'At ' + millions(cutoff) + ', weekday averages catch ' + n(w.caught) + ' vs ' + n(l.caught);
  };
  const captures = data.moves.filter(r => r.main?.capture != null).map(r => r.main.capture);
  const pairPcts = m.moveCases.map(r => r.main.bankPct);
  const cabinetsUp = m.moveCases.filter(r => r.main.cabinet > 0).length;
  const slot = m.inspectionSlot, hold = m.windowHold;
  const [tournament, locals] = data.promotions;
  const comp = m.catalogue['A-COMP-PILOT'];
  const compSpend = sum(data.property, r => r[9]) / m.fullDays * Math.max(0, 30 - comp[4]);

  return [
    // ---- Q1 · Machine audit
    { id: 'claim-raw-win', group: 'Q1 · Machine audit', claim: 'Raw win understates the exposure and placement of the shortlist',
      method: 'Rank total house win over placed days, then compare each cabinet’s wagers with matched same-configuration zone peers at the same available hours.',
      result: [word(quiet) + ' of ten flagged for quiet placement' + (m.payoutOverlap.length ? ', including ' + m.payoutOverlap.join(' and ') : ''),
        (m.cohort.filter(x => x.flags.includes('Low peer demand')).length ? n(m.cohort.filter(x => x.flags.includes('Low peer demand')).length) + ' of the ten' : 'None of the ten') + ' fell below 80% of matched local play'],
      alt: 'Peer matching controls weekday and configuration mix; it is descriptive, so traffic or selection can still confound location.',
      evidence: [{ label: 'Bottom-ten verdicts', section: 'verdict-check' }] },
    { id: 'claim-adjusted', group: 'Q1 · Machine audit', claim: 'Few of the raw bottom ten are weak once exposure, luck and placement are removed',
      method: 'Expected win against matched zone peers at the same hours (ratio of sums), shrunk toward 100% with a credibility constant k; luck bounds from game-math variance.',
      result: [['Credibility constant ', 'k = ' + n(m.credibility.k) + ' hours'], 'Only ' + n(adj.both.length) + ' of the raw bottom ten (' + adj.both.map(r => r.id).join(', ') + ') is in the adjusted bottom ten',
        n(adj.outsideLuck.length) + ' of ' + n(m.fullRanking.rows.filter(r => r.z != null).length) + ' cabinets fall outside their own luck bounds',
        m.inspect.id + ' sits ' + (focalRank.z < 0 ? '−' : '') + Math.abs(focalRank.z).toFixed(2) + ' standard errors below its configured hold',
        ['Payout-config check: ', (cfg.rtpMismatches.length ? n(cfg.rtpMismatches.length) + ' RTP mismatches' : 'no RTP mismatches') + ' in ' + n(cfg.machineDays) + ' machine-days']],
      alt: 'The adjusted bottom ten holds at half or double k. The index is relative to same-game zone peers, so a uniformly quiet zone scores near 100%.',
      evidence: [{ label: 'Adjusted ranking', section: 'adjusted-check' }, { label: 'Luck bounds', section: 'funnel-check' }, { label: 'Payout-config check', section: 'config-check' }] },
    { id: 'claim-m1158', group: 'Q1 · Machine audit', claim: 'M-1158 warrants paytable and meter verification',
      method: 'Actual minus configured win over total coin-in, weekly clustered errors and Benjamini–Hochberg adjustment over eligible machines.',
      result: [cash(m.inspect.win) + ' actual versus ' + cash(m.inspect.theo) + ' expected', ['Payout gap ', pp2(m.inspect.res) + ' percentage points'],
        n(m.weeksBelow) + ' of ' + n(m.focalWeeks.length) + ' weeks below expectation',
        'Removing the worst week left a ' + pp2(m.withoutWorst.res) + ' percentage-point gap (approximate 95% interval ' + pp2(m.withoutWorst.lo) + ' to ' + pp2(m.withoutWorst.hi) + ' points)',
        'Local demand was ' + pct(m.inspect.local, 0) + ' of matched peers'],
      alt: 'Low demand and downtime cannot explain a gap on wagers already placed. Jackpots or reporting errors can still cause one; q is not a fault probability.',
      evidence: [{ label: 'Weekly payout check', machine: m.inspect.id, section: 'hold-check' }] },
    { id: 'claim-hit', group: 'Q1 · Machine audit', claim: 'M-1158 pays on far more spins than its published game math, a paytable lead',
      method: 'Paying spins against the published hit probability per cabinet; binomial z with Benjamini–Hochberg across all cabinets.',
      result: [hit.lead.id + ' paid on ' + pct(hit.lead.observed) + ' of ' + n(hit.lead.spins) + ' all-play spins against a published ' + pct(hit.lead.published) + ' (z ' + n(hit.lead.z, 1) + '), above it in ' + n(hit.detail.above) + ' of ' + n(hit.detail.weeks.length) + ' weeks',
        n(hit.detail.medianDaySpins) + ' spins on a median day put the gap at ' + n(hit.detail.daySeparation, 1) + ' daily standard errors'],
      alt: 'Carded vs uncarded play, bet size, timing and a placebo over every other cabinet all point the same way. A lead to inspect, not proof of a fault.',
      evidence: [{ label: 'Hit-frequency check', section: 'hit-check' }] },
    // ---- Q2 · Demand
    { id: 'claim-demand', group: 'Q2 · Demand', claim: 'Demand eased after an adjusted April peak',
      method: 'Monthly wagers per day; adjusted series drops event days and weights the seven weekdays equally.',
      result: ['February falls from ' + millions(sum(febDays, r => r.coin) / febDays.length, 3) + '/day to ' + millions(sum(febNoSB, r => r.coin) / febNoSB.length, 3),
        'The adjusted series peaks in ' + MONTHS[peak.m] + ' at ' + millions(peak.adjusted, 3) + '/day',
        'From April to June, adjusted wagers ' + fell(M(5).adjusted / M(3).adjusted - 1) + ' versus a ' + pct(Math.abs(M(5).city / M(3).city - 1)) + ' decline in LVCVA visitors/day',
        'Property entrance counts ' + fell(M(5).entrance / M(3).entrance - 1)],
      alt: 'The visitor comparison is consistent with broader market softness; six months cannot identify seasonality.',
      evidence: [{ label: 'Demand trend', goto: 'demand/trend' }] },
    { id: 'claim-zones', group: 'Q2 · Demand', claim: 'The April→June decline is lower play per available hour across zones, not lost machine time',
      method: 'Additive zone decomposition of property coin-in per day, each zone split into a machine-hours effect and a rate effect that sum exactly.',
      result: ['Property coin-in moved ' + sc(zc.total) + ' per day; ' + zname(zf.biggest.zone) + ' moved most (' + sc(zf.biggest.change) + ', ' + pct(zf.biggest.share, 0) + ')',
        'Machine-hours effect ' + sc(zf.hours) + ', rate effect ' + sc(zf.rate)],
      alt: 'Downtime or fewer cabinets would show as a machine-hours effect, which is near zero. Zones show where play moved, not why.',
      evidence: [{ label: 'Zones & context', section: 'zones-check' }] },
    { id: 'claim-traffic', group: 'Q2 · Demand', claim: 'Zone traffic fell in most zones, but counts are entries, not guests',
      method: 'Entries per covered minute scaled to a day; offline counters are excluded, never counted as zero.',
      result: ['Entries per day fell in ' + n(zf.trafficFell) + ' of ' + n(zf.trafficZones) + ' zones. Counters covered ' + pct(zf.coverage, 1) + ' of zone-minutes with ' + n(zf.offline) + ' offline sensor-hours'],
      alt: 'Entries count crossings, so one guest can count many times; a direction check, not a visitor count.',
      evidence: [{ label: 'Zones & context', section: 'zones-check' }] },
    { id: 'claim-heat', group: 'Q2 · Demand', claim: 'Play concentrates on weekend evenings',
      method: 'Hourly coin-in by gaming-day weekday and local clock hour, averaged over the gaming days contributing each cell.',
      result: [['The ', 'busiest clock hour is ' + zf.peak.day + ' ' + String(zf.peak.hour).padStart(2, '0') + ':00 (' + cash(zf.peak.value) + ' per hour)']],
      alt: 'A six-month average hides month-to-month shifts; the heat map follows the month filter.',
      evidence: [{ label: 'Zones & context', section: 'zones-check' }] },
    { id: 'claim-weather', group: 'Q2 · Demand', claim: 'Weather does not explain the April→June decline (context only)',
      method: 'NOAA daily weather; OLS of event-free daily coin-in on weekday, daily high and rain, with Newey–West intervals and a random-day placebo.',
      result: ['Heat: ' + ci(zf.heat) + ' per +10 °C weekday-adjusted', 'Rain (' + n(zf.rainDays) + ' days): ' + ci(zf.rain)],
      alt: 'Heat is a null result. Rain days run low but none fall in April or June. Weather is published after the fact and never a forecast input.',
      evidence: [{ label: 'Zones & context', section: 'zones-check' }] },
    { id: 'claim-missouri', group: 'Q2 · Demand', claim: 'The outside market softened too, by less',
      method: 'Missouri Gaming Commission statewide slot handle per day against property coin-in per day, April to June.',
      result: ['Missouri statewide slot handle per day ' + signedPct1(zf.moChange) + ' vs ' + signedPct1(zf.ownChange) + ' at the property; ' + n(zf.moFell) + ' of ' + n(zf.moCount) + ' Missouri casinos fell'],
      alt: 'A different market with its own seasonality: a direction check, never a level benchmark or forecast input.',
      evidence: [{ label: 'Zones & context', section: 'zones-check' }] },
    // ---- Q3 · Downtime
    { id: 'claim-downtime', group: 'Q3 · Uptime', claim: 'Downtime is operationally concentrated',
      method: 'Scheduled minus available hours, priced at each cabinet’s same-weekday fully available wager rate.',
      result: [n(totalDown) + ' meter hours, ' + millions(sum(m.auditRows, r => r.lost), 3) + ' estimated wagers and ' + cash(sum(m.auditRows, r => r.lostTheo)) + ' theo at risk',
        makeDown[0][0] + ' accounted for ' + pct(makeDown[0][1] / totalDown) + ' of meter downtime', 'Daily wager risk averaged ' + cash(sum(m.auditRows, r => r.lost) / m.fullDays)],
      alt: 'Ticket time can overlap; substitution and avoidability limit how much of the risk is recoverable.',
      evidence: [{ label: 'Downtime impact', goto: 'demand/downtime' }, { label: 'Repairs & tickets', goto: 'demand/repairs' }] },
    { id: 'claim-downtime-when', group: 'Q3 · Uptime', claim: 'Downtime falls most overnight, and on a few bad days',
      method: 'Hourly scheduled minus available seconds, by gaming-day weekday and clock hour, averaged over contributing days.',
      result: ['Downtime averaged ' + n(downTotal / data.dates.length, 1) + ' machine-hours per gaming day; worst ' + worstDay.date + ' (' + n(worstDay.down, 1) + ')',
        ['Share of down machine-hours by shift: ', 'day ' + shiftShare(0) + ', swing ' + shiftShare(1) + ', grave ' + shiftShare(2)],
        ['Worst weekday-hour cell: ', data.heat.weekdays[downPeak.weekday] + ' ' + String(downPeak.hour).padStart(2, '0') + ':00 (' + n(downPeak.value, 2) + ' machine-hours down on average)']],
      alt: 'Grave carries more downtime but the quietest play, so each hour costs less. Single long faults shape individual cells; read shifts, not cells.',
      evidence: [{ label: 'Downtime impact', goto: 'demand/downtime' }] },
    { id: 'claim-response', group: 'Q3 · Uptime', claim: 'Faults wait longer with one technician on duty',
      method: 'Fault tickets matched to the technician roster; like shifts only, April–June, bootstrap intervals and a permutation test.',
      result: [['One vs two technicians, ', 'weekday day shifts ' + testText(dayTest)], ['One vs two technicians, ', 'swing shifts ' + testText(swingTest)],
        'A second technician removed ' + pct(dt.share.share, 0) + ' of the waiting (95% interval ' + pct(dt.share.lo, 0) + ' to ' + pct(dt.share.hi, 0) + ')'],
      alt: 'Ticket load cannot explain the day-shift gap but may explain part of the swing gap. Shortages were not random.',
      evidence: [{ label: 'Response times', section: 'response-check' }] },
    { id: 'claim-avoidable', group: 'Q3 · Uptime', claim: 'Ticket overlap and avoidable downtime',
      method: 'Fault and operation tickets reconciled to meter hours; technician- and maintenance-avoidable shares with their overlap removed once.',
      result: [n(dt.overlap.faultHours, 1) + ' fault-ticket hours + ' + n(dt.overlap.otherHours, 1) + ' other operation hours = ' + n(dt.overlap.meterHours, 1) + ' meter hours',
        ['Avoidable meter downtime: ', 'technician ' + n(av.tech, 0) + ' h (' + pct(av.tech / av.meter, 0) + '), preventive maintenance at most ' + n(av.pm, 0) + ' h (' + pct(av.pm / av.meter, 0) + '), either ' + n(av.either, 0) + ' h (' + pct(av.either / av.meter, 0) + ') after ' + n(av.overlap, 0) + ' h of overlap']],
      alt: 'The preventive figure is a ceiling: it assumes a sweep brings the make fully level with the others, which no recorded sweep shows.',
      evidence: [{ label: 'Response times', section: 'response-check' }] },
    // ---- Q4 · Guests
    { id: 'claim-carded', group: 'Q4 · Guests', claim: 'Carded play and loss are concentrated',
      method: 'Player-month values summed per player before ranking; top 1% of active players by wagers and, separately, by gross loss.',
      result: [millions(cardedCoin) + ' wagered, ' + millions(cardedPayout) + ' paid out, ' + millions(cardedNet) + ' net',
        'Of ' + n(p.length) + ' cardholders, ' + n(active.length) + ' recorded positive wagers',
        ['The top 1% of active carded players ', 'accounted for ' + pct(ratio(topCoin, cardedCoin)) + ' of tracked wagers or ' + pct(ratio(topLoss, grossLoss)) + ' of gross tracked losses']],
      alt: 'Loyalty-card play only; neither ranking measures a player’s total gambling.',
      evidence: [{ label: 'Player concentration', section: 'players-check' }] },
    { id: 'claim-lorenz', group: 'Q4 · Guests', claim: 'Wagers and losses are concentrated across the whole curve, not just the top 1%',
      method: 'Lorenz curves and Gini of per-player wagers and gross losses, recomputed independently in pandas and checked to agree.',
      result: ['Top 1% / 10% / 20% of active players: ' + lorenzPart(fo.wagers) + ' of tracked wagers (Gini ' + n(fo.wagers.gini, 2) + ') and ' + lorenzPart(fo.losses) + ' of gross losses (Gini ' + n(fo.losses.gini, 2) + ')'],
      alt: 'Concentration is used only to argue for safeguards, never to target heavy losers.',
      evidence: [{ label: 'Player concentration', section: 'players-check' }] },
    { id: 'claim-outcomes', group: 'Q4 · Guests', claim: 'Most active players ended behind, and the outcome distribution is lopsided',
      method: 'Per-player net over January–June, binned symmetrically around zero.',
      result: [n(fo.behind) + ' of ' + n(fo.active) + ' active players (' + pct(fo.behind / fo.active) + ') ended behind', 'The most common result was ' + mostBin.label],
      alt: 'Month-by-month views show more winners because months net out; the period view matches what a guest kept.',
      evidence: [{ label: 'Player concentration', section: 'players-check' }] },
    { id: 'claim-age', group: 'Q4 · Guests', claim: 'Outcomes barely differ by age band',
      method: 'Ratio-of-sums hold and wager Gini per age band, after per-player aggregation.',
      result: ['Hold by age band ranges ' + pct(Math.min(...ageGroups.map(g => g.hold)), 2) + ' to ' + pct(Math.max(...ageGroups.map(g => g.hold)), 2) +
        '; the wager Gini ranges ' + n(Math.min(...ageGini), 2) + ' to ' + n(Math.max(...ageGini), 2)],
      alt: 'Age band is coarse and self-reported; no claim is made about individuals.',
      evidence: [{ label: 'Player concentration (use the Age band filter)', section: 'players-check' }] },
    { id: 'claim-reconcile', group: 'Q4 · Guests', claim: 'Carded play is about two-thirds of the floor, and the two sources reconcile',
      method: 'Carded meter columns against all-play meters by month, and against player-table tracked wagers.',
      result: ['Loyalty cards recorded ' + pct(cardedTot(4) / cardedTot(1)) + ' of all coin-in and ' + pct(cardedWin / allWin) + ' of total house win',
        'Player-table carded wagers ' + millions(cardedCoin) + ' vs carded meters ' + millions(cardedTot(4))],
      alt: 'Uncarded play has no player attributes, so guest filters cannot apply to the meter side.',
      evidence: [{ label: 'Player concentration', section: 'players-check' }] },
    // ---- Q5 · Comps
    { id: 'claim-comp-cost', group: 'Q5 · Comps', claim: 'Comp cost intensity rose',
      method: 'Monthly property comp cost divided by expected win from all slot play.',
      result: [cash(sum(data.property, r => r[9])) + ' cost on ' + cash(sum(data.property, r => r[8])) + ' face value',
        ['Comp cost as a share of expected win ', 'rose from ' + pct(monthComp(0), 2) + ' in January to ' + pct(monthComp(5), 2) + ' in June']],
      alt: 'Cost per face-value dollar held steady; comp cost is already in POS cost of goods and is not double-counted.',
      evidence: [{ label: 'Comps & loyalty', goto: 'guests/comps' }] },
    { id: 'claim-comp-break', group: 'Q5 · Comps', claim: 'Comps were repriced on May 1; earn rates, item costs and tier rules held',
      method: 'Weekly loyalty-ledger ratios; best single structural break, weekday-matched windows, bootstrap and placebo dates.',
      result: ['Break found on ' + cf.date + ' (' + pct(cb.lead.split.r2, 1) + ' of weekly variation explained)', cf.price + ' (' + cf.priceChange + '; 95% interval ' + cf.priceInterval + ' points)',
        'The real break is ' + cf.rank],
      alt: 'The price fell in every tier, so tier mix cannot explain it. Only two months of after data.',
      evidence: [{ label: 'Comp-program break', section: 'comp-break-check' }] },
    { id: 'claim-comp-visits', group: 'Q5 · Comps', claim: 'Cheaper comps bought no measurable extra visits',
      method: 'Visits 28 days after vs before the repricing, comp users minus other recent guests, guest-resampled intervals and placebo dates.',
      result: [['Visits after the repricing: ', 'comp users ' + signedPct1(cv.usersChange) + ', other recent guests ' + signedPct1(cv.othersChange) + '; difference ' + signedPct1(cv.did) + ' (95% interval ' + signedPct1(cv.interval[0]) + ' to ' + signedPct1(cv.interval[1]) + ')']],
      alt: 'Placebo dates measure ordinary drift and the real estimate sits inside it. A small effect could still hide in the interval.',
      evidence: [{ label: 'Comp visits test', section: 'comp-visits-check' }] },
    { id: 'claim-reinvest', group: 'Q5 · Comps', claim: 'Comp reinvestment varies by region more than tier',
      method: 'Redeemed comp cost over theo per opening tier and home region, ratio of sums.',
      result: ['By opening tier: ' + tierCells.map(([k, x]) => k + ' ' + x).join(', '),
        'Local ' + regionCells.find(([k]) => k === 'Local')[1] + ' vs ' + visitorCells.slice(0, -1).map(([k, x]) => k + ' ' + x).join(', ') + ' and ' + visitorCells.at(-1).join(' ')],
      alt: 'Every Gold and Platinum opening-tier player is Local, so the tier gap is a region effect.',
      evidence: [{ label: 'Comps & loyalty (use the region and tier filters)', goto: 'guests/comps' }] },
    // ---- Model
    { id: 'claim-forecast', group: 'Model validation', claim: 'Weekday model supports scheduling',
      method: 'January–April weekday averages scored against a seven-day lag and a constant on the same 61 unseen May–June days.',
      result: [cash(m.m1) + ' MAE vs ' + cash(m.m7) + ' for the lag and ' + cash(m.mae(m.holdout, 11)) + ' for the constant',
        ['The weekday forecast ', 'beat the lag on ' + n(v.frozen.wins) + ' of ' + n(v.frozen.days) + ' days'], ['Paired block-bootstrap 95% interval: ', signed(v.frozen.interval[0]) + ' to ' + signed(v.frozen.interval[1]) + ' in MAE savings']],
      alt: 'The paired interval crosses zero; the expanding-window test stays above it. Six months do not establish stability in other seasons.',
      evidence: [{ label: 'Holdout test', section: 'holdout-check' }] },
    { id: 'claim-staffing', group: 'Model validation', claim: 'Staffing choice changes with the wagering cutoff',
      method: 'Define peaks with actual wagers at each cutoff and replay the same cutoff on each forecast.',
      result: [peakAt(m.peakThreshold)],
      alt: 'A lower cutoff trades extra coverage for fewer misses. Wagers are a staffing proxy; labor costs were not measured.',
      evidence: [{ label: 'Staffing replay', section: 'staffing-check' }] },
    // ---- Q6 · July decision
    { id: 'claim-moves', group: 'Q6 · July decision', claim: 'Historical moves redistributed wagers across banks',
      method: 'Fourteen days before and after each recorded move, against stable same-configuration cabinets and same-zone banks.',
      result: [word(cabinetsUp) + ' of ' + word(m.moveCases.length).toLowerCase() + ' moved cabinets improved their matched hourly rate',
        [word(m.moveCases.filter(r => r.main.bankPct > 0).length) + ' of ' + word(m.moveCases.length).toLowerCase() + ' bank pairs gained, ', 'with changes from ' + signedPct1(Math.min(...pairPcts)) + ' to ' + signedPct1(Math.max(...pairPcts))],
        ['The closest route ', 'showed a ' + signedPct1(m.closestCase.main.pretrend) + ' relative cabinet pre-trend']],
      alt: 'Pre-trends, four cases and displacement outside the two banks limit causal inference.',
      evidence: [{ label: 'Past moves', section: 'move-check' }] },
    { id: 'claim-decision', group: 'Q6 · July decision', claim: 'Fund the inspection and defer the move',
      method: 'Catalog costs against historical move gains, then July capture and displacement scenarios.',
      result: ['Fund the ' + cash(m.inspectionCost) + ' inspection and reserve ' + cash(m.reserve),
        ['Positive historical gaps at 14 days ', 'yielded ' + signedPct1(Math.max(...captures)) + ' and ' + signedPct1(Math.min(...captures)) + ' capture'],
        'At 50% capture the proposed move changes from ' + signed(m.netMove(.5, 0)) + ' to ' + cash(m.netMove(.5, .10)) + ' with 10% displacement'],
      alt: 'No past move matches the route and configuration; keep the move unfunded until comparable evidence clears its cost.',
      evidence: [{ label: 'Action summary', section: 'action-summary' }, { label: 'Inspect & defer', section: 'inspection-plan' }] },
    { id: 'claim-ledger', group: 'Q6 · July decision', claim: 'The July budget ledger totals exactly $100,000 within the catalog rules',
      method: 'Quantity × (unit cost + recurring cost per day × max(0, 30 − lead days)) for each funded action, plus the kept reserve; then the guide’s plan rules.',
      result: [['Ledger: ', m.julyPlan.arithmetic],
        ...m.julyPlan.lines.map(l => [l.action[0] + ' ', n(l.item.qty) + ' × ' + l.targets.join(', ') + ' costs ' + cash(l.cost) + ' with ' + n(l.days) + ' July days after lead']),
        [n(m.julyPlan.checks.filter(c => c.pass).length) + ' of ' + n(m.julyPlan.checks.length) + ' rules pass: ', m.julyPlan.checks.map(c => c.label[0].toLowerCase() + c.label.slice(1)).join('; ')]],
      alt: 'Keeping the budget is a valid choice under the guide; the reserve covers the promotion weekend only if its trigger is met.',
      evidence: [{ label: 'Budget ledger', section: 'budget-ledger' }, { label: 'Build your own plan', section: 'plan-builder' }] },
    { id: 'claim-inspection', group: 'Q6 · July decision', claim: 'Inspection economics and verification',
      method: 'M-1158’s payout gap per gaming day × July days after the lead; inspection cost over that conditional recovery.',
      result: [cash(m.inspectionCeiling) + ' conditional July recovery and a ' + pct(m.inspectionBreakEven, 1) + ' break-even probability'],
      alt: 'A correctable fault and full recovery are assumptions; zero recovery is credited otherwise.',
      evidence: [{ label: 'Inspect & defer', section: 'inspection-plan' }, { label: 'Weekly payout check', machine: m.inspect.id, section: 'hold-check' }] },
    { id: 'claim-window', group: 'Q6 · July decision', claim: 'Schedule inspection for July 2, 08:00–10:00 Las Vegas time',
      method: 'M-1158’s fully available two-hour windows by weekday and hour, excluding events; lowest expected interruption cost.',
      result: [n(slot.n) + ' comparable windows', 'About ' + cash(slot.coin * hold) + ' of expected win at risk versus ' + cash(slot.typical * hold)],
      alt: 'Depends on historical demand, configured hold and technician availability.',
      evidence: [{ label: 'Inspect & defer', section: 'inspection-plan' }] },
    { id: 'claim-promotion', group: 'Q6 · July decision', claim: 'Promotion weekend stays unfunded until a registration trigger',
      method: 'Event days matched to event-free days of the same month and weekday, with a seven-day follow-up.',
      result: [['Tournament and Locals Week ', 'added about ' + thousands(tournament.during.coin) + ' and ' + thousands(locals.during.coin) + ' in event wagers'],
        ['Expected-win lift through the next seven days ', 'was ' + cash(m.retainedTheo(tournament)) + ' and ' + cash(m.retainedTheo(locals))],
        ['A ' + cash(m.promoCost) + ' weekend ', 'needs ' + pct(m.promoCost / m.retainedTheo(tournament), 1) + ' or ' + pct(m.promoCost / m.retainedTheo(locals), 1) + ' of these lifts']],
      alt: 'Two historical events cannot identify causal lift or transfer to July. Fund one weekend from the reserve only if registrations by July 4 clear the hurdle.',
      evidence: [{ label: 'Promotion', section: 'promotion-check' }] },
    { id: 'claim-alternatives', group: 'Q6 · July decision', claim: 'Alternatives considered for July',
      method: 'Catalog costs prorated after lead time against avoidable waiting, excess faults and projected comp cost.',
      result: [['The ', cash(dt.tech.cost) + ' technician package needs ' + n(dt.tech.need, 1) + '× the ' + cash(dt.tech.best.value) + ' a second ' + shiftName + '-shift technician would recover over ' + dt.tech.days + ' days'],
        ['A ', cash(dt.pm.cost) + ' ' + dt.pm.full.make + ' sweep breaks even only if it removes ' + pct(dt.pm.breakEven, 0) + ' of its excess faults'],
        ['A ', cash(m.actionCost(comp)) + ' comp pilot needs about ' + pct(m.actionCost(comp) / compSpend, 0) + ' savings on ' + cash(compSpend)]],
      alt: 'Staffing shortens waits but grave-shift play is too thin to pay; the sweep’s effect is unknown and its figure is a ceiling.',
      evidence: [{ label: 'Full catalog', section: 'catalog-check' }] },
    { id: 'claim-repair', group: 'Q6 · July decision', claim: 'Repair approval depends on verified recovery and cost',
      method: 'Historical shortfall per day × assumed recovery × 30 operating days, less repair downtime and added costs.',
      result: [['At ' + m.repairScenarios.map(x => pct(x, 0)).join(', ') + ' recovery, ', 'the gross benefits are ' + (vals => vals.slice(0, -1).join(', ') + ', and ' + vals.at(-1))(m.repairScenarios.map(s => cash(m.inspectionGapPerDay * s * m.repairPaybackDays)))]],
      alt: 'No repair is authorized without a confirmed fault and quote; recovery scenarios are assumptions.',
      evidence: [{ label: 'Inspect & defer', section: 'inspection-plan' }] },
  ];
}
