/**
 * Socket Server Configuration
 *
 * All tunable values for the unified WebSocket server.
 * Environment variables override defaults for production flexibility.
 */

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function envString(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  // ─── Network ───
  PORT: envInt('SOCKET_PORT', 7001),
  SOCKET_PATH: envString('SOCKET_PATH', '/socket/'),
  CORS_ORIGIN: envString('SOCKET_CORS_ORIGIN', ''),

  // ─── Socket.io Tuning ───
  MAX_HTTP_BUFFER_SIZE: envInt('SOCKET_MAX_BUFFER', 1_048_576),
  PING_INTERVAL_MS: envInt('SOCKET_PING_INTERVAL', 25_000),
  PING_TIMEOUT_MS: envInt('SOCKET_PING_TIMEOUT', 20_000),

  // ─── Shared Room Constants ───
  ROOM_CODE_LENGTH: 6,
  ROOM_CODE_ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  MAX_LOBBY_ID_LENGTH: 64,
  MAX_USER_NAME_LENGTH: 32,
  CHAT_MAX_LENGTH: 300,
  CHAT_HISTORY_LENGTH: 200,

  // ─── Rate Limits ───
  SOCKET_RATE_LIMITS: {
    // Live Spaces (§4) + Party (§5)
    'space:join': { max: 20, windowMs: 60_000 },
    'space:chat': { max: 30, windowMs: 60_000 },
    'space:react': { max: 60, windowMs: 60_000 },
    'space:pin': { max: 20, windowMs: 60_000 },
    'space:end': { max: 10, windowMs: 60_000 },
    'party:create': { max: 10, windowMs: 60_000 },
    'party:invite': { max: 20, windowMs: 60_000 },
    'party:accept': { max: 20, windowMs: 60_000 },
    'party:leave': { max: 30, windowMs: 60_000 },
    'party:kick': { max: 20, windowMs: 60_000 },
    'party:transfer': { max: 20, windowMs: 60_000 },
    'party:queue': { max: 20, windowMs: 60_000 },
    // Voice calls. ICE is chatty by nature — a single negotiation emits dozens
    // of candidates — so it gets a much higher ceiling than the lifecycle
    // events, which a human presses at most a few times a minute.
    'call:invite': { max: 20, windowMs: 60_000 },
    'call:accept': { max: 30, windowMs: 60_000 },
    'call:decline': { max: 30, windowMs: 60_000 },
    'call:cancel': { max: 30, windowMs: 60_000 },
    'call:hangup': { max: 30, windowMs: 60_000 },
    'call:signal': { max: 60, windowMs: 60_000 },
    'call:ice': { max: 600, windowMs: 60_000 },
    'call:mute': { max: 60, windowMs: 60_000 },
    'rmhtype:room:create': { max: 3, windowMs: 60_000 },
    'rmhtype:room:join': { max: 10, windowMs: 60_000 },
    'rmhtype:room:chat': { max: 30, windowMs: 60_000 },
    'rmhtype:game:progress': { max: 600, windowMs: 60_000 },
    'rmhtype:game:start': { max: 10, windowMs: 60_000 },
    'rmhtype:solo:start': { max: 10, windowMs: 60_000 },
    // Not a wire event: a second bucket the solo:start handler charges only when
    // the request carries a topic, because that path costs a DeepSeek call while
    // a plain solo start costs an array lookup.
    'rmhtype:solo:ai': { max: 4, windowMs: 60_000 },
    'rmhstudy:room:create': { max: 3, windowMs: 60_000 },
    'rmhstudy:room:join': { max: 10, windowMs: 60_000 },
    'rmhstudy:room:chat': { max: 30, windowMs: 60_000 },
    'rmhstudy:timer:start': { max: 10, windowMs: 60_000 },
    'rmhstudy:task:add': { max: 30, windowMs: 60_000 },
    'rmhstudy:chat:react': { max: 30, windowMs: 60_000 },
    'altair:lobby:create': { max: 3, windowMs: 60_000 },
    'altair:lobby:join': { max: 10, windowMs: 60_000 },
    'altair:lobby:browse': { max: 20, windowMs: 60_000 },
    'altair:lobby:chat': { max: 30, windowMs: 60_000 },
    'altair:game:input': { max: 1200, windowMs: 60_000 },
    'altair:game:state_snapshot': { max: 1200, windowMs: 60_000 },
    'altair:game:ping': { max: 30, windowMs: 60_000 },
    'altair:game:quick_chat': { max: 20, windowMs: 60_000 },
    'bj:join_table': { max: 30, windowMs: 60_000 },
    'bj:leave_table': { max: 30, windowMs: 60_000 },
    'bj:place_bet': { max: 200, windowMs: 60_000 },
    'bj:hit': { max: 300, windowMs: 60_000 },
    'bj:stand': { max: 300, windowMs: 60_000 },
    'bj:double_down': { max: 200, windowMs: 60_000 },
    'bacc:create_room': { max: 15, windowMs: 60_000 },
    'bacc:join_room': { max: 30, windowMs: 60_000 },
    'bacc:place_bet': { max: 300, windowMs: 60_000 },
    'rl:create_room': { max: 15, windowMs: 60_000 },
    'rl:join_room': { max: 30, windowMs: 60_000 },
    'rl:place_bet': { max: 300, windowMs: 60_000 },
    'rl:clear_bets': { max: 200, windowMs: 60_000 },
    'lights-out:join': { max: 5, windowMs: 60_000 },
    'lights-out:ready': { max: 30, windowMs: 60_000 },
    'lights-out:start': { max: 10, windowMs: 60_000 },
    'lights-out:update': { max: 120, windowMs: 60_000 },
    'lights-out:leave': { max: 10, windowMs: 60_000 },
    'lights-out:return': { max: 10, windowMs: 60_000 },
    'holdem:list_rooms': { max: 60, windowMs: 60_000 },
    'holdem:create_room': { max: 15, windowMs: 60_000 },
    'holdem:join_room': { max: 30, windowMs: 60_000 },
    'holdem:leave_room': { max: 30, windowMs: 60_000 },
    'holdem:update_room': { max: 60, windowMs: 60_000 },
    'holdem:fold': { max: 300, windowMs: 60_000 },
    'holdem:check': { max: 300, windowMs: 60_000 },
    'holdem:call': { max: 300, windowMs: 60_000 },
    'holdem:raise': { max: 300, windowMs: 60_000 },
    'holdem:all_in': { max: 200, windowMs: 60_000 },
    'holdem:sit_in': { max: 60, windowMs: 60_000 },
    'holdem:sit_out': { max: 60, windowMs: 60_000 },
    'holdem:rebuy': { max: 60, windowMs: 60_000 },
    'holdem:show_cards': { max: 100, windowMs: 60_000 },
    // Slice It.
    //
    // These were originally sized against how often a *person* would press each
    // control, which is the wrong unit for a lobby: the settings panel is a
    // cluster of toggles, four difficulty buttons and a speed slider, and a
    // player configuring a match works through all of them in one sitting. A
    // single drag of the speed slider is ten `slice:mods` on its own. At the old
    // caps a host who opened the panel and actually used it ran out of budget
    // partway through and got "Slow down a moment" on every remaining press —
    // and because a rate-limited event answers with `S2C.ERROR`, that reads to
    // the player as the whole lobby being broken rather than one control.
    //
    // So the lobby-control events are now sized against a *burst* — the way the
    // panel is really used — not an average. They are all cheap in-memory
    // mutations followed by one room broadcast; the ones that read a song row
    // from the database (`song`, `nominate`, `queue`) stay lower than their
    // neighbours for that reason, but still well above a human working quickly.
    // `slice:score` remains the only genuinely high-frequency one — clients
    // publish on a ~500ms timer, so 480/min leaves headroom for a reconnect
    // burst without letting a socket flood the room.
    'slice:create': { max: 30, windowMs: 60_000 },
    'slice:join': { max: 60, windowMs: 60_000 },
    'slice:quickplay': { max: 40, windowMs: 60_000 },
    'slice:browse': { max: 120, windowMs: 60_000 },
    // Spectating is a join that takes no seat, so it gets a join's budget.
    'slice:spectate': { max: 60, windowMs: 60_000 },
    'slice:leave': { max: 60, windowMs: 60_000 },
    'slice:ready': { max: 240, windowMs: 60_000 },
    'slice:song': { max: 120, windowMs: 60_000 },
    // Teams (N2): picking a side is a toggle a player flips while making up
    // their mind, so it gets a modifier-sized budget; balancing is a host
    // control and a rarer one.
    'slice:team': { max: 240, windowMs: 60_000 },
    'slice:balance': { max: 120, windowMs: 60_000 },
    // Song voting (N7). One nomination per seat per ballot and one (changeable)
    // vote — but changing your mind is the point of a ballot, so the ceiling is
    // a flood guard, not a budget. `slice:nominate` reads a song row, which is
    // why it is the tighter of the two.
    'slice:nominate': { max: 120, windowMs: 60_000 },
    'slice:vote': { max: 240, windowMs: 60_000 },
    // The two the settings panel drives. `slice:mods` is the highest of the
    // lobby events because the speed slider emits one per step of a drag.
    'slice:settings': { max: 600, windowMs: 60_000 },
    'slice:mods': { max: 900, windowMs: 60_000 },
    'slice:start': { max: 60, windowMs: 60_000 },
    'slice:loaded': { max: 60, windowMs: 60_000 },
    'slice:score': { max: 480, windowMs: 60_000 },
    'slice:finish': { max: 60, windowMs: 60_000 },
    'slice:rematch': { max: 120, windowMs: 60_000 },
    'slice:chat': { max: 60, windowMs: 60_000 },
    'slice:kick': { max: 60, windowMs: 60_000 },
    // Attack mode (N4). Charges cap at 3 and are earned at combo milestones, so
    // the server's own tally is the real limit — this is the flood guard for a
    // client that spams the event without any, which costs a lookup per call.
    'slice:attack': { max: 240, windowMs: 60_000 },
    // The session queue (N8). `slice:queue` reads a song row, so it is the
    // tighter of the pair, exactly as `slice:nominate` is.
    'slice:queue': { max: 120, windowMs: 60_000 },
    'slice:unqueue': { max: 240, windowMs: 60_000 },
    // Rejoin (N12) is a join, and a client in a reconnect loop is the failure
    // mode this bounds.
    'slice:rejoin': { max: 60, windowMs: 60_000 },
    'dr:create': { max: 10, windowMs: 60_000 },
    'dr:join': { max: 30, windowMs: 60_000 },
    'dr:quickplay': { max: 20, windowMs: 60_000 },
    'dr:browse': { max: 30, windowMs: 60_000 },
    // Laundry Sort versus. `ls:score` is the only high-frequency one — clients
    // publish on a 400ms timer, so 200/min leaves headroom for a reconnect
    // burst without letting a socket flood the room.
    'ls:create': { max: 10, windowMs: 60_000 },
    'ls:join': { max: 30, windowMs: 60_000 },
    'ls:quickplay': { max: 20, windowMs: 60_000 },
    'ls:browse': { max: 30, windowMs: 60_000 },
    'ls:leave': { max: 30, windowMs: 60_000 },
    'ls:ready': { max: 60, windowMs: 60_000 },
    'ls:settings': { max: 60, windowMs: 60_000 },
    'ls:start': { max: 20, windowMs: 60_000 },
    'ls:kick': { max: 20, windowMs: 60_000 },
    'ls:score': { max: 240, windowMs: 60_000 },
    'ls:finish': { max: 20, windowMs: 60_000 },
    'ls:rematch': { max: 30, windowMs: 60_000 },
    'ls:ticket': { max: 20, windowMs: 60_000 },
    // Gabriel's Horn. Turn-based, so every one of these is a deliberate human
    // action a second or more apart — the caps are set well above a fast player
    // spamming a button through a laggy round, and nowhere near a flood.
    'gh:create': { max: 10, windowMs: 60_000 },
    'gh:join': { max: 30, windowMs: 60_000 },
    'gh:quickplay': { max: 20, windowMs: 60_000 },
    'gh:browse': { max: 30, windowMs: 60_000 },
    'gh:leave': { max: 30, windowMs: 60_000 },
    'gh:ready': { max: 60, windowMs: 60_000 },
    'gh:settings': { max: 60, windowMs: 60_000 },
    'gh:start': { max: 20, windowMs: 60_000 },
    'gh:kick': { max: 20, windowMs: 60_000 },
    'gh:play': { max: 120, windowMs: 60_000 },
    'gh:roll': { max: 120, windowMs: 60_000 },
    'gh:claim': { max: 120, windowMs: 60_000 },
    'gh:call': { max: 120, windowMs: 60_000 },
    'gh:end': { max: 30, windowMs: 60_000 },
    'gh:pass': { max: 60, windowMs: 60_000 },
    'gh:chat': { max: 30, windowMs: 60_000 },
    'gh:rematch': { max: 30, windowMs: 60_000 },
    // House-rule amendments. Low, because each one is preceded by an AI call on
    // the web tier (which has its own `ai` limit) and because a table whose
    // rules change twenty times a minute is not a table.
    'gh:houseRules': { max: 20, windowMs: 60_000 },
    'gh:ticket': { max: 20, windowMs: 60_000 },
    // Massive March. Session control is rare and deliberate; the puzzle verbs
    // are button presses a human makes a second or two apart. `mm:move` is the
    // outlier at 15/s by design — it is the position report, and a client that
    // stops sending it is a player who has stopped existing to everybody else.
    // `mm:voice:signal` is sized for WebRTC's ICE trickle across a full mesh:
    // eleven peers, each producing a burst of candidates on connect and again
    // on every network change.
    'mm:create': { max: 6, windowMs: 60_000 },
    'mm:join': { max: 20, windowMs: 60_000 },
    'mm:resume': { max: 10, windowMs: 60_000 },
    'mm:list': { max: 30, windowMs: 60_000 },
    'mm:leave': { max: 20, windowMs: 60_000 },
    'mm:settings': { max: 30, windowMs: 60_000 },
    'mm:move': { max: 1200, windowMs: 60_000 },
    'mm:gesture': { max: 120, windowMs: 60_000 },
    'mm:chat': { max: 40, windowMs: 60_000 },
    'mm:board': { max: 30, windowMs: 60_000 },
    'mm:take': { max: 180, windowMs: 60_000 },
    'mm:stow': { max: 180, windowMs: 60_000 },
    'mm:equip': { max: 240, windowMs: 60_000 },
    'mm:drop': { max: 180, windowMs: 60_000 },
    'mm:throw': { max: 180, windowMs: 60_000 },
    'mm:kick': { max: 240, windowMs: 60_000 },
    'mm:use': { max: 240, windowMs: 60_000 },
    'mm:pack': { max: 120, windowMs: 60_000 },
    'mm:act': { max: 240, windowMs: 60_000 },
    'mm:skip': { max: 20, windowMs: 60_000 },
    'mm:deposit': { max: 60, windowMs: 60_000 },
    'mm:cart': { max: 30, windowMs: 60_000 },
    'mm:voice:signal': { max: 900, windowMs: 60_000 },
    'mm:voice:state': { max: 600, windowMs: 60_000 },
    // Bum's Rush (design doc §9.3). The two hot-path events are the reason
    // this block looks different from every other game's: the host ships
    // snapshots at 20/s and guests ship input at 30/s, so those caps are sized
    // at ~1.5× the honest rate to survive a burst after a reconnect without
    // letting one socket flood a room. Everything else is a human pressing a
    // button. `br:event` is deliberately the tight one — it is for DISCRETE
    // events (death, checkpoint, objective, item), and a client that needs
    // more than five a second is relaying per-frame state that belongs in the
    // snapshot instead.
    'br:createRoom': { max: 10, windowMs: 60_000 },
    'br:joinRoom': { max: 20, windowMs: 60_000 },
    'br:quickPlay': { max: 20, windowMs: 60_000 },
    'br:listRooms': { max: 30, windowMs: 60_000 },
    'br:claimSeat': { max: 20, windowMs: 60_000 },
    'br:releaseSeat': { max: 20, windowMs: 60_000 },
    'br:setCosmetics': { max: 20, windowMs: 60_000 },
    'br:setAssists': { max: 20, windowMs: 60_000 },
    'br:ready': { max: 60, windowMs: 60_000 },
    'br:selectLevel': { max: 40, windowMs: 60_000 },
    'br:start': { max: 30, windowMs: 60_000 },
    'br:input': { max: 2400, windowMs: 60_000 },
    'br:snapshot': { max: 1800, windowMs: 60_000 },
    'br:event': { max: 300, windowMs: 60_000 },
    'br:emote': { max: 30, windowMs: 60_000 },
    'br:result': { max: 60, windowMs: 60_000 },
    'br:hostHandoff': { max: 10, windowMs: 60_000 },
    'br:ping': { max: 120, windowMs: 60_000 },
    'br:leave': { max: 20, windowMs: 60_000 },
    // ─── High-frequency relay / movement events ───
    // Movement + per-frame update events were previously unmetered (the rate
    // limiter returns true for events with no rule), so a single socket could
    // flood the relay path unbounded. Caps are deliberately generous — well
    // above any plausible legitimate client send rate — so they bound abuse
    // without dropping real gameplay traffic. Only wired where the handler
    // actually calls checkRateLimit (rfs:move, ndw:playerUpdate).
    'rfs:move': { max: 2400, windowMs: 60_000 },
    'ndw:playerUpdate': { max: 3600, windowMs: 60_000 },
    'ndw:scoreUpdate': { max: 1200, windowMs: 60_000 },
  } as Record<string, { max: number; windowMs: number }>,

  // ─── Shutdown ───
  SHUTDOWN_TIMEOUT_MS: envInt('SOCKET_SHUTDOWN_TIMEOUT', 10_000),

  // ─── Database ───
  DATABASE_URL: envString('DATABASE_URL', ''),

  // ─── Discord Activity auth ───
  //
  // The *same* application id `app/routes/api/discord/token.ts` exchanges codes
  // for. The hub needs only the id, never the secret: the code→token exchange
  // (the one operation that requires the secret) happens on the web tier, and
  // the hub only ever *verifies* an already-issued token. Leaving this unset
  // disables the Discord auth path entirely rather than accepting tokens the
  // hub cannot check the audience of — see `softAuthMiddleware`.
  DISCORD_ACTIVITY_CLIENT_ID: envString('DISCORD_ACTIVITY_CLIENT_ID', ''),

  // ─── Disconnect Grace Period ───
  DISCONNECT_GRACE_PERIOD_MS: envInt('SOCKET_GRACE_MS', 120_000),
} as const;
