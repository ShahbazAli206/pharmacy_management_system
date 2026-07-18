import { describe, it, expect } from 'vitest';
import { taxRateFor, taxCentsFor } from '../src/services/tax';

describe('Canadian sales tax', () => {
  it('applies the correct HST/GST rate per province', () => {
    expect(taxRateFor('ON')).toBeCloseTo(0.13);
    expect(taxRateFor('AB')).toBeCloseTo(0.05);
    expect(taxRateFor('QC')).toBeCloseTo(0.14975);
  });

  it('computes tax in cents, rounded', () => {
    expect(taxCentsFor('ON', 10000)).toBe(1300); // $100 -> $13.00
    expect(taxCentsFor('AB', 10000)).toBe(500); // $100 -> $5.00
    expect(taxCentsFor('QC', 10000)).toBe(1498); // 14.975% of $100, rounded
  });

  it('returns zero tax on a zero taxable amount', () => {
    expect(taxCentsFor('ON', 0)).toBe(0);
  });
});
