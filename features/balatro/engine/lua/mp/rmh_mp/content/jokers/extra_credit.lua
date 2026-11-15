-- rmh_mp/content/jokers/extra_credit.lua — the Extra Credit jokers (J-46…J-71, A2 §2.5).
--
-- One shared 10x10 sheet (mp_ec_jokers_sandbox, positions below), the Extra Credit sticker
-- (def.extra_credit -> ability.mp_extra_credit, drawn by WS7's stickers), pooled through the
-- sandbox layer only. Alloy is out of rotation (D-28: registered, never pooled). Per-round globals
-- (tuxedo_card, farmer_card, fish_rank) are rolled by rules/sandbox.lua; Hoarder's ease_dollars
-- hook, Clown Car's initial scoring step and Lucky 7 / Alloy's "counts as" rules are session wraps
-- in content/sandbox_misc.lua.
--
--   forklift (0,0)        +2 consumable slots
--   doublerainbow (1,0)   retrigger Lucky cards (played; held ones that have an effect)
--   starfruit (2,0)       first hand of a round: 1 in 2 to level it up; 5 uses
--   pocketaces (5,0)      scored Aces +$2 to the end-of-round payout, reset after the Boss
--   warlock (6,0)         scored Lucky cards 1 in 7 arm it; then a random scoring Lucky card is
--                         destroyed for a random Spectral (needs room)
--   candynecklace (9,0)   shop end: a random Booster tag (buffoon/charm/meteor/standard/ethereal); 5 uses
--   clowncollege (4,1)    Boss defeated: fill empty consumable slots with The Fool
--   montehaul (5,1)       after a round, sell for 2 random tags (foil/holo/poly/negative/uncommon/rare)
--   espresso (6,1)        $30 on a skip (then gone); -$5 per round, gone at $0
--   trafficlight (7,1)    X2.5 -> X1.5 -> X0.5 -> X2.5, stepping after each hand
--   farmer (9,1)          held cards of the round's suit pay $2 at round end
--   werewolf (1,2)        played enhanced cards become Wild
--   tuxedo (4,2)          retrigger cards of the round's suit (played; held with an effect)
--   ambrosia (5,2)        on a skip: fill consumable slots with Spectrals; selling a Spectral drinks it
--   clowncar (6,2)        +44 Mult and -$3 before cards score
--   shipoftheseus (7,2)   a destroyed playing card is copied back into the deck, +X0.4 each
--   gofish (9,2)          the first hand with scoring cards of the round's rank destroys them
--   bobby (0,3)           blind select: -2 hands +4 discards (or -1/+2 with exactly 2 hands)
--   pyromancer (1,3)      +20 Mult if hands left <= discards left
--   chainlightning (2,3)  n-th scored Mult card of a hand gives X(1 + 0.1(n-1))
--   jokalisa (3,3)        +X0.1 per unique enhancement in the scoring hand
--   jokeroftheyear (5,3)  5 scoring cards: retrigger every played card
--   lucky7 (7,3)          a scoring 7 makes every scoring card count as Lucky for that hand
--   couponsheet (8,3)     Boss defeated: a Coupon Tag and a Voucher Tag
--   hoarder (9,3)         +$1 sell value whenever money is earned
--   alloy (4,4)           INACTIVE: Gold counts as Steel and Steel as Gold

local MP = require 'rmh_mp.state'
local C = require 'rmh_mp.content.jokers.core'
local S = require 'rmh_mp.content.jokers.sandbox'

local function g(name) return rawget(_G, name) end
local x_msg, mult_msg = C.x_msg, C.mult_msg

local function ec(def, inactive)
  return S.define(def, inactive and 'extra_credit_inactive' or 'extra_credit')
end

--- Queue `add_tag(Tag(key))` (no-op without the Tag UI).
function S.add_tag(key)
  G.E_MANAGER:add_event(Event({ func = function()
    if g('add_tag') and g('Tag') then add_tag(Tag(key)) end
    return true
  end }))
end

--- Create consumables of `set` (forced `key`, or a pool roll with `append`) until the slots are
--- full, the vanilla buffer way. Returns how many were queued.
function S.fill_consumables(set, key, append, by)
  local area = G.consumeables
  if not area then return 0 end
  local n = 0
  for _ = 1, area.config.card_limit do
    if #area.cards + (G.GAME.consumeable_buffer or 0) < area.config.card_limit then
      G.GAME.consumeable_buffer = (G.GAME.consumeable_buffer or 0) + 1
      n = n + 1
      G.E_MANAGER:add_event(Event({ trigger = 'before', delay = 0.0, func = function()
        if g('create_card') then
          local c = create_card(set, G.consumeables, nil, nil, nil, nil, key, append)
          c:add_to_deck()
          G.consumeables:emplace(c)
          if c.juice_up then c:juice_up(0.5, 0.5) end
        end
        G.GAME.consumeable_buffer = 0
        return true
      end }))
    end
  end
  if n > 0 and by then
    local msg = set == 'Tarot' and C.loc('k_plus_tarot', '+1 Tarot') or C.loc('k_plus_spectral', '+1 Spectral')
    C.status(by, msg, G.C.SECONDARY_SET and G.C.SECONDARY_SET[set])
  end
  return n
end

--- Copy a destroyed playing card back into the deck (DNA's path).
function S.copy_into_deck(val)
  if not (g('copy_card') and G.deck) then return nil end
  G.playing_card = (G.playing_card and G.playing_card + 1) or 1
  local c = copy_card(val, nil, nil, G.playing_card)
  c:add_to_deck()
  G.deck.config.card_limit = G.deck.config.card_limit + 1
  G.deck:emplace(c)
  G.playing_cards = G.playing_cards or {}
  table.insert(G.playing_cards, c)
  if g('playing_card_joker_effects') then playing_card_joker_effects({ true }) end
  G.E_MANAGER:add_event(Event({ func = function()
    if c.start_materialize then c:start_materialize() end
    return true
  end }))
  return c
end

local function held_with_effect(ctx)
  local fx = ctx.card_effects
  return fx ~= nil and ((fx[1] and next(fx[1]) ~= nil) or #fx > 1)
end

local function again(card, n) return { message = C.loc('k_again_ex', 'Again!'), repetitions = n or 1, card = card } end

-- ── J-46 Forklift ───────────────────────────────────────────────────────────

local function consumable_slots(n)
  G.E_MANAGER:add_event(Event({ func = function()
    if G.consumeables then G.consumeables.config.card_limit = G.consumeables.config.card_limit + n end
    return true
  end }))
end

ec({
  key = 'j_mp_forklift_sandbox', rarity = 1, cost = 5, pos = { x = 0, y = 0 },
  blueprint_compat = false, eternal_compat = true, perishable_compat = true,
  config = { extra = { card_limit = 2 } },
  loc_vars = function(card) return { card.ability.extra.card_limit } end,
  add = function(card) consumable_slots(card.ability.extra.card_limit) end,
  remove = function(card) consumable_slots(-card.ability.extra.card_limit) end,
})

-- ── J-47 Double Rainbow ─────────────────────────────────────────────────────

ec({
  key = 'j_mp_doublerainbow_sandbox', rarity = 2, cost = 5, pos = { x = 1, y = 0 },
  blueprint_compat = true, eternal_compat = true, perishable_compat = true, enhancement_gate = 'm_lucky',
  config = { extra = 1 },
  calc = function(card, ctx)
    if not (ctx.repetition and ctx.other_card and S.has_enh(ctx.other_card, 'm_lucky')) then return end
    if ctx.cardarea == G.play then return again(card, 1) end
    if ctx.cardarea == G.hand and held_with_effect(ctx) then return again(card, card.ability.extra) end
  end,
})

-- ── J-48 Starfruit ──────────────────────────────────────────────────────────

ec({
  key = 'j_mp_starfruit_sandbox', rarity = 1, cost = 6, pos = { x = 2, y = 0 },
  blueprint_compat = true, eternal_compat = false, perishable_compat = true,
  config = { extra = { uses = 5, odds = 2 } },
  loc_vars = function(card)
    local ex = card.ability.extra
    return { ex.uses, C.normal(), ex.odds }
  end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if not (ctx.before and ctx.cardarea == G.jokers and (G.GAME.current_round.hands_played or 0) == 0) then return end
    if card.ability.mp_consumed then return end
    local eff
    if C.chance('j_mp_starfruit_sandbox', ex.odds) then
      eff = { message = C.loc('k_level_up_ex', 'Level Up!'), level_up = true }
    end
    if not ctx.blueprint then
      ex.uses = ex.uses - 1
      if ex.uses <= 0 then
        local gone = C.consume(card, 'k_eaten_ex', G.C.MONEY, 'Eaten!')
        if eff then
          if gone then C.status(card, gone.message, gone.colour) end
        else
          eff = gone
        end
      end
    end
    return eff
  end,
})

-- ── J-49 Pocket Aces ────────────────────────────────────────────────────────

ec({
  key = 'j_mp_pocketaces_sandbox', rarity = 2, cost = 7, pos = { x = 5, y = 0 },
  blueprint_compat = false, eternal_compat = true, perishable_compat = true,
  config = { extra = { money = 0, m_gain = 2 } },
  loc_vars = function(card) return { card.ability.extra.money, card.ability.extra.m_gain } end,
  dollar_bonus = function(card)
    local ex = card.ability.extra
    local pay = ex.money
    if S.boss_round() then ex.money = 0 end
    if pay > 0 then return pay end
  end,
  calc = function(card, ctx)
    if S.play_individual(ctx) and not ctx.blueprint and ctx.other_card:get_id() == 14 then
      local ex = card.ability.extra
      ex.money = ex.money + ex.m_gain
    end
  end,
})

-- ── J-50 Warlock ────────────────────────────────────────────────────────────

--- A uniform pick over the whole Spectral pool (A2 §2.5).
function S.random_spectral_key(seed)
  local pool = G.P_CENTER_POOLS and G.P_CENTER_POOLS.Spectral
  if not pool or #pool == 0 then return nil end
  local list = {}
  for i, v in ipairs(pool) do list[i] = v end
  local e = pseudorandom_element(list, pseudoseed(seed))
  return e and e.key
end

ec({
  key = 'j_mp_warlock_sandbox', rarity = 2, cost = 7, pos = { x = 6, y = 0 },
  blueprint_compat = true, eternal_compat = true, perishable_compat = true, enhancement_gate = 'm_lucky',
  config = { extra = { odds = 7, succeed = false } },
  loc_vars = function(card) return { C.normal(), card.ability.extra.odds } end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if ctx.before and ctx.cardarea == G.jokers and not ctx.blueprint then
      ex.succeed = false
      card.mp_warlock = { scoring = ctx.scoring_hand or {} }
      return nil
    end
    if S.play_individual(ctx) and S.has_enh(ctx.other_card, 'm_lucky') then
      if C.chance('j_mp_warlock_sandbox', ex.odds) then ex.succeed = true end
      return nil
    end
    if ctx.destroying_card and not ctx.blueprint then
      local st = card.mp_warlock
      if not st then return nil end
      if ex.succeed and st.target == nil then
        ex.succeed = false
        st.target = false
        local area = G.consumeables
        if area and #area.cards + (G.GAME.consumeable_buffer or 0) < area.config.card_limit then
          local lucky = {}
          for _, pc in ipairs(st.scoring) do if S.has_enh(pc, 'm_lucky') then lucky[#lucky + 1] = pc end end
          if #lucky > 0 then
            st.target = lucky[pseudorandom('warlock_target', 1, #lucky)]
            local key = S.random_spectral_key('warlock_spectral')
            G.GAME.consumeable_buffer = (G.GAME.consumeable_buffer or 0) + 1
            G.E_MANAGER:add_event(Event({ trigger = 'after', delay = 0.4, func = function()
              if key and g('create_card') then
                local c = create_card('Spectral', G.consumeables, nil, nil, nil, nil, key, 'warlock')
                c:add_to_deck()
                G.consumeables:emplace(c)
              end
              G.GAME.consumeable_buffer = 0
              return true
            end }))
            C.status(card, C.loc('k_plus_spectral', '+1 Spectral'), G.C.SECONDARY_SET and G.C.SECONDARY_SET.Spectral)
          end
        end
      end
      if st.target and ctx.destroying_card == st.target then return true end
      return nil
    end
    if ctx.after and not ctx.blueprint then
      card.mp_warlock = nil
      ex.succeed = false
    end
  end,
})

-- ── J-51 Candy Necklace ─────────────────────────────────────────────────────

S.CANDY_FLAVOURS = { 'tag_buffoon', 'tag_charm', 'tag_meteor', 'tag_standard', 'tag_ethereal' }

ec({
  key = 'j_mp_candynecklace_sandbox', rarity = 2, cost = 8, pos = { x = 9, y = 0 },
  blueprint_compat = true, eternal_compat = false, perishable_compat = true,
  config = { extra = { candies = 5 } },
  loc_vars = function(card) return { card.ability.extra.candies } end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if not ctx.ending_shop or ex.candies <= 0 or card.ability.mp_consumed then return end
    local list = S.CANDY_FLAVOURS
    S.add_tag(list[pseudorandom('candy_tag', 1, #list)])
    if ctx.blueprint then return nil end
    ex.candies = ex.candies - 1
    if ex.candies <= 0 then return C.consume(card, 'k_eaten_ex', G.C.MONEY, 'Eaten!') end
  end,
})

-- ── J-52 Clown College ──────────────────────────────────────────────────────

ec({
  key = 'j_mp_clowncollege_sandbox', rarity = 2, cost = 7, pos = { x = 4, y = 1 },
  blueprint_compat = false, eternal_compat = true, perishable_compat = true,
  config = { extra = {} },
  calc = function(card, ctx)
    if C.round_end(ctx) and not ctx.blueprint and S.boss_round() then
      S.fill_consumables('Tarot', 'c_fool', nil, card)
    end
  end,
})

-- ── J-53 Monte Haul ─────────────────────────────────────────────────────────

S.MONTY_FLAVOURS = { 'tag_foil', 'tag_holo', 'tag_polychrome', 'tag_negative', 'tag_uncommon', 'tag_rare' }

ec({
  key = 'j_mp_montehaul_sandbox', rarity = 2, cost = 5, pos = { x = 5, y = 1 },
  blueprint_compat = true, eternal_compat = false, perishable_compat = true,
  config = { extra = { monty_rounds = 0 } },
  loc_vars = function(card) return { card.ability.extra.monty_rounds } end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if C.round_end(ctx) and not ctx.blueprint then
      ex.monty_rounds = ex.monty_rounds + 1
      if g('juice_card_until') then juice_card_until(card, function(c) return not c.REMOVED end, true) end
      return { message = C.loc('k_active_ex', 'Active!'), colour = G.C.FILTER }
    end
    if ctx.selling_self and ex.monty_rounds >= 1 then
      local list = S.MONTY_FLAVOURS
      for _ = 1, 2 do S.add_tag(list[pseudorandom('monty', 1, #list)]) end
    end
  end,
})

-- ── J-54 Espresso ───────────────────────────────────────────────────────────

ec({
  key = 'j_mp_espresso_sandbox', rarity = 1, cost = 2, pos = { x = 6, y = 1 },
  blueprint_compat = false, eternal_compat = false, perishable_compat = true,
  config = { extra = { money = 30, m_loss = 5 } },
  loc_vars = function(card) return { card.ability.extra.money, card.ability.extra.m_loss } end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if ctx.blueprint or card.ability.mp_consumed then return end
    if ctx.skip_blind then
      C.ease_dollars(ex.money)
      return C.consume(card, 'k_drank_ex', G.C.MONEY, 'Drank!')
    end
    if C.round_end(ctx) then
      ex.money = ex.money - ex.m_loss
      if ex.money <= 0 then
        local eff = C.consume(card, 'rmh_mp_k_too_cold', G.C.FILTER, 'Too cold!')
        return eff
      end
      return { message = C.loc('rmh_mp_k_cooled', 'Cooled!'), colour = G.C.FILTER }
    end
  end,
})

-- ── J-55 Traffic Light ──────────────────────────────────────────────────────

ec({
  key = 'j_mp_trafficlight_sandbox', rarity = 2, cost = 5, pos = { x = 7, y = 1 },
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  config = { extra = { Xmult = 2.5, Xmult_mod = 1, reset = 2.5, floor = 0.5 } },
  loc_vars = function(card) return { card.ability.extra.Xmult, card.ability.extra.Xmult_mod } end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if C.main(ctx) then
      return { message = x_msg(ex.Xmult), Xmult_mod = ex.Xmult, colour = G.C.MULT }
    end
    if ctx.after and ctx.cardarea == G.jokers and not ctx.blueprint then
      ex.Xmult = ex.Xmult - ex.Xmult_mod
      if ex.Xmult < ex.floor - 1e-9 then
        ex.Xmult = ex.reset
        return { message = C.loc('rmh_mp_k_go', 'Go!'), colour = G.C.GREEN }
      end
      return { message = C.loc_var('a_xmult_minus', { ex.Xmult_mod }, '-X' .. ex.Xmult_mod),
        colour = ex.Xmult <= ex.floor + 1e-9 and G.C.RED or G.C.FILTER }
    end
  end,
})

-- ── J-56 Farmer ─────────────────────────────────────────────────────────────

ec({
  key = 'j_mp_farmer_sandbox', rarity = 1, cost = 6, pos = { x = 9, y = 1 },
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  config = { extra = { dollars = 2 } },
  loc_vars = function(card)
    local fc = G.GAME and G.GAME.current_round and G.GAME.current_round.farmer_card
    local suit = (fc and fc.suit) or 'Spades'
    return { card.ability.extra.dollars, g('localize') and localize(suit, 'suits_singular') or suit,
      colours = { G.C.SUITS and G.C.SUITS[suit] } }
  end,
  calc = function(card, ctx)
    local fc = G.GAME.current_round.farmer_card
    if ctx.individual and ctx.end_of_round and ctx.cardarea == G.hand and not ctx.repetition
      and fc and fc.suit and ctx.other_card and ctx.other_card:is_suit(fc.suit) then
      return { h_dollars = card.ability.extra.dollars, card = card }
    end
  end,
})

-- ── J-57 Werewolf ───────────────────────────────────────────────────────────

ec({
  key = 'j_mp_werewolf_sandbox', rarity = 2, cost = 5, pos = { x = 1, y = 2 },
  blueprint_compat = false, eternal_compat = true, perishable_compat = true,
  config = { extra = {} },
  calc = function(card, ctx)
    if not (ctx.before and ctx.cardarea == G.jokers) or ctx.blueprint then return end
    local n = 0
    for _, pc in ipairs(ctx.full_hand or {}) do
      local k = S.enh_key(pc)
      if k and k ~= 'm_wild' and G.P_CENTERS.m_wild then
        n = n + 1
        pc:set_ability(G.P_CENTERS.m_wild, nil, true)
        G.E_MANAGER:add_event(Event({ func = function() if pc.juice_up then pc:juice_up() end; return true end }))
      end
    end
    if n > 0 then return { message = C.loc('rmh_mp_k_awooo', 'Awooo!'), colour = G.C.PURPLE } end
  end,
})

-- ── J-58 Tuxedo ─────────────────────────────────────────────────────────────

ec({
  key = 'j_mp_tuxedo_sandbox', rarity = 2, cost = 5, pos = { x = 4, y = 2 },
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  config = { extra = { reps = 1 } },
  loc_vars = function()
    local tc = G.GAME and G.GAME.current_round and G.GAME.current_round.tuxedo_card
    local suit = (tc and tc.suit) or 'Spades'
    return { g('localize') and localize(suit, 'suits_singular') or suit, colours = { G.C.SUITS and G.C.SUITS[suit] } }
  end,
  calc = function(card, ctx)
    local tc = G.GAME.current_round.tuxedo_card
    if not (ctx.repetition and ctx.other_card and tc and tc.suit and ctx.other_card:is_suit(tc.suit)) then return end
    if ctx.cardarea == G.play then return again(card, card.ability.extra.reps) end
    if ctx.cardarea == G.hand and held_with_effect(ctx) then return again(card, card.ability.extra.reps) end
  end,
})

-- ── J-59 Ambrosia ───────────────────────────────────────────────────────────

ec({
  key = 'j_mp_ambrosia_sandbox', rarity = 2, cost = 5, pos = { x = 5, y = 2 },
  blueprint_compat = false, eternal_compat = false, perishable_compat = true,
  config = { extra = {} },
  calc = function(card, ctx)
    if ctx.blueprint or card.ability.mp_consumed then return end
    if ctx.skip_blind then
      S.fill_consumables('Spectral', nil, 'ambro', card)
      return nil
    end
    if ctx.selling_card and ctx.card and ctx.card ~= card and ctx.card.ability
      and ctx.card.ability.set == 'Spectral' then
      return C.consume(card, 'k_drank_ex', G.C.SECONDARY_SET and G.C.SECONDARY_SET.Spectral, 'Drank!')
    end
  end,
})

-- ── J-60 Clown Car ──────────────────────────────────────────────────────────

ec({
  key = 'j_mp_clowncar_sandbox', rarity = 3, cost = 7, pos = { x = 6, y = 2 },
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  config = { extra = { mult = 44, money = 3 } },
  loc_vars = function(card) return { card.ability.extra.mult, card.ability.extra.money } end,
  calc = function(card, ctx)
    if not ctx.mp_initial_scoring then return end
    local ex = card.ability.extra
    C.ease_dollars(-ex.money)
    C.status(ctx.blueprint_card or card, '-' .. S.money_msg(ex.money), G.C.MONEY)
    return { message = mult_msg(ex.mult), mult_mod = ex.mult, colour = G.C.MULT }
  end,
})

-- ── J-61 Ship of Theseus ────────────────────────────────────────────────────

ec({
  key = 'j_mp_shipoftheseus_sandbox', rarity = 3, cost = 9, pos = { x = 7, y = 2 },
  blueprint_compat = true, eternal_compat = true, perishable_compat = false,
  config = { extra = { Xmult = 1, Xmult_mod = 0.4 } },
  loc_vars = function(card) return { card.ability.extra.Xmult, card.ability.extra.Xmult_mod } end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if ctx.remove_playing_cards then
      local n = 0
      for _, val in ipairs(ctx.removed or {}) do
        if S.copy_into_deck(val) then n = n + 1 end
        if not ctx.blueprint then ex.Xmult = ex.Xmult + ex.Xmult_mod end
      end
      if n > 0 then C.status(ctx.blueprint_card or card, C.loc('k_copied_ex', 'Copied!'), G.C.FILTER) end
      if not ctx.blueprint and #(ctx.removed or {}) > 0 then
        C.status(card, x_msg(ex.Xmult), G.C.FILTER)
      end
      return nil
    end
    if C.main(ctx) and ex.Xmult > 1 then
      return { message = x_msg(ex.Xmult), Xmult_mod = ex.Xmult, colour = G.C.MULT }
    end
  end,
})

-- ── J-62 Go Fish ────────────────────────────────────────────────────────────

ec({
  key = 'j_mp_gofish_sandbox', rarity = 2, cost = 6, pos = { x = 9, y = 2 },
  blueprint_compat = false, eternal_compat = true, perishable_compat = true,
  config = { extra = { fished = false } },
  loc_vars = function()
    local fr = G.GAME and G.GAME.current_round and G.GAME.current_round.fish_rank
    local rank = (fr and fr.rank) or 'Ace'
    return { g('localize') and localize(rank, 'ranks') or rank }
  end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if ctx.blueprint then return end
    if ctx.first_hand_drawn then
      ex.fished = false
      if g('juice_card_until') then juice_card_until(card, function() return not card.ability.extra.fished end, true) end
      return nil
    end
    if ctx.before and ctx.cardarea == G.jokers then
      card.mp_fish = nil
      local fr = G.GAME.current_round.fish_rank
      if ex.fished or not (fr and fr.rank) then return nil end
      local marks = {}
      for _, pc in ipairs(ctx.scoring_hand or {}) do
        if pc.base and pc.base.value == fr.rank and not pc.debuff then marks[pc] = true; ex.fished = true end
      end
      if ex.fished then card.mp_fish = marks end
      return nil
    end
    if ctx.destroying_card then
      if card.mp_fish and card.mp_fish[ctx.destroying_card] then return true end
      return nil
    end
    if ctx.after and ctx.cardarea == G.jokers then
      card.mp_fish = nil
      return nil
    end
    if C.round_end(ctx) then ex.fished = true end
  end,
})

-- ── J-63 Bobby ──────────────────────────────────────────────────────────────

ec({
  key = 'j_mp_bobby_sandbox', rarity = 2, cost = 6, pos = { x = 0, y = 3 },
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  config = { extra = { hands = 2, discards = 4 } },
  loc_vars = function(card) return { card.ability.extra.hands, card.ability.extra.discards } end,
  calc = function(card, ctx)
    if not ctx.setting_blind or (ctx.blueprint_card or card).getting_sliced then return end
    local ex = card.ability.extra
    local by = ctx.blueprint_card or card
    G.E_MANAGER:add_event(Event({ func = function()
      local left = G.GAME.current_round.hands_left or 0
      local h, d
      if left > 2 then h, d = ex.hands, ex.discards
      elseif left == 2 then h, d = ex.hands / 2, ex.discards / 2 end
      if h then
        if g('ease_hands_played') then ease_hands_played(-h, true) else C.ease_hands(-h) end
        if g('ease_discard') then ease_discard(d, true, true) else C.ease_discard(d) end
        C.status(by, '+' .. tostring(d) .. ' ' .. C.loc('k_hud_discards', 'Discards'), G.C.RED)
      end
      return true
    end }))
  end,
})

-- ── J-64 Pyromancer ─────────────────────────────────────────────────────────

ec({
  key = 'j_mp_pyromancer_sandbox', rarity = 1, cost = 5, pos = { x = 1, y = 3 },
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  config = { extra = { mult = 20 } },
  loc_vars = function(card) return { card.ability.extra.mult } end,
  calc = function(card, ctx)
    local cr = G.GAME.current_round
    if C.main(ctx) and (cr.hands_left or 0) <= (cr.discards_left or 0) then
      local m = card.ability.extra.mult
      return { message = mult_msg(m), mult_mod = m, colour = G.C.MULT }
    end
  end,
})

-- ── J-65 Chain Lightning ────────────────────────────────────────────────────

ec({
  key = 'j_mp_chainlightning_sandbox', rarity = 3, cost = 9, pos = { x = 2, y = 3 },
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  config = { extra = { Xmult = 1, Xmult_mod = 0.1, n = 0 } },
  loc_vars = function(card) return { card.ability.extra.Xmult, card.ability.extra.Xmult_mod } end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if ctx.before and ctx.cardarea == G.jokers and not ctx.blueprint then
      ex.n, ex.Xmult = 0, 1
      return nil
    end
    if S.play_individual(ctx) and S.enh_key(ctx.other_card) == 'm_mult' then
      local x
      if ctx.blueprint then
        x = 1 + ex.Xmult_mod * math.max(ex.n - 1, 0)
      else
        ex.n = ex.n + 1
        x = 1 + ex.Xmult_mod * (ex.n - 1)
        ex.Xmult = 1 + ex.Xmult_mod * ex.n -- what the next Mult card gives (tooltip)
      end
      if x > 1 then return { x_mult = x, card = card } end
      return nil
    end
    if ctx.after and ctx.cardarea == G.jokers and not ctx.blueprint then ex.n, ex.Xmult = 0, 1 end
  end,
})

-- ── J-66 Joka Lisa ──────────────────────────────────────────────────────────

ec({
  key = 'j_mp_jokalisa_sandbox', rarity = 3, cost = 8, pos = { x = 3, y = 3 },
  blueprint_compat = true, eternal_compat = true, perishable_compat = false,
  config = { extra = { Xmult = 1, Xmult_mod = 0.1 } },
  loc_vars = function(card) return { card.ability.extra.Xmult, card.ability.extra.Xmult_mod } end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if ctx.before and ctx.cardarea == G.jokers and not ctx.blueprint then
      local seen, n = {}, 0
      for _, pc in ipairs(ctx.scoring_hand or {}) do
        for _, k in ipairs(S.enh_keys(pc)) do
          if not seen[k] then seen[k] = true; n = n + 1 end
        end
      end
      if n > 0 then
        ex.Xmult = ex.Xmult + ex.Xmult_mod * n
        return { message = x_msg(ex.Xmult), colour = G.C.RED }
      end
      return nil
    end
    if C.main(ctx) and ex.Xmult > 1 then
      return { message = x_msg(ex.Xmult), Xmult_mod = ex.Xmult, colour = G.C.MULT }
    end
  end,
})

-- ── J-67 Joker of the Year ──────────────────────────────────────────────────

ec({
  key = 'j_mp_jokeroftheyear_sandbox', rarity = 3, cost = 9, pos = { x = 5, y = 3 },
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  config = { extra = { reps = 1 } },
  calc = function(card, ctx)
    if S.play_repetition(ctx) and ctx.scoring_hand and #ctx.scoring_hand == 5 then
      return again(card, card.ability.extra.reps)
    end
  end,
})

-- ── J-68 Lucky 7 ────────────────────────────────────────────────────────────

function S.clear_gambling(card)
  for pc in pairs(card.mp_lucky7 or {}) do pc.mp_gambling = nil end
  card.mp_lucky7 = nil
end

ec({
  key = 'j_mp_lucky7_sandbox', rarity = 1, cost = 6, pos = { x = 7, y = 3 },
  blueprint_compat = false, eternal_compat = true, perishable_compat = true,
  config = { extra = {} },
  calc = function(card, ctx)
    if ctx.blueprint then return end
    if ctx.before and ctx.cardarea == G.jokers then
      S.clear_gambling(card)
      local seven = false
      for _, pc in ipairs(ctx.scoring_hand or {}) do
        if pc:get_id() == 7 and not pc.debuff then seven = true; break end
      end
      if seven then
        local marked = {}
        for _, pc in ipairs(ctx.scoring_hand) do pc.mp_gambling = true; marked[pc] = true end
        card.mp_lucky7 = marked
      end
      return nil
    end
    if (ctx.after and ctx.cardarea == G.jokers) or C.round_end(ctx) then S.clear_gambling(card) end
  end,
  remove = function(card) S.clear_gambling(card) end,
})

-- ── J-69 Coupon Sheet ───────────────────────────────────────────────────────

ec({
  key = 'j_mp_couponsheet_sandbox', rarity = 3, cost = 7, pos = { x = 8, y = 3 },
  blueprint_compat = false, eternal_compat = true, perishable_compat = true,
  config = { extra = {} },
  calc = function(card, ctx)
    if C.round_end(ctx) and not ctx.blueprint and S.boss_round() then
      C.status(card, C.loc('rmh_mp_k_plus_coupon_tag', '+1 Coupon Tag!'), G.C.FILTER)
      S.add_tag('tag_coupon')
      C.status(card, C.loc('rmh_mp_k_plus_voucher_tag', '+1 Voucher Tag!'), G.C.FILTER)
      S.add_tag('tag_voucher')
    end
  end,
})

-- ── J-70 Hoarder (the ease_dollars hook is in content/sandbox_misc.lua) ─────

S.HOARDER = 'j_mp_hoarder_sandbox'

ec({
  key = S.HOARDER, rarity = 2, cost = 5, pos = { x = 9, y = 3 },
  blueprint_compat = false, eternal_compat = true, perishable_compat = true,
  config = { extra = 1 },
  loc_vars = function(card) return { card.ability.extra } end,
})

-- ── J-71 Alloy (inactive; the "counts as" wraps are in content/sandbox_misc.lua) ─

ec({
  key = 'j_mp_alloy_sandbox', rarity = 2, cost = 7, pos = { x = 4, y = 4 },
  blueprint_compat = false, eternal_compat = true, perishable_compat = true,
  config = { extra = {} },
}, true)

return S
