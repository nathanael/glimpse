import { describe, it, expect } from 'vitest';
import { isWellbeing, colorIndex, missingStarters, WELLBEING_STARTERS } from '../wellbeing';
import { computeHealthScore } from '../healthScore';
import { getInsights } from '../helpers';
import { createCheckin } from '../../voice/scripts/dailyCheckin';

const sym = { id: 'headache', name: 'Headache', active: true, order: 0 };
const wb = { id: 'wb-connected', name: 'Connected', active: true, order: 1, kind: 'wellbeing' };

describe('wellbeing', () => {
  it('reads kind', () => {
    expect(isWellbeing(wb)).toBe(true);
    expect(isWellbeing(sym)).toBe(false);
    expect(isWellbeing({ ...wb, kind: 'symptom' })).toBe(false);
  });

  it('flips the colour scale for wellbeing only', () => {
    expect(colorIndex(sym, 5)).toBe(5);
    expect(colorIndex(wb, 5)).toBe(0);
    expect(colorIndex(wb, 0)).toBe(5);
    expect(colorIndex(wb, -1)).toBe(-1);
  });

  it('seeds starters once, after the existing order', () => {
    const add = missingStarters([sym]);
    expect(add.map((s) => s.id)).toEqual(WELLBEING_STARTERS.map((s) => s.id));
    expect(add.every((s) => s.kind === 'wellbeing' && s.active)).toBe(true);
    expect(add[0].order).toBe(1);
    expect(missingStarters([sym, wb])).toEqual([]);
    expect(missingStarters([sym, { id: 'wb-energy', name: 'Energy', deletedAt: 1 }])).toEqual([]);
  });

  it('keeps wellbeing out of the health score', () => {
    const entries = {
      '2026-10-18-headache-daily': { date: '2026-10-18', symptomId: 'headache', severity: 0, time: 'daily' },
      '2026-10-18-wb-connected-daily': { date: '2026-10-18', symptomId: 'wb-connected', severity: 5, time: 'daily' },
    };
    const { score, totalActive } = computeHealthScore([sym, wb], entries, '2026-10-18', 'daily');
    expect(totalActive).toBe(1);
    expect(score).toBe(100);
  });

  it('calls a rising wellbeing signal improving', () => {
    const entries = {};
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 20; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const severity = i < 7 ? 4 : 1;
      entries[`${date}-wb-connected-daily`] = { date, symptomId: 'wb-connected', severity, time: 'daily' };
      entries[`${date}-headache-daily`] = { date, symptomId: 'headache', severity, time: 'daily' };
    }
    const { insights } = getInsights(30, entries, [sym, wb]);
    expect(insights.find((x) => x.symptomId === 'wb-connected').direction).toBe('improving');
    expect(insights.find((x) => x.symptomId === 'headache').direction).toBe('worsening');
  });

  it('talk mode introduces the wellbeing scale once', () => {
    const logged = {};
    const checkin = createCheckin({
      symptoms: [sym, wb, { ...wb, id: 'wb-calm-body', name: 'Calm body', order: 2 }],
      timePeriods: [{ id: 'daily', label: 'Today' }],
      selectedDate: new Date('2026-10-18T12:00:00'),
      dateKey: '2026-10-18',
      period: 'daily',
      getEntries: () => logged,
      log: () => {},
      sessions: 10,
    });
    checkin.start();
    const first = checkin.handle('record_symptom', { symptom_id: 'headache', severity: 2 });
    expect(first.next.kind).toBe('wellbeing');
    expect(first.next.say).toMatch(/wellbeing questions/);
    const second = checkin.handle('record_symptom', { symptom_id: 'wb-connected', severity: 4 });
    expect(second.next.say).not.toMatch(/wellbeing questions/);
  });
});
