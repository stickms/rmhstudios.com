/**
 * RMH Type — WebSocket Event Name Constants
 */

// ─── Client → Server Events ─────────────────────────────────────

export const C2S = {
  ROOM_CREATE:    'rmhtype:room:create',
  ROOM_JOIN:      'rmhtype:room:join',
  ROOM_LEAVE:     'rmhtype:room:leave',
  ROOM_READY:     'rmhtype:room:ready',
  ROOM_CHAT:      'rmhtype:room:chat',
  ROOM_SETTINGS:  'rmhtype:room:settings',
  GAME_START:     'rmhtype:game:start',
  GAME_PROGRESS:  'rmhtype:game:progress',
  GAME_FINISH:    'rmhtype:game:finish',
  SOLO_START:     'rmhtype:solo:start',
  SOLO_FINISH:    'rmhtype:solo:finish',
} as const;

// ─── Server → Client Events ─────────────────────────────────────

export const S2C = {
  ROOM_STATE:          'rmhtype:room:state',
  ROOM_CHAT:           'rmhtype:room:chat',
  GAME_COUNTDOWN:      'rmhtype:game:countdown',
  GAME_PASSAGE:        'rmhtype:game:passage',
  GAME_PROGRESS:       'rmhtype:game:progress',
  GAME_PLAYER_FINISHED:'rmhtype:game:playerFinished',
  GAME_ROUND_RESULTS:  'rmhtype:game:roundResults',
  GAME_FINAL_RESULTS:  'rmhtype:game:finalResults',
  SOLO_COUNTDOWN:      'rmhtype:solo:countdown',
  SOLO_STARTED:        'rmhtype:solo:started',
  SOLO_RESULT:         'rmhtype:solo:result',
  ERROR:               'rmhtype:error',
} as const;
