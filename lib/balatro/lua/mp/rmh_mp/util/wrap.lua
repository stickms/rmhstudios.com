-- rmh_mp/util/wrap.lua — MP.hooks.wrap: idempotent, uninstallable, error-isolating wraps.
--
--   local h = MP.hooks.wrap(owner, 'name', function(orig, ...) return orig(...) end, opts)
--   opts.id     stable identity; wrapping again with the same id REPLACES the layer (idempotent).
--               Defaults to the hook function itself, so re-running an installer is a no-op.
--   opts.group  a group name ('core' default, 'session' for wraps that exist only while a
--               session is mounted); MP.hooks.remove_group(g) removes every layer of it.
--   opts.hot    for slots called hundreds of times a frame (Moveable.align_to_major): the layer
--               runs without error isolation (no pcall): an error it raises travels like one
--               raised by the original. Only for small hooks that cannot fail.
--   h.remove()  removes this layer.
--
-- Layers stack: the last installed layer runs first and its `orig` is the next layer down,
-- ending at the original function. When the last layer of a slot is removed the original is
-- put back (only if nobody replaced the slot after us — otherwise our dispatcher stays as a
-- pass-through so the other code keeps working).
--
-- Error isolation: if a hook raises, the error is logged and the original is called with the
-- same arguments — unless the hook already called `orig` (then nothing is called twice). An
-- error raised BELOW the hook (by the original or a lower layer) is re-raised unchanged:
-- hiding a vanilla crash would only move it.

local MP = require 'rmh_mp.state'

local W = {}
MP.hooks = W

local slots = {}   -- slots[owner][name] = rec
local all = {}     -- list of recs (stable iteration order for remove_group)

local unpack = unpack or table.unpack
local function pack(...) return { n = select('#', ...), ... } end

local DOWNSTREAM = {} -- marker table wrapping errors raised below a layer

-- The layer chain runs on hot paths (Card:draw, Game:update, ... once per card per frame while a
-- session is mounted), so a call allocates nothing: every layer owns one `next` function (built
-- when it is installed), whether a layer called its `next` is a flag per call depth, and up to
-- four arguments are kept in locals for the error path (more are packed, rare).
--
-- Layers carry an install sequence number (ascending along rec.layers); a layer's `next` runs the
-- topmost layer installed before it that is still there, so removing layers while a call is
-- running (S.unmount from inside G.FUNCS.start_run) never re-enters a layer or skips the rest.
local call_layer
local depth = 0      -- nesting of layer calls in progress (any slot)
local called = {}    -- called[d]: the layer running at depth d has called its next
local layer_seq = 0

local function as_down(err)
  if type(err) == 'table' and err[DOWNSTREAM] then return err end
  return { [DOWNSTREAM] = true, err = err }
end

--- Re-raise an error from below `layer`: unwrapped when no protected layer above will see it
--- (the real error leaves the dispatcher unchanged).
local function raise_down(rec, layer, err)
  err = as_down(err)
  local layers = rec.layers
  for j = #layers, 1, -1 do
    local l = layers[j]
    if l.seq <= layer.seq then break end
    if not l.hot then error(err, 0) end
  end
  error(err.err, 0)
end

--- Run the chain below the layer with sequence number `seq`.
local function call_below(rec, seq, ...)
  local layers = rec.layers
  for j = #layers, 1, -1 do
    local l = layers[j]
    if l.seq < seq then return call_layer(rec, l, ...) end
  end
  return rec.orig(...)
end

local function after_next(ok, ...)
  if ok then return ... end
  error(as_down((...)), 0)
end

local function make_next(rec, layer)
  local seq = layer.seq
  if layer.hot then
    return function(...) return call_below(rec, seq, ...) end
  end
  return function(...)
    called[depth] = true
    return after_next(pcall(call_below, rec, seq, ...))
  end
end

local function after_retry(rec, layer, ok, ...)
  if ok then return ... end
  raise_down(rec, layer, (...))
end

--- `layer` raised `err`: below-layer errors go up unchanged; its own error is logged and the
--- rest of the chain runs with the same arguments, unless the layer already called it.
local function recover(rec, layer, err, did_call, n, a1, a2, a3, a4, extra)
  if type(err) == 'table' and err[DOWNSTREAM] then raise_down(rec, layer, err) end
  rec.errors = (rec.errors or 0) + 1
  MP.log('error', 'hook %s.%s [%s] failed: %s', tostring(rec.owner_name), rec.name,
    tostring(layer.id_name or '?'), tostring(err))
  if did_call then return end
  local s = layer.seq
  if extra then return after_retry(rec, layer, pcall(call_below, rec, s, unpack(extra, 1, extra.n))) end
  if n == 0 then return after_retry(rec, layer, pcall(call_below, rec, s)) end
  if n == 1 then return after_retry(rec, layer, pcall(call_below, rec, s, a1)) end
  if n == 2 then return after_retry(rec, layer, pcall(call_below, rec, s, a1, a2)) end
  if n == 3 then return after_retry(rec, layer, pcall(call_below, rec, s, a1, a2, a3)) end
  return after_retry(rec, layer, pcall(call_below, rec, s, a1, a2, a3, a4))
end

local function finish(rec, layer, d, n, a1, a2, a3, a4, extra, ok, ...)
  local did_call = called[d]
  called[d] = false
  depth = d - 1
  if ok then return ... end
  return recover(rec, layer, (...), did_call, n, a1, a2, a3, a4, extra)
end

call_layer = function(rec, layer, ...)
  if layer.hot then return layer.fn(layer.next, ...) end
  local d = depth + 1
  depth = d
  called[d] = false
  local n = select('#', ...)
  local a1, a2, a3, a4 = ...
  local extra = n > 4 and pack(...) or nil
  return finish(rec, layer, d, n, a1, a2, a3, a4, extra, pcall(layer.fn, layer.next, ...))
end

local function make_dispatcher(rec)
  return function(...)
    local layers = rec.layers
    local top = layers[#layers]
    if not top then return rec.orig(...) end
    return call_layer(rec, top, ...)
  end
end

local function owner_label(owner)
  if owner == _G then return '_G' end
  if rawget(_G, 'G') and owner == G.FUNCS then return 'G.FUNCS' end
  for _, n in ipairs({ 'Game', 'Card', 'CardArea', 'Blind', 'Back', 'Tag', 'Controller' }) do
    if rawget(_G, n) == owner then return n end
  end
  return tostring(owner)
end

--- Install (or replace) a layer. Returns a handle, or nil when owner[name] is not a function.
function W.wrap(owner, name, fn, opts)
  opts = opts or {}
  if type(owner) ~= 'table' or type(fn) ~= 'function' then
    MP.log('error', 'hooks.wrap: bad arguments for %s', tostring(name))
    return nil
  end
  local id = opts.id or fn
  local by_owner = slots[owner]
  if not by_owner then by_owner = {}; slots[owner] = by_owner end
  local rec = by_owner[name]
  if rec and owner[name] ~= rec.dispatcher then
    -- Someone replaced the slot after us. Our layers keep running inside the old dispatcher
    -- only if it is still reachable; start a new record on top of the current value. The old
    -- record stays in `all` while it has layers (remove_group still finds them).
    rec.stale = true
    by_owner[name] = nil
    if #rec.layers == 0 then drop_rec(rec) end
    rec = nil
  end
  if not rec then
    local current = owner[name]
    if type(current) ~= 'function' then
      if not opts.optional then
        MP.log('warn', 'hooks.wrap: %s.%s is not a function; skipped', owner_label(owner), tostring(name))
      end
      return nil
    end
    rec = { owner = owner, owner_name = owner_label(owner), name = name, orig = current, layers = {} }
    rec.dispatcher = make_dispatcher(rec)
    by_owner[name] = rec
    all[#all + 1] = rec
    owner[name] = rec.dispatcher
  end
  for _, layer in ipairs(rec.layers) do
    if layer.id == id then
      layer.fn = fn
      layer.group = opts.group or layer.group
      return layer.handle
    end
  end
  layer_seq = layer_seq + 1
  local layer = { id = id, id_name = opts.id and tostring(opts.id) or nil, fn = fn, group = opts.group or 'core',
    seq = layer_seq, hot = opts.hot == true }
  layer.next = make_next(rec, layer)
  layer.handle = {
    remove = function() return W.unwrap(owner, name, id) end,
    owner = owner, name = name, id = id,
  }
  rec.layers[#rec.layers + 1] = layer
  return layer.handle
end

--- Forget a record whose last layer is gone. Its dispatcher, if someone replaced the slot on top
--- of it, stays reachable only through them, as a pass-through to the original; it is not
--- tracked any more, so records never pile up across mounts.
local function drop_rec(rec)
  if rec.owner[rec.name] == rec.dispatcher then rec.owner[rec.name] = rec.orig end
  local by_owner = slots[rec.owner]
  if by_owner and by_owner[rec.name] == rec then
    by_owner[rec.name] = nil
    if next(by_owner) == nil then slots[rec.owner] = nil end
  end
  for i = #all, 1, -1 do if all[i] == rec then table.remove(all, i) end end
end

--- Remove one layer. Returns true when something was removed.
function W.unwrap(owner, name, id)
  local rec = slots[owner] and slots[owner][name]
  if not rec then return false end
  for i, layer in ipairs(rec.layers) do
    if layer.id == id then
      table.remove(rec.layers, i)
      if #rec.layers == 0 then drop_rec(rec) end
      return true
    end
  end
  return false
end

--- Remove every layer of a group (e.g. 'session' on unmount).
function W.remove_group(group)
  local n = 0
  for i = #all, 1, -1 do
    local rec = all[i]
    for j = #rec.layers, 1, -1 do
      if rec.layers[j].group == group then
        table.remove(rec.layers, j)
        n = n + 1
      end
    end
    if #rec.layers == 0 then drop_rec(rec) end
  end
  return n
end

--- Remove everything (tests; a full MP unload).
function W.remove_all()
  for i = #all, 1, -1 do
    local rec = all[i]
    rec.layers = {}
    drop_rec(rec)
  end
end

function W.is_wrapped(owner, name, id)
  local rec = slots[owner] and slots[owner][name]
  if not rec then return false end
  if id == nil then return #rec.layers > 0 end
  for _, layer in ipairs(rec.layers) do if layer.id == id then return true end end
  return false
end

--- The original (unwrapped) function of a slot, or the current value when not wrapped.
function W.original(owner, name)
  local rec = slots[owner] and slots[owner][name]
  if rec then return rec.orig end
  return owner[name]
end

--- Replace the function BELOW every layer of a slot (the vanilla original) and return the one it
--- replaced; call again with that value to put it back. Layers keep running on top. An unwrapped
--- slot is simply assigned. The score preview (preview/sim.lua) uses it to count `ease_dollars`
--- calls while every MP layer above vanilla still applies.
function W.swap_original(owner, name, fn)
  local rec = slots[owner] and slots[owner][name]
  if rec and owner[name] == rec.dispatcher then
    local old = rec.orig
    rec.orig = fn
    return old
  end
  local old = owner[name]
  owner[name] = fn
  return old
end

--- Bookkeeping sizes, for leak checks: records (wrapped slots, live or stale) and layers.
function W.stats()
  local layers, owners, slots_n = 0, 0, 0
  for _, rec in ipairs(all) do layers = layers + #rec.layers end
  for _, by_owner in pairs(slots) do
    owners = owners + 1
    for _ in pairs(by_owner) do slots_n = slots_n + 1 end
  end
  return { records = #all, layers = layers, owners = owners, slots = slots_n }
end

function W.count(group)
  local n = 0
  for _, rec in ipairs(all) do
    for _, layer in ipairs(rec.layers) do
      if group == nil or layer.group == group then n = n + 1 end
    end
  end
  return n
end

return W
