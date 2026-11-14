/**
 * Hearthworks room passwords and the host liveness probe, on the real hub handler (fake socket.io world).
 *
 * Main suite: the password is an access boundary (who may enter a room) and must never leak — not in a payload,
 * not in the room list, not in a log line — and guessing it is rate limited per account, per socket and per room.
 * The probe decides when a room changes hands, so a wrong answer there moves someone's world.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  handleHearthworksP2pDisconnect,
  registerHearthworksP2pHandlers,
  resetHearthworksP2pForTests,
} from '../p2p';
import {
  HW_C2S,
  HW_LIMITS,
  HW_S2C,
  zHubErrorCode,
  type HwS2CPayload,
} from '@features/hearthworks/engine/net/events';
import {
  DEFAULT_GUARD_LIMITS,
  PasswordGuard,
  checkLock,
  makeLock,
} from '../../../../server/socket-server/p2p/room-password';
import { logger } from '../../../../server/socket-server/logger';
import {
  all,
  last,
  makeWorld,
  type FakeSocket,
} from '../../../../server/socket-server/test-support/fake-world';

process.env.LOG_LEVEL =
  'silent';

const WORLD =
  {
    seed: 20261104,
    size: 32,
  };
const HOST =
  {
    name: 'Moss Hollow',
    maxPlayers: 4,
    world:
      WORLD,
  };
const PW =
  'correct horse';

type S2C =
  {
    [
      K in keyof typeof HW_S2C
    ]: HwS2CPayload<K>;
  };
let world: ReturnType<
  typeof makeWorld
>;

const acct =
  (
    id: string,
    name = id,
  ) =>
    world.connect(
      `sock-${id}-${Math.random().toString(36).slice(2, 6)}`,
      {
        userId:
          id,
        userName:
          name,
      },
    );
const errors =
  (
    s: FakeSocket,
  ) =>
    all<
      S2C['hearthworks:p2p:error']
    >(
      s,
      'hearthworks:p2p:error',
    ).map(
      (
        e,
      ) =>
        e.code,
    );
const lastOf =
  <
    K extends
      keyof S2C,
  >(
    s: FakeSocket,
    e: K,
  ) =>
    last<
      S2C[K]
    >(
      s,
      e,
    );
const disconnect =
  (
    s: FakeSocket,
  ) => {
    handleHearthworksP2pDisconnect(
      world.io,
      s as never,
    );
    world.disconnect(
      s,
    );
  };

function host(
  s: FakeSocket,
  over: Record<
    string,
    unknown
  > = {},
) {
  world.send(
    s,
    'hearthworks:p2p:host',
    {
      ...HOST,
      ...over,
    },
  );
  const hosted =
    lastOf(
      s,
      'hearthworks:p2p:hosted',
    );
  if (
    !hosted
  )
    throw new Error(
      `not hosted: ${errors(s).join(',')}`,
    );
  return hosted;
}
const tryJoin =
  (
    m: FakeSocket,
    code: string,
    password?: string,
  ) =>
    world.send(
      m,
      'hearthworks:p2p:join',
      password ===
        undefined
        ? {
            code,
          }
        : {
            code,
            password,
          },
    );

function admit(
  h: FakeSocket,
  m: FakeSocket,
): string {
  const req =
    lastOf(
      h,
      'hearthworks:p2p:join-request',
    );
  if (
    !req
  )
    throw new Error(
      `no join request: ${errors(m).join(',')}`,
    );
  world.send(
    h,
    'hearthworks:p2p:admit',
    {
      peerId:
        req.peerId,
      accept: true,
    },
  );
  return req.peerId;
}

beforeEach(
  () => {
    vi.useFakeTimers();
    world =
      makeWorld(
        registerHearthworksP2pHandlers,
      );
  },
);
afterEach(
  () => {
    resetHearthworksP2pForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
  },
);

describe('room-password.ts', () => {
  it('stores a salted hash, never the password, and compares the right and the wrong guess', () => {
    const a =
      makeLock(
        PW,
      );
    const b =
      makeLock(
        PW,
      );
    expect(
      a.salt.equals(
        b.salt,
      ),
    ).toBe(
      false,
    );
    expect(
      a.hash.equals(
        b.hash,
      ),
    ).toBe(
      false,
    ); // same password, different salt, different hash
    expect(
      JSON.stringify(
        [
          ...a.hash,
        ],
      ).includes(
        PW,
      ),
    ).toBe(
      false,
    );
    expect(
      Buffer.concat(
        [
          a.salt,
          a.hash,
        ],
      )
        .toString(
          'utf8',
        )
        .includes(
          PW,
        ),
    ).toBe(
      false,
    );
    expect(
      checkLock(
        a,
        PW,
      ),
    ).toBe(
      true,
    );
    expect(
      checkLock(
        a,
        PW +
          ' ',
      ),
    ).toBe(
      false,
    );
    expect(
      checkLock(
        a,
        '',
      ),
    ).toBe(
      false,
    );
    expect(
      checkLock(
        a,
        'x'.repeat(
          5000,
        ),
      ),
    ).toBe(
      false,
    ); // any length: fixed-size hashes are compared
  });

  it('limits guesses per account and room, per socket and per room, and a right guess clears the account', () => {
    const lock =
      makeLock(
        PW,
      );
    const guard =
      new PasswordGuard();
    const who =
      (
        userId: string,
        socketId = `s-${userId}`,
      ) => ({
        roomCode:
          'ABCDEF',
        userId,
        socketId,
      });
    for (
      let i = 0;
      i <
      DEFAULT_GUARD_LIMITS.perAccount;
      i++
    )
      expect(
        guard.attempt(
          lock,
          'nope',
          who(
            'mallory',
          ),
        ),
      ).toBe(
        'wrong',
      );
    // The sixth is refused without even looking at the guess — the right password included.
    expect(
      guard.attempt(
        lock,
        PW,
        who(
          'mallory',
        ),
      ),
    ).toBe(
      'rate-limited',
    );
    // Another account is unaffected…
    expect(
      guard.attempt(
        lock,
        PW,
        who(
          'alice',
        ),
      ),
    ).toBe(
      'ok',
    );
    // …and a right guess gives back the attempts.
    for (
      let i = 0;
      i <
      4;
      i++
    )
      guard.attempt(
        lock,
        'nope',
        who(
          'bob',
        ),
      );
    expect(
      guard.attempt(
        lock,
        PW,
        who(
          'bob',
        ),
      ),
    ).toBe(
      'ok',
    );
    for (
      let i = 0;
      i <
      4;
      i++
    )
      expect(
        guard.attempt(
          lock,
          'nope',
          who(
            'bob',
          ),
        ),
      ).toBe(
        'wrong',
      );
    // Throwaway accounts on ONE socket hit the socket limit.
    const guard2 =
      new PasswordGuard();
    let refused = 0;
    for (
      let i = 0;
      i <
      40;
      i++
    )
      if (
        guard2.attempt(
          lock,
          'nope',
          who(
            `u${i}`,
            'one-socket',
          ),
        ) ===
        'rate-limited'
      )
        refused++;
    expect(
      refused,
    ).toBe(
      40 -
        DEFAULT_GUARD_LIMITS.perSocket,
    );
    // A swarm of accounts on a swarm of sockets hits the room limit.
    const guard3 =
      new PasswordGuard();
    let wrong = 0;
    for (
      let i = 0;
      i <
      300;
      i++
    )
      if (
        guard3.attempt(
          lock,
          'nope',
          who(
            `v${i}`,
            `sock${i}`,
          ),
        ) ===
        'wrong'
      )
        wrong++;
    expect(
      wrong,
    ).toBe(
      DEFAULT_GUARD_LIMITS.perRoom,
    );
    // Time heals it.
    vi.advanceTimersByTime(
      DEFAULT_GUARD_LIMITS.windowMs +
        1000,
    );
    expect(
      guard3.attempt(
        lock,
        PW,
        who(
          'w1',
          'fresh',
        ),
      ),
    ).toBe(
      'ok',
    );
  });
});

describe('a locked room', () => {
  it('lists as locked (a flag, no password), refuses a join without or with a wrong password, admits the right one', () => {
    const h =
      acct(
        'hosty',
        'Hosty',
      );
    const {
      code,
    } =
      host(
        h,
        {
          password:
            PW,
        },
      );
    const viewer =
      acct(
        'viewer',
      );
    world.send(
      viewer,
      'hearthworks:p2p:list',
      {},
    );
    const rooms =
      lastOf(
        viewer,
        'hearthworks:p2p:rooms',
      )!.rooms;
    expect(
      rooms,
    ).toHaveLength(
      1,
    );
    expect(
      rooms[0],
    ).toMatchObject(
      {
        code,
        locked: true,
      },
    );
    expect(
      JSON.stringify(
        rooms,
      ),
    ).not.toContain(
      PW,
    );

    const m =
      acct(
        'mia',
      );
    tryJoin(
      m,
      code,
    );
    expect(
      errors(
        m,
      ),
    ).toEqual(
      [
        'password-required',
      ],
    );
    tryJoin(
      m,
      code,
      'wrong one',
    );
    expect(
      errors(
        m,
      ),
    ).toEqual(
      [
        'password-required',
        'wrong-password',
      ],
    );
    expect(
      lastOf(
        h,
        'hearthworks:p2p:join-request',
      ),
    ).toBeUndefined(); // the host was never bothered
    expect(
      lastOf(
        m,
        'hearthworks:p2p:joining',
      ),
    ).toBeUndefined();

    tryJoin(
      m,
      code,
      PW,
    );
    expect(
      lastOf(
        m,
        'hearthworks:p2p:joining',
      ),
    ).toMatchObject(
      {
        code,
      },
    );
    expect(
      lastOf(
        h,
        'hearthworks:p2p:join-request',
      ),
    ).toMatchObject(
      {
        userId:
          'mia',
      },
    );
    admit(
      h,
      m,
    );
    expect(
      lastOf(
        m,
        'hearthworks:p2p:admitted',
      ),
    ).toMatchObject(
      {
        code,
      },
    );
  });

  it('an open room does not list as locked and ignores a password a joiner volunteers', () => {
    const h =
      acct(
        'hosty',
      );
    const {
      code,
    } =
      host(
        h,
      );
    const viewer =
      acct(
        'viewer',
      );
    world.send(
      viewer,
      'hearthworks:p2p:list',
      {},
    );
    expect(
      lastOf(
        viewer,
        'hearthworks:p2p:rooms',
      )!
        .rooms[0],
    ).not.toHaveProperty(
      'locked',
    );
    const m =
      acct(
        'mia',
      );
    tryJoin(
      m,
      code,
      'anything',
    );
    expect(
      lastOf(
        m,
        'hearthworks:p2p:joining',
      ),
    ).toMatchObject(
      {
        code,
      },
    );
  });

  it('is brute-force limited: after five wrong guesses even the right password is refused for a while', () => {
    const h =
      acct(
        'hosty',
      );
    const {
      code,
    } =
      host(
        h,
        {
          password:
            PW,
        },
      );
    const m =
      acct(
        'mallory',
      );
    for (
      let i = 0;
      i <
      DEFAULT_GUARD_LIMITS.perAccount;
      i++
    )
      tryJoin(
        m,
        code,
        `guess ${i}`,
      );
    expect(
      errors(
        m,
      ).filter(
        (
          e,
        ) =>
          e ===
          'wrong-password',
      ),
    ).toHaveLength(
      DEFAULT_GUARD_LIMITS.perAccount,
    );
    tryJoin(
      m,
      code,
      PW,
    );
    expect(
      errors(
        m,
      ).at(
        -1,
      ),
    ).toBe(
      'rate-limited',
    );
    expect(
      lastOf(
        m,
        'hearthworks:p2p:joining',
      ),
    ).toBeUndefined();
    // The same account on a new socket (a reconnect) is still limited: the key is the account, not the socket.
    const m2 =
      acct(
        'mallory',
      );
    tryJoin(
      m2,
      code,
      PW,
    );
    expect(
      errors(
        m2,
      ),
    ).toEqual(
      [
        'rate-limited',
      ],
    );
    vi.advanceTimersByTime(
      DEFAULT_GUARD_LIMITS.windowMs +
        1000,
    );
    tryJoin(
      m2,
      code,
      PW,
    );
    expect(
      lastOf(
        m2,
        'hearthworks:p2p:joining',
      ),
    ).toMatchObject(
      {
        code,
      },
    );
  });

  it('never puts the password in any payload any socket receives, nor in a log line', () => {
    const spies =
      (
        [
          'info',
          'warn',
          'error',
          'debug',
        ] as const
      ).map(
        (
          level,
        ) =>
          vi.spyOn(
            logger,
            level,
          ),
      );
    const h =
      acct(
        'hosty',
      );
    const {
      code,
    } =
      host(
        h,
        {
          password:
            PW,
        },
      );
    const a =
      acct(
        'ann',
      );
    const b =
      acct(
        'bob',
      );
    tryJoin(
      a,
      code,
      PW,
    );
    const pa =
      admit(
        h,
        a,
      );
    tryJoin(
      b,
      code,
      'bobs wrong guess',
    );
    tryJoin(
      b,
      code,
      PW,
    );
    admit(
      h,
      b,
    );
    world.send(
      a,
      'hearthworks:p2p:list',
      {},
    );
    world.send(
      h,
      'hearthworks:p2p:kick',
      {
        peerId:
          pa,
      },
    );
    disconnect(
      h,
    );
    vi.advanceTimersByTime(
      HW_LIMITS.MIGRATE_GRACE_MS +
        10,
    );
    for (const s of world.sockets.values()) {
      for (const r of s.received) {
        const text =
          JSON.stringify(
            r.payload,
          );
        expect(
          text,
          r.event,
        ).not.toContain(
          PW,
        );
        expect(
          text,
          r.event,
        ).not.toContain(
          'bobs wrong guess',
        );
      }
    }
    for (const spy of spies)
      for (const call of spy
        .mock
        .calls)
        expect(
          JSON.stringify(
            call,
          ),
        ).not.toContain(
          PW,
        );
  });

  it('keeps the lock when the host changes: a stranger still needs the password after a handover', () => {
    const h =
      acct(
        'hosty',
      );
    const {
      code,
    } =
      host(
        h,
        {
          password:
            PW,
        },
      );
    const a =
      acct(
        'ann',
      );
    tryJoin(
      a,
      code,
      PW,
    );
    admit(
      h,
      a,
    );
    world.send(
      h,
      'hearthworks:p2p:leave',
      {},
    ); // hands the room to Ann
    expect(
      lastOf(
        a,
        'hearthworks:p2p:promote',
      ),
    ).toMatchObject(
      {
        code,
      },
    );
    const stranger =
      acct(
        'stranger',
      );
    tryJoin(
      stranger,
      code,
    );
    expect(
      errors(
        stranger,
      ),
    ).toEqual(
      [
        'password-required',
      ],
    );
    tryJoin(
      stranger,
      code,
      'guess',
    );
    expect(
      errors(
        stranger,
      ),
    ).toEqual(
      [
        'password-required',
        'wrong-password',
      ],
    );
    tryJoin(
      stranger,
      code,
      PW,
    );
    expect(
      lastOf(
        stranger,
        'hearthworks:p2p:joining',
      ),
    ).toMatchObject(
      {
        code,
      },
    );
    const rooms =
      (() => {
        const v =
          acct(
            'viewer',
          );
        world.send(
          v,
          'hearthworks:p2p:list',
          {},
        );
        return lastOf(
          v,
          'hearthworks:p2p:rooms',
        )!
          .rooms;
      })();
    expect(
      rooms[0],
    ).toMatchObject(
      {
        code,
        locked: true,
      },
    );
  });

  it('a host that re-claims its room after the hub forgot it re-applies the lock', () => {
    const h =
      acct(
        'hosty',
      );
    const first =
      host(
        h,
        {
          password:
            PW,
        },
      );
    const keep =
      {
        code: first.code,
        token:
          first.token,
      };
    resetHearthworksP2pForTests(); // the hub restarted: no rooms
    const h2 =
      acct(
        'hosty',
      );
    world.send(
      h2,
      'hearthworks:p2p:host',
      {
        ...HOST,
        password:
          PW,
        resume:
          keep,
      },
    );
    expect(
      lastOf(
        h2,
        'hearthworks:p2p:hosted',
      ),
    ).toMatchObject(
      {
        code: first.code,
      },
    );
    const m =
      acct(
        'mia',
      );
    tryJoin(
      m,
      first.code,
    );
    expect(
      errors(
        m,
      ),
    ).toEqual(
      [
        'password-required',
      ],
    );
  });

  it('does not ask again an account that is already seated in the room (a reconnect)', () => {
    const h =
      acct(
        'hosty',
      );
    const {
      code,
    } =
      host(
        h,
        {
          password:
            PW,
        },
      );
    const a =
      acct(
        'ann',
      );
    tryJoin(
      a,
      code,
      PW,
    );
    admit(
      h,
      a,
    );
    // Ann's other tab / a rejoin while still seated: no password, no failure, no attempt spent.
    const a2 =
      acct(
        'ann',
      );
    tryJoin(
      a2,
      code,
    );
    expect(
      errors(
        a2,
      ),
    ).toEqual(
      [],
    );
    expect(
      lastOf(
        a2,
        'hearthworks:p2p:joining',
      ),
    ).toMatchObject(
      {
        code,
      },
    );
  });

  it('refuses a password that is too short or too long at the schema (and a join password over the cap)', () => {
    expect(
      HW_C2S[
        'hearthworks:p2p:host'
      ].safeParse(
        {
          ...HOST,
          password:
            'abc',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      HW_C2S[
        'hearthworks:p2p:host'
      ].safeParse(
        {
          ...HOST,
          password:
            'x'.repeat(
              HW_LIMITS.PASSWORD_MAX +
                1,
            ),
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      HW_C2S[
        'hearthworks:p2p:host'
      ].safeParse(
        {
          ...HOST,
          password:
            'abcd',
        },
      )
        .success,
    ).toBe(
      true,
    );
    expect(
      HW_C2S[
        'hearthworks:p2p:join'
      ].safeParse(
        {
          code: 'ABCDEF',
          password:
            'x'.repeat(
              HW_LIMITS.PASSWORD_MAX +
                1,
            ),
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      zHubErrorCode.options,
    ).toEqual(
      expect.arrayContaining(
        [
          'password-required',
          'wrong-password',
        ],
      ),
    );
  });
});

describe('the host liveness probe (host-silent)', () => {
  function room() {
    const h =
      acct(
        'hosty',
        'Hosty',
      );
    const {
      code,
    } =
      host(
        h,
      );
    const a =
      acct(
        'ann',
        'Ann',
      );
    const b =
      acct(
        'bob',
        'Bob',
      );
    tryJoin(
      a,
      code,
    );
    admit(
      h,
      a,
    );
    tryJoin(
      b,
      code,
    );
    admit(
      h,
      b,
    );
    return {
      h,
      a,
      b,
      code,
    };
  }

  it('asks the host to answer; a host that answers is left alone', () => {
    const {
      h,
      a,
      code,
    } =
      room();
    world.send(
      a,
      'hearthworks:p2p:host-silent',
      {},
    );
    expect(
      h.acks,
    ).toHaveLength(
      1,
    );
    expect(
      h
        .acks[0]
        .event,
    ).toBe(
      'hearthworks:p2p:probe',
    );
    h.acks[0].respond();
    vi.advanceTimersByTime(
      HW_LIMITS.MIGRATE_GRACE_MS +
        100,
    );
    expect(
      lastOf(
        a,
        'hearthworks:p2p:promote',
      ),
    ).toBeUndefined();
    expect(
      lastOf(
        h,
        'hearthworks:p2p:closed',
      ),
    ).toBeUndefined();
    // The room is still the host's.
    const v =
      acct(
        'viewer',
      );
    world.send(
      v,
      'hearthworks:p2p:list',
      {},
    );
    expect(
      lastOf(
        v,
        'hearthworks:p2p:rooms',
      )!
        .rooms[0]
        .code,
    ).toBe(
      code,
    );
  });

  it('a host that does not answer is deposed at once: the longest-connected member takes over, the old host is told', () => {
    const {
      h,
      a,
      b,
      code,
    } =
      room();
    world.send(
      b,
      'hearthworks:p2p:host-silent',
      {},
    ); // Bob noticed, but Ann (joined first) takes over
    h.acks[0].expire();
    expect(
      lastOf(
        h,
        'hearthworks:p2p:closed',
      ),
    ).toEqual(
      {
        code,
        reason:
          'host-lost',
      },
    );
    vi.advanceTimersByTime(
      HW_LIMITS.MIGRATE_GRACE_MS +
        10,
    );
    expect(
      lastOf(
        a,
        'hearthworks:p2p:promote',
      ),
    ).toMatchObject(
      {
        code,
      },
    );
    expect(
      lastOf(
        b,
        'hearthworks:p2p:host-changed',
      ),
    ).toMatchObject(
      {
        code,
        hostUserId:
          'ann',
      },
    );
    // The deposed host, thawing, is not the host any more.
    world.send(
      h,
      'hearthworks:p2p:admit',
      {
        peerId:
          'aaaaaaaaaa01',
        accept: true,
      },
    );
    expect(
      errors(
        h,
      ),
    ).toEqual(
      [
        'not-host',
      ],
    );
  });

  it('probes once at a time, and not at all for a pending (unadmitted) joiner or a stranger', () => {
    const {
      h,
      a,
      code,
    } =
      room();
    world.send(
      a,
      'hearthworks:p2p:host-silent',
      {},
    );
    world.send(
      a,
      'hearthworks:p2p:host-silent',
      {},
    );
    expect(
      h.acks,
    ).toHaveLength(
      1,
    );
    h.acks[0].respond();
    const pending =
      acct(
        'pat',
      );
    tryJoin(
      pending,
      code,
    ); // never admitted
    world.send(
      pending,
      'hearthworks:p2p:host-silent',
      {},
    );
    world.send(
      acct(
        'nobody',
      ),
      'hearthworks:p2p:host-silent',
      {},
    );
    expect(
      h.acks,
    ).toHaveLength(
      1,
    );
  });

  it('a member that re-asks to join while the host is unreachable keeps its seat and its place in the line', () => {
    const {
      h,
      a,
      b,
      code,
    } =
      room();
    // The host stops answering. Both members' links time out and they re-ask (as the connector does every 3 s).
    world.send(
      a,
      'hearthworks:p2p:host-silent',
      {},
    );
    tryJoin(
      b,
      code,
    );
    tryJoin(
      a,
      code,
    );
    // Re-asking must not have demoted them to "pending": the host's probe fails and Ann (joined first) takes over.
    h.acks[0].expire();
    vi.advanceTimersByTime(
      HW_LIMITS.MIGRATE_GRACE_MS +
        10,
    );
    expect(
      lastOf(
        a,
        'hearthworks:p2p:promote',
      ),
    ).toMatchObject(
      {
        code,
      },
    );
    expect(
      lastOf(
        b,
        'hearthworks:p2p:host-changed',
      ),
    ).toMatchObject(
      {
        hostUserId:
          'ann',
      },
    );
  });

  it('keeps a named successor named across its own re-join', () => {
    const {
      h,
      a,
      b,
      code,
    } =
      room();
    const pb =
      lastOf(
        h,
        'hearthworks:p2p:join-request',
      )!.peerId; // Bob's, the latest request
    world.send(
      h,
      'hearthworks:p2p:successor',
      {
        peerId:
          pb,
      },
    );
    tryJoin(
      b,
      code,
    ); // Bob re-asks: new peer id, same seat
    world.send(
      h,
      'hearthworks:p2p:leave',
      {},
    );
    expect(
      lastOf(
        b,
        'hearthworks:p2p:promote',
      ),
    ).toMatchObject(
      {
        code,
      },
    );
    expect(
      lastOf(
        a,
        'hearthworks:p2p:host-changed',
      ),
    ).toMatchObject(
      {
        hostUserId:
          'bob',
      },
    );
  });

  it('does nothing when the host socket is already gone (the grace is already running)', () => {
    const {
      h,
      a,
    } =
      room();
    disconnect(
      h,
    );
    world.send(
      a,
      'hearthworks:p2p:host-silent',
      {},
    );
    expect(
      h.acks,
    ).toHaveLength(
      0,
    );
  });
});
