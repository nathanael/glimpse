import { describe, it, expect } from 'vitest';
import { isAnswered, isYes, isNo, countOf, noEntry, yesEntry, dailyFactors, factorPeriodId, amountLabel } from '../dailyFactors';
import { getInputEvents } from '../inputEvents';

describe('dailyFactors', () => {
  it('keeps missing, no and yes distinct', () => {
    expect(isAnswered(undefined)).toBe(false);
    const no = noEntry('2026-11-22', 'alcohol');
    expect([isAnswered(no), isYes(no), isNo(no), countOf(no)]).toEqual([true, false, true, 0]);
    const yes = yesEntry('2026-11-22', 'alcohol', 2);
    expect([isAnswered(yes), isYes(yes), isNo(yes), countOf(yes)]).toEqual([true, true, false, 2]);
  });
  it('treats legacy entries without logged as yes', () => {
    expect(isYes({ date: '2026-11-01', inputId: 'x', count: 3 })).toBe(true);
    expect(countOf({ date: '2026-11-01', inputId: 'x' })).toBe(1);
  });
  it('treats tombstones as unanswered', () => {
    expect(isAnswered({ _deleted: true })).toBe(false);
  });
  it('a "No" is not an event in analytics', () => {
    const items = [{ id: 'alcohol', name: 'Alcohol', category: 'substance' }];
    const entries = { a: noEntry('2026-11-21', 'alcohol'), b: yesEntry('2026-11-22', 'alcohol', 2) };
    expect(getInputEvents(items, entries).map((e) => [e.date, e.count])).toEqual([['2026-11-22', 2]]);
  });
  it('asks active, non-opted-out factors in order', () => {
    const items = [
      { id: 'b', active: true, order: 2 }, { id: 'a', active: true, order: 1 },
      { id: 'c', active: false }, { id: 'd', active: true, askDaily: false }, { id: 'e', active: true, deletedAt: 1 },
    ];
    expect(dailyFactors(items).map((i) => i.id)).toEqual(['a', 'b']);
  });
  it('asks in the last period', () => {
    expect(factorPeriodId([{ id: 'morning' }, { id: 'evening' }])).toBe('evening');
    expect(factorPeriodId([{ id: 'daily' }])).toBe('daily');
  });
  it('labels amounts with the unit', () => {
    expect(amountLabel({ unit: 'drinks' }, 2)).toBe('2 drinks');
    expect(amountLabel({}, 3)).toBe('×3');
  });
});
