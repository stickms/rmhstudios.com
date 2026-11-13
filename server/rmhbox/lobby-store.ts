/**
 * RMHbox — durable lobby store (redesign D2, step 2).
 *
 * Lets a deploy (SIGTERM → restart) keep rmhbox lobbies: who is in which
 * lobby, their seats, cumulative scores, match history and chat. A round in
 * progress does NOT survive (the live minigame instance is not serialisable);
 * a restored lobby that was mid-round is put back in WAITING.
 *
 * OFF by default. `openLobbyStore()` constructs a store only when
 * `RMHBOX_DURABLE_LOBBIES=1` AND `REDIS_STATE_URL` (the durable, AOF,
 * noeviction `redis-state` plane — never the evictable cache-plane REDIS_URL)
 * is reachable at boot. Anything else returns `null` and the hub runs exactly
 * as it always has: in-memory lobbies, lost on restart. Like
 * `../shared/redis-adapter.ts`, a store that cannot connect is logged once and
 * the hub starts without it — the hub must ALWAYS start.
 *
 * Layout: one key per lobby (`rmhbox:lobby:<id>`, a versioned JSON payload,
 * TTL refreshed on every save) plus a set index (`rmhbox:lobbies`) so boot can
 * find them without SCAN. A key that expired is pruned from the index on load.
 */

import type Redis from 'ioredis';
import { connectStateRedis } from '../shared/redis-state';
import { z } from 'zod';
import type { RMHboxLobby, RMHboxPlayer, RMHboxSpectator, LobbySettings, LobbyState } from './types';

// ─── Payload ─────────────────────────────────────────────────────

export const LOBBY_STORE_VERSION = 1;

/** Key TTL, refreshed on every save. Longer than any lobby timeout (abs 30 min after the last disconnect). */
export const LOBBY_TTL_SECONDS = 30 * 60;

export const LOBBY_KEY_PREFIX = 'rmhbox:lobby:';
export const LOBBY_INDEX_KEY = 'rmhbox:lobbies';

const PlayerSchema = z.object({
  userId: z.string().min(1),
  userName: z.string(),
  avatarUrl: z.string().nullable(),
  isReady: z.boolean(),
  isAway: z.boolean(),
  score: z.number(),
  roundScore: z.number(),
  joinedAt: z.number(),
  lastSeenAt: z.number(),
});

const SpectatorSchema = z.object({
  userId: z.string().min(1),
  userName: z.string(),
  avatarUrl: z.string().nullable(),
  joinedAt: z.number(),
});

const ChatSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string(),
  content: z.string(),
  timestamp: z.number(),
  type: z.enum(['user', 'system']),
});

const MatchSchema = z.object({
  minigameId: z.string(),
  roundNumber: z.number(),
  startedAt: z.number(),
  endedAt: z.number(),
  standings: z.array(
    z.object({ userId: z.string(), userName: z.string(), score: z.number(), rank: z.number() }),
  ),
});

const SettingsSchema = z.object({
  isPublic: z.boolean(),
  maxPlayers: z.number(),
  maxSpectators: z.number(),
  allowMidGameJoin: z.boolean(),
  allowSpectatorPromotion: z.boolean(),
  autoStartThreshold: z.number().nullable(),
  gameDurationOverride: z.number().nullable(),
});

const GameSettingValuesSchema = z.record(z.string(), z.union([z.boolean(), z.number(), z.string()]));

const LOBBY_STATES = [
  'WAITING',
  'VOTING',
  'GAME_SETTINGS',
  'INSTRUCTIONS',
  'PRELOADING',
  'COUNTDOWN',
  'PLAYING',
  'ROUND_RESULTS',
  'SESSION_RESULTS',
  'DISBANDED',
] as const satisfies readonly LobbyState[];

const StoredLobbySchema = z.object({
  v: z.literal(LOBBY_STORE_VERSION),
  id: z.string().min(1),
  hostUserId: z.string().min(1),
  settings: SettingsSchema,
  players: z.array(PlayerSchema),
  spectators: z.array(SpectatorSchema),
  state: z.enum(LOBBY_STATES),
  chat: z.array(ChatSchema),
  createdAt: z.number(),
  lastActivityAt: z.number(),
  selectedGame: z.object({ minigameId: z.string(), displayName: z.string() }).nullable(),
  matchHistory: z.array(MatchSchema),
  roundNumber: z.number(),
  pendingGameSettings: GameSettingValuesSchema.nullable(),
  resolvedGameSettings: GameSettingValuesSchema.nullable(),
  discordChannelKey: z.string().nullable(),
  /** The lobby's action sequence counter when saved. */
  seq: z.number(),
  savedAt: z.number(),
});

export type StoredLobby = z.infer<typeof StoredLobbySchema>;

/**
 * Lobby → storable JSON. Pure. Maps become arrays; everything tied to a live
 * process is dropped: socket ids, connection flags and the running minigame
 * (`currentGame` holds a BaseMinigame with timers).
 */
export function serializeLobby(lobby: RMHboxLobby, seq: number, now = Date.now()): StoredLobby {
  return {
    v: LOBBY_STORE_VERSION,
    id: lobby.id,
    hostUserId: lobby.hostUserId,
    settings: { ...lobby.settings },
    players: Array.from(lobby.players.values(), (p) => ({
      userId: p.userId,
      userName: p.userName,
      avatarUrl: p.avatarUrl,
      isReady: p.isReady,
      isAway: p.isAway,
      score: p.score,
      roundScore: p.roundScore,
      joinedAt: p.joinedAt,
      lastSeenAt: p.lastSeenAt,
    })),
    spectators: Array.from(lobby.spectators.values(), (s) => ({
      userId: s.userId,
      userName: s.userName,
      avatarUrl: s.avatarUrl,
      joinedAt: s.joinedAt,
    })),
    state: lobby.state,
    chat: lobby.chat.map((m) => ({ ...m })),
    createdAt: lobby.createdAt,
    lastActivityAt: lobby.lastActivityAt,
    selectedGame: lobby.selectedGame ? { ...lobby.selectedGame } : null,
    matchHistory: lobby.matchHistory.map((m) => ({ ...m, standings: m.standings.map((s) => ({ ...s })) })),
    roundNumber: lobby.roundNumber,
    pendingGameSettings: lobby.pendingGameSettings ? { ...lobby.pendingGameSettings } : null,
    resolvedGameSettings: lobby.resolvedGameSettings ? { ...lobby.resolvedGameSettings } : null,
    discordChannelKey: lobby.discordChannelKey,
    seq,
    savedAt: now,
  };
}

/**
 * Stored JSON → lobby, or `null` when the payload is corrupt or from another
 * version. Pure; never throws. Every member comes back disconnected
 * (`socketId: null`, `isConnected: false`) and there is no running game.
 */
export function deserializeLobby(raw: unknown): { lobby: RMHboxLobby; seq: number } | null {
  const parsed = StoredLobbySchema.safeParse(raw);
  if (!parsed.success) return null;
  const s = parsed.data;
  const players = new Map<string, RMHboxPlayer>();
  for (const p of s.players) {
    players.set(p.userId, { ...p, socketId: null, isConnected: false, role: 'player' });
  }
  const spectators = new Map<string, RMHboxSpectator>();
  for (const sp of s.spectators) {
    spectators.set(sp.userId, { ...sp, socketId: null, isConnected: false, role: 'spectator' });
  }
  const settings: LobbySettings = { ...s.settings };
  return {
    lobby: {
      id: s.id,
      hostUserId: s.hostUserId,
      settings,
      players,
      spectators,
      state: s.state,
      chat: s.chat,
      createdAt: s.createdAt,
      lastActivityAt: s.lastActivityAt,
      currentGame: null,
      selectedGame: s.selectedGame,
      matchHistory: s.matchHistory,
      roundNumber: s.roundNumber,
      pendingGameSettings: s.pendingGameSettings,
      resolvedGameSettings: s.resolvedGameSettings,
      discordChannelKey: s.discordChannelKey,
    },
    seq: s.seq,
  };
}

// ─── Restore policy ──────────────────────────────────────────────

/** States in which a round (or the lead-up to one) was running when the process died. */
const ROUND_STATES: ReadonlySet<LobbyState> = new Set<LobbyState>([
  'INSTRUCTIONS',
  'PRELOADING',
  'COUNTDOWN',
  'PLAYING',
]);

/** Lobbies that were already ending are not brought back: their disband timer died with the process. */
const TERMINAL_STATES: ReadonlySet<LobbyState> = new Set<LobbyState>(['SESSION_RESULTS', 'DISBANDED']);

export type RestorePlan =
  | { restore: false; reason: 'ended' | 'empty' }
  | { restore: true; lobby: RMHboxLobby; roundCancelled: boolean };

/**
 * Decide how a deserialised lobby comes back after a restart. Pure: mutates
 * and returns the given lobby.
 *
 * - Ended lobbies (SESSION_RESULTS / DISBANDED) and lobbies with no players
 *   are dropped.
 * - Every other state returns to WAITING. Cumulative scores, match history
 *   and the round number stay; round scores, the running game and any vote or
 *   game-settings draft go (their timers and the vote tally lived in memory).
 * - Ready flags reset the way returning to WAITING resets them (host ready).
 * - `lastActivityAt` is now, exactly as a disconnect stamps it, so the idle
 *   and empty-lobby GC timeouts start from the restart rather than firing on
 *   a lobby whose players are still reconnecting.
 */
export function planRestore(lobby: RMHboxLobby, now = Date.now()): RestorePlan {
  if (TERMINAL_STATES.has(lobby.state)) return { restore: false, reason: 'ended' };
  if (lobby.players.size === 0) return { restore: false, reason: 'empty' };

  const roundCancelled = ROUND_STATES.has(lobby.state);
  if (lobby.state === 'GAME_SETTINGS') lobby.pendingGameSettings = null;
  lobby.state = 'WAITING';
  lobby.currentGame = null;
  lobby.lastActivityAt = now;

  // A host who left between saves: earliest-joined player takes over, as in removePlayer.
  if (!lobby.players.has(lobby.hostUserId)) {
    let earliest: RMHboxPlayer | undefined;
    for (const p of lobby.players.values()) if (!earliest || p.joinedAt < earliest.joinedAt) earliest = p;
    lobby.hostUserId = earliest!.userId;
  }
  for (const p of lobby.players.values()) {
    p.roundScore = 0;
    p.isReady = p.userId === lobby.hostUserId;
    p.lastSeenAt = now;
  }
  return { restore: true, lobby, roundCancelled };
}

// ─── Store ───────────────────────────────────────────────────────

/** One stored entry as read back: `data` is the parsed JSON, or `undefined` if it was not JSON. */
export interface LoadedEntry {
  id: string;
  data: unknown;
}

export interface LobbyStore {
  save(entry: StoredLobby): Promise<void>;
  saveAll(entries: StoredLobby[]): Promise<void>;
  remove(id: string): Promise<void>;
  loadAll(): Promise<LoadedEntry[]>;
  close(): Promise<void>;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** In-memory store for tests (and anything that wants the store contract without Redis). */
export class MemoryLobbyStore implements LobbyStore {
  /** Raw JSON strings by lobby id, exactly as the Redis store would hold them. */
  readonly entries = new Map<string, string>();

  async save(entry: StoredLobby): Promise<void> {
    this.entries.set(entry.id, JSON.stringify(entry));
  }

  async saveAll(entries: StoredLobby[]): Promise<void> {
    for (const e of entries) this.entries.set(e.id, JSON.stringify(e));
  }

  async remove(id: string): Promise<void> {
    this.entries.delete(id);
  }

  async loadAll(): Promise<LoadedEntry[]> {
    return Array.from(this.entries, ([id, raw]) => ({ id, data: parseJson(raw) }));
  }

  async close(): Promise<void> {}
}

export class RedisLobbyStore implements LobbyStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds = LOBBY_TTL_SECONDS,
  ) {}

  async save(entry: StoredLobby): Promise<void> {
    await this.saveAll([entry]);
  }

  async saveAll(entries: StoredLobby[]): Promise<void> {
    if (entries.length === 0) return;
    const multi = this.redis.multi();
    for (const e of entries) {
      multi.set(LOBBY_KEY_PREFIX + e.id, JSON.stringify(e), 'EX', this.ttlSeconds);
      multi.sadd(LOBBY_INDEX_KEY, e.id);
    }
    await multi.exec();
  }

  async remove(id: string): Promise<void> {
    await this.redis.multi().del(LOBBY_KEY_PREFIX + id).srem(LOBBY_INDEX_KEY, id).exec();
  }

  async loadAll(): Promise<LoadedEntry[]> {
    const ids = await this.redis.smembers(LOBBY_INDEX_KEY);
    if (ids.length === 0) return [];
    const raws = await this.redis.mget(...ids.map((id) => LOBBY_KEY_PREFIX + id));
    const out: LoadedEntry[] = [];
    const expired: string[] = [];
    ids.forEach((id, i) => {
      const raw = raws[i];
      if (raw == null) expired.push(id);
      else out.push({ id, data: parseJson(raw) });
    });
    if (expired.length > 0) await this.redis.srem(LOBBY_INDEX_KEY, ...expired);
    return out;
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.redis.quit()]);
    this.redis.disconnect();
  }
}

// ─── Boot ────────────────────────────────────────────────────────

interface StoreLogger {
  info(entry: Record<string, unknown>): void;
  warn(entry: Record<string, unknown>): void;
}

/**
 * Open the durable lobby store, or return `null` (feature off). Never throws.
 * With `RMHBOX_DURABLE_LOBBIES` unset this returns before constructing
 * anything and logs nothing, so the hub's behaviour is unchanged.
 */
export async function openLobbyStore(
  logger: StoreLogger,
  env: Record<string, string | undefined> = process.env,
): Promise<LobbyStore | null> {
  if (env.RMHBOX_DURABLE_LOBBIES !== '1') return null;
  const url = env.REDIS_STATE_URL;
  if (!url) {
    logger.info({ event: 'durable_lobbies_disabled', reason: 'REDIS_STATE_URL unset' });
    return null;
  }

  const connection = await connectStateRedis(url, (err) =>
    // Errors after boot must never crash the hub; save failures are logged by the caller.
    logger.warn({ event: 'durable_lobbies_redis_error', error: err.message }),
  );
  if ('error' in connection) {
    logger.warn({
      event: 'durable_lobbies_unavailable',
      error: connection.error,
      fallback: 'in-memory lobbies (lost on restart)',
    });
    return null;
  }

  logger.info({ event: 'durable_lobbies_enabled' });
  return new RedisLobbyStore(connection.redis);
}
