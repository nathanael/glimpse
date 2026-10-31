// The numbers behind the Sleep page opened from Home's Sleep tile: one Garmin night at a time,
// with its score, time asleep against need, stages, four vitals and the seven nights up to it.
// Pure, so SleepNight.jsx stays presentational. A row's `date` is the morning the night ended.

import { asleepMinutes, scoreVerdict, shiftDate } from './sleepInsights';

const mean = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const mins = (s) => (Number.isFinite(s) ? Math.round(s / 60) : 0);

/** Nights with a date, oldest first, one row per date. */
export function sortedNights(days) {
  const byDate = new Map();
  for (const d of days || []) if (d?.date) byDate.set(d.date, d);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function hrvTone(row) {
  const status = String(row.hrvStatus || '').toUpperCase();
  if (status === 'BALANCED') return 'good';
  if (status === 'UNBALANCED') return 'ok';
  if (status === 'LOW' || status === 'POOR') return 'bad';
  if (!Number.isFinite(row.hrvWeeklyAvg)) return 'none';
  return row.hrvOvernight >= row.hrvWeeklyAvg * 0.9 ? 'good' : row.hrvOvernight >= row.hrvWeeklyAvg * 0.75 ? 'ok' : 'bad';
}

/** HRV, resting HR, lowest SpO2 and Body Battery for `row`, with a tone each; `week` is the 7 nights to it. */
export function nightVitals(row, week) {
  const rhrAvg = mean(week.map((d) => d?.restingHr));
  const out = [];
  if (Number.isFinite(row.hrvOvernight)) {
    out.push({ key: 'hrv', label: 'HRV', value: Math.round(row.hrvOvernight), unit: 'ms', tone: hrvTone(row),
      sub: Number.isFinite(row.hrvWeeklyAvg) ? `Week avg ${Math.round(row.hrvWeeklyAvg)}` : 'Overnight' });
  }
  if (Number.isFinite(row.restingHr)) {
    const r = row.restingHr;
    out.push({ key: 'rhr', label: 'Resting HR', value: Math.round(r), unit: 'bpm',
      tone: rhrAvg == null ? 'none' : r <= rhrAvg + 2 ? 'good' : r <= rhrAvg + 5 ? 'ok' : 'bad',
      sub: rhrAvg != null ? `Week avg ${Math.round(rhrAvg)}` : 'Overnight' });
  }
  if (Number.isFinite(row.lowestSpo2)) {
    const s = row.lowestSpo2;
    out.push({ key: 'spo2', label: 'Lowest SpO2', value: Math.round(s), unit: '%', tone: s >= 92 ? 'good' : s >= 88 ? 'ok' : 'bad',
      sub: Number.isFinite(row.averageSpo2) ? `Avg ${Math.round(row.averageSpo2)}%` : 'Overnight' });
  }
  if (Number.isFinite(row.bodyBatteryHigh)) {
    const b = row.bodyBatteryHigh;
    out.push({ key: 'battery', label: 'Body Battery', value: Math.round(b), unit: '', tone: b >= 75 ? 'good' : b >= 50 ? 'ok' : 'bad', sub: 'Charged to' });
  }
  return out;
}

/** Time asleep against Garmin's sleep need: { text, tone }, or null without a need. */
export function needLine(asleep, need) {
  if (asleep == null || !Number.isFinite(need) || need <= 0) return null;
  const diff = Math.round(asleep - need);
  const fmt = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m} min`);
  if (diff >= 0) return { text: diff < 5 ? 'Met your need' : `${fmt(diff)} over your need`, tone: 'good' };
  return { text: `${fmt(-diff)} under your need`, tone: -diff <= need * 0.12 ? 'ok' : 'bad' };
}

/** Everything the page shows for night `index` of sortedNights(days). */
export function nightSummary(nights, index) {
  const row = nights[index];
  if (!row) return null;
  const asleep = asleepMinutes(row);
  const have = new Map(nights.map((d) => [d.date, d]));
  const week = [6, 5, 4, 3, 2, 1, 0].map((n) => {
    const date = shiftDate(row.date, -n);
    const d = have.get(date);
    return { date, minutes: d ? asleepMinutes(d) : null, index: d ? nights.indexOf(d) : -1 };
  });
  const weekMins = week.map((w) => w.minutes);
  const avg = mean(weekMins);
  return {
    date: row.date,
    score: row.sleepScore ?? null,
    verdict: scoreVerdict(row.sleepScore ?? null).label,
    asleep,
    need: needLine(asleep, row.sleepNeedMinutes),
    stages: { deep: mins(row.deepSleepSeconds), light: mins(row.lightSleepSeconds), rem: mins(row.remSleepSeconds), awake: mins(row.awakeSleepSeconds) },
    vitals: nightVitals(row, week.map((w) => have.get(w.date))),
    week,
    weekAvg: avg == null ? null : Math.round(avg),
    weekMax: Math.max(0, ...weekMins.filter((m) => m != null)),
  };
}
