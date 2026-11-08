// Formatting and small list helpers, ported unchanged from the original dashboard script.
export const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
export const shifts = ['06:00–14:00', '14:00–22:00', '22:00–06:00'];
export const gold = '#f5cc78', green = '#b9deb5', red = '#ffb3ae';
/** Chart series colors, validated as a set on the maroon panel surface (dataviz six checks, dark mode). */
export const SERIES = { gold: '#b98a2c', blue: '#4f8fe0', rose: '#d9637f', muted: '#a8948a' };

export const week = d => Math.floor((d + 2) / 7);
export const month = d => Number(d.slice(5, 7)) - 1;
export const n = (v, digits = 0) => v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const cash = v => v == null || !Number.isFinite(v) ? '—' : (v < 0 ? '−' : '') + '$' + n(Math.abs(v));
export const pct = (v, d = 1) => v == null || !Number.isFinite(v) ? '—' : n(100 * v, d) + '%';
export const pp = v => v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : '') + n(v * 100, 2) + ' pp';
export const compact = v => v === 0 ? '$0' : (v < 0 ? '−' : '') + '$' + (Math.abs(v) >= 1e6 ? n(Math.abs(v) / 1e6, 2) + 'm' : n(Math.abs(v) / 1000) + 'k');
export const signedPct = v => v == null ? '—' : (v > 0 ? '+' : '') + pct(v);
export const ratio = (a, b) => b ? a / b : null;
export const sum = (list, f) => list.reduce((a, x) => a + (f(x) ?? 0), 0);
export const by = (list, key) => {
  const m = new Map();
  for (const r of list) { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return m;
};
/** q-values print as "<0.001" below the display floor. */
export const qText = (q, spaced = false) => q == null ? '—' : q < .001 ? (spaced ? '< 0.001' : '<0.001') : n(q, 3);
