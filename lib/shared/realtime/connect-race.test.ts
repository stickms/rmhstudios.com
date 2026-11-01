import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression: every game client checked for an existing client/socket, then
 * awaited the session, then built one. Two same-tick callers (StrictMode's dev
 * double effect) therefore built two sockets for one account. Each connect now
 * shares the in-flight call, so exactly one `io()` happens.
 */
const ioCalls = vi.hoisted(() => ({ n: 0 }));

vi.mock('socket.io-client', () => {
  const makeSocket = () => {
    ioCalls.n += 1;
    const s: Record<string, unknown> = {
      connected: false,
      id: 'x',
      on: () => s,
      off: () => s,
      once: () => s,
      emit: () => s,
      removeAllListeners: () => s,
      disconnect: () => s,
      connect: () => s,
      io: { on: () => undefined, off: () => undefined, engine: {} },
    };
    return s;
  };
  return { io: makeSocket };
});

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { data: { session: { token: 't' }, user: { id: 'u' } } };
    },
  },
}));

beforeEach(() => {
  ioCalls.n = 0;
  vi.stubEnv('VITE_SOCKET_URL', 'http://localhost:7001');
});

const cases: [string, () => Promise<() => Promise<unknown>>][] = [
  ['holdem', async () => (await import('@/lib/holdem/socket')).connectToHoldem],
  ['blackjack', async () => (await import('@/lib/blackjack/socket')).connectToBlackjack],
  ['laundry-sort', async () => (await import('@/lib/laundry-sort/net/client')).connectLaundry],
  ['gabriels-horn', async () => (await import('@/lib/gabriels-horn/net/client')).connectHorn],
  ['massive-march', async () => (await import('@/lib/massive-march/net/client')).connectMassiveMarch],
  ['slice-it', async () => (await import('@/lib/slice-it/net/client')).connectSliceIt],
  ['rmhmusic', async () => (await import('@/lib/rmhmusic/socket')).connectToRmhMusic],
];

describe('concurrent connect builds one socket', () => {
  for (const [name, load] of cases) {
    it(name, async () => {
      const connect = await load();
      await Promise.all([connect(), connect()]);
      expect(ioCalls.n).toBe(1);
    });
  }
});
