-- rmh_mp/hooks/report.lua — applying referee outcomes and peer messages (§3.c `outcome` / `peer`,
-- §3.f RefMsg, A1 §4, NET-07, HUD-13).
--
-- `outcome {o, hs}` is deduplicated by the host sequence `hs` (a re-sent `win`, a replay after a
-- reconnect). State updates apply at once; game-flow changes go through MP.net.defer so they
-- land only where vanilla accepts them (R-12):
--   start_blind -> while in BLIND_SELECT and nothing blocks ('flow' queue)
--   end_pvp     -> SELECTING_HAND / HAND_PLAYED, nothing blocking ('flow' queue)
--   timer_hand_lost (me) -> SELECTING_HAND / HAND_PLAYED
--   win / player_won / eliminated / death_pending -> MP.state.result, then MP.ui.show_result
--     (WS11) or the vanilla fallback (lose: GAME_OVER state; win: win_game)
--   reseed      -> the run restarts with the new seed
-- Observers: MP.report.on(t, fn(o)) runs after the core handling (UI streams use it; one net
-- handler per type is the rule, so they must not call MP.net.on('outcome')).
--
-- Peer kinds handled here: nemesis_info (enemy display, opponent skips), location, opp_ctx
-- (custom contexts for MP jokers), deck_req/stats_req (answered), player_result/deck_res/
-- stats_res (stored for the end screen). trap_* and sync belong to their content streams.

local MP = require 'rmh_mp.state'
local fmt = require 'rmh_mp.util.fmt'

local RP = MP.report or {}
MP.report = RP

RP.last_hs = RP.last_hs or -1
RP.observers = RP.observers or {}

function RP.on(t, fn)
  RP.observers[t] = RP.observers[t] or {}
  table.insert(RP.observers[t], fn)
end

local function notify(o)
  for _, fn in ipairs(RP.observers[o.t] or {}) do
    local ok, err = pcall(fn, o)
    if not ok then MP.log('error', 'report observer %s failed: %s', o.t, tostring(err)) end
  end
  for _, fn in ipairs(RP.observers['*'] or {}) do pcall(fn, o) end
end

local function me() return MP.state.session and MP.state.session.me end

local function blind_select_ready()
  if G.CONTROLLER and G.CONTROLLER.locked then return false end
  if MP.net.blocking_pending() then return false end
  return MP.state_is('BLIND_SELECT')
end

local function in_round_ready()
  if MP.net.blocking_pending() then return false end
  return MP.state_is('SELECTING_HAND', 'HAND_PLAYED')
end

local function set_target(id)
  if id == '' then id = nil end
  MP.state.target = id
  if id and MP.state.lives[id] then MP.state.enemy.lives = MP.state.lives[id] end
end

local function set_lives(id, lives, lost)
  local prev = MP.state.lives[id]
  MP.state.lives[id] = lives
  if id == me() and MP.economy then MP.economy.on_my_lives(prev, lives) end
  if id == MP.state.target then MP.state.enemy.lives = lives end
end

function RP.finish(kind, extra)
  if MP.state.result and MP.state.result.kind ~= 'pending' then return false end
  MP.state.result = { kind = kind }
  for k, v in pairs(extra or {}) do MP.state.result[k] = v end
  RP.send_player_result(false)
  if MP.ui and MP.ui.show_result then
    local ok, err = pcall(MP.ui.show_result, MP.state.result)
    if ok then return true end
    MP.log('error', 'show_result failed: %s', tostring(err))
  end
  -- Fallback without the WS11 end screen: vanilla screens (saves are guarded).
  MP.net.defer(function()
    if kind == 'win' and rawget(_G, 'win_game') then
      pcall(win_game)
    elseif kind ~= 'win' then
      G.STATE = G.STATES.GAME_OVER
      G.STATE_COMPLETE = false
    end
  end, function() return not MP.net.blocking_pending() end, 'result')
  return true
end

local HANDLERS = {}
RP.HANDLERS = HANDLERS

HANDLERS.player_lives = function(o)
  if o.player_id == '*all*' then
    for id in pairs(MP.state.lives) do set_lives(id, o.lives, o.lost) end
    if me() and MP.state.lives[me()] == nil then set_lives(me(), o.lives, o.lost) end
  else
    set_lives(o.player_id, o.lives, o.lost)
  end
end

HANDLERS.team_lives = function(o) MP.state.team_lives[o.team_id] = o.lives end

HANDLERS.team_roster = function(o)
  local sess = MP.state.session
  for id, team in pairs(o.roster) do
    if sess and sess.roster[id] then sess.roster[id].team = team end
  end
  if me() and o.roster[me()] then MP.state.my_team = o.roster[me()] end
end

HANDLERS.nemesis_pairing = function(o)
  local p = { ante = o.ante }
  for k, v in pairs(o.pairing) do p[k] = v end
  MP.state.pairing = p
  MP.state.pairing_pending = false
  local partner = me() and o.pairing[me()]
  MP.state.pvp.bye = (partner == '' or partner == nil)
  set_target(partner or '')
  MP.state.ante_nemesis = {}
  if partner and partner ~= '' then MP.state.ante_nemesis[1] = partner end
end

HANDLERS.team_card_target = function(o)
  local t = me() and o.pairing[me()]
  MP.state.card_target = (t ~= '' and t) or nil
  MP.state.ante_nemesis = MP.state.card_target and { MP.state.card_target } or {}
end

HANDLERS.royale_target = function(o)
  if me() and o.targets[me()] ~= nil then set_target(o.targets[me()]) end
end

HANDLERS.manhunt_target = function(o) set_target(o.target_id) end

HANDLERS.team_score_board = function(o)
  MP.state.team_scores = { A = fmt.parse(o.team_scores.A) or 0, B = fmt.parse(o.team_scores.B) or 0 }
end

HANDLERS.start_blind = function(o)
  if MP.state.result and MP.state.result.kind == 'eliminated' then return end
  MP.net.defer(function() MP.pvp.start_blind(o) end, blind_select_ready, 'flow')
end

HANDLERS.timer_hand_lost = function(o)
  if o.player_id ~= me() then return end
  MP.net.defer(function()
    local cr = G.GAME.current_round
    if cr.hands_left > 0 then cr.hands_left = cr.hands_left - 1 end
    MP.pvp.report_hand()
    if cr.hands_left <= 0 and MP.state_is('SELECTING_HAND') then
      MP.state.pvp.waiting = true
    end
  end, in_round_ready, 'flow')
end

HANDLERS.end_pvp = function(o)
  if MP.state.result and MP.state.result.kind == 'eliminated' then return end
  MP.net.defer(function() MP.pvp.end_pvp(o) end, MP.pvp.end_pvp_ready, 'flow')
end

HANDLERS.death_pending = function(o)
  if o.player_id == me() or (o.team_id and o.team_id == MP.state.my_team) then
    MP.state.result = { kind = 'pending', blind_key = o.blind_key }
    if MP.ui and MP.ui.show_result then pcall(MP.ui.show_result, MP.state.result) end
  else
    MP.state.opponent_pending = { player_id = o.player_id, team_id = o.team_id, blind_key = o.blind_key }
  end
end

HANDLERS.eliminated = function(o)
  if o.player_id == me() then RP.finish('eliminated') end
end

HANDLERS.win = function(o)
  local mine = me()
  if o.places then
    local place = mine and o.places[mine]
    local firsts = 0
    for _, p in pairs(o.places) do if p == 1 then firsts = firsts + 1 end end
    if place == 1 and firsts == 1 then RP.finish('win', { places = o.places })
    elseif place == 1 then RP.finish('draw', { places = o.places })
    else RP.finish('lose', { places = o.places }) end
  elseif o.draw then
    RP.finish('draw')
  elseif o.winner_team_id then
    RP.finish(o.winner_team_id == MP.state.my_team and 'win' or 'lose')
  elseif o.winner_id then
    RP.finish(o.winner_id == mine and 'win' or 'lose')
  end
end

HANDLERS.player_won = function(o)
  if o.player_id == me() then RP.finish('win', { forfeit = true }) end
end

HANDLERS.reseed = function(o)
  MP.net.defer(function() MP.session.launch(o.seed) end, function() return true end, 'flow')
end

HANDLERS.speedrun = function(o)
  if o.player_id == me() then MP.ctx.calculate({ mp_speedrun = true }) end
end

HANDLERS.vote_progress = function(o) MP.state.votes = { kind = o.kind, k = o.k, n = o.n } end

function RP.apply(o)
  local h = HANDLERS[o.t]
  if not h then
    MP.log('warn', 'report: unhandled outcome %s', tostring(o.t))
    return false
  end
  h(o)
  notify(o)
  return true
end

-- ── Peer messages ───────────────────────────────────────────────────────────

local function from_target(from)
  return from ~= nil and from == MP.state.target
end

function RP.on_nemesis_info(from, d)
  if not from_target(from) then return end
  local e = MP.state.enemy
  local score = fmt.parse(d.score) or 0
  if (d.skips or 0) > (e.skips or 0) then
    for _ = 1, d.skips - (e.skips or 0) do table.insert(e.spent_in_shop, 0) end -- a skip appends 0 (FL-18)
    if MP.timer then MP.timer.input('opp_skip') end
  end
  e.score, e.real_score, e.score_str = score, score, d.score
  e.hands, e.skips, e.lives = d.hands_left, d.skips, d.lives
  e.info_received = true
  if score > (e.highest_score or 0) then e.highest_score = score end
end

function RP.on_location(from, d)
  if from_target(from) then MP.state.enemy.location = d.loc end
  MP.state.locations = MP.state.locations or {}
  MP.state.locations[from] = d.loc
end

function RP.on_opp_ctx(from, d)
  local ctx = {}
  for k, v in pairs(d.ctx) do ctx[k] = v end
  if ctx.opponent_spent_in_shop and from_target(from) then
    table.insert(MP.state.enemy.spent_in_shop, ctx.opponent_spent_in_shop)
  end
  if ctx.opponent_selling_card and from_target(from) then
    local e = MP.state.enemy
    e.sells = (e.sells or 0) + 1
    local ante = G.GAME.round_resets.ante
    e.sells_per_ante[ante] = (e.sells_per_ante[ante] or 0) + 1
  end
  ctx.mp_from = from
  ctx.mp_from_target = from_target(from)
  MP.ctx.calculate(ctx, { silent = false })
end

function RP.player_result(interim)
  local jokers = {}
  for _, c in ipairs((G.jokers and G.jokers.cards) or {}) do
    local center = c.config and c.config.center or {}
    local ed = c.edition and (c.edition.type or (c.edition.foil and 'foil') or (c.edition.holo and 'holo')
      or (c.edition.polychrome and 'polychrome') or (c.edition.negative and 'negative')) or nil
    if #jokers < 64 then
      local j = { key = center.key or 'j_joker', eternal = (c.ability and c.ability.eternal) and true or false,
        perishable = (c.ability and c.ability.perishable) and true or false }
      if ed then j.edition = ed end
      jokers[#jokers + 1] = j
    end
  end
  local back = G.GAME and G.GAME.selected_back and G.GAME.selected_back.effect
    and G.GAME.selected_back.effect.center and G.GAME.selected_back.effect.center.key or 'b_red'
  return { jokers = MP.json_array(jokers), deck_back = back, highest_pvp_score = fmt.score(MP.state.highest_pvp_score or 0),
    interim = interim and true or false }
end

function RP.send_player_result(interim)
  if not MP.is_match() then return false end
  return MP.peer.send('player_result', RP.player_result(interim))
end

function RP.stats()
  local vouchers = {}
  for k in pairs((G.GAME and G.GAME.used_vouchers) or {}) do vouchers[#vouchers + 1] = k end
  table.sort(vouchers)
  while #vouchers > 64 do table.remove(vouchers) end
  local s = MP.state.stats
  return { reroll_count = s.reroll_count or 0, reroll_cost_total = s.reroll_cost_total or 0, vouchers = MP.json_array(vouchers) }
end

--- HUD-13: hand the page this player's own deck string and stats for the end screen.
function RP.send_local_end_data()
  MP.net.send('deck_res_local', { cards = MP.card.deck_string(G.playing_cards or {}) })
  MP.net.send('stats_local', RP.stats())
end

-- ── Tail (NET-07) ───────────────────────────────────────────────────────────

function RP.apply_tail(d)
  if d.id ~= MP.state.target then return end
  for _, r in ipairs(d.results) do
    RP.on_nemesis_info(d.id, { score = r.score, hands_left = r.hands_left, skips = r.skips, lives = r.lives or 0 })
  end
end

-- ── Install ─────────────────────────────────────────────────────────────────

function RP.install_net()
  MP.net.on('outcome', function(d)
    if d.hs <= RP.last_hs then return end
    RP.last_hs = d.hs
    if not MP.state.session then return end
    RP.apply(d.o)
  end)
  MP.net.on('tail', function(d)
    MP.net.defer(function() RP.apply_tail(d) end, function()
      return MP.state_is('BLIND_SELECT', 'ROUND_EVAL', 'SHOP') and not MP.net.blocking_pending()
    end, 'tail')
  end)
  MP.net.on('presence', function(d)
    MP.state.presence = MP.state.presence or {}
    MP.state.presence[d.id] = { status = d.status, graceMsLeft = d.graceMsLeft }
  end)
  MP.net.on('host_changed', function(d)
    if MP.state.session then MP.state.session.hostId = d.hostId end
  end)
  MP.net.on('end_data', function(d) MP.state.end_data = d end)
  MP.peer.on('nemesis_info', RP.on_nemesis_info)
  MP.peer.on('location', RP.on_location)
  MP.peer.on('opp_ctx', RP.on_opp_ctx)
  MP.peer.on('player_result', function(from, d)
    MP.state.player_results = MP.state.player_results or {}
    MP.state.player_results[from] = d
  end)
  MP.peer.on('deck_req', function()
    local cards = (G.playing_cards) or {}
    MP.peer.send('deck_res', { cards = MP.card.deck_string(cards) })
  end)
  MP.peer.on('deck_res', function(from, d)
    MP.state.nemesis_decks = MP.state.nemesis_decks or {}
    MP.state.nemesis_decks[from] = d.cards
  end)
  MP.peer.on('stats_req', function() MP.peer.send('stats_res', RP.stats()) end)
  MP.peer.on('stats_res', function(from, d)
    MP.state.nemesis_stats = MP.state.nemesis_stats or {}
    MP.state.nemesis_stats[from] = d
  end)
end

function RP.reset()
  RP.last_hs = -1
end

return RP
