import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  stepWorld,
  type World,
  type WorldEvent,
} from '../../world';
import { arena } from '../../world/__tests__/arena';
import {
  decodeWorld,
  encodeWorld,
} from '../../save';
import { HostSession } from '../host';
import { PeerSession } from '../peer';
import {
  decodeFrame,
  encodeJson,
  localCommandSchema,
  peerMessageSchema,
} from '../protocol';
import {
  linkPair,
  settle,
  type TestLink,
} from './memory-link';

const canon =
  (
    v: unknown,
  ): unknown =>
    Array.isArray(
      v,
    )
      ? v.map(
          canon,
        )
      : v &&
          typeof v ===
            'object'
        ? Object.fromEntries(
            Object.entries(
              v as object,
            )
              .sort(
                (
                  [
                    a,
                  ],
                  [
                    b,
                  ],
                ) =>
                  a.localeCompare(
                    b,
                  ),
              )
              .map(
                ([
                  k,
                  x,
                ]) => [
                  k,
                  canon(
                    x,
                  ),
                ],
              ),
          )
        : v;
const same =
  (
    a: World,
    b: World,
  ) =>
    JSON.stringify(
      canon(
        a,
      ),
    ) ===
    JSON.stringify(
      canon(
        b,
      ),
    );

describe('the crime commands on the wire', () => {
  const ok =
    (
      cmd: unknown,
    ) =>
      localCommandSchema.safeParse(
        cmd,
      )
        .success;

  it('accepts well-formed hustle, buyWeapon, equip, shoot and reload', () => {
    expect(
      ok(
        {
          type: 'hustle',
          item: 'mystery-tonic',
          qty: 3,
        },
      ),
    ).toBe(
      true,
    );
    expect(
      ok(
        {
          type: 'buyWeapon',
          weapon:
            'shotgun',
        },
      ),
    ).toBe(
      true,
    );
    expect(
      ok(
        {
          type: 'equip',
          weapon:
            'pistol',
        },
      ),
    ).toBe(
      true,
    );
    expect(
      ok(
        {
          type: 'equip',
          weapon:
            null,
        },
      ),
    ).toBe(
      true,
    );
    expect(
      ok(
        {
          type: 'shoot',
          x: 12.5,
          z: -3,
        },
      ),
    ).toBe(
      true,
    );
    expect(
      ok(
        {
          type: 'reload',
        },
      ),
    ).toBe(
      true,
    );
  });

  it('refuses junk: unknown guns and items, bad amounts, non-finite or huge aim, extra keys, spoofed identity', () => {
    expect(
      ok(
        {
          type: 'buyWeapon',
          weapon:
            'rocket-launcher',
        },
      ),
    ).toBe(
      false,
    );
    expect(
      ok(
        {
          type: 'equip',
          weapon:
            'nope',
        },
      ),
    ).toBe(
      false,
    );
    expect(
      ok(
        {
          type: 'equip',
        },
      ),
    ).toBe(
      false,
    );
    expect(
      ok(
        {
          type: 'hustle',
          item: 'plutonium',
          qty: 1,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      ok(
        {
          type: 'hustle',
          item: 'bread',
          qty: 0,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      ok(
        {
          type: 'hustle',
          item: 'bread',
          qty: 1.5,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      ok(
        {
          type: 'hustle',
          item: 'bread',
          qty: 1e9,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      ok(
        {
          type: 'shoot',
          x: Number.NaN,
          z: 0,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      ok(
        {
          type: 'shoot',
          x: Infinity,
          z: 0,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      ok(
        {
          type: 'shoot',
          x: 1e12,
          z: 0,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      ok(
        {
          type: 'shoot',
          x: '4',
          z: 0,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      ok(
        {
          type: 'shoot',
          x: 1,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      ok(
        {
          type: 'shoot',
          x: 1,
          z: 1,
          playerId:
            'bob',
        },
      ),
    ).toBe(
      false,
    );
    expect(
      ok(
        {
          type: 'reload',
          extra: 1,
        },
      ),
    ).toBe(
      false,
    );
    expect(
      peerMessageSchema.safeParse(
        {
          t: 'cmd',
          seq: 1,
          cmd: {
            type: 'shoot',
            x: 1,
            z: 2,
          },
        },
      )
        .success,
    ).toBe(
      true,
    );
  });

  it('survives a save round-trip mid-fight, officers and all', () => {
    const w =
      arena(
        32,
        4,
      );
    stepWorld(
      w,
      0,
      [
        {
          type: 'join',
          playerId:
            'a',
        },
      ],
    );
    w.players.a.x = 16;
    w.players.a.z = 16;
    w.players.a.heat = 90;
    stepWorld(
      w,
      0,
      [
        {
          type: 'buyWeapon',
          playerId:
            'a',
          weapon:
            'pistol',
        },
        {
          type: 'equip',
          playerId:
            'a',
          weapon:
            'pistol',
        },
      ],
    );
    stepWorld(
      w,
      130 *
        50,
    );
    expect(
      w
        .officers
        .length,
    ).toBeGreaterThan(
      0,
    );
    expect(
      decodeWorld(
        encodeWorld(
          w,
        ),
      ),
    ).toEqual(
      w,
    );
    expect(
      decodeFrame(
        encodeJson(
          {
            t: 'resync',
          },
        ),
      )
        .kind,
    ).toBe(
      'json',
    );
  });

  it('loads a save from before the crime route (no hp, heat, arms or officers) with sane defaults', () => {
    const w =
      arena(
        16,
      );
    stepWorld(
      w,
      0,
      [
        {
          type: 'join',
          playerId:
            'a',
        },
      ],
    );
    const old =
      JSON.parse(
        JSON.stringify(
          w,
        ),
      );
    delete old.officers;
    delete old
      .players
      .a
      .hp;
    delete old
      .players
      .a
      .heat;
    delete old
      .players
      .a
      .arms;
    const body =
      new TextEncoder().encode(
        JSON.stringify(
          old,
        ),
      );
    const bytes =
      new Uint8Array(
        5 +
          body.length,
      );
    bytes.set(
      encodeWorld(
        w,
      ).subarray(
        0,
        5,
      ),
    );
    bytes.set(
      body,
      5,
    );
    const loaded =
      decodeWorld(
        bytes,
      );
    expect(
      loaded.officers,
    ).toEqual(
      [],
    );
    expect(
      loaded
        .players
        .a,
    ).toMatchObject(
      {
        hp: 100,
        heat: 0,
        arms: {
          equipped:
            null,
          guns: {},
          downedUntil: 0,
        },
      },
    );
  });
});

describe('replicas stay identical through a firefight', () => {
  function setup() {
    const world =
      arena(
        32,
        5,
      );
    for (const id of [
      'hosty',
      'alice',
      'bob',
    ]) {
      stepWorld(
        world,
        0,
        [
          {
            type: 'join',
            playerId:
              id,
          },
        ],
      );
      world.players[
        id
      ].money =
        4000;
      world.players[
        id
      ].x =
        14 +
        [
          'hosty',
          'alice',
          'bob',
        ].indexOf(
          id,
        ) *
          2;
      world.players[
        id
      ].z =
        16;
    }
    world.players.alice.inventory[
      'mystery-tonic'
    ] =
      30;
    world.players.bob.inventory[
      'alley-stew'
    ] =
      30;
    const host =
      new HostSession(
        world,
        'hosty',
      );
    const peers =
      new Map<
        string,
        PeerSession
      >();
    const links: TestLink[] =
      [];
    for (const id of [
      'alice',
      'bob',
    ]) {
      const [
        h,
        p,
      ] =
        linkPair();
      host.addPeer(
        id,
        h,
      );
      peers.set(
        id,
        new PeerSession(
          id,
          p,
        ),
      );
      links.push(
        h,
        p,
      );
    }
    settle(
      links,
    );
    const log: WorldEvent[] =
      [];
    const tick =
      (
        n = 1,
      ) => {
        for (
          let i = 0;
          i <
          n;
          i++
        ) {
          log.push(
            ...host.step(),
          );
          settle(
            links,
          );
        }
      };
    tick(
      2,
    );
    return {
      host,
      peers,
      links,
      tick,
      log,
    };
  }

  it('applies shots, hits, arrests and downings identically on the host and every peer, including a late joiner', () => {
    const {
      host,
      peers,
      links,
      tick,
      log,
    } =
      setup();
    const alice =
      peers.get(
        'alice',
      )!;
    const bob =
      peers.get(
        'bob',
      )!;
    alice.send(
      {
        type: 'buyWeapon',
        weapon:
          'rifle',
      },
    );
    alice.send(
      {
        type: 'equip',
        weapon:
          'rifle',
      },
    );
    host.submit(
      {
        type: 'buyWeapon',
        weapon:
          'smg',
      },
    );
    host.submit(
      {
        type: 'equip',
        weapon:
          'smg',
      },
    );
    tick(
      8,
    );
    // Alice and bob deal on the street (heat); the island answers; alice fires on whoever comes while bob stays unarmed.
    alice.send(
      {
        type: 'hustle',
        item: 'mystery-tonic',
        qty: 8,
      },
    );
    bob.send(
      {
        type: 'hustle',
        item: 'alley-stew',
        qty: 8,
      },
    );
    tick(
      3,
    );
    let sawOfficer = false;
    let sawShot = false;
    let lateJoiner: PeerSession | null =
      null;
    for (
      let i = 0;
      i <
      700;
      i++
    ) {
      if (
        i %
          4 ===
        0
      )
        alice.send(
          {
            type: 'shoot',
            x:
              16 +
              8 *
                Math.sin(
                  i /
                    11,
                ),
            z:
              16 +
              8 *
                Math.cos(
                  i /
                    11,
                ),
          },
        );
      if (
        i %
          5 ===
        0
      )
        host.submit(
          {
            type: 'shoot',
            x:
              10 +
              8 *
                Math.cos(
                  i /
                    9,
                ),
            z:
              16 +
              8 *
                Math.sin(
                  i /
                    9,
                ),
          },
        );
      if (
        i %
          90 ===
        0
      )
        bob.send(
          {
            type: 'hustle',
            item: 'alley-stew',
            qty: 3,
          },
        );
      if (
        i %
          40 ===
        0
      )
        alice.send(
          {
            type: 'reload',
          },
        );
      tick(
        1,
      );
      if (
        host
          .world
          .officers
          .length >
        0
      )
        sawOfficer = true;
      if (
        i ===
        200
      ) {
        // A latecomer is admitted with a snapshot taken mid-fight.
        const [
          h,
          p,
        ] =
          linkPair();
        host.addPeer(
          'carol',
          h,
        );
        lateJoiner =
          new PeerSession(
            'carol',
            p,
          );
        links.push(
          h,
          p,
        );
        settle(
          links,
        );
      }
      if (
        i %
          50 ===
        49
      ) {
        tick(
          3,
        ); // let every ack land, then compare
        expect(
          same(
            alice.view!,
            host.world,
          ),
        ).toBe(
          true,
        );
        expect(
          same(
            bob.view!,
            host.world,
          ),
        ).toBe(
          true,
        );
        if (
          lateJoiner?.ready
        )
          expect(
            same(
              lateJoiner.view!,
              host.world,
            ),
          ).toBe(
            true,
          );
      }
      sawShot ||=
        Object.values(
          host
            .world
            .players,
        ).some(
          (
            p,
          ) =>
            p
              .arms
              .lastShotTick >=
            0,
        );
    }
    expect(
      sawOfficer,
    ).toBe(
      true,
    );
    expect(
      sawShot,
    ).toBe(
      true,
    );
    expect(
      lateJoiner?.ready,
    ).toBe(
      true,
    );
    // It was a real fight: officers shot, were shot, and somebody was cuffed or put down.
    const types =
      new Set(
        log.map(
          (
            e,
          ) =>
            e.type,
        ),
      );
    expect(
      types.has(
        'shot',
      ),
    ).toBe(
      true,
    );
    expect(
      types.has(
        'officerHit',
      ) ||
        types.has(
          'playerHit',
        ),
    ).toBe(
      true,
    );
    expect(
      types.has(
        'arrested',
      ) ||
        types.has(
          'downed',
        ) ||
        types.has(
          'officerDown',
        ),
    ).toBe(
      true,
    );
  }, 20_000); // a whole host + peers + late-joiner simulation: ~1.8 s alone, past vitest's 5 s default on a loaded CI shard
});
