/**
 * Gabriel's Horn — realtime client.
 *
 * Connection lifecycle, reconnect tuning and credential refresh all live in
 * `lib/shared/realtime/client`; this module is only the event map plus the
 * store writes each message implies.
 *
 * The hub uses soft auth, but this game is signed-in only: results write to a
 * record, and a table of anonymous seats is a table where the same person can
 * hold three of them. We fail fast without a session rather than opening a
 * socket the server will refuse to seat.
 *
 * One thing worth knowing when reading the handlers below: `gh:state` is sent
 * to this socket alone and is already filtered for this seat. Nothing here
 * decides what the player may see — that decision is the server's, because a
 * client that received the dice and chose not to draw them would not be hiding
 * them (see `events.ts`).
 */

'use client';

import type { Socket } from 'socket.io-client';
import { authClient } from '@/lib/auth-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import { useHornStore } from '../store';
import { C2S, S2C } from './events';
import type { ChatMessage, GameResults, GameView, LobbySnapshot, PublicLobbyInfo } from './events';
import type { HouseRules } from '../house-rules';

let client: RealtimeClient | null = null;
/** Room to re-join after a drop — the server keys seats by socket id. */
let pendingCode: string | null = null;

/**
 * The table code, kept where a page reload can find it.
 *
 * A socket drop is recoverable in memory: the module is still loaded, so
 * `pendingCode` survives and the reconnect re-joins. A RELOAD is not — and a
 * reload is what a phone does when the OS reclaims a backgrounded tab, which is
 * an entirely ordinary thing to happen in the middle of somebody's turn. The
 * server holds the seat and the hand either way; without this the player simply
 * has no way to tell it which table they were at, and lands on the menu while
 * their cards sit on a table they cannot rejoin.
 *
 * `sessionStorage`, not `localStorage`: it is per-tab and dies with the tab, so
 * two tabs at two different tables cannot overwrite each other's code and a
 * closed tab leaves nothing behind.
 */
const CODE_KEY = 'gh:table-code';

function rememberCode(code: string | null): void {
  pendingCode = code;
  try {
    if (code) sessionStorage.setItem(CODE_KEY, code);
    else sessionStorage.removeItem(CODE_KEY);
  } catch {
    // Private mode / storage disabled — in-memory recovery still works.
  }
}

/** The table this tab was at, if any. Read on mount to offer a resume. */
export function storedTableCode(): string | null {
  try {
    return sessionStorage.getItem(CODE_KEY);
  } catch {
    return null;
  }
}

const store = () => useHornStore.getState();

export async function connectHorn(): Promise<Socket> {
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
    name: 'GabrielsHorn',
    url: import.meta.env.VITE_SOCKET_URL,
    path: '/socket/',
    auth: async () => {
      const current = await authClient.getSession();
      return { token: current?.data?.session?.token };
    },
    onStatus: (status) => store().setConnection(status),
    onConnect: (socket) => {
      store().setSelfSocketId(socket.id ?? null);
      // A reconnect means a NEW socket id, so as far as the lobby's keys are
      // concerned we are a stranger. Re-joining by code is what lets the server
      // match us back to the chair it is holding (and the hand on it); if the
      // grace window has already run out it answers `game-in-progress` and the
      // error handler puts us back on the menu.
      const code = store().lobby?.code ?? pendingCode ?? storedTableCode();
      if (code) socket.emit(C2S.JOIN, { code });
    },
    bind: registerHandlers,
  });

  return client.socket;
}

function registerHandlers(socket: Socket): void {
  socket.on(S2C.LOBBY, (lobby: LobbySnapshot) => {
    rememberCode(lobby.code);
    const s = store();
    s.setLobby(lobby);
    s.setError(null);
    // The server is the authority on which screen a member belongs on, so a
    // reconnecting player lands in the right place without the client guessing.
    if (lobby.state === 'waiting' && s.screen !== 'results') s.setScreen('lobby');
  });

  socket.on(S2C.JOINED, (data: { code: string; socketId: string }) => {
    rememberCode(data.code);
    const s = store();
    s.setSelfSocketId(data.socketId);
    s.setScreen('lobby');
  });

  socket.on(S2C.BROWSE_RESULT, (lobbies: PublicLobbyInfo[]) =>
    store().setPublicLobbies(Array.isArray(lobbies) ? lobbies : []),
  );

  socket.on(S2C.COUNTDOWN, (data: { seconds: number }) => store().setCountdown(data.seconds));

  socket.on(S2C.STATE, (view: GameView) => {
    const s = store();
    s.setCountdown(null);
    s.setView(view);
    // `over` still arrives as a state so the final table stays on screen behind
    // the standings; the results message is what moves the screen.
    if (view.phase !== 'over' && s.screen !== 'table') {
      s.setResults(null);
      s.setScreen('table');
    }
  });

  socket.on(S2C.RESULTS, (results: GameResults) => {
    const s = store();
    s.setResults(results);
    s.setScreen('results');
  });

  socket.on(S2C.CHAT, (message: ChatMessage) => {
    if (message?.id) store().addChat(message);
  });

  socket.on(S2C.HOUSE_RULES, () => {
    // The lobby snapshot and the per-seat state that follow both carry the new
    // rules, so there is nothing to store here. Kept as an explicit no-op so
    // the event is documented rather than looking unhandled.
  });

  socket.on(S2C.HOST_CHANGED, () => {
    // The lobby snapshot that follows carries the new host; nothing to do but
    // let it arrive. Kept as an explicit no-op so the event is documented.
  });

  socket.on(S2C.KICKED, () => {
    rememberCode(null);
    const s = store();
    s.setLobby(null);
    s.setView(null);
    s.setScreen('menu');
    s.setError('kicked');
  });

  socket.on(S2C.ERROR, (error: { message?: string }) => {
    const code = error?.message ?? 'error';
    const s = store();
    // The reconnect path re-joins by code, and these two are the answers that
    // mean the seat is gone for good — the grace window expired, or the table
    // did. Without this the player sits on a frozen table forever, looking at a
    // state nobody is going to update.
    if ((code === 'game-in-progress' || code === 'lobby-not-found') && s.screen === 'table') {
      rememberCode(null);
      s.setLobby(null);
      s.setView(null);
      s.setScreen('menu');
    }
    s.setError(code);
  });
}

// ─── Access ─────────────────────────────────────────────────────────────────

export function getHornSocket(): Socket | null {
  return client?.socket ?? null;
}

export function reconnectNow(): void {
  client?.reconnectNow();
}

/**
 * Tear the transport down. Deliberately does NOT forget the table: this runs on
 * unmount, and navigating off the route for twenty seconds is not the same as
 * leaving the game — the seat is still being held, and coming back should walk
 * straight into it. Only an explicit leave, a kick, or a refused rejoin forgets.
 */
export function disconnectHorn(): void {
  client?.destroy();
  client = null;
}

/**
 * `queue` holds an emit across a blip. Used for intents that still mean the
 * same thing a few seconds later (ready, leave, chat) — never for a turn
 * action, which the phase timer will have resolved by the time the socket is
 * back and which would then fire into somebody else's turn.
 */
function emit(event: string, data?: unknown, queue = false): boolean {
  if (!client) return false;
  return client.emit(event, data, { queue });
}

export const hornNet = {
  create: (settings: { isPublic: boolean }) => emit(C2S.CREATE, settings, true),
  join: (code: string) => emit(C2S.JOIN, { code }, true),
  quickplay: () => emit(C2S.QUICKPLAY, {}, true),
  browse: () => emit(C2S.BROWSE, {}),
  leave: () => {
    rememberCode(null);
    return emit(C2S.LEAVE, {}, true);
  },
  ready: (ready: boolean) => emit(C2S.READY, { ready }, true),
  settings: (settings: { isPublic?: boolean }) => emit(C2S.SETTINGS, settings, true),
  start: () => emit(C2S.START, {}, true),
  kick: (socketId: string) => emit(C2S.KICK, { socketId }, true),
  rematch: () => emit(C2S.REMATCH, {}, true),
  houseRules: (rules: HouseRules) => emit(C2S.HOUSE_RULES, { rules }, true),
  chat: (text: string) => emit(C2S.CHAT, { text }, true),
  ticket: (token: string) => emit(C2S.TICKET, { token }, true),

  play: (cardId: string, targetSocketId?: string) => emit(C2S.PLAY, { cardId, targetSocketId }),
  roll: () => emit(C2S.ROLL, {}),
  claim: (total: number) => emit(C2S.CLAIM, { total }),
  call: (targetSocketId: string, verdict: 'truth' | 'lie') =>
    emit(C2S.CALL, { targetSocketId, verdict }),
  soundEnd: () => emit(C2S.SOUND_END, {}),
  pass: () => emit(C2S.PASS, {}),
};
