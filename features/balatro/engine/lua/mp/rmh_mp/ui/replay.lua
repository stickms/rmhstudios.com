-- rmh_mp/ui/replay.lua — WS13 replay UI (REP-03, HUD-09 replay variant), on WS10's widgets.
--
--   MP.ui.replay.open(tab?)       the browser overlay ('mp_replays'): two tabs, MY REPLAYS (newest
--                                 first, 6 per page, Newer/Older) and SPECTATE (ui/spectate.lua);
--                                 WATCH starts the playback (ui_replay {op='open'} -> replay_view).
--   MP.ui.replay.hud_def(status)  the in-run bar shown while a log plays: what plays, the position,
--                                 the speed and the REPLAY SETTINGS button (HUD-09, replay variant).
--   MP.ui.replay.settings()       speed 1x / 2x / 4x / fast-forward, the POV cycle, the blinds to seek
--                                 to (the seek index), CLOSE REPLAY.
-- A divergence (replay/player.lua) shows a notice with the event index and the reason.
-- Builders are pure (definitions); open/settings/notice show something.

local MP = require 'rmh_mp.state'
local TH = require 'rmh_mp.ui.theme'
local W = require 'rmh_mp.ui.widgets'
local REP = require 'rmh_mp.replay'
local PL = REP.player

local U = MP.ui
local RV = U.replay or {}
U.replay = RV
if RV._loaded then return RV end

local F = G.FUNCS

RV.PER_PAGE = 6
RV.page = RV.page or 1
RV.tab = RV.tab or 'replays'
RV.SPEEDS = { 1, 2, 4, 0 }

local function speed_label(n)
  if n == 0 then return TH.T('rmh_mp_replay_ff', 'FAST') end
  return tostring(n) .. 'x'
end
RV.speed_label = speed_label

local RESULT = {
  win = { key = 'rmh_mp_replay_win', def = 'Win', col = 'GREEN' },
  lose = { key = 'rmh_mp_replay_loss', def = 'Loss', col = 'RED' },
  draw = { key = 'rmh_mp_replay_draw', def = 'Draw', col = 'ORANGE' },
}

local function when(at)
  local ok, s = pcall(os.date, '%Y-%m-%d %H:%M', math.floor((tonumber(at) or 0) / 1000))
  return ok and s or ''
end
RV.when = when

-- ── The browser ─────────────────────────────────────────────────────────────

--- The list page `page` of `list` (1-based) and the page count.
function RV.page_of(list, page)
  list = list or {}
  local pages = math.max(1, math.ceil(#list / RV.PER_PAGE))
  page = math.max(1, math.min(page or 1, pages))
  local out = {}
  for i = (page - 1) * RV.PER_PAGE + 1, math.min(#list, page * RV.PER_PAGE) do out[#out + 1] = list[i] end
  return out, page, pages
end

function RV.row_def(e)
  local res = e.result and RESULT[e.result]
  local players = table.concat(e.players or {}, ', ')
  if #players > 48 then players = players:sub(1, 45) .. '...' end
  return W.row({
    W.col({
      W.row({ W.text(when(e.at), { scale = 0.32, colour = TH.ui_col('TEXT_INACTIVE') }),
        W.col({}, { minw = 0.2 }),
        W.text(TH.queue_mode_name(e.queueMode), { scale = 0.35 }),
        W.col({}, { minw = 0.2 }),
        W.text(TH.ruleset_name and TH.ruleset_name(e.ruleset) or tostring(e.ruleset), { scale = 0.32 }) }, { align = 'cl' }),
      W.row({ W.text(players, { scale = 0.3 }) }, { align = 'cl' }),
    }, { align = 'cl', minw = 6.6 }),
    res and W.badge(TH.T(res.key, res.def), TH.col(res.col), { minw = 1.2 }) or W.col({}, { minw = 1.3 }),
    W.button({ id = 'mp_replay_watch_' .. tostring(e.id), label = TH.T('rmh_mp_replay_watch', 'WATCH'),
      button = 'rmh_mp_replay_watch', colour = TH.col('TEAL'), minw = 1.6, minh = 0.6, scale = 0.4,
      ref_table = { id = e.id } }),
  }, { r = 0.1, padding = 0.08, colour = TH.col('BLACK'), emboss = 0.05, id = 'mp_replay_row_' .. tostring(e.id) })
end

local function tabs_def()
  local function tab(id, key, def, button)
    local on = RV.tab == id
    return W.button({ id = 'mp_replay_tab_' .. id, label = TH.T(key, def), button = button,
      colour = on and TH.col('MP_PURPLE') or TH.col('GREY'), minw = 3, minh = 0.6, scale = 0.4, col = true })
  end
  return W.row({ tab('replays', 'rmh_mp_replay_mine', 'MY REPLAYS', 'rmh_mp_replay_tab_mine'), W.col({}, { minw = 0.2 }),
    tab('spectate', 'rmh_mp_replay_spectate', 'SPECTATE', 'rmh_mp_replay_tab_spectate') }, { padding = 0.08 })
end

function RV.replays_def()
  local list = REP.view.list
  local rows = {}
  if list == nil then
    rows[1] = W.row({ W.text(TH.T('rmh_mp_replay_loading', 'Loading...'), { scale = 0.4 }) }, { padding = 0.2 })
    return rows
  end
  local page_rows, page, pages = RV.page_of(list, RV.page)
  RV.page = page
  if #page_rows == 0 then
    rows[1] = W.row({ W.text(TH.T('rmh_mp_replay_none', 'No replays yet. Finished matches are kept here.'),
      { scale = 0.38 }) }, { padding = 0.2, id = 'mp_replay_empty' })
  end
  for _, e in ipairs(page_rows) do rows[#rows + 1] = RV.row_def(e) end
  rows[#rows + 1] = W.row({
    W.button({ id = 'mp_replay_newer', label = TH.T('rmh_mp_replay_newer', 'Newer'), button = 'rmh_mp_replay_newer',
      colour = TH.col('ORANGE'), minw = 2, minh = 0.55, scale = 0.38, col = true, disabled = page <= 1 }),
    W.col({ W.text(tostring(page) .. ' / ' .. tostring(pages), { scale = 0.35, id = 'mp_replay_page' }) }, { minw = 1.2 }),
    W.button({ id = 'mp_replay_older', label = TH.T('rmh_mp_replay_older', 'Older'), button = 'rmh_mp_replay_older',
      colour = TH.col('ORANGE'), minw = 2, minh = 0.55, scale = 0.38, col = true, disabled = page >= pages }),
  }, { padding = 0.1 })
  return rows
end

--- The browser overlay's contents for the current tab.
function RV.browser_def()
  local body
  if RV.tab == 'spectate' and U.spectate then body = U.spectate.list_def() else body = RV.replays_def() end
  local contents = { tabs_def() }
  contents[#contents + 1] = W.col(body, { padding = 0.05, minw = 11, minh = 5, id = 'mp_replay_body' })
  return contents
end

function RV.open(tab)
  if tab then RV.tab = tab end
  if RV.tab == 'spectate' and U.spectate then U.spectate.refresh() end
  return W.overlay({ name = 'mp_replays', contents = RV.browser_def() })
end

U.register_refresh('mp_replays', function() RV.open() end)

F.rmh_mp_replay_tab_mine = function()
  RV.tab = 'replays'
  REP.request_list()
  RV.open()
end
F.rmh_mp_replay_tab_spectate = function()
  RV.tab = 'spectate'
  RV.open()
end
F.rmh_mp_replay_newer = function() RV.page = RV.page - 1; RV.open() end
F.rmh_mp_replay_older = function() RV.page = RV.page + 1; RV.open() end
F.rmh_mp_replay_watch = function(e)
  local id = e and e.config and e.config.ref_table and e.config.ref_table.id
  if not id then return end
  -- While searching, playback waits behind the queue guard (A18; the mod's _start_playback).
  if U.queue_guard and U.queue_guard(function() return F.rmh_mp_replay_watch(e) end) then return end
  W.close_overlay('mp_replays')
  if U.close then pcall(U.close) end
  REP.watch(id)
end

-- ── The in-run bar (HUD-09, replay variant) ─────────────────────────────────

RV.status = RV.status or { line = '' }

local function pov_name(pov)
  local sess = MP.state.session
  local r = sess and sess.roster and sess.roster[pov]
  return (r and r.name) or tostring(pov or '?')
end

--- The bar's text for a playback status (replay/player.lua PL.status()).
function RV.status_line(st)
  if not st then return '' end
  local what = st.live and TH.T('rmh_mp_replay_live', 'LIVE') or TH.T('rmh_mp_replay_title', 'REPLAY')
  local pos = tostring(st.pos) .. '/' .. tostring(st.len)
  local state = ''
  if st.state == 'loading' then state = TH.T('rmh_mp_replay_loading', 'Loading...')
  elseif st.state == 'done' then state = TH.T('rmh_mp_replay_done', 'Finished')
  elseif st.state == 'diverged' then state = TH.T('rmh_mp_replay_diverged_short', 'Stopped') end
  return table.concat({ what, pov_name(st.pov), pos, speed_label(st.speed), state }, '  ')
end

function RV.hud_def()
  return { n = G.UIT.ROOT, config = { align = 'cm', colour = TH.col('CLEAR') }, nodes = {
    W.panel({
      W.col({ W.live_text(RV.status, 'line', { scale = 0.32, id = 'mp_replay_status' }) }, { minw = 4.4, align = 'cl' }),
      W.button({ id = 'mp_replay_settings', label = TH.T('rmh_mp_replay_settings', 'REPLAY SETTINGS'),
        button = 'rmh_mp_replay_settings', colour = TH.col('MP_PURPLE'), minw = 2.6, minh = 0.5, scale = 0.32, col = true }),
    }, { padding = 0.08 }),
  } }
end

local function remove_hud()
  local b = RV.hud_box
  RV.hud_box = nil
  if b and b.remove and not b.REMOVED then pcall(b.remove, b) end
end

local function frame()
  local st = PL.status()
  RV.status.line = RV.status_line(st)
  local in_run = G.STAGES and G.STAGE == G.STAGES.RUN and G.ROOM_ATTACH ~= nil
  if st and in_run then
    if not RV.hud_box or RV.hud_box.REMOVED then
      local ok, box = pcall(UIBox, { definition = RV.hud_def(), config = { align = 'tm', offset = { x = 0, y = 0.1 },
        major = G.ROOM_ATTACH, bond = 'Weak' } })
      if ok then RV.hud_box = box end
    end
  elseif RV.hud_box then
    remove_hud()
  end
  if st and st.state == 'diverged' and RV.shown_error ~= st.error then
    RV.shown_error = st.error
    RV.diverged(st)
  end
end
RV.frame = frame

--- The divergence notice (REP-05: the replay cannot continue faithfully).
function RV.diverged(st)
  local err = st.error or {}
  local lines = {
    TH.TV('rmh_mp_replay_diverged_at', 'The replay diverged at event #1# (#2#).', { tostring(err.at), tostring(err.op) }),
    tostring(err.msg or ''):sub(1, 90),
    TH.T('rmh_mp_replay_inaccurate', 'Replay may be inaccurate'),
  }
  if not (U.overlays and U.overlays.notice) then return end
  return U.overlays.notice({ name = 'mp_replay_diverged', title = TH.T('rmh_mp_replay_diverged', 'Replay stopped'), lines = lines,
    colour = TH.col('RED'), buttons = {
      { label = TH.T('rmh_mp_replay_keep', 'Keep watching'), colour = TH.col('ORANGE') },
      { label = TH.T('rmh_mp_replay_close', 'CLOSE REPLAY'), colour = TH.col('RED'), fn = function() REP.stop() end },
    } })
end

-- ── Replay settings ─────────────────────────────────────────────────────────

--- The players whose logs can be watched (the mounted session's roster), sorted by name.
function RV.povs()
  local sess = MP.state.session
  local out = {}
  for id, r in pairs((sess and sess.roster) or {}) do out[#out + 1] = { id = id, name = r.name or id } end
  table.sort(out, function(a, b) return a.name < b.name end)
  return out
end

function RV.settings_def()
  local st = PL.status() or { speed = 1 }
  local speeds = {}
  for _, n in ipairs(RV.SPEEDS) do
    speeds[#speeds + 1] = W.button({ id = 'mp_replay_speed_' .. n, label = speed_label(n), button = 'rmh_mp_replay_speed',
      colour = (st.speed == n) and TH.col('MP_PURPLE') or TH.col('GREY'), minw = 1.3, minh = 0.55, scale = 0.38, col = true,
      ref_table = { speed = n } })
  end
  local povs = RV.povs()
  local names, current = {}, 1
  for i, p in ipairs(povs) do
    names[i] = p.name
    if p.id == st.pov then current = i end
  end
  local seeks = {}
  if not st.live then
    for _, s in ipairs(PL.seek_index()) do
      if #seeks >= 12 then break end
      seeks[#seeks + 1] = W.button({ id = 'mp_replay_seek_' .. s.pos, label = TH.TV('rmh_mp_replay_seek_label', 'Ante #1# #2#',
        { s.ante, s.slot }), button = 'rmh_mp_replay_seek', colour = TH.col('BLUE'), minw = 2.2, minh = 0.45, scale = 0.3,
        col = true, ref_table = { pos = s.pos } })
    end
  end
  local seek_rows = {}
  for i = 1, #seeks, 4 do
    seek_rows[#seek_rows + 1] = W.row({ seeks[i], seeks[i + 1], seeks[i + 2], seeks[i + 3] }, { padding = 0.03 })
  end
  return {
    W.row({ W.text(TH.T('rmh_mp_replay_settings', 'REPLAY SETTINGS'), { scale = 0.5 }) }, { padding = 0.08 }),
    W.row({ W.text(TH.T('rmh_mp_replay_speed', 'Speed'), { scale = 0.35 }) }),
    W.row(speeds, { padding = 0.06, id = 'mp_replay_speeds' }),
    #povs > 1 and W.row({ W.cycle({ id = 'mp_replay_pov', label = TH.T('rmh_mp_replay_pov', 'Watching'), options = names,
      current = current, callback = 'rmh_mp_replay_pov', w = 4 }) }, { padding = 0.06 }) or nil,
    #seek_rows > 0 and W.row({ W.text(TH.T('rmh_mp_replay_seek', 'Jump to'), { scale = 0.35 }) }) or nil,
    #seek_rows > 0 and W.col(seek_rows, { id = 'mp_replay_seeks' }) or nil,
    W.row({ W.button({ id = 'mp_replay_close', label = TH.T('rmh_mp_replay_close', 'CLOSE REPLAY'), button = 'rmh_mp_replay_close',
      colour = TH.col('RED'), minw = 3.2, minh = 0.6, scale = 0.42 }) }, { padding = 0.1 }),
  }
end

function RV.settings()
  return W.overlay({ name = 'mp_replay_settings', contents = RV.settings_def() })
end

F.rmh_mp_replay_settings = function() RV.settings() end
F.rmh_mp_replay_speed = function(e)
  local n = e and e.config and e.config.ref_table and e.config.ref_table.speed
  REP.set_speed(n)
  if W.overlay_name() == 'mp_replay_settings' then RV.settings() end
end
F.rmh_mp_replay_seek = function(e)
  local pos = e and e.config and e.config.ref_table and e.config.ref_table.pos
  W.close_overlay('mp_replay_settings')
  REP.seek(pos)
end
F.rmh_mp_replay_pov = function(args)
  local povs = RV.povs()
  local p = args and args.to_key and povs[args.to_key]
  if p then
    W.close_overlay('mp_replay_settings')
    REP.switch_pov(p.id)
  end
end
F.rmh_mp_replay_close = function()
  W.close_overlay()
  REP.stop()
end

-- ── Wiring ──────────────────────────────────────────────────────────────────

REP.on_change(function(what)
  local name = W.overlay_name()
  if (what == 'list' or what == 'lobbies') and name == 'mp_replays' then RV.open() end
end)
MP.net.add_frame_hook(frame)

--- The REPLAYS button of the Multiplayer menu (ui/menu.lua) calls this.
U.replay_open = function() return RV.open('replays') end

RV._loaded = true
return RV
