-- rmh_mp/registry/atlas.lua — MP atlases (PLAN §0.7, docs/balatro-mp.md §4, C §2.4).
--
-- Registry format (data/balatro-mp/atlases.json, owned by WS2):
--   { version, stub?, atlases = { mp_<name> = { file, px, py, kind = 'card'|'animation'|'tag'|'asset',
--                                              frames, placeholder, variants? = { [lang] = file } } } }
-- (`asset` = drawn directly from G.ASSET_ATLAS: stake chips, the PvP title.)
-- Card content uses separate atlases (never an extended Joker sheet: WebGL1's 4096 px limit);
-- the PvP blind sites read G.ANIMATION_ATLAS[<atlas>] (WS11 uses MP.registry.atlas.blind_atlas);
-- `tag` atlases are pasted under tags.png so the vanilla tag call sites draw them unchanged.
--
--   atlas.set_registry(tbl)      install the decoded registry (init.lua loads it)
--   atlas.install()              load images into G.ASSET_ATLAS / G.ANIMATION_ATLAS; re-run after
--                                every Game:set_render_settings (texture scaling change)
--   atlas.apply_card(card, center)  Card.set_sprites post-step: point the sprites at the MP atlas
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

function A.set_registry(tbl)
  if type(tbl) ~= 'table' or type(tbl.atlases) ~= 'table' then
    MP.log('warn', 'atlas: bad registry; keeping the previous one')
    return false
  end
  for key, e in pairs(tbl.atlases) do
    if type(key) ~= 'string' or not key:match('^mp_') or type(e) ~= 'table' or type(e.file) ~= 'string'
      or type(e.px) ~= 'number' or type(e.py) ~= 'number'
      or (e.kind ~= 'card' and e.kind ~= 'animation' and e.kind ~= 'tag' and e.kind ~= 'asset') then
      MP.log('warn', 'atlas: bad entry %s ignored', tostring(key))
      tbl.atlases[key] = nil
    end
  end
  A.registry = tbl
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
  return n
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

--- Core wrap: append our atlases after every set_render_settings run.
function A.install_core_wrap()
  if rawget(_G, 'Game') then
    MP.hooks.wrap(Game, 'set_render_settings', function(orig, self, ...)
      local r = orig(self, ...)
      A.install()
      return r
    end, { id = 'atlas.render_settings', optional = true })
  end
end

return A
