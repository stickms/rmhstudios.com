/**
 * §9.3, §9.6, §9.8 — the control plane.
 *
 * The hub is a relay, but not a dumb one, and everything it refuses to relay is
 * decided by the schemas and the pure policy functions exercised here. These
 * are the checks that stand between one player and everybody else's browser, so
 * the tests are written as "what a hostile client sends" rather than as "what
 * the happy path looks like".
 */

import { describe, expect, it } from 'vitest';
import { config } from '../../../server/socket-server/config';
import { BR_C2S, DEFAULT_COSMETICS, NET, NET_LIMITS, PHYSICS } from '../constants';
import { ALL_COSMETIC_IDS, isValidCosmetics } from '../cosmetics';
import { SnapshotFlag, type GameEvent, type InputFrame, type SeatIndex, type Simulation } from '../types';
import {
  ROOM_CODE_RE,
  digestMatches,
  sealResult,
  verifyResult,
  zCreateRoom,
  zEmote,
  zEventMsg,
  zJoinRoom,
  zSetCosmetics,
  type ResultEnvelope,
} from '../net/protocol';
import { HostLoop, packEvent, unpackEvent } from '../net/host';
import { decodeSnapshot, isKeyframe } from '../net/snapshot';
import {
  InputDeduper,
  InputHistory,
  MAX_INPUT_ENTRIES,
  buildInputPacket,
  decodeInputPacket,
  decodeInputSeats,
  encodeInputPacket,
  inputByteLength,
} from '../net/input';
import {
  KEYFRAME_STALE_MS,
  MIGRATION_FREEZE_MS,
  RttWindow,
  electHost,
  planMigration,
  rttNeedsGrabAssist,
  type HostCandidate,
} from '../net/migration';

const COSMETICS = { ...DEFAULT_COSMETICS };

// ─── The event allowlist ────────────────────────────────────────────────────

describe('rate-limit map (the hub event allowlist)', () => {
  it('has an entry for every client→server event', () => {
    // server/CLAUDE.md §Gotchas 5: the rule map in config.ts is the de-facto
    // catalog of valid inbound events. An event with no entry is unmetered,
    // which is how a relay path ships with no flood guard at all.
    const missing = Object.values(BR_C2S).filter((event) => !config.SOCKET_RATE_LIMITS[event]);
    expect(missing).toEqual([]);
  });

  it('sizes the two hot paths above their honest send rate', () => {
    // 20 Hz snapshots and 30 Hz input, per minute, with headroom for the burst
    // a reconnect produces — and no more.
    expect(config.SOCKET_RATE_LIMITS[BR_C2S.SNAPSHOT].max).toBeGreaterThanOrEqual(
      NET.SNAPSHOT_HZ * 60,
    );
    expect(config.SOCKET_RATE_LIMITS[BR_C2S.INPUT].max).toBeGreaterThanOrEqual(NET.INPUT_HZ * 60);
  });
});

// ─── Payload validation ─────────────────────────────────────────────────────

describe('control-event schemas', () => {
  it('accepts a well-formed create', () => {
    const parsed = zCreateRoom.safeParse({
      mode: 'campaign',
      private: false,
      cosmetics: COSMETICS,
      name: 'Marta',
    });
    expect(parsed.success).toBe(true);
  });

  it('refuses markup in a cosmetic id', () => {
    // The reason this schema exists: every other browser in the room renders
    // this string.
    const parsed = zSetCosmetics.safeParse({
      seatIndex: 0,
      head: '<img src=x onerror=alert(1)>',
      hat: null,
      gloves: 'mitten',
      ink: 'seat-1',
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses a name longer than the cap', () => {
    const parsed = zCreateRoom.safeParse({
      mode: 'campaign',
      private: false,
      cosmetics: COSMETICS,
      name: 'x'.repeat(NET_LIMITS.MAX_NAME_LEN + 1),
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses a seat index outside 0..3', () => {
    expect(zEmote.safeParse({ seatIndex: 4, emoteId: 'wave' }).success).toBe(false);
    expect(zEmote.safeParse({ seatIndex: 3, emoteId: 'wave' }).success).toBe(true);
  });

  it('normalises and range-checks a room code', () => {
    const parsed = zJoinRoom.safeParse({ code: ' abc23j ', cosmetics: COSMETICS, name: 'A' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.code).toBe('ABC23J');

    // `I`, `O`, `0` and `1` are not in the alphabet precisely because a person
    // has to read this code aloud.
    expect(zJoinRoom.safeParse({ code: 'ABC01I', cosmetics: COSMETICS, name: 'A' }).success).toBe(
      false,
    );
  });

  it('keeps ROOM_CODE_RE in step with the hub alphabet', () => {
    // The regex is duplicated rather than imported (client code must not pull
    // in the hub's config), so this is what stops the two from drifting.
    for (const glyph of config.ROOM_CODE_ALPHABET) {
      expect(ROOM_CODE_RE.test(glyph)).toBe(true);
    }
    for (const glyph of '01IOlo') expect(ROOM_CODE_RE.test(glyph)).toBe(false);
  });
});

describe('cosmetic allowlist', () => {
  it('passes every id in the shipped catalog through the wire shape guard', () => {
    // The shape guard is total; the allowlist is the catalog. If a legitimate
    // id cannot survive the shape guard, the allowlist never gets consulted.
    for (const id of ALL_COSMETIC_IDS) {
      const parsed = zSetCosmetics.safeParse({
        seatIndex: 0,
        head: 'biro',
        hat: null,
        gloves: 'mitten',
        ink: 'seat-1',
        ...(id.startsWith('seat-') ? { ink: id } : {}),
      });
      expect(parsed.success).toBe(true);
      expect(/^[a-z0-9][a-z0-9-]{0,31}$/.test(id)).toBe(true);
    }
  });

  it('rejects an invented id that is nonetheless well-shaped', () => {
    expect(isValidCosmetics({ head: 'diamond-crown', hat: null, gloves: 'mitten', ink: 'seat-1' })).toBe(
      false,
    );
    expect(isValidCosmetics(COSMETICS)).toBe(true);
  });
});

describe('discrete host events', () => {
  it('validates each kind against its own payload', () => {
    expect(
      zEventMsg.safeParse({
        t: 12,
        kind: 'death',
        data: { seat: 1, at: { x: 3, y: 4 }, cause: 'hazard' },
      }).success,
    ).toBe(true);

    expect(
      zEventMsg.safeParse({ t: 12, kind: 'death', data: { seat: 1, at: { x: 3, y: 4 }, cause: 'lol' } })
        .success,
    ).toBe(false);
    expect(zEventMsg.safeParse({ t: 12, kind: 'nonsense', data: {} }).success).toBe(false);
  });

  it('refuses `grip`, which belongs in the snapshot', () => {
    // Grip state rides every snapshot at 20 Hz. Relaying it here as well would
    // spend the whole 300-per-minute budget in fifteen seconds.
    expect(zEventMsg.safeParse({ t: 1, kind: 'grip', data: { seat: 0, hand: 'l', on: true } }).success).toBe(
      false,
    );
    expect(packEvent({ kind: 'grip', seat: 0, hand: 'l', on: true }, 1)).toBeNull();
  });

  it('round-trips through the wire shape', () => {
    const events: GameEvent[] = [
      { kind: 'death', seat: 2, at: { x: 10, y: 20 }, cause: 'bounds' },
      { kind: 'respawn', seat: 2, at: { x: 0, y: 0 } },
      { kind: 'checkpoint', index: 3 },
      { kind: 'objective', objectiveId: 'clock' },
      { kind: 'parcel', parcelId: 'w1-parcel-2', seat: 1 },
      { kind: 'item', propId: 'crate-4', seat: 0, kindOf: 'crate' },
      { kind: 'signal', signal: 'door-a', value: true },
      { kind: 'cat' },
      { kind: 'finish', ms: 61_000, objectives: ['clock'], deaths: 2, assisted: false },
      { kind: 'emote', seat: 3, emoteId: 'wave' },
    ];

    for (const event of events) {
      const packed = packEvent(event, 100);
      expect(packed).not.toBeNull();
      expect(zEventMsg.safeParse(packed).success).toBe(true);
      expect(unpackEvent(packed!)).toEqual(event);
    }
  });
});

// ─── Input codec ────────────────────────────────────────────────────────────

function frame(seat: SeatIndex, n: number, gripL = 0, gripR = 0): InputFrame {
  return {
    seat,
    frame: n,
    aimL: { x: 0.5, y: -0.25 },
    aimR: { x: -1, y: 1 },
    gripL,
    gripR,
    buttons: 0b10101,
  };
}

describe('input packets (§9.4)', () => {
  it('round-trips within quantisation error', () => {
    const decoded = decodeInputPacket(encodeInputPacket([frame(1, 900, 0.4, 0.75)]));
    expect(decoded).toHaveLength(1);
    expect(decoded[0].seat).toBe(1);
    expect(decoded[0].frame).toBe(900);
    expect(decoded[0].aimL.x).toBeCloseTo(0.5, 2);
    expect(decoded[0].aimR.x).toBeCloseTo(-1, 2);
    expect(decoded[0].gripL).toBeCloseTo(0.4, 2);
    expect(decoded[0].buttons).toBe(0b10101);
  });

  it('costs 10 bytes per entry and stays inside the 256 B cap', () => {
    const full = Array.from({ length: MAX_INPUT_ENTRIES }, (_, i) =>
      frame((i % NET.MAX_SEATS) as SeatIndex, i),
    );
    const encoded = encodeInputPacket(full);
    expect(encoded.byteLength).toBe(inputByteLength(MAX_INPUT_ENTRIES));
    expect(encoded.byteLength).toBeLessThanOrEqual(NET_LIMITS.INPUT_BYTES);
  });

  it('repeats the last INPUT_REDUNDANCY frames per seat', () => {
    const history = new InputHistory();
    for (let i = 0; i < 10; i++) {
      history.push(frame(0, i));
      history.push(frame(1, i));
    }
    const decoded = decodeInputPacket(buildInputPacket(history));
    expect(decoded).toHaveLength(NET.INPUT_REDUNDANCY * 2);
    expect(decoded.filter((f) => f.seat === 0).map((f) => f.frame)).toEqual([7, 8, 9]);
  });

  it('reads the claimed seats without decoding the packet', () => {
    // This is the hub's half of "input is only accepted for seats you own".
    const packet = encodeInputPacket([frame(0, 1), frame(3, 1), frame(0, 2)]);
    expect(decodeInputSeats(packet)).toEqual([0, 3]);
  });

  it('refuses a packet whose count is a lie', () => {
    const evil = new Uint8Array(inputByteLength(1));
    evil[0] = 200; // claims 200 entries in 11 bytes
    expect(decodeInputSeats(evil)).toBeNull();
    expect(() => decodeInputPacket(evil)).toThrow();
  });

  it('refuses an oversized packet outright', () => {
    expect(decodeInputSeats(new Uint8Array(NET_LIMITS.INPUT_BYTES + 1))).toBeNull();
  });

  it('de-duplicates the repeats, wrapping included', () => {
    const deduper = new InputDeduper();
    expect(deduper.accept(frame(0, 10))).toBe(true);
    expect(deduper.accept(frame(0, 10))).toBe(false);
    expect(deduper.accept(frame(0, 9))).toBe(false);
    expect(deduper.accept(frame(0, 11))).toBe(true);
    // A different seat has its own counter.
    expect(deduper.accept(frame(1, 9))).toBe(true);

    // Across the u16 wrap: 0 is NEWER than 65535, and a naive comparison would
    // reject every input from here on — one player going limp 18 minutes in.
    const wrapper = new InputDeduper();
    expect(wrapper.accept(frame(0, 65_535))).toBe(true);
    expect(wrapper.accept(frame(0, 0))).toBe(true);
    expect(wrapper.accept(frame(0, 65_534))).toBe(false);
  });
});

// ─── The authoritative loop (§9.1, §9.5) ────────────────────────────────────

/**
 * A fake {@link Simulation}. The real engine is somebody else's module and a
 * headless matter-js world would make this a slow test of the wrong thing —
 * what is under test here is the LOOP: when it steps, what it ships, and what
 * it refuses to apply.
 */
function fakeSim() {
  const calls: { steps: InputFrame[][]; grabs: { seat: SeatIndex; hand: 'l' | 'r'; frame: number }[] } = {
    steps: [],
    grabs: [],
  };
  let frame = 0;
  let queued: GameEvent[] = [];
  const sim: Simulation = {
    step(inputs) {
      calls.steps.push(inputs);
      frame++;
    },
    get frame() {
      return frame;
    },
    snapshot() {
      return {
        frame,
        flags: 0,
        seats: [
          {
            seat: 0 as SeatIndex,
            state: 'alive',
            head: { x: 1, y: 2 },
            headV: { x: 3, y: 4 },
            headAngle: 0,
            handL: { x: 0, y: 0 },
            handR: { x: 0, y: 0 },
            gripL: 0,
            gripR: 0,
            gripTargetL: 0,
            gripTargetR: 0,
          },
        ],
        props: [],
      };
    },
    drainEvents() {
      const drained = queued;
      queued = [];
      return drained;
    },
    render() {
      throw new Error('not used');
    },
    addSeat() {},
    removeSeat() {},
    setAssists() {},
    resolveGrabAt(seat, hand, at) {
      calls.grabs.push({ seat, hand, frame: at });
    },
    dispose() {},
  };
  return {
    sim,
    calls,
    emit(...events: GameEvent[]) {
      queued.push(...events);
    },
    advance(n: number) {
      frame += n;
    },
  };
}

function fakeTransport() {
  const snapshots: ArrayBuffer[] = [];
  const events: unknown[] = [];
  return {
    snapshots,
    events,
    transport: {
      sendSnapshot: (buffer: ArrayBuffer) => snapshots.push(buffer),
      sendEvent: (message: unknown) => events.push(message),
      sendResult: () => {},
    },
  };
}

function hostLoop() {
  const sim = fakeSim();
  const wire = fakeTransport();
  const loop = new HostLoop({
    sim: sim.sim,
    transport: wire.transport,
    roomId: 'ABC234',
    hostClientId: 'socket-1',
  });
  loop.start(0);
  return { loop, ...sim, ...wire };
}

describe('host loop', () => {
  it('steps at 60 Hz off a 60 Hz render clock', () => {
    const { loop, calls } = hostLoop();
    for (let t = 16; t <= 1_000; t += 16) loop.tick(t);
    // One simulated second, allowing for where the accumulator lands.
    expect(calls.steps.length).toBeGreaterThanOrEqual(55);
    expect(calls.steps.length).toBeLessThanOrEqual(61);
  });

  it('clamps a backgrounded tab instead of paying its whole debt', () => {
    // A tab that was asleep returns owing seconds of simulation. Paying that
    // in one frame is a spiral that ends with the host dropping the room, so
    // the accumulator is capped at MAX_SUBSTEPS and the debt is forgiven.
    const { loop, calls } = hostLoop();
    loop.tick(10_000);
    expect(calls.steps.length).toBeGreaterThan(0);
    expect(calls.steps.length).toBeLessThanOrEqual(PHYSICS.MAX_SUBSTEPS);
  });

  it('ships snapshots at SNAPSHOT_HZ, first one a keyframe', () => {
    const { loop, snapshots } = hostLoop();
    for (let t = 16; t <= 1_000; t += 16) loop.tick(t);
    // 20 Hz for a second, ±1 for where the accumulator lands.
    expect(snapshots.length).toBeGreaterThanOrEqual(NET.SNAPSHOT_HZ - 1);
    expect(snapshots.length).toBeLessThanOrEqual(NET.SNAPSHOT_HZ + 1);
    expect(isKeyframe(snapshots[0])).toBe(true);
  });

  it('applies remote input only for seats the hub says the sender owns', () => {
    const { loop, calls } = hostLoop();
    const packet = encodeInputPacket([frame(0, 1), frame(2, 1)]);

    // The client claims seats 0 and 2 but the hub only granted it seat 0.
    expect(loop.ingestRemoteInput(packet, [0])).toBe(1);
    loop.tick(20);
    const applied = calls.steps.flat();
    expect(applied.map((f) => f.seat)).toEqual([0]);
  });

  it('de-duplicates the redundant frames a packet repeats', () => {
    const { loop, calls } = hostLoop();
    loop.ingestRemoteInput(encodeInputPacket([frame(0, 7), frame(0, 8)]), [0]);
    // The next packet repeats 7 and 8 and adds 9.
    expect(loop.ingestRemoteInput(encodeInputPacket([frame(0, 7), frame(0, 8), frame(0, 9)]), [0])).toBe(1);
    loop.tick(20);
    expect(calls.steps.flat().map((f) => f.frame)).toEqual([7, 8, 9]);
  });

  it('resolves a grab against the frame the guest was looking at', () => {
    const { loop, calls, advance } = hostLoop();
    advance(100); // the host is at frame 100
    loop.ingestRemoteInput(encodeInputPacket([frame(0, 94, 1)]), [0]);
    expect(calls.grabs).toEqual([{ seat: 0, hand: 'l', frame: 94 }]);
  });

  it('clamps the rewind to LAGCOMP_MAX_MS', () => {
    // Beyond the clamp the grab resolves against the present and may miss —
    // the honest outcome. A player 400 ms behind must not be able to grab a
    // crate that is no longer there.
    const { loop, calls, advance } = hostLoop();
    advance(600);
    loop.ingestRemoteInput(encodeInputPacket([frame(0, 10, 1)]), [0]);
    const oldest = 600 - Math.ceil(NET.LAGCOMP_MAX_MS / PHYSICS.FIXED_DT_MS);
    expect(calls.grabs[0].frame).toBe(oldest);
  });

  it('only resolves on a RISING grip edge', () => {
    const { loop, calls } = hostLoop();
    loop.ingestRemoteInput(encodeInputPacket([frame(0, 1, 1)]), [0]);
    loop.ingestRemoteInput(encodeInputPacket([frame(0, 2, 1)]), [0]);
    expect(calls.grabs).toHaveLength(1);
  });

  it('freezes a dropped seat as a statue rather than a ragdoll', () => {
    const { loop, calls, snapshots } = hostLoop();
    loop.setSeatFrozen(0, true);

    // Their input stops being applied immediately — limp arms, no flailing.
    expect(loop.ingestRemoteInput(encodeInputPacket([frame(0, 5)]), [0])).toBe(0);

    loop.tick(60);
    expect(calls.steps.flat()).toHaveLength(0);
    const decoded = decodeSnapshot(snapshots[snapshots.length - 1]);
    expect(decoded.seats[0].state).toBe('frozen');
    expect(decoded.seats[0].headV).toEqual({ x: 0, y: 0 });
  });

  it('pauses the world but keeps shipping snapshots', () => {
    // §9.6: a guest joining during a pause must see the world and the PAUSED
    // note, not nothing at all.
    const { loop, calls, snapshots } = hostLoop();
    loop.setPaused(true);
    loop.tick(200);
    expect(calls.steps).toHaveLength(0);
    expect(snapshots.length).toBeGreaterThan(0);
    expect((decodeSnapshot(snapshots[0]).flags & SnapshotFlag.Paused) !== 0).toBe(true);
  });

  it('relays discrete events but never per-frame grip', () => {
    const { loop, emit, events } = hostLoop();
    emit(
      { kind: 'grip', seat: 0, hand: 'l', on: true },
      { kind: 'checkpoint', index: 1 },
      { kind: 'finish', ms: 61_000, objectives: [], deaths: 0, assisted: false },
    );
    loop.tick(20);
    expect(events).toHaveLength(2);
    expect((events[0] as { kind: string }).kind).toBe('checkpoint');
  });

  it('seals a result the hub will accept', () => {
    const { loop } = hostLoop();
    const sealed = loop.sealLevelResult(
      {
        levelId: 'w1-01',
        playerCount: 1,
        durationMs: 61_000,
        deaths: 0,
        objectiveIds: [],
        assisted: false,
        catUsed: false,
        seats: [{ seat: 0, userId: null }],
      },
      1_700_000_000_000,
    );
    expect(digestMatches(sealed)).toBe(true);
    expect(
      verifyResult(sealed, { roomSeats: [0], roomId: 'ABC234', hostClientId: 'socket-1' }).ranked,
    ).toBe(true);
  });
});

// ─── Host election & migration (§9.6) ───────────────────────────────────────

function candidate(over: Partial<HostCandidate> & { clientId: string }): HostCandidate {
  return { seats: [0], medianRtt: 50, connected: true, ...over };
}

describe('host election', () => {
  it('picks the lowest RTT band', () => {
    const winner = electHost([
      candidate({ clientId: 'a', medianRtt: 180, seats: [0] }),
      candidate({ clientId: 'b', medianRtt: 30, seats: [1] }),
      candidate({ clientId: 'c', medianRtt: 240, seats: [2] }),
    ]);
    expect(winner).toBe('b');
  });

  it('prefers a desktop over a phone inside the same band', () => {
    // A phone 8 ms closer is not a better host: it thermally throttles a 60 Hz
    // matter-js world four minutes in.
    const winner = electHost([
      candidate({ clientId: 'phone', medianRtt: 20, device: 'mobile', seats: [0] }),
      candidate({ clientId: 'laptop', medianRtt: 28, device: 'desktop', seats: [1] }),
    ]);
    expect(winner).toBe('laptop');
  });

  it('still takes a meaningfully closer phone', () => {
    const winner = electHost([
      candidate({ clientId: 'phone', medianRtt: 20, device: 'mobile', seats: [0] }),
      candidate({ clientId: 'laptop', medianRtt: 300, device: 'desktop', seats: [1] }),
    ]);
    expect(winner).toBe('phone');
  });

  it('breaks a total tie on the lowest seat index, deterministically', () => {
    const pool = [
      candidate({ clientId: 'x', medianRtt: 40, device: 'desktop', seats: [2, 3] }),
      candidate({ clientId: 'y', medianRtt: 40, device: 'desktop', seats: [1] }),
    ];
    expect(electHost(pool)).toBe('y');
    expect(electHost([...pool].reverse())).toBe('y');
  });

  it('never elects a client with no seats or a disconnected one', () => {
    expect(
      electHost([
        candidate({ clientId: 'spectator', seats: [], medianRtt: 1 }),
        candidate({ clientId: 'ghost', seats: [0], medianRtt: 1, connected: false }),
        candidate({ clientId: 'real', seats: [1], medianRtt: 400 }),
      ]),
    ).toBe('real');
    expect(electHost([])).toBeNull();
  });

  it('sorts a never-probed client behind every probed one', () => {
    expect(
      electHost([
        candidate({ clientId: 'unknown', medianRtt: null, seats: [0] }),
        candidate({ clientId: 'known', medianRtt: 250, seats: [1] }),
      ]),
    ).toBe('known');
  });
});

describe('migration plan', () => {
  it('resumes from a fresh keyframe after a 300 ms freeze', () => {
    expect(planMigration({ hasKeyframe: true, keyframeAgeMs: 400 })).toEqual({
      resumeFrom: 'keyframe',
      freezeMs: MIGRATION_FREEZE_MS,
    });
  });

  it('rewinds to the last checkpoint when the keyframe is stale', () => {
    // Resuming mid-air from two-second-old state drops everyone into geometry
    // that has moved; a small rewind is legible, a wipe is not.
    expect(planMigration({ hasKeyframe: true, keyframeAgeMs: KEYFRAME_STALE_MS + 1 }).resumeFrom).toBe(
      'checkpoint',
    );
    expect(planMigration({ hasKeyframe: false, keyframeAgeMs: null }).resumeFrom).toBe('checkpoint');
  });
});

describe('RTT window', () => {
  it('takes a median, not a mean', () => {
    const window = new RttWindow(30_000);
    const now = 100_000;
    for (const rtt of [40, 42, 38, 41, 900]) window.push(rtt, now);
    // The 900 ms wifi roam must not lose this client an election it deserves.
    expect(window.median(now)).toBe(41);
  });

  it('forgets samples older than its window', () => {
    const window = new RttWindow(30_000);
    window.push(500, 0);
    window.push(40, 40_000);
    expect(window.median(40_000)).toBe(40);
    expect(window.size).toBe(1);
  });

  it('auto-enables grab assist above RTT_ASSIST_MS', () => {
    expect(rttNeedsGrabAssist(NET.RTT_ASSIST_MS + 1)).toBe(true);
    expect(rttNeedsGrabAssist(NET.RTT_ASSIST_MS)).toBe(false);
    expect(rttNeedsGrabAssist(null)).toBe(false);
  });
});

// ─── Results (§9.8) ─────────────────────────────────────────────────────────

function levelResult() {
  return {
    levelId: 'w1-01',
    playerCount: 2,
    durationMs: 92_000,
    deaths: 3,
    objectiveIds: ['clock'],
    assisted: false,
    catUsed: false,
    seats: [
      { seat: 0 as SeatIndex, userId: 'u1' },
      { seat: 1 as SeatIndex, userId: null },
    ],
  };
}

function envelope(body?: ResultEnvelope['body']): ResultEnvelope {
  return sealResult({
    v: 1,
    roomId: 'ABC234',
    hostClientId: 'socket-1',
    issuedAt: 1_700_000_000_000,
    nonce: 'deadbeef',
    body: body ?? { kind: 'level', result: levelResult() },
  });
}

const CONTEXT = { roomSeats: [0, 1] as SeatIndex[], roomId: 'ABC234', hostClientId: 'socket-1' };

describe('result validation', () => {
  it('seals and verifies a clean result', () => {
    const sealed = envelope();
    expect(digestMatches(sealed)).toBe(true);
    expect(verifyResult(sealed, CONTEXT)).toEqual({ ranked: true, reasons: [] });
  });

  it('detects a mangled envelope', () => {
    // Tamper EVIDENCE, not a signature — the host is the party we cannot
    // authenticate. What this catches is corruption, which would otherwise be
    // persisted as somebody's personal best.
    const sealed = envelope();
    if (sealed.body.kind !== 'level') throw new Error('unreachable');
    sealed.body.result.durationMs = 1;
    expect(digestMatches(sealed)).toBe(false);
    expect(verifyResult(sealed, CONTEXT).reasons).toContain('digest-mismatch');
  });

  it('refuses seats the server never saw', () => {
    const sealed = envelope({
      kind: 'level',
      result: {
        ...levelResult(),
        playerCount: 1,
        objectiveIds: [],
        seats: [{ seat: 3, userId: 'u9' }],
      },
    });
    expect(verifyResult(sealed, CONTEXT).reasons).toContain('unseen-seat');
  });

  it('applies per-level bounds only when the level is supplied', () => {
    const sealed = envelope();
    expect(verifyResult(sealed, { ...CONTEXT, level: { minPlausibleSeconds: 200 } }).reasons).toContain(
      'below-min-plausible',
    );
    // `clock` is the objective that can be claimed rather than earned, because
    // it is purely a function of the time the host reported.
    expect(verifyResult(sealed, { ...CONTEXT, level: { parSeconds: 60 } }).reasons).toContain(
      'clock-over-par',
    );
    expect(verifyResult(sealed, { ...CONTEXT, level: { parSeconds: 120 } }).ranked).toBe(true);
  });

  it('rejects implausible durations at both ends', () => {
    const quick = envelope({ kind: 'level', result: { ...levelResult(), durationMs: 500 } });
    expect(verifyResult(quick, CONTEXT).reasons).toContain('duration-too-short');

    const forever = envelope({
      kind: 'level',
      result: { ...levelResult(), durationMs: 3 * 60 * 60 * 1000 },
    });
    expect(verifyResult(forever, CONTEXT).reasons).toContain('duration-too-long');
  });

  it('checks a Showdown score against its round count', () => {
    const sealed = sealResult({
      v: 1,
      roomId: 'ABC234',
      hostClientId: 'socket-1',
      issuedAt: 1,
      nonce: 'abcd',
      body: {
        kind: 'showdown',
        result: {
          ranked: true,
          teams: false,
          rounds: 9,
          players: [
            { seat: 0, userId: 'u1', roundsWon: 5, won: true },
            { seat: 1, userId: 'u2', roundsWon: 2, won: false },
          ],
        },
      },
    });
    expect(verifyResult(sealed, CONTEXT).reasons).toContain('round-count-mismatch');
  });

  it('downgrades rather than drops — a lost clear is a support ticket', () => {
    const verdict = verifyResult(envelope(), { ...CONTEXT, roomId: 'ZZZZZZ' });
    expect(verdict.ranked).toBe(false);
    expect(verdict.reasons.length).toBeGreaterThan(0);
    // There is no third state. Every result the hub sees is persistable.
    expect(Object.keys(verdict).sort()).toEqual(['ranked', 'reasons']);
  });
});
