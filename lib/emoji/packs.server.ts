/**
 * Emoji & sticker packs — server queries.
 *
 * The membership rule this file enforces: **creating** a pack or adding an item
 * needs a membership (the routes gate on `sticker-packs`), **installing** and
 * **using** one does not. Nothing here checks entitlement itself — that belongs
 * to `defineHandler`'s `feature` option so the refusal carries an upgrade
 * envelope. What this file owns is ownership, moderation status and counts.
 */

import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect } from '@/lib/user-display';
import {
  MAX_ITEMS_PER_PACK,
  MAX_PACKS_PER_USER,
  MAX_SUBSCRIPTIONS,
  packListable,
  packUsableBy,
  slugifyPackName,
  type InstalledPack,
  type PackItem,
  type PackSummary,
} from '@/lib/emoji/packs';

const packSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  kind: true,
  coverUrl: true,
  itemCount: true,
  subscriberCount: true,
  ownerId: true,
  status: true,
  visibility: true,
  owner: { select: userDisplaySelect },
} as const;

const itemSelect = {
  id: true,
  name: true,
  kind: true,
  url: true,
  alt: true,
  animated: true,
} as const;

type PackRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: string;
  coverUrl: string | null;
  itemCount: number;
  subscriberCount: number;
  ownerId: string;
  owner: { id: string; name: string | null; handle?: string | null } | null;
};

function toSummary(row: PackRow, subscribed?: boolean): PackSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    kind: row.kind as PackSummary['kind'],
    coverUrl: row.coverUrl,
    itemCount: row.itemCount,
    subscriberCount: row.subscriberCount,
    owner: {
      id: row.owner?.id ?? row.ownerId,
      name: row.owner?.name ?? null,
      handle: row.owner?.handle ?? null,
    },
    ...(subscribed === undefined ? {} : { subscribed }),
  };
}

/**
 * The viewer's installed packs with their items — the payload the composer and
 * the picker need in one round trip.
 *
 * Ordered by the subscriber's own `position`, because that order decides which
 * pack wins a shortcode collision (`resolveCustomShortcodes`).
 */
export async function listInstalledPacks(userId: string): Promise<InstalledPack[]> {
  const subs = await prisma.emojiPackSubscription.findMany({
    where: { userId },
    orderBy: { position: 'asc' },
    select: {
      pack: {
        select: { ...packSelect, items: { select: itemSelect, orderBy: { position: 'asc' } } },
      },
    },
  });

  const out: InstalledPack[] = [];
  for (const { pack } of subs) {
    // A pack removed by moderation after installation must stop resolving, so
    // the check happens on read rather than only at subscribe time.
    if (!packUsableBy(pack, userId)) continue;
    out.push({
      ...toSummary(pack, true),
      items: pack.items.map((i) => ({ ...i, kind: i.kind as PackItem['kind'] })),
    });
  }
  return out;
}

/** A creator's own packs, including pending and private ones. */
export async function listOwnedPacks(userId: string): Promise<PackSummary[]> {
  const rows = await prisma.emojiPack.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: 'desc' },
    select: packSelect,
  });
  return rows.map((r) => toSummary(r));
}

/** Public browse. Only approved, public packs. */
export async function browsePacks(
  viewerId: string | null,
  opts: { query?: string; take?: number; cursor?: string } = {},
): Promise<PackSummary[]> {
  const take = Math.min(opts.take ?? 30, 60);
  const rows = await prisma.emojiPack.findMany({
    where: {
      status: 'APPROVED',
      visibility: 'public',
      itemCount: { gt: 0 },
      ...(opts.query
        ? {
            OR: [
              { name: { contains: opts.query, mode: 'insensitive' as const } },
              { description: { contains: opts.query, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ subscriberCount: 'desc' }, { createdAt: 'desc' }],
    take,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: packSelect,
  });

  const installed = viewerId
    ? new Set(
        (
          await prisma.emojiPackSubscription.findMany({
            where: { userId: viewerId, packId: { in: rows.map((r) => r.id) } },
            select: { packId: true },
          })
        ).map((s) => s.packId),
      )
    : new Set<string>();

  return rows.filter(packListable).map((r) => toSummary(r, installed.has(r.id)));
}

export async function getPackBySlug(
  slug: string,
  viewerId: string | null,
): Promise<InstalledPack | null> {
  const pack = await prisma.emojiPack.findUnique({
    where: { slug },
    select: { ...packSelect, items: { select: itemSelect, orderBy: { position: 'asc' } } },
  });
  if (!pack || !packUsableBy(pack, viewerId)) return null;

  const subscribed = viewerId
    ? Boolean(
        await prisma.emojiPackSubscription.findUnique({
          where: { packId_userId: { packId: pack.id, userId: viewerId } },
          select: { packId: true },
        }),
      )
    : false;

  return {
    ...toSummary(pack, subscribed),
    items: pack.items.map((i) => ({ ...i, kind: i.kind as PackItem['kind'] })),
  };
}

export class PackError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Create an empty pack. The caller has already passed the membership gate. */
export async function createPack(
  userId: string,
  input: { name: string; description?: string; kind: string; visibility: string },
): Promise<PackSummary> {
  const count = await prisma.emojiPack.count({ where: { ownerId: userId } });
  if (count >= MAX_PACKS_PER_USER) {
    throw new PackError(`You can have at most ${MAX_PACKS_PER_USER} packs.`);
  }

  // Slugs are globally unique; disambiguate rather than failing under the user.
  const base = slugifyPackName(input.name);
  let slug = base;
  for (let attempt = 1; attempt <= 20; attempt++) {
    const taken = await prisma.emojiPack.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) break;
    slug = `${base}-${attempt + 1}`.slice(0, 48);
    if (attempt === 20) throw new PackError('Could not allocate a slug for that name.');
  }

  const row = await prisma.emojiPack.create({
    data: {
      ownerId: userId,
      slug,
      name: input.name,
      description: input.description ?? null,
      kind: input.kind,
      visibility: input.visibility,
      // Nothing is usable by others until it has been through moderation.
      status: 'PENDING',
    },
    select: packSelect,
  });
  return toSummary(row);
}

/**
 * Packs are addressed by slug in the API — share links carry slugs, and a URL
 * that reads `/emoji-packs/reaction-faces` is the point of having them. Every
 * mutation therefore resolves slug → row first.
 */
async function assertOwned(slug: string, userId: string) {
  const pack = await prisma.emojiPack.findUnique({
    where: { slug },
    select: { id: true, ownerId: true, itemCount: true, status: true },
  });
  // Foreign-owned reads as missing — never confirm existence to a stranger.
  if (!pack || pack.ownerId !== userId) throw new PackError('Pack not found.', 404);
  if (pack.status === 'REMOVED') throw new PackError('This pack was removed by moderation.', 403);
  return pack;
}

/**
 * Attach an already-uploaded media object to a pack as an item.
 *
 * Takes a `mediaId` rather than a URL so the image has been through the normal
 * upload path — validation, quota, the storage compressor — and so a client
 * cannot point a pack item at an arbitrary remote URL.
 */
export async function addItem(
  userId: string,
  slug: string,
  input: { name: string; kind: string; mediaId: string; alt: string },
): Promise<PackItem> {
  const pack = await assertOwned(slug, userId);
  const packId = pack.id;
  if (pack.itemCount >= MAX_ITEMS_PER_PACK) {
    throw new PackError(`A pack can hold at most ${MAX_ITEMS_PER_PACK} items.`);
  }

  const media = await prisma.media.findUnique({
    where: { id: input.mediaId },
    select: { id: true, userId: true, url: true, status: true, contentType: true },
  });
  if (!media || media.userId !== userId) throw new PackError('Media not found.', 404);
  if (media.status !== 'PENDING') throw new PackError('That upload is already in use.');

  const clash = await prisma.emojiPackItem.findUnique({
    where: { packId_name: { packId, name: input.name } },
    select: { id: true },
  });
  if (clash) throw new PackError(`":${input.name}:" is already used in this pack.`, 409);

  const [item] = await prisma.$transaction([
    prisma.emojiPackItem.create({
      data: {
        packId,
        name: input.name,
        kind: input.kind,
        url: media.url,
        alt: input.alt,
        animated: media.contentType === 'image/gif' || media.contentType === 'image/webp',
        position: pack.itemCount,
      },
      select: itemSelect,
    }),
    prisma.media.update({ where: { id: media.id }, data: { status: 'ATTACHED' } }),
    prisma.emojiPack.update({
      where: { id: packId },
      data: {
        itemCount: { increment: 1 },
        // Any edit sends the pack back for re-moderation: otherwise a pack is
        // approved while empty and filled with anything afterwards.
        status: 'PENDING',
      },
    }),
  ]);
  return { ...item, kind: item.kind as PackItem['kind'] };
}

export async function removeItem(userId: string, slug: string, itemId: string): Promise<void> {
  const { id: packId } = await assertOwned(slug, userId);
  const item = await prisma.emojiPackItem.findUnique({
    where: { id: itemId },
    select: { id: true, packId: true },
  });
  if (!item || item.packId !== packId) throw new PackError('Item not found.', 404);

  await prisma.$transaction([
    prisma.emojiPackItem.delete({ where: { id: itemId } }),
    prisma.emojiPack.update({
      where: { id: packId },
      data: { itemCount: { decrement: 1 } },
    }),
  ]);
}

/** Install a pack. Free for everyone — this is the half that is not gated. */
export async function subscribe(userId: string, slug: string): Promise<void> {
  const pack = await prisma.emojiPack.findUnique({
    where: { slug },
    select: { id: true, ownerId: true, status: true, visibility: true },
  });
  if (!pack || !packUsableBy(pack, userId)) throw new PackError('Pack not found.', 404);
  const packId = pack.id;

  const count = await prisma.emojiPackSubscription.count({ where: { userId } });
  if (count >= MAX_SUBSCRIPTIONS) {
    throw new PackError(`You can install at most ${MAX_SUBSCRIPTIONS} packs.`);
  }

  const existing = await prisma.emojiPackSubscription.findUnique({
    where: { packId_userId: { packId, userId } },
    select: { packId: true },
  });
  if (existing) return; // idempotent

  await prisma.$transaction([
    prisma.emojiPackSubscription.create({ data: { packId, userId, position: count } }),
    prisma.emojiPack.update({
      where: { id: packId },
      data: { subscriberCount: { increment: 1 } },
    }),
  ]);
}

export async function unsubscribe(userId: string, slug: string): Promise<void> {
  const found = await prisma.emojiPack.findUnique({ where: { slug }, select: { id: true } });
  if (!found) return; // idempotent
  const packId = found.id;
  const existing = await prisma.emojiPackSubscription.findUnique({
    where: { packId_userId: { packId, userId } },
    select: { packId: true },
  });
  if (!existing) return; // idempotent

  await prisma.$transaction([
    prisma.emojiPackSubscription.delete({ where: { packId_userId: { packId, userId } } }),
    prisma.emojiPack.update({
      where: { id: packId },
      data: { subscriberCount: { decrement: 1 } },
    }),
  ]);
}

/** Reorder installed packs — this is what shortcode precedence follows. */
export async function reorderSubscriptions(userId: string, packIds: string[]): Promise<void> {
  const owned = await prisma.emojiPackSubscription.findMany({
    where: { userId },
    select: { packId: true },
  });
  const known = new Set(owned.map((s) => s.packId));
  const ordered = packIds.filter((id) => known.has(id));

  await prisma.$transaction(
    ordered.map((packId, index) =>
      prisma.emojiPackSubscription.update({
        where: { packId_userId: { packId, userId } },
        data: { position: index },
      }),
    ),
  );
}
