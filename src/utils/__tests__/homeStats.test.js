import { describe, it, expect } from 'vitest';
import { lastSleep, formatMinutes, bpTrend, sparkPath } from '../homeStats';

describe('lastSleep', () => {
  it('takes the newest night and adds up its sleep stages', () => {
    const s = lastSleep([
      { date: '2026-10-29', sleepScore: 70, deepSleepSeconds: 3600, lightSleepSeconds: 14400, remSleepSeconds: 3600 },
      { date: '2026-10-30', sleepScore: 81, deepSleepSeconds: 4320, lightSleepSeconds: 15120, remSleepSeconds: 6480 },
    ]);
    expect(s).toMatchObject({ date: '2026-10-30', minutes: 432, score: 81, stages: { deep: 72, light: 252, rem: 108 } });
    expect(formatMinutes(s.minutes)).toBe('7h 12m');
    expect(lastSleep([])).toBeNull();
  });
});

describe('bpTrend', () => {
  it('reports the last reading and the recent top numbers in order', () => {
    const t = bpTrend({
      '2026-10-29T08:00:00-a': { time: 't1', sys: 130, dia: 82 },
      '2026-10-30T07:52:00-b': { time: 't2', sys: 124, dia: 79 },
    });
    expect(t.sys).toBe(124);
    expect(t.points).toEqual([130, 124]);
    expect(t.category).toEqual({ id: 'normal', label: 'Normal' });
    expect(bpTrend({})).toBeNull();
  });
});

describe('sparkPath', () => {
  it('needs two points and skips gaps', () => {
    expect(sparkPath([null, 5])).toBe('');
    expect(sparkPath([1, null, 3]).split(' ').filter((s) => /^[ML]/.test(s))).toHaveLength(2);
  });
});
