import { describe, it, expect } from 'vitest';
import { toCsv, centsToDollars } from '../src/utils/csv';

describe('CSV export', () => {
  it('serializes rows with a header', () => {
    const csv = toCsv([{ a: 1, b: 'x' }]);
    expect(csv).toBe('a,b\n1,x\n');
  });

  it('quotes and escapes values containing commas, quotes, or newlines', () => {
    const csv = toCsv([{ note: 'a,b', quote: 'he said "hi"' }]);
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"he said ""hi"""');
  });

  it('formats cents as dollar strings', () => {
    expect(centsToDollars(12345)).toBe('123.45');
    expect(centsToDollars(5)).toBe('0.05');
    expect(centsToDollars(0)).toBe('0.00');
  });
});
