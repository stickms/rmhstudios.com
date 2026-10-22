/**
 * K2 — office-hours booking. Server-only.
 *
 * Race-safety lives in the database: `office_hours_booking` has a unique
 * (hostId, startsAt), so two guests taking the same slot cannot both succeed —
 * the loser gets a 409. The weekly cap is checked under a per-host advisory
 * lock so two simultaneous bookings cannot both squeeze under it.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { SITE_URL } from '@/lib/seo';
import { createNotification } from '@/lib/notifications.server';
import { eventToICS } from '@/lib/events-ics';
import { isValidTimeZone } from './tz';
import {
  OFFICE_HOURS_HORIZON_DAYS,
  OFFICE_HOURS_LEAD_MS,
  OFFICE_HOURS_MAX_PER_GUEST,
  expandSlots,
  isBookableSlot,
  weekBounds,
  windowsOverlap,
  type OfficeConfig,
} from './office-hours';
import { blockedBetween, loadPeople } from './people.server';
import type { OfficeHoursConfigInput } from './schema';
import type { OfficeHoursBookingView, OfficeHoursConfigView, OfficeHoursPublicView } from './types';

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({
  ok: false,
  status,
  error,
});

const summaryKey = (userId: string) => `office-hours:summary:${userId}`;

function toConfig(row: {
  tz: string;
  slotMin: number;
  windows: { weekday: number; startMinute: number; endMinute: number }[];
}): OfficeConfig {
  return {
    tz: row.tz,
    slotMin: row.slotMin,
    windows: row.windows.map((w) => ({
      weekday: w.weekday,
      startMinute: w.startMinute,
      endMinute: w.endMinute,
    })),
  };
}

export async function getMyConfig(userId: string): Promise<OfficeHoursConfigView | null> {
  const row = await prisma.officeHoursConfig.findUnique({
    where: { userId },
    select: {
      title: true,
      blurb: true,
      tz: true,
      slotMin: true,
      maxPerWeek: true,
      enabled: true,
      windows: {
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
        take: 14,
        select: { weekday: true, startMinute: true, endMinute: true },
      },
    },
  });
  return row;
}

export async function saveConfig(
  userId: string,
  input: OfficeHoursConfigInput,
): Promise<Result<OfficeHoursConfigView>> {
  if (!isValidTimeZone(input.tz)) return fail(400, 'Unknown timezone');
  for (const w of input.windows) {
    if (w.endMinute - w.startMinute < input.slotMin) {
      return fail(400, 'Each window must be at least one slot long');
    }
  }
  if (windowsOverlap(input.windows)) return fail(400, 'Windows on the same day overlap');

  await prisma.$transaction(async (tx) => {
    const cfg = await tx.officeHoursConfig.upsert({
      where: { userId },
      create: {
        userId,
        title: input.title,
        blurb: input.blurb,
        tz: input.tz,
        slotMin: input.slotMin,
        maxPerWeek: input.maxPerWeek,
        enabled: input.enabled,
      },
      update: {
        title: input.title,
        blurb: input.blurb,
        tz: input.tz,
        slotMin: input.slotMin,
        maxPerWeek: input.maxPerWeek,
        enabled: input.enabled,
      },
      select: { id: true },
    });
    await tx.officeHoursWindow.deleteMany({ where: { configId: cfg.id } });
    if (input.windows.length) {
      await tx.officeHoursWindow.createMany({
        data: input.windows.map((w) => ({ configId: cfg.id, ...w })),
      });
    }
  });
  apiCache.invalidate(summaryKey(userId));
  const saved = await getMyConfig(userId);
  return saved ? { ok: true, value: saved } : fail(500, 'Could not save');
}

/** Cheap check behind the profile's "Book office hours" button. */
export async function officeHoursSummary(
  hostId: string,
): Promise<{ available: boolean; title: string }> {
  const key = summaryKey(hostId);
  const hit = apiCache.get<{ available: boolean; title: string }>(key);
  if (hit) return hit;
  const row = await prisma.officeHoursConfig.findUnique({
    where: { userId: hostId },
    select: { enabled: true, title: true, _count: { select: { windows: true } } },
  });
  const value = {
    available: !!row && row.enabled && row._count.windows > 0,
    title: row?.title ?? '',
  };
  apiCache.set(key, value, 60_000);
  return value;
}

const bookingSelect = {
  id: true,
  hostId: true,
  guestId: true,
  startsAt: true,
  endsAt: true,
  note: true,
} as const;

async function toBookingViews(
  rows: {
    id: string;
    hostId: string;
    guestId: string;
    startsAt: Date;
    endsAt: Date;
    note: string;
  }[],
): Promise<OfficeHoursBookingView[]> {
  const people = await loadPeople(rows.flatMap((r) => [r.hostId, r.guestId]));
  return rows.flatMap((r) => {
    const host = people.get(r.hostId);
    const guest = people.get(r.guestId);
    if (!host || !guest) return [];
    return [
      {
        id: r.id,
        startsAt: r.startsAt.toISOString(),
        endsAt: r.endsAt.toISOString(),
        note: r.note,
        host,
        guest,
      },
    ];
  });
}

/** The host's public booking page: open slots for the next four weeks. */
export async function getPublicView(
  hostId: string,
  viewerId: string | null,
): Promise<OfficeHoursPublicView | null> {
  const row = await prisma.officeHoursConfig.findUnique({
    where: { userId: hostId },
    select: {
      title: true,
      blurb: true,
      tz: true,
      slotMin: true,
      maxPerWeek: true,
      enabled: true,
      windows: { select: { weekday: true, startMinute: true, endMinute: true }, take: 14 },
    },
  });
  const isHost = viewerId === hostId;
  if (!row || (!row.enabled && !isHost)) return null;
  const people = await loadPeople([hostId]);
  const host = people.get(hostId);
  if (!host) return null;

  const now = new Date();
  const from = new Date(now.getTime() + OFFICE_HOURS_LEAD_MS);
  const to = new Date(now.getTime() + OFFICE_HOURS_HORIZON_DAYS * 86_400_000);
  const config = toConfig(row);
  const slots = row.enabled ? expandSlots(config, from, to) : [];

  const taken = await prisma.officeHoursBooking.findMany({
    where: { hostId, startsAt: { gte: now, lt: to } },
    select: { startsAt: true, guestId: true },
    take: 600,
  });
  const takenSet = new Set(taken.map((b) => b.startsAt.getTime()));
  const mineSet = new Set(
    viewerId ? taken.filter((b) => b.guestId === viewerId).map((b) => b.startsAt.getTime()) : [],
  );

  // A week at its cap offers no more slots.
  const fullWeeks = new Set<number>();
  if (row.maxPerWeek != null) {
    const perWeek = new Map<number, number>();
    for (const b of taken) {
      const k = weekBounds(b.startsAt, row.tz).start.getTime();
      perWeek.set(k, (perWeek.get(k) ?? 0) + 1);
    }
    for (const [k, n] of perWeek) if (n >= row.maxPerWeek) fullWeeks.add(k);
  }

  const open = slots
    .filter((s) => {
      const t = s.startsAt.getTime();
      if (mineSet.has(t)) return true;
      return !takenSet.has(t) && !fullWeeks.has(weekBounds(s.startsAt, row.tz).start.getTime());
    })
    .map((s) => ({
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      mine: mineSet.has(s.startsAt.getTime()),
    }));

  let bookings: OfficeHoursBookingView[] = [];
  if (viewerId) {
    const rows = await prisma.officeHoursBooking.findMany({
      where: isHost
        ? { hostId, startsAt: { gte: now } }
        : { hostId, guestId: viewerId, startsAt: { gte: now } },
      orderBy: { startsAt: 'asc' },
      take: 50,
      select: bookingSelect,
    });
    bookings = await toBookingViews(rows);
  }

  return {
    host,
    title: row.title,
    blurb: row.blurb,
    tz: row.tz,
    slotMin: row.slotMin,
    slots: open,
    bookings,
    isHost,
  };
}

export async function bookSlot(
  hostId: string,
  guestId: string,
  startsAt: Date,
  note: string,
): Promise<Result<OfficeHoursBookingView>> {
  if (hostId === guestId) return fail(400, 'You cannot book your own office hours');
  const cfgRow = await prisma.officeHoursConfig.findUnique({
    where: { userId: hostId },
    select: {
      tz: true,
      slotMin: true,
      maxPerWeek: true,
      enabled: true,
      windows: { select: { weekday: true, startMinute: true, endMinute: true }, take: 14 },
    },
  });
  if (!cfgRow || !cfgRow.enabled) return fail(404, 'No office hours here');
  const config = toConfig(cfgRow);
  if (!isBookableSlot(config, startsAt, new Date())) return fail(400, 'That slot is not available');
  if (await blockedBetween(hostId, guestId)) return fail(403, 'You cannot book this person');

  const endsAt = new Date(startsAt.getTime() + cfgRow.slotMin * 60_000);
  try {
    const created = await prisma.$transaction(async (tx) => {
      // Serialise bookings per host so the weekly cap and the guest limit cannot be raced.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'office-hours:' + hostId}))`;
      const upcoming = await tx.officeHoursBooking.count({
        where: { hostId, guestId, startsAt: { gte: new Date() } },
      });
      if (upcoming >= OFFICE_HOURS_MAX_PER_GUEST) return 'guest-limit' as const;
      if (cfgRow.maxPerWeek != null) {
        const wk = weekBounds(startsAt, cfgRow.tz);
        const inWeek = await tx.officeHoursBooking.count({
          where: { hostId, startsAt: { gte: wk.start, lt: wk.end } },
        });
        if (inWeek >= cfgRow.maxPerWeek) return 'week-full' as const;
      }
      return tx.officeHoursBooking.create({
        data: { hostId, guestId, startsAt, endsAt, note },
        select: bookingSelect,
      });
    });
    if (created === 'guest-limit') {
      return fail(
        409,
        `You already have ${OFFICE_HOURS_MAX_PER_GUEST} upcoming bookings with this person`,
      );
    }
    if (created === 'week-full') return fail(409, 'That week is fully booked');

    const [view] = await toBookingViews([created]);
    const when = startsAt.toUTCString().replace(':00 GMT', ' UTC');
    void createNotification({
      userId: hostId,
      actorId: guestId,
      type: 'SYSTEM',
      entityType: 'office-hours',
      entityId: created.id,
      preview: `${view?.guest.name ?? 'Someone'} booked your office hours for ${when}.`,
      link: `/office-hours/${hostId}`,
    });
    void createNotification({
      userId: guestId,
      actorId: hostId,
      type: 'SYSTEM',
      entityType: 'office-hours',
      entityId: created.id,
      preview: `You are booked with ${view?.host.name ?? 'your host'} on ${when}. Download the calendar file from the booking page.`,
      link: `/office-hours/${hostId}`,
    });
    return { ok: true, value: view };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return fail(409, 'Someone just took that slot');
    }
    throw e;
  }
}

/** Host or guest cancels; the slot frees up and the other side is told. */
export async function cancelBooking(bookingId: string, userId: string): Promise<Result<true>> {
  const b = await prisma.officeHoursBooking.findUnique({
    where: { id: bookingId },
    select: bookingSelect,
  });
  if (!b || (b.hostId !== userId && b.guestId !== userId)) return fail(404, 'Not found');
  await prisma.officeHoursBooking.deleteMany({ where: { id: bookingId } });
  const otherId = b.hostId === userId ? b.guestId : b.hostId;
  const people = await loadPeople([userId]);
  const when = b.startsAt.toUTCString().replace(':00 GMT', ' UTC');
  void createNotification({
    userId: otherId,
    actorId: userId,
    type: 'SYSTEM',
    entityType: 'office-hours',
    entityId: bookingId,
    preview: `${people.get(userId)?.name ?? 'Someone'} cancelled the office-hours booking for ${when}.`,
    link: `/office-hours/${b.hostId}`,
  });
  return { ok: true, value: true };
}

/** Upcoming bookings where the member is the host or the guest. */
export async function listMyBookings(
  userId: string,
): Promise<{ asHost: OfficeHoursBookingView[]; asGuest: OfficeHoursBookingView[] }> {
  const now = new Date();
  const [host, guest] = await Promise.all([
    prisma.officeHoursBooking.findMany({
      where: { hostId: userId, startsAt: { gte: now } },
      orderBy: { startsAt: 'asc' },
      take: 50,
      select: bookingSelect,
    }),
    prisma.officeHoursBooking.findMany({
      where: { guestId: userId, startsAt: { gte: now } },
      orderBy: { startsAt: 'asc' },
      take: 50,
      select: bookingSelect,
    }),
  ]);
  const [asHost, asGuest] = await Promise.all([toBookingViews(host), toBookingViews(guest)]);
  return { asHost, asGuest };
}

export async function bookingIcs(bookingId: string, userId: string): Promise<string | null> {
  const b = await prisma.officeHoursBooking.findUnique({
    where: { id: bookingId },
    select: bookingSelect,
  });
  if (!b || (b.hostId !== userId && b.guestId !== userId)) return null;
  const people = await loadPeople([b.hostId, b.guestId]);
  const other = people.get(userId === b.hostId ? b.guestId : b.hostId);
  return eventToICS({
    id: `office-hours-${b.id}`,
    title: `Office hours with ${other?.name ?? other?.handle ?? 'a member'}`,
    description: b.note || undefined,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    url: `${SITE_URL}/office-hours/${b.hostId}`,
  });
}
