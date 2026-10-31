-- rmh_mp/ui/queue_guard.lua — the queue guard (A18, the mod's API ui/queue_guard_overlay.lua).
--
-- While a match search runs (searching, or matched and still joining: MP.ui.queue_busy), starting
-- a run or entering a lobby would leave the search running behind the player's back. Instead the
-- "Matchmaking In Progress" overlay offers:
--   Leave Queue & Continue  leave the search, then replay the blocked action (re-checked)
--   Leave Queue             leave the search, back to the menu
--   Stay Queued             (the back button) close, still searching
-- G.FUNCS.start_run is wrapped (New Run, Continue, Challenges and the in-run restart all go
-- through it); MP's own launches (a match or practice run, S.launching) and anything inside a
-- session pass. Create Lobby, an invite's Join and the main-menu shortcuts call MP.ui.queue_guard
-- themselves.
--
--   MP.ui.queue_guard(replay) -> true when blocked (the overlay is up and `replay` is kept)

local MP = require 'rmh_mp.state'
local TH = require 'rmh_mp.ui.theme'
local W = require 'rmh_mp.ui.widgets'

local U = MP.ui
local QG = U.qguard or {}
U.qguard = QG

local F = G.FUNCS

function QG.contents()
  local function btn(id, key, def, colour, fn)
    return W.row({ W.button({ id = id, label = TH.T(key, def), button = fn, colour = TH.col(colour), minw = 4, minh = 0.7,
      scale = 0.38 }) }, { padding = 0.05 })
  end
  return {
    W.col({
      W.row({ W.text(TH.T('rmh_mp_ui_queue_guard_title', 'Matchmaking In Progress'), { scale = 0.5 }) }, { padding = 0.1 }),
      W.row({ W.text(TH.T('rmh_mp_ui_queue_guard_desc', "You can't start a run or join a lobby while searching for a match."),
        { scale = 0.3 }) }, { padding = 0.06 }),
      W.row({}, { minh = 0.15 }),
      btn('mp_qguard_leave_play', 'rmh_mp_ui_queue_guard_leave_play', 'Leave Queue & Continue', 'BLUE', 'rmh_mp_qguard_leave_play'),
      btn('mp_qguard_leave', 'rmh_mp_ui_queue_guard_leave', 'Leave Queue', 'RED', 'rmh_mp_qguard_leave'),
    }, { minw = 6, padding = 0.25 }),
  }
end

--- Block `replay` while a search runs: show the overlay and keep the action. True when blocked.
function QG.guard(replay)
  if not U.queue_busy() then return false end
  QG.pending = replay
  W.overlay({ name = 'queue_guard', back_colour = TH.col('GREEN'),
    back_label = TH.T('rmh_mp_ui_queue_guard_stay', 'Stay Queued'), back_func = 'rmh_mp_qguard_stay', contents = QG.contents() })
  return true
end
U.queue_guard = QG.guard

--- Leave the search now (TS confirms with queue_view cancelled); the model is idle at once so a
--- replayed action is not blocked again.
function QG.leave()
  local q = U.model.queue or {}
  U.send('ui_queue', { op = 'leave', queueMode = q.queueMode or 'pvp_nemesis' })
  U.model.queue = { state = 'idle', queueMode = q.queueMode or 'pvp_nemesis' }
  U.changed()
end

F.rmh_mp_qguard_stay = function()
  QG.pending = nil
  W.close_overlay('queue_guard')
end
F.rmh_mp_qguard_leave = function()
  QG.pending = nil
  QG.leave()
  W.close_overlay('queue_guard')
end
F.rmh_mp_qguard_leave_play = function()
  local replay = QG.pending
  QG.pending = nil
  QG.leave()
  W.close_overlay('queue_guard')
  if replay then replay() end
end

-- Every vanilla way into a run (New Run, Continue, Challenge, restart) ends in G.FUNCS.start_run.
if F.start_run then
  MP.hooks.wrap(F, 'start_run', function(orig, e, args, ...)
    local S = MP.session
    if not MP.state.session and not (S and S.launching) and U.queue_busy() then
      local rest = { n = select('#', ...), ... }
      if QG.guard(function() return F.start_run(e, args, unpack(rest, 1, rest.n)) end) then return end
    end
    return orig(e, args, ...)
  end, { id = 'ws10_queue_guard', group = 'ui' })
end

return QG
