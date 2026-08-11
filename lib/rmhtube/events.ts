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

  // Video sync (leader → server)
  SYNC_HOST_STATE:      'rmhtube:sync:host_state',
  SYNC_PLAY:            'rmhtube:sync:play',
  SYNC_PAUSE:           'rmhtube:sync:pause',
  SYNC_SEEK:            'rmhtube:sync:seek',
  // Clock sync + on-demand resync
  SYNC_PING:            'rmhtube:sync:ping',
  SYNC_REQUEST:         'rmhtube:sync:request',
  /** Any viewer: "I am / am no longer starved of data." Drives wait-for-peers. */
  SYNC_STALL:           'rmhtube:sync:stall',

  // Media queue
  QUEUE_ADD:            'rmhtube:queue:add',
  /** Leader-observed metadata for the playing item (duration, liveness, title). */
  QUEUE_META:           'rmhtube:queue:meta',
  QUEUE_REMOVE:         'rmhtube:queue:remove',
  QUEUE_REORDER:        'rmhtube:queue:reorder',
  QUEUE_PLAY_ITEM:      'rmhtube:queue:play_item',
  QUEUE_SKIP:           'rmhtube:queue:skip',
  QUEUE_VOTE_SKIP:      'rmhtube:queue:vote_skip',

  // Reactions
  REACTION_SEND:        'rmhtube:reaction:send',

  // Phase 1: Chat features
  CHAT_TYPING:          'rmhtube:chat:typing',
  CHAT_REACT:           'rmhtube:chat:react',
  CHAT_PIN:             'rmhtube:chat:pin',

  // Phase 2: Synced Playback Speed
  SYNC_SET_SPEED:       'rmhtube:sync:set_speed',

  // Phase 3: Queue features
  QUEUE_VOTE:           'rmhtube:queue:vote',
  QUEUE_SHUFFLE:        'rmhtube:queue:shuffle',

  // Phase 4: Room & Social features
  ROOM_SET_LEADER:      'rmhtube:room:set_leader',
  ROOM_BAN:             'rmhtube:room:ban',
  ROOM_UNBAN:           'rmhtube:room:unban',
  ROOM_CREATE_INVITE:   'rmhtube:room:create_invite',
  ROOM_SET_STATUS:      'rmhtube:room:set_status',
  ROOM_CHECK_HISTORY:   'rmhtube:room:check_history',
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

  /**
   * The room's timeline anchor — the ONE event that moves playback.
   *
   * There used to be four more beside it (`sync:play`, `sync:pause`,
   * `sync:seek`, `sync:speed_changed`) sent as "snappy edges" just before the
   * anchor that followed them. Each carried a flag but no position, so the
   * client re-stamped a stale `currentTime` as current and rewound every viewer
   * by however long it had been since the last anchor — a visible jerk on every
   * play, pause and speed change, undone a few milliseconds later by the anchor
   * that should have been the only message.
   */
  SYNC_STATE:           'rmhtube:sync:state',
  // Clock sync handshake reply
  SYNC_PONG:            'rmhtube:sync:pong',

  // Queue updates
  QUEUE_UPDATED:        'rmhtube:queue:updated',

  // Reactions
  REACTION_BROADCAST:   'rmhtube:reaction:broadcast',

  // Peers the room is holding for (buffering), and errors
  PEERS_WAITING:        'rmhtube:peers:waiting',
  ERROR:                'rmhtube:error',

  // Phase 1: Typing Indicators
  CHAT_TYPING_INDICATOR: 'rmhtube:chat:typing_indicator',

  // Phase 4: Invite Links
  ROOM_INVITE_CREATED:  'rmhtube:room:invite_created',
  ROOM_HISTORY_STATUS:  'rmhtube:room:history_status',
} as const;
