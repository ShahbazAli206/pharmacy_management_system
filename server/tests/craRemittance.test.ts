import { describe, it, expect } from 'vitest';
import { craRemittanceDueDate } from '../src/services/craRemittance';

// UTC throughout, matching how incurredOn is actually parsed in production
// (new Date("YYYY-MM-DD") is UTC midnight) — a server running in a
// negative-UTC-offset timezone must not drift the computed due date.
describe('CRA remittance due-date computation', () => {
  it('regular remitter: due the 15th of the following month', () => {
    expect(craRemittanceDueDate(new Date('2026-01-20'), 'REGULAR')).toEqual(new Date('2026-02-15'));
    expect(craRemittanceDueDate(new Date('2026-12-05'), 'REGULAR')).toEqual(new Date('2027-01-15'));
  });

  it('quarterly remitter: due the 15th of the month after quarter-end', () => {
    expect(craRemittanceDueDate(new Date('2026-01-10'), 'QUARTERLY')).toEqual(new Date('2026-04-15')); // Q1 -> Apr 15
    expect(craRemittanceDueDate(new Date('2026-04-01'), 'QUARTERLY')).toEqual(new Date('2026-07-15')); // Q2 -> Jul 15
    expect(craRemittanceDueDate(new Date('2026-09-30'), 'QUARTERLY')).toEqual(new Date('2026-10-15')); // Q3 -> Oct 15
    expect(craRemittanceDueDate(new Date('2026-12-31'), 'QUARTERLY')).toEqual(new Date('2027-01-15')); // Q4 -> Jan 15
  });
});
