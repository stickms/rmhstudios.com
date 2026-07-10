import { createHash } from 'node:crypto';

/**
 * SHA-256 of a client IP, for abuse correlation without storing raw IPs.
 * Server-only (uses node:crypto) — the `.server` suffix keeps it out of the
 * client bundle even when imported from a `createServerFn` module.
 */
export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}
