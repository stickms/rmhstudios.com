/**
 * RmhTube — WebSocket Event Name Constants
 *
 * All event names used in the RmhTube WebSocket protocol.
 * Uses the `rmhtube:` prefix to namespace events.
 */

// ─── Client → Server Events ─────────────────────────────────────

export const C2S = {
  // Room lifecycle
  ROOM_CREATE:          'rmhtube:room:create',
  ROOM_JOIN:            'rmhtube:room:join',
  ROOM_LEAVE:           'rmhtube:room:leave',
  ROOM_KICK:            'rmhtube:room:kick',
  ROOM_TRANSFER_HOST:   'rmhtube:room:transfer_host',
  ROOM_UPDATE_SETTINGS: 'rmhtube:room:update_settings',
  ROOM_BROWSE:          'rmhtube:room:browse',
  ROOM_CHAT:            'rmhtube:room:chat',

  // Video sync (host → server)
  SYNC_HOST_STATE:      'rmhtube:sync:host_state',
  SYNC_PLAY:            'rmhtube:sync:play',
  SYNC_PAUSE:           'rmhtube:sync:pause',
  SYNC_SEEK:            'rmhtube:sync:seek',

  // Media queue
  QUEUE_ADD:            'rmhtube:queue:add',
  QUEUE_REMOVE:         'rmhtube:queue:remove',
  QUEUE_REORDER:        'rmhtube:queue:reorder',
  QUEUE_PLAY_ITEM:      'rmhtube:queue:play_item',
  QUEUE_SKIP:           'rmhtube:queue:skip',
  QUEUE_VOTE_SKIP:      'rmhtube:queue:vote_skip',

  // Reactions
  REACTION_SEND:        'rmhtube:reaction:send',
} as const;

// ─── Server → Client Events ─────────────────────────────────────

export const S2C = {
  // Room state
  ROOM_CREATED:         'rmhtube:room:created',
  ROOM_STATE_SNAPSHOT:  'rmhtube:room:state_snapshot',
  ROOM_ACTION:          'rmhtube:room:action',
  ROOM_BROWSE_RESULT:   'rmhtube:room:browse_result',
  ROOM_KICKED:          'rmhtube:room:kicked',
  ROOM_DISBANDED:       'rmhtube:room:disbanded',
  NOT_IN_ROOM:          'rmhtube:room:not_in_room',

  // Video sync (server → clients)
  SYNC_STATE:           'rmhtube:sync:state',
  SYNC_PLAY:            'rmhtube:sync:play',
  SYNC_PAUSE:           'rmhtube:sync:pause',
  SYNC_SEEK:            'rmhtube:sync:seek',
  SYNC_MEDIA_CHANGED:   'rmhtube:sync:media_changed',

  // Queue updates
  QUEUE_UPDATED:        'rmhtube:queue:updated',

  // Reactions
  REACTION_BROADCAST:   'rmhtube:reaction:broadcast',

  // Errors
  ERROR:                'rmhtube:error',
} as const;
