/**
 * `hashIp` is what every "we store a hash, not your address" promise rests on
 * (sessions, the security log, security reports, profile visitors). An unkeyed
 * SHA-256 of an IPv4 address is reversed by hashing all 2^32 of them, so the
 * hash must be keyed whenever the deployment has a secret.
 */
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashIp } from '@/lib/hash-ip.server';

const plain = (s: string) => createHash('sha256').update(s).digest('hex');

describe('hashIp', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is keyed by BETTER_AUTH_SECRET, so it is not the bare digest of the address', () => {
    vi.stubEnv('IP_HASH_SECRET', '');
    vi.stubEnv('BETTER_AUTH_SECRET', 'secret-a');
    const h = hashIp('203.0.113.9');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toBe(plain('203.0.113.9'));
    expect(h).not.toContain('203.0.113.9');
    expect(hashIp('203.0.113.9')).toBe(h);
    expect(hashIp('203.0.113.10')).not.toBe(h);
  });

  it('changes with the key, and IP_HASH_SECRET wins over BETTER_AUTH_SECRET', () => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'secret-a');
    vi.stubEnv('IP_HASH_SECRET', '');
    const a = hashIp('198.51.100.1');
    vi.stubEnv('BETTER_AUTH_SECRET', 'secret-b');
    expect(hashIp('198.51.100.1')).not.toBe(a);
    vi.stubEnv('IP_HASH_SECRET', 'dedicated');
    const dedicated = hashIp('198.51.100.1');
    vi.stubEnv('BETTER_AUTH_SECRET', 'secret-c');
    expect(hashIp('198.51.100.1')).toBe(dedicated);
  });

  it('falls back to the plain digest only when no secret is configured', () => {
    vi.stubEnv('IP_HASH_SECRET', '');
    vi.stubEnv('BETTER_AUTH_SECRET', '');
    expect(hashIp('192.0.2.7')).toBe(plain('192.0.2.7'));
  });
});
