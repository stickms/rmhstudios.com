/**
 * The unified activity stream — client-safe contract (C7).
 *
 * `Activity` is the append-only record of "things this user touched". History,
 * recents, saves and bookmarks each answered that question with a different
 * storage strategy; this is the one source the resume rail (B2), the cross-app
 * quest chains (F19) and the "now" profile block (F8) project from.
 *
 * This file deliberately holds NO Prisma import. The verbs are re-declared as a
 * plain union rather than re-exported from `@prisma/client` so that a browser
 * bundle can name a verb (the `/api/activity` POST body, an analytics call site
 * in a game) without dragging the client in. `emit.server.ts` asserts the two
 * spellings agree at compile time, so a schema change that adds a verb fails the
 * typecheck here rather than silently drifting.
 */

import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* Verbs                                                                      */
/* -------------------------------------------------------------------------- */

/** Mirrors `enum ActivityVerb` in `prisma/schema.prisma`. */
export const ACTIVITY_VERBS = [
  'VIEWED',
  'PLAYED',
  'SAVED',
  'COMPLETED',
  'RATED',
  'SHARED',
] as const;

export type ActivityVerb = (typeof ACTIVITY_VERBS)[number];

export function isActivityVerb(value: string): value is ActivityVerb {
  return (ACTIVITY_VERBS as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/* Kinds                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The entity families that currently emit activity.
 *
 * `kind` is a `VarChar(24)` rather than an enum on purpose — a new game or app
 * should be able to emit without a migration — so this list is a *convention*,
 * not a constraint. Anything longer than {@link ACTIVITY_KIND_MAX} would be
 * rejected by Postgres at flush time and take the whole batch down with it, so
 * the emitter drops over-long kinds instead of learning that at 2am.
 */
export const ACTIVITY_KINDS = [
  'post',
  'game',
  'doc',
  'video',
  'song',
  'deck',
  'build',
  'guide',
  'app',
  'news',
  'blog',
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** `@db.VarChar(24)` on `Activity.kind`. */
export const ACTIVITY_KIND_MAX = 24;
/** Generous, but finite — an id is a cuid/uuid/slug, never a payload. */
export const ACTIVITY_ENTITY_ID_MAX = 191;

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Extra context for the row's `meta` column. Scalars only: `meta` exists to
 * carry "which level", "how far in", "which surface referred them" — the things
 * a resume card renders — not a nested copy of the entity.
 */
export type ActivityMeta = Record<string, string | number | boolean | null>;

/** One event as a caller describes it. `at` defaults to the emit time. */
export interface ActivityEvent {
  userId: string;
  verb: ActivityVerb;
  /** One of {@link ACTIVITY_KINDS} by convention; any ≤24-char tag is legal. */
  kind: string;
  entityId: string;
  meta?: ActivityMeta;
  at?: Date;
}

/**
 * The buffer's de-duplication key.
 *
 * Joined on NUL rather than `:` because entity ids are user-influenced in places
 * (slugs, handles) and a colon-joined key can be forged into a collision with a
 * different tuple — one user's event silently swallowing another's. NUL cannot
 * appear in any of the four fields, so the join is unambiguous.
 */
export function activityKey(event: Pick<ActivityEvent, 'userId' | 'verb' | 'kind' | 'entityId'>) {
  const SEP = '\u0000';
  return `${event.userId}${SEP}${event.verb}${SEP}${event.kind}${SEP}${event.entityId}`;
}

/* -------------------------------------------------------------------------- */
/* Wire schema (`POST /api/activity`)                                         */
/* -------------------------------------------------------------------------- */

/**
 * `meta` is capped at 12 scalar keys. It is user-supplied JSON going into a
 * `Json` column, so without a ceiling a signed-in caller can write arbitrary
 * kilobytes per event at whatever rate the bucket allows.
 */
const metaSchema = z
  .record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean(), z.null()]))
  .refine((m) => Object.keys(m).length <= 12, { message: 'too many meta keys' });

export const activityEventSchema = z.object({
  verb: z.enum(ACTIVITY_VERBS),
  kind: z.string().min(1).max(ACTIVITY_KIND_MAX),
  entityId: z.string().min(1).max(ACTIVITY_ENTITY_ID_MAX),
  meta: metaSchema.optional(),
});

/**
 * Clients POST a BATCH, never a single event.
 *
 * The endpoint is the network mirror of the server-side buffer: a feed scroll
 * produces a burst of VIEWED events, and the cost that matters on a phone is the
 * number of requests, not the number of rows. 50 is roughly two screens of a
 * dense grid.
 */
export const ACTIVITY_BATCH_MAX = 50;

export const activityBatchSchema = z.object({
  events: z.array(activityEventSchema).min(1).max(ACTIVITY_BATCH_MAX),
});

export type ActivityBatchInput = z.infer<typeof activityBatchSchema>;

/* -------------------------------------------------------------------------- */
/* Read shape                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A row as the API returns it. `id` is a **string**: `Activity.id` is a `BigInt`
 * and `JSON.stringify` throws on one ("Do not know how to serialize a BigInt"),
 * which is a 500 on the read path that no test with a mocked Prisma would catch.
 */
export interface ActivityView {
  id: string;
  verb: ActivityVerb;
  kind: string;
  entityId: string;
  meta: ActivityMeta;
  at: string;
}
