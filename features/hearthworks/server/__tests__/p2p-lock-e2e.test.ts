/**
 * Room passwords and the silent-host report, through the real hub handler AND the real connector (the rig of
 * __tests__/harness.ts: fake network and clock, nothing else faked).
 *
 * Main suite: the lock is enforced end to end — the connector sends the password only to the hub, a refused one
 * ends the attempt cleanly (no half-open session), the lock survives a change of host, and a member that lost its
 * host says so to the hub.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { resetHearthworksP2pForTests } from '../p2p';
import {
  Rig,
  type Player,
} from './harness';

process.env.LOG_LEVEL =
  'silent';

const PW =
  'swordfish';
let rig: Rig;

beforeEach(
  () => {
    vi.useFakeTimers();
    rig =
      new Rig();
  },
);
afterEach(
  () => {
    resetHearthworksP2pForTests();
    vi.useRealTimers();
  },
);

async function startLocked(
  p: Player,
  password = PW,
): Promise<string> {
  await p.connector.hostRoom(
    {
      name: 'locked world',
      maxPlayers: 4,
      world:
        p.store.getState()
          .world,
      password,
    },
  );
  await rig.until(
    () =>
      p
        .connector
        .state
        .phase ===
      'hosting',
    'hosting',
  );
  return p
    .connector
    .state
    .code!;
}

describe('a locked room, end to end', () => {
  it('lists with a lock, refuses a missing or wrong password with an error and no half-open session, admits the right one', async () => {
    const h =
      rig.addPlayer(
        'host',
        'acct-host',
        'Hosty',
      );
    const code =
      await startLocked(
        h,
      );
    expect(
      h
        .connector
        .state
        .locked,
    ).toBe(
      true,
    );

    const a =
      rig.addPlayer(
        'ann',
        'acct-ann',
        'Ann',
      );
    a.connector.refreshRooms();
    expect(
      a
        .connector
        .state
        .rooms,
    ).toEqual(
      [
        {
          code,
          name: 'locked world',
          host: 'Hosty',
          players: 1,
          maxPlayers: 4,
          world:
            {
              seed: 7,
              size: 24,
            },
          locked: true,
        },
      ],
    );

    await a.connector.joinRoom(
      code,
    );
    await rig.until(
      () =>
        a
          .connector
          .state
          .phase ===
        'closed',
      'refused without a password',
    );
    expect(
      a
        .connector
        .state
        .error,
    ).toBe(
      'password-required',
    );
    expect(
      a.store.getState()
        .driver,
    ).toBeNull();

    await a.connector.joinRoom(
      code,
      'nope nope',
    );
    await rig.until(
      () =>
        a
          .connector
          .state
          .phase ===
          'closed' &&
        a
          .connector
          .state
          .error ===
          'wrong-password',
      'refused with a wrong password',
    );
    expect(
      a.store.getState()
        .driver,
    ).toBeNull();

    await a.connector.joinRoom(
      code,
      PW,
    );
    await rig.until(
      () =>
        a
          .connector
          .state
          .phase ===
        'member',
      'admitted with the right one',
    );
    expect(
      a
        .connector
        .state
        .locked,
    ).toBe(
      true,
    );
    await rig.until(
      () =>
        (
          a
            .connector
            .session as {
            peer: {
              ready: boolean;
            };
          }
        )
          .peer
          .ready,
      'has the world',
    );
  });

  it('sends the password only to the hub, only in host and join requests, and never anywhere else', async () => {
    const h =
      rig.addPlayer(
        'host',
        'acct-host',
        'Hosty',
      );
    const code =
      await startLocked(
        h,
      );
    const a =
      rig.addPlayer(
        'ann',
        'acct-ann',
        'Ann',
      );
    await a.connector.joinRoom(
      code,
      PW,
    );
    await rig.until(
      () =>
        a
          .connector
          .state
          .phase ===
        'member',
      'ann in',
    );
    await rig.advance(
      500,
    );
    const carrying =
      (
        p: Player,
      ) =>
        p.hub.sent
          .filter(
            (
              s,
            ) =>
              JSON.stringify(
                s.data ??
                  null,
              ).includes(
                PW,
              ),
          )
          .map(
            (
              s,
            ) =>
              s.event,
          );
    expect(
      carrying(
        h,
      ),
    ).toEqual(
      [
        'hearthworks:p2p:host',
      ],
    );
    expect(
      carrying(
        a,
      ),
    ).toEqual(
      [
        'hearthworks:p2p:join',
      ],
    );
    // Nothing the hub sent to anybody contains it.
    for (const p of [
      h,
      a,
    ])
      expect(
        JSON.stringify(
          p
            .socket
            .received,
        ),
      ).not.toContain(
        PW,
      );
    // And the session traffic (the data channels) never mentions it either.
    expect(
      JSON.stringify(
        h.store.getState()
          .world,
      ),
    ).not.toContain(
      PW,
    );
  });

  it('keeps the lock when the host changes: a stranger still needs the password', async () => {
    const h =
      rig.addPlayer(
        'host',
        'acct-host',
        'Hosty',
      );
    const code =
      await startLocked(
        h,
      );
    const a =
      rig.addPlayer(
        'ann',
        'acct-ann',
        'Ann',
      );
    await a.connector.joinRoom(
      code,
      PW,
    );
    await rig.until(
      () =>
        a
          .connector
          .state
          .phase ===
        'member',
      'ann in',
    );
    await rig.until(
      () =>
        (
          a
            .connector
            .session as {
            peer: {
              ready: boolean;
            };
          }
        )
          .peer
          .ready,
      'ann has the world',
    );
    await rig.until(
      () =>
        h.hub.sent.some(
          (
            s,
          ) =>
            s.event ===
            'hearthworks:p2p:successor',
        ),
      'successor named',
    );
    h.connector.leave();
    await rig.until(
      () =>
        a
          .connector
          .state
          .role ===
        'host',
      'ann promoted',
    );
    expect(
      a
        .connector
        .state
        .locked,
    ).toBe(
      true,
    );

    const c =
      rig.addPlayer(
        'cy',
        'acct-cy',
        'Cy',
      );
    await c.connector.joinRoom(
      code,
    );
    await rig.until(
      () =>
        c
          .connector
          .state
          .phase ===
        'closed',
      'cy refused',
    );
    expect(
      c
        .connector
        .state
        .error,
    ).toBe(
      'password-required',
    );
    await c.connector.joinRoom(
      code,
      PW,
    );
    await rig.until(
      () =>
        c
          .connector
          .state
          .phase ===
        'member',
      'cy admitted with the password',
    );
  });

  it("re-claims a room with its lock after the hub restarted (the new host's password is remembered by the tab)", async () => {
    const h =
      rig.addPlayer(
        'host',
        'acct-host',
        'Hosty',
      );
    const code =
      await startLocked(
        h,
      );
    resetHearthworksP2pForTests(); // the hub forgot every room
    await rig.reconnectHub(
      h,
      300,
    );
    await rig.advance(
      500,
    );
    expect(
      h
        .connector
        .state
        .phase,
    ).toBe(
      'hosting',
    );
    const c =
      rig.addPlayer(
        'cy',
        'acct-cy',
        'Cy',
      );
    await c.connector.joinRoom(
      code,
    );
    await rig.until(
      () =>
        c
          .connector
          .state
          .phase ===
        'closed',
      'cy refused',
    );
    expect(
      c
        .connector
        .state
        .error,
    ).toBe(
      'password-required',
    );
  });
});

describe('losing the host', () => {
  it('tells the hub the host went quiet, so it does not have to wait for its own heartbeat', async () => {
    const h =
      rig.addPlayer(
        'host',
        'acct-host',
        'Hosty',
      );
    const a =
      rig.addPlayer(
        'ann',
        'acct-ann',
        'Ann',
      );
    await h.connector.hostRoom(
      {
        name: 'w',
        maxPlayers: 4,
        world:
          h.store.getState()
            .world,
      },
    );
    await rig.until(
      () =>
        h
          .connector
          .state
          .phase ===
        'hosting',
      'hosting',
    );
    await a.connector.joinRoom(
      h
        .connector
        .state
        .code!,
    );
    await rig.until(
      () =>
        a
          .connector
          .state
          .phase ===
        'member',
      'ann in',
    );
    // Only the DataChannels die (the host's hub socket stays): the member's link times out, then it reports.
    rig.peers.kill(
      'host',
    );
    await rig.until(
      () =>
        a.hub.sent.some(
          (
            s,
          ) =>
            s.event ===
            'hearthworks:p2p:host-silent',
        ),
      'ann reports the silent host',
      20_000,
    );
  });
});
