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

// European (ESC/ESH) bands, which treat up to 129/84 as normal, so a reading a point or two over
// 120/80 stays green. The higher band of the two numbers decides.
export function bpCategory({ sys, dia }) {
  if (sys >= 180 || dia >= 110) return { id: 'grade3', label: 'Very high' };
  if (sys >= 160 || dia >= 100) return { id: 'grade2', label: 'High, grade 2' };
  if (sys >= 140 || dia >= 90) return { id: 'grade1', label: 'High, grade 1' };
  if (sys >= 130 || dia >= 85) return { id: 'highnormal', label: 'High normal' };
  if (sys >= 120 || dia >= 80) return { id: 'normal', label: 'Normal' };
  return { id: 'normal', label: 'Optimal' };
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

// Records inside the last `days` days (counting today), oldest first.
function inWindow(records, days, now) {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)).getTime();
  return Object.values(records || {})
    .filter((r) => r && Number.isFinite(r.sys) && new Date(r.time).getTime() >= from)
    .sort((a, b) => new Date(a.time) - new Date(b.time));
}

const pad = (n) => String(n).padStart(2, '0');
const localStamp = (d) => ({
  date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
});

/** The Copy for AI section: a markdown table, newest first, or '' with no readings. */
export function bpMarkdown(records, days, now = new Date()) {
  const list = inWindow(records, days, now).reverse();
  if (!list.length) return '';
  const avg = averageReadings(list);
  const out = [
    '\n### Blood Pressure',
    `mmHg; pulse in bpm. Each row is the average of 1 to 3 cuff readings taken back to back. Average over the window: ${avg.sys}/${avg.dia}.\n`,
    '| Date | Time | Systolic | Diastolic | Pulse | Readings | Category |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of list) {
    const { date, time } = localStamp(new Date(r.time));
    out.push(`| ${date} | ${time} | ${r.sys} | ${r.dia} | ${Number.isFinite(r.pulse) ? r.pulse : '-'} | ${r.readings?.length || 1} | ${bpCategory(r).label} |`);
  }
  return out.join('\n');
}

/** A CSV of every reading, oldest first: one row per saved average, the cuff readings after it. */
export function bpCSV(records, days = 99999, now = new Date()) {
  const rows = [['date', 'time', 'systolic', 'diastolic', 'pulse', 'readings', 'category', 'reading_1', 'reading_2', 'reading_3']];
  for (const r of inWindow(records, days, now)) {
    const { date, time } = localStamp(new Date(r.time));
    const parts = (r.readings || []).slice(0, MAX_READINGS).map((p) => `${p.sys}/${p.dia}${Number.isFinite(p.pulse) ? ` ${p.pulse}` : ''}`);
    while (parts.length < MAX_READINGS) parts.push('');
    rows.push([date, time, r.sys, r.dia, Number.isFinite(r.pulse) ? r.pulse : '', r.readings?.length || 1, bpCategory(r).label, ...parts]);
  }
  return rows.map((row) => row.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n');
}
