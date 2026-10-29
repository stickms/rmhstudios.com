/**
 * The reliable stream (`tf2:events`): one packet per client per tick that has
 * something to say, delivered in order and never dropped while the socket
 * lives (the SDK's reliable netchannel stream: string table updates, game
 * events, server info, user info).
 *
 * Layout: u8 RELIABLE_TAG · varuint tick · per message: bit 1 · u4 kind ·
 * body; then bit 0.
 *
 *   STRING      varuint id · string — a string-table definition
 *   EVENT       an event (event-codec.ts); it happened on the packet's tick
 *   HELLO       varuint localEntity + 1 · map · mode · u8 maxPlayers ·
 *               varuint seed · name · u8 snapshotInterval (ticks)
 *   PLAYER      varuint entity · bit present · [name · bit bot]
 *   SCORES      varuint n · n × (varuint entity · varint score · varuint
 *               kills · varuint deaths · varuint assists · varuint pingMs)
 *
 * Definitions precede the messages that use them in the same packet, and a
 * snapshot that uses a new string is always queued after the reliable packet
 * that defines it, so the client never sees an unknown id.
 */

import type { SimEvent } from '../sim/events';
import { BitReader, BitWriter } from './bitbuf';
import { readEvent } from './event-codec';
import type { ClientStringTable } from './string-table';

export const RELIABLE_TAG = 0x52;

export const MSG_STRING = 1;
export const MSG_EVENT = 2;
export const MSG_HELLO = 3;
export const MSG_PLAYER = 4;
export const MSG_SCORES = 5;

export interface HelloMessage {
  kind: 'hello';
  /** The client's player entity id (−1 before it has one). */
  localEntity: number;
  map: string;
  mode: string;
  maxPlayers: number;
  /** The match seed (core/random.ts streams; a predicting client builds its world with it). */
  seed: number;
  name: string;
  /** Ticks between snapshots (2 = 33 Hz). */
  snapshotInterval: number;
}

export interface PlayerInfoMessage {
  kind: 'player';
  entity: number;
  /** False when the player left. */
  present: boolean;
  name: string;
  bot: boolean;
}

export interface ScoreRow {
  entity: number;
  score: number;
  kills: number;
  deaths: number;
  assists: number;
  pingMs: number;
}

export type ReliableMessage =
  | { kind: 'string'; id: number; value: string }
  | { kind: 'event'; event: SimEvent }
  | HelloMessage
  | PlayerInfoMessage
  | { kind: 'scores'; rows: ScoreRow[] };

export interface DecodedReliable {
  tick: number;
  messages: ReliableMessage[];
}

/** Builds one reliable packet. */
export class ReliableWriter {
  private readonly w = new BitWriter(256);
  private count = 0;

  begin(tick: number): this {
    this.w.reset(0);
    this.count = 0;
    this.w.writeU8(RELIABLE_TAG);
    this.w.writeVarUint(tick);
    return this;
  }

  get empty(): boolean {
    return this.count === 0;
  }

  private head(kind: number): BitWriter {
    this.count++;
    this.w.writeBit(true);
    this.w.writeBits(kind, 4);
    return this.w;
  }

  string(id: number, value: string): void {
    const w = this.head(MSG_STRING);
    w.writeVarUint(id);
    w.writeString(value, 256);
  }

  /** A pre-encoded event (event-codec writeEvent). */
  event(bytes: Uint8Array, bitLength: number): void {
    this.head(MSG_EVENT).writeBitsFrom(bytes, bitLength);
  }

  hello(h: Omit<HelloMessage, 'kind'>): void {
    const w = this.head(MSG_HELLO);
    w.writeVarUint(h.localEntity + 1);
    w.writeString(h.map, 64);
    w.writeString(h.mode, 16);
    w.writeU8(h.maxPlayers);
    w.writeVarUint(h.seed >>> 0);
    w.writeString(h.name, 128);
    w.writeU8(h.snapshotInterval);
  }

  player(p: Omit<PlayerInfoMessage, 'kind'>): void {
    const w = this.head(MSG_PLAYER);
    w.writeVarUint(p.entity);
    w.writeBit(p.present);
    if (p.present) {
      w.writeString(p.name, 128);
      w.writeBit(p.bot);
    }
  }

  scores(rows: readonly ScoreRow[]): void {
    const w = this.head(MSG_SCORES);
    w.writeVarUint(rows.length);
    for (const r of rows) {
      w.writeVarUint(r.entity);
      w.writeVarInt(r.score);
      w.writeVarUint(r.kills);
      w.writeVarUint(r.deaths);
      w.writeVarUint(r.assists);
      w.writeVarUint(Math.min(9999, Math.max(0, Math.round(r.pingMs))));
    }
  }

  /** Finishes the packet; null when it carries no message. */
  finish(): Uint8Array | null {
    if (this.count === 0) return null;
    this.w.writeBit(false);
    return this.w.toBytes();
  }
}

/**
 * Decodes a reliable packet, applying string definitions to `table` as it
 * goes (later messages in the same packet use them). Null when malformed.
 */
export function decodeReliable(
  bytes: Uint8Array,
  table: ClientStringTable,
): DecodedReliable | null {
  const r = new BitReader(bytes);
  if (r.readU8() !== RELIABLE_TAG) return null;
  const tick = r.readVarUint();
  const messages: ReliableMessage[] = [];
  const lookup = (id: number) => table.get(id);
  let guard = 0;
  while (r.readBit()) {
    if (++guard > 100_000 || r.overflowed) return null;
    const kind = r.readBits(4);
    switch (kind) {
      case MSG_STRING: {
        const id = r.readVarUint();
        const value = r.readString(256);
        table.define(id, value);
        messages.push({ kind: 'string', id, value });
        break;
      }
      case MSG_EVENT:
        messages.push({ kind: 'event', event: readEvent(r, lookup) });
        break;
      case MSG_HELLO:
        messages.push({
          kind: 'hello',
          localEntity: r.readVarUint() - 1,
          map: r.readString(64),
          mode: r.readString(16),
          maxPlayers: r.readU8(),
          seed: r.readVarUint(),
          name: r.readString(128),
          snapshotInterval: r.readU8(),
        });
        break;
      case MSG_PLAYER: {
        const entity = r.readVarUint();
        const present = r.readBit();
        const name = present ? r.readString(128) : '';
        const bot = present ? r.readBit() : false;
        messages.push({ kind: 'player', entity, present, name, bot });
        break;
      }
      case MSG_SCORES: {
        const n = r.readVarUint();
        if (n > 64) return null;
        const rows: ScoreRow[] = [];
        for (let i = 0; i < n; i++) {
          rows.push({
            entity: r.readVarUint(),
            score: r.readVarInt(),
            kills: r.readVarUint(),
            deaths: r.readVarUint(),
            assists: r.readVarUint(),
            pingMs: r.readVarUint(),
          });
        }
        messages.push({ kind: 'scores', rows });
        break;
      }
      default:
        return null;
    }
  }
  if (r.overflowed) return null;
  return { tick, messages };
}
