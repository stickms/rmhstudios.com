-- rmh_mp/ui/countdown.lua — the 3-2-1 before the PvP blind (FL-07) and the timer cue (TIM-02).
--
-- The core (hooks/pvp_blind.lua PV.countdown) owns the timing and the input lock
-- (G.CONTROLLER.locks.mp_countdown); it calls MP.ui.countdown_tick(n) once a second. This module
-- draws each number big over the play area on a red backdrop (scale 5, G.C.MULT, "tarot2"), and
-- plays the timpani for `timer_cue`.
--
--   CD.tick(n)   -> the attention_text args it showed (nil without a game), records CD.shown
--   CD.cue()     -> true when it played the timpani

local MP = require 'rmh_mp.state'

MP.ui = MP.ui or {}
local CD = MP.ui.countdown or {}
MP.ui.countdown = CD

CD.SCALE = 5
CD.shown = CD.shown or {}

local function g(name) return rawget(_G, name) end

function CD.tick(n)
  n = math.floor(tonumber(n) or 0)
  CD.shown[#CD.shown + 1] = n
  if #CD.shown > 16 then table.remove(CD.shown, 1) end
  local args = { text = tostring(n), scale = CD.SCALE, hold = 0.65, align = 'cm', major = G and G.play,
    backdrop_colour = G and G.C and (G.C.MULT or G.C.RED), colour = G and G.C and G.C.WHITE, silent = true }
  if g('attention_text') and G.play then
    pcall(attention_text, args)
  end
  if g('play_sound') then pcall(play_sound, 'tarot2', 1, 0.6) end
  return args
end

function CD.cue()
  if not g('play_sound') then return false end
  if MP.ui.setting and MP.ui.setting('timerSound') == 'off' then return false end
  pcall(play_sound, 'timpani', 1, 0.8)
  return true
end

MP.ui.countdown_tick = CD.tick
MP.ui.timer_cue = CD.cue

function CD.install()
  CD.shown = {}
  MP.ui.countdown_tick = CD.tick
  MP.ui.timer_cue = CD.cue
end

return CD
