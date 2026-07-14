/**
 * Shared shaping + pagination helpers for the v1 API, so every endpoint returns
 * consistent objects and uses the same keyset-pagination envelope.
 */

import { userDisplaySelect, resolveUser } from '@/lib/user-display';

/** The Prisma select for an author block on any post/comment/list item. */
export const apiAuthorSelect = userDisplaySelect;

export interface ApiAuthor {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}

type ResolvableUser = Parameters<typeof resolveUser>[0];

/** Compact public author block. */
export function serializeAuthor(user: ResolvableUser): ApiAuthor {
  const u = resolveUser(user);
  return { id: u.id, name: u.name, handle: u.handle, image: u.image };
}

export interface PageParams {
  limit: number;
  cursor: string | null;
}

/** Parse `?limit=&cursor=` with clamping. Cursor is an opaque string. */
export function parsePage(url: URL, opts: { defaultLimit?: number; maxLimit?: number } = {}): PageParams {
  const def = opts.defaultLimit ?? 20;
  const max = opts.maxLimit ?? 50;
  const raw = parseInt(url.searchParams.get('limit') || String(def), 10);
  const limit = Math.min(Number.isFinite(raw) && raw > 0 ? raw : def, max);
  const cursor = url.searchParams.get('cursor');
  return { limit, cursor: cursor && cursor.length ? cursor : null };
}

/** Build the `{ data, nextCursor }` envelope for a keyset page. */
export function page<T>(items: T[], limit: number, cursorOf: (last: T) => string): { data: T[]; nextCursor: string | null } {
  const nextCursor = items.length === limit ? cursorOf(items[items.length - 1]) : null;
  return { data: items, nextCursor };
}

/** Metrics block shared by post serializers. */
export function metrics(p: { likeCount: number; commentCount: number; repostCount: number; viewCount: number }) {
  return { likes: p.likeCount, comments: p.commentCount, reposts: p.repostCount, views: p.viewCount };
}

interface PostRow {
  id: string;
  content: string;
  createdAt: Date;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  viewCount: number;
  imageUrls?: string[];
  imageAlts?: string[];
}

/** A post owned by the caller (includes audience). */
export function serializeOwnPost(p: PostRow & { audience: string }) {
  return {
    id: p.id,
    content: p.content,
    audience: p.audience,
    imageUrls: p.imageUrls ?? [],
    imageAlts: p.imageAlts ?? [],
    createdAt: p.createdAt,
    metrics: metrics(p),
  };
}

/** A public post with its author block. */
export function serializePublicPost(p: PostRow & { user: ResolvableUser }) {
  return {
    id: p.id,
    content: p.content,
    imageUrls: p.imageUrls ?? [],
    imageAlts: p.imageAlts ?? [],
    createdAt: p.createdAt,
    author: serializeAuthor(p.user),
    metrics: metrics(p),
  };
}
