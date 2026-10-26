// When in the day a supplement is taken. Optional: an item without one sits under "Anytime".
// Only groups the list; schedules (which days) are separate.
export const TIMES = [
  { id: 'morning', label: 'Morning' },
  { id: 'midday', label: 'Midday' },
  { id: 'evening', label: 'Evening' },
  { id: 'bedtime', label: 'Bedtime' },
];

export const timeLabel = (id) => TIMES.find((t) => t.id === id)?.label || null;

// [{ id, label, items }] in the day's order, Anytime last, empty sections left out.
// With no times set at all there is one unlabelled section, so the list looks as it did.
export const groupByTime = (items) => {
  const known = new Set(TIMES.map((t) => t.id));
  if (!items.some((i) => known.has(i.timeOfDay))) return [{ id: 'all', label: null, items }];
  const sections = TIMES.map((t) => ({ ...t, items: items.filter((i) => i.timeOfDay === t.id) }));
  sections.push({ id: 'anytime', label: 'Anytime', items: items.filter((i) => !known.has(i.timeOfDay)) });
  return sections.filter((s) => s.items.length > 0);
};
