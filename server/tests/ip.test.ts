import { describe, it, expect } from 'vitest';
import { ipMatchesAllowList, isValidAllowList, normalizeIp } from '../src/utils/ip';

describe('IP allow-list matching (role-based IP whitelisting, spec §13.1)', () => {
  it('matches an exact IPv4 address', () => {
    expect(ipMatchesAllowList('203.0.113.4', '203.0.113.4')).toBe(true);
    expect(ipMatchesAllowList('203.0.113.5', '203.0.113.4')).toBe(false);
  });

  it('matches a CIDR range', () => {
    expect(ipMatchesAllowList('198.51.100.17', '198.51.100.0/24')).toBe(true);
    expect(ipMatchesAllowList('198.51.101.1', '198.51.100.0/24')).toBe(false);
  });

  it('matches against any entry in a comma-separated list', () => {
    const list = '203.0.113.4, 198.51.100.0/24';
    expect(ipMatchesAllowList('203.0.113.4', list)).toBe(true);
    expect(ipMatchesAllowList('198.51.100.200', list)).toBe(true);
    expect(ipMatchesAllowList('192.0.2.1', list)).toBe(false);
  });

  it('strips the IPv4-mapped-IPv6 prefix before matching', () => {
    expect(normalizeIp('::ffff:203.0.113.4')).toBe('203.0.113.4');
    expect(ipMatchesAllowList('::ffff:203.0.113.4', '203.0.113.4')).toBe(true);
  });

  it('rejects malformed entries rather than matching everything', () => {
    expect(ipMatchesAllowList('203.0.113.4', 'not-an-ip')).toBe(false);
    expect(ipMatchesAllowList('203.0.113.4', '203.0.113.0/99')).toBe(false);
  });

  it('validates an allow-list string end to end', () => {
    expect(isValidAllowList('')).toBe(true);
    expect(isValidAllowList('203.0.113.4,198.51.100.0/24')).toBe(true);
    expect(isValidAllowList('203.0.113.4, garbage')).toBe(false);
  });
});
