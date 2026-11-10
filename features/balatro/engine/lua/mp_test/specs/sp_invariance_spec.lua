-- L2 golden-seed single-player invariance (PLAN §6.1, §6.3 E2E-20; parity FL/RS "SP untouched").
--
-- For several seeds, a vanilla run's first three shops, its Small/Big tags and its Boss for
-- antes 1 and 2 are reduced to one digest per seed. The digests are reported (`sp_golden`)
-- and compared by the vitest side (testing/balatro-e2e/engine/engine.test.ts) across:
--   - a boot with no MP pack at all (no `?mp=1`: MP never loaded) — the golden values;
--   - this boot with MP loaded (`require 'rmh_mp'`, after the content specs mounted and
--     unmounted their sessions) — `sp_golden`;
--   - the same boot after one more practice mount/unmount cycle — `sp_golden_remount`.
-- Inside one boot the spec also asserts loaded == remounted directly.

local has_mp, MP = pcall(require, 'rmh_mp')

local SEEDS = { 'RMHGOLD1', 'K7Q2ZP9X', '1A2B3C4D' }

local function state() return AP.run('state') end

local function blinds_of_ante()
  local rr = G.GAME.round_resets
  return string.format('a%d tags %s/%s boss %s', rr.ante, tostring(rr.blind_tags and rr.blind_tags.Small),
    tostring(rr.blind_tags and rr.blind_tags.Big), tostring(rr.blind_choices and rr.blind_choices.Boss))
end

local function golden(seed)
  if has_mp and MP.state and MP.state.session then error('a session is still mounted') end
  local s = AP.run('start_run', { seed = seed, stake = 1 })
  expect(s.seed).eq(seed)
  local parts = { blinds_of_ante() }
  for i = 1, 3 do
    AP.run('select_blind')
    AP.run('win_blind')
    AP.run('cash_out')
    parts[#parts + 1] = 'shop' .. i .. ' ' .. AP.run('shop_digest')
    AP.run('leave_shop')
  end
  parts[#parts + 1] = blinds_of_ante()
  expect(state().ante).eq(2)
  return table.concat(parts, ' || ')
end

local function all_golden()
  local out = {}
  for _, seed in ipairs(SEEDS) do out[seed] = golden(seed) end
  return out
end

local function practice_cycle()
  AP.run('prepare')
  MP.session.mount('practice', {
    resolved = {
      key = 'ruleset_mp_test', layers = { 'standard' }, multiplayerContent = true, banned = {}, bannedSilent = {},
      included = {}, reworked = {}, spectralBannedEnhancements = {}, stickers = {}, gameModifiers = {},
      startingParams = {}, setupHooks = {},
      flags = { theOrder = true, enemyLocationDisabled = false, comeback = 'default' },
      timer = { enabled = false, base = 0, increment = 0, forgiveness = 0, pvpHandIncrement = 0, mode = 'default',
        pressurePlusHand = 0, countdown = 3, mult = 1 },
    },
    deck = 'b_red', stake = 1, seed = SEEDS[1],
    shape = { nemesisPairing = true, manhunt = false, teamBased = false, practice = true },
    options = { pvpStartRound = 2, theOrder = true, multiplayerJokers = true, timer = false },
  })
  MP.session.launch(SEEDS[1])
  AP.run('wait_state', { 'BLIND_SELECT' })
  AP.run('select_blind')
  AP.run('win_blind')
  MP.session.unmount('test')
  expect(MP.registry.leaked_keys()).eq({})
end

describe('single-player golden seeds', function()
  it('first three shops, tags and bosses are reproducible for every seed', function()
    local g = all_golden()
    for _, seed in ipairs(SEEDS) do expect(type(g[seed])).eq('string') end
    -- The run is seeded: a second pass in the same state deals the same.
    expect(golden(SEEDS[1])).eq(g[SEEDS[1]])
    report(has_mp and 'sp_golden' or 'sp_golden_vanilla', g)
  end)

  if has_mp then
    it('are unchanged after a practice session mounts and unmounts', function()
      local before = {}
      for _, seed in ipairs(SEEDS) do before[seed] = golden(seed) end
      practice_cycle()
      local after = all_golden()
      expect(after).eq(before)
      report('sp_golden_remount', after)
    end)
  end
end)
