/**
 * Member memory (M3) — the key vocabulary, pure and client-safe.
 *
 * Keys are namespaced so a surface can read a family (`prefers.*`) without
 * knowing every key that will ever exist, and so a key can be retired by
 * ceasing to write it rather than by a migration.
 *
 * The vocabulary is small on purpose. A memory store with an open key space
 * becomes a junk drawer within a month, and the failure is invisible: every
 * surface writes what it likes, nothing reads what another wrote, and the
 * shared memory is five private ones again.
 */

/** Families a memory can belong to. */
export const MEMORY_NAMESPACES = ['prefers', 'goal', 'milestone', 'context'] as const;
export type MemoryNamespace = (typeof MEMORY_NAMESPACES)[number];

/** Who wrote a row. `member` outranks every surface. */
export const MEMORY_SOURCES = ['coach', 'recap', 'assistant', 'catchup', 'member'] as const;
export type MemorySource = (typeof MEMORY_SOURCES)[number];

/**
 * How long a surface-written memory stays true, by namespace.
 *
 * A goal from March is not a goal, and a recommender or a coach acting on one
 * is worse than one acting on nothing — it is confidently wrong about
 * somebody. `prefers` has no expiry because a taste is not an event; it is
 * displaced by a newer write rather than by time.
 */
export const NAMESPACE_TTL_DAYS: Record<MemoryNamespace, number | null> = {
  prefers: null,
  goal: 90,
  milestone: 30,
  context: 7,
};

/** Split a key into its namespace, or null when it is not in the vocabulary. */
export function namespaceOf(key: string): MemoryNamespace | null {
  const head = key.split('.')[0];
  return (MEMORY_NAMESPACES as readonly string[]).includes(head)
    ? (head as MemoryNamespace)
    : null;
}

/** Is this a key a surface is allowed to write? */
export function isValidKey(key: string): boolean {
  if (key.length === 0 || key.length > 64) return false;
  if (!/^[a-z]+(\.[a-z0-9-]+)+$/.test(key)) return false;
  return namespaceOf(key) !== null;
}

/** When a memory written now should stop being trusted. Null = indefinitely. */
export function expiryFor(key: string, now: Date = new Date()): Date | null {
  const ns = namespaceOf(key);
  if (!ns) return null;
  const days = NAMESPACE_TTL_DAYS[ns];
  return days === null ? null : new Date(now.getTime() + days * 86_400_000);
}

/** Has a stored memory passed its expiry? */
export function isExpired(m: { expiresAt: Date | null }, now: Date = new Date()): boolean {
  return m.expiresAt !== null && m.expiresAt.getTime() <= now.getTime();
}

/**
 * May `source` overwrite a row currently written by `existing`?
 *
 * The one rule with teeth: **a member's own correction is never overwritten by
 * a surface.** Somebody who tells the site it is wrong about them should not
 * have to tell it again next week, and a coach cheerfully restoring its own
 * guess is exactly how a memory feature becomes something people switch off.
 */
export function mayOverwrite(existing: MemorySource, incoming: MemorySource): boolean {
  if (existing === 'member') return incoming === 'member';
  return true;
}
