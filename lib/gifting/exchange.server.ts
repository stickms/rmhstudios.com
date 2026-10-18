/**
 * Gift & mixtape exchanges (G3 / F2) — server side.
 *
 * The draw is `drawExchange` (lib/gifting/secret-santa.ts) run server-side over
 * the members sorted by id, with a seed stored on the exchange — so
 * `verifyExchangeDraw` can re-run it and prove the stored pairings are what that
 * seed produces. Each member can read only their own recipient until `revealAt`.
 * Gifts use `sendCoinGift` (an ordinary coin transfer); this file moves no coins
 * itself, and only one gift per member per exchange is claimed (`giftedAt`).
 */
import { randomInt } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { userChipSelect } from '@/lib/user-display';
import { drawExchange } from '@/lib/gifting/secret-santa';
import { CoinGiftError, sendCoinGift } from '@/lib/gifting/coin-gift.server';
import {
  EXCHANGE_MAX_MEMBERS,
  EXCHANGE_MIN_MEMBERS,
  type CreateExchangeInput,
  type ExchangeKind,
  type ExchangeStatus,
  type ExchangeSummary,
  type ExchangeUser,
  type ExchangeView,
  type MixtapeTrack,
} from '@/lib/gifting/exchange';

const MAX_OPEN_PER_ORGANIZER = 5;
const MAX_LEAD_MS = 120 * 86_400_000;
const MIN_LEAD_MS = 10 * 60_000;

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

const asTracks = (v: unknown): MixtapeTrack[] => (Array.isArray(v) ? (v as MixtapeTrack[]) : []);

export async function createExchange(
  organizerId: string,
  input: CreateExchangeInput,
  now = new Date(),
): Promise<{ ok: true; id: string } | Fail> {
  const drawAt = new Date(input.drawAt);
  const lead = drawAt.getTime() - now.getTime();
  if (lead < MIN_LEAD_MS || lead > MAX_LEAD_MS)
    return fail(400, 'Pick a draw date in the next 120 days');
  const open = await prisma.giftExchange.count({ where: { organizerId, status: 'OPEN' } });
  if (open >= MAX_OPEN_PER_ORGANIZER) return fail(429, 'You have too many open exchanges');
  const row = await prisma.giftExchange.create({
    data: {
      organizerId,
      kind: input.kind,
      title: input.title,
      theme: input.theme || null,
      budget: input.kind === 'GIFT' ? (input.budget ?? null) : null,
      drawAt,
      revealAt: new Date(input.revealAt),
      members: { create: { userId: organizerId } },
    },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

export async function listMyExchanges(userId: string): Promise<ExchangeSummary[]> {
  const rows = await prisma.giftExchange.findMany({
    where: { OR: [{ organizerId: userId }, { members: { some: { userId } } }] },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      kind: true,
      title: true,
      status: true,
      drawAt: true,
      organizerId: true,
      _count: { select: { members: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as ExchangeKind,
    title: r.title,
    status: r.status as ExchangeStatus,
    drawAt: r.drawAt.toISOString(),
    memberCount: r._count.members,
    isOrganizer: r.organizerId === userId,
  }));
}

export async function getExchange(
  id: string,
  viewerId: string,
  now = new Date(),
): Promise<ExchangeView | null> {
  const ex = await prisma.giftExchange.findUnique({
    where: { id },
    include: {
      organizer: { select: userChipSelect },
      members: {
        take: EXCHANGE_MAX_MEMBERS,
        orderBy: { createdAt: 'asc' },
        select: {
          userId: true,
          recipientId: true,
          excludeIds: true,
          tracks: true,
          giftedAt: true,
          user: { select: userChipSelect },
        },
      },
    },
  });
  if (!ex) return null;
  const kind = ex.kind as ExchangeKind;
  const status = ex.status as ExchangeStatus;
  const byId = new Map<string, ExchangeUser>(ex.members.map((m) => [m.userId, m.user]));
  const mine = ex.members.find((m) => m.userId === viewerId) ?? null;
  const revealed = status === 'DRAWN' && now >= ex.revealAt;

  let me: ExchangeView['me'] = null;
  if (mine) {
    const excluded = mine.excludeIds.length
      ? await prisma.user.findMany({
          where: { id: { in: mine.excludeIds } },
          select: { handle: true },
        })
      : [];
    const target = mine.recipientId ? ex.members.find((m) => m.userId === mine.recipientId) : null;
    me = {
      excludeHandles: excluded.flatMap((u) => (u.handle ? [u.handle] : [])),
      tracks: asTracks(mine.tracks),
      giftedAt: mine.giftedAt?.toISOString() ?? null,
      recipient: mine.recipientId ? (byId.get(mine.recipientId) ?? null) : null,
      receivedTracks: kind === 'MIXTAPE' && target ? asTracks(target.tracks) : null,
      leftOut: kind === 'MIXTAPE' && status === 'DRAWN' && !mine.recipientId,
    };
  }

  return {
    id: ex.id,
    kind,
    title: ex.title,
    theme: ex.theme,
    budget: ex.budget,
    status,
    drawAt: ex.drawAt.toISOString(),
    revealAt: ex.revealAt.toISOString(),
    singleCycle: ex.singleCycle,
    organizer: ex.organizer,
    members: ex.members.map((m) => m.user),
    isOrganizer: ex.organizerId === viewerId,
    isMember: !!mine,
    canJoin:
      !mine && status === 'OPEN' && now < ex.drawAt && ex.members.length < EXCHANGE_MAX_MEMBERS,
    revealed,
    pairings: revealed
      ? ex.members.flatMap((m) => {
          const r = m.recipientId ? byId.get(m.recipientId) : null;
          return r ? [{ giver: m.user, recipient: r }] : [];
        })
      : null,
    me,
  };
}

async function openExchange(id: string, now: Date) {
  const ex = await prisma.giftExchange.findUnique({
    where: { id },
    select: { id: true, kind: true, status: true, drawAt: true, organizerId: true },
  });
  if (!ex) return fail(404, 'Not found');
  if (ex.status !== 'OPEN' || now >= ex.drawAt) return fail(409, 'Sign-ups are closed');
  return ex;
}

export async function joinExchange(id: string, userId: string, now = new Date()) {
  const ex = await openExchange(id, now);
  if ('ok' in ex) return ex;
  const count = await prisma.giftExchangeMember.count({ where: { exchangeId: id } });
  if (count >= EXCHANGE_MAX_MEMBERS) return fail(409, 'This exchange is full');
  await prisma.giftExchangeMember.upsert({
    where: { exchangeId_userId: { exchangeId: id, userId } },
    create: { exchangeId: id, userId },
    update: {},
  });
  return { ok: true as const };
}

export async function leaveExchange(id: string, userId: string, now = new Date()) {
  const ex = await openExchange(id, now);
  if ('ok' in ex) return ex;
  if (ex.organizerId === userId) return fail(400, 'Organisers cancel instead of leaving');
  await prisma.giftExchangeMember.deleteMany({ where: { exchangeId: id, userId } });
  return { ok: true as const };
}

export async function updateMember(
  id: string,
  userId: string,
  input: { excludeHandles?: string[]; tracks?: MixtapeTrack[] },
  now = new Date(),
) {
  const ex = await openExchange(id, now);
  if ('ok' in ex) return ex;
  const data: Prisma.GiftExchangeMemberUpdateManyMutationInput = {};
  if (input.excludeHandles) {
    const handles = input.excludeHandles.map((h) => h.replace(/^@/, ''));
    const users = handles.length
      ? await prisma.user.findMany({
          where: {
            OR: handles.map((h) => ({ handle: { equals: h, mode: 'insensitive' as const } })),
          },
          select: { id: true },
        })
      : [];
    data.excludeIds = users.map((u) => u.id).filter((u) => u !== userId);
  }
  if (input.tracks) {
    if (ex.kind !== 'MIXTAPE') return fail(400, 'Only mixtape exchanges have tracks');
    data.tracks = input.tracks as unknown as Prisma.InputJsonValue;
  }
  const res = await prisma.giftExchangeMember.updateMany({
    where: { exchangeId: id, userId },
    data,
  });
  return res.count ? { ok: true as const } : fail(403, 'Join the exchange first');
}

export async function cancelExchange(id: string, organizerId: string) {
  const res = await prisma.giftExchange.updateMany({
    where: { id, organizerId, status: 'OPEN' },
    data: { status: 'CANCELLED' },
  });
  return res.count
    ? { ok: true as const }
    : fail(409, 'Only an open exchange you organise can be cancelled');
}

// ── the draw ─────────────────────────────────────────────────────────────────

interface DrawMember {
  userId: string;
  excludeIds: string[];
}

/** The exact inputs the draw sees — shared by the draw and its verification. */
function drawInputs(members: DrawMember[]) {
  const ids = members.map((m) => m.userId).sort();
  const inDraw = new Set(ids);
  const exclusions: [string, string][] = [];
  for (const m of members) {
    for (const x of m.excludeIds) {
      if (!inDraw.has(x)) continue;
      exclusions.push([m.userId, x], [x, m.userId]);
    }
  }
  return { ids, exclusions };
}

async function drawMembers(
  id: string,
  kind: string,
): Promise<(DrawMember & { tracks: unknown })[]> {
  const all = await prisma.giftExchangeMember.findMany({
    where: { exchangeId: id },
    select: { userId: true, excludeIds: true, tracks: true },
    take: EXCHANGE_MAX_MEMBERS,
  });
  // A mixtape exchange only draws members who actually curated something.
  return kind === 'MIXTAPE' ? all.filter((m) => asTracks(m.tracks).length > 0) : all;
}

export async function runDraw(id: string): Promise<{ ok: true } | Fail> {
  const ex = await prisma.giftExchange.findUnique({
    where: { id },
    select: { id: true, kind: true, status: true, title: true, organizerId: true },
  });
  if (!ex || ex.status !== 'OPEN') return fail(409, 'Not open');
  const members = await drawMembers(id, ex.kind);
  const { ids, exclusions } = drawInputs(members);

  const seed = randomInt(1, 2 ** 31 - 1);
  const result =
    ids.length >= EXCHANGE_MIN_MEMBERS ? drawExchange({ members: ids, exclusions, seed }) : null;

  if (!result || !result.ok) {
    const claim = await prisma.giftExchange.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: 'FAILED', drawnAt: new Date() },
    });
    if (claim.count) {
      await createNotification({
        userId: ex.organizerId,
        type: 'SYSTEM',
        entityType: 'exchange',
        entityId: id,
        preview: `"${ex.title}" could not be drawn: it needs ${EXCHANGE_MIN_MEMBERS}+ members the exclusions allow.`,
        link: `/exchange/${id}`,
      }).catch(() => {});
    }
    return fail(422, 'No valid draw');
  }

  const claimed = await prisma.$transaction(async (tx) => {
    const claim = await tx.giftExchange.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: 'DRAWN', seed, singleCycle: result.singleCycle, drawnAt: new Date() },
    });
    if (claim.count === 0) return false;
    for (const [giver, recipient] of result.assignments) {
      await tx.giftExchangeMember.updateMany({
        where: { exchangeId: id, userId: giver },
        data: { recipientId: recipient },
      });
    }
    return true;
  });
  if (!claimed) return fail(409, 'Already drawn');

  for (const userId of ids) {
    await createNotification({
      userId,
      type: 'SYSTEM',
      entityType: 'exchange',
      entityId: id,
      preview:
        ex.kind === 'MIXTAPE'
          ? `"${ex.title}" is drawn: your mixtape is ready.`
          : `"${ex.title}" is drawn: see who you are gifting.`,
      link: `/exchange/${id}`,
    }).catch(() => {});
  }
  return { ok: true };
}

/** Draws every open exchange whose sign-up window has closed. Idempotent. */
export async function sweepDueExchanges(now = new Date()): Promise<number> {
  const due = await prisma.giftExchange.findMany({
    where: { status: 'OPEN', drawAt: { lte: now } },
    select: { id: true },
    take: 20,
    orderBy: { drawAt: 'asc' },
  });
  let drawn = 0;
  for (const { id } of due) {
    const res = await runDraw(id).catch(() => null);
    if (res?.ok) drawn++;
  }
  return drawn;
}

/** Organiser draws early, once there are enough members. */
export async function drawNow(id: string, organizerId: string) {
  const ex = await prisma.giftExchange.findUnique({
    where: { id },
    select: { organizerId: true },
  });
  if (!ex) return fail(404, 'Not found');
  if (ex.organizerId !== organizerId) return fail(403, 'Only the organiser can draw');
  return runDraw(id);
}

/**
 * Audit a draw: re-run it from the stored seed and compare with the stored
 * pairings. Used by admins to settle a dispute.
 */
export async function verifyExchangeDraw(id: string) {
  const ex = await prisma.giftExchange.findUnique({
    where: { id },
    select: { kind: true, status: true, seed: true },
  });
  if (!ex || ex.status !== 'DRAWN' || ex.seed === null) return null;
  const members = await drawMembers(id, ex.kind);
  const { ids, exclusions } = drawInputs(members);
  const rerun = drawExchange({ members: ids, exclusions, seed: ex.seed });
  if (!rerun.ok) return { matches: false, singleCycle: null };
  const stored = await prisma.giftExchangeMember.findMany({
    where: { exchangeId: id, recipientId: { not: null } },
    select: { userId: true, recipientId: true },
  });
  const matches =
    stored.length === rerun.assignments.size &&
    stored.every((m) => rerun.assignments.get(m.userId) === m.recipientId);
  return { matches, singleCycle: rerun.singleCycle };
}

// ── gifts (G3) ───────────────────────────────────────────────────────────────

export async function sendExchangeGift(
  id: string,
  userId: string,
  amount: number,
  note?: string,
): Promise<{ ok: true } | Fail> {
  const ex = await prisma.giftExchange.findUnique({
    where: { id },
    select: { kind: true, status: true, budget: true, title: true },
  });
  if (!ex || ex.kind !== 'GIFT') return fail(404, 'Not found');
  if (ex.status !== 'DRAWN') return fail(409, 'The draw has not happened yet');
  if (ex.budget !== null && amount > ex.budget)
    return fail(400, `The budget is ${ex.budget} coins`);
  const me = await prisma.giftExchangeMember.findUnique({
    where: { exchangeId_userId: { exchangeId: id, userId } },
    select: { id: true, recipientId: true },
  });
  if (!me?.recipientId) return fail(403, 'You were not drawn in this exchange');

  // One gift per member per exchange: the claim happens before any coin moves.
  const claim = await prisma.giftExchangeMember.updateMany({
    where: { id: me.id, giftedAt: null },
    data: { giftedAt: new Date() },
  });
  if (claim.count === 0) return fail(409, 'You already sent your gift');
  try {
    await sendCoinGift({
      gifterId: userId,
      recipientId: me.recipientId,
      amount,
      note: note || `Gift exchange: ${ex.title}`,
    });
  } catch (err) {
    await prisma.giftExchangeMember.updateMany({ where: { id: me.id }, data: { giftedAt: null } });
    if (err instanceof CoinGiftError) {
      const status = err.code === 'INSUFFICIENT_COINS' ? 402 : err.code === 'CAP' ? 429 : 400;
      return fail(status, err.code);
    }
    throw err;
  }
  return { ok: true };
}
