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
-- most 1.3x single player's Lua time per frame and at most 10% more frame time; the busy
-- mailbox is fed 50 messages a second of a 60 fps game and must stay within 0.3 ms per frame;
-- an idle pump within 0.05 ms (it opens nothing: one seek on in.sig); and 10 session
-- mount/unmount cycles change no census count (MP tables, wraps, frame hooks, engine instance
-- lists), grow the collected heap by at most 10% and SP/MP Lua time by at most 1.2x.
-- Measured on the WS14b machine (2026-10-30), before -> after the allocation-free wrap chain
-- and in.sig (perf_spec alone / after every other spec in one boot):
--   SP update+pump 8.1 / 17.7 ms -> 8.3 / 12.0 ms; MP 10.4 / 17.2 ms -> 8.1 / 12.1 ms
--   MP/SP Lua 1.29x / 0.97x -> 0.97x / 1.00x; idle pump 0.062 / 0.095 ms -> 0.003 / 0.015 ms
--   busy (60 fps-shaped) 0.158 / 0.206 ms -> 0.147 / 0.179 ms; 10 cycles: census unchanged,
--   heap +0.8%, SP 1.14x / MP 1.07x (SwiftShader noise; the counts are the proof).

local has_mp, MP = pcall(require, 'rmh_mp')

local SEED = 'RMHPERF1'
local FRAMES = 240

local function now() return love.timer.getTime() end

--- Mean milliseconds per frame spent in love.update and in love.event.pump (where the
-- platform layer runs RMH.frame_hooks and RMH.net.pump), over n frames.
local function measure(n)
  local upd, pump, frames = 0, 0, 0
  local u0, p0 = love.update, love.event.pump
  love.update = function(...)
    local t = now()
    local r = u0(...)
    upd = upd + (now() - t)
    frames = frames + 1
    return r
  end
  love.event.pump = function(...)
    local t = now()
    local r = p0(...)
    pump = pump + (now() - t)
    return r
  end
  local start = now()
  local ok, err = AP.sched.protected(wait_frames, n)
  local wall = now() - start
  love.update, love.event.pump = u0, p0
  if not ok then error(err, 0) end
  frames = math.max(1, frames)
  return { update = upd * 1000 / frames, pump = pump * 1000 / frames, frame = wall * 1000 / frames, frames = frames }
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
  after_each(leave)

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
    local sp = measure(FRAMES)
    mount_match()
    to_hand()
    local mp = measure(FRAMES)
    local overhead = (mp.update + mp.pump) - (sp.update + sp.pump)
    results.sp = sp
    results.mp = mp
    results.hook_overhead_ms = overhead
    results.frame_delta_ms = mp.frame - sp.frame
    local ratio = (mp.update + mp.pump) / math.max(1e-6, sp.update + sp.pump)
    results.lua_ratio = ratio
    results.frame_ratio = mp.frame / math.max(1e-6, sp.frame)
    report('perf_hooks', { sp = sp, mp = mp, overhead_ms = overhead, lua_ratio = ratio, frame_ratio = results.frame_ratio })
    expect(ratio <= 1.3).truthy()
    expect(results.frame_ratio <= 1.10).truthy()
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
    local sp0 = measure(FRAMES)
    mount_match()
    to_hand()
    local mp0 = measure(FRAMES)
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
    local sp1 = measure(FRAMES)
    mount_match()
    to_hand()
    local mp1 = measure(FRAMES)
    local lua = function(m) return m.update + m.pump end
    local g = {
      cycles = CYCLES, before = before, after = after,
      sp_before = sp0, sp_after = sp1, mp_before = mp0, mp_after = mp1,
      sp_growth = lua(sp1) / math.max(1e-6, lua(sp0)),
      mp_growth = lua(mp1) / math.max(1e-6, lua(mp0)),
      lua_ratio_after = lua(mp1) / math.max(1e-6, lua(sp1)),
      heap_before_kb = heap0, heap_after_kb = heap1, heap_growth = heap1 / math.max(1, heap0),
    }
    results.growth = g
    report('perf_growth', g)
    for k, v in pairs(before) do
      if k ~= 'log_ring' and after[k] ~= v then error(string.format('%s grew from %s to %s over %d cycles', k, tostring(v), tostring(after[k]), CYCLES), 0) end
    end
    expect(g.heap_growth <= 1.10).truthy()
    expect(g.sp_growth <= 1.2).truthy() -- SwiftShader noise is ~±10%; before the fix 1.85
    expect(g.mp_growth <= 1.2).truthy()
    expect(g.lua_ratio_after <= 1.3).truthy()
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
