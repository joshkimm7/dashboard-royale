// Q2 "why demand changed": zone-level demand, zone traffic, the weekday × hour heat map and real-world context.
// Pure functions over the shipped data, shared by src/tabs/DemandZones.jsx and scripts/check-claims.mjs.
import { by, month, ratio, sum } from './format.js';

/** Coin-in and available hours per zone × month (ratio of sums), plus whole-floor totals, for audit rows. */
export function zoneMonthly(rows, dates) {
  const days = new Map([...by(rows, r => month(dates[r.d])).entries()].map(([m, g]) => [m, new Set(g.map(r => r.d)).size]));
  const cells = new Map();
  for (const r of rows) {
    const key = r.zone + '|' + month(dates[r.d]);
    const c = cells.get(key) ?? { coin: 0, hours: 0 };
    c.coin += r.coin; c.hours += r.h; cells.set(key, c);
  }
  const get = (zone, m) => {
    const c = cells.get(zone + '|' + m);
    return c ? { ...c, rate: ratio(c.coin, c.hours), perDay: c.coin / days.get(m) } : null;
  };
  return { months: [...days.keys()].sort((a, b) => a - b), days, get };
}

/**
 * Additive zone decomposition of the change in property coin-in per day between two months.
 * Total change = Σ zones (zone coin/day in month B − in month A), exactly. Each zone's change is split into an
 * available-hours effect and a coin-in-per-available-hour effect weighted by the other factor's two-month average
 * (midpoint rule), so the two effects also sum exactly. The adjusted column applies the dashboard's event-free,
 * equal-weekday average to each zone's daily coin-in; it is linear in coin-in over a shared day set, so zone
 * contributions sum to the adjusted property change too.
 */
export function zoneContribution(rows, dates, weekdayAdjusted, a, b) {
  const inMonth = m => [...new Set(rows.filter(r => month(dates[r.d]) === m).map(r => r.d))].sort((x, y) => x - y);
  const daysA = inMonth(a), daysB = inMonth(b);
  if (!daysA.length || !daysB.length) return null;
  const zones = [...new Set(rows.map(r => r.zone))].sort();
  const stats = (zone, days) => {
    const set = new Set(days), g = rows.filter(r => r.zone === zone && set.has(r.d));
    const perDay = new Map(days.map(d => [d, 0]));
    for (const r of g) perDay.set(r.d, perDay.get(r.d) + r.coin);
    const coin = sum(g, r => r.coin), hours = sum(g, r => r.h);
    return { coin: coin / days.length, hours: hours / days.length, rate: ratio(coin, hours),
      adjusted: weekdayAdjusted([...perDay].map(([d, c]) => ({ d, coin: c })), x => x.coin) };
  };
  const result = zones.map(zone => {
    const x = stats(zone, daysA), y = stats(zone, daysB);
    const hoursEffect = x.rate != null && y.rate != null ? (y.hours - x.hours) * (x.rate + y.rate) / 2 : null;
    const rateEffect = x.rate != null && y.rate != null ? (y.rate - x.rate) * (x.hours + y.hours) / 2 : null;
    return { zone, a: x, b: y, change: y.coin - x.coin, hoursEffect, rateEffect,
      adjustedChange: x.adjusted != null && y.adjusted != null ? y.adjusted - x.adjusted : null };
  });
  const total = sum(result, r => r.change);
  const adjustedTotal = result.every(r => r.adjustedChange != null) ? sum(result, r => r.adjustedChange) : null;
  for (const r of result) r.share = ratio(r.change, total);
  return { a, b, zones: result, total, adjustedTotal, before: sum(result, r => r.a.coin), after: sum(result, r => r.b.coin) };
}

/**
 * Zone entries by month from the zone × gaming-day traffic rows [zone, day, entries, covered minutes, offline hours].
 * Offline hours contribute no entries and no minutes. Entries per day = entries ÷ covered minutes × 1,440, i.e. the
 * rate while counters worked; coverage = covered ÷ scheduled minutes (the 23-hour DST day counts 1,380).
 */
export function zoneTraffic(traffic, dates, start, end) {
  const out = new Map();
  for (const [zone, day, entries, minutes, offline] of traffic.rows) {
    if (day < start || day > end) continue;
    const key = traffic.zones[zone] + '|' + month(dates[day]);
    const c = out.get(key) ?? { entries: 0, minutes: 0, scheduled: 0, offline: 0, days: 0 };
    c.entries += entries; c.minutes += minutes; c.scheduled += traffic.dayMinutes[day]; c.offline += offline; c.days++;
    out.set(key, c);
  }
  const get = (zone, m) => {
    const c = out.get(zone + '|' + m);
    return c ? { ...c, perDay: ratio(c.entries * 1440, c.minutes), coverage: ratio(c.minutes, c.scheduled) } : null;
  };
  const total = zone => {
    const list = [...out.entries()].filter(([k]) => k.startsWith(zone + '|')).map(([, v]) => v);
    const t = { entries: sum(list, c => c.entries), minutes: sum(list, c => c.minutes), scheduled: sum(list, c => c.scheduled), offline: sum(list, c => c.offline) };
    return { ...t, perDay: ratio(t.entries * 1440, t.minutes), coverage: ratio(t.minutes, t.scheduled) };
  };
  return { get, total };
}

/** Average floor coin-in per clock hour for each of the 7 × 24 cells (rows Mon–Sun gaming days, columns 06:00–05:00). */
export function heatGrid(heat, zone, from, to) {
  const zones = zone ? [heat.zones.indexOf(zone)] : heat.zones.map((_, i) => i);
  return Array.from({ length: 168 }, (_, cell) => {
    let coin = 0, count = 0;
    for (let m = from; m <= to; m++) {
      count += heat.n[m][cell];
      for (const z of zones) coin += heat.coin[z][m][cell];
    }
    return { weekday: Math.floor(cell / 24), hour: (cell % 24 + 6) % 24, coin, count, value: ratio(coin, count) };
  });
}

/** Missouri state slot handle per calendar day by month, with per-property April→June changes. */
export function missouriMonthly(missouri) {
  const daysIn = m => new Date(Date.UTC(2025, m + 1, 0)).getUTCDate();
  const state = missouri.state.map(([key, units, handle, url]) => {
    const m = Number(key.slice(5, 7)) - 1;
    return { m, units, handle, perDay: handle / daysIn(m), perUnitDay: handle / daysIn(m) / units, url };
  });
  const propertyChange = (a, b) => missouri.names.map((name, i) => {
    const at = m => missouri.properties.find(r => r[0] === i && r[1] === m);
    const x = at(a), y = at(b);
    return { name, change: x && y ? (y[2] / daysIn(b)) / (x[2] / daysIn(a)) - 1 : null };
  }).filter(r => r.change != null);
  return { state, propertyChange };
}
