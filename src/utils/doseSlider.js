// Dose math for the drag-to-dose rows on Pills: a range from 10% to 200% of the usual dose, in
// steps that suit its size (about 5% of it, rounded to 1, 2, 2.5 or 5 × a power of ten), sticky at
// the usual dose. Past either end of the range is the "other dose" zone, where letting go asks for
// a typed amount.

import { nameScore } from './fuzzyMatch';

const FIRST_DOSE = { mg: 100, mcg: 100, g: 1, IU: 1000, ml: 1, drops: 1, caps: 1 };

export const niceStep = (usual) => {
  if (!(usual > 0)) return 1;
  const x = usual * 0.05;
  const p = 10 ** Math.floor(Math.log10(x));
  let best = 1, bd = Infinity;
  for (const c of [1, 2, 2.5, 5, 10]) {
    const d = Math.abs(Math.log(x / p / c));
    if (d < bd) { bd = d; best = c; }
  }
  return Number((best * p).toPrecision(6));
};

export const doseRange = (usual) => {
  const step = niceStep(usual);
  const min = Math.max(step, Math.round((usual * 0.1) / step) * step);
  return { step, min: Number(min.toPrecision(6)), max: usual * 2 };
};

// How far past an end the finger must go (as a share of the range) before it means "other dose"
export const OVER_ZONE = 0.12;

/** The dose a drag lands on: { dose, over } where over is 'hi' | 'lo' | null. */
export const doseAt = (usual, raw) => {
  const { step, min, max } = doseRange(usual);
  const span = max - min;
  const over = raw > max + span * OVER_ZONE ? 'hi' : raw < min - span * OVER_ZONE ? 'lo' : null;
  if (Math.abs(raw - usual) < step * 0.9) return { dose: usual, over };
  const v = Math.min(max, Math.max(min, Math.round(raw / step) * step));
  return { dose: Number(v.toPrecision(6)), over };
};

/** Where a dose sits on the range, 0 to 1. */
export const dosePos = (usual, dose) => {
  const { min, max } = doseRange(usual);
  return Math.min(1, Math.max(0, (dose - min) / (max - min)));
};

export const fmtDose = (v) => (v >= 1000 ? Math.round(v).toLocaleString('en-US') : String(Number(Number(v).toFixed(2))));

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * The usual dose of each supplement: the median of every dose logged for it, else its default
 * dose, else a sensible first dose for its unit. Returns { [itemId]: { usual, count } }.
 */
export const usualDoses = (stackItems, stackEntries) => {
  const doses = {};
  for (const e of Object.values(stackEntries || {})) {
    if (!e || !e.itemId || !e.taken) continue;
    (doses[e.itemId] ||= []).push(parseFloat(e.dose));
  }
  const out = {};
  for (const item of stackItems || []) {
    const logged = (doses[item.id] || []).filter((d) => d > 0);
    const usual = median(logged) || (parseFloat(item.defaultDose) > 0 ? parseFloat(item.defaultDose) : null) || FIRST_DOSE[item.unit] || 1;
    out[item.id] = { usual: Number(Number(usual).toPrecision(6)), count: (doses[item.id] || []).length };
  }
  return out;
};

/**
 * Supplements to offer behind the Pills +: everything not due and not logged on this day, most
 * often taken or switched on and off first; with a query, the closest names first.
 */
export const adHocChoices = (items, { usual, excludeIds, query = '', limit = 7 }) => {
  const pool = items.filter((i) => !excludeIds.has(i.id));
  const toggles = (i) => (i.history || []).filter((h) => h.type === 'updated' && h.changes && 'active' in h.changes).length;
  const freq = (i) => (usual[i.id]?.count || 0) + 3 * toggles(i);
  const q = query.trim();
  if (!q) return pool.sort((a, b) => freq(b) - freq(a) || a.name.localeCompare(b.name)).slice(0, limit);
  return pool
    .map((i) => ({ i, s: q.length < 2 ? (i.name.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.startsWith(q.toLowerCase())) ? 0.9 : 0) : nameScore(q, i.name) }))
    .filter((x) => x.s >= 0.45)
    .sort((a, b) => b.s - a.s || freq(b.i) - freq(a.i))
    .slice(0, limit)
    .map((x) => x.i);
};
