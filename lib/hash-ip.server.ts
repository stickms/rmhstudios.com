import { createHash, createHmac } from 'node:crypto';

/**
 * A keyed hash of a client IP, for abuse correlation without storing raw IPs.
 * Server-only (uses node:crypto) — the `.server` suffix keeps it out of the
 * client bundle even when imported from a `createServerFn` module.
 *
 * Keyed, not a bare SHA-256: there are only 2^32 IPv4 addresses, so an unkeyed
 * digest is undone by hashing all of them, and a leaked `ipHash` column would be
 * a column of addresses. The key is `IP_HASH_SECRET`, or a value derived from
 * `BETTER_AUTH_SECRET` (which every deployment already has) so the hash is keyed
 * without new configuration. Derived, not reused as-is, so this HMAC never shares
 * a key with Better Auth's own signatures. Changing either secret changes every
 * hash: stored hashes only ever compare with hashes made under the same key,
 * which is the one property the callers need.
 *
 * With neither secret set (tests, a bare local checkout) it falls back to the
 * plain digest, which is still never a raw address.
 */
const IP_HASH_CONTEXT = 'rmh-ip-hash-v1';

let cachedKey: { source: string; key: Buffer } | null = null;

function hashKey(): Buffer | null {
  const source = process.env.IP_HASH_SECRET || process.env.BETTER_AUTH_SECRET || '';
  if (!source) return null;
  if (cachedKey?.source !== source) {
    cachedKey = { source, key: createHmac('sha256', source).update(IP_HASH_CONTEXT).digest() };
  }
  return cachedKey.key;
}

export function hashIp(ip: string): string {
  const key = hashKey();
  return key ? createHmac('sha256', key).update(ip).digest('hex') : createHash('sha256').update(ip).digest('hex');
}
