// Blood pressure readings. A saved record is the average of one to three cuff readings taken
// back to back, keyed like a meal (local wall-clock time plus a suffix, see food/mealKey.js) so
// sync files it under the month it was taken in:
//
//   '2026-10-30T07:52:14-ab12': { time, sys, dia, pulse, readings: [{ sys, dia, pulse }, …] }
//
// sys/dia/pulse on the record are the rounded averages; readings keeps what the cuff said.
//
// Pure module.

export const MAX_READINGS = 3;
export const DEFAULT_READING = { sys: 118, dia: 76, pulse: 70 };
export const LIMITS = { sys: [60, 260], dia: [30, 160], pulse: [30, 220] };

export const clampField = (field, value) => {
  const [lo, hi] = LIMITS[field];
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};

/** The rounded mean of each field. Pulse is left out of the mean where a reading lacks one. */
export function averageReadings(readings) {
  const list = (readings || []).filter((r) => r && Number.isFinite(r.sys) && Number.isFinite(r.dia));
  if (!list.length) return null;
  const mean = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  const pulses = list.map((r) => r.pulse).filter(Number.isFinite);
  return { sys: mean(list.map((r) => r.sys)), dia: mean(list.map((r) => r.dia)), pulse: pulses.length ? mean(pulses) : null };
}

// American Heart Association categories; the higher of the two numbers decides.
export function bpCategory({ sys, dia }) {
  if (sys > 180 || dia > 120) return { id: 'crisis', label: 'Very high' };
  if (sys >= 140 || dia >= 90) return { id: 'stage2', label: 'High, stage 2' };
  if (sys >= 130 || dia >= 80) return { id: 'stage1', label: 'High, stage 1' };
  if (sys >= 120) return { id: 'elevated', label: 'Elevated' };
  return { id: 'normal', label: 'Normal' };
}

/** The most recent saved record, by key, or null. */
export function lastRecord(records) {
  const keys = Object.keys(records || {}).filter((k) => records[k] && Number.isFinite(records[k].sys)).sort();
  return keys.length ? records[keys[keys.length - 1]] : null;
}

/** The reading the steppers start from: the last one saved (its average), else a typical one. */
export function startingReading(records) {
  const r = lastRecord(records);
  if (!r) return { ...DEFAULT_READING };
  return { sys: r.sys, dia: r.dia, pulse: Number.isFinite(r.pulse) ? r.pulse : DEFAULT_READING.pulse };
}

/** '124/79', or null when nothing is saved. */
export function lastValue(records) {
  const last = lastRecord(records);
  return last ? `${last.sys}/${last.dia}` : null;
}

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** 'Last 124/79 · today 7:52 AM', or null when nothing is saved. */
export function lastLine(records, now = new Date()) {
  const last = lastRecord(records);
  if (!last) return null;
  const at = new Date(last.time);
  if (Number.isNaN(at.getTime())) return `Last ${last.sys}/${last.dia}`;
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day = sameDay(at, now) ? `today ${time}`
    : sameDay(at, yesterday) ? `yesterday ${time}`
    : at.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `Last ${last.sys}/${last.dia} · ${day}`;
}
