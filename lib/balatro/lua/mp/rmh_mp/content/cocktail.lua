-- rmh_mp/content/cocktail.lua — the Cocktail Deck (DK-08, A2 §6, D-24).
--
--   b_mp_cocktail   "Copies all effects of 3 other decks at random".
--
-- Pool (D-24): every vanilla deck except the Challenge Deck, plus the MP decks except Cocktail itself
-- (White is in it since EX-15 was lifted; it keeps sticker column 18), in `order`. A per-player
-- config gives each deck a state: 0 off, 1 in the pool (default), 2 forced (at most 3 forced; extra
-- forced decks are just in the pool), plus a show/hide flag for the deck stickers. Pick: the forced decks first, then the rest of the pool
-- shuffled with the run's 'mp_cocktail' stream, up to 3. Each picked deck is applied in turn
-- (vanilla config effects through the ORIGINAL Back.apply_to_run, so session wraps do not run twice;
-- MP decks also run their own apply), and every Back.trigger_effect call is delegated to each picked
-- deck in order (Plasma's final scoring step, Anaglyph's eval, Echo's eval...). Small World replaces
-- the picked decks' banned vouchers the same way it does for the selected deck. A run whose config
-- differs from the default is flagged seeded and its deck name gets an asterisk.
--
-- Stored in G.GAME.modifiers (saved with the run): mp_cocktail = { keys }, mp_cocktail_sticker =
-- { {key, slot} } (shown stickers), mp_cocktail_edited.
-- The picked decks are drawn as stickers on the deck back (deck_stickers.png: column = deck index,
-- row = slot). The config is edited in ui/cocktail_edit.lua (G.FUNCS.mp_cocktail_edit).
--
-- Config string (G.SETTINGS.rmh_mp_cocktail, saved with the settings): 'S' or 'H', then
-- '|key=state' for every deck whose state is not 1, e.g. 'S|b_red=0|b_mp_oracle=2'. Deviation from
-- the mod's one-digit-per-position string: keyed, so adding a deck never shifts the others.

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local C = require 'rmh_mp.content.jokers.core'
local rng = require 'rmh_mp.util.rng'

local K = {}
MP.content.cocktail = K
MP.cocktail = K

local function g(name) return rawget(_G, name) end

K.KEY = 'b_mp_cocktail'
K.PICKS = 3
K.MAX_FORCED = 3
K.EXCLUDE = { b_challenge = true, b_mp_cocktail = true }
K.STICKER_COL = {
  b_red = 0, b_blue = 1, b_yellow = 2, b_green = 3, b_black = 4, b_magic = 5, b_nebula = 6, b_ghost = 7,
  b_abandoned = 8, b_checkered = 9, b_zodiac = 10, b_painted = 11, b_anaglyph = 12, b_plasma = 13, b_erratic = 14,
  b_mp_orange = 15, b_mp_indigo = 16, b_mp_violet = 17, b_mp_white = 18, b_mp_oracle = 19, b_mp_gradient = 20,
  b_mp_heidelberg = 21, b_mp_echodeck = 22,
}

-- ── config ──────────────────────────────────────────────────────────────────

function K.parse(s)
  local cfg = { show = true, decks = {} }
  if type(s) ~= 'string' then return cfg end
  local head = s:sub(1, 1)
  if head == 'H' then cfg.show = false end
  for key, v in s:gmatch('|([%w_]+)=(%d)') do
    local n = tonumber(v)
    if n == 0 or n == 1 or n == 2 then cfg.decks[key] = n end
  end
  return cfg
end

function K.encode(cfg)
  local parts = { cfg.show == false and 'H' or 'S' }
  local keys = rng.sorted_keys(cfg.decks or {})
  for _, k in ipairs(keys) do
    local v = cfg.decks[k]
    if v ~= 1 then parts[#parts + 1] = k .. '=' .. tostring(v) end
  end
  return table.concat(parts, '|')
end

function K.config()
  return K.parse(G.SETTINGS and G.SETTINGS.rmh_mp_cocktail)
end

function K.save_config(cfg)
  if not G.SETTINGS then return end
  G.SETTINGS.rmh_mp_cocktail = K.encode(cfg)
  if G.save_settings then pcall(G.save_settings, G) end
end

function K.state_of(cfg, key)
  local v = cfg.decks[key]
  if v == nil then return 1 end
  return v
end

function K.is_edited(cfg)
  if cfg.show == false then return true end
  for _, v in pairs(cfg.decks) do if v ~= 1 then return true end end
  return false
end

-- ── pool ────────────────────────────────────────────────────────────────────

local function by_order(a, b)
  local oa, ob = a.order or 0, b.order or 0
  if oa ~= ob then return oa < ob end
  return tostring(a.key) < tostring(b.key)
end

--- Every candidate deck center. `mounted_only`: the ones in G.P_CENTERS now (a run); otherwise the
--- MP decks come from the registry (the editor works outside a session too).
function K.all_decks(mounted_only)
  local list, seen = {}, {}
  for _, c in ipairs((G.P_CENTER_POOLS and G.P_CENTER_POOLS.Back) or {}) do
    if c.key and not K.EXCLUDE[c.key] and not c.omit and not seen[c.key] then
      seen[c.key] = true
      list[#list + 1] = c
    end
  end
  for _, def in ipairs(R.defs()) do
    if def.kind == 'Back' and not K.EXCLUDE[def.key] and not seen[def.key] then
      local p = mounted_only and G.P_CENTERS[def.key] or (not mounted_only and R.proto(def.key)) or nil
      if p then
        seen[def.key] = true
        list[#list + 1] = p
      end
    end
  end
  table.sort(list, by_order)
  return list
end

--- The picks for this run: { keys }, { {key, slot} shown stickers }.
function K.pick(cfg)
  cfg = cfg or K.config()
  local forced, cands = {}, {}
  for _, c in ipairs(K.all_decks(true)) do
    local st = K.state_of(cfg, c.key)
    if st == 2 and #forced < K.MAX_FORCED then
      forced[#forced + 1] = c.key
    elseif st >= 1 then
      cands[#cands + 1] = c.key
    end
  end
  local shuffled = rng.shuffle(cands, 'mp_cocktail')
  local picks, stickers = {}, {}
  for i, k in ipairs(forced) do
    picks[i] = k
    stickers[#stickers + 1] = { key = k, slot = i }
  end
  local i = 1
  while #picks < K.PICKS and shuffled[i] do
    picks[#picks + 1] = shuffled[i]
    if cfg.show ~= false then stickers[#stickers + 1] = { key = shuffled[i], slot = #picks } end
    i = i + 1
  end
  return picks, stickers
end

-- ── apply / trigger ─────────────────────────────────────────────────────────

local function pseudo_back(key)
  local center = G.P_CENTERS[key]
  if not center then return nil end
  local proto = g('Back') or {}
  return setmetatable({ name = center.name, effect = { center = center, config = MP.copy(center.config or {}, true) },
    pos = center.pos }, { __index = proto })
end
K.pseudo_back = pseudo_back

function K.apply_one(key)
  local pb = pseudo_back(key)
  if not pb then return false end
  local sw = MP.smallworld
  local restore = sw and sw.active and sw.active() and sw.fix_back_vouchers(pb) or nil
  local orig = g('Back') and MP.hooks.original(Back, 'apply_to_run')
  if orig then
    local ok, err = pcall(orig, pb)
    if not ok then MP.log('error', 'cocktail apply %s: %s', key, tostring(err)) end
  end
  local def = R.get(key)
  if def and def.kind == 'Back' and def.apply then
    local ok, err = pcall(def.apply, pb)
    if not ok then MP.log('error', 'cocktail apply %s: %s', key, tostring(err)) end
  end
  if restore then sw.restore_back(pb, restore) end
  return true
end

function K.apply(back)
  local cfg = K.config()
  local picks, stickers = K.pick(cfg)
  local m = G.GAME.modifiers
  m.mp_cocktail = picks
  m.mp_cocktail_sticker = stickers
  for _, key in ipairs(picks) do K.apply_one(key) end
  if K.is_edited(cfg) then
    m.mp_cocktail_edited = true
    G.GAME.seeded = true
    if back and back.loc_name and not tostring(back.loc_name):find('%*$') then back.loc_name = back.loc_name .. '*' end
  end
  return picks
end

function K.trigger(_, args)
  local picks = G.GAME.modifiers and G.GAME.modifiers.mp_cocktail
  if type(picks) ~= 'table' or not args then return nil end
  local orig = g('Back') and MP.hooks.original(Back, 'trigger_effect')
  local changed = false
  for _, key in ipairs(picks) do
    local pb = pseudo_back(key)
    if pb then
      local c, mlt
      local def = R.get(key)
      if def and def.kind == 'Back' then
        if def.trigger then c, mlt = def.trigger(pb, args) end
      elseif orig then
        c, mlt = orig(pb, args)
      end
      if c ~= nil or mlt ~= nil then
        args.chips, args.mult = c or args.chips, mlt or args.mult
        changed = true
      end
    end
  end
  if changed then return args.chips, args.mult end
  return nil
end

R.define({
  key = K.KEY, kind = 'Back', atlas = 'mp_decks', pos = { x = 4, y = 0 }, config = {}, balanced = true,
  apply = function(back) K.apply(back) end,
  trigger = function(back, args) return K.trigger(back, args) end,
})

-- ── deck-back stickers ──────────────────────────────────────────────────────

local sprites = {}
local function sticker_sprite(col, row)
  local atlas = G.ASSET_ATLAS and G.ASSET_ATLAS.mp_deck_stickers
  if not (atlas and g('Sprite')) then return nil end
  local id = col .. ':' .. row
  local s = sprites[id]
  if not s or s.atlas ~= atlas then
    s = Sprite(0, 0, G.CARD_W, G.CARD_H, atlas, { x = col, y = row })
    sprites[id] = s
  end
  return s
end

function K.draw_stickers(card)
  local list = G.GAME and G.GAME.modifiers and G.GAME.modifiers.mp_cocktail_sticker
  if type(list) ~= 'table' or #list == 0 then return end
  local back = card.children and card.children.back
  if not back then return end
  for _, st in ipairs(list) do
    local col = K.STICKER_COL[st.key]
    if col and st.slot and st.slot >= 1 and st.slot <= 3 then
      local s = sticker_sprite(col, st.slot - 1)
      if s then
        s.role.draw_major = card
        s:draw_shader('dissolve', nil, nil, true, back)
      end
    end
  end
end

function K.install()
  local wrap = MP.hooks.wrap
  sprites = {}
  if g('Card') and Card.draw then
    wrap(Card, 'draw', function(orig, self, layer, ...)
      local r = orig(self, layer, ...)
      if self.sprite_facing == 'back' and self.playing_card and G.GAME and G.GAME.modifiers
        and G.GAME.modifiers.mp_cocktail_sticker and G.STAGE == (G.STAGES and G.STAGES.RUN) then
        K.draw_stickers(self)
      end
      return r
    end, { group = 'session', optional = true, id = 'content.cocktail.stickers' })
  end
end

C.add_installer(K.install)

-- The editor overlay (optional module: the deck works without it).
local ok, err = pcall(require, 'rmh_mp.ui.cocktail_edit')
if not ok and not tostring(err):find("module 'rmh_mp.ui.cocktail_edit' not found", 1, true) then
  MP.log('error', 'cocktail editor failed to load: %s', tostring(err))
end

return K
