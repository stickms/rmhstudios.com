/**
 * World snapshots (R6 island visits, R7 garden visits, R8 farm tour). Server-only.
 *
 * One read-only snapshot per member per kind, behind a share code. Visitors
 * can leave a short postcard (screened + owner-hideable + block-aware) and,
 * for gardens, water once per UTC day, which the owner collects on next load.
 */
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { getHiddenAuthorIds } from '@/lib/moderation.server';
import { createNotification } from '@/lib/notifications.server';
import { screenNewContent } from '@/lib/moderation/auto-moderate.server';
import {
  MAX_PAYLOAD_BYTES,
  todayUtc,
  type FarmTourPayload,
  type SnapshotKind,
  type SnapshotView,
} from './schema';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const POSTCARD_PAGE = 20;
/** Growth bonus a single watering may add on collection is capped per claim. */
const CLAIM_CAP = 10;

export function newShareCode(): string {
  const bytes = randomBytes(8);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

export function payloadTooLarge(payload: unknown): boolean {
  return JSON.stringify(payload).length > MAX_PAYLOAD_BYTES;
}

async function buildFarmTour(userId: string): Promise<FarmTourPayload | null> {
  const row = await prisma.farmingSimFarm.findUnique({
    where: { ownerId: userId },
    select: { name: true, saveData: true },
  });
  if (!row) return null;
  const s = (row.saveData ?? {}) as Record<string, unknown> & {
    tiles?: unknown;
    day?: unknown;
    seasonIndex?: unknown;
  };
  const raw = Array.isArray(s.tiles) ? s.tiles : [];
  if (raw.length !== 24 * 24) return null;
  const seasons = ['spring', 'summer', 'fall', 'winter'];
  const tiles = raw.map(
    (t: {
      terrain?: unknown;
      crop?: { cropId?: unknown; stage?: unknown } | null;
    }): [number, string, number] => {
      const c = t?.crop;
      return [
        t?.terrain === 1 ? 1 : 0,
        c && typeof c.cropId === 'string' ? c.cropId.slice(0, 24) : '',
        c ? Math.min(9, Math.max(0, Math.floor(Number(c.stage) || 0))) : 0,
      ];
    },
  );
  return {
    name: row.name.slice(0, 60),
    day: Number(s.day) || 1,
    season: seasons[Number(s.seasonIndex) || 0] ?? 'spring',
    grid: 24,
    tiles,
  };
}

export type PublishResult =
  { ok: true; code: string; updatedAt: Date } | { ok: false; status: number; error: string };

export async function publishSnapshot(
  userId: string,
  kind: SnapshotKind,
  payload: unknown,
): Promise<PublishResult> {
  let body = payload;
  let title = '';
  if (kind === 'farm') {
    const tour = await buildFarmTour(userId);
    if (!tour)
      return {
        ok: false,
        status: 404,
        error: 'Play the Farming Sim first to have a farm to share',
      };
    body = tour;
    title = tour.name;
  }
  if (payloadTooLarge(body)) return { ok: false, status: 413, error: 'Snapshot too large' };
  if (!title) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: userDisplaySelect });
    title = `${u ? resolveUser(u).name : 'A member'}'s ${kind === 'isleworks' ? 'island' : 'garden'}`;
  }
  title = title.slice(0, 80);

  const existing = await prisma.worldSnapshot.findUnique({
    where: { userId_kind: { userId, kind } },
    select: { id: true, code: true },
  });
  if (existing) {
    const row = await prisma.worldSnapshot.update({
      where: { id: existing.id },
      data: { payload: body as object, title },
      select: { code: true, updatedAt: true },
    });
    return { ok: true, ...row };
  }
  for (let i = 0; i < 5; i++) {
    try {
      const row = await prisma.worldSnapshot.create({
        data: { userId, kind, code: newShareCode(), title, payload: body as object },
        select: { code: true, updatedAt: true },
      });
      return { ok: true, ...row };
    } catch (e) {
      if ((e as { code?: string })?.code !== 'P2002') throw e;
      // Either the code collided (retry) or a parallel publish won the (user, kind) race.
      const raced = await prisma.worldSnapshot.findUnique({
        where: { userId_kind: { userId, kind } },
        select: { code: true, updatedAt: true },
      });
      if (raced) return { ok: true, ...raced };
    }
  }
  return { ok: false, status: 503, error: 'Could not allocate a share code' };
}

export async function unpublishSnapshot(userId: string, kind: SnapshotKind): Promise<void> {
  await prisma.worldSnapshot.deleteMany({ where: { userId, kind } });
}

export async function mySnapshot(userId: string, kind: SnapshotKind) {
  const snap = await prisma.worldSnapshot.findUnique({
    where: { userId_kind: { userId, kind } },
    select: {
      id: true,
      code: true,
      title: true,
      updatedAt: true,
      postcards: {
        orderBy: { createdAt: 'desc' },
        take: POSTCARD_PAGE,
        select: {
          id: true,
          body: true,
          hiddenAt: true,
          createdAt: true,
          author: { select: userDisplaySelect },
        },
      },
    },
  });
  if (!snap) return null;
  return {
    code: snap.code,
    title: snap.title,
    updatedAt: snap.updatedAt.toISOString(),
    postcards: snap.postcards.map((p) => ({
      id: p.id,
      body: p.body,
      hidden: !!p.hiddenAt,
      createdAt: p.createdAt.toISOString(),
      author: { name: resolveUser(p.author).name ?? '' },
    })),
  };
}

export async function viewSnapshot(
  code: string,
  viewerId: string | null,
): Promise<SnapshotView | null> {
  const snap = await prisma.worldSnapshot.findUnique({
    where: { code },
    select: {
      id: true,
      userId: true,
      kind: true,
      code: true,
      title: true,
      updatedAt: true,
      payload: true,
      user: { select: userDisplaySelect },
    },
  });
  if (!snap) return null;
  const isOwner = viewerId === snap.userId;
  const hidden = isOwner ? [] : await getHiddenAuthorIds(viewerId);
  // A block in either direction makes the world unreachable, same as a missing one.
  if (!isOwner && hidden.includes(snap.userId)) return null;

  const postcards = await prisma.worldPostcard.findMany({
    where: {
      snapshotId: snap.id,
      hiddenAt: null,
      ...(hidden.length ? { authorId: { notIn: hidden } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: POSTCARD_PAGE,
    select: { id: true, body: true, createdAt: true, author: { select: userDisplaySelect } },
  });
  let wateredToday = false;
  if (viewerId && snap.kind === 'garden' && !isOwner) {
    wateredToday = !!(await prisma.gardenWatering.findUnique({
      where: {
        snapshotId_visitorId_day: { snapshotId: snap.id, visitorId: viewerId, day: todayUtc() },
      },
      select: { id: true },
    }));
  }
  const owner = resolveUser(snap.user);
  return {
    kind: snap.kind as SnapshotKind,
    code: snap.code,
    title: snap.title,
    updatedAt: snap.updatedAt.toISOString(),
    owner: { id: owner.id, name: owner.name ?? '', image: owner.image ?? null },
    isOwner,
    payload: snap.payload,
    postcards: postcards.map((p) => ({
      id: p.id,
      body: p.body,
      createdAt: p.createdAt.toISOString(),
      author: { name: resolveUser(p.author).name ?? '' },
    })),
    wateredToday,
  };
}

type Gate =
  | { ok: true; snap: { id: string; userId: string; kind: string; title: string } }
  | { ok: false; status: number; error: string };

async function gateVisitor(code: string, visitorId: string): Promise<Gate> {
  const snap = await prisma.worldSnapshot.findUnique({
    where: { code },
    select: { id: true, userId: true, kind: true, title: true },
  });
  if (!snap) return { ok: false, status: 404, error: 'Not found' };
  if (snap.userId === visitorId) return { ok: false, status: 400, error: 'This one is yours' };
  const hidden = await getHiddenAuthorIds(visitorId);
  if (hidden.includes(snap.userId)) return { ok: false, status: 404, error: 'Not found' };
  return { ok: true, snap };
}

export async function leavePostcard(code: string, authorId: string, body: string) {
  const gate = await gateVisitor(code, authorId);
  if (!gate.ok) return gate;
  const { snap } = gate;
  const row = await prisma.worldPostcard.upsert({
    where: { snapshotId_authorId: { snapshotId: snap.id, authorId } },
    create: { snapshotId: snap.id, authorId, body },
    update: { body, hiddenAt: null, createdAt: new Date() },
    select: { id: true },
  });
  void screenNewContent({ entityType: 'world_postcard', entityId: row.id, authorId, text: body });
  void createNotification({
    userId: snap.userId,
    actorId: authorId,
    type: 'SYSTEM',
    entityType: 'world_postcard',
    entityId: row.id,
    preview: body,
    link:
      snap.kind === 'isleworks'
        ? '/isleworks'
        : snap.kind === 'garden'
          ? '/forest-explorer/explore'
          : '/rmh-farming-sim',
    groupKey: `world_postcard:${snap.id}`,
  });
  return { ok: true as const, id: row.id };
}

export async function setPostcardHidden(
  ownerId: string,
  postcardId: string,
  hidden: boolean,
): Promise<boolean> {
  const res = await prisma.worldPostcard.updateMany({
    where: { id: postcardId, snapshot: { userId: ownerId } },
    data: { hiddenAt: hidden ? new Date() : null },
  });
  return res.count > 0;
}

export async function waterGarden(code: string, visitorId: string, now = new Date()) {
  const gate = await gateVisitor(code, visitorId);
  if (!gate.ok) return gate;
  const { snap } = gate;
  if (snap.kind !== 'garden')
    return { ok: false as const, status: 400, error: 'Only gardens can be watered' };
  try {
    await prisma.gardenWatering.create({
      data: { snapshotId: snap.id, visitorId, day: todayUtc(now) },
    });
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002')
      return { ok: false as const, status: 409, error: 'You already watered this garden today' };
    throw e;
  }
  void createNotification({
    userId: snap.userId,
    actorId: visitorId,
    type: 'SYSTEM',
    entityType: 'garden_water',
    entityId: snap.id,
    preview: 'watered your garden - it grows a little faster',
    link: '/forest-explorer/explore',
    groupKey: `garden_water:${snap.id}`,
  });
  return { ok: true as const };
}

/**
 * Owner side: take (and mark applied) the waterings received since last time.
 * `updateMany` returns how many rows THIS call flipped, so two tabs can never
 * both collect the same watering.
 */
export async function claimWaterings(ownerId: string): Promise<number> {
  const snap = await prisma.worldSnapshot.findUnique({
    where: { userId_kind: { userId: ownerId, kind: 'garden' } },
    select: { id: true },
  });
  if (!snap) return 0;
  const pending = await prisma.gardenWatering.findMany({
    where: { snapshotId: snap.id, appliedAt: null },
    orderBy: { createdAt: 'asc' },
    take: CLAIM_CAP,
    select: { id: true },
  });
  if (!pending.length) return 0;
  const res = await prisma.gardenWatering.updateMany({
    where: { id: { in: pending.map((p) => p.id) }, appliedAt: null },
    data: { appliedAt: new Date() },
  });
  return res.count;
}
