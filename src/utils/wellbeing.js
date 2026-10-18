// Wellbeing signals live in the symptoms list with `kind: 'wellbeing'`. A symptom is "less is better"
// (0 none, 5 extreme); a wellbeing signal is "more is better" (0 absent, 5 excellent). Entries are
// stored the same way for both; only how a number reads and is coloured flips.
export const WELLBEING = 'wellbeing';
export const isWellbeing = (item) => item?.kind === WELLBEING;
export const symptomsOnly = (list) => (list || []).filter((s) => !isWellbeing(s));
export const wellbeingOnly = (list) => (list || []).filter(isWellbeing);

// Severity colours run green at 0 to red at 5. A wellbeing rating reads them backwards.
export const colorIndex = (item, n) => (isWellbeing(item) && n >= 0 && n <= 5 ? 5 - n : n);

export const WELLBEING_LABELS = ['Absent', 'Faint', 'Some', 'Good', 'Strong', 'Excellent'];

// Seeded once per account. Fixed ids, so two devices seeding at once land on the same items.
export const WELLBEING_STARTERS = [
  { id: 'wb-connected', name: 'Connected', description: 'Felt known and accepted by people, not just around them' },
  { id: 'wb-safe', name: 'Safe and at ease', description: 'Unguarded and comfortable where you were' },
  { id: 'wb-calm-body', name: 'Calm body', description: 'Nervous system settled, physically relaxed' },
  { id: 'wb-clear-head', name: 'Clear head', description: 'Thinking clearly, focused' },
  { id: 'wb-energy', name: 'Energy', description: 'Up for normal activity, resilient' },
];

// The starters to add to `symptoms`, or [] when the account already has wellbeing signals
export const missingStarters = (symptoms) => {
  if ((symptoms || []).some((s) => isWellbeing(s) || s.id?.startsWith('wb-'))) return [];
  const maxOrder = Math.max(-1, ...(symptoms || []).map((s) => s.order || 0));
  return WELLBEING_STARTERS.map((s, i) => ({ ...s, kind: WELLBEING, active: true, order: maxOrder + 1 + i }));
};
