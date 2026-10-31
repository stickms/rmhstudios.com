-- The REAL base-game scoring with the whole MP pack mounted, for the Score Preview specs
-- (mp_preview_spec.lua). Not a spec itself.
--
-- data/balatro's card.lua, blind.lua, back.lua, functions/{misc_functions,common_events,
-- state_events}.lua and game.lua (core patches applied, spec/core_patches.lua) run on the fake G of
-- spec/fake_g.lua (its event manager, card areas and clocks), with the real prototypes from
-- Game:init_item_prototypes and the LuaJIT-exact math.random. Only drawing is stubbed: Moveable is
-- an empty class, sprites are skipped, and the UI-only calls (sounds, status text, hand text,
-- unlock/career bookkeeping) are recording no-ops — they are what a preview must never call.
--
--   local PW = require 'spec.mp_preview_world'
--   local MP = PW.boot{ resolved = ..., options = ..., kind = 'match' }
--   PW.card('H', 'A', 'm_lucky', {seal=, edition=})   a playing card in G.hand
--   PW.joker('j_mp_pacifist', {edition=})              a joker in G.jokers
--   PW.blind('bl_small')                               G.GAME.blind
--   PW.select({c1, c2})                                highlight cards (G.hand.highlighted)
--   PW.play() -> score, dollars                        the hand played for real (events flushed)
--   PW.fingerprint() -> string                         everything a preview must leave alone
--   PW.calls(name) / PW.reset_calls()                  UI/profile stub calls
--   PW.teardown()

local H = require 'spec.mp_helper'
local P = require 'spec.core_patches'
local fake = H.fake

local PW = {}
local root = (RMH_SPEC and RMH_SPEC.root) or ''

PW.CALLS = {}
local function recorder(name)
  return function() PW.CALLS[name] = (PW.CALLS[name] or 0) + 1 end
end
function PW.calls(name) return PW.CALLS[name] or 0 end
function PW.reset_calls() PW.CALLS = {} end

PW.UI = { 'play_sound', 'attention_text', 'card_eval_status_text', 'update_hand_text', 'delay', 'juice_card',
  'juice_card_until', 'highlight_card', 'play_area_status_text', 'check_for_unlock', 'inc_career_stat',
  'check_and_set_high_score', 'unlock_card', 'discover_card', 'save_run', 'stop_use', 'set_hand_usage_profile' }

local lr_chunk
local function luajit()
  package.preload['rmh/u32'] = package.preload['rmh/u32'] or assert(loadfile(root .. 'lib/balatro/lua/u32.lua'))
  lr_chunk = lr_chunk or assert(loadfile(root .. 'lib/balatro/lua/luajit_random.lua'))
  -- The game's require name: preview/sim.lua loads a private instance through it.
  package.preload['rmh/luajit_random'] = function() return lr_chunk() end
  local lr = lr_chunk()
  PW.saved_random = PW.saved_random or { math.random, math.randomseed }
  math.random, math.randomseed = lr.random, lr.randomseed
  PW.game_rng = lr
end

local function load_vanilla()
  _G.Moveable = Object:extend()
  function Moveable:init(x, y, w, h)
    G.ID = (G.ID or 1) + 1
    self.ID = G.ID
    self.T = { x = x or 0, y = y or 0, w = w or 1, h = h or 1, r = 0, scale = 1 }
    self.VT = { x = x or 0, y = y or 0, w = w or 1, h = h or 1, r = 0, scale = 1 }
    self.states = { visible = true, collide = {}, hover = {}, click = {}, drag = {}, focus = {}, release_on = {} }
    self.children = {}
  end
  function Moveable:juice_up() end
  function Moveable:remove() end
  for _, f in ipairs({ 'card.lua', 'blind.lua', 'back.lua', 'functions/state_events.lua' }) do
    P.loadfile(f)()
  end
  -- Sprites are drawing: an empty stand-in per child Card:init touches.
  Card.set_sprites = function(self)
    self.children = self.children or {}
    for _, k in ipairs({ 'back', 'center' }) do self.children[k] = self.children[k] or { VT = {} } end
  end
  Card.juice_up = function() end
end

local function noop() end

function PW.boot(opts)
  opts = opts or {}
  if rawget(_G, 'MP') and MP.hooks then MP.hooks.remove_all() end
  for k in pairs(package.loaded) do
    if k:sub(1, 7) == 'rmh_mp.' or k == 'rmh_mp' then package.loaded[k] = nil end
  end
  _G.MP, _G.RMH_MP = nil, nil
  local G = fake.install({ empty = true })
  luajit()
  P.loadfile('engine/object.lua')()
  P.loadfile('functions/misc_functions.lua')()
  P.loadfile('functions/common_events.lua')()
  P.loadfile('game.lua')()
  -- What Game:init_item_prototypes reads from the platform.
  _G.love = { filesystem = { getInfo = function() return true end, createDirectory = noop, append = noop },
    timer = { getTime = function() return G.TIMERS.REAL end } }
  _G.convert_save_to_meta = noop
  _G.get_compressed = function() return 'return {}' end
  _G.STR_UNPACK = function() return { unlocked = {}, discovered = {}, alerted = {} } end
  G.CHALLENGES = { { id = 'c_omelette_1', name = 'Omelette' } }
  G.save_progress = noop
  Game.init_item_prototypes(G)
  load_vanilla()
  G.C.SUITS = { Hearts = { 1, 0, 0, 1 }, Diamonds = { 1, 0.5, 0, 1 }, Spades = { 0, 0, 0, 1 }, Clubs = { 0, 0, 1, 1 } }
  G.C.DYN_UI = { BOSS_MAIN = { 0, 0, 0, 1 }, BOSS_DARK = { 0, 0, 0, 1 }, MAIN = { 0, 0, 0, 1 } }
  for _, name in ipairs(PW.UI) do _G[name] = recorder(name) end
  -- A set_hand_usage without the profile write (the reference play still counts the run's).
  _G.set_hand_usage = function(hand)
    PW.CALLS.set_hand_usage = (PW.CALLS.set_hand_usage or 0) + 1
    local key = hand:gsub('%s+', '')
    local u = G.GAME.hand_usage
    if u[key] then u[key].count = u[key].count + 1 else u[key] = { count = 1, order = hand } end
  end
  -- Vanilla's ease_dollars minus the HUD: a queued change lands when its event runs.
  _G.ease_dollars = function(mod, instant)
    local function apply() G.GAME.dollars = G.GAME.dollars + mod end
    if instant then apply() else G.E_MANAGER:add_event(Event({ func = function() apply(); return true end })) end
  end
  _G.find_joker = _G.find_joker -- real (misc_functions)
  G.GAME = Game.init_game_object(G)
  G.GAME.stake = 1
  local seed = opts.seed or 'PREVIEW1'
  G.GAME.pseudorandom.seed = seed
  for k, v in pairs(G.GAME.pseudorandom) do if v == 0 then G.GAME.pseudorandom[k] = pseudohash(k .. seed) end end
  G.GAME.pseudorandom.hashed_seed = pseudohash(seed)
  G.GAME.selected_back = Back(G.P_CENTERS[opts.back or 'b_red'])
  G.GAME.current_round.hands_left = 4
  G.GAME.current_round.discards_left = 3
  G.GAME.dollars = 10
  G.GAME.chips = 0
  G.playing_cards = {}
  for _, a in ipairs({ 'hand', 'play', 'jokers', 'consumeables', 'deck', 'discard' }) do
    local area = G[a]
    area.highlighted = {}
    function area:add_to_highlighted(card) self.highlighted[#self.highlighted + 1] = card; card.highlighted = true end
  end
  -- The Hook's real discard: a card moves when its draw event runs (as vanilla's draw_card).
  _G.draw_card = function(from, to, _, _, _, card)
    G.E_MANAGER:add_event(Event({ func = function()
      for i = #from.highlighted, 1, -1 do if from.highlighted[i] == card then table.remove(from.highlighted, i) end end
      card.highlighted = false
      from:remove_card(card)
      to:emplace(card)
      return true
    end }))
  end
  -- Drawing-only calls inside events and blind/card animations.
  _G.ease_colour = noop
  G.CARD_W, G.CARD_H = 2.4 * 35 / 41, 2.4 * 47 / 41
  G.C.UI_CHIPS, G.C.UI_MULT = { 0, 0, 1, 1 }, { 1, 0, 0, 1 }
  local function gone(self) if self.area then self.area:remove_card(self) end; self.REMOVED = true end
  Card.shatter, Card.start_dissolve = gone, gone
  local uie = setmetatable({}, { __index = function() return noop end })
  G.HUD_blind = { get_UIE_by_ID = function() return uie end }
  G.I = { CARD = {}, NODE = {}, MOVEABLE = {}, SPRITE = {}, UIBOX = {}, POPUP = {}, CARDAREA = {}, ALERT = {} }
  G.CONTROLLER.save_cardarea_focus = noop
  G.CONTROLLER.focused = {}
  G.discard.config.card_limit = 500
  G.jokers.config.type = 'joker'
  G.hand.config.card_limit = 8
  G.HUD = nil
  G.UIT = { T = 1, B = 2, C = 3, R = 4, O = 5, ROOT = 7, S = 8, I = 9, padding = 0 }
  G.STATE = G.STATES.SELECTING_HAND

  require 'rmh_mp.init'
  H.transport()
  local MP = _G.MP
  MP.session.launcher = function() return true end
  local info = {
    runId = 'run1', seed = seed, stake = 1, deck = 'b_red',
    shape = { nemesisPairing = true, manhunt = false, teamBased = false },
    options = H.options(opts.options), resolved = H.resolved(opts.resolved or { layers = { 'standard' } }),
    roster = { { id = 'u1', name = 'Me', blindCol = 1 }, { id = 'u2', name = 'Them', blindCol = 2 } },
    hostId = 'u1', me = 'u1', contentHash = 'x',
  }
  MP.session.mount(opts.kind or 'match', info)
  MP.state.lives = { u1 = 4, u2 = 4 }
  MP.state.target = 'u2'
  MP.state.enemy.lives = 4
  PW.blind(opts.blind or 'bl_small')
  PW.n = 0
  return MP, G
end

local RANKS = { ['2'] = '2', ['3'] = '3', ['4'] = '4', ['5'] = '5', ['6'] = '6', ['7'] = '7', ['8'] = '8', ['9'] = '9',
  T = 'T', J = 'J', Q = 'Q', K = 'K', A = 'A' }

local function new_card(x)
  PW.n = PW.n + 1
  return setmetatable({ T = { x = x or PW.n, y = 0, w = 1, h = 1 }, VT = { x = 0, y = 0, w = 1, h = 1, r = 0, scale = 1 },
    params = {}, config = { card = {} }, states = { visible = true, drag = { can = true } }, children = {}, sort_id = PW.n,
    facing = 'front', sprite_facing = 'front', unique_val = 1 - PW.n / 1603301 }, Card)
end

function PW.card(suit, rank, enh, o)
  o = o or {}
  local c = new_card(o.x)
  c:set_base(G.P_CARDS[suit .. '_' .. RANKS[rank]], true)
  c:set_ability(G.P_CENTERS[enh or 'c_base'], true)
  c.playing_card = PW.n
  if o.seal then c.seal = o.seal end
  if o.edition then c:set_edition(o.edition, true, true) end
  G.playing_cards[#G.playing_cards + 1] = c
  G[o.area or 'hand']:emplace(c)
  return c
end

function PW.joker(key, o)
  o = o or {}
  local center = assert(G.P_CENTERS[key], 'no center ' .. key)
  local c = new_card()
  c:set_base({}, true)
  c:set_ability(center, true)
  c.base_cost = center.cost or 1
  if o.edition then c:set_edition(o.edition, true, true) end
  G[o.area or 'jokers']:emplace(c)
  c:add_to_deck()
  return c
end

function PW.blind(key, o)
  o = o or {}
  local proto = assert(G.P_BLINDS[key], 'no blind ' .. key)
  local b = setmetatable({ name = proto.name, config = { blind = proto }, debuff = {}, disabled = false,
    chips = o.chips or 300, mult = proto.mult, dollars = proto.dollars, triggered = false, hands = {},
    only_hand = false, T = { x = 0, y = 0, w = 1, h = 1 },
    children = { animatedSprite = setmetatable({}, { __index = function() return noop end }) } }, Blind)
  for k, v in pairs(proto.debuff or {}) do b.debuff[k] = v end
  for _, h in ipairs(G.handlist or {}) do b.hands[h] = false end
  G.GAME.blind = b
  return b
end

function PW.select(cards)
  for i = #G.hand.highlighted, 1, -1 do G.hand.highlighted[i].highlighted = nil; G.hand.highlighted[i] = nil end
  for _, c in ipairs(cards) do
    c.highlighted = true
    G.hand.highlighted[#G.hand.highlighted + 1] = c
  end
end

--- The hand played for real: what play_cards_from_highlighted does before evaluate_play, the
--- boss's press_play with its events run, then evaluate_play with every event run. Returns the
--- round score and the money it added.
function PW.play()
  local chips0, dollars0 = G.GAME.chips, G.GAME.dollars
  local played = {}
  for _, c in ipairs(G.hand.highlighted) do played[#played + 1] = c end
  table.sort(played, function(a, b) return a.T.x < b.T.x end)
  G.GAME.blind.triggered = false
  for _, c in ipairs(G.playing_cards) do c.ability.forced_selection = nil end
  G.GAME.current_round.hands_left = G.GAME.current_round.hands_left - 1
  for _, c in ipairs(played) do
    c.base.times_played = c.base.times_played + 1
    c.ability.played_this_ante = true
    G.GAME.round_scores.cards_played.amt = G.GAME.round_scores.cards_played.amt + 1
    G.hand:remove_card(c)
    c.highlighted = false
    G.play:emplace(c)
  end
  for i = #G.hand.highlighted, 1, -1 do G.hand.highlighted[i] = nil end
  G.STATE = G.STATES.HAND_PLAYED
  G.GAME.blind:press_play()
  fake.flush()
  G.FUNCS.evaluate_play()
  fake.flush()
  return G.GAME.chips - chips0, G.GAME.dollars - dollars0
end

--- A deterministic dump of everything a preview must not change.
function PW.fingerprint()
  local out, seen = {}, {}
  local function keys(t)
    local ks = {}
    for k in pairs(t) do ks[#ks + 1] = k end
    table.sort(ks, function(a, b) return tostring(a) < tostring(b) end)
    return ks
  end
  local function dump(v, path, depth)
    if type(v) ~= 'table' then
      out[#out + 1] = path .. '=' .. tostring(v)
      return
    end
    if seen[v] or depth > 12 or getmetatable(v) and depth > 0 and v ~= G.GAME.blind then
      out[#out + 1] = path .. '=<ref ' .. tostring(rawget(v, 'sort_id') or rawget(v, 'key') or rawget(v, 'name') or '') .. '>'
      return
    end
    seen[v] = true
    for _, k in ipairs(keys(v)) do
      local x = v[k]
      if type(x) ~= 'function' and not (type(x) == 'table' and (x == G.P_CENTERS[x.key or ''] or x == G.C)) then
        dump(x, path .. '.' .. tostring(k), depth + 1)
      end
    end
  end
  dump(G.GAME, 'GAME', 0)
  seen[G.GAME.blind] = nil
  dump(G.GAME.blind, 'blind', 0)
  for _, a in ipairs({ 'hand', 'play', 'jokers', 'consumeables', 'deck', 'discard' }) do
    local area = G[a]
    local ids = {}
    for i, c in ipairs(area.cards) do ids[i] = tostring(c.sort_id) end
    out[#out + 1] = a .. '=' .. table.concat(ids, ',')
    local hl = {}
    for i, c in ipairs(area.highlighted or {}) do hl[i] = tostring(c.sort_id) end
    out[#out + 1] = a .. '.hl=' .. table.concat(hl, ',')
    for i, c in ipairs(area.cards) do
      seen[c] = nil
      dump(c, a .. '[' .. i .. ']', 0)
    end
  end
  dump(MP.state, 'MP', 0)
  out[#out + 1] = 'hand_chips=' .. tostring(rawget(_G, 'hand_chips')) .. ' mult=' .. tostring(rawget(_G, 'mult'))
  out[#out + 1] = 'STATE=' .. tostring(G.STATE)
  out[#out + 1] = 'events=' .. G.E_MANAGER:pending()
  return table.concat(out, '\n')
end

function PW.teardown()
  if rawget(_G, 'MP') and MP.hooks then MP.hooks.remove_all() end
  fake.uninstall()
  if PW.saved_random then math.random, math.randomseed = PW.saved_random[1], PW.saved_random[2] end
  PW.saved_random = nil
  package.preload['rmh/luajit_random'] = nil
  package.loaded['rmh/luajit_random'] = nil
end

PW.fake = fake
return PW
