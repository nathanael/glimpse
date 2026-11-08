// How complete a day is, for the dots under the day chips: 'full', 'part' or '' (nothing logged).
// Pure over the raw stores so the bar can show any day without the screen having opened it.

import { getDateKey, isScheduledForDate } from './helpers';
import * as queue from '../voice/checkinQueue';

/** Supplements: every item due that day taken, some, or none. */
export function protocolDayStatus(stackItems, stackEntries, date) {
  const k = getDateKey(date);
  const due = (stackItems || []).filter((i) => i.active && isScheduledForDate(i.schedule, date));
  const n = due.filter((i) => stackEntries?.[`${k}-${i.id}`]).length;
  return !due.length || !n ? '' : n === due.length ? 'full' : 'part';
}

/** Tracking: every symptom rated in every period, some, or none. */
export function trackingDayStatus(symptoms, entries, timePeriods, date) {
  const k = getDateKey(date);
  let all = 0, n = 0;
  (timePeriods || []).forEach((p) => queue.listFor(symptoms || [], p.id).forEach((s) => {
    all += 1;
    if (entries?.[queue.entryKey(k, s.id, p.id)]) n += 1;
  }));
  return !all || !n ? '' : n === all ? 'full' : 'part';
}

/** Blood pressure: a reading saved that day, or not. */
export function bpDayStatus(records, date) {
  const same = (t) => { const d = new Date(t); return d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth() && d.getDate() === date.getDate(); };
  return Object.values(records || {}).some((r) => r && Number.isFinite(r.sys) && r.time && same(r.time)) ? 'full' : '';
}
