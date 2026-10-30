-- rmh/net.lua: the Lua half of the Lua<->JS mailbox (PLAN §3.c; JS half
-- lib/balatro/mp/bridge.ts). rmh_web exposes it as RMH_WEB.net and pumps it once
-- per frame. Out: NDJSON written to OUT_TMP, then os.rename'd to OUT, where JS
-- takes it (inside the rename when FS.trackingDelegate exists; by polling if not,
-- so a batch waits while OUT is still there). The first line is the header
-- {"h":1,"ack":<last JS seq applied>,"fr":<frame>}; a header-only batch acks.
-- In: JS keeps IN current; Lua reads it whole, removes it, drops s <= last, then
-- validates (N.validate, set by the MP pack) and calls the one handler per type.
local J = require('rmh/json')

local N = {
  OUT_TMP = '/rmh/net/out.tmp', OUT = '/rmh/net/out', IN = '/rmh/net/in',
  LINE_MAX = 65536, BATCH_MAX = 262144, QUEUE_MAX = 4096,
  seq = 0, last = 0, acked = 0, frame = 0, queue = {}, handlers = {},
  validate = nil, -- function(t, d) -> ok, err
}

function N.log(msg)
  print('[rmh_net] ' .. msg)
end

--- Queue one message for this frame's batch. Returns its seq, or false.
function N.send(t, d)
  if type(t) ~= 'string' then return false end
  if #N.queue >= N.QUEUE_MAX then
    N.log('outbox full, dropped ' .. t)
    return false
  end
  local ok, line = pcall(J.encode, { s = N.seq + 1, t = t, d = d or {} })
  if not ok or #line > N.LINE_MAX then
    N.log('dropped ' .. t .. ': ' .. (ok and 'line too long' or tostring(line)))
    return false
  end
  N.seq = N.seq + 1
  N.queue[#N.queue + 1] = line
  return N.seq
end

--- One handler per type; fn(d, msg). nil removes it.
function N.on(t, fn)
  N.handlers[t] = fn
end

local function exists(path)
  local f = io.open(path, 'rb')
  if f then f:close() end
  return f ~= nil
end

function N.flush()
  local q = N.queue
  if #q == 0 and N.acked == N.last then return 0 end
  if exists(N.OUT) then return 0 end
  local parts = { J.encode({ h = 1, ack = N.last, fr = N.frame }) }
  local size, n = #parts[1] + 1, 0
  while q[n + 1] and size + #q[n + 1] + 1 <= N.BATCH_MAX do
    n = n + 1
    parts[n + 1] = q[n]
    size = size + #q[n] + 1
  end
  local f = io.open(N.OUT_TMP, 'wb')
  if not f then return 0 end
  local ok = f:write(table.concat(parts, '\n'), '\n')
  f:close()
  if not ok or not os.rename(N.OUT_TMP, N.OUT) then return 0 end
  N.acked = N.last
  local rest = {}
  for i = n + 1, #q do rest[#rest + 1] = q[i] end
  N.queue = rest
  return n
end

function N.dispatch(line)
  local ok, m = pcall(J.decode, line)
  if not ok or type(m) ~= 'table' or type(m.s) ~= 'number' or type(m.t) ~= 'string' then
    N.log('bad line: ' .. (ok and 'not a message' or tostring(m)))
    return false
  end
  if m.s <= N.last then return false end
  N.last = m.s
  local d = m.d == nil and {} or m.d
  local h = N.handlers[m.t]
  if type(d) ~= 'table' or d == J.null then
    N.log('bad data for ' .. m.t)
    return false
  end
  if not h then
    N.log('no handler for ' .. m.t)
    return false
  end
  if N.validate then
    local valid, err = N.validate(m.t, d)
    if not valid then
      N.log('invalid ' .. m.t .. ': ' .. tostring(err))
      return false
    end
  end
  local done, err = pcall(h, d, m)
  if not done then N.log('handler ' .. m.t .. ' failed: ' .. tostring(err)) end
  return true
end

function N.receive()
  local f = io.open(N.IN, 'rb')
  if not f then return 0 end
  local text = f:read('*a') or ''
  f:close()
  os.remove(N.IN)
  local n = 0
  for line in text:gmatch('[^\n]+') do
    if #line > N.LINE_MAX then N.log('dropped a line over the size limit')
    elseif N.dispatch(line) then n = n + 1 end
  end
  return n
end

--- Once per frame: send this frame's batch (JS may answer inside the rename),
--- then apply what JS has written.
function N.pump()
  N.frame = N.frame + 1
  N.flush()
  return N.receive()
end

return N
