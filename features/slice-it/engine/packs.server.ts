/**
 * Slice It — pack storage and reads (L16).
 *
 * The authoring half of `ChartPack`/`ChartPackItem`. See `packs.ts` for the
 * shared contract (kinds, position arithmetic, wire schemas) and the schema
 * comments on the two models for why items are keyed on `songId` rather than
 * the sketch's `chartId`.
 *
 * Server-only.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { resolveUserDisplay } from '@/lib/user-display';
import { artistKeyOf } from './artist';
import {
  PACK_ITEM_MAX,
  POSITION_STEP,
  nextPosition,
  type PackKind,
  type PackListQuery,
  type PackSummary,
} from './packs';

/** The curator shape every pack response carries. Mirrors `songSelect.uploader`. */
const curatorSelect = {
  id: true,
  name: true,
  username: true,
  image: true,
  profile: { select: { displayName: true, customImage: true } },
} as const;

export const packSelect = {
  id: true,
  title: true,
  description: true,
  coverUrl: true,
  kind: true,
  isPublic: true,
  artistKey: true,
  createdAt: true,
  curatorId: true,
  curator: { select: curatorSelect },
  _count: { select: { items: true } },
} as const;

type PackRow = {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  kind: string;
  isPublic: boolean;
  artistKey: string | null;
  createdAt: Date;
  curatorId: string;
  curator: {
    id?: string;
    name?: string | null;
    username?: string | null;
    image?: string | null;
    profile?: { displayName?: string | null; customImage?: string | null } | null;
  } | null;
  _count?: { items?: number };
};

/**
 * Map a pack row to the client contract.
 *
 * Same discipline as `toSliceSong`: the shape is declared once and `curatorId`
 * — a user id — never leaves, only the curator's public display data does.
 */
export function toPackSummary(row: PackRow, viewerId: string | null): PackSummary {
  const display = resolveUserDisplay(
    (row.curator ?? { name: null, image: null }) as Parameters<typeof resolveUserDisplay>[0],
  );
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    coverUrl: row.coverUrl,
    kind: row.kind as PackKind,
    isPublic: row.isPublic,
    artistKey: row.artistKey,
    songCount: row._count?.items ?? 0,
    createdAt: row.createdAt.toISOString(),
    curator: {
      id: row.curator?.id ?? '',
      name: display.name || row.curator?.username || 'Unknown',
      image: display.image ?? null,
    },
    isOwner: viewerId !== null && viewerId === row.curatorId,
  };
}

/**
 * A pack the viewer is allowed to *see*.
 *
 * An unpublished pack is visible only to its curator — a pack in progress is a
 * draft, and a draft with a guessable id being world-readable is the same bug
 * as an unlisted document being world-readable.
 */
export function packVisibilityWhere(viewerId: string | null): Prisma.ChartPackWhereInput {
  return viewerId ? { OR: [{ isPublic: true }, { curatorId: viewerId }] } : { isPublic: true };
}

export async function listPacks(
  query: PackListQuery,
  viewerId: string | null,
): Promise<{ packs: PackSummary[]; nextCursor: string | null }> {
  const where: Prisma.ChartPackWhereInput =
    query.scope === 'mine'
      ? { curatorId: viewerId ?? '__nobody__' }
      : { ...packVisibilityWhere(viewerId) };
  if (query.kind) where.kind = query.kind;
  if (query.artist) where.artistKey = query.artist;

  const skip = query.cursor ? Number(query.cursor) || 0 : 0;
  const rows = await prisma.chartPack.findMany({
    where,
    // `mine` is the builder's own list and wants most-recently-edited first;
    // the public browse wants newest-published. The two indexes on ChartPack
    // are sized for exactly these two orders.
    orderBy:
      query.scope === 'mine'
        ? [{ updatedAt: 'desc' }, { id: 'desc' }]
        : [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    skip,
    select: packSelect,
  });

  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  return {
    packs: page.map((row) => toPackSummary(row, viewerId)),
    nextCursor: hasMore ? String(skip + query.limit) : null,
  };
}

/** One pack, or null when it does not exist or the viewer may not see it. */
export async function readPack(id: string, viewerId: string | null) {
  const row = await prisma.chartPack.findFirst({
    where: { id, ...packVisibilityWhere(viewerId) },
    select: packSelect,
  });
  return row ? toPackSummary(row, viewerId) : null;
}

/** The member song ids of a pack, in pack order. */
export async function packSongIds(packId: string): Promise<string[]> {
  const items = await prisma.chartPackItem.findMany({
    where: { packId },
    orderBy: [{ position: 'asc' }, { songId: 'asc' }],
    take: PACK_ITEM_MAX,
    select: { songId: true },
  });
  return items.map((i) => i.songId);
}

/**
 * Anything that mutates a pack goes through this first.
 *
 * Returns the pack only when the caller curates it. Deliberately does not
 * distinguish "no such pack" from "not yours" to the caller: both are a 404 at
 * the route, because telling a stranger that a private pack id exists is
 * telling them something.
 */
export async function ownedPack(id: string, userId: string) {
  return prisma.chartPack.findFirst({
    where: { id, curatorId: userId },
    select: { id: true, kind: true, title: true },
  });
}

/* ─── Writes ────────────────────────────────────────────────────────────── */

/**
 * Append song ids to a pack, skipping ones already in it.
 *
 * Positions continue from the pack's current tail rather than restarting, and
 * the whole append is one `createMany` — adding twelve songs should be one
 * round trip, not twelve.
 *
 * Returns how many were actually added, so the caller can tell "added 3" from
 * "all 3 were already there" without a second read.
 */
export async function addSongsToPack(
  tx: Prisma.TransactionClient,
  packId: string,
  songIds: readonly string[],
): Promise<number> {
  if (songIds.length === 0) return 0;

  const [existing, tail, total] = await Promise.all([
    tx.chartPackItem.findMany({
      where: { packId, songId: { in: [...songIds] } },
      select: { songId: true },
    }),
    tx.chartPackItem.findFirst({
      where: { packId },
      orderBy: { position: 'desc' },
      select: { position: true },
    }),
    tx.chartPackItem.count({ where: { packId } }),
  ]);

  const already = new Set(existing.map((e) => e.songId));
  // De-duplicated against itself as well as against the pack: `add` arrives
  // from a client and a list with a repeat in it would violate the composite
  // primary key and fail the whole request.
  const fresh: string[] = [];
  const seen = new Set<string>();
  for (const id of songIds) {
    if (already.has(id) || seen.has(id)) continue;
    seen.add(id);
    fresh.push(id);
  }
  if (fresh.length === 0) return 0;

  const room = Math.max(0, PACK_ITEM_MAX - total);
  const accepted = fresh.slice(0, room);
  if (accepted.length === 0) return 0;

  let position = nextPosition(tail?.position ?? null);
  await tx.chartPackItem.createMany({
    data: accepted.map((songId) => {
      const row = { packId, songId, position };
      position += POSITION_STEP;
      return row;
    }),
    skipDuplicates: true,
  });
  return accepted.length;
}

/**
 * Rewrite a pack's order from a client-supplied id list.
 *
 * Renormalises to 10, 20, 30 … rather than trying to place each id between its
 * neighbours. A full reorder has already decided every position, so the sparse
 * gaps buy nothing here — they exist for the *incremental* insert, and this is
 * the operation that restores them.
 *
 * Ids the pack does not contain are ignored, and members the order omits keep
 * their relative order at the end. Both cases mean the client's copy was stale,
 * and dropping a song out of somebody's pack because their browser had not
 * refreshed would be a much worse answer than putting it last.
 */
export async function reorderPack(
  tx: Prisma.TransactionClient,
  packId: string,
  order: readonly string[],
): Promise<void> {
  const items = await tx.chartPackItem.findMany({
    where: { packId },
    orderBy: [{ position: 'asc' }, { songId: 'asc' }],
    select: { songId: true },
  });
  const known = new Set(items.map((i) => i.songId));

  const ordered: string[] = [];
  const placed = new Set<string>();
  for (const id of order) {
    if (!known.has(id) || placed.has(id)) continue;
    placed.add(id);
    ordered.push(id);
  }
  for (const { songId } of items) if (!placed.has(songId)) ordered.push(songId);

  // One UPDATE per row, but only inside the transaction the caller already
  // opened, and only on an explicit reorder — the sparse positions exist so
  // that the common single-insert case never reaches this path.
  await Promise.all(
    ordered.map((songId, index) =>
      tx.chartPackItem.update({
        where: { packId_songId: { packId, songId } },
        data: { position: (index + 1) * POSITION_STEP },
      }),
    ),
  );
}

/* ─── L16: the album path ───────────────────────────────────────────────── */

export interface AlbumPackInput {
  /** The album title, which is also the pack title. */
  album: string;
  /** Display artist, for the pack's `artistKey`. */
  artist: string;
  coverUrl?: string | null;
}

/**
 * Create the album pack for a multi-track upload, **inside the caller's
 * transaction**.
 *
 * The signature takes a `TransactionClient` and not `prisma` for one reason,
 * and it is the whole point of the function: a pack created by a follow-up call
 * after the songs are written is a pack that does not exist when the upload
 * fails half way through. An album upload that dies on track 4 must leave
 * either four songs in a four-track album or nothing at all — never four songs
 * and no album, and never an album pointing at three songs and one hole.
 *
 * `songIds` must already be created in the same transaction.
 */
export async function createAlbumPack(
  tx: Prisma.TransactionClient,
  meta: AlbumPackInput,
  songIds: readonly string[],
  curatorId: string,
): Promise<{ id: string }> {
  const pack = await tx.chartPack.create({
    data: {
      curatorId,
      title: meta.album.slice(0, 120),
      kind: 'album',
      coverUrl: meta.coverUrl ?? null,
      artistKey: artistKeyOf(meta.artist),
      // An album is published with its tracks. A private album pack listing
      // public songs would be a pack nobody could find pointing at songs
      // everybody can.
      isPublic: true,
    },
    select: { id: true },
  });

  await tx.chartPackItem.createMany({
    data: songIds.map((songId, index) => ({
      packId: pack.id,
      songId,
      // Track order is upload order, sparse from the start so a curator can
      // slot a bonus track in later without renumbering.
      position: (index + 1) * POSITION_STEP,
    })),
    skipDuplicates: true,
  });

  return pack;
}
