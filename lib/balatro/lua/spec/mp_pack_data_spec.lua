-- M1 fixes 2 and 4: the Lua core against the REAL generated MP pack data (WS2,
-- docs/balatro-mp.md §4): rmh_mp/data/atlases.lua and rmh_mp/loc/<lang>.lua, read straight out of
-- the committed pack zip named in lib/balatro/game-pack.json (`--check` keeps it fresh).
-- Needs `unzip` on PATH; a missing tool or pack FAILS these specs instead of skipping them.

local H = require 'spec.mp_helper'
local J = require 'rmh/json'

local ROOT = (RMH_SPEC and RMH_SPEC.root) or ''

local function read(path)
  local f = assert(io.open(path, 'rb'))
  local s = f:read('*a')
  f:close()
  return s
end

local function sh_quote(s) return "'" .. s:gsub("'", "'\\''") .. "'" end

local ZIP
local function zip_path()
  if ZIP then return ZIP end
  local manifest = J.decode(read(ROOT .. 'lib/balatro/game-pack.json'))
  assert(manifest.mp and manifest.mp.file, 'game-pack.json has no mp pack')
  ZIP = ROOT .. 'data/balatro-pack/' .. manifest.mp.file
  return ZIP
end

local function pack_text(member)
  local p = io.popen('unzip -p ' .. sh_quote(zip_path()) .. ' ' .. sh_quote(member) .. ' 2>/dev/null')
  local s = p and p:read('*a') or ''
  if p then p:close() end
  assert(#s > 0, 'cannot read ' .. member .. ' from ' .. zip_path() .. ' (is unzip installed?)')
  return s
end

local function pack_members(prefix)
  local p = assert(io.popen('unzip -Z1 ' .. sh_quote(zip_path()) .. ' 2>/dev/null'))
  local out = {}
  for line in p:lines() do
    if line:sub(1, #prefix) == prefix then out[#out + 1] = line end
  end
  p:close()
  table.sort(out)
  return out
end

-- Load a generated data module in an empty environment (it is a plain `return {...}`).
local function pack_module(member)
  local fn = assert(loadstring(pack_text(member), '=' .. member))
  setfenv(fn, {})
  return fn()
end

local function deep_eq(a, b)
  if type(a) ~= type(b) then return false end
  if type(a) ~= 'table' then return a == b end
  for k, v in pairs(a) do if not deep_eq(v, b[k]) then return false end end
  for k in pairs(b) do if a[k] == nil then return false end end
  return true
end

local function capture_logs(MP)
  local logs = {}
  local orig = MP.log
  MP.log = function(level, msg, ...)
    local ok, s = pcall(string.format, tostring(msg), ...)
    logs[#logs + 1] = level .. ': ' .. (ok and s or tostring(msg))
    return orig(level, msg, ...)
  end
  return logs, function() MP.log = orig end
end

local function any_match(logs, pat)
  for _, l in ipairs(logs) do if l:find(pat, 1, true) then return l end end
  return nil
end

-- ── atlases ─────────────────────────────────────────────────────────────────

describe('MP atlases: the real generated rmh_mp/data/atlases.lua', function()
  local REAL
  local MP, A
  before_each(function()
    REAL = REAL or pack_module('rmh_mp/data/atlases.lua')
    MP = H.fresh()
    A = MP.registry.atlas
  end)
  after_each(H.teardown)

  it('is accepted: no "bad registry", no dropped entry, every entry kept', function()
    local logs, restore = capture_logs(MP)
    expect(A.set_registry(MP.copy(REAL, true))).eq(true)
    restore()
    expect(any_match(logs, 'bad registry')).eq(nil)
    expect(any_match(logs, 'bad entry')).eq(nil)
    expect(A.registry.stub).eq(false)
    local n, want = 0, 0
    for _ in pairs(REAL) do want = want + 1 end
    for key, e in pairs(A.registry.atlases) do
      n = n + 1
      expect(e.kind == 'card' or e.kind == 'animation' or e.kind == 'tag' or e.kind == 'asset').truthy()
      expect(deep_eq(e, REAL[key])).truthy()
    end
    expect(n).eq(want)
    expect(n > 0).truthy()
  end)

  it('matches data/balatro-mp/atlases.json (the wrapped JSON form is accepted too)', function()
    local json = J.decode(read(ROOT .. 'data/balatro-mp/atlases.json'))
    expect(A.set_registry(json)).eq(true)
    local from_json = A.registry.atlases
    expect(A.set_registry(MP.copy(REAL, true))).eq(true)
    for key in pairs(from_json) do expect(A.registry.atlases[key] ~= nil).truthy() end
    for key in pairs(A.registry.atlases) do expect(from_json[key] ~= nil).truthy() end
  end)

  it('carries the four kinds and the ru variant of mp_c_asteroid', function()
    A.set_registry(MP.copy(REAL, true))
    local kinds = {}
    for _, e in pairs(A.registry.atlases) do kinds[e.kind] = true end
    expect(kinds.card and kinds.animation and kinds.tag and kinds.asset).eq(true)
    expect(A.entry('mp_c_asteroid').variants.ru).eq('c_asteroid_ru.png')
    expect(A.entry('mp_player_blind_chip').kind).eq('animation')
  end)

  it('installs from the pack paths, the language variant and animation frames included', function()
    A.set_registry(MP.copy(REAL, true))
    local opened = {}
    _G.love.filesystem = { getInfo = function() return { type = 'file' } end }
    _G.love.graphics = { newImage = function(path) opened[#opened + 1] = path; return { path = path } end }
    G.ASSET_ATLAS = { Joker = { name = 'Joker' }, Tarot = { name = 'Tarot' }, centers = { name = 'centers' },
      stickers = { name = 'stickers' }, tags = { name = 'tags' } }
    G.ANIMATION_ATLAS = { blind_chips = { name = 'blind_chips' } }
    G.SETTINGS.language = 'ru'
    G.SETTINGS.GRAPHICS = { texture_scaling = 2 }
    A.install()
    expect(G.ASSET_ATLAS.mp_c_asteroid.image.path).eq('rmh_mp/assets/2x/c_asteroid_ru.png')
    local chip = G.ANIMATION_ATLAS.mp_player_blind_chip
    expect(chip.image.path).eq('rmh_mp/assets/2x/' .. REAL.mp_player_blind_chip.file)
    expect(chip.frames).eq(REAL.mp_player_blind_chip.frames)
    expect(A.loaded.mp_c_asteroid).eq('image')
    _G.love.filesystem, _G.love.graphics = nil, nil
  end)

  it('boot loads it through require "rmh_mp.data.atlases" without a warning', function()
    package.preload['rmh_mp.data.atlases'] = function() return MP.copy(REAL, true) end
    local logs = {}
    local MP2 = H.boot()          -- MP.log is not reachable before boot: read its ring afterwards
    for _, e in ipairs(MP2.log_ring) do logs[#logs + 1] = e.level .. ': ' .. e.msg end
    package.preload['rmh_mp.data.atlases'] = nil
    package.loaded['rmh_mp.data.atlases'] = nil
    expect(any_match(logs, 'bad registry')).eq(nil)
    expect(any_match(logs, 'atlas registry not found')).eq(nil)
    expect(MP2.registry.atlas.registry.stub).eq(false)
    expect(MP2.registry.atlas.entry('mp_c_asteroid') ~= nil).truthy()
  end)

  it('still rejects what is neither shape, and drops malformed entries', function()
    A.set_registry(MP.copy(REAL, true))
    local logs, restore = capture_logs(MP)
    expect(A.set_registry('nope')).eq(false)
    expect(A.set_registry({ atlases = 5 })).eq(false)
    expect(A.set_registry({ mp_x = 'scalar' })).eq(false)
    restore()
    expect(any_match(logs, 'bad registry') ~= nil).truthy()
    expect(A.entry('mp_c_asteroid') ~= nil).truthy()          -- kept the previous one
    expect(A.set_registry({ mp_ok = { file = 'a.png', px = 1, py = 1, kind = 'asset', placeholder = 'Joker' },
      mp_kind = { file = 'b.png', px = 1, py = 1, kind = 'sprite' },
      mp_var = { file = 'c.png', px = 1, py = 1, kind = 'card', variants = { ru = 3 } },
      nope = { file = 'd.png', px = 1, py = 1, kind = 'card' } })).eq(true)
    expect(A.entry('mp_ok') ~= nil).truthy()
    expect(A.entry('mp_kind')).eq(nil)
    expect(A.entry('mp_var')).eq(nil)
    expect(A.entry('nope')).eq(nil)
  end)
end)

-- ── localization ────────────────────────────────────────────────────────────

describe('MP localization: real rmh_mp/loc/*.lua, English first, per-entry overlay', function()
  local LANGS, TABLES
  local MP, L

  local function load_all()
    if TABLES then return end
    TABLES, LANGS = {}, {}
    for _, member in ipairs(pack_members('rmh_mp/loc/')) do
      local lang = member:match('^rmh_mp/loc/(.+)%.lua$')
      if lang then
        TABLES[lang] = pack_module(member)
        if lang ~= 'en-us' then LANGS[#LANGS + 1] = lang end
      end
    end
  end

  before_each(function()
    load_all()
    MP = H.fresh()
    L = MP.registry.loc
    for lang, t in pairs(TABLES) do
      package.loaded['rmh_mp.loc.' .. lang] = nil
      package.preload['rmh_mp.loc.' .. lang] = function() return t end
    end
  end)
  after_each(function()
    for lang in pairs(TABLES) do
      package.preload['rmh_mp.loc.' .. lang] = nil
      package.loaded['rmh_mp.loc.' .. lang] = nil
    end
    H.teardown()
  end)

  -- every entry: descriptions.<set>.<key> and misc.<section>.<key>
  local function entries(t)
    local out = {}
    for top, sections in pairs(t) do
      for section, list in pairs(sections) do
        for key, v in pairs(list) do out[#out + 1] = { top, section, key, v } end
      end
    end
    return out
  end

  local function at(t, e) return t[e[1]] and t[e[1]][e[2]] and t[e[1]][e[2]][e[3]] end

  it('the pack ships en-us and partial translations', function()
    expect(TABLES['en-us'] ~= nil).truthy()
    expect(#LANGS >= 10).truthy()
  end)

  it('en-us builds to exactly the pack English', function()
    local built = L.build('en-us')
    for _, e in ipairs(entries(TABLES['en-us'])) do
      if not deep_eq(at(built, e), e[4]) then error('en-us entry differs: ' .. table.concat({ e[1], e[2], e[3] }, '.')) end
    end
  end)

  it('every language: a translated entry replaces English whole, a missing one falls back to English', function()
    local en = TABLES['en-us']
    local replaced, fell_back = 0, 0
    for _, lang in ipairs(LANGS) do
      local built = L.build(lang)
      local tr = TABLES[lang]
      for _, e in ipairs(entries(en)) do
        local mine = at(tr, e)
        local got = at(built, e)
        local want = mine ~= nil and mine or e[4]
        if not deep_eq(got, want) then
          error(lang .. ': ' .. table.concat({ e[1], e[2], e[3] }, '.') .. ' is neither the translation nor English')
        end
        if mine ~= nil then replaced = replaced + 1 else fell_back = fell_back + 1 end
      end
      for _, e in ipairs(entries(tr)) do
        if not deep_eq(at(built, e), e[4]) then error(lang .. ': translated entry lost: ' .. e[3]) end
      end
    end
    expect(replaced > 0 and fell_back > 0).truthy()   -- the real files really are partial
  end)

  it('never deep-merges: a shorter translated description or v_text keeps none of the English lines', function()
    local en = TABLES['en-us']
    for _, lang in ipairs(LANGS) do
      local built = L.build(lang)
      for _, e in ipairs(entries(TABLES[lang])) do
        local eng = at(en, e)
        local mine = e[4]
        local lines_mine = type(mine) == 'table' and (mine.text or mine)
        local lines_en = type(eng) == 'table' and (eng.text or eng)
        if type(lines_mine) == 'table' and type(lines_en) == 'table' and #lines_mine < #lines_en then
          local got = at(built, e)
          local gl = got.text or got
          expect(#gl).eq(#lines_mine)
        end
      end
    end
    -- Synthetic guarantee in case no real entry is shorter.
    L.add('en-us', { descriptions = { Joker = { j_mp_synth = { name = 'E', text = { 'a', 'b', 'c' } } } },
      misc = { v_text = { ch_c_mp_synth = { 'x', 'y' } }, dictionary = { k_mp_synth = 'Eng' } } })
    L.add('fr', { descriptions = { Joker = { j_mp_synth = { name = 'F', text = { 'un' } } } },
      misc = { v_text = { ch_c_mp_synth = { 'seul' } } } })
    local fr = L.build('fr')
    expect(fr.descriptions.Joker.j_mp_synth).eq({ name = 'F', text = { 'un' } })
    expect(fr.misc.v_text.ch_c_mp_synth).eq({ 'seul' })
    expect(fr.misc.dictionary.k_mp_synth).eq('Eng')
  end)

  it('a description without `text` in the translation still replaces whole (no English text kept)', function()
    L.add('en-us', { descriptions = { Other = { mp_synth_other = { name = 'E', text = { 'english' } } } } })
    L.add('de', { descriptions = { Other = { mp_synth_other = { name = 'D' } } } })
    expect(L.build('de').descriptions.Other.mp_synth_other).eq({ name = 'D' })
  end)

  it('merge_into adds MP entries for the language and never overwrites vanilla text', function()
    local lang = LANGS[1]
    G.localization.descriptions.Joker.j_joker = { name = 'Joker', text = { 'vanilla' } }
    L.add(lang, { descriptions = { Joker = { j_joker = { name = 'HACK', text = {} } } } })
    L.merge_into(G.localization, lang)
    expect(G.localization.descriptions.Joker.j_joker.name).eq('Joker')
    local built = L.build(lang)
    for _, e in ipairs(entries(TABLES['en-us'])) do
      if e[3] ~= 'j_joker' and not deep_eq(at(G.localization, e), at(built, e)) then
        error('not merged: ' .. e[3])
      end
    end
  end)

  it('an unknown language falls back to English entirely', function()
    local built = L.build('xx')
    for _, e in ipairs(entries(TABLES['en-us'])) do
      if not deep_eq(at(built, e), e[4]) then error('xx: ' .. e[3]) end
    end
  end)
end)
