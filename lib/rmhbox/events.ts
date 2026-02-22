/**
 * RMHbox — WebSocket Event Name Constants
 *
 * All event names used in the RMHbox WebSocket protocol.
 * Uses the `rmhbox:` prefix to namespace events from other
 * Socket.io servers running in the same infrastructure.
 *
 * Reference: docs/rmhbox/design-spec/core.md §21
 */

// ─── Client → Server Events ─────────────────────────────────────

export const C2S = {
  LOBBY_CREATE:           'rmhbox:lobby:create',
  LOBBY_JOIN:             'rmhbox:lobby:join',
  LOBBY_LEAVE:            'rmhbox:lobby:leave',
  LOBBY_KICK:             'rmhbox:lobby:kick',
  LOBBY_TRANSFER_HOST:    'rmhbox:lobby:transfer_host',
  LOBBY_UPDATE_SETTINGS:  'rmhbox:lobby:update_settings',
  LOBBY_END_SESSION:      'rmhbox:lobby:end_session',
  LOBBY_TOGGLE_READY:     'rmhbox:lobby:toggle_ready',
  LOBBY_REQUEST_PROMOTION:'rmhbox:lobby:request_promotion',
  LOBBY_CHAT:             'rmhbox:lobby:chat',
  LOBBY_BROWSE:           'rmhbox:lobby:browse',
  GAME_SELECT:            'rmhbox:game:select',
  GAME_START_VOTE:        'rmhbox:game:start_vote',
  GAME_CAST_VOTE:         'rmhbox:game:cast_vote',
  GAME_FORCE_SKIP:        'rmhbox:game:force_skip',
  GAME_READY_TO_RENDER:   'rmhbox:game:ready_to_render',
  GAME_INPUT:             'rmhbox:game:input',
  LEADERBOARD_FETCH:      'rmhbox:leaderboard:fetch',
} as const;

// ─── Server → Client Events ─────────────────────────────────────

export const S2C = {
  LOBBY_CREATED:          'rmhbox:lobby:created',
  LOBBY_STATE_SNAPSHOT:   'rmhbox:lobby:state_snapshot',
  LOBBY_BROWSE_RESULT:    'rmhbox:lobby:browse_result',
  LOBBY_KICKED:           'rmhbox:lobby:kicked',
  LOBBY_DISBANDED:        'rmhbox:lobby:disbanded',
  GAME_ACTION:            'rmhbox:game:action',
  GAME_INSTRUCTIONS:      'rmhbox:game:instructions',
  GAME_PRELOAD_START:     'rmhbox:game:preload_start',
  GAME_PRELOAD_PROGRESS:  'rmhbox:game:preload_progress',
  GAME_COUNTDOWN:         'rmhbox:game:countdown',
  GAME_STARTED:           'rmhbox:game:started',
  GAME_STATE_SNAPSHOT:    'rmhbox:game:state_snapshot',
  GAME_ROUND_RESULTS:     'rmhbox:game:round_results',
  GAME_SESSION_RESULTS:   'rmhbox:game:session_results',
  GAME_VOTE_STARTED:      'rmhbox:game:vote_started',
  GAME_VOTE_UPDATE:       'rmhbox:game:vote_update',
  GAME_VOTE_RESULT:       'rmhbox:game:vote_result',
  LEADERBOARD_DATA:       'rmhbox:leaderboard:data',
  ERROR:                  'rmhbox:error',
} as const;
