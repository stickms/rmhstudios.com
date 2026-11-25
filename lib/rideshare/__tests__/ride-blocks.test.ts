/**
 * Blocks and bans in Rideshare (s13-15): a blocked pair is never newly matched, a block made mid-trip closes the chat
 * for both and leaves the trip, and a banned driver cannot accept. Prisma and the block read are faked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  blocked: vi.fn(async (_userId: string | null): Promise<string[]> => []),
  prisma: {
    ride: {
      findUnique: vi.fn(),
      findMany: vi.fn(async (_args: unknown) => [] as unknown[]),
      updateMany: vi.fn(async (_args: unknown) => ({ count: 1 })),
    },
    rideshareDriver: { findUnique: vi.fn(async () => ({ status: 'APPROVED' })) },
    user: {
      findUnique: vi.fn(async (_args: unknown): Promise<{ bannedUntil: Date | null; name?: string }> => ({
        bannedUntil: null,
      })),
    },
    rideMessage: {
      create: vi.fn(async () => ({ id: 'm1', senderId: 'rider', content: 'hi', createdAt: new Date() })),
    },
  },
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: h.getSession } } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: h.prisma }));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: h.blocked }));
vi.mock('@/lib/rideshare/notify.server', () => ({
  notifyRider: vi.fn(),
  notifyDriver: vi.fn(),
  notifyNewMessage: vi.fn(),
  notifyAvailableDrivers: vi.fn(),
}));
vi.mock('@/lib/rideshare/osm.server', () => ({ routeEstimate: vi.fn(), geocode: vi.fn(), reverseGeocode: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

import { chatClosedFor, otherParty, blockedRiderFilter } from '@/lib/rideshare/safety.server';

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;

async function handler(mod: string, method: string): Promise<Handler> {
  return handlersOfModule<Handler>(await import(/* @vite-ignore */ mod))[method]!;
}

function call(fn: Handler, method: string, body?: unknown, url = 'https://rmhstudios.com/api/x', id = 'r1') {
  return fn({
    params: { id },
    request: new Request(url, {
      method,
      headers: {
        cookie: 'better-auth.session_token=abc',
        'content-type': 'application/json',
        'cf-connecting-ip': `${Math.random()}`,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  });
}

const ACTION = '@/lib/rideshare/api/rideshare.rides.$id.server';
const MESSAGES = '@/lib/rideshare/api/rideshare.rides.$id.messages.server';
const SYNC = '@/lib/rideshare/api/rideshare.rides.$id.sync.server';
const LIST = '@/lib/rideshare/api/rideshare.rides.server';

beforeEach(() => {
  vi.clearAllMocks();
  h.getSession.mockResolvedValue({ user: { id: 'driver', isAdmin: false } });
  h.blocked.mockImplementation(async () => []);
  h.prisma.rideshareDriver.findUnique.mockResolvedValue({ status: 'APPROVED' });
  h.prisma.user.findUnique.mockResolvedValue({ bannedUntil: null });
  h.prisma.ride.updateMany.mockResolvedValue({ count: 1 });
});

describe('the available list', () => {
  it('leaves a blocked rider out in the query itself, so a page of 50 stays full', async () => {
    h.blocked.mockResolvedValue(['blocked-rider']);
    const res = await call(
      await handler(LIST, 'GET'),
      'GET',
      undefined,
      'https://rmhstudios.com/api/rideshare/rides?scope=available',
    );
    expect(res.status).toBe(200);
    const args = h.prisma.ride.findMany.mock.calls[0]![0] as { where: { riderId: { notIn: string[] } }; take: number };
    expect(args.where.riderId.notIn).toEqual(['blocked-rider', 'driver']);
    expect(args.take).toBe(50);
  });

  it('is the same in both directions: the block set is the union of both', () => {
    // getBlockedAuthorIds returns blockers and blocked alike; the filter only sees the ids.
    expect(blockedRiderFilter(['a', 'b'], 'me')).toEqual({ riderId: { notIn: ['a', 'b', 'me'] } });
  });

  it('a failed block lookup fails the request instead of listing the rider', async () => {
    h.blocked.mockRejectedValue(new Error('down'));
    const res = await call(
      await handler(LIST, 'GET'),
      'GET',
      undefined,
      'https://rmhstudios.com/api/rideshare/rides?scope=available',
    );
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(h.prisma.ride.findMany).not.toHaveBeenCalled();
  });
});

describe('accepting', () => {
  const ride = { id: 'r1', riderId: 'rider', driverId: null, status: 'REQUESTED', rideClass: 'RMH_X', tipCents: 0 };

  it('is refused for a blocked pair with RIDE_BLOCKED, whoever blocked whom', async () => {
    h.prisma.ride.findUnique.mockResolvedValue(ride);
    h.blocked.mockResolvedValue(['rider']);
    const res = await call(await handler(ACTION, 'POST'), 'POST', { action: 'accept' });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'RIDE_BLOCKED', error: 'You cannot ride with this member' });
    expect(h.prisma.ride.updateMany).not.toHaveBeenCalled();
  });

  it('is refused for a banned driver', async () => {
    h.prisma.ride.findUnique.mockResolvedValue(ride);
    h.prisma.user.findUnique.mockResolvedValue({ bannedUntil: new Date(Date.now() + 86_400_000) });
    const res = await call(await handler(ACTION, 'POST'), 'POST', { action: 'accept' });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'RIDE_DRIVER_NOT_APPROVED' });
    expect(h.prisma.ride.updateMany).not.toHaveBeenCalled();
  });

  it('lets a driver whose ban has ended accept', async () => {
    h.prisma.ride.findUnique
      .mockResolvedValueOnce(ride)
      .mockResolvedValue({ id: 'r1', status: 'ACCEPTED', driverId: 'driver' });
    h.prisma.user.findUnique.mockResolvedValue({ bannedUntil: new Date(Date.now() - 1000) });
    const res = await call(await handler(ACTION, 'POST'), 'POST', { action: 'accept' });
    expect(res.status).toBe(200);
    expect(h.prisma.ride.updateMany).toHaveBeenCalledTimes(1);
  });

  it('is refused for a driver who is not approved', async () => {
    h.prisma.ride.findUnique.mockResolvedValue(ride);
    h.prisma.rideshareDriver.findUnique.mockResolvedValue({ status: 'PENDING' });
    const res = await call(await handler(ACTION, 'POST'), 'POST', { action: 'accept' });
    expect(await res.json()).toMatchObject({ code: 'RIDE_DRIVER_NOT_APPROVED' });
  });

  it("does not cancel a trip because of a block: cancelling is still only the member's own act", async () => {
    h.prisma.ride.findUnique.mockResolvedValue({ ...ride, driverId: 'driver', status: 'IN_PROGRESS' });
    h.blocked.mockResolvedValue(['rider']);
    const res = await call(await handler(ACTION, 'POST'), 'POST', { action: 'complete' });
    // The trip carries on: the block is never read for start, complete or cancel.
    expect(res.status).toBe(200);
    expect(h.blocked).not.toHaveBeenCalled();
  });
});

describe('trip chat', () => {
  const ride = { id: 'r1', riderId: 'rider', driverId: 'driver', status: 'IN_PROGRESS' };

  it('sends while the trip is under way and nobody has blocked anyone', async () => {
    h.prisma.ride.findUnique.mockResolvedValue(ride);
    const res = await call(await handler(MESSAGES, 'POST'), 'POST', { content: 'hi' });
    expect(res.status).toBe(200);
  });

  for (const sender of ['driver', 'rider']) {
    it(`a block closes chat for the ${sender} too, with the finished-trip code`, async () => {
      h.getSession.mockResolvedValue({ user: { id: sender, isAdmin: false } });
      h.prisma.ride.findUnique.mockResolvedValue(ride);
      h.blocked.mockResolvedValue([sender === 'driver' ? 'rider' : 'driver']);
      const res = await call(await handler(MESSAGES, 'POST'), 'POST', { content: 'hi' });
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ code: 'RIDE_CHAT_CLOSED' });
      expect(h.prisma.rideMessage.create).not.toHaveBeenCalled();
    });
  }

  it('answers an ended trip with the same code, so a block cannot be told from an ended trip', async () => {
    h.prisma.ride.findUnique.mockResolvedValue({ ...ride, status: 'COMPLETED' });
    const res = await call(await handler(MESSAGES, 'POST'), 'POST', { content: 'hi' });
    expect(await res.json()).toMatchObject({ code: 'RIDE_CHAT_CLOSED' });
  });

  it('leaves the trip: the sync snapshot says chatClosed and still returns the trip', async () => {
    h.prisma.ride.findUnique.mockResolvedValue({
      ...ride,
      rider: { id: 'rider' },
      driver: { id: 'driver' },
      messages: [{ id: 'm0', senderId: 'rider', content: 'earlier', createdAt: new Date() }],
    });
    h.blocked.mockResolvedValue(['rider']);
    const res = await call(await handler(SYNC, 'GET'), 'GET');
    const body = (await res.json()) as {
      ride: { status: string; chatClosed: boolean; riderId?: string };
      role: string;
    };
    expect(res.status).toBe(200);
    expect(body.ride.status).toBe('IN_PROGRESS');
    expect(body.ride.chatClosed).toBe(true);
    expect(body.ride.riderId).toBeUndefined();
  });

  it('sync says chat is open when nobody is blocked', async () => {
    h.prisma.ride.findUnique.mockResolvedValue({
      ...ride,
      rider: { id: 'rider' },
      driver: { id: 'driver' },
      messages: [],
    });
    const body = (await (await call(await handler(SYNC, 'GET'), 'GET')).json()) as { ride: { chatClosed: boolean } };
    expect(body.ride.chatClosed).toBe(false);
  });

  it('a stranger cannot read or send', async () => {
    h.getSession.mockResolvedValue({ user: { id: 'stranger', isAdmin: false } });
    h.prisma.ride.findUnique.mockResolvedValue(ride);
    const res = await call(await handler(MESSAGES, 'POST'), 'POST', { content: 'hi' });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('the pure rules', () => {
  const ride = { riderId: 'rider', driverId: 'driver', status: 'ACCEPTED' };
  it('chat is closed for a blocked pair in either role, and for a trip that is not under way', () => {
    expect(chatClosedFor(ride, 'rider', ['driver'])).toBe(true);
    expect(chatClosedFor(ride, 'driver', ['rider'])).toBe(true);
    expect(chatClosedFor(ride, 'rider', [])).toBe(false);
    expect(chatClosedFor(ride, 'rider', ['someone-else'])).toBe(false);
    expect(chatClosedFor({ ...ride, status: 'COMPLETED' }, 'rider', [])).toBe(true);
    expect(chatClosedFor({ ...ride, status: 'REQUESTED' }, 'rider', [])).toBe(true);
  });
  it('the other party is the one who is not the viewer; a stranger has none', () => {
    expect(otherParty(ride, 'rider')).toBe('driver');
    expect(otherParty(ride, 'driver')).toBe('rider');
    expect(otherParty(ride, 'x')).toBeNull();
  });
});
