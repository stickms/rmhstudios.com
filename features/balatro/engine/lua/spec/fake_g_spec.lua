-- Self-test of fake_g.lua: pools, prototypes and the event manager semantics.

local fake = require 'spec.fake_g'

describe('fake_g', function()
  before_each(function() fake.install() end)
  after_each(function() fake.uninstall() end)

  it('installs vanilla-shaped globals', function()
    expect(G.STATES.SELECTING_HAND).eq(1)
    expect(G.STATES.NEW_ROUND).eq(19)
    expect(type(G.P_CENTER_POOLS.Joker)).eq('table')
    expect(G.GAME.round_resets.blind_choices.Boss).eq('bl_wall')
    expect(type(Event)).eq('function')
  end)

  it('keeps pools sorted by order and rebuilds them on add_center', function()
    local before = #G.P_CENTER_POOLS.Joker
    fake.add_center('j_mp_pizza', { set = 'Joker', rarity = 1, order = 1001 })
    expect(#G.P_CENTER_POOLS.Joker).eq(before + 1)
    local pool = G.P_CENTER_POOLS.Joker
    expect(pool[#pool].key).eq('j_mp_pizza')
    for i = 2, #pool do expect(pool[i - 1].order <= pool[i].order).truthy() end
    local commons = G.P_JOKER_RARITY_POOLS[1]
    expect(commons[#commons].key).eq('j_mp_pizza')
  end)

  it('runs immediate events in order and honours blocking', function()
    local order = {}
    local gate = false
    G.E_MANAGER:add_event(Event({ func = function() order[#order + 1] = 'a'; return gate end }))
    G.E_MANAGER:add_event(Event({ func = function() order[#order + 1] = 'b'; return true end }))
    G.E_MANAGER:add_event(Event({ blockable = false, func = function() order[#order + 1] = 'c'; return true end }))
    fake.advance(0)
    expect(order).eq({ 'a', 'c' })
    gate = true
    fake.flush()
    expect(order).eq({ 'a', 'c', 'a', 'b' })
  end)

  it('delays after-events by game time', function()
    local fired = false
    G.E_MANAGER:add_event(Event({ trigger = 'after', delay = 0.5, func = function() fired = true; return true end }))
    fake.advance(0) -- like vanilla, the delay starts at the first update that sees the event
    fake.advance(0.25)
    expect(fired).falsy()
    fake.advance(0.3)
    expect(fired).truthy()
  end)

  it('flush errors on a livelock', function()
    G.E_MANAGER:add_event(Event({ func = function() return false end }))
    expect(function() fake.flush(10) end).error('still pending')
    G.E_MANAGER:clear_queue()
    expect(G.E_MANAGER:pending()).eq(0)
  end)

  it('gives deterministic pseudo-random streams per seed', function()
    local a = pseudoseed('boss')
    local b = pseudoseed('boss')
    expect(a).ne(b)
    fake.uninstall()
    fake.install()
    expect(pseudoseed('boss')).eq(a)
  end)
end)
