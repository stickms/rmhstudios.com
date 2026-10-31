-- L2 performance of the MP Lua side (PLAN §6.4), measured in the real love.wasm and REPORTED
-- (`perf`, printed by the engine project) against the plan's budgets:
--
--   MP Lua hook overhead  ≤ 1.0 ms per frame on average while a match is mounted and a hand is
--                         being played, vs single player on the same seed (love.update plus the
--                         per-frame hooks and the mailbox pump);
--   mailbox idle cost     ≤ 0.05 ms per frame (RMH.net.pump with nothing to read);
--   mailbox busy cost     ≤ 0.3 ms per frame at 50 messages a second.
--
-- Those budgets are milliseconds on a player's machine. CI and the e2e machine draw with
-- SwiftShader on shared cores, where a frame takes ~100 ms instead of ~16, so the absolute
-- numbers are reported, and what is asserted is machine-independent: the MP match costs at
-- most 1.3x single player's Lua work per frame (instructions, in update and in draw) and at
-- most 10% more draw calls, with time backstops of 1.45x Lua and 1.35x frame; the busy
-- mailbox is fed 50 messages a second of a 60 fps game and must stay within 0.3 ms per frame;
-- an idle pump within 0.05 ms (it opens nothing: one seek on in.sig); and 10 session
-- mount/unmount cycles change no census count (MP tables, wraps, frame hooks, engine instance
-- lists), grow the collected heap by at most 10%, the SP/MP Lua instructions per frame by at
-- most 5% (exact: a count hook) and the SP/MP Lua time per frame by at most 1.3x each, 1.2x
-- together (`sample`: a fast-tail estimate over a frame-sized reference loop, which a loaded
-- machine moves far less than a mean).
-- Measured on the WS14b machine (2026-10-30), before -> after the allocation-free wrap chain
-- and in.sig (perf_spec alone / after every other spec in one boot):
--   SP update+pump 8.1 / 17.7 ms -> 8.3 / 12.0 ms; MP 10.4 / 17.2 ms -> 8.1 / 12.1 ms
--   MP/SP Lua 1.29x / 0.97x -> 0.97x / 1.00x; idle pump 0.062 / 0.095 ms -> 0.003 / 0.015 ms
--   busy (60 fps-shaped) 0.158 / 0.206 ms -> 0.147 / 0.179 ms; 10 cycles: census unchanged,
--   heap +0.8%, SP 1.14x / MP 1.07x (SwiftShader noise; the counts are the proof).
-- The growth time ratio was a plain mean of 240 frames on each side until 2026-10-31, and that
-- statistic swung 0.44-1.66 between runs on an unchanged build while other engines shared the
-- machine (sd(log) 0.15-0.36); see the growth test for what replaced it and why.

local has_mp, MP = pcall(require, 'rmh_mp')

local SEED = 'RMHPERF1'
-- Frames per time sample. Much of a sample's noise is the sampling error of a fast-tail
-- quantile (a bootstrap of one 240-frame sample spreads as much as separate samples do),
-- which 480 frames halves in variance for ~40 s more per sample.
local FRAMES = 480

local function now() return love.timer.getTime() end

--- A fixed, allocation-free piece of Lua CPU work (no tables or strings, so no GC), ~8 ms on
-- SwiftShader, timed on every sampled frame right after the game's own Lua. Its fast floor
-- (5th percentile) is the machine's speed at that moment, free of preemption (8.0-8.5 ms in
-- every sample measured, whatever the load), so dividing by it cancels a slower core, CPU
-- frequency or a throttled tab without importing the preemption noise that its q10 or mean
-- carry (a q10 reference jumped to 11-14 ms in a loaded sample and failed a clean run).
local REF_ITERS = 500000
local ref_sink = 0
local function ref_work()
  local x = 0
  for i = 1, REF_ITERS do x = (x + i * 7) % 1000003 end
  ref_sink = x
end

--- The p-quantile (nearest rank) of a list.
local function quantile(xs, p)
  local s = {}
  for k = 1, #xs do s[k] = xs[k] end
  table.sort(s)
  if #s == 0 then return 0 end
  return s[math.max(1, math.min(#s, math.floor((#s - 1) * p + 0.5) + 1))]
end

local function mean(xs)
  local s = 0
  for k = 1, #xs do s = s + xs[k] end
  return s / math.max(1, #xs)
end

-- Lua VM instructions are counted in steps of this many (a count hook).
local INSTR_STEP = 1000

--- Lua cost per frame of love.update + love.event.pump (where the frame hooks and the mailbox
-- pump run) over n frames, measured four ways:
--   instr  median Lua VM instructions per frame (count hook on the thread running the frame):
--          the work itself, which no other process on the machine can change;
--   cost   the 10th-percentile frame's Lua time over the reference's floor. On a shared
--          machine a frame is only ever made SLOWER by a neighbour (preemption, a full core),
--          so the fast tail is the frame's own cost, and per-frame work a leak adds moves the
--          whole distribution, its fast tail included;
--   frame  the same fast-tail estimate of the whole frame (start of one love.update to the
--          next, less the reference work done in between: the draw, SwiftShader and the
--          browser included), over the same floor;
--   draw   the draw's work, as exact as instr: median Lua instructions in love.draw and median
--          draw calls (love.graphics.getStats after the draw, before the present);
--   raw    the plain means of the Lua time and of the frame (what the checks used to compare),
--          reported only.
local function sample(n)
  local lua_f, ref_f, ins_f, frame_f, dins_f, calls_f = {}, {}, {}, {}, {}, {}
  local cur, ins = 0, 0
  local last_start, last_ref
  local hook = function() ins = ins + INSTR_STEP end
  local h0, m0, c0 = debug.gethook()
  local u0, p0, d0 = love.update, love.event.pump, love.draw
  local stats = love.graphics and love.graphics.getStats
  love.draw = function(...)
    ins = 0
    debug.sethook(hook, '', INSTR_STEP)
    local r = d0(...)
    debug.sethook(h0, m0, c0)
    dins_f[#dins_f + 1] = ins
    ins = 0
    if stats then calls_f[#calls_f + 1] = stats().drawcalls end
    return r
  end
  love.event.pump = function(...)
    debug.sethook(hook, '', INSTR_STEP)
    local t = now()
    local r = p0(...)
    cur = cur + (now() - t)
    debug.sethook(h0, m0, c0)
    return r
  end
  love.update = function(...)
    local t = now()
    if last_start then frame_f[#frame_f + 1] = (t - last_start - last_ref) * 1000 end
    last_start = t
    debug.sethook(hook, '', INSTR_STEP)
    local r = u0(...)
    local dt = now() - t
    debug.sethook(h0, m0, c0)
    lua_f[#lua_f + 1] = (cur + dt) * 1000
    ins_f[#ins_f + 1] = ins
    cur, ins = 0, 0
    local t2 = now()
    ref_work()
    last_ref = now() - t2
    ref_f[#ref_f + 1] = last_ref * 1000
    return r
  end
  local ok, err = AP.sched.protected(wait_frames, n)
  love.update, love.event.pump, love.draw = u0, p0, d0
  debug.sethook(h0, m0, c0)
  if not ok then error(err, 0) end
  if #lua_f < n / 2 then error(string.format('sample: %d frames, wanted %d', #lua_f, n), 0) end
  local lua10, ref05, frame10 = quantile(lua_f, 0.1), quantile(ref_f, 0.05), quantile(frame_f, 0.1)
  return {
    frames = #lua_f, instr = quantile(ins_f, 0.5), lua_q10_ms = lua10, ref_q05_ms = ref05,
    frame_q10_ms = frame10, cost = lua10 / math.max(1e-6, ref05), frame_cost = frame10 / math.max(1e-6, ref05),
    draw_instr = quantile(dins_f, 0.5), drawcalls = #calls_f > 0 and quantile(calls_f, 0.5) or 0,
    raw_ms = mean(lua_f), raw_frame_ms = mean(frame_f),
  }
end

local function resolved()
  return {
    key = 'ruleset_mp_balanced', layers = { 'standard' }, multiplayerContent = true, banned = {}, bannedSilent = {},
    included = {}, reworked = {}, spectralBannedEnhancements = {}, stickers = {}, gameModifiers = {},
    startingParams = {}, setupHooks = {},
    flags = { theOrder = true, enemyLocationDisabled = false, comeback = 'default' },
    timer = { enabled = true, base = 150, increment = 60, forgiveness = 0, pvpHandIncrement = 0, mode = 'default',
      pressurePlusHand = 0, countdown = 3, mult = 1 },
  }
end

local function leave()
  if MP and MP.state and MP.state.session then
    if G.OVERLAY_MENU and G.FUNCS.exit_overlay_menu then G.FUNCS.exit_overlay_menu() end
    MP.session.unmount('test')
  end
end

local function mount_match()
  AP.run('prepare')
  leave()
  MP.session.mount('match', {
    runId = 'perf-run', seed = SEED, stake = 1, deck = 'b_red', queueMode = 'pvp_nemesis',
    shape = { nemesisPairing = true, manhunt = false, teamBased = false }, ruleset = 'ruleset_mp_balanced',
    layers = { 'standard' }, resolved = resolved(), hostId = 'u_me', me = 'u_me', contentHash = 'x',
    options = { pvpStartRound = 1, theOrder = true, multiplayerJokers = true, timer = true, startingLives = 4,
      pvpCountdownSeconds = 3, deathOnRoundLoss = true },
    roster = { { id = 'u_me', name = 'Alice', blindCol = 1, avatarJoker = 'j_joker' },
      { id = 'u_them', name = 'Bob', blindCol = 7, avatarJoker = 'j_joker' } },
  })
  MP.session.launch(SEED)
  AP.run('wait_state', { 'BLIND_SELECT' })
  MP.net.receive('outcome', { hs = 1, o = { t = 'player_lives', player_id = '*all*', lives = 4 } })
end

--- Selecting a hand on the Small Blind of SEED (the same point in SP and MP).
local function to_hand()
  AP.run('select_blind')
  AP.run('wait_state', { 'SELECTING_HAND' })
  AP.run('wait_idle')
end

local results = {}

local function count(t)
  local n = 0
  for _ in pairs(t or {}) do n = n + 1 end
  return n
end

--- Sizes of everything a mount adds and an unmount must take away again. Taken at the same
-- point (a single-player hand after leaving a session), every number must match exactly.
local function census()
  local st = MP.hooks.stats and MP.hooks.stats() or {}
  local deferred = 0
  for _, q in pairs(MP.net.deferred) do deferred = deferred + #q end
  local R = MP.registry or {}
  local inst = {}
  for k, list in pairs(G.I or {}) do inst['I_' .. k] = count(list) end
  local events = 0
  for _, q in pairs(G.E_MANAGER and G.E_MANAGER.queues or {}) do events = events + #q end
  local out = {
    layers = MP.hooks.count(), session_layers = MP.hooks.count('session'), records = st.records or -1,
    slots = st.slots or -1, mp_frame_hooks = #MP.net.frame_hooks, rmh_frame_hooks = #RMH.frame_hooks,
    deferred = deferred, net_handlers = count(MP.net.handlers), peer_handlers = count(MP.peer.handlers),
    sync_objects = count(MP.sync.objects), state_keys = count(MP.state), log_ring = #(MP.log_ring or {}),
    rules_hooks = count(MP.rules and MP.rules._hooks), installers = #(MP.session.extra_installers or {}),
    registry_keys = count(R),
    moveables = count(G.MOVEABLES), animations = count(G.ANIMATIONS), draw_hash = count(G.DRAW_HASH),
    stage_objects = count(G.STAGE_OBJECTS and G.STAGE_OBJECTS[G.STAGE]), events = events,
  }
  for k, v in pairs(inst) do out[k] = v end
  return out
end

describe('perf: MP Lua overhead', function()
  -- These measure real frames: the e2e turbo (several updates per frame, a draw
  -- every Nth) would skew the ratios and leave the draw-built tables (DRAW_HASH)
  -- counted on a frame that did not draw. Turn it off here, restore it after.
  local saved
  before_each(function()
    saved = { AP.turbo.updates, AP.turbo.draw_every }
    AP.run('turbo', { updates = 1, draw_every = 1 })
  end)
  after_each(leave)
  after_each(function()
    if saved then AP.run('turbo', { updates = saved[1], draw_every = saved[2] }) end
  end)

  it('mailbox pump idle cost', function()
    local n = 0
    local pump = RMH.net.pump
    local t = now()
    for _ = 1, 2000 do pump() n = n + 1 end
    local ms = (now() - t) * 1000 / n
    results.mailbox_idle_ms = ms
    report('perf_idle_ms', ms)
    expect(ms <= 0.05).truthy() -- the budget itself: an idle frame opens nothing (in.sig)
  end)

  if not has_mp then
    xit('needs the MP pack (?mp=1) for the session measurements: ' .. tostring(MP):sub(1, 100), function() end)
    return
  end

  it('MP hook overhead while playing a hand vs single player on the same seed', function()
    AP.run('start_run', { seed = SEED, stake = 1 })
    to_hand()
    local sp = sample(FRAMES)
    mount_match()
    to_hand()
    local mp = sample(FRAMES)
    local q = function(a, b) return a / math.max(1e-6, b) end
    local h = {
      sp = sp, mp = mp,
      overhead_ms = mp.lua_q10_ms - sp.lua_q10_ms,
      instr_ratio = q(mp.instr, sp.instr),
      lua_ratio = q(mp.cost, sp.cost),
      frame_ratio = q(mp.frame_cost, sp.frame_cost),
      draw_instr_ratio = q(mp.draw_instr, sp.draw_instr), drawcall_ratio = q(mp.drawcalls, sp.drawcalls),
      -- The plain-mean ratios (the statistics this check used to assert), reported only.
      lua_ratio_raw = q(mp.raw_ms, sp.raw_ms), frame_ratio_raw = q(mp.raw_frame_ms, sp.raw_frame_ms),
    }
    results.sp, results.mp, results.hook_overhead_ms = sp, mp, h.overhead_ms
    results.lua_ratio, results.frame_ratio, results.instr_ratio = h.lua_ratio, h.frame_ratio, h.instr_ratio
    report('perf_hooks', h)
    local bounds = {}
    local function at_most(k, limit)
      if h[k] > limit then bounds[#bounds + 1] = string.format('%s %.3f > %.2f', k, h[k], limit) end
    end
    -- The budgets as work, which no other process can change. In 16 MP/SP pairs (load 7-9 on
    -- 4 cores) the Lua instructions per frame were 1.115x (once 1.124x), the draw's 1.117x and
    -- the draw calls 1.000x every time, so these hold the plan's budgets (MP Lua <= 1.3x SP;
    -- frame within 10%) exactly. An MP-only per-frame cost of +40% of SP's Lua time measured
    -- 7.1x in instructions.
    at_most('instr_ratio', 1.3)
    at_most('draw_instr_ratio', 1.3)
    at_most('drawcall_ratio', 1.10)
    -- The same as time (fast tail over the reference floor, see `sample`), the backstop for
    -- cost that is not Lua or draw calls. The same 16 pairs: Lua 0.96-1.36 (log sd ~0.08 about
    -- 1.10), frame 0.86-1.17 (~0.09 about 1.02); the plain means this check used to assert
    -- spread 0.88-1.63 and 0.95-1.49, and failed its 1.3 / 1.10 on noise. Each limit sits ~3 sd
    -- above its centre; the injected +40% measured 1.85x Lua (1.18x frame).
    -- A shared runner can slow one side of a pair for a whole sample (a CI run measured frame
    -- 1.44 with every work ratio in bounds), so when only time is over, one more SP/MP pair is
    -- taken and the lower ratio of the two counts: a real cost is over in both pairs.
    local function time_over() return h.lua_ratio > 1.45 or h.frame_ratio > 1.35 end
    if #bounds == 0 and time_over() then
      leave()
      AP.run('start_run', { seed = SEED, stake = 1 })
      to_hand()
      local sp2 = sample(FRAMES)
      mount_match()
      to_hand()
      local mp2 = sample(FRAMES)
      h.retry = { lua_ratio = q(mp2.cost, sp2.cost), frame_ratio = q(mp2.frame_cost, sp2.frame_cost) }
      h.lua_ratio = math.min(h.lua_ratio, h.retry.lua_ratio)
      h.frame_ratio = math.min(h.frame_ratio, h.retry.frame_ratio)
      results.lua_ratio, results.frame_ratio = h.lua_ratio, h.frame_ratio
      report('perf_hooks', h)
    end
    at_most('lua_ratio', 1.45)
    at_most('frame_ratio', 1.35)
    if #bounds > 0 then error(table.concat(bounds, '; '), 0) end
  end)

  it('no growth across 10 session mount/unmount cycles', function()
    local CYCLES = 10
    -- One full cycle first, so lazy, once-per-boot setup (UI modules, atlases) is in the baseline.
    mount_match()
    to_hand()
    leave()
    AP.run('start_run', { seed = SEED, stake = 1 })
    to_hand()
    local before = census()
    collectgarbage('collect')
    local heap0 = collectgarbage('count')
    local sp0 = sample(FRAMES)
    mount_match()
    to_hand()
    local mp0 = sample(FRAMES)
    for _ = 1, CYCLES do
      mount_match()
      to_hand()
      wait_frames(5)
      leave()
    end
    AP.run('start_run', { seed = SEED, stake = 1 })
    to_hand()
    local after = census()
    collectgarbage('collect')
    local heap1 = collectgarbage('count')
    local sp1 = sample(FRAMES)
    mount_match()
    to_hand()
    local mp1 = sample(FRAMES)
    local q = function(a, b) return a / math.max(1e-6, b) end
    local g = {
      cycles = CYCLES, before = before, after = after,
      sp_before = sp0, sp_after = sp1, mp_before = mp0, mp_after = mp1,
      sp_growth = q(sp1.cost, sp0.cost),
      mp_growth = q(mp1.cost, mp0.cost),
      lua_ratio_after = q(mp1.cost, sp1.cost),
      -- One leftover per-frame cost slows SP and MP alike; their geometric mean halves the noise.
      both_growth = math.sqrt(q(sp1.cost, sp0.cost) * q(mp1.cost, mp0.cost)),
      sp_instr_growth = q(sp1.instr, sp0.instr), mp_instr_growth = q(mp1.instr, mp0.instr),
      -- The plain-mean ratios (the statistic this check used to assert), reported only.
      sp_growth_raw = q(sp1.raw_ms, sp0.raw_ms), mp_growth_raw = q(mp1.raw_ms, mp0.raw_ms),
      heap_before_kb = heap0, heap_after_kb = heap1, heap_growth = heap1 / math.max(1, heap0),
    }
    results.growth = g
    report('perf_growth', g)
    for k, v in pairs(before) do
      if k ~= 'log_ring' and after[k] ~= v then error(string.format('%s grew from %s to %s over %d cycles', k, tostring(v), tostring(after[k]), CYCLES), 0) end
    end
    local bounds = {}
    local function at_most(k, limit)
      if g[k] > limit then bounds[#bounds + 1] = string.format('%s %.3f > %.2f', k, g[k], limit) end
    end
    at_most('heap_growth', 1.10)
    -- The work: instructions per frame do not depend on the machine (1.000 in every pair measured,
    -- loaded or not), so the bound is tight. Any per-frame Lua that a cycle leaves behind (a frame
    -- hook, a wrap, a handler that runs every frame) fails it, however noisy the timing is.
    at_most('sp_instr_growth', 1.05)
    at_most('mp_instr_growth', 1.05)
    -- The time, for per-frame cost that is not Lua instructions (C calls made every frame).
    -- On unchanged builds, on a 4-core machine at load 4-16 (one to three engines plus another
    -- agent's builds), the old plain-mean ratio ranged 0.57-1.66 (sd(log) 0.15-0.36: it failed
    -- 1.2 on noise in 3 of 15 runs and passed a real 30% leak at 1.12 / 1.17). The fast-tail
    -- ratio ranged 0.84-1.29 per side at 240 frames, 0.84-1.18 at 480, and 0.93-1.16 for the
    -- SP/MP geometric mean; the limits sit above all of that. A Lua leak adding 30% per frame
    -- measured 1.30-1.66 per side, 1.47-1.50 together (and fails the instruction bound 4-7x);
    -- a C-only one (sized to 30% by a timing calibration, which the instruction bound cannot
    -- see) 1.02-1.61, 1.04 and 1.40 together in two runs: timing is the backstop for large
    -- non-Lua growth, not a 30% detector on a loaded machine. Before the allocation-free wrap
    -- chain this ratio was 1.85.
    at_most('sp_growth', 1.3)
    at_most('mp_growth', 1.3)
    at_most('both_growth', 1.2)
    at_most('lua_ratio_after', 1.3)
    if #bounds > 0 then error(table.concat(bounds, '; '), 0) end
  end)

  it('mailbox busy cost at 50 messages a second', function()
    mount_match()
    to_hand()
    -- Feed /rmh/net/in as the page does (bridge.ts): whole-file NDJSON, sequence numbers above
    -- what Lua has applied, here timer_state (a message every frame of a running timer), and
    -- raise in.sig. The rate is 50 a second OF A 60 FPS GAME (5 messages every 6 frames): the
    -- budget is per frame on a player's machine, and on SwiftShader (~6 fps) a wall-clock rate
    -- would pile ~8 messages into every frame.
    local seq = (RMH.net.last or 0) + 1000
    local carry = 0
    local feed = function()
      carry = carry + 50 / 60
      local lines = {}
      while carry >= 1 do
        carry = carry - 1
        seq = seq + 1
        lines[#lines + 1] = string.format(
          '{"s":%d,"t":"timer_state","d":{"value":120,"mode":"ante","ticking":false,"beingTimered":false,' ..
          '"timering":false,"pressable":true,"auto":false,"color":"normal","display":null}}', seq)
      end
      if #lines > 0 then
        local f = io.open('/rmh/net/in', 'ab')
        if f then f:write(table.concat(lines, '\n'), '\n') f:close() end
        local sig = io.open(RMH.net.IN_SIG or '/rmh/net/in.sig', 'wb')
        if sig then sig:write('1') sig:close() end
      end
    end
    local before = MP.net.stats.received
    table.insert(RMH.frame_hooks, 1, feed)
    local pump = RMH.net.pump
    local spent, calls, data_spent, data_calls = 0, 0, 0, 0
    RMH.net.pump = function(...)
      local t = now()
      local r = pump(...)
      local dt = now() - t
      spent = spent + dt
      calls = calls + 1
      if (tonumber(r) or 0) > 0 then data_spent, data_calls = data_spent + dt, data_calls + 1 end
      return r
    end
    local ok, err = AP.sched.protected(wait_frames, 150)
    RMH.net.pump = pump
    for i, fn in ipairs(RMH.frame_hooks) do if fn == feed then table.remove(RMH.frame_hooks, i) break end end
    if not ok then error(err, 0) end
    local got = MP.net.stats.received - before
    local ms = spent * 1000 / math.max(1, calls)
    results.mailbox_busy_ms = ms
    results.mailbox_busy_msgs = got
    results.mailbox_busy_frames = calls
    results.mailbox_busy_data_frame_ms = data_spent * 1000 / math.max(1, data_calls)
    report('perf', results)
    expect(got >= 100).truthy()
    expect(ms <= 0.3).truthy()
  end)
end)
