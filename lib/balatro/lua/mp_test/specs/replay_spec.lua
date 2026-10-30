-- L2 in-engine spec for WS13 replays (PLAN §4 WS13 tests, REP-01/03/05): record a short
-- autopilot run in a local practice session, then play the log back through the real game and
-- compare the end state (money, deck, hand, jokers, consumables, chips, the replay digest).
--
-- Needs the MP pack extracted (`?mp=1` on the engine harness page:
--   pnpm exec tsx testing/balatro-e2e/engine/cli.ts --query mp=1 --spec replay_spec).
-- Without it the file reports one skipped test.

local has_mp, MP = pcall(require, 'rmh_mp')

local SEED = 'RMHWS13R'

if not has_mp then
  describe('replays (in-engine)', function()
    xit('needs the MP pack (?mp=1): ' .. tostring(MP):sub(1, 120), function() end)
  end)
  return
end

local REP = MP.replay
local RC, PL = REP.recorder, REP.player

local function resolved()
  return {
    key = 'ruleset_mp_test', layers = {}, multiplayerContent = false, banned = {}, bannedSilent = {}, included = {},
    reworked = {}, spectralBannedEnhancements = {}, stickers = {}, gameModifiers = {}, startingParams = {}, setupHooks = {},
    flags = { theOrder = true, enemyLocationDisabled = false, comeback = 'default' },
    timer = { enabled = false, base = 0, increment = 0, forgiveness = 0, pvpHandIncrement = 0, mode = 'default',
      pressurePlusHand = 0, countdown = 3, mult = 1 },
  }
end

local function leave()
  if PL.s then PL.close(true) end
  if MP.state.session then MP.session.unmount('test') end
  RC.on_batch = nil
end

local function keys(area)
  local out = {}
  for _, c in ipairs((area and area.cards) or {}) do out[#out + 1] = REP.fingerprint(c) end
  return table.concat(out, ',')
end

--- What must be identical after playback.
local function end_state()
  local g = G.GAME
  return {
    digest = REP.digest(), state = AP.state_name(), ante = g.round_resets.ante, round = g.round, dollars = g.dollars,
    chips = g.chips, hand = keys(G.hand), jokers = keys(G.jokers), consumeables = keys(G.consumeables),
    deck = keys(G.deck), hands_left = g.current_round.hands_left, discards_left = g.current_round.discards_left,
    seed = g.pseudorandom.seed,
  }
end

--- Play best hands until the blind is won (or the hands run out).
local function beat_blind()
  for _ = 1, 4 do
    local s = AP.run('play', { 'best' })
    if s.state ~= 'SELECTING_HAND' then return s end
  end
  return AP.run('state')
end

describe('replays: record and play back (in-engine)', function()
  after_each(leave)

  it('a played-back autopilot run reaches the identical state', function()
    AP.run('prepare')
    leave()
    local log = {}
    RC.on_batch = function(batch) for _, ev in ipairs(batch) do log[#log + 1] = ev end end
    MP.session.mount('practice', {
      resolved = resolved(), deck = 'b_red', stake = 1, seed = SEED, me = 'u_rec',
      shape = { nemesisPairing = true, manhunt = false, teamBased = false, practice = true },
      options = { pvpStartRound = 2, theOrder = true, multiplayerJokers = false, timer = false },
    })
    MP.session.launch(SEED)
    AP.run('wait_state', { 'BLIND_SELECT' })

    -- The recorded run: small blind (sorted hand + best plays), shop, big blind (a discard, a play).
    AP.run('select_blind')
    G.FUNCS.sort_hand_suit()
    AP.run('wait_idle')
    local s = beat_blind()
    expect(s.state).eq('ROUND_EVAL')
    AP.run('cash_out')
    local shop = AP.run('shop')
    for slot, card in ipairs(shop.jokers) do
      if (card.cost or 99) <= G.GAME.dollars and #G.jokers.cards < G.jokers.config.card_limit then
        AP.run('buy', { slot })
        break
      end
      if slot >= 2 then break end
    end
    AP.run('leave_shop')
    AP.run('select_blind')
    AP.run('discard', { { 1, 2 } })
    AP.run('play', { 'best' })
    AP.run('wait_idle')
    local recorded = end_state()
    MP.session.unmount('test')
    wait_frames(10)
    RC.on_batch = nil

    expect(#log > 10).truthy()
    expect(log[1].op).eq('match_manifest')
    expect(log[#log].op).eq('end')
    local seen = {}
    for _, ev in ipairs(log) do seen[ev.op] = (seen[ev.op] or 0) + 1 end
    for _, op in ipairs({ 'lobby_info', 'run_info', 'select_blind', 'play', 'discard', 'cashout', 'leave_shop', 'hand_scored' }) do
      expect(seen[op] ~= nil and op).eq(op)
    end
    report('replay_events', #log)

    -- Play it back at fast-forward.
    expect(PL.open({ id = 'spec-replay', pov = 'u_rec', speed = 0 })).truthy()
    PL.feed('u_rec', log)
    wait_until(function() return PL.s and PL.s.state ~= 'running' and PL.s.state ~= 'loading' end, 300, 'playback ended')
    local st = PL.status()
    expect(st.error and (tostring(st.error.at) .. ' ' .. st.error.op .. ': ' .. st.error.msg) or 'ok').eq('ok')
    expect(st.state).eq('done')
    expect(st.pos).eq(#log)
    AP.run('wait_idle')
    local played = end_state()
    expect(played).eq(recorded)
    report('replay_digest', played.digest)
    expect(G.SETTINGS.GAMESPEED ~= PL.FF_GAMESPEED or PL.saved_gamespeed == nil).truthy()
  end)

  it('a log continued after a reload rejoin plays back past the rejoin (docs/balatro-mp.md §11)', function()
    AP.run('prepare')
    leave()
    local files = {}
    local real_io = MP.saves.io
    MP.saves.io = {
      write = function(p, s) files[p] = s; return true end,
      read = function(p) return files[p] end,
      remove = function(p) files[p] = nil end,
    }
    local log = {}
    RC.on_batch = function(batch) for _, ev in ipairs(batch) do log[#log + 1] = ev end end
    local function info(over)
      local t = {
        runId = 'rL2rejoin', me = 'u_rec', hostId = 'u_opp', seed = SEED, deck = 'b_red', stake = 1,
        queueMode = 'pvp_nemesis', ruleset = 'ruleset_mp_test', resolved = resolved(), contentHash = 'x',
        shape = { nemesisPairing = true, manhunt = false, teamBased = false },
        roster = { { id = 'u_rec', name = 'REC' }, { id = 'u_opp', name = 'OPP' } },
        options = { pvpStartRound = 2, theOrder = true, multiplayerJokers = false, timer = false, startingLives = 4 },
      }
      for k, v in pairs(over or {}) do t[k] = v end
      return t
    end

    -- First life: the small blind, cash out; the shop's save writes the MP snapshot.
    MP.session.mount('match', info())
    MP.session.launch(SEED)
    AP.run('wait_state', { 'BLIND_SELECT' })
    AP.run('select_blind')
    expect(beat_blind().state).eq('ROUND_EVAL')
    AP.run('cash_out')
    AP.run('shop')
    AP.run('wait_idle')
    wait_until(function() return files['/rmh/mp/run.jkr'] ~= nil end, 120, 'shop snapshot')
    -- Progress the reload loses: a reroll.
    AP.run('reroll')
    AP.run('wait_idle')
    wait_frames(10)
    local base = #log
    -- What the session runtime keeps in IndexedDB: the last snapshot before the reload.
    local kept = { run = files['/rmh/mp/run.jkr'], state = files['/rmh/mp/state.json'] }
    local snap_i = MP.card.json.decode(kept.state).log_i
    expect(type(snap_i)).eq('number')
    expect(snap_i <= base).truthy()
    -- The tab reloads: no `end` (the recorder just stops), the session is gone.
    RC.active = false
    MP.session.unmount('test')

    -- Second life: match_start with logNext, the launch (its blind-select save overwrites the
    -- files), then the runtime writes the kept snapshot back and sends rejoin_restore (as live).
    MP.session.mount('match', info({ logNext = base }))
    MP.session.launch(SEED)
    AP.run('wait_state', { 'BLIND_SELECT' })
    AP.run('wait_idle')
    files['/rmh/mp/run.jkr'], files['/rmh/mp/state.json'] = kept.run, kept.state
    MP.net.receive('rejoin_restore', { runId = 'rL2rejoin', snapshotPath = '/rmh/mp/run.jkr',
      statePath = '/rmh/mp/state.json' })
    AP.run('wait_state', { 'SHOP' })
    AP.run('wait_idle')
    AP.run('leave_shop')
    AP.run('select_blind')
    AP.run('play', { 'best' })
    AP.run('wait_idle')
    local recorded = end_state()
    MP.session.unmount('test')
    wait_frames(10)
    RC.on_batch = nil
    MP.saves.io = real_io

    expect(log[base + 1].i).eq(base)
    expect(log[base + 1].d.mount).eq(true)
    local restore
    for k = base + 1, #log do if log[k].op == 'manifest' and log[k].d.restore then restore = log[k] end end
    expect(restore ~= nil).truthy()
    expect(restore.d.from).eq(snap_i)
    expect(restore.d.seg).eq(base)
    report('rejoin_snapshot', tostring(restore.d.z) .. ' ' .. tostring(restore.d.len) .. ' chars in '
      .. tostring(restore.d.parts) .. ' parts (run.jkr ' .. #kept.run .. ' bytes)')
    for k, ev in ipairs(log) do expect(ev.i).eq(k - 1) end

    expect(PL.open({ id = 'spec-rejoin', pov = 'u_rec', speed = 0 })).truthy()
    PL.feed('u_rec', log)
    wait_until(function() return PL.s and PL.s.state ~= 'running' and PL.s.state ~= 'loading' end, 600, 'playback ended')
    local st = PL.status()
    expect(st.error and (tostring(st.error.at) .. ' ' .. st.error.op .. ': ' .. st.error.msg) or 'ok').eq('ok')
    expect(st.state).eq('done')
    if snap_i < base then expect(PL.s.skips[snap_i]).eq(base) end
    AP.run('wait_idle')
    expect(end_state()).eq(recorded)
  end)

  it('a tampered log stops with a divergence error, not a crash', function()
    AP.run('prepare')
    leave()
    local log = {}
    RC.on_batch = function(batch) for _, ev in ipairs(batch) do log[#log + 1] = ev end end
    MP.session.mount('practice', {
      resolved = resolved(), deck = 'b_red', stake = 1, seed = SEED, me = 'u_rec',
      shape = { nemesisPairing = true, manhunt = false, teamBased = false, practice = true },
      options = { pvpStartRound = 2, theOrder = true, multiplayerJokers = false, timer = false },
    })
    MP.session.launch(SEED)
    AP.run('wait_state', { 'BLIND_SELECT' })
    AP.run('select_blind')
    AP.run('play', { 'best' })
    MP.session.unmount('test')
    wait_frames(10)
    RC.on_batch = nil
    for _, ev in ipairs(log) do
      if ev.op == 'play' then ev.d.cards[1].k = 'c_base|Stars:Zero' end
    end
    PL.open({ id = 'spec-bad', pov = 'u_rec', speed = 0 })
    PL.feed('u_rec', log)
    wait_until(function() return PL.s and PL.s.state ~= 'running' and PL.s.state ~= 'loading' end, 300, 'playback stopped')
    expect(PL.s.state).eq('diverged')
    expect(PL.s.error.op).eq('play')
  end)
end)
