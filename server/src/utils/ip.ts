/**
 * Minimal, dependency-free IPv4/IPv6 allow-list matcher for the spec's
 * "role-based IP whitelisting" requirement (§13.1: restrict partner login to
 * a pharmacy IP range). Supports single addresses and CIDR ranges.
 *
 * IPv6 is matched as an exact string only (no CIDR/prefix math) — this app's
 * deployment target is standard IPv4 client traffic; a real IPv6 CIDR
 * implementation is straightforward to add later if a pharmacy's ISP needs it.
 */

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

/** Normalizes an Express `req.ip` value — strips the "::ffff:" IPv4-mapped-IPv6 prefix. */
export function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}

function matchesEntry(ip: string, entry: string): boolean {
  const trimmed = entry.trim();
  if (!trimmed) return false;

  if (trimmed.includes('/')) {
    const [range, prefixStr] = trimmed.split('/');
    const prefix = Number(prefixStr);
    const ipInt = ipv4ToInt(ip);
    const rangeInt = ipv4ToInt(range);
    if (ipInt === null || rangeInt === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
      return false;
    }
    if (prefix === 0) return true;
    const mask = (0xffffffff << (32 - prefix)) >>> 0;
    return (ipInt & mask) === (rangeInt & mask);
  }

  // Exact match (works for both a plain IPv4 address and an IPv6 literal).
  return ip === trimmed;
}

/**
 * Returns true when `ip` matches at least one entry in the comma-separated
 * allow-list. An empty/null list means "no restriction" (always allowed) —
 * callers decide whether that's the case before calling this.
 */
export function ipMatchesAllowList(ip: string, allowList: string): boolean {
  const normalized = normalizeIp(ip);
  return allowList
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .some((entry) => matchesEntry(normalized, entry));
}

/** Validates a single allow-list entry (IPv4 address, IPv4 CIDR, or IPv6 literal). */
export function isValidAllowListEntry(entry: string): boolean {
  const trimmed = entry.trim();
  if (!trimmed) return false;
  if (trimmed.includes('/')) {
    const [range, prefixStr] = trimmed.split('/');
    const prefix = Number(prefixStr);
    return ipv4ToInt(range) !== null && Number.isInteger(prefix) && prefix >= 0 && prefix <= 32;
  }
  return ipv4ToInt(trimmed) !== null || trimmed.includes(':'); // plain IPv4, or a plausible IPv6 literal
}

/** Validates a full comma-separated allow-list string; empty string is valid (no restriction). */
export function isValidAllowList(value: string): boolean {
  const entries = value.split(',').map((e) => e.trim()).filter(Boolean);
  return entries.every(isValidAllowListEntry);
}
