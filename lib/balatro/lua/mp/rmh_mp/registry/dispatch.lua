-- rmh_mp/registry/dispatch.lua — behaviour dispatch for MP content (PLAN §3.d "Dispatch", C §2.2).
--
-- Vanilla dispatches card behaviour by `ability.name` chains; MP names are their keys, so no
-- vanilla branch can ever match them. One wrap per method (group 'session', installed on mount,
-- removed on unmount) routes MP keys — and vanilla keys with an active Rework def that carries a
-- hook — to the def's functions. Signatures the content streams implement:
--
--   Card (self = card):
--     calc(card, ctx)                  -> effect table | nil       (Card.calculate_joker; not called
--                                         while debuffed or for phantom display copies)
--     loc_vars(card)                   -> { vars... } | { vars = {...}, main_end = ..., key = ... }
--     update(card, dt)                                            (Card.update)
--     add(card, from_debuff) / remove(card, from_debuff)          (after the vanilla generic part)
--     dollar_bonus(card)               -> n | nil
--     use(card, area, copier) / can_use(card) -> bool             (consumables)
--     open(card, orig)                                            (boosters; orig = vanilla Card.open)
--     set_ability(card, center, initial)                          (after vanilla set_ability)
--   Back (self = Back):  apply(back), trigger(back, args) -> chips, mult | nil, generate_ui(back, orig, ...)
--   Blind (self = Blind): def.blind.<method>(blind, orig, ...) for set_blind, defeat, disable,
--     press_play, modify_hand, debuff_hand, drawn_to_hand, stay_flipped, debuff_card, get_loc_debuff_text
--   Tag (self = Tag): def.tag.apply(tag, context), def.tag.set_ability(tag)
--
-- A rework of a vanilla joker may set `calc`; it runs first and wins when it returns non-nil
-- (takeovers such as j_ice_cream on `mp_pvp_loss`).

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'

local D = {}
R.dispatch = D

local function def_for_center(center)
  if not center or not center.key then return nil end
  return R.get(center.key)
end
D.def_for_center = def_for_center

local function card_def(card)
  return def_for_center(card and card.config and card.config.center)
end

local ability_card = nil -- the card whose ability table is being generated (loc_vars)

-- A fresh table: the def's vars (positional and named) with vanilla's named fields over them.
-- Never mutates either input (a def may return a cached table).
function D.merge_vars(vars, named)
  local out = {}
  for k, v in pairs(vars) do out[k] = v end
  for k, v in pairs(named) do
    if type(k) ~= 'number' then out[k] = v end
  end
  return out
end

local BLIND_METHODS = {
  'set_blind', 'defeat', 'disable', 'press_play', 'modify_hand', 'debuff_hand', 'drawn_to_hand',
  'stay_flipped', 'debuff_card', 'get_loc_debuff_text',
}

function D.install()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'dispatch.' .. id } end

  if rawget(_G, 'Card') then
    wrap(Card, 'calculate_joker', function(orig, self, context, ...)
      local def = card_def(self)
      if def and def.calc then
        if self.ability and self.ability.mp_phantom then return nil end
        if def.kind ~= 'Rework' then
          if self.debuff then return nil end
          return def.calc(self, context)
        end
        if not self.debuff then
          local r = def.calc(self, context)
          if r ~= nil then return r end
        end
      elseif self.ability and self.ability.mp_phantom then
        return nil
      end
      return orig(self, context, ...)
    end, o('calculate_joker'))

    wrap(Card, 'generate_UIBox_ability_table', function(orig, self, ...)
      local prev = ability_card
      ability_card = self
      local ok, res = pcall(orig, self, ...)
      ability_card = prev
      if not ok then error(res, 0) end
      return res
    end, o('ability_table'))

    wrap(Card, 'use_consumeable', function(orig, self, area, copier, ...)
      local def = card_def(self)
      if def and def.use and def.kind ~= 'Rework' then
        if rawget(_G, 'stop_use') then stop_use() end
        if self.debuff then return nil end
        return def.use(self, area, copier)
      end
      return orig(self, area, copier, ...)
    end, o('use_consumeable'))

    wrap(Card, 'can_use_consumeable', function(orig, self, ...)
      local def = card_def(self)
      if def and def.can_use and def.kind ~= 'Rework' then
        return def.can_use(self, ...) and true or false
      end
      return orig(self, ...)
    end, o('can_use_consumeable'))

    wrap(Card, 'add_to_deck', function(orig, self, from_debuff, ...)
      local already = self.added_to_deck
      local r = orig(self, from_debuff, ...)
      local def = card_def(self)
      if def and def.add and not already then def.add(self, from_debuff) end
      return r
    end, o('add_to_deck'))

    wrap(Card, 'remove_from_deck', function(orig, self, from_debuff, ...)
      local was = self.added_to_deck
      local r = orig(self, from_debuff, ...)
      local def = card_def(self)
      if def and def.remove and was then def.remove(self, from_debuff) end
      return r
    end, o('remove_from_deck'))

    wrap(Card, 'calculate_dollar_bonus', function(orig, self, ...)
      local def = card_def(self)
      if def and def.dollar_bonus then
        if self.debuff or (self.ability and self.ability.mp_phantom) then return nil end
        return def.dollar_bonus(self)
      end
      return orig(self, ...)
    end, o('dollar_bonus'))

    wrap(Card, 'open', function(orig, self, ...)
      local def = card_def(self)
      if def and def.open then return def.open(self, orig, ...) end
      return orig(self, ...)
    end, o('open'))

    -- Card.update runs for every card every frame: only wrap it when some def needs it.
    local any_update = false
    for _, d in ipairs(R.defs()) do if d.update then any_update = true end end
    if any_update then wrap(Card, 'update', function(orig, self, dt, ...)
      local r = orig(self, dt, ...)
      local def = card_def(self)
      if def and def.update then def.update(self, dt) end
      return r
    end, o('update')) end

    wrap(Card, 'set_sprites', function(orig, self, _center, _front, ...)
      local r = orig(self, _center, _front, ...)
      if _center and _center.rmh_mp and R.atlas then R.atlas.apply_card(self, _center) end
      return r
    end, o('set_sprites'))

    wrap(Card, 'set_ability', function(orig, self, center, initial, delay_sprites, ...)
      local r = orig(self, center, initial, delay_sprites, ...)
      if center and self.ability then
        local def = def_for_center(center)
        if (center.config and center.config.mp_balanced) or (def and def.balanced) then
          self.ability.mp_balanced = true
        end
        if def and def.extra_credit then self.ability.mp_extra_credit = true end
        if def and def.set_ability then def.set_ability(self, center, initial) end
      end
      return r
    end, o('set_ability'))
  end

  -- Vanilla passes specific_vars = nil for a card it has no loc_vars branch for, but a perishable
  -- or stickered card arrives with a table of NAMED fields only ({perish_tally}, {sticker}). Both
  -- mean "no positional vars": the def's vars fill [1..n] and vanilla's named fields are kept on
  -- top (they drive the badge tooltips), so an MP joker never renders "#1#".
  wrap(_G, 'generate_card_ui', function(orig, _c, full_UI_table, specific_vars, card_type, badges, ...)
    if (specific_vars == nil or (type(specific_vars) == 'table' and specific_vars[1] == nil))
      and ability_card and _c and ability_card.config and ability_card.config.center == _c then
      local def = def_for_center(_c)
      if def and def.loc_vars then
        local ok, res = pcall(def.loc_vars, ability_card)
        if ok and type(res) == 'table' then
          local vars = res.vars or res
          if specific_vars ~= nil then vars = D.merge_vars(vars, specific_vars) end
          specific_vars = vars
        elseif not ok then
          MP.log('error', 'loc_vars %s failed: %s', tostring(_c.key), tostring(res))
        end
      end
    end
    return orig(_c, full_UI_table, specific_vars, card_type, badges, ...)
  end, o('generate_card_ui'))

  if rawget(_G, 'Back') then
    wrap(Back, 'apply_to_run', function(orig, self, ...)
      local r = orig(self, ...)
      local def = def_for_center(self.effect and self.effect.center)
      if def and def.apply then def.apply(self) end
      return r
    end, o('back_apply'))
    wrap(Back, 'trigger_effect', function(orig, self, args, ...)
      local a, b = orig(self, args, ...)
      local def = def_for_center(self.effect and self.effect.center)
      if def and def.trigger then
        local c2, m2 = def.trigger(self, args, a, b)
        if c2 ~= nil or m2 ~= nil then return c2, m2 end
      end
      return a, b
    end, o('back_trigger'))
    wrap(Back, 'generate_UI', function(orig, self, ...)
      local def = def_for_center(self.effect and self.effect.center)
      if def and def.generate_ui then return def.generate_ui(self, orig, ...) end
      return orig(self, ...)
    end, o('back_ui'))
  end

  if rawget(_G, 'Blind') then
    for _, m in ipairs(BLIND_METHODS) do
      wrap(Blind, m, function(orig, self, ...)
        local blind = self.config and self.config.blind
        local def = blind and blind.key and R.get(blind.key)
        local fn = def and def.blind and def.blind[m]
        if type(fn) == 'function' then return fn(self, orig, ...) end
        return orig(self, ...)
      end, o('blind_' .. m))
    end
  end

  if rawget(_G, 'Tag') then
    wrap(Tag, 'apply_to_run', function(orig, self, context, ...)
      local def = self.key and R.get(self.key)
      if def and def.tag and def.tag.apply then return def.tag.apply(self, context) end
      return orig(self, context, ...)
    end, o('tag_apply'))
    wrap(Tag, 'set_ability', function(orig, self, ...)
      local r = orig(self, ...)
      local def = self.key and R.get(self.key)
      if def and def.tag and def.tag.set_ability then def.tag.set_ability(self) end
      return r
    end, o('tag_set_ability'))
  end
end

--- Custom-context fan-out (MP.ctx.calculate, §3.d): every joker (and consumable) sees `ctx`;
--- effects with a message are shown with the game's card_eval_status_text.
MP.ctx = MP.ctx or {}
function MP.ctx.calculate(ctx, opts)
  opts = opts or {}
  local results = {}
  local areas = { G.jokers }
  if opts.consumeables ~= false and G.consumeables then areas[#areas + 1] = G.consumeables end
  for _, area in ipairs(areas) do
    for _, card in ipairs((area and area.cards) or {}) do
      local ok, eff = pcall(card.calculate_joker, card, ctx)
      if not ok then
        MP.log('error', 'ctx.calculate %s failed: %s', tostring(ctx and ctx.mp_context), tostring(eff))
      elseif eff then
        results[#results + 1] = { card = card, effect = eff }
        if (eff.message or eff.extra) and rawget(_G, 'card_eval_status_text') and not opts.silent then
          pcall(card_eval_status_text, card, 'extra', nil, nil, nil, eff)
        end
      end
    end
  end
  return results
end

return D
