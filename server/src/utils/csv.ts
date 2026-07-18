/** Minimal, dependency-free CSV serializer with correct quoting/escaping. */
export function toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  if (rows.length === 0) return columns ? columns.join(',') + '\n' : '';
  const cols = columns ?? Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.join(',');
  const body = rows.map((r) => cols.map((c) => escape(r[c])).join(',')).join('\n');
  return `${header}\n${body}\n`;
}

/** Cents -> dollar string for exports, e.g. 12345 -> "123.45". */
export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}
