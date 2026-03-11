/** Client-to-Server events */
export const C2S = {
  // Room management
  LIST_ROOMS:    'bj:list_rooms',
  CREATE_ROOM:   'bj:create_room',
  JOIN_ROOM:     'bj:join_room',
  LEAVE_ROOM:    'bj:leave_room',
  UPDATE_ROOM:   'bj:update_room',

  // Gameplay
  PLACE_BET:    'bj:place_bet',
  HIT:          'bj:hit',
  STAND:        'bj:stand',
  DOUBLE_DOWN:  'bj:double_down',
  TAKE_INSURANCE: 'bj:take_insurance',
  DECLINE_INSURANCE: 'bj:decline_insurance',
  SPLIT:          'bj:split',
} as const;

/** Server-to-Client events */
export const S2C = {
  // Room management
  ROOM_LIST:       'bj:room_list',
  ROOM_CREATED:    'bj:room_created',
  ROOM_JOINED:     'bj:room_joined',
  ROOM_LEFT:       'bj:room_left',
  ROOM_UPDATED:    'bj:room_updated',

  // Table state
  TABLE_STATE:     'bj:table_state',
  PLAYER_JOINED:   'bj:player_joined',
  PLAYER_LEFT:     'bj:player_left',
  BETTING_PHASE:   'bj:betting_phase',
  DEAL:            'bj:deal',
  TURN:            'bj:turn',
  CARD_DEALT:      'bj:card_dealt',
  DEALER_REVEAL:   'bj:dealer_reveal',
  ROUND_RESULTS:   'bj:round_results',
  BALANCE_UPDATE:  'bj:balance_update',
  ERROR:           'bj:error',

  // Insurance
  INSURANCE_OFFER: 'bj:insurance_offer',
  INSURANCE_RESOLVED: 'bj:insurance_resolved',
} as const;
