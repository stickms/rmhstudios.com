/**
 * Rebar & Rutabaga — availability and taking a table (W1).
 *
 * The rules are in `booking.ts` and are not restated here; this module is the
 * database around them.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { AppError } from '@/lib/errors/codes';
import {
  COVERS_PER_SEATING,
  MAX_PARTY_SIZE,
  SEATINGS,
  bookableDates,
  bookableMonth,
  checkServiceDate,
  fits,
  isSeating,
  seatsLeft,
  type Seating,
  type ServiceDate,
} from '@/lib/rebar-rutabaga/booking';

/** One servable night, with both seatings' remaining covers. */
export interface NightAvailability {
  date: ServiceDate;
  seatings: { seating: Seating; seatsLeft: number }[];
}

export interface Availability {
  /** `YYYY-MM` — the one month currently open. */
  month: string;
  covers: number;
  maxPartySize: number;
  nights: NightAvailability[];
}

/**
 * Every night in the open month with what is left on each seating.
 *
 * One grouped query rather than one per service: the month has at most 18
 * service nights and 36 seatings, and asking 36 times for a number that is
 * usually zero-or-22 would be 36 round trips to render one form.
 */
export async function getAvailability(now: Date = new Date()): Promise<Availability> {
  const dates = bookableDates(now);

  const rows = dates.length
    ? await prisma.rebarReservation.groupBy({
        by: ['serviceDate', 'seating'],
        where: { serviceDate: { in: dates }, status: 'booked' },
        _sum: { partySize: true },
      })
    : [];

  const booked = new Map<string, number>();
  for (const r of rows) booked.set(`${r.serviceDate}|${r.seating}`, r._sum.partySize ?? 0);

  return {
    month: bookableMonth(now),
    covers: COVERS_PER_SEATING,
    maxPartySize: MAX_PARTY_SIZE,
    nights: dates.map((date) => ({
      date,
      seatings: SEATINGS.map((seating) => ({
        seating,
        seatsLeft: seatsLeft(booked.get(`${date}|${seating}`) ?? 0),
      })),
    })),
  };
}

export interface BookingRequest {
  serviceDate: string;
  seating: string;
  partySize: number;
  name: string;
  email: string;
  note?: string;
}

export interface BookingResult {
  id: string;
  serviceDate: string;
  seating: string;
  partySize: number;
}

/**
 * Take a table, or explain why not.
 *
 * The capacity check and the insert run in one transaction, and the last line
 * of defence is the partial unique index rather than the count: two forms
 * submitted at the same instant both read the same remaining covers, and only
 * the database can break that tie. The count is there to give a good message in
 * the ordinary case; the index is there to be correct in the rare one.
 */
export async function book(
  input: BookingRequest,
  userId: string | null,
  now: Date = new Date(),
): Promise<BookingResult> {
  const refusal = checkServiceDate(input.serviceDate, now);
  if (refusal) {
    throw new AppError(refusal === 'outside-window' ? 'GONE' : 'INVALID_INPUT', {
      reason: refusal,
    });
  }
  if (!isSeating(input.seating)) throw new AppError('INVALID_INPUT', { reason: 'seating' });

  const email = input.email.trim().toLowerCase();

  try {
    return await prisma.$transaction(async (tx) => {
      const agg = await tx.rebarReservation.aggregate({
        where: { serviceDate: input.serviceDate, seating: input.seating, status: 'booked' },
        _sum: { partySize: true },
      });
      const already = agg._sum.partySize ?? 0;
      if (!fits(already, input.partySize)) {
        throw new AppError('CONFLICT', { reason: 'full', seatsLeft: seatsLeft(already) });
      }

      const row = await tx.rebarReservation.create({
        data: {
          userId,
          serviceDate: input.serviceDate,
          seating: input.seating,
          partySize: input.partySize,
          name: input.name.trim(),
          email,
          note: input.note?.trim() || null,
        },
        select: { id: true, serviceDate: true, seating: true, partySize: true },
      });
      return row;
    });
  } catch (err) {
    // P2002 here can only be the partial unique index: this guest already holds
    // a live table for that service. A duplicate submission is the common cause
    // and "you already have this" is the honest answer to it.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError('CONFLICT', { reason: 'already-booked' });
    }
    throw err;
  }
}

/** A member's own bookings, newest first. */
export async function listForUser(userId: string): Promise<BookingResult[]> {
  return prisma.rebarReservation.findMany({
    where: { userId, status: 'booked' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, serviceDate: true, seating: true, partySize: true },
  });
}

/**
 * Cancel a booking.
 *
 * Scoped by `userId` in the WHERE clause rather than checked after a fetch, so
 * there is no window in which the row is read, authorised, and then cancelled
 * by a different request in between.
 */
export async function cancel(id: string, userId: string): Promise<boolean> {
  const { count } = await prisma.rebarReservation.updateMany({
    where: { id, userId, status: 'booked' },
    data: { status: 'cancelled', cancelledAt: new Date() },
  });
  return count > 0;
}
