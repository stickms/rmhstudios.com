/**
 * RMHTube watch statistics: the hub-side recorder.
 *
 * Nothing here runs on the socket hot path. Handlers call the cheap `roomCreated` / `memberJoined` /
 * `messageSent` / `reactionUsed` hooks (an in-memory counter bump); a 5 s sampler reads the rooms the hub
 * already holds and credits playing time to each present member; and one flush every 60 s (plus room close
 * and shutdown) writes the deltas, one transaction per member.
 *
 * What it guarantees:
 *  - a delta is cleared only after its write commits, and only by the amount that write carried, so a failed
 *    flush keeps it for the next one and a slow flush cannot lose what accrued while it ran;
 *  - nothing is recorded for a member who paused (the flag is read at join and re-read every 60 s) and the
 *    flush drops what was held for a member who has since paused;
 *  - a member who requested deletion or was anonymised is never written (the flush upserts, so a held delta
 *    would otherwise recreate an erased row);
 *  - a delta that began before the member's `clearedAt` is dropped (Clear runs in the web tier);
 *  - the hub only ever sees authenticated sockets, so signed-out viewers are never counted.
 */
import { isDeletedAccount } from '../../lib/account-lifecycle';
import { isVideoWatched, retentionCutoffDay, utcDay } from '../../lib/rmhtube/stats';
import { getPrismaClient } from './prisma-client';
import { logger } from './logger';

/** Sampler tick. */
export const SAMPLE_INTERVAL_MS = 5_000;
/** Flush interval, and how long a read pause flag is trusted. */
export const FLUSH_INTERVAL_MS = 60_000;
/** One sample never credits more than this, so a stalled event loop cannot mint minutes. */
const MAX_SAMPLE_MS = 15_000;
/** A delta that holds only a sub-minute remainder is dropped after this long without a touch. */
const REMAINDER_TTL_MS = 10 * 60_000;
/** The most members' deltas held at once (a database outage must not grow memory without bound). */
const MAX_DELTAS = 5_000;
/** Members written concurrently by one flush. */
const FLUSH_CONCURRENCY = 8;

type Db = ReturnType<typeof getPrismaClient>;

interface RecorderLog {
  error(entry: Record<string, unknown>): void;
}

export interface RecorderDeps {
  getDb: () => Db;
  now?: () => number;
  log?: RecorderLog;
}

/** The slice of a hub room the sampler reads (structurally satisfied by `RmhTubeRoom`). */
export interface RecorderRoom {
  id: string;
  videoState: {
    playing: boolean;
    stalled: boolean;
  };
  currentItem: {
    id: string;
    duration: number | null;
  } | null;
  members: {
    values(): Iterable<{
      userId: string;
      isConnected: boolean;
    }>;
  };
}

interface Delta {
  /** UTC day -> milliseconds watched, not yet written. */
  days: Map<string, number>;
  videosWatched: number;
  roomsCreated: number;
  roomsJoined: number;
  messagesSent: number;
  reactionsUsed: number;
  /** When this delta began; a `clearedAt` after it means the delta predates the member's Clear. */
  startedAt: number;
  touchedAt: number;
}

interface RoomSession {
  /** `${itemId}\0${userId}` -> milliseconds the member was present while the item played. */
  played: Map<string, number>;
  watched: Set<string>;
}

interface PauseEntry {
  paused: boolean;
  at: number;
}

type CounterKey = 'videosWatched' | 'roomsCreated' | 'roomsJoined' | 'messagesSent' | 'reactionsUsed';
const COUNTER_KEYS: CounterKey[] = ['videosWatched', 'roomsCreated', 'roomsJoined', 'messagesSent', 'reactionsUsed'];

interface Snapshot {
  minutesByDay: Map<string, number>;
  minutes: number;
  counters: Record<CounterKey, number>;
}

function emptyDelta(now: number): Delta {
  return {
    days: new Map(),
    videosWatched: 0,
    roomsCreated: 0,
    roomsJoined: 0,
    messagesSent: 0,
    reactionsUsed: 0,
    startedAt: now,
    touchedAt: now,
  };
}

function snapshotOf(delta: Delta): Snapshot {
  const minutesByDay = new Map<string, number>();
  let minutes = 0;
  for (const [day, ms] of delta.days) {
    const whole = Math.floor(ms / 60_000);
    if (whole > 0) {
      minutesByDay.set(day, whole);
      minutes += whole;
    }
  }
  const counters = {
    videosWatched: delta.videosWatched,
    roomsCreated: delta.roomsCreated,
    roomsJoined: delta.roomsJoined,
    messagesSent: delta.messagesSent,
    reactionsUsed: delta.reactionsUsed,
  };
  return {
    minutesByDay,
    minutes,
    counters,
  };
}

function snapshotIsEmpty(s: Snapshot): boolean {
  return s.minutes === 0 && COUNTER_KEYS.every((k) => s.counters[k] === 0);
}

/** Take back what a committed write carried; what accrued during the write stays. */
function subtract(delta: Delta, s: Snapshot): void {
  for (const [day, whole] of s.minutesByDay) {
    const left = (delta.days.get(day) ?? 0) - whole * 60_000;
    if (left > 0) delta.days.set(day, left);
    else delta.days.delete(day);
  }
  for (const k of COUNTER_KEYS) delta[k] -= s.counters[k];
}

function isDrained(delta: Delta): boolean {
  return delta.days.size === 0 && COUNTER_KEYS.every((k) => delta[k] === 0);
}

export class StatsRecorder {
  private readonly getDb: () => Db;
  private readonly now: () => number;
  private readonly log: RecorderLog;

  private readonly deltas = new Map<string, Delta>();
  private readonly pause = new Map<string, PauseEntry>();
  private readonly pauseLoading = new Map<string, Promise<void>>();
  private readonly sessions = new Map<string, RoomSession>();
  /** userId -> the UTC day and the rooms joined that day (a room counts once per day). */
  private readonly joinedToday = new Map<
    string,
    {
      day: string;
      rooms: Set<string>;
    }
  >();
  /** userId -> the UTC day the 90-day cleanup last ran for them. */
  private readonly cleanedOn = new Map<string, string>();

  private lastSampleAt = 0;
  private flushing: Promise<void> | null = null;
  private sampleTimer: ReturnType<typeof setInterval> | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: RecorderDeps) {
    this.getDb = deps.getDb;
    this.now = deps.now ?? Date.now;
    this.log = deps.log ?? logger;
  }

  // ─── Lifecycle ───────────────────────────────────────────────

  /** Start the sampler and the flush timer. `getRooms` returns the hub's live rooms. */
  start(getRooms: () => Iterable<RecorderRoom>): void {
    this.stopTimers();
    this.lastSampleAt = this.now();
    this.sampleTimer = setInterval(() => this.sample(getRooms()), SAMPLE_INTERVAL_MS);
    this.flushTimer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    this.sampleTimer.unref?.();
    this.flushTimer.unref?.();
  }

  /** Stop the timers and write what is held (shutdown). Never rejects. */
  async stop(): Promise<void> {
    this.stopTimers();
    await this.flush();
  }

  private stopTimers(): void {
    if (this.sampleTimer) clearInterval(this.sampleTimer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.sampleTimer = null;
    this.flushTimer = null;
  }

  // ─── Event hooks (cheap, synchronous, never throw) ───────────

  roomCreated(userId: string): void {
    this.recordWhenKnown(userId, true, () => this.bump(userId, 'roomsCreated'));
  }

  /** A member entered a room. Reads the pause flag fresh; counts the room once per UTC day. */
  memberJoined(roomId: string, userId: string): void {
    this.recordWhenKnown(userId, true, () => {
      const today = utcDay(this.now());
      let entry = this.joinedToday.get(userId);
      if (!entry || entry.day !== today) {
        entry = {
          day: today,
          rooms: new Set(),
        };
        this.joinedToday.set(userId, entry);
      }
      if (entry.rooms.has(roomId)) return;
      entry.rooms.add(roomId);
      this.bump(userId, 'roomsJoined');
    });
  }

  messageSent(userId: string): void {
    this.recordWhenKnown(userId, false, () => this.bump(userId, 'messagesSent'));
  }

  reactionUsed(userId: string): void {
    this.recordWhenKnown(userId, false, () => this.bump(userId, 'reactionsUsed'));
  }

  /** A room closed: forget its per-item presence and write what is held. */
  roomClosed(roomId: string): void {
    this.sessions.delete(roomId);
    void this.flush();
  }

  // ─── Sampling ────────────────────────────────────────────────

  /**
   * Credit the time since the last sample to every connected, recordable member of every room whose clock is
   * playing. Pure in-memory work; the only I/O is a background pause-flag read for members not yet known.
   */
  sample(rooms: Iterable<RecorderRoom>): void {
    const now = this.now();
    const dt = this.lastSampleAt ? Math.min(Math.max(now - this.lastSampleAt, 0), MAX_SAMPLE_MS) : 0;
    this.lastSampleAt = now;
    const day = utcDay(now);
    const credited = new Set<string>();
    const liveRooms = new Set<string>();

    for (const room of rooms) {
      liveRooms.add(room.id);
      const item = room.currentItem;
      if (!item || !room.videoState.playing || room.videoState.stalled) continue;
      let session = this.sessions.get(room.id);
      if (!session) {
        session = {
          played: new Map(),
          watched: new Set(),
        };
        this.sessions.set(room.id, session);
      }
      for (const member of room.members.values()) {
        if (!member.isConnected || !member.userId) continue;
        if (!this.canRecord(member.userId)) continue;
        const delta = this.deltaFor(member.userId, now);
        // One member in two rooms (two tabs) is one person watching: wall-clock minutes credit once per sample.
        if (!credited.has(member.userId)) {
          credited.add(member.userId);
          delta.days.set(day, (delta.days.get(day) ?? 0) + dt);
        }
        const key = `${item.id}\0${member.userId}`;
        const played = (session.played.get(key) ?? 0) + dt;
        session.played.set(key, played);
        if (!session.watched.has(key) && isVideoWatched(played / 1000, item.duration)) {
          session.watched.add(key);
          delta.videosWatched += 1;
        }
      }
    }
    for (const roomId of this.sessions.keys()) {
      if (!liveRooms.has(roomId)) this.sessions.delete(roomId);
    }
  }

  // ─── Pause flag ──────────────────────────────────────────────

  /** True when the member's pause flag is known, fresh enough, and off. Kicks off a read when it is not. */
  private canRecord(userId: string): boolean {
    const entry = this.pause.get(userId);
    if (!entry) {
      void this.refreshPause(userId);
      return false;
    }
    if (this.now() - entry.at > FLUSH_INTERVAL_MS) void this.refreshPause(userId);
    return !entry.paused;
  }

  private refreshPause(userId: string): Promise<void> {
    const inflight = this.pauseLoading.get(userId);
    if (inflight) return inflight;
    const load = (async () => {
      try {
        const row = await this.getDb().rmhTubeUserStats.findUnique({
          where: {
            userId,
          },
          select: {
            paused: true,
          },
        });
        this.pause.set(userId, {
          paused: row?.paused === true,
          at: this.now(),
        });
      } catch (err) {
        this.log.error({
          event: 'rmhtube_stats_pause_read_failed',
          userId,
          error: String(err),
        });
      } finally {
        this.pauseLoading.delete(userId);
      }
    })();
    this.pauseLoading.set(userId, load);
    return load;
  }

  /**
   * Run `fn` when the member is recordable. With `fresh`, the pause flag is read first (join, create); otherwise
   * the cached flag is used, and refreshed in the background once it is a minute old.
   */
  private recordWhenKnown(userId: string, fresh: boolean, fn: () => void): void {
    if (!userId) return;
    try {
      const entry = this.pause.get(userId);
      if (!fresh && entry) {
        if (this.now() - entry.at > FLUSH_INTERVAL_MS) void this.refreshPause(userId);
        if (!entry.paused) fn();
        return;
      }
      void this.refreshPause(userId).then(() => {
        if (this.pause.get(userId)?.paused === false) fn();
      });
    } catch (err) {
      this.log.error({
        event: 'rmhtube_stats_hook_failed',
        userId,
        error: String(err),
      });
    }
  }

  // ─── Deltas ──────────────────────────────────────────────────

  private deltaFor(userId: string, now: number): Delta {
    let delta = this.deltas.get(userId);
    if (!delta) {
      delta = emptyDelta(now);
      this.deltas.set(userId, delta);
      if (this.deltas.size > MAX_DELTAS) this.evictOldest(userId);
    }
    delta.touchedAt = now;
    return delta;
  }

  /** A database outage keeps deltas for the next flush; bound the total by dropping the least recently touched. */
  private evictOldest(keep: string): void {
    let oldest: string | null = null;
    let at = Infinity;
    for (const [id, d] of this.deltas) {
      if (id !== keep && d.touchedAt < at) {
        at = d.touchedAt;
        oldest = id;
      }
    }
    if (oldest) this.deltas.delete(oldest);
  }

  /** Forget per-member bookkeeping that has gone stale, so the maps follow who is active, not who ever was. */
  private prune(now: number): void {
    const today = utcDay(now);
    for (const [id, e] of this.pause)
      if (now - e.at > 10 * FLUSH_INTERVAL_MS && !this.deltas.has(id)) this.pause.delete(id);
    for (const [id, e] of this.joinedToday) if (e.day !== today) this.joinedToday.delete(id);
    for (const [id, day] of this.cleanedOn) if (day !== today) this.cleanedOn.delete(id);
  }

  private bump(userId: string, key: CounterKey): void {
    this.deltaFor(userId, this.now())[key] += 1;
  }

  // ─── Flush ───────────────────────────────────────────────────

  /** Write every held delta. One flush at a time; a second call joins the one in flight. Never rejects. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.runFlush()
      .catch((err) =>
        this.log.error({
          event: 'rmhtube_stats_flush_failed',
          error: String(err),
        }),
      )
      .finally(() => {
        this.flushing = null;
      });
    return this.flushing;
  }

  private async runFlush(): Promise<void> {
    this.prune(this.now());
    const ids = [...this.deltas.keys()];
    if (ids.length === 0) return;
    const db = this.getDb();
    const now = this.now();

    const [users, rows] = await Promise.all([
      db.user.findMany({
        where: {
          id: {
            in: ids,
          },
        },
        select: {
          id: true,
          banReason: true,
          deletionScheduledAt: true,
        },
      }),
      db.rmhTubeUserStats.findMany({
        where: {
          userId: {
            in: ids,
          },
        },
        select: {
          userId: true,
          paused: true,
          clearedAt: true,
        },
      }),
    ]);
    const live = new Set(
      (Array.isArray(users) ? users : [])
        .filter((u) => !u.deletionScheduledAt && !isDeletedAccount(u))
        .map((u) => u.id),
    );
    const statRows = new Map((Array.isArray(rows) ? rows : []).map((r) => [r.userId, r]));
    for (const [userId, row] of statRows)
      this.pause.set(userId, {
        paused: row.paused,
        at: now,
      });

    const writable: {
      userId: string;
      delta: Delta;
      snapshot: Snapshot;
    }[] = [];
    for (const userId of ids) {
      const delta = this.deltas.get(userId);
      if (!delta) continue;
      const row = statRows.get(userId);
      // Deleted or deleting, paused since it accrued, or accrued before the member's Clear: never written.
      if (!live.has(userId) || row?.paused || (row?.clearedAt && row.clearedAt.getTime() > delta.startedAt)) {
        this.deltas.delete(userId);
        continue;
      }
      const snapshot = snapshotOf(delta);
      if (snapshotIsEmpty(snapshot)) {
        if (now - delta.touchedAt > REMAINDER_TTL_MS) this.deltas.delete(userId);
        continue;
      }
      writable.push({
        userId,
        delta,
        snapshot,
      });
    }

    const today = utcDay(now);
    const cutoff = retentionCutoffDay(now);
    for (let i = 0; i < writable.length; i += FLUSH_CONCURRENCY) {
      await Promise.all(
        writable.slice(i, i + FLUSH_CONCURRENCY).map(async ({ userId, delta, snapshot }) => {
          const cleanup = this.cleanedOn.get(userId) !== today;
          try {
            await db.$transaction([
              db.rmhTubeUserStats.upsert({
                where: {
                  userId,
                },
                create: {
                  userId,
                  totalWatchTimeMinutes: snapshot.minutes,
                  ...snapshot.counters,
                },
                update: {
                  totalWatchTimeMinutes: {
                    increment: snapshot.minutes,
                  },
                  videosWatched: {
                    increment: snapshot.counters.videosWatched,
                  },
                  roomsCreated: {
                    increment: snapshot.counters.roomsCreated,
                  },
                  roomsJoined: {
                    increment: snapshot.counters.roomsJoined,
                  },
                  messagesSent: {
                    increment: snapshot.counters.messagesSent,
                  },
                  reactionsUsed: {
                    increment: snapshot.counters.reactionsUsed,
                  },
                },
                select: {
                  userId: true,
                },
              }),
              ...[...snapshot.minutesByDay].map(([day, minutes]) =>
                db.rmhTubeWatchDay.upsert({
                  where: {
                    userId_day: {
                      userId,
                      day,
                    },
                  },
                  create: {
                    userId,
                    day,
                    minutes,
                  },
                  update: {
                    minutes: {
                      increment: minutes,
                    },
                  },
                  select: {
                    userId: true,
                  },
                }),
              ),
              ...(cleanup
                ? [
                    db.rmhTubeWatchDay.deleteMany({
                      where: {
                        userId,
                        day: {
                          lt: cutoff,
                        },
                      },
                    }),
                  ]
                : []),
            ]);
          } catch (err) {
            // Nothing was subtracted: the next flush carries the same delta.
            this.log.error({
              event: 'rmhtube_stats_write_failed',
              userId,
              error: String(err),
            });
            return;
          }
          if (cleanup) this.cleanedOn.set(userId, today);
          subtract(delta, snapshot);
          if (isDrained(delta)) this.deltas.delete(userId);
        }),
      );
    }
  }
}

/** The hub's one recorder. Nothing touches the database until the first flush or pause read. */
export const statsRecorder = new StatsRecorder({
  getDb: getPrismaClient,
});
