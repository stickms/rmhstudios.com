-- rmh_mp/net.lua — mailbox dispatch, safe-point deferral, peer/sync buses (PLAN §3.c, §3.d).
--
-- The byte-level mailbox (NDJSON files, seq/ack, JSON) is WS3's `RMH.net` in rmh_web.lua. This
-- module sits on top of it through a tiny transport interface so it can be tested (and run
-- before WS3 lands) without it:
--
--   transport = { send = function(t, d) end, on = function(t, handler(d, msg)) end }
--
-- MP.net.bind(transport?) picks RMH_WEB.net (rmh_web.lua §9) when present, otherwise a null
-- transport that logs. rmh/json drops null object fields and marks arrays: outbound arrays that
-- may be empty must go through MP.json_array(t) so they encode as [] (not {}).
--
-- Public API (frozen, §3.d):
--   MP.net.send(t, d)          validate (protocol.lua, l2j) and queue; flushed once per frame
--   MP.net.on(t, fn(d, msg))   one inbound handler per type (a second call replaces the first)
--   MP.net.defer(fn, pred, q)  run fn at the first frame where pred() is true (default
--                              MP.safe_point). Items of one queue `q` ('default') run strictly in
--                              order: a waiting item holds back the ones queued after it.
--   MP.safe_point()            not locked, no blocking event pending, state in
--                              {BLIND_SELECT, SHOP, SELECTING_HAND, ROUND_EVAL}
--   MP.event(e)                report a GameEvent ('ev'); also handed to MP.replay_hook (WS13)
--   MP.peer.send(kind, d, to?) / MP.peer.on(kind, fn(from, d))
--   MP.sync.register(centerKey, { receive = fn(from, data) }) / MP.sync.send(obj, data, to?, kind?)
-- Extras: MP.net.frame(dt) (the per-frame pump, registered in RMH.frame_hooks), MP.net.receive
-- (inject an inbound message — tests and loopback), MP.net.outbox (pending, for tests).

local MP = require 'rmh_mp.state'
local P = require 'rmh_mp.protocol'

local N = MP.net or {}
MP.net = N

N.outbox = N.outbox or {}
N.handlers = N.handlers or {}
N.deferred = N.deferred or {}
N.stats = N.stats or { sent = 0, dropped_out = 0, received = 0, dropped_in = 0, handler_errors = 0 }

local OUT_MAX = 2048 -- hard cap on queued outbound messages (a stuck transport must not grow forever)

local function web()
  return rawget(_G, 'RMH_WEB') or rawget(_G, 'RMH')
end

--- Mark a table as a JSON array for rmh/json (an empty Lua table otherwise encodes as {}).
function MP.json_array(t)
  local w = web()
  if w and w.json and w.json.array then return w.json.array(t or {}) end
  return t or {}
end

local function null_transport()
  return {
    null = true,
    send = function(t) MP.log('debug', 'net: no transport, dropped %s', t) end,
    on = function() end,
  }
end

--- Attach to a transport (default RMH.net). Registers our dispatcher for every JS→Lua type.
function N.bind(transport)
  if not transport then
    local rmh = web()
    if rmh and rmh.net and rmh.net.send and rmh.net.on then
      transport = rmh.net
      if rmh.json and rmh.json.null then P.set_null(rmh.json.null) end
    else
      transport = null_transport()
    end
  end
  N.transport = transport
  local entry = MP.set_of(P.ENTRY_J2L)   -- mp_pack stays with rmh_mp_entry.lua (one handler per type)
  for t in pairs(P.J2L) do
    if not entry[t] then transport.on(t, function(d, msg) N.receive(t, d, msg) end) end
  end
  return transport
end

local function enqueue(t, d)
  if #N.outbox >= OUT_MAX then
    N.stats.dropped_out = N.stats.dropped_out + 1
    return false
  end
  N.outbox[#N.outbox + 1] = { t = t, d = d }
  return true
end

--- False until a real transport (RMH.net or a test/loopback one) is bound.
function N.transport_is_live()
  return N.transport ~= nil and not N.transport.null
end

function N.send(t, d)
  d = d or {}
  local ok, err = P.validate('l2j', t, d)
  if not ok then
    N.stats.dropped_out = N.stats.dropped_out + 1
    MP.log('error', 'net.send: invalid %s: %s', tostring(t), tostring(err))
    return false
  end
  return enqueue(t, d)
end

--- Unvalidated send for the logger (mp_log is an entry-phase type; avoid recursion on errors).
function N.send_raw(t, d)
  return enqueue(t, d)
end

function N.flush()
  if #N.outbox == 0 then return 0 end
  local tr = N.transport
  if not tr then return 0 end
  local box = N.outbox
  N.outbox = {}
  for i = 1, #box do
    local ok, err = pcall(tr.send, box[i].t, box[i].d)
    if ok then N.stats.sent = N.stats.sent + 1 else
      N.stats.dropped_out = N.stats.dropped_out + 1
      MP.log('debug', 'net.flush: transport error %s', tostring(err))
    end
  end
  return #box
end

function N.on(t, fn)
  if not P.known('j2l', t) then
    MP.log('warn', 'net.on: unknown inbound type %s', tostring(t))
  end
  N.handlers[t] = fn
end

function N.receive(t, d, msg)
  N.stats.received = N.stats.received + 1
  if not P.known('j2l', t) then
    N.stats.dropped_in = N.stats.dropped_in + 1
    MP.log('warn', 'net: unknown inbound type %s', tostring(t))
    return false
  end
  local ok, err = P.validate('j2l', t, d)
  if not ok then
    N.stats.dropped_in = N.stats.dropped_in + 1
    MP.log('warn', 'net: invalid %s dropped: %s', t, tostring(err))
    return false
  end
  local h = N.handlers[t]
  if not h then
    MP.log('debug', 'net: no handler for %s', t)
    return false
  end
  local hok, herr = pcall(h, d, msg)
  if not hok then
    N.stats.handler_errors = N.stats.handler_errors + 1
    MP.log('error', 'net: handler %s failed: %s', t, tostring(herr))
    return false
  end
  return true
end

-- ── Safe points and deferral ────────────────────────────────────────────────

local SAFE_STATES = { 'BLIND_SELECT', 'SHOP', 'SELECTING_HAND', 'ROUND_EVAL' }

local function blocking_pending()
  local em = G and G.E_MANAGER
  if not em or not em.queues then return false end
  local q = em.queues.base
  if not q then return false end
  for i = 1, #q do
    local e = q[i]
    if e and e.blocking ~= false and not e.complete then return true end
  end
  return false
end
N.blocking_pending = blocking_pending

function MP.state_is(...)
  if not (G and G.STATES and G.STATE) then return false end
  for i = 1, select('#', ...) do
    local name = select(i, ...)
    if G.STATE == G.STATES[name] then return true end
  end
  return false
end

function MP.safe_point()
  if not (G and G.STATES) then return false end
  if G.CONTROLLER and G.CONTROLLER.locked then return false end
  if blocking_pending() then return false end
  return MP.state_is(unpack(SAFE_STATES))
end

function N.defer(fn, pred, queue)
  queue = queue or 'default'
  local q = N.deferred[queue]
  if not q then q = {}; N.deferred[queue] = q end
  q[#q + 1] = { fn = fn, pred = pred or MP.safe_point }
end

--- Run every deferred item that is ready (per queue, in order). Returns how many ran.
function N.run_deferred()
  local ran = 0
  local names = {}
  for name in pairs(N.deferred) do names[#names + 1] = name end
  table.sort(names)
  for _, name in ipairs(names) do
    local q = N.deferred[name]
    while q[1] do
      local item = q[1]
      local ok, ready = pcall(item.pred)
      if not ok then
        MP.log('error', 'net.defer predicate failed: %s', tostring(ready))
        ready = true -- a broken predicate must not stall the queue forever
      end
      if not ready then break end
      table.remove(q, 1)
      local fok, ferr = pcall(item.fn)
      if not fok then MP.log('error', 'net.defer item failed: %s', tostring(ferr)) end
      ran = ran + 1
    end
  end
  return ran
end

function N.clear_deferred(queue)
  if queue then N.deferred[queue] = nil else N.deferred = {} end
end

--- Per-frame pump (RMH.frame_hooks). Runs even while paused (C §0.2.4).
N.frame_hooks = N.frame_hooks or {}
function N.frame(dt)
  N.run_deferred()
  for _, fn in ipairs(N.frame_hooks) do
    local ok, err = pcall(fn, dt)
    if not ok then MP.log('error', 'net frame hook failed: %s', tostring(err)) end
  end
  N.flush()
end

--- Add a function run every frame before the flush (flags/timer reporters).
function N.add_frame_hook(fn)
  for _, f in ipairs(N.frame_hooks) do if f == fn then return end end
  N.frame_hooks[#N.frame_hooks + 1] = fn
end

function N.install_frame_hook()
  local rmh = web()
  if not rmh then return false end
  rmh.frame_hooks = rmh.frame_hooks or {}
  for _, f in ipairs(rmh.frame_hooks) do if f == N.frame_hook_fn then return true end end
  N.frame_hook_fn = N.frame_hook_fn or function(dt) N.frame(dt) end
  rmh.frame_hooks[#rmh.frame_hooks + 1] = N.frame_hook_fn
  return true
end

-- ── Game events ─────────────────────────────────────────────────────────────

--- Report a GameEvent (types.ts zGameEvent). Practice sessions report locally too (the TS
--- practice session runs a degenerate referee, PLAN §0.11); replays/spectate never report.
function MP.event(e)
  local kind = MP.session_kind()
  if kind ~= 'match' and kind ~= 'practice' then return false end
  local sent = N.send('ev', { e = e })
  if MP.replay_hook then pcall(MP.replay_hook, 'event', e) end
  return sent
end

-- ── Peer bus ────────────────────────────────────────────────────────────────

MP.peer = MP.peer or {}
MP.peer.handlers = MP.peer.handlers or {}

function MP.peer.send(kind, data, to)
  data = data or {}
  if to and kind == 'sync' then data.to = to end
  return N.send('peer', { k = kind, d = data })
end

function MP.peer.on(kind, fn)
  MP.peer.handlers[kind] = fn
end

function MP.peer.dispatch(d)
  local h = MP.peer.handlers[d.k]
  if not h then
    MP.log('debug', 'peer: no handler for %s', tostring(d.k))
    return false
  end
  h(d.from, d.d)
  return true
end

-- ── Sync bus (Asteroid / Pizza / LGG / Magnet / phantoms) ───────────────────

MP.sync = MP.sync or {}
MP.sync.objects = MP.sync.objects or {}

function MP.sync.register(center_key, spec)
  MP.sync.objects[center_key] = spec
end

function MP.sync.send(obj, data, to, kind)
  return MP.peer.send('sync', { obj = obj, kind = kind or 'sync', data = data or {} }, to)
end

MP.peer.on('sync', function(from, d)
  local spec = MP.sync.objects[d.obj]
  if not spec or not spec.receive then
    MP.log('debug', 'sync: no receiver for %s', tostring(d.obj))
    return
  end
  local reply = spec.receive(from, d.data, d.kind)
  if type(reply) == 'table' and reply.send ~= nil then
    MP.sync.send(d.obj, reply.send, reply.to, reply.kind)
  end
end)

N.on('peer', function(d) MP.peer.dispatch(d) end)

return N
