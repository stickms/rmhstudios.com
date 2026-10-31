-- rmh_mp/hooks/timer_hooks.lua — Lua side of the timers (TIM-08, TIM-09; PLAN §0.2: TS owns the
-- clock, Lua only reports flags/inputs and shows `timer_state`).
--
--   MP.timer.input(op)       'press' | 'skip' | 'hand_played' | 'opp_skip' -> timer_input
--   MP.timer.press()         the HUD timer button (WS11) — sends 'press' when pressable
--   MP.timer.flags()         the `flags` payload for the current frame
--   flags reporter           sent on change only (frame hook)
--   Game.update              game speed forced to >= 4 while the timer is ticking (restored after
--                            the call, so the settings UI and saves never see it)
--   net: timer_state -> MP.state.timer ; timer_cue -> MP.ui.timer_cue() (WS11)

local MP = require 'rmh_mp.state'

local T = {}
MP.timer = T

T.MIN_SPEED = 4

function T.input(op)
  if not MP.is_match() then return false end
  return MP.net.send('timer_input', { op = op })
end

function T.press()
  local ts = MP.state.timer
  if ts and ts.pressable then return T.input('press') end
  return false
end

local state_names
local function state_name()
  if not (G and G.STATES) then return 'NONE' end
  if not state_names then
    state_names = {}
    for k, v in pairs(G.STATES) do state_names[v] = k end
  end
  return state_names[G.STATE] or tostring(G.STATE)
end

function T.anim_busy()
  if G.CONTROLLER and G.CONTROLLER.locked then return true end
  return MP.net.blocking_pending() and MP.state_is('HAND_PLAYED', 'DRAW_TO_HAND', 'NEW_ROUND', 'SELECTING_HAND')
end

function T.flags()
  local pvp = MP.state.pvp
  local g = G.GAME or {}
  local b = g.blind
  local key = b and b.config and b.config.blind and b.config.blind.key or nil
  local f = {
    state = state_name():sub(1, 32),
    onPvp = (MP.pvp and MP.pvp.on_pvp_blind()) and true or false,
    ready = pvp.ready == true,
    countdown = pvp.countdown == true,
    animBusy = T.anim_busy() and true or false,
    paused = (G.SETTINGS and G.SETTINGS.paused) and true or false,
    inShop = MP.state_is('SHOP'),
    roundEval = MP.state_is('ROUND_EVAL'),
    handsLeft = math.max(0, (g.current_round and g.current_round.hands_left) or 0),
    ante = math.max(0, (g.round_resets and g.round_resets.ante) or 0),
  }
  if key then f.blindKey = key end
  return f
end

local function same(a, b)
  if not a or not b then return false end
  for k, v in pairs(a) do if b[k] ~= v then return false end end
  for k in pairs(b) do if a[k] == nil then return false end end
  return true
end

function T.report_flags()
  if not MP.is_match() then return false end
  local f = T.flags()
  if same(f, MP.state.flags_sent) then return false end
  MP.state.flags_sent = f
  MP.net.send('flags', f)
  return true
end

function T.install()
  if rawget(_G, 'Game') then
    MP.hooks.wrap(Game, 'update', function(orig, self, dt, ...)
      local ts = MP.state.timer
      local s = G.SETTINGS
      if ts and ts.ticking and s and (s.GAMESPEED or 1) < T.MIN_SPEED then
        local saved = s.GAMESPEED
        s.GAMESPEED = T.MIN_SPEED
        local ok, err = pcall(orig, self, dt, ...)
        s.GAMESPEED = saved
        if not ok then error(err, 0) end
        return
      end
      return orig(self, dt, ...)
    end, { group = 'session', optional = true, id = 'timer.gamespeed' })
  end
end

function T.install_net()
  MP.net.on('timer_state', function(d) MP.state.timer = d end)
  MP.net.on('timer_cue', function()
    if MP.ui and MP.ui.timer_cue then pcall(MP.ui.timer_cue) end
  end)
  MP.net.add_frame_hook(function()
    if MP.in_session() then T.report_flags() end
  end)
end

return T
