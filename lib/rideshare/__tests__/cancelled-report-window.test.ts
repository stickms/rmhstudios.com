/**
 * s15-18 (S13-15): a trip cancelled after a driver accepted it can be reported from the panel. The ride sync carries
 * `cancelledAt`, and the panel's window runs from `completedAt ?? cancelledAt`, only for a trip with a matched driver
 * (the report route's own rule, `reportAuthorOf`). Prisma is faked through the schema checker.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: h.getSession } } }));
vi.mock('@/lib/prisma.server', async () => ({
  prisma: (await import('@/lib/db/query-shape')).shapeChecked({ ride: { findUnique: h.findUnique } }),
}));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: vi.fn(async () => []) }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

import { rideReportable, withinRideReportWindow } from '@/lib/rideshare/report-window';
import { reportAuthorOf } from '@/lib/rideshare/safety.server';

const DAY = 86_400_000;
const NOW = new Date('2026-12-01T12:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

beforeEach(() => vi.clearAllMocks());

describe('rideReportable', () => {
  const accepted = { hasDriver: true, acceptedAt: ago(5), completedAt: null, cancelledAt: null };

  it('offers Report for a trip cancelled after a driver accepted it', () => {
    expect(rideReportable({ ...accepted, cancelledAt: ago(1) }, NOW)).toBe(true);
  });

  it('counts the window from the cancellation: 30 days in, 31 days out', () => {
    expect(rideReportable({ ...accepted, cancelledAt: ago(30) }, NOW)).toBe(true);
    expect(rideReportable({ ...accepted, cancelledAt: ago(31) }, NOW)).toBe(false);
    expect(rideReportable({ ...accepted, cancelledAt: ago(31).toISOString() }, NOW)).toBe(false);
  });

  it('prefers the completion time when there is one', () => {
    expect(rideReportable({ ...accepted, completedAt: ago(2), cancelledAt: ago(60) }, NOW)).toBe(true);
    expect(rideReportable({ ...accepted, completedAt: ago(40), cancelledAt: ago(1) }, NOW)).toBe(false);
  });

  it('never offers it for a trip nobody accepted, cancelled or not', () => {
    expect(rideReportable({ ...accepted, hasDriver: false, cancelledAt: ago(1) }, NOW)).toBe(false);
    expect(rideReportable({ ...accepted, acceptedAt: null, cancelledAt: ago(1) }, NOW)).toBe(false);
  });

  it('still offers it while the trip is open', () => {
    expect(rideReportable(accepted, NOW)).toBe(true);
    expect(withinRideReportWindow(null, NOW)).toBe(true);
  });

  it('agrees with the server on every case the panel can show', () => {
    const cases = [
      { acceptedAt: ago(5), completedAt: null, cancelledAt: ago(1), driverId: 'driver' },
      { acceptedAt: ago(5), completedAt: null, cancelledAt: ago(45), driverId: 'driver' },
      { acceptedAt: null, completedAt: null, cancelledAt: ago(1), driverId: null },
      { acceptedAt: ago(5), completedAt: ago(3), cancelledAt: null, driverId: 'driver' },
    ];
    for (const c of cases) {
      const server = reportAuthorOf({ riderId: 'rider', ...c }, 'rider', NOW) !== null;
      expect(rideReportable({ ...c, hasDriver: c.driverId !== null }, NOW)).toBe(server);
    }
  });
});

describe('the ride sync', () => {
  const SYNC = '@/lib/rideshare/api/rideshare.rides.$id.sync.server';
  type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;

  it('selects and returns cancelledAt so the panel can count the window from it', async () => {
    h.getSession.mockResolvedValue({ user: { id: 'rider', isAdmin: false } });
    h.findUnique.mockImplementation(async () => ({
      id: 'r1',
      status: 'CANCELLED',
      acceptedAt: ago(2),
      completedAt: null,
      cancelledAt: ago(1),
      riderId: 'rider',
      driverId: 'driver',
      messages: [],
    }));
    const get = handlersOfModule<Handler>(await import(/* @vite-ignore */ SYNC))['GET']!;
    const res = await get({
      params: { id: 'r1' },
      request: new Request('https://rmhstudios.com/api/rideshare/rides/r1/sync', {
        headers: { cookie: 'better-auth.session_token=abc', 'cf-connecting-ip': `${Math.random()}` },
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ride: { cancelledAt: string | null } };
    assertJsonSafe(body);
    expect(body.ride.cancelledAt).toBe(ago(1).toISOString());
    const args = h.findUnique.mock.calls[0]![0] as { select: Record<string, unknown> };
    expect(args.select.cancelledAt).toBe(true);
    expect(args.select.acceptedAt).toBe(true);
  });

  it('the panel reads the window from the helper, not from completedAt alone', () => {
    const panel = readFileSync('components/rideshare/ActiveRidePanel.tsx', 'utf8');
    expect(panel).toContain('rideReportable(');
    expect(panel).not.toContain('withinRideReportWindow(ride.completedAt)');
  });
});
