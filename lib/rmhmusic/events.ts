export const C2S = {
  ROOM_CREATE:        'rmhmusic:room:create',
  ROOM_JOIN:          'rmhmusic:room:join',
  ROOM_LEAVE:         'rmhmusic:room:leave',
  ROOM_BROWSE:        'rmhmusic:room:browse',
  ROOM_CHAT:          'rmhmusic:room:chat',
  ROOM_TRANSFER_HOST: 'rmhmusic:room:transfer_host',

  MUSIC_PLAY:         'rmhmusic:music:play',
  MUSIC_PAUSE:        'rmhmusic:music:pause',
  MUSIC_SEEK:         'rmhmusic:music:seek',
  MUSIC_SKIP:         'rmhmusic:music:skip',

  QUEUE_ADD:          'rmhmusic:queue:add',
  QUEUE_REMOVE:       'rmhmusic:queue:remove',
  QUEUE_REORDER:      'rmhmusic:queue:reorder',
} as const;

export const S2C = {
  ROOM_CREATED:        'rmhmusic:room:created',
  ROOM_STATE_SNAPSHOT: 'rmhmusic:room:state_snapshot',
  ROOM_ACTION:         'rmhmusic:room:action',
  ROOM_BROWSE_RESULT:  'rmhmusic:room:browse_result',
  ROOM_DISBANDED:      'rmhmusic:room:disbanded',
  NOT_IN_ROOM:         'rmhmusic:room:not_in_room',

  MUSIC_PLAY:          'rmhmusic:music:play',
  MUSIC_PAUSE:         'rmhmusic:music:pause',
  MUSIC_SEEK:          'rmhmusic:music:seek',
  MUSIC_TRACK_CHANGED: 'rmhmusic:music:track_changed',
  SYNC_HEARTBEAT:      'rmhmusic:sync:heartbeat',

  QUEUE_UPDATED:       'rmhmusic:queue:updated',

  ERROR:               'rmhmusic:error',
} as const;
