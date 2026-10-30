import { describe, it, expect } from 'vitest';
import { averageReadings, bpCategory, lastRecord, startingReading, lastLine, clampField, bpMarkdown, bpCSV, DEFAULT_READING } from '../bloodPressure';

describe('averageReadings', () => {
  it('rounds the mean of each field', () => {
    expect(averageReadings([{ sys: 128, dia: 81, pulse: 68 }, { sys: 124, dia: 78, pulse: 66 }]))
      .toEqual({ sys: 126, dia: 80, pulse: 67 });
  });
  it('averages pulse over the readings that have one', () => {
    expect(averageReadings([{ sys: 120, dia: 80, pulse: 60 }, { sys: 130, dia: 84, pulse: null }]).pulse).toBe(60);
  });
  it('is null with nothing to average', () => {
    expect(averageReadings([])).toBeNull();
  });
});

describe('bpCategory', () => {
  it('lets the higher number decide', () => {
    expect(bpCategory({ sys: 118, dia: 76 }).id).toBe('normal');
    expect(bpCategory({ sys: 124, dia: 79 }).id).toBe('elevated');
    expect(bpCategory({ sys: 118, dia: 82 }).id).toBe('stage1');
    expect(bpCategory({ sys: 141, dia: 70 }).id).toBe('stage2');
    expect(bpCategory({ sys: 150, dia: 121 }).id).toBe('crisis');
  });
});

describe('last reading', () => {
  const records = {
    '2026-10-29T20:10:00-aaaa': { time: '2026-10-29T20:10:00', sys: 124, dia: 79, pulse: 66, readings: [{ sys: 126, dia: 80, pulse: 66 }, { sys: 122, dia: 78, pulse: 66 }] },
    '2026-10-28T08:00:00-bbbb': { time: '2026-10-28T08:00:00', sys: 130, dia: 85, pulse: 70 },
  };
  it('picks the newest record by key', () => {
    expect(lastRecord(records).sys).toBe(124);
  });
  it('starts the steppers from the last saved reading', () => {
    expect(startingReading(records)).toEqual({ sys: 124, dia: 79, pulse: 66 });
    expect(startingReading({})).toEqual(DEFAULT_READING);
  });
  it('describes it relative to today', () => {
    expect(lastLine(records, new Date('2026-10-30T09:00:00'))).toMatch(/^Last 124\/79 · yesterday /);
    expect(lastLine({})).toBeNull();
  });
});

describe('clampField', () => {
  it('keeps a typed number in range', () => {
    expect(clampField('sys', 999)).toBe(260);
    expect(clampField('dia', '79.4')).toBe(79);
  });
});

describe('exports', () => {
  const now = new Date('2026-10-30T12:00:00');
  const records = {
    a: { time: '2026-10-30T07:52:00', sys: 126, dia: 80, pulse: 67, readings: [{ sys: 128, dia: 81, pulse: 68 }, { sys: 124, dia: 78, pulse: 66 }] },
    b: { time: '2026-10-01T08:00:00', sys: 140, dia: 90, pulse: 70 },
  };
  it('puts readings in the window into a markdown table, newest first', () => {
    const md = bpMarkdown(records, 7, now);
    expect(md).toContain('### Blood Pressure');
    expect(md).toContain('| 2026-10-30 | 07:52 | 126 | 80 | 67 | 2 | High, stage 1 |');
    expect(md).not.toContain('2026-10-01');
    expect(bpMarkdown({}, 7, now)).toBe('');
  });
  it('writes every reading to CSV with its cuff readings', () => {
    const lines = bpCSV(records, 99999, now).split('\n');
    expect(lines[0]).toBe('date,time,systolic,diastolic,pulse,readings,category,reading_1,reading_2,reading_3');
    expect(lines[1]).toBe('2026-10-01,08:00,140,90,70,1,"High, stage 2",,,');
    expect(lines[2]).toBe('2026-10-30,07:52,126,80,67,2,"High, stage 1",128/81 68,124/78 66,');
  });
});
