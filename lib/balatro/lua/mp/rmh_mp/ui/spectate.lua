-- rmh_mp/ui/spectate.lua — WS13 spectate browser (MM-07 view, REP-04): the SPECTATE tab of the
-- replays overlay (ui/replay.lua).
--
--   MP.ui.spectate.refresh()      ask TS for the hub's spectatable lobbies (ui_spectate_list)
--   MP.ui.spectate.list_def()     the tab's rows: mode, code, players, ante, WATCH; REFRESH
-- WATCH joins the lobby as a spectator (ui_spectate {code}); TS connects to the host, which sends
-- every log so far, and opens the live playback (replay_view id 'live:<runId>'), fast-forwarding
-- until it is level with the match. The playback bar's settings switch the watched player.

local MP = require 'rmh_mp.state'
local TH = require 'rmh_mp.ui.theme'
local W = require 'rmh_mp.ui.widgets'
local REP = require 'rmh_mp.replay'

local U = MP.ui
local SP = U.spectate or {}
U.spectate = SP

local F = G.FUNCS

SP.MAX_ROWS = 8
SP.REFRESH_AFTER = 5 -- seconds: a tab opened later than this asks again

function SP.refresh(force)
  local l = REP.lobbies
  if force or not l.at or REP.clock() - l.at > SP.REFRESH_AFTER then
    SP.waiting = true
    REP.request_lobbies()
  end
end

local ERRORS = {
  offline = { key = 'rmh_mp_spectate_offline', def = 'Offline: the lobby list needs a connection.' },
  timeout = { key = 'rmh_mp_spectate_timeout', def = 'The lobby list did not answer. Try again.' },
}

function SP.row_def(l)
  local ante = l.ante and TH.TV('rmh_mp_spectate_ante', 'Ante #1#', { l.ante }) or TH.T('rmh_mp_spectate_lobby', 'In lobby')
  return W.row({
    W.col({
      W.row({ W.text(TH.queue_mode_name(l.queueMode), { scale = 0.38 }), W.col({}, { minw = 0.25 }),
        W.text(l.code, { scale = 0.34, colour = TH.ui_col('TEXT_INACTIVE') }) }, { align = 'cl' }),
      W.row({ W.text(TH.TV('rmh_mp_spectate_players', '#1# players', { l.players }), { scale = 0.3 }), W.col({}, { minw = 0.25 }),
        W.text(ante, { scale = 0.3 }) }, { align = 'cl' }),
    }, { align = 'cl', minw = 7.9 }),
    W.button({ id = 'mp_spectate_watch_' .. l.code, label = TH.T('rmh_mp_replay_watch', 'WATCH'), button = 'rmh_mp_spectate_watch',
      colour = TH.col('TEAL'), minw = 1.6, minh = 0.6, scale = 0.4, ref_table = { code = l.code } }),
  }, { r = 0.1, padding = 0.08, colour = TH.col('BLACK'), emboss = 0.05, id = 'mp_spectate_row_' .. l.code })
end

function SP.list_def()
  local l = REP.lobbies or { lobbies = {} }
  local rows = {}
  local err = l.error and ERRORS[l.error]
  if err then
    rows[#rows + 1] = W.row({ W.text(TH.T(err.key, err.def), { scale = 0.38, colour = TH.col('RED') }) }, { padding = 0.15,
      id = 'mp_spectate_error' })
  elseif not l.at then
    rows[#rows + 1] = W.row({ W.text(TH.T('rmh_mp_replay_loading', 'Loading...'), { scale = 0.4 }) }, { padding = 0.2 })
  elseif #(l.lobbies or {}) == 0 then
    rows[#rows + 1] = W.row({ W.text(TH.T('rmh_mp_spectate_none', 'No matches to watch right now.'), { scale = 0.38 }) },
      { padding = 0.2, id = 'mp_spectate_empty' })
  end
  for i, lobby in ipairs(l.lobbies or {}) do
    if i > SP.MAX_ROWS then break end
    rows[#rows + 1] = SP.row_def(lobby)
  end
  rows[#rows + 1] = W.row({ W.button({ id = 'mp_spectate_refresh', label = TH.T('rmh_mp_spectate_refresh', 'REFRESH'),
    button = 'rmh_mp_spectate_refresh', colour = TH.col('BLUE'), minw = 2.4, minh = 0.55, scale = 0.38 }) }, { padding = 0.1 })
  return rows
end

F.rmh_mp_spectate_refresh = function()
  SP.refresh(true)
  if U.replay then U.replay.open('spectate') end
end

F.rmh_mp_spectate_watch = function(e)
  local code = e and e.config and e.config.ref_table and e.config.ref_table.code
  if not code then return end
  W.close_overlay('mp_replays')
  if U.close then pcall(U.close) end
  W.toast('rmh_mp_spectate_joining', nil, { default = 'Joining as a spectator...' })
  REP.spectate(code)
end

return SP
