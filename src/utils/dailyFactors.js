// Other factors (alcohol, chocolate, a food, an activity) asked once a day in Rapid entry.
// A factor's day has three states, kept apart on purpose:
//   missing                 → not asked / not answered
//   { logged: false, count: 0 } → answered "No" (a confirmed clean day)
//   { logged: true, count: n }  → answered "Yes", n of them
import { isDeleted } from './softDelete';

export const factorKey = (dateKey, itemId) => `${dateKey}-${itemId}`;

const live = (entry) => !!entry && !entry._deleted && !isDeleted(entry);
export const isAnswered = (entry) => live(entry);
export const isYes = (entry) => live(entry) && entry.logged !== false;
export const isNo = (entry) => live(entry) && entry.logged === false;
export const countOf = (entry) => (isYes(entry) ? Math.max(1, entry.count || 1) : 0);

export const noEntry = (dateKey, itemId) => ({ date: dateKey, inputId: itemId, logged: false, count: 0 });
export const yesEntry = (dateKey, itemId, count = 1, prev) => ({
  ...(prev && live(prev) ? prev : {}), date: dateKey, inputId: itemId, logged: true, count: Math.max(1, Math.round(count)),
});

// Active factors, in list order, that Rapid entry asks about. `askDaily: false` opts one out.
export const dailyFactors = (inputItems) =>
  (inputItems || [])
    .filter((i) => i && i.active && !isDeleted(i) && i.askDaily !== false)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

// Factors set to repeat (`autoRepeat`, e.g. a daily meditation) carry yesterday's "Yes" into today,
// so today starts checked. Everything else (alcohol) is never assumed. Returns the entries to add.
export const repeatedEntries = (inputItems, inputEntries, yesterdayKey, todayKey) => {
  const added = {};
  (inputItems || []).forEach((item) => {
    if (!item || !item.active || isDeleted(item) || !item.autoRepeat) return;
    const prev = inputEntries[factorKey(yesterdayKey, item.id)];
    if (!isYes(prev) || inputEntries[factorKey(todayKey, item.id)]) return;
    added[factorKey(todayKey, item.id)] = { date: todayKey, inputId: item.id, logged: true, count: countOf(prev), repeated: true };
  });
  return added;
};

// Factors are asked once a day, in the last period (evening in AM/PM mode, the day in Simple mode).
export const factorPeriodId = (timePeriods) => timePeriods[timePeriods.length - 1]?.id;

// "2 drinks", "1 square", "×3"
export const amountLabel = (item, count) => {
  const unit = (item?.unit || '').trim();
  if (!unit) return `×${count}`;
  return `${count} ${unit}`;
};
