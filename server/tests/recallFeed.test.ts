import { describe, it, expect } from 'vitest';
import { parseRecallClass } from '../src/services/recallFeed';

describe('Health Canada recall feed — risk-class parsing', () => {
  it('parses single classes', () => {
    expect(parseRecallClass('Type I')).toBe('TYPE_I');
    expect(parseRecallClass('Type II')).toBe('TYPE_II');
    expect(parseRecallClass('Type III')).toBe('TYPE_III');
  });

  it('does not mistake "Type II"/"Type III" for a "Type I" substring match', () => {
    expect(parseRecallClass('Type II')).not.toBe('TYPE_I');
    expect(parseRecallClass('Type III')).not.toBe('TYPE_I');
  });

  it('picks the most severe class from a compound value', () => {
    expect(parseRecallClass('Type II - Type III')).toBe('TYPE_II');
    expect(parseRecallClass('Type II - Type I')).toBe('TYPE_I');
    expect(parseRecallClass('Type I - Type II')).toBe('TYPE_I');
  });

  it('returns null for unusable values rather than guessing', () => {
    expect(parseRecallClass('')).toBeNull();
    expect(parseRecallClass('--')).toBeNull();
    expect(parseRecallClass('Not a class')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(parseRecallClass('type i')).toBe('TYPE_I');
  });
});
