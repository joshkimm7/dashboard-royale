// All dataset-wide analysis, ported unchanged from the original script's top-level code.
// createModel runs once at startup; components read the result through useModel().
import { by, cash, month, months, n, ratio, sum, week } from './format.js';
import { heatGrid, missouriMonthly, zoneContribution, zoneTraffic } from './zones.js';
import { downtimeFinding } from './downtime.js';
import { createPlanner } from './plan.js';

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

/**
 * Credibility constant k (in available hours) for the adjusted ranking, by Bühlmann–Straub method of moments:
 * k = within-cabinet day-to-day variance of the theo index ÷ between-cabinet variance of true indexes, with each
 * day weighted by its available hours. A cabinet with k benchmark hours gets half weight on its own record.
 */
export function credibilityK(rows, hold) {
  const groups = [...by(rows.filter(r => r.h > 0 && r.local > 0), r => r.id).values()];
  let within = 0, dof = 0;
  const cabinets = groups.map(g => {
    const days = g.map(r => ({ h: r.h, x: r.theo / (r.h * r.local * hold[r.config]) }));
    const weight = sum(days, d => d.h), mean = sum(days, d => d.h * d.x) / weight;
    within += sum(days, d => d.h * (d.x - mean) ** 2);
    dof += g.length - 1;
    return { weight, mean };
  });
  const s2 = within / dof, total = sum(cabinets, c => c.weight), grand = sum(cabinets, c => c.weight * c.mean) / total;
  const between = (sum(cabinets, c => c.weight * (c.mean - grand) ** 2) - (cabinets.length - 1) * s2) / (total - sum(cabinets, c => c.weight ** 2) / total);
  return { k: s2 / between, within: s2, between, cabinets: cabinets.length };
}

/**
 * Q1 adjusted ranking. For each cabinet in a summarize() result: theo (configured expected win) per available hour,
 * divided by the theo its matched same-configuration peers in the same zone earned over the same hours (ratio of sums),
 * shrunk toward 1.0 with credibility weight w = hours / (hours + k). Luck SE comes from game math: payout variance per
 * spin = multiplier variance × bet², summed and divided by coin-in.
 */
export function adjustRanking(summary, { k, hold, luck }) {
  const raw = summary.slice().sort((a, b) => a.win - b.win);
  const result = raw.map((x, i) => {
    const rows = x.g.filter(r => r.h > 0 && r.local != null);
    const expected = sum(rows, r => r.h * r.local * hold[r.config]);
    const index = ratio(sum(rows, r => r.theo), expected);
    const hours = sum(rows, r => r.h), w = hours / (hours + k);
    const variance = luck.get(x.id);
    const luckSE = variance != null && x.coin > 0 ? Math.sqrt(variance) / x.coin : null;
    return {
      x, id: x.id, rawRank: i + 1, index, hours, w, score: index == null ? null : w * index + (1 - w), expected,
      luckVar: variance ?? null, luckSE, z: luckSE ? x.res / luckSE : null, volatility: x.g[0].volatility,
    };
  });
  const ordered = result.slice().sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity) || a.rawRank - b.rawRank);
  ordered.forEach((r, i) => { r.adjRank = r.score == null ? null : i + 1; r.change = r.adjRank == null ? null : r.adjRank - r.rawRank; });
  return { rows: result, ordered: ordered.filter(r => r.score != null) };
}

/** Seeded uniform generator (mulberry32) so bootstrap intervals are identical in the tabs and the claims check. */
function seeded(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const quantile = (sorted, q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))] : null;

/** Q5 loyalty metrics. Each is a ratio of sums over a set of days: scale × numerator ÷ denominator. */
export const LOYALTY_METRICS = [
  { key: 'price', label: 'Points charged per $1 of comp face value', num: 'spent', den: 'face', scale: 1, digits: 2 },
  { key: 'costPoint', label: 'Comp cost per 100 points redeemed', num: 'cost', den: 'spent', scale: 100, digits: 2, money: true },
  { key: 'earn', label: 'Points earned per $100 of carded wagers', num: 'earned', den: 'coin', scale: 100, digits: 2 },
  { key: 'costFace', label: 'Comp cost per $1 of face value', num: 'cost', den: 'face', scale: 1, digits: 3, money: true },
  { key: 'rate', label: 'Comps redeemed per $100k of carded wagers', num: 'redemptions', den: 'coin', scale: 1e5, digits: 2 },
  { key: 'share', label: 'Points redeemed per 100 points earned', num: 'spent', den: 'earned', scale: 100, digits: 2 },
  { key: 'reinvest', label: 'Comp cost per $100 of expected win from carded play', num: 'cost', den: 'theo', scale: 100, digits: 2, money: true },
];
const LOYALTY_FIELDS = ['earned', 'coin', 'theo', 'redemptions', 'spent', 'face', 'cost'];
const emptyTotals = () => Object.fromEntries(LOYALTY_FIELDS.map(f => [f, 0]));
const addTotals = (into, t) => { for (const f of LOYALTY_FIELDS) into[f] += t[f]; return into; };
export const metricValue = (metric, t) => t && t[metric.den] ? metric.scale * t[metric.num] / t[metric.den] : null;

/** Best single split of a series by squared-error reduction (each side at least `min` points; nulls skipped). */
export function bestSplit(values, min) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => Number.isFinite(v));
  const sse = a => { if (!a.length) return 0; const m = sum(a, p => p[1]) / a.length; return sum(a, p => (p[1] - m) ** 2); };
  const total = sse(pts);
  let best = null;
  for (let k = min; k <= pts.length - min; k++) {
    const reduction = total - sse(pts.slice(0, k)) - sse(pts.slice(k));
    if (!best || reduction > best.reduction) best = { index: pts[k][0], reduction };
  }
  return best && { ...best, r2: total ? best.reduction / total : 0 };
}

/**
 * Q5 structural-break test on the loyalty ledger cube ([day, region, opening tier, tier at event, earned, coin, theo,
 * redemptions, points spent, face, cost]). Weekly ratio-of-sums series per metric; the best single split by
 * squared-error reduction picks the week, the daily series refines it to a day; the break tested is the one found
 * on the redemption price (points charged per $1 of face value). The break is then tested with
 * weekday-matched 28-day windows, a weekday-stratified day bootstrap, a placebo split at every other date, and
 * a within-tier decomposition (policy) vs tier-mix shift.
 */
export function loyaltyBreak(rows, { days, tiers, window = 28, reps = 2000, minWeeks = 4 }) {
  const daily = Array.from({ length: days }, emptyTotals);
  const byTier = tiers.map(() => Array.from({ length: days }, emptyTotals));
  for (const r of rows) {
    const t = { earned: r[4], coin: r[5], theo: r[6], redemptions: r[7], spent: r[8], face: r[9], cost: r[10] };
    addTotals(daily[r[0]], t); addTotals(byTier[r[3]][r[0]], t);
  }
  const totalOf = (series, list) => list.reduce((a, d) => addTotals(a, series[d]), emptyTotals());
  const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
  const weeks = [...by(range(0, days - 1), week).entries()].map(([w, list]) => ({ w, list, full: list.length === 7 }));
  const weekly = (series, metric) => weeks.map(w => metricValue(metric, totalOf(series, w.list)));
  const fullWeeks = weeks.filter(w => w.full);

  // Break search on every metric over full weeks, then daily refinement around the winning week boundary.
  const searches = LOYALTY_METRICS.map(metric => {
    const values = fullWeeks.map(w => metricValue(metric, totalOf(daily, w.list)));
    const split = bestSplit(values, minWeeks);
    if (!split) return { metric, split: null };
    const start = fullWeeks[split.index].list[0];
    const dayValues = daily.map(t => metricValue(metric, t));
    const candidates = range(Math.max(window, start - 7), Math.min(days - window, start + 7));
    const scored = candidates.map(c => ({ c, r: bestSplitAt(dayValues, c) })).filter(x => x.r != null);
    const refined = scored.reduce((b, x) => (!b || x.r > b.r ? x : b), null);
    return { metric, split, week: fullWeeks[split.index].w, day: refined?.c ?? start };
  }).filter(s => s.split);
  if (!searches.length) return null;
  // The redemption price is the program's policy lever, so it is the pre-specified test metric; the others are reported alongside.
  const lead = searches.find(s => s.metric.key === 'price') ?? searches.reduce((b, s) => (s.split.r2 > b.split.r2 ? s : b));
  const breakDay = lead.day;

  // Weekday-matched windows: equal whole weeks on each side of the break.
  const span = Math.min(window, Math.floor(Math.min(breakDay, days - breakDay) / 7) * 7);
  const before = range(breakDay - span, breakDay - 1), after = range(breakDay, breakDay + span - 1);
  const strata = list => [...by(list, d => d % 7).values()];
  const random = seeded(20250501);
  const resample = list => strata(list).flatMap(g => g.map(() => g[Math.floor(random() * g.length)]));
  const compare = (series, metric) => {
    const b = metricValue(metric, totalOf(series, before)), a = metricValue(metric, totalOf(series, after));
    return { before: b, after: a, change: a != null && b != null ? a - b : null, rel: a != null && b ? a / b - 1 : null, draws: [] };
  };
  const results = LOYALTY_METRICS.map(metric => ({ metric, ...compare(daily, metric) }));
  const lead_ = LOYALTY_METRICS.indexOf(lead.metric);
  const tierResults = tiers.map((name, t) => ({ name, ...compare(byTier[t], lead.metric) }));
  for (let i = 0; i < reps; i++) {
    const b = resample(before), a = resample(after);
    const tb = totalOf(daily, b), ta = totalOf(daily, a);
    for (const r of results) {
      const vb = metricValue(r.metric, tb), va = metricValue(r.metric, ta);
      if (vb != null && va != null) r.draws.push(va - vb);
    }
    tierResults.forEach((r, t) => {
      const vb = metricValue(lead.metric, totalOf(byTier[t], b)), va = metricValue(lead.metric, totalOf(byTier[t], a));
      if (vb != null && va != null) r.draws.push(va - vb);
    });
  }
  for (const r of [...results, ...tierResults]) {
    const sorted = r.draws.sort((x, y) => x - y);
    r.interval = sorted.length >= reps * .9 ? [quantile(sorted, .025), quantile(sorted, .975)] : null;
    r.excludesZero = r.interval != null && (r.interval[0] > 0 || r.interval[1] < 0);
    delete r.draws;
  }

  // Mix vs policy for the lead metric: pooled ratio = Σ (denominator share × tier ratio).
  const parts = [before, after].map(list => tiers.map((_, t) => totalOf(byTier[t], list)));
  const denoms = parts.map(p => sum(p, t => t[lead.metric.den]));
  const weights = parts.map((p, i) => p.map(t => denoms[i] ? t[lead.metric.den] / denoms[i] : 0));
  const tierRates = parts.map(p => p.map(t => metricValue(lead.metric, t)));
  let mix = 0, within = 0;
  tiers.forEach((_, t) => {
    if (tierRates[0][t] == null || tierRates[1][t] == null) return;
    mix += (weights[1][t] - weights[0][t]) * tierRates[0][t];
    within += weights[1][t] * (tierRates[1][t] - tierRates[0][t]);
  });

  // Placebo: the same weekday-matched split at every date where both windows fit.
  const placebo = range(span, days - span).map(c => {
    const b = metricValue(lead.metric, totalOf(daily, range(c - span, c - 1))), a = metricValue(lead.metric, totalOf(daily, range(c, c + span - 1)));
    return { day: c, change: a != null && b != null ? a - b : null, clean: Math.abs(c - breakDay) >= span };
  }).filter(p => p.change != null);
  const real = Math.abs(results[lead_].change);
  const rank = 1 + placebo.filter(p => p.day !== breakDay && Math.abs(p.change) > real).length;
  const clean = placebo.filter(p => p.clean);
  const largestClean = clean.reduce((b, p) => (!b || Math.abs(p.change) > Math.abs(b.change) ? p : b), null);

  const leadResult = results[lead_];
  // A break counts only if its interval excludes zero, no placebo date beats it, and it exceeds every clean placebo shift.
  const detected = leadResult.excludesZero && rank === 1 && largestClean != null && real > Math.abs(largestClean.change);
  return {
    detected, leadResult, breakDay, lead, searches, span, before, after, results, tierResults, mix, within, weeks,
    weeklyAll: metric => weekly(daily, metric), weeklyTier: (t, metric) => weekly(byTier[t], metric),
    placebo, rank, cleanCount: clean.length, largestClean,
  };

  /** Squared-error reduction for splitting the daily series at day c (nulls skipped). */
  function bestSplitAt(values, c) {
    if (!values.some(Number.isFinite)) return null;
    const sse = a => { const f = a.filter(Number.isFinite); if (!f.length) return 0; const m = sum(f, v => v) / f.length; return sum(f, v => (v - m) ** 2); };
    return sse(values) - sse(values.slice(0, c)) - sse(values.slice(c));
  }
}

/** Net-outcome bins for the Q4 histogram, symmetric around zero, in dollars per player over the selected months. */
export const OUTCOME_EDGES = [25, 100, 250, 1000, 2500];
const kLabel = v => v >= 1000 ? n(v / 1000, v % 1000 ? 1 : 0) + 'k' : n(v);
export const OUTCOME_BINS = [
  ...OUTCOME_EDGES.map((e, i) => ({ side: -1, lo: e, hi: OUTCOME_EDGES[i + 1] ?? Infinity })).reverse(),
  ...[{ side: -1, lo: 0, hi: OUTCOME_EDGES[0] }, { side: 0, lo: 0, hi: 0 }, { side: 1, lo: 0, hi: OUTCOME_EDGES[0] }],
  ...OUTCOME_EDGES.map((e, i) => ({ side: 1, lo: e, hi: OUTCOME_EDGES[i + 1] ?? Infinity })),
].map(b => ({ ...b, label: b.side === 0 ? 'Even' : (b.side < 0 ? '−' : '+') + '$' + (b.hi === Infinity ? kLabel(b.lo) + '+' : (b.lo ? kLabel(b.lo) : '0') + '–' + kLabel(b.hi)) }));

/** Concentration of non-negative per-player amounts: top 1/10/20% shares, Gini and a Lorenz curve with `points` steps. */
export function concentrationOf(values, points = 100) {
  const asc = values.slice().sort((a, b) => a - b), count = asc.length, total = sum(asc, v => v);
  if (!count || !total) return null;
  const cum = new Float64Array(count + 1);
  let weighted = 0;
  asc.forEach((v, i) => { cum[i + 1] = cum[i] + v; weighted += (i + 1) * v; });
  const top = q => (total - cum[count - Math.ceil(count * q)]) / total;
  return {
    players: count, top1: top(.01), top10: top(.1), top20: top(.2),
    gini: 2 * weighted / (count * total) - (count + 1) / count,
    curve: Array.from({ length: points + 1 }, (_, k) => cum[Math.round(k * count / points)] / total),
  };
}

/** Q4 outcomes for a set of player-month rows. Each player's months are totaled first (net in cents, so even is exact). */
export function playerOutcomes(rows) {
  const people = new Map();
  for (const r of rows) {
    const x = people.get(r[0]) ?? [0, 0];
    x[0] += r[4]; x[1] += Math.round(r[6] * 100); people.set(r[0], x);
  }
  const all = [...people.values()], active = all.filter(r => r[0] > 0);
  const bins = OUTCOME_BINS.map(b => ({ ...b, players: 0 }));
  for (const [, cents] of active) {
    const dollars = Math.abs(cents) / 100, side = Math.sign(cents);
    bins.find(b => b.side === side && (side === 0 || (dollars >= b.lo && dollars < b.hi))).players++;
  }
  return {
    holders: all.length, active: active.length,
    ahead: active.filter(r => r[1] > 0).length, behind: active.filter(r => r[1] < 0).length, even: active.filter(r => r[1] === 0).length,
    net: sum(all, r => r[1]) / 100, grossLoss: sum(all, r => Math.max(0, -r[1])) / 100,
    wagers: concentrationOf(active.map(r => r[0])), losses: concentrationOf(active.map(r => Math.max(0, -r[1]))),
    bins,
  };
}

/** Q4 breakdown: carded totals and active players for each value of `key` (a player-month row → group name). */
export function playerBreakdown(rows, key) {
  return [...by(rows, key).entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([name, g]) => {
    const wagers = sum(g, r => r[4]), payout = sum(g, r => r[5]);
    return { name, players: new Set(g.filter(r => r[4] > 0).map(r => r[0])).size, wagers, payout, net: payout - wagers,
      hold: ratio(wagers - payout, wagers), theo: sum(g, r => r[9]), comps: sum(g, r => r[8]) };
  });
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

  const zoneOfBank = Object.fromEntries(zoneBanks.map(r => [r[0], r[2]]));
  /** True when a bank passes the bank and zone filters (a bank id, or '' for all; a zone id, or '' for all). */
  const bankInScope = (id, { bank = '', zone = '' } = {}) => (!bank || id === bank) && (!zone || zoneOfBank[id] === zone);

  /** Rows and property days for the selected months, bank and zone. */
  function scope({ from, to, bank, zone = '' }) {
    const dates = data.dates.filter(d => month(d) >= from && month(d) <= to);
    const start = data.dates.indexOf(dates[0]), end = data.dates.indexOf(dates.at(-1));
    const rows = auditRows.filter(r => r.d >= start && r.d <= end && (!bank || r.bank === bank) && (!zone || r.zone === zone));
    const banks = zone ? zoneBanks.filter(r => r[2] === zone).map(r => r[0]) : null;
    return { dates, start, end, rows, props: data.property.slice(start, end + 1), from, to, bank, zone, banks };
  }

  // Q1 adjusted ranking: payout hold per configuration, a credibility constant fitted once on the full period,
  // and spin-level luck variance summed over the selected months and bank.
  const configHold = Object.fromEntries(data.configs.map(c => [c[0], 1 - c[1]]));
  const credibility = credibilityK(auditRows, configHold);
  function luckFor({ from, to, bank, zone = '' }) {
    const totals = new Map();
    for (const [machine, mo, b, variance] of data.luck) {
      if (mo < from || mo > to || !bankInScope(dict.bank_id[b], { bank, zone })) continue;
      const id = dict.machine_id[machine];
      totals.set(id, (totals.get(id) ?? 0) + variance);
    }
    return totals;
  }
  const ranking = s => adjustRanking(summarize(s.rows, s.dates.length), { k: credibility.k, hold: configHold, luck: luckFor(s) });
  /** Manager's raw bottom ten against the adjusted bottom ten for one ranking. */
  function rankingOverlap(r, size = 10) {
    const rawTen = r.rows.slice(0, size), adjustedTen = r.ordered.slice(0, size);
    const both = rawTen.filter(x => adjustedTen.includes(x));
    const rawOnly = rawTen.filter(x => !adjustedTen.includes(x));
    return { rawTen, adjustedTen, both, rawOnly, atOrAbovePeers: rawOnly.filter(x => x.index >= 1),
      outsideLuck: r.rows.filter(x => x.z != null && Math.abs(x.z) > 1.96) };
  }
  /** Re-ranks at half k, double k and no shrinkage: how many of the base adjusted bottom ten survive, and the raw overlap. */
  function kSensitivity(summary, luck, base, size = 10) {
    const ids = new Set(base.ordered.slice(0, size).map(r => r.id));
    return [.5, 2, 0].map(factor => {
      const r = adjustRanking(summary, { k: credibility.k * factor, hold: configHold, luck });
      return { factor, kept: r.ordered.slice(0, size).filter(x => ids.has(x.id)).length, overlap: rankingOverlap(r, size).both.length };
    });
  }
  const fullRanking = ranking(scope({ from: 0, to: 5, bank: '' }));
  const fullSensitivity = kSensitivity(summarize(scope({ from: 0, to: 5, bank: '' }).rows, fullDays), luckFor({ from: 0, to: 5, bank: '' }), fullRanking);
  const fullOverlap = rankingOverlap(fullRanking);

  // P10 hit-frequency check: share of all-play spins that paid anything, against the published hit probability of
  // each cabinet's configuration, for the selected months and bank. A binomial z per cabinet, Benjamini–Hochberg across cabinets.
  const hitData = data.hitCheck;
  function hitCheck({ from = 0, to = 5, bank = '', zone = '' } = {}) {
    const totals = new Map();
    for (const [machine, mo, b, config, spins, hits] of hitData.rows) {
      if (mo < from || mo > to || !bankInScope(dict.bank_id[b], { bank, zone })) continue;
      const t = totals.get(machine) ?? { id: dict.machine_id[machine], code: machine, config: dict.config_id[config], expected: 0, spins: 0, hits: 0 };
      t.spins += spins; t.hits += hits; t.expected += spins * hitData.hitProbability[config];
      totals.set(machine, t);
    }
    const rows = [...totals.values()].filter(t => t.spins > 0).map(t => {
      const published = t.expected / t.spins, observed = t.hits / t.spins;
      const z = (t.hits - t.expected) / Math.sqrt(t.spins * published * (1 - published));
      return { ...t, published, observed, z, p: pNormalTwoSided(z) };
    });
    adjustPValues(rows);
    const flagged = rows.filter(r => r.q < .01).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    const others = rows.filter(r => !flagged.includes(r));
    const meanZ = others.length ? sum(others, r => r.z) / others.length : null;
    const sdZ = others.length > 1 ? Math.sqrt(sum(others, r => (r.z - meanZ) ** 2) / (others.length - 1)) : null;
    return { rows, flagged, others, meanZ, sdZ, maxOther: others.length ? Math.max(...others.map(r => Math.abs(r.z))) : null };
  }
  /** Full-period detail for a flagged cabinet: weekly rate, carded vs uncarded and bet-size splits, and how fast the rate verifies a fix. */
  function hitDetail(row) {
    if (!row) return null;
    const weeks = hitData.weeks.filter(w => w[0] === row.code).map(([, w, spins, hits]) => ({ w, spins, hits, rate: hits / spins }));
    const split = hitData.split.find(r => r[0] === row.code);
    const [, cardedSpins, cardedHits, allSpins, allHits, bets, medianDaySpins] = split ?? [];
    const daySe = medianDaySpins ? Math.sqrt(row.published * (1 - row.published) / medianDaySpins) : null;
    return {
      weeks, above: weeks.filter(w => w.rate > row.published).length,
      carded: split ? cardedHits / cardedSpins : null, cardedSpins, uncarded: split ? (allHits - cardedHits) / (allSpins - cardedSpins) : null, uncardedSpins: split ? allSpins - cardedSpins : null,
      bets: (bets ?? []).map(([bet, spins, hits]) => ({ bet: bet / 100, spins, rate: hits / spins })),
      medianDaySpins, daySe, daySeparation: daySe ? (row.observed - row.published) / daySe : null,
    };
  }
  const fullHit = hitCheck();
  const hitFinding = (lead => ({ ...fullHit, lead, detail: hitDetail(lead) }))(fullHit.flagged[0]);
  const compVisits = data.compVisits;

  // Guests
  const regions = [...new Set(data.players.map(r => r[2]))].sort();
  const tiers = [...new Set(data.players.map(r => r[3]))].sort();
  // Age band per card holder (from the players table), one digit per person index; filters on the Guests tab use it.
  const ageBands = data.playerAge.bands, ageCodes = data.playerAge.codes;
  const ageOf = person => ageBands[ageCodes.charCodeAt(person) - 48];
  /** Player-month rows for the selected months, home region, opening tier and age band. */
  const playerRows = ({ from = 0, to = 5, region = '', tier = '', age = '' } = {}) => data.players.filter(r => r[1] >= from && r[1] <= to &&
    (!region || region === r[2]) && (!tier || tier === r[3]) && (!age || age === ageOf(r[0])));
  const fullOutcomes = playerOutcomes(data.players);

  // Q5 comp-program break test on the loyalty ledger, for the selected home region and opening tier (cached).
  const loyaltyDicts = data.loyalty.dicts, breakCache = new Map();
  function compBreak({ region = '', tier = '' } = {}) {
    const key = region + '|' + tier;
    if (!breakCache.has(key)) {
      const rows = data.loyalty.rows.filter(r => (!region || loyaltyDicts.home_region[r[1]] === region) && (!tier || loyaltyDicts.opening_tier[r[2]] === tier));
      breakCache.set(key, loyaltyBreak(rows, { days: fullDays, tiers: loyaltyDicts.tier_before }));
    }
    return breakCache.get(key);
  }
  const fullBreak = compBreak();
  /** Lifetime-point thresholds bracketed by the highest balance below and lowest balance in each tier, all months. */
  const tierBracket = (below, at) => ({ low: Math.max(...data.loyalty.tierRules.map(r => r[below])), high: Math.min(...data.loyalty.tierRules.map(r => r[at])) });
  const tierRules = { gold: tierBracket(1, 2), platinum: tierBracket(3, 4), months: data.loyalty.tierRules.length };
  tierRules.stable = tierRules.gold.low < tierRules.gold.high && tierRules.platinum.low < tierRules.platinum.high;
  /** Floor-wide Q5 finding as display strings, shared by the plan, the evidence map, the assistant and the claims check. */
  const compFinding = (b => {
    const get = key => b.results.find(r => r.metric.key === key);
    const date = data.dates[b.breakDay], money = v => (v < 0 ? '−' : '') + '$' + n(Math.abs(v), 2);
    const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + n(Math.abs(v * 100), 1) + '%';
    const price = b.leadResult, rate = get('rate'), reinvest = get('reinvest'), earn = get('earn'), costFace = get('costFace');
    return {
      detected: b.detected, date: months[month(date)] + ' ' + Number(date.slice(8)),
      price: n(price.before, 2) + ' to ' + n(price.after, 2) + ' points per $1 of face value', priceChange: signed(price.rel),
      priceInterval: price.interval.map(v => (v < 0 ? '−' : '+') + n(Math.abs(v), 2)).join(' to '),
      rank: 'rank ' + n(b.rank) + ' of ' + n(b.placebo.length) + ' split dates', withinShare: n(100 * b.within / (b.mix + b.within), 0) + '%',
      rateChange: signed(rate.rel), rateInterval: rate.interval.map(v => (v < 0 ? '−' : '+') + n(Math.abs(v), 2)).join(' to '), rateMoved: rate.excludesZero,
      reinvest: money(reinvest.before) + ' to ' + money(reinvest.after), reinvestChange: signed(reinvest.rel), reinvestMoved: reinvest.excludesZero,
      earnFlat: !earn.excludesZero, costFaceFlat: !costFace.excludesZero,
    };
  })(fullBreak);

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

  // Q2 "why": April → June zone decomposition, zone traffic, the busiest hour, weather and the Missouri market (full floor).
  const zoneFinding = (() => {
    const c = zoneContribution(auditRows, data.dates, weekdayAdjusted, 3, 5);
    const biggest = c.zones.slice().sort((x, y) => Math.abs(y.change) - Math.abs(x.change))[0];
    const steepest = c.zones.slice().sort((x, y) => x.b.rate / x.a.rate - y.b.rate / y.a.rate)[0];
    const traffic = zoneTraffic(data.zoneTraffic, data.dates, 0, fullDays - 1);
    const entryChange = data.zoneTraffic.zones.map(z => traffic.get(z, 5).perDay / traffic.get(z, 3).perDay - 1);
    const cells = heatGrid(data.heat, null, 0, 5), peak = cells.reduce((x, y) => (y.value > x.value ? y : x));
    const mo = missouriMonthly(data.missouri), changes = mo.propertyChange(3, 5);
    const perDay = mm => (rows => sum(rows, r => r[3]) / rows.length)(data.property.filter(r => month(r[0]) === mm));
    const coverage = sum(data.zoneTraffic.rows, r => r[3]) / (sum(data.zoneTraffic.dayMinutes, v => v) * data.zoneTraffic.zones.length);
    return {
      contribution: c, biggest, steepest, hours: sum(c.zones, r => r.hoursEffect), rate: sum(c.zones, r => r.rateEffect),
      trafficFell: entryChange.filter(v => v < 0).length, trafficZones: entryChange.length, coverage,
      offline: sum(data.zoneTraffic.rows, r => r[4]), peak: { day: data.heat.weekdays[peak.weekday], hour: peak.hour, value: peak.value },
      heat: data.weather.weekday.heat.map(v => 10 * v), heatMonth: data.weather.month.heat.map(v => 10 * v), rain: data.weather.weekday.rain,
      rainDays: data.weather.rainDays, rainGap: data.weather.rainGap, placebo: data.weather.placebo,
      ownChange: perDay(5) / perDay(3) - 1, moChange: mo.state[5].perDay / mo.state[3].perDay - 1,
      moFell: changes.filter(r => r.change < 0).length, moCount: changes.length,
    };
  })();

  // Q3 downtime: response times, technician staffing and the avoidable share (full period), for the July catalog.
  const downtime = downtimeFinding({ data, auditRows, fullDays, catalogue, actionCost });

  // Q6 July budget: the recommended plan, its ledger (guide §6 cost formula) and the reserve it leaves.
  const planner = createPlanner({ data, catalogue, actionCost, auditRows, fullDays, zones, inspect, move, cohort, payoutCohort, inspectionCeiling, netMove, moveCost,
    promoCost, retainedTheo, downtime });
  const julyPlan = planner.ledger(planner.recommended);
  const reserve = julyPlan.reserve;

  return {
    zoneFinding, downtime, planner, julyPlan,
    data, dict, zones, fullDays, auditRows, zoneBanks, bankInScope, fullSummary, scope, regions, tiers, ageBands, ageOf, playerRows, fullOutcomes, months,
    holdout, mae, pairedSummary, m1, m7, mCalendar, peakThreshold, quietThreshold, schedulingTier, schedulingScore,
    inspect, focalWeeks, holdGap, worstWeek, leaveOneOut, withoutWorst, maxLeaveOneOutQ, inspectPeers, peerWeeks, weekLabel, matchedPayoutPeers,
    move, last, destination, june, destinationPeers, recentRate, destinationRate, catalogue, inspection, relocation, actionCost,
    moveCost, inspectionCost, hoursAfterLead, disruption, grossLift, netMove, moveBreakEven, reserve,
    inspectionGapPerDay, inspectionCeiling, inspectionBreakEven, inspectionSlot, repairPaybackDays, repairRecoveryShare, windowHold, repairScenarios,
    promotion, promoCost, retainedTheo, promoHurdle,
    moveCases, closestCase, moveControls, bankZone, weeksBelow, cohort, quietCohort, payoutCohort, shortCohort, payoutOverlap, reviewAction, weekdayAdjusted,
    configHold, credibility, luckFor, ranking, rankingOverlap, kSensitivity, fullRanking, fullOverlap, fullSensitivity, payoutConfig: data.payoutConfig,
    compBreak, fullBreak, tierRules, compFinding,
    hitCheck, hitDetail, hitFinding, compVisits,
  };
}
