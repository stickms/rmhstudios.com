-- A minimal stand-in for Balatro's globals, for Lua L1 specs (PLAN §4 WS0, §6.1).
--
--   local fake = require 'spec.fake_g'
--   local G = fake.install()          -- fresh G + Event/EventManager/pseudoseed/... globals
--   fake.add_center('j_mp_pizza', { set = 'Joker', rarity = 1, order = 1001 })
--   G.E_MANAGER:add_event(Event({ func = function() ...; return true end }))
--   fake.flush()                      -- run the event queues until empty
--   fake.advance(0.5)                 -- move the clocks, then process one step
--   fake.uninstall()
--
-- Shapes follow the real game (data/balatro/globals.lua, game.lua, engine/event.lua)
-- closely enough for pool, registry, hook and defer logic: G.STATES, G.P_CENTERS,
-- G.P_CENTER_POOLS (sorted by `order` like Game:init_item_prototypes), G.P_JOKER_RARITY_POOLS,
-- G.P_BLINDS, G.P_TAGS, G.GAME, G.CONTROLLER, card areas, localization tables and an
-- event manager with the vanilla blocking/blockable rules. It never draws anything.
-- The runner removes every global this installs after each spec file.

local M = {}

local STATES = {
  SELECTING_HAND = 1, HAND_PLAYED = 2, DRAW_TO_HAND = 3, GAME_OVER = 4, SHOP = 5,
  PLAY_TAROT = 6, BLIND_SELECT = 7, ROUND_EVAL = 8, TAROT_PACK = 9, PLANET_PACK = 10,
  MENU = 11, TUTORIAL = 12, SPLASH = 13, SANDBOX = 14, SPECTRAL_PACK = 15, DEMO_CTA = 16,
  STANDARD_PACK = 17, BUFFOON_PACK = 18, NEW_ROUND = 19,
}

local POOL_NAMES = {
  'Booster', 'Default', 'Enhanced', 'Edition', 'Joker', 'Tarot', 'Planet', 'Tarot_Planet',
  'Spectral', 'Consumeables', 'Voucher', 'Back', 'Tag', 'Seal', 'Stake', 'Demo',
}

-- A handful of vanilla prototypes, enough for pool and ban logic.
local SAMPLE_CENTERS = {
  j_joker = { set = 'Joker', rarity = 1, order = 1, cost = 2, name = 'Joker' },
  j_greedy_joker = { set = 'Joker', rarity = 1, order = 2, cost = 5, name = 'Greedy Joker' },
  j_hanging_chad = { set = 'Joker', rarity = 1, order = 62, cost = 4, name = 'Hanging Chad' },
  j_mr_bones = { set = 'Joker', rarity = 2, order = 98, cost = 5, name = 'Mr. Bones' },
  j_cavendish = { set = 'Joker', rarity = 1, order = 61, cost = 4, name = 'Cavendish' },
  j_gros_michel = { set = 'Joker', rarity = 1, order = 40, cost = 5, name = 'Gros Michel' },
  j_chicot = { set = 'Joker', rarity = 4, order = 149, cost = 20, name = 'Chicot' },
  c_wraith = { set = 'Spectral', order = 5, cost = 4, name = 'Wraith' },
  c_ouija = { set = 'Spectral', order = 7, cost = 4, name = 'Ouija' },
  c_fool = { set = 'Tarot', order = 1, cost = 3, name = 'The Fool' },
  c_mercury = { set = 'Planet', order = 1, cost = 3, name = 'Mercury' },
  v_overstock_norm = { set = 'Voucher', order = 1, cost = 10, name = 'Overstock' },
  v_hieroglyph = { set = 'Voucher', order = 29, cost = 10, name = 'Hieroglyph' },
  v_petroglyph = { set = 'Voucher', order = 30, cost = 10, name = 'Petroglyph', requires = { 'v_hieroglyph' } },
  b_red = { set = 'Back', order = 1, name = 'Red Deck' },
  b_blue = { set = 'Back', order = 2, name = 'Blue Deck' },
  m_glass = { set = 'Enhanced', order = 6, name = 'Glass Card', config = { Xmult = 2, extra = 4 } },
  p_standard_normal_1 = { set = 'Booster', order = 1, name = 'Standard Pack', weight = 1, kind = 'Standard' },
  c_base = { set = 'Default', order = 1, name = 'Default Base' },
}

local SAMPLE_BLINDS = {
  bl_small = { name = 'Small Blind', order = 1, dollars = 3, mult = 1 },
  bl_big = { name = 'Big Blind', order = 2, dollars = 4, mult = 1.5 },
  bl_wall = { name = 'The Wall', order = 12, dollars = 5, mult = 4, boss = { min = 2, max = 10 } },
  bl_final_vessel = { name = 'Violet Vessel', order = 29, dollars = 8, mult = 6, boss = { showdown = true, min = 10, max = 10 } },
}

local SAMPLE_TAGS = {
  tag_uncommon = { name = 'Uncommon Tag', order = 1, min_ante = nil },
  tag_rare = { name = 'Rare Tag', order = 2 },
  tag_boss = { name = 'Boss Tag', order = 20 },
}

local function copy(t)
  if type(t) ~= 'table' then return t end
  local o = {}
  for k, v in pairs(t) do o[k] = copy(v) end
  return o
end

local function colour(r, g, b, a) return { r, g, b, a or 1 } end

-- ── Event / EventManager (vanilla semantics, simplified timing) ──────────────

local EventMT = {}
EventMT.__index = EventMT
function EventMT:is(cls) return cls == Event end

local function new_event(config)
  config = config or {}
  local e = setmetatable({}, EventMT)
  e.trigger = config.trigger or 'immediate'
  e.blocking = config.blocking ~= false
  e.blockable = config.blockable ~= false
  e.complete = false
  e.func = config.func or function() return true end
  e.delay = config.delay or 0
  e.no_delete = config.no_delete
  e.timer = config.timer or 'TOTAL'
  e.ref_table, e.ref_value = config.ref_table, config.ref_value
  e.ease_to, e.stop_val = config.ease_to, config.stop_val
  if e.trigger == 'condition' and not config.func then
    e.func = function() return e.ref_table[e.ref_value] == e.stop_val end
  end
  return e
end

local function handle(e, now)
  -- returns blocking, completed
  if not e.start then e.start = now end
  local elapsed = now - e.start
  if e.trigger == 'after' then
    if elapsed >= e.delay then return e.blocking, not not e.func() end
    return e.blocking, false
  elseif e.trigger == 'before' then
    if not e.fired then
      e.fired = true
      e.func()
    end
    return e.blocking, elapsed >= e.delay
  elseif e.trigger == 'ease' then
    if elapsed >= e.delay then
      if e.ref_table then e.ref_table[e.ref_value] = e.ease_to end
      return e.blocking, true
    end
    return e.blocking, false
  elseif e.trigger == 'condition' then
    return e.blocking, not not e.func()
  end
  -- immediate
  return e.blocking, not not e.func()
end

local function new_event_manager(G)
  local em = {
    queues = { unlock = {}, base = {}, tutorial = {}, achievement = {}, other = {} },
  }
  function em:add_event(event, queue, front)
    queue = queue or 'base'
    if type(event) ~= 'table' or not event.is or not event:is(Event) then return end
    if front then
      table.insert(self.queues[queue], 1, event)
    else
      self.queues[queue][#self.queues[queue] + 1] = event
    end
  end
  function em:clear_queue(queue, exception)
    for k, v in pairs(self.queues) do
      if (queue == nil and (exception == nil or k ~= exception)) or k == queue then
        local i = 1
        while i <= #v do
          if not v[i].no_delete then table.remove(v, i) else i = i + 1 end
        end
      end
    end
  end
  --- One processing step over every queue (vanilla EventManager:update, forced).
  function em:update()
    local now = G.TIMERS.TOTAL
    for _, v in pairs(self.queues) do
      local blocked = false
      local i = 1
      while i <= #v do
        local ev = v[i]
        local blocking, completed = false, false
        if not blocked or not ev.blockable then blocking, completed = handle(ev, now) end
        if not blocked and blocking then blocked = true end
        if completed then table.remove(v, i) else i = i + 1 end
      end
    end
  end
  function em:pending(queue)
    if queue then return #self.queues[queue] end
    local n = 0
    for _, v in pairs(self.queues) do n = n + #v end
    return n
  end
  return em
end

-- ── Card areas ───────────────────────────────────────────────────────────────

local function new_area(limit)
  local area = { cards = {}, config = { card_limit = limit or 5, type = 'joker' } }
  function area:emplace(card)
    self.cards[#self.cards + 1] = card
    card.area = self
  end
  function area:remove_card(card)
    for i, c in ipairs(self.cards) do
      if c == card then
        table.remove(self.cards, i)
        card.area = nil
        return card
      end
    end
  end
  return area
end

-- ── Pools ────────────────────────────────────────────────────────────────────

local function by_order(a, b)
  if (a.order or 0) ~= (b.order or 0) then return (a.order or 0) < (b.order or 0) end
  return (a.key or '') < (b.key or '')
end

--- Rebuild G.P_CENTER_POOLS and G.P_JOKER_RARITY_POOLS from G.P_CENTERS (sorted by order).
function M.rebuild_pools()
  local G = _G.G
  for _, name in ipairs(POOL_NAMES) do G.P_CENTER_POOLS[name] = {} end
  G.P_JOKER_RARITY_POOLS = { {}, {}, {}, {} }
  for key, v in pairs(G.P_CENTERS) do
    v.key = key
    local pool = G.P_CENTER_POOLS[v.set]
    if pool then pool[#pool + 1] = v end
    if v.set == 'Tarot' or v.set == 'Planet' then
      local tp = G.P_CENTER_POOLS.Tarot_Planet
      tp[#tp + 1] = v
    end
    if v.set == 'Tarot' or v.set == 'Planet' or v.set == 'Spectral' then
      local c = G.P_CENTER_POOLS.Consumeables
      c[#c + 1] = v
    end
    if v.set == 'Joker' and v.rarity and G.P_JOKER_RARITY_POOLS[v.rarity] then
      local r = G.P_JOKER_RARITY_POOLS[v.rarity]
      r[#r + 1] = v
    end
  end
  for key, v in pairs(G.P_TAGS) do
    v.key = key
    local pool = G.P_CENTER_POOLS.Tag
    pool[#pool + 1] = v
  end
  for _, pool in pairs(G.P_CENTER_POOLS) do table.sort(pool, by_order) end
  for _, pool in ipairs(G.P_JOKER_RARITY_POOLS) do table.sort(pool, by_order) end
end

function M.add_center(key, def)
  local G = _G.G
  def = copy(def)
  def.key = key
  G.P_CENTERS[key] = def
  M.rebuild_pools()
  return def
end

-- ── Install / uninstall ──────────────────────────────────────────────────────

local INSTALLED = {
  'G', 'Event', 'EventManager', 'pseudoseed', 'pseudorandom', 'pseudorandom_element',
  'pseudohash', 'localize', 'sendDebugMessage', 'sendWarnMessage', 'love', 'HEX', 'number_format',
}

local function pseudohash(str)
  local num = 1
  for i = #str, 1, -1 do
    num = ((1.1239285023 / num) * string.byte(str, i) * math.pi + math.pi * i) % 1
  end
  return num
end

--- Fresh globals. `opts.empty = true` skips the sample prototypes.
function M.install(opts)
  opts = opts or {}
  local G = {}
  _G.G = G
  G.STATES = copy(STATES)
  G.STAGES = { MAIN_MENU = 1, RUN = 2, SANDBOX = 3 }
  G.STATE = G.STATES.BLIND_SELECT
  G.STAGE = G.STAGES.RUN
  G.TIMERS = { TOTAL = 0, REAL = 0, REAL_SHADER = 0, UPTIME = 0, BACKGROUND = 0 }
  G.SETTINGS = { GAMESPEED = 1, language = 'en-us', profile = 1, paused = false, tutorial_complete = true }
  G.PROFILES = { { name = 'P1' } }
  G.F_NO_SAVING = false
  G.ARGS = {}
  G.FUNCS = {}
  G.CONTROLLER = { locked = false, locks = {}, interrupt = {} }
  G.C = {
    WHITE = colour(1, 1, 1), BLACK = colour(0, 0, 0), RED = colour(0.996, 0.373, 0.333),
    GREEN = colour(0.302, 0.62, 0.502), BLUE = colour(0, 0.616, 1), ORANGE = colour(0.992, 0.635, 0),
    GOLD = colour(0.918, 0.753, 0.345), PURPLE = colour(0.533, 0.404, 0.776), IMPORTANT = colour(1, 0.6, 0),
    CLEAR = colour(0, 0, 0, 0), UI = { TEXT_LIGHT = colour(1, 1, 1), TEXT_DARK = colour(0.31, 0.39, 0.42) },
    SECONDARY_SET = {}, SET = {},
  }
  G.P_CENTERS = {}
  G.P_BLINDS = {}
  G.P_TAGS = {}
  G.P_SEALS = { Red = { order = 1 }, Blue = { order = 2 }, Gold = { order = 3 }, Purple = { order = 4 } }
  G.P_CENTER_POOLS = {}
  G.P_JOKER_RARITY_POOLS = { {}, {}, {}, {} }
  if not opts.empty then
    for k, v in pairs(SAMPLE_CENTERS) do G.P_CENTERS[k] = copy(v) end
    for k, v in pairs(SAMPLE_BLINDS) do
      G.P_BLINDS[k] = copy(v)
      G.P_BLINDS[k].key = k
    end
    for k, v in pairs(SAMPLE_TAGS) do G.P_TAGS[k] = copy(v) end
  end
  G.GAME = {
    stake = 1,
    round = 0,
    dollars = 4,
    chips = 0,
    win_ante = 8,
    modifiers = {},
    starting_params = { hands = 4, discards = 3, hand_size = 8, joker_slots = 5, consumable_slots = 2, dollars = 4 },
    banned_keys = {},
    used_vouchers = {},
    pseudorandom = { seed = opts.seed or 'TESTSEED' },
    round_resets = { ante = 1, blind_ante = 1, hands = 4, discards = 3,
      blind_choices = { Small = 'bl_small', Big = 'bl_big', Boss = 'bl_wall' }, blind_states = {} },
    current_round = { hands_left = 4, discards_left = 3, hands_played = 0, reroll_cost = 5 },
    blind = nil,
  }
  G.localization = {
    descriptions = { Joker = {}, Tarot = {}, Planet = {}, Spectral = {}, Voucher = {}, Back = {}, Blind = {}, Tag = {}, Other = {}, Enhanced = {} },
    misc = { dictionary = {}, v_dictionary = {}, labels = {}, challenge_names = {}, v_text = {}, ranks = {}, suits_plural = {} },
  }
  G.jokers = new_area(5)
  G.consumeables = new_area(2)
  G.hand = new_area(8)
  G.deck = new_area(52)
  G.play = new_area(5)
  G.discard = new_area(52)
  G.shop_jokers = new_area(2)
  G.E_MANAGER = new_event_manager(G)

  _G.Event = new_event
  _G.EventManager = new_event_manager
  _G.pseudohash = pseudohash
  -- Deterministic stand-ins for the game's seeded RNG (not the real algorithm).
  local streams = {}
  _G.pseudoseed = function(key)
    local s = streams[key] or pseudohash(key .. (G.GAME.pseudorandom.seed or ''))
    s = math.abs(tonumber(string.format('%.13f', (2.134453429141 + s * 1.72431234) % 1)))
    streams[key] = s
    return (s + (G.GAME.pseudorandom.hashed_seed or 0)) / 2
  end
  _G.pseudorandom = function(seed, min, max)
    local x = type(seed) == 'string' and _G.pseudoseed(seed) or seed
    local r = (x * 9301 + 49297) % 233280 / 233280
    if min and max then return math.floor(min + r * (max - min + 1)) end
    return r
  end
  _G.pseudorandom_element = function(t, seed)
    local keys = {}
    for k, v in pairs(t) do keys[#keys + 1] = { k = k, v = v } end
    table.sort(keys, function(a, b)
      local sa = type(a.v) == 'table' and a.v.sort_id or a.k
      local sb = type(b.v) == 'table' and b.v.sort_id or b.k
      return tostring(sa) < tostring(sb)
    end)
    if #keys == 0 then return nil end
    local i = _G.pseudorandom(seed, 1, #keys)
    return keys[i].v, keys[i].k
  end
  _G.localize = function(args)
    if type(args) == 'string' then return G.localization.misc.dictionary[args] or args end
    return args and (args.key or 'ERROR') or 'ERROR'
  end
  _G.sendDebugMessage = function() end
  _G.sendWarnMessage = function() end
  _G.HEX = function(hex)
    local r, g, b = tonumber(hex:sub(1, 2), 16), tonumber(hex:sub(3, 4), 16), tonumber(hex:sub(5, 6), 16)
    return { r / 255, g / 255, b / 255, 1 }
  end
  _G.number_format = function(n) return tostring(n) end
  _G.love = { timer = { getTime = function() return G.TIMERS.REAL end } }

  M.rebuild_pools()
  return G
end

function M.uninstall()
  for _, name in ipairs(INSTALLED) do _G[name] = nil end
end

--- Advance both clocks by dt seconds and process one event step.
function M.advance(dt)
  local G = _G.G
  G.TIMERS.TOTAL = G.TIMERS.TOTAL + (dt or 0)
  G.TIMERS.REAL = G.TIMERS.REAL + (dt or 0)
  G.E_MANAGER:update()
end

--- Process the queues until empty, advancing 1/60 s per step. Errors on a livelock.
function M.flush(max_steps)
  local G = _G.G
  max_steps = max_steps or 10000
  for _ = 1, max_steps do
    if G.E_MANAGER:pending() == 0 then return true end
    M.advance(1 / 60)
  end
  error('fake_g.flush: events still pending after ' .. max_steps .. ' steps')
end

M.STATES = STATES
M.POOL_NAMES = POOL_NAMES

return M
