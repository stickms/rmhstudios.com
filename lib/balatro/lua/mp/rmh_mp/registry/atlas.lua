-- rmh_mp/registry/atlas.lua — MP atlases (PLAN §0.7, docs/balatro-mp.md §4, C §2.4).
--
-- Registry format (owned by WS2, docs/balatro-mp.md §4 "Atlas registry"). Two shapes are accepted:
--   * the pack's generated rmh_mp/data/atlases.lua: a FLAT map
--       { mp_<name> = { file, px, py, kind = 'card'|'animation'|'tag'|'asset', frames?, placeholder,
--                       variants? = { [lang] = file } } }      (`frames` omitted when null)
--   * the JSON file data/balatro-mp/atlases.json, decoded: { version, stub?, atlases = <that map> }
-- (`asset` = drawn directly from G.ASSET_ATLAS: stake chips, the PvP title.) An entry may carry
-- `pack = '<name>'`: its file ships in that optional pack (EX-14's `release`), not the MP pack; it
-- is a placeholder alias until the pack is mounted (atlas.reload).
-- Card content uses separate atlases (never an extended Joker sheet: WebGL1's 4096 px limit);
-- the PvP blind sites read G.ANIMATION_ATLAS[<atlas>] (WS11 uses MP.registry.atlas.blind_atlas);
-- `tag` atlases are pasted under tags.png so the vanilla tag call sites draw them unchanged.
--
--   atlas.set_registry(tbl)      install the decoded registry (init.lua loads it)
--   atlas.install()              load images into G.ASSET_ATLAS / G.ANIMATION_ATLAS; re-run after
--                                every Game:set_render_settings (texture scaling change)
--   atlas.apply_card(card, center)  Card.set_sprites post-step: point the sprites at the MP atlas
--                                (installed as an always-on core wrap by install_core_wrap)
--   atlas.blind_atlas(key)       the animation atlas for a blind prototype (falls back to blind_chips)
--   atlas.tag_pos(key)           the pos of a `tag`-kind atlas inside the extended tags sheet
--   atlas.root                   pack folder ('rmh_mp/assets/'), images at <root><scale>x/<file>
--
-- While the registry is a stub, or a file is missing from the pack, an entry is an alias of its
-- `placeholder` vanilla atlas (drawn at pos 0,0), so the game never indexes a nil atlas.

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'

local A = {}
R.atlas = A

A.root = A.root or 'rmh_mp/assets/'
A.registry = A.registry or { atlases = {}, stub = true }
A.loaded = A.loaded or {}      -- key -> 'image' | 'placeholder'
A._tag_pos = A._tag_pos or {}

local KINDS = { card = true, animation = true, tag = true, asset = true }

-- One registry entry is valid when its required fields have the right types; optional fields
-- (`frames`, `variants`, `placeholder`) are checked only when present.
local function valid_entry(key, e)
  if type(key) ~= 'string' or not key:match('^mp_') or type(e) ~= 'table' then return false end
  if type(e.file) ~= 'string' or type(e.px) ~= 'number' or type(e.py) ~= 'number' or not KINDS[e.kind] then
    return false
  end
  if e.frames ~= nil and type(e.frames) ~= 'number' then return false end
  if e.placeholder ~= nil and type(e.placeholder) ~= 'string' then return false end
  if e.variants ~= nil then
    if type(e.variants) ~= 'table' then return false end
    for lang, file in pairs(e.variants) do
      if type(lang) ~= 'string' or type(file) ~= 'string' then return false end
    end
  end
  return true
end

--- Normalise either accepted shape to { stub, version, atlases }; nil when it is neither.
function A.normalize(tbl)
  if type(tbl) ~= 'table' then return nil end
  if tbl.atlases ~= nil then
    if type(tbl.atlases) ~= 'table' then return nil end
    return { version = tbl.version, stub = tbl.stub == true, atlases = tbl.atlases }
  end
  -- Flat map: every key must look like an atlas key (a stray scalar means it is something else).
  local atlases = {}
  for key, e in pairs(tbl) do
    if type(key) ~= 'string' or type(e) ~= 'table' then return nil end
    atlases[key] = e
  end
  return { stub = false, atlases = atlases }
end

function A.set_registry(tbl)
  local reg = A.normalize(tbl)
  if not reg then
    MP.log('warn', 'atlas: bad registry; keeping the previous one')
    return false
  end
  local atlases = {}
  for key, e in pairs(reg.atlases) do
    if valid_entry(key, e) then
      atlases[key] = e
    else
      MP.log('warn', 'atlas: bad entry %s ignored', tostring(key))
    end
  end
  reg.atlases = atlases
  A.registry = reg
  return true
end

function A.entry(key) return A.registry.atlases[key] end

local function file_exists(path)
  local lf = rawget(_G, 'love') and love.filesystem
  if lf and lf.getInfo then return lf.getInfo(path) ~= nil end
  local f = io.open(path, 'rb')
  if f then f:close(); return true end
  return false
end

local function scale()
  return (G.SETTINGS and G.SETTINGS.GRAPHICS and G.SETTINGS.GRAPHICS.texture_scaling) or 2
end

local function new_image(path, s)
  local lg = rawget(_G, 'love') and love.graphics
  if not (lg and lg.newImage) then return nil end
  local ok, img = pcall(lg.newImage, path, { mipmaps = true, dpiscale = s })
  if ok then return img end
  MP.log('warn', 'atlas: cannot load %s: %s', path, tostring(img))
  return nil
end

local function alias(key, e, store, fallback_store)
  local base = store[e.placeholder] or (fallback_store and fallback_store[e.placeholder])
  if not base then
    MP.log('warn', 'atlas: placeholder %s missing for %s', tostring(e.placeholder), key)
    return false
  end
  store[key] = base
  A.loaded[key] = 'placeholder'
  return true
end

-- Paste a `tag` atlas below tags.png and record where it landed.
local function extend_tags(key, e, path, s)
  local li = rawget(_G, 'love') and love.image
  local tags = G.ASSET_ATLAS and G.ASSET_ATLAS.tags
  if not (li and li.newImageData and tags and tags.image and love.graphics.newImage) then return false end
  local ok, err = pcall(function()
    local add = li.newImageData(path)
    local base_path = 'resources/textures/' .. s .. 'x/tags.png'
    local base = li.newImageData(base_path)
    local bw, bh = base:getDimensions()
    local aw, ah = add:getDimensions()
    local out = li.newImageData(math.max(bw, aw), bh + ah)
    out:paste(base, 0, 0, 0, 0, bw, bh)
    out:paste(add, 0, bh, 0, 0, aw, ah)
    tags.image = love.graphics.newImage(out, { mipmaps = true, dpiscale = s })
    A._tag_pos[key] = { x = 0, y = math.floor(bh / (tags.py * s) + 0.5) }
  end)
  if not ok then MP.log('warn', 'atlas: tag sheet extension failed for %s: %s', key, tostring(err)) end
  return ok
end

function A.install()
  if not (G and G.ASSET_ATLAS) then return 0 end
  G.ANIMATION_ATLAS = G.ANIMATION_ATLAS or {}
  local s = scale()
  local n = 0
  local keys = {}
  for key in pairs(A.registry.atlases) do keys[#keys + 1] = key end
  table.sort(keys)
  for _, key in ipairs(keys) do
    local e = A.registry.atlases[key]
    local lang = G.SETTINGS and G.SETTINGS.language
    local file = (type(e.variants) == 'table' and lang and e.variants[lang]) or e.file
    local path = A.root .. s .. 'x/' .. file
    local have = (not A.registry.stub) and file_exists(path)
    if e.kind == 'tag' then
      if not (have and extend_tags(key, e, path, s)) then A._tag_pos[key] = nil end
      A.loaded[key] = A._tag_pos[key] and 'image' or 'placeholder'
    else
      local store = e.kind == 'animation' and G.ANIMATION_ATLAS or G.ASSET_ATLAS
      local img = have and new_image(path, s)
      if img then
        store[key] = { name = key, image = img, px = e.px, py = e.py, frames = e.frames }
        A.loaded[key] = 'image'
      else
        alias(key, e, store, G.ASSET_ATLAS)
      end
    end
    n = n + 1
  end
  A.refresh_set_aliases()
  return n
end

--- Load one `card`/`asset` atlas again (its file may have arrived after install: an optional pack,
--- e.g. the Release ruleset's `release` pack). Returns true when it is now an image.
function A.reload(key)
  local e = A.registry.atlases[key]
  if not (e and G and G.ASSET_ATLAS) or e.kind == 'tag' or e.kind == 'animation' then return false end
  local s = scale()
  local path = A.root .. s .. 'x/' .. e.file
  local img = (not A.registry.stub) and file_exists(path) and new_image(path, s)
  if not img then return false end
  G.ASSET_ATLAS[key] = { name = key, image = img, px = e.px, py = e.py, frames = e.frames }
  A.loaded[key] = 'image'
  return true
end

--- Card.set_sprites post-step for an MP prototype with an `atlas`.
function A.apply_card(card, center)
  local key = center.atlas
  if not key or not card.children then return end
  local atlas = G.ASSET_ATLAS[key]
  if not atlas then return end
  local placeholder = A.loaded[key] == 'placeholder'
  local sprite = card.children.center
  -- Locked/undiscovered art keeps the vanilla sheet (MP prototypes are always unlocked, so this
  -- is only the "?" collection preview).
  if sprite and sprite.set_sprite_pos and (center.discovered or (card.params and card.params.bypass_discovery_center)) then
    sprite.atlas = atlas
    sprite:set_sprite_pos(placeholder and { x = 0, y = 0 } or center.pos)
  end
  local soul = card.children.floating_sprite
  if soul and center.soul_pos and soul.set_sprite_pos then
    soul.atlas = atlas
    soul:set_sprite_pos(placeholder and { x = 0, y = 0 } or center.soul_pos)
  end
end

function A.blind_atlas(key)
  local proto = G.P_BLINDS and G.P_BLINDS[key]
  local name = proto and proto.atlas
  return (name and G.ANIMATION_ATLAS and G.ANIMATION_ATLAS[name]) or (G.ANIMATION_ATLAS and G.ANIMATION_ATLAS.blind_chips)
end

function A.tag_pos(key) return A._tag_pos[key] end

-- A card set an MP prototype introduces (the Trap consumables) has no vanilla atlas, but vanilla
-- Card:set_sprites builds every Joker/consumable/Voucher sprite from G.ASSET_ATLAS[<set>] before
-- our post-step runs; a nil atlas there raises inside Card:init. Such a set is pointed at the
-- prototype's own atlas (the post-step then sets the right cell). Re-pointed on every install,
-- since set_render_settings replaces the atlas tables.
A._set_alias = A._set_alias or {}   -- set -> atlas key

local function ensure_set_atlas(center)
  local set, key = center.set, center.atlas
  if not (center.consumeable and set and key and G and G.ASSET_ATLAS) then return end
  if G.ASSET_ATLAS[set] ~= nil and A._set_alias[set] == nil then return end
  local atlas = G.ASSET_ATLAS[A._set_alias[set] or key]
  if atlas then
    A._set_alias[set] = A._set_alias[set] or key
    G.ASSET_ATLAS[set] = atlas
  end
end
A.ensure_set_atlas = ensure_set_atlas

function A.refresh_set_aliases()
  local defs = R.defs and R.defs() or {}
  for _, def in ipairs(defs) do
    local proto = R.proto and R.proto(def.key)
    if proto then ensure_set_atlas(proto) end
  end
end

--- Card.set_sprites post-step for every MP prototype, always on (not only while a session is
--- mounted): the Multiplayer collection, the lobby's deck/joker previews and practice setup all
--- build Cards from unmounted prototypes. Without it vanilla draws an MP joker from the Joker
--- sheet at the MP def's pos (the plain Joker for every single-sprite MP joker).
function A.set_sprites_hook(orig, self, center, front, ...)
  local mp = type(center) == 'table' and center.rmh_mp
  if mp then ensure_set_atlas(center) end
  local r = orig(self, center, front, ...)
  if mp then
    A.apply_card(self, center)
  elseif type(center) == 'table' and type(center.atlas) == 'string' and A.registry.atlases[center.atlas]
    and A.loaded[center.atlas] == 'image' then
    -- A vanilla center a mounted rework points at MP art (the Release ruleset's sheet): vanilla
    -- builds a new Joker's sprite from G.ASSET_ATLAS[set] and only reads `atlas` on a re-set.
    -- Without the image (a placeholder alias of the vanilla sheet) the vanilla sprite stays.
    A.apply_card(self, center)
  end
  return r
end

--- Core wraps: append our atlases after every set_render_settings run; draw MP cards from them.
function A.install_core_wrap()
  if rawget(_G, 'Game') then
    MP.hooks.wrap(Game, 'set_render_settings', function(orig, self, ...)
      local r = orig(self, ...)
      A.install()
      return r
    end, { id = 'atlas.render_settings', optional = true })
  end
  if rawget(_G, 'Card') then
    MP.hooks.wrap(Card, 'set_sprites', A.set_sprites_hook, { id = 'atlas.set_sprites', optional = true })
  end
end

return A
