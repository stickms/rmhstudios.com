// =============================================================================
// ALTAIR MULTIPLAYER -- Event Constants
// =============================================================================
// All Socket.io event names, namespaced with `altair:`.
// C2S = Client-to-Server, S2C = Server-to-Client.
// =============================================================================

export const C2S = {
  // Lobby events
  LOBBY_CREATE:           'altair:lobby:create',
  LOBBY_JOIN:             'altair:lobby:join',
  LOBBY_LEAVE:            'altair:lobby:leave',
  LOBBY_BROWSE:           'altair:lobby:browse',
  LOBBY_UPDATE_SETTINGS:  'altair:lobby:update_settings',
  LOBBY_KICK:             'altair:lobby:kick',
  LOBBY_TRANSFER_HOST:    'altair:lobby:transfer_host',
  LOBBY_CHAT:             'altair:lobby:chat',

  // Class selection
  CLASS_SELECT:           'altair:class:select',
  CLASS_READY:            'altair:class:ready',

  // Game events
  GAME_START:             'altair:game:start',
  GAME_INPUT:             'altair:game:input',
  GAME_LEVEL_UP_CHOICE:   'altair:game:level_up_choice',
  GAME_STATE_SNAPSHOT:    'altair:game:state_snapshot',

  // Communication
  GAME_PING:              'altair:game:ping',
  GAME_QUICK_CHAT:        'altair:game:quick_chat',
} as const;

export const S2C = {
  // Lobby responses
  LOBBY_CREATED:          'altair:lobby:created',
  LOBBY_STATE_SNAPSHOT:   'altair:lobby:state_snapshot',
  LOBBY_BROWSE_RESULT:    'altair:lobby:browse_result',
  LOBBY_KICKED:           'altair:lobby:kicked',
  LOBBY_DISBANDED:        'altair:lobby:disbanded',

  // Class selection
  CLASS_SELECT_STATE:     'altair:class:select_state',

  // Game lifecycle
  GAME_COUNTDOWN:         'altair:game:countdown',
  GAME_STARTED:           'altair:game:started',
  GAME_STATE_SNAPSHOT:    'altair:game:state_snapshot',
  GAME_EVENT:             'altair:game:event',
  GAME_PLAYER_JOINED:     'altair:game:player_joined',
  GAME_PLAYER_LEFT:       'altair:game:player_left',
  GAME_RESULTS:           'altair:game:results',

  // Communication
  GAME_PING:              'altair:game:ping_broadcast',
  GAME_QUICK_CHAT:        'altair:game:quick_chat_broadcast',

  // Status
  ERROR:                  'altair:error',
} as const;
