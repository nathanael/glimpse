import { describe, it, expect } from 'vitest';
import { majorEvents } from '../inputEvents';

const ev = (date, scoreDelta, moverDelta, pending = false) => ({
  date,
  effect: { pending, score: scoreDelta === null ? null : { delta: scoreDelta }, movers: moverDelta ? [{ delta: moverDelta }] : [] },
});

describe('majorEvents', () => {
  it('keeps only days whose next day clearly stood out', () => {
    const out = majorEvents([ev('a', -3, 0), ev('b', -12, 0), ev('c', 4, 2), ev('d', null, 0), ev('e', -20, 0, true)], 8);
    expect(out.map((m) => m.date)).toEqual(['b', 'c']);
  });
  it('counts a clear improvement as major too', () => {
    expect(majorEvents([ev('a', 11, 0)], 8)).toHaveLength(1);
  });
  it('caps at the strongest and keeps date order', () => {
    const out = majorEvents([ev('a', -10, 0), ev('b', -30, 0), ev('c', -15, 0), ev('d', -25, 0)], 2);
    expect(out.map((m) => m.date)).toEqual(['b', 'd']);
  });
  it('handles nothing', () => {
    expect(majorEvents([], 5)).toEqual([]);
    expect(majorEvents(undefined, 5)).toEqual([]);
  });
});
