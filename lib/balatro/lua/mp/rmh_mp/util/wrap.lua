-- rmh_mp/util/wrap.lua — MP.hooks.wrap: idempotent, uninstallable, error-isolating wraps.
--
--   local h = MP.hooks.wrap(owner, 'name', function(orig, ...) return orig(...) end, opts)
--   opts.id     stable identity; wrapping again with the same id REPLACES the layer (idempotent).
--               Defaults to the hook function itself, so re-running an installer is a no-op.
--   opts.group  a group name ('core' default, 'session' for wraps that exist only while a
--               session is mounted); MP.hooks.remove_group(g) removes every layer of it.
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

local call_layer

call_layer = function(rec, i, ...)
  if i == 0 then return rec.orig(...) end
  local layer = rec.layers[i]
  local called = false
  local function next_fn(...)
    called = true
    local r = pack(pcall(call_layer, rec, i - 1, ...))
    if not r[1] then
      local err = r[2]
      if type(err) == 'table' and err[DOWNSTREAM] then error(err, 0) end
      error({ [DOWNSTREAM] = true, err = err }, 0)
    end
    return unpack(r, 2, r.n)
  end
  local outermost = (i == #rec.layers)
  local function raise_down(err)
    if type(err) ~= 'table' or not err[DOWNSTREAM] then err = { [DOWNSTREAM] = true, err = err } end
    if outermost then error(err.err, 0) end -- the real error leaves the dispatcher unchanged
    error(err, 0)
  end
  local r = pack(pcall(layer.fn, next_fn, ...))
  if r[1] then return unpack(r, 2, r.n) end
  local err = r[2]
  if type(err) == 'table' and err[DOWNSTREAM] then raise_down(err) end
  rec.errors = (rec.errors or 0) + 1
  MP.log('error', 'hook %s.%s [%s] failed: %s', tostring(rec.owner_name), rec.name,
    tostring(layer.id_name or '?'), tostring(err))
  if called then return end
  local r2 = pack(pcall(call_layer, rec, i - 1, ...))
  if not r2[1] then raise_down(r2[2]) end
  return unpack(r2, 2, r2.n)
end

local function make_dispatcher(rec)
  return function(...)
    if #rec.layers == 0 then return rec.orig(...) end
    return call_layer(rec, #rec.layers, ...)
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
    -- only if it is still reachable; start a new record on top of the current value.
    rec.stale = true
    rec = nil
    by_owner[name] = nil
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
  local layer = { id = id, id_name = opts.id and tostring(opts.id) or nil, fn = fn, group = opts.group or 'core' }
  layer.handle = {
    remove = function() return W.unwrap(owner, name, id) end,
    owner = owner, name = name, id = id,
  }
  rec.layers[#rec.layers + 1] = layer
  return layer.handle
end

local function drop_rec(rec)
  if rec.owner[rec.name] == rec.dispatcher then rec.owner[rec.name] = rec.orig end
  if slots[rec.owner] and slots[rec.owner][rec.name] == rec then slots[rec.owner][rec.name] = nil end
  for i = #all, 1, -1 do if all[i] == rec then table.remove(all, i) end end
end

--- Remove one layer. Returns true when something was removed.
function W.unwrap(owner, name, id)
  local rec = slots[owner] and slots[owner][name]
  if not rec then return false end
  for i, layer in ipairs(rec.layers) do
    if layer.id == id then
      table.remove(rec.layers, i)
      if #rec.layers == 0 and rec.owner[rec.name] == rec.dispatcher then drop_rec(rec) end
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
    if #rec.layers == 0 and rec.owner[rec.name] == rec.dispatcher then drop_rec(rec) end
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
