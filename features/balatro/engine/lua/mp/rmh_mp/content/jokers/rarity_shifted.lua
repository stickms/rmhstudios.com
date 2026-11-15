-- rmh_mp/content/jokers/rarity_shifted.lua — the mod's rarity-shifted Mime and Baron (EX-15 lifted).
--
--   j_mp_mime    Mime as a Rare ($8): retrigger every held-in-hand card ability (vanilla Mime is an
--                Uncommon at $5). Same rule as vanilla: a held card retriggers only when it had an
--                effect (a Steel Card, a Gold Card at round end, a Blue Seal, Baron or Shoot the Moon)
--   j_mp_baron   Baron as an Uncommon ($5): each King held in hand gives X1.5 Mult (vanilla Baron is
--                a Rare at $8); a debuffed King shows "Debuffed" and gives nothing
--
-- The mod defines both in objects/jokers/experimental/{mime_rare,baron_uncommon}.lua, inside a
-- comment block, and no layer or ruleset lists them (its Experimental layer reworks only The Idol,
-- To Do List, Golden Ticket, Hanging Chad, Seltzer and Bloodstone). Their Balanced notes describe a
-- replacement of the vanilla card ("Now Rare instead of Uncommon"), which only a layer's silent ban
-- can give, and pooled by the isolation gate alone they would join every MP pool NEXT TO the vanilla
-- card. So, like the out-of-rotation sandbox jokers (D-28), they are registered (G.P_CENTERS while
-- a session is mounted: the SafeCard codec, saves, replays and Practice give-card know them) but
-- never pooled (`pool = false`), and kept out of the collection (`no_collection`, as in the mod).
-- Art: the vanilla Jokers sheet at the vanilla card's own cell, as the mod draws them.
--
-- The behaviour is written natively against the context shapes the base game's evaluate_play and
-- end-of-round passes build; spec/mp_content_rarity_shifted_spec.lua checks it against the real
-- Card:calculate_joker of data/balatro for the vanilla Mime and Baron, context by context.

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local C = require 'rmh_mp.content.jokers.core'

local RS = {}
MP.content.rarity_shifted = RS

RS.KEYS = { 'j_mp_mime', 'j_mp_baron' }
RS.KING = 13

--- True when a held card's own pass produced an effect (vanilla's Mime condition: the first effect
--- table is non-empty, or there is more than one).
function RS.held_card_had_effect(ctx)
  local effects = ctx.card_effects
  if type(effects) ~= 'table' then return false end
  local first = effects[1]
  return (type(first) == 'table' and next(first) ~= nil) or #effects > 1
end

R.define({
  key = 'j_mp_mime', kind = 'Joker', rarity = 3, cost = 8, pos = { x = 4, y = 1 },
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  no_collection = true, balanced = true, pool = false,
  config = { extra = 1 },
  loc = { name = 'Mime', text = { 'Retrigger all card', '{C:attention}held in hand{} abilities' } },
  calc = function(card, ctx)
    if ctx.repetition and ctx.cardarea == G.hand and RS.held_card_had_effect(ctx) then
      return { message = C.loc('k_again_ex', 'Again!'), repetitions = card.ability.extra, card = card }
    end
  end,
})

R.define({
  key = 'j_mp_baron', kind = 'Joker', rarity = 2, cost = 5, pos = { x = 6, y = 12 },
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  no_collection = true, balanced = true, pool = false,
  config = { extra = 1.5 },
  loc = { name = 'Baron', text = { 'Each {C:attention}King{} held in hand', 'gives {X:mult,C:white} X#1# {} Mult' } },
  loc_vars = function(card) return { card.ability.extra } end,
  calc = function(card, ctx)
    local other = ctx.other_card
    if ctx.individual and ctx.cardarea == G.hand and not ctx.end_of_round and other
      and other:get_id() == RS.KING then
      if other.debuff then
        return { message = C.loc('k_debuffed', 'Debuffed'), colour = G.C.RED, card = card }
      end
      return { x_mult = card.ability.extra, card = card }
    end
  end,
})

return RS
