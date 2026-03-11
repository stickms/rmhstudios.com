/** Client-to-Server events */
export const C2S = {
  // Room management
  LIST_ROOMS:    'holdem:list_rooms',
  CREATE_ROOM:   'holdem:create_room',
  JOIN_ROOM:     'holdem:join_room',
  LEAVE_ROOM:    'holdem:leave_room',
  UPDATE_ROOM:   'holdem:update_room',

  // Gameplay
  FOLD:          'holdem:fold',
  CHECK:         'holdem:check',
  CALL:          'holdem:call',
  RAISE:         'holdem:raise',
  ALL_IN:        'holdem:all_in',
  SIT_IN:        'holdem:sit_in',
  SIT_OUT:       'holdem:sit_out',
} as const;

/** Server-to-Client events */
export const S2C = {
  // Room management
  ROOM_LIST:       'holdem:room_list',
  ROOM_CREATED:    'holdem:room_created',
  ROOM_JOINED:     'holdem:room_joined',
  ROOM_LEFT:       'holdem:room_left',
  ROOM_UPDATED:    'holdem:room_updated',

  // Game state
  TABLE_STATE:     'holdem:table_state',
  PLAYER_JOINED:   'holdem:player_joined',
  PLAYER_LEFT:     'holdem:player_left',
  NEW_HAND:        'holdem:new_hand',
  TURN:            'holdem:turn',
  COMMUNITY_CARDS: 'holdem:community_cards',
  SHOWDOWN:        'holdem:showdown',
  HAND_RESULT:     'holdem:hand_result',
  BALANCE_UPDATE:  'holdem:balance_update',
  ERROR:           'holdem:error',
} as const;
