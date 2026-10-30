-- rmh_mp/hooks/pvp_blind.lua — the PvP blind slot and its round loop (FL-03, 05, 06, 07, 09, 10, 11).
--
-- The real Boss stays in G.GAME.round_resets (blind_choices.Boss, round_resets.blind), so every
-- vanilla `== G.P_BLINDS.bl_small` check, blind_states, tags and subhash keep working. Only the
-- Blind object is swapped: Blind:set_blind receives bl_mp_nemesis instead of the boss when this
-- round is a PvP round. A bye or normal_bosses plays the vanilla boss *flagged* as PvP.
--
--   MP.pvp.round_is_pvp()      the round being set/played is a PvP round
--   MP.pvp.on_pvp_blind()      the active G.GAME.blind is a PvP blind (nemesis or flagged)
--   MP.pvp.toggle_ready(e)     the PvP pillar's Select button (FL-06); WS11 relabels it
--   MP.pvp.start_blind(msg)    referee start_blind -> reset display, countdown, auto-select (FL-07)
--   MP.pvp.end_pvp(msg)        referee end_pvp -> leave the round at a safe point (FL-11)
--   MP.pvp.report_hand()       play_hand{score, hands_left, skips, lives} + nemesis display sync
-- Hooks (session group): Blind.set_blind / Blind.disable / Game.update_hand_played /
-- ease_hands_played / Game.update_draw_to_hand / G.FUNCS.select_blind (PvP part) / can_open.

local MP = require 'rmh_mp.state'
local att = require 'rmh_mp.rules.attrition'
local fmt = require 'rmh_mp.util.fmt'

local PV = {}
MP.pvp = PV

PV.INF = math.huge
PV.STUCK_GRACE = 0 -- reserved

function PV.round_is_pvp()
  if not att.pvp_enabled() then return false end
  return att.slot_is_pvp(att.current_slot(), G.GAME.round_resets.ante)
end

function PV.on_pvp_blind()
  local b = G.GAME and G.GAME.blind
  if not b then return false end
  if b.config and b.config.blind and b.config.blind.key == att.PVP_BLIND then return true end
  return b.mp_pvp == true
end

local function my_lives()
  local me = MP.state.session and MP.state.session.me
  return me and MP.state.lives[me] or nil
end

function PV.report_hand(hands_left)
  local cr = G.GAME.current_round
  hands_left = hands_left or (cr and cr.hands_left) or 0
  if hands_left < 0 then hands_left = 0 end
  local score = fmt.score(G.GAME.chips or 0)
  local ev = { t = 'play_hand', score = score, hands_left = math.min(1000, hands_left),
    skips = G.GAME.skips or 0 }
  local lives = my_lives()
  if lives then ev.lives = math.min(100, math.max(0, lives)) end
  MP.event(ev)
  if MP.is_match() and PV.on_pvp_blind() then
    MP.peer.send('nemesis_info', { score = score, hands_left = hands_left, skips = G.GAME.skips or 0,
      lives = math.max(0, lives or 0) })
    local n = tonumber(G.GAME.chips) or 0
    if n > (MP.state.highest_pvp_score or 0) then MP.state.highest_pvp_score = n end
  end
  if MP.timer and MP.timer.input then MP.timer.input('hand_played') end
end

-- ── Ready / start_blind / countdown ─────────────────────────────────────────

function PV.set_location(loc)
  if MP.state.location == loc then return end
  MP.state.location = loc
  if MP.is_match() then MP.peer.send('location', { loc = loc }) end
end

--- The PvP pillar's button. Returns true when it consumed the press.
function PV.toggle_ready(e)
  local pvp = MP.state.pvp
  if pvp.started then return false end
  if pvp.ready then
    pvp.ready = false
    PV.set_location('loc_selecting')
    MP.event({ t = 'unready_blind' })
  else
    if MP.state.pairing_pending then return true end -- D-01: wait for this ante's pairing
    pvp.ready = true
    pvp.pending_e = e
    pvp.starting_hands = G.GAME.round_resets.hands or 4
    PV.set_location('loc_ready')
    MP.event({ t = 'ready_blind', starting_hands = math.min(1000, pvp.starting_hands) })
    if MP.is_practice() and not MP.net.transport_is_live() then
      PV.start_blind({ first_player = MP.state.session.me or '', starting_hands = {} })
    end
  end
  return true
end

function PV.countdown(seconds, done)
  local pvp = MP.state.pvp
  seconds = math.max(0, math.floor(seconds or 3))
  if seconds == 0 or not (G.E_MANAGER and rawget(_G, 'Event')) then done(); return end
  pvp.countdown = true
  if G.CONTROLLER then G.CONTROLLER.locks = G.CONTROLLER.locks or {}; G.CONTROLLER.locks.mp_countdown = true end
  for i = seconds, 1, -1 do
    local n = i
    G.E_MANAGER:add_event(Event({ trigger = 'after', delay = 1, timer = 'REAL', blockable = false, blocking = false,
      func = function()
        if MP.ui and MP.ui.countdown_tick then pcall(MP.ui.countdown_tick, n) end
        return true
      end }), 'other')
  end
  G.E_MANAGER:add_event(Event({ trigger = 'after', delay = seconds, timer = 'REAL', blockable = false, blocking = false,
    func = function()
      pvp.countdown = false
      if G.CONTROLLER and G.CONTROLLER.locks then G.CONTROLLER.locks.mp_countdown = nil end
      done()
      return true
    end }))
end

local function select_pvp_blind()
  local pvp = MP.state.pvp
  local e = pvp.pending_e
  local boss = G.P_BLINDS[G.GAME.round_resets.blind_choices.Boss]
  if not (e and e.config and e.config.ref_table) then e = { config = { ref_table = boss } } end
  pvp.pending_e = nil
  PV.select_original(e)
end

function PV.start_blind(msg)
  local pvp = MP.state.pvp
  local me = MP.state.session and MP.state.session.me
  MP.reset_enemy()
  local target = MP.state.target
  MP.state.enemy.hands = (target and msg.starting_hands and msg.starting_hands[target]) or 4
  pvp.started = true
  pvp.ready = false
  pvp.reached = true
  pvp.reached_first = (msg.first_player ~= '' and msg.first_player == me)
  local secs = MP.option('pvpCountdownSeconds', 3)
  PV.countdown(secs, select_pvp_blind)
end

function PV.end_pvp(msg)
  local pvp = MP.state.pvp
  local me = MP.state.session and MP.state.session.me
  pvp.ended = true
  pvp.loser = msg.loser_id
  pvp.timer_lost = msg.pvp_timer_lost == true
  local hands = G.GAME.current_round and G.GAME.current_round.hands_left or 0
  if msg.loser_id == me and msg.pvp_timer_lost and hands > 0 then
    MP.ctx.calculate({ mp_pvp_loss = true, hands_left = hands })
  end
  pvp.waiting = false
  G.STATE = G.STATES.NEW_ROUND
  G.STATE_COMPLETE = false
end

--- end_pvp may only land while the PvP round is being played and nothing is animating (R-12).
function PV.end_pvp_ready()
  if G.CONTROLLER and G.CONTROLLER.locked then return false end
  if MP.net.blocking_pending() then return false end
  return MP.state_is('SELECTING_HAND', 'HAND_PLAYED')
end

-- ── Hooks ───────────────────────────────────────────────────────────────────

function PV.install()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'pvp.' .. id } end

  if rawget(_G, 'Blind') then
    wrap(Blind, 'set_blind', function(orig, self, blind, reset, silent, ...)
      if reset or not blind or self ~= G.GAME.blind or not PV.round_is_pvp() then
        if not reset then self.mp_pvp = nil end
        return orig(self, blind, reset, silent, ...)
      end
      local nemesis = att.uses_nemesis_blind() and G.P_BLINDS[att.PVP_BLIND]
      MP.state.pvp.nemesis_blind = nemesis and true or false
      local r = orig(self, nemesis or blind, reset, silent, ...)
      self.mp_pvp = true
      self.chips = PV.INF                 -- keep drawing past any requirement (FL-09)
      self.chip_text = '????'
      self.dollars = 5                    -- FL-16: the PvP blind always pays $5
      MP.state.pvp.active = true
      return r
    end, o('set_blind'))

    wrap(Blind, 'disable', function(orig, self, ...)
      if PV.on_pvp_blind() and self == G.GAME.blind then
        local key = self.config and self.config.blind and self.config.blind.key
        if key == att.PVP_BLIND or self.name ~= 'Verdant Leaf' then return end -- FL-05
      end
      return orig(self, ...)
    end, o('disable'))
  end

  if rawget(_G, 'Game') then
    wrap(Game, 'update_hand_played', function(orig, self, dt, ...)
      if not (PV.on_pvp_blind() and att.pvp_enabled()) then return orig(self, dt, ...) end
      if self.buttons then self.buttons:remove(); self.buttons = nil end
      if self.shop then self.shop:remove(); self.shop = nil end
      if G.STATE_COMPLETE then return end
      G.STATE_COMPLETE = true
      G.E_MANAGER:add_event(Event({ trigger = 'immediate', func = function()
        local pvp = MP.state.pvp
        PV.report_hand()
        local hands = G.GAME.current_round.hands_left
        if pvp.ended then
          G.STATE = G.STATES.NEW_ROUND
          G.STATE_COMPLETE = false
        elseif hands >= 1 then
          G.STATE = G.STATES.DRAW_TO_HAND
          G.STATE_COMPLETE = false
        elseif MP.is_practice() and not MP.net.transport_is_live() then
          G.STATE = G.STATES.NEW_ROUND     -- practice without a TS referee: the round just ends
          G.STATE_COMPLETE = false
        else
          pvp.waiting = true                -- "Waiting for enemy to finish..." (WS11)
        end
        return true
      end }))
    end, o('update_hand_played'))

    wrap(Game, 'update_draw_to_hand', function(orig, self, dt, ...)
      local pvp = MP.state.pvp
      if not G.STATE_COMPLETE and PV.on_pvp_blind() and not pvp.first_draw_done then
        pvp.first_draw_done = true
        -- FL-19: stored Asteroids launch and the end-of-PvP marker arms (content: WS7)
        MP.ctx.calculate({ mp_first_pvp_draw = true, asteroids = pvp.asteroids }, { silent = true })
        if MP.state.pincher_unlock == false then MP.state.pincher_unlock = true end
      end
      return orig(self, dt, ...)
    end, o('first_draw'))
  end

  wrap(_G, 'ease_hands_played', function(orig, mod, instant, ...)
    local r = orig(mod, instant, ...)
    if (mod or 0) > 0 and PV.on_pvp_blind() and MP.state.pvp.active then
      -- FL-10: hands gained mid-PvP are re-reported after the change lands (FIFO events).
      G.E_MANAGER:add_event(Event({ trigger = 'immediate', func = function()
        MP.state.pvp.waiting = false
        PV.report_hand()
        return true
      end }))
    end
    return r
  end, o('ease_hands'))

  if G and G.FUNCS and G.FUNCS.can_open then
    wrap(G.FUNCS, 'can_open', function(orig, e, ...)
      local r = orig(e, ...)
      if MP.state.pvp.ready and e and e.config then e.config.colour = G.C.UI and G.C.UI.BACKGROUND_INACTIVE or e.config.colour; e.config.button = nil end
      return r
    end, o('can_open'))
  end
end

return PV
