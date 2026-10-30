-- rmh_mp/content/jokers/experimental.lua — the experimental-layer jokers (J-18, J-19, A2 §2.3).
--
--   j_mp_idol_rare   The Idol as a Rare ($8): each scored card matching current_round.idol_card
--                    (rank and suit) gives X2. The idol card itself is vanilla's per-round pick
--                    (OR-06 makes it deterministic under The Order).
--   j_mp_todo_list   To Do List paying $5 when the played hand matches; the target is drawn from
--                    ALL poker hands (not only visible ones), re-rolled at round end excluding the
--                    current target, and on creation. Hand arrays are sorted by WS6 (OR-03).

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local C = require 'rmh_mp.content.jokers.core'

local X = {}
MP.content.experimental = X

-- ── J-18 The Idol (Rare) ────────────────────────────────────────────────────

local function idol_card()
  local cr = G.GAME and G.GAME.current_round
  return (cr and cr.idol_card) or { rank = 'Ace', suit = 'Spades', id = 14 }
end

R.define({
  key = 'j_mp_idol_rare', kind = 'Joker', rarity = 3, cost = 8, pos = { x = 6, y = 7 },
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  no_collection = true, balanced = true, silent_replaces = 'j_idol',
  gate = { layers = { 'experimental' } },
  config = { extra = 2 },
  loc = { name = 'The Idol', text = { 'Each played #2# of #3# gives', 'X#1# Mult when scored' } },
  loc_vars = function(card)
    local ic = idol_card()
    return { card.ability.extra, C.loc_rank(ic.rank), C.loc_suit_plural(ic.suit),
      colours = { G.C.SUITS and G.C.SUITS[ic.suit] } }
  end,
  calc = function(card, ctx)
    if ctx.individual and ctx.cardarea == G.play and ctx.other_card then
      local ic = idol_card()
      if ctx.other_card:get_id() == ic.id and ctx.other_card:is_suit(ic.suit) then
        return { x_mult = card.ability.extra, colour = G.C.RED, card = card }
      end
    end
  end,
})

function C.loc_rank(rank)
  if rawget(_G, 'localize') then return localize(rank, 'ranks') end
  return rank
end

function C.loc_suit_plural(suit)
  if rawget(_G, 'localize') then return localize(suit, 'suits_plural') end
  return suit
end

-- ── J-19 To Do List ($5, all hands) ─────────────────────────────────────────

--- Every poker hand of the run (visible or not), except `exclude`. The game's hand names in a
--- fixed order (G.handlist when present, else sorted), so the draw is the same on every peer.
function X.all_hands(exclude)
  local out = {}
  local hands = G.GAME and G.GAME.hands
  if not hands then return out end
  if G.handlist then
    for _, name in ipairs(G.handlist) do
      if hands[name] and name ~= exclude then out[#out + 1] = name end
    end
  else
    for name in pairs(hands) do if name ~= exclude then out[#out + 1] = name end end
    table.sort(out)
  end
  return out
end

function X.reroll_todo(card, seed)
  local list = X.all_hands(card.ability.extra.poker_hand)
  if #list == 0 then return nil end
  card.ability.extra.poker_hand = pseudorandom_element(list, pseudoseed(seed or 'to_do'))
  return card.ability.extra.poker_hand
end

R.define({
  key = 'j_mp_todo_list', kind = 'Joker', rarity = 1, cost = 4, pos = { x = 4, y = 11 },
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  no_collection = true, balanced = true, silent_replaces = 'j_todo_list',
  gate = { layers = { 'experimental' } },
  config = { extra = { dollars = 5, poker_hand = 'High Card' } },
  loc = { name = 'To Do List', text = { 'Earn $#1# if poker hand played', 'is a #2#, changes at end of round' } },
  loc_vars = function(card)
    local ex = card.ability.extra
    local name = ex.poker_hand
    if rawget(_G, 'localize') then name = localize(name, 'poker_hands') end
    return { ex.dollars, name }
  end,
  set_ability = function(card)
    if not (G.GAME and G.GAME.hands) then return end
    local title = card.area and card.area.config and card.area.config.type == 'title'
    X.reroll_todo(card, title and 'false_to_do' or 'to_do')
  end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if C.main(ctx) and ctx.scoring_name == ex.poker_hand then
      C.pay(ex.dollars)
      return { message = (rawget(_G, 'localize') and localize('$') or '$') .. ex.dollars, colour = G.C.MONEY }
    end
    if C.round_end(ctx) and not ctx.blueprint then
      X.reroll_todo(card, 'to_do')
      return { message = C.loc('k_reset', 'Reset') }
    end
  end,
})

return X
