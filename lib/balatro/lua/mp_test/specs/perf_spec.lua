-- L2 performance budgets of the MP Lua side (PLAN §6.4), measured in the real love.wasm:
--
--   MP Lua hook overhead  ≤ 1.0 ms per frame on average while a match is mounted and a hand is
--                         being played, vs single player on the same seed (love.update plus the
--                         per-frame hooks and the mailbox pump);
--   mailbox idle cost     ≤ 0.05 ms per frame (RMH.net.pump with nothing to read);
--   mailbox busy cost     ≤ 0.3 ms per frame at 50 messages a second.
-- Each number is the mean over many frames (wall clock, love.timer.getTime = performance.now),
-- and is reported (`perf`) so the vitest side prints it. Software-rendered CI pages are slow
-- and noisy: the hook overhead is the difference of two means taken back to back, and the
-- assertion allows 2x the budget (the plan's "hard fail > 2x" rule); the reported figure is
-- the one to read against the budget.

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
    expect(ms <= 0.05 * 2).truthy()
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
    report('perf_hooks', { sp = sp, mp = mp, overhead_ms = overhead })
    expect(overhead <= 1.0 * 2).truthy()
  end)

  it('mailbox busy cost at 50 messages a second', function()
    mount_match()
    to_hand()
    -- Feed /rmh/net/in as the page does (bridge.ts): whole-file NDJSON, sequence numbers above
    -- what Lua has applied, here timer_state (a message every frame of a running timer).
    local seq = (RMH.net.last or 0) + 1000
    local carry = 0
    local feed = function(dt)
      carry = carry + 50 * (dt or 0)
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
      end
    end
    local before = MP.net.stats.received
    table.insert(RMH.frame_hooks, 1, feed)
    local pump = RMH.net.pump
    local spent, calls = 0, 0
    RMH.net.pump = function(...)
      local t = now()
      local r = pump(...)
      spent = spent + (now() - t)
      calls = calls + 1
      return r
    end
    local ok, err = AP.sched.protected(sleep, 4)
    RMH.net.pump = pump
    for i, fn in ipairs(RMH.frame_hooks) do if fn == feed then table.remove(RMH.frame_hooks, i) break end end
    if not ok then error(err, 0) end
    local got = MP.net.stats.received - before
    local ms = spent * 1000 / math.max(1, calls)
    results.mailbox_busy_ms = ms
    results.mailbox_busy_msgs = got
    report('perf', results)
    expect(got >= 100).truthy()
    expect(ms <= 0.3 * 2).truthy()
  end)
end)
