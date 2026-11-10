/** Client-to-Server events */
export const C2S = {
  // Room management
  LIST_ROOMS:    'rl:list_rooms',
  CREATE_ROOM:   'rl:create_room',
  JOIN_ROOM:     'rl:join_room',
  LEAVE_ROOM:    'rl:leave_room',
  UPDATE_ROOM:   'rl:update_room',

  // Gameplay
  PLACE_BET:     'rl:place_bet',
  CLEAR_BETS:    'rl:clear_bets',
} as const;

/** Server-to-Client events */
export const S2C = {
  // Room management
  ROOM_LIST:       'rl:room_list',
  ROOM_CREATED:    'rl:room_created',
  ROOM_JOINED:     'rl:room_joined',
  ROOM_LEFT:       'rl:room_left',
  ROOM_UPDATED:    'rl:room_updated',

  // Table state
  TABLE_STATE:     'rl:table_state',
  PLAYER_JOINED:   'rl:player_joined',
  PLAYER_LEFT:     'rl:player_left',
  BETTING_PHASE:   'rl:betting_phase',

  // Spin
  SPIN_RESULT:     'rl:spin_result',
  ROUND_RESULT:    'rl:round_result',
  BALANCE_UPDATE:  'rl:balance_update',
  ERROR:           'rl:error',
} as const;
