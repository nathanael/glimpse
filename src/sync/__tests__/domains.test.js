import { describe, it, expect } from 'vitest';
import { DOMAINS, MAP_DOMAINS, DEFINITION_DOMAINS, storageKeyFor, isMonthSharded } from '../domains';

describe('domains config', () => {
  it('lists all eleven sync domains', () => {
    expect(Object.keys(DOMAINS).sort()).toEqual([
      'aiNotes','dailyNotes','entries','inputEntries','inputItems','meals','pinnedSymptoms',
      'stackEntries','stackItems','symptoms','trackingMode',
    ]);
  });
  it('classifies month-sharded map domains', () => {
    expect(MAP_DOMAINS).toEqual(
      expect.arrayContaining(['entries','stackEntries','inputEntries','dailyNotes']));
    ['entries','stackEntries','inputEntries','dailyNotes'].forEach(d =>
      expect(isMonthSharded(d)).toBe(true));
    expect(isMonthSharded('symptoms')).toBe(false);
  });
  it('aiNotes (written by the Glimpse Health MCP) is its own month-sharded map, separate from dailyNotes', () => {
    expect(isMonthSharded('aiNotes')).toBe(true);
    expect(storageKeyFor('aiNotes')).toBe('symptomTracker_aiNotes');
    expect(storageKeyFor('aiNotes')).not.toBe(storageKeyFor('dailyNotes'));
  });
  it('classifies definition domains', () => {
    expect(DEFINITION_DOMAINS).toEqual(
      expect.arrayContaining(['symptoms','stackItems','inputItems','pinnedSymptoms','trackingMode']));
  });
  it('maps domains to their localStorage keys', () => {
    expect(storageKeyFor('entries')).toBe('symptomTracker_entries');
    expect(storageKeyFor('dailyNotes')).toBe('symptomTracker_notes');
  });
});
