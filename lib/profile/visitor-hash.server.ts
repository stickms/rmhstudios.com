/**
 * The visitor counter's dedupe key (P9). Server-only, and deliberately free of
 * Prisma so it can be unit-tested: this is the part that decides what is stored
 * about a visitor.
 */
import { hashIp } from '@/lib/hash-ip.server';

export function utcDayString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The dedupe key for one visitor to one profile on one day.
 *
 * Salted with the profile and the day so the stored value cannot be joined
 * across profiles or days into a browsing history, and truncated — it only needs
 * to distinguish visitors, not identify them.
 */
export function visitorHash(visitorKey: string, profileId: string, day: string): string {
  return hashIp(`${visitorKey}|${profileId}|${day}`).slice(0, 32);
}
