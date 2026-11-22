// The flare question: when several symptoms sit above their own normal on the same day, Tracking
// asks once whether it felt like a flare and what might have contributed. The answer goes in the
// day's note as one plain line (marked "Flare check:"), so it syncs, exports and reads like any note.
import { getStripDateKeys, getSeverityStrip } from './listHelpers';
import { flareThresholds } from './flareGroups';
import { isWellbeing } from './wellbeing';

export const MIN_SYMPTOMS_UP = 3;
const MARK = 'Flare check:';

// Symptoms at or above their own flare line (their normal over the last 90 days) on viewDate
export const symptomsUp = (symptoms, entries, viewDate, today = new Date()) => {
  const list = (symptoms || []).filter((s) => s.active !== false && !isWellbeing(s));
  const thresholds = flareThresholds(list, entries, today);
  const [key] = getStripDateKeys(viewDate, 1);
  return list.filter((s) => {
    const v = getSeverityStrip(entries, s.id, [key])[0];
    return v !== null && v >= (thresholds.get(s.id) ?? Infinity);
  });
};

export const flareAnswered = (noteText) => (noteText || '').includes(MARK);

const names = (up) => up.map((s) => s.name).join(', ');
export const flareNoteLine = ({ flare, up, causes }) => {
  const what = `${names(up)} above normal`;
  if (!flare) return `${MARK} not a flare (${what}).`;
  const why = (causes || '').trim();
  return `${MARK} in a flare (${what}).${why ? ` Possible contributors: ${why}` : ''}`;
};
