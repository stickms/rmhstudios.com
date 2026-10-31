-- Shared setup for the WS6 MP-core specs (mp_*_spec.lua). Not a spec itself.
--
--   local H = require 'spec.mp_helper'
--   local MP = H.fresh()            -- fake G + a clean MP core (registry empty, no wraps)
--   H.transport()                   -- loopback transport; H.sent() lists what Lua sent
--   H.resolved{ layers = {...} }    -- a ResolvedRuleset with defaults
--   H.teardown()

local fake = require 'spec.fake_g'

local H = {}

-- `require 'rmh_mp.registry'` is rmh_mp/registry/init.lua (LÖVE's require path has ?/init.lua).
do
  local root = (RMH_SPEC and RMH_SPEC.root) or ''
  local extra = root .. 'lib/balatro/lua/mp/?/init.lua'
  if not package.path:find(extra, 1, true) then package.path = extra .. ';' .. package.path end
end

local MODULES = {
  'rmh_mp.state', 'rmh_mp.util.wrap', 'rmh_mp.util.fmt', 'rmh_mp.util.rng', 'rmh_mp.util.tree',
  'rmh_mp.util.codec', 'rmh_mp.net', 'rmh_mp.registry', 'rmh_mp.registry.pools',
  'rmh_mp.registry.dispatch', 'rmh_mp.registry.atlas', 'rmh_mp.registry.loc',
}

function H.fresh(opts)
  opts = opts or {}
  if rawget(_G, 'MP') and MP.hooks then MP.hooks.remove_all() end
  for k in pairs(package.loaded) do
    if k:sub(1, 7) == 'rmh_mp.' or k == 'rmh_mp' then package.loaded[k] = nil end
  end
  _G.MP, _G.RMH_MP = nil, nil
  local G = fake.install(opts)
  G.CHALLENGES = { { id = 'c_omelette_1', name = 'Omelette' } }
  for _, m in ipairs(MODULES) do require(m) end
  return _G.MP, G
end

function H.load(name) return require(name) end

--- Fresh fake G, then the whole pack through rmh_mp/init.lua (content modules absent -> reference).
function H.boot(opts)
  opts = opts or {}
  if rawget(_G, 'MP') and MP.hooks then MP.hooks.remove_all() end
  for k in pairs(package.loaded) do
    if k:sub(1, 7) == 'rmh_mp.' or k == 'rmh_mp' then package.loaded[k] = nil end
  end
  _G.MP, _G.RMH_MP = nil, nil
  local G = fake.install(opts)
  G.CHALLENGES = { { id = 'c_omelette_1', name = 'Omelette' } }
  if opts.before then opts.before(G) end
  require 'rmh_mp.init'
  return _G.MP, G
end

H.sent_list = {}
function H.transport()
  H.sent_list = {}
  local handlers = {}
  local tr = {
    send = function(t, d) H.sent_list[#H.sent_list + 1] = { t = t, d = d } end,
    on = function(t, fn) handlers[t] = fn end,
    handlers = handlers,
  }
  MP.net.bind(tr)
  return tr
end

--- Sent messages (after a flush), optionally filtered by type.
function H.sent(t)
  MP.net.flush()
  if not t then return H.sent_list end
  local out = {}
  for _, m in ipairs(H.sent_list) do if m.t == t then out[#out + 1] = m end end
  return out
end

--- Game events sent so far, as a list of event tables.
function H.events(kind)
  local out = {}
  for _, m in ipairs(H.sent('ev')) do
    if not kind or m.d.e.t == kind then out[#out + 1] = m.d.e end
  end
  return out
end

function H.resolved(over)
  local r = {
    key = 'ruleset_mp_balanced', layers = {}, multiplayerContent = true, banned = {}, bannedSilent = {},
    included = {}, reworked = {}, spectralBannedEnhancements = {}, stickers = {}, gameModifiers = {},
    startingParams = {}, setupHooks = {},
    flags = { theOrder = true, enemyLocationDisabled = false, timerDisplayThreshold = nil, comeback = 'default' },
    timer = { enabled = false, base = 150, increment = 60, forgiveness = 0, pvpBase = nil, pvpHandIncrement = 0,
      mode = 'default', pressurePlusHand = 0, countdown = 3, mult = 1 },
  }
  for k, v in pairs(over or {}) do r[k] = v end
  return r
end

function H.options(over)
  local o = {
    ruleset = 'ruleset_mp_balanced', gamemode = 'gamemode_mp_attrition', trapCards = false,
    manhuntHunterLives = 7, startingLives = 4, pvpStartRound = 2, timer = true, timerBaseSeconds = 150,
    timerIncrementSeconds = 60, timerForgiveness = 0, pvpCountdownSeconds = 3, deathOnRoundLoss = true,
    goldOnLifeLoss = true, noGoldOnRoundLoss = false, customSeed = 'random', theOrder = true,
    hideScoreUntilPlayed = false, normalBosses = false, differentSeeds = false, differentDecks = false,
    randomLoadout = false, multiplayerJokers = true, modifierLayers = {}, seatGraceMs = 120000,
  }
  for k, v in pairs(over or {}) do o[k] = v end
  return o
end

--- A deep, order-preserving fingerprint of every vanilla prototype table and pool.
function H.fingerprint()
  local parts = {}
  local function keys(t)
    local ks = {}
    for k in pairs(t) do ks[#ks + 1] = k end
    table.sort(ks, function(a, b) return tostring(a) < tostring(b) end)
    return ks
  end
  for _, name in ipairs({ 'P_CENTERS', 'P_BLINDS', 'P_TAGS' }) do
    parts[#parts + 1] = name .. '=' .. table.concat(keys(G[name]), ',')
  end
  for _, name in ipairs(keys(G.P_CENTER_POOLS)) do
    local list = G.P_CENTER_POOLS[name]
    local ks = {}
    for i, v in ipairs(list) do ks[i] = tostring(v.key) .. '@' .. tostring(v) end
    parts[#parts + 1] = 'pool.' .. name .. '=' .. table.concat(ks, ',')
  end
  for i = 1, #G.P_JOKER_RARITY_POOLS do
    local ks = {}
    for j, v in ipairs(G.P_JOKER_RARITY_POOLS[i]) do ks[j] = tostring(v.key) .. '@' .. tostring(v) end
    parts[#parts + 1] = 'rarity.' .. i .. '=' .. table.concat(ks, ',')
  end
  local ch = {}
  for i, c in ipairs(G.CHALLENGES or {}) do ch[i] = tostring(c.id) end
  parts[#parts + 1] = 'challenges=' .. table.concat(ch, ',')
  return table.concat(parts, '\n')
end

function H.teardown()
  if rawget(_G, 'MP') and MP.hooks then MP.hooks.remove_all() end
  fake.uninstall()
end

H.fake = fake
return H
