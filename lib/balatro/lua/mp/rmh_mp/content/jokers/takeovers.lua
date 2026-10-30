-- rmh_mp/content/jokers/takeovers.lua — vanilla takeovers on a timer loss (J-16, J-17, A2 §2.2).
--
-- `mp_pvp_loss` (fired by WS6 when end_pvp says I lost the PvP blind on the timer with
-- `hands_left` > 0) costs the vanilla food jokers what the unused hands would have:
--   j_ice_cream  loses chip_mod x N chips, melts at <= 0
--   j_selzer     loses N uses, drunk at <= 0
-- Only while the pvp_timer layer is active (Balanced, Experimental). These are Rework defs on the
-- vanilla centers with no property change: the calc runs first and wins only for that context,
-- every other context falls through to vanilla. Registered for every session.

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local C = require 'rmh_mp.content.jokers.core'

local T = {}
MP.content.takeovers = T

local always = { include = function() return true end }

local function loss_hands(ctx)
  if not (ctx.mp_pvp_loss and not ctx.blueprint and MP.layer_active('pvp_timer')) then return 0 end
  return math.max(0, math.floor(tonumber(ctx.hands_left) or 0))
end
T.loss_hands = loss_hands

R.define({
  key = 'rw_mp_ice_cream_takeover', kind = 'Rework', gate = always,
  rework = { center = 'j_ice_cream', props = {} },
  calc = function(card, ctx)
    local n = loss_hands(ctx)
    if n == 0 or card.ability.mp_consumed then return nil end
    local ex = card.ability.extra
    local loss = (ex.chip_mod or 5) * n
    if ex.chips - loss <= 0 then
      ex.chips = 0
      return C.consume(card, 'k_melted_ex', G.C.CHIPS, 'Melted!')
    end
    ex.chips = ex.chips - loss
    return { message = C.loc_var('a_chips_minus', { loss }, '-' .. loss), colour = G.C.CHIPS }
  end,
})

R.define({
  key = 'rw_mp_selzer_takeover', kind = 'Rework', gate = always,
  rework = { center = 'j_selzer', props = {} },
  calc = function(card, ctx)
    local n = loss_hands(ctx)
    if n == 0 or card.ability.mp_consumed then return nil end
    local left = (card.ability.extra or 0) - n
    if left <= 0 then
      card.ability.extra = 0
      return C.consume(card, 'k_drank_ex', G.C.CHIPS, 'Drank!')
    end
    card.ability.extra = left
    return { message = '-' .. n, colour = G.C.CHIPS }
  end,
})

return T
