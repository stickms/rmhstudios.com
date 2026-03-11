/** Client-to-Server events */
export const C2S = {
  JOIN_TABLE:   'bj:join_table',
  LEAVE_TABLE:  'bj:leave_table',
  PLACE_BET:    'bj:place_bet',
  HIT:          'bj:hit',
  STAND:        'bj:stand',
  DOUBLE_DOWN:  'bj:double_down',
} as const;

/** Server-to-Client events */
export const S2C = {
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
} as const;
