-- rmh_mp/content/sandbox_misc.lua — the sandbox consumable and tags (CN-04, TG-01…03) and the
-- session wraps the sandbox jokers need (A2 §2.5, §3.4, §10).
--
--   c_mp_ectoplasm_sandbox     Spectral $4 (vanilla sheet 8,4): one random penalty (-1 hand, -1 discard
--                              or -1 hand size, all permanent), then a random editionless joker
--                              becomes Negative. Usable when an editionless joker exists.
--   tag_mp_gambling_sandbox    store_joker_create: 1 in 2 the shop gets a free Rare joker (min ante 2,
--                              needs Blueprint discovered); a miss or every Rare owned -> nope
--   tag_mp_investment_sandbox  eval after a Boss: $5 + $10 x (ante - 1)
--   tag_mp_juggle_sandbox      round_start_bonus, only in a PvP blind: +3 hand size for that round
--
-- Session wraps (group 'session', installed at every mount through MP.content.add_installer):
--   ease_dollars                   Hoarder: every gain > 0 adds $1 sell value to each Hoarder
--                                  (sandbox layer only)
--   Blind.modify_hand              the initial scoring step: custom context `mp_initial_scoring`
--                                  (Clown Car: +44 Mult, -$3), after the blind's own modify_hand
--   Card.get_chip_mult/get_p_dollars   Lucky 7: a card marked mp_gambling rolls like a Lucky card
--   Card.get_chip_h_x_mult/get_end_of_round_effect   Alloy: held Gold acts as Steel and Steel as Gold
-- Core wrap: Tag.get_uibox_table gives MP tags their loc_vars (vanilla computes them by name).

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local C = require 'rmh_mp.content.jokers.core'
local S = require 'rmh_mp.content.jokers.sandbox'

local M = {}
S.misc = M

local function g(name) return rawget(_G, name) end

-- ── CN-04 Ectoplasm (sandbox) ───────────────────────────────────────────────

M.ECTOPLASM = 'c_mp_ectoplasm_sandbox'

function M.editionless_jokers()
  local out = {}
  for _, j in ipairs((G.jokers and G.jokers.cards) or {}) do
    if not j.edition then out[#out + 1] = j end
  end
  return out
end

--- The penalty roll: 1 = -1 hand, 2 = -1 discard, 3 = -1 hand size (all for the rest of the run).
function M.ectoplasm_penalty()
  local roll = math.floor(pseudorandom('ectoplasm_sandbox') * 3) + 1
  if roll < 1 then roll = 1 elseif roll > 3 then roll = 3 end
  local rr = G.GAME.round_resets
  if roll == 1 then
    rr.hands = rr.hands - 1
    C.ease_hands(-1)
  elseif roll == 2 then
    rr.discards = rr.discards - 1
    C.ease_discard(-1)
  elseif G.hand and G.hand.change_size then
    G.hand:change_size(-1)
  end
  return roll
end

R.define({
  key = M.ECTOPLASM, kind = 'Spectral', cost = 4, pos = { x = 8, y = 4 },
  balanced = true, silent_replaces = 'c_ectoplasm', no_collection = true,
  gate = { layers = { S.LAYER } },
  config = {},
  loc_vars = function() return { (G.GAME and G.GAME.ecto_minus) or 1 } end,
  can_use = function()
    return #M.editionless_jokers() > 0
  end,
  use = function(card, _area, copier)
    local by = copier or card
    if not copier and g('set_consumeable_usage') then set_consumeable_usage(card) end
    local targets = M.editionless_jokers()
    G.E_MANAGER:add_event(Event({ trigger = 'after', delay = 0.4, func = function()
      M.ectoplasm_penalty()
      if #targets > 0 then
        local j = pseudorandom_element(targets, pseudoseed('ectoplasm'))
        if j and j.set_edition then j:set_edition({ negative = true }, true) end
        if g('check_for_unlock') then check_for_unlock({ type = 'have_edition' }) end
      end
      if by.juice_up then by:juice_up(0.3, 0.5) end
      return true
    end }))
    if g('delay') then delay(0.6) end
  end,
})

-- ── Tags ────────────────────────────────────────────────────────────────────

local function yep(tag, colour, fn)
  if tag.yep and tag.HUD_tag then tag:yep('+', colour, fn or function() return true end)
  elseif fn then fn() end
end

local function nope(tag)
  if tag.nope and tag.HUD_tag then tag:nope() end
end

--- Distinct Rare jokers owned, and whether an unowned Rare is left in the pool.
function M.unowned_rare_exists()
  local owned, n = {}, 0
  for _, j in ipairs((G.jokers and G.jokers.cards) or {}) do
    local c = j.config and j.config.center
    if c and c.rarity == 3 and not owned[c.key] then owned[c.key] = true; n = n + 1 end
  end
  return #(G.P_JOKER_RARITY_POOLS[3] or {}) > n
end

R.define({
  key = 'tag_mp_gambling_sandbox', kind = 'Tag', atlas = 'mp_tag_gambling_sandbox', pos = { x = 0, y = 0 },
  min_ante = 2, requires = 'j_blueprint', no_collection = true,
  gate = { layers = { S.LAYER } },
  tag = {
    config = { type = 'store_joker_create', odds = 2 },
    loc_vars = function(tag) return { C.normal(), tag.config.odds } end,
    apply = function(tag, context)
      if tag.triggered or context.type ~= 'store_joker_create' then return nil end
      tag.triggered = true
      if not (pseudorandom('tagroll') < C.normal() / tag.config.odds) or not M.unowned_rare_exists() then
        nope(tag)
        return nil
      end
      if not g('create_card') then return nil end
      local card = create_card('Joker', context.area, nil, 1, nil, nil, nil, 'rta')
      if g('create_shop_card_ui') then create_shop_card_ui(card, 'Joker', context.area) end
      if card.states then card.states.visible = false end
      yep(tag, G.C.RED, function()
        if card.start_materialize then card:start_materialize() end
        card.ability.couponed = true
        if card.set_cost then card:set_cost() end
        return true
      end)
      return card
    end,
  },
})

--- Investment payout for the ante that just ended (the ante already advanced at the Boss).
function M.investment_dollars(tag, ante)
  return tag.config.base_dollars + ((ante or G.GAME.round_resets.ante or 1) - 1) * tag.config.ante_dollars
end

local function last_was_boss()
  local lb = G.GAME.last_blind
  return lb ~= nil and (lb.boss == true or lb.name == C.NEMESIS)
end

R.define({
  key = 'tag_mp_investment_sandbox', kind = 'Tag', pos = { x = 2, y = 1 }, no_collection = true,
  gate = { layers = { S.LAYER } },
  tag = {
    config = { type = 'eval', base_dollars = 5, ante_dollars = 10 },
    loc_vars = function(tag)
      local cfg = tag.config
      local ante = (G.GAME and G.GAME.round_resets and G.GAME.round_resets.ante) or 0
      return { cfg.base_dollars, cfg.ante_dollars, cfg.base_dollars + ante * cfg.ante_dollars }
    end,
    apply = function(tag, context)
      if tag.triggered or context.type ~= 'eval' or not last_was_boss() then return nil end
      yep(tag, G.C.GOLD)
      tag.triggered = true
      return { dollars = M.investment_dollars(tag), condition = C.loc('ph_defeat_the_boss', 'Defeat the Boss Blind'),
        pos = tag.pos, tag = tag }
    end,
  },
})

R.define({
  key = 'tag_mp_juggle_sandbox', kind = 'Tag', pos = { x = 5, y = 1 }, no_collection = true,
  gate = { layers = { S.LAYER } },
  tag = {
    config = { type = 'round_start_bonus', h_size = 3 },
    loc_vars = function(tag) return { tag.config.h_size } end,
    apply = function(tag, context)
      if tag.triggered or context.type ~= 'round_start_bonus' or not C.in_pvp() then return nil end
      yep(tag, G.C.BLUE)
      local n = tag.config.h_size
      if G.hand and G.hand.change_size then G.hand:change_size(n) end
      G.GAME.round_resets.temp_handsize = (G.GAME.round_resets.temp_handsize or 0) + n
      tag.triggered = true
      return true
    end,
  },
})

-- Vanilla Tag:get_uibox_table picks loc_vars by name; MP tag names are keys. Always on (the
-- collection can show tags outside a session); only MP tags with loc_vars take this path.
if g('Tag') then
  MP.hooks.wrap(Tag, 'get_uibox_table', function(orig, self, tag_sprite, ...)
    local def = self.key and R.get(self.key)
    local lv = def and def.tag and def.tag.loc_vars
    if not lv or not g('generate_card_ui') then return orig(self, tag_sprite, ...) end
    tag_sprite = tag_sprite or self.tag_sprite
    local ok, vars = pcall(lv, self)
    if not ok then vars = {} end
    local center = G.P_TAGS[self.key] or R.proto(self.key)
    tag_sprite.ability_UIBox_table = generate_card_ui(center, nil, vars, self.hide_ability and 'Undiscovered' or 'Tag',
      nil, self.hide_ability)
    return tag_sprite
  end, { id = 'sandbox.tag_ui', optional = true })
end

-- ── Session wraps ───────────────────────────────────────────────────────────

--- Hoarder (A2 §2.5): on every money gain each Hoarder gains its value. Sandbox layer only.
function M.hoarder_gain(mod)
  if not S.active() or not (tonumber(mod) and mod > 0) or not G.jokers then return 0 end
  local n = 0
  for _, j in ipairs(G.jokers.cards) do
    local c = j.config and j.config.center
    if c and c.key == S.HOARDER and not j.debuff then
      j.ability.extra_value = (j.ability.extra_value or 0) + (tonumber(j.ability.extra) or 1)
      if j.set_cost then j:set_cost() end
      C.status(j, C.loc('k_val_up', 'Value Up!'), G.C.MONEY)
      n = n + 1
    end
  end
  return n
end

--- The initial scoring step: every joker sees `mp_initial_scoring` once per scored hand.
function M.initial_scoring(cards, poker_hands, text, mult, chips)
  local modded = false
  for _, j in ipairs((G.jokers and G.jokers.cards) or {}) do
    -- No `cardarea`: vanilla treats cardarea == G.jokers without before/after as the main
    -- scoring pass, so every vanilla joker would score twice.
    local ok, eff = pcall(j.calculate_joker, j, { mp_initial_scoring = true,
      full_hand = cards, poker_hands = poker_hands, scoring_name = text })
    if not ok then
      MP.log('error', 'initial scoring step failed: %s', tostring(eff))
    elseif type(eff) == 'table' then
      if eff.mult_mod then mult = mult + eff.mult_mod; modded = true end
      if eff.chip_mod then chips = chips + eff.chip_mod; modded = true end
      if eff.message then C.status(eff.card or j, eff.message, eff.colour) end
    end
  end
  return mult, chips, modded
end

local function lucky_cfg()
  local c = G.P_CENTERS.m_lucky and G.P_CENTERS.m_lucky.config or {}
  return c.mult or 20, c.p_dollars or 20
end

--- A card counting as Lucky without being one (Lucky 7).
local function virtual_lucky(card)
  return card.mp_gambling and not card.debuff and card.ability and card.ability.effect ~= 'Lucky Card'
end

function M.install()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'content.sandbox.' .. id } end

  wrap(_G, 'ease_dollars', function(orig, mod, ...)
    local r = orig(mod, ...)
    M.hoarder_gain(mod)
    return r
  end, o('hoarder'))

  if g('Blind') then
    wrap(Blind, 'modify_hand', function(orig, self, cards, poker_hands, text, mult, hand_chips, ...)
      local m, c, modded = orig(self, cards, poker_hands, text, mult, hand_chips, ...)
      local m2, c2, mod2 = M.initial_scoring(cards, poker_hands, text, m or mult, c or hand_chips)
      return m2, c2, modded or mod2
    end, o('initial_scoring'))
  end

  if g('Card') then
    wrap(Card, 'get_chip_mult', function(orig, self, ...)
      local r = orig(self, ...)
      if virtual_lucky(self) and self.ability.set ~= 'Joker' then
        local mult = lucky_cfg()
        if pseudorandom('lucky_mult') < C.normal() / 5 then
          self.lucky_trigger = true
          r = (r or 0) + mult
        end
      end
      return r
    end, o('lucky7_mult'))

    wrap(Card, 'get_p_dollars', function(orig, self, ...)
      local r = orig(self, ...)
      if virtual_lucky(self) and self.ability.set ~= 'Joker' then
        local _, dollars = lucky_cfg()
        if pseudorandom('lucky_money') < C.normal() / 15 then
          self.lucky_trigger = true
          r = (r or 0) + dollars
        end
      end
      return r
    end, o('lucky7_money'))

    wrap(Card, 'get_chip_h_x_mult', function(orig, self, ...)
      local r = orig(self, ...)
      if not self.debuff and S.enh_key(self) == 'm_gold' and S.alloy_held() then
        local steel = G.P_CENTERS.m_steel and G.P_CENTERS.m_steel.config and G.P_CENTERS.m_steel.config.h_x_mult or 1.5
        if (r or 0) <= 0 then r = steel else r = r * steel end
      end
      return r
    end, o('alloy_steel'))

    wrap(Card, 'get_end_of_round_effect', function(orig, self, ...)
      local r = orig(self, ...)
      if type(r) == 'table' and not self.debuff and S.enh_key(self) == 'm_steel' and S.alloy_held() then
        local gold = G.P_CENTERS.m_gold and G.P_CENTERS.m_gold.config and G.P_CENTERS.m_gold.config.h_dollars or 3
        r.h_dollars = (r.h_dollars or 0) + gold
        r.card = r.card or self
      end
      return r
    end, o('alloy_gold'))
  end
end

C.add_installer(M.install)

return M
