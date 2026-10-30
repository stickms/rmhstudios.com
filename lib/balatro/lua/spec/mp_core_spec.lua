-- WS6 core: MP.hooks.wrap, score format, net dispatch/defer, codec.

local H = require 'spec.mp_helper'

describe('MP.hooks.wrap', function()
  local MP
  before_each(function() MP = H.fresh() end)
  after_each(H.teardown)

  it('stacks layers outermost-last and passes arguments/results through', function()
    local owner = { f = function(a, b) return a + b, 'x' end }
    local trace = {}
    MP.hooks.wrap(owner, 'f', function(orig, a, b) trace[#trace + 1] = 'one'; local r, s = orig(a, b); return r * 10, s end)
    MP.hooks.wrap(owner, 'f', function(orig, a, b) trace[#trace + 1] = 'two'; return orig(a + 1, b) end)
    local r, s = owner.f(1, 2)
    expect(r).eq(40)
    expect(s).eq('x')
    expect(trace).eq({ 'two', 'one' })
  end)

  it('is idempotent per id and per function', function()
    local owner = { n = 0, f = function() return 1 end }
    local hook = function(orig) owner.n = owner.n + 1; return orig() end
    MP.hooks.wrap(owner, 'f', hook)
    MP.hooks.wrap(owner, 'f', hook)
    MP.hooks.wrap(owner, 'f', function(orig) owner.n = owner.n + 10; return orig() end, { id = 'x' })
    MP.hooks.wrap(owner, 'f', function(orig) owner.n = owner.n + 100; return orig() end, { id = 'x' })
    owner.f()
    expect(owner.n).eq(101)
    expect(MP.hooks.count()).eq(2)
  end)

  it('uninstalls back to the exact original function', function()
    local orig = function() return 'orig' end
    local owner = { f = orig }
    local h = MP.hooks.wrap(owner, 'f', function(o) return 'hooked:' .. o() end, { group = 'session' })
    expect(owner.f()).eq('hooked:orig')
    h.remove()
    expect(owner.f == orig).truthy()
    MP.hooks.wrap(owner, 'f', function(o) return 'again' end, { group = 'session' })
    expect(MP.hooks.remove_group('session')).eq(1)
    expect(owner.f == orig).truthy()
  end)

  it('isolates hook errors: logs and calls the original once', function()
    local calls = 0
    local owner = { f = function(x) calls = calls + 1; return x * 2 end }
    MP.hooks.wrap(owner, 'f', function() error('boom') end)
    expect(owner.f(4)).eq(8)
    expect(calls).eq(1)
    local last = MP.log_ring[#MP.log_ring]
    expect(last.level).eq('error')
    expect(last.msg:find('boom', 1, true) ~= nil).truthy()
  end)

  it('does not call the original twice when the hook fails after calling it', function()
    local calls = 0
    local owner = { f = function() calls = calls + 1; return 1 end }
    MP.hooks.wrap(owner, 'f', function(orig) orig(); error('late') end)
    owner.f()
    expect(calls).eq(1)
  end)

  it('re-raises errors from the original unchanged', function()
    local owner = { f = function() error('vanilla crash', 0) end }
    MP.hooks.wrap(owner, 'f', function(orig) return orig() end)
    MP.hooks.wrap(owner, 'f', function(orig) return orig() end, { id = 'outer' })
    expect(function() owner.f() end).error('vanilla crash')
  end)

  it('skips a missing slot without throwing', function()
    expect(MP.hooks.wrap({}, 'nope', function() end, { optional = true })).eq(nil)
  end)
end)

describe('score format (§0.9)', function()
  local fmt
  before_each(function() H.fresh(); fmt = require 'rmh_mp.util.fmt' end)
  after_each(H.teardown)

  it('uses %.17g and the inf rules', function()
    expect(fmt.score(0)).eq('0')
    expect(fmt.score(123456789012345678)).eq('1.2345678901234568e+17')
    expect(fmt.score(1 / 0)).eq('inf')
    expect(fmt.score(-1 / 0)).eq('-inf')
    expect(fmt.score(0 / 0)).eq('inf')
    expect(fmt.score(1e308)).eq('1e+308')
    expect(fmt.score(2.5)).eq('2.5')
    expect(fmt.score(nil)).eq('0')
  end)

  it('round-trips through parse, and rejects junk', function()
    for _, x in ipairs({ 0, 1, 2.5, 1e300, 123456789012345678, 98765.4321 }) do
      expect(fmt.parse(fmt.score(x))).eq(x)
    end
    expect(fmt.parse('inf')).eq(1 / 0)
    expect(fmt.parse('1,000')).eq(nil)
    expect(fmt.parse({})).eq(nil)
  end)
end)

describe('MP.net', function()
  local MP
  before_each(function() MP = H.fresh(); H.transport() end)
  after_each(H.teardown)

  it('queues outbound messages and flushes once per frame', function()
    MP.net.send('ui_ready', { ready = true })
    expect(#H.sent_list).eq(0)
    MP.net.frame(0)
    expect(#H.sent_list).eq(1)
    expect(H.sent_list[1].t).eq('ui_ready')
  end)

  it('drops invalid outbound messages', function()
    expect(MP.net.send('ui_ready', { ready = 'yes' })).falsy()
    expect(MP.net.send('not_a_type', {})).falsy()
    expect(#H.sent('ui_ready')).eq(0)
    expect(#H.sent('mp_log')).eq(2)            -- both drops are reported to the page
  end)

  it('validates inbound messages and dispatches to the single handler', function()
    local got
    MP.net.on('host_changed', function(d) got = d.hostId end)
    expect(MP.net.receive('host_changed', { hostId = 'u2' })).truthy()
    expect(got).eq('u2')
    expect(MP.net.receive('host_changed', { hostId = '' })).falsy()   -- min length 1
    expect(MP.net.receive('bogus', {})).falsy()
    MP.net.on('host_changed', function(d) got = 'second' end)
    MP.net.receive('host_changed', { hostId = 'u3' })
    expect(got).eq('second')
  end)

  it('survives a failing handler', function()
    MP.net.on('host_changed', function() error('handler bug') end)
    expect(MP.net.receive('host_changed', { hostId = 'u2' })).falsy()
    expect(MP.net.stats.handler_errors).eq(1)
  end)

  it('defers to the safe point and keeps per-queue order', function()
    local ran = {}
    G.STATE = G.STATES.HAND_PLAYED
    MP.net.defer(function() ran[#ran + 1] = 'a' end)
    MP.net.defer(function() ran[#ran + 1] = 'b' end, function() return true end)
    MP.net.defer(function() ran[#ran + 1] = 'c' end, function() return true end, 'other')
    MP.net.frame(0)
    expect(ran).eq({ 'c' })                -- 'b' waits behind 'a' in the default queue
    G.STATE = G.STATES.SHOP
    G.E_MANAGER:add_event(Event({ func = function() return false end }))
    MP.net.frame(0)
    expect(ran).eq({ 'c' })                -- a blocking event is pending
    G.E_MANAGER:clear_queue()
    G.CONTROLLER.locked = true
    MP.net.frame(0)
    expect(ran).eq({ 'c' })
    G.CONTROLLER.locked = false
    MP.net.frame(0)
    expect(ran).eq({ 'c', 'a', 'b' })
  end)

  it('routes peer and sync messages', function()
    local got
    MP.sync.register('j_mp_pizza', { receive = function(from, data) got = { from, data.n }; return { send = { ack = true } } end })
    MP.net.receive('peer', { k = 'sync', from = 'u2', d = { obj = 'j_mp_pizza', kind = 'sync', data = { n = 2 } } })
    expect(got).eq({ 'u2', 2 })
    local peers = H.sent('peer')
    expect(#peers).eq(1)
    expect(peers[1].d.k).eq('sync')
    expect(peers[1].d.d.data.ack).eq(true)
  end)

  it('MP.event validates GameEvents', function()
    MP.state.session = { kind = 'match' }
    expect(MP.event({ t = 'new_round' })).truthy()
    expect(MP.event({ t = 'play_hand', score = '10', hands_left = 3, skips = 0 })).truthy()
    expect(MP.event({ t = 'play_hand', score = 10 })).falsy()
    expect(#H.events()).eq(2)
  end)
end)

describe('MP.card codec', function()
  local MP
  before_each(function() MP = H.fresh(); require 'rmh_mp.util.codec' end)
  after_each(H.teardown)

  it('accepts a well-formed SafeCard', function()
    expect(MP.card.validate({ key = 'j_joker', edition = 'foil', eternal = true, extra = { mult = 3 } })).truthy()
    expect(MP.card.validate({ key = 'c_base', enhancement = 'm_glass', seal = 'Red',
      front = { suit = 'Hearts', rank = 'Ace' } })).truthy()
  end)

  it('rejects malformed SafeCards', function()
    local bad = {
      'x', {}, { key = 'j_nope' }, { key = 'j_joker; os.exit()' }, { key = 'j_joker', edition = 'gold' },
      { key = 'j_joker', seal = 'Green' }, { key = 'j_joker', enhancement = 'j_joker' },
      { key = 'c_base', front = { suit = 'Stars', rank = 'Ace' } }, { key = 'j_joker', eternal = 'yes' },
      { key = 'j_joker', extra = { f = function() end } }, { key = 'j_joker', extra = { x = 0 / 0 } },
      { key = 'j_joker', extra = { s = string.rep('a', 65) } }, { key = 'j_joker', surprise = 1 },
    }
    for i, sc in ipairs(bad) do
      local ok = MP.card.validate(sc)
      if ok then error('case ' .. i .. ' accepted') end
    end
  end)

  it('only knows MP keys while they are mounted', function()
    MP.registry.define({ key = 'j_mp_test', kind = 'Joker' })
    expect(MP.card.validate({ key = 'j_mp_test' })).falsy()
    MP.registry.mount(H.resolved())
    expect(MP.card.validate({ key = 'j_mp_test' })).truthy()
    MP.registry.unmount()
    expect(MP.card.validate({ key = 'j_mp_test' })).falsy()
  end)

  it('serializes and builds through a constructor', function()
    local card = { config = { center = G.P_CENTERS.j_joker }, edition = { holo = true }, ability = { eternal = true, mult = 4 } }
    local sc = MP.card.serialize(card)
    expect(sc).eq({ key = 'j_joker', edition = 'holo', eternal = true, extra = { mult = 4 } })
    local built = MP.card.build(sc, nil, { make = function(center) return { center = center, ability = {}, set_eternal = function(c) c.et = true end } end })
    expect(built.center.key).eq('j_joker')
    expect(built.et).eq(true)
    expect(built.ability.mult).eq(4)
    expect(MP.card.build({ key = 'nope' })).eq(nil)
  end)
end)

describe('binding to the WS3 mailbox (rmh/net + rmh/json)', function()
  local MP, web
  before_each(function()
    package.loaded['rmh/json'], package.loaded['rmh/net'] = nil, nil
    web = { json = require('rmh/json'), net = require('rmh/net'), frame_hooks = {} }
    web.net.queue, web.net.handlers = {}, {}
    _G.RMH_WEB = web
    web.net.on('mp_pack', function() end)          -- rmh_mp_entry.lua owns this type
    local entry_handler = web.net.handlers.mp_pack
    MP = H.boot()
    web.entry_handler = entry_handler
  end)
  after_each(function() H.teardown(); _G.RMH_WEB = nil end)

  it('binds every MP-phase type, leaves the entry type alone and adds its frame hook', function()
    expect(MP.net.transport == web.net).truthy()
    expect(web.net.handlers.mp_pack == web.entry_handler).truthy()
    expect(type(web.net.handlers.outcome)).eq('function')
    expect(#web.frame_hooks).eq(1)
  end)

  it('encodes possibly-empty arrays as JSON arrays', function()
    MP.state.session = { kind = 'match', me = 'u1' }
    MP.mounted = true
    G.GAME.selected_back = { effect = { center = { key = 'b_red' } } }
    MP.report.send_player_result(true)
    MP.peer.send('stats_res', MP.report.stats())
    MP.net.flush()
    local text = table.concat(web.net.queue, '\n')
    expect(text:find('"jokers":[]', 1, true) ~= nil).truthy()
    expect(text:find('"vouchers":[]', 1, true) ~= nil).truthy()
  end)

  it('dispatches decoded inbound lines through validation', function()
    local got
    MP.net.on('host_changed', function(d) got = d.hostId end)
    web.net.dispatch('{"s":1,"t":"host_changed","d":{"hostId":"u9"}}')
    expect(got).eq('u9')
    web.net.dispatch('{"s":2,"t":"host_changed","d":{"hostId":5}}')
    expect(got).eq('u9')
  end)
end)

-- M1 fix 3: the real rmh_mp_entry.lua registers the mp_pack handler before rmh_mp loads; binding
-- rmh_mp must leave every P.ENTRY_J2L type with the entry (rmh/net keeps one handler per type).
describe('binding next to the real rmh_mp_entry.lua', function()
  local MP, web, P
  before_each(function()
    package.loaded['rmh/json'], package.loaded['rmh/net'], package.loaded['rmh_mp_entry'] = nil, nil, nil
    web = { json = require('rmh/json'), net = require('rmh/net'), frame_hooks = {} }
    web.net.queue, web.net.handlers = {}, {}
    web.net.log = function() end
    _G.RMH_WEB = web
    _G.G = { FUNCS = {}, UIT = { R = 'R', C = 'C', T = 'T' }, C = { UI = { TEXT_LIGHT = { 1, 1, 1, 1 } } } }
    _G.create_UIBox_main_menu_buttons = function() return { nodes = {} } end
    _G.Game = { start_up = function() end }
    require 'rmh_mp_entry'
    web.entry_handlers = {}
    P = require 'rmh_mp.protocol'
    for _, t in ipairs(P.ENTRY_J2L) do web.entry_handlers[t] = web.net.handlers[t] end
    _G.Game, _G.create_UIBox_main_menu_buttons = nil, nil
    MP = H.boot()
  end)
  after_each(function()
    H.teardown()
    _G.RMH_WEB = nil
    package.loaded['rmh_mp_entry'] = nil
  end)

  it('keeps every entry-level J2L handler and binds every other J2L type', function()
    expect(#P.ENTRY_J2L > 0).truthy()
    local entry = {}
    for _, t in ipairs(P.ENTRY_J2L) do
      entry[t] = true
      expect(type(web.entry_handlers[t])).eq('function')
      expect(web.net.handlers[t] == web.entry_handlers[t]).truthy()
    end
    for t in pairs(P.J2L) do
      if not entry[t] then expect(type(web.net.handlers[t])).eq('function') end
    end
  end)

  it('still leaves them alone after a second bind', function()
    MP.net.bind()
    for _, t in ipairs(P.ENTRY_J2L) do expect(web.net.handlers[t] == web.entry_handlers[t]).truthy() end
  end)

  it('an inbound mp_pack line reaches the entry, not the MP dispatcher', function()
    local mp_saw = false
    MP.net.on('mp_pack', function() mp_saw = true end)
    web.net.dispatch('{"s":1,"t":"mp_pack","d":{"status":"loading","progress":0.42}}')
    expect(web.mp_entry.st.text).eq('LOADING 42%')
    expect(mp_saw).eq(false)
  end)
end)
