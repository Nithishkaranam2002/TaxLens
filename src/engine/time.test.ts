import { describe, expect, it } from 'vitest';
import { firmDay, firmEndOfDay, fmtDate } from './time';

describe('firm calendar (Central time)', () => {
  it('names an evening upload by the day it happened in Austin', () => {
    expect(firmDay('2026-01-21T03:12:00Z')).toBe('2026-01-20'); // 9:12 PM CST on Jan 20
    expect(firmDay('2026-07-01T14:00:00Z')).toBe('2026-07-01');
    expect(fmtDate('2026-06-05T00:41:00Z')).toBe('Jun 4, 2026'); // 7:41 PM CDT
  });
  it('leaves plain dates alone', () => {
    expect(firmDay('2026-04-15')).toBe('2026-04-15');
    expect(fmtDate('2026-04-15', false)).toBe('Apr 15');
  });
  it('ends a day at Central midnight in summer and winter', () => {
    expect(firmEndOfDay('2026-07-14')).toBe('2026-07-15T04:59:59Z');
    expect(firmEndOfDay('2026-01-20')).toBe('2026-01-21T05:59:59Z');
    expect(firmDay(firmEndOfDay('2026-03-08'))).toBe('2026-03-08'); // daylight saving starts
    expect(firmDay(firmEndOfDay('2026-11-01'))).toBe('2026-11-01'); // daylight saving ends
  });
});
