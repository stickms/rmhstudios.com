/**
 * Reporting a trip (s13-15): only the rider or the driver, about the other, once the trip was accepted and up to 30
 * days after it ended; the moderator's preview has place labels and the chat, never coordinates.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REMOVABLE_REPORT_ENTITY_TYPES, REPORT_ENTITY_TYPES } from '@/lib/moderation/report-constants';

const h = vi.hoisted(() => ({
  prisma: { ride: { findUnique: vi.fn(), findMany: vi.fn() } },
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: h.prisma }));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: vi.fn(async () => []) }));

import {
  reportAuthorOf,
  rideReportAuthor,
  ridePreview,
  formatRidePreview,
  placeArea,
} from '@/lib/rideshare/safety.server';
import { RIDE_REPORT_WINDOW_DAYS, withinRideReportWindow } from '@/lib/rideshare/report-window';

const DAY = 86_400_000;
const NOW = new Date('2026-12-01T12:00:00Z');
const accepted = new Date(NOW.getTime() - 2 * DAY);
const base = { riderId: 'rider', driverId: 'driver', acceptedAt: accepted, completedAt: null, cancelledAt: null };

beforeEach(() => vi.clearAllMocks());

describe('the report type', () => {
  it('ride is reportable and not removable', () => {
    expect(REPORT_ENTITY_TYPES).toContain('ride');
    expect(REMOVABLE_REPORT_ENTITY_TYPES).not.toContain('ride');
  });
});

describe('who may report', () => {
  it('the rider reports about the driver and the driver about the rider', () => {
    expect(reportAuthorOf(base, 'rider', NOW)).toBe('driver');
    expect(reportAuthorOf(base, 'driver', NOW)).toBe('rider');
  });
  it('a stranger gets nothing', () => {
    expect(reportAuthorOf(base, 'stranger', NOW)).toBeNull();
  });
  it('a trip nobody accepted has nothing to report', () => {
    expect(reportAuthorOf({ ...base, driverId: null, acceptedAt: null }, 'rider', NOW)).toBeNull();
    expect(reportAuthorOf({ ...base, acceptedAt: null }, 'rider', NOW)).toBeNull();
  });
  it('an accepted trip that was cancelled can be reported', () => {
    expect(reportAuthorOf({ ...base, cancelledAt: new Date(NOW.getTime() - DAY) }, 'driver', NOW)).toBe('rider');
  });
  it('the window is 30 days from when the trip ended', () => {
    expect(RIDE_REPORT_WINDOW_DAYS).toBe(30);
    const at = (days: number) => ({ ...base, completedAt: new Date(NOW.getTime() - days * DAY) });
    expect(reportAuthorOf(at(29), 'rider', NOW)).toBe('driver');
    expect(reportAuthorOf(at(30), 'rider', NOW)).toBe('driver');
    expect(reportAuthorOf(at(31), 'rider', NOW)).toBeNull();
    expect(withinRideReportWindow(null, NOW)).toBe(true);
    expect(withinRideReportWindow(new Date(NOW.getTime() - 31 * DAY).toISOString(), NOW)).toBe(false);
  });
  it('reads one ride by id and answers null for an unknown one', async () => {
    h.prisma.ride.findUnique.mockResolvedValueOnce(null);
    expect(await rideReportAuthor('nope', 'rider', NOW)).toBeNull();
    h.prisma.ride.findUnique.mockResolvedValueOnce(base);
    expect(await rideReportAuthor('r1', 'rider', NOW)).toBe('driver');
    expect(h.prisma.ride.findUnique).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'r1' } }));
  });
});

describe('the moderator preview', () => {
  const row = {
    id: 'r1',
    riderId: 'rider',
    status: 'COMPLETED',
    pickupLabel: 'Union Station',
    dropoffLabel: 'City Library',
    requestedAt: new Date('2026-11-30T10:00:00Z'),
    acceptedAt: new Date('2026-11-30T10:05:00Z'),
    completedAt: new Date('2026-11-30T10:30:00Z'),
    cancelledAt: null,
    rider: { name: 'Ada', handle: 'ada' },
    driver: { name: 'Bo', handle: null },
    // newest first, as the query returns them
    messages: [
      { senderId: 'driver', content: 'two', createdAt: new Date('2026-11-30T10:07:00Z') },
      { senderId: 'rider', content: 'one', createdAt: new Date('2026-11-30T10:06:00Z') },
    ],
  };

  it('has the labels, the times, both parties and the chat in order, and no coordinates', async () => {
    h.prisma.ride.findMany.mockResolvedValue([row]);
    const text = (await ridePreview(['r1'])).get('r1')!;
    expect(text).toContain('Union Station to City Library');
    expect(text).toContain('Ada (@ada)');
    expect(text).toContain('Bo');
    expect(text.indexOf('rider: one')).toBeLessThan(text.indexOf('driver: two'));
    expect(text).not.toMatch(/-?\d+\.\d{3,}/);
  });

  it('never asks the database for a coordinate or a saved place', async () => {
    h.prisma.ride.findMany.mockResolvedValue([]);
    await ridePreview(['r1']);
    const args = JSON.stringify(h.prisma.ride.findMany.mock.calls[0]![0]);
    expect(args).not.toMatch(/Lat|Lng|saved|Saved/i);
    expect(args).toContain('"in":["r1"]');
  });

  it('is empty for no ids and reads nothing', async () => {
    expect((await ridePreview([])).size).toBe(0);
    expect(h.prisma.ride.findMany).not.toHaveBeenCalled();
  });

  it('says so when there was no chat', () => {
    expect(formatRidePreview({ ...row, messages: [] })).toContain('Chat: no messages');
  });
});

describe('place labels in the preview', () => {
  it('drops street addresses and coordinates, keeps the area', () => {
    expect(placeArea('12 Main Street, Springfield, NY 12345')).toBe('Springfield');
    expect(placeArea('Union Station')).toBe('Union Station');
    expect(placeArea('Current location (40.7128, -74.0060)')).toBe('Current location');
    expect(placeArea('40.7128, -74.0060')).toBe('place withheld');
    expect(placeArea('221B')).toBe('place withheld');
  });

  it('keeps the newest chat lines when the chat is long', () => {
    const messages = Array.from({ length: 40 }, (_, i) => ({
      senderId: 'rider',
      content: `m${40 - i} ${'x'.repeat(150)}`,
      createdAt: new Date(Date.UTC(2026, 10, 30, 10, 59 - i)),
    }));
    const text = formatRidePreview({
      status: 'COMPLETED',
      pickupLabel: 'A',
      dropoffLabel: 'B',
      requestedAt: new Date(),
      acceptedAt: null,
      completedAt: null,
      cancelledAt: null,
      rider: { name: 'Ada', handle: null },
      driver: null,
      riderId: 'rider',
      messages: [...messages].reverse(),
    });
    expect(text.length).toBeLessThan(3000);
    expect(text).toContain('m40 ');
    expect(text).not.toContain('m1 ');
  });
});
