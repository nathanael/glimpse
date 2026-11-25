import { describe, it, expect } from 'vitest';
import { nameScore, findSimilar, editDistance } from '../fuzzyMatch';

describe('fuzzyMatch', () => {
  it('scores exact, prefix, typo and word matches', () => {
    expect(nameScore('magnesium glycinate', 'Magnesium Glycinate')).toBe(1);
    expect(nameScore('Magnes', 'Magnesium glycinate')).toBeGreaterThan(0.8);
    expect(nameScore('magnesim', 'Magnesium glycinate')).toBeGreaterThan(0.45);
    expect(nameScore('glycinate mag', 'Magnesium glycinate')).toBeGreaterThan(0.45);
    expect(nameScore('brain fogg', 'Brain fog')).toBeGreaterThan(0.45);
    expect(nameScore('vitamin d3', 'Vitamin D-3')).toBe(1);
    expect(nameScore('fish', 'Ashwagandha')).toBe(0);
    expect(nameScore('zinc', 'Iron')).toBe(0);
    expect(nameScore('a', 'Alcohol')).toBe(0);
  });
  it('counts swapped letters as one edit', () => {
    expect(editDistance('alcohol', 'alchool')).toBe(1);
  });
  it('finds hidden and deleted items across lists, best first', () => {
    const res = findSimilar('alchol', [
      ['supplement', [{ id: 'a', name: 'Ashwagandha', active: true }]],
      ['factor', [{ id: 'b', name: 'Alcohol', active: false }, { id: 'c', name: 'Alcohol (wine)', deletedAt: '2026-11-01', active: false }]],
    ]);
    expect(res.map((r) => r.item.id)).toEqual(['b', 'c']);
    expect(res[0].status).toBe('hidden');
    expect(res[1].status).toBe('deleted');
  });
});
