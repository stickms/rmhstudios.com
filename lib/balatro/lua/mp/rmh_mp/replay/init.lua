-- rmh_mp/replay/init.lua — replays and spectating, Lua side (WS13; REP-01…05, MM-07 view).
--
-- `require 'rmh_mp.replay'` loads the recorder (replay/recorder.lua) and the playback driver
-- (replay/player.lua) and binds the JS→Lua messages of this feature:
--   replay_view {list?, playing?, speed?}   the My Replays list; `playing` opens a log for playback
--                                           (id 'live:<runId>' = a spectated match, fed live)
--   replay_feed {pov, events}               events of the open log (in chunks; any order)
--   spectate_view {lobbies, error?}         the hub's spectatable lobbies (MM-07)
-- The UI (ui/replay.lua, ui/spectate.lua) reads MP.replay.view / MP.replay.lobbies and listens
-- with MP.replay.on_change(fn).

local MP = require 'rmh_mp.state'
local REP = MP.replay or {}
MP.replay = REP

require 'rmh_mp.replay.recorder'
local PL = require 'rmh_mp.replay.player'

if REP._bound then return REP end
REP._bound = true

REP.view = REP.view or { list = nil, playing = nil, speed = 1 }
REP.lobbies = REP.lobbies or { lobbies = {}, error = nil, at = nil }
REP.listeners = REP.listeners or {}

--- fn(what) runs after the list, the lobbies or the playback changed ('list'|'lobbies'|'playback').
function REP.on_change(fn)
  REP.listeners[#REP.listeners + 1] = fn
end

local function changed(what)
  for _, fn in ipairs(REP.listeners) do
    local ok, err = pcall(fn, what)
    if not ok then MP.log('error', 'replay: listener failed: %s', tostring(err)) end
  end
end
REP.changed = changed

PL.on_change = function() changed('playback') end

function REP.is_live_id(id)
  return type(id) == 'string' and id:sub(1, 5) == 'live:'
end

--- Load the replay/spectate UI (ui/replay.lua, ui/spectate.lua) once WS10's widgets exist.
function REP.load_ui()
  if not (MP.ui and MP.ui.w and MP.ui.register_refresh) then return nil end
  local ok, err = pcall(require, 'rmh_mp.ui.spectate')
  if not ok then MP.log('error', 'replay: spectate ui failed to load: %s', tostring(err)) end
  local ok2, rv = pcall(require, 'rmh_mp.ui.replay')
  if not ok2 then
    MP.log('error', 'replay: replay ui failed to load: %s', tostring(rv))
    return nil
  end
  return rv
end

-- ui/menu.lua's REPLAYS button calls MP.ui.replay_open when it exists (the UI loads on first use).
MP.ui = MP.ui or {}
if not MP.ui.replay_open then
  MP.ui.replay_open = function()
    local rv = REP.load_ui()
    if rv and rv.open then return rv.open('replays') end
    return false
  end
end

MP.net.on('replay_view', function(d)
  if d.list then
    REP.view.list = d.list
    changed('list')
  end
  if d.speed ~= nil then REP.view.speed = d.speed end
  local p = d.playing
  if type(p) == 'table' and p.id then
    REP.view.playing = p
    local s = PL.s
    if not s or s.id ~= p.id or s.pov ~= p.pov then
      REP.load_ui()
      PL.open({ id = p.id, pov = p.pov, live = REP.is_live_id(p.id), speed = REP.view.speed or 1 })
    end
    changed('playback')
  end
end)

MP.net.on('replay_feed', function(d)
  PL.feed(d.pov, d.events)
end)

MP.net.on('spectate_view', function(d)
  REP.lobbies = { lobbies = d.lobbies or {}, error = d.error, at = REP.clock() }
  changed('lobbies')
end)

-- ── Intents (the UI calls these) ────────────────────────────────────────────

local function send(op, extra)
  local d = { op = op }
  for k, v in pairs(extra or {}) do d[k] = v end
  return MP.net.send('ui_replay', d)
end

function REP.request_list() return send('list') end
function REP.watch(id) return send('open', { id = tostring(id) }) end
function REP.set_speed(n)
  n = PL.speed(n)
  REP.view.speed = n
  send('speed', { value = n })
  return n
end
function REP.seek(pos)
  PL.seek(pos)
  return send('seek', { value = tonumber(pos) or 0 })
end
function REP.switch_pov(id) return send('pov', { value = tostring(id) }) end
function REP.stop()
  local live = PL.s and PL.s.live
  PL.close()
  REP.view.playing = nil
  send('close')
  -- Spectating: leave the lobby we joined as a spectator too.
  if live then MP.net.send('ui_leave', {}) end
  changed('playback')
end
function REP.request_lobbies() return MP.net.send('ui_spectate_list', {}) end
function REP.spectate(code) return MP.net.send('ui_spectate', { code = code }) end

return REP
