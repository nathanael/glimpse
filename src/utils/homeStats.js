// The numbers on Home's four stat tiles: supplements, health score, sleep and blood pressure.
// Pure over the raw stores, like homeSummary.js, so Home stays presentational.

import { getDateKey } from './helpers';
import { computeHealthScore } from './healthScore';
import { METRICS as SLEEP_METRICS, valueForRow } from './sleepMetrics';
import { bpCategory, lastRecord } from './bloodPressure';

const dayBefore = (date, n) => { const d = new Date(date); d.setDate(d.getDate() - n); return d; };
const mean = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/**
 * Today's health score, the last 7 days' scores oldest first (null where nothing was logged) and
 * this week's average against the week before.
 */
export function healthTrend(symptoms, entries, trackingMode, date = new Date()) {
  const score = (n) => computeHealthScore(symptoms || [], entries || {}, getDateKey(dayBefore(date, n)), trackingMode).score;
  const points = [6, 5, 4, 3, 2, 1, 0].map(score);
  const prev = [13, 12, 11, 10, 9, 8, 7].map(score);
  const week = mean(points.filter((v) => v != null));
  const before = mean(prev.filter((v) => v != null));
  return { today: points[6], points, week, change: week != null && before != null ? week - before : null };
}

const DURATION = SLEEP_METRICS.find((m) => m.key === 'duration');

/** The latest night Garmin has: its date, minutes asleep and sleep score, or null. */
export function lastSleep(days) {
  const row = (days || []).filter((d) => d?.date).sort((a, b) => a.date.localeCompare(b.date)).pop();
  if (!row) return null;
  const min = (s) => Math.round((s || 0) / 60);
  return {
    date: row.date, minutes: valueForRow(DURATION, row), score: row.sleepScore ?? null,
    stages: { deep: min(row.deepSleepSeconds), light: min(row.lightSleepSeconds), rem: min(row.remSleepSeconds) },
  };
}

export const formatMinutes = (m) => (m == null ? null : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`);

/** The last reading, the top number of the last 7 readings oldest first, and its category. */
export function bpTrend(records) {
  const last = lastRecord(records);
  if (!last) return null;
  const recent = Object.keys(records).filter((k) => Number.isFinite(records[k]?.sys)).sort().slice(-7).map((k) => records[k].sys);
  return { sys: last.sys, dia: last.dia, time: last.time, category: bpCategory(last), points: recent };
}

/** An SVG path through `values` (nulls skipped) across a w×h box, or '' with fewer than two. */
export function sparkPath(values, w = 120, h = 24, pad = 2) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null);
  if (pts.length < 2) return '';
  const vs = pts.map(([, v]) => v), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const x = (i) => pad + (i / Math.max(1, values.length - 1)) * (w - pad * 2);
  const y = (v) => pad + (1 - (v - lo) / span) * (h - pad * 2);
  return pts.map(([i, v], n) => `${n ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
}
