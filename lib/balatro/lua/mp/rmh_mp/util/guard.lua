-- rmh_mp/util/guard.lua — last-resort guard for the MP-owned UI callbacks.
--
-- Every G.FUNCS entry the MP pack defines (names starting `rmh_mp_` or `mp_`: button callbacks,
-- option-cycle callbacks and the per-frame `func` callbacks of MP UI nodes) is replaced by a
-- guarded copy: an error inside it is logged (MP.log 'error', once per callback, then counted) and
-- the click is answered with the cancel sound, instead of reaching love.errhand and stopping the
-- game. This is IN ADDITION to fixing each crash at its root — the crash sweep
-- (mp_test/specs/ui_sweep_spec.lua) still fails on any logged callback error. Vanilla callbacks,
-- including the ones MP wraps through MP.hooks.wrap, are not touched.
--
--   guard.scan()        guard every MP callback not guarded yet (cheap; run on a timer and at
--                       the points that define callbacks: opening Multiplayer, mounting a session)
--   guard.install()     core wrap: scan about once a second from Game:update
--   guard.original(fn)  the unguarded callback behind a guarded one (specs)
--   guard.install_wipe_guard()  one wipe_off per screen wipe (a run started during a wipe
--                       crashed in vanilla's wipe_off; see below)

local MP = require 'rmh_mp.state'

local GD = MP.guard or {}
MP.guard = GD

GD.PREFIXES = { 'rmh_mp_', 'mp_' }
GD.inner = GD.inner or setmetatable({}, { __mode = 'k' }) -- guarded fn -> original
GD.failures = GD.failures or {}                            -- name -> count
GD.SCAN_EVERY = 1                                          -- seconds

local unpack_ = unpack or table.unpack

local function owned(name)
  if type(name) ~= 'string' then return false end
  for _, p in ipairs(GD.PREFIXES) do
    if name:sub(1, #p) == p then return true end
  end
  return false
end
GD.owned = owned

function GD.original(fn) return GD.inner[fn] or fn end

--- After a failed click: nothing half-done may keep the game locked.
function GD.recover(name)
  if G and G.CONTROLLER and G.CONTROLLER.locks then G.CONTROLLER.locks.frame = nil end
  if rawget(_G, 'play_sound') then pcall(play_sound, 'cancel', 0.8, 0.5) end
end

function GD.wrap_one(name, fn)
  local guarded
  guarded = function(...)
    local r = { pcall(fn, ...) }
    if r[1] then return unpack_(r, 2, table.maxn(r)) end
    local n = (GD.failures[name] or 0) + 1
    GD.failures[name] = n
    -- a per-frame `func` callback would repeat its error every frame: log the first, then every 600th
    if n == 1 or n % 600 == 0 then
      MP.log('error', 'ui callback %s failed (%d): %s', name, n, tostring(r[2]))
    end
    GD.recover(name)
    return nil
  end
  GD.inner[guarded] = fn
  return guarded
end

function GD.scan()
  local F = rawget(_G, 'G') and G.FUNCS
  if type(F) ~= 'table' then return 0 end
  local todo = {}
  for name, fn in pairs(F) do
    if type(fn) == 'function' and owned(name) and not GD.inner[fn] then todo[#todo + 1] = name end
  end
  for _, name in ipairs(todo) do F[name] = GD.wrap_one(name, F[name]) end
  return #todo
end

-- ── Screen wipe ─────────────────────────────────────────────────────────────
-- Vanilla start_run / go_to_menu call wipe_on, queue their work, then wipe_off. wipe_on returns
-- early while a wipe is already up, but its caller still calls wipe_off, so a run started (or a
-- menu reached) while another wipe is in flight queues a SECOND wipe_off: the first removes
-- G.screenwipe, the second indexes it (button_callbacks.lua 'screenwipe' nil) and the game stops.
-- MP starts runs on network messages (match start, rejoin, practice restart, replay open), so
-- that overlap is reachable. One wipe_off per wipe: a wipe_off while one is already pending for
-- the same wipe is dropped; the pending one removes the wipe and finishes as before.
GD.wipe = GD.wipe or { off_pending = nil }

function GD.install_wipe_guard()
  local F = rawget(_G, 'G') and G.FUNCS
  if not (F and F.wipe_on and F.wipe_off) then return end
  MP.hooks.wrap(F, 'wipe_on', function(orig, ...)
    local had = G.screenwipe
    local r = { orig(...) }
    if not had and G.screenwipe then GD.wipe.off_pending = nil end -- a new wipe owes one wipe_off
    return unpack_(r, 1, table.maxn(r))
  end, { id = 'guard.wipe_on', optional = true })
  MP.hooks.wrap(F, 'wipe_off', function(orig, ...)
    if not G.screenwipe then GD.wipe.off_pending = nil end
    if GD.wipe.off_pending == G.screenwipe and G.screenwipe ~= nil then
      MP.log('warn', 'guard: a second wipe_off for the same wipe dropped')
      return nil
    end
    GD.wipe.off_pending = G.screenwipe
    return orig(...)
  end, { id = 'guard.wipe_off', optional = true })
end

function GD.install()
  GD.install_wipe_guard()
  if not rawget(_G, 'Game') then return end
  local since = 0
  MP.hooks.wrap(Game, 'update', function(orig, self, dt, ...)
    local r = { orig(self, dt, ...) }
    since = since + (tonumber(dt) or 0)
    if since >= GD.SCAN_EVERY then
      since = 0
      GD.scan()
    end
    return unpack_(r, 1, table.maxn(r))
  end, { id = 'guard.scan', optional = true })
end

return GD
