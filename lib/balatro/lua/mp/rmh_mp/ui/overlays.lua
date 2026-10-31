-- rmh_mp/ui/overlays.lua — WS10 dialogs (LOB-02, LOB-14, LOB-15, HUD-16): join by code, confirm,
-- the error notice for `lobby_error` codes, Version mismatch, Seat held, Reconnect, Connection
-- lost, Forfeited, Kicked, and the late result notice (a match that ended while at the menu).
--
--   MP.ui.overlays.join_code()                 LOBBY CODE input (6 chars, caps) + JOIN LOBBY
--   MP.ui.overlays.confirm{name, text, on_yes, on_no?}
--   MP.ui.overlays.notice{name, title, lines, button?, on_close?}
--   MP.ui.overlays.error(code)                 what a `lobby_error` shows (ERRORS below)
--   MP.ui.overlays.reconnect() / seat_held(code?) / version_mismatch() / kicked() / forfeited() / connection_lost()

local MP = require 'rmh_mp.state'
local TH = require 'rmh_mp.ui.theme'
local W = require 'rmh_mp.ui.widgets'

local U = MP.ui
local O = U.overlays or {}
U.overlays = O

local F = G.FUNCS

-- ── Join by code (LOB-02) ───────────────────────────────────────────────────

O.join = O.join or { code = '' }

--- Uppercase, keep only lobby-code characters (net/limits.ts CODE_RE), at most 6.
function O.clean_code(s)
  s = tostring(s or ''):upper():gsub('[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]', '')
  return s:sub(1, 6)
end

function O.join_code()
  O.join.code = ''
  return W.overlay({ name = 'join_code', contents = {
    W.row({ W.text(TH.T('rmh_mp_ui_lobby_code_cap', 'LOBBY CODE'), { scale = 0.5 }) }, { padding = 0.1 }),
    W.row({ create_text_input({ id = 'mp_code_input', w = 4, h = 0.6, max_length = 6, all_caps = true,
      prompt_text = TH.T('k_enter_lobby_code', 'Enter Lobby Code'), ref_table = O.join, ref_value = 'code',
      callback = function() F.rmh_mp_join_submit() end }) }, { padding = 0.1 }),
    W.row({ W.button({ id = 'mp_join_submit', label = TH.T('rmh_mp_ui_join_lobby_cap', 'JOIN LOBBY'), button = 'rmh_mp_join_submit',
      colour = TH.col('GREEN'), minw = 4, minh = 0.7 }) }, { padding = 0.1 }),
  } })
end

F.rmh_mp_join_submit = function()
  local code = O.clean_code(O.join.code)
  if #code ~= 6 then
    W.toast('rmh_mp_ui_code_invalid', nil, { default = 'A lobby code has 6 characters' })
    return false
  end
  W.close_overlay('join_code')
  -- While searching the join waits behind the queue guard (A18; the mod's pvp_join_lobby).
  local function join() return U.send('ui_join', { code = code }) end
  if U.queue_guard and U.queue_guard(join) then return false end
  join()
  return true
end

-- ── Generic confirm and notice ──────────────────────────────────────────────

O.pending = O.pending or {}

function O.confirm(args)
  O.pending.confirm = args
  return W.overlay({ name = args.name or 'confirm', no_back = true, contents = {
    W.row({ W.text(args.title or TH.T('k_are_you_sure', 'Are you sure?'), { scale = 0.55 }) }, { padding = 0.1 }),
    args.text and W.row({ W.text(args.text, { scale = 0.4 }) }, { padding = 0.05 }) or nil,
    W.row({
      W.button({ id = 'mp_confirm_yes', label = args.yes or TH.T('k_yes', 'Yes'), button = 'rmh_mp_confirm_yes',
        colour = args.yes_colour or TH.col('RED'), minw = 2.4, minh = 0.7, col = true }),
      W.col({}, { minw = 0.3 }),
      W.button({ id = 'mp_confirm_no', label = args.no or TH.T('k_no', 'No'), button = 'rmh_mp_confirm_no',
        colour = TH.col('GREY'), minw = 2.4, minh = 0.7, col = true }),
    }, { padding = 0.1 }),
  } })
end

F.rmh_mp_confirm_yes = function()
  local a = O.pending.confirm
  O.pending.confirm = nil
  W.close_overlay()
  if a and a.on_yes then a.on_yes() end
end

F.rmh_mp_confirm_no = function()
  local a = O.pending.confirm
  O.pending.confirm = nil
  W.close_overlay()
  if a and a.on_no then a.on_no() end
end

--- A non-dismissable notice with one or two buttons.
--- args = {name, title, lines = {...}, colour?, buttons = { {label, colour, fn} ... } }
function O.notice(args)
  O.pending.notice = args
  local lines = {}
  for _, l in ipairs(args.lines or {}) do
    lines[#lines + 1] = W.row({ W.text(l, { scale = 0.4 }) }, { padding = 0.03 })
  end
  local buttons = {}
  local list = args.buttons or { { label = TH.T('rmh_mp_ui_ok', 'OK'), colour = TH.col('ORANGE') } }
  for i, b in ipairs(list) do
    if i > 1 then buttons[#buttons + 1] = W.col({}, { minw = 0.3 }) end
    buttons[#buttons + 1] = W.button({ id = 'mp_notice_' .. i, label = b.label, button = 'rmh_mp_notice_button',
      colour = b.colour or TH.col('ORANGE'), minw = 2.8, minh = 0.7, col = true, ref_table = { index = i } })
  end
  return W.overlay({ name = args.name or 'notice', no_back = true, outline_colour = args.colour, contents = {
    W.row({ W.text(args.title or '', { scale = 0.6, colour = args.title_colour }) }, { padding = 0.1 }),
    W.row(lines, { padding = 0.05 }),
    W.row(buttons, { padding = 0.1 }),
  } })
end

F.rmh_mp_notice_button = function(e)
  local a = O.pending.notice
  O.pending.notice = nil
  W.close_overlay()
  local i = e and e.config and e.config.ref_table and e.config.ref_table.index or 1
  local b = a and (a.buttons or {})[i]
  if b and b.fn then b.fn() end
end

-- ── Prompts (HUD-16, LOB-14, LOB-15) ────────────────────────────────────────

function O.reconnect()
  return O.notice({ name = 'reconnect', title = TH.T('rmh_mp_ui_reconnect_prompt_title', 'Reconnect?'),
    lines = { TH.T('rmh_mp_ui_reconnect_1', 'You are still in a match.'),
      TH.T('rmh_mp_ui_reconnect_2', 'Reconnect to pick up where you left off, or leave to forfeit.') },
    buttons = {
      { label = TH.T('b_reconnect', 'Reconnect'), colour = TH.col('GREEN'), fn = function() U.send('ui_seat', { op = 'rejoin' }) end },
      { label = TH.T('b_leave', 'Leave'), colour = TH.col('RED'), fn = function() U.send('ui_seat', { op = 'abandon' }) end },
    } })
end

function O.seat_held(code)
  local line = code and TH.TV('rmh_mp_ui_seat_held_code', 'You still hold a seat in lobby #1#', { code })
    or TH.T('rmh_mp_ui_seat_held_body', 'You still hold a seat in another game')
  return O.notice({ name = 'seat_held', title = TH.T('rmh_mp_ui_seat_held_title', 'Seat Still Held'), lines = { line },
    buttons = {
      { label = TH.T('rmh_mp_ui_seat_held_rejoin', 'Rejoin'), colour = TH.col('GREEN'), fn = function() U.send('ui_seat', { op = 'rejoin' }) end },
      { label = TH.T('rmh_mp_ui_seat_held_leave', 'Leave it'), colour = TH.col('RED'), fn = function() U.send('ui_seat', { op = 'abandon' }) end },
    } })
end

function O.version_mismatch()
  return O.notice({ name = 'version_mismatch', title = TH.T('rmh_mp_version_mismatch', 'Version mismatch'),
    title_colour = TH.col('RED'), lines = { TH.T('rmh_mp_version_mismatch_hint', 'Reload the page to update') } })
end

local function to_menu()
  U.model.lobby = nil
  U.model.setup = nil
  MP.state.lobby = nil
  if G.STAGE ~= G.STAGES.MAIN_MENU and G.FUNCS.go_to_menu then
    pcall(G.FUNCS.go_to_menu)
  end
  U.go('pvp')
end

function O.kicked()
  return O.notice({ name = 'kicked', title = TH.T('rmh_mp_ui_kicked_title', 'Removed from Lobby'),
    lines = { TH.T('rmh_mp_ui_player_kicked_you', 'The host removed you from the lobby.') },
    buttons = { { label = TH.T('rmh_mp_ui_ok', 'OK'), fn = to_menu } } })
end

function O.forfeited()
  return O.notice({ name = 'forfeited', title = TH.T('rmh_mp_ui_forfeited_title', 'Match Forfeited'),
    lines = { TH.T('rmh_mp_ui_forfeited_body', 'You forfeited this match.') },
    buttons = { { label = TH.T('rmh_mp_ui_forfeited_menu', 'Main Menu'), fn = to_menu } } })
end

function O.connection_lost()
  return O.notice({ name = 'connection_lost', title = TH.T('rmh_mp_ui_connection_lost_title', 'Connection Lost'),
    lines = { TH.T('rmh_mp_ui_connection_lost_body', 'The connection to the lobby was lost.') },
    buttons = { { label = TH.T('rmh_mp_ui_connection_lost_menu', 'Main Menu'), fn = to_menu } } })
end

-- ── lobby_error codes ───────────────────────────────────────────────────────
-- Every code a `lobby_error` can carry, each with its own translatable line:
--   hub (net/events.ts zHubErrorCode, zAdmitReason, the close reasons);
--   page (pack-loader.ts): clipboard-empty, clipboard-denied, offline;
--   session (lobby/runtime.ts, lobby-host.ts): practice-busy, invalid, start-<startBlock>;
--   matchmaking (queue/attach.ts, WS12): practice, in-lobby, no-players, party-<partyQueueBlock>;
--   UI guard: queued.
-- version-mismatch, seat-held, kicked, forfeited and the lost-lobby codes (O.LOST) open a dialog
-- instead. An unknown code still shows a generic line with the code.

O.ERRORS = {
  ['auth-required'] = { 'rmh_mp_ui_err_auth', 'Sign in to play Multiplayer' },
  ['not-found'] = { 'rmh_mp_lobby_not_found', 'Lobby not found' },
  ['full'] = { 'rmh_mp_lobby_full', 'Lobby is full' },
  ['started'] = { 'rmh_mp_ui_err_started', 'That game has already started' },
  ['rate-limited'] = { 'rmh_mp_ui_err_rate', 'Too fast - try again in a moment' },
  ['invalid'] = { 'rmh_mp_ui_err_invalid', 'That request was refused' },
  ['room-limit'] = { 'rmh_mp_ui_err_room_limit', 'Too many lobbies are open right now' },
  ['not-host'] = { 'rmh_mp_ui_err_not_host', 'Only the lobby host can do that' },
  ['host-refused'] = { 'rmh_mp_ui_err_refused', 'The host did not let you in' },
  ['clipboard-empty'] = { 'rmh_mp_ui_err_clipboard_empty', 'No lobby code on the clipboard' },
  ['clipboard-denied'] = { 'rmh_mp_ui_err_clipboard_denied', 'The browser blocked the clipboard' },
  ['offline'] = { 'rmh_mp_ui_err_offline', 'Not connected to the Multiplayer service' },
  ['queued'] = { 'rmh_mp_ui_queue_guard_desc', "You can't start a run or join a lobby while searching for a match." },
  ['practice'] = { 'rmh_mp_ui_err_practice', "Practice and a match search can't run at the same time" },
  ['practice-busy'] = { 'rmh_mp_ui_err_practice_busy', 'Leave the lobby to start Practice' },
  ['in-lobby'] = { 'rmh_mp_ui_err_in_lobby', 'Leave the lobby before searching for a match' },
  ['no-players'] = { 'rmh_mp_ui_err_no_players', 'Nobody else joined the match' },
  ['party-not-ready'] = { 'rmh_mp_ui_err_party_not_ready', 'Everyone in the party must be ready' },
  ['party-not-host'] = { 'rmh_mp_ui_err_party_not_host', 'Only the party host can search for a match' },
  ['party-disconnected'] = { 'rmh_mp_ui_err_party_disconnected', 'A party member is not connected' },
  ['party-too-many'] = { 'rmh_mp_ui_err_party_too_many', 'The party has too many players' },
  ['party-started'] = { 'rmh_mp_ui_err_party_started', 'The party is already in a game' },
  ['party-not-party'] = { 'rmh_mp_ui_err_party_not_party', 'Only a party lobby can search together' },
  ['start-started'] = { 'rmh_mp_ui_block_started', 'The game has already started' },
  ['start-setup'] = { 'rmh_mp_ui_block_setup', 'The match setup is still running' },
  ['start-players'] = { 'rmh_mp_ui_block_players', 'Waiting for more players' },
  ['start-disconnected'] = { 'rmh_mp_ui_block_disconnected', 'A player is not connected' },
  ['start-ready'] = { 'rmh_mp_ui_block_ready', 'Waiting for everyone to ready up' },
  ['start-packs'] = { 'rmh_mp_ui_block_packs', 'Waiting for every player to download the ruleset art' },
  ['pack-failed'] = { 'rmh_mp_ui_err_pack_failed', 'Could not download the ruleset art. Try again' },
}

--- Codes that mean "the lobby is gone for you": hub close reasons, the host's room closed, a
--- member's link dropped.
O.LOST = { ['host-lost'] = true, ['host-closed'] = true, ['expired'] = true, ['connection-lost'] = true,
  ['closed'] = true, ['disconnected'] = true }

--- The translated line for a lobby_error code and its key (the generic line for unknown codes).
function O.error_text(code)
  local base = tostring(code or ''):match('^([^:]*)') or ''
  local e = O.ERRORS[base]
  if e then return TH.T(e[1], e[2]), e[1] end
  return TH.TV('rmh_mp_ui_err_generic', 'Something went wrong (#1#)', { base }), 'rmh_mp_ui_err_generic'
end

--- Show what a lobby_error code means. Codes may carry a lobby code: 'seat-held:ABC234'.
function O.error(code)
  code = tostring(code or '')
  local base, arg = code:match('^([^:]+):(.*)$')
  base = base or code
  U.model.errors[#U.model.errors + 1] = code
  if #U.model.errors > 20 then table.remove(U.model.errors, 1) end
  if base == 'version-mismatch' then return O.version_mismatch() end
  if base == 'seat-held' then return O.seat_held(arg ~= '' and arg or nil) end
  if base == 'kicked' then return O.kicked() end
  if base == 'forfeited' then return O.forfeited() end
  if O.LOST[base] then return O.connection_lost() end
  local text, key = O.error_text(base)
  if key == 'rmh_mp_ui_err_generic' then
    return W.toast(key, { base }, { default = text, colour = TH.col('RED') })
  end
  return W.toast(key, nil, { default = text, colour = TH.col('RED') })
end

-- ── Late result (HUD-24: a match the player left has ended) ─────────────────
-- Two ways in: a `win` that reaches a still-mounted session while the player is at the main menu,
-- and the hub's `late_result` for a player who left the match (Leave, a forfeit, a closed tab).
-- The toast shows only at the main menu: a hub result that lands during a run (a new match, a
-- single-player run) waits there until the next main menu (set_main_menu_UI). One toast per run
-- id; at most LATE_MAX wait.

local LATE_MAX = 3
O.late_queue = O.late_queue or {}
O.late_seen = O.late_seen or {}

local function late_toast(line)
  W.toast('mp_late_result', nil, { default = TH.T('rmh_mp_ui_late_result', 'The match you left has ended.') .. ' ' .. line })
end

--- The second half of the toast: r = 'won' | 'draw' | 'lost', place = the finishing place or nil.
function O.late_line(r, place)
  if r == 'draw' then return TH.T('rmh_mp_ui_ranked_result_drew', 'It was a draw.') end
  if r == 'won' then return TH.T('rmh_mp_ui_ranked_result_won', 'You won.') end
  if place then return TH.T('rmh_mp_ui_late_result_place', 'You finished in place') .. ' ' .. tostring(place) end
  return TH.T('rmh_mp_ui_ranked_result_lost', 'You lost.')
end

--- Show what waits, if the player is at the main menu now.
function O.late_flush()
  if #O.late_queue == 0 or not U.at_main_menu() then return end
  local q = O.late_queue
  O.late_queue = {}
  for i = 1, #q do late_toast(O.late_line(q[i].r, q[i].place)) end
end

--- The hub's notice (J2L `late_result`): { runId, r, place? }.
function O.late_result(d)
  if type(d) ~= 'table' or type(d.runId) ~= 'string' or O.late_seen[d.runId] then return end
  O.late_seen[d.runId] = true
  local q = O.late_queue
  q[#q + 1] = { r = d.r, place = d.place }
  while #q > LATE_MAX do table.remove(q, 1) end
  O.late_flush()
end

local function late_win(o)
  if not U.at_main_menu() then return end
  local s = MP.state.session
  local me = s and s.me or (U.model.lobby and U.model.lobby.me)
  local run = s and s.runId
  if run then
    if O.late_seen[run] then return end
    O.late_seen[run] = true
  end
  local r, place = 'lost', nil
  if o.draw then r = 'draw'
  elseif o.winner_id and o.winner_id == me then r = 'won'
  elseif o.winner_team_id and o.winner_team_id == MP.state.my_team then r = 'won'
  elseif o.places and me and o.places[me] then place = o.places[me] end
  late_toast(O.late_line(r, place))
end

if MP.report and MP.report.on then MP.report.on('win', late_win) end
MP.net.on('late_result', O.late_result)
if rawget(_G, 'set_main_menu_UI') then
  MP.hooks.wrap(_G, 'set_main_menu_UI', function(orig, ...)
    local r = orig(...)
    pcall(O.late_flush)
    return r
  end, { id = 'hud24_late_result', group = 'ui', optional = true })
end

MP.net.on('lobby_error', function(d) O.error(d.code) end)

return O
