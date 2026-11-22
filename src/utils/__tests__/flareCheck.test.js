import { describe, it, expect } from 'vitest';
import { symptomsUp, flareAnswered, flareNoteLine } from '../flareCheck';
import { getDateKey } from '../helpers';

const today = new Date(2026, 10, 22);
const day = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return getDateKey(d); };
const symptoms = [
  { id: 'bloating', name: 'Bloating', active: true },
  { id: 'reflux', name: 'Reflux', active: true },
  { id: 'calm', name: 'Calm body', active: true, kind: 'wellbeing' },
  { id: 'old', name: 'Old', active: false },
];
const entries = {};
const log = (id, n, severity) => { entries[`${day(n)}-${id}-morning`] = { severity }; };
for (let n = -30; n < 0; n++) { log('bloating', n, 1); log('reflux', n, 1); log('calm', n, 1); log('old', n, 1); }
log('bloating', 0, 4); log('reflux', 0, 1); log('calm', 0, 5); log('old', 0, 5);

describe('flare check', () => {
  it('finds active symptoms above their own normal, never wellbeing signals or hidden ones', () => {
    expect(symptomsUp(symptoms, entries, today, today).map((s) => s.id)).toEqual(['bloating']);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    expect(symptomsUp(symptoms, entries, yesterday, today)).toEqual([]);
  });

  it('writes one plain line for the day note and recognises it afterwards', () => {
    const up = [{ name: 'Bloating' }, { name: 'Reflux' }, { name: 'Brain fog' }];
    const yes = flareNoteLine({ flare: true, up, causes: ' late dinner, poor sleep ' });
    expect(yes).toBe('Flare check: in a flare (Bloating, Reflux, Brain fog above normal). Possible contributors: late dinner, poor sleep');
    expect(flareNoteLine({ flare: true, up, causes: '' })).toBe('Flare check: in a flare (Bloating, Reflux, Brain fog above normal).');
    expect(flareNoteLine({ flare: false, up })).toBe('Flare check: not a flare (Bloating, Reflux, Brain fog above normal).');
    expect(flareAnswered(`Slept badly\n${yes}`)).toBe(true);
    expect(flareAnswered('Slept badly')).toBe(false);
    expect(flareAnswered(undefined)).toBe(false);
  });
});
