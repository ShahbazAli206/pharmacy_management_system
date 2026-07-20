/**
 * QuickBooks (IIF) and Sage 50 (CSV) export for expenses (spec §8.2/§14).
 *
 * Both formats are real, documented third-party import formats — not
 * guessed. Sources:
 *  - QuickBooks IIF: Intuit's TRNS/SPL/ENDTRNS general-journal-entry
 *    structure, tab-delimited, dates M/D/YYYY, split amounts must sum to
 *    zero against the TRNS amount.
 *    https://quickbooks.intuit.com/learn-support/en-us/help-article/list-management/iif-overview-import-kit-sample-files-headers/L5CZIpJne_US_en_US
 *  - Sage 50 / Sage Business Cloud Accounting (Canada) journal-entry CSV:
 *    Reference,Date,Description,Ledger Account Number,Details,Analysis Type
 *    1-3,Include on Tax Return,Debit,Credit,Exchange rate — dates MM/DD/YYYY,
 *    debit/credit as separate positive-only columns.
 *    https://ca-kb.sage.com/portal/app/portlets/results/viewsolution.jsp?solutionid=240304191549557
 *
 * What CANNOT be guessed generically, for either format: which GL account
 * each expense category should post to. That mapping is inherently
 * deployment-specific (every business's chart of accounts differs) — the
 * account names/numbers below are placeholders a bookkeeper MUST remap to
 * the real chart of accounts before relying on this for actual filing. This
 * is the normal state of any accounting-system export, not a shortcut taken
 * here; the same is true of e.g. Shopify's or Stripe's accounting exports.
 */

import { ExpenseCategory } from '@prisma/client';

export interface ExportableExpense {
  id: string;
  category: ExpenseCategory;
  description: string;
  amountCents: number;
  vendor: string | null;
  incurredOn: Date;
}

interface GlAccount {
  number: string;
  name: string;
}

export const CATEGORY_GL_ACCOUNT: Record<ExpenseCategory, GlAccount> = {
  RENT_OCCUPANCY: { number: '5010', name: 'Rent Expense' },
  PAYROLL: { number: '5020', name: 'Payroll Expense' },
  UTILITIES: { number: '5030', name: 'Utilities Expense' },
  BANK_FINANCING: { number: '5040', name: 'Interest & Bank Charges' },
  INSURANCE: { number: '5050', name: 'Insurance Expense' },
  PROFESSIONAL_FEES: { number: '5060', name: 'Professional Fees' },
  MARKETING: { number: '5070', name: 'Marketing & Advertising' },
  IT_TECHNOLOGY: { number: '5080', name: 'IT & Technology Expense' },
  INVENTORY_PURCHASES: { number: '5090', name: 'Inventory Purchases' },
  REPAIRS_MAINTENANCE: { number: '5100', name: 'Repairs & Maintenance' },
  MISCELLANEOUS: { number: '5110', name: 'Miscellaneous Expense' },
};

export const OFFSET_ACCOUNT: GlAccount = { number: '2000', name: 'Accounts Payable' };

const mmddyyyy = (d: Date) => {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getUTCFullYear()}`;
};

/** M/D/YYYY (no zero-padding) — the format IIF actually expects. */
const iifDate = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;

const iifEscape = (v: string) => v.replace(/\t/g, ' ').replace(/[\r\n]/g, ' ');
const csvEscape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * One TRNS/SPL/ENDTRNS block per expense: debit the category's expense
 * account, credit Accounts Payable — a standard "expense incurred, not yet
 * paid" journal entry. amountCents is dollars-and-cents; IIF wants a plain
 * decimal amount, not cents.
 */
export function expensesToQuickBooksIif(expenses: ExportableExpense[]): string {
  const lines = ['!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO', '!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO', '!ENDTRNS'];

  for (const e of expenses) {
    const account = CATEGORY_GL_ACCOUNT[e.category];
    const dollars = (e.amountCents / 100).toFixed(2);
    const negDollars = (-e.amountCents / 100).toFixed(2);
    const date = iifDate(e.incurredOn);
    const memo = iifEscape(e.description);
    const vendor = iifEscape(e.vendor ?? '');

    lines.push(`TRNS\tGENERAL JOURNAL\t${date}\t${account.name}\t${vendor}\t${dollars}\t${memo}`);
    lines.push(`SPL\tGENERAL JOURNAL\t${date}\t${OFFSET_ACCOUNT.name}\t${vendor}\t${negDollars}\t${memo}`);
    lines.push('ENDTRNS');
  }
  return lines.join('\n') + '\n';
}

/** One 2-line journal entry (debit + credit) per expense, grouped by a shared Reference. */
export function expensesToSageCsv(expenses: ExportableExpense[]): string {
  const header = 'Reference,Date,Description,Ledger Account Number,Details,Analysis Type 1,Analysis Type 2,Analysis Type 3,Include on Tax Return,Debit,Credit,Exchange rate';
  const rows = [header];

  expenses.forEach((e, i) => {
    const account = CATEGORY_GL_ACCOUNT[e.category];
    const reference = `EXP${String(i + 1).padStart(5, '0')}`;
    const date = mmddyyyy(e.incurredOn);
    const description = csvEscape(e.description);
    const dollars = (e.amountCents / 100).toFixed(2);

    rows.push(`${reference},${date},${description},${account.number},${csvEscape(account.name)},,,,No,${dollars},,`);
    rows.push(`${reference},${date},${description},${OFFSET_ACCOUNT.number},${csvEscape(OFFSET_ACCOUNT.name)},,,,No,,${dollars},`);
  });
  return rows.join('\r\n') + '\r\n';
}
