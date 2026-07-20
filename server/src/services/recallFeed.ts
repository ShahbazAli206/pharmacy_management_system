/**
 * Health Canada recall feed — pluggable provider interface, backed by a REAL
 * working implementation (not a stub): Health Canada publishes its recalls
 * and safety alerts dataset as public, no-authentication JSON/CSV, updated
 * daily — https://open.canada.ca/data/en/dataset/d38de914-c94c-429b-8ab1-8776c31643e3
 * — unlike OCR/S3/Twilio/DocuSign, this needed no credentials to build for real.
 *
 * Important limitation: the feed has no DIN field at all — only free-text
 * product names ("Product"/"Title"). This app's inventory matching
 * (recalls.service.ts ingestRecall) is intentionally DIN-exact, since a fuzzy
 * name match risks quarantining the wrong stock in a patient-safety-critical
 * system. A recall ingested from this feed without a DIN will still be
 * created and visible on the Recalls page (so pharmacists know to check
 * manually); it just won't auto-quarantine anything. A real production
 * deployment would cross-reference product names against the Health Canada
 * Drug Product Database (DPD) to resolve DINs before ingest — that's a
 * separate integration this feed alone can't provide.
 */

export interface RecallFeedItem {
  recallNumber: string;
  productName: string;
  reason: string;
  risk: 'TYPE_I' | 'TYPE_II' | 'TYPE_III';
  publishedAt: string; // ISO date
  sourceUrl?: string;
}

export interface RecallFeedProvider {
  readonly name: string;
  /** Only recalls last-updated strictly after `sinceISODate` (all, if omitted). */
  fetchDrugRecalls(sinceISODate?: string): Promise<RecallFeedItem[]>;
}

interface HealthCanadaRow {
  NID: string;
  Title: string;
  URL: string;
  Organization: string;
  Product: string;
  Issue: string;
  'Recall class': string;
  'Last updated': string;
  Archived: string;
}

/**
 * The feed mixes single classes ("Type II") with compound ones
 * ("Type II - Type III") and junk values ("", "--"). "Type I" is textually a
 * substring of "Type II", so this must match whole segments, not substrings.
 * When multiple classes are present, the most severe (Type I) wins — exported
 * standalone so it's unit-testable without a network call.
 */
export function parseRecallClass(raw: string): RecallFeedItem['risk'] | null {
  const segments = raw
    .toUpperCase()
    .split(/[-/]/)
    .map((s) => s.trim());
  if (segments.includes('TYPE I')) return 'TYPE_I';
  if (segments.includes('TYPE II')) return 'TYPE_II';
  if (segments.includes('TYPE III')) return 'TYPE_III';
  return null;
}

function rowToItem(row: HealthCanadaRow): RecallFeedItem | null {
  const risk = parseRecallClass(row['Recall class']);
  if (!risk) return null; // unusable class value — skip rather than guess
  const productName = (row.Product || row.Title || '').trim();
  if (!productName) return null;
  return {
    recallNumber: `HC-${row.NID}`,
    productName,
    reason: row.Issue?.trim() || 'See Health Canada bulletin for details',
    risk,
    publishedAt: row['Last updated'],
    sourceUrl: row.URL,
  };
}

const FEED_URL = 'https://recalls-rappels.canada.ca/sites/default/files/opendata-donneesouvertes/HCRSAMOpenData.json';
const DRUG_ORGANIZATION = 'Drugs and health products';

class HealthCanadaRecallFeedProvider implements RecallFeedProvider {
  readonly name = 'health-canada-open-data';

  async fetchDrugRecalls(sinceISODate?: string): Promise<RecallFeedItem[]> {
    const res = await fetch(FEED_URL);
    if (!res.ok) throw new Error(`Health Canada recall feed returned HTTP ${res.status}`);
    const rows = (await res.json()) as HealthCanadaRow[];
    const since = sinceISODate ? new Date(sinceISODate).getTime() : null;

    return rows
      .filter((r) => r.Organization === DRUG_ORGANIZATION && r.Archived === '0')
      .filter((r) => since === null || new Date(r['Last updated']).getTime() > since)
      .map(rowToItem)
      .filter((item): item is RecallFeedItem => item !== null);
  }
}

let provider: RecallFeedProvider = new HealthCanadaRecallFeedProvider();
export const getRecallFeedProvider = () => provider;
export const setRecallFeedProvider = (p: RecallFeedProvider) => {
  provider = p;
};
