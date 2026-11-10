-- rmh_mp/content/jokers/sandbox.lua — the sandbox jokers in rotation (J-20…J-31, A2 §2.4) and the
-- shared sandbox helpers (MP.sandbox) the other WS8 modules use.
--
-- Every key is pooled only through the sandbox layer (resolved.reworked carries it; the gate below
-- is the same data), hidden from the main collection (the MP collection shows them under its
-- "Sandbox" tab, D-26) and carries the Balanced sticker. Numbers follow the A2 spec.
--
--   j_mp_misprint_sandbox        +N Mult, N = normal x roll(-23..46) fixed on purchase (HUD-23 anti-peek)
--   j_mp_castle_sandbox          +10 chips per discarded card of the suit locked on purchase
--   j_mp_mail_sandbox            $5 per discarded card of the rank locked on purchase
--   j_mp_square_sandbox          starts +64 chips, +16 per 4-card hand; scores only on 4-card hands
--   j_mp_throwback_sandbox       X(1 + 0.25 x skips + owned), skip +0.75, unskipped round -0.75
--   j_mp_vampire_sandbox         scoring Enhanced cards turn Stone (+X0.2 each); else Stone pays $3
--   j_mp_steel_joker_sandbox     retrigger played Steel cards
--   j_mp_baseball_sandbox        Uncommon jokers each give X2
--   j_mp_hit_the_road_sandbox    +X0.75 per discarded Jack (destroyed); never resets
--   j_mp_golden_ticket_sandbox   scored Gold card: 1 in 2 for $5 (vanilla sheet 5,3)
--   j_mp_idol_sandbox_zealot     scored cards of the round's weighted rank: X1.5 (bans the Collector)
--   j_mp_idol_sandbox_collector  scored copies of the deck's most common card: X(1 + 0.05 x count)
--
-- MP.sandbox (helpers):
--   S.active()                   the sandbox layer is in the session's chain
--   S.has_enh(card, key)         the card counts as enhancement `key` (real, Lucky 7, Alloy)
--   S.enh_key(card)              the real enhancement key or nil;  S.is_stone(card)
--   S.boss_round()               the current blind is the ante's Boss slot (PvP blind included)
--   S.ACTIVE / S.INACTIVE / S.EXTRA_CREDIT / S.ERRORS   registered keys per group
--   S.spawnable(key, show_inactive)   give-card rule (D-28); S.overview_keys(seed) (D-26)

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local C = require 'rmh_mp.content.jokers.core'

local S = MP.sandbox or {}
MP.sandbox = S

S.LAYER = 'sandbox'
S.ACTIVE, S.INACTIVE, S.EXTRA_CREDIT, S.ERRORS = {}, {}, {}, {}
S.IDOLS = { 'j_mp_idol_sandbox_collector', 'j_mp_idol_sandbox_zealot' } -- sorted (keep-one shuffle input)

-- SMODS ordering the mod's sorts use (rank buffer, suit buffer).
S.RANK_ORDER = { '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King', 'Ace' }
S.RANK_ID = { ['2'] = 2, ['3'] = 3, ['4'] = 4, ['5'] = 5, ['6'] = 6, ['7'] = 7, ['8'] = 8, ['9'] = 9,
  ['10'] = 10, Jack = 11, Queen = 12, King = 13, Ace = 14 }
S.SUIT_ORDER = { 'Spades', 'Hearts', 'Clubs', 'Diamonds' }
S.RANK_INDEX, S.SUIT_INDEX = {}, {}
for i, r in ipairs(S.RANK_ORDER) do S.RANK_INDEX[r] = i end
for i, s in ipairs(S.SUIT_ORDER) do S.SUIT_INDEX[s] = i end

local function g(name) return rawget(_G, name) end

function S.active() return MP.layer_active(S.LAYER) end

-- ── Enhancement queries ─────────────────────────────────────────────────────

function S.enh_key(card)
  local center = card and card.config and card.config.center
  if center and center.set == 'Enhanced' then return center.key end
  return nil
end

function S.is_stone(card)
  return S.enh_key(card) == 'm_stone' or (card and card.ability and card.ability.effect == 'Stone Card')
end

--- A non-debuffed Alloy (inactive EC joker) is held: Gold counts as Steel and Steel as Gold.
function S.alloy_held()
  for _, j in ipairs((G.jokers and G.jokers.cards) or {}) do
    local c = j.config and j.config.center
    if c and c.key == 'j_mp_alloy_sandbox' and not j.debuff then return true end
  end
  return false
end

function S.has_enh(card, key)
  if not card then return false end
  local real = S.enh_key(card)
  if real == key then return true end
  if key == 'm_lucky' and card.mp_gambling then return true end
  if (key == 'm_steel' and real == 'm_gold') or (key == 'm_gold' and real == 'm_steel') then
    return S.alloy_held()
  end
  return false
end

--- The unique enhancement keys a card counts as (real + virtual), sorted.
function S.enh_keys(card)
  local out, seen = {}, {}
  local function add(k) if k and not seen[k] then seen[k] = true; out[#out + 1] = k end end
  add(S.enh_key(card))
  if card and card.mp_gambling then add('m_lucky') end
  local real = S.enh_key(card)
  if (real == 'm_gold' or real == 'm_steel') and S.alloy_held() then add(real == 'm_gold' and 'm_steel' or 'm_gold') end
  table.sort(out)
  return out
end

function S.boss_round()
  local b = G.GAME and G.GAME.blind
  if not b then return false end
  if b.get_type then
    local ok, t = pcall(b.get_type, b)
    if ok then return t == 'Boss' end
  end
  return b.boss == true
end

function S.play_individual(ctx) return ctx.individual and ctx.cardarea == G.play and ctx.other_card ~= nil end
function S.play_repetition(ctx) return ctx.repetition and ctx.cardarea == G.play and ctx.other_card ~= nil end

function S.straight(ctx)
  local ph = ctx.poker_hands
  return ph ~= nil and ph['Straight'] ~= nil and next(ph['Straight']) ~= nil
end

function S.money_msg(n) return C.loc('$', '$') .. tostring(n) end

--- Vanilla dollar_buffer timing for a per-card payout (Golden Ticket / Rough Gem pattern).
function S.buffered_dollars(n)
  G.GAME.dollar_buffer = (G.GAME.dollar_buffer or 0) + n
  G.E_MANAGER:add_event(Event({ func = function() G.GAME.dollar_buffer = 0; return true end }))
end

--- Dissolve the first shop card with `key` (idol mutual bans).
function S.dissolve_in_shop(key)
  local area = G.shop_jokers
  for i = #((area and area.cards) or {}), 1, -1 do
    local c = area.cards[i]
    if c.config and c.config.center and c.config.center.key == key then
      if c.T then c.T.r = -0.2 end
      if c.juice_up then c:juice_up(0.3, 0.4) end
      if c.start_dissolve then c:start_dissolve() elseif area.remove_card then area:remove_card(c) end
      return c
    end
  end
  return nil
end

--- Vanilla card-height tweaks keyed on the name (Square/Photograph): MP names are keys, so redo
--- them for our centers once per card.
function S.resize(card, factor)
  if not card.T or card.mp_resized then return end
  card.mp_resized = true
  card.T.h = (factor == 'square') and card.T.w or card.T.h * factor
end

-- ── Definition helper ───────────────────────────────────────────────────────

-- Vanilla contexts whose return value the game ignores (vanilla jokers show their own text there).
S.SILENT_CONTEXTS = { 'using_consumeable', 'ending_shop', 'skip_blind', 'setting_blind', 'selling_card',
  'selling_self', 'first_hand_drawn', 'buying_card', 'open_booster', 'reroll_shop', 'skipping_booster',
  'playing_card_added', 'remove_playing_cards' }

function S.silent_context(ctx)
  for _, k in ipairs(S.SILENT_CONTEXTS) do if ctx[k] then return true end end
  return false
end

--- Wrap a calc so a message returned in a silent context is still shown (on the copier for a
--- Blueprint/Brainstorm copy).
function S.with_status(calc)
  return function(card, ctx)
    local r = calc(card, ctx)
    if type(r) == 'table' and r.message and S.silent_context(ctx) then
      C.status(ctx.blueprint_card or card, r.message, r.colour)
    end
    return r
  end
end

--- Define a sandbox joker. `group`: 'active' | 'inactive' | 'extra_credit' | 'extra_credit_inactive'.
function S.define(def, group)
  if def.calc then def.calc = S.with_status(def.calc) end
  def.kind = 'Joker'
  def.no_collection = true
  if group == 'active' or group == 'extra_credit' then
    def.gate = { layers = { S.LAYER } }
  else
    def.pool = false -- D-28: registered, never pooled
  end
  if group == 'extra_credit' or group == 'extra_credit_inactive' then
    def.extra_credit = true
    def.atlas = def.atlas or 'mp_ec_jokers_sandbox'
  else
    if def.balanced == nil then def.balanced = true end
  end
  if group == 'active' then S.ACTIVE[#S.ACTIVE + 1] = def.key
  elseif group == 'extra_credit' then S.EXTRA_CREDIT[#S.EXTRA_CREDIT + 1] = def.key
  else S.INACTIVE[#S.INACTIVE + 1] = def.key end
  def.sandbox_group = group
  return R.define(def)
end

--- D-28: what give-card may spawn. Active and Extra Credit keys always; inactive ones only in
--- Practice with the "Show inactive sandbox cards" toggle on; error decoys never.
function S.spawnable(key, show_inactive)
  local def = R.get(key)
  if not def or not def.sandbox_group then return R.is_mp(key) end
  local grp = def.sandbox_group
  if grp == 'error' then return false end
  if grp == 'inactive' or grp == 'extra_credit_inactive' then
    return show_inactive == true and MP.is_practice()
  end
  return true
end

--- D-26: the Sandbox collection tab, as the mod's overview: the active Extra Credit jokers, the
--- 14 error decoys and Hanging Chad shuffled, then both idols in the middle. UI-only order: a
--- private LCG (never the game RNG), seeded per boot unless `seed` is given.
function S.overview_keys(seed)
  local list = {}
  for _, k in ipairs(S.EXTRA_CREDIT) do list[#list + 1] = k end
  for i = 1, 14 do list[#list + 1] = 'j_mp_error_sandbox_' .. i end
  list[#list + 1] = 'j_mp_hanging_chad'
  local state = math.floor(tonumber(seed) or S._overview_seed or os.time()) % 2147483647
  if state <= 0 then state = 12345 end
  S._overview_seed = S._overview_seed or state
  local function rand(n)
    state = (state * 16807) % 2147483647
    return (state % n) + 1
  end
  for i = #list, 2, -1 do
    local j = rand(i)
    list[i], list[j] = list[j], list[i]
  end
  local middle = math.floor(#list / 2) + 1
  table.insert(list, middle, 'j_mp_idol_sandbox_zealot')
  table.insert(list, middle + 1, 'j_mp_idol_sandbox_collector')
  return list
end

local x_msg, mult_msg, chips_msg = C.x_msg, C.mult_msg, C.chips_msg
local function upgrade_msg(colour) return { message = C.loc('k_upgrade_ex', 'Upgrade!'), colour = colour } end

-- ── J-20 Misprint ───────────────────────────────────────────────────────────

S.define({
  key = 'j_mp_misprint_sandbox', rarity = 1, cost = 4, pos = { x = 0, y = 0 }, atlas = 'mp_j_misprint_sandbox',
  blueprint_compat = true, eternal_compat = true, perishable_compat = true, silent_replaces = 'j_misprint',
  config = { extra = { min = -23, max = 46 } },
  loc_vars = function(card)
    local ex = card.ability.extra
    local colour = ex.green and G.C.GREEN or G.C.MULT
    local shown = ex.mult
    if shown == nil or C.anti_peek(card) then shown = C.ANTI_PEEK_TEXT end
    return { shown, colours = { colour } }
  end,
  add = function(card)
    local ex = card.ability.extra
    if ex.mult ~= nil then return end -- fixed for life (also through debuff toggles)
    local numerator = C.normal()
    ex.mult = numerator * pseudorandom('misprint_sandbox', ex.min, ex.max)
    ex.green = numerator > 1 or nil
  end,
  calc = function(card, ctx)
    local m = card.ability.extra.mult
    if C.main(ctx) and m and m ~= 0 then
      return { message = mult_msg(m), mult_mod = m, colour = G.C.MULT }
    end
  end,
}, 'active')

-- ── J-21 Castle ─────────────────────────────────────────────────────────────

S.define({
  key = 'j_mp_castle_sandbox', rarity = 2, cost = 6, pos = { x = 0, y = 0 }, atlas = 'mp_j_castle_sandbox',
  blueprint_compat = true, eternal_compat = true, perishable_compat = false, silent_replaces = 'j_castle',
  config = { extra = { chips = 0, chip_mod = 10 } },
  loc_vars = function(card)
    local ex = card.ability.extra
    local cc = G.GAME and G.GAME.current_round and G.GAME.current_round.castle_card
    local suit = ex.suit or (cc and cc.suit) or 'Spades'
    local name = string.upper(g('localize') and localize(suit, 'suits_plural') or suit)
    return { name, ex.chips, ex.chip_mod, colours = { G.C.SUITS and G.C.SUITS[suit] } }
  end,
  add = function(card)
    local ex = card.ability.extra
    if ex.suit == nil then
      local cc = G.GAME.current_round.castle_card
      ex.suit = (cc and cc.suit) or 'Spades'
    end
  end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if ctx.discard and not ctx.blueprint and ctx.other_card and not ctx.other_card.debuff
      and ex.suit and ctx.other_card:is_suit(ex.suit) then
      ex.chips = ex.chips + ex.chip_mod
      return upgrade_msg(G.C.CHIPS)
    end
    if C.main(ctx) and ex.chips > 0 then
      return { message = chips_msg(ex.chips), chip_mod = ex.chips, colour = G.C.CHIPS }
    end
  end,
}, 'active')

-- ── J-22 Mail-in Rebate ─────────────────────────────────────────────────────

S.define({
  key = 'j_mp_mail_sandbox', rarity = 1, cost = 4, pos = { x = 0, y = 0 }, atlas = 'mp_j_mail_sandbox',
  blueprint_compat = true, eternal_compat = true, perishable_compat = true, silent_replaces = 'j_mail',
  config = { extra = { dollars = 5 } },
  loc_vars = function(card)
    local ex = card.ability.extra
    local mc = G.GAME and G.GAME.current_round and G.GAME.current_round.mail_card
    local rank = ex.rank or (mc and mc.rank) or 'Ace'
    return { ex.dollars, g('localize') and localize(rank, 'ranks') or rank }
  end,
  add = function(card)
    local ex = card.ability.extra
    if ex.rank == nil then
      local mc = G.GAME.current_round.mail_card or {}
      ex.rank = mc.rank or 'Ace'
      ex.card_id = mc.id or S.RANK_ID[ex.rank] or 14
    end
  end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if ctx.discard and ctx.other_card and not ctx.other_card.debuff and ex.card_id
      and ctx.other_card:get_id() == ex.card_id then
      C.ease_dollars(ex.dollars)
      return { message = S.money_msg(ex.dollars), colour = G.C.MONEY }
    end
  end,
}, 'active')

-- ── J-23 Square Joker ───────────────────────────────────────────────────────

S.define({
  key = 'j_mp_square_sandbox', rarity = 1, cost = 4, pos = { x = 0, y = 0 }, atlas = 'mp_j_square_sandbox',
  blueprint_compat = true, eternal_compat = true, perishable_compat = false, silent_replaces = 'j_square',
  config = { extra = { chips = 64, chip_mod = 16 } },
  set_ability = function(card) S.resize(card, 'square') end,
  loc_vars = function(card) return { card.ability.extra.chips, card.ability.extra.chip_mod } end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    local four = ctx.full_hand ~= nil and #ctx.full_hand == 4
    if ctx.before and ctx.cardarea == G.jokers and not ctx.blueprint and four then
      ex.chips = ex.chips + ex.chip_mod
      return upgrade_msg(G.C.CHIPS)
    end
    if C.main(ctx) and four and ex.chips > 0 then
      return { message = chips_msg(ex.chips), chip_mod = ex.chips, colour = G.C.CHIPS }
    end
  end,
}, 'active')

-- ── J-24 Throwback ──────────────────────────────────────────────────────────

function S.throwback_x(card)
  local ex = card.ability.extra
  return 1 + (G.GAME.skips or 0) * ex.base_mult + ex.owned_skip_mult
end

S.define({
  key = 'j_mp_throwback_sandbox', rarity = 2, cost = 6, pos = { x = 0, y = 0 }, atlas = 'mp_j_throwback_sandbox',
  blueprint_compat = true, eternal_compat = true, perishable_compat = true, silent_replaces = 'j_throwback',
  config = { extra = { base_mult = 0.25, skip_bonus = 0.75, round_penalty = 0.75, owned_skip_mult = 0,
    skipped_this_round = false } },
  loc_vars = function(card)
    local ex = card.ability.extra
    return { S.throwback_x(card), ex.base_mult, ex.skip_bonus, ex.round_penalty }
  end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if ctx.skip_blind and not ctx.blueprint then
      ex.skipped_this_round = true
      ex.owned_skip_mult = ex.owned_skip_mult + ex.skip_bonus
      return { message = x_msg(S.throwback_x(card)) }
    end
    if C.round_end(ctx) and ctx.game_over == false and not ctx.blueprint then
      if ex.skipped_this_round then
        ex.skipped_this_round = false
        return nil
      end
      local before = ex.owned_skip_mult
      ex.owned_skip_mult = math.max(0, ex.owned_skip_mult - ex.round_penalty)
      if before > ex.owned_skip_mult then
        return { message = C.loc_var('a_xmult_minus', { ex.round_penalty }, '-X' .. ex.round_penalty), colour = G.C.RED }
      end
      return nil
    end
    if C.main(ctx) then
      local x = S.throwback_x(card)
      if x ~= 1 then return { message = x_msg(x), Xmult_mod = x, colour = G.C.MULT } end
    end
  end,
}, 'active')

-- ── J-25 Vampire ────────────────────────────────────────────────────────────

S.define({
  key = 'j_mp_vampire_sandbox', rarity = 2, cost = 7, pos = { x = 0, y = 0 }, atlas = 'mp_j_vampire_sandbox',
  blueprint_compat = true, eternal_compat = true, perishable_compat = false, silent_replaces = 'j_vampire',
  config = { extra = { Xmult_gain = 0.2, Xmult = 1, stone_money = 3 } },
  loc_vars = function(card)
    local ex = card.ability.extra
    return { ex.Xmult_gain, ex.Xmult, ex.stone_money }
  end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if ctx.before and ctx.cardarea == G.jokers and not ctx.blueprint then
      local converted, stones = 0, 0
      for _, sc in ipairs(ctx.scoring_hand or {}) do
        if not sc.debuff and not sc.mp_vampired and S.enh_key(sc) and not S.is_stone(sc) then
          converted = converted + 1
          sc.mp_vampired = true
          sc:set_ability(G.P_CENTERS.m_stone, nil, true)
          G.E_MANAGER:add_event(Event({ func = function()
            if sc.juice_up then sc:juice_up() end
            sc.mp_vampired = nil
            return true
          end }))
        elseif not sc.debuff and S.is_stone(sc) then
          stones = stones + 1
        end
      end
      if converted > 0 then
        ex.Xmult = ex.Xmult + ex.Xmult_gain * converted
        return { message = x_msg(ex.Xmult), colour = G.C.MULT }
      end
      if stones > 0 then
        local n = ex.stone_money * stones
        C.ease_dollars(n)
        return { message = S.money_msg(n), colour = G.C.MONEY }
      end
      return nil
    end
    if C.main(ctx) and ex.Xmult > 1 then
      return { message = x_msg(ex.Xmult), Xmult_mod = ex.Xmult, colour = G.C.MULT }
    end
  end,
}, 'active')

-- ── J-26 Steel Joker ────────────────────────────────────────────────────────

S.define({
  key = 'j_mp_steel_joker_sandbox', rarity = 2, cost = 7, pos = { x = 0, y = 0 }, atlas = 'mp_j_steel_joker_sandbox',
  blueprint_compat = true, eternal_compat = true, perishable_compat = true, silent_replaces = 'j_steel_joker',
  enhancement_gate = 'm_steel',
  config = { extra = { repetitions = 1 } },
  calc = function(card, ctx)
    if S.play_repetition(ctx) and S.has_enh(ctx.other_card, 'm_steel') then
      return { message = C.loc('k_again_ex', 'Again!'), repetitions = card.ability.extra.repetitions, card = card }
    end
  end,
}, 'active')

-- ── J-27 Baseball Card ──────────────────────────────────────────────────────

S.define({
  key = 'j_mp_baseball_sandbox', rarity = 3, cost = 8, pos = { x = 0, y = 0 }, atlas = 'mp_j_baseball_sandbox',
  blueprint_compat = true, eternal_compat = true, perishable_compat = true, silent_replaces = 'j_baseball',
  config = { extra = { xmult = 2 } },
  loc_vars = function(card) return { card.ability.extra.xmult } end,
  calc = function(card, ctx)
    local oj = ctx.other_joker
    if oj and oj ~= card and oj.config and oj.config.center and oj.config.center.rarity == 2 then
      if oj.juice_up then G.E_MANAGER:add_event(Event({ func = function() oj:juice_up(0.5, 0.5); return true end })) end
      local x = card.ability.extra.xmult
      return { message = x_msg(x), Xmult_mod = x, colour = G.C.MULT }
    end
  end,
}, 'active')

-- ── J-28 Hit the Road ───────────────────────────────────────────────────────

S.define({
  key = 'j_mp_hit_the_road_sandbox', rarity = 3, cost = 8, pos = { x = 0, y = 0 }, atlas = 'mp_j_hit_the_road_sandbox',
  blueprint_compat = true, eternal_compat = true, perishable_compat = true, silent_replaces = 'j_hit_the_road',
  config = { extra = { xmult_gain = 0.75, xmult = 1 } },
  loc_vars = function(card) return { card.ability.extra.xmult_gain, card.ability.extra.xmult } end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if ctx.discard and not ctx.blueprint and ctx.other_card and not ctx.other_card.debuff
      and ctx.other_card:get_id() == 11 then
      ex.xmult = ex.xmult + ex.xmult_gain
      return { message = x_msg(ex.xmult), colour = G.C.RED, remove = true }
    end
    if C.main(ctx) and ex.xmult > 1 then
      return { message = x_msg(ex.xmult), Xmult_mod = ex.xmult, colour = G.C.MULT }
    end
  end,
}, 'active')

-- ── J-29 Golden Ticket (sandbox) ────────────────────────────────────────────

S.define({
  key = 'j_mp_golden_ticket_sandbox', rarity = 2, cost = 5, pos = { x = 5, y = 3 },
  blueprint_compat = true, eternal_compat = true, perishable_compat = true, silent_replaces = 'j_ticket',
  enhancement_gate = 'm_gold',
  config = { extra = { dollars = 5, odds = 2 } },
  loc_vars = function(card)
    local ex = card.ability.extra
    return { ex.dollars, C.normal(), ex.odds }
  end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if S.play_individual(ctx) and S.has_enh(ctx.other_card, 'm_gold')
      and C.chance('j_mp_golden_ticket_sandbox', ex.odds) then
      S.buffered_dollars(ex.dollars)
      return { dollars = ex.dollars, card = card }
    end
  end,
}, 'active')

-- ── J-30 Zealot Idol ────────────────────────────────────────────────────────

S.define({
  key = 'j_mp_idol_sandbox_zealot', rarity = 2, cost = 6, pos = { x = 0, y = 0 }, atlas = 'mp_j_idol_sandbox_bw',
  blueprint_compat = true, eternal_compat = true, perishable_compat = true, silent_replaces = 'j_idol',
  config = { extra = { xmult = 1.5 } },
  loc_vars = function(card)
    local z = (G.GAME and G.GAME.current_round and G.GAME.current_round.zealot_idol) or { rank = 'Ace' }
    return { g('localize') and localize(z.rank, 'ranks') or z.rank, card.ability.extra.xmult }
  end,
  add = function()
    G.GAME.banned_keys['j_mp_idol_sandbox_collector'] = true
    S.dissolve_in_shop('j_mp_idol_sandbox_collector')
  end,
  calc = function(card, ctx)
    local z = G.GAME.current_round.zealot_idol
    if z and S.play_individual(ctx) and ctx.other_card:get_id() == z.id then
      return { x_mult = card.ability.extra.xmult, card = card }
    end
  end,
}, 'active')

-- ── J-31 Collector's Idol ───────────────────────────────────────────────────

--- The deck's most common non-Stone card: count desc, then suit order, then rank order.
function S.most_common_card()
  local fallback = { id = 14, rank = 'Ace', suit = 'Spades', count = 0 }
  if not G.playing_cards then fallback.count = 1; return fallback end
  local by, list = {}, {}
  for _, v in ipairs(G.playing_cards) do
    if not S.is_stone(v) and v.base and v.base.value and v.base.suit then
      local k = v.base.value .. '_' .. v.base.suit
      local e = by[k]
      if not e then
        e = { count = 0, rank = v.base.value, suit = v.base.suit, id = v.base.id }
        by[k] = e
        list[#list + 1] = e
      end
      e.count = e.count + 1
    end
  end
  if #list == 0 then return fallback end
  table.sort(list, function(a, b)
    if a.count ~= b.count then return a.count > b.count end
    local sa, sb = S.SUIT_INDEX[a.suit] or 99, S.SUIT_INDEX[b.suit] or 99
    if sa ~= sb then return sa < sb end
    local ra, rb = S.RANK_INDEX[a.rank] or 99, S.RANK_INDEX[b.rank] or 99
    if ra ~= rb then return ra < rb end
    return a.rank .. a.suit < b.rank .. b.suit
  end)
  return list[1]
end

S.define({
  key = 'j_mp_idol_sandbox_collector', rarity = 2, cost = 6, pos = { x = 0, y = 0 }, atlas = 'mp_j_idol_sandbox_color',
  blueprint_compat = true, eternal_compat = true, perishable_compat = true, silent_replaces = 'j_idol',
  config = { extra = { xmult = 1.0, xmult_per_card = 0.05 } },
  loc_vars = function(card)
    local ex = card.ability.extra
    local mc = S.most_common_card()
    local loc = g('localize')
    return { loc and localize(mc.rank, 'ranks') or mc.rank, loc and localize(mc.suit, 'suits_plural') or mc.suit,
      ex.xmult + ex.xmult_per_card * mc.count, ex.xmult_per_card, colours = { G.C.SUITS and G.C.SUITS[mc.suit] } }
  end,
  add = function()
    G.GAME.banned_keys['j_mp_idol_sandbox_zealot'] = true
    S.dissolve_in_shop('j_mp_idol_sandbox_zealot')
  end,
  calc = function(card, ctx)
    if not S.play_individual(ctx) then return end
    local mc = S.most_common_card()
    local oc = ctx.other_card
    if mc.count > 0 and oc:get_id() == mc.id and oc:is_suit(mc.suit) then
      local ex = card.ability.extra
      local x = ex.xmult + ex.xmult_per_card * mc.count
      if x ~= 1 then return { x_mult = x, card = card } end
    end
  end,
}, 'active')

return S
