import { prisma } from '@/lib/prisma.server';
import { queuePixel } from './live.server';
import { CANVAS_BLANK, phaseOf, type CanvasEventView } from './shared';
import { type createCanvasEventSchema, type placePixelSchema } from './schema';
import type { z } from 'zod';

const meta = {
  id: true,
  title: true,
  width: true,
  height: true,
  cooldownSec: true,
  startsAt: true,
  endsAt: true,
} as const;

type EventRow = {
  id: string;
  title: string;
  width: number;
  height: number;
  cooldownSec: number;
  startsAt: Date;
  endsAt: Date;
};

function view(e: EventRow, nextAt: Date | null): CanvasEventView {
  return {
    id: e.id,
    title: e.title,
    width: e.width,
    height: e.height,
    cooldownSec: e.cooldownSec,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    phase: phaseOf(e.startsAt, e.endsAt),
    nextAt: nextAt && nextAt > new Date() ? nextAt.toISOString() : null,
  };
}

/** The event to show: the live one, else the next upcoming, else the latest ended. */
export async function getCurrentCanvas(userId: string | null) {
  const now = new Date();
  const e =
    (await prisma.canvasEvent.findFirst({
      where: { startsAt: { lte: now }, endsAt: { gt: now } },
      select: meta,
    })) ??
    (await prisma.canvasEvent.findFirst({
      where: { startsAt: { gt: now } },
      orderBy: { startsAt: 'asc' },
      select: meta,
    })) ??
    (await prisma.canvasEvent.findFirst({ orderBy: { endsAt: 'desc' }, select: meta }));
  const past = await prisma.canvasEvent.findMany({
    where: { endsAt: { lte: now }, ...(e ? { id: { not: e.id } } : {}) },
    orderBy: { endsAt: 'desc' },
    take: 5,
    select: meta,
  });
  const pastView = past.map((p) => view(p, null));
  if (!e) return { event: null, past: pastView };
  const cd = userId
    ? await prisma.canvasCooldown.findUnique({
        where: { eventId_userId: { eventId: e.id, userId } },
        select: { lastPlacedAt: true },
      })
    : null;
  const nextAt = cd ? new Date(cd.lastPlacedAt.getTime() + e.cooldownSec * 1000) : null;
  return { event: view(e, nextAt), past: pastView };
}

export async function getCanvasState(id: string): Promise<Uint8Array | null> {
  const row = await prisma.canvasEvent.findUnique({ where: { id }, select: { state: true } });
  return row ? new Uint8Array(row.state) : null;
}

export type PlaceResult =
  { ok: true; nextAt: string } | { ok: false; status: number; error: string; nextAt?: string };

/**
 * Place one pixel. The cooldown is enforced by a single conditional upsert on
 * (event, member): it only succeeds when the last placement is old enough, so
 * concurrent requests from one member cannot both pass.
 */
export async function placePixel(
  userId: string,
  input: z.infer<typeof placePixelSchema>,
): Promise<PlaceResult> {
  const ev = await prisma.canvasEvent.findUnique({ where: { id: input.eventId }, select: meta });
  if (!ev) return { ok: false, status: 404, error: 'Canvas not found' };
  if (phaseOf(ev.startsAt, ev.endsAt) !== 'live') {
    return { ok: false, status: 409, error: 'This canvas is not open' };
  }
  if (input.x >= ev.width || input.y >= ev.height) {
    return { ok: false, status: 400, error: 'Out of bounds' };
  }
  const now = new Date();
  const threshold = new Date(now.getTime() - ev.cooldownSec * 1000);
  const nextAt = new Date(now.getTime() + ev.cooldownSec * 1000);
  const pos = input.y * ev.width + input.x + 1;

  const placed = await prisma.$transaction(async (tx) => {
    const gate = await tx.$queryRaw<{ userId: string }[]>`
      INSERT INTO canvas_cooldown ("eventId", "userId", "lastPlacedAt")
      VALUES (${ev.id}, ${userId}, ${now})
      ON CONFLICT ("eventId", "userId") DO UPDATE SET "lastPlacedAt" = ${now}
      WHERE canvas_cooldown."lastPlacedAt" <= ${threshold}
      RETURNING "userId"`;
    if (gate.length === 0) return null;
    await tx.$executeRaw`
      UPDATE canvas_event
      SET state = overlay(state placing ${Buffer.from([input.color])} from ${pos}::int for 1)
      WHERE id = ${ev.id}`;
    await tx.canvasPlacement.create({
      data: { eventId: ev.id, userId, x: input.x, y: input.y, color: input.color },
    });
    return true;
  });

  if (!placed) {
    const cd = await prisma.canvasCooldown.findUnique({
      where: { eventId_userId: { eventId: ev.id, userId } },
      select: { lastPlacedAt: true },
    });
    const wait = cd ? new Date(cd.lastPlacedAt.getTime() + ev.cooldownSec * 1000) : undefined;
    return {
      ok: false,
      status: 429,
      error: 'Wait for your cooldown',
      nextAt: wait?.toISOString(),
    };
  }
  queuePixel(ev.id, input.x, input.y, input.color);
  return { ok: true, nextAt: nextAt.toISOString() };
}

const LOG_PAGE = 50_000;

/** Replay data for a finished canvas: cell = (y*width+x)*16+color, in placement order. */
export async function getCanvasLog(id: string, after: number) {
  const ev = await prisma.canvasEvent.findUnique({ where: { id }, select: meta });
  if (!ev || phaseOf(ev.startsAt, ev.endsAt) !== 'ended') return null;
  const rows = await prisma.canvasPlacement.findMany({
    where: { eventId: id, id: { gt: after } },
    orderBy: { id: 'asc' },
    take: LOG_PAGE,
    select: { id: true, x: true, y: true, color: true },
  });
  return {
    width: ev.width,
    height: ev.height,
    cells: rows.map((r) => (r.y * ev.width + r.x) * 16 + r.color),
    last: rows.length ? rows[rows.length - 1].id : after,
    done: rows.length < LOG_PAGE,
  };
}

export async function listCanvasEvents() {
  const rows = await prisma.canvasEvent.findMany({
    orderBy: { startsAt: 'desc' },
    take: 30,
    select: { ...meta, _count: { select: { placements: true } } },
  });
  return rows.map((r) => ({ ...view(r, null), placements: r._count.placements }));
}

export async function createCanvasEvent(
  adminId: string,
  input: z.infer<typeof createCanvasEventSchema>,
): Promise<{ ok: true; id: string } | { ok: false; status: number; error: string }> {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (endsAt <= new Date()) return { ok: false, status: 400, error: 'End must be in the future' };
  const clash = await prisma.canvasEvent.count({
    where: { startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
  });
  if (clash > 0) return { ok: false, status: 409, error: 'Overlaps another canvas event' };
  const e = await prisma.canvasEvent.create({
    data: {
      title: input.title,
      width: input.size,
      height: input.size,
      cooldownSec: input.cooldownMinutes * 60,
      startsAt,
      endsAt,
      state: Buffer.alloc(input.size * input.size, CANVAS_BLANK),
      createdById: adminId,
    },
    select: { id: true },
  });
  return { ok: true, id: e.id };
}

export async function deleteCanvasEvent(id: string): Promise<boolean> {
  const r = await prisma.canvasEvent.deleteMany({ where: { id } });
  return r.count > 0;
}
