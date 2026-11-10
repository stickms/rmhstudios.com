-- rmh_mp/registry/loc.lua — localization merge (C §2.5, docs/balatro-mp.md §4 "Localization").
--
-- `init_localization` (re-run on every language change) parses G.localization. We wrap it and
-- merge MP text first, so MP descriptions get vanilla `text_parsed`/`name_parsed` and `{C:mult}`
-- markup works.
--
-- The MP text for language `lang` is built ENTRY BY ENTRY, lowest priority first:
--   1. inline def.loc ({ name, text }) — the English fallback of content without pack text
--   2. the pack's rmh_mp/loc/en-us.lua (complete), then loc.add('en-us', tbl) tables
--   3. for any other language: the pack's rmh_mp/loc/<lang>.lua (PARTIAL: only the entries it
--      translates), then loc.add(lang, tbl) tables
-- An ENTRY is one leaf of the vanilla structure: descriptions.<set>.<key> (a description
-- {name, text, ...}), or misc.<section>.<key> (a dictionary string, a v_dictionary string, a
-- v_text line list, a label, a challenge name ...). A later layer REPLACES an earlier layer's entry
-- whole — never a deeper merge — so a translated description never keeps an English line, and a
-- language missing an entry shows the English one.
-- Merging into G.localization only ADDS entries: vanilla text is never overwritten, so
-- single-player wording is unchanged. MP text staying in G.localization outside sessions is
-- harmless (no RNG, no pools) and needed by the MP menus.
--
--   loc.add(lang, tbl)   loc.build(lang) -> table   loc.merge_into(target, lang)
--   loc.install_core_wrap()   loc.refresh()

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

-- Lay `src` over `out` one entry at a time (see the header): two levels below the root
-- (descriptions.<set>.<key>, misc.<section>.<key>) the value replaces whole.
local function overlay(out, src)
  if type(src) ~= 'table' then return end
  for top, sections in pairs(src) do
    if type(sections) == 'table' then
      out[top] = out[top] or {}
      for section, entries in pairs(sections) do
        if type(entries) == 'table' then
          local dst = out[top][section]
          if type(dst) ~= 'table' then dst = {}; out[top][section] = dst end
          for key, entry in pairs(entries) do dst[key] = MP.copy(entry, true) end
        end
      end
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

--- The MP text for `lang`: English underneath, the language laid over it entry by entry.
function L.build(lang)
  lang = lang or 'en-us'
  local out = { descriptions = {}, misc = {} }
  local layers = { inline_table() }
  layers[#layers + 1] = pack_table('en-us')
  for _, t in ipairs(L.extra['en-us'] or {}) do layers[#layers + 1] = t end
  if lang ~= 'en-us' then
    layers[#layers + 1] = pack_table(lang)
    for _, t in ipairs(L.extra[lang] or {}) do layers[#layers + 1] = t end
  end
  for i = 1, table.maxn(layers) do
    if layers[i] then overlay(out, layers[i]) end
  end
  return out
end

--- Merge MP text into `target` (a G.localization-shaped table) for `lang`. Adds entries only.
function L.merge_into(target, lang)
  target.descriptions = target.descriptions or {}
  target.misc = target.misc or {}
  for top, sections in pairs(L.build(lang)) do
    target[top] = target[top] or {}
    for section, entries in pairs(sections) do
      local dst = target[top][section]
      if type(dst) ~= 'table' then dst = {}; target[top][section] = dst end
      for key, entry in pairs(entries) do
        if dst[key] == nil then dst[key] = entry end
      end
    end
  end
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
      local r = orig(...)
      -- A mounted session's rework text (`rework.loc`) survives a language change.
      if R.reapply_loc_swaps then pcall(R.reapply_loc_swaps) end
      return r
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
