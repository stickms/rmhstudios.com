/**
 * RmhTube — watch-party extras (P20): predictions (T1), bingo (T2) and the
 * reaction/rewind heat buffer (T3).
 *
 * Party state lives in hub memory beside the room (a WeakMap, so it goes when
 * the room does). Points are session points — never coins. Heat counts are
 * buffered here and written in one batch every FLUSH_MS.
 */
import type { Server, Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import { logger } from './logger';
import { getPrismaClient } from './prisma-client';
import { validated, SeekSchema } from './schemas';
import { C2S, S2C } from '../../lib/rmhtube/events';
import { extrapolate } from '../../lib/rmhtube/sync-math';
import { normalizePool, verifyBingo } from '../../lib/rmhtube/bingo';
import {
  START_POINTS,
  HEAT_BUCKET_SEC,
  BINGO_MIN_POOL,
  BINGO_MAX_POOL,
  PredictOpenSchema,
  PredictPickSchema,
  PredictResolveSchema,
  BingoStartSchema,
  BingoCallSchema,
  mediaKey,
  settlePrediction,
  type PartyState,
} from '../../lib/rmhtube/party';
import type { RoomManager } from './room-manager';
import type { RmhTubeRoom } from './types';
import { z } from 'zod';

const FLUSH_MS = 20_000;
const HEAT_FLUSH_CHUNK = 1000;
const MAX_BUFFERED = 2_000;
const EmptySchema = z.object({}).optional();

export class PartyHandler {
  private parties = new WeakMap<RmhTubeRoom, PartyState>();
  private heat = new Map<string, number>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private io: Server,
    private roomManager: RoomManager,
  ) {}

  start(): void {
    this.flushTimer = setInterval(() => void this.flush(), FLUSH_MS);
    this.flushTimer.unref?.();
  }

  async stop(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flush();
  }

  /** Must be registered BEFORE the sync engine so a seek is read pre-apply. */
  handleConnection(socket: Socket): void {
    const on = <T>(event: string, schema: z.ZodType<T>, fn: (s: Socket, p: T) => void) =>
      socket.on(event, validated(socket, event, schema, fn));
    on(C2S.PARTY_SYNC, EmptySchema, (s) => this.onSync(s));
    on(C2S.PARTY_PREDICT_OPEN, PredictOpenSchema, (s, p) => this.onPredictOpen(s, p));
    on(C2S.PARTY_PREDICT_PICK, PredictPickSchema, (s, p) => this.onPredictPick(s, p));
    on(C2S.PARTY_PREDICT_RESOLVE, PredictResolveSchema, (s, p) => this.onPredictResolve(s, p));
    on(C2S.PARTY_BINGO_START, BingoStartSchema, (s, p) => this.onBingoStart(s, p));
    on(C2S.PARTY_BINGO_CALL, BingoCallSchema, (s, p) => this.onBingoCall(s, p));
    on(C2S.PARTY_BINGO_CLAIM, EmptySchema, (s) => this.onBingoClaim(s));
    on(C2S.PARTY_BINGO_END, EmptySchema, (s) => this.onBingoEnd(s));

    // Heat taps: observe only — the owning handlers do the real work and the
    // rate limit for these events, so no `validated()` (it would double-count).
    socket.on(C2S.REACTION_SEND, () => this.onReaction(socket));
    socket.on(C2S.SYNC_SEEK, (raw: unknown) => this.onSeek(socket, raw));
  }

  // ─── State ──────────────────────────────────────────────────

  private state(room: RmhTubeRoom): PartyState {
    let s = this.parties.get(room);
    if (!s) {
      s = { prediction: null, points: {}, bingo: null };
      this.parties.set(room, s);
    }
    return s;
  }

  private ensure(room: RmhTubeRoom, userId: string): { name: string; points: number } {
    const s = this.state(room);
    const name = room.members.get(userId)?.userName ?? 'Viewer';
    return (s.points[userId] ??= { name, points: START_POINTS });
  }

  private ctx(socket: Socket): { room: RmhTubeRoom; userId: string; isHost: boolean } | null {
    const userId = socket.data.userId as string;
    const room = this.roomManager.getRoomForUser(userId);
    if (!room) return null;
    return { room, userId, isHost: room.hostUserId === userId };
  }

  private hostOnly(socket: Socket, isHost: boolean): boolean {
    if (!isHost)
      socket.emit(S2C.ERROR, { code: 'NOT_HOST', message: 'Only the host can do that.' });
    return isHost;
  }

  private publish(room: RmhTubeRoom): void {
    this.io.to(room.id).emit(S2C.PARTY_STATE, this.state(room));
  }

  private onSync(socket: Socket): void {
    const c = this.ctx(socket);
    if (!c) return;
    this.ensure(c.room, c.userId);
    this.publish(c.room);
  }

  // ─── T1 predictions ─────────────────────────────────────────

  private onPredictOpen(socket: Socket, p: { question: string }): void {
    const c = this.ctx(socket);
    if (!c || !this.hostOnly(socket, c.isHost)) return;
    const s = this.state(c.room);
    if (s.prediction?.status === 'open') {
      socket.emit(S2C.ERROR, {
        code: 'PREDICTION_OPEN',
        message: 'Resolve the open prediction first.',
      });
      return;
    }
    s.prediction = {
      id: nanoid(8),
      question: p.question,
      status: 'open',
      outcome: null,
      picks: {},
    };
    this.publish(c.room);
  }

  private onPredictPick(socket: Socket, p: { choice: 'yes' | 'no'; points: number }): void {
    const c = this.ctx(socket);
    if (!c) return;
    const s = this.state(c.room);
    const pred = s.prediction;
    if (!pred || pred.status !== 'open' || pred.picks[c.userId]) return;
    const me = this.ensure(c.room, c.userId);
    if (p.points > me.points) {
      socket.emit(S2C.ERROR, { code: 'NOT_ENOUGH_POINTS', message: 'Not enough points.' });
      return;
    }
    me.points -= p.points;
    pred.picks[c.userId] = { choice: p.choice, points: p.points };
    this.publish(c.room);
  }

  private onPredictResolve(socket: Socket, p: { outcome: 'yes' | 'no' | 'cancel' }): void {
    const c = this.ctx(socket);
    if (!c || !this.hostOnly(socket, c.isHost)) return;
    const s = this.state(c.room);
    const pred = s.prediction;
    if (!pred || pred.status !== 'open') return;
    const payouts = settlePrediction(pred.picks, p.outcome);
    for (const [uid, amount] of Object.entries(payouts)) {
      const row = s.points[uid];
      if (row) row.points += amount;
    }
    pred.status = p.outcome === 'cancel' ? 'cancelled' : 'resolved';
    pred.outcome = p.outcome === 'cancel' ? null : p.outcome;
    this.publish(c.room);
  }

  // ─── T2 bingo ───────────────────────────────────────────────

  private onBingoStart(socket: Socket, p: { pool: string[] }): void {
    const c = this.ctx(socket);
    if (!c || !this.hostOnly(socket, c.isHost)) return;
    const pool = normalizePool(p.pool).slice(0, BINGO_MAX_POOL);
    if (pool.length < BINGO_MIN_POOL) {
      socket.emit(S2C.ERROR, {
        code: 'POOL_TOO_SMALL',
        message: `Bingo needs at least ${BINGO_MIN_POOL} different squares.`,
      });
      return;
    }
    this.state(c.room).bingo = { pool, seed: nanoid(10), called: [], winner: null };
    this.publish(c.room);
  }

  private onBingoCall(socket: Socket, p: { square: string }): void {
    const c = this.ctx(socket);
    if (!c || !this.hostOnly(socket, c.isHost)) return;
    const b = this.state(c.room).bingo;
    if (!b || b.winner || !b.pool.includes(p.square)) return;
    const i = b.called.indexOf(p.square);
    if (i >= 0) b.called.splice(i, 1);
    else b.called.push(p.square);
    this.publish(c.room);
  }

  /** The server regenerates the claimant's card — the client's idea of a line is never read. */
  private onBingoClaim(socket: Socket): void {
    const c = this.ctx(socket);
    if (!c) return;
    const b = this.state(c.room).bingo;
    if (!b || b.winner) return;
    if (!verifyBingo(b.pool, b.seed, c.userId, new Set(b.called))) {
      socket.emit(S2C.ERROR, { code: 'NO_BINGO', message: 'No complete line yet.' });
      return;
    }
    b.winner = { userId: c.userId, name: c.room.members.get(c.userId)?.userName ?? 'Viewer' };
    this.publish(c.room);
  }

  private onBingoEnd(socket: Socket): void {
    const c = this.ctx(socket);
    if (!c || !this.hostOnly(socket, c.isHost)) return;
    this.state(c.room).bingo = null;
    this.publish(c.room);
  }

  // ─── T3 heat ────────────────────────────────────────────────

  private tally(room: RmhTubeRoom, atSec: number): void {
    const item = room.currentItem;
    if (!item || item.live || this.heat.size >= MAX_BUFFERED) return;
    const key = `${Math.floor(Math.max(0, atSec) / HEAT_BUCKET_SEC)}|${mediaKey(item.url)}`;
    this.heat.set(key, (this.heat.get(key) ?? 0) + 1);
  }

  private onReaction(socket: Socket): void {
    const c = this.ctx(socket);
    if (c) this.tally(c.room, extrapolate(c.room.videoState, Date.now()));
  }

  private onSeek(socket: Socket, raw: unknown): void {
    const c = this.ctx(socket);
    const parsed = SeekSchema.safeParse(raw);
    if (!c || !parsed.success || c.room.leaderUserId !== c.userId) return;
    // A rewind is a seek to somewhere meaningfully earlier than where we were.
    if (parsed.data.time < extrapolate(c.room.videoState, Date.now()) - 2)
      this.tally(c.room, parsed.data.time);
  }

  async flush(): Promise<void> {
    if (this.heat.size === 0) return;
    const batch = [...this.heat];
    this.heat.clear();
    try {
      const prisma = getPrismaClient();
      // perf: one multi-row upsert per chunk instead of one INSERT per bucket
      // inside a transaction. Map keys are unique `bucket|url` pairs, so no row
      // appears twice in a statement (ON CONFLICT could not handle that); the
      // merge below still guards it in case key parsing ever collapses two keys.
      const merged = new Map<string, { url: string; bucket: number; n: number }>();
      for (const [key, n] of batch) {
        const cut = key.indexOf('|');
        const bucket = Number(key.slice(0, cut));
        const url = key.slice(cut + 1);
        const id = `${bucket}|${url}`;
        const prev = merged.get(id);
        if (prev) prev.n += n;
        else merged.set(id, { url, bucket, n });
      }
      const rows = [...merged.values()];
      for (let i = 0; i < rows.length; i += HEAT_FLUSH_CHUNK) {
        const chunk = rows.slice(i, i + HEAT_FLUSH_CHUNK);
        await prisma.$executeRaw`INSERT INTO "rmhtube_heat_bucket" ("mediaUrl", "bucket", "count")
          SELECT u, b, c FROM unnest(${chunk.map((r) => r.url)}::text[], ${chunk.map((r) => r.bucket)}::int[], ${chunk.map((r) => r.n)}::int[]) AS t(u, b, c)
          ON CONFLICT ("mediaUrl", "bucket") DO UPDATE SET "count" = "rmhtube_heat_bucket"."count" + EXCLUDED."count"`;
      }
    } catch (err) {
      logger.error({ event: 'heat_flush_failed', error: String(err) });
    }
  }
}
