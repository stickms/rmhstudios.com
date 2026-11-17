/**
 * Vibe room — the realtime layer of the Vibes Discord Activity.
 *
 * Everyone in one Activity instance joins one room (`vibe:room:<instanceId>`);
 * the host (earliest joiner) picks the vibe; multiplayer vibes relay small
 * messages through `SEND`. Anonymous Discord guests can connect, so this is an
 * abuse surface and every cap is enforced here: identity required, 25 members,
 * one room per socket, host-only SELECT of a `ready` vibe, 2048-char relay
 * payloads, and a per-socket rate limit on the relay.
 *
 * State is in memory per hub process, like every other Activity room. A
 * multi-process hub would need the Redis adapter path the hub already uses for
 * broadcasts (and shared room state); that is deliberately not built here.
 *
 * NOTE: server code imports `lib/` RELATIVELY — server/CLAUDE.md gotcha 7.
 */

import type {
  Server,
  Socket,
} from 'socket.io';
import {
  VIBE_ROOM_C2S,
  VIBE_ROOM_LIMITS,
  VIBE_ROOM_S2C,
  type VibeRoomErrorCode,
  type VibeRoomMember,
  type VibeRoomState,
} from '../../../lib/rmhvibe/room-events';
import { getPrismaClient } from '../prisma-client';
import { checkRateLimit } from '../rate-limit';
import { sanitizeString } from '../utils';

interface Member extends VibeRoomMember {
  joinedAt: number;
}

interface Room {
  instanceId: string;
  slug:
    | string
    | null;
  members: Map<
    string,
    Member
  >;
}

const rooms =
  new Map<
    string,
    Room
  >();
/** socket id -> the instance it is in (a socket is in at most one room). */
const roomOf =
  new Map<
    string,
    string
  >();

const SLUG_RE =
  /^[A-Za-z0-9_-]{1,100}$/;

const roomName =
  (
    instanceId: string,
  ) =>
    `vibe:room:${instanceId}`;

function fail(
  socket: Socket,
  code: VibeRoomErrorCode,
): void {
  socket.emit(
    VIBE_ROOM_S2C.ERROR,
    {
      code,
    },
  );
}

/**
 * User or Discord guest, from `socket.data` only (never the payload). Same
 * approach as Slice It's `identity()`: a linked account (`userId`) or a
 * verified Discord guest (`discordGuest`, name and avatar only).
 */
function identity(
  socket: Socket,
): {
  name: string;
  avatarUrl:
    | string
    | null;
  linked: boolean;
} | null {
  const data =
    socket.data ??
    {};
  if (
    typeof data.userId ===
      'string' &&
    data.userId
  ) {
    return {
      name:
        sanitizeString(
          data.userName,
          32,
        ) ||
        'Player',
      avatarUrl:
        typeof data.avatarUrl ===
        'string'
          ? data.avatarUrl
          : null,
      linked: true,
    };
  }
  const guest =
    data.discordGuest as
      | {
          name?: unknown;
          avatarUrl?: unknown;
        }
      | undefined;
  if (
    guest &&
    typeof guest.name ===
      'string'
  ) {
    return {
      name:
        sanitizeString(
          guest.name,
          32,
        ) ||
        'Guest',
      avatarUrl:
        typeof guest.avatarUrl ===
        'string'
          ? guest.avatarUrl
          : null,
      linked: false,
    };
  }
  return null;
}

/** Earliest `joinedAt` wins; Map insertion order breaks a same-millisecond tie. */
function hostSid(
  room: Room,
):
  | string
  | null {
  let host: Member | null =
    null;
  for (const m of room.members.values()) {
    if (
      !host ||
      m.joinedAt <
        host.joinedAt
    )
      host =
        m;
  }
  return (
    host?.sid ??
    null
  );
}

function stateOf(
  room: Room,
): VibeRoomState {
  return {
    instanceId:
      room.instanceId,
    slug: room.slug,
    hostSid:
      hostSid(
        room,
      ),
    members:
      [
        ...room.members.values(),
      ].map(
        ({
          sid,
          name,
          avatarUrl,
          linked,
          away,
        }) => ({
          sid,
          name,
          avatarUrl,
          linked,
          away,
        }),
      ),
  };
}

function broadcast(
  io: Server,
  room: Room,
): void {
  io.to(
    roomName(
      room.instanceId,
    ),
  ).emit(
    VIBE_ROOM_S2C.STATE,
    stateOf(
      room,
    ),
  );
}

function leaveRoom(
  io: Server,
  socket: Socket,
): void {
  const instanceId =
    roomOf.get(
      socket.id,
    );
  if (
    !instanceId
  )
    return;
  roomOf.delete(
    socket.id,
  );
  void socket.leave(
    roomName(
      instanceId,
    ),
  );
  const room =
    rooms.get(
      instanceId,
    );
  if (
    !room
  )
    return;
  room.members.delete(
    socket.id,
  );
  if (
    room
      .members
      .size ===
    0
  ) {
    rooms.delete(
      instanceId,
    );
    return;
  }
  broadcast(
    io,
    room,
  );
}

export function registerVibeRoomHandlers(
  io: Server,
  socket: Socket,
): void {
  const limited =
    (
      event: string,
    ): boolean => {
      if (
        checkRateLimit(
          socket.id,
          event,
        )
      )
        return false;
      fail(
        socket,
        'RATE',
      );
      return true;
    };

  socket.on(
    VIBE_ROOM_C2S.JOIN,
    (
      payload: unknown,
    ) => {
      if (
        limited(
          VIBE_ROOM_C2S.JOIN,
        )
      )
        return;
      const who =
        identity(
          socket,
        );
      if (
        !who
      )
        return fail(
          socket,
          'AUTH',
        );
      const instanceId =
        (
          payload as {
            instanceId?: unknown;
          } | null
        )
          ?.instanceId;
      if (
        typeof instanceId !==
          'string' ||
        !VIBE_ROOM_LIMITS.INSTANCE_ID.test(
          instanceId,
        )
      )
        return;

      const current =
        roomOf.get(
          socket.id,
        );
      if (
        current ===
        instanceId
      ) {
        // Idempotent rejoin: just resend the state.
        const existing =
          rooms.get(
            instanceId,
          );
        if (
          existing
        )
          broadcast(
            io,
            existing,
          );
        return;
      }
      if (
        current
      )
        leaveRoom(
          io,
          socket,
        );

      let room =
        rooms.get(
          instanceId,
        );
      if (
        room &&
        room
          .members
          .size >=
          VIBE_ROOM_LIMITS.MAX_MEMBERS
      )
        return fail(
          socket,
          'FULL',
        );
      if (
        !room
      ) {
        room =
          {
            instanceId,
            slug: null,
            members:
              new Map(),
          };
        rooms.set(
          instanceId,
          room,
        );
      }
      room.members.set(
        socket.id,
        {
          sid: socket.id,
          ...who,
          away: false,
          joinedAt:
            Date.now(),
        },
      );
      roomOf.set(
        socket.id,
        instanceId,
      );
      void socket.join(
        roomName(
          instanceId,
        ),
      );
      broadcast(
        io,
        room,
      );
    },
  );

  socket.on(
    VIBE_ROOM_C2S.LEAVE,
    () => {
      if (
        limited(
          VIBE_ROOM_C2S.LEAVE,
        )
      )
        return;
      leaveRoom(
        io,
        socket,
      );
    },
  );

  socket.on(
    VIBE_ROOM_C2S.SELECT,
    async (
      payload: unknown,
    ) => {
      if (
        limited(
          VIBE_ROOM_C2S.SELECT,
        )
      )
        return;
      const instanceId =
        roomOf.get(
          socket.id,
        );
      const room =
        instanceId
          ? rooms.get(
              instanceId,
            )
          : undefined;
      if (
        !room
      )
        return;
      if (
        hostSid(
          room,
        ) !==
        socket.id
      )
        return fail(
          socket,
          'NOT_HOST',
        );
      const slug =
        (
          payload as {
            slug?: unknown;
          } | null
        )
          ?.slug;
      if (
        slug !==
          null &&
        (typeof slug !==
          'string' ||
          !SLUG_RE.test(
            slug,
          ))
      ) {
        return fail(
          socket,
          'BAD_SLUG',
        );
      }
      if (
        slug !==
        null
      ) {
        try {
          const page =
            await getPrismaClient().vibePage.findUnique(
              {
                where:
                  {
                    slug,
                  },
                select:
                  {
                    status: true,
                  },
              },
            );
          if (
            page?.status !==
            'ready'
          )
            return fail(
              socket,
              'BAD_SLUG',
            );
        } catch {
          return fail(
            socket,
            'BAD_SLUG',
          );
        }
      }
      // Re-check after the await: the room or host may have changed meanwhile.
      if (
        rooms.get(
          room.instanceId,
        ) !==
          room ||
        hostSid(
          room,
        ) !==
          socket.id
      )
        return;
      room.slug =
        slug;
      broadcast(
        io,
        room,
      );
    },
  );

  const setAway =
    (
      event: string,
      away: boolean,
    ) => {
      if (
        limited(
          event,
        )
      )
        return;
      const instanceId =
        roomOf.get(
          socket.id,
        );
      const room =
        instanceId
          ? rooms.get(
              instanceId,
            )
          : undefined;
      const member =
        room?.members.get(
          socket.id,
        );
      if (
        !room ||
        !member ||
        member.away ===
          away
      )
        return;
      member.away =
        away;
      broadcast(
        io,
        room,
      );
    };
  socket.on(
    VIBE_ROOM_C2S.AWAY,
    () =>
      setAway(
        VIBE_ROOM_C2S.AWAY,
        true,
      ),
  );
  socket.on(
    VIBE_ROOM_C2S.ACTIVE,
    () =>
      setAway(
        VIBE_ROOM_C2S.ACTIVE,
        false,
      ),
  );

  socket.on(
    VIBE_ROOM_C2S.SEND,
    (
      payload: unknown,
    ) => {
      if (
        limited(
          VIBE_ROOM_C2S.SEND,
        )
      )
        return;
      const instanceId =
        roomOf.get(
          socket.id,
        );
      if (
        !instanceId
      )
        return;
      const data =
        (
          payload as {
            data?: unknown;
          } | null
        )
          ?.data;
      let size: number;
      try {
        size =
          JSON.stringify(
            data,
          )
            ?.length ??
          0;
      } catch {
        return; // cyclic or otherwise unserialisable: drop
      }
      if (
        size >
        VIBE_ROOM_LIMITS.MAX_MESSAGE_CHARS
      )
        return fail(
          socket,
          'TOO_LARGE',
        );
      socket
        .to(
          roomName(
            instanceId,
          ),
        )
        .emit(
          VIBE_ROOM_S2C.MESSAGE,
          {
            fromSid:
              socket.id,
            data,
          },
        );
    },
  );
}

export function handleVibeRoomDisconnect(
  io: Server,
  socket: Socket,
): void {
  leaveRoom(
    io,
    socket,
  );
}

/** Test hook: forget every room. */
export function resetVibeRoomsForTests(): void {
  rooms.clear();
  roomOf.clear();
}
