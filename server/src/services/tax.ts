import { Province } from '@prisma/client';

/**
 * Combined federal + provincial sales-tax rate applied to TAXABLE goods
 * (OTC products, supplies). Prescription drugs are zero-rated in Canada and are
 * marked non-taxable at the line level, so this rate never applies to them.
 *
 * Rates are the common combined GST/HST(+PST/QST) figures; a production system
 * should source these from a maintained tax table, since PST/RST base rules
 * vary by item category.
 */
const PROVINCE_TAX_RATE: Record<Province, number> = {
  ON: 0.13,
  BC: 0.12,
  AB: 0.05,
  MB: 0.12,
  SK: 0.11,
  QC: 0.14975,
  NS: 0.15,
  NB: 0.15,
  NL: 0.15,
  PE: 0.15,
  NT: 0.05,
  YT: 0.05,
  NU: 0.05,
};

export function taxRateFor(province: Province): number {
  return PROVINCE_TAX_RATE[province];
}

/** Tax on a taxable amount (in cents), rounded to the nearest cent. */
export function taxCentsFor(province: Province, taxableCents: number): number {
  return Math.round(taxableCents * PROVINCE_TAX_RATE[province]);
}
