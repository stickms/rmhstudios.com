-- rmh_mp/content/alt_stakes.lua — what the alt stakes change on vanilla cards (EX-16 lifted).
--
-- The stakes themselves are lobby options (content/stakes.lua) applied at run start
-- (rules/stakes_apply.lua). Plastic Stake (and every alt stake after it) pays interest per $10
-- instead of per $5; the mod takes To the Moon over for it:
--   rw_mp_to_the_moon_plastic   j_to_the_moon: its extra interest per step is extra × step / 5
--                               ($2 per $10 for the vanilla $1 per $5) and its text names the step
--                               (j_to_the_moon_mp). Only in a session whose mpStake has a step.
-- Appended to the content order (init.lua), so every earlier key keeps its registry order.

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local S = require 'rmh_mp.rules.stakes_apply'

local A = {}
MP.content.alt_stakes = A

function A.has_interest_step(session)
  local d = S.def(session and session.mpStake)
  return d ~= nil and d.interest_rate ~= nil
end

R.define({
  key = 'rw_mp_to_the_moon_plastic', kind = 'Rework',
  gate = { include = A.has_interest_step },
  rework = { center = 'j_to_the_moon', props = {}, loc = { set = 'Joker', key = 'j_to_the_moon_mp' } },
  set_ability = function(card)
    if card.ability and type(card.ability.extra) == 'number' then
      card.ability.extra = card.ability.extra * S.interest_rate() / S.VANILLA_INTEREST_STEP
    end
  end,
  loc_vars = function(card) return { card.ability.extra, S.interest_rate() } end,
})

return A
