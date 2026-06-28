// RMH Farming Simulator — socket event names shared by client modules.
// Must mirror server/socket-server/handlers/rmh-farming-sim.ts.

export const C2S = {
    HELLO: 'rfs:hello',
    MOVE: 'rfs:move',
    TILL: 'rfs:till',
    PLANT: 'rfs:plant',
    WATER: 'rfs:water',
    HARVEST: 'rfs:harvest',
    CLEAR: 'rfs:clear',
    BUY: 'rfs:buy',
    SELL: 'rfs:sell',
    UPGRADE_TOOL: 'rfs:upgrade_tool',
    SLEEP: 'rfs:sleep',
    CHAT: 'rfs:chat',
    JOIN_FARM: 'rfs:join_farm',
    APPROVE_JOIN: 'rfs:approve_join',
    DENY_JOIN: 'rfs:deny_join',
    KICK: 'rfs:kick',
    LEAVE_FARM: 'rfs:leave_farm',
    RENAME_FARM: 'rfs:rename_farm',
} as const;

export const S2C = {
    WELCOME: 'rfs:welcome',
    FARM_STATE: 'rfs:farm_state',
    TILES: 'rfs:tiles',
    STATS: 'rfs:stats',
    PRESENCE: 'rfs:presence',
    MEMBERS: 'rfs:members',
    JOIN_REQUESTED: 'rfs:join_requested',
    KICKED: 'rfs:kicked',
    CHAT: 'rfs:chat',
    TOAST: 'rfs:toast',
    ERROR: 'rfs:error',
} as const;
