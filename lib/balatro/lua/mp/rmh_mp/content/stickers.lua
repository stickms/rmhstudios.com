-- rmh_mp/content/stickers.lua — MP stickers (SK-01…SK-05, HUD-22, A2 §9).
--
-- Stickers are ability flags plus a shared sprite, as vanilla does eternal/perishable/rental. None
-- of them rolls randomly: code applies them.
--
--   mp_sticker_persistent  (experimental: G.GAME.modifiers.mp_sticker_persistent, on the PERSISTENT
--                          list) counts as eternal except for selling; +$3 to its sell price at every
--                          round end; selling COSTS that price (red Sell button, needs the money)
--   mp_sticker_unreliable  (UNRELIABLE list) the joker does not calculate at all on the final hand
--                          (hands_left == 0)
--   mp_sticker_draining    (DRAINING list) X0.75 Mult in joker_main
--   mp_sticker_balanced    every card whose center carries config.mp_balanced (reworks): badge plus
--                          tooltip `mp_sticker_balanced_<key>` when the loc has it, else the generic one
--   mp_sticker_extra_credit  Extra Credit jokers (def.extra_credit): badge only
--   mp_sticker_nemesis     (EX-17 lifted; Advanced layer `nemesis_sticker`) a card received from
--                          the Nemesis — Magnet's copy, a Magic Mouth steal — carries it
--                          (K.mark_nemesis). Art only: no badge, no tooltip (the mod's hide_badge)
-- The lists name vanilla keys (plus three MP jokers); the reworks are not listed, as in the mod.
-- The experimental layer hook (WS6 rules/experimental.lua) turns each family on with p = 1/3.
--
-- Session wraps: Card.set_ability (apply), Card.calculate_joker (unreliable, draining, persistent
-- round-end growth), Card.set_cost / Card.can_sell_card / Card.sell_card / G.FUNCS.can_sell_card
-- (persistent selling), Card.generate_UIBox_ability_table (badges + tooltips), Card.draw (sprites).

local MP = require 'rmh_mp.state'
local C = require 'rmh_mp.content.jokers.core'

local K = {}
MP.content.stickers = K

K.FAMILIES = { 'persistent', 'unreliable', 'draining' }
K.PERSISTENT_ROUND_COST = 3
K.DRAINING_XMULT = 0.75

local function set_of(list) local s = {} for _, k in ipairs(list) do s[k] = true end return s end

K.LISTS = {
  persistent = set_of({
    'j_8_ball', 'j_ancient', 'j_baron', 'j_blueprint', 'j_brainstorm', 'j_card_sharp', 'j_cartomancer',
    'j_cavendish', 'j_certificate', 'j_chaos', 'j_constellation', 'j_diet_cola', 'j_duo', 'j_faceless',
    'j_fibonacci', 'j_fortune_teller', 'j_gluttenous_joker', 'j_greedy_joker', 'j_hack', 'j_hallucination',
    'j_hanging_chad', 'j_invisible', 'j_lusty_joker', 'j_madness', 'j_mail', 'j_midas_mask', 'j_onyx_agate',
    'j_photograph', 'j_riff_raff', 'j_rocket', 'j_runner', 'j_seeing_double', 'j_smiley', 'j_supernova',
    'j_ticket', 'j_tribe', 'j_trousers', 'j_walkie_talkie', 'j_wee', 'j_wrathful_joker', 'j_yorick',
  }),
  unreliable = set_of({
    'j_abstract', 'j_baron', 'j_baseball', 'j_bloodstone', 'j_blueprint', 'j_business', 'j_campfire',
    'j_cavendish', 'j_drivers_license', 'j_fibonacci', 'j_gift', 'j_green_joker', 'j_gros_michel', 'j_half',
    'j_hanging_chad', 'j_hologram', 'j_ice_cream', 'j_idol', 'j_lucky_cat', 'j_midas_mask',
    'j_mp_conjoined_joker', 'j_obelisk', 'j_odd_todd', 'j_popcorn', 'j_raised_fist', 'j_ride_the_bus',
    'j_smiley', 'j_sock_and_buskin', 'j_stuntman', 'j_triboulet', 'j_trio',
  }),
  draining = set_of({
    'j_ancient', 'j_arrowhead', 'j_blackboard', 'j_brainstorm', 'j_burnt', 'j_business', 'j_certificate',
    'j_dna', 'j_drunkard', 'j_even_steven', 'j_family', 'j_golden', 'j_hanging_chad', 'j_idol', 'j_mail',
    'j_midas_mask', 'j_mime', 'j_mp_lets_go_gambling', 'j_mp_speedrun', 'j_mystic_summit', 'j_oops',
    'j_perkeo', 'j_popcorn', 'j_reserved_parking', 'j_riff_raff', 'j_scary_face', 'j_selzer',
    'j_shoot_the_moon', 'j_sixth_sense', 'j_sock_and_buskin', 'j_ticket', 'j_trading', 'j_triboulet',
    'j_vagabond',
  }),
}

-- Badge colours (A2 §9) and sprite cells.
K.BADGE = {
  mp_sticker_persistent = { 0.333, 0.255, 0.8, 1 },     -- #5541CC
  mp_sticker_unreliable = { 0.486, 0.639, 0.604, 1 },   -- #7CA39A
  mp_sticker_draining = { 0.631, 0.2, 0.2, 1 },         -- #A13333
  mp_sticker_balanced = { 0.675, 0.196, 0.196, 1 },     -- G.C.MULTIPLAYER #AC3232
  mp_sticker_extra_credit = { 0.984, 0.631, 0.02, 1 },  -- #FBA105
}
K.SPRITES = {
  mp_sticker_persistent = { atlas = 'mp_alt_stickers', pos = { x = 0, y = 0 } },
  mp_sticker_unreliable = { atlas = 'mp_alt_stickers', pos = { x = 1, y = 0 } },
  mp_sticker_draining = { atlas = 'mp_alt_stickers', pos = { x = 2, y = 0 } },
  mp_sticker_balanced = { atlas = 'mp_sticker_balanced', pos = { x = 0, y = 0 } },
  mp_sticker_extra_credit = { atlas = 'mp_misc', pos = { x = 1, y = 0 } },
  mp_sticker_nemesis = { atlas = 'mp_sticker_nemesis', pos = { x = 0, y = 0 } },
}
-- Drawn but never listed as a badge or a tooltip.
K.HIDE_BADGE = { mp_sticker_nemesis = true }
K.NEMESIS_LAYER = 'nemesis_sticker'

local function is_phantom(card) return card.ability and card.ability.mp_phantom end

--- The stickers on a card, in badge order.
function K.of(card)
  local ab = card and card.ability
  if not ab then return {} end
  local out = {}
  for _, fam in ipairs(K.FAMILIES) do
    if ab['mp_sticker_' .. fam] then out[#out + 1] = 'mp_sticker_' .. fam end
  end
  if ab.mp_balanced then out[#out + 1] = 'mp_sticker_balanced' end
  if ab.mp_extra_credit then out[#out + 1] = 'mp_sticker_extra_credit' end
  if ab.mp_sticker_nemesis then out[#out + 1] = 'mp_sticker_nemesis' end
  return out
end

--- The stickers that show a badge (K.of without the hidden ones).
function K.badges_of(card)
  local out = {}
  for _, s in ipairs(K.of(card)) do if not K.HIDE_BADGE[s] then out[#out + 1] = s end end
  return out
end

--- A card that came from the Nemesis gets the Nemesis sticker while the layer is on. Returns
--- whether it did. Saved with the card (an ability flag).
function K.mark_nemesis(card)
  if not (card and card.ability and MP.layer_active(K.NEMESIS_LAYER)) then return false end
  card.ability.mp_sticker_nemesis = true
  return true
end

-- ── apply ───────────────────────────────────────────────────────────────────

--- Apply the enabled sticker families to a joker (Card.set_ability post-step).
function K.apply(card, center)
  if not (card.ability and center and center.set == 'Joker') or is_phantom(card) then return end
  local mods = G.GAME and G.GAME.modifiers
  if not mods then return end
  for _, fam in ipairs(K.FAMILIES) do
    if mods['mp_sticker_' .. fam] and K.LISTS[fam][center.key] then
      K.set(card, fam, true)
    end
  end
end

function K.set(card, fam, on)
  local ab = card.ability
  local flag = 'mp_sticker_' .. fam
  local was = ab[flag] == true
  ab[flag] = on and true or nil
  if fam == 'persistent' then
    if on and not ab.eternal then ab.eternal = true; ab.mp_persistent_eternal = true end
    if not on and ab.mp_persistent_eternal then ab.eternal = nil; ab.mp_persistent_eternal = nil end
    if was ~= (on and true or false) and card.set_cost then card:set_cost() end
  end
end

-- ── persistent selling ──────────────────────────────────────────────────────

function K.persistent(card) return card.ability and card.ability.mp_sticker_persistent == true end

function K.sell_price(card)
  return (card.sell_cost or 0) + (card.ability.mp_extra_sell_price or 0)
end

function K.round_end_cost(card)
  local ab = card.ability
  ab.mp_extra_sell_price = (ab.mp_extra_sell_price or 0) + K.PERSISTENT_ROUND_COST
  if card.set_cost then card:set_cost() end
  G.E_MANAGER:add_event(Event({ func = function()
    C.status(card, C.loc('k_cost_up', 'Cost Up'), G.C.RED) -- the mod's wording (1_persistent.lua)
    return true
  end }))
end

-- ── tooltips ────────────────────────────────────────────────────────────────

local function other_desc(key)
  local d = G.localization and G.localization.descriptions and G.localization.descriptions.Other
  return d and d[key]
end

--- Tooltip entries (generate_card_ui info queue items) for a card's stickers.
function K.tooltips(card)
  local out = {}
  for _, s in ipairs(K.badges_of(card)) do
    if s == 'mp_sticker_balanced' then
      local key = card.config and card.config.center and ('mp_sticker_balanced_' .. tostring(card.config.center.key))
      if key and other_desc(key) then out[#out + 1] = { key = key, set = 'Other' }
      else out[#out + 1] = { key = 'mp_sticker_balanced', set = 'Other' } end
    else
      out[#out + 1] = { key = s, set = 'Other' }
    end
  end
  if K.persistent(card) and not G.OVERLAY_MENU then
    out[#out + 1] = { key = 'mp_internal_sell_value', set = 'Other', vars = { K.sell_price(card) } }
  end
  return out
end

local function ensure_badge_colours()
  if rawget(_G, 'get_badge_colour') then pcall(get_badge_colour, 'eternal') end
  G.BADGE_COL = G.BADGE_COL or {}
  for k, v in pairs(K.BADGE) do if G.BADGE_COL[k] == nil then G.BADGE_COL[k] = v end end
end

--- generate_UIBox_ability_table post-step: badges (labels from misc.labels) and tooltips.
function K.decorate(card, ui)
  if type(ui) ~= 'table' then return ui end
  local stickers = K.badges_of(card)
  if #stickers == 0 then return ui end
  ui.badges = ui.badges or {}
  if card.ability.mp_persistent_eternal then
    for i = #ui.badges, 1, -1 do if ui.badges[i] == 'eternal' then table.remove(ui.badges, i) end end
  end
  for _, s in ipairs(stickers) do ui.badges[#ui.badges + 1] = s end
  ensure_badge_colours()
  if rawget(_G, 'generate_card_ui') then
    for _, tip in ipairs(K.tooltips(card)) do
      if other_desc(tip.key) then pcall(generate_card_ui, tip, ui) end
    end
  end
  return ui
end

-- ── drawing ─────────────────────────────────────────────────────────────────

K._sprites = {}
local function sprite_for(name)
  local s = K._sprites[name]
  if s then return s end
  local spec = K.SPRITES[name]
  local atlas = spec and G.ASSET_ATLAS and G.ASSET_ATLAS[spec.atlas]
  if not (atlas and rawget(_G, 'Sprite')) then return nil end
  s = Sprite(0, 0, G.CARD_W, G.CARD_H, atlas, spec.pos)
  K._sprites[name] = s
  return s
end

function K.draw(card, layer)
  if not (layer == 'card' or layer == 'both') then return end
  if card.sprite_facing ~= 'front' or not (card.children and card.children.center) then return end
  if not (card.states and card.states.visible) then return end
  for _, name in ipairs(K.of(card)) do
    local s = sprite_for(name)
    if s then
      s.role.draw_major = card
      s:draw_shader('dissolve', nil, nil, nil, card.children.center)
      s:draw_shader('voucher', nil, card.ARGS and card.ARGS.send_to_shader, nil, card.children.center)
    end
  end
end

-- ── session wraps ───────────────────────────────────────────────────────────

function K.install()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'content.stickers.' .. id } end
  K._sprites = {} -- atlases may have been reloaded since the last session
  if not rawget(_G, 'Card') then return end

  wrap(Card, 'set_ability', function(orig, self, center, initial, ...)
    local r = orig(self, center, initial, ...)
    if MP.in_session() then K.apply(self, center) end
    return r
  end, o('set_ability'))

  wrap(Card, 'calculate_joker', function(orig, self, ctx, ...)
    local ab = self.ability
    if not ab or is_phantom(self) or ab.set ~= 'Joker' then return orig(self, ctx, ...) end
    if ab.mp_sticker_unreliable and G.GAME.current_round and G.GAME.current_round.hands_left == 0 then
      return nil
    end
    if ab.mp_sticker_persistent and C.round_end(ctx) and not ctx.blueprint and not self.debuff then
      K.round_end_cost(self)
    end
    local r = orig(self, ctx, ...)
    if ab.mp_sticker_draining and C.main(ctx) and not ctx.blueprint and not self.debuff then
      if type(r) == 'table' then
        r.Xmult_mod = (r.Xmult_mod or 1) * K.DRAINING_XMULT
      else
        r = { message = C.x_msg(K.DRAINING_XMULT), Xmult_mod = K.DRAINING_XMULT, colour = G.C.MULT }
      end
    end
    return r
  end, o('calculate_joker'))

  wrap(Card, 'set_cost', function(orig, self, ...)
    local r = orig(self, ...)
    if K.persistent(self) then
      self.ability.mp_sell_price = K.sell_price(self)
      self.sell_cost_label = self.facing == 'back' and '?' or self.ability.mp_sell_price
    end
    return r
  end, o('set_cost'))

  wrap(Card, 'can_sell_card', function(orig, self, ...)
    if K.persistent(self) and self.ability.mp_persistent_eternal then
      self.ability.eternal = nil
      local ok, res = pcall(orig, self, ...)
      self.ability.eternal = true
      if not ok then error(res, 0) end
      return res
    end
    return orig(self, ...)
  end, o('can_sell_card'))

  wrap(Card, 'sell_card', function(orig, self, ...)
    if K.persistent(self) then
      -- vanilla pays self.sell_cost inside its own event: make that the (negative) price
      local price = self.ability.mp_sell_price or K.sell_price(self)
      self.sell_cost = -price
      self.ability.mp_selling = true
    end
    return orig(self, ...)
  end, o('sell_card'))

  if rawget(_G, 'Card') and Card.draw then
    wrap(Card, 'draw', function(orig, self, layer, ...)
      local ab = self.ability
      local hid = ab and ab.mp_persistent_eternal
      if hid then ab.eternal = nil end -- draw our Persistent sprite, not the eternal one
      local ok, res = pcall(orig, self, layer, ...)
      if hid then ab.eternal = true end
      if not ok then error(res, 0) end
      if ab and #K.of(self) > 0 then K.draw(self, layer or 'both') end
      return res
    end, o('draw'))
  end

  wrap(Card, 'generate_UIBox_ability_table', function(orig, self, ...)
    local ui = orig(self, ...)
    return K.decorate(self, ui)
  end, o('ability_table'))

  if G.FUNCS then
    wrap(G.FUNCS, 'can_sell_card', function(orig, e, ...)
      local card = e and e.config and e.config.ref_table
      if card and K.persistent(card) then
        local price = card.ability.mp_sell_price or K.sell_price(card)
        if card:can_sell_card() and price <= (G.GAME.dollars or 0) then
          e.config.colour = G.C.RED
          e.config.button = 'sell_card'
        else
          e.config.colour = G.C.UI.BACKGROUND_INACTIVE
          e.config.button = nil
        end
        return
      end
      return orig(e, ...)
    end, o('can_sell_button'))
  end
end

C.add_installer(K.install)

return K
