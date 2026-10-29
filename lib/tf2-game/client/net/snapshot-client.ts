/**
 * The client's mirror of the server's entities (the SDK's CL_ParsePacketEntities
 * + the client entity list), fed by `tf2:snapshot` and `tf2:events` bytes.
 *
 *   - `onReliable(bytes)` applies the reliable stream: string-table
 *     definitions, server info, the roster and scores; returns its events.
 *   - `onSnapshot(bytes)` decodes a snapshot against the frame it was
 *     delta-encoded from (kept in a 64-frame history, like the server's), and
 *     makes it the newest frame. `ackTick` is what the next input packet acks.
 *
 * Entities are keyed by snapshot key (net/snapshot.ts: 0 = rules, entity ids,
 * weapon keys) with their serial: a key whose serial changes is a new entity.
 * States are immutable; `record(state)` materializes a field-name record once
 * per state.
 *
 * Environment-agnostic (main thread, worker, tests).
 */

import type { SimEvent } from '../../sim/events';
import type { NetRecord } from '../../sim/net-schema';
import {
  decodeReliable,
  type HelloMessage,
  type ReliableMessage,
  type ScoreRow,
} from '../../net/protocol';
import {
  RULES_KEY,
  SNAPSHOT_HISTORY,
  frameGet,
  keyKind,
  stateToRecord,
  weaponKey,
  decodeSnapshot,
  type DecodedSnapshot,
  type EntityState,
  type SnapshotDecodeError,
  type SnapshotFrame,
} from '../../net/snapshot';
import { ClientStringTable } from '../../net/string-table';

export interface TimedEvent {
  /** Server tick the event happened on. */
  tick: number;
  event: SimEvent;
  /** False for cosmetic events that rode a snapshot. */
  reliable: boolean;
}

export interface RosterEntry {
  entity: number;
  name: string;
  bot: boolean;
}

export interface SnapshotClientStats {
  snapshots: number;
  snapshotBytes: number;
  reliablePackets: number;
  reliableBytes: number;
  errors: Record<SnapshotDecodeError | 'reliable', number>;
}

export class SnapshotClient {
  readonly strings = new ClientStringTable();
  private readonly frames: SnapshotFrame[] = [];
  private readonly records = new WeakMap<EntityState, NetRecord>();
  /** Newest decoded frame. */
  latest: SnapshotFrame | null = null;
  /** The newest decoded snapshot's header. */
  localEntity = -1;
  ackCmd = 0;
  hello: HelloMessage | null = null;
  readonly roster = new Map<number, RosterEntry>();
  readonly scores = new Map<number, ScoreRow>();
  readonly stats: SnapshotClientStats = {
    snapshots: 0,
    snapshotBytes: 0,
    reliablePackets: 0,
    reliableBytes: 0,
    errors: { malformed: 0, 'no-baseline': 0, 'unknown-schema': 0, reliable: 0 },
  };

  /** The tick the next input packet acknowledges (0 before the first snapshot). */
  get ackTick(): number {
    return this.latest ? this.latest.tick : 0;
  }

  /** Applies a reliable packet; returns the events it carried (in order). */
  onReliable(
    bytes: Uint8Array,
  ): { tick: number; events: TimedEvent[]; messages: ReliableMessage[] } | null {
    const decoded = decodeReliable(bytes, this.strings);
    if (!decoded) {
      this.stats.errors.reliable++;
      return null;
    }
    this.stats.reliablePackets++;
    this.stats.reliableBytes += bytes.byteLength;
    const events: TimedEvent[] = [];
    for (const m of decoded.messages) {
      switch (m.kind) {
        case 'event':
          events.push({ tick: decoded.tick, event: m.event, reliable: true });
          break;
        case 'hello':
          if (this.hello && this.hello.localEntity !== m.localEntity) this.reset();
          this.hello = m;
          this.localEntity = m.localEntity;
          break;
        case 'player':
          if (m.present) this.roster.set(m.entity, { entity: m.entity, name: m.name, bot: m.bot });
          else {
            this.roster.delete(m.entity);
            this.scores.delete(m.entity);
          }
          break;
        case 'scores':
          for (const r of m.rows) this.scores.set(r.entity, r);
          break;
        default:
          break;
      }
    }
    return { tick: decoded.tick, events, messages: decoded.messages };
  }

  /**
   * Decodes a snapshot. Returns it (and makes it the newest frame), or null
   * when it is stale, malformed or its baseline is gone (the server then
   * re-deltas from the frame we keep acking).
   */
  onSnapshot(bytes: Uint8Array): (DecodedSnapshot & { cosmetic: TimedEvent[] }) | null {
    const result = decodeSnapshot(
      bytes,
      (tick) => this.frame(tick),
      (id) => this.strings.get(id),
    );
    if (typeof result === 'string') {
      this.stats.errors[result]++;
      return null;
    }
    if (this.latest && result.tick <= this.latest.tick) return null;
    this.stats.snapshots++;
    this.stats.snapshotBytes += bytes.byteLength;
    this.frames.push(result.frame);
    while (this.frames.length > SNAPSHOT_HISTORY) this.frames.shift();
    // Frames older than the baseline the server just used will never be used again.
    if (result.baseTick > 0) {
      while (this.frames.length > 1 && this.frames[0].tick < result.baseTick) this.frames.shift();
    }
    this.latest = result.frame;
    this.localEntity = result.localEntity;
    this.ackCmd = result.ackCmd;
    const cosmetic = result.events.map((e) => ({ tick: e.tick, event: e.event, reliable: false }));
    return { ...result, cosmetic };
  }

  /** A kept frame by tick. */
  frame(tick: number): SnapshotFrame | null {
    for (let i = this.frames.length - 1; i >= 0; i--)
      if (this.frames[i].tick === tick) return this.frames[i];
    return null;
  }

  /** An entity in the newest frame. */
  entity(key: number): EntityState | null {
    return this.latest ? frameGet(this.latest, key) : null;
  }

  /** A state's fields by name (cached per state; do not mutate). */
  record(state: EntityState): NetRecord {
    let r = this.records.get(state);
    if (!r) {
      r = stateToRecord(state);
      this.records.set(state, r);
    }
    return r;
  }

  rules(): NetRecord | null {
    const s = this.entity(RULES_KEY);
    return s ? this.record(s) : null;
  }

  /** The local player's record (owner view). */
  localPlayer(): NetRecord | null {
    if (this.localEntity < 0) return null;
    const s = this.entity(this.localEntity);
    return s ? this.record(s) : null;
  }

  /** The local player's weapons by slot (owner-only records). */
  localWeapons(): Array<{ slot: number; record: NetRecord }> {
    const out: Array<{ slot: number; record: NetRecord }> = [];
    if (this.localEntity < 0) return out;
    for (let slot = 0; slot < 8; slot++) {
      const s = this.entity(weaponKey(this.localEntity, slot));
      if (s) out.push({ slot, record: this.record(s) });
    }
    return out;
  }

  /** Every world entity (not rules or weapons) in the newest frame. */
  forEachEntity(fn: (state: EntityState, record: NetRecord) => void): void {
    const f = this.latest;
    if (!f) return;
    for (const s of f.states) if (keyKind(s.key) === 'entity') fn(s, this.record(s));
  }

  /** Forget everything (new match / new player). */
  reset(): void {
    this.frames.length = 0;
    this.latest = null;
    this.localEntity = -1;
    this.ackCmd = 0;
    this.roster.clear();
    this.scores.clear();
  }
}
