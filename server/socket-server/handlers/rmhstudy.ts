/**
 * RMH Study — Pomodoro Timer Handler
 *
 * Server-authoritative Pomodoro timer with room system, chat, personal task lists,
 * and DB persistence for focus session stats.
 */

import type {
  Server,
  Socket,
} from 'socket.io';
import {
  sanitizeUserName,
  generateRoomCode,
  sanitizeString,
} from '../utils';
import { getPrismaClient } from '../prisma-client';
import { logger } from '../logger';
import { checkRateLimit } from '../rate-limit';
import { config } from '../config';
import { awardAppProgress } from '../economy';
import { nextStudyStreak } from '../../../lib/rmhstudy/streak';
import { isValidTimeZone } from '../../../lib/calendar/tz';

// ─── Interfaces ───

type TimerPhase =
  | 'idle'
  | 'working'
  | 'short_break'
  | 'long_break';
type MemberStatus =
  | 'studying'
  | 'break'
  | 'idle'
  | 'away';

interface TimerSettings {
  workDurationMs: number;
  shortBreakMs: number;
  longBreakMs: number;
  sessionsBeforeLongBreak: number;
  autoStartBreaks: boolean;
  autoStartWork: boolean;
}

interface TimerState {
  phase: TimerPhase;
  remainingMs: number;
  totalMs: number;
  sessionNumber: number; // current work session (1-based)
  totalSessions: number; // = sessionsBeforeLongBreak
  paused: boolean;
}

interface Task {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
  reactions: Record<
    string,
    string[]
  >;
}

interface RoomMember {
  socketId: string;
  userId: string;
  userName: string;
  avatarUrl:
    | string
    | null;
  isConnected: boolean;
  status: MemberStatus;
  tasks: Task[];
  joinedAt: number;
}

interface BannedUser {
  userId: string;
  userName: string;
  bannedAt: number;
  bannedBy: string;
  reason:
    | string
    | null;
}

interface StudyRoom {
  code: string;
  hostUserId: string;
  isPublic: boolean;
  settings: TimerSettings;
  timer: TimerState;
  timerInterval: NodeJS.Timeout | null;
  members: Map<
    string,
    RoomMember
  >; // keyed by userId
  bannedUsers: BannedUser[];
  chat: ChatMessage[];
  chatReactions: Map<
    string,
    Map<
      string,
      Set<string>
    >
  >; // messageId -> emoji -> userIds
  workPhaseStartedAt:
    | number
    | null; // tracks when current work phase started (for DB)
}

// ─── Constants ───

const MAX_ROOM_MEMBERS = 20;
const MAX_CHAT_LENGTH =
  config.CHAT_MAX_LENGTH;
const MAX_CHAT_HISTORY =
  config.CHAT_HISTORY_LENGTH;
const MAX_TASK_TEXT_LENGTH = 200;
const MAX_TASKS_PER_MEMBER = 50;
const TIMER_TICK_MS = 1000;

const DEFAULT_SETTINGS: TimerSettings =
  {
    workDurationMs:
      25 *
      60 *
      1000,
    shortBreakMs:
      5 *
      60 *
      1000,
    longBreakMs:
      15 *
      60 *
      1000,
    sessionsBeforeLongBreak: 4,
    autoStartBreaks: true,
    autoStartWork: false,
  };

// ─── In-Memory State ───

const rooms =
  new Map<
    string,
    StudyRoom
  >();
const userSocketMap =
  new Map<
    string,
    string
  >(); // userId -> socketId
const socketUserMap =
  new Map<
    string,
    string
  >(); // socketId -> userId
const socketRoomMap =
  new Map<
    string,
    string
  >(); // socketId -> roomCode
const disconnectTimers =
  new Map<
    string,
    NodeJS.Timeout
  >(); // userId -> grace-period timer

// ─── Helper Functions ───

function generateId(): string {
  return (
    'st_' +
    Math.random()
      .toString(
        36,
      )
      .slice(
        2,
        10,
      ) +
    Date.now().toString(
      36,
    )
  );
}

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (
    typeof value !==
      'number' ||
    !Number.isFinite(
      value,
    )
  )
    return fallback;
  return Math.max(
    min,
    Math.min(
      max,
      Math.floor(
        value,
      ),
    ),
  );
}

function parseSettings(
  raw:
    | Record<
        string,
        unknown
      >
    | undefined,
): TimerSettings {
  if (
    !raw ||
    typeof raw !==
      'object'
  )
    return {
      ...DEFAULT_SETTINGS,
    };
  return {
    workDurationMs:
      clampInt(
        raw.workDurationMs,
        60_000,
        120 *
          60_000,
        DEFAULT_SETTINGS.workDurationMs,
      ),
    shortBreakMs:
      clampInt(
        raw.shortBreakMs,
        30_000,
        60 *
          60_000,
        DEFAULT_SETTINGS.shortBreakMs,
      ),
    longBreakMs:
      clampInt(
        raw.longBreakMs,
        60_000,
        120 *
          60_000,
        DEFAULT_SETTINGS.longBreakMs,
      ),
    sessionsBeforeLongBreak:
      clampInt(
        raw.sessionsBeforeLongBreak,
        1,
        12,
        DEFAULT_SETTINGS.sessionsBeforeLongBreak,
      ),
    autoStartBreaks:
      typeof raw.autoStartBreaks ===
      'boolean'
        ? raw.autoStartBreaks
        : DEFAULT_SETTINGS.autoStartBreaks,
    autoStartWork:
      typeof raw.autoStartWork ===
      'boolean'
        ? raw.autoStartWork
        : DEFAULT_SETTINGS.autoStartWork,
  };
}

function getRoomByCode(
  code: string,
):
  | StudyRoom
  | undefined {
  return rooms.get(
    code.toUpperCase(),
  );
}

function socketRoom(
  code: string,
): string {
  return `rmhstudy:${code}`;
}

function buildRoomState(
  room: StudyRoom,
  userId: string,
): Record<
  string,
  unknown
> {
  const members =
    Array.from(
      room.members.values(),
    ).map(
      (
        m,
      ) => {
        const progress =
          getTaskProgress(
            m,
          );
        return {
          userId:
            m.userId,
          userName:
            m.userName,
          avatarUrl:
            m.avatarUrl ??
            null,
          isHost:
            m.userId ===
            room.hostUserId,
          isConnected:
            m.isConnected,
          status:
            m.status,
          tasksCompleted:
            progress.completed,
          tasksTotal:
            progress.total,
        };
      },
    );
  return {
    roomCode:
      room.code,
    hostUserId:
      room.hostUserId,
    isPublic:
      room.isPublic,
    settings:
      room.settings,
    bannedUsers:
      room.bannedUsers,
    timer:
      {
        phase:
          room
            .timer
            .phase,
        remainingMs:
          room
            .timer
            .remainingMs,
        totalMs:
          room
            .timer
            .totalMs,
        sessionNumber:
          room
            .timer
            .sessionNumber,
        totalSessions:
          room
            .timer
            .totalSessions,
        isPaused:
          room
            .timer
            .paused,
      },
    members,
    chat: serializeChatForBroadcast(
      room,
    ),
    myUserId:
      userId,
  };
}

function serializeChatForBroadcast(
  room: StudyRoom,
): ChatMessage[] {
  return room.chat
    .slice(
      -50,
    )
    .map(
      (
        msg,
      ) => {
        const msgReactions =
          room.chatReactions.get(
            msg.id,
          );
        if (
          !msgReactions ||
          msgReactions.size ===
            0
        )
          return msg;
        const reactions: Record<
          string,
          string[]
        > =
          {};
        for (const [
          emoji,
          userSet,
        ] of msgReactions) {
          reactions[
            emoji
          ] =
            Array.from(
              userSet,
            );
        }
        return {
          ...msg,
          reactions,
        };
      },
    );
}

function getTaskProgress(
  member: RoomMember,
): {
  completed: number;
  total: number;
} {
  const total =
    member
      .tasks
      .length;
  const completed =
    member.tasks.filter(
      (
        t,
      ) =>
        t.completed,
    ).length;
  return {
    completed,
    total,
  };
}

function broadcastRoomState(
  io: Server,
  room: StudyRoom,
): void {
  for (const member of room.members.values()) {
    if (
      member.isConnected
    ) {
      const s =
        io.sockets.sockets.get(
          member.socketId,
        );
      if (
        s
      )
        s.emit(
          'rmhstudy:room:state',
          buildRoomState(
            room,
            member.userId,
          ),
        );
    }
  }
}

function emitError(
  socket: Socket,
  message: string,
): void {
  socket.emit(
    'rmhstudy:error',
    {
      message,
    },
  );
}

// ─── Timer Logic ───

function getTotalMsForPhase(
  room: StudyRoom,
  phase: TimerPhase,
): number {
  switch (
    phase
  ) {
    case 'working':
      return room
        .settings
        .workDurationMs;
    case 'short_break':
      return room
        .settings
        .shortBreakMs;
    case 'long_break':
      return room
        .settings
        .longBreakMs;
    case 'idle':
      return 0;
  }
}

function getNextPhase(
  room: StudyRoom,
): TimerPhase {
  const {
    phase,
    sessionNumber,
  } =
    room.timer;
  const {
    sessionsBeforeLongBreak,
  } =
    room.settings;

  if (
    phase ===
    'working'
  ) {
    // After completing a work session, determine break type
    if (
      sessionNumber >=
      sessionsBeforeLongBreak
    ) {
      return 'long_break';
    }
    return 'short_break';
  }

  if (
    phase ===
      'short_break' ||
    phase ===
      'long_break'
  ) {
    return 'working';
  }

  // From idle, start working
  return 'working';
}

function startTimerInterval(
  io: Server,
  room: StudyRoom,
): void {
  // Clear any existing interval
  if (
    room.timerInterval
  ) {
    clearInterval(
      room.timerInterval,
    );
    room.timerInterval =
      null;
  }

  room.timerInterval =
    setInterval(
      () => {
        tickTimer(
          io,
          room,
        );
      },
      TIMER_TICK_MS,
    );
}

function stopTimerInterval(
  room: StudyRoom,
): void {
  if (
    room.timerInterval
  ) {
    clearInterval(
      room.timerInterval,
    );
    room.timerInterval =
      null;
  }
}

function tickTimer(
  io: Server,
  room: StudyRoom,
): void {
  if (
    room
      .timer
      .paused ||
    room
      .timer
      .phase ===
      'idle'
  ) {
    stopTimerInterval(
      room,
    );
    return;
  }

  room.timer.remainingMs -=
    TIMER_TICK_MS;

  if (
    room
      .timer
      .remainingMs <=
    0
  ) {
    room.timer.remainingMs = 0;
    completePhase(
      io,
      room,
    );
    return;
  }

  // Broadcast tick
  io.to(
    socketRoom(
      room.code,
    ),
  ).emit(
    'rmhstudy:timer:tick',
    {
      phase:
        room
          .timer
          .phase,
      remainingMs:
        room
          .timer
          .remainingMs,
      totalMs:
        room
          .timer
          .totalMs,
      sessionNumber:
        room
          .timer
          .sessionNumber,
      totalSessions:
        room
          .timer
          .totalSessions,
    },
  );
}

function completePhase(
  io: Server,
  room: StudyRoom,
): void {
  const completedPhase =
    room
      .timer
      .phase;
  const nextPhase =
    getNextPhase(
      room,
    );

  // Record DB stats when a work phase completes
  if (
    completedPhase ===
    'working'
  ) {
    persistWorkSession(
      room,
    );
  }

  // Update session number
  if (
    completedPhase ===
    'working'
  ) {
    // Session number stays the same until break completes — it increments when work completes
    // (sessionNumber represents the work session that just completed)
  }

  if (
    completedPhase ===
      'short_break' ||
    completedPhase ===
      'long_break'
  ) {
    // The time the break actually ran: all of it on a natural end, less when it was skipped.
    persistBreak(
      room,
      room.timer.totalMs -
        room.timer.remainingMs,
    );
    // After long break, reset session counter
    if (
      completedPhase ===
      'long_break'
    ) {
      room.timer.sessionNumber = 0;
    }
  }

  // Emit phase complete
  io.to(
    socketRoom(
      room.code,
    ),
  ).emit(
    'rmhstudy:timer:phaseComplete',
    {
      completedPhase,
      nextPhase,
      sessionNumber:
        room
          .timer
          .sessionNumber,
    },
  );

  logger.info(
    {
      event:
        'rmhstudy_phase_complete',
      roomCode:
        room.code,
      completedPhase,
      nextPhase,
      sessionNumber:
        room
          .timer
          .sessionNumber,
    },
  );

  // Determine if we should auto-start the next phase
  const shouldAutoStart =
    ((nextPhase ===
      'short_break' ||
      nextPhase ===
        'long_break') &&
      room
        .settings
        .autoStartBreaks) ||
    (nextPhase ===
      'working' &&
      room
        .settings
        .autoStartWork);

  if (
    shouldAutoStart
  ) {
    transitionToPhase(
      io,
      room,
      nextPhase,
    );
  } else {
    // Pause, waiting for host to start
    stopTimerInterval(
      room,
    );
    room.timer.phase =
      nextPhase;
    const totalMs =
      getTotalMsForPhase(
        room,
        nextPhase,
      );
    room.timer.totalMs =
      totalMs;
    room.timer.remainingMs =
      totalMs;
    room.timer.paused = true;

    // If transitioning to working, increment session number
    if (
      nextPhase ===
      'working'
    ) {
      room
        .timer
        .sessionNumber++;
      room.workPhaseStartedAt =
        null;
    }

    io.to(
      socketRoom(
        room.code,
      ),
    ).emit(
      'rmhstudy:timer:paused',
      {
        phase:
          room
            .timer
            .phase,
        remainingMs:
          room
            .timer
            .remainingMs,
      },
    );
  }
}

function transitionToPhase(
  io: Server,
  room: StudyRoom,
  phase: TimerPhase,
): void {
  const totalMs =
    getTotalMsForPhase(
      room,
      phase,
    );
  room.timer.phase =
    phase;
  room.timer.totalMs =
    totalMs;
  room.timer.remainingMs =
    totalMs;
  room.timer.paused = false;

  if (
    phase ===
    'working'
  ) {
    room
      .timer
      .sessionNumber++;
    room.workPhaseStartedAt =
      Date.now();
  } else {
    room.workPhaseStartedAt =
      null;
  }

  startTimerInterval(
    io,
    room,
  );

  // Broadcast initial tick for the new phase
  io.to(
    socketRoom(
      room.code,
    ),
  ).emit(
    'rmhstudy:timer:tick',
    {
      phase:
        room
          .timer
          .phase,
      remainingMs:
        room
          .timer
          .remainingMs,
      totalMs:
        room
          .timer
          .totalMs,
      sessionNumber:
        room
          .timer
          .sessionNumber,
      totalSessions:
        room
          .timer
          .totalSessions,
    },
  );
}

// ─── Database Persistence (fire-and-forget) ───

/**
 * When a finished work phase began and ended. The row is written as the phase completes, so
 * `endedAt` is now and `startedAt` is that minus the focus length (a pause only makes it
 * approximate; the timer tracks no wall-clock start that survives one).
 */
export function workSessionWindow(
  endMs: number,
  focusTimeMs: number,
): {
  startedAt: Date;
  endedAt: Date;
} {
  return {
    startedAt:
      new Date(
        endMs -
          focusTimeMs,
      ),
    endedAt:
      new Date(
        endMs,
      ),
  };
}

function persistWorkSession(
  room: StudyRoom,
): void {
  const focusTimeMs =
    room
      .settings
      .workDurationMs;
  const sessionNumber =
    room
      .timer
      .sessionNumber;
  const memberList =
    Array.from(
      room.members.values(),
    );

  // Persist for all members in the room
  for (const member of memberList) {
    const userId =
      member.userId;
    // Progression: XP for completing a focus (Pomodoro) work session.
    awardAppProgress(
      userId,
      {
        xp: 15,
      },
    );
    void persistMemberWorkSession(
      userId,
      room.code,
      focusTimeMs,
      sessionNumber,
    );
  }
}

/**
 * One member's finished work session: the profile totals, the streak and the session row.
 *
 * The streak is computed from the profile as it was BEFORE this session (`nextStudyStreak`);
 * reading it after the upsert had already stamped `lastStudyDate` with now is why the streak
 * used to stay at 1 forever.
 */
export async function persistMemberWorkSession(
  userId: string,
  roomCode: string,
  focusTimeMs: number,
  sessionNumber: number,
): Promise<void> {
  try {
    const db =
      getPrismaClient();
    const now =
      new Date();
    const previous =
      await db.rmhStudyProfile.findUnique(
        {
          where: {
            userId,
          },
          select: {
            currentStreak: true,
            longestStreak: true,
            lastStudyDate: true,
            timeZone: true,
          },
        },
      );
    const streak =
      nextStudyStreak(
        previous,
        now,
        previous?.timeZone,
      );
    const profile =
      await db.rmhStudyProfile.upsert(
        {
          where: {
            userId,
          },
          create: {
            userId,
            totalFocusTimeMs:
              BigInt(
                focusTimeMs,
              ),
            sessionsCompleted: 1,
            ...streak,
            lastStudyDate:
              now,
          },
          update: {
            totalFocusTimeMs: {
              increment:
                BigInt(
                  focusTimeMs,
                ),
            },
            sessionsCompleted: {
              increment: 1,
            },
            ...streak,
            lastStudyDate:
              now,
          },
        },
      );
    await db.rmhStudySession.create(
      {
        data: {
          profileId:
            profile.id,
          userId,
          roomId:
            roomCode,
          focusTimeMs,
          // The break follows the work phase; `persistBreak` fills it in when it ends.
          breakTimeMs: 0,
          sessionsInRun:
            sessionNumber,
          ...workSessionWindow(
            now.getTime(),
            focusTimeMs,
          ),
        },
      },
    );
  } catch (err) {
    logger.warn(
      {
        event:
          'rmhstudy_db_persist_session_failed',
        userId,
        error: (
          err as Error
        ).message,
      },
    );
  }
}

/** The longest zone name the profile column holds. */
const MAX_TIME_ZONE_LENGTH =
  40;

/**
 * The IANA zone a client sent on joining, or null when it is not a string or not a zone the
 * runtime knows. The client's word is never trusted beyond that: it only decides which local
 * day a real, recorded session falls on.
 */
export function validTimeZone(
  raw: unknown,
): string | null {
  return typeof raw ===
    'string' &&
    raw.length <=
      MAX_TIME_ZONE_LENGTH &&
    isValidTimeZone(
      raw,
    )
    ? raw
    : null;
}

/** Remember the member's zone for their streak; a missing or invalid zone changes nothing. */
export async function rememberTimeZone(
  userId: string,
  raw: unknown,
): Promise<void> {
  const timeZone =
    validTimeZone(
      raw,
    );
  if (
    !timeZone
  )
    return;
  try {
    await getPrismaClient().rmhStudyProfile.upsert(
      {
        where: {
          userId,
        },
        create: {
          userId,
          timeZone,
        },
        update: {
          timeZone,
        },
      },
    );
  } catch (err) {
    logger.warn(
      {
        event:
          'rmhstudy_db_persist_timezone_failed',
        userId,
        error: (
          err as Error
        ).message,
      },
    );
  }
}

/** How long a break may trail its work session and still belong to it. */
const BREAK_ATTACH_WINDOW_MS =
  2 * 60 * 60 * 1000;

/**
 * A break that ended (ran out or was skipped): add the time it ran to each member's latest session in this room,
 * the work session it followed. A member who joined during the break has no such session within
 * the window, so nothing is written for them.
 */
function persistBreak(
  room: StudyRoom,
  breakTimeMs: number,
): void {
  if (
    breakTimeMs <=
    0
  )
    return;
  const since =
    new Date(
      Date.now() -
        BREAK_ATTACH_WINDOW_MS,
    );
  for (const member of room.members.values()) {
    const userId =
      member.userId;
    void (async () => {
      try {
        const db =
          getPrismaClient();
        const latest =
          await db.rmhStudySession.findFirst(
            {
              where: {
                userId,
                roomId:
                  room.code,
                breakTimeMs: 0,
                endedAt: {
                  gte: since,
                },
              },
              orderBy: {
                startedAt:
                  'desc',
              },
              select: {
                id: true,
              },
            },
          );
        if (
          !latest
        )
          return;
        await db.rmhStudySession.update(
          {
            where: {
              id: latest.id,
            },
            data: {
              breakTimeMs,
            },
          },
        );
      } catch (err) {
        logger.warn(
          {
            event:
              'rmhstudy_db_persist_break_failed',
            userId,
            error: (
              err as Error
            ).message,
          },
        );
      }
    })();
  }
}

// ─── Room Cleanup ───

/** Immediately remove a player (used for explicit leave or grace-period expiry). */
function removePlayerFromRoom(
  io: Server,
  userId: string,
  roomCode: string,
): void {
  const room =
    rooms.get(
      roomCode,
    );
  if (
    !room
  )
    return;

  // Clean up socket maps for the member's current socketId
  const member =
    room.members.get(
      userId,
    );
  if (
    member
  ) {
    socketUserMap.delete(
      member.socketId,
    );
    socketRoomMap.delete(
      member.socketId,
    );
  }

  room.members.delete(
    userId,
  );
  userSocketMap.delete(
    userId,
  );
  clearDisconnectTimer(
    userId,
  );

  if (
    room
      .members
      .size ===
    0
  ) {
    // Room empty — clean up entirely
    stopTimerInterval(
      room,
    );
    rooms.delete(
      roomCode,
    );
    logger.info(
      {
        event:
          'rmhstudy_room_deleted',
        roomCode,
      },
    );
    return;
  }

  // Host migration — only pick from connected members first, then any member
  if (
    room.hostUserId ===
    userId
  ) {
    const connected =
      Array.from(
        room.members.values(),
      ).find(
        (
          m,
        ) =>
          m.isConnected,
      );
    const newHost =
      connected ??
      room.members
        .values()
        .next()
        .value;
    if (
      newHost
    ) {
      room.hostUserId =
        newHost.userId;
      logger.info(
        {
          event:
            'rmhstudy_host_migrated',
          roomCode,
          newHostUserId:
            newHost.userId,
        },
      );
    }
  }

  broadcastRoomState(
    io,
    room,
  );
}

/** Mark a member as disconnected and start the grace-period timer. */
function markMemberDisconnected(
  io: Server,
  socketId: string,
): void {
  const userId =
    socketUserMap.get(
      socketId,
    );
  const roomCode =
    socketRoomMap.get(
      socketId,
    );
  if (
    !userId ||
    !roomCode
  )
    return;

  const room =
    rooms.get(
      roomCode,
    );
  if (
    !room
  )
    return;

  const member =
    room.members.get(
      userId,
    );
  if (
    !member
  )
    return;

  // Mark as disconnected but keep in the room
  member.isConnected = false;

  // Clean old socket mappings
  socketUserMap.delete(
    socketId,
  );
  socketRoomMap.delete(
    socketId,
  );

  // Broadcast the updated state (member shows as disconnected)
  broadcastRoomState(
    io,
    room,
  );

  // Start grace-period timer — remove if they don't reconnect
  clearDisconnectTimer(
    userId,
  );
  const timer =
    setTimeout(
      () => {
        disconnectTimers.delete(
          userId,
        );
        // Check they're still disconnected before removing
        const r =
          rooms.get(
            roomCode,
          );
        const m =
          r?.members.get(
            userId,
          );
        if (
          r &&
          m &&
          !m.isConnected
        ) {
          removePlayerFromRoom(
            io,
            userId,
            roomCode,
          );
          logger.info(
            {
              event:
                'rmhstudy_grace_expired',
              roomCode,
              userId,
            },
          );
        }
      },
      config.DISCONNECT_GRACE_PERIOD_MS,
    );
  disconnectTimers.set(
    userId,
    timer,
  );
}

function clearDisconnectTimer(
  userId: string,
): void {
  const existing =
    disconnectTimers.get(
      userId,
    );
  if (
    existing
  ) {
    clearTimeout(
      existing,
    );
    disconnectTimers.delete(
      userId,
    );
  }
}

/**
 * Create a room with `userId` as host and join the socket to it. Shared by the
 * `rmhstudy:room:create` event and by a body-doubling match opening its room.
 */
function createRoomForSocket(
  io: Server,
  socket: Socket,
  userId: string,
  userName: string,
  rawSettings:
    | Record<
        string,
        unknown
      >
    | undefined,
  isPublic: boolean,
  fixedCode?: string,
): string {
  // Remove from any existing room
  const existingRoomCode =
    socketRoomMap.get(
      socket.id,
    );
  if (
    existingRoomCode
  ) {
    removePlayerFromRoom(
      io,
      userId,
      existingRoomCode,
    );
  }

  // Generate unique room code (a body-doubling match brings its own)
  let code =
    fixedCode ??
    generateRoomCode(
      6,
    );
  let attempts = 0;
  while (
    !fixedCode &&
    rooms.has(
      code,
    ) &&
    attempts <
      20
  ) {
    code =
      generateRoomCode(
        6,
      );
    attempts++;
  }

  const settings =
    parseSettings(
      rawSettings,
    );

  const room: StudyRoom =
    {
      code,
      hostUserId:
        userId,
      isPublic,
      settings,
      timer:
        {
          phase:
            'idle',
          remainingMs: 0,
          totalMs: 0,
          sessionNumber: 0,
          totalSessions:
            settings.sessionsBeforeLongBreak,
          paused: false,
        },
      timerInterval:
        null,
      members:
        new Map(),
      bannedUsers:
        [],
      chat: [],
      chatReactions:
        new Map(),
      workPhaseStartedAt:
        null,
    };

  const member: RoomMember =
    {
      socketId:
        socket.id,
      userId,
      userName,
      avatarUrl:
        (socket
          .data
          .avatarUrl as string) ??
        null,
      isConnected: true,
      status:
        'idle',
      tasks:
        [],
      joinedAt:
        Date.now(),
    };

  room.members.set(
    userId,
    member,
  );
  rooms.set(
    code,
    room,
  );
  userSocketMap.set(
    userId,
    socket.id,
  );
  socketUserMap.set(
    socket.id,
    userId,
  );
  socketRoomMap.set(
    socket.id,
    code,
  );

  socket.join(
    socketRoom(
      code,
    ),
  );
  broadcastRoomState(
    io,
    room,
  );

  logger.info(
    {
      event:
        'rmhstudy_room_created',
      roomCode:
        code,
      userId,
      userName,
    },
  );
  return code;
}

// ─── Event Handlers ───

export function registerRmhStudyHandlers(
  io: Server,
  socket: Socket,
): void {
  // ─── Create Room ───
  socket.on(
    'rmhstudy:room:create',
    (payload: {
      userId?: string;
      userName?: string;
      settings?: Record<
        string,
        unknown
      >;
      isPublic?: boolean;
    }) => {
      if (
        !checkRateLimit(
          socket.id,
          'rmhstudy:room:create',
        )
      ) {
        emitError(
          socket,
          'Rate limited. Please wait before creating another room.',
        );
        return;
      }

      // Identity comes ONLY from the authenticated session (soft-auth attaches it on
      // handshake). Trusting a client-supplied payload.userId let anyone write study
      // stats to another user's profile. Anonymous connections have no id here and
      // are rejected below, which is correct — RMH Study persists to a user profile.
      const userId =
        typeof socket
          .data
          .userId ===
        'string'
          ? socket
              .data
              .userId
          : '';
      const userName =
        typeof payload?.userName ===
          'string' &&
        payload.userName.trim()
          ? sanitizeUserName(
              payload.userName,
            )
          : (socket
              .data
              .userName as string) ||
            'Player';
      if (
        !userId
      ) {
        emitError(
          socket,
          'Not authenticated',
        );
        return;
      }

      createRoomForSocket(
        io,
        socket,
        userId,
        userName,
        payload?.settings,
        typeof payload?.isPublic ===
          'boolean'
          ? payload.isPublic
          : false,
      );
    },
  );

  // ─── Join Room ───
  /** Open a body-doubling match's room if the caller is one of the pair and the session window is open. */
  const openMatchRoom =
    async (
      roomCode: string,
      matchId: string,
      userId: string,
      userName: string,
    ) => {
      try {
        const db =
          getPrismaClient() as unknown as {
            studyBuddyMatch: {
              findUnique(
                args: unknown,
              ): Promise<{
                roomCode: string;
                lengthMin: number;
                startsAt: Date;
                endsAt: Date;
                userAId: string;
                userBId: string;
              } | null>;
            };
          };
        const match =
          await db.studyBuddyMatch.findUnique(
            {
              where:
                {
                  id: matchId,
                },
              select:
                {
                  roomCode: true,
                  lengthMin: true,
                  startsAt: true,
                  endsAt: true,
                  userAId: true,
                  userBId: true,
                },
            },
          );
        if (
          !match ||
          match.roomCode !==
            roomCode ||
          (match.userAId !==
            userId &&
            match.userBId !==
              userId)
        ) {
          emitError(
            socket,
            'Room not found',
          );
          return;
        }
        const now =
          Date.now();
        if (
          now <
          new Date(
            match.startsAt,
          ).getTime() -
            5 *
              60_000
        ) {
          emitError(
            socket,
            'Your study session has not opened yet. Come back a few minutes before it starts.',
          );
          return;
        }
        if (
          now >
          new Date(
            match.endsAt,
          ).getTime()
        ) {
          emitError(
            socket,
            'This study session has ended.',
          );
          return;
        }
        // The partner may have opened it while we were reading the match.
        if (
          getRoomByCode(
            roomCode,
          )
        ) {
          handleJoin(
            {
              roomCode,
            },
          );
          return;
        }
        createRoomForSocket(
          io,
          socket,
          userId,
          userName,
          {
            workDurationMs:
              match.lengthMin *
              60_000,
            sessionsBeforeLongBreak: 1,
          },
          false,
          roomCode,
        );
      } catch (err) {
        logger.error(
          {
            event:
              'rmhstudy_match_room_failed',
            roomCode,
            matchId,
            err: (
              err as Error
            )
              ?.message,
          },
        );
        emitError(
          socket,
          'Could not open your study room.',
        );
      }
    };

  const handleJoin =
    (payload: {
      roomCode?: string;
      matchId?: string;
      userId?: string;
      userName?: string;
      timeZone?: string;
    }) => {
      if (
        !checkRateLimit(
          socket.id,
          'rmhstudy:room:join',
        )
      ) {
        emitError(
          socket,
          'Rate limited. Please wait before joining.',
        );
        return;
      }

      const roomCode =
        (
          typeof payload?.roomCode ===
          'string'
            ? payload.roomCode
            : ''
        )
          .toUpperCase()
          .trim();
      // Identity comes ONLY from the authenticated session (soft-auth attaches it on
      // handshake). Trusting a client-supplied payload.userId let anyone write study
      // stats to another user's profile. Anonymous connections have no id here and
      // are rejected below, which is correct — RMH Study persists to a user profile.
      const userId =
        typeof socket
          .data
          .userId ===
        'string'
          ? socket
              .data
              .userId
          : '';
      const userName =
        typeof payload?.userName ===
          'string' &&
        payload.userName.trim()
          ? sanitizeUserName(
              payload.userName,
            )
          : (socket
              .data
              .userName as string) ||
            'Player';
      if (
        !roomCode ||
        !userId
      ) {
        emitError(
          socket,
          'Missing roomCode or not authenticated',
        );
        return;
      }

      const room =
        getRoomByCode(
          roomCode,
        );
      if (
        !room
      ) {
        // A body-doubling match (calendar F5) carries its own room code; the first of
        // the pair to arrive inside the session window opens the room.
        const matchId =
          typeof payload?.matchId ===
          'string'
            ? payload.matchId.slice(
                0,
                40,
              )
            : '';
        if (
          matchId
        ) {
          void openMatchRoom(
            roomCode,
            matchId,
            userId,
            userName,
          );
          return;
        }
        emitError(
          socket,
          'Room not found',
        );
        return;
      }

      // Ban check
      if (
        room.bannedUsers.some(
          (
            b,
          ) =>
            b.userId ===
            userId,
        )
      ) {
        socket.emit(
          'rmhstudy:error',
          {
            code: 'BANNED',
            message:
              'You are banned from this room',
          },
        );
        return;
      }

      if (
        room
          .members
          .size >=
          MAX_ROOM_MEMBERS &&
        !room.members.has(
          userId,
        )
      ) {
        emitError(
          socket,
          'Room is full',
        );
        return;
      }

      // If already in a different room, leave it first
      const existingCode =
        socketRoomMap.get(
          socket.id,
        );
      if (
        existingCode &&
        existingCode !==
          roomCode
      ) {
        removePlayerFromRoom(
          io,
          userId,
          existingCode,
        );
      }

      // Cancel any pending disconnect grace-period timer (user reconnected)
      clearDisconnectTimer(
        userId,
      );

      // Handle reconnect: if this userId already has a socket, clean up old mappings
      const oldSocketId =
        userSocketMap.get(
          userId,
        );
      if (
        oldSocketId &&
        oldSocketId !==
          socket.id
      ) {
        socketUserMap.delete(
          oldSocketId,
        );
        socketRoomMap.delete(
          oldSocketId,
        );
      }

      void rememberTimeZone(
        userId,
        payload?.timeZone,
      );

      // Preserve existing tasks on reconnect
      const existingMember =
        room.members.get(
          userId,
        );
      const existingTasks =
        existingMember?.tasks ??
        [];

      const member: RoomMember =
        {
          socketId:
            socket.id,
          userId,
          userName,
          avatarUrl:
            (socket
              .data
              .avatarUrl as string) ??
            null,
          isConnected: true,
          status:
            existingMember?.status ??
            'idle',
          tasks:
            existingTasks,
          joinedAt:
            existingMember?.joinedAt ??
            Date.now(),
        };

      room.members.set(
        userId,
        member,
      );
      userSocketMap.set(
        userId,
        socket.id,
      );
      socketUserMap.set(
        socket.id,
        userId,
      );
      socketRoomMap.set(
        socket.id,
        roomCode,
      );

      socket.join(
        socketRoom(
          roomCode,
        ),
      );
      broadcastRoomState(
        io,
        room,
      );

      // Send the member their task list on join
      socket.emit(
        'rmhstudy:task:list',
        {
          tasks:
            member.tasks,
        },
      );

      logger.info(
        {
          event:
            'rmhstudy_player_joined',
          roomCode,
          userId,
          userName,
        },
      );
    };
  socket.on(
    'rmhstudy:room:join',
    handleJoin,
  );

  // ─── Leave Room ───
  socket.on(
    'rmhstudy:room:leave',
    (payload: {
      roomCode?: string;
    }) => {
      const roomCode =
        (
          typeof payload?.roomCode ===
          'string'
            ? payload.roomCode
            : ''
        )
          .toUpperCase()
          .trim();
      const userId =
        socketUserMap.get(
          socket.id,
        );
      const resolvedCode =
        roomCode ||
        socketRoomMap.get(
          socket.id,
        ) ||
        '';
      if (
        userId &&
        resolvedCode
      ) {
        removePlayerFromRoom(
          io,
          userId,
          resolvedCode,
        );
      }
      if (
        resolvedCode
      )
        socket.leave(
          socketRoom(
            resolvedCode,
          ),
        );
    },
  );

  // ─── Chat ───
  socket.on(
    'rmhstudy:room:chat',
    (payload: {
      roomCode?: string;
      message?: string;
    }) => {
      if (
        !checkRateLimit(
          socket.id,
          'rmhstudy:room:chat',
        )
      ) {
        emitError(
          socket,
          'Rate limited. Slow down chat messages.',
        );
        return;
      }

      const roomCode =
        (
          typeof payload?.roomCode ===
          'string'
            ? payload.roomCode
            : ''
        )
          .toUpperCase()
          .trim();
      const messageText =
        sanitizeString(
          payload?.message,
          MAX_CHAT_LENGTH,
        );
      if (
        !roomCode ||
        !messageText
      )
        return;

      const room =
        getRoomByCode(
          roomCode,
        );
      if (
        !room
      )
        return;

      const userId =
        socketUserMap.get(
          socket.id,
        );
      if (
        !userId
      )
        return;

      const member =
        room.members.get(
          userId,
        );
      if (
        !member
      )
        return;

      const chatMsg: ChatMessage =
        {
          id: generateId(),
          userId,
          userName:
            member.userName,
          message:
            messageText,
          timestamp:
            Date.now(),
          reactions:
            {},
        };

      room.chat.push(
        chatMsg,
      );
      // Trim chat history
      if (
        room
          .chat
          .length >
        MAX_CHAT_HISTORY
      ) {
        room.chat =
          room.chat.slice(
            -MAX_CHAT_HISTORY,
          );
      }

      io.to(
        socketRoom(
          roomCode,
        ),
      ).emit(
        'rmhstudy:room:chat',
        chatMsg,
      );
    },
  );

  // ─── Chat: React ───
  socket.on(
    'rmhstudy:chat:react',
    (payload: {
      messageId?: string;
      emoji?: string;
    }) => {
      if (
        !checkRateLimit(
          socket.id,
          'rmhstudy:chat:react',
        )
      ) {
        emitError(
          socket,
          'Rate limited.',
        );
        return;
      }

      const messageId =
        typeof payload?.messageId ===
        'string'
          ? payload.messageId
          : '';
      const emoji =
        typeof payload?.emoji ===
        'string'
          ? payload.emoji
          : '';
      if (
        !messageId ||
        !emoji
      )
        return;

      const userId =
        socketUserMap.get(
          socket.id,
        );
      if (
        !userId
      )
        return;

      const roomCode =
        socketRoomMap.get(
          socket.id,
        );
      if (
        !roomCode
      )
        return;

      const room =
        getRoomByCode(
          roomCode,
        );
      if (
        !room
      )
        return;

      // Verify the message exists
      const messageExists =
        room.chat.some(
          (
            m,
          ) =>
            m.id ===
            messageId,
        );
      if (
        !messageExists
      )
        return;

      // Get or create the reactions map for this message
      if (
        !room.chatReactions.has(
          messageId,
        )
      ) {
        room.chatReactions.set(
          messageId,
          new Map(),
        );
      }
      const messageReactions =
        room.chatReactions.get(
          messageId,
        )!;

      // Get or create the set of users for this emoji
      if (
        !messageReactions.has(
          emoji,
        )
      ) {
        messageReactions.set(
          emoji,
          new Set(),
        );
      }
      const emojiUsers =
        messageReactions.get(
          emoji,
        )!;

      // Toggle: if user already reacted, remove; otherwise add
      if (
        emojiUsers.has(
          userId,
        )
      ) {
        emojiUsers.delete(
          userId,
        );
        if (
          emojiUsers.size ===
          0
        )
          messageReactions.delete(
            emoji,
          );
        if (
          messageReactions.size ===
          0
        )
          room.chatReactions.delete(
            messageId,
          );
      } else {
        emojiUsers.add(
          userId,
        );
      }

      // Serialize and broadcast
      const reactions: Record<
        string,
        string[]
      > =
        {};
      const currentReactions =
        room.chatReactions.get(
          messageId,
        );
      if (
        currentReactions
      ) {
        for (const [
          emojiKey,
          userSet,
        ] of currentReactions) {
          reactions[
            emojiKey
          ] =
            Array.from(
              userSet,
            );
        }
      }

      io.to(
        socketRoom(
          roomCode,
        ),
      ).emit(
        'rmhstudy:chat:reaction',
        {
          messageId,
          reactions,
        },
      );
    },
  );

  // ─── Update Settings (host only, idle only) ───
  socket.on(
    'rmhstudy:room:settings',
    (payload: {
      roomCode?: string;
      settings?: Record<
        string,
        unknown
      >;
    }) => {
      const roomCode =
        (
          typeof payload?.roomCode ===
          'string'
            ? payload.roomCode
            : ''
        )
          .toUpperCase()
          .trim();
      if (
        !roomCode
      )
        return;

      const room =
        getRoomByCode(
          roomCode,
        );
      if (
        !room
      ) {
        emitError(
          socket,
          'Room not found',
        );
        return;
      }

      const userId =
        socketUserMap.get(
          socket.id,
        );
      if (
        !userId ||
        room.hostUserId !==
          userId
      ) {
        emitError(
          socket,
          'Only the host can change settings',
        );
        return;
      }

      if (
        room
          .timer
          .phase !==
        'idle'
      ) {
        emitError(
          socket,
          'Settings can only be changed while timer is idle',
        );
        return;
      }

      room.settings =
        parseSettings(
          payload?.settings,
        );
      room.timer.totalSessions =
        room.settings.sessionsBeforeLongBreak;

      // Handle isPublic toggle
      const rawSettings =
        payload?.settings;
      if (
        rawSettings &&
        typeof rawSettings ===
          'object' &&
        typeof (
          rawSettings as Record<
            string,
            unknown
          >
        )
          .isPublic ===
          'boolean'
      ) {
        room.isPublic =
          (
            rawSettings as Record<
              string,
              unknown
            >
          )
            .isPublic as boolean;
      }

      broadcastRoomState(
        io,
        room,
      );
      logger.info(
        {
          event:
            'rmhstudy_settings_updated',
          roomCode,
          userId,
        },
      );
    },
  );

  // ─── Member Status ───
  socket.on(
    'rmhstudy:room:status',
    (payload: {
      roomCode?: string;
      status?: string;
    }) => {
      const roomCode =
        (
          typeof payload?.roomCode ===
          'string'
            ? payload.roomCode
            : ''
        )
          .toUpperCase()
          .trim();
      const status =
        payload?.status;
      if (
        !roomCode ||
        !status
      )
        return;

      const validStatuses: MemberStatus[] =
        [
          'studying',
          'break',
          'idle',
          'away',
        ];
      if (
        !validStatuses.includes(
          status as MemberStatus,
        )
      )
        return;

      const room =
        getRoomByCode(
          roomCode,
        );
      if (
        !room
      )
        return;

      const userId =
        socketUserMap.get(
          socket.id,
        );
      if (
        !userId
      )
        return;

      const member =
        room.members.get(
          userId,
        );
      if (
        !member
      )
        return;

      member.status =
        status as MemberStatus;
      broadcastRoomState(
        io,
        room,
      );
    },
  );

  // ─── Timer: Start ───
  socket.on(
    'rmhstudy:timer:start',
    (payload: {
      roomCode?: string;
    }) => {
      if (
        !checkRateLimit(
          socket.id,
          'rmhstudy:timer:start',
        )
      ) {
        emitError(
          socket,
          'Rate limited.',
        );
        return;
      }

      const roomCode =
        (
          typeof payload?.roomCode ===
          'string'
            ? payload.roomCode
            : ''
        )
          .toUpperCase()
          .trim();
      const room =
        getRoomByCode(
          roomCode,
        );
      if (
        !room
      ) {
        emitError(
          socket,
          'Room not found',
        );
        return;
      }

      const userId =
        socketUserMap.get(
          socket.id,
        );
      if (
        !userId ||
        room.hostUserId !==
          userId
      ) {
        emitError(
          socket,
          'Only the host can control the timer',
        );
        return;
      }

      if (
        room
          .timer
          .phase ===
        'idle'
      ) {
        // Start fresh — begin first work session
        transitionToPhase(
          io,
          room,
          'working',
        );
        logger.info(
          {
            event:
              'rmhstudy_timer_started',
            roomCode,
            phase:
              'working',
            sessionNumber:
              room
                .timer
                .sessionNumber,
          },
        );
      } else if (
        room
          .timer
          .paused
      ) {
        // Resume from paused state (e.g., after phase complete without auto-start)
        room.timer.paused = false;
        if (
          room
            .timer
            .phase ===
          'working'
        ) {
          room.workPhaseStartedAt =
            Date.now();
        }
        startTimerInterval(
          io,
          room,
        );
        io.to(
          socketRoom(
            roomCode,
          ),
        ).emit(
          'rmhstudy:timer:tick',
          {
            phase:
              room
                .timer
                .phase,
            remainingMs:
              room
                .timer
                .remainingMs,
            totalMs:
              room
                .timer
                .totalMs,
            sessionNumber:
              room
                .timer
                .sessionNumber,
            totalSessions:
              room
                .timer
                .totalSessions,
          },
        );
        logger.info(
          {
            event:
              'rmhstudy_timer_started_from_pause',
            roomCode,
            phase:
              room
                .timer
                .phase,
          },
        );
      } else {
        emitError(
          socket,
          'Timer is already running',
        );
      }
    },
  );

  // ─── Timer: Pause ───
  socket.on(
    'rmhstudy:timer:pause',
    (payload: {
      roomCode?: string;
    }) => {
      if (
        !checkRateLimit(
          socket.id,
          'rmhstudy:timer:start',
        )
      ) {
        emitError(
          socket,
          'Rate limited.',
        );
        return;
      }

      const roomCode =
        (
          typeof payload?.roomCode ===
          'string'
            ? payload.roomCode
            : ''
        )
          .toUpperCase()
          .trim();
      const room =
        getRoomByCode(
          roomCode,
        );
      if (
        !room
      ) {
        emitError(
          socket,
          'Room not found',
        );
        return;
      }

      const userId =
        socketUserMap.get(
          socket.id,
        );
      if (
        !userId ||
        room.hostUserId !==
          userId
      ) {
        emitError(
          socket,
          'Only the host can control the timer',
        );
        return;
      }

      if (
        room
          .timer
          .phase ===
          'idle' ||
        room
          .timer
          .paused
      ) {
        emitError(
          socket,
          'Timer is not running',
        );
        return;
      }

      room.timer.paused = true;
      stopTimerInterval(
        room,
      );

      io.to(
        socketRoom(
          roomCode,
        ),
      ).emit(
        'rmhstudy:timer:paused',
        {
          phase:
            room
              .timer
              .phase,
          remainingMs:
            room
              .timer
              .remainingMs,
        },
      );

      logger.info(
        {
          event:
            'rmhstudy_timer_paused',
          roomCode,
          phase:
            room
              .timer
              .phase,
          remainingMs:
            room
              .timer
              .remainingMs,
        },
      );
    },
  );

  // ─── Timer: Resume ───
  socket.on(
    'rmhstudy:timer:resume',
    (payload: {
      roomCode?: string;
    }) => {
      if (
        !checkRateLimit(
          socket.id,
          'rmhstudy:timer:start',
        )
      ) {
        emitError(
          socket,
          'Rate limited.',
        );
        return;
      }

      const roomCode =
        (
          typeof payload?.roomCode ===
          'string'
            ? payload.roomCode
            : ''
        )
          .toUpperCase()
          .trim();
      const room =
        getRoomByCode(
          roomCode,
        );
      if (
        !room
      ) {
        emitError(
          socket,
          'Room not found',
        );
        return;
      }

      const userId =
        socketUserMap.get(
          socket.id,
        );
      if (
        !userId ||
        room.hostUserId !==
          userId
      ) {
        emitError(
          socket,
          'Only the host can control the timer',
        );
        return;
      }

      if (
        !room
          .timer
          .paused ||
        room
          .timer
          .phase ===
          'idle'
      ) {
        emitError(
          socket,
          'Timer is not paused',
        );
        return;
      }

      room.timer.paused = false;
      if (
        room
          .timer
          .phase ===
        'working'
      ) {
        room.workPhaseStartedAt =
          Date.now();
      }
      startTimerInterval(
        io,
        room,
      );

      io.to(
        socketRoom(
          roomCode,
        ),
      ).emit(
        'rmhstudy:timer:tick',
        {
          phase:
            room
              .timer
              .phase,
          remainingMs:
            room
              .timer
              .remainingMs,
          totalMs:
            room
              .timer
              .totalMs,
          sessionNumber:
            room
              .timer
              .sessionNumber,
          totalSessions:
            room
              .timer
              .totalSessions,
        },
      );

      logger.info(
        {
          event:
            'rmhstudy_timer_resumed',
          roomCode,
          phase:
            room
              .timer
              .phase,
        },
      );
    },
  );

  // ─── Timer: Skip ───
  socket.on(
    'rmhstudy:timer:skip',
    (payload: {
      roomCode?: string;
    }) => {
      if (
        !checkRateLimit(
          socket.id,
          'rmhstudy:timer:start',
        )
      ) {
        emitError(
          socket,
          'Rate limited.',
        );
        return;
      }

      const roomCode =
        (
          typeof payload?.roomCode ===
          'string'
            ? payload.roomCode
            : ''
        )
          .toUpperCase()
          .trim();
      const room =
        getRoomByCode(
          roomCode,
        );
      if (
        !room
      ) {
        emitError(
          socket,
          'Room not found',
        );
        return;
      }

      const userId =
        socketUserMap.get(
          socket.id,
        );
      if (
        !userId ||
        room.hostUserId !==
          userId
      ) {
        emitError(
          socket,
          'Only the host can control the timer',
        );
        return;
      }

      if (
        room
          .timer
          .phase ===
        'idle'
      ) {
        emitError(
          socket,
          'Nothing to skip',
        );
        return;
      }

      // Force complete the current phase
      stopTimerInterval(
        room,
      );
      room.timer.remainingMs = 0;
      completePhase(
        io,
        room,
      );

      logger.info(
        {
          event:
            'rmhstudy_timer_skipped',
          roomCode,
        },
      );
    },
  );

  // ─── Timer: Reset ───
  socket.on(
    'rmhstudy:timer:reset',
    (payload: {
      roomCode?: string;
    }) => {
      if (
        !checkRateLimit(
          socket.id,
          'rmhstudy:timer:start',
        )
      ) {
        emitError(
          socket,
          'Rate limited.',
        );
        return;
      }

      const roomCode =
        (
          typeof payload?.roomCode ===
          'string'
            ? payload.roomCode
            : ''
        )
          .toUpperCase()
          .trim();
      const room =
        getRoomByCode(
          roomCode,
        );
      if (
        !room
      ) {
        emitError(
          socket,
          'Room not found',
        );
        return;
      }

      const userId =
        socketUserMap.get(
          socket.id,
        );
      if (
        !userId ||
        room.hostUserId !==
          userId
      ) {
        emitError(
          socket,
          'Only the host can control the timer',
        );
        return;
      }

      stopTimerInterval(
        room,
      );

      room.timer =
        {
          phase:
            'idle',
          remainingMs: 0,
          totalMs: 0,
          sessionNumber: 0,
          totalSessions:
            room
              .settings
              .sessionsBeforeLongBreak,
          paused: false,
        };
      room.workPhaseStartedAt =
        null;

      io.to(
        socketRoom(
          roomCode,
        ),
      ).emit(
        'rmhstudy:timer:reset',
        {},
      );
      broadcastRoomState(
        io,
        room,
      );

      logger.info(
        {
          event:
            'rmhstudy_timer_reset',
          roomCode,
        },
      );
    },
  );

  // ─── Task: Add ───
  socket.on(
    'rmhstudy:task:add',
    (payload: {
      roomCode?: string;
      text?: string;
    }) => {
      if (
        !checkRateLimit(
          socket.id,
          'rmhstudy:task:add',
        )
      ) {
        emitError(
          socket,
          'Rate limited.',
        );
        return;
      }

      const roomCode =
        (
          typeof payload?.roomCode ===
          'string'
            ? payload.roomCode
            : ''
        )
          .toUpperCase()
          .trim();
      const text =
        sanitizeString(
          payload?.text,
          MAX_TASK_TEXT_LENGTH,
        );
      if (
        !roomCode ||
        !text
      )
        return;

      const room =
        getRoomByCode(
          roomCode,
        );
      if (
        !room
      )
        return;

      const userId =
        socketUserMap.get(
          socket.id,
        );
      if (
        !userId
      )
        return;

      const member =
        room.members.get(
          userId,
        );
      if (
        !member
      )
        return;

      if (
        member
          .tasks
          .length >=
        MAX_TASKS_PER_MEMBER
      ) {
        emitError(
          socket,
          'Task limit reached',
        );
        return;
      }

      const task: Task =
        {
          id: generateId(),
          text,
          completed: false,
          createdAt:
            Date.now(),
        };

      member.tasks.push(
        task,
      );

      // Send updated task list to the requesting socket only
      socket.emit(
        'rmhstudy:task:list',
        {
          tasks:
            member.tasks,
        },
      );

      // Broadcast updated room state (includes task progress)
      broadcastRoomState(
        io,
        room,
      );
    },
  );

  // ─── Task: Toggle ───
  socket.on(
    'rmhstudy:task:toggle',
    (payload: {
      roomCode?: string;
      taskId?: string;
    }) => {
      const roomCode =
        (
          typeof payload?.roomCode ===
          'string'
            ? payload.roomCode
            : ''
        )
          .toUpperCase()
          .trim();
      const taskId =
        typeof payload?.taskId ===
        'string'
          ? payload.taskId
          : '';
      if (
        !roomCode ||
        !taskId
      )
        return;

      const room =
        getRoomByCode(
          roomCode,
        );
      if (
        !room
      )
        return;

      const userId =
        socketUserMap.get(
          socket.id,
        );
      if (
        !userId
      )
        return;

      const member =
        room.members.get(
          userId,
        );
      if (
        !member
      )
        return;

      const task =
        member.tasks.find(
          (
            t,
          ) =>
            t.id ===
            taskId,
        );
      if (
        !task
      )
        return;

      task.completed =
        !task.completed;

      socket.emit(
        'rmhstudy:task:list',
        {
          tasks:
            member.tasks,
        },
      );
      broadcastRoomState(
        io,
        room,
      );
    },
  );

  // ─── Task: Delete ───
  socket.on(
    'rmhstudy:task:delete',
    (payload: {
      roomCode?: string;
      taskId?: string;
    }) => {
      const roomCode =
        (
          typeof payload?.roomCode ===
          'string'
            ? payload.roomCode
            : ''
        )
          .toUpperCase()
          .trim();
      const taskId =
        typeof payload?.taskId ===
        'string'
          ? payload.taskId
          : '';
      if (
        !roomCode ||
        !taskId
      )
        return;

      const room =
        getRoomByCode(
          roomCode,
        );
      if (
        !room
      )
        return;

      const userId =
        socketUserMap.get(
          socket.id,
        );
      if (
        !userId
      )
        return;

      const member =
        room.members.get(
          userId,
        );
      if (
        !member
      )
        return;

      const idx =
        member.tasks.findIndex(
          (
            t,
          ) =>
            t.id ===
            taskId,
        );
      if (
        idx ===
        -1
      )
        return;

      member.tasks.splice(
        idx,
        1,
      );

      socket.emit(
        'rmhstudy:task:list',
        {
          tasks:
            member.tasks,
        },
      );
      broadcastRoomState(
        io,
        room,
      );
    },
  );

  // ─── Browse Public Rooms ───
  socket.on(
    'rmhstudy:room:browse',
    () => {
      const publicRooms =
        Array.from(
          rooms.values(),
        )
          .filter(
            (
              r,
            ) =>
              r.isPublic &&
              r
                .members
                .size >
                0,
          )
          .map(
            (
              r,
            ) => ({
              roomCode:
                r.code,
              hostUserName:
                r.members.get(
                  r.hostUserId,
                )
                  ?.userName ??
                'Unknown',
              memberCount:
                r
                  .members
                  .size,
              maxMembers:
                MAX_ROOM_MEMBERS,
              timerPhase:
                r
                  .timer
                  .phase,
              workDurationMs:
                r
                  .settings
                  .workDurationMs,
            }),
          );

      socket.emit(
        'rmhstudy:room:browse_result',
        {
          rooms:
            publicRooms,
        },
      );
    },
  );

  // ─── Kick Member ───
  socket.on(
    'rmhstudy:room:kick',
    (payload?: {
      targetUserId?: string;
    }) => {
      const roomCode =
        socketRoomMap.get(
          socket.id,
        );
      if (
        !roomCode
      )
        return;

      const room =
        getRoomByCode(
          roomCode,
        );
      if (
        !room
      )
        return;

      const userId =
        socketUserMap.get(
          socket.id,
        );
      if (
        !userId ||
        room.hostUserId !==
          userId
      )
        return;

      const targetUserId =
        typeof payload?.targetUserId ===
        'string'
          ? payload.targetUserId
          : '';
      if (
        !targetUserId ||
        targetUserId ===
          userId
      )
        return;

      const targetMember =
        room.members.get(
          targetUserId,
        );
      if (
        !targetMember
      )
        return;

      // Notify the kicked member
      const targetSocketId =
        userSocketMap.get(
          targetUserId,
        );
      if (
        targetSocketId
      ) {
        const targetSocket =
          io.sockets.sockets.get(
            targetSocketId,
          );
        if (
          targetSocket
        ) {
          targetSocket.emit(
            'rmhstudy:room:kicked',
            {
              roomCode,
            },
          );
          targetSocket.leave(
            socketRoom(
              roomCode,
            ),
          );
          socketRoomMap.delete(
            targetSocketId,
          );
          socketUserMap.delete(
            targetSocketId,
          );
        }
      }

      room.members.delete(
        targetUserId,
      );
      userSocketMap.delete(
        targetUserId,
      );
      clearDisconnectTimer(
        targetUserId,
      );
      broadcastRoomState(
        io,
        room,
      );

      logger.info(
        {
          event:
            'rmhstudy_member_kicked',
          roomCode,
          targetUserId,
          hostUserId:
            userId,
        },
      );
    },
  );

  // ─── Ban Member ───
  socket.on(
    'rmhstudy:room:ban',
    (payload?: {
      targetUserId?: string;
      reason?: string;
    }) => {
      const roomCode =
        socketRoomMap.get(
          socket.id,
        );
      if (
        !roomCode
      )
        return;

      const room =
        getRoomByCode(
          roomCode,
        );
      if (
        !room
      )
        return;

      const userId =
        socketUserMap.get(
          socket.id,
        );
      if (
        !userId ||
        room.hostUserId !==
          userId
      )
        return;

      const targetUserId =
        typeof payload?.targetUserId ===
        'string'
          ? payload.targetUserId
          : '';
      if (
        !targetUserId ||
        targetUserId ===
          userId
      )
        return;

      const targetMember =
        room.members.get(
          targetUserId,
        );
      if (
        !targetMember
      )
        return;

      // Already banned?
      if (
        room.bannedUsers.some(
          (
            b,
          ) =>
            b.userId ===
            targetUserId,
        )
      )
        return;

      // Add to ban list
      room.bannedUsers.push(
        {
          userId:
            targetUserId,
          userName:
            targetMember.userName,
          bannedAt:
            Date.now(),
          bannedBy:
            userId,
          reason:
            typeof payload?.reason ===
              'string' &&
            payload.reason.trim()
              ? payload.reason
                  .trim()
                  .slice(
                    0,
                    200,
                  )
              : null,
        },
      );

      // Kick the member
      const targetSocketId =
        userSocketMap.get(
          targetUserId,
        );
      if (
        targetSocketId
      ) {
        const targetSocket =
          io.sockets.sockets.get(
            targetSocketId,
          );
        if (
          targetSocket
        ) {
          targetSocket.emit(
            'rmhstudy:room:kicked',
            {
              roomCode,
              reason:
                'banned',
            },
          );
          targetSocket.leave(
            socketRoom(
              roomCode,
            ),
          );
          socketRoomMap.delete(
            targetSocketId,
          );
          socketUserMap.delete(
            targetSocketId,
          );
        }
      }

      room.members.delete(
        targetUserId,
      );
      userSocketMap.delete(
        targetUserId,
      );
      clearDisconnectTimer(
        targetUserId,
      );
      broadcastRoomState(
        io,
        room,
      );

      logger.info(
        {
          event:
            'rmhstudy_member_banned',
          roomCode,
          targetUserId,
          hostUserId:
            userId,
        },
      );
    },
  );

  // ─── Unban Member ───
  socket.on(
    'rmhstudy:room:unban',
    (payload?: {
      targetUserId?: string;
    }) => {
      const roomCode =
        socketRoomMap.get(
          socket.id,
        );
      if (
        !roomCode
      )
        return;

      const room =
        getRoomByCode(
          roomCode,
        );
      if (
        !room
      )
        return;

      const userId =
        socketUserMap.get(
          socket.id,
        );
      if (
        !userId ||
        room.hostUserId !==
          userId
      )
        return;

      const targetUserId =
        typeof payload?.targetUserId ===
        'string'
          ? payload.targetUserId
          : '';
      if (
        !targetUserId
      )
        return;

      const index =
        room.bannedUsers.findIndex(
          (
            b,
          ) =>
            b.userId ===
            targetUserId,
        );
      if (
        index ===
        -1
      )
        return;

      room.bannedUsers.splice(
        index,
        1,
      );
      broadcastRoomState(
        io,
        room,
      );

      logger.info(
        {
          event:
            'rmhstudy_member_unbanned',
          roomCode,
          targetUserId,
          hostUserId:
            userId,
        },
      );
    },
  );

  // ─── Transfer Host ───
  socket.on(
    'rmhstudy:room:transfer_host',
    (payload?: {
      targetUserId?: string;
    }) => {
      const roomCode =
        socketRoomMap.get(
          socket.id,
        );
      if (
        !roomCode
      )
        return;

      const room =
        getRoomByCode(
          roomCode,
        );
      if (
        !room
      )
        return;

      const userId =
        socketUserMap.get(
          socket.id,
        );
      if (
        !userId ||
        room.hostUserId !==
          userId
      )
        return;

      const targetUserId =
        typeof payload?.targetUserId ===
        'string'
          ? payload.targetUserId
          : '';
      if (
        !targetUserId ||
        targetUserId ===
          userId
      )
        return;

      const targetMember =
        room.members.get(
          targetUserId,
        );
      if (
        !targetMember ||
        !targetMember.isConnected
      )
        return;

      room.hostUserId =
        targetUserId;
      broadcastRoomState(
        io,
        room,
      );

      logger.info(
        {
          event:
            'rmhstudy_host_transferred',
          roomCode,
          from: userId,
          to: targetUserId,
        },
      );
    },
  );
}

// ─── Disconnect Handler ───

export function handleRmhStudyDisconnect(
  io: Server,
  socket: Socket,
): void {
  const userId =
    socketUserMap.get(
      socket.id,
    );
  if (
    !userId
  )
    return;

  const roomCode =
    socketRoomMap.get(
      socket.id,
    );
  if (
    !roomCode
  )
    return;

  // Use grace period — mark disconnected, remove later if they don't reconnect
  markMemberDisconnected(
    io,
    socket.id,
  );

  logger.info(
    {
      event:
        'rmhstudy_player_disconnected',
      roomCode,
      userId,
    },
  );
}
