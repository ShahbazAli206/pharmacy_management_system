import { describe, it, expect } from 'vitest';
import {
  expensesToQuickBooksIif,
  expensesToSageCsv,
  CATEGORY_GL_ACCOUNT,
  OFFSET_ACCOUNT,
  type ExportableExpense,
} from '../src/services/accountingExport';

const sample: ExportableExpense[] = [
  { id: '1', category: 'RENT_OCCUPANCY', description: 'July rent', amountCents: 250000, vendor: 'Landlord Inc', incurredOn: new Date('2026-07-01') },
  { id: '2', category: 'UTILITIES', description: 'Electricity, and "gas"', amountCents: 15099, vendor: null, incurredOn: new Date('2026-07-15') },
];

describe('QuickBooks IIF export', () => {
  it('emits the standard TRNS/SPL/ENDTRNS header lines, tab-delimited', () => {
    const iif = expensesToQuickBooksIif(sample);
    const lines = iif.split('\n');
    expect(lines[0]).toBe('!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO');
    expect(lines[1]).toBe('!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO');
    expect(lines[2]).toBe('!ENDTRNS');
  });

  it('every TRNS/SPL pair sums to zero', () => {
    const iif = expensesToQuickBooksIif(sample);
    const trnsLines = iif.split('\n').filter((l) => l.startsWith('TRNS\t'));
    const splLines = iif.split('\n').filter((l) => l.startsWith('SPL\t'));
    expect(trnsLines).toHaveLength(sample.length);
    expect(splLines).toHaveLength(sample.length);
    trnsLines.forEach((t, i) => {
      const trnsAmount = Number(t.split('\t')[5]);
      const splAmount = Number(splLines[i].split('\t')[5]);
      expect(trnsAmount + splAmount).toBeCloseTo(0);
    });
  });

  it('posts to the mapped category account and closes every block with ENDTRNS', () => {
    const iif = expensesToQuickBooksIif(sample);
    expect(iif).toContain(CATEGORY_GL_ACCOUNT.RENT_OCCUPANCY.name);
    expect(iif).toContain(OFFSET_ACCOUNT.name);
    expect((iif.match(/^ENDTRNS$/gm) ?? []).length).toBe(sample.length);
  });

  it('uses dollars, not cents', () => {
    const iif = expensesToQuickBooksIif([sample[0]]);
    expect(iif).toContain('2500.00');
  });
});

describe('Sage 50 CSV export', () => {
  it('emits the exact documented header row', () => {
    const csv = expensesToSageCsv(sample);
    const firstLine = csv.split('\r\n')[0];
    expect(firstLine).toBe(
      'Reference,Date,Description,Ledger Account Number,Details,Analysis Type 1,Analysis Type 2,Analysis Type 3,Include on Tax Return,Debit,Credit,Exchange rate',
    );
  });

  it('balances debit and credit to zero within each reference group', () => {
    // Plain descriptions here deliberately — this test's naive split(',') isn't
    // a real CSV parser and would mis-split a quoted, comma-containing field;
    // the escaping behavior itself is covered by its own test below.
    const plain: ExportableExpense[] = [
      { ...sample[0], description: 'July rent' },
      { ...sample[1], description: 'Electricity' },
    ];
    const csv = expensesToSageCsv(plain);
    const rows = csv.trim().split('\r\n').slice(1).map((r) => r.split(','));
    const byRef = new Map<string, number>();
    for (const r of rows) {
      const [ref, , , , , , , , , debit, credit] = r;
      const net = (Number(debit) || 0) - (Number(credit) || 0);
      byRef.set(ref, (byRef.get(ref) ?? 0) + net);
    }
    for (const total of byRef.values()) expect(total).toBeCloseTo(0);
  });

  it('quotes a description containing a comma and an embedded quote', () => {
    const csv = expensesToSageCsv([sample[1]]);
    expect(csv).toContain('"Electricity, and ""gas"""');
  });

  it('formats dates as MM/DD/YYYY', () => {
    const csv = expensesToSageCsv([sample[0]]);
    expect(csv).toContain('07/01/2026');
  });
});
