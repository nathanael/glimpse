import { describe, it, expect } from 'vitest';
import { phaseOf, pendingAlerts, timelineRange, barFor, addDaysKey, daysBetween, groupItems, doseText, findByName } from '../plan';

const T = '2026-11-22';
describe('protocol plan', () => {
  it('derives phase from status and dates', () => {
    expect(phaseOf({ startDate: '2026-12-01' }, T)).toBe('upcoming');
    expect(phaseOf({ startDate: T }, T)).toBe('active');
    expect(phaseOf({ startDate: '2026-11-01', endDate: '2026-11-21' }, T)).toBe('ended');
    expect(phaseOf({ startDate: '2026-11-01', status: 'ended' }, T)).toBe('ended');
    expect(phaseOf({ status: 'planned' }, T)).toBe('upcoming');
    expect(phaseOf({ status: 'active' }, T)).toBe('active');
  });
  it('raises end before start before added, and respects acks', () => {
    const items = [
      { itemId: 'a', startDate: '2026-12-01', updatedAt: '2026-11-22T09:00:00Z' },
      { itemId: 'b', startDate: '2026-11-20' },
      { itemId: 'c', startDate: '2026-11-01', status: 'ended', ack: { start: 'x' } },
      { itemId: 'd', startDate: '2026-11-01', status: 'ended' },
      { itemId: 'e', startDate: '2026-12-01', ack: { added: '2026-11-22T10:00:00Z' }, updatedAt: '2026-11-22T09:00:00Z' },
      { itemId: 'f', startDate: '2026-12-01', ack: { added: '2026-11-21T10:00:00Z' }, updatedAt: '2026-11-22T09:00:00Z' },
      { itemId: 'g', startDate: '2026-12-01', author: 'nate' },
    ];
    expect(pendingAlerts(items, T).map((a) => `${a.type}:${a.item.itemId}`)).toEqual(['end:c', 'start:b', 'updated:f', 'added:a']);
  });
  it('date math', () => {
    expect(addDaysKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-11-22', '2026-12-01')).toBe(9);
  });
  it('lays out bars in the window', () => {
    const r = timelineRange([], T);
    expect(r.days).toBe(71);
    const b = barFor({ startDate: T, endDate: addDaysKey(T, 13) }, r);
    expect(b.left).toBeCloseTo(14 / 71);
    expect(b.width).toBeCloseTo(14 / 71);
    expect(barFor({ startDate: T }, r).open).toBe(true);
    expect(barFor({ startDate: '2026-01-01', endDate: '2026-02-01' }, r)).toBe(null);
  });
  it('widens the window to fit far items', () => {
    expect(timelineRange([{ startDate: '2027-03-01' }], T).to).toBe('2027-03-08');
  });
  it('groups and formats', () => {
    const g = groupItems([{ startDate: '2026-12-05' }, { startDate: '2026-12-01' }, { startDate: T }], T);
    expect(g.upcoming.map((i) => i.startDate)).toEqual(['2026-12-01', '2026-12-05']);
    expect(doseText({ dose: 500, unit: 'mg', frequency: 'twice daily' })).toBe('500 mg · twice daily');
    expect(findByName([{ name: 'Zinc Carnosine' }], ' zinc carnosine')).toBeTruthy();
  });
});

import { applyEdits, editsFor, listRows, dragDates, listItemId } from '../plan';

describe('edits on Claude items', () => {
  const raw = { itemId: 'a', author: 'claude-mcp', name: 'X', startDate: '2026-12-05', endDate: '2027-03-13', dose: '1 cap' };
  it('shows edited values and keeps the planned ones', () => {
    const v = applyEdits({ ...raw, edits: { startDate: '2026-12-01' } });
    expect(v.startDate).toBe('2026-12-01');
    expect(v.planned).toEqual({ startDate: '2026-12-05' });
  });
  it('ignores edits on Nate items', () => {
    expect(applyEdits({ ...raw, author: 'nate', edits: { startDate: 'z' } }).startDate).toBe('2026-12-05');
  });
  it('drops edits set back to the original and keeps only changes', () => {
    const e = editsFor({ ...raw, edits: { startDate: '2026-12-01' } }, { startDate: '2026-12-05', endDate: '2027-04-01', dose: '1 cap' });
    expect(e).toEqual({ endDate: '2027-04-01' });
  });
});

describe('listRows', () => {
  const stack = [
    { id: 'mag', name: 'Magnesium', active: true, defaultDose: 200, unit: 'mg', schedule: { type: 'daily', startDate: '2026-10-01' } },
    { id: 'd3', name: 'D3', active: true, history: [{ type: 'created', timestamp: '2026-09-01T10:00:00Z' }] },
    { id: 'old', name: 'Old', active: false },
    { id: 'gone', name: 'Gone', active: true, deletedAt: '2026-11-01' },
  ];
  it('adds uncovered active supplements as linked rows', () => {
    const rows = listRows(stack, [{ itemId: 'p', linked: { kind: 'supplement', id: 'mag' } }], '2026-11-22');
    expect(rows.map((r) => r.itemId)).toEqual([listItemId('d3')]);
    expect(rows[0]).toMatchObject({ startDate: '2026-09-01', fromList: true, linked: { kind: 'supplement', id: 'd3' }, author: 'nate' });
  });
});

describe('dragDates', () => {
  const it0 = { startDate: '2026-12-05', endDate: '2026-12-20' };
  it('moves both dates', () => expect(dragDates(it0, 'move', 3, 'x')).toEqual({ startDate: '2026-12-08', endDate: '2026-12-23' }));
  it('moves start but not past end', () => expect(dragDates(it0, 'start', 30, 'x')).toEqual({ startDate: '2026-12-20', endDate: '2026-12-20' }));
  it('moves end but not before start', () => expect(dragDates(it0, 'end', -30, 'x')).toEqual({ startDate: '2026-12-05', endDate: '2026-12-05' }));
  it('gives an open item an end from where the drag began', () => {
    expect(dragDates({ startDate: '2026-12-05' }, 'end', -2, 'x', '2027-01-10')).toEqual({ startDate: '2026-12-05', endDate: '2027-01-08' });
  });
  it('no change for zero delta', () => expect(dragDates(it0, 'move', 0, 'x')).toBeNull());
});
