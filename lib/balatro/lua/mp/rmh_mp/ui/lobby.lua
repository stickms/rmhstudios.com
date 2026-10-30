-- rmh_mp/ui/lobby.lua — WS10 lobby screen (A3 §1.4; LOB-01, 05, 08–11, MM-02, MM-06).
--
-- A pure view of `lobby_view {state, me, isHost, canStart, startBlockReason?}`:
--   top  the roster: avatar Joker cards on the Black Deck back, 4 x 4 per page, page cycler
--        when there are more; hover = name / build / Muted / Player / Ready badges; click another
--        player = the per-player overlay (Mute; Kick for the host; connection info)
--   bar  by lobby kind and role:
--        private host    START GAME · LOBBY OPTIONS · deck box (run setup) · code panel · INVITE · LEAVE
--        private member  READY/UNREADY · LOBBY OPTIONS · deck box (display) · code panel · INVITE · LEAVE
--        party host      FIND GAME (+ casual mode cycle) / queue status + CANCEL · code panel · INVITE · LEAVE
--        party member    READY/UNREADY · queue status · code panel · LEAVE
--        casual          one status panel (setup vote / draft, else "Waiting for players...") · LEAVE
-- Intents: ui_start, ui_ready{ready}, ui_copy_code, ui_invite, ui_leave, ui_party_queue{queueMode},
-- ui_queue{op='leave'}, ui_kick{userId}, ui_mute{userId,on}.

local MP = require 'rmh_mp.state'
local TH = require 'rmh_mp.ui.theme'
local W = require 'rmh_mp.ui.widgets'

local U = MP.ui
local L = U.lobby or {}
U.lobby = L

local F = G.FUNCS

L.PER_PAGE = 16
L.COLS = 4

L.ui = L.ui or { page = 1, show_code = false, copied_at = nil, party_mode = 1, auto_ready = nil }

function U.lobby_reset()
  L.ui.page = 1
  L.ui.show_code = false
  L.ui.copied_at = nil
  L.ui.auto_ready = nil
end

local function now()
  return (rawget(_G, 'love') and love.timer and love.timer.getTime and love.timer.getTime()) or (G.TIMERS and G.TIMERS.REAL) or 0
end

--- The lobby's seated players (role 'player') in join order, and the spectators.
function L.players(state)
  local players, spectators = {}, {}
  for _, p in ipairs(state.players or {}) do
    if p.role == 'spectator' then spectators[#spectators + 1] = p else players[#players + 1] = p end
  end
  table.sort(players, function(a, b)
    if a.joinedAt ~= b.joinedAt then return (a.joinedAt or 0) < (b.joinedAt or 0) end
    return tostring(a.id) < tostring(b.id)
  end)
  return players, spectators
end

function L.find_player(view, id)
  for _, p in ipairs(view.state.players or {}) do if p.id == id then return p end end
  return nil
end

function L.me(view) return L.find_player(view, view.me) end

function L.pages(view)
  local players = L.players(view.state)
  return math.max(1, math.ceil(#players / L.PER_PAGE))
end

local CONN = {
  direct = { 'rmh_mp_conn_direct', 'Direct' },
  turn = { 'rmh_mp_ui_conn_turn', 'TURN' },
  relay = { 'rmh_mp_conn_relayed', 'Relayed' },
}

function L.conn_label(p)
  local c = CONN[p.conn] or CONN.direct
  return TH.T(c[1], c[2])
end

function L.team_label(team)
  if team == 'A' or team == 'B' then return TH.TV('rmh_mp_ui_team_n', 'Team #1#', { team }) end
  if team == 'HUNTER' then return TH.T('rmh_mp_ui_hunter', 'Hunter') end
  if team == 'RUNNER' then return TH.T('rmh_mp_ui_runner', 'Runner') end
  return nil
end

-- ── Roster ──────────────────────────────────────────────────────────────────

function L.roster_def(model)
  local view = model.lobby
  if not view then return nil end
  local state = view.state
  local players, spectators = L.players(state)
  local pages = L.pages(view)
  if L.ui.page > pages then L.ui.page = pages end
  local first = (L.ui.page - 1) * L.PER_PAGE + 1
  local rows, row = {}, {}
  for i = first, math.min(#players, first + L.PER_PAGE - 1) do
    local p = players[i]
    row[#row + 1] = W.player_card(p, {
      scale = 0.62,
      info = { host = p.id == state.hostId, muted = model.muted[p.id], show_ready = state.kind ~= 'casual',
        build = L.conn_label(p) .. (L.team_label(p.team) and ('  ' .. L.team_label(p.team)) or '') },
      on_click = function(pl) if pl.id ~= view.me then L.player_overlay(pl.id) end end,
    })
    if #row == L.COLS then rows[#rows + 1] = W.row(row, { padding = 0.05 }); row = {} end
  end
  if #row > 0 then rows[#rows + 1] = W.row(row, { padding = 0.05 }) end
  if #players == 0 then
    rows[#rows + 1] = W.row({ W.text(TH.T('k_waiting_for_players', 'Waiting for players...'), { scale = 0.45 }) },
      { padding = 0.3, id = 'mp_roster_empty' })
  end
  local footer = {}
  if pages > 1 then
    local names = {}
    for i = 1, pages do names[i] = TH.TV('rmh_mp_ui_page', 'Page #1#/#2#', { i, pages }) end
    footer[#footer + 1] = W.row({ W.cycle({ id = 'mp_roster_pages', options = names, current = L.ui.page,
      callback = 'rmh_mp_roster_page', w = 3, scale = 0.7, no_pips = true }) },
      { r = 0.1, colour = TH.col('BLACK'), emboss = 0.05, padding = 0.05 })
  end
  footer[#footer + 1] = W.row({ W.text(TH.TV('rmh_mp_ui_lobby_counts', '#1# players  #2# spectators',
    { #players, #spectators }), { scale = 0.3, id = 'mp_roster_counts' }) })
  return { n = G.UIT.ROOT, config = { align = 'cm', colour = TH.col('CLEAR') }, nodes = {
    W.col({
      W.col(rows, { id = 'mp_roster', minh = 1 }),
      W.col(footer, { padding = 0.05 }),
    }, { r = 0.15, padding = 0.15, colour = TH.alpha(TH.col('BLACK'), 0.5) }),
  } }
end

F.rmh_mp_roster_page = function(args)
  L.ui.page = args and args.to_key or 1
  U.invalidate()
end

-- ── Bar pieces ──────────────────────────────────────────────────────────────

function L.code_panel(view)
  local copied = L.ui.copied_at and now() - L.ui.copied_at < 2
  return W.col({
    W.col({ W.text(TH.T('k_lobby_code_cap', 'LOBBY CODE'), { scale = 0.3, vert = true }) }, { padding = 0.04 }),
    W.col({
      W.button({ id = 'mp_view_code', label = L.ui.show_code and view.state.code or TH.T('b_view_code_cap', 'VIEW CODE'),
        button = 'rmh_mp_view_code', colour = TH.col('GREEN'), minw = 2.4, minh = 0.6, scale = 0.4,
        text_colour = L.ui.show_code and TH.col('ETERNAL') or nil }),
      W.button({ id = 'mp_copy_code', label = copied and TH.T('k_copied_cap', 'COPIED!') or TH.T('b_copy_code_cap', 'COPY CODE'),
        button = 'rmh_mp_copy_code', colour = TH.col('MP_PURPLE'), minw = 2.4, minh = 0.6, scale = 0.4 }),
    }, { padding = 0.04 }),
  }, { r = 0.1, padding = 0.05, colour = TH.col('BLACK') })
end

function L.deck_box(view)
  local st = view.state
  local line1 = st.challenge and U.run_setup.challenge_name(st.challenge) or U.run_setup.deck_name(st.deck)
  local line2 = U.run_setup.stake_name(st.stake)
  if st.mpStake then line2 = U.run_setup.mp_stake_name(st.mpStake) end
  local host = view.isHost and st.kind == 'private'
  local b = W.button({ id = 'mp_deck_box', label = { line1, line2 }, button = host and 'rmh_mp_deck_box' or 'nil',
    colour = st.mpStake and TH.darken(U.run_setup.mp_stake_colour(st.mpStake), 0.1) or TH.col('MP_PURPLE'), minw = 2.65, minh = 1.35, scale = 0.38, col = true })
  return b
end

local function leave_button()
  return W.button({ id = 'mp_leave_lobby', label = TH.L('b_leave_lobby_cap', { 'LEAVE', 'LOBBY' }), button = 'rmh_mp_leave',
    colour = TH.col('RED'), minw = 2.4, minh = 1.35, scale = 0.45, col = true })
end

local function invite_button()
  return W.button({ id = 'mp_invite', label = TH.T('rmh_mp_invite', 'Invite'), button = 'rmh_mp_invite',
    colour = TH.col('TEAL'), minw = 1.8, minh = 1.35, scale = 0.42, col = true })
end

local function options_button(view)
  return W.button({ id = 'mp_lobby_options', label = TH.L('b_lobby_options_cap', { 'LOBBY', 'OPTIONS' }),
    button = 'rmh_mp_lobby_options', colour = TH.col('ORANGE'), minw = 2.4, minh = 1.35, scale = 0.45, col = true })
end

local function ready_button(view)
  local me = L.me(view)
  local ready = me and me.ready
  return W.button({ id = 'mp_ready', label = ready and TH.T('b_unready_cap', 'UNREADY') or TH.T('b_ready_cap', 'READY'),
    button = 'rmh_mp_ready', colour = ready and TH.col('ORANGE') or TH.col('GREEN'), minw = 3.2, minh = 1.35, scale = 0.6,
    col = true, ref_table = { ready = not ready } })
end

function L.start_label(view)
  if view.canStart then return TH.L('b_start_game_cap', { 'START', 'GAME' }) end
  local players = L.players(view.state)
  if #players < 2 then return TH.L('b_wait_for_players', { 'WAITING FOR', 'PLAYERS' }) end
  return TH.L('b_wait_for_guest_ready', { 'WAITING FOR', 'GUEST TO READY UP' })
end

local function start_button(view)
  return W.button({ id = 'mp_start', label = L.start_label(view), button = 'rmh_mp_start', colour = TH.col('BLUE'),
    minw = 3.2, minh = 1.35, scale = view.canStart and 0.6 or 0.35, col = true, disabled = not view.canStart })
end

local function party_queue_nodes(view, model)
  local q = model.queue or {}
  local searching = q.state == 'searching' or q.state == 'matched'
  if searching then
    return {
      W.col({
        W.row({ W.text(TH.T('k_group_status_queued', 'Searching as a group...'), { scale = 0.4, colour = TH.col('STATUS_WAIT'),
          id = 'mp_party_status' }) }),
        W.row({ W.text(TH.queue_mode_name(q.queueMode) .. (q.waiting and ('  (' .. q.waiting .. ')') or ''), { scale = 0.3 }) }),
        view.isHost and W.row({ W.button({ id = 'mp_party_cancel', label = TH.T('b_group_cancel', 'Cancel'),
          button = 'rmh_mp_queue_cancel', colour = TH.col('RED'), minw = 2, minh = 0.5, scale = 0.35 }) }) or nil,
      }, { r = 0.1, padding = 0.08, colour = TH.col('BLACK'), minw = 3.4 }),
    }
  end
  if not view.isHost then
    return { W.col({ W.row({ W.text(TH.T('k_group_member_hint', 'The host can queue this lobby for a casual match.'),
      { scale = 0.3 }) }) }, { r = 0.1, padding = 0.08, colour = TH.col('BLACK'), maxw = 3.6 }) }
  end
  local names = {}
  for i, m in ipairs(TH.QUEUE_MODES) do names[i] = TH.T(m.name, m.def) end
  return {
    W.button({ id = 'mp_party_find', label = { TH.T('b_find_game_cap', 'FIND GAME') }, button = 'rmh_mp_party_queue',
      colour = TH.col('BLUE'), minw = 3.2, minh = 1.35, scale = 0.6, col = true, disabled = not view.canStart }),
    W.col({ W.cycle({ id = 'mp_party_mode', label = TH.T('k_group_mode', 'Casual mode'), options = names,
      current = L.ui.party_mode, callback = 'rmh_mp_party_mode', w = 2.6, scale = 0.7, no_pips = true }) }),
  }
end

function L.bar_def(model)
  local view = model.lobby
  if not view then return U.back_bar('rmh_mp_to_pvp') end
  local st = view.state
  local nodes
  if st.kind == 'casual' then
    local status = U.setup and U.setup.panel(model) or W.text(TH.T('k_waiting_for_players', 'Waiting for players...'))
    nodes = { status, leave_button() }
  elseif st.kind == 'party' then
    nodes = {}
    if not view.isHost then nodes[#nodes + 1] = ready_button(view) end
    for _, n in ipairs(party_queue_nodes(view, model)) do nodes[#nodes + 1] = n end
    nodes[#nodes + 1] = L.code_panel(view)
    nodes[#nodes + 1] = invite_button()
    nodes[#nodes + 1] = leave_button()
  else
    nodes = {}
    if view.isHost then nodes[#nodes + 1] = start_button(view) else nodes[#nodes + 1] = ready_button(view) end
    nodes[#nodes + 1] = options_button(view)
    nodes[#nodes + 1] = L.deck_box(view)
    nodes[#nodes + 1] = L.code_panel(view)
    nodes[#nodes + 1] = invite_button()
    nodes[#nodes + 1] = leave_button()
  end
  local extra = {}
  if view.isHost and not view.canStart and view.startBlockReason and st.kind == 'private' then
    extra[1] = W.row({ W.text(TH.T(view.startBlockReason, view.startBlockReason), { scale = 0.3, colour = TH.col('STATUS_WAIT'),
      id = 'mp_start_block' }) })
  end
  extra[#extra + 1] = W.panel(nodes, { padding = 0.15, id = 'mp_lobby_bar' })
  return { n = G.UIT.ROOT, config = { align = 'cm', colour = TH.col('CLEAR') }, nodes = { W.col(extra, { align = 'bm' }) } }
end

U.register_screen('lobby', { top = L.roster_def, bar = L.bar_def, top_offset = { x = 0, y = -1.0 } })

-- ── Per-player overlay (Actions / Info) ─────────────────────────────────────

function L.player_overlay_contents(model, id)
  local view = model.lobby
  local p = view and L.find_player(view, id)
  if not p then return nil end
  local muted = model.muted[id] == true
  local actions = {
    W.row({ W.button({ id = 'mp_player_mute', label = muted and TH.T('k_unmute_player', 'Unmute Player') or TH.T('k_mute_player', 'Mute Player'),
      button = 'rmh_mp_player_mute', ref_table = { id = id, on = not muted }, colour = TH.col('MP_PURPLE'), minw = 4, minh = 0.7 }) },
      { padding = 0.05 }),
  }
  if view.isHost and id ~= view.me then
    actions[#actions + 1] = W.row({ W.button({ id = 'mp_player_kick', label = TH.T('k_kick_player', 'Kick Player'),
      button = 'rmh_mp_player_kick', ref_table = { id = id }, colour = TH.col('RED'), minw = 4, minh = 0.7 }) }, { padding = 0.05 })
  end
  local info = {
    W.row({ W.text(TH.T('rmh_mp_ui_connection', 'Connection') .. ': ' .. L.conn_label(p), { scale = 0.35 }) }),
    L.team_label(p.team) and W.row({ W.text(L.team_label(p.team), { scale = 0.35 }) }) or nil,
    W.row({ W.text(p.connected and (p.away and TH.T('rmh_mp_conn_away', 'Away') or TH.T('k_status_connected', 'Connected'))
      or TH.T('rmh_mp_conn_lost', 'Connection lost'), { scale = 0.35 }) }),
    W.row({ W.text(TH.T('rmh_mp_ui_build', 'Build') .. ': ' .. tostring(MP.version), { scale = 0.3, colour = TH.ui_col('TEXT_INACTIVE') }) }),
  }
  return {
    W.row({ W.text(p.name, { scale = 0.6 }) }, { padding = 0.05 }),
    create_tabs({ colour = TH.col('MP_PURPLE'), tabs = {
      { label = TH.T('k_player_overlay_tab_actions', 'Actions'), chosen = true, tab_definition_function = function()
        return { n = G.UIT.ROOT, config = { align = 'cm', colour = TH.col('CLEAR'), padding = 0.1 }, nodes = actions } end },
      { label = TH.T('k_info', 'Info'), tab_definition_function = function()
        return { n = G.UIT.ROOT, config = { align = 'cm', colour = TH.col('CLEAR'), padding = 0.1 }, nodes = info } end },
    } }),
  }
end

function L.player_overlay(id)
  local c = L.player_overlay_contents(U.model, id)
  if not c then return nil end
  L.ui.overlay_player = id
  return W.overlay({ name = 'player', contents = c })
end

-- ── Callbacks ───────────────────────────────────────────────────────────────

F.rmh_mp_start = function() if U.model.lobby and U.model.lobby.canStart then U.send('ui_start', {}) end end
F.rmh_mp_ready = function(e)
  local view = U.model.lobby
  local me = view and L.me(view)
  U.send('ui_ready', { ready = not (me and me.ready) })
end
F.rmh_mp_view_code = function() L.ui.show_code = not L.ui.show_code; U.invalidate() end
F.rmh_mp_copy_code = function()
  U.send('ui_copy_code', {})
  L.ui.copied_at = now()
  U.invalidate()
end
F.rmh_mp_invite = function() U.send('ui_invite', {}) end
F.rmh_mp_leave = function() U.confirm_leave() end
F.rmh_mp_lobby_options = function() if U.lobby_options then U.lobby_options.open() end end
F.rmh_mp_deck_box = function() if U.model.lobby and U.model.lobby.isHost then U.run_setup.open('lobby') end end
F.rmh_mp_party_mode = function(args) L.ui.party_mode = args and args.to_key or 1 end
F.rmh_mp_party_queue = function()
  local m = TH.QUEUE_MODES[L.ui.party_mode] or TH.QUEUE_MODES[1]
  U.send('ui_party_queue', { queueMode = m.mode })
end
F.rmh_mp_player_mute = function(e)
  local r = e and e.config and e.config.ref_table or {}
  if not r.id then return end
  U.send('ui_mute', { userId = r.id, on = r.on == true })
  U.model.muted[r.id] = r.on == true or nil
  W.close_overlay('player')
  L.player_overlay(r.id)
end
F.rmh_mp_player_kick = function(e)
  local r = e and e.config and e.config.ref_table or {}
  if not r.id then return end
  local p = U.model.lobby and L.find_player(U.model.lobby, r.id)
  U.overlays.confirm({ name = 'confirm_kick', text = TH.TV('rmh_mp_ui_kick_confirm', 'Kick #1#? They cannot rejoin.', { p and p.name or r.id }),
    on_yes = function() U.send('ui_kick', { userId = r.id }) end })
end

-- Per-frame: COPIED! flash ends; casual auto-ready (MM-02: re-sent up to 6 times, 1.2 s apart,
-- until the view shows me ready).
U.tick[#U.tick + 1] = function()
  local t = now()
  if L.ui.copied_at and t - L.ui.copied_at >= 2 then L.ui.copied_at = nil; U.invalidate() end
  local view = U.model.lobby
  if not (view and view.state.kind == 'casual' and not view.state.started) then L.ui.auto_ready = nil; return end
  local me = L.me(view)
  if me and me.ready then return end
  local ar = L.ui.auto_ready
  if not ar then ar = { sent = 0, at = -math.huge }; L.ui.auto_ready = ar end
  if ar.sent < 6 and t - ar.at >= 1.2 then
    ar.sent = ar.sent + 1
    ar.at = t
    U.send('ui_ready', { ready = true })
  end
end

-- The per-player overlay follows the model (mute state, kicked player leaves).
U.register_refresh('player', function(model)
  local id = L.ui.overlay_player
  if not (id and model.lobby and L.find_player(model.lobby, id)) then W.close_overlay('player'); return end
end)

return L
