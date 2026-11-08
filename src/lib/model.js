// All dataset-wide analysis, ported unchanged from the original script's top-level code.
// createModel runs once at startup; components read the result through useModel().
import { by, cash, month, months, n, ratio, sum, week } from './format.js';

export const peerDemandCutoff = .8;
export const hasPeerBenchmark = (machine, key) => machine.zoneCover >= .5 && machine[key] != null;
export const underPeerCutoff = (machine, key, cutoff = peerDemandCutoff) => hasPeerBenchmark(machine, key) && machine[key] < cutoff;

export function pNormalTwoSided(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  return Math.min(1, 2 * Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI) * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))));
}
/** Benjamini–Hochberg: writes q onto every entry that has a p-value. */
export function adjustPValues(result) {
  const tests = result.filter(x => x.p != null).sort((a, b) => a.p - b.p);
  let q = 1;
  for (let i = tests.length - 1; i >= 0; i--) {
    q = Math.min(q, tests[i].p * tests.length / (i + 1));
    tests[i].q = q;
  }
}
/** Per-machine audit statistics and screening flags for a set of machine-day rows. */
export function summarize(rs, totalDays) {
  const result = [];
  for (const [id, g] of by(rs, r => r.id)) {
    const coin = sum(g, r => r.coin), win = sum(g, r => r.win), theo = sum(g, r => r.theo), h = sum(g, r => r.h), down = sum(g, r => r.down);
    const comparable = g.filter(r => r.zonePeer > 0 && r.floor != null && r.local != null);
    const localExpected = sum(comparable, r => r.h * r.local), floorExpected = sum(comparable, r => r.h * r.floor);
    const res = ratio(win - theo, coin);
    const weeks = [...by(g.filter(r => r.coin > 0), r => week(r.d)).values()];
    const k = weeks.length;
    const se = k >= 6 && coin > 0 ? Math.sqrt(k / (k - 1) * sum(weeks, w => sum(w, r => r.win - r.theo - res * r.coin) ** 2)) / coin : null;
    const middle = (g[0].d + g.at(-1).d) / 2;
    const halves = [g.filter(r => r.d <= middle), g.filter(r => r.d > middle)].map(a => ratio(sum(a, r => r.win - r.theo), sum(a, r => r.coin)));
    result.push({
      id, g, win, theo, coin, h, down, availability: ratio(h, h + down), days: g.length, hold: ratio(win, coin), res, k, se, p: se > 0 ? pNormalTwoSided(res / se) : null, q: null,
      lo: se == null ? null : res - 1.96 * se, hi: se == null ? null : res + 1.96 * se, halves,
      local: ratio(sum(comparable, r => r.coin), localExpected), zone: ratio(localExpected, floorExpected),
      zoneCover: ratio(sum(g.filter(r => r.zonePeer), r => r.h), h), rate: ratio(coin, h), lost: sum(g, r => r.lost),
      lostTheo: sum(g, r => r.lostTheo), contrib: sum(g, r => r.contrib), banks: [...new Set(g.map(r => r.bank))],
      zones: [...new Set(g.map(r => r.zone))], totalDays,
    });
  }
  adjustPValues(result);
  for (const x of result) {
    const flags = [];
    if (x.q != null && x.q < .05 && x.res < 0 && x.halves.every(v => v != null && v < 0)) flags.push('Inspect hold');
    if (x.days / x.totalDays < .7) flags.push('Short exposure');
    if (ratio(x.down, x.h + x.down) > .02) flags.push('Downtime');
    if (underPeerCutoff(x, 'zone')) flags.push('Quiet zone');
    if (underPeerCutoff(x, 'local')) flags.push('Low peer demand');
    x.flags = flags;
  }
  return result;
}

export function createModel(data) {
  const dict = data.dicts;
  const zones = Object.fromEntries(data.locations.filter(x => x[1] === 'zone').map(x => [x[0], x[3]]));
  const fullDays = data.dates.length;
  const auditRows = data.daily.map(r => ({
    d: r[0], id: dict.machine_id[r[1]], bank: dict.bank_id[r[2]], zone: dict.zone_id[r[3]],
    config: dict.config_id[r[4]], theme: dict.theme[r[5]], volatility: dict.volatility_class[r[6]], make: dict.manufacturer[r[7]],
    h: r[8], down: r[9], coin: r[10], win: r[11], theo: r[12], floor: r[13], local: r[14], zonePeer: r[15],
    lost: r[16], lostTheo: r[17], contrib: r[18], slot: dict.location_id[r[19]], occupied: r[20],
  }));
  const zoneBanks = data.locations.filter(r => r[1] === 'bank');
  const fullSummary = summarize(auditRows, fullDays).sort((a, b) => a.win - b.win);

  /** Rows and property days for the selected months and bank. */
  function scope({ from, to, bank }) {
    const dates = data.dates.filter(d => month(d) >= from && month(d) <= to);
    const start = data.dates.indexOf(dates[0]), end = data.dates.indexOf(dates.at(-1));
    const rows = auditRows.filter(r => r.d >= start && r.d <= end && (!bank || r.bank === bank));
    return { dates, start, end, rows, props: data.property.slice(start, end + 1) };
  }

  // Guests
  const regions = [...new Set(data.players.map(r => r[2]))].sort();
  const tiers = [...new Set(data.players.map(r => r[3]))].sort();

  // Forecast validation
  const holdout = data.property.filter(r => r[0] >= '2025-05-01');
  const mae = (a, i) => sum(a, r => Math.abs(r[3] - r[i])) / a.length;
  const pairedSummary = result => n(result.wins) + ' wins in ' + n(result.days) + ' days' + (result.ties ? ', ' + n(result.ties) + ' ties' : '') +
    '. Average MAE savings ' + cash(result.maeGap) + '. Paired 95% interval ' + result.interval.map(cash).join(' to ') + '.';
  const m1 = mae(holdout, 10), m7 = mae(holdout, 12), mCalendar = mae(holdout, 14);
  const peakThreshold = 1500000, quietThreshold = 1250000;
  const schedulingTier = coin => coin >= peakThreshold ? 'Peak' : coin < quietThreshold ? 'Quiet' : 'Regular';
  function schedulingScore(tier, column, classify = schedulingTier) {
    let hits = 0, missed = 0, falseFlags = 0;
    for (const day of holdout) {
      const actual = classify(day[3]) === tier, predicted = classify(day[column]) === tier;
      if (actual && predicted) hits++;
      if (actual && !predicted) missed++;
      if (!actual && predicted) falseFlags++;
    }
    return { hits, missed, falseFlags };
  }

  // M-1158 payout check
  const inspect = fullSummary.find(x => x.id === 'M-1158');
  const focalWeeks = [...by(inspect.g, r => week(r.d)).entries()];
  const holdGap = g => ratio(sum(g, r => r.win - r.theo), sum(g, r => r.coin));
  const worstWeek = focalWeeks.reduce((worst, current) => holdGap(current[1]) < holdGap(worst[1]) ? current : worst);
  const leaveOneOut = focalWeeks.map(([w]) => {
    const [estimate] = summarize(inspect.g.filter(r => week(r.d) !== w), fullDays);
    adjustPValues(fullSummary.map(r => r.id === inspect.id ? estimate : { p: r.p }));
    return estimate;
  });
  const withoutWorst = leaveOneOut[focalWeeks.indexOf(worstWeek)];
  const maxLeaveOneOutQ = Math.max(...leaveOneOut.map(r => r.q));
  const inspectPeers = auditRows.filter(r => r.id !== inspect.id && r.config === inspect.g[0].config);
  const peerWeeks = by(inspectPeers, r => week(r.d));
  const weekLabel = w => data.dates[Math.max(0, w * 7 - 2)].slice(5);
  /** Same-configuration peers active in every M-1158 week with 50–200% of its wagers; null when none qualify. */
  function matchedPayoutPeers() {
    const weeks = new Set(focalWeeks.filter(([, rows]) => sum(rows, r => r.coin) > 0).map(([w]) => w));
    const groups = by(inspectPeers.filter(r => r.coin > 0 && weeks.has(week(r.d))), r => r.id);
    const peers = [...groups.values()].map(rows => ({
      weeks: new Set(rows.map(r => week(r.d))).size,
      exposure: sum(rows, r => r.coin) / inspect.coin,
      gap: holdGap(rows),
    })).filter(x => x.weeks === weeks.size && x.exposure >= .5 && x.exposure <= 2).map(x => x.gap).sort((a, b) => a - b);
    if (!peers.length) return null;
    const mid = Math.floor(peers.length / 2);
    const median = (peers[mid] + peers[Math.floor((peers.length - 1) / 2)]) / 2;
    return { weekCount: weeks.size, peers, median, asLow: peers.filter(gap => gap <= inspect.res).length };
  }

  // M-1181 relocation
  const move = fullSummary.find(x => x.id === 'M-1181');
  const last = move.g.at(-1);
  const june = move.g.filter(r => month(data.dates[r.d]) === 5);
  // Destination rule: among slots vacant on June 30, take the zone where same-configuration cabinets earned the
  // most theo per available hour in June; break ties by slot id.
  const juneSameConfig = auditRows.filter(r => r.config === last.config && month(data.dates[r.d]) === 5);
  const zoneRate = zone => ratio(sum(juneSameConfig.filter(r => r.zone === zone), r => r.theo), sum(juneSameConfig.filter(r => r.zone === zone), r => r.h)) ?? -Infinity;
  const destination = data.vacancies.slice().sort((a, b) => zoneRate(b[2]) - zoneRate(a[2]) || a[0].localeCompare(b[0]))[0];
  const destinationPeers = auditRows.filter(r => r.zone === destination[2] && r.config === last.config && month(data.dates[r.d]) === 5);
  const recentRate = ratio(sum(june, r => r.theo), sum(june, r => r.h));
  const destinationRate = ratio(sum(destinationPeers, r => r.theo), sum(destinationPeers, r => r.h));
  const catalogue = Object.fromEntries(data.actions.map(r => [r[0], r]));
  const inspection = catalogue['A-INSPECT'], relocation = catalogue['A-MOVE-MACHINE'];
  const actionCost = a => (a[2] + a[3] * Math.max(0, 30 - a[4])) / 100;
  const moveCost = actionCost(relocation), inspectionCost = actionCost(inspection);
  const hoursAfterLead = sum(june, r => r.h) / june.length * (30 - relocation[4]);
  const disruption = recentRate * relocation[5] / 60;
  const grossLift = (destinationRate - recentRate) * (hoursAfterLead - relocation[5] / 60);
  const netMove = (capture, displacement) => grossLift * capture * (1 - displacement) - disruption - moveCost;
  const moveBreakEven = (moveCost + disruption) / grossLift;
  const reserve = 100000 - inspectionCost;
  // Comparison cabinets for a later move: same configuration, same source zone, never moved banks in the period.
  const moveControls = [...by(juneSameConfig.filter(r => r.zone === last.zone && r.id !== move.id), r => r.id).keys()]
    .filter(id => new Set(auditRows.filter(r => r.id === id).map(r => r.bank)).size === 1).sort();
  const bankZone = Object.fromEntries(zoneBanks.map(r => [r[0], r[2]]));

  // Inspection economics
  const inspectionGapPerDay = (inspect.theo - inspect.win) / inspect.days;
  const inspectionCeiling = inspectionGapPerDay * (30 - inspection[4]);
  const inspectionBreakEven = inspectionCost / inspectionCeiling;
  const inspectionSlot = data.inspectionWindow;
  const repairPaybackDays = 30;
  const repairRecoveryShare = .5;
  const windowHold = ratio(inspect.theo, inspect.coin);
  const repairScenarios = [.25, repairRecoveryShare, .75];

  // Promotion
  const promotion = catalogue['A-PROMO'], promoCost = actionCost(promotion);
  const retainedTheo = event => event.during.theo + event.after.theo;
  const promoHurdle = Math.max(...data.promotions.map(event => promoCost / retainedTheo(event)));

  // Overview cohort
  const moveCases = data.moves.filter(r => r.main);
  // The past move most like the proposed route: same source zone, preferring the same destination zone too.
  const routeScore = c => (bankZone[c.main.origin] === last.zone ? 2 : 0) + (bankZone[c.main.target] === destination[2] ? 1 : 0);
  const closestCase = moveCases.slice().sort((a, b) => routeScore(b) - routeScore(a))[0];
  const weeksBelow = focalWeeks.filter(([, g]) => holdGap(g) < 0).length;
  const cohort = fullSummary.slice(0, 10);
  const quietCohort = cohort.filter(r => r.flags.includes('Quiet zone'));
  const payoutCohort = cohort.filter(r => r.flags.includes('Inspect hold'));
  const shortCohort = cohort.filter(r => r.days < 60).map(r => r.id).sort().reverse();
  const payoutOverlap = payoutCohort.filter(r => quietCohort.includes(r)).map(r => r.id);

  function reviewAction(machine) {
    if (machine.flags.includes('Inspect hold')) return 'Inspect payout';
    if (machine.flags.includes('Downtime')) return 'Review uptime';
    if (machine.flags.includes('Short exposure')) return 'Review placement dates';
    if (machine.id === move.id && machine.flags.includes('Quiet zone')) return 'Defer relocation';
    if (machine.flags.includes('Low peer demand')) return 'Investigate weak demand';
    if (machine.flags.includes('Quiet zone')) return 'Keep in service · monitor location';
    return 'Monitor';
  }
  function weekdayAdjusted(days, value) {
    const weekdays = [...by(days.filter(r => !data.property[r.d][2]), r => data.property[r.d][1]).values()];
    return weekdays.length === 7 ? sum(weekdays, g => sum(g, value) / g.length) / 7 : null;
  }

  return {
    data, dict, zones, fullDays, auditRows, zoneBanks, fullSummary, scope, regions, tiers, months,
    holdout, mae, pairedSummary, m1, m7, mCalendar, peakThreshold, quietThreshold, schedulingTier, schedulingScore,
    inspect, focalWeeks, holdGap, worstWeek, leaveOneOut, withoutWorst, maxLeaveOneOutQ, inspectPeers, peerWeeks, weekLabel, matchedPayoutPeers,
    move, last, destination, june, destinationPeers, recentRate, destinationRate, catalogue, inspection, relocation, actionCost,
    moveCost, inspectionCost, hoursAfterLead, disruption, grossLift, netMove, moveBreakEven, reserve,
    inspectionGapPerDay, inspectionCeiling, inspectionBreakEven, inspectionSlot, repairPaybackDays, repairRecoveryShare, windowHold, repairScenarios,
    promotion, promoCost, retainedTheo, promoHurdle,
    moveCases, closestCase, moveControls, bankZone, weeksBelow, cohort, quietCohort, payoutCohort, shortCohort, payoutOverlap, reviewAction, weekdayAdjusted,
  };
}
