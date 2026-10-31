-- rmh_mp/ui/cocktail_edit.lua — the Cocktail Deck "Edit Deck" overlay (DK-08, A2 §6).
--
-- Every candidate deck is shown as its deck card in two rows. Click: in the pool / off.
-- Shift-click: forced (always picked; drawn foil; at most 3). "Select all" puts every deck back in
-- the pool (the mod's right-click); the sticker toggle shows or hides the picked decks on the deck
-- back. Closing saves the config (MP.cocktail.save_config). Works outside a session: the MP decks
-- come from the registry and get their MP art here directly.
--
--   G.FUNCS.mp_cocktail_edit(e)   open the overlay (WS10's deck picker shows the button when the
--                                 Cocktail Deck is selected; MP.cocktail.open_editor() is the same)
--   E.cycle(cfg, key, shift)      the click rule (pure; L1-tested)

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local K = MP.cocktail -- set by content/cocktail.lua, which loads this module

assert(K, 'cocktail_edit: load content.cocktail first')
local E = {}
K.editor = E

local function g(name) return rawget(_G, name) end

--- A dictionary string (MP localization), else the English fallback.
local function loc(key, fallback)
  local d = G and G.localization and G.localization.misc and G.localization.misc.dictionary
  local s = d and d[key]
  return type(s) == 'string' and s or fallback
end

function E.stickers_label(show)
  return loc('rmh_mp_ui_cocktail_stickers', 'Stickers:') .. ' '
    .. (show and loc('rmh_mp_ui_cocktail_shown', 'Shown') or loc('rmh_mp_ui_cocktail_hidden', 'Hidden'))
end

local function forced_count(cfg)
  local n = 0
  for _, v in pairs(cfg.decks) do if v == 2 then n = n + 1 end end
  return n
end

--- Click rule. Plain click: off <-> in the pool (a forced deck goes back to the pool).
--- Shift-click: forced <-> in the pool; refused (returns false) past MAX_FORCED.
function E.cycle(cfg, key, shift)
  local st = K.state_of(cfg, key)
  if shift then
    if st == 2 then
      cfg.decks[key] = 1
    else
      if forced_count(cfg) >= K.MAX_FORCED then return false end
      cfg.decks[key] = 2
    end
  else
    cfg.decks[key] = (st == 0) and 1 or 0
  end
  return true
end

function E.select_all(cfg)
  for k in pairs(cfg.decks) do cfg.decks[k] = 1 end
  return cfg
end

local function shift_down()
  local lk = rawget(_G, 'love') and love.keyboard
  return lk ~= nil and lk.isDown ~= nil and (lk.isDown('lshift') or lk.isDown('rshift'))
end

local function paint(card, st)
  card.highlighted = st >= 1
  card.debuff = st == 0
  if card.set_edition then card:set_edition(st == 2 and { foil = true } or nil, true, true) end
end

E.cfg = nil
E.areas = nil

local function card_for(center, area)
  local card = Card(area.T.x, area.T.y, G.CARD_W * 0.8, G.CARD_H * 0.8, nil, center,
    { bypass_discovery_center = true, bypass_discovery_ui = true })
  if center.rmh_mp and R.atlas and R.atlas.apply_card then pcall(R.atlas.apply_card, card, center) end
  card.mp_cocktail_key = center.key
  card.click = function(self)
    if not E.cfg then return end
    if E.cycle(E.cfg, self.mp_cocktail_key, shift_down()) then
      paint(self, K.state_of(E.cfg, self.mp_cocktail_key))
      if g('play_sound') then play_sound('cardSlide1') end
    elseif g('play_sound') then
      play_sound('cancel')
    end
  end
  return card
end

function E.ui()
  E.cfg = K.config()
  local decks = K.all_decks(MP.in_session())
  local per_row = math.ceil(#decks / 2)
  E.areas = {}
  local rows = {}
  for r = 1, 2 do
    local area = CardArea(G.ROOM.T.x + 0.2 * G.ROOM.T.w / 2, G.ROOM.T.h, per_row * G.CARD_W * 0.62, 0.85 * G.CARD_H,
      { card_limit = per_row, type = 'title', highlight_limit = 999, collection = true })
    E.areas[r] = area
    rows[r] = { n = G.UIT.R, config = { align = 'cm', padding = 0.05, no_fill = true }, nodes = {
      { n = G.UIT.O, config = { object = area } } } }
  end
  for i, center in ipairs(decks) do
    local area = E.areas[i <= per_row and 1 or 2]
    local card = card_for(center, area)
    area:emplace(card)
    paint(card, K.state_of(E.cfg, center.key))
  end
  local function text(key, fallback)
    local s = g('localize') and localize(key) or fallback
    if s == key or s == 'ERROR' then s = fallback end
    return { n = G.UIT.R, config = { align = 'cm', padding = 0.03 }, nodes = {
      { n = G.UIT.T, config = { text = s, scale = 0.32, colour = G.C.UI.TEXT_LIGHT } } } }
  end
  local contents = {
    text('k_cocktail_select', 'Select deck cards to include them'),
    text('k_cocktail_shiftclick', 'Shift-click to foil, foiled decks will always be selected'),
    rows[1], rows[2],
    { n = G.UIT.R, config = { align = 'cm', padding = 0.1 }, nodes = {
      UIBox_button({ label = { loc('rmh_mp_ui_cocktail_select_all', 'Select all') }, button = 'mp_cocktail_select_all', minw = 2.6, minh = 0.6, scale = 0.4,
        colour = G.C.BLUE }),
      UIBox_button({ label = { E.stickers_label(E.cfg.show) }, button = 'mp_cocktail_toggle_show',
        minw = 2.6, minh = 0.6, scale = 0.4, colour = G.C.ORANGE, id = 'mp_cocktail_show' }),
    } },
  }
  return create_UIBox_generic_options({ back_func = 'mp_cocktail_edit_done', contents = contents })
end

function E.open()
  if not (G.FUNCS and G.FUNCS.overlay_menu and g('CardArea')) then return false end
  G.FUNCS.overlay_menu({ definition = E.ui() })
  return true
end
K.open_editor = E.open

function E.repaint()
  for _, area in ipairs(E.areas or {}) do
    for _, c in ipairs(area.cards) do paint(c, K.state_of(E.cfg, c.mp_cocktail_key)) end
  end
end

if G and G.FUNCS then
  G.FUNCS.mp_cocktail_edit = function() E.open() end
  G.FUNCS.mp_cocktail_select_all = function()
    if not E.cfg then return end
    E.select_all(E.cfg)
    E.repaint()
  end
  G.FUNCS.mp_cocktail_toggle_show = function(e)
    if not E.cfg then return end
    E.cfg.show = not E.cfg.show
    local label = E.stickers_label(E.cfg.show)
    local node = e and e.children and e.children[1] and e.children[1].children and e.children[1].children[1]
    if node and node.config and node.config.text then node.config.text = label end
    if e and e.UIBox and e.UIBox.recalculate then e.UIBox:recalculate() end
  end
  G.FUNCS.mp_cocktail_edit_done = function(e)
    if E.cfg then K.save_config(E.cfg) end
    E.cfg, E.areas = nil, nil
    if MP.ui and MP.ui.cocktail_back then return MP.ui.cocktail_back(e) end
    G.FUNCS.exit_overlay_menu()
  end
end

return E
