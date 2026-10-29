/**
 * Entity snapshots: the server's view of the world per client, delta-encoded
 * against the last snapshot that client acknowledged (the SDK's
 * SV_WriteEntitiesToClient / CBaseServer::WriteDeltaEntities, with
 * CClientFrame as the per-client history and the PackedEntity data as the
 * canonical field values).
 *
 * Fully schema-driven (sim/net-schema.ts): every networked entity is a key,
 * a serial, a schema and an array of field values; nothing here knows what a
 * rocket or a sentry is, so modules that register new schemas need no change.
 *
 * ## Keys
 *   - 0: the game rules (NET_RULES; CTFGameRulesProxy);
 *   - 1…: world entity ids (players are 1…MAX_PLAYERS);
 *   - WEAPON_KEY_BASE + player × 8 + slot: a player's weapons (NET_WEAPON),
 *     sent only to their owner (the SDK's SendProxy_SendLocalWeaponDataTable —
 *     other clients render the player record's `activeWeapon`).
 *
 * ## Views
 * A client sees an entity either as its owner (private fields included;
 * `coord` and `f32` values exact, so prediction restarts from the server's
 * numbers — DT_TFLocalPlayerExclusive sends the local origin unquantized) or
 * publicly (private fields absent; coords at 1/32 unit, f32 as float32).
 * Values are compared in their canonical (decoded) form, so a change below
 * wire precision is never sent.
 *
 * ## Wire format (bits LSB first, bitbuf.ts)
 *   u8 SNAPSHOT_TAG · varuint tick · varuint baseTick (0 = from nothing) ·
 *   varuint localEntity + 1 · varuint ackCmd ·
 *   varuint eventCount · per event: varuint (tick − eventTick), event (event-codec.ts) ·
 *   per entity op: bit 1 · varuint key · u2 op
 *     0 update: field changes against the baseline
 *     1 create: varuint serial · varuint schemaId · bit ownerView · field changes against zero
 *     2 remove
 *   bit 0 (end).
 *   Field changes: per changed visible field, ascending: bit 1 · (bit 0 = next
 *   field | bit 1 + varuint skip) · value; then bit 0.
 *   Values: bool 1 bit · i8/u8 8 bits · i16/i32 zigzag varint · u16/u32 varuint ·
 *   angle8/angle16 8/16 bits · coord: bitcoord 1/32 (public) or the f32 form
 *   (owner) · f32: u2 tag 0 zero | 1 zigzag varint | 2 float32 | 3 float64
 *   (float64 only in the owner view) · str: bit 1 + varuint table id | bit 0 + inline.
 *
 * ## Budget
 * A snapshot is capped at `SNAPSHOT_MAX_BYTES`. Removes go first, then the
 * client's own entities and the rules, then everything else by distance from
 * the viewer divided by how long the entity has waited (Source's packet entity
 * priority). What does not fit stays at the client's baseline state and is
 * sent next time; cosmetic events get at most `EVENT_BUDGET_BYTES`.
 *
 * Environment-agnostic.
 */

import { visTest, decompressVis, findLeaf, type BspFile } from '../formats/bsp';
import type { Vec3 } from '../core/vec';
import type { SimEvent } from '../sim/events';
import { Entity } from '../sim/entity';
import type { GameWorld } from '../sim/world';
import type { Player } from '../sim/player';
import { WEAPON_SLOTS } from '../sim/weapon-api';
import {
  NET_RULES,
  NET_WEAPON,
  createNetRecord,
  netSchemaById,
  type NetFieldDef,
  type NetFieldKind,
  type NetRecord,
  type NetSchema,
  type NetValue,
} from '../sim/net-schema';
import { BitReader, BitWriter, MAX_COORD, quantizeAngle, quantizeCoord } from './bitbuf';
import { readEvent, type StringLookup, type StringRefs } from './event-codec';
import { type ClientStringKnowledge, type ServerStringTable } from './string-table';

export const SNAPSHOT_TAG = 0x53;
/** Hard cap on one snapshot (an MTU-sized packet, as Source keeps them). */
export const SNAPSHOT_MAX_BYTES = 1400;
/** Cap for the cosmetic events inside a snapshot; the rest are dropped. */
export const EVENT_BUDGET_BYTES = 320;
/** Sent frames kept per client: the delta baseline must be one of these (CClientFrameManager). */
export const SNAPSHOT_HISTORY = 64;
/** Within this distance an entity is sent even when the PVS says it is hidden. */
export const PVS_NEAR_DISTANCE = 512;

export const RULES_KEY = 0;
export const WEAPON_KEY_BASE = 1 << 20;
export const weaponKey = (playerId: number, slot: number): number =>
  WEAPON_KEY_BASE + playerId * 8 + slot;

export type EntityKeyKind = 'rules' | 'entity' | 'weapon';
export function keyKind(key: number): EntityKeyKind {
  return key === RULES_KEY ? 'rules' : key >= WEAPON_KEY_BASE ? 'weapon' : 'entity';
}
/** The owning player of a weapon key. */
export const weaponKeyOwner = (key: number): number => Math.floor((key - WEAPON_KEY_BASE) / 8);
export const weaponKeySlot = (key: number): number => (key - WEAPON_KEY_BASE) % 8;

// ─── Always-transmitted classes ─────────────────────────────────────────────

/**
 * Classnames sent regardless of the PVS (FL_EDICT_ALWAYS in the SDK): the
 * objectives a HUD tracks. Players, brush entities and schemas 192–255 (map
 * entities and modes) are always sent too.
 */
const ALWAYS_CLASSNAMES = new Set<string>([
  'item_teamflag',
  'team_control_point',
  'team_control_point_master',
  'team_control_point_round',
  'trigger_capture_area',
  'team_round_timer',
  'team_train_watcher',
  'mapobj_cart_dispenser',
  'func_tracktrain',
  'tf_objective_resource',
  'tf_logic_koth',
  'tf_logic_arena',
  'func_capturezone',
  'func_respawnroomvisualizer',
]);

/** Marks a classname always-transmitted (a module whose entity a HUD must always see). */
export function registerAlwaysTransmit(classname: string): void {
  ALWAYS_CLASSNAMES.add(classname.toLowerCase());
}

// ─── Field values ───────────────────────────────────────────────────────────

const INT_RANGES: Partial<Record<NetFieldKind, [number, number]>> = {
  i8: [-128, 127],
  u8: [0, 255],
  i16: [-32768, 32767],
  u16: [0, 65535],
  i32: [-2147483648, 2147483647],
  u32: [0, 4294967295],
};

function num(v: NetValue | undefined): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

const isWholeVarint = (v: number): boolean => Number.isInteger(v) && Math.abs(v) <= 0x3fffffff;

/** The f32 wire form's decoded value. */
function canonF32(v: number, exact: boolean): number {
  if (v === 0 || isWholeVarint(v)) return v === 0 ? 0 : v;
  return exact ? v : Math.fround(v) || 0;
}

/** The value `kind` decodes to after a round trip (what the client will hold). */
export function canonicalValue(
  kind: NetFieldKind,
  v: NetValue | undefined,
  exact: boolean,
): NetValue {
  switch (kind) {
    case 'bool':
      return !!v;
    case 'str':
      return clampUtf8(typeof v === 'string' ? v : v === undefined ? '' : String(v), MAX_STR_BYTES);
    case 'f32':
      return canonF32(num(v), exact);
    case 'coord': {
      const n = num(v);
      return exact ? canonF32(n, true) : quantizeCoord(n) || 0;
    }
    case 'angle8':
      return quantizeAngle(num(v), 8) || 0;
    case 'angle16':
      return quantizeAngle(num(v), 16) || 0;
    default: {
      const [lo, hi] = INT_RANGES[kind] ?? [-2147483648, 2147483647];
      const n = Math.round(num(v)) || 0;
      return n < lo ? lo : n > hi ? hi : n;
    }
  }
}

/** Longest string field value on the wire (UTF-8 bytes). */
export const MAX_STR_BYTES = 255;
const utf8 = new TextEncoder();

/** Cuts a string to at most `max` UTF-8 bytes on a character boundary. */
function clampUtf8(s: string, max: number): string {
  if (s.length * 3 <= max) return s;
  if (utf8.encode(s).length <= max) return s;
  let out = '';
  let bytes = 0;
  for (const ch of s) {
    const n = utf8.encode(ch).length;
    if (bytes + n > max) break;
    out += ch;
    bytes += n;
  }
  return out;
}

const zeroOf = (kind: NetFieldKind): NetValue =>
  kind === 'str' ? '' : kind === 'bool' ? false : 0;

function writeF32(w: BitWriter, v: number, exact: boolean): void {
  if (v === 0) w.writeBits(0, 2);
  else if (isWholeVarint(v)) {
    w.writeBits(1, 2);
    w.writeVarInt(v);
  } else if (!exact || Math.fround(v) === v) {
    w.writeBits(2, 2);
    w.writeFloat32(v);
  } else {
    w.writeBits(3, 2);
    w.writeFloat64(v);
  }
}

function readF32(r: BitReader): number {
  switch (r.readBits(2)) {
    case 0:
      return 0;
    case 1:
      return r.readVarInt();
    case 2:
      return r.readFloat32();
    default:
      return r.readFloat64();
  }
}

/** Encodes a canonical value. `strings`/`used` intern str fields (see event-codec StringRefs). */
export function writeFieldValue(
  w: BitWriter,
  kind: NetFieldKind,
  v: NetValue,
  exact: boolean,
  strings: StringRefs,
  used: number[],
): void {
  switch (kind) {
    case 'bool':
      w.writeBit(!!v);
      return;
    case 'i8':
    case 'u8':
      w.writeBits(num(v) & 0xff, 8);
      return;
    case 'i16':
    case 'i32':
      w.writeVarInt(num(v));
      return;
    case 'u16':
    case 'u32':
      w.writeVarUint(num(v));
      return;
    case 'angle8':
      w.writeAngle(num(v), 8);
      return;
    case 'angle16':
      w.writeAngle(num(v), 16);
      return;
    case 'coord':
      if (exact) writeF32(w, num(v), true);
      else w.writeCoord(num(v));
      return;
    case 'f32':
      writeF32(w, num(v), exact);
      return;
    case 'str': {
      const s = typeof v === 'string' ? v : '';
      const id = strings.idFor(s);
      if (id >= 0) {
        w.writeBit(true);
        w.writeVarUint(id);
        if (id > 0) used.push(id);
      } else {
        w.writeBit(false);
        w.writeString(s, MAX_STR_BYTES);
      }
      return;
    }
  }
}

export function readFieldValue(
  r: BitReader,
  kind: NetFieldKind,
  exact: boolean,
  lookup: StringLookup,
): NetValue {
  switch (kind) {
    case 'bool':
      return r.readBit();
    case 'i8': {
      const b = r.readBits(8);
      return b > 127 ? b - 256 : b;
    }
    case 'u8':
      return r.readBits(8);
    case 'i16':
    case 'i32':
      return r.readVarInt();
    case 'u16':
    case 'u32':
      return r.readVarUint();
    case 'angle8':
      return r.readAngle(8);
    case 'angle16':
      return r.readAngle(16);
    case 'coord':
      return exact ? readF32(r) : r.readCoord();
    case 'f32':
      return readF32(r);
    case 'str':
      if (r.readBit()) return lookup(r.readVarUint()) ?? '';
      return r.readString(MAX_STR_BYTES);
  }
}

// ─── Entity states and frames ───────────────────────────────────────────────

/** One entity as a client holds it (immutable; shared between frames while unchanged). */
export interface EntityState {
  readonly key: number;
  readonly serial: number;
  readonly schema: NetSchema;
  /** Seen as its owner (private fields present, exact numbers). */
  readonly owner: boolean;
  readonly values: readonly NetValue[];
}

/** A client's whole mirror at one tick, sorted by key. */
export interface SnapshotFrame {
  readonly tick: number;
  readonly keys: readonly number[];
  readonly states: readonly EntityState[];
}

export const EMPTY_FRAME: SnapshotFrame = { tick: 0, keys: [], states: [] };

const fieldVisible = (f: NetFieldDef, owner: boolean): boolean => owner || !f.private;

/** A frame's entity by key (binary search). */
export function frameGet(frame: SnapshotFrame, key: number): EntityState | null {
  let lo = 0;
  let hi = frame.keys.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const k = frame.keys[mid];
    if (k === key) return frame.states[mid];
    if (k < key) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

/** Materializes a state as a NetRecord (field name → value). */
export function stateToRecord(state: EntityState, out: NetRecord = {}): NetRecord {
  const fields = state.schema.fields;
  for (let i = 0; i < fields.length; i++) out[fields[i].name] = state.values[i];
  return out;
}

const hasPrivate = new WeakMap<NetSchema, boolean>();
function schemaHasPrivate(s: NetSchema): boolean {
  let v = hasPrivate.get(s);
  if (v === undefined) {
    v = s.fields.some((f) => f.private);
    hasPrivate.set(s, v);
  }
  return v;
}

// ─── Capture (server) ───────────────────────────────────────────────────────

/** One entity in a captured world frame. */
export interface CapturedEntity {
  readonly key: number;
  readonly serial: number;
  readonly schema: NetSchema;
  /** The player whose client sees the owner view; -1 for none. */
  readonly ownerId: number;
  /** Only the owner receives it (weapons). */
  readonly ownerOnly: boolean;
  /**
   * Per-viewer transmit filter (Entity.shouldTransmitTo, the SDK's
   * ShouldTransmit) when the entity overrides it; null = everyone.
   */
  readonly transmit: ((playerId: number) => boolean) | null;
  /** Public canonical values (private fields at zero). */
  readonly pub: readonly NetValue[];
  /** Owner canonical values, when the schema has private fields and there is an owner. */
  readonly own: readonly NetValue[] | null;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Ignore the PVS. */
  readonly always: boolean;
  /** BSP cluster of the entity's centre (−1 unknown). */
  readonly cluster: number;
  /** The live entity, for callers that need more (null for virtual entries). */
  readonly entity: Entity | null;
}

export interface CapturedFrame {
  readonly tick: number;
  /** Sorted by key. */
  readonly list: readonly CapturedEntity[];
}

/**
 * Turns a GameWorld into a CapturedFrame each snapshot tick: every networked
 * entity's record (writeNet), canonicalized per view, with unchanged arrays
 * reused from the previous capture so per-client deltas compare by reference.
 */
export class WorldCapture {
  private readonly records = new Map<NetSchema, NetRecord>();
  private prev = new Map<number, CapturedEntity>();
  private readonly pvs: PvsCuller | null;

  constructor(bsp: BspFile | null) {
    this.pvs = bsp && bsp.visibility && bsp.visibility.numClusters > 0 ? new PvsCuller(bsp) : null;
  }

  get culler(): PvsCuller | null {
    return this.pvs;
  }

  private record(schema: NetSchema): NetRecord {
    let r = this.records.get(schema);
    if (!r) {
      r = createNetRecord(schema);
      this.records.set(schema, r);
    }
    const fields = schema.fields;
    for (let i = 0; i < fields.length; i++) r[fields[i].name] = zeroOf(fields[i].kind);
    return r;
  }

  capture(world: GameWorld, tick: number): CapturedFrame {
    const list: CapturedEntity[] = [];
    const next = new Map<number, CapturedEntity>();
    const add = (
      key: number,
      serial: number,
      schema: NetSchema,
      rec: NetRecord,
      ownerId: number,
      ownerOnly: boolean,
      pos: Vec3 | null,
      always: boolean,
      entity: Entity | null,
    ) => {
      const old = this.prev.get(key);
      const same = old && old.serial === serial && old.schema === schema ? old : null;
      const pub = canonArray(schema, rec, false, same ? same.pub : null);
      const own =
        ownerId >= 0 && schemaHasPrivate(schema)
          ? canonArray(schema, rec, true, same ? same.own : null)
          : null;
      const x = pos ? pos.x : 0;
      const y = pos ? pos.y : 0;
      const z = pos ? pos.z : 0;
      const cluster =
        always || !this.pvs || !pos
          ? -1
          : same && same.x === x && same.y === y && same.z === z
            ? same.cluster
            : this.pvs.clusterAt(x, y, z);
      const filtered =
        entity && entity.shouldTransmitTo !== Entity.prototype.shouldTransmitTo ? entity : null;
      const c: CapturedEntity = {
        key,
        serial,
        schema,
        ownerId,
        ownerOnly,
        transmit: filtered ? (id: number) => filtered.shouldTransmitTo(id) : null,
        pub,
        own,
        x,
        y,
        z,
        always,
        cluster,
        entity,
      };
      list.push(c);
      next.set(key, c);
    };

    // The rules (key 0).
    const rr = this.record(NET_RULES);
    world.rules.writeNet(rr);
    add(RULES_KEY, 1, NET_RULES, rr, -1, false, null, true, null);

    const center = { x: 0, y: 0, z: 0 };
    const weaponPlayers: Player[] = [];
    world.forEachNetEntity((e, schema) => {
      if (e.id === RULES_KEY || e.id >= WEAPON_KEY_BASE) return;
      const rec = this.record(schema);
      e.writeNet(rec);
      const isPlayer = e.isPlayer();
      const ownerId = isPlayer ? e.id : world.isPlayerId(e.owner) ? e.owner : -1;
      e.worldSpaceCenter(center);
      const always =
        isPlayer ||
        e.bspModel > 0 ||
        (schema.id >= 192 && schema.id < 256) ||
        ALWAYS_CLASSNAMES.has(e.classname);
      add(e.id, e.serial, schema, rec, ownerId, false, center, always, e);
      if (isPlayer) weaponPlayers.push(e as Player);
    });

    // Weapons, owner-only, after every entity key (their keys are larger).
    for (const p of weaponPlayers) {
      for (let slot = 0; slot < WEAPON_SLOTS; slot++) {
        const w = p.weapons[slot];
        if (!w) continue;
        const rec = this.record(NET_WEAPON);
        w.writeNet(rec);
        // A new weapon object in the slot is a new serial (defindex change re-creates it).
        add(
          weaponKey(p.id, slot),
          1 + (Math.abs(w.defindex) % 0x7fff),
          NET_WEAPON,
          rec,
          p.id,
          true,
          p.origin,
          true,
          null,
        );
      }
    }
    list.sort((a, b) => a.key - b.key);
    this.prev = next;
    return { tick, list };
  }
}

/** A CapturedEntity from a bare record (tests, and hosts that network something that is not a world entity). */
export function captureRecord(
  key: number,
  serial: number,
  schema: NetSchema,
  rec: NetRecord,
  opts: {
    ownerId?: number;
    ownerOnly?: boolean;
    transmit?: ((playerId: number) => boolean) | null;
    pos?: Vec3;
    always?: boolean;
    cluster?: number;
  } = {},
): CapturedEntity {
  const ownerId = opts.ownerId ?? -1;
  return {
    key,
    serial,
    schema,
    ownerId,
    ownerOnly: opts.ownerOnly ?? false,
    transmit: opts.transmit ?? null,
    pub: canonArray(schema, rec, false, null),
    own: ownerId >= 0 && schemaHasPrivate(schema) ? canonArray(schema, rec, true, null) : null,
    x: opts.pos?.x ?? 0,
    y: opts.pos?.y ?? 0,
    z: opts.pos?.z ?? 0,
    always: opts.always ?? true,
    cluster: opts.cluster ?? -1,
    entity: null,
  };
}

function canonArray(
  schema: NetSchema,
  rec: NetRecord,
  exact: boolean,
  prev: readonly NetValue[] | null,
): readonly NetValue[] {
  const fields = schema.fields;
  const out: NetValue[] = new Array<NetValue>(fields.length);
  let same = prev !== null && prev.length === fields.length;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const v = !exact && f.private ? zeroOf(f.kind) : canonicalValue(f.kind, rec[f.name], exact);
    out[i] = v;
    if (same && prev![i] !== v) same = false;
  }
  return same ? prev! : out;
}

// ─── PVS ────────────────────────────────────────────────────────────────────

/** BSP potentially-visible-set tests (CM_ClusterPVS + the leaf lookup). */
export class PvsCuller {
  private readonly rows = new Map<number, Uint8Array>();
  private readonly p = { x: 0, y: 0, z: 0 };

  constructor(private readonly bsp: BspFile) {}

  clusterAt(x: number, y: number, z: number): number {
    this.p.x = x;
    this.p.y = y;
    this.p.z = z;
    const leaf = findLeaf(this.bsp, this.p);
    return leaf >= 0 && leaf < this.bsp.leafs.cluster.length ? this.bsp.leafs.cluster[leaf] : -1;
  }

  /** The decompressed PVS row for a cluster (cached). */
  row(cluster: number): Uint8Array | null {
    if (cluster < 0 || !this.bsp.visibility) return null;
    let r = this.rows.get(cluster);
    if (!r) {
      r = decompressVis(this.bsp.visibility, cluster, 0);
      this.rows.set(cluster, r);
    }
    return r;
  }
}

// ─── Per-client encoding (server) ───────────────────────────────────────────

/** Who a snapshot is for. */
export interface SnapshotViewer {
  /** The client's player entity id (−1 before it has one). */
  entityId: number;
  /** Eye position for the PVS and priorities; null = everything visible. */
  eye: Vec3 | null;
}

/** A pre-encoded event waiting for a snapshot (cosmetic) or reliable packet. */
export interface EncodedEvent {
  readonly tick: number;
  readonly bytes: Uint8Array;
  readonly bitLength: number;
  /** String ids it uses (definitions must reach the client first). */
  readonly strings: readonly number[];
  readonly event: SimEvent;
}

/** The server's per-client snapshot bookkeeping (CClientFrameManager + entity priorities). */
export class ClientSnapshotState {
  /** Frames sent, oldest first (pruned below the ack). */
  readonly frames: SnapshotFrame[] = [];
  /** Newest snapshot tick the client acknowledged. */
  ackTick = 0;
  /** Cosmetic events for the next snapshot. */
  pendingEvents: EncodedEvent[] = [];
  /** Tick each entity was last written (priority starvation). */
  readonly lastSent = new Map<number, number>();
  /** Bytes sent in snapshots (stats). */
  bytesSent = 0;
  snapshotsSent = 0;
  fullSnapshots = 0;

  constructor(readonly strings: ClientStringKnowledge) {}

  /** Records an ack from an input packet (acks only move forward). */
  acknowledge(tick: number): void {
    if (tick <= this.ackTick) return;
    if (!this.frames.some((f) => f.tick === tick)) return;
    this.ackTick = tick;
    // Frames older than the ack can never be a baseline again.
    while (this.frames.length > 0 && this.frames[0].tick < tick) this.frames.shift();
  }

  baseline(): SnapshotFrame | null {
    if (this.ackTick <= 0) return null;
    for (const f of this.frames) if (f.tick === this.ackTick) return f;
    return null;
  }

  pushFrame(frame: SnapshotFrame): void {
    this.frames.push(frame);
    while (this.frames.length > SNAPSHOT_HISTORY) this.frames.shift();
  }

  /** Forget everything (rejoin): the next snapshot is full. */
  reset(): void {
    this.frames.length = 0;
    this.ackTick = 0;
    this.pendingEvents = [];
    this.lastSent.clear();
  }
}

interface Op {
  kind: 0 | 1 | 2;
  key: number;
  target: EntityState | null;
  base: EntityState | null;
  prio: number;
}

const OP_UPDATE = 0;
const OP_CREATE = 1;
const OP_REMOVE = 2;

/** Writes the changed visible fields of `values` against `base` (null = zero record). Returns the count. */
function writeFieldChanges(
  w: BitWriter,
  schema: NetSchema,
  owner: boolean,
  values: readonly NetValue[],
  base: readonly NetValue[] | null,
  strings: StringRefs,
  used: number[],
): number {
  const fields = schema.fields;
  let last = -1;
  let n = 0;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (!fieldVisible(f, owner)) continue;
    const v = values[i];
    const b = base ? base[i] : zeroOf(f.kind);
    if (v === b) continue;
    w.writeBit(true);
    const skip = i - last - 1;
    if (skip === 0) w.writeBit(false);
    else {
      w.writeBit(true);
      w.writeVarUint(skip - 1);
    }
    writeFieldValue(w, f.kind, v, owner, strings, used);
    last = i;
    n++;
  }
  w.writeBit(false);
  return n;
}

export interface EncodeSnapshotParams {
  tick: number;
  /** Last command number the server ran for this client's player. */
  ackCmd: number;
  viewer: SnapshotViewer;
  /** Byte cap (default SNAPSHOT_MAX_BYTES). */
  maxBytes?: number;
}

export interface EncodedSnapshot {
  bytes: Uint8Array;
  /** String ids this snapshot references that the client was not yet sent. */
  newStrings: number[];
  /** True when there was no usable baseline. */
  full: boolean;
  /** Entity ops that did not fit. */
  deferred: number;
}

/**
 * Encodes snapshots. One instance per match: it owns the scratch writers
 * and the match's string table.
 */
export class SnapshotEncoder {
  private readonly w = new BitWriter(2048);
  private readonly ev = new BitWriter(512);
  private readonly used: number[] = [];
  private readonly refs: StringRefs;

  constructor(readonly table: ServerStringTable) {
    this.refs = { idFor: (s: string) => table.idFor(s) };
  }

  encode(
    client: ClientSnapshotState,
    captured: CapturedFrame,
    culler: PvsCuller | null,
    p: EncodeSnapshotParams,
  ): EncodedSnapshot {
    const maxBytes = p.maxBytes ?? SNAPSHOT_MAX_BYTES;
    const w = this.w.reset(maxBytes);
    const used = this.used;
    used.length = 0;
    const base = client.baseline();
    const baseFrame = base ?? EMPTY_FRAME;
    const viewer = p.viewer;
    const me = viewer.entityId;

    w.writeU8(SNAPSHOT_TAG);
    w.writeVarUint(p.tick);
    w.writeVarUint(base ? base.tick : 0);
    w.writeVarUint(me + 1);
    w.writeVarUint(p.ackCmd);

    // Cosmetic events (dropped beyond their budget).
    const evw = this.ev.reset(EVENT_BUDGET_BYTES);
    let evCount = 0;
    for (const e of client.pendingEvents) {
      const mark = evw.mark();
      evw.writeVarUint(Math.max(0, p.tick - e.tick));
      evw.writeBitsFrom(e.bytes, e.bitLength);
      if (evw.overflowed) {
        evw.rollback(mark);
        continue;
      }
      for (const id of e.strings) used.push(id);
      evCount++;
    }
    client.pendingEvents = [];
    w.writeVarUint(evCount);
    w.writeBitsFrom(evw.view(), evw.bitLength);

    // Visibility.
    const eye = viewer.eye;
    const viewCluster = culler && eye ? culler.clusterAt(eye.x, eye.y, eye.z) : -1;
    const row = culler && viewCluster >= 0 ? culler.row(viewCluster) : null;
    const nearSq = PVS_NEAR_DISTANCE * PVS_NEAR_DISTANCE;

    const ops: Op[] = [];
    const desired = captured.list;
    const bkeys = baseFrame.keys;
    const bstates = baseFrame.states;
    let bi = 0;
    const tick = p.tick;
    const prioOf = (c: CapturedEntity): number => {
      if (c.ownerId === me && me >= 0) return -1;
      if (c.key === RULES_KEY) return -1;
      const d = eye ? Math.sqrt((c.x - eye.x) ** 2 + (c.y - eye.y) ** 2 + (c.z - eye.z) ** 2) : 0;
      const waited = tick - (client.lastSent.get(c.key) ?? 0);
      return (d + 64) / (1 + Math.min(waited, 132) / 4);
    };
    for (let di = 0; di < desired.length; di++) {
      const c = desired[di];
      // Transmit test.
      if (c.ownerOnly && c.ownerId !== me) continue;
      if (c.transmit && !c.transmit(me)) continue;
      if (!c.always && row && c.cluster >= 0 && c.ownerId !== me && !visTest(row, c.cluster)) {
        const dsq = eye ? (c.x - eye.x) ** 2 + (c.y - eye.y) ** 2 + (c.z - eye.z) ** 2 : 0;
        if (dsq > nearSq) continue;
      }
      while (bi < bkeys.length && bkeys[bi] < c.key) {
        ops.push({ kind: OP_REMOVE, key: bkeys[bi], target: null, base: bstates[bi], prio: -2 });
        bi++;
      }
      const owner = c.ownerId === me && me >= 0 && c.own !== null;
      const values = owner ? c.own! : c.pub;
      const b = bi < bkeys.length && bkeys[bi] === c.key ? bstates[bi] : null;
      if (b) bi++;
      if (b && b.serial === c.serial && b.schema === c.schema && b.owner === owner) {
        if (b.values === values) continue;
        const target: EntityState = {
          key: c.key,
          serial: c.serial,
          schema: c.schema,
          owner,
          values,
        };
        if (sameValues(b.values, values, c.schema, owner)) continue;
        ops.push({ kind: OP_UPDATE, key: c.key, target, base: b, prio: prioOf(c) });
      } else {
        const target: EntityState = {
          key: c.key,
          serial: c.serial,
          schema: c.schema,
          owner,
          values,
        };
        ops.push({ kind: OP_CREATE, key: c.key, target, base: b, prio: prioOf(c) });
      }
    }
    while (bi < bkeys.length) {
      ops.push({ kind: OP_REMOVE, key: bkeys[bi], target: null, base: bstates[bi], prio: -2 });
      bi++;
    }
    ops.sort((a, b) => a.prio - b.prio || a.key - b.key);

    // Write within the budget (keeping one bit for the terminator).
    const written: Op[] = [];
    let deferred = 0;
    for (const op of ops) {
      const mark = w.mark();
      const usedLen = used.length;
      w.writeBit(true);
      w.writeVarUint(op.key);
      w.writeBits(op.kind, 2);
      if (op.kind === OP_CREATE) {
        const t = op.target!;
        w.writeVarUint(t.serial);
        w.writeVarUint(t.schema.id);
        w.writeBit(t.owner);
        writeFieldChanges(w, t.schema, t.owner, t.values, null, this.refs, used);
      } else if (op.kind === OP_UPDATE) {
        const t = op.target!;
        writeFieldChanges(w, t.schema, t.owner, t.values, op.base!.values, this.refs, used);
      }
      if (w.overflowed || w.bitsLeft < 1) {
        w.rollback(mark);
        used.length = usedLen;
        deferred++;
        continue;
      }
      written.push(op);
      if (op.kind !== OP_REMOVE) client.lastSent.set(op.key, tick);
    }
    w.writeBit(false);

    // The client's mirror after this snapshot: baseline + what was written.
    const next = new Map<number, EntityState>();
    for (let i = 0; i < bkeys.length; i++) next.set(bkeys[i], bstates[i]);
    for (const op of written) {
      if (op.kind === OP_REMOVE) next.delete(op.key);
      else next.set(op.key, op.target!);
    }
    const keys = [...next.keys()].sort((a, b) => a - b);
    const states = keys.map((k) => next.get(k)!);
    client.pushFrame({ tick, keys, states });

    // Strings the client has not been sent.
    const newStrings: number[] = [];
    for (const id of used) {
      if (id > 0 && !client.strings.has(id)) {
        client.strings.add(id);
        newStrings.push(id);
      }
    }
    const bytes = w.toBytes();
    client.bytesSent += bytes.byteLength;
    client.snapshotsSent++;
    if (!base) client.fullSnapshots++;
    return { bytes, newStrings, full: !base, deferred };
  }
}

function sameValues(
  a: readonly NetValue[],
  b: readonly NetValue[],
  schema: NetSchema,
  owner: boolean,
): boolean {
  const fields = schema.fields;
  for (let i = 0; i < fields.length; i++) {
    if (!fieldVisible(fields[i], owner)) continue;
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ─── Decoding (client) ──────────────────────────────────────────────────────

export interface DecodedSnapshot {
  tick: number;
  baseTick: number;
  /** The receiving client's player entity id (−1 none). */
  localEntity: number;
  /** Last command number the server ran for the receiving player. */
  ackCmd: number;
  frame: SnapshotFrame;
  /** Cosmetic events with the tick they happened on. */
  events: Array<{ tick: number; event: SimEvent }>;
  created: number[];
  updated: number[];
  removed: number[];
}

export type SnapshotDecodeError = 'malformed' | 'no-baseline' | 'unknown-schema';

/** A snapshot's tick from its header without decoding it, or null when it is not a snapshot. */
export function snapshotTick(bytes: Uint8Array): number | null {
  const r = new BitReader(bytes);
  if (r.readU8() !== SNAPSHOT_TAG) return null;
  const tick = r.readVarUint();
  return r.overflowed ? null : tick;
}

/**
 * Decodes a snapshot against the client's frame history. `baseline(tick)`
 * returns the frame the client built for that tick (or null if it was
 * dropped from history — the snapshot then cannot be applied and the client
 * keeps acking its newest frame).
 */
export function decodeSnapshot(
  bytes: Uint8Array,
  baseline: (tick: number) => SnapshotFrame | null,
  lookup: StringLookup,
): DecodedSnapshot | SnapshotDecodeError {
  const r = new BitReader(bytes);
  if (r.readU8() !== SNAPSHOT_TAG) return 'malformed';
  const tick = r.readVarUint();
  const baseTick = r.readVarUint();
  const localEntity = r.readVarUint() - 1;
  const ackCmd = r.readVarUint();
  const base = baseTick === 0 ? EMPTY_FRAME : baseline(baseTick);
  if (!base) return 'no-baseline';

  const events: Array<{ tick: number; event: SimEvent }> = [];
  const evCount = r.readVarUint();
  if (evCount > 4096) return 'malformed';
  for (let i = 0; i < evCount && !r.overflowed; i++) {
    const back = r.readVarUint();
    events.push({ tick: tick - back, event: readEvent(r, lookup) });
  }

  const next = new Map<number, EntityState>();
  for (let i = 0; i < base.keys.length; i++) next.set(base.keys[i], base.states[i]);
  const created: number[] = [];
  const updated: number[] = [];
  const removed: number[] = [];
  let guard = 0;
  while (r.readBit()) {
    if (++guard > 65536 || r.overflowed) return 'malformed';
    const key = r.readVarUint();
    const op = r.readBits(2);
    if (op === OP_REMOVE) {
      if (next.delete(key)) removed.push(key);
      continue;
    }
    if (op === OP_CREATE) {
      const serial = r.readVarUint();
      const schemaId = r.readVarUint();
      const owner = r.readBit();
      const schema = netSchemaById(schemaId);
      if (!schema) return 'unknown-schema';
      const values = schema.fields.map((f) => zeroOf(f.kind));
      if (!readFieldChanges(r, schema, owner, values, lookup)) return 'malformed';
      next.set(key, { key, serial, schema, owner, values });
      created.push(key);
      continue;
    }
    if (op !== OP_UPDATE) return 'malformed';
    const prev = next.get(key);
    if (!prev) return 'malformed';
    const values = prev.values.slice();
    if (!readFieldChanges(r, prev.schema, prev.owner, values, lookup)) return 'malformed';
    next.set(key, { key, serial: prev.serial, schema: prev.schema, owner: prev.owner, values });
    updated.push(key);
  }
  if (r.overflowed) return 'malformed';
  const keys = [...next.keys()].sort((a, b) => a - b);
  const states = keys.map((k) => next.get(k)!);
  return {
    tick,
    baseTick,
    localEntity,
    ackCmd,
    frame: { tick, keys, states },
    events,
    created,
    updated,
    removed,
  };
}

function readFieldChanges(
  r: BitReader,
  schema: NetSchema,
  owner: boolean,
  values: NetValue[],
  lookup: StringLookup,
): boolean {
  const fields = schema.fields;
  let i = -1;
  while (r.readBit()) {
    i += 1 + (r.readBit() ? r.readVarUint() + 1 : 0);
    if (i >= fields.length || r.overflowed) return false;
    const f = fields[i];
    if (!fieldVisible(f, owner)) return false;
    values[i] = readFieldValue(r, f.kind, owner, lookup);
  }
  return !r.overflowed;
}

/** The coord range a snapshot can carry (exported for tests and the event codec). */
export const SNAPSHOT_COORD_RANGE = MAX_COORD;
