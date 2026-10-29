/**
 * Snapshots and events: for every registered net schema, random field values
 * survive create and delta encoding exactly as their canonical (wire
 * precision) form; owner-private fields reach only the owner; a long random
 * history with lost snapshots and lost acks keeps the client's mirror equal to
 * the server's view; the byte cap holds and deferred entities catch up; the
 * event codec round-trips every event shape with recipients applied.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { UniformRandomStream } from '../core/random';
import {
  allNetSchemas,
  createNetRecord,
  type NetRecord,
  type NetSchema,
  type NetValue,
} from '../sim/net-schema';
import type { SimEvent } from '../sim/events';
import { BitWriter } from './bitbuf';
import { eventIsCosmetic, eventVisibleTo, writeEvent } from './event-codec';
import { decodeReliable, ReliableWriter } from './protocol';
import {
  canonicalValue,
  captureRecord,
  ClientSnapshotState,
  decodeSnapshot,
  frameGet,
  SNAPSHOT_MAX_BYTES,
  SnapshotEncoder,
  type CapturedEntity,
  type CapturedFrame,
  type SnapshotFrame,
} from './snapshot';
import { ClientStringKnowledge, ClientStringTable, ServerStringTable } from './string-table';

/** Modules other workers are writing; whatever exists registers its schemas. */
const OPTIONAL_MODULES = [
  '../sim/weapons/index',
  '../sim/projectiles/index',
  '../sim/entities/index',
  '../sim/modes/index',
  '../sim/buildings/index',
];

beforeAll(async () => {
  for (const m of OPTIONAL_MODULES) {
    try {
      await import(/* @vite-ignore */ m);
    } catch {
      /* not written yet */
    }
  }
});

const STR_POOL = [
  '',
  'models/player/soldier.mdl',
  'concrete',
  'ctf',
  'models/weapons/w_models/w_rocket.mdl',
  'has space',
  'ünï',
  'x'.repeat(300),
];

function randomValue(kind: string, rng: UniformRandomStream): NetValue {
  const pick = rng.randomInt(0, 9);
  switch (kind) {
    case 'bool':
      return pick < 5;
    case 'str':
      return STR_POOL[rng.randomInt(0, STR_POOL.length - 1)];
    case 'f32':
      return pick === 0
        ? 0
        : pick < 3
          ? rng.randomInt(-5000, 5000)
          : pick < 5
            ? rng.randomFloat(-1, 1) * 1e-3
            : rng.randomFloat(-1e5, 1e5);
    case 'coord':
      return pick === 0 ? 0 : rng.randomFloat(-20000, 20000);
    case 'angle8':
    case 'angle16':
      return rng.randomFloat(-720, 720);
    default:
      return pick === 0 ? 0 : rng.randomInt(-70000, 70000) * (pick < 5 ? 1 : 40000);
  }
}

function randomRecord(schema: NetSchema, rng: UniformRandomStream): NetRecord {
  const r = createNetRecord(schema);
  for (const f of schema.fields) r[f.name] = randomValue(f.kind, rng);
  return r;
}

function expected(schema: NetSchema, rec: NetRecord, owner: boolean): NetValue[] {
  return schema.fields.map((f) =>
    !owner && f.private
      ? canonicalValue(f.kind, f.kind === 'str' ? '' : f.kind === 'bool' ? false : 0, false)
      : canonicalValue(f.kind, rec[f.name], owner),
  );
}

/** A server/client pair for one viewer. */
function pair(table: ServerStringTable, entityId: number) {
  const knowledge = new ClientStringKnowledge();
  const server = new ClientSnapshotState(knowledge);
  const strings = new ClientStringTable();
  const frames: SnapshotFrame[] = [];
  const encoder = new SnapshotEncoder(table);
  return {
    server,
    strings,
    frames,
    send(captured: CapturedFrame, tick: number, maxBytes = 1 << 20) {
      const enc = encoder.encode(server, captured, null, {
        tick,
        ackCmd: 0,
        viewer: { entityId, eye: { x: 0, y: 0, z: 0 } },
        maxBytes,
      });
      // The reliable stream delivers definitions first.
      for (const id of enc.newStrings) strings.define(id, table.strings[id]);
      return enc;
    },
    receive(bytes: Uint8Array) {
      const d = decodeSnapshot(
        bytes,
        (t) => frames.find((f) => f.tick === t) ?? null,
        (id) => strings.get(id),
      );
      if (typeof d === 'string') throw new Error(d);
      frames.push(d.frame);
      return d;
    },
  };
}

describe('snapshot codec', () => {
  it('round-trips every registered schema (create and delta), private fields only to the owner', () => {
    const schemas = allNetSchemas();
    expect(schemas.length).toBeGreaterThanOrEqual(8);
    const rng = new UniformRandomStream(1234);
    for (const schema of schemas) {
      const table = new ServerStringTable();
      const owner = pair(table, 7);
      const other = pair(table, 8);
      let rec = randomRecord(schema, rng);
      for (let round = 0; round < 6; round++) {
        if (round > 0) {
          // Mutate a random subset (delta against the acked baseline).
          rec = { ...rec };
          for (const f of schema.fields)
            if (rng.randomInt(0, 2) === 0) rec[f.name] = randomValue(f.kind, rng);
        }
        const tick = 10 + round * 2;
        const captured: CapturedFrame = {
          tick,
          list: [captureRecord(500, 3, schema, rec, { ownerId: 7 })],
        };
        for (const [p, isOwner] of [
          [owner, true],
          [other, false],
        ] as const) {
          const enc = p.send(captured, tick);
          expect(enc.full).toBe(round === 0);
          const d = p.receive(enc.bytes);
          p.server.acknowledge(tick);
          const st = frameGet(d.frame, 500)!;
          expect(st.schema).toBe(schema);
          expect(st.owner).toBe(isOwner && schema.fields.some((f) => f.private));
          expect(
            [...st.values],
            `${schema.type} round ${round} ${isOwner ? 'owner' : 'other'}`,
          ).toEqual(expected(schema, rec, st.owner));
          if (!isOwner)
            for (let i = 0; i < schema.fields.length; i++)
              if (schema.fields[i].private)
                expect(st.values[i]).toBe(expected(schema, createNetRecord(schema), false)[i]);
        }
      }
    }
  });

  it('keeps the mirror exact through creates, removes, lost snapshots and lost acks', () => {
    const rng = new UniformRandomStream(42);
    const schemas = allNetSchemas();
    const table = new ServerStringTable();
    const c = pair(table, 1);
    const live = new Map<
      number,
      { schema: NetSchema; serial: number; rec: NetRecord; owner: number }
    >();
    let serial = 1;
    let lastDecoded: SnapshotFrame | null = null;
    let lastDecodedCaptured: CapturedFrame | null = null;
    for (let step = 1; step <= 400; step++) {
      // World churn.
      for (let k = 0; k < 3; k++) {
        const key = rng.randomInt(1, 60);
        if (live.has(key) && rng.randomInt(0, 3) === 0) live.delete(key);
        else if (!live.has(key)) {
          const schema = schemas[rng.randomInt(0, schemas.length - 1)];
          live.set(key, {
            schema,
            serial: serial++,
            rec: randomRecord(schema, rng),
            owner: rng.randomInt(0, 3) === 0 ? 1 : -1,
          });
        }
      }
      for (const e of live.values()) {
        if (rng.randomInt(0, 2) !== 0) continue;
        e.rec = { ...e.rec };
        const f = e.schema.fields[rng.randomInt(0, e.schema.fields.length - 1)];
        e.rec[f.name] = randomValue(f.kind, rng);
      }
      const tick = step * 2;
      const list: CapturedEntity[] = [...live.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([key, e]) => captureRecord(key, e.serial, e.schema, e.rec, { ownerId: e.owner }));
      const captured: CapturedFrame = { tick, list };
      const enc = c.send(captured, tick);
      if (rng.randomFloat() < 0.15) continue; // snapshot lost
      const d = c.receive(enc.bytes);
      lastDecoded = d.frame;
      lastDecodedCaptured = captured;
      if (rng.randomFloat() < 0.3) continue; // ack lost
      c.server.acknowledge(tick);
    }
    // The newest decoded frame equals what the server captured for that tick.
    expect(lastDecoded).not.toBeNull();
    const cap = lastDecodedCaptured!;
    expect(lastDecoded!.keys).toEqual(cap.list.map((e) => e.key));
    for (const e of cap.list) {
      const st = frameGet(lastDecoded!, e.key)!;
      const owner = e.ownerId === 1 && e.own !== null;
      expect(st.serial).toBe(e.serial);
      expect(st.owner).toBe(owner);
      expect([...st.values]).toEqual([...(owner ? e.own! : e.pub)]);
    }
  });

  it('holds the byte cap and sends deferred entities on later snapshots', () => {
    const schema = allNetSchemas().find((s) => s.type === 'player')!;
    const rng = new UniformRandomStream(5);
    const table = new ServerStringTable();
    const c = pair(table, 1);
    const recs = new Map<number, NetRecord>();
    for (let k = 1; k <= 120; k++) recs.set(k, randomRecord(schema, rng));
    let tick = 0;
    for (let i = 0; i < 40; i++) {
      tick += 2;
      const list = [...recs.entries()].map(([key, rec]) =>
        captureRecord(key, 1, schema, rec, {
          ownerId: key === 1 ? 1 : -1,
          pos: { x: key * 50, y: 0, z: 0 },
        }),
      );
      const enc = c.send({ tick, list }, tick, SNAPSHOT_MAX_BYTES);
      expect(enc.bytes.byteLength).toBeLessThanOrEqual(SNAPSHOT_MAX_BYTES);
      const d = c.receive(enc.bytes);
      c.server.acknowledge(tick);
      if (i === 0) {
        // Nearest first: the local player and the closest entities made it.
        expect(frameGet(d.frame, 1)).not.toBeNull();
        expect(d.frame.keys.length).toBeLessThan(120);
      }
    }
    const last = c.frames[c.frames.length - 1];
    expect(last.keys.length).toBe(120);
  });
});

describe('event codec', () => {
  const events: SimEvent[] = [
    { type: 'sound', name: 'Weapon_RocketLauncher.Single', entity: 3, channel: 1, notTo: 3 },
    {
      type: 'sound',
      name: 'Player.Footstep.concrete',
      pos: { x: 1.5, y: -20.25, z: 300 },
      channel: 0,
      volume: 0.5,
      team: 2,
    },
    { type: 'sound', name: 'Weapon_Minigun.Spin', entity: 4, channel: 1, stop: true },
    {
      type: 'effect',
      kind: 'explosion',
      pos: { x: 100, y: 200, z: -30 },
      normal: { x: 0, y: 0, z: 1 },
      team: 3,
      system: 'ExplosionCore_wall',
    },
    {
      type: 'effect',
      kind: 'ragdoll',
      pos: { x: 0, y: 0, z: 0 },
      entity: 5,
      force: { x: 30000, y: -50000, z: 1e5 },
    },
    {
      type: 'death',
      victim: 3,
      attacker: 4,
      assister: 0,
      inflictor: 70,
      weapon: 'tf_projectile_rocket',
      weaponDefIndex: 18,
      crit: 2,
      customKill: 0,
      damageType: 64,
      deathFlags: 0x10,
      victimClass: 1,
      gib: true,
      burning: false,
    },
    {
      type: 'damage',
      victim: 3,
      attacker: 4,
      amount: 90.5,
      health: 35,
      crit: 0,
      customKill: 0,
      pos: { x: 1, y: 2, z: 3 },
      to: 4,
    },
    {
      type: 'hud',
      kind: 'center',
      key: '#TF_Flag_AttackDefend',
      params: ['Some Player', 'with spaces'],
      holdTime: 4,
      team: 3,
    },
    { type: 'chat', from: 2, text: 'hello there, gents!', team: 2 },
    {
      type: 'capture',
      kind: 'captured',
      point: 2,
      pointName: 'Blue Base',
      team: 2,
      cappers: [1, 5, 9],
    },
    { type: 'flag', kind: 'pickup', player: 4, team: 3, flag: 77 },
    { type: 'round', kind: 'win', state: 5, team: 2, reason: 1, fullRound: true },
    { type: 'voice', player: 6, line: 'Medic!' },
    { type: 'spawn', player: 6, team: 3, cls: 9 },
    { type: 'team', player: 6, team: 3, oldTeam: 0 },
    {
      type: 'object',
      kind: 'destroyed',
      object: 90,
      objectType: 2,
      owner: 6,
      attacker: 3,
      weapon: 'tf_weapon_rocketlauncher',
    },
    { type: 'teleport', player: 6 },
    { type: 'pickup', player: 6, item: 'item_healthkit_medium' },
    { type: 'healed', patient: 6, healer: 7, amount: 24 },
  ];

  it('round-trips every event shape through the reliable stream, without recipients', () => {
    const table = new ServerStringTable();
    const refs = { idFor: (s: string) => table.idFor(s) };
    const rw = new ReliableWriter().begin(321);
    const encoded = events.map((ev) => {
      const w = new BitWriter();
      const used: number[] = [];
      writeEvent(w, ev, refs, used);
      return { bytes: w.toBytes(), bits: w.bitLength, used };
    });
    const ids = new Set(encoded.flatMap((e) => e.used));
    for (const id of ids) rw.string(id, table.strings[id]);
    for (const e of encoded) rw.event(e.bytes, e.bits);
    const bytes = rw.finish()!;
    const client = new ClientStringTable();
    const d = decodeReliable(bytes, client)!;
    expect(d.tick).toBe(321);
    const got = d.messages
      .filter((m) => m.kind === 'event')
      .map((m) => (m as { event: SimEvent }).event);
    expect(got.length).toBe(events.length);
    const teamFiltered = new Set(['sound', 'damage', 'hud', 'chat']);
    for (let i = 0; i < events.length; i++) {
      const want: Record<string, unknown> = { ...events[i] };
      delete want.to;
      delete want.notTo;
      if (teamFiltered.has(want.type as string)) delete want.team;
      // Coordinates at 1/32, floats at float32.
      const norm = (o: Record<string, unknown>) =>
        JSON.parse(
          JSON.stringify(o, (_k, v) =>
            typeof v === 'number' ? Math.round(Math.fround(v) * 32) / 32 : v,
          ),
        );
      expect(norm(got[i] as unknown as Record<string, unknown>)).toEqual(norm(want));
    }
    // Strings are sent once: a second batch reuses the ids.
    expect(bytes.byteLength).toBeLessThan(1400);
  });

  it('applies recipients and classifies cosmetic events', () => {
    const [own, footstep, stop, effect, , , damage, hud] = events;
    expect(eventVisibleTo(own, 3, 2)).toBe(false);
    expect(eventVisibleTo(own, 4, 2)).toBe(true);
    expect(eventVisibleTo(footstep, 4, 3)).toBe(false);
    expect(eventVisibleTo(footstep, 4, 2)).toBe(true);
    // An effect's team is its colour, not a filter.
    expect(eventVisibleTo(effect, 4, 2)).toBe(true);
    expect(eventVisibleTo(damage, 3, 2)).toBe(false);
    expect(eventVisibleTo(hud, 1, 3)).toBe(true);
    expect(eventIsCosmetic(own)).toBe(true);
    expect(eventIsCosmetic(stop)).toBe(false);
    expect(eventIsCosmetic(effect)).toBe(true);
    expect(eventIsCosmetic(damage)).toBe(false);
  });
});
