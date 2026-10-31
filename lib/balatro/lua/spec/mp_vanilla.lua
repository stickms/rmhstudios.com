-- The REAL base game's prototype/pool/RNG code under plain lua5.1, for the WS6 determinism specs
-- (golden-seed isolation, OR-07 profile independence, The Order). Not a spec itself.
--
-- Loads data/balatro/{engine/object,functions/misc_functions,functions/common_events,game}.lua as the
-- core pack ships them (the anchored patches of scripts/balatro/core-patches.json applied, via
-- spec/core_patches.lua) — top-level code there only defines functions — then builds G with Game:init_item_prototypes
-- (meta.jkr replaced by `opts.meta`) and G.GAME with Game:init_game_object. Rolls go through the
-- game's own get_current_pool / pseudoseed / pseudorandom_element / get_new_boss /
-- get_next_tag_key / get_next_voucher_key, mirroring create_card's pool path.
--
--   local V = require 'spec.mp_vanilla'
--   V.install{ meta = { unlocked = {...}, discovered = {...} } }   -> G
--   V.new_run(seed, opts)          fresh G.GAME seeded like Game:start_run
--   V.golden(seed)                 -> string digest of shops, bosses, tags and vouchers
--   V.uninstall()

local V = {}

local root = (RMH_SPEC and RMH_SPEC.root) or ''

local P = require 'spec.core_patches'

local function load_into_globals(path)
  P.loadfile(path)()
end

local function noop() end

local saved_random, saved_randomseed

--- The web build's bit-exact LuaJIT math.random (rmh_web.lua §0), so seeds behave as in the game.
local function install_luajit_random()
  package.preload['rmh/u32'] = package.preload['rmh/u32'] or assert(loadfile(root .. 'lib/balatro/lua/u32.lua'))
  local lr = assert(loadfile(root .. 'lib/balatro/lua/luajit_random.lua'))()
  saved_random, saved_randomseed = math.random, math.randomseed
  math.random, math.randomseed = lr.random, lr.randomseed
end

function V.install(opts)
  opts = opts or {}
  install_luajit_random()
  load_into_globals('engine/object.lua')
  load_into_globals('functions/misc_functions.lua')
  load_into_globals('functions/common_events.lua')
  load_into_globals('game.lua')
  -- Platform stubs init_item_prototypes touches.
  local meta = opts.meta or {}
  _G.love = {
    filesystem = { getInfo = function() return true end, createDirectory = noop, append = noop },
    timer = { getTime = function() return 0 end },
  }
  _G.convert_save_to_meta = noop
  _G.get_compressed = function() return 'return {}' end
  _G.STR_UNPACK = function() return { unlocked = meta.unlocked or {}, discovered = meta.discovered or {}, alerted = {} } end
  _G.sendDebugMessage, _G.sendWarnMessage = noop, noop
  _G.find_joker = function() return {} end   -- no Showman held
  local G = setmetatable({}, { __index = Game })
  _G.G = G
  G.SETTINGS = { profile = 1, GAMESPEED = 1, tutorial_complete = true, language = 'en-us', paused = false }
  G.PROFILES = { { name = 'P1' } }
  G.ARGS = {}
  G.FUNCS = {}
  G.STATES = { SELECTING_HAND = 1, HAND_PLAYED = 2, DRAW_TO_HAND = 3, GAME_OVER = 4, SHOP = 5, PLAY_TAROT = 6,
    BLIND_SELECT = 7, ROUND_EVAL = 8, TAROT_PACK = 9, PLANET_PACK = 10, MENU = 11, TUTORIAL = 12, SPLASH = 13,
    SANDBOX = 14, SPECTRAL_PACK = 15, DEMO_CTA = 16, STANDARD_PACK = 17, BUFFOON_PACK = 18, NEW_ROUND = 19 }
  G.STATE = G.STATES.BLIND_SELECT
  G.CONTROLLER = { locked = false, locks = {} }
  G.E_MANAGER = { queues = { base = {} }, add_event = noop }
  G.save_progress = noop
  G.localization = { descriptions = {}, misc = { dictionary = {}, v_dictionary = {}, labels = {} } }
  G.C = setmetatable({}, { __index = function() return { 1, 1, 1, 1 } end })
  _G.HEX = function() return { 1, 1, 1, 1 } end
  G.CHALLENGES = { { id = 'c_omelette_1' } }
  Game.init_item_prototypes(G)
  return G
end

local shop_jokers_area = {}
local pack_area = {}

--- A new run's G.GAME, seeded the way Game:start_run seeds it (stake chain omitted: stake 1).
function V.new_run(seed, opts)
  opts = opts or {}
  local G = _G.G
  G.GAME = Game.init_game_object(G)
  G.GAME.stake = 1
  G.GAME.modifiers = G.GAME.modifiers or {}
  if opts.before_seed then opts.before_seed(G.GAME) end
  G.GAME.pseudorandom.seed = seed
  for k, v in pairs(G.GAME.pseudorandom) do if v == 0 then G.GAME.pseudorandom[k] = pseudohash(k .. seed) end end
  G.GAME.pseudorandom.hashed_seed = pseudohash(seed)
  G.GAME.round_resets.blind_tags = {}
  G.playing_cards = {}
  G.shop_jokers = shop_jokers_area
  G.pack_cards = pack_area
  G.jokers = { cards = {} }
  return G.GAME
end

--- create_card's pool path for one card of `_type` (no Card object).
function V.roll(_type, append, rarity)
  local pool, key = get_current_pool(_type, rarity, nil, append)
  local center = pseudorandom_element(pool, pseudoseed(key))
  local it = 1
  while center == 'UNAVAILABLE' do
    it = it + 1
    center = pseudorandom_element(pool, pseudoseed(key .. '_resample' .. it))
  end
  return center
end

--- The digest the L1 golden-seed spec compares: first 3 shops (cdt roll + card), 3 boss
--- choices, 6 tags and 3 vouchers, over antes 1..3.
function V.golden(seed, opts)
  V.new_run(seed, opts)
  local out = {}
  local GAME = _G.G.GAME
  for ante = 1, 3 do
    GAME.round_resets.ante = ante
    out[#out + 1] = 'boss' .. ante .. '=' .. tostring(get_new_boss())
    out[#out + 1] = 'voucher' .. ante .. '=' .. tostring(get_next_voucher_key())
    out[#out + 1] = 'tags' .. ante .. '=' .. tostring(get_next_tag_key()) .. ',' .. tostring(get_next_tag_key())
    local shop = {}
    for slot = 1, 4 do
      local rate = pseudorandom(pseudoseed('cdt' .. ante))
      local t = rate < 0.7 and 'Joker' or (rate < 0.85 and 'Tarot' or 'Planet')
      shop[slot] = t .. ':' .. tostring(V.roll(t, 'sho'))
    end
    out[#out + 1] = 'shop' .. ante .. '=' .. table.concat(shop, ',')
    out[#out + 1] = 'spectral' .. ante .. '=' .. tostring(V.roll('Spectral', 'spe'))
  end
  return table.concat(out, '\n')
end

function V.uninstall()
  _G.G = nil
  if saved_random then math.random, math.randomseed = saved_random, saved_randomseed end
end

return V
