/**
 * Replay logs (WS13, REP-01/02, D-34): one player's input log assembled from
 * `log` batches, and a whole match (every player's log plus a header).
 *
 * Batches arrive from the local Lua (own log) and over P2P through the host
 * (everyone else's), possibly repeated after a reconnect and, for a spectator
 * catching up, interleaved with live ones. A `PlayerLog` therefore files
 * events by their index `i`: duplicates are ignored, gaps wait to be filled,
 * and only the contiguous prefix is "playable". The one exception is a reload
 * rejoin: the rejoiner's log continues at the host's count of it with a
 * `manifest {rejoin}` marker, and a marker landing on an index that holds a
 * different event drops what was held from there on (docs/balatro-mp.md §11).
 * Caps per player per match
 * (D-34): 20 000 events or 1 MB of encoded events; past either the log is
 * truncated (later events are dropped and counted).
 *
 * Browser-free, zod-free (MP chunk): events are shape-checked by hand.
 */

import type { ReplayEvent } from '../types';

export const REPLAY_LIMITS = {
  /** D-34: events per player per match. */
  MAX_EVENTS: 20_000,
  /** D-34: encoded bytes per player per match. */
  MAX_BYTES: 1024 * 1024,
  /** §3.b `log`: events per wire batch. */
  BATCH_EVENTS: 50,
  /** REP-02: ~12 KB per wire batch. */
  BATCH_BYTES: 12 * 1024,
  /** D-34: matches kept in My Replays. */
  KEEP_MATCHES: 30,
} as const;

const OPS: ReadonlySet<string> = new Set([
  'match_manifest', 'lobby_info', 'run_info', 'manifest', 'end', 'chk', 'money_delta', 'sell', 'cashout', 'reroll',
  'hand_scored', 'buy', 'open_pack', 'voucher', 'use', 'pack_pick', 'pack_skip', 'reorder', 'play', 'discard',
  'select_blind', 'skip_blind', 'leave_shop', 'ready_blind', 'set_ante_key', 'hand_result', 'round_dollars',
  'net_pizza', 'net_magnet', 'life_lost', 'net_trap', 'net_in',
]);

/** A structurally valid ReplayEvent (index, time, known op, object payload). */
export function isReplayEvent(v: unknown): v is ReplayEvent {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.i === 'number' &&
    Number.isInteger(e.i) &&
    e.i >= 0 &&
    typeof e.t === 'number' &&
    Number.isFinite(e.t) &&
    e.t >= 0 &&
    typeof e.op === 'string' &&
    OPS.has(e.op) &&
    !!e.d &&
    typeof e.d === 'object' &&
    !Array.isArray(e.d)
  );
}

/** UTF-16 length of the event's JSON: the byte cap's measure (ASCII payloads, so ≈ bytes). */
export function eventSize(e: ReplayEvent): number {
  try {
    return JSON.stringify(e).length;
  } catch {
    return Infinity;
  }
}

export interface AddResult {
  /** Events newly filed. */
  added: number;
  /** Duplicates (same index) ignored. */
  duplicate: number;
  /** Dropped: malformed, over a cap, or past the end. */
  dropped: number;
  /** A rejoin marker dropped the events held from this index on (see `PlayerLog.add`). */
  rewound?: number;
}

/** A reload rejoin's marker (`manifest {rejoin}`; recorder.lua). */
export function isRejoinMarker(e: ReplayEvent): boolean {
  return e.op === 'manifest' && e.d.rejoin === true;
}

/** Two copies of one event (a re-sent batch), as opposed to two events at one index. */
function sameEvent(a: ReplayEvent, b: ReplayEvent): boolean {
  return (
    a.op === b.op && a.t === b.t && a.d.seg === b.d.seg && a.d.mount === b.d.mount && a.d.restore === b.d.restore
  );
}

/** One player's log, filed by event index. */
export class PlayerLog {
  private readonly slots: (ReplayEvent | undefined)[] = [];
  /** Length of the contiguous prefix [0, contiguous). */
  contiguous = 0;
  /** Events held (contiguous or not). */
  count = 0;
  bytes = 0;
  truncated = false;

  constructor(
    readonly id: string,
    private readonly limits: { maxEvents: number; maxBytes: number } = {
      maxEvents: REPLAY_LIMITS.MAX_EVENTS,
      maxBytes: REPLAY_LIMITS.MAX_BYTES,
    },
  ) {}

  add(batch: readonly unknown[]): AddResult {
    const r: AddResult = { added: 0, duplicate: 0, dropped: 0 };
    for (const raw of batch) {
      if (!isReplayEvent(raw) || raw.i >= this.limits.maxEvents) {
        r.dropped += 1;
        if (isReplayEvent(raw)) this.truncated = true;
        continue;
      }
      const held = this.slots[raw.i];
      if (held !== undefined) {
        if (!isRejoinMarker(raw) || sameEvent(held, raw)) {
          r.duplicate += 1;
          continue;
        }
        // A reload rejoin continues this log at the host's count of it. Events held from
        // there on are progress the reload lost (this peer got them, the host had not):
        // the new segment replaces them.
        this.cut(raw.i);
        r.rewound = Math.min(r.rewound ?? raw.i, raw.i);
      }
      const size = eventSize(raw);
      if (this.bytes + size > this.limits.maxBytes) {
        this.truncated = true;
        r.dropped += 1;
        continue;
      }
      this.slots[raw.i] = raw;
      this.bytes += size;
      this.count += 1;
      r.added += 1;
    }
    while (this.slots[this.contiguous] !== undefined) this.contiguous += 1;
    return r;
  }

  /** Drop every event from index `from` on. */
  private cut(from: number): void {
    for (let i = from; i < this.slots.length; i += 1) {
      const e = this.slots[i];
      if (e === undefined) continue;
      this.bytes -= eventSize(e);
      this.count -= 1;
    }
    this.slots.length = Math.min(this.slots.length, from);
    if (this.contiguous > from) this.contiguous = from;
  }

  /** The contiguous events from `from` (default all). */
  events(from = 0): ReplayEvent[] {
    return this.slots.slice(from, this.contiguous) as ReplayEvent[];
  }

  get(i: number): ReplayEvent | undefined {
    return this.slots[i];
  }

  /** The `end` event, when the contiguous prefix holds one. */
  ended(): ReplayEvent | undefined {
    for (let i = this.contiguous - 1; i >= 0; i -= 1) if (this.slots[i]?.op === 'end') return this.slots[i];
    return undefined;
  }

  /** The `chk` event, if any. */
  chk(): ReplayEvent | undefined {
    const last = this.slots[this.contiguous - 1];
    return last?.op === 'chk' ? last : undefined;
  }
}

/** Split events into wire/bridge batches: ≤ `maxEvents` and ≤ ~`maxBytes` each (one oversized event alone). */
export function chunkEvents(
  events: readonly ReplayEvent[],
  maxEvents: number = REPLAY_LIMITS.BATCH_EVENTS,
  maxBytes: number = REPLAY_LIMITS.BATCH_BYTES,
): ReplayEvent[][] {
  const out: ReplayEvent[][] = [];
  let cur: ReplayEvent[] = [];
  let bytes = 0;
  for (const e of events) {
    const n = eventSize(e);
    if (cur.length > 0 && (cur.length >= maxEvents || bytes + n > maxBytes)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(e);
    bytes += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

export type ReplayResult = 'win' | 'lose' | 'draw' | null;

/** The list result of a player's `end {result}`. */
export function resultOf(end: ReplayEvent | undefined): ReplayResult {
  const r = end?.d.result;
  if (r === 'win') return 'win';
  if (r === 'lose' || r === 'eliminated') return 'lose';
  if (r === 'draw') return 'draw';
  return null;
}
