import { describe, it, expect } from 'vitest';
import { niceStep, doseRange, doseAt, usualDoses, adHocChoices, fmtDose } from '../doseSlider';

describe('doseSlider', () => {
  it('picks steps that suit the dose', () => {
    expect(niceStep(200)).toBe(10);
    expect(niceStep(5000)).toBe(250);
    expect(niceStep(600)).toBe(25);
    expect(niceStep(3)).toBe(0.2);
    expect(niceStep(1)).toBe(0.05);
  });
  it('ranges 10% to 200%', () => {
    expect(doseRange(200)).toEqual({ step: 10, min: 20, max: 400 });
  });
  it('snaps, sticks at the usual dose and flags the end zones', () => {
    expect(doseAt(200, 207)).toEqual({ dose: 200, over: null });
    expect(doseAt(200, 254)).toEqual({ dose: 250, over: null });
    expect(doseAt(200, 420)).toEqual({ dose: 400, over: null });
    expect(doseAt(200, 470)).toEqual({ dose: 400, over: 'hi' });
    expect(doseAt(200, -30)).toEqual({ dose: 20, over: 'lo' });
  });
  it('uses the median logged dose', () => {
    const items = [{ id: 'a', unit: 'mg', defaultDose: 0 }, { id: 'b', unit: 'IU' }];
    const entries = { x: { itemId: 'a', dose: 3, taken: true }, y: { itemId: 'a', dose: 5, taken: true }, z: { itemId: 'a', dose: 3, taken: true } };
    const u = usualDoses(items, entries);
    expect(u.a).toEqual({ usual: 3, count: 3, last: null });
    expect(u.b.usual).toBe(1000);
  });
  it('offers the most recently taken first and matches typos', () => {
    const items = [{ id: 'm', name: 'Melatonin' }, { id: 'n', name: 'NAC' }, { id: 'z', name: 'Zinc' }, { id: 'a', name: 'Apigenin' }];
    const usual = { m: { count: 9, last: '2026-11-01' }, n: { count: 2, last: '2026-11-20' }, z: { count: 5, last: '2026-11-25' }, a: { count: 0, last: null } };
    expect(adHocChoices(items, { usual, excludeIds: new Set(['z']) }).map((i) => i.id)).toEqual(['n', 'm', 'a']);
    expect(adHocChoices(items, { usual, excludeIds: new Set(), query: 'melatn' }).map((i) => i.id)).toEqual(['m']);
    expect(adHocChoices(items, { usual, excludeIds: new Set(), query: 'z' }).map((i) => i.id)).toEqual(['z']);
  });
  it('formats', () => { expect(fmtDose(5000)).toBe('5,000'); expect(fmtDose(0.25)).toBe('0.25'); });
});
