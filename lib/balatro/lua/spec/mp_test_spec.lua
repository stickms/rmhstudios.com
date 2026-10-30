-- L1 specs for the test-only driver (lib/balatro/lua/mp_test, WS14): its JSON codec,
-- task scheduler, in-engine spec runner and the autopilot's dispatch, on a fake G.
-- The in-engine behaviour itself is covered by mp_test/specs/*_spec.lua (L2).

local base = RMH_SPEC.root .. 'lib/balatro/lua/mp_test/'
for _, m in ipairs({ 'json', 'sched', 'spec_engine', 'autopilot' }) do
  package.preload['rmh_mp_test.' .. m] = function() return dofile(base .. m .. '.lua') end
end

local json = require('rmh_mp_test.json')
local sched = require('rmh_mp_test.sched')
local spec_engine = require('rmh_mp_test.spec_engine')

local now = 0
sched.clock = function() return now end

local function drain(max)
  for _ = 1, max or 1000 do
    if sched.pending() == 0 then return end
    now = now + 0.1
    sched.tick()
  end
  error('tasks did not finish')
end

describe('mp_test json', function()
  it('encodes deterministically with sorted keys', function()
    expect(json.encode({ b = 1, a = { 3, 2 }, c = 'x' })).eq('{"a":[3,2],"b":1,"c":"x"}')
  end)
  it('formats numbers like the wire (%.17g, inf, NaN as inf)', function()
    expect(json.encode(0.1)).eq('0.10000000000000001')
    expect(json.encode(42)).eq('42')
    expect(json.encode(1 / 0)).eq('"inf"')
    expect(json.encode(-1 / 0)).eq('"-inf"')
    expect(json.encode(0 / 0)).eq('"inf"')
  end)
  it('escapes control characters and quotes', function()
    expect(json.encode('a"b\n\1')).eq('"a\\"b\\n\\u0001"')
  end)
  it('keeps empty arrays only when marked', function()
    expect(json.encode({})).eq('{}')
    expect(json.encode(json.array({}))).eq('[]')
    expect(json.encode(json.decode('[]'))).eq('[]')
  end)
  it('round-trips nested values and unicode escapes', function()
    local v = json.decode('{"id":"c1","cmd":"play","args":[[1,2],"best",true,null,-1.5e3],"s":"\\u00e9\\ud83d\\ude00"}')
    expect(v.id).eq('c1')
    expect(v.args[1]).eq({ 1, 2 })
    expect(v.args[3]).eq(true)
    expect(v.args[4] == json.null).truthy()
    expect(v.args[5]).eq(-1500)
    expect(v.s).eq('\195\169\240\159\152\128')
    expect(#v.args).eq(5)
  end)
  it('rejects malformed input without raising', function()
    for _, bad in ipairs({ '', '{', '[1,]', '{"a" 1}', '"open', 'nul', '{"a":1} x', '[' .. string.rep('[', 70) }) do
      local v, err = json.decode(bad)
      expect(v).eq(nil)
      expect(type(err)).eq('string')
    end
    expect(select(2, json.decode(nil))).eq('not a string')
  end)
  it('refuses cycles', function()
    local t = {}
    t.self = t
    expect(function() json.encode(t) end).error('cycle')
  end)
end)

describe('mp_test sched', function()
  it('runs a task across frames and reports its value', function()
    local got
    sched.spawn(function()
      sched.wait_frames(3)
      return 'done'
    end, function(ok, v) got = { ok, v } end)
    drain()
    expect(got).eq({ true, 'done' })
  end)
  it('times out wait_until with the reason', function()
    local got
    sched.spawn(function()
      sched.wait_until(function() return false end, 1, 'never')
    end, function(ok, v) got = { ok, v } end)
    drain()
    expect(got[1]).eq(false)
    expect(got[2]:find('timeout: never', 1, true) ~= nil).truthy()
  end)
  it('ends a task that raises, with a traceback', function()
    local got
    sched.spawn(function() error('kaboom') end, function(ok, v) got = { ok, v } end)
    drain()
    expect(got[1]).eq(false)
    expect(got[2]:find('kaboom', 1, true) ~= nil).truthy()
  end)
  it('refuses to wait outside a task', function()
    expect(function() sched.wait_frames(1) end).error('inside a test task')
  end)
  it('starts tasks spawned by a callback on the next tick', function()
    local order = {}
    sched.spawn(function() order[#order + 1] = 'a' end, function()
      sched.spawn(function() order[#order + 1] = 'b' end)
    end)
    drain()
    expect(order).eq({ 'a', 'b' })
  end)
end)

describe('mp_test spec_engine', function()
  local SRC = [[
    describe('d', function()
      local n = 0
      before_each(function() n = n + 1 end)
      it('passes after waiting', function()
        wait_frames(2)
        expect(n).eq(1)
        report('k', 'v')
      end)
      it('fails', function() expect(1).eq(2) end)
      it('errors after a wait', function() wait_frames(1); error('late') end)
      xit('skipped', function() end)
      it('deep eq', function() expect({ a = { 1 } }).eq({ a = { 1 } }) end)
    end)
    LEAK = true
  ]]

  it('runs yielding tests, records failures, skips and reports', function()
    local summary, streamed = nil, {}
    sched.spawn(function()
      return spec_engine.run({ { name = 'x_spec', source = SRC } }, {
        on_result = function(r) streamed[#streamed + 1] = r.name end,
        clock = function() return now end,
      })
    end, function(ok, v)
      if not ok then error(v) end
      summary = v
    end)
    drain()
    expect(summary.passed).eq(2)
    expect(summary.failed).eq(2)
    expect(summary.skipped).eq(1)
    expect(summary.reports).eq({ k = 'v' })
    expect(streamed[1]).eq('x_spec > d > passes after waiting')
    expect(summary.tests[2].msg:find('expected 2', 1, true) ~= nil).truthy()
    expect(summary.tests[3].msg:find('late', 1, true) ~= nil).truthy()
    expect(rawget(_G, 'LEAK')).eq(nil)
  end)

  it('filters by name and reports load errors per file', function()
    local summary
    sched.spawn(function()
      return spec_engine.run({
        { name = 'x_spec', source = SRC },
        { name = 'broken_spec', source = 'this is not lua' },
      }, { filter = 'deep' })
    end, function(_, v) summary = v end)
    drain()
    expect(#summary.tests).eq(2)
    expect(summary.tests[1].name).eq('x_spec > d > deep eq')
    expect(summary.tests[2].name).eq('broken_spec (load)')
    expect(summary.tests[2].ok).eq(false)
  end)
end)

describe('mp_test autopilot', function()
  local AP
  before_each(function()
    package.loaded['rmh_mp_test.autopilot'] = nil
    AP = require('rmh_mp_test.autopilot')
    G = {
      STATES = { SELECTING_HAND = 1, SHOP = 5, BLIND_SELECT = 7 },
      STAGES = { MAIN_MENU = 1, RUN = 2 },
      STATE = 7,
      STAGE = 2,
      STATE_COMPLETE = true,
      CONTROLLER = { locks = {} },
      E_MANAGER = { queues = { base = {} } },
      FUNCS = {},
    }
  end)
  after_each(function() G = nil end)

  it('is inert without the test marker', function()
    AP.MARKER = RMH_SPEC.root .. 'no/such/marker'
    expect(AP.enabled()).eq(false)
    expect(AP.install()).eq(false)
  end)

  it('names states and judges idleness', function()
    expect(AP.state_name()).eq('BLIND_SELECT')
    expect(AP.idle()).eq(true)
    G.CONTROLLER.locks.shop_reroll = true
    expect(AP.idle()).eq(false)
    G.CONTROLLER.locks = {}
    G.E_MANAGER.queues.base = { { blocking = false }, { blocking = true } }
    expect(AP.idle()).eq(false)
    G.E_MANAGER.queues.base = { { blocking = false } }
    G.STATE_COMPLETE = false
    expect(AP.idle()).eq(false)
  end)

  it('finds and presses buttons through nested UIBoxes', function()
    local pressed
    G.FUNCS.cash_out = function(node) pressed = node end
    local inner = { UIRoot = { config = {}, children = { { config = { button = 'cash_out', id = 'x' }, children = {} } } } }
    local box = { UIRoot = { config = {}, children = { { config = { object = inner }, children = {} } } } }
    local node = AP.button(box, 'cash_out')
    expect(node.config.id).eq('x')
    expect(AP.press(node)).eq('cash_out')
    expect(pressed).eq(node)
    expect(AP.button(box, 'toggle_shop')).eq(nil)
    expect(function() AP.press({ config = {} }) end).error('not pressable')
  end)

  it('answers unknown commands and failures through the reply, never by raising', function()
    local replies = {}
    local function reply(id, ok, data) replies[#replies + 1] = { id = id, ok = ok, data = data } end
    AP.exec('c1', 'nope', {}, reply)
    AP.exec('c2', 'ready', {}, reply)
    AP.exec('c3', 'wait_state', { 'SHOP', 1 }, reply)
    AP.exec('c4', 'state', {}, reply)
    drain()
    local by = {}
    for _, r in ipairs(replies) do by[r.id] = r end
    expect(by.c1.ok).eq(false)
    expect(by.c1.data.error:find('unknown command', 1, true) ~= nil).truthy()
    expect(by.c2.data.error:find('mp-unavailable', 1, true) ~= nil).truthy()
    expect(by.c3.data.error:find('timeout: state SHOP', 1, true) ~= nil).truthy()
    expect(by.c4.ok).eq(true)
    expect(by.c4.data.state).eq('BLIND_SELECT')
  end)

  it('attaches to a mailbox and replies with test_res', function()
    local handlers, sent = {}, {}
    AP.attach({ on = function(t, fn) handlers[t] = fn end, send = function(t, d) sent[#sent + 1] = { t, d } end })
    handlers.test_cmd({ id = 'm1', cmd = 'state', args = {} })
    handlers.test_cmd({ id = 5, cmd = 'state' }) -- malformed: ignored
    drain()
    expect(#sent).eq(1)
    expect(sent[1][1]).eq('test_res')
    expect(sent[1][2].id).eq('m1')
    expect(sent[1][2].ok).eq(true)
  end)

  it('routes MP actions to MP.test once the MP pack provides it', function()
    MP = { test = { ready = function(a) return { readied = a.on ~= false } end } }
    local got
    sched.spawn(function() return AP.run('ready', {}) end, function(ok, v) got = { ok, v } end)
    drain()
    MP = nil
    expect(got).eq({ true, { readied = true } })
  end)

  it('unwraps named args sent as the mailbox array [{...}]', function()
    local seen
    AP.register('echo', function(a) seen = a return true end)
    sched.spawn(function()
      AP.run('echo', { { seed = 'X' } })
      expect(seen.seed).eq('X')
      AP.run('echo', { { 1, 2 } })
      expect(seen).eq({ { 1, 2 } })
      AP.run('echo', { 'best' })
      expect(seen).eq({ 'best' })
    end, function(ok, v) if not ok then error(v) end end)
    drain()
  end)

  it('validates seeds and command arguments', function()
    local got
    sched.spawn(function() return AP.run('start_run', { seed = 'bad seed!' }) end, function(ok, v) got = { ok, v } end)
    drain()
    expect(got[1]).eq(false)
    expect(got[2]:find('seed', 1, true) ~= nil).truthy()
    expect(function() AP.register(1, 2) end).error('AP.register')
  end)
end)
