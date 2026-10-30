-- rmh_mp/registry/loc.lua — localization merge (C §2.5).
--
-- `init_localization` (re-run on every language change) parses G.localization. We wrap it and
-- merge MP text first, so MP descriptions get vanilla `text_parsed`/`name_parsed` and `{C:mult}`
-- markup works. Sources, lowest priority first:
--   1. inline def.loc ({ name, text }) — en-us fallback for every language
--   2. the pack's tables: require('rmh_mp.loc.<lang>') then 'rmh_mp.loc.en-us' (WS2 generates
--      them from the mod's strings; same shape as a vanilla localization file)
--   3. tables added with loc.add(lang, tbl) (UI streams for their own strings)
-- Merging only ADDS keys: vanilla text is never overwritten, so single-player wording is
-- unchanged. MP text staying in G.localization outside sessions is harmless (no RNG, no pools)
-- and needed by the MP menus.
--
--   loc.add(lang, tbl)   loc.merge_into(target, lang)   loc.install_core_wrap()

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'

local L = {}
R.loc = L

L.extra = L.extra or {}   -- lang -> list of tables

local DESC_SET = {
  Joker = 'Joker', Tarot = 'Tarot', Planet = 'Planet', Spectral = 'Spectral', Trap = 'Trap',
  Booster = 'Other', Back = 'Back', Voucher = 'Voucher', Enhancement = 'Enhanced', Blind = 'Blind',
  Tag = 'Tag',
}

function L.add(lang, tbl)
  L.extra[lang] = L.extra[lang] or {}
  table.insert(L.extra[lang], tbl)
end

local function fill(dst, src)
  for k, v in pairs(src) do
    if dst[k] == nil then
      dst[k] = MP.copy(v, true)
    elseif type(dst[k]) == 'table' and type(v) == 'table' and not (v.name or v.text) then
      fill(dst[k], v)
    end
  end
end

local function pack_table(lang)
  local ok, t = pcall(require, 'rmh_mp.loc.' .. lang)
  if ok and type(t) == 'table' then return t end
  return nil
end

local function inline_table()
  local t = { descriptions = {}, misc = { challenge_names = {} } }
  for _, def in ipairs(R.defs()) do
    if def.loc then
      if def.kind == 'Challenge' then
        if def.loc.name then t.misc.challenge_names[def.key] = def.loc.name end
      else
        local set = DESC_SET[def.kind]
        if def.kind == 'Rework' then set = def.loc.set end
        if set then
          t.descriptions[set] = t.descriptions[set] or {}
          t.descriptions[set][def.key] = { name = def.loc.name, text = def.loc.text or {} }
        end
      end
    end
  end
  return t
end

--- Merge MP text into `target` (a G.localization-shaped table) for `lang`.
function L.merge_into(target, lang)
  target.descriptions = target.descriptions or {}
  target.misc = target.misc or {}
  local layers = {}
  for _, t in ipairs(L.extra[lang] or {}) do layers[#layers + 1] = t end
  local p = pack_table(lang)
  if p then layers[#layers + 1] = p end
  if lang ~= 'en-us' then
    for _, t in ipairs(L.extra['en-us'] or {}) do layers[#layers + 1] = t end
    local en = pack_table('en-us')
    if en then layers[#layers + 1] = en end
  end
  layers[#layers + 1] = inline_table()
  for _, t in ipairs(layers) do fill(target, t) end
  return target
end

function L.install_core_wrap()
  if rawget(_G, 'init_localization') then
    MP.hooks.wrap(_G, 'init_localization', function(orig, ...)
      if G and G.localization then
        local lang = (G.SETTINGS and G.SETTINGS.language) or 'en-us'
        local ok, err = pcall(L.merge_into, G.localization, lang)
        if not ok then MP.log('error', 'loc merge failed: %s', tostring(err)) end
      end
      return orig(...)
    end, { id = 'loc.init_localization', optional = true })
  end
end

--- Re-run the merge now (the pack can load after the game's first set_language).
function L.refresh()
  if rawget(_G, 'init_localization') and G and G.localization then
    init_localization()
  end
end

return L
