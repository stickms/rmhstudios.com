/** Client-to-Server events */
export const C2S = {
  // Room management
  LIST_ROOMS:    'bacc:list_rooms',
  CREATE_ROOM:   'bacc:create_room',
  JOIN_ROOM:     'bacc:join_room',
  LEAVE_ROOM:    'bacc:leave_room',
  UPDATE_ROOM:   'bacc:update_room',

  // Gameplay
  PLACE_BET:     'bacc:place_bet',
  CLEAR_BETS:    'bacc:clear_bets',
} as const;

/** Server-to-Client events */
export const S2C = {
  // Room management
  ROOM_LIST:       'bacc:room_list',
  ROOM_CREATED:    'bacc:room_created',
  ROOM_JOINED:     'bacc:room_joined',
  ROOM_LEFT:       'bacc:room_left',
  ROOM_UPDATED:    'bacc:room_updated',

  // Table state
  TABLE_STATE:     'bacc:table_state',
  PLAYER_JOINED:   'bacc:player_joined',
  PLAYER_LEFT:     'bacc:player_left',
  BETTING_PHASE:   'bacc:betting_phase',

  // Card reveals (sent one-by-one for suspense animations)
  CARD_REVEAL:     'bacc:card_reveal',
  ROUND_RESULT:    'bacc:round_result',
  BALANCE_UPDATE:  'bacc:balance_update',
  ERROR:           'bacc:error',
} as const;
