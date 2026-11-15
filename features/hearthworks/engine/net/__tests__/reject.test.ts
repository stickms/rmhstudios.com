import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  createWorld,
  stepWorld,
  type World,
} from '../../world';
import { createHearthworksStore } from '../../store';
import {
  hostDriver,
  peerDriver,
} from '../driver';
import {
  HostSession,
  SNAPSHOT_MIN_TICKS,
} from '../host';
import {
  MAX_PENDING,
  PENDING_TTL_MS,
  PeerSession,
} from '../peer';
import {
  MAX_REJECT_ITEMS,
  MIN_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  decodeFrame,
  encodeJson,
  hostMessageSchema,
} from '../protocol';
import {
  linkPair,
  settle,
  type TestLink,
} from './memory-link';

/** A host with peers over manual links; `clock` is the peers' (fake) monotonic clock. */
function setup(
  peerIds: string[] = [
    'alice',
    'bob',
  ],
  prepare?: (
    w: World,
  ) => void,
) {
  const world =
    createWorld(
      5,
      32,
    );
  prepare?.(
    world,
  );
  const host =
    new HostSession(
      world,
      'hosty',
    );
  const clock =
    {
      now: 0,
    };
  const peers =
    new Map<
      string,
      PeerSession
    >();
  const hostEnds =
    new Map<
      string,
      TestLink
    >();
  const peerEnds =
    new Map<
      string,
      TestLink
    >();
  for (const id of peerIds) {
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
        {
          now: () =>
            clock.now,
        },
      ),
    );
    hostEnds.set(
      id,
      h,
    );
    peerEnds.set(
      id,
      p,
    );
  }
  const all =
    [
      ...hostEnds.values(),
      ...peerEnds.values(),
    ];
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
        host.step();
        settle(
          all,
        );
      }
    };
  settle(
    all,
  );
  tick(
    2,
  );
  return {
    host,
    peers,
    hostEnds,
    peerEnds,
    all,
    tick,
    clock,
  };
}

const mid =
  (
    w: World,
  ) =>
    Math.floor(
      w.size /
        2,
    );

describe('a refused command is told to the peer that sent it, and only that peer', () => {
  it("returns the world's reason, as the same event the single-player sim emits, and takes the prediction back", () => {
    const {
      host,
      peers,
      tick,
    } =
      setup();
    const alice =
      peers.get(
        'alice',
      )!;
    const m =
      mid(
        host.world,
      );
    // The host builds on the tile in the same tick; alice's replica has not seen that yet, so she predicts success.
    host.submit(
      {
        type: 'place',
        kind: 'park',
        x:
          m +
          1,
        z: m,
      },
    );
    alice.send(
      {
        type: 'place',
        kind: 'cottage',
        x:
          m +
          1,
        z: m,
      },
    );
    expect(
      alice.view!.buildings.map(
        (
          b,
        ) =>
          b.kind,
      ),
    ).toEqual(
      [
        'cottage',
      ],
    );
    tick(
      2,
    );
    expect(
      alice.drainEvents(),
    ).toEqual(
      [
        {
          type: 'rejected',
          command:
            'place',
          playerId:
            'alice',
          reason:
            'occupied',
        },
      ],
    );
    expect(
      alice.pendingCount,
    ).toBe(
      0,
    );
    expect(
      alice.view!.buildings.map(
        (
          b,
        ) =>
          b.kind,
      ),
    ).toEqual(
      [
        'park',
      ],
    ); // the optimistic cottage is gone
    expect(
      alice.drainEvents(),
    ).toEqual(
      [],
    ); // draining empties the queue
    expect(
      host
        .stats
        .rejectsSent,
    ).toBe(
      1,
    );
  });

  it('also reports the host verdict for a rule the peer had already predicted (cannot-afford): that is the toast', () => {
    const {
      host,
      peers,
      tick,
    } =
      setup(
        [
          'alice',
        ],
      );
    const alice =
      peers.get(
        'alice',
      )!;
    const m =
      mid(
        host.world,
      );
    for (
      let i = 1;
      i <=
      3;
      i++
    )
      alice.send(
        {
          type: 'place',
          kind: 'cottage',
          x:
            m +
            i,
          z: m,
        },
      ); // 3 x 120 > 300
    tick(
      2,
    );
    expect(
      alice.drainEvents(),
    ).toEqual(
      [
        {
          type: 'rejected',
          command:
            'place',
          playerId:
            'alice',
          reason:
            'cannot-afford',
        },
      ],
    );
    expect(
      host
        .world
        .buildings,
    ).toHaveLength(
      2,
    );
    expect(
      alice
        .view!
        .buildings,
    ).toHaveLength(
      2,
    );
  });

  it('does not tell anyone else, and the host driver does not toast a peer refusal at the host', () => {
    const {
      host,
      peers,
      hostEnds,
      all,
      tick,
    } =
      setup();
    const m =
      mid(
        host.world,
      );
    const seen: unknown[] =
      [];
    const bobEnd =
      hostEnds.get(
        'bob',
      )!.other;
    const original =
      bobEnd.onmessage;
    bobEnd.onmessage =
      (
        d,
      ) => {
        const f =
          decodeFrame(
            d,
          );
        if (
          f.kind ===
          'json'
        )
          seen.push(
            f.value,
          );
        original?.(
          d,
        );
      };
    host.submit(
      {
        type: 'place',
        kind: 'park',
        x:
          m +
          1,
        z: m,
      },
    );
    peers
      .get(
        'alice',
      )!
      .send(
        {
          type: 'place',
          kind: 'cottage',
          x:
            m +
            1,
          z: m,
        },
      );
    tick(
      2,
    );
    expect(
      peers
        .get(
          'alice',
        )!
        .drainEvents(),
    ).toHaveLength(
      1,
    );
    expect(
      peers
        .get(
          'bob',
        )!
        .drainEvents(),
    ).toEqual(
      [],
    );
    expect(
      seen.length,
    ).toBeGreaterThan(
      0,
    );
    expect(
      (
        seen as {
          t?: string;
        }[]
      ).some(
        (
          f,
        ) =>
          f?.t ===
          'reject',
      ),
    ).toBe(
      false,
    );

    // The host's own screen shows the host's refusals only: the world reports everyone's.
    const driver =
      hostDriver(
        host,
        () =>
          0,
      );
    host.submit(
      {
        type: 'place',
        kind: 'park',
        x:
          m +
          5,
        z: m,
      },
    );
    host.submit(
      {
        type: 'place',
        kind: 'park',
        x:
          m +
          5,
        z: m,
      },
    ); // refused: the host's own
    peers
      .get(
        'alice',
      )!
      .send(
        {
          type: 'place',
          kind: 'park',
          x:
            m +
            5,
          z: m,
        },
      ); // refused: alice's
    settle(
      all,
    );
    const rejected =
      driver
        .advance(
          60,
        )
        .filter(
          (
            e,
          ) =>
            e.type ===
            'rejected',
        ) as {
        playerId: string;
      }[];
    expect(
      rejected.map(
        (
          e,
        ) =>
          e.playerId,
      ),
    ).toEqual(
      [
        'hosty',
      ],
    );
  });

  it('attributes a refusal to the command that failed when one peer sends two of a kind in one tick', () => {
    const {
      host,
      peers,
      tick,
    } =
      setup(
        [
          'alice',
        ],
      );
    const alice =
      peers.get(
        'alice',
      )!;
    const m =
      mid(
        host.world,
      );
    host.submit(
      {
        type: 'place',
        kind: 'park',
        x:
          m +
          1,
        z: m,
      },
    ); // takes the tile of alice's FIRST command
    alice.send(
      {
        type: 'place',
        kind: 'cottage',
        x:
          m +
          1,
        z: m,
      },
    ); // seq 0: refused
    alice.send(
      {
        type: 'place',
        kind: 'cottage',
        x:
          m +
          2,
        z: m,
      },
    ); // seq 1: accepted
    tick(
      2,
    );
    expect(
      alice.drainEvents(),
    ).toEqual(
      [
        {
          type: 'rejected',
          command:
            'place',
          playerId:
            'alice',
          reason:
            'occupied',
        },
      ],
    );
    const shape =
      (
        w: World,
      ) =>
        w.buildings
          .map(
            (
              b,
            ) =>
              `${b.kind}@${b.x}`,
          )
          .sort();
    expect(
      shape(
        host.world,
      ),
    ).toEqual(
      [
        `cottage@${m + 2}`,
        `park@${m + 1}`,
      ],
    );
    expect(
      shape(
        alice.view!,
      ),
    ).toEqual(
      [
        `cottage@${m + 2}`,
        `park@${m + 1}`,
      ],
    );
  });

  it('a command dropped for rate is taken back quietly: no event, no ghost, the peer stays connected', () => {
    const {
      host,
      peers,
      peerEnds,
      tick,
    } =
      setup(
        [
          'alice',
        ],
      );
    const alice =
      peers.get(
        'alice',
      )!;
    const m =
      mid(
        host.world,
      );
    for (
      let i = 0;
      i <
      200;
      i++
    )
      alice.send(
        {
          type: 'move',
          x:
            m +
            (i %
              5),
          z: m,
        },
      );
    expect(
      alice.pendingCount,
    ).toBe(
      200,
    );
    tick(
      1,
    );
    expect(
      host
        .stats
        .rateLimited,
    ).toBeGreaterThan(
      0,
    );
    tick(
      3,
    );
    expect(
      alice.pendingCount,
    ).toBe(
      0,
    ); // every one acked or told "rate-limited"
    expect(
      alice
        .stats
        .rateLimited,
    ).toBeGreaterThan(
      0,
    );
    expect(
      alice.drainEvents(),
    ).toEqual(
      [],
    );
    expect(
      peerEnds.get(
        'alice',
      )!
        .open,
    ).toBe(
      true,
    );
  });

  it('stops predicting a command the host never answered, after the TTL', () => {
    const {
      host,
      peers,
      peerEnds,
      clock,
      tick,
    } =
      setup(
        [
          'alice',
        ],
      );
    const alice =
      peers.get(
        'alice',
      )!;
    const m =
      mid(
        host.world,
      );
    // The command is lost on its way (the host never sees it, never refuses it).
    peerEnds.get(
      'alice',
    )!.filter =
      () =>
        false;
    alice.send(
      {
        type: 'place',
        kind: 'park',
        x:
          m +
          1,
        z: m,
      },
    );
    tick(
      2,
    );
    expect(
      alice
        .view!
        .buildings,
    ).toHaveLength(
      1,
    );
    clock.now =
      PENDING_TTL_MS -
      1;
    alice.update();
    expect(
      alice.pendingCount,
    ).toBe(
      1,
    );
    clock.now =
      PENDING_TTL_MS +
      1;
    alice.update();
    expect(
      alice.pendingCount,
    ).toBe(
      0,
    );
    expect(
      alice
        .view!
        .buildings,
    ).toHaveLength(
      0,
    );
    expect(
      alice
        .stats
        .expired,
    ).toBe(
      1,
    );
  });

  it('refuses new commands past MAX_PENDING instead of queueing without bound', () => {
    const {
      host,
      peers,
      peerEnds,
    } =
      setup(
        [
          'alice',
        ],
      );
    const alice =
      peers.get(
        'alice',
      )!;
    peerEnds.get(
      'alice',
    )!.filter =
      () =>
        false;
    const m =
      mid(
        host.world,
      );
    let accepted = 0;
    for (
      let i = 0;
      i <
      MAX_PENDING +
        50;
      i++
    )
      if (
        alice.send(
          {
            type: 'move',
            x: m,
            z: m,
          },
        )
      )
        accepted++;
    expect(
      accepted,
    ).toBe(
      MAX_PENDING,
    );
    expect(
      alice
        .stats
        .dropped,
    ).toBe(
      50,
    );
    expect(
      alice.pendingCount,
    ).toBe(
      MAX_PENDING,
    );
  });

  it('the peer driver surfaces refusals to the store as lastEvents (what the HUD toasts)', () => {
    const {
      host,
      peers,
      tick,
    } =
      setup(
        [
          'alice',
        ],
      );
    const alice =
      peers.get(
        'alice',
      )!;
    const store =
      createHearthworksStore(
        {
          seed: 5,
          size: 32,
          playerId:
            'alice',
        },
      );
    store
      .getState()
      .attachDriver(
        peerDriver(
          alice,
          () =>
            0,
        ),
        {
          stash: true,
        },
      );
    const m =
      mid(
        host.world,
      );
    host.submit(
      {
        type: 'place',
        kind: 'park',
        x:
          m +
          1,
        z: m,
      },
    );
    store
      .getState()
      .dispatch(
        {
          type: 'place',
          kind: 'cottage',
          x:
            m +
            1,
          z: m,
        },
      );
    tick(
      2,
    );
    store
      .getState()
      .advance(
        16,
      );
    expect(
      store.getState()
        .lastEvents,
    ).toEqual(
      [
        {
          type: 'rejected',
          command:
            'place',
          playerId:
            'alice',
          reason:
            'occupied',
        },
      ],
    );
  });

  it('a successor that is promoted re-issues the commands it had not seen confirmed', () => {
    const {
      host,
      peers,
      peerEnds,
      tick,
    } =
      setup(
        [
          'alice',
          'bob',
        ],
      );
    const m =
      mid(
        host.world,
      );
    const bob =
      peers.get(
        'bob',
      )!;
    // Bob's link to the host is cut before this command is delivered; the host dies; bob is promoted.
    peerEnds.get(
      'bob',
    )!.filter =
      () =>
        false;
    bob.send(
      {
        type: 'place',
        kind: 'park',
        x:
          m +
          4,
        z: m,
      },
    );
    tick(
      1,
    );
    const next =
      bob.promote();
    next.step();
    expect(
      next.world.buildings.some(
        (
          b,
        ) =>
          b.x ===
          m +
            4,
      ),
    ).toBe(
      true,
    );
  });
});

describe('host frames are validated before a peer acts on them', () => {
  const welcome =
    {
      t: 'welcome',
      v: PROTOCOL_VERSION,
      you: 'alice',
      successor:
        null,
    };

  it('accepts every frame the host really sends', () => {
    const {
      host,
      hostEnds,
      peerEnds,
      all,
      tick,
    } =
      setup(
        [
          'alice',
        ],
      );
    const seen: unknown[] =
      [];
    const end =
      peerEnds.get(
        'alice',
      )!;
    const original =
      end.onmessage;
    end.onmessage =
      (
        d,
      ) => {
        const f =
          decodeFrame(
            d,
          );
        if (
          f.kind ===
          'json'
        )
          seen.push(
            f.value,
          );
        original?.(
          d,
        );
      };
    host.submit(
      {
        type: 'place',
        kind: 'park',
        x: 10,
        z: 10,
      },
    );
    // a refusal for alice (the tile is taken this tick), so a reject frame exists too
    hostEnds
      .get(
        'alice',
      )!
      .other.send(
        encodeJson(
          {
            t: 'cmd',
            seq: 0,
            cmd: {
              type: 'place',
              kind: 'cottage',
              x: 10,
              z: 10,
            },
          },
        ),
      );
    settle(
      all,
    );
    tick(
      2,
    );
    expect(
      seen.length,
    ).toBeGreaterThan(
      2,
    );
    for (const f of seen)
      expect(
        hostMessageSchema.safeParse(
          f,
        )
          .success,
        JSON.stringify(
          f,
        ),
      ).toBe(
        true,
      );
    expect(
      (
        seen as {
          t: string;
        }[]
      ).some(
        (
          f,
        ) =>
          f.t ===
          'reject',
      ),
    ).toBe(
      true,
    );
  });

  it('rejects malformed frames of every kind', () => {
    const bad: unknown[] =
      [
        null,
        42,
        'tick',
        [],
        {},
        {
          t: 'nope',
        },
        {
          ...welcome,
          extra: 1,
        },
        {
          ...welcome,
          v: 'one',
        },
        {
          ...welcome,
          you: '',
        },
        {
          t: 'tick',
          n: -1,
          cmds: [],
          acks: {},
        },
        {
          t: 'tick',
          n: 1.5,
          cmds: [],
          acks: {},
        },
        {
          t: 'tick',
          n: 1,
          cmds: [
            {
              p: 'a',
              cmd: {
                type: 'teleport',
              },
            },
          ],
          acks: {},
        },
        {
          t: 'tick',
          n: 1,
          cmds: [
            {
              p: 'a',
              cmd: {
                type: 'place',
                kind: 'cottage',
                x: 1e9,
                z: 0,
              },
            },
          ],
          acks: {},
        },
        {
          t: 'tick',
          n: 1,
          cmds: Array.from(
            {
              length: 513,
            },
            () => ({
              p: 'a',
              cmd: {
                type: 'reload',
              },
            }),
          ),
          acks: {},
        },
        {
          t: 'tick',
          n: 1,
          cmds: [],
          acks: {
            a: 'x',
          },
        },
        {
          t: 'tick',
          n: 1,
          cmds: [],
          acks: Object.fromEntries(
            Array.from(
              {
                length: 65,
              },
              (
                _,
                i,
              ) => [
                `p${i}`,
                1,
              ],
            ),
          ),
        },
        {
          t: 'successor',
          id: 7,
        },
        {
          t: 'reject',
        },
        {
          t: 'reject',
          items:
            [
              [
                1.5,
                'cannot-afford',
              ],
            ],
        },
        {
          t: 'reject',
          items:
            [
              [
                -1,
                'cannot-afford',
              ],
            ],
        },
        {
          t: 'reject',
          items:
            [
              [
                1,
                '<script>alert(1)</script>',
              ],
            ],
        },
        {
          t: 'reject',
          items:
            [
              [
                1,
                'UPPER',
              ],
            ],
        },
        {
          t: 'reject',
          items:
            [
              [
                1,
                'x'.repeat(
                  40,
                ),
              ],
            ],
        },
        {
          t: 'reject',
          items:
            [
              [
                1,
              ],
            ],
        },
        {
          t: 'reject',
          items:
            [
              [
                1,
                'ok',
                'extra',
              ],
            ],
        },
        {
          t: 'reject',
          items:
            Array.from(
              {
                length:
                  MAX_REJECT_ITEMS +
                  1,
              },
              (
                _,
                i,
              ) => [
                i,
                'occupied',
              ],
            ),
        },
        {
          t: 'reject',
          items:
            [],
          extra: true,
        },
      ];
    for (const f of bad)
      expect(
        hostMessageSchema.safeParse(
          f,
        )
          .success,
        JSON.stringify(
          f,
        )?.slice(
          0,
          80,
        ),
      ).toBe(
        false,
      );
    expect(
      hostMessageSchema.safeParse(
        {
          t: 'reject',
          items:
            [
              [
                3,
                'cannot-afford',
              ],
              [
                4,
                'rate-limited',
              ],
            ],
        },
      )
        .success,
    ).toBe(
      true,
    );
  });

  it('a hostile or broken host cannot crash a peer or corrupt its replica: garbage is counted and ignored', () => {
    const {
      host,
      peers,
      hostEnds,
      all,
      tick,
    } =
      setup(
        [
          'alice',
        ],
      );
    const alice =
      peers.get(
        'alice',
      )!;
    const before =
      JSON.stringify(
        alice
          .view!
          .buildings,
      ) +
      alice
        .view!
        .tick;
    const toAlice =
      hostEnds.get(
        'alice',
      )!;
    let seed = 7;
    const rnd =
      () =>
        (seed =
          (seed *
            1103515245 +
            12345) >>>
          0) /
        2 **
          32;
    const junk: Uint8Array[] =
      [
        new Uint8Array(
          0,
        ),
        new Uint8Array(
          [
            1,
          ],
        ),
        new Uint8Array(
          [
            2,
          ],
        ),
        new Uint8Array(
          [
            9,
            9,
            9,
          ],
        ),
        new Uint8Array(
          [
            1,
            ...new TextEncoder().encode(
              '{not json',
            ),
          ],
        ),
      ];
    for (
      let i = 0;
      i <
      300;
      i++
    )
      junk.push(
        Uint8Array.from(
          {
            length:
              1 +
              Math.floor(
                rnd() *
                  400,
              ),
          },
          () =>
            Math.floor(
              rnd() *
                256,
            ),
        ),
      );
    for (
      let i = 0;
      i <
      100;
      i++
    ) {
      const shapes =
        [
          {
            t: 'tick',
            n: Math.floor(
              rnd() *
                1e6,
            ),
            cmds: [
              {
                p: 'x',
                cmd: {
                  type: 'place',
                  kind: 'cottage',
                  x: -5,
                  z: 1e7,
                },
              },
            ],
            acks: {},
          },
          {
            t: 'reject',
            items:
              [
                [
                  Math.floor(
                    rnd() *
                      1000,
                  ),
                  'occupied'.repeat(
                    1 +
                      Math.floor(
                        rnd() *
                          5,
                      ),
                  ),
                ],
              ],
          },
          {
            t: 'welcome',
            v: 1e9,
            you: 'a',
            successor:
              'b',
          },
        ];
      junk.push(
        encodeJson(
          shapes[
            i %
              3
          ] as never,
        ),
      );
    }
    for (const j of junk)
      toAlice.send(
        j,
      );
    expect(
      () =>
        settle(
          all,
        ),
    ).not.toThrow();
    expect(
      alice
        .stats
        .protocolErrors,
    ).toBeGreaterThan(
      100,
    );
    // Still a true replica of the host: more ticks keep it identical.
    tick(
      3,
    );
    expect(
      alice.ready,
    ).toBe(
      true,
    );
    expect(
      alice
        .view!
        .tick,
    ).toBe(
      host
        .world
        .tick,
    );
    expect(
      JSON.stringify(
        alice
          .view!
          .buildings,
      ),
    ).toBe(
      JSON.stringify(
        host
          .world
          .buildings,
      ),
    );
    expect(
      before,
    ).toBeDefined();
  });

  it('a host of an older rulebook or a newer protocol is refused, not half-understood; the current one is welcome', () => {
    expect(
      MIN_PROTOCOL_VERSION,
    ).toBeLessThanOrEqual(
      PROTOCOL_VERSION,
    );
    const mk =
      (
        v: number,
      ) => {
        const [
          h,
          p,
        ] =
          linkPair();
        const peer =
          new PeerSession(
            'alice',
            p,
          );
        h.send(
          encodeJson(
            {
              t: 'welcome',
              v,
              you: 'alice',
              successor:
                null,
            },
          ),
        );
        settle(
          [
            h,
            p,
          ],
        );
        return {
          peer,
          p,
        };
      };
    const old =
      mk(
        MIN_PROTOCOL_VERSION,
      );
    expect(
      old
        .peer
        .incompatible,
    ).toBe(
      false,
    );
    expect(
      old
        .p
        .open,
    ).toBe(
      true,
    );
    // v3 changed the simulation (tax rate, town events): a v2 host's replicas would drift from ours, so it is refused.
    const older =
      mk(
        MIN_PROTOCOL_VERSION -
          1,
      );
    expect(
      older
        .peer
        .incompatible,
    ).toBe(
      true,
    );
    expect(
      older
        .p
        .open,
    ).toBe(
      false,
    );
    const newer =
      mk(
        PROTOCOL_VERSION +
          1,
      );
    expect(
      newer
        .peer
        .incompatible,
    ).toBe(
      true,
    );
    expect(
      newer
        .p
        .open,
    ).toBe(
      false,
    );
  });
});

describe('a peer cannot make the host spend its bandwidth', () => {
  it('coalesces and spaces out resync requests: a flood yields one snapshot per cooldown, never none', () => {
    const {
      host,
      peerEnds,
      hostEnds,
      tick,
      all,
    } =
      setup(
        [
          'alice',
        ],
      );
    const start =
      host
        .stats
        .snapshots;
    const toHost =
      peerEnds.get(
        'alice',
      )!;
    for (
      let i = 0;
      i <
      500;
      i++
    )
      toHost.send(
        encodeJson(
          {
            t: 'resync',
          },
        ),
      );
    settle(
      all,
    );
    tick(
      5,
    );
    // The cooldown from the join snapshot has not elapsed: nothing yet…
    expect(
      host
        .stats
        .snapshots,
    ).toBe(
      start,
    );
    tick(
      SNAPSHOT_MIN_TICKS,
    );
    // …then exactly one, however many were asked.
    expect(
      host
        .stats
        .snapshots,
    ).toBe(
      start +
        1,
    );
    tick(
      SNAPSHOT_MIN_TICKS *
        3,
    );
    expect(
      host
        .stats
        .snapshots,
    ).toBe(
      start +
        1,
    );
    expect(
      hostEnds.get(
        'alice',
      )!
        .open,
    ).toBe(
      true,
    );
  });

  it('a peer waiting for a snapshot that never came asks again', () => {
    const {
      host,
      peers,
      hostEnds,
      clock,
      peerEnds,
      tick,
    } =
      setup(
        [
          'alice',
        ],
      );
    const alice =
      peers.get(
        'alice',
      )!;
    // Alice misses a tick: she asks, and the host's answer is lost.
    let dropSnapshots = true;
    hostEnds.get(
      'alice',
    )!.filter =
      (
        d,
      ) =>
        !(
          dropSnapshots &&
          d[0] ===
            2
        );
    host.submit(
      {
        type: 'place',
        kind: 'park',
        x: 3,
        z: 3,
      },
    );
    hostEnds.get(
      'alice',
    )!.filter =
      (
        d,
      ) =>
        d[0] !==
          1 &&
        !(
          dropSnapshots &&
          d[0] ===
            2
        );
    host.step();
    settle(
      [
        ...hostEnds.values(),
        ...peerEnds.values(),
      ],
    );
    hostEnds.get(
      'alice',
    )!.filter =
      (
        d,
      ) =>
        !(
          dropSnapshots &&
          d[0] ===
            2
        );
    tick(
      SNAPSHOT_MIN_TICKS +
        5,
    );
    expect(
      alice.ready,
    ).toBe(
      false,
    );
    dropSnapshots = false;
    clock.now += 5_000;
    alice.update(); // the retry
    tick(
      SNAPSHOT_MIN_TICKS +
        5,
    );
    expect(
      alice.ready,
    ).toBe(
      true,
    );
    expect(
      alice
        .view!
        .tick,
    ).toBe(
      host
        .world
        .tick,
    );
  });
});

describe('the world is unchanged by applying commands one at a time', () => {
  it('is identical to one stepWorld call with the whole tick (what every replica does)', () => {
    const a =
      createWorld(
        9,
        32,
      );
    const b =
      createWorld(
        9,
        32,
      );
    const players =
      [
        'p1',
        'p2',
        'p3',
      ];
    for (const id of players) {
      stepWorld(
        a,
        0,
        [
          {
            type: 'join',
            playerId:
              id,
          },
        ],
      );
      stepWorld(
        b,
        0,
        [
          {
            type: 'join',
            playerId:
              id,
          },
        ],
      );
    }
    const m = 16;
    const cmds =
      [
        {
          type: 'place',
          kind: 'park',
          x:
            m +
            1,
          z: m,
          playerId:
            'p1',
        },
        {
          type: 'place',
          kind: 'cottage',
          x:
            m +
            1,
          z: m,
          playerId:
            'p2',
        }, // occupied
        {
          type: 'move',
          x:
            m +
            3,
          z: m,
          playerId:
            'p3',
        },
        {
          type: 'place',
          kind: 'cottage',
          x:
            m +
            2,
          z: m,
          playerId:
            'p2',
        },
        {
          type: 'sell',
          item: 'bread',
          qty: 5,
          playerId:
            'p1',
        }, // nothing to sell
      ] as never[];
    for (
      let t = 0;
      t <
      10;
      t++
    ) {
      for (const c of cmds)
        stepWorld(
          a,
          0,
          [
            c,
          ],
        );
      stepWorld(
        a,
        50,
        [],
      );
      stepWorld(
        b,
        50,
        cmds,
      );
    }
    expect(
      JSON.stringify(
        a,
      ),
    ).toBe(
      JSON.stringify(
        b,
      ),
    );
  });
});
