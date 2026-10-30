-- rmh/net.lua (WS3): the Lua half of the mailbox, against real temp files.
-- The TS half is lib/balatro/mp/bridge.ts; the two run against each other in
-- lib/balatro/mp/__tests__/bridge-lua.test.ts, and both read the shared NDJSON
-- cases in lib/balatro/mp/__fixtures__/mailbox.json.

local J = require 'rmh/json'
local FX = require 'spec.json_fixture'

local dir = os.tmpname()
os.remove(dir)
os.execute('mkdir -p "' .. dir .. '"')

local function read(path)
  local f = io.open(path, 'rb')
  if not f then return nil end
  local s = f:read('*a')
  f:close()
  return s
end

local function write(path, text)
  local f = assert(io.open(path, 'wb'))
  f:write(text)
  f:close()
end

local function lines(text)
  local out = {}
  for l in (text or ''):gmatch('[^\n]+') do out[#out + 1] = l end
  return out
end

local N, logs

local function fresh()
  package.loaded['rmh/net'] = nil
  N = require 'rmh/net'
  N.OUT_TMP, N.OUT, N.IN = dir .. '/out.tmp', dir .. '/out', dir .. '/in'
  os.remove(N.OUT_TMP)
  os.remove(N.OUT)
  os.remove(N.IN)
  logs = {}
  N.log = function(m) logs[#logs + 1] = m end
end

-- What JS does on its side of OUT: take the batch and remove the file.
local function take()
  local text = read(N.OUT)
  os.remove(N.OUT)
  local out = lines(text)
  for i, l in ipairs(out) do out[i] = J.decode(l) end
  return out
end

local function js(...)
  local parts = {}
  for i, m in ipairs({ ... }) do parts[i] = type(m) == 'string' and m or J.encode(m) end
  write(N.IN, table.concat(parts, '\n') .. '\n')
end

describe('mailbox send', function()
  before_each(fresh)

  it('does nothing on an idle frame', function()
    expect(N.pump()).eq(0)
    expect(read(N.OUT)).eq(nil)
    expect(read(N.OUT_TMP)).eq(nil)
  end)

  it('batches a frame with a header, in order, with rising seqs', function()
    expect(N.send('mp_open', { intent = 'menu' })).eq(1)
    expect(N.send('mp_log', { level = 'info', msg = 'x' })).eq(2)
    N.pump()
    local b = take()
    expect(b[1]).eq({ h = 1, ack = 0, fr = 1 })
    expect(b[2].s).eq(1)
    expect(b[2].t).eq('mp_open')
    expect(b[2].d).eq({ intent = 'menu' })
    expect(b[3].s).eq(2)
    expect(read(N.OUT_TMP)).eq(nil)
  end)

  it('sends {} for a message without data', function()
    N.send('ui_start')
    N.pump()
    local raw = lines(read(N.OUT))[2]
    expect(raw:find('"d":{}', 1, true) ~= nil).truthy()
  end)

  it('snapshots data at send time', function()
    local d = { ready = true }
    N.send('ui_ready', d)
    d.ready = false
    N.pump()
    expect(take()[2].d.ready).eq(true)
  end)

  it('holds the batch while JS has not taken the last one (polling mode)', function()
    N.send('ui_leave', {})
    N.pump()
    N.send('ui_start', {})
    N.pump()
    local first = take()
    expect(#first).eq(2)
    expect(first[2].t).eq('ui_leave')
    N.pump()
    local second = take()
    expect(second[2].t).eq('ui_start')
    expect(second[2].s).eq(2)
  end)

  it('refuses what cannot be encoded without using a seq', function()
    expect(N.send('ev', { e = { t = 'play_hand', score = 0 / 0 } })).eq(false)
    expect(N.send(42, {})).eq(false)
    expect(#logs).eq(1)
    expect(N.send('ui_start', {})).eq(1)
  end)

  it('refuses a line over 64 KB', function()
    expect(N.send('ui_chat', { text = string.rep('a', 70000) })).eq(false)
    expect(logs[1]:find('too long', 1, true) ~= nil).truthy()
  end)

  it('splits a frame over 256 KB across batches without losing order', function()
    local chunk = string.rep('b', 60000)
    for i = 1, 6 do N.send('mp_log', { level = 'info', msg = chunk .. i }) end
    N.pump()
    local a = take()
    expect(#a).eq(5) -- header + 4 × ~60 KB
    N.pump()
    local b = take()
    expect(#b).eq(3)
    expect(b[2].s).eq(5)
    expect(b[3].d.msg:sub(-1)).eq('6')
  end)

  it('caps the outbox when JS never reads it', function()
    N.QUEUE_MAX = 3
    for _ = 1, 5 do N.send('ui_start', {}) end
    expect(#N.queue).eq(3)
    expect(logs[1]:find('outbox full', 1, true) ~= nil).truthy()
  end)
end)

describe('mailbox receive', function()
  before_each(fresh)

  it('dispatches in file order and removes the inbox', function()
    local got = {}
    N.on('toast', function(d, m) got[#got + 1] = d.key .. '@' .. m.s end)
    js({ s = 1, t = 'toast', d = { key = 'a' } }, { s = 2, t = 'toast', d = { key = 'b' } })
    expect(N.pump()).eq(2)
    expect(got).eq({ 'a@1', 'b@2' })
    expect(read(N.IN)).eq(nil)
  end)

  it('drops duplicates and older seqs (a rewritten inbox)', function()
    local got = {}
    N.on('toast', function(d) got[#got + 1] = d.key end)
    js({ s = 1, t = 'toast', d = { key = 'a' } }, { s = 2, t = 'toast', d = { key = 'b' } })
    N.pump()
    js({ s = 1, t = 'toast', d = { key = 'a' } }, { s = 2, t = 'toast', d = { key = 'b' } }, { s = 3, t = 'toast', d = { key = 'c' } })
    N.pump()
    expect(got).eq({ 'a', 'b', 'c' })
    expect(N.last).eq(3)
  end)

  it('acks the last applied seq on the next batch, header-only if needed', function()
    N.on('toast', function() end)
    js({ s = 7, t = 'toast', d = { key = 'a' } })
    N.pump()
    expect(read(N.OUT)).eq(nil) -- nothing to ack yet when the batch was written
    N.pump()
    local b = take()
    expect(#b).eq(1)
    expect(b[1].ack).eq(7)
    N.pump()
    expect(read(N.OUT)).eq(nil) -- acked once, then idle again
  end)

  it('logs and drops malformed lines, unknown types and bad data, keeping the rest', function()
    local got = {}
    N.on('toast', function(d) got[#got + 1] = d.key end)
    js('{not json', '{"s":1,"t":"toast","d":{"key":"a"}}', '[1,2]', '{"s":"2","t":"toast"}',
      '{"s":3,"t":"no_such","d":{}}', '{"s":4,"t":"toast","d":"str"}', '{"s":5,"t":"toast","d":{"key":"b"}}')
    N.pump()
    expect(got).eq({ 'a', 'b' })
    expect(#logs).eq(5)
  end)

  it('runs the validator before the handler and drops what fails', function()
    local got = {}
    N.on('toast', function(d) got[#got + 1] = d.key end)
    N.validate = function(t, d)
      if type(d.key) ~= 'string' then return false, t .. '.key: expected string' end
      return true
    end
    js({ s = 1, t = 'toast', d = { key = 1 } }, { s = 2, t = 'toast', d = { key = 'ok' } })
    N.pump()
    expect(got).eq({ 'ok' })
    expect(logs[1]:find('toast.key', 1, true) ~= nil).truthy()
    expect(N.last).eq(2) -- an invalid message still used its seq
  end)

  it('isolates a failing handler', function()
    local got = {}
    N.on('toast', function(d)
      if d.key == 'boom' then error('kaboom') end
      got[#got + 1] = d.key
    end)
    js({ s = 1, t = 'toast', d = { key = 'boom' } }, { s = 2, t = 'toast', d = { key = 'after' } })
    N.pump()
    expect(got).eq({ 'after' })
    expect(logs[1]:find('kaboom', 1, true) ~= nil).truthy()
  end)

  it('lets a handler register handlers for later lines of the same batch', function()
    local got = {}
    N.on('mp_pack', function()
      N.on('lobby_view', function(d) got[#got + 1] = d.me end)
    end)
    js({ s = 1, t = 'mp_pack', d = { status = 'ready' } }, { s = 2, t = 'lobby_view', d = { me = 'u1' } })
    N.pump()
    expect(got).eq({ 'u1' })
  end)

  it('treats a missing d as {}', function()
    local seen
    N.on('timer_cue', function(d) seen = d end)
    js('{"s":1,"t":"timer_cue"}')
    N.pump()
    expect(seen).eq({})
  end)

  it('sends replies a handler queues on the next frame', function()
    N.on('toast', function(d) N.send('mp_log', { level = 'info', msg = 'got ' .. d.key }) end)
    js({ s = 1, t = 'toast', d = { key = 'k' } })
    N.pump()
    N.pump()
    local b = take()
    expect(b[1].ack).eq(1)
    expect(b[2].d.msg).eq('got k')
  end)

  it('drops lines over 64 KB', function()
    N.on('toast', function() end)
    js('{"s":1,"t":"toast","d":{"key":"' .. string.rep('x', 70000) .. '"}}', { s = 2, t = 'toast', d = { key = 'k' } })
    expect(N.pump()).eq(1)
    expect(N.last).eq(2)
  end)
end)

describe('mailbox shared NDJSON fixtures', function()
  before_each(fresh)
  local fx = FX.read_file(RMH_SPEC.fixtures .. 'mailbox.json')

  for _, case in ipairs(fx.j2l) do
    it('j2l: ' .. case.name, function()
      local got = {}
      for _, t in ipairs(case.handlers) do
        N.on(t, function(d, m) got[#got + 1] = { s = m.s, t = m.t, d = d } end)
      end
      write(N.IN, case.text)
      N.pump()
      expect(#got).eq(#case.applied)
      for i, want in ipairs(case.applied) do
        expect(got[i].s).eq(want.s)
        expect(got[i].t).eq(want.t)
        expect(J.encode(got[i].d)).eq(J.encode(want.d))
      end
    end)
  end
end)
