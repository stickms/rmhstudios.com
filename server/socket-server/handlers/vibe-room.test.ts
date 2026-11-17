import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  VIBE_ROOM_C2S,
  VIBE_ROOM_S2C,
  type VibeRoomState,
} from '../../../lib/rmhvibe/room-events';
import {
  all,
  last,
  makeWorld,
} from '../test-support/fake-world';
import {
  handleVibeRoomDisconnect,
  registerVibeRoomHandlers,
  resetVibeRoomsForTests,
} from './vibe-room';

const mocks =
  vi.hoisted(
    () => ({
      findUnique:
        vi.fn(),
    }),
  );
vi.mock(
  '../prisma-client',
  () => ({
    getPrismaClient:
      () => ({
        vibePage:
          {
            findUnique:
              mocks.findUnique,
          },
      }),
  }),
);

const guest =
  (
    name: string,
  ) => ({
    discordGuest:
      {
        name,
        avatarUrl:
          null,
      },
  });
const errors =
  (
    s: Parameters<
      typeof all
    >[0],
  ) =>
    all<{
      code: string;
    }>(
      s,
      VIBE_ROOM_S2C.ERROR,
    ).map(
      (
        e,
      ) =>
        e.code,
    );

describe('vibe room', () => {
  let world: ReturnType<
    typeof makeWorld
  >;
  beforeEach(
    () => {
      resetVibeRoomsForTests();
      mocks.findUnique.mockReset();
      world =
        makeWorld(
          registerVibeRoomHandlers,
        );
    },
  );

  it('refuses an unauthenticated join', () => {
    const a =
      world.connect(
        'a',
      );
    world.send(
      a,
      VIBE_ROOM_C2S.JOIN,
      {
        instanceId:
          'i1',
      },
    );
    expect(
      errors(
        a,
      ),
    ).toEqual(
      [
        'AUTH',
      ],
    );
    expect(
      last(
        a,
        VIBE_ROOM_S2C.STATE,
      ),
    ).toBeUndefined();
  });

  it('refuses the 26th member', () => {
    for (
      let i = 0;
      i <
      25;
      i += 1
    ) {
      world.send(
        world.connect(
          `s${i}`,
          guest(
            `g${i}`,
          ),
        ),
        VIBE_ROOM_C2S.JOIN,
        {
          instanceId:
            'i1',
        },
      );
    }
    const late =
      world.connect(
        'late',
        guest(
          'late',
        ),
      );
    world.send(
      late,
      VIBE_ROOM_C2S.JOIN,
      {
        instanceId:
          'i1',
      },
    );
    expect(
      errors(
        late,
      ),
    ).toEqual(
      [
        'FULL',
      ],
    );
  });

  it('ignores SELECT from a non-host', () => {
    const a =
      world.connect(
        'a',
        guest(
          'a',
        ),
      );
    const b =
      world.connect(
        'b',
        guest(
          'b',
        ),
      );
    world.send(
      a,
      VIBE_ROOM_C2S.JOIN,
      {
        instanceId:
          'i1',
      },
    );
    world.send(
      b,
      VIBE_ROOM_C2S.JOIN,
      {
        instanceId:
          'i1',
      },
    );
    world.send(
      b,
      VIBE_ROOM_C2S.SELECT,
      {
        slug: 'neon',
      },
    );
    expect(
      errors(
        b,
      ),
    ).toEqual(
      [
        'NOT_HOST',
      ],
    );
    expect(
      mocks.findUnique,
    ).not.toHaveBeenCalled();
    expect(
      last<VibeRoomState>(
        a,
        VIBE_ROOM_S2C.STATE,
      )
        ?.slug,
    ).toBeNull();
  });

  it('promotes the next member when the host disconnects', async () => {
    vi.useFakeTimers();
    try {
      const a =
        world.connect(
          'a',
          guest(
            'a',
          ),
        );
      vi.advanceTimersByTime(
        5,
      );
      const b =
        world.connect(
          'b',
          guest(
            'b',
          ),
        );
      world.send(
        a,
        VIBE_ROOM_C2S.JOIN,
        {
          instanceId:
            'i1',
        },
      );
      vi.advanceTimersByTime(
        5,
      );
      world.send(
        b,
        VIBE_ROOM_C2S.JOIN,
        {
          instanceId:
            'i1',
        },
      );
      expect(
        last<VibeRoomState>(
          b,
          VIBE_ROOM_S2C.STATE,
        )
          ?.hostSid,
      ).toBe(
        'a',
      );
      handleVibeRoomDisconnect(
        world.io,
        a as never,
      );
      expect(
        last<VibeRoomState>(
          b,
          VIBE_ROOM_S2C.STATE,
        )
          ?.hostSid,
      ).toBe(
        'b',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('only lets the host pick a ready vibe', async () => {
    const a =
      world.connect(
        'a',
        guest(
          'a',
        ),
      );
    world.send(
      a,
      VIBE_ROOM_C2S.JOIN,
      {
        instanceId:
          'i1',
      },
    );
    mocks.findUnique.mockResolvedValueOnce(
      {
        status:
          'generating',
      },
    );
    world.send(
      a,
      VIBE_ROOM_C2S.SELECT,
      {
        slug: 'x',
      },
    );
    await vi.waitFor(
      () =>
        expect(
          errors(
            a,
          ),
        ).toEqual(
          [
            'BAD_SLUG',
          ],
        ),
    );
    mocks.findUnique.mockResolvedValueOnce(
      {
        status:
          'ready',
      },
    );
    world.send(
      a,
      VIBE_ROOM_C2S.SELECT,
      {
        slug: 'x',
      },
    );
    await vi.waitFor(
      () =>
        expect(
          last<VibeRoomState>(
            a,
            VIBE_ROOM_S2C.STATE,
          )
            ?.slug,
        ).toBe(
          'x',
        ),
    );
  });

  it('relays small messages to others and drops oversized or cyclic ones', () => {
    const a =
      world.connect(
        'a',
        guest(
          'a',
        ),
      );
    const b =
      world.connect(
        'b',
        guest(
          'b',
        ),
      );
    world.send(
      a,
      VIBE_ROOM_C2S.JOIN,
      {
        instanceId:
          'i1',
      },
    );
    world.send(
      b,
      VIBE_ROOM_C2S.JOIN,
      {
        instanceId:
          'i1',
      },
    );
    world.send(
      a,
      VIBE_ROOM_C2S.SEND,
      {
        data: {
          x: 1,
        },
      },
    );
    expect(
      all(
        b,
        VIBE_ROOM_S2C.MESSAGE,
      ),
    ).toEqual(
      [
        {
          fromSid:
            'a',
          data: {
            x: 1,
          },
        },
      ],
    );
    expect(
      all(
        a,
        VIBE_ROOM_S2C.MESSAGE,
      ),
    ).toEqual(
      [],
    );

    world.send(
      a,
      VIBE_ROOM_C2S.SEND,
      {
        data: 'x'.repeat(
          2049,
        ),
      },
    );
    const cyclic: Record<
      string,
      unknown
    > =
      {};
    cyclic.self =
      cyclic;
    world.send(
      a,
      VIBE_ROOM_C2S.SEND,
      {
        data: cyclic,
      },
    );
    expect(
      all(
        b,
        VIBE_ROOM_S2C.MESSAGE,
      ),
    ).toHaveLength(
      1,
    );
    expect(
      errors(
        a,
      ),
    ).toEqual(
      [
        'TOO_LARGE',
      ],
    );
  });
});
