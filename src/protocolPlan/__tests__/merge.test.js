import { describe, it, expect } from 'vitest';
import { planItemsView, planForDef, resolveSelection, planTag } from '../plan';

const today = '2026-11-22';
const stack = [
  { id: 'zinc', name: 'Zinc', active: true, schedule: { type: 'daily', startDate: '2026-11-22' } },
  { id: 'mag', name: 'Magnesium', active: true, schedule: { type: 'daily', startDate: '2026-03-01' } },
  { id: 'berb', name: 'Berberine', active: false, schedule: { type: 'daily', startDate: '2026-10-01' } },
];
const plan = [
  { itemId: 'p-zinc', name: 'Zinc', kind: 'supplement', startDate: '2026-11-22', endDate: '2026-12-19', source: { type: 'nicole_consult' }, author: 'claude-mcp', linked: { kind: 'supplement', id: 'zinc' } },
  { itemId: 'p-berb', name: 'Berberine', kind: 'supplement', startDate: '2026-10-01', status: 'ended', endedOn: '2026-11-21', linked: { kind: 'supplement', id: 'berb' } },
  { itemId: 'p-gone', name: 'Gone', kind: 'supplement', startDate: '2026-11-01', deleted: true },
  { itemId: 'p-test', name: 'Retest', kind: 'test', startDate: '2027-01-05' },
];

describe('one protocol: plan and lists together', () => {
  const view = planItemsView(plan, stack, today);

  it('shows plan items plus a row for each listed supplement no plan item covers', () => {
    expect(view.map((i) => i.itemId)).toEqual(['p-zinc', 'p-berb', 'p-test', 'list-mag']);
  });

  it('finds the running plan entry behind a list item, and an ended one only when asked', () => {
    expect(planForDef(view, 'supplement', 'zinc', today).itemId).toBe('p-zinc');
    expect(planForDef(view, 'supplement', 'mag', today).itemId).toBe('list-mag');
    expect(planForDef(view, 'supplement', 'berb', today)).toBeNull();
    expect(planForDef(view, 'supplement', 'berb', today, { includeEnded: true }).itemId).toBe('p-berb');
  });

  it('resolves a selection made from either view to the same item', () => {
    const ctx = { stackItems: stack, inputItems: [], view, todayKey: today };
    const fromList = resolveSelection({ kind: 'supplement', id: 'zinc' }, ctx);
    const fromPlan = resolveSelection({ planId: 'p-zinc' }, ctx);
    expect(fromList.def.id).toBe('zinc');
    expect(fromList.plan.itemId).toBe('p-zinc');
    expect(fromPlan).toEqual(fromList);
    // A test has no list item; a hidden supplement shows the course that ended
    expect(resolveSelection({ planId: 'p-test' }, ctx)).toMatchObject({ def: null, kind: null });
    expect(resolveSelection({ kind: 'supplement', id: 'berb' }, ctx).plan.itemId).toBe('p-berb');
    expect(resolveSelection({ kind: 'supplement', id: 'nope' }, ctx)).toBeNull();
    expect(resolveSelection(null, ctx)).toBeNull();
  });

  it('labels a checklist row with who prescribed it and until when', () => {
    expect(planTag(view[0])).toBe('Nicole · until Dec 19');
    expect(planTag(view.find((i) => i.itemId === 'list-mag'))).toBeNull();
    expect(planTag({ source: { type: 'nate' }, endDate: '2026-12-05' })).toBe('until Dec 5');
  });
});
