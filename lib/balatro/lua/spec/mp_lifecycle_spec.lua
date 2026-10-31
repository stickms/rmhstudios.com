-- Session lifecycle leaks (PLAN §6.4): mounting and unmounting a session N times must leave
-- nothing behind. Every wrap layer and record, MP.net / RMH frame hook, deferred item, queued
-- event, net/peer/sync handler, G.FUNCS entry, registry and state table returns to the size it
-- had after the first cycle, and so does everything reachable from _G (a census of every table
-- slot, so a leak nobody thought to name is caught too). The engine twin is perf_spec's
-- 'no growth across 10 session mount/unmount cycles' (lib/balatro/lua/mp_test/specs).
--
-- Also here: the allocation-free layer chain of MP.hooks.wrap (util/wrap.lua) keeps the error
-- semantics of mp_core_spec under reentrancy, many arguments and layers removed mid-call.

local UH = require 'spec.mp_ui_helper'
local H = require 'spec.mp_helper'
local fake = H.fake

local MP, G

local function roster(n)
  local list = {}
  for i = 1, n do list[i] = { id = 'u' .. i, name = 'P' .. i, blindCol = i, avatarJoker = 'j_joker' } end
  return list
end

local LAYERS = { 'standard', 'smallworld', 'experimental', 'shared_pockets', 'bigger_shop', 'traps', 'pvp_timer' }

--- Vanilla-shaped Game/G.FUNCS slots the session wraps (the fake G has none of them).
local function game_stub()
  G.STAGE = G.STAGES.RUN
  G.STATE = G.STATES.BLIND_SELECT
  G.LANGUAGES = { ['en-us'] = { font = {} } }
  for _, name in ipairs({ 'update', 'update_shop', 'update_hand_played', 'update_draw_to_hand', 'update_round_eval',
    'update_blind_select', 'update_game_over', 'update_selecting_hand' }) do
    Game[name] = function() end
  end
  Game.start_run = function(self) G.STAGE = G.STAGES.RUN end
  Game.delete_run = function() end
  G.FUNCS.go_to_menu = function() G.STAGE = G.STAGES.MAIN_MENU end
  G.FUNCS.start_run = function(_, args) Game.start_run(G, args) end
  G.FUNCS.select_blind = function() end
  G.FUNCS.skip_blind = function() end
  G.GAME.current_round.current_hand = { handname_text = '', chip_total_text = '', hand_level = '', chip_text = '0', mult_text = '0' }
  G.GAME.current_round.dollars_to_be_earned = '$$$'
  G.GAME.round_resets.blind_states = { Small = 'Select', Big = 'Upcoming', Boss = 'Upcoming' }
  G.GAME.blind = { loc_debuff_lines = { '', '' }, loc_name = 'Small Blind', chip_text = '300', chips = 300,
    change_dim = function() end, get_type = function() return 'Small' end }
  _G.get_blind_amount = function() return 300 end
  _G.play_sound = function() end
end

local function frames(n)
  for _ = 1, n do
    MP.net.frame(1 / 60)
    pcall(fake.advance, 1 / 60)
  end
end

local function match_info(i)
  return {
    runId = 'run' .. i, seed = 'ABCD1234', stake = 1, deck = 'b_red', queueMode = 'pvp_nemesis',
    shape = { nemesisPairing = true, manhunt = false, teamBased = false }, ruleset = 'ruleset_mp_balanced',
    layers = LAYERS, options = H.options(), resolved = H.resolved({ layers = LAYERS, setupHooks = LAYERS }),
    roster = roster(2), startedAt = 0, hostId = 'u1', contentHash = 'x', me = 'u1',
  }
end

--- One session: mount (a match, or practice every third cycle), play a few frames with traffic,
--- build the HUD, then leave the way cycle `i` picks (direct unmount, Main Menu, New Run).
local function cycle(i)
  if i % 3 == 0 then
    MP.net.receive('practice_start', { resolved = H.resolved({ layers = LAYERS }), deck = 'b_red', stake = 1, seed = 'PRACTICE' })
  else
    MP.net.receive('match_start', match_info(i))
  end
  frames(3)
  MP.net.receive('timer_state', { value = 120, mode = 'ante', ticking = true, beingTimered = false, timering = false,
    pressable = true, auto = false, color = 'normal' })
  MP.net.receive('outcome', { hs = i, o = { t = 'player_lives', player_id = '*all*', lives = 4 } })
  if rawget(_G, 'create_UIBox_HUD') then pcall(create_UIBox_HUD) end
  frames(3)
  local how = i % 3
  if how == 0 then
    MP.session.unmount('test')
  elseif how == 1 then
    G.FUNCS.go_to_menu()
  else
    G.FUNCS.start_run(nil, { seed = 'SP' })
  end
  frames(3)
  pcall(fake.flush)
  UH.clear_sent()
end

local function count(t)
  local n = 0
  for _ in pairs(t or {}) do n = n + 1 end
  return n
end

local function census()
  local st = MP.hooks.stats()
  local deferred = 0
  for _, q in pairs(MP.net.deferred) do deferred = deferred + #q end
  local events = 0
  for _, q in pairs(G.E_MANAGER.queues or {}) do events = events + #q end
  return {
    layers = st.layers, records = st.records, slots = st.slots, owners = st.owners,
    session_layers = MP.hooks.count('session'),
    mp_frame_hooks = #MP.net.frame_hooks, rmh_frame_hooks = #((rawget(_G, 'RMH') or {}).frame_hooks or {}),
    deferred = deferred, events = events, outbox = #MP.net.outbox,
    net_handlers = count(MP.net.handlers), peer_handlers = count(MP.peer.handlers), sync_objects = count(MP.sync.objects),
    state_keys = count(MP.state), funcs = count(G.FUNCS), centers = count(G.P_CENTERS), blinds = count(G.P_BLINDS),
    tags = count(G.P_TAGS), installers = #MP.session.extra_installers,
    layer_hooks = count(MP.rules._hooks), post_hooks = count(MP.rules._post), ban_sources = #MP.rules._ban_sources,
  }
end

--- Every table slot reachable from _G (values, keys, metatables, function upvalues), by path.
local function reachable()
  local seen, total, by = {}, 0, {}
  local function walk(t, path, d)
    if seen[t] or d > 16 then return end
    seen[t] = true
    local n = 0
    -- Sorted, so a slot is always reported under the same (first) path.
    local keys = {}
    for k in pairs(t) do keys[#keys + 1] = k end
    table.sort(keys, function(a, b)
      local ta, tb = type(a), type(b)
      if ta ~= tb then return ta < tb end
      if ta == 'number' or ta == 'string' then return a < b end
      return tostring(a) < tostring(b)
    end)
    for _, k in ipairs(keys) do
      local v = t[k]
      n = n + 1
      if type(k) == 'table' then walk(k, path .. '.<k>', d + 1) end
      if type(v) == 'table' then walk(v, path .. '.' .. tostring(k), d + 1)
      elseif type(v) == 'function' then
        local u = 1
        while true do
          local name, uv = debug.getupvalue(v, u)
          if not name then break end
          if type(uv) == 'table' then walk(uv, path .. '.' .. tostring(k) .. '^' .. name, d + 1) end
          u = u + 1
        end
      end
    end
    local mt = getmetatable(t)
    if type(mt) == 'table' then walk(mt, path .. '.<mt>', d + 1) end
    by[path] = n
    total = total + n
  end
  walk(_G, '_G', 0)
  return total, by
end

local function settle()
  for i = #MP.log_ring, 1, -1 do MP.log_ring[i] = nil end -- a bounded ring, not a leak
  UH.boxes, UH.cards, UH.overlays = {}, {}, {}          -- the test's own recorders
  collectgarbage()
  collectgarbage()
end

describe('session mount/unmount leaves nothing behind', function()
  after_each(UH.teardown)

  it('12 cycles (match/practice; unmount, Main Menu, New Run) return every size to its baseline', function()
    MP, G = UH.boot()
    MP.open('menu')
    game_stub()
    MP.session.launcher = function() return true end
    -- The first cycles load lazy, once-per-boot pieces; the baseline is taken after them.
    for i = 1, 3 do cycle(i) end
    settle()
    local base = census()
    local base_total, base_by = reachable()
    for i = 4, 15 do cycle(i) end -- ends the way the baseline's last cycle did (i % 3 == 0)
    settle()
    local now = census()
    local total, by = reachable()
    for k, v in pairs(base) do
      if now[k] ~= v then error(string.format('%s: %s after 3 cycles, %s after 15', k, tostring(v), tostring(now[k])), 0) end
    end
    if total ~= base_total then
      local grew = {}
      for p, n in pairs(by) do
        if (base_by[p] or 0) < n then grew[#grew + 1] = p .. ' ' .. tostring(base_by[p]) .. '->' .. n end
      end
      table.sort(grew)
      error(string.format('reachable table slots %d -> %d; grew: %s', base_total, total, table.concat(grew, '; ', 1, math.min(#grew, 12))), 0)
    end
    expect(MP.hooks.count('session')).eq(0)
    expect(MP.state.session).eq(nil)
  end)

  it('a mounted session costs the same after 10 cycles (same hooks and layers while mounted)', function()
    MP, G = UH.boot()
    MP.open('menu')
    game_stub()
    MP.session.launcher = function() return true end
    MP.net.receive('match_start', match_info(1))
    frames(2)
    local first = census()
    MP.session.unmount('test')
    for i = 2, 11 do cycle(i) end
    MP.net.receive('match_start', match_info(12))
    frames(2)
    local again = census()
    for _, k in ipairs({ 'layers', 'records', 'slots', 'session_layers', 'mp_frame_hooks', 'rmh_frame_hooks', 'net_handlers',
      'peer_handlers', 'sync_objects', 'centers', 'funcs' }) do
      if again[k] ~= first[k] then error(string.format('%s while mounted: %s first, %s after 10 cycles', k, tostring(first[k]), tostring(again[k])), 0) end
    end
    MP.session.unmount('test')
  end)
end)

describe('MP.hooks layer chain (allocation-free dispatch)', function()
  local W
  before_each(function() MP = H.fresh(); W = MP.hooks end)
  after_each(H.teardown)

  it('passes more than four arguments and nil holes through, also to the original after a hook error', function()
    local seen
    local obj = { f = function(...) seen = { n = select('#', ...), ... }; return select('#', ...), ... end }
    W.wrap(obj, 'f', function(orig, ...) return orig(...) end, { id = 'pass' })
    local n, a, b, c, d, e, f = obj.f(1, nil, 3, nil, 5, nil)
    expect(n).eq(6)
    expect({ a, b, c, d, e, f }).eq({ 1, nil, 3, nil, 5, nil })
    W.wrap(obj, 'f', function() error('boom') end, { id = 'bad' })
    seen = nil
    n = obj.f('a', 'b', 'c', 'd', 'e', nil, 'g')
    expect(n).eq(7)
    expect(seen.n).eq(7)
    expect(seen[7]).eq('g')
    for k = 0, 4 do
      local args = { 'x1', 'x2', 'x3', 'x4' }
      seen = nil
      obj.f(unpack(args, 1, k))
      expect(seen.n).eq(k)
    end
  end)

  it('tracks "called its next" per call under reentrancy', function()
    local calls = 0
    local obj = {}
    obj.f = function(depth) calls = calls + 1; return depth end
    -- The hook recurses through the dispatcher BEFORE calling its own next, then fails on the
    -- outer call: the original must still run exactly once for the outer call.
    W.wrap(obj, 'f', function(orig, depth)
      if depth < 3 then obj.f(depth + 1) end
      if depth == 1 then error('outer fails before next') end
      return orig(depth)
    end)
    calls = 0
    expect(obj.f(1)).eq(1) -- recovered: the original answered for the outer call
    expect(calls).eq(3)    -- depth 3, depth 2 (both through their hook), depth 1 (recovery)
  end)

  it('does not call the original twice when a nested failing call already called it', function()
    local calls = 0
    local obj = { f = function() calls = calls + 1; return 'v' end }
    W.wrap(obj, 'f', function(orig)
      local r = orig()
      error('after next')
      return r
    end)
    calls = 0
    expect(obj.f()).eq(nil)
    expect(calls).eq(1)
  end)

  it('keeps re-raising original errors unchanged through several layers', function()
    local obj = { f = function() error('vanilla crash', 0) end }
    W.wrap(obj, 'f', function(orig, ...) return orig(...) end, { id = 'a' })
    W.wrap(obj, 'f', function(orig, ...) return orig(...) end, { id = 'b' })
    W.wrap(obj, 'f', function(orig, ...) return orig(...) end, { id = 'c' })
    local ok, err = pcall(obj.f)
    expect(ok).eq(false)
    expect(err).eq('vanilla crash')
    -- and the chain is usable again afterwards (call depth unwound)
    obj.f = obj.f
    local ok2 = pcall(obj.f)
    expect(ok2).eq(false)
  end)

  it('survives a layer that removes the layers below it while running', function()
    local obj = { f = function(x) return 'orig:' .. tostring(x) end }
    local inner = W.wrap(obj, 'f', function(orig, x) return 'inner(' .. orig(x) .. ')' end, { id = 'inner', group = 'session' })
    W.wrap(obj, 'f', function(orig, x)
      W.remove_group('session') -- what S.unmount does from inside G.FUNCS.start_run
      return 'outer(' .. orig(x) .. ')'
    end, { id = 'outer', group = 'core' })
    expect(inner ~= nil).truthy()
    expect(obj.f(1)).eq('outer(orig:1)')
    expect(obj.f(2)).eq('outer(orig:2)')
  end)

  it('hot layers run unprotected and mix with protected ones; original errors stay unchanged', function()
    local log = {}
    local obj = { f = function(x) log[#log + 1] = 'orig'; if x == 'crash' then error('vanilla', 0) end; return x end }
    W.wrap(obj, 'f', function(orig, x) log[#log + 1] = 'p1'; return orig(x) end, { id = 'p1' })
    W.wrap(obj, 'f', function(orig, x) log[#log + 1] = 'hot'; return orig(x) end, { id = 'hot', hot = true })
    expect(obj.f('a')).eq('a')
    expect(log).eq({ 'hot', 'p1', 'orig' })
    local ok, err = pcall(obj.f, 'crash')
    expect(ok).eq(false)
    expect(err).eq('vanilla') -- through a protected layer under a hot outermost one: not a marker table
    W.wrap(obj, 'f', function(orig, x) return orig(x) end, { id = 'p2' })
    ok, err = pcall(obj.f, 'crash')
    expect(err).eq('vanilla')
    -- a hot layer's own error travels like the original's (no isolation)
    W.wrap(obj, 'f', function() error('hot boom', 0) end, { id = 'hot2', hot = true })
    ok, err = pcall(obj.f, 'a')
    expect(ok).eq(false)
    expect(err).eq('hot boom')
    W.unwrap(obj, 'f', 'hot2')
    -- under a protected layer, a hot layer's error is NOT isolated as the protected one's own
    log = {}
    W.wrap(obj, 'f', function(orig, x) return orig(x) end, { id = 'p3' })
    W.wrap(obj, 'f', function() error('hot under', 0) end, { id = 'hot3', hot = true })
    W.wrap(obj, 'f', function(orig, x) return orig(x) end, { id = 'p4' })
    ok, err = pcall(obj.f, 'a')
    expect(err).eq('hot under')
  end)

  it('allocates nothing per call on the success path', function()
    local obj = { f = function(self, a) return a end }
    for i = 1, 3 do W.wrap(obj, 'f', function(orig, self, a) return orig(self, a) end, { id = 'l' .. i }) end
    obj.f(obj, 1) -- builds the per-layer next functions once
    collectgarbage()
    collectgarbage('stop')
    local before = collectgarbage('count')
    for i = 1, 2000 do obj.f(obj, i) end
    local grew = collectgarbage('count') - before
    collectgarbage('restart')
    -- KB for 2000 calls through 3 layers; the closure-per-call chain allocated ~1.7 KB per call (3.4 MB).
    if grew >= 16 then error("grew " .. grew .. " KB", 0) end
  end)
end)
