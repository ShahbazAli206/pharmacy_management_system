import { describe, it, expect } from 'vitest';
import { msUntilNextUTC } from '../src/services/scheduler';

describe('scheduler time math', () => {
  it('computes ms until a later time today', () => {
    const now = new Date('2026-07-20T10:00:00.000Z');
    expect(msUntilNextUTC(18, 0, now)).toBe(8 * 60 * 60 * 1000);
  });

  it('rolls over to tomorrow when the target time already passed today', () => {
    const now = new Date('2026-07-20T20:00:00.000Z');
    expect(msUntilNextUTC(18, 0, now)).toBe(22 * 60 * 60 * 1000);
  });

  it('rolls over when the target time is exactly now', () => {
    const now = new Date('2026-07-20T18:00:00.000Z');
    expect(msUntilNextUTC(18, 0, now)).toBe(24 * 60 * 60 * 1000);
  });

  it('handles a minute offset', () => {
    const now = new Date('2026-07-20T00:00:00.000Z');
    expect(msUntilNextUTC(0, 30, now)).toBe(30 * 60 * 1000);
  });
});
