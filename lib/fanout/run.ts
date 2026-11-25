/**
 * Durable fan-outs, the pure half (s08-05): the lease, the reclaim rule and the "already told" filter.
 * `run.server.ts` holds the database side.
 */

/** A runner owns a run while its `heartbeatAt` is newer than this. */
export const LEASE_MS = 120_000;

/** The reclaim sweep re-queues a run at most this many times; the next time it is stopped as FAILED. */
export const MAX_RECLAIMS = 5;

export const FANOUT_KINDS = ['post-alert', 'event-update', 'tube-party', 'news-story-article'] as const;
export type FanoutKind = (typeof FANOUT_KINDS)[number];

export type FanoutStatusName = 'RUNNING' | 'DONE' | 'FAILED';

export function isFanoutKind(value: unknown): value is FanoutKind {
  return typeof value === 'string' && (FANOUT_KINDS as readonly string[]).includes(value);
}

/** The oldest `heartbeatAt` a live lease can have at `now`. */
export function leaseCutoff(now: Date): Date {
  return new Date(now.getTime() - LEASE_MS);
}

/** True when the run is RUNNING and nobody has renewed its lease for {@link LEASE_MS}. */
export function leaseExpired(
  run: {
    status: FanoutStatusName;
    heartbeatAt: Date;
  },
  now: Date,
): boolean {
  return run.status === 'RUNNING' && run.heartbeatAt.getTime() < leaseCutoff(now).getTime();
}

/**
 * Drop the recipients who already have a delivery from this run: the ids in `told`. Order and duplicates of the
 * remaining ids are kept as given.
 */
export function withoutTold(ids: readonly string[], told: ReadonlySet<string>): string[] {
  return ids.filter((id) => !told.has(id));
}

/**
 * The members among `rows` whose notification is for this subject, from the one batch query. The subject is matched on
 * the notification's `link`, which carries the post or update id: `entityId` is the community or event, shared by every
 * post and update of it, so two subjects in one run window would otherwise be mistaken for each other.
 */
export function toldIds(
  rows: readonly {
    userId: string;
    link: string | null;
  }[],
  link: string,
): Set<string> {
  const out = new Set<string>();
  for (const r of rows) if (r.link === link) out.add(r.userId);
  return out;
}

/** The ids after `cursor`, in id order, at most `size` of them; `nextCursor` is null when none remain after the page. */
export function pageAfter(
  sortedIds: readonly string[],
  cursor: string | null,
  size: number,
): {
  ids: string[];
  nextCursor: string | null;
} {
  const rest = cursor === null ? sortedIds : sortedIds.filter((id) => id > cursor);
  const ids = rest.slice(0, size);
  return {
    ids,
    nextCursor: rest.length > size ? (ids[ids.length - 1] ?? null) : null,
  };
}
