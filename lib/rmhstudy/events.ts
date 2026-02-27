/**
 * RMH Study — WebSocket Event Name Constants
 */

// ─── Client → Server Events ─────────────────────────────────────

export const C2S = {
  ROOM_CREATE:       'rmhstudy:room:create',
  ROOM_JOIN:         'rmhstudy:room:join',
  ROOM_LEAVE:        'rmhstudy:room:leave',
  ROOM_CHAT:         'rmhstudy:room:chat',
  ROOM_SETTINGS:     'rmhstudy:room:settings',
  ROOM_STATUS:       'rmhstudy:room:status',
  ROOM_BROWSE:       'rmhstudy:room:browse',
  ROOM_KICK:         'rmhstudy:room:kick',
  ROOM_BAN:          'rmhstudy:room:ban',
  ROOM_UNBAN:        'rmhstudy:room:unban',
  ROOM_TRANSFER_HOST:'rmhstudy:room:transfer_host',
  TIMER_START:       'rmhstudy:timer:start',
  TIMER_PAUSE:       'rmhstudy:timer:pause',
  TIMER_RESUME:      'rmhstudy:timer:resume',
  TIMER_SKIP:        'rmhstudy:timer:skip',
  TIMER_RESET:       'rmhstudy:timer:reset',
  TASK_ADD:          'rmhstudy:task:add',
  TASK_TOGGLE:       'rmhstudy:task:toggle',
  TASK_DELETE:        'rmhstudy:task:delete',
  CHAT_REACT:        'rmhstudy:chat:react',
} as const;

// ─── Server → Client Events ─────────────────────────────────────

export const S2C = {
  ROOM_STATE:          'rmhstudy:room:state',
  ROOM_CHAT:           'rmhstudy:room:chat',
  ROOM_BROWSE_RESULT:  'rmhstudy:room:browse_result',
  ROOM_KICKED:         'rmhstudy:room:kicked',
  CHAT_REACTION:       'rmhstudy:chat:reaction',
  TIMER_TICK:          'rmhstudy:timer:tick',
  TIMER_PHASE_COMPLETE:'rmhstudy:timer:phaseComplete',
  TIMER_PAUSED:        'rmhstudy:timer:paused',
  TIMER_RESET:         'rmhstudy:timer:reset',
  TASK_LIST:           'rmhstudy:task:list',
  ERROR:               'rmhstudy:error',
} as const;
