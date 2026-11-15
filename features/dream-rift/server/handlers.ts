/**
 * Dream Rift — Co-op Multiplayer Lobby + Relay Handler
 *
 * The server is a THIN lobby manager + message relay. It does NOT simulate the
 * game — the host client is authoritative. This handler owns lobby lifecycle
 * (create/join/quickplay/browse/leave), per-player presence (char/ready),
 * host-only controls (settings/kick/start), and a hot-path relay that forwards
 * realtime payloads verbatim to the rest of the room.
 *
 * Follows the slice-it.ts conventions: in-memory Map of lobbies, socket.io
 * rooms for broadcast, soft auth via socket.data, light rate limiting.
 */

import { randomBytes } from 'node:crypto';
import type {
  Server,
  Socket,
} from 'socket.io';
import {
  generateRoomCode,
  sanitizeUserName,
} from '../../../server/socket-server/utils';
import { checkRateLimit } from '../../../server/socket-server/rate-limit';
import { logger } from '../../../server/socket-server/logger';
import { PEER_GRACE_MS } from '../../../lib/shared/realtime/types';
import {
  C2S,
  S2C,
  ROOM_PREFIX,
  MAX_LOBBY_PLAYERS,
} from '../engine/net/events';
import type {
  DrPlayerId,
  DrDifficulty,
  DrLobbyState,
  LobbyPlayerInfo,
  LobbySnapshot,
  JoinedPayload,
  PublicLobbyInfo,
  StartPayload,
  RelayMsg,
} from '../engine/net/events';

// ─── Constants ──────────────────────────────────────────────────────

const VALID_CHARS: readonly DrPlayerId[] =
  [
    'bllm',
    'mls',
    'qln',
    'dyj',
    'lmy',
  ];
const VALID_DIFFICULTIES: readonly DrDifficulty[] =
  [
    'easy',
    'normal',
    'hard',
    'lunatic',
  ];
const DEFAULT_CHAR: DrPlayerId =
  'bllm';
const MAX_LOBBIES = 2000;
const BROWSE_CAP = 30;
const GC_INTERVAL_MS = 60_000;
const LOBBY_IDLE_TIMEOUT_MS =
  30 *
  60_000; // stale lobbies pruned after 30m of no activity
/**
 * How long a seat is held after its socket drops mid-game. The shared 15s
 * window every other game uses (lib/shared/realtime/types.ts). Lobbies that
 * have not started are not held: re-joining a lobby is one click and a ghost
 * seat would block a public room.
 */
export const DR_RESUME_GRACE_MS =
  PEER_GRACE_MS;
let resumeGraceMs =
  DR_RESUME_GRACE_MS;

/** Test hooks: shorten the hold window and wipe module state between cases. */
export function __setResumeGraceMs(
  ms: number,
): void {
  resumeGraceMs =
    ms;
}
export function __resetDreamRiftLobbies(): void {
  for (const lobby of lobbies.values())
    for (const seat of lobby.seats.values())
      clearTimeout(
        seat.dropTimer,
      );
  lobbies.clear();
  socketLobby.clear();
  resumeGraceMs =
    DR_RESUME_GRACE_MS;
}

// ─── Types ──────────────────────────────────────────────────────────

/** Per-seat secret + hold timer. Kept off LobbyPlayerInfo, which is broadcast to the room. */
interface SeatSecret {
  token: string;
  /** Set while the socket is gone and the seat is being held. */
  dropTimer?: ReturnType<
    typeof setTimeout
  >;
}

interface Lobby {
  code: string;
  hostSocketId: string;
  isPublic: boolean;
  difficulty: DrDifficulty;
  state: DrLobbyState;
  players: LobbyPlayerInfo[]; // ordered; max MAX_LOBBY_PLAYERS
  /** slot -> secret. */
  seats: Map<
    number,
    SeatSecret
  >;
  lastActivityAt: number;
}

const lobbies =
  new Map<
    string,
    Lobby
  >();
/** Reverse index: socketId → lobby code (a socket is only ever in one lobby). */
const socketLobby =
  new Map<
    string,
    string
  >();

let gcInterval: ReturnType<
  typeof setInterval
> | null =
  null;

// ─── Helpers ────────────────────────────────────────────────────────

function roomName(
  code: string,
): string {
  return `${ROOM_PREFIX}${code}`;
}

function isValidChar(
  raw: unknown,
): raw is DrPlayerId {
  return (
    typeof raw ===
      'string' &&
    (
      VALID_CHARS as readonly string[]
    ).includes(
      raw,
    )
  );
}

function isValidDifficulty(
  raw: unknown,
): raw is DrDifficulty {
  return (
    typeof raw ===
      'string' &&
    (
      VALID_DIFFICULTIES as readonly string[]
    ).includes(
      raw,
    )
  );
}

function guestName(
  socket: Socket,
): string {
  const fromAuth =
    socket
      .data
      ?.userName;
  return (
    sanitizeUserName(
      typeof fromAuth ===
        'string'
        ? fromAuth
        : undefined,
    ) ||
    `Player ${Date.now().toString(36).slice(-4)}`
  );
}

function resolveIdentity(
  socket: Socket,
): {
  userId: string;
  name: string;
  avatarUrl:
    | string
    | null;
} {
  const userId =
    typeof socket
      .data
      ?.userId ===
    'string'
      ? socket
          .data
          .userId
      : 'guest';
  const name =
    guestName(
      socket,
    );
  const avatarUrl =
    typeof socket
      .data
      ?.avatarUrl ===
    'string'
      ? socket
          .data
          .avatarUrl
      : null;
  return {
    userId,
    name,
    avatarUrl,
  };
}

function lowestFreeSlot(
  lobby: Lobby,
): number {
  const used =
    new Set(
      lobby.players.map(
        (
          p,
        ) =>
          p.slot,
      ),
    );
  for (
    let i = 0;
    i <
    MAX_LOBBY_PLAYERS;
    i++
  ) {
    if (
      !used.has(
        i,
      )
    )
      return i;
  }
  return -1;
}

function toSnapshot(
  lobby: Lobby,
): LobbySnapshot {
  return {
    code: lobby.code,
    hostSocketId:
      lobby.hostSocketId,
    isPublic:
      lobby.isPublic,
    difficulty:
      lobby.difficulty,
    state:
      lobby.state,
    players:
      lobby.players.map(
        (
          p,
        ) => ({
          ...p,
        }),
      ),
    maxPlayers:
      MAX_LOBBY_PLAYERS,
  };
}

function toPublicInfo(
  lobby: Lobby,
): PublicLobbyInfo {
  const host =
    lobby.players.find(
      (
        p,
      ) =>
        p.isHost,
    );
  return {
    code: lobby.code,
    hostName:
      host
        ? host.name
        : 'Host',
    playerCount:
      lobby
        .players
        .length,
    maxPlayers:
      MAX_LOBBY_PLAYERS,
    difficulty:
      lobby.difficulty,
    state:
      lobby.state,
  };
}

function broadcastLobby(
  io: Server,
  lobby: Lobby,
): void {
  lobby.lastActivityAt =
    Date.now();
  io.to(
    roomName(
      lobby.code,
    ),
  ).emit(
    S2C.LOBBY,
    toSnapshot(
      lobby,
    ),
  );
}

function newLobbyCode(): string {
  let code =
    generateRoomCode();
  let guard = 0;
  while (
    lobbies.has(
      code,
    ) &&
    guard <
      50
  ) {
    code =
      generateRoomCode();
    guard++;
  }
  return code;
}

/**
 * Remove the socket from whatever lobby it currently occupies. Handles host
 * migration, room departure, peer notification and lobby deletion. Safe to call
 * even if the socket is not in any lobby.
 */
function removeFromLobby(
  io: Server,
  socket: Socket,
): void {
  const code =
    socketLobby.get(
      socket.id,
    );
  if (
    !code
  )
    return;
  socketLobby.delete(
    socket.id,
  );

  const lobby =
    lobbies.get(
      code,
    );
  socket.leave(
    roomName(
      code,
    ),
  );
  if (
    !lobby
  )
    return;

  const player =
    lobby.players.find(
      (
        p,
      ) =>
        p.socketId ===
        socket.id,
    );
  if (
    !player
  ) {
    if (
      lobby
        .players
        .length ===
      0
    )
      lobbies.delete(
        code,
      );
    return;
  }
  evictPlayer(
    io,
    lobby,
    player,
  );
}

/** Free a seat for good (leave, grace expiry): peer notice, host migration, lobby deletion. */
function evictPlayer(
  io: Server,
  lobby: Lobby,
  departing: LobbyPlayerInfo,
): void {
  const code =
    lobby.code;
  const idx =
    lobby.players.indexOf(
      departing,
    );
  if (
    idx ===
    -1
  )
    return;
  const wasHost =
    departing.isHost;
  const secret =
    lobby.seats.get(
      departing.slot,
    );
  if (
    secret?.dropTimer
  )
    clearTimeout(
      secret.dropTimer,
    );
  lobby.seats.delete(
    departing.slot,
  );
  lobby.players.splice(
    idx,
    1,
  );

  io.to(
    roomName(
      code,
    ),
  ).emit(
    S2C.PEER_LEFT,
    {
      slot: departing.slot,
    },
  );

  if (
    lobby
      .players
      .length ===
    0
  ) {
    lobbies.delete(
      code,
    );
    logger.info(
      {
        event:
          'dr_lobby_closed',
        code,
      },
    );
    return;
  }

  if (
    wasHost
  ) {
    // Migrate host to the remaining player with the lowest slot.
    const next =
      lobby.players.reduce(
        (
          a,
          b,
        ) =>
          b.slot <
          a.slot
            ? b
            : a,
      );
    lobby.players.forEach(
      (
        p,
      ) => {
        p.isHost =
          p.socketId ===
          next.socketId;
      },
    );
    lobby.hostSocketId =
      next.socketId;
    io.to(
      roomName(
        code,
      ),
    ).emit(
      S2C.HOST_CHANGED,
      {
        hostSocketId:
          next.socketId,
        slot: next.slot,
      },
    );
    logger.info(
      {
        event:
          'dr_host_migrated',
        code,
        newHost:
          next.socketId,
      },
    );
  }

  broadcastLobby(
    io,
    lobby,
  );
}

function joinedPayload(
  lobby: Lobby,
  self: LobbyPlayerInfo,
): JoinedPayload {
  return {
    code: lobby.code,
    yourSlot:
      self.slot,
    selfId:
      self.socketId,
    resumeToken:
      lobby.seats.get(
        self.slot,
      )
        ?.token ??
      '',
  };
}

function addPlayer(
  lobby: Lobby,
  socket: Socket,
  slot: number,
  isHost: boolean,
): LobbyPlayerInfo {
  const {
    userId,
    name,
    avatarUrl,
  } =
    resolveIdentity(
      socket,
    );
  const player: LobbyPlayerInfo =
    {
      socketId:
        socket.id,
      userId,
      name,
      avatarUrl,
      slot,
      charId:
        DEFAULT_CHAR,
      ready: false,
      isHost,
    };
  lobby.players.push(
    player,
  );
  lobby.players.sort(
    (
      a,
      b,
    ) =>
      a.slot -
      b.slot,
  );
  lobby.seats.set(
    slot,
    {
      token:
        randomBytes(
          16,
        ).toString(
          'hex',
        ),
    },
  );
  socket.join(
    roomName(
      lobby.code,
    ),
  );
  socketLobby.set(
    socket.id,
    lobby.code,
  );
  return player;
}

function createLobby(
  socket: Socket,
  isPublic: boolean,
  difficulty: DrDifficulty,
): Lobby {
  const lobby: Lobby =
    {
      code: newLobbyCode(),
      hostSocketId:
        socket.id,
      isPublic,
      difficulty,
      state:
        'waiting',
      players:
        [],
      seats:
        new Map(),
      lastActivityAt:
        Date.now(),
    };
  lobbies.set(
    lobby.code,
    lobby,
  );
  addPlayer(
    lobby,
    socket,
    0,
    true,
  );
  return lobby;
}

function startGarbageCollector(): void {
  if (
    gcInterval
  )
    return;
  gcInterval =
    setInterval(
      () => {
        const now =
          Date.now();
        for (const [
          code,
          lobby,
        ] of lobbies) {
          if (
            lobby
              .players
              .length ===
              0 ||
            now -
              lobby.lastActivityAt >
              LOBBY_IDLE_TIMEOUT_MS
          ) {
            for (const p of lobby.players)
              socketLobby.delete(
                p.socketId,
              );
            lobbies.delete(
              code,
            );
            logger.info(
              {
                event:
                  'dr_lobby_gc',
                code,
              },
            );
          }
        }
      },
      GC_INTERVAL_MS,
    );
  if (
    gcInterval &&
    typeof gcInterval ===
      'object' &&
    'unref' in
      gcInterval
  ) {
    gcInterval.unref();
  }
}

// ─── Handler registration ───────────────────────────────────────────

export function registerDreamRiftHandlers(
  io: Server,
  socket: Socket,
): void {
  startGarbageCollector();

  // ── Create ──
  socket.on(
    C2S.CREATE,
    (payload: {
      name?: unknown;
      isPublic?: unknown;
      difficulty?: unknown;
    }) => {
      if (
        !checkRateLimit(
          socket.id,
          C2S.CREATE,
        )
      ) {
        socket.emit(
          S2C.ERROR,
          {
            message:
              'Slow down — too many lobbies created.',
          },
        );
        return;
      }
      if (
        lobbies.size >=
        MAX_LOBBIES
      ) {
        socket.emit(
          S2C.ERROR,
          {
            message:
              'Server is at capacity. Try again shortly.',
          },
        );
        return;
      }

      removeFromLobby(
        io,
        socket,
      ); // a socket can only be in one lobby

      const isPublic =
        payload?.isPublic ===
        undefined
          ? true
          : Boolean(
              payload.isPublic,
            );
      const difficulty =
        isValidDifficulty(
          payload?.difficulty,
        )
          ? payload.difficulty
          : 'normal';

      const lobby =
        createLobby(
          socket,
          isPublic,
          difficulty,
        );
      const self =
        lobby
          .players[0];

      socket.emit(
        S2C.JOINED,
        joinedPayload(
          lobby,
          self,
        ),
      );
      broadcastLobby(
        io,
        lobby,
      );
      logger.info(
        {
          event:
            'dr_lobby_created',
          code: lobby.code,
          host: socket.id,
          isPublic,
          difficulty,
        },
      );
    },
  );

  // ── Join by code ──
  socket.on(
    C2S.JOIN,
    (payload: {
      code?: unknown;
    }) => {
      if (
        !checkRateLimit(
          socket.id,
          C2S.JOIN,
        )
      ) {
        socket.emit(
          S2C.ERROR,
          {
            message:
              'Slow down — too many join attempts.',
          },
        );
        return;
      }
      const code =
        typeof payload?.code ===
        'string'
          ? payload.code
              .trim()
              .toUpperCase()
          : '';
      const lobby =
        lobbies.get(
          code,
        );
      if (
        !lobby
      ) {
        socket.emit(
          S2C.ERROR,
          {
            message:
              'Lobby not found.',
          },
        );
        return;
      }
      if (
        lobby.state !==
        'waiting'
      ) {
        socket.emit(
          S2C.ERROR,
          {
            message:
              'That game has already started.',
          },
        );
        return;
      }
      const slot =
        lowestFreeSlot(
          lobby,
        );
      if (
        slot ===
        -1
      ) {
        socket.emit(
          S2C.ERROR,
          {
            message:
              'Lobby is full.',
          },
        );
        return;
      }

      removeFromLobby(
        io,
        socket,
      );
      // Re-fetch: removeFromLobby could have deleted this lobby if it was the same.
      const target =
        lobbies.get(
          code,
        );
      if (
        !target
      ) {
        socket.emit(
          S2C.ERROR,
          {
            message:
              'Lobby not found.',
          },
        );
        return;
      }
      const freeSlot =
        lowestFreeSlot(
          target,
        );
      if (
        freeSlot ===
        -1
      ) {
        socket.emit(
          S2C.ERROR,
          {
            message:
              'Lobby is full.',
          },
        );
        return;
      }

      const self =
        addPlayer(
          target,
          socket,
          freeSlot,
          false,
        );
      socket.emit(
        S2C.JOINED,
        joinedPayload(
          target,
          self,
        ),
      );
      broadcastLobby(
        io,
        target,
      );
      logger.info(
        {
          event:
            'dr_lobby_joined',
          code: target.code,
          socketId:
            socket.id,
          slot: self.slot,
        },
      );
    },
  );

  // ── Quickplay ──
  socket.on(
    C2S.QUICKPLAY,
    () => {
      if (
        !checkRateLimit(
          socket.id,
          C2S.QUICKPLAY,
        )
      ) {
        socket.emit(
          S2C.ERROR,
          {
            message:
              'Slow down.',
          },
        );
        return;
      }

      removeFromLobby(
        io,
        socket,
      );

      // Prefer the most-full lobby that still has a free slot.
      let best: Lobby | null =
        null;
      for (const lobby of lobbies.values()) {
        if (
          !lobby.isPublic ||
          lobby.state !==
            'waiting'
        )
          continue;
        if (
          lobby
            .players
            .length >=
          MAX_LOBBY_PLAYERS
        )
          continue;
        if (
          !best ||
          lobby
            .players
            .length >
            best
              .players
              .length
        )
          best =
            lobby;
      }

      if (
        best
      ) {
        const slot =
          lowestFreeSlot(
            best,
          );
        if (
          slot !==
          -1
        ) {
          const self =
            addPlayer(
              best,
              socket,
              slot,
              false,
            );
          socket.emit(
            S2C.JOINED,
            joinedPayload(
              best,
              self,
            ),
          );
          broadcastLobby(
            io,
            best,
          );
          logger.info(
            {
              event:
                'dr_quickplay_joined',
              code: best.code,
              socketId:
                socket.id,
            },
          );
          return;
        }
      }

      if (
        lobbies.size >=
        MAX_LOBBIES
      ) {
        socket.emit(
          S2C.ERROR,
          {
            message:
              'Server is at capacity. Try again shortly.',
          },
        );
        return;
      }

      const lobby =
        createLobby(
          socket,
          true,
          'normal',
        );
      const self =
        lobby
          .players[0];
      socket.emit(
        S2C.JOINED,
        joinedPayload(
          lobby,
          self,
        ),
      );
      broadcastLobby(
        io,
        lobby,
      );
      logger.info(
        {
          event:
            'dr_quickplay_created',
          code: lobby.code,
          socketId:
            socket.id,
        },
      );
    },
  );

  // ── Browse public lobbies ──
  socket.on(
    C2S.BROWSE,
    () => {
      if (
        !checkRateLimit(
          socket.id,
          C2S.BROWSE,
        )
      ) {
        socket.emit(
          S2C.ERROR,
          {
            message:
              'Slow down.',
          },
        );
        return;
      }
      const list: PublicLobbyInfo[] =
        [];
      for (const lobby of lobbies.values()) {
        if (
          !lobby.isPublic ||
          lobby.state !==
            'waiting'
        )
          continue;
        if (
          lobby
            .players
            .length >=
          MAX_LOBBY_PLAYERS
        )
          continue;
        list.push(
          toPublicInfo(
            lobby,
          ),
        );
        if (
          list.length >=
          BROWSE_CAP
        )
          break;
      }
      socket.emit(
        S2C.BROWSE_RESULT,
        {
          lobbies:
            list,
        },
      );
    },
  );

  // ── Leave ──
  socket.on(
    C2S.LEAVE,
    () => {
      removeFromLobby(
        io,
        socket,
      );
    },
  );

  // ── Set character ──
  socket.on(
    C2S.SET_CHAR,
    (payload: {
      charId?: unknown;
    }) => {
      const lobby =
        getSocketLobby(
          socket,
        );
      if (
        !lobby
      )
        return;
      if (
        !isValidChar(
          payload?.charId,
        )
      )
        return;
      const player =
        lobby.players.find(
          (
            p,
          ) =>
            p.socketId ===
            socket.id,
        );
      if (
        !player
      )
        return;
      player.charId =
        payload.charId;
      broadcastLobby(
        io,
        lobby,
      );
    },
  );

  // ── Ready toggle ──
  socket.on(
    C2S.READY,
    (payload: {
      ready?: unknown;
    }) => {
      const lobby =
        getSocketLobby(
          socket,
        );
      if (
        !lobby
      )
        return;
      const player =
        lobby.players.find(
          (
            p,
          ) =>
            p.socketId ===
            socket.id,
        );
      if (
        !player
      )
        return;
      player.ready =
        Boolean(
          payload?.ready,
        );
      broadcastLobby(
        io,
        lobby,
      );
    },
  );

  // ── Host: settings ──
  socket.on(
    C2S.SET_SETTINGS,
    (payload: {
      difficulty?: unknown;
    }) => {
      const lobby =
        getSocketLobby(
          socket,
        );
      if (
        !lobby ||
        lobby.hostSocketId !==
          socket.id
      )
        return;
      if (
        !isValidDifficulty(
          payload?.difficulty,
        )
      )
        return;
      lobby.difficulty =
        payload.difficulty;
      broadcastLobby(
        io,
        lobby,
      );
    },
  );

  // ── Host: kick ──
  socket.on(
    C2S.KICK,
    (payload: {
      slot?: unknown;
    }) => {
      const lobby =
        getSocketLobby(
          socket,
        );
      if (
        !lobby ||
        lobby.hostSocketId !==
          socket.id
      )
        return;
      const slot =
        typeof payload?.slot ===
        'number'
          ? payload.slot
          : -1;
      const target =
        lobby.players.find(
          (
            p,
          ) =>
            p.slot ===
            slot,
        );
      if (
        !target ||
        target.socketId ===
          socket.id
      )
        return;

      const targetSocket =
        io.sockets.sockets.get(
          target.socketId,
        );
      lobby.players =
        lobby.players.filter(
          (
            p,
          ) =>
            p.socketId !==
            target.socketId,
        );
      socketLobby.delete(
        target.socketId,
      );
      if (
        targetSocket
      ) {
        targetSocket.leave(
          roomName(
            lobby.code,
          ),
        );
        targetSocket.emit(
          S2C.KICKED,
          {
            code: lobby.code,
          },
        );
      }
      io.to(
        roomName(
          lobby.code,
        ),
      ).emit(
        S2C.PEER_LEFT,
        {
          slot: target.slot,
        },
      );
      broadcastLobby(
        io,
        lobby,
      );
      logger.info(
        {
          event:
            'dr_kicked',
          code: lobby.code,
          slot,
          by: socket.id,
        },
      );
    },
  );

  // ── Host: start ──
  socket.on(
    C2S.START,
    () => {
      const lobby =
        getSocketLobby(
          socket,
        );
      if (
        !lobby ||
        lobby.hostSocketId !==
          socket.id
      )
        return;
      if (
        lobby.state !==
        'waiting'
      )
        return;

      const allReady =
        lobby.players.every(
          (
            p,
          ) =>
            p.isHost ||
            p.ready,
        );
      if (
        !allReady
      ) {
        socket.emit(
          S2C.ERROR,
          {
            message:
              'All players must be ready to start.',
          },
        );
        return;
      }

      lobby.state =
        'playing';
      const seed =
        (Math.random() *
          0xffffffff) >>>
        0;
      const roster =
        lobby.players.map(
          (
            p,
          ) => ({
            slot: p.slot,
            userId:
              p.userId,
            name: p.name,
            charId:
              p.charId,
            isHost:
              p.isHost,
          }),
        );

      for (const p of lobby.players) {
        const payload: StartPayload =
          {
            seed,
            difficulty:
              lobby.difficulty,
            stageIndex: 0,
            roster,
            yourSlot:
              p.slot,
          };
        io.to(
          p.socketId,
        ).emit(
          S2C.START,
          payload,
        );
      }

      // Keep the lobby alive so peers stay in the room for relay.
      broadcastLobby(
        io,
        lobby,
      );
      logger.info(
        {
          event:
            'dr_game_started',
          code: lobby.code,
          seed,
          players:
            lobby
              .players
              .length,
        },
      );
    },
  );

  // ── Resume: reclaim a held seat on a fresh socket ──
  socket.on(
    C2S.RESUME,
    (payload: {
      code?: unknown;
      token?: unknown;
    }) => {
      if (
        !checkRateLimit(
          socket.id,
          C2S.RESUME,
        )
      )
        return;
      const code =
        typeof payload?.code ===
        'string'
          ? payload.code
              .trim()
              .toUpperCase()
          : '';
      const token =
        typeof payload?.token ===
        'string'
          ? payload.token
          : '';
      const lobby =
        lobbies.get(
          code,
        );
      let slot =
        -1;
      if (
        lobby &&
        token
      ) {
        for (const [
          s,
          secret,
        ] of lobby.seats) {
          if (
            secret.token ===
            token
          ) {
            slot =
              s;
            break;
          }
        }
      }
      const player =
        lobby?.players.find(
          (
            p,
          ) =>
            p.slot ===
            slot,
        );
      if (
        !lobby ||
        !player
      ) {
        socket.emit(
          S2C.ERROR,
          {
            message:
              'Lobby closed.',
          },
        );
        return;
      }
      const secret =
        lobby.seats.get(
          slot,
        )!;
      if (
        secret.dropTimer
      ) {
        clearTimeout(
          secret.dropTimer,
        );
        secret.dropTimer =
          undefined;
      }

      const stale =
        player.socketId;
      if (
        stale !==
        socket.id
      ) {
        // The old transport may still be half-open: drop it out of the room.
        socketLobby.delete(
          stale,
        );
        io.sockets.sockets
          .get(
            stale,
          )
          ?.leave(
            roomName(
              code,
            ),
          );
        if (
          lobby.hostSocketId ===
          stale
        )
          lobby.hostSocketId =
            socket.id;
        player.socketId =
          socket.id;
      }
      socketLobby.set(
        socket.id,
        code,
      );
      socket.join(
        roomName(
          code,
        ),
      );

      socket.emit(
        S2C.RESUMED,
        joinedPayload(
          lobby,
          player,
        ),
      );
      io.to(
        roomName(
          code,
        ),
      ).emit(
        S2C.PEER_STATUS,
        {
          slot,
          connected: true,
        },
      );
      broadcastLobby(
        io,
        lobby,
      );
      logger.info(
        {
          event:
            'dr_seat_resumed',
          code,
          slot,
          socketId:
            socket.id,
        },
      );
    },
  );

  // ── Hot path: relay ──
  // Forward verbatim to everyone else in the room. No validation beyond room
  // membership. Player positions ~15Hz, host world snapshots ~10Hz.
  socket.on(
    C2S.RELAY,
    (
      payload: RelayMsg,
    ) => {
      const code =
        socketLobby.get(
          socket.id,
        );
      if (
        !code
      )
        return;
      socket
        .to(
          roomName(
            code,
          ),
        )
        .emit(
          S2C.RELAY,
          payload,
        );
    },
  );
}

function getSocketLobby(
  socket: Socket,
):
  | Lobby
  | undefined {
  const code =
    socketLobby.get(
      socket.id,
    );
  if (
    !code
  )
    return undefined;
  return lobbies.get(
    code,
  );
}

export function handleDreamRiftDisconnect(
  io: Server,
  socket: Socket,
): void {
  const code =
    socketLobby.get(
      socket.id,
    );
  const lobby =
    code
      ? lobbies.get(
          code,
        )
      : undefined;
  const player =
    lobby?.players.find(
      (
        p,
      ) =>
        p.socketId ===
        socket.id,
    );
  const secret =
    lobby &&
    player
      ? lobby.seats.get(
          player.slot,
        )
      : undefined;
  if (
    !lobby ||
    !player ||
    !secret ||
    lobby.state !==
      'playing'
  ) {
    removeFromLobby(
      io,
      socket,
    );
    return;
  }
  // Mid-game: hold the seat. The host client's simulation lives in its
  // browser and keeps running; a guest just misses some relays. If nobody
  // reclaims the seat in time it is freed exactly as if they had left
  // (including host migration).
  socketLobby.delete(
    socket.id,
  );
  if (
    secret.dropTimer
  )
    clearTimeout(
      secret.dropTimer,
    );
  secret.dropTimer =
    setTimeout(
      () => {
        secret.dropTimer =
          undefined;
        if (
          lobbies.get(
            lobby.code,
          ) ===
            lobby &&
          lobby.seats.get(
            player.slot,
          ) ===
            secret
        ) {
          logger.info(
            {
              event:
                'dr_seat_expired',
              code: lobby.code,
              slot: player.slot,
            },
          );
          evictPlayer(
            io,
            lobby,
            player,
          );
        }
      },
      resumeGraceMs,
    );
  secret.dropTimer.unref?.();
  io.to(
    roomName(
      lobby.code,
    ),
  ).emit(
    S2C.PEER_STATUS,
    {
      slot: player.slot,
      connected: false,
    },
  );
  logger.info(
    {
      event:
        'dr_seat_held',
      code: lobby.code,
      slot: player.slot,
    },
  );
}
