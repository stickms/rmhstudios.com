-- rmh_mp/content/jokers/standard.lua — the "standard" reworks of vanilla jokers (J-10…J-15, A2 §2.2).
--
-- Each replaces a vanilla joker the TS bundle silently bans (silent_replaces) and is pooled only
-- through its layers (resolved.reworked carries the key; the layer list is the same data).
-- They draw from the vanilla Jokers sheet at the vanilla position, are hidden from the
-- collection, and carry the Balanced sticker (config.mp_balanced).
--
--   j_mp_hanging_chad         1st and 2nd scoring cards retrigger +1 each
--   j_mp_bloodstone           1 in 2 for X1.5 per scored Heart; in a PvP blind the rolls come from
--                             a per-round queue shared by both players and reused every hand
--   j_mp_seltzer              retrigger every played card for the next 8 hands
--   j_mp_turtle_bean          +4 hand size, -1 per round, eaten at 0
--   j_mp_ticket               Uncommon $6: scored Gold cards earn $4 (D-20: Gold still required)
--   j_mp_ticket_experimental  the same, for the experimental layer

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local C = require 'rmh_mp.content.jokers.core'

local S = {}
MP.content.standard = S

local function scoring_play(ctx) return ctx.cardarea == G.play end

-- ── J-10 Hanging Chad ───────────────────────────────────────────────────────

R.define({
  key = 'j_mp_hanging_chad', kind = 'Joker', rarity = 1, cost = 4, pos = { x = 9, y = 6 },
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  no_collection = true, balanced = true, silent_replaces = 'j_hanging_chad',
  gate = { layers = { 'standard', 'experimental', 'wsob', 'sandbox' } },
  config = { extra = 1 },
  loc = { name = 'Hanging Chad', text = { 'Retrigger first and second played card', 'used in scoring #1# additional time' } },
  loc_vars = function(card) return { card.ability.extra } end,
  calc = function(card, ctx)
    if ctx.repetition and scoring_play(ctx) and ctx.scoring_hand then
      local oc = ctx.other_card
      if oc and (oc == ctx.scoring_hand[1] or oc == ctx.scoring_hand[2]) then
        return { message = C.loc('k_again_ex', 'Again!'), repetitions = card.ability.extra, card = card }
      end
    end
  end,
})

-- ── J-11 Bloodstone ─────────────────────────────────────────────────────────

--- The shared roll queue for this PvP round (G.GAME.round_resets, so it is saved with the run).
function S.bloodstone_queue()
  local rr = G.GAME.round_resets
  rr.mp_bloodstone = rr.mp_bloodstone or {}
  local key = C.round_key()
  rr.mp_bloodstone[key] = rr.mp_bloodstone[key] or {}
  return rr.mp_bloodstone[key], key
end

--- Next slot of the queue: the same rolls replay every hand of the round (and for both players,
--- since the key and seed are shared).
function S.bloodstone_roll()
  local rr = G.GAME.round_resets
  local q, key = S.bloodstone_queue()
  rr.mp_bsindex = (rr.mp_bsindex or 0) + 1
  local i = rr.mp_bsindex
  if q[i] == nil then q[i] = pseudorandom('bloodstone' .. key) end
  return q[i]
end

R.define({
  key = 'j_mp_bloodstone', kind = 'Joker', rarity = 2, cost = 7, pos = { x = 0, y = 8 },
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  no_collection = true, balanced = true, silent_replaces = 'j_bloodstone',
  gate = { layers = { 'standard', 'experimental', 'wsob', 'majorleague' } },
  config = { extra = { odds = 2, Xmult = 1.5 } },
  loc = { name = 'Bloodstone', text = { '#1# in #2# chance for played Hearts', 'to give X#3# Mult when scored' } },
  loc_vars = function(card)
    local ex = card.ability.extra
    return { '' .. C.normal(), ex.odds, ex.Xmult }
  end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if C.in_pvp() then
      if ctx.before and not ctx.blueprint then
        S.bloodstone_queue()
        G.GAME.round_resets.mp_bsindex = 0
        return nil
      end
      if ctx.individual and scoring_play(ctx) and ctx.other_card:is_suit('Hearts') then
        if S.bloodstone_roll() < C.normal() / ex.odds then
          return { x_mult = ex.Xmult, card = card }
        end
      end
      return nil
    end
    if ctx.individual and scoring_play(ctx) and ctx.other_card:is_suit('Hearts')
      and pseudorandom('bloodstone') < C.normal() / ex.odds then
      return { x_mult = ex.Xmult, card = card }
    end
  end,
})

-- ── J-12 Seltzer ────────────────────────────────────────────────────────────

S.SELTZER_HANDS = 8

--- Spend `n` uses of a Seltzer-like joker (ability.extra = uses left); eaten at 0.
function S.spend_uses(card, n)
  local left = (card.ability.extra or 0) - n
  if left <= 0 then
    card.ability.extra = 0
    return C.consume(card, 'k_drank_ex', G.C.CHIPS, 'Drank!')
  end
  card.ability.extra = left
  return nil
end

R.define({
  key = 'j_mp_seltzer', kind = 'Joker', rarity = 2, cost = 6, pos = { x = 3, y = 15 },
  blueprint_compat = true, eternal_compat = false, perishable_compat = true,
  no_collection = true, balanced = true, silent_replaces = 'j_selzer',
  gate = { layers = { 'standard', 'experimental' } },
  config = { extra = S.SELTZER_HANDS },
  loc = { name = 'Seltzer', text = { 'Retrigger all cards played', 'for the next #1# hands' } },
  loc_vars = function(card) return { card.ability.extra } end,
  calc = function(card, ctx)
    if card.ability.mp_consumed then return nil end
    if ctx.repetition and scoring_play(ctx) then
      return { message = C.loc('k_again_ex', 'Again!'), repetitions = 1, card = card }
    end
    if ctx.after and not ctx.blueprint then
      return S.spend_uses(card, 1)
    end
    if ctx.mp_pvp_loss and not ctx.blueprint and MP.layer_active('pvp_timer') then
      local n = math.floor(tonumber(ctx.hands_left) or 0)
      if n > 0 then return S.spend_uses(card, n) end
    end
  end,
})

-- ── J-13 Turtle Bean ────────────────────────────────────────────────────────

local function change_hand_size(n)
  if n ~= 0 and G.hand and G.hand.change_size then G.hand:change_size(n) end
end

R.define({
  key = 'j_mp_turtle_bean', kind = 'Joker', rarity = 2, cost = 6, pos = { x = 4, y = 13 },
  blueprint_compat = false, eternal_compat = false, perishable_compat = true,
  no_collection = true, balanced = true, silent_replaces = 'j_turtle_bean',
  gate = { layers = { 'standard' } },
  config = { extra = { h_size = 4, h_mod = 1 } },
  loc = { name = 'Turtle Bean', text = { '+#1# hand size,', 'reduces by #2# every round' } },
  loc_vars = function(card)
    local ex = card.ability.extra
    return { ex.h_size, ex.h_mod }
  end,
  add = function(card) change_hand_size(card.ability.extra.h_size) end,
  remove = function(card) change_hand_size(-card.ability.extra.h_size) end,
  calc = function(card, ctx)
    if C.round_end(ctx) and not ctx.blueprint and not card.ability.mp_consumed then
      local ex = card.ability.extra
      if ex.h_size - ex.h_mod <= 0 then
        return C.consume(card, 'k_eaten_ex', nil, 'Eaten!')
      end
      ex.h_size = ex.h_size - ex.h_mod
      change_hand_size(-ex.h_mod)
      return { message = C.loc_var('a_handsize_minus', { ex.h_mod }, '-' .. ex.h_mod .. ' Hand Size'), colour = G.C.FILTER }
    end
  end,
})

-- ── J-14 / J-15 Golden Ticket (standard and experimental keys) ──────────────

local function ticket(key, layers)
  return {
    key = key, kind = 'Joker', rarity = 2, cost = 6, pos = { x = 5, y = 3 },
    blueprint_compat = true, eternal_compat = true, perishable_compat = true,
    no_collection = true, balanced = true, silent_replaces = 'j_ticket',
    gate = { layers = layers },
    config = { extra = 4 },
    loc = { name = 'Golden Ticket', text = { 'Played Gold cards', 'earn $#1# when scored' } },
    loc_vars = function(card) return { card.ability.extra } end,
    calc = function(card, ctx)
      if ctx.individual and scoring_play(ctx) and ctx.other_card
        and ctx.other_card.ability and ctx.other_card.ability.name == 'Gold Card' then
        local n = card.ability.extra
        G.GAME.dollar_buffer = (G.GAME.dollar_buffer or 0) + n
        G.E_MANAGER:add_event(Event({ func = function() G.GAME.dollar_buffer = 0; return true end }))
        return { dollars = n, card = card }
      end
    end,
  }
end

R.define(ticket('j_mp_ticket', { 'standard' }))
R.define(ticket('j_mp_ticket_experimental', { 'experimental' }))

return S
