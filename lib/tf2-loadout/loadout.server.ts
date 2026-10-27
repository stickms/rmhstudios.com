/**
 * Server-side persistence for the TF2 loadout builder: per-class loadouts,
 * visibility (private / unlisted / public in the workshop), forks and likes.
 *
 * Items are referenced by the game's defindex and checked against the current
 * catalog on save (the item exists, the class can use it, it fits the slot,
 * paint and effect are real). Reads never re-validate: when a game update
 * retires an item, saved loadouts keep their ids and the UI shows "unknown item".
 */

import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { slugify } from '@/lib/tf2-hud/zip/export';
import {
  LOADOUT_LIMITS,
  type LoadoutAuthor,
  type LoadoutDetail,
  type LoadoutListResponse,
  type LoadoutSummary,
  type Visibility,
} from './api-types';
import { getCatalogObject } from './catalog.server';
import {
  acceptedSlots,
  regionsConflict,
  slotFor,
  TF_CLASSES,
  type Catalog,
  type LoadoutSlots,
  type TfClass,
} from './catalog-types';

export class LoadoutError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 429 | 503,
  ) {
    super(message);
    this.name = 'LoadoutError';
  }
}

const include = {
  owner: { select: userDisplaySelect },
  forkOf: { select: { id: true, slug: true, title: true, visibility: true } },
} satisfies Prisma.Tf2LoadoutInclude;

type Row = Prisma.Tf2LoadoutGetPayload<{ include: typeof include }>;

/* ───────────────────────────── helpers ───────────────────────────── */

function author(row: Row): LoadoutAuthor {
  const u = resolveUser(row.owner);
  return { id: u.id, name: u.name ?? 'Unknown', handle: u.handle, image: u.image };
}

function summary(row: Row, liked: boolean): LoadoutSummary {
  const origin = row.forkOf && row.forkOf.visibility !== 'PRIVATE' ? row.forkOf : null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    tfClass: row.tfClass as TfClass,
    visibility: row.visibility,
    slots: (row.slots ?? {}) as unknown as LoadoutSlots,
    author: author(row),
    likeCount: row.likeCount,
    forkCount: row.forkCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    forkOf: origin ? { id: origin.id, slug: origin.slug, title: origin.title } : null,
    liked,
  };
}

function canRead(row: { visibility: Visibility; ownerId: string }, userId: string | null): boolean {
  return row.visibility !== 'PRIVATE' || row.ownerId === userId;
}

async function likedSet(userId: string | null, ids: string[]): Promise<Set<string>> {
  if (!userId || ids.length === 0) return new Set();
  const rows = await prisma.tf2LoadoutLike.findMany({
    where: { userId, loadoutId: { in: ids } },
    select: { loadoutId: true },
  });
  return new Set(rows.map((r) => r.loadoutId));
}

async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title).replace(/_/g, '-').slice(0, 40) || 'loadout';
  for (let i = 0; i < 5; i++) {
    const slug = `${base}-${randomBytes(3).toString('hex')}`;
    if (!(await prisma.tf2Loadout.findUnique({ where: { slug }, select: { id: true } })))
      return slug;
  }
  return `${base}-${randomBytes(6).toString('hex')}`;
}

/**
 * Check a loadout against the catalog. Throws a 400 naming the first problem.
 * If the catalog is unavailable the save is refused (503) rather than stored
 * unchecked.
 */
export function validateSlots(catalog: Catalog, tfClass: TfClass, slots: LoadoutSlots): void {
  const byId = new Map(catalog.items.map((i) => [i.id, i]));
  const paints = new Set(catalog.paints.map((p) => p.id));
  const effects = new Set(catalog.effects.map((e) => e.id));

  for (const [key, entry] of Object.entries(slots)) {
    const item = byId.get(entry.item);
    if (!item) throw new LoadoutError(`Unknown item ${entry.item} in ${key}`, 400);
    const slot = slotFor(item, tfClass);
    if (!slot || !acceptedSlots(key).includes(slot)) {
      throw new LoadoutError(`${item.n} cannot go in ${key} for ${tfClass}`, 400);
    }
    if (entry.paint !== undefined && (!item.p || !paints.has(entry.paint))) {
      throw new LoadoutError(`${item.n} cannot take that paint`, 400);
    }
    if (entry.effect !== undefined) {
      if (!(slot === 'head' || slot === 'misc' || slot === 'taunt') || !effects.has(entry.effect)) {
        throw new LoadoutError(`${item.n} cannot take that effect`, 400);
      }
    }
    // Overlapping regions, a repeated cosmetic and more than three cosmetics are allowed on purpose:
    // the builder lets players go past the game's rules (it shows a warning), and a view of such a
    // loadout shows the same warning (lib/tf2-loadout/rules.ts).
  }
}

/** Distinct defindexes in a loadout (items, not paints), for the search index. */
const itemIdsOf = (slots: LoadoutSlots): number[] => [
  ...new Set(Object.values(slots).map((e) => e.item)),
];

async function checked(tfClass: TfClass, slots: LoadoutSlots): Promise<void> {
  const catalog = await getCatalogObject();
  if (!catalog)
    throw new LoadoutError('The item catalog is not available yet. Try again shortly.', 503);
  validateSlots(catalog, tfClass, slots);
}

async function assertQuota(userId: string): Promise<void> {
  const n = await prisma.tf2Loadout.count({ where: { ownerId: userId } });
  if (n >= LOADOUT_LIMITS.maxPerUser) {
    throw new LoadoutError(
      `You can keep up to ${LOADOUT_LIMITS.maxPerUser} loadouts. Delete one to save another.`,
      429,
    );
  }
}

async function findRow(idOrSlug: string): Promise<Row | null> {
  return prisma.tf2Loadout.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include,
  });
}

async function readableRow(idOrSlug: string, userId: string | null): Promise<Row> {
  const row = await findRow(idOrSlug);
  // A private loadout is indistinguishable from a missing one.
  if (!row || !canRead(row, userId)) throw new LoadoutError('Loadout not found', 404);
  return row;
}

async function ownedRow(id: string, userId: string): Promise<Row> {
  const row = await findRow(id);
  if (!row) throw new LoadoutError('Loadout not found', 404);
  if (row.ownerId !== userId) throw new LoadoutError('Only the owner can change this loadout', 403);
  return row;
}

/* ───────────────────────────── reads ───────────────────────────── */

export interface ListArgs {
  userId: string | null;
  q?: string;
  sort: 'new' | 'top';
  tfClass?: TfClass;
  cursor?: string;
  mine?: boolean;
  limit: number;
}

export async function listLoadouts(args: ListArgs): Promise<LoadoutListResponse> {
  if (args.mine && !args.userId) throw new LoadoutError('Sign in to see your loadouts', 403);
  const where: Prisma.Tf2LoadoutWhereInput = args.mine
    ? { ownerId: args.userId! }
    : { visibility: 'PUBLIC' };
  if (args.tfClass) where.tfClass = args.tfClass;
  if (args.q) {
    // Titles and descriptions, plus any loadout that uses an item whose name matches.
    const needle = args.q.toLowerCase();
    const catalog = await getCatalogObject();
    const itemIds = catalog
      ? catalog.items
          .filter((i) => i.n.toLowerCase().includes(needle))
          .slice(0, 60)
          .map((i) => i.id)
      : [];
    where.OR = [
      { title: { contains: args.q, mode: 'insensitive' } },
      { description: { contains: args.q, mode: 'insensitive' } },
      ...(itemIds.length ? [{ itemIds: { hasSome: itemIds } }] : []),
    ];
  }
  const rows = await prisma.tf2Loadout.findMany({
    where,
    orderBy:
      args.sort === 'new'
        ? [{ updatedAt: 'desc' }, { id: 'desc' }]
        : [{ likeCount: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
    take: args.limit + 1,
    ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
    include,
  });
  const page = rows.slice(0, args.limit);
  const liked = await likedSet(
    args.userId,
    page.map((r) => r.id),
  );
  return {
    items: page.map((r) => summary(r, liked.has(r.id))),
    nextCursor: rows.length > args.limit ? page[page.length - 1].id : null,
  };
}

export async function getLoadout(idOrSlug: string, userId: string | null): Promise<LoadoutDetail> {
  const row = await readableRow(idOrSlug, userId);
  const liked = await likedSet(userId, [row.id]);
  return { ...summary(row, liked.has(row.id)), isOwner: row.ownerId === userId };
}

/* ───────────────────────────── writes ───────────────────────────── */

export interface CreateArgs {
  userId: string;
  title: string;
  description: string;
  tfClass: TfClass;
  slots: LoadoutSlots;
  visibility: Visibility;
  forkOfId?: string;
}

export async function createLoadout(a: CreateArgs): Promise<LoadoutDetail> {
  if (!TF_CLASSES.includes(a.tfClass)) throw new LoadoutError('Unknown class', 400);
  await checked(a.tfClass, a.slots);
  await assertQuota(a.userId);
  const slug = await uniqueSlug(a.title);
  const row = await prisma.$transaction(async (tx) => {
    if (a.forkOfId) {
      await tx.tf2Loadout.update({
        where: { id: a.forkOfId },
        data: { forkCount: { increment: 1 } },
      });
    }
    return tx.tf2Loadout.create({
      data: {
        ownerId: a.userId,
        slug,
        title: a.title,
        description: a.description,
        tfClass: a.tfClass,
        slots: a.slots as unknown as Prisma.InputJsonValue,
        itemIds: itemIdsOf(a.slots),
        visibility: a.visibility,
        forkOfId: a.forkOfId ?? null,
      },
      include,
    });
  });
  return { ...summary(row, false), isOwner: true };
}

export interface UpdateArgs {
  userId: string;
  id: string;
  title?: string;
  description?: string;
  tfClass?: TfClass;
  slots?: LoadoutSlots;
  visibility?: Visibility;
}

export async function updateLoadout(a: UpdateArgs): Promise<LoadoutDetail> {
  const row = await ownedRow(a.id, a.userId);
  const tfClass = a.tfClass ?? (row.tfClass as TfClass);
  const slots = a.slots ?? (row.slots as unknown as LoadoutSlots);
  // Re-check whenever the class or the items change.
  if (a.slots !== undefined || a.tfClass !== undefined) await checked(tfClass, slots);
  const updated = await prisma.tf2Loadout.update({
    where: { id: row.id },
    data: {
      ...(a.title !== undefined ? { title: a.title } : {}),
      ...(a.description !== undefined ? { description: a.description } : {}),
      ...(a.tfClass !== undefined ? { tfClass } : {}),
      ...(a.slots !== undefined
        ? { slots: a.slots as unknown as Prisma.InputJsonValue, itemIds: itemIdsOf(a.slots) }
        : {}),
      ...(a.visibility !== undefined ? { visibility: a.visibility } : {}),
    },
    include,
  });
  const liked = await likedSet(a.userId, [updated.id]);
  return { ...summary(updated, liked.has(updated.id)), isOwner: true };
}

export async function deleteLoadout(id: string, userId: string): Promise<void> {
  const row = await ownedRow(id, userId);
  await prisma.$transaction(async (tx) => {
    if (row.forkOfId) {
      await tx.tf2Loadout.updateMany({
        where: { id: row.forkOfId, forkCount: { gt: 0 } },
        data: { forkCount: { decrement: 1 } },
      });
    }
    await tx.tf2Loadout.delete({ where: { id: row.id } });
  });
}

export async function forkLoadout(idOrSlug: string, userId: string): Promise<LoadoutDetail> {
  const src = await readableRow(idOrSlug, userId);
  return createLoadout({
    userId,
    title: `${src.title} (copy)`.slice(0, LOADOUT_LIMITS.maxTitle),
    description: src.description,
    tfClass: src.tfClass as TfClass,
    slots: src.slots as unknown as LoadoutSlots,
    visibility: 'PRIVATE',
    forkOfId: src.id,
  });
}

export async function toggleLike(
  idOrSlug: string,
  userId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  const row = await readableRow(idOrSlug, userId);
  return prisma.$transaction(async (tx) => {
    const key = { userId_loadoutId: { userId, loadoutId: row.id } };
    if (await tx.tf2LoadoutLike.findUnique({ where: key })) {
      await tx.tf2LoadoutLike.delete({ where: key });
      const u = await tx.tf2Loadout.update({
        where: { id: row.id },
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      });
      return { liked: false, likeCount: Math.max(0, u.likeCount) };
    }
    await tx.tf2LoadoutLike.create({ data: { userId, loadoutId: row.id } });
    const u = await tx.tf2Loadout.update({
      where: { id: row.id },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
    return { liked: true, likeCount: u.likeCount };
  });
}
