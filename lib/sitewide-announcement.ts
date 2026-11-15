/**
 * Sitewide announcements — shared (client + server) contract.
 *
 * A sitewide announcement is a blog post with `announcement: true`. The newest
 * live one pops up once per visitor and is pinned at the top of the feed.
 * Design: docs/superpowers/specs/2026-11-12-sitewide-announcements-design.md
 *
 * This module is isomorphic: no prisma, no `.server` imports, and no zod — the
 * home feed imports it (`lib/__tests__/zod-off-hot-routes.test.ts`). The zod
 * schemas live in `./sitewide-announcement-schema.ts`.
 */

import {
  readJson,
  writeJson,
} from '@/lib/core/persist';
import type { BusinessId } from './businesses';

/** With no explicit end date, an announcement stops popping up after this long. */
export const ANNOUNCEMENT_DEFAULT_LIFETIME_DAYS = 30;

const DAY_MS =
  24 *
  60 *
  60 *
  1000;

/** What `GET /api/sitewide-announcement` returns about the current announcement. */
export interface SitewideAnnouncementSummary {
  /** BlogPost id. */
  id: string;
  slug: string;
  title: string;
  description: string;
  /** Cover image URL, if the post has one. */
  image:
    | string
    | null;
  business: BusinessId;
  /** ISO timestamp of when the post was (last) announced. */
  announcedAt: string;
  /** ISO timestamp after which the popup and feed card stop showing. */
  expiresAt: string;
  /** The RMHark where the announcement is discussed in the feed, if one was created. */
  discussionPostId:
    | string
    | null;
  /** Markdown body — only present when requested with `?full=1`. */
  content?: string;
}

export interface SitewideAnnouncementResponse {
  announcement: SitewideAnnouncementSummary | null;
  /** True when the signed-in viewer already dismissed it. Always false for anonymous. */
  seen: boolean;
}

/** When an announcement stops being live. */
export function announcementExpiry(
  announcedAt: Date,
  explicitExpiry?: Date | null,
): Date {
  return (
    explicitExpiry ??
    new Date(
      announcedAt.getTime() +
        ANNOUNCEMENT_DEFAULT_LIFETIME_DAYS *
          DAY_MS,
    )
  );
}

/** Client-side liveness check for a summary the browser may have cached. */
export function isAnnouncementLive(
  a: Pick<
    SitewideAnnouncementSummary,
    'expiresAt'
  >,
  now: number = Date.now(),
): boolean {
  const expires =
    Date.parse(
      a.expiresAt,
    );
  return (
    Number.isFinite(
      expires,
    ) &&
    expires >
      now
  );
}

/**
 * Identity of one "announcing" of a post. Re-announcing a post (switching the
 * flag off and on) changes `announcedAt`, so it counts as unseen again.
 */
export function announcementVersion(
  a: Pick<
    SitewideAnnouncementSummary,
    | 'id'
    | 'announcedAt'
  >,
): string {
  return `${a.id}@${a.announcedAt}`;
}

// ─── Device-local "seen" state (logged-out visitors, and instant for members) ──

export const ANNOUNCEMENT_SEEN_STORAGE_KEY =
  'rmh-sitewide-announcements-seen';
const MAX_LOCAL_SEEN = 20;

function readLocalSeen(): string[] {
  return readJson<
    string[]
  >(
    ANNOUNCEMENT_SEEN_STORAGE_KEY,
    [],
    {
      validate:
        (
          value,
        ) =>
          Array.isArray(
            value,
          )
            ? value.filter(
                (
                  v,
                ): v is string =>
                  typeof v ===
                  'string',
              )
            : undefined,
    },
  );
}

/** Has this browser already dismissed this announcing of the post? */
export function hasSeenLocally(
  a: Pick<
    SitewideAnnouncementSummary,
    | 'id'
    | 'announcedAt'
  >,
): boolean {
  return readLocalSeen().includes(
    announcementVersion(
      a,
    ),
  );
}

/** Remember the dismissal in this browser. Safe when storage is unavailable. */
export function markSeenLocally(
  a: Pick<
    SitewideAnnouncementSummary,
    | 'id'
    | 'announcedAt'
  >,
): void {
  const version =
    announcementVersion(
      a,
    );
  const next =
    [
      version,
      ...readLocalSeen().filter(
        (
          v,
        ) =>
          v !==
          version,
      ),
    ].slice(
      0,
      MAX_LOCAL_SEEN,
    );
  writeJson(
    ANNOUNCEMENT_SEEN_STORAGE_KEY,
    next,
  );
}
