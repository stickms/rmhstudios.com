-- rmh_mp/content/release.lua — the Release ruleset's layer (EX-14 lifted; RS-17, layer `release`).
--
-- The mod's rulesets/release.lua (entirely commented out there) "reverts gameplay-related changes
-- in the game to the 1.0.0 release version" with 65 ReworkCenter calls. Each is a Rework def here,
-- gated on the `release` layer, written from what the mod's entries and their text say (no code of
-- the mod is used). Every def is defined in the order the mod lists them; this module is appended
-- to the content order (init.lua), so no earlier key changes its registry order.
--
-- What a def changes, by kind:
--   Jokers      property swaps (config, cost, rarity — a rarity move changes rarity pools —,
--               eternal_compat), the Balanced sticker, and for nine of them 1.0.0 behaviour:
--               8 Ball (a Planet when the hand holds 2+ 8s), To Do List ($5, the hand changes only
--               when it pays), Madness (every Blind, Boss included), Vampire and Midas Mask (every
--               played card, not only scoring ones), Swashbuckler (only Jokers to its left), Flower
--               Pot (debuffed cards do not count), Yorick (X5 once 23 discards were used), Square
--               Joker (its 1.0.0 art, card-shaped). Text from the mod's `*_release` entries.
--   The Magician  one card to Lucky.
--   Tags        Uncommon/Rare/Foil/Holographic/Polychrome/Negative: the shop Joker is not free;
--               Investment pays $15.
--   Blue Seal   a random Planet (not the last hand's), every time there is room.
--   Poker hands Straight +2 Mult per level, Straight Flush and Flush House +3, Flush Five +40
--               Chips (virtual reworks; the layer hook sets G.GAME.hands). Their Planets show the
--               Balanced sticker.
--   Stakes      Green and Purple use 1.0.0's blind sizes; Orange makes Booster Packs cost $1 more
--               per Ante (vanilla's booster_ante_scaling) instead of Perishables; Gold is -1 hand
--               size instead of Rentals (unless an MP stake asked for those).
--   The Arm     lowers the played hand's level down to 0 (1.0.1 stops at 1).
-- Art: Mad Joker, Clever Joker, 8 Ball and Square Joker draw from `mp_release_jokers`
-- (release_jokers.png, the whole 1.0.0 Joker sheet: at 1x only Square Joker's cell differs from
-- today's, at 2x every cell is 1.0.0's), which ships in the optional `release` pack, not the MP
-- pack; until it is mounted the atlas is an alias of the vanilla Joker sheet (same layout), so the
-- cards keep today's art.

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local D = require 'rmh_mp.registry.dispatch'
local A = require 'rmh_mp.registry.atlas'
local C = require 'rmh_mp.content.jokers.core'
local O = require 'rmh_mp.rules.order'

local REL = {}
MP.content.release = REL

REL.LAYER = 'release'
REL.ATLAS = 'mp_release_jokers'
REL.SKIP = D.SKIP

local gate = { layers = { REL.LAYER } }

--- The def key for a reworked center ('Straight Flush' -> rw_mp_release_straight_flush).
function REL.key_for(center)
  return 'rw_mp_release_' .. center:lower():gsub('[^%w]', '_')
end

REL.DEFS = {}

local function rework(center, opts)
  opts = opts or {}
  local def = {
    key = REL.key_for(center), kind = 'Rework', gate = gate,
    balanced = opts.balanced ~= false and (opts.table == nil) and not opts.virtual,
    rework = { center = center, table = opts.table, props = opts.props or {}, loc = opts.loc, virtual = opts.virtual },
    calc = opts.calc, update = opts.update, loc_vars = opts.loc_vars, set_ability = opts.set_ability,
    tag = opts.tag, blind = opts.blind, release = opts.release,
  }
  REL.DEFS[#REL.DEFS + 1] = R.define(def)
  return def
end

local function joker_loc(key) return { set = 'Joker', key = key } end

function REL.active() return MP.layer_active(REL.LAYER) end

function REL.art_loaded() return A.loaded[REL.ATLAS] == 'image' end

-- ── Jokers ──────────────────────────────────────────────────────────────────

for _, s in ipairs({ { 'j_greedy_joker', 'Diamonds' }, { 'j_lusty_joker', 'Hearts' },
  { 'j_wrathful_joker', 'Spades' }, { 'j_gluttenous_joker', 'Clubs' } }) do
  rework(s[1], { props = { config = { extra = { s_mult = 4, suit = s[2] } } } })
end

rework('j_mad', { props = { config = { t_mult = 20, type = 'Four of a Kind' }, atlas = REL.ATLAS } })
rework('j_clever', { props = { config = { t_chips = 150, type = 'Four of a Kind' }, atlas = REL.ATLAS } })
rework('j_banner', { props = { config = { extra = 40 } } })

-- 8 Ball: a Planet (not a Tarot) once per hand, when the played hand holds `extra` or more 8s.
rework('j_8_ball', {
  props = { config = { extra = 2 }, atlas = REL.ATLAS },
  loc = joker_loc('j_mp_8ball_release'),
  loc_vars = function(card) return { card.ability.extra } end,
  calc = function(card, ctx)
    if ctx.individual then return REL.SKIP end
    if not C.main(ctx) then return nil end
    if not C.room_for_consumable() then return REL.SKIP end
    local eights = 0
    for _, c in ipairs(ctx.full_hand or {}) do
      if c.get_id and c:get_id() == 8 then eights = eights + 1 end
    end
    if eights < card.ability.extra then return REL.SKIP end
    G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1
    G.E_MANAGER:add_event(Event({ trigger = 'before', delay = 0.0, func = function()
      local planet = create_card('Planet', G.consumeables, nil, nil, nil, nil, nil, '8ba')
      planet:add_to_deck()
      G.consumeables:emplace(planet)
      G.GAME.consumeable_buffer = 0
      return true
    end }))
    return { message = C.loc('k_plus_planet', '+1 Planet'), colour = G.C.SECONDARY_SET.Planet, card = card }
  end,
})

rework('j_fibonacci', { props = { cost = 7 } })
rework('j_steel_joker', { props = { config = { extra = 0.25 } } })
rework('j_gros_michel', { props = { config = { extra = { odds = 4, mult = 15 } } } })
rework('j_odd_todd', { props = { config = { extra = 30 } } })
rework('j_runner', { props = { config = { extra = { chips = 20, chip_mod = 10 } } } })
rework('j_sixth_sense', { props = { rarity = 3 } })
rework('j_hiker', { props = { config = { extra = 4 } } })

-- To Do List: $5; its hand changes only when it pays (never at round end).
local function other_visible_hand(current)
  local hands = {}
  for name, h in pairs(G.GAME.hands) do
    if h.visible and name ~= current then hands[#hands + 1] = name end
  end
  if #hands == 0 then return current end
  -- pairs() order must never matter: sorted before the seeded pick (OR-03 sorts hand lists too).
  table.sort(hands, function(a, b) return (G.GAME.hands[a].order or 0) < (G.GAME.hands[b].order or 0) end)
  return pseudorandom_element(hands, pseudoseed('to_do'))
end
REL.other_visible_hand = other_visible_hand

rework('j_todo_list', {
  props = { config = { extra = { dollars = 5, poker_hand = 'High Card' } } },
  loc = joker_loc('j_mp_todo_list_release'),
  calc = function(card, ctx)
    if ctx.end_of_round then return REL.SKIP end
    if not ctx.before then return nil end
    if ctx.scoring_name ~= card.ability.to_do_poker_hand then return REL.SKIP end
    local n = card.ability.extra.dollars
    if not ctx.blueprint then card.ability.to_do_poker_hand = other_visible_hand(card.ability.to_do_poker_hand) end
    C.pay(n)
    return { message = localize('$') .. n, dollars = n, colour = G.C.MONEY }
  end,
})

-- Madness: every Blind, the Boss Blind included.
rework('j_madness', {
  loc = joker_loc('j_mp_madness_release'),
  calc = function(card, ctx)
    if not ctx.setting_blind then return nil end
    if ctx.blueprint then return REL.SKIP end
    card.ability.x_mult = card.ability.x_mult + card.ability.extra
    local pool = {}
    for _, j in ipairs(G.jokers.cards) do
      if j ~= card and not j.ability.eternal and not j.getting_sliced then pool[#pool + 1] = j end
    end
    local victim = #pool > 0 and pseudorandom_element(pool, pseudoseed('madness')) or nil
    if victim and not card.getting_sliced then
      victim.getting_sliced = true
      G.E_MANAGER:add_event(Event({ func = function()
        card:juice_up(0.8, 0.8)
        victim:start_dissolve({ G.C.RED }, nil, 1.6)
        return true
      end }))
    end
    if not card.getting_sliced then C.status(card, C.x_msg(card.ability.x_mult)) end
    return REL.SKIP
  end,
})

-- Square Joker: its 1.0.0 art is a normal card, so the vanilla square shape is not applied while
-- that art is loaded (REL.install renames the center around set_ability / load).
rework('j_square', {
  props = { config = { extra = { chips = 16, chip_mod = 4 } }, cost = 5, atlas = REL.ATLAS },
})

rework('j_seance', { props = { rarity = 3, cost = 7 } })
rework('j_riff_raff', { props = { cost = 4 } })

local function strip_enhancements(cards, pick)
  local out = {}
  for _, c in ipairs(cards or {}) do if pick(c) then out[#out + 1] = c end end
  return out
end

-- Vampire: every played card (not only scoring ones) loses its Enhancement.
rework('j_vampire', {
  props = { config = { extra = 0.2, Xmult = 1 } },
  loc = joker_loc('j_mp_vampire_release'),
  calc = function(card, ctx)
    if not ctx.before then return nil end
    if ctx.blueprint then return REL.SKIP end
    local hit = strip_enhancements(ctx.full_hand, function(c)
      return c.config.center ~= G.P_CENTERS.c_base and not c.debuff and not c.vampired
    end)
    for _, c in ipairs(hit) do
      c.vampired = true
      c:set_ability(G.P_CENTERS.c_base, nil, true)
      G.E_MANAGER:add_event(Event({ func = function() c:juice_up(); c.vampired = nil; return true end }))
    end
    if #hit == 0 then return REL.SKIP end
    card.ability.x_mult = card.ability.x_mult + card.ability.extra * #hit
    return { message = C.x_msg(card.ability.x_mult), colour = G.C.MULT, card = card }
  end,
})

rework('j_vagabond', { props = { rarity = 2, config = { extra = 3 }, cost = 6 } })
rework('j_cloud_9', { props = { cost = 6 } })

-- Midas Mask: every played face card becomes Gold.
rework('j_midas_mask', {
  props = { cost = 6 },
  loc = joker_loc('j_mp_midas_mask_release'),
  calc = function(card, ctx)
    if not ctx.before then return nil end
    if ctx.blueprint then return REL.SKIP end
    local faces = strip_enhancements(ctx.full_hand, function(c) return c:is_face() end)
    for _, c in ipairs(faces) do
      c:set_ability(G.P_CENTERS.m_gold, nil, true)
      G.E_MANAGER:add_event(Event({ func = function() c:juice_up(); return true end }))
    end
    if #faces == 0 then return REL.SKIP end
    return { message = C.loc('k_gold', 'Gold'), colour = G.C.MONEY, card = card }
  end,
})

rework('j_luchador', { props = { eternal_compat = true } })
rework('j_reserved_parking', { props = { rarity = 2 } })
rework('j_mail', { props = { config = { extra = 3 } } })
rework('j_lucky_cat', { props = { config = { Xmult = 1, extra = 0.2 } } })
rework('j_trading', { props = { cost = 5 } })
rework('j_smiley', { props = { config = { extra = 4 } } })
rework('j_campfire', { props = { config = { extra = 0.5 } } })
rework('j_ticket', { props = { config = { extra = 3 } } })

-- Swashbuckler: the sell value of the Jokers to its LEFT (vanilla: every other Joker).
function REL.swashbuckler_mult(card)
  local area = card.area
  if not (G.jokers and area == G.jokers) then return 0 end
  local total = 0
  for _, j in ipairs(G.jokers.cards) do
    if j == card then break end
    total = total + (j.sell_cost or 0)
  end
  return total
end

rework('j_swashbuckler', {
  props = { config = { mult = 1 } },
  loc = joker_loc('j_mp_swashbuckler_release'),
  update = function(card)
    if G.STAGE == G.STAGES.RUN and card.ability then card.ability.mult = REL.swashbuckler_mult(card) end
  end,
})

rework('j_hanging_chad', { props = { config = { extra = 1 } }, loc = joker_loc('j_mp_hanging_chad_release') })
rework('j_bloodstone', { props = { config = { extra = { odds = 3, Xmult = 2 } } } })
rework('j_onyx_agate', { props = { config = { extra = 8 } } })
rework('j_glass', { props = { config = { extra = 0.5, Xmult = 1 } } })

-- Flower Pot: a debuffed card's suit does not count (no debuff bypass), Wild Cards last.
function REL.flower_pot_suits(scoring)
  local seen = { Hearts = false, Diamonds = false, Spades = false, Clubs = false }
  local order = { 'Hearts', 'Diamonds', 'Spades', 'Clubs' }
  local function take(c)
    for _, s in ipairs(order) do
      if not seen[s] and c:is_suit(s) then seen[s] = true; return end
    end
  end
  for _, c in ipairs(scoring) do if c.ability.name ~= 'Wild Card' then take(c) end end
  for _, c in ipairs(scoring) do if c.ability.name == 'Wild Card' then take(c) end end
  return seen.Hearts and seen.Diamonds and seen.Spades and seen.Clubs
end

rework('j_flower_pot', {
  loc = joker_loc('j_mp_flower_pot_release'),
  calc = function(card, ctx)
    if not C.main(ctx) then return nil end
    if not REL.flower_pot_suits(ctx.scoring_hand or {}) then return REL.SKIP end
    return { message = C.x_msg(card.ability.extra), Xmult_mod = card.ability.extra }
  end,
})

rework('j_wee', { props = { config = { extra = { chips = 10, chip_mod = 8 } } } })
rework('j_stuntman', { props = { rarity = 2, config = { extra = { h_size = 2, chip_mod = 300 } }, cost = 6 } })
rework('j_invisible', { props = { config = { extra = 3 }, cost = 10 } })
rework('j_burnt', { props = { rarity = 2, cost = 6 } })

-- Yorick: X5 Mult once 23 discards (actions, not cards) have been used.
rework('j_yorick', {
  props = { config = { extra = { xmult = 5, discards = 23 } } },
  loc = joker_loc('j_mp_yorick_release'),
  calc = function(card, ctx)
    if ctx.discard then
      -- Vanilla fires `discard` once per discarded card: count the action on its first card.
      if not ctx.blueprint and ctx.full_hand and ctx.other_card == ctx.full_hand[1]
        and (card.ability.yorick_discards or 0) > 0 then
        card.ability.yorick_discards = card.ability.yorick_discards - 1
        local left = card.ability.yorick_discards
        local msg = left == 0 and C.loc('k_active_ex', 'Active!')
          or C.loc_var('a_remaining', { left }, tostring(left) .. ' remaining')
        G.E_MANAGER:add_event(Event({ func = function()
          C.status(card, msg, G.C.FILTER)
          return true
        end }))
      end
      return REL.SKIP
    end
    if C.main(ctx) then
      if (card.ability.yorick_discards or 1) > 0 then return REL.SKIP end
      local x = card.ability.extra.xmult
      return { message = C.x_msg(x), Xmult_mod = x }
    end
    return nil
  end,
})

-- ── The Magician ────────────────────────────────────────────────────────────

rework('c_magician', {
  props = { config = { mod_conv = 'm_lucky', max_highlighted = 1 } },
  loc = { set = 'Tarot', key = 'c_mp_magician_release' },
})

-- ── Tags: the shop Joker is not free ────────────────────────────────────────

local function tag_create_joker(tag, ctx, rarity, seed, colour)
  local card = create_card('Joker', ctx.area, nil, rarity, nil, nil, nil, seed)
  create_shop_card_ui(card, 'Joker', ctx.area)
  card.states.visible = false
  tag:yep('+', colour, function() card:start_materialize(); return true end)
  return card
end

rework('tag_uncommon', {
  table = 'P_TAGS', loc = { set = 'Tag', key = 'tag_mp_uncommon_release' },
  tag = { apply = function(tag, ctx)
    if tag.triggered or ctx.type ~= 'store_joker_create' then return nil end
    local card = tag_create_joker(tag, ctx, 0.9, 'uta', G.C.GREEN)
    tag.triggered = true
    return card
  end },
})

--- Distinct Rare Jokers the player holds (vanilla's count for the Rare Tag).
function REL.rares_held()
  local seen, n = {}, 0
  for _, j in ipairs((G.jokers and G.jokers.cards) or {}) do
    local c = j.config and j.config.center
    if c and c.rarity == 3 and not seen[c.key] then seen[c.key] = true; n = n + 1 end
  end
  return n
end

rework('tag_rare', {
  table = 'P_TAGS', loc = { set = 'Tag', key = 'tag_mp_rare_release' },
  tag = { apply = function(tag, ctx)
    if tag.triggered or ctx.type ~= 'store_joker_create' then return nil end
    local card = nil
    if #G.P_JOKER_RARITY_POOLS[3] > REL.rares_held() then
      card = tag_create_joker(tag, ctx, 1, 'rta', G.C.RED)
    else
      tag:nope()
    end
    tag.triggered = true
    return card
  end },
})

for _, t in ipairs({ { 'tag_negative', 'negative', 'tag_mp_negative_release' },
  { 'tag_foil', 'foil', 'tag_mp_foil_release' }, { 'tag_holo', 'holo', 'tag_mp_holo_release' },
  { 'tag_polychrome', 'polychrome', 'tag_mp_poly_release' } }) do
  local edition = t[2]
  rework(t[1], {
    table = 'P_TAGS', loc = { set = 'Tag', key = t[3] },
    tag = { apply = function(tag, ctx)
      if tag.triggered or ctx.type ~= 'store_joker_modify' then return nil end
      local card = ctx.card
      if not card or card.edition or card.temp_edition or card.ability.set ~= 'Joker' then return nil end
      local lock = tag.ID
      G.CONTROLLER.locks[lock] = true
      card.temp_edition = true
      tag:yep('+', G.C.DARK_EDITION, function()
        card.temp_edition = nil
        card:set_edition({ [edition] = true }, true)
        G.CONTROLLER.locks[lock] = nil
        return true
      end)
      tag.triggered = true
      return true
    end },
  })
end

rework('tag_investment', { table = 'P_TAGS', props = { config = { dollars = 15 } } })

-- ── Blue Seal: a random Planet ──────────────────────────────────────────────

rework('Blue', { table = 'P_SEALS', loc = { set = 'Other', key = 'mp_blue_seal_release', target = 'blue_seal' } })

-- ── Poker hands (applied at run start) and their Planets ────────────────────

REL.HANDS = {
  { hand = 'Straight', planet = 'c_saturn', field = 'l_mult', value = 2 },
  { hand = 'Straight Flush', planet = 'c_neptune', field = 'l_mult', value = 3 },
  { hand = 'Flush House', planet = 'c_ceres', field = 'l_mult', value = 3 },
  { hand = 'Flush Five', planet = 'c_eris', field = 'l_chips', value = 40 },
}
for _, h in ipairs(REL.HANDS) do
  rework(h.hand, { virtual = true })
  rework(h.planet)  -- no change of its own: it shows the Balanced sticker
end

-- ── Stakes ──────────────────────────────────────────────────────────────────

REL.SCALING = {
  green = { 300, 1000, 3200, 9000, 18000, 32000, 56000, 90000 },
  purple = { 300, 1200, 3600, 10000, 25000, 50000, 90000, 180000 },
}
rework('stake_green', { table = 'P_STAKES' })
rework('stake_purple', { table = 'P_STAKES' })
rework('stake_orange', { table = 'P_STAKES', loc = { set = 'Stake', key = 'stake_mp_orange_release' } })
rework('stake_gold', { table = 'P_STAKES', loc = { set = 'Stake', key = 'stake_mp_gold_release' } })

--- 1.0.0's blind base amount for Green (scaling 2) or Purple (scaling 3) and above.
function REL.blind_amount(ante, which)
  local amounts = REL.SCALING[which]
  if ante < 1 then return 100 end
  if ante <= 8 then return amounts[ante] end
  local a, b, c, d = amounts[8], 1.6, ante - 8, 1 + 0.2 * (ante - 8)
  local amount = math.floor(a * (b + (0.75 * c) ^ d) ^ c)
  return amount - amount % (10 ^ math.floor(math.log10(amount) - 1))
end

-- ── The Arm ─────────────────────────────────────────────────────────────────

rework('bl_arm', {
  table = 'P_BLINDS',
  blind = {
    debuff_hand = function(blind, orig, cards, hand, handname, check, ...)
      if blind.disabled or blind.name ~= 'The Arm' then return orig(blind, cards, hand, handname, check, ...) end
      blind.triggered = false
      local h = G.GAME.hands[handname]
      if h and h.level > 0 then
        blind.triggered = true
        if not check then
          level_up_hand(blind.children.animatedSprite, handname, nil, -1)
          blind:wiggle()
        end
      end
    end,
  },
})

-- ── Run start (layer hook) ──────────────────────────────────────────────────

--- What the release layer does when a run starts (vanilla stakes already applied, the MP stake too).
function REL.apply(ctx)
  local g = G.GAME
  for _, h in ipairs(REL.HANDS) do
    local hand = g.hands and g.hands[h.hand]
    if hand then hand[h.field] = h.value end
  end
  local stake = g.stake or 1
  local mpd = MP.stakes and MP.stakes.def(ctx and ctx.session and ctx.session.mpStake) or {}
  if stake >= 6 then g.mp_release_scaling = 'purple' elseif stake >= 3 then g.mp_release_scaling = 'green' end
  if stake >= 7 then
    g.modifiers.booster_ante_scaling = true
    if not mpd.perishables then g.modifiers.enable_perishables_in_shop = nil end
  end
  if stake >= 8 then
    g.starting_params.hand_size = g.starting_params.hand_size - 1
    if not mpd.rentals then g.modifiers.enable_rentals_in_shop = nil end
  end
end

MP.rules.layer_hook(REL.LAYER, REL.apply)

-- ── Session wraps ───────────────────────────────────────────────────────────

local SQUARE_RELEASE_NAME = 'Square Joker (1.0.0)'

--- Run fn with j_square's prototype renamed, so vanilla's square shape is skipped for the 1.0.0 art.
local function as_card_shaped_square(center, fn, ...)
  local sq = G.P_CENTERS and G.P_CENTERS.j_square
  if not (center == sq and REL.active() and REL.art_loaded()) then return fn(...) end
  local name = sq.name
  sq.name = SQUARE_RELEASE_NAME
  local r = { pcall(fn, ...) }
  sq.name = name
  if not r[1] then error(r[2], 0) end
  return unpack(r, 2, table.maxn(r))
end

function REL.install()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'content.release.' .. id } end
  if not rawget(_G, 'Card') then return end

  wrap(Card, 'set_ability', function(orig, self, center, initial, delay_sprites, ...)
    local r = as_card_shaped_square(center, orig, self, center, initial, delay_sprites, ...)
    if center and center == G.P_CENTERS.j_square and self.ability and self.ability.name == SQUARE_RELEASE_NAME then
      self.ability.name = 'Square Joker'
    end
    return r
  end, o('square_set_ability'))

  wrap(Card, 'load', function(orig, self, t, ...)
    local key = t and t.save_fields and t.save_fields.center
    local center = key and G.P_CENTERS[key]
    return as_card_shaped_square(center, orig, self, t, ...)
  end, o('square_load'))

  wrap(Card, 'get_end_of_round_effect', function(orig, self, ...)
    if not (self.seal == 'Blue' and REL.active() and R.enabled(REL.key_for('Blue'))) then return orig(self, ...) end
    self.seal = nil
    local ok, ret = pcall(orig, self, ...)
    self.seal = 'Blue'
    if not ok then error(ret, 0) end
    ret = ret or {}
    if self.debuff or not C.room_for_consumable() then return ret end
    local card = self
    local function make()
      G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1
      G.E_MANAGER:add_event(Event({ trigger = 'before', delay = 0.0, func = function()
        local planet = create_card('Planet', G.consumeables, nil, nil, nil, nil, nil, 'blusl')
        planet:add_to_deck()
        G.consumeables:emplace(planet)
        G.GAME.consumeable_buffer = 0
        return true
      end }))
      C.status(card, C.loc('k_plus_planet', '+1 Planet'), G.C.SECONDARY_SET.Planet)
    end
    -- A Magic Mouth trap still steals the seal's Planet (content/trap_hooks.lua watches the buffer).
    local th = rawget(package.loaded, 'rmh_mp.content.trap_hooks')
    if type(th) == 'table' and th.seal_watch then th.seal_watch(self, make) else make() end
    ret.effect = true
    return ret
  end, o('blue_seal'))

  wrap(_G, 'get_blind_amount', function(orig, ante, ...)
    local which = G.GAME and G.GAME.mp_release_scaling
    local s = G.GAME and G.GAME.modifiers and G.GAME.modifiers.scaling
    if which and REL.SCALING[which] and (s == 2 or s == 3) then return REL.blind_amount(ante, which) end
    return orig(ante, ...)
  end, o('blind_amount'))
end

C.add_installer(REL.install)

--- On mount: the optional pack may have landed after the MP pack loaded its atlases.
function REL.on_mount()
  if not REL.active() or REL.art_loaded() then return end
  if A.reload then pcall(A.reload, REL.ATLAS) end
end

return REL
