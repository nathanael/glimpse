// One-off days from the protocol's inputs (alcohol, a food, a substance): what happened on a day, and how the
// next day went against the days around it. Activities (fasting, elimination, meditation) are habits, not events.
import { isDeleted } from './softDelete';
import { addDays } from './protocolEvents';

const BASELINE_DAYS = 14; // "usual" is the clean days in the two weeks before
const MIN_BASELINE = 4; // ...and needs at least this many scored to say anything
const SYMPTOM_SHIFT = 1; // on the 0–5 scale, a next-day jump this big is worth naming

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
const isEventInput = (item) => item && !isDeleted(item) && item.category !== 'activity';

/**
 * Every logged day of an event-type input, oldest first.
 * @returns {Array<{ date, itemId, name, count, label }>}
 */
export const getInputEvents = (inputItems, inputEntries) => {
  const items = new Map((inputItems || []).filter(isEventInput).map((i) => [i.id, i]));
  const events = [];
  Object.values(inputEntries || {}).forEach((e) => {
    const item = e?.date && items.get(e.inputId);
    if (!item || e.logged === false || isDeleted(e)) return;
    const count = e.count > 1 ? e.count : 1;
    events.push({ date: e.date, itemId: item.id, name: item.name, count, label: count > 1 ? `${item.name} ×${count}` : item.name });
  });
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
};

/**
 * How the day after an event went: the health score and any symptom that jumped, each against the clean days
 * (no event, not the day after one) in the two weeks before. `pattern` is the same next-day change averaged over
 * every earlier time this input was logged.
 * @param scoreFor  (date) => number|null           daily health score, 0–100
 * @param symptomFor (symId, date) => number|null   daily symptom value, 0–5
 * @param eventDates  Set of dates any event-type input was logged
 * @param itemDates   dates this input was logged, oldest first
 */
export const nextDayEffect = ({ date, todayStr, scoreFor, symptomFor, symptoms, eventDates, itemDates }) => {
  const clean = (d) => !eventDates.has(d) && !eventDates.has(addDays(d, -1));
  const baselineDates = (d) => Array.from({ length: BASELINE_DAYS }, (_, i) => addDays(d, -1 - i)).filter(clean);
  const usualOf = (fn, d) => {
    const vals = baselineDates(d).map(fn).filter((v) => v !== null && v !== undefined && v >= 0);
    return vals.length >= MIN_BASELINE ? mean(vals) : null;
  };
  const scoreShift = (d) => {
    const next = scoreFor(addDays(d, 1));
    const usual = usualOf(scoreFor, d);
    return next === null || usual === null ? null : { next, usual, delta: next - usual };
  };

  const nextDate = addDays(date, 1);
  const pending = nextDate > todayStr;
  const score = pending ? null : scoreShift(date);
  const movers = pending ? [] : (symptoms || []).map((sym) => {
    const next = symptomFor(sym.id, nextDate);
    const usual = usualOf((d) => symptomFor(sym.id, d), date);
    return next === null || next < 0 || usual === null ? null : { sym, delta: next - usual };
  }).filter((m) => m && m.delta >= SYMPTOM_SHIFT).sort((a, b) => b.delta - a.delta);

  const shifts = itemDates.filter((d) => addDays(d, 1) <= todayStr).map(scoreShift).filter(Boolean);
  const pattern = shifts.length >= 2 ? { n: shifts.length, delta: mean(shifts.map((s) => s.delta)) } : null;

  return { pending, score, movers, pattern };
};

const MAJOR_SCORE_SHIFT = 10; // points on the 0–100 health score the next day, either way
const MAJOR_SYMPTOM_SHIFT = 2; // ...or one symptom jumping this far on the 0–5 scale

// How much the day after stood out, on one scale: 1 = just major. 0 when there is nothing to judge yet.
const eventWeight = (effect) => {
  if (!effect || effect.pending) return 0;
  const score = effect.score ? Math.abs(effect.score.delta) / MAJOR_SCORE_SHIFT : 0;
  const mover = effect.movers?.length ? effect.movers[0].delta / MAJOR_SYMPTOM_SHIFT : 0;
  return Math.max(score, mover);
};

/**
 * The one-off days worth a line on a zoomed-out chart: only those whose next day clearly stood out,
 * the strongest `max` of them, back in their original (date) order.
 */
export const majorEvents = (markers, max) => {
  const major = (markers || []).map((m) => ({ m, w: eventWeight(m.effect) })).filter((x) => x.w >= 1);
  const keep = new Set(major.sort((a, b) => b.w - a.w).slice(0, max).map((x) => x.m));
  return (markers || []).filter((m) => keep.has(m));
};
