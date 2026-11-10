-- L2 in-engine smoke (WS14a): proves the engine-spec harness runs specs inside the
-- real love.wasm against the current core pack, and that the autopilot can drive a
-- seeded vanilla run to its first shop deterministically.
--
-- The vitest side (testing/balatro-e2e/engine/engine.test.ts) boots the page twice
-- in fresh browser contexts and compares the `first_shop` report across boots.

local SEED = 'RMHTEST1'

describe('engine', function()
  it('runs the shipped game version under the web platform layer', function()
    expect(G.VERSION).eq('1.0.1o-FULL')
    expect(type(RMH)).eq('table')
    expect(love.system.getOS()).eq('Web')
    expect(G.STAGE).eq(G.STAGES.MAIN_MENU)
    report('version', G.VERSION)
  end)

  it('runs Lua 5.1 (no goto, no LuaJIT ffi), with bit ported', function()
    expect(_VERSION).eq('Lua 5.1')
    expect(rawget(_G, 'jit')).eq(nil)
    expect(require('bit').bxor(5, 3)).eq(6)
  end)

  it('waits across frames inside a spec', function()
    local f0 = AP.sched.frame
    wait_frames(3)
    expect(AP.sched.frame - f0 >= 3).truthy()
  end)
end)

describe('autopilot', function()
  it('drives a seeded run to the first shop, deterministically within a boot', function()
    local digests = {}
    for i = 1, 2 do
      local s = AP.run('start_run', { seed = SEED, stake = 1 })
      expect(s.state).eq('BLIND_SELECT')
      expect(s.seed).eq(SEED)
      expect(s.ante).eq(1)
      AP.run('select_blind')
      local won = AP.run('win_blind')
      expect(won.state).eq('ROUND_EVAL')
      AP.run('cash_out')
      digests[i] = AP.run('shop_digest')
      expect(#digests[i] > 0).truthy()
    end
    expect(digests[2]).eq(digests[1])
    report('first_shop', digests[1])
  end)

  it('plays the best hand and leaves the shop for the next blind', function()
    AP.run('leave_shop')
    local s = AP.run('select_blind')
    expect(s.state).eq('SELECTING_HAND')
    expect(#s.hand > 0).truthy()
    local idx = AP.best_indices()
    expect(#idx >= 1 and #idx <= 5).truthy()
    local after = AP.run('play', { 'best' })
    expect(after.chips > 0 or after.state == 'ROUND_EVAL').truthy()
  end)

  it('rejects unknown commands and MP actions without the MP pack', function()
    expect(function() AP.run('nope') end).error('unknown command')
    expect(function() AP.run('ready') end).error('mp-unavailable')
  end)
end)
