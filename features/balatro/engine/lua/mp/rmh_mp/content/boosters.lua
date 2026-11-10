-- rmh_mp/content/boosters.lua — MP boosters and the Ward tag (BO-01…BO-03, TG-04, LY-11; A2 §4,
-- §10; A1 §5.2; D-09).
--
--   p_mp_standard_giga  Giga Standard Pack: Standard cards, 10 shown, choose 4, $16, weight 0 (never
--                       in the shop: pool = false), UNSKIPPABLE. Opened free by the Orange Deck.
--   p_mp_trap_normal    Trap Pack: 3 Trap cards, choose 1, $4, weight 1 (D-09, Spectral parity)
--   p_mp_trap_jumbo     Jumbo Trap Pack: 5, choose 1, $6, weight 1. No Mega.
--                       Both are pooled only with the `traps` layer; without it they are banned
--                       (the ban source lives in WS6 rules/session.lua, WS4 resolve() also bans them).
--   tag_mp_ward         Ward Tag: at the next blind choice, a free Jumbo Spectral pack. Never pooled;
--                       only Glyph of Warding gives it.
--
-- Opening: vanilla Card:open dispatches on the pack NAME (Arcana/Celestial/Spectral/Standard/
-- Buffoon). MP names are keys, so `open` renames the card's ability for vanilla: the Giga pack opens
-- as a Standard pack, a Trap pack as a Celestial pack (the planet-pack screen: no hand drawn,
-- consumables used straight from the pack) whose cards a create_card wrap turns into Traps, with the
-- pack title swapped to "Trap Pack". G.GAME.mp_open_pack names the pack while it is open.
--
-- Session wraps here also apply G.GAME.modifiers.booster_choice_mod (+N picks, Indigo Deck and the
-- Blue Ice challenge — vanilla has no such modifier) and the unskippable rule (Giga; Indigo unless
-- nothing in the pack can be used — the softlock guard, MP.content.decks.pack_has_usable).

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local C = require 'rmh_mp.content.jokers.core'

local B = {}
MP.content.boosters = B

local function g(name) return rawget(_G, name) end
local function center_key(card) return card and card.config and card.config.center and card.config.center.key end

B.GIGA = 'p_mp_standard_giga'
B.TRAP_PACKS = { p_mp_trap_normal = true, p_mp_trap_jumbo = true }
B.WARD = 'tag_mp_ward'
B.WARD_PACK = 'p_spectral_jumbo_1'

local function open_as(card, orig, vanilla_name, ...)
  G.GAME.mp_open_pack = center_key(card)
  card.ability.name = vanilla_name
  return orig(card, ...)
end

R.define({
  key = B.GIGA, kind = 'Booster', booster_kind = 'Standard', cost = 16, weight = 0, pos = { x = 0, y = 0 },
  atlas = 'mp_standard_giga', config = { extra = 10, choose = 4 }, pool = false, proto = { mp_open_as = 'Standard' },
  loc = { name = 'Giga Standard Pack', text = { 'Choose #1# of up to', '#2# Playing cards to', 'add to your deck', 'Unskippable' } },
  open = function(card, orig, ...) return open_as(card, orig, 'Standard Pack (Giga)', ...) end,
})

R.define({
  key = 'p_mp_trap_normal', kind = 'Booster', booster_kind = 'Trap', cost = 4, weight = 1, pos = { x = 0, y = 0 },
  atlas = 'mp_trap_pack', config = { extra = 3, choose = 1 }, gate = { layers = { 'traps' } },
  proto = { mp_open_as = 'Trap' },
  loc = { name = 'Trap Pack', text = { 'Choose #1# of up to', '#2# Trap cards' } },
  open = function(card, orig, ...) return open_as(card, orig, 'Celestial Pack (Trap)', ...) end,
})

R.define({
  key = 'p_mp_trap_jumbo', kind = 'Booster', booster_kind = 'Trap', cost = 6, weight = 1, pos = { x = 1, y = 0 },
  atlas = 'mp_trap_pack', config = { extra = 5, choose = 1 }, gate = { layers = { 'traps' } },
  proto = { mp_open_as = 'Trap' },
  loc = { name = 'Jumbo Trap Pack', text = { 'Choose #1# of up to', '#2# Trap cards' } },
  open = function(card, orig, ...) return open_as(card, orig, 'Celestial Pack (Trap)', ...) end,
})

--- Open a booster for free in the middle of the screen (tags, the Orange Deck).
function B.open_free(key, scale)
  local center = G.P_CENTERS[key]
  if not (center and G.play and g('Card')) then return nil end
  scale = scale or 1.27
  local card = Card(G.play.T.x + G.play.T.w / 2 - G.CARD_W * scale / 2, G.play.T.y + G.play.T.h / 2 - G.CARD_H * scale / 2,
    G.CARD_W * scale, G.CARD_H * scale, G.P_CARDS.empty, center, { bypass_discovery_center = true, bypass_discovery_ui = true })
  card.cost = 0
  card.from_tag = true
  G.FUNCS.use_card({ config = { ref_table = card } })
  if card.start_materialize then card:start_materialize() end
  return card
end

R.define({
  key = B.WARD, kind = 'Tag', pool = false, pos = { x = 3, y = 3 },
  tag = {
    config = { type = 'new_blind_choice' },
    apply = function(tag, ctx)
      if not (ctx and ctx.type == 'new_blind_choice') or tag.triggered then return nil end
      local lock = tag.ID
      G.CONTROLLER.locks[lock] = true
      tag:yep('+', G.C.SECONDARY_SET and G.C.SECONDARY_SET.Spectral or G.C.PURPLE, function()
        B.open_free(B.WARD_PACK)
        G.CONTROLLER.locks[lock] = nil
        return true
      end)
      tag.triggered = true
      return true
    end,
  },
  loc = { name = 'Ward Tag', text = { 'Gives a free', '{C:spectral}Jumbo Spectral Pack' } },
})

-- ── text: MP boosters read their description from descriptions.Other (vanilla picks booster text
-- by the pack's name, which would show the Arcana text) ─────────────────────────────────────────

local proxies = {}
local function booster_proxy(center)
  local p = proxies[center]
  if not p then
    p = setmetatable({ set = 'Other' }, { __index = center })
    proxies[center] = p
  end
  return p
end

function B.is_unskippable()
  local open = G.GAME and G.GAME.mp_open_pack
  if open == B.GIGA then return true end
  if G.GAME and G.GAME.modifiers and G.GAME.modifiers.mp_indigo then
    local D = MP.content.decks
    return not (D and D.pack_softlocked and D.pack_softlocked())
  end
  return false
end

function B.install()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'content.boosters.' .. id } end

  wrap(_G, 'generate_card_ui', function(orig, _c, full_UI_table, specific_vars, ...)
    if _c and _c.set == 'Booster' and _c.key and R.is_mp(_c.key) then
      local d = G.localization and G.localization.descriptions
      if d and d.Other and d.Other[_c.key] then
        local cfg = _c.config or {}
        return orig(booster_proxy(_c), full_UI_table, specific_vars or { cfg.choose, cfg.extra }, ...)
      end
    end
    return orig(_c, full_UI_table, specific_vars, ...)
  end, o('text'))

  wrap(_G, 'create_card', function(orig, _type, area, legendary, rarity, skip, soulable, forced_key, key_append, ...)
    if area and area == G.pack_cards and _type == 'Planet' and B.TRAP_PACKS[G.GAME.mp_open_pack or ''] then
      return orig('Trap', area, legendary, rarity, skip, false, nil, 'mp_trap', ...)
    end
    return orig(_type, area, legendary, rarity, skip, soulable, forced_key, key_append, ...)
  end, o('trap_pack_cards'))

  if g('create_UIBox_celestial_pack') then
    wrap(_G, 'create_UIBox_celestial_pack', function(orig, ...)
      local dict = G.localization and G.localization.misc and G.localization.misc.dictionary
      if dict and B.TRAP_PACKS[G.GAME.mp_open_pack or ''] and dict.k_trap_pack then
        local saved = dict.k_celestial_pack
        dict.k_celestial_pack = dict.k_trap_pack
        local ok, r = pcall(orig, ...)
        dict.k_celestial_pack = saved
        if not ok then error(r, 0) end
        return r
      end
      return orig(...)
    end, o('trap_pack_title'))
  end

  if g('Card') then
    wrap(Card, 'open', function(orig, self, ...)
      local r = orig(self, ...)
      local mod = G.GAME.modifiers and G.GAME.modifiers.booster_choice_mod
      if self.ability and self.ability.set == 'Booster' and mod and mod ~= 0 then
        local size = (self.ability.extra or 1) + (self.ability.mp_illusion and 1 or 0)
        G.GAME.pack_choices = math.max(1, math.min((G.GAME.pack_choices or 1) + mod, size))
      end
      return r
    end, o('choice_mod'))
  end

  if G.FUNCS then
    wrap(G.FUNCS, 'can_skip_booster', function(orig, e, ...)
      if G.pack_cards and B.is_unskippable() then
        e.config.colour = G.C.UI.BACKGROUND_INACTIVE
        e.config.button = nil
        return
      end
      return orig(e, ...)
    end, o('unskippable'))

    wrap(G.FUNCS, 'end_consumeable', function(orig, e, ...)
      local r = orig(e, ...)
      G.GAME.mp_open_pack = nil
      return r
    end, o('pack_closed'))
  end
end

C.add_installer(B.install)

return B
