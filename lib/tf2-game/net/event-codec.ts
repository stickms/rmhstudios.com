/**
 * Simulation events on the wire (sim/events.ts → the client's HUD, audio and
 * effects): the SDK's game events (IGameEvent), temp entities and EmitSound,
 * reduced to one self-describing codec so that a module that adds an event
 * type needs no change here.
 *
 * An event is its `type` and its own keys, each key and every identifier-like
 * string value sent as a string-table id (string-table.ts), numbers as zigzag
 * varints when whole and float32 otherwise, `{x, y, z}` vectors as bit coords
 * (1/32 unit) or float32 when out of coord range. Recipient keys never go on
 * the wire: the server applies them per client (`eventVisibleTo`).
 *
 * Delivery classes:
 *   - reliable (the default): batched per tick on `tf2:events`;
 *   - cosmetic (sounds that start, effects, and anything registered with
 *     `registerCosmeticEvent`): ride the next snapshot, so a dropped snapshot
 *     loses them rather than delaying everything behind it.
 */

import type { SimEvent } from '../sim/events';
import { BitReader, BitWriter, MAX_COORD } from './bitbuf';
import { isInternable } from './string-table';

// ─── Delivery and recipients ───────────────────────────────────────────────

/** Event types whose `team` key is a recipient filter (sim/events.ts Recipients) rather than data. */
const TEAM_FILTERED = new Set<string>(['sound', 'damage', 'hud', 'chat']);
const COSMETIC = new Set<string>(['sound', 'effect']);

/** Declares that `type`'s `team` key restricts delivery to that team (instead of being event data). */
export function registerTeamFilteredEvent(type: string): void {
  TEAM_FILTERED.add(type);
}

/** Declares `type` cosmetic: delivered unreliably inside snapshots. */
export function registerCosmeticEvent(type: string): void {
  COSMETIC.add(type);
}

type AnyEvent = SimEvent | ({ type: string } & Record<string, unknown>);

export function eventIsCosmetic(ev: AnyEvent): boolean {
  if (!COSMETIC.has(ev.type)) return false;
  // Stopping a loop must arrive, or the loop plays forever.
  return !(ev.type === 'sound' && (ev as { stop?: boolean }).stop === true);
}

/** Whether a player (entity id, team) receives `ev` (sim/events.ts Recipients). */
export function eventVisibleTo(ev: AnyEvent, entityId: number, team: number): boolean {
  const r = ev as { to?: number; notTo?: number; team?: number };
  if (typeof r.to === 'number' && r.to !== entityId) return false;
  if (typeof r.notTo === 'number' && r.notTo === entityId) return false;
  if (TEAM_FILTERED.has(ev.type) && typeof r.team === 'number' && r.team !== team) return false;
  return true;
}

function skipKey(type: string, key: string): boolean {
  return (
    key === 'type' || key === 'to' || key === 'notTo' || (key === 'team' && TEAM_FILTERED.has(type))
  );
}

// ─── Values ────────────────────────────────────────────────────────────────

const T_FALSE = 0;
const T_TRUE = 1;
const T_INT = 2;
const T_F32 = 3;
const T_STR_ID = 4;
const T_STR_INLINE = 5;
const T_VEC_COORD = 6;
const T_VEC_F32 = 7;
const T_ARRAY = 8;
const T_OBJECT = 9;
const T_NULL = 10;
const TAG_BITS = 4;

const MAX_DEPTH = 4;
const MAX_ITEMS = 256;
const MAX_INLINE = 512;

/** Interns strings while encoding; collects the ids used so the caller can send their definitions. */
export interface StringRefs {
  /** The id for `s`, or -1 to write it inline. */
  idFor(s: string): number;
}

const isVec = (v: object): v is { x: number; y: number; z: number } => {
  const o = v as Record<string, unknown>;
  return (
    typeof o.x === 'number' &&
    typeof o.y === 'number' &&
    typeof o.z === 'number' &&
    Object.keys(o).length === 3
  );
};

function writeStr(w: BitWriter, s: string, refs: StringRefs, used: number[]): void {
  const id = isInternable(s) ? refs.idFor(s) : -1;
  if (id >= 0) {
    w.writeBits(T_STR_ID, TAG_BITS);
    w.writeVarUint(id);
    if (id > 0) used.push(id);
  } else {
    w.writeBits(T_STR_INLINE, TAG_BITS);
    w.writeString(s, MAX_INLINE);
  }
}

function writeValue(
  w: BitWriter,
  v: unknown,
  refs: StringRefs,
  used: number[],
  depth: number,
): void {
  if (v === null || v === undefined) {
    w.writeBits(T_NULL, TAG_BITS);
    return;
  }
  switch (typeof v) {
    case 'boolean':
      w.writeBits(v ? T_TRUE : T_FALSE, TAG_BITS);
      return;
    case 'number':
      if (Number.isInteger(v) && Math.abs(v) <= 0x7fffffff) {
        w.writeBits(T_INT, TAG_BITS);
        w.writeVarInt(v);
      } else {
        w.writeBits(T_F32, TAG_BITS);
        w.writeFloat32(Number.isFinite(v) ? v : 0);
      }
      return;
    case 'string':
      writeStr(w, v, refs, used);
      return;
    case 'object': {
      if (depth >= MAX_DEPTH) {
        w.writeBits(T_NULL, TAG_BITS);
        return;
      }
      if (Array.isArray(v)) {
        const n = Math.min(v.length, MAX_ITEMS);
        w.writeBits(T_ARRAY, TAG_BITS);
        w.writeVarUint(n);
        for (let i = 0; i < n; i++) writeValue(w, v[i], refs, used, depth + 1);
        return;
      }
      if (isVec(v)) {
        const inRange =
          Math.abs(v.x) < MAX_COORD && Math.abs(v.y) < MAX_COORD && Math.abs(v.z) < MAX_COORD;
        if (inRange) {
          w.writeBits(T_VEC_COORD, TAG_BITS);
          w.writeCoord(v.x);
          w.writeCoord(v.y);
          w.writeCoord(v.z);
        } else {
          w.writeBits(T_VEC_F32, TAG_BITS);
          w.writeFloat32(v.x);
          w.writeFloat32(v.y);
          w.writeFloat32(v.z);
        }
        return;
      }
      w.writeBits(T_OBJECT, TAG_BITS);
      writeObject(w, v as Record<string, unknown>, refs, used, depth + 1, null);
      return;
    }
    default:
      w.writeBits(T_NULL, TAG_BITS);
  }
}

function writeKey(w: BitWriter, key: string, refs: StringRefs, used: number[]): void {
  const id = refs.idFor(key);
  if (id > 0) {
    w.writeBit(true);
    w.writeVarUint(id);
    used.push(id);
  } else {
    w.writeBit(false);
    w.writeString(key, 64);
  }
}

function writeObject(
  w: BitWriter,
  o: Record<string, unknown>,
  refs: StringRefs,
  used: number[],
  depth: number,
  type: string | null,
): void {
  let n = 0;
  for (const k in o) if (o[k] !== undefined && !(type !== null && skipKey(type, k))) n++;
  n = Math.min(n, MAX_ITEMS);
  w.writeVarUint(n);
  let written = 0;
  for (const k in o) {
    if (written >= n) break;
    const v = o[k];
    if (v === undefined || (type !== null && skipKey(type, k))) continue;
    writeKey(w, k, refs, used);
    writeValue(w, v, refs, used, depth);
    written++;
  }
}

/**
 * Encodes one event (without recipients). `used` receives every string id
 * the encoding refers to; the caller must have defined them on the client
 * before the packet carrying this event arrives.
 */
export function writeEvent(w: BitWriter, ev: AnyEvent, refs: StringRefs, used: number[]): void {
  writeKey(w, ev.type, refs, used);
  writeObject(w, ev as Record<string, unknown>, refs, used, 1, ev.type);
}

// ─── Decoding ──────────────────────────────────────────────────────────────

/** Resolves string ids on the client. */
export type StringLookup = (id: number) => string | undefined;

function readKey(r: BitReader, lookup: StringLookup): string {
  if (r.readBit()) return lookup(r.readVarUint()) ?? '';
  return r.readString(64);
}

function readValue(r: BitReader, lookup: StringLookup, depth: number): unknown {
  const tag = r.readBits(TAG_BITS);
  switch (tag) {
    case T_FALSE:
      return false;
    case T_TRUE:
      return true;
    case T_INT:
      return r.readVarInt();
    case T_F32:
      return r.readFloat32();
    case T_STR_ID:
      return lookup(r.readVarUint()) ?? '';
    case T_STR_INLINE:
      return r.readString(MAX_INLINE);
    case T_VEC_COORD:
      return { x: r.readCoord(), y: r.readCoord(), z: r.readCoord() };
    case T_VEC_F32:
      return { x: r.readFloat32(), y: r.readFloat32(), z: r.readFloat32() };
    case T_ARRAY: {
      const n = r.readVarUint();
      if (n > MAX_ITEMS || depth >= MAX_DEPTH) {
        r.overflowed = true;
        return [];
      }
      const out: unknown[] = [];
      for (let i = 0; i < n && !r.overflowed; i++) out.push(readValue(r, lookup, depth + 1));
      return out;
    }
    case T_OBJECT:
      if (depth >= MAX_DEPTH) {
        r.overflowed = true;
        return null;
      }
      return readObject(r, lookup, depth + 1);
    case T_NULL:
      return undefined;
    default:
      r.overflowed = true;
      return undefined;
  }
}

function readObject(r: BitReader, lookup: StringLookup, depth: number): Record<string, unknown> {
  const n = r.readVarUint();
  const out: Record<string, unknown> = {};
  if (n > MAX_ITEMS) {
    r.overflowed = true;
    return out;
  }
  for (let i = 0; i < n && !r.overflowed; i++) {
    const k = readKey(r, lookup);
    const v = readValue(r, lookup, depth);
    if (v !== undefined && k !== '__proto__' && k !== 'constructor' && k !== 'prototype')
      out[k] = v;
  }
  return out;
}

/** Decodes one event. The result has the shape the server's `SimEvent` had, minus recipients. */
export function readEvent(r: BitReader, lookup: StringLookup): SimEvent {
  const type = readKey(r, lookup);
  const body = readObject(r, lookup, 1);
  body.type = type;
  return body as unknown as SimEvent;
}
