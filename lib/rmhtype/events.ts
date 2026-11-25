/**
 * RMH Type — WebSocket Event Name Constants and the payloads the scored events carry
 */
import type { RunReason } from '@/lib/rmhtype/run-check';

// ─── Client → Server Events ─────────────────────────────────────

export const C2S = {
  ROOM_CREATE: 'rmhtype:room:create',
  ROOM_JOIN: 'rmhtype:room:join',
  ROOM_LEAVE: 'rmhtype:room:leave',
  ROOM_READY: 'rmhtype:room:ready',
  ROOM_CHAT: 'rmhtype:room:chat',
  ROOM_SETTINGS: 'rmhtype:room:settings',
  ROOM_BROWSE: 'rmhtype:room:browse',
  ROOM_KICK: 'rmhtype:room:kick',
  ROOM_BAN: 'rmhtype:room:ban',
  ROOM_UNBAN: 'rmhtype:room:unban',
  ROOM_UPDATE_SETTINGS: 'rmhtype:room:update_settings',
  ROOM_TRANSFER_HOST: 'rmhtype:room:transfer_host',
  GAME_START: 'rmhtype:game:start',
  GAME_PROGRESS: 'rmhtype:game:progress',
  GAME_FINISH: 'rmhtype:game:finish',
  SOLO_START: 'rmhtype:solo:start',
  SOLO_FINISH: 'rmhtype:solo:finish',
  LEADERBOARD_FETCH: 'rmhtype:leaderboard:fetch',
} as const;

// ─── Server → Client Events ─────────────────────────────────────

export const S2C = {
  ROOM_STATE: 'rmhtype:room:state',
  ROOM_CHAT: 'rmhtype:room:chat',
  ROOM_BROWSE_RESULT: 'rmhtype:room:list',
  ROOM_KICKED: 'rmhtype:room:kicked',
  GAME_COUNTDOWN: 'rmhtype:game:countdown',
  GAME_PASSAGE: 'rmhtype:game:passage',
  GAME_PROGRESS: 'rmhtype:game:progress',
  GAME_PLAYER_FINISHED: 'rmhtype:game:playerFinished',
  GAME_ROUND_RESULTS: 'rmhtype:game:roundResults',
  GAME_FINAL_RESULTS: 'rmhtype:game:finalResults',
  SOLO_COUNTDOWN: 'rmhtype:solo:countdown',
  SOLO_GENERATING: 'rmhtype:solo:generating',
  SOLO_AI_UNAVAILABLE: 'rmhtype:solo:aiUnavailable',
  SOLO_STARTED: 'rmhtype:solo:started',
  SOLO_RESULT: 'rmhtype:solo:result',
  SOLO_CHALLENGE_RESULT: 'rmhtype:solo:challengeResult',
  LEADERBOARD_DATA: 'rmhtype:leaderboard:data',
  PEERS_WAITING: 'rmhtype:peers:waiting',
  ERROR: 'rmhtype:error',
} as const;

// ─── Scored-run payloads ────────────────────────────────────────

/**
 * `C2S.SOLO_FINISH` and `C2S.GAME_FINISH`: the client's claim about its run. The server clamps `position` and
 * `errors`, times the run itself and checks `samples` (the coarse progress curve, `buildSamples`) against that time
 * (`evaluateFinish`, `run-check.ts`); a claim that fails is not ranked. `samples` holds at most `MAX_GHOST_SAMPLES`
 * whole numbers.
 */
export interface RunFinishPayload {
  position?: number;
  errors?: number;
  samples?: number[];
}

/** `S2C.SOLO_RESULT`: the run as the server scored it. `scorePosted` is kept for older clients and equals `ranked`. */
export interface SoloResultPayload {
  wpm: number;
  accuracy: number;
  timeMs: number;
  timedOut: boolean;
  ranked: boolean;
  scorePosted: boolean;
  practice: boolean;
  /** Why the check did not rank the run; absent when it passed. */
  reason?: RunReason;
}

/** `S2C.GAME_PLAYER_FINISHED`: a room finish; `didNotFinish` and `reason` are set when the check failed. */
export interface PlayerFinishedPayload {
  userId: string;
  userName: string;
  wpm: number;
  accuracy: number;
  timeMs: number;
  rank: number;
  didNotFinish?: boolean;
  reason?: RunReason;
}
