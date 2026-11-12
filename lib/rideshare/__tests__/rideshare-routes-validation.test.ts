/**
 * The rideshare routes were moved onto `implement()` / `defineHandler({ body })`
 * (redesign audit C1). Each used to hand-parse its body and answer a bespoke 400.
 * This table pins those messages: a bad request must still come back with the
 * exact status and `{ error }` text the client has always shown.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  prisma: {
    ride: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
      count: vi.fn(async () => 0),
      create: vi.fn(),
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    rideshareDriver: {
      findUnique: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    rideSavedPlace: { count: vi.fn(async () => 0), create: vi.fn() },
    rideMessage: { create: vi.fn() },
  },
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: h.getSession } } }));
vi.mock('@/lib/prisma.server', () => ({ prisma: h.prisma }));
vi.mock('@/lib/rideshare/notify.server', () => ({
  notifyRider: vi.fn(),
  notifyDriver: vi.fn(),
  notifyNewMessage: vi.fn(),
  notifyAvailableDrivers: vi.fn(),
}));
vi.mock('@/lib/rideshare/osm.server', () => ({
  routeEstimate: vi.fn(),
  geocode: vi.fn(),
  reverseGeocode: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;

async function handler(mod: string, method: string): Promise<Handler> {
  return handlersOfModule<Handler>(await import(/* @vite-ignore */ mod))[method]!;
}

function call(
  fn: Handler,
  method: string,
  body: unknown,
  opts: { params?: Record<string, string>; url?: string } = {},
) {
  return fn({
    params: opts.params ?? { id: 'r1' },
    request: new Request(opts.url ?? 'https://rmhstudios.com/api/x', {
      method,
      headers: {
        cookie: 'better-auth.session_token=abc',
        'content-type': 'application/json',
        'cf-connecting-ip': `${Math.random()}`,
      },
      ...(body === undefined
        ? {}
        : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    }),
  });
}

beforeEach(() => {
  h.getSession.mockResolvedValue({ user: { id: 'u1', isAdmin: false } });
});

interface Case {
  name: string;
  mod: string;
  method: string;
  body: unknown;
  status: number;
  error: string;
}

const VALID_RIDE = {
  rideClass: 'RMH_X',
  pickupLabel: 'A',
  pickupLat: 1,
  pickupLng: 1,
  dropoffLabel: 'B',
  dropoffLat: 2,
  dropoffLng: 2,
};

const CASES: Case[] = [
  {
    name: 'rate: out of range',
    mod: '@/lib/rideshare/api/rideshare.rides.$id.rate.server',
    method: 'POST',
    body: { rating: 9 },
    status: 400,
    error: 'Rating must be 1–5.',
  },
  {
    name: 'rate: malformed JSON (was a 500 before)',
    mod: '@/lib/rideshare/api/rideshare.rides.$id.rate.server',
    method: 'POST',
    body: '{nope',
    status: 400,
    error: 'Rating must be 1–5.',
  },
  {
    name: 'messages: empty',
    mod: '@/lib/rideshare/api/rideshare.rides.$id.messages.server',
    method: 'POST',
    body: { content: '   ' },
    status: 400,
    error: 'Message is empty or too long.',
  },
  {
    name: 'messages: too long',
    mod: '@/lib/rideshare/api/rideshare.rides.$id.messages.server',
    method: 'POST',
    body: { content: 'x'.repeat(501) },
    status: 400,
    error: 'Message is empty or too long.',
  },
  {
    name: 'ride action: unknown action',
    mod: '@/lib/rideshare/api/rideshare.rides.$id.server',
    method: 'POST',
    body: { action: 'explode' },
    status: 400,
    error: 'Invalid action',
  },
  {
    name: 'ride action: tip over the cap',
    mod: '@/lib/rideshare/api/rideshare.rides.$id.server',
    method: 'POST',
    body: { action: 'tip', tipCents: 10_000_000 },
    status: 400,
    error: 'Invalid action',
  },
  {
    name: 'location: not numbers',
    mod: '@/lib/rideshare/api/rideshare.location.server',
    method: 'POST',
    body: { lat: 'x', lng: 1 },
    status: 400,
    error: 'Invalid coordinates',
  },
  {
    name: 'location: out of range',
    mod: '@/lib/rideshare/api/rideshare.location.server',
    method: 'POST',
    body: { lat: 500, lng: 1 },
    status: 400,
    error: 'Invalid coordinates',
  },
  {
    name: 'driver online: not a boolean',
    mod: '@/lib/rideshare/api/rideshare.driver.server',
    method: 'PATCH',
    body: { isOnline: 'yes' },
    status: 400,
    error: 'isOnline boolean required',
  },
  {
    name: 'driver online: no body at all',
    mod: '@/lib/rideshare/api/rideshare.driver.server',
    method: 'PATCH',
    body: undefined,
    status: 400,
    error: 'isOnline boolean required',
  },
  {
    name: 'driver apply: empty body reports the first zod issue',
    mod: '@/lib/rideshare/api/rideshare.driver.server',
    method: 'POST',
    body: {},
    status: 400,
    error: '__zod__',
  },
  {
    name: 'ride create: first zod issue (bad ride class)',
    mod: '@/lib/rideshare/api/rideshare.rides.server',
    method: 'POST',
    body: { ...VALID_RIDE, rideClass: 'NOPE' },
    status: 400,
    error: 'Invalid ride class',
  },
  {
    name: 'ride create: coordinates outside the globe',
    mod: '@/lib/rideshare/api/rideshare.rides.server',
    method: 'POST',
    body: { ...VALID_RIDE, pickupLat: 999 },
    status: 400,
    error: 'Invalid coordinates',
  },
  {
    name: 'ride create: schedule too soon',
    mod: '@/lib/rideshare/api/rideshare.rides.server',
    method: 'POST',
    body: { ...VALID_RIDE, scheduledFor: new Date(Date.now() + 60_000).toISOString() },
    status: 400,
    error: 'Please choose a pickup time at least 5 minutes from now.',
  },
  {
    name: 'ride create: schedule too far',
    mod: '@/lib/rideshare/api/rideshare.rides.server',
    method: 'POST',
    body: { ...VALID_RIDE, scheduledFor: new Date(Date.now() + 40 * 86_400_000).toISOString() },
    status: 400,
    error: 'You can schedule rides up to 30 days ahead.',
  },
  {
    name: 'saved place: coordinates outside the globe',
    mod: '@/lib/rideshare/api/rideshare.places.server',
    method: 'POST',
    body: { label: 'Home', address: 'x', lat: 999, lng: 0 },
    status: 400,
    error: 'Invalid coordinates',
  },
  {
    name: 'saved place: empty label reports the first zod issue',
    mod: '@/lib/rideshare/api/rideshare.places.server',
    method: 'POST',
    body: { label: '', address: 'x', lat: 1, lng: 1 },
    status: 400,
    error: '__zod__',
  },
  {
    name: 'admin decision: bad action',
    mod: '@/lib/rideshare/api/admin.rideshare.applications.server',
    method: 'PATCH',
    body: { id: 'd1', action: 'maybe' },
    status: 400,
    error: 'Invalid request',
  },
];

describe('rideshare routes keep their bespoke 400 messages', () => {
  for (const c of CASES) {
    it(c.name, async () => {
      if (c.mod.includes('admin.rideshare.applications')) {
        h.getSession.mockResolvedValue({ user: { id: 'a1', isAdmin: true } });
      }
      const res = await call(await handler(c.mod, c.method), c.method, c.body);
      expect(res.status).toBe(c.status);
      const json = (await res.json()) as { error: string };
      if (c.error === '__zod__') {
        // The route echoes zod's first issue verbatim; it must be a real message.
        expect(json.error.length).toBeGreaterThan(0);
        expect(json.error).not.toBe('Invalid input');
      } else {
        expect(json).toEqual({ error: c.error });
      }
    });
  }

  it('anonymous callers still get 401 before any validation', async () => {
    h.getSession.mockResolvedValue(null);
    const res = await call(
      await handler('@/lib/rideshare/api/rideshare.rides.$id.rate.server', 'POST'),
      'POST',
      { rating: 9 },
    );
    expect(res.status).toBe(401);
  });

  it('driver apply: the 409 for an existing application still wins over a bad body', async () => {
    h.prisma.rideshareDriver.findUnique.mockResolvedValueOnce({ status: 'APPROVED' } as never);
    const res = await call(await handler('@/lib/rideshare/api/rideshare.driver.server', 'POST'), 'POST', {});
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'You are already an approved driver.' });
  });
});
