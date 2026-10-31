import { describe, it, expect } from 'vitest';
import { sortedNights, nightSummary, needLine, nightVitals } from '../sleepNight';

const night = (date, o = {}) => ({ date, sleepScore: 78, deepSleepSeconds: 4440, lightSleepSeconds: 14880, remSleepSeconds: 6600, awakeSleepSeconds: 1320, sleepNeedMinutes: 450, restingHr: 56, hrvOvernight: 48, hrvWeeklyAvg: 45, lowestSpo2: 91, averageSpo2: 95, bodyBatteryHigh: 82, ...o });

describe('sleepNight', () => {
  it('sorts nights and drops duplicate dates', () => {
    const n = sortedNights([night('2026-10-30'), night('2026-10-28'), night('2026-10-30', { sleepScore: 80 }), {}]);
    expect(n.map((d) => d.date)).toEqual(['2026-10-28', '2026-10-30']);
    expect(n[1].sleepScore).toBe(80);
  });

  it('summarises a night with need, stages and a 7-night week with gaps', () => {
    const nights = sortedNights([night('2026-10-28'), night('2026-10-30')]);
    const s = nightSummary(nights, 1);
    expect(s.asleep).toBe(432);
    expect(s.need).toEqual({ text: '18 min under your need', tone: 'ok' });
    expect(s.stages).toEqual({ deep: 74, light: 248, rem: 110, awake: 22 });
    expect(s.week).toHaveLength(7);
    expect(s.week[6]).toMatchObject({ date: '2026-10-30', index: 1, score: 78 });
    expect(s.weekScoreAvg).toBe(78);
    expect(s.week[5]).toMatchObject({ date: '2026-10-29', minutes: null, index: -1 });
    expect(s.week[4]).toMatchObject({ date: '2026-10-28', index: 0 });
    expect(s.verdict).toBe('Fair');
  });

  it('returns null for a missing night', () => {
    expect(nightSummary([], 0)).toBeNull();
  });

  it('words need', () => {
    expect(needLine(450, 450).text).toBe('Met your need');
    expect(needLine(500, 450).text).toBe('50 min over your need');
    expect(needLine(300, 450)).toEqual({ text: '2h 30m under your need', tone: 'bad' });
    expect(needLine(300, null)).toBeNull();
  });

  it('tones vitals and skips missing ones', () => {
    const v = nightVitals(night('2026-10-30', { bodyBatteryHigh: null, hrvStatus: 'LOW' }), [night('2026-10-29', { restingHr: 55 })]);
    expect(v.map((x) => [x.key, x.tone])).toEqual([['hrv', 'bad'], ['rhr', 'good'], ['spo2', 'ok']]);
  });
});
