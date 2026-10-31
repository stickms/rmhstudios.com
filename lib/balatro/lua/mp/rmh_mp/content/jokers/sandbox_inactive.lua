-- rmh_mp/content/jokers/sandbox_inactive.lua — sandbox jokers out of rotation (J-32…J-44, A2 §2.4).
--
-- D-28: registered (so saves, the codec and the collection know them) but NEVER pooled
-- (`pool = false` beats every gate). Practice can spawn them through give-card when the "Show
-- inactive sandbox cards" toggle is on (MP.sandbox.spawnable).
--
--   j_mp_bloodstone_sandbox      1 in 3: scored Heart gives X2
--   j_mp_cloud_9_sandbox         $min(#9s, 4) + $2 per 9 beyond 4; scored cards 1 in 4 become a 9
--   j_mp_constellation_sandbox   +X0.2 per Planet used, -X0.2 each round end (floor X1)
--   j_mp_faceless_sandbox        $15 when a discard holds a Jack, a Queen and a King
--   j_mp_juggler_sandbox         +3 hand size, -1 per hand of fewer than 5 cards, extinct at 0
--   j_mp_loyalty_card_sandbox    X6 every 4th consecutive play of a hand picked on purchase
--   j_mp_lucky_cat_sandbox       +X0.25 per Lucky trigger; 1 in 4 the card turns Glass
--   j_mp_magnet_sandbox          after 2 rounds, sell to copy the nemesis' best-selling joker;
--                                gone (no reward) after 5 (phantom, sync request/response)
--   j_mp_order_sandbox           X3 on Straights, +X0.5 per consecutive Straight, resets otherwise
--   j_mp_photograph_sandbox      X4 for the scored face card when exactly one face card scores
--   j_mp_ride_the_bus_sandbox    +1, +2 … +5 Mult per faceless hand (escalating); a face destroys it
--   j_mp_runner_sandbox          +50 chips per Straight; scores only on Straights
--   j_mp_satellite_sandbox       $1 +$1 per Planet used; loses min($, 2) at shop end; pays end of round

local MP = require 'rmh_mp.state'
local C = require 'rmh_mp.content.jokers.core'
local S = require 'rmh_mp.content.jokers.sandbox'

local function g(name) return rawget(_G, name) end
local x_msg, mult_msg, chips_msg = C.x_msg, C.mult_msg, C.chips_msg

local function extinct(card)
  return C.consume(card, 'k_extinct_ex', G.C.FILTER, 'Extinct!')
end

local function planet_used(ctx)
  local c = ctx.consumeable
  return ctx.using_consumeable and c and c.ability and c.ability.set == 'Planet'
end

-- ── J-32 Bloodstone (launch values) ─────────────────────────────────────────

S.define({
  key = 'j_mp_bloodstone_sandbox', rarity = 2, cost = 7, pos = { x = 0, y = 0 }, atlas = 'mp_j_bloodstone_sandbox',
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  config = { extra = { odds = 3, Xmult = 2 } },
  loc_vars = function(card)
    local ex = card.ability.extra
    return { C.normal(), ex.odds, ex.Xmult, colours = { G.C.SUITS and G.C.SUITS.Hearts } }
  end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if S.play_individual(ctx) and ctx.other_card:is_suit('Hearts') and C.chance('j_mp_bloodstone_sandbox', ex.odds) then
      return { x_mult = ex.Xmult, card = card }
    end
  end,
}, 'inactive')

-- ── J-33 Cloud 9 ────────────────────────────────────────────────────────────

function S.cloud_9_bonus(card)
  local nines = 0
  for _, v in ipairs(G.playing_cards or {}) do
    if v.get_id and v:get_id() == 9 then nines = nines + 1 end
  end
  return math.min(nines, 4) + math.max(nines - 4, 0) * card.ability.extra.money
end

--- Turn a playing card into a 9 of its suit (the Strength tarot's set_base path).
function S.make_nine(pc)
  local suit = pc.base and pc.base.suit
  local prefix = suit and string.sub(suit, 1, 1)
  local front = prefix and G.P_CARDS and G.P_CARDS[prefix .. '_9']
  if front and pc.set_base then pc:set_base(front) end
end

S.define({
  key = 'j_mp_cloud_9_sandbox', rarity = 2, cost = 7, pos = { x = 0, y = 0 }, atlas = 'mp_j_cloud_9_sandbox',
  blueprint_compat = false, eternal_compat = true, perishable_compat = true,
  config = { extra = { money = 2, odds = 4 } },
  loc_vars = function(card)
    return { C.normal(), card.ability.extra.odds, S.cloud_9_bonus(card) }
  end,
  dollar_bonus = function(card)
    local n = S.cloud_9_bonus(card)
    if n > 0 then return n end
  end,
  calc = function(card, ctx)
    if ctx.blueprint then return end
    if S.play_individual(ctx) and not ctx.other_card.debuff
      and C.chance('j_mp_cloud_9_sandbox', card.ability.extra.odds) then
      local pc = ctx.other_card
      S.make_nine(pc)
      C.sound('card1', 1)
      if pc.juice_up then pc:juice_up(0.3, 0.3) end
    end
  end,
}, 'inactive')

-- ── J-34 Constellation ──────────────────────────────────────────────────────

S.define({
  key = 'j_mp_constellation_sandbox', rarity = 2, cost = 6, pos = { x = 0, y = 0 }, atlas = 'mp_j_constellation_sandbox',
  blueprint_compat = true, eternal_compat = true, perishable_compat = false,
  config = { extra = { Xmult = 1, Xmult_mod = 0.2, Xmult_loss = 0.2 } },
  loc_vars = function(card) return { card.ability.extra.Xmult } end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if planet_used(ctx) and not ctx.blueprint then
      ex.Xmult = ex.Xmult + ex.Xmult_mod
      return { message = x_msg(ex.Xmult) }
    end
    if C.round_end(ctx) and not ctx.blueprint then
      ex.Xmult = math.max(1, ex.Xmult - ex.Xmult_loss)
      return { message = C.loc_var('a_xmult_minus', { ex.Xmult_loss }, '-X' .. ex.Xmult_loss), colour = G.C.RED }
    end
    if C.main(ctx) and ex.Xmult > 1 then
      return { message = x_msg(ex.Xmult), Xmult_mod = ex.Xmult, colour = G.C.MULT }
    end
  end,
}, 'inactive')

-- ── J-35 Faceless Joker ─────────────────────────────────────────────────────

S.define({
  key = 'j_mp_faceless_sandbox', rarity = 1, cost = 4, pos = { x = 0, y = 0 }, atlas = 'mp_j_faceless_sandbox',
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  config = { extra = { dollars = 15 } },
  loc_vars = function(card) return { card.ability.extra.dollars } end,
  calc = function(card, ctx)
    local fh = ctx.full_hand
    if not (ctx.discard and fh and ctx.other_card == fh[#fh]) then return end
    local j, q, k = false, false, false
    for _, c in ipairs(fh) do
      local id = c:get_id()
      if id == 11 then j = true elseif id == 12 then q = true elseif id == 13 then k = true end
    end
    if j and q and k then
      local n = card.ability.extra.dollars
      C.ease_dollars(n)
      return { message = S.money_msg(n), colour = G.C.MONEY }
    end
  end,
}, 'inactive')

-- ── J-36 Juggler ────────────────────────────────────────────────────────────

local function hand_size(n)
  if n ~= 0 and G.hand and G.hand.change_size then G.hand:change_size(n) end
end

S.define({
  key = 'j_mp_juggler_sandbox', rarity = 1, cost = 4, pos = { x = 0, y = 0 }, atlas = 'mp_j_juggler_sandbox',
  blueprint_compat = false, eternal_compat = true, perishable_compat = true,
  config = { extra = { h_size = 3 } },
  loc_vars = function(card) return { card.ability.extra.h_size } end,
  add = function(card) hand_size(card.ability.extra.h_size) end,
  remove = function(card) hand_size(-math.max(0, card.ability.extra.h_size)) end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if ctx.before and ctx.cardarea == G.jokers and not ctx.blueprint and ctx.full_hand and #ctx.full_hand < 5
      and ex.h_size > 0 and not card.ability.mp_consumed then
      ex.h_size = ex.h_size - 1
      hand_size(-1)
      if ex.h_size <= 0 then return extinct(card) end
      return { message = C.loc('rmh_mp_k_minus_hand_size', '-1 Hand Size'), colour = G.C.FILTER }
    end
  end,
}, 'inactive')

-- ── J-37 Loyalty Card ───────────────────────────────────────────────────────

--- Visible poker hands in the game's own order (G.handlist), for a seeded pick.
function S.visible_hands()
  local out = {}
  for _, name in ipairs(G.handlist or {}) do
    local h = G.GAME.hands and G.GAME.hands[name]
    if h and h.visible then out[#out + 1] = name end
  end
  return out
end

S.define({
  key = 'j_mp_loyalty_card_sandbox', rarity = 2, cost = 5, pos = { x = 0, y = 0 }, atlas = 'mp_j_loyalty_card_sandbox',
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  config = { extra = { Xmult = 6, every = 4, loyalty_remaining = 4 } },
  loc_vars = function(card)
    local ex = card.ability.extra
    local hand = ex.poker_hand
    local shown = hand and (g('localize') and localize(hand, 'poker_hands') or hand) or '???'
    return { shown, math.abs(ex.every - ex.loyalty_remaining), ex.every }
  end,
  add = function(card)
    local ex = card.ability.extra
    if ex.poker_hand then return end
    local list = S.visible_hands()
    if #list > 0 then ex.poker_hand = list[pseudorandom('loyalty_card_sandbox', 1, #list)] end
  end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if ctx.before and ctx.cardarea == G.jokers and not ctx.blueprint then
      if ctx.scoring_name == ex.poker_hand then
        if ex.loyalty_remaining > 0 then ex.loyalty_remaining = ex.loyalty_remaining - 1 end
        return nil
      end
      ex.loyalty_remaining = ex.every
      return { message = C.loc('k_reset', 'Reset'), colour = G.C.RED }
    end
    if C.main(ctx) and ex.loyalty_remaining == 0 then
      if not ctx.blueprint then ex.loyalty_remaining = ex.every end
      return { message = x_msg(ex.Xmult), Xmult_mod = ex.Xmult, colour = G.C.MULT }
    end
  end,
}, 'inactive')

-- ── J-38 Lucky Cat ──────────────────────────────────────────────────────────

S.define({
  key = 'j_mp_lucky_cat_sandbox', rarity = 2, cost = 6, pos = { x = 0, y = 0 }, atlas = 'mp_j_lucky_cat_sandbox',
  blueprint_compat = true, eternal_compat = true, perishable_compat = false, enhancement_gate = 'm_lucky',
  config = { extra = { Xmult_gain = 0.25, Xmult = 1, glass_odds = 4 } },
  loc_vars = function(card) return { card.ability.extra.Xmult_gain, card.ability.extra.Xmult } end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if S.play_individual(ctx) and ctx.other_card.lucky_trigger and not ctx.blueprint then
      ex.Xmult = ex.Xmult + ex.Xmult_gain
      if C.chance('j_lucky_cat_mp_sandbox', ex.glass_odds) and G.P_CENTERS.m_glass then
        ctx.other_card:set_ability(G.P_CENTERS.m_glass, nil, true)
      end
      return { extra = { message = C.loc('k_upgrade_ex', 'Upgrade!'), colour = G.C.MULT }, card = card }
    end
    if C.main(ctx) and ex.Xmult > 1 then
      return { message = x_msg(ex.Xmult), Xmult_mod = ex.Xmult, colour = G.C.MULT }
    end
  end,
}, 'inactive')

-- ── J-39 Magnet ─────────────────────────────────────────────────────────────

S.MAGNET = 'j_mp_magnet_sandbox'

S.define({
  key = S.MAGNET, rarity = 3, cost = 7, pos = { x = 0, y = 0 }, atlas = 'mp_j_magnet', balanced = false,
  blueprint_compat = false, eternal_compat = false, perishable_compat = true, phantom = true,
  config = { extra = { rounds = 2, current_rounds = 0, max_rounds = 5 } },
  loc_vars = function(card)
    local ex = card.ability.extra
    return { ex.rounds, ex.current_rounds, ex.max_rounds }
  end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if ctx.blueprint then return end
    if C.round_end(ctx) and not card.ability.mp_consumed then
      ex.current_rounds = ex.current_rounds + 1
      if ex.current_rounds > ex.max_rounds then
        local eff = C.consume(card, 'k_no_reward', G.C.FILTER, 'No reward')
        return eff
      end
      if ex.current_rounds == ex.rounds and g('juice_card_until') then
        juice_card_until(card, function(c) return not c.REMOVED end, true)
      end
      local msg = ex.current_rounds < ex.rounds and (ex.current_rounds .. '/' .. ex.rounds) or C.loc('k_active_ex', 'Active!')
      return { message = msg, colour = G.C.FILTER }
    end
    if ctx.selling_self and ex.current_rounds >= ex.rounds and ex.current_rounds <= ex.max_rounds then
      local t = C.target()
      if t then
        MP.state.magnet_pending = t
        MP.sync.send(S.MAGNET, { type = 'request' }, t)
      end
    end
  end,
}, 'inactive')

--- The joker a Magnet request takes: highest sell cost, ties broken by a seeded pick over the
--- tied cards in slot order.
function S.magnet_pick()
  local best
  for _, c in ipairs((G.jokers and G.jokers.cards) or {}) do
    if not best or (c.sell_cost or 0) > (best.sell_cost or 0) then best = c end
  end
  if not best then return nil end
  local tied = {}
  for _, c in ipairs(G.jokers.cards) do
    if (c.sell_cost or 0) == (best.sell_cost or 0) then tied[#tied + 1] = c end
  end
  local i = math.floor(pseudorandom('j_mp_magnet') * #tied) + 1
  return tied[math.min(i, #tied)]
end

MP.sync.register(S.MAGNET, {
  receive = function(from, data)
    if type(data) ~= 'table' then return end
    if data.type == 'request' then
      if not C.from_target(from) then return end
      local chosen = S.magnet_pick()
      if not chosen or not (MP.card and MP.card.serialize) then return end
      local ok, sc = pcall(MP.card.serialize, chosen)
      if not ok or not sc then return end
      if MP.replay_hook then pcall(MP.replay_hook, 'magnet', 1) end
      return { send = { type = 'response', card = sc }, to = from }
    elseif data.type == 'response' then
      -- Only the player we asked, and only once per request.
      if not MP.state.magnet_pending or MP.state.magnet_pending ~= from then return end
      MP.state.magnet_pending = nil
      if data.card and MP.card and MP.card.build and G.jokers then
        local ok, err = pcall(MP.card.build, data.card, G.jokers)
        if not ok then MP.log('warn', 'magnet: could not rebuild the copy: %s', tostring(err)) end
      end
    end
  end,
})

-- ── J-40 The Order ──────────────────────────────────────────────────────────

S.define({
  key = 'j_mp_order_sandbox', rarity = 3, cost = 8, pos = { x = 0, y = 0 }, atlas = 'mp_j_order_sandbox',
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  config = { extra = { Xmult = 3, Xmult_mod = 0.5, base = 3 } },
  loc_vars = function(card) return { card.ability.extra.Xmult_mod, card.ability.extra.Xmult } end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if ctx.before and ctx.cardarea == G.jokers and not ctx.blueprint then
      if S.straight(ctx) then
        ex.Xmult = ex.Xmult + ex.Xmult_mod
        return { message = C.loc('k_upgrade_ex', 'Upgrade!'), colour = G.C.RED }
      end
      ex.Xmult = ex.base
      return { message = C.loc('k_reset', 'Reset'), colour = G.C.RED }
    end
    if C.main(ctx) and S.straight(ctx) then
      return { message = x_msg(ex.Xmult), Xmult_mod = ex.Xmult, colour = G.C.MULT }
    end
  end,
}, 'inactive')

-- ── J-41 Photograph ─────────────────────────────────────────────────────────

S.define({
  key = 'j_mp_photograph_sandbox', rarity = 1, cost = 5, pos = { x = 0, y = 0 }, atlas = 'mp_j_photograph_sandbox',
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  config = { extra = { xmult = 4 } },
  set_ability = function(card) S.resize(card, 1 / 1.2) end,
  loc_vars = function(card) return { card.ability.extra.xmult } end,
  calc = function(card, ctx)
    if not (S.play_individual(ctx) and ctx.other_card:is_face()) then return end
    local faces = 0
    for _, c in ipairs(ctx.scoring_hand or {}) do if c:is_face() then faces = faces + 1 end end
    if faces == 1 then return { x_mult = card.ability.extra.xmult, card = card } end
  end,
}, 'inactive')

-- ── J-42 Ride the Bus ───────────────────────────────────────────────────────

S.define({
  key = 'j_mp_ride_the_bus_sandbox', rarity = 1, cost = 6, pos = { x = 0, y = 0 }, atlas = 'mp_j_ride_the_bus_sandbox',
  blueprint_compat = true, eternal_compat = true, perishable_compat = false,
  config = { extra = { mult_gain = 1, mult = 0, max_gain = 5 } },
  loc_vars = function(card) return { card.ability.extra.mult } end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if card.ability.mp_consumed then return end
    if ctx.before and ctx.cardarea == G.jokers and not ctx.blueprint then
      for _, c in ipairs(ctx.scoring_hand or {}) do
        if c:is_face() then return extinct(card) end
      end
      ex.mult = ex.mult + ex.mult_gain
      if ex.mult_gain < ex.max_gain then ex.mult_gain = ex.mult_gain + 1 end
      return nil
    end
    if C.main(ctx) and ex.mult > 0 then
      return { message = mult_msg(ex.mult), mult_mod = ex.mult, colour = G.C.MULT }
    end
  end,
}, 'inactive')

-- ── J-43 Runner ─────────────────────────────────────────────────────────────

S.define({
  key = 'j_mp_runner_sandbox', rarity = 1, cost = 5, pos = { x = 0, y = 0 }, atlas = 'mp_j_runner_sandbox',
  blueprint_compat = true, eternal_compat = true, perishable_compat = false,
  config = { extra = { chips = 0, chip_mod = 50 } },
  loc_vars = function(card) return { card.ability.extra.chips } end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if ctx.before and ctx.cardarea == G.jokers and not ctx.blueprint and S.straight(ctx) then
      ex.chips = ex.chips + ex.chip_mod
      return { message = C.loc('k_upgrade_ex', 'Upgrade!'), colour = G.C.CHIPS }
    end
    if C.main(ctx) and S.straight(ctx) and ex.chips > 0 then
      return { message = chips_msg(ex.chips), chip_mod = ex.chips, colour = G.C.CHIPS }
    end
  end,
}, 'inactive')

-- ── J-44 Satellite ──────────────────────────────────────────────────────────

S.define({
  key = 'j_mp_satellite_sandbox', rarity = 2, cost = 6, pos = { x = 0, y = 0 }, atlas = 'mp_j_satellite_sandbox',
  blueprint_compat = false, eternal_compat = true, perishable_compat = true,
  config = { extra = { dollars = 1, decay = 2 } },
  loc_vars = function(card) return { card.ability.extra.dollars } end,
  dollar_bonus = function(card)
    local d = card.ability.extra.dollars
    if d > 0 then return d end
  end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if ctx.blueprint then return end
    if planet_used(ctx) then
      ex.dollars = ex.dollars + 1
      return { message = C.loc_var('k_val_up', { 1 }, 'Value Up!'), colour = G.C.MONEY }
    end
    if ctx.ending_shop and ex.dollars > 0 then
      local d = math.min(ex.dollars, ex.decay)
      ex.dollars = ex.dollars - d
      C.sound('slice1', 0.96)
      return { message = '-' .. S.money_msg(d), colour = G.C.RED }
    end
  end,
}, 'inactive')

return S
