/**
 * Massive March — the realtime client.
 *
 * Connection lifecycle, backoff, wake signals and per-attempt credentials all
 * live in `lib/shared/realtime/client`; this module is the event map, the store
 * writes each message implies, and the outgoing verb list.
 *
 * The hub uses soft auth but this game does not: a campaign is a save owned by
 * an account, and an anonymous seat at somebody's eleven-hour walk is a seat
 * that cannot be given back. So we fail fast without a session rather than
 * opening a socket the server will refuse.
 *
 * The reconnect path is worth reading. A reconnect means a NEW socket id, and
 * the hub keys seats, carried items and puzzle occupancy by socket id — so on
 * every connect we re-join by code, and the server matches us back to the body
 * we left, pockets and all, as long as the grace window has not run out.
 */

'use client';

import type { Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import { MM_CAMPAIGN_KEY, type WorldVariant } from '../constants';
import type { Gesture } from '../gestures';
import { gestureIndex } from '../gestures';
import { applyTick, live, noteDayFraction, resetLive } from '../live';
import { noticeFor, useMmStore, type PackView } from '../store';
import type { Slot } from '../items';
import type { SymbolId } from '../world/sites';
import type {
  CampaignSummary,
  ChatLine,
  Reveal,
  SessionSnapshot,
  TickFrame,
  WorldEvent,
  WorldSnapshot,
} from './events';
import { C2S, S2C } from './events';

let client: RealtimeClient | null = null;
/** The session to re-enter after a drop; the hub keys everything by socket id. */
let pendingCode: string | null = null;

const store = () => useMmStore.getState();

/**
 * Remember the code somewhere a page reload can find it.
 *
 * A socket drop is recoverable in memory. A RELOAD is not — and a reload is what
 * a phone does when the OS reclaims a backgrounded tab, which is an entirely
 * ordinary thing to happen while somebody is standing in a booth reading glyphs
 * to you. `sessionStorage` because it is per-tab and dies with the tab.
 */
function rememberCode(code: string | null): void {
  pendingCode = code;
  try {
    if (code) sessionStorage.setItem(MM_CAMPAIGN_KEY, code);
    else sessionStorage.removeItem(MM_CAMPAIGN_KEY);
  } catch {
    // Private mode — in-memory recovery still works for a plain socket drop.
  }
}

export function storedCode(): string | null {
  try {
    return sessionStorage.getItem(MM_CAMPAIGN_KEY);
  } catch {
    return null;
  }
}

export async function connectMassiveMarch(): Promise<Socket> {
  if (client) {
    client.reconnectNow();
    return client.socket;
  }

  const session = await authClient.getSession();
  if (!session?.data?.session?.token) {
    store().setConnection('error');
    throw new Error('Not authenticated');
  }

  client = createRealtimeClient({
    name: 'MassiveMarch',
    url: import.meta.env.VITE_SOCKET_URL,
    path: '/socket/',
    auth: async () => {
      const current = await authClient.getSession();
      return { token: current?.data?.session?.token };
    },
    onStatus: (status) => store().setConnection(status),
    onConnect: (socket) => {
      store().setSelf(socket.id ?? null, store().selfSlot);
      const code = store().session?.code ?? pendingCode ?? storedCode();
      if (code) socket.emit(C2S.JOIN, { code });
      else socket.emit(C2S.LIST, {});
    },
    bind: registerHandlers,
  });

  return client.socket;
}

function registerHandlers(socket: Socket): void {
  socket.on(S2C.SESSION, (session: SessionSnapshot) => {
    rememberCode(session.code);
    const state = store();
    state.setSession(session);
    state.setError(null);
    const me = session.members.find((m) => m.socketId === state.selfSocketId);
    if (me) state.setSelf(state.selfSocketId, me.slot);
    // The server is the authority on which screen a member belongs on, so a
    // reconnecting player lands where they actually are rather than guessing.
    if (state.screen === 'menu') state.setScreen('lobby');
  });

  socket.on(
    S2C.JOINED,
    (data: { code: string; campaignId: string; slot: number; socketId: string }) => {
      rememberCode(data.code);
      const state = store();
      state.setSelf(data.socketId, data.slot);
      if (state.screen === 'menu') state.setScreen('lobby');
    },
  );

  socket.on(S2C.CAMPAIGNS, (campaigns: CampaignSummary[]) =>
    store().setCampaigns(Array.isArray(campaigns) ? campaigns : []),
  );

  socket.on(S2C.WORLD, (world: WorldSnapshot) => {
    noteDayFraction(world.dayFraction);
    store().applyWorld(world);
  });

  socket.on(S2C.TICK, (frame: TickFrame) => {
    if (!frame || !Array.isArray(frame.p)) return;
    applyTick(frame, store().itemMeta);
  });

  socket.on(S2C.CHAT, (line: ChatLine) => {
    if (line?.id) store().addChat(line);
  });

  socket.on(S2C.REVEAL, (reveal: Reveal) => {
    store().setReveal(reveal && reveal.kind !== 'clear' ? reveal : null);
  });

  socket.on(S2C.PACK_CONTENTS, (pack: PackView) => store().setPack(pack ?? null));

  socket.on(S2C.EVENT, (event: WorldEvent) => {
    if (!event?.kind) return;
    const notice = noticeFor(event);
    if (notice) store().notify(notice.text, notice.tone);
    if (event.kind === 'finished') store().setScreen('ending');
  });

  socket.on(S2C.KICKED, (info: { reason?: string }) => {
    rememberCode(null);
    resetLive();
    const state = store();
    state.leave();
    state.setError(info?.reason === 'host-left' ? 'host-left' : 'kicked');
  });

  socket.on(S2C.ERROR, (error: { message?: string }) => {
    const code = error?.message ?? 'error';
    const state = store();
    // These two mean the seat is gone for good; anything else is a rejected
    // action and belongs in the corner of the screen, not on the menu.
    if (code === 'no-such-session' || code === 'not-your-campaign') {
      rememberCode(null);
      state.leave();
    }
    state.setError(code);
  });
}

// ─── Voice signalling passthrough ───────────────────────────────────────────

export function onVoiceSignal(
  handler: (message: { peer: string; kind: string; data: unknown }) => void,
): () => void {
  const socket = client?.socket;
  if (!socket) return () => {};
  socket.on(S2C.VOICE_SIGNAL, handler);
  return () => {
    socket.off(S2C.VOICE_SIGNAL, handler);
  };
}

export function onVoicePeers(handler: (message: { peers: string[] }) => void): () => void {
  const socket = client?.socket;
  if (!socket) return () => {};
  socket.on(S2C.VOICE_PEERS, handler);
  return () => {
    socket.off(S2C.VOICE_PEERS, handler);
  };
}

// ─── Access ─────────────────────────────────────────────────────────────────

export function getMassiveMarchSocket(): Socket | null {
  return client?.socket ?? null;
}

export function reconnectNow(): void {
  client?.reconnectNow();
}

/**
 * Tear the transport down. Deliberately does NOT forget the session: this runs
 * on unmount, and navigating away for twenty seconds is not leaving the island
 * — the seat is held, and coming back should walk straight into it. Only an
 * explicit leave, a kick, or a refused rejoin forgets.
 */
export function disconnectMassiveMarch(): void {
  client?.destroy();
  client = null;
  resetLive();
}

/**
 * `queue` holds an emit across a blip.
 *
 * Used only for intents that still mean the same thing a few seconds later — a
 * chat line, a settings change, a leave. Never for a position, a throw or a
 * button press: those are about a moment that will have passed, and replaying
 * one into a world that has moved on is worse than dropping it.
 */
function emit(event: string, data?: unknown, queue = false): boolean {
  if (!client) return false;
  return client.emit(event, data, { queue });
}

export const mm = {
  create: (options: { name: string; variant: WorldVariant; allowSkip: boolean }) =>
    emit(C2S.CREATE, options, true),
  join: (code: string) => emit(C2S.JOIN, { code: code.trim().toUpperCase() }, true),
  resume: (campaignId: string) => emit(C2S.RESUME, { campaignId }, true),
  list: () => {
    store().setCampaignsLoading(true);
    return emit(C2S.LIST, {});
  },
  leave: () => {
    rememberCode(null);
    resetLive();
    return emit(C2S.LEAVE, {}, true);
  },
  settings: (options: { allowSkip?: boolean; name?: string }) => emit(C2S.SETTINGS, options, true),

  /** Position report. Packed as an array — see `PlayerTick` for why. */
  move: (x: number, y: number, z: number, yaw: number, pitch: number, bits: number) =>
    emit(C2S.MOVE, [x, y, z, yaw, pitch, bits]),
  gesture: (gesture: Gesture) => emit(C2S.GESTURE, { gesture: gestureIndex(gesture) }),

  chat: (text: string) => emit(C2S.CHAT, { text }, true),
  board: (text: string) => emit(C2S.BOARD, { text }, true),

  take: (itemId: number) => emit(C2S.TAKE, { itemId }),
  stow: (itemId: number, slot: Slot) => emit(C2S.STOW, { itemId, slot }),
  equip: (itemId: number) => emit(C2S.EQUIP, { itemId }),
  drop: () => emit(C2S.DROP, {}),
  throwItem: (dir: [number, number, number], power: number) => emit(C2S.THROW, { dir, power }),
  kick: (itemId: number) => emit(C2S.KICK, { itemId }),
  use: (on?: boolean) => emit(C2S.USE, on === undefined ? {} : { on }),
  openPack: (target: string) => emit(C2S.PACK, { target }),
  takeFromPack: (target: string, itemId: number) => emit(C2S.PACK, { target, itemId }),

  press: (site: string, symbol: SymbolId) => emit(C2S.ACT, { site, action: 'press', symbol }),
  turn: (site: string, totem: string) => emit(C2S.ACT, { site, action: 'turn', totem }),
  dig: (site: string) => emit(C2S.ACT, { site, action: 'dig' }),
  skip: (site: string) => emit(C2S.SKIP, { site }, true),
  deposit: (tower: string) => emit(C2S.DEPOSIT, { tower }, true),
  cart: () => emit(C2S.CART, {}, true),

  voiceSignal: (peer: string, kind: 'offer' | 'answer' | 'ice', data: unknown) =>
    emit(C2S.VOICE_SIGNAL, { peer, kind, data }),
  voiceState: (speaking: boolean) => emit(C2S.VOICE_STATE, { speaking }),
};

/** Latency estimate for the connection chip, sampled off the tick cadence. */
export function tickAge(): number {
  return live.lastTickAt === 0 ? Infinity : performance.now() - live.lastTickAt;
}
