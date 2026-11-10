-- rmh_mp/registry/reference.lua — the reference content for the M1 smoke and for the content
-- streams to copy the shape of (PLAN §4 WS6: "a reference joker (j_mp_pacifist)").
--
-- Loaded by init.lua AFTER the content modules; a key a content stream already defined is skipped,
-- so WS7's real definitions (content/jokers/core.lua, content/blinds.lua) take over silently.
--
--   j_mp_pacifist  "Pacifist" — Common, $4. X10 Mult when not in a PvP blind (A2 §2.1).
--   bl_mp_nemesis  "Your Nemesis" — the PvP blind: $5, mult 1, never in boss rolls; placed by the
--                  Attrition slot logic (hooks/pvp_blind.lua). Atlas mp_player_blind_chip.

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'

local REF = {}
R.reference = REF

REF.PACIFIST = {
  key = 'j_mp_pacifist', kind = 'Joker', rarity = 1, cost = 4, pos = { x = 0, y = 0 }, atlas = 'mp_j_pacifist',
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  config = { extra = { x_mult = 10 } },
  gate = { isolation = true },
  loc = { name = 'Pacifist', text = { '{X:mult,C:white} X#1# {} Mult while', '{C:attention}not{} in a {C:attention}PvP Blind' } },
  loc_vars = function(card)
    return { card.ability.extra.x_mult }
  end,
  calc = function(card, ctx)
    if ctx.joker_main and not (MP.pvp and MP.pvp.on_pvp_blind()) then
      local x = card.ability.extra.x_mult
      local msg = rawget(_G, 'localize') and localize({ type = 'variable', key = 'a_xmult', vars = { x } }) or ('X' .. x)
      return { message = msg, Xmult_mod = x }
    end
  end,
}

REF.NEMESIS = {
  key = 'bl_mp_nemesis', kind = 'Blind', pos = { x = 0, y = 0 }, atlas = 'mp_player_blind_chip',
  pool = false,
  blind = { dollars = 5, mult = 1, boss_colour = { 0.675, 0.196, 0.196, 1 }, vars = {}, debuff = {} },
  loc = { name = 'Your Nemesis', text = { 'Face another player,', 'most chips wins' } },
}

function REF.define_missing()
  local n = 0
  for _, def in ipairs({ REF.PACIFIST, REF.NEMESIS }) do
    if not R.get(def.key) then
      R.define(MP.copy(def, true))
      n = n + 1
    end
  end
  return n
end

return REF
