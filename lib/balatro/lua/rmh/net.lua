-- rmh/net.lua: the Lua half of the Lua<->JS mailbox (PLAN §3.c; JS half
-- lib/balatro/mp/bridge.ts). rmh_web exposes it as RMH_WEB.net and pumps it once
-- per frame. Out: NDJSON written to OUT_TMP, then os.rename'd to OUT, where JS
-- takes it (inside the rename when FS.trackingDelegate exists; by polling if not,
-- so a batch waits while OUT is still there). The first line is the header
-- {"h":1,"ack":<last JS seq applied>,"fr":<frame>}; a header-only batch acks.
-- In: JS keeps IN current; Lua reads it whole, removes it, drops s <= last, then
-- validates (N.validate, set by the MP pack) and calls the one handler per type.
--
-- Cost per frame (PLAN §6.4 budgets: idle <= 0.05 ms, busy <= 0.3 ms at 50 msg/s). On
-- Emscripten's MEMFS a failed io.open throws and catches a JS ErrnoError, which alone costs
-- about 0.1 ms, so an idle frame opens nothing:
--   * IN_SIG is a signal file Lua keeps open: JS makes it non-empty whenever it writes IN, and
--     an idle frame is one seek on that handle. Lua empties it before reading IN. A writer
--     that never signals is still read every POLL_EVERY frames; without IN_SIG (no /rmh/net)
--     Lua polls IN every frame as before and retries IN_SIG every SIG_RETRY frames.
--   * A batch with messages goes out the frame they were sent; an ack-only batch (header only)
--     at most every ACK_EVERY frames: JS only needs acks to prune lines it would otherwise
--     rewrite (polling mode), and Lua drops repeated seqs anyway.
local J = require('rmh/json')

local N = {
  OUT_TMP = '/rmh/net/out.tmp', OUT = '/rmh/net/out', IN = '/rmh/net/in', IN_SIG = '/rmh/net/in.sig',
  LINE_MAX = 65536, BATCH_MAX = 262144, QUEUE_MAX = 4096,
  POLL_EVERY = 30, SIG_RETRY = 60, ACK_EVERY = 8,
  seq = 0, last = 0, acked = 0, frame = 0, queue = {}, handlers = {},
  ack_frame = 0, sig = nil, sig_retry_at = 0,
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
  if #q == 0 and (N.acked == N.last or N.frame - N.ack_frame < N.ACK_EVERY) then return 0 end
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
  N.ack_frame = N.frame
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

--- The handle on IN_SIG, opened (and created when missing) on first use. nil while it cannot be.
local function sig_handle()
  if N.sig then return N.sig end
  if N.frame < N.sig_retry_at then return nil end
  N.sig_retry_at = N.frame + N.SIG_RETRY
  local f = io.open(N.IN_SIG, 'rb')
  if not f then
    local c = io.open(N.IN_SIG, 'ab')
    if not c then return nil end
    c:close()
    f = io.open(N.IN_SIG, 'rb')
    if not f then return nil end
  end
  N.sig = f
  return f
end

--- Whether IN may hold something this frame (consumes the signal).
function N.pending()
  local f = sig_handle()
  if not f then return true end
  local size = f:seek('end')
  if not size then
    f:close()
    N.sig = nil
    return true
  end
  if size > 0 then
    -- Empty the signal before reading IN: a write that lands while IN is read signals again.
    local w = io.open(N.IN_SIG, 'wb')
    if w then w:close() end
    return true
  end
  return N.frame % N.POLL_EVERY == 0
end

--- Drop the IN_SIG handle (tests that move the paths; a full reset).
function N.reset_signal()
  if N.sig then pcall(N.sig.close, N.sig) end
  N.sig, N.sig_retry_at = nil, 0
end

function N.receive()
  if not N.pending() then return 0 end
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
