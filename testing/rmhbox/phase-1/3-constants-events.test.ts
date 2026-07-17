/**
 * Phase 1 — Section 3: Constants & Configuration
 *
 * Verifies that all shared constants are defined with correct values
 * and the server config resolves defaults correctly.
 */

import { describe, it, expect } from 'vitest';
import {
  ROOM_CODE_LENGTH,
  ROOM_CODE_ALPHABET,
  DEFAULT_MAX_PLAYERS,
  MIN_PLAYERS,
  ABSOLUTE_MAX_PLAYERS,
  DEFAULT_MAX_SPECTATORS,
  MAX_SPECTATORS,
  CHAT_MAX_LENGTH,
  CHAT_HISTORY_LENGTH,
  HEARTBEAT_INTERVAL_MS,
  LOBBY_IDLE_TIMEOUT_MS,
  LOBBY_ABSOLUTE_TIMEOUT_MS,
  LOBBY_EMPTY_TIMEOUT_MS,
  DISCONNECT_GRACE_PERIOD_MS,
  VOTE_DURATION_SECONDS,
  DEFAULT_INSTRUCTION_DURATION_SECONDS,
  PRELOAD_TIMEOUT_MS,
  COUNTDOWN_SECONDS,
  RESULTS_DISPLAY_SECONDS,
  LOBBY_GC_INTERVAL_MS,
  VOTE_CANDIDATE_COUNT,
  SOCKET_RATE_LIMITS,
} from '../../../lib/rmhbox/constants';
import { C2S, S2C } from '../../../lib/rmhbox/events';

describe('Shared Constants (§3.1)', () => {
  it('should define correct lobby constants', () => {
    expect(ROOM_CODE_LENGTH).toBe(6);
    expect(ROOM_CODE_ALPHABET).toBe('ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
    expect(DEFAULT_MAX_PLAYERS).toBe(8);
    expect(MIN_PLAYERS).toBe(2);
    expect(ABSOLUTE_MAX_PLAYERS).toBe(16);
    expect(DEFAULT_MAX_SPECTATORS).toBe(20);
    expect(MAX_SPECTATORS).toBe(50);
    expect(CHAT_MAX_LENGTH).toBe(200);
    expect(CHAT_HISTORY_LENGTH).toBe(100);
  });

  it('should define correct timer constants', () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(10_000);
    expect(LOBBY_IDLE_TIMEOUT_MS).toBe(15 * 60 * 1000);
    expect(LOBBY_ABSOLUTE_TIMEOUT_MS).toBe(30 * 60 * 1000);
    expect(LOBBY_EMPTY_TIMEOUT_MS).toBe(2 * 60 * 1000);
    expect(DISCONNECT_GRACE_PERIOD_MS).toBe(120_000);
    expect(VOTE_DURATION_SECONDS).toBe(30);
    expect(DEFAULT_INSTRUCTION_DURATION_SECONDS).toBe(15);
    expect(PRELOAD_TIMEOUT_MS).toBe(30_000);
    expect(COUNTDOWN_SECONDS).toBe(3);
    expect(RESULTS_DISPLAY_SECONDS).toBe(10);
    expect(LOBBY_GC_INTERVAL_MS).toBe(60_000);
  });

  it('should define correct voting constants', () => {
    expect(VOTE_CANDIDATE_COUNT).toBe(5);
  });

  it('should define rate limits for all rate-limited events', () => {
    expect(SOCKET_RATE_LIMITS['rmhbox:lobby:create']).toEqual({ max: 5, windowMs: 60_000 });
    expect(SOCKET_RATE_LIMITS['rmhbox:lobby:join']).toEqual({ max: 10, windowMs: 60_000 });
    expect(SOCKET_RATE_LIMITS['rmhbox:lobby:chat']).toEqual({ max: 20, windowMs: 60_000 });
    expect(SOCKET_RATE_LIMITS['rmhbox:game:input']).toEqual({ max: 100, windowMs: 10_000 });
    expect(SOCKET_RATE_LIMITS['rmhbox:game:cast_vote']).toEqual({ max: 10, windowMs: 60_000 });
    expect(SOCKET_RATE_LIMITS['rmhbox:leaderboard:fetch']).toEqual({ max: 5, windowMs: 60_000 });
  });

  it('should exclude ambiguous characters from room code alphabet', () => {
    expect(ROOM_CODE_ALPHABET).not.toContain('I');
    expect(ROOM_CODE_ALPHABET).not.toContain('O');
    expect(ROOM_CODE_ALPHABET).not.toContain('0');
    expect(ROOM_CODE_ALPHABET).not.toContain('1');
  });
});

describe('Event Constants (§3.2)', () => {
  it('should define all client-to-server events with rmhbox: prefix', () => {
    const c2sEvents = Object.values(C2S);
    expect(c2sEvents).toHaveLength(29);
    for (const event of c2sEvents) {
      expect(event).toMatch(/^rmhbox:/);
    }
  });

  it('should define all server-to-client events with rmhbox: prefix', () => {
    const s2cEvents = Object.values(S2C);
    expect(s2cEvents).toHaveLength(23);
    for (const event of s2cEvents) {
      expect(event).toMatch(/^rmhbox:/);
    }
  });

  it('should define specific C2S event names', () => {
    expect(C2S.LOBBY_CREATE).toBe('rmhbox:lobby:create');
    expect(C2S.LOBBY_JOIN).toBe('rmhbox:lobby:join');
    expect(C2S.LOBBY_LEAVE).toBe('rmhbox:lobby:leave');
    expect(C2S.LOBBY_KICK).toBe('rmhbox:lobby:kick');
    expect(C2S.LOBBY_TRANSFER_HOST).toBe('rmhbox:lobby:transfer_host');
    expect(C2S.LOBBY_UPDATE_SETTINGS).toBe('rmhbox:lobby:update_settings');
    expect(C2S.LOBBY_END_SESSION).toBe('rmhbox:lobby:end_session');
    expect(C2S.LOBBY_TOGGLE_READY).toBe('rmhbox:lobby:toggle_ready');
    expect(C2S.LOBBY_REQUEST_PROMOTION).toBe('rmhbox:lobby:request_promotion');
    expect(C2S.LOBBY_PROMOTE_SPECTATOR).toBe('rmhbox:lobby:promote_spectator');
    expect(C2S.LOBBY_CHAT).toBe('rmhbox:lobby:chat');
    expect(C2S.LOBBY_BROWSE).toBe('rmhbox:lobby:browse');
    expect(C2S.GAME_PICK).toBe('rmhbox:game:pick');
    expect(C2S.GAME_SELECT).toBe('rmhbox:game:select');
    expect(C2S.GAME_START_VOTE).toBe('rmhbox:game:start_vote');
    expect(C2S.GAME_CAST_VOTE).toBe('rmhbox:game:cast_vote');
    expect(C2S.GAME_FORCE_SKIP).toBe('rmhbox:game:force_skip');
    expect(C2S.GAME_FORCE_END).toBe('rmhbox:game:force_end');
    expect(C2S.GAME_PAUSE_TIMER).toBe('rmhbox:game:pause_timer');
    expect(C2S.GAME_READY_TO_RENDER).toBe('rmhbox:game:ready_to_render');
    expect(C2S.GAME_INPUT).toBe('rmhbox:game:input');
    expect(C2S.GAME_UPDATE_SETTINGS).toBe('rmhbox:game:update_settings');
    expect(C2S.GAME_CONFIRM_SETTINGS).toBe('rmhbox:game:confirm_settings');
    expect(C2S.GAME_RESET_SETTINGS).toBe('rmhbox:game:reset_settings');
    expect(C2S.LEADERBOARD_FETCH).toBe('rmhbox:leaderboard:fetch');
  });

  it('should define specific S2C event names', () => {
    expect(S2C.LOBBY_CREATED).toBe('rmhbox:lobby:created');
    expect(S2C.LOBBY_STATE_SNAPSHOT).toBe('rmhbox:lobby:state_snapshot');
    expect(S2C.LOBBY_BROWSE_RESULT).toBe('rmhbox:lobby:browse_result');
    expect(S2C.LOBBY_KICKED).toBe('rmhbox:lobby:kicked');
    expect(S2C.LOBBY_DISBANDED).toBe('rmhbox:lobby:disbanded');
    expect(S2C.GAME_ACTION).toBe('rmhbox:game:action');
    expect(S2C.GAME_INSTRUCTIONS).toBe('rmhbox:game:instructions');
    expect(S2C.GAME_PRELOAD_START).toBe('rmhbox:game:preload_start');
    expect(S2C.GAME_PRELOAD_PROGRESS).toBe('rmhbox:game:preload_progress');
    expect(S2C.GAME_COUNTDOWN).toBe('rmhbox:game:countdown');
    expect(S2C.GAME_STARTED).toBe('rmhbox:game:started');
    expect(S2C.GAME_STATE_SNAPSHOT).toBe('rmhbox:game:state_snapshot');
    expect(S2C.GAME_ROUND_RESULTS).toBe('rmhbox:game:round_results');
    expect(S2C.GAME_SESSION_RESULTS).toBe('rmhbox:game:session_results');
    expect(S2C.GAME_VOTE_STARTED).toBe('rmhbox:game:vote_started');
    expect(S2C.GAME_VOTE_UPDATE).toBe('rmhbox:game:vote_update');
    expect(S2C.GAME_VOTE_RESULT).toBe('rmhbox:game:vote_result');
    expect(S2C.GAME_SETTINGS_OPENED).toBe('rmhbox:game:settings_opened');
    expect(S2C.GAME_SETTINGS_UPDATED).toBe('rmhbox:game:settings_updated');
    expect(S2C.LEADERBOARD_DATA).toBe('rmhbox:leaderboard:data');
    expect(S2C.NOT_IN_LOBBY).toBe('rmhbox:lobby:not_in_lobby');
    expect(S2C.ERROR).toBe('rmhbox:error');
  });

  it('should have no duplicate event names across C2S and S2C', () => {
    const allEvents = [...Object.values(C2S), ...Object.values(S2C)];
    const uniqueEvents = new Set(allEvents);
    expect(uniqueEvents.size).toBe(allEvents.length);
  });
});
