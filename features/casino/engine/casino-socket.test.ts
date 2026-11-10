import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The four casino table clients (Hold'em, Blackjack, Baccarat, Roulette).
 *
 * Coins move on every one of these tables, so what the socket sends and what
 * the UI is told about the connection is pinned here: the URL and mount path,
 * the session token in the handshake, every server event and the store write
 * it lands in, the status the UI branches on, and the balance fan-out the
 * parent page's coin counter rides on.
 */

type Listener = (...args: unknown[]) => void;

interface FakeSocket {
  url: string;
  opts: Record<string, unknown> & { auth?: (cb: (data: Record<string, unknown>) => void) => void };
  connected: boolean;
  listeners: Map<string, Listener[]>;
  managerListeners: Map<string, Listener[]>;
  emitted: { event: string; data: unknown }[];
  on(event: string, fn: Listener): FakeSocket;
  emit(event: string, data?: unknown): FakeSocket;
  connect(): FakeSocket;
  disconnect(): FakeSocket;
  removeAllListeners(): FakeSocket;
  fire(event: string, ...args: unknown[]): void;
  io: {
    on(event: string, fn: Listener): void;
    reconnection: (v: boolean) => void;
    removeAllListeners(): void;
    backoff: { reset(): void };
  };
}

const h = vi.hoisted(() => ({
  sockets: [] as FakeSocket[],
  session: { data: { session: { token: 't1' }, user: { id: 'user-1' } } } as unknown,
  sessionError: null as Error | null,
}));

vi.mock('socket.io-client', () => {
  const io = (url: string, opts: FakeSocket['opts']) => {
    const listeners = new Map<string, Listener[]>();
    const managerListeners = new Map<string, Listener[]>();
    const s: FakeSocket = {
      url,
      opts,
      connected: false,
      listeners,
      managerListeners,
      emitted: [],
      on(event, fn) {
        listeners.set(event, [...(listeners.get(event) ?? []), fn]);
        return s;
      },
      emit(event, data) {
        s.emitted.push({ event, data });
        return s;
      },
      connect() {
        return s;
      },
      disconnect() {
        s.connected = false;
        return s;
      },
      removeAllListeners() {
        listeners.clear();
        return s;
      },
      fire(event, ...args) {
        if (event === 'connect') s.connected = true;
        if (event === 'disconnect') s.connected = false;
        for (const fn of listeners.get(event) ?? []) fn(...args);
      },
      io: {
        on(event, fn) {
          managerListeners.set(event, [...(managerListeners.get(event) ?? []), fn]);
        },
        reconnection: () => undefined,
        removeAllListeners: () => managerListeners.clear(),
        backoff: { reset: () => undefined },
      },
    };
    h.sockets.push(s);
    return s;
  };
  return { io };
});

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: async () => {
      if (h.sessionError) throw h.sessionError;
      return h.session;
    },
  },
}));

interface GameCase {
  name: string;
  load: () => Promise<{
    connect: () => Promise<unknown>;
    disconnect: () => void;
    get: () => unknown;
    onBalance: (cb: (coins: number) => void) => () => void;
  }>;
  store: () => Promise<{
    getState(): Record<string, unknown>;
    setState(partial: Record<string, unknown>): void;
  }>;
  events: () => Promise<{ S2C: Record<string, string>; C2S: Record<string, string> }>;
  /** Server event key → the store method it calls. */
  handlers: Record<string, string>;
  /** Does the hub hold this game's seat across a mid-round disconnect? */
  holdsSeat: boolean;
}

const COMMON_HANDLERS: Record<string, string> = {
  ROOM_LIST: 'setRoomList',
  ROOM_JOINED: 'setRoomJoined',
  ROOM_LEFT: 'setRoomLeft',
  ROOM_UPDATED: 'setRoomUpdated',
  TABLE_STATE: 'setTableState',
  PLAYER_JOINED: 'handlePlayerJoined',
  PLAYER_LEFT: 'handlePlayerLeft',
};

const CASES: GameCase[] = [
  {
    name: 'holdem',
    load: async () => {
      const m = await import('./holdem/socket');
      return {
        connect: m.connectToHoldem,
        disconnect: m.disconnectFromHoldem,
        get: m.getHoldemSocket,
        onBalance: m.onHoldemBalanceUpdate,
      };
    },
    store: async () => (await import('./holdem/store')).useHoldemStore as never,
    events: async () => (await import('./holdem/events')) as never,
    handlers: {
      ...COMMON_HANDLERS,
      NEW_HAND: 'handleNewHand',
      TURN: 'handleTurn',
      COMMUNITY_CARDS: 'handleCommunityCards',
      HAND_RESULT: 'handleHandResult',
    },
    holdsSeat: false,
  },
  {
    name: 'blackjack',
    load: async () => {
      const m = await import('./blackjack/socket');
      return {
        connect: m.connectToBlackjack,
        disconnect: m.disconnectFromBlackjack,
        get: m.getBlackjackSocket,
        onBalance: m.onBalanceUpdate,
      };
    },
    store: async () => (await import('./blackjack/store')).useBlackjackStore as never,
    events: async () => (await import('./blackjack/events')) as never,
    handlers: {
      ...COMMON_HANDLERS,
      BETTING_PHASE: 'handleBettingPhase',
      TURN: 'handleTurn',
      CARD_DEALT: 'handleCardDealt',
      DEALER_REVEAL: 'handleDealerReveal',
      ROUND_RESULTS: 'handleRoundResults',
      INSURANCE_OFFER: 'handleInsuranceOffer',
      INSURANCE_RESOLVED: 'handleInsuranceResolved',
    },
    holdsSeat: true,
  },
  {
    name: 'baccarat',
    load: async () => {
      const m = await import('./baccarat/socket');
      return {
        connect: m.connectToBaccarat,
        disconnect: m.disconnectFromBaccarat,
        get: m.getBaccaratSocket,
        onBalance: m.onBaccaratBalanceUpdate,
      };
    },
    store: async () => (await import('./baccarat/store')).useBaccaratStore as never,
    events: async () => (await import('./baccarat/events')) as never,
    handlers: {
      ...COMMON_HANDLERS,
      BETTING_PHASE: 'handleBettingPhase',
      CARD_REVEAL: 'handleCardReveal',
      ROUND_RESULT: 'handleRoundResult',
    },
    holdsSeat: true,
  },
  {
    name: 'roulette',
    load: async () => {
      const m = await import('./roulette/socket');
      return {
        connect: m.connectToRoulette,
        disconnect: m.disconnectFromRoulette,
        get: m.getRouletteSocket,
        onBalance: m.onRouletteBalanceUpdate,
      };
    },
    store: async () => (await import('./roulette/store')).useRouletteStore as never,
    events: async () => (await import('./roulette/events')) as never,
    handlers: {
      ...COMMON_HANDLERS,
      BETTING_PHASE: 'handleBettingPhase',
      SPIN_RESULT: 'handleSpinResult',
      ROUND_RESULT: 'handleRoundResult',
    },
    holdsSeat: true,
  },
];

/** Lifecycle listeners, as opposed to the game's own server events. */
const LIFECYCLE = new Set(['connect', 'disconnect', 'connect_error', 'protocol:outdated']);

beforeEach(() => {
  vi.resetModules();
  h.sockets.length = 0;
  h.session = { data: { session: { token: 't1' }, user: { id: 'user-1' } } };
  h.sessionError = null;
  vi.stubEnv('VITE_SOCKET_URL', 'http://localhost:7001');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const only = () => {
  expect(h.sockets).toHaveLength(1);
  return h.sockets[0]!;
};

const resolveAuth = (s: FakeSocket) =>
  new Promise<Record<string, unknown>>((resolve) => s.opts.auth!(resolve));

for (const game of CASES) {
  describe(`${game.name} table client`, () => {
    it('dials the hub at its URL on the /socket/ mount', async () => {
      const client = await game.load();
      await client.connect();
      const s = only();
      expect(s.url).toBe('http://localhost:7001/');
      expect(s.opts.path).toBe('/socket/');
    });

    it('re-reads the session token for every handshake, falling back to the first one', async () => {
      const client = await game.load();
      await client.connect();
      const s = only();

      h.session = { data: { session: { token: 't2' }, user: { id: 'user-1' } } };
      expect(await resolveAuth(s)).toMatchObject({ token: 't2' });

      h.sessionError = new Error('offline');
      expect(await resolveAuth(s)).toMatchObject({ token: 't1' });
    });

    it('refuses to dial without a session and reports error', async () => {
      h.session = { data: null };
      const client = await game.load();
      const store = await game.store();
      await expect(client.connect()).rejects.toThrow('Not authenticated');
      expect(h.sockets).toHaveLength(0);
      expect(store.getState().connectionStatus).toBe('error');
    });

    it('records who the player is before the first connect', async () => {
      const client = await game.load();
      const store = await game.store();
      await client.connect();
      expect(store.getState().myUserId).toBe('user-1');
    });

    it('listens to exactly its server events and routes each to the store', async () => {
      const client = await game.load();
      const store = await game.store();
      const { S2C } = await game.events();

      const spies: Record<string, ReturnType<typeof vi.fn>> = {};
      for (const method of Object.values(game.handlers)) spies[method] = vi.fn();
      store.setState(spies);

      await client.connect();
      const s = only();

      const listened = [...s.listeners.keys()].filter((e) => !LIFECYCLE.has(e)).sort();
      const expected = [
        ...Object.keys(game.handlers).map((k) => S2C[k]!),
        S2C.BALANCE_UPDATE!,
        S2C.ERROR!,
      ].sort();
      expect(listened).toEqual(expected);

      for (const [key, method] of Object.entries(game.handlers)) {
        const payload = { probe: key };
        s.fire(S2C[key]!, payload);
        expect(spies[method], `${key} → ${method}`).toHaveBeenCalled();
      }
    });

    it('fans balance updates out to every subscriber until they unsubscribe', async () => {
      const client = await game.load();
      const { S2C } = await game.events();
      await client.connect();
      const s = only();

      const a = vi.fn();
      const b = vi.fn();
      const offA = client.onBalance(a);
      client.onBalance(b);
      s.fire(S2C.BALANCE_UPDATE!, { coins: 420 });
      expect(a).toHaveBeenCalledWith(420);
      expect(b).toHaveBeenCalledWith(420);

      offA();
      s.fire(S2C.BALANCE_UPDATE!, { coins: 7 });
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenLastCalledWith(7);
    });

    it('shows a server error for three seconds', async () => {
      vi.useFakeTimers();
      const client = await game.load();
      const store = await game.store();
      const { S2C } = await game.events();
      await client.connect();
      const s = only();

      s.fire(S2C.ERROR!, { message: 'Room is full.' });
      expect(store.getState().error).toBe('Room is full.');
      vi.advanceTimersByTime(3000);
      expect(store.getState().error).toBeNull();
    });

    it('reports connecting, then connected', async () => {
      const client = await game.load();
      const store = await game.store();
      const pending = client.connect();
      expect(store.getState().connectionStatus).toBe('connecting');
      await pending;
      only().fire('connect');
      expect(store.getState().connectionStatus).toBe('connected');
    });

    it('a second connect while live reuses the socket', async () => {
      const client = await game.load();
      const first = await client.connect();
      only().fire('connect');
      const second = await client.connect();
      expect(second).toBe(first);
      expect(h.sockets).toHaveLength(1);
    });

    it('concurrent connects build one socket', async () => {
      const client = await game.load();
      await Promise.all([client.connect(), client.connect()]);
      expect(h.sockets).toHaveLength(1);
    });

    it('disconnect closes the socket, drops its listeners and resets the table', async () => {
      const client = await game.load();
      const store = await game.store();
      await client.connect();
      const s = only();
      s.fire('connect');
      store.setState({ error: 'stale' });

      client.disconnect();
      expect(s.connected).toBe(false);
      expect(s.listeners.size).toBe(0);
      expect(client.get()).toBeNull();
      expect(store.getState().error).toBeNull();
      expect(store.getState().connectionStatus).toBe('disconnected');
    });

    // ── Shared realtime client (E2 + reconnect policy) ──────────────────────
    //
    // The bare clients gave up after five attempts and reported every drop as
    // `disconnected` and every failed attempt as `error` — which swapped a live
    // table for "Failed to connect" during a two-second blip. These pin the
    // shared client's contract instead.

    it('sends the protocol version with the token', async () => {
      const { PROTOCOL_AUTH_KEY, PROTOCOL_VERSION } = await import('@/lib/shared/realtime/protocol');
      const client = await game.load();
      await client.connect();
      expect(await resolveAuth(only())).toEqual({ token: 't1', [PROTOCOL_AUTH_KEY]: PROTOCOL_VERSION });
    });

    it('keeps retrying instead of giving up after five attempts', async () => {
      const client = await game.load();
      await client.connect();
      expect(only().opts.reconnectionAttempts).toBe(Infinity);
    });

    it('a dropped table is reconnecting, not disconnected or error', async () => {
      const client = await game.load();
      const store = await game.store();
      await client.connect();
      const s = only();
      s.fire('connect_error', new Error('xhr poll error'));
      expect(store.getState().connectionStatus).toBe('connecting');
      s.fire('connect');
      s.fire('disconnect', 'transport close');
      expect(store.getState().connectionStatus).toBe('reconnecting');
      s.fire('connect_error', new Error('xhr poll error'));
      expect(store.getState().connectionStatus).toBe('reconnecting');
      s.fire('connect');
      expect(store.getState().connectionStatus).toBe('connected');
    });

    it('a server kick is disconnected; a rejected credential or old bundle is error', async () => {
      const client = await game.load();
      const store = await game.store();
      await client.connect();
      const s = only();
      s.fire('connect');
      s.fire('disconnect', 'io server disconnect');
      expect(store.getState().connectionStatus).toBe('disconnected');
      s.fire('connect_error', new Error('protocol-outdated'));
      expect(store.getState().connectionStatus).toBe('error');
    });

    it('a reconnect in the lobby re-asks for the room list', async () => {
      const client = await game.load();
      const { C2S } = await game.events();
      await client.connect();
      const s = only();
      s.fire('connect');
      expect(s.emitted).toEqual([]);
      s.fire('disconnect', 'transport close');
      s.fire('connect');
      expect(s.emitted).toEqual([{ event: C2S.LIST_ROOMS, data: undefined }]);
    });

    it(
      game.holdsSeat
        ? 'a reconnect at a table reclaims the held seat'
        : 'a reconnect at a table goes back to the lobby, never re-buying in',
      async () => {
        const client = await game.load();
        const store = await game.store();
        const { C2S } = await game.events();
        await client.connect();
        const s = only();
        s.fire('connect');
        store.setState({ roomInfo: { roomId: 'room-9' }, viewMode: 'room' });

        s.fire('disconnect', 'ping timeout');
        s.fire('connect');

        if (game.holdsSeat) {
          expect(s.emitted).toEqual([{ event: C2S.JOIN_ROOM, data: { roomId: 'room-9' } }]);
          expect(store.getState().roomInfo).toEqual({ roomId: 'room-9' });
        } else {
          expect(s.emitted.map((e) => e.event)).not.toContain(C2S.JOIN_ROOM);
          expect(s.emitted).toEqual([{ event: C2S.LIST_ROOMS, data: undefined }]);
          expect(store.getState().roomInfo).toBeNull();
          expect(store.getState().viewMode).toBe('lobby');
        }
      },
    );

    it('a reconnect whose table is gone lands in the lobby', async () => {
      const client = await game.load();
      const store = await game.store();
      const { C2S, S2C } = await game.events();
      await client.connect();
      const s = only();
      s.fire('connect');
      store.setState({ roomInfo: { roomId: 'room-9' }, viewMode: 'room' });

      s.fire('disconnect', 'transport close');
      s.fire('connect');
      s.fire(S2C.ERROR!, { message: 'Room not found.' });

      expect(store.getState().roomInfo).toBeNull();
      expect(store.getState().viewMode).toBe('lobby');
      expect(s.emitted.at(-1)).toEqual({ event: C2S.LIST_ROOMS, data: undefined });

      // An ordinary error at a live table later does not throw the player out.
      store.setState({ roomInfo: { roomId: 'room-10' }, viewMode: 'room' });
      s.fire(S2C.ERROR!, { message: 'Not in betting phase.' });
      expect(store.getState().roomInfo).toEqual({ roomId: 'room-10' });
    });
  });
}
