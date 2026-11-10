-- The base game as the core pack ships it: data/balatro Lua with the anchored patches of
-- scripts/balatro/core-patches.json applied, exactly as scripts/balatro/build-game-pack.py
-- applies them (in order; each anchor must occur exactly once). Not a spec itself.
--
--   local P = require 'spec.core_patches'
--   P.list()                     -> { {id, why, path, anchor, replacement}, ... }
--   P.source('card.lua')         -> the patched text of data/balatro/card.lua
--   P.loadfile('card.lua')       -> a chunk of it (chunkname @data/balatro/card.lua)
--   P.localization('de')         -> the patched localization table of one language
--   P.languages()                -> every language file in data/balatro/localization, sorted

local J = require 'rmh/json'

local P = {}

local root = (RMH_SPEC and RMH_SPEC.root) or ''
local BASE = root .. 'data/balatro/'

local function read(path)
  local f = assert(io.open(path, 'rb'), 'cannot open ' .. path)
  local s = f:read('*a')
  f:close()
  return s
end

local list
function P.list()
  if not list then list = J.decode(read(root .. 'scripts/balatro/core-patches.json')).patches end
  return list
end

--- Occurrences of `needle` in `s` (plain text).
local function count(s, needle)
  local n, at = 0, 1
  while true do
    local i, j = s:find(needle, at, true)
    if not i then return n end
    n, at = n + 1, j + 1
  end
end
P.count = count

function P.apply(path, text)
  for _, p in ipairs(P.list()) do
    if p.path == path then
      local n = count(text, p.anchor)
      if n ~= 1 then error(('core patch %s: anchor found %d times in %s, expected once'):format(p.id, n, path)) end
      local i, j = text:find(p.anchor, 1, true)
      text = text:sub(1, i - 1) .. p.replacement .. text:sub(j + 1)
    end
  end
  return text
end

function P.source(path) return P.apply(path, read(BASE .. path)) end

function P.loadfile(path)
  return assert(loadstring(P.source(path), '@data/balatro/' .. path))
end

function P.languages()
  local out = {}
  local p = io.popen('ls -1 "' .. BASE .. 'localization" 2>/dev/null')
  if p then
    for name in p:lines() do
      local lang = name:match('^(.+)%.lua$')
      if lang then out[#out + 1] = lang end
    end
    p:close()
  end
  table.sort(out)
  return out
end

function P.localization(lang)
  local chunk = P.loadfile('localization/' .. lang .. '.lua')
  setfenv(chunk, {})
  return chunk()
end

return P
