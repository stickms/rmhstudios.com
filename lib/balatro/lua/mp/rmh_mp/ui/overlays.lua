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
    W.row({ W.text(TH.T('k_lobby_code_cap', 'LOBBY CODE'), { scale = 0.5 }) }, { padding = 0.1 }),
    W.row({ create_text_input({ id = 'mp_code_input', w = 4, h = 0.6, max_length = 6, all_caps = true,
      prompt_text = TH.T('k_enter_lobby_code', 'Enter Lobby Code'), ref_table = O.join, ref_value = 'code',
      callback = function() F.rmh_mp_join_submit() end }) }, { padding = 0.1 }),
    W.row({ W.button({ id = 'mp_join_submit', label = TH.T('k_join_lobby_cap', 'JOIN LOBBY'), button = 'rmh_mp_join_submit',
      colour = TH.col('GREEN'), minw = 4, minh = 0.7 }) }, { padding = 0.1 }),
  } })
end

F.rmh_mp_join_submit = function()
  local code = O.clean_code(O.join.code)
  if #code ~= 6 then
    W.toast('rmh_mp_ui_code_invalid', nil, { default = 'A lobby code has 6 characters' })
    return false
  end
  U.send('ui_join', { code = code })
  W.close_overlay('join_code')
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
  local list = args.buttons or { { label = TH.T('k_ok', 'OK'), colour = TH.col('ORANGE') } }
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
  return O.notice({ name = 'reconnect', title = TH.T('k_reconnect_prompt_title', 'Reconnect?'),
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
  return O.notice({ name = 'seat_held', title = TH.T('k_seat_held_title', 'Seat Still Held'), lines = { line },
    buttons = {
      { label = TH.T('b_seat_held_rejoin', 'Rejoin'), colour = TH.col('GREEN'), fn = function() U.send('ui_seat', { op = 'rejoin' }) end },
      { label = TH.T('b_seat_held_leave', 'Leave it'), colour = TH.col('RED'), fn = function() U.send('ui_seat', { op = 'abandon' }) end },
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
  return O.notice({ name = 'kicked', title = TH.T('k_kicked_title', 'Removed from Lobby'),
    lines = { TH.T('k_player_kicked_you', 'The host removed you from the lobby.') },
    buttons = { { label = TH.T('k_ok', 'OK'), fn = to_menu } } })
end

function O.forfeited()
  return O.notice({ name = 'forfeited', title = TH.T('k_forfeited_title', 'Match Forfeited'),
    lines = { TH.T('k_forfeited_body', 'You forfeited this match.') },
    buttons = { { label = TH.T('k_forfeited_menu', 'Main Menu'), fn = to_menu } } })
end

function O.connection_lost()
  return O.notice({ name = 'connection_lost', title = TH.T('k_connection_lost_title', 'Connection Lost'),
    lines = { TH.T('rmh_mp_ui_connection_lost_body', 'The connection to the lobby was lost.') },
    buttons = { { label = TH.T('k_connection_lost_menu', 'Main Menu'), fn = to_menu } } })
end

-- ── lobby_error codes ───────────────────────────────────────────────────────
-- Hub codes (net/events.ts zHubErrorCode + zAdmitReason), the clipboard/offline codes the page
-- sends (pack-loader.ts), and the session's own. Unknown codes show a generic line with the code.

O.ERRORS = {
  ['auth-required'] = { 'rmh_mp_ui_err_auth', 'Sign in to play Multiplayer' },
  ['not-found'] = { 'rmh_mp_lobby_not_found', 'Lobby not found' },
  ['full'] = { 'rmh_mp_lobby_full', 'Lobby is full' },
  ['started'] = { 'rmh_mp_ui_err_started', 'That game has already started' },
  ['rate-limited'] = { 'rmh_mp_ui_err_rate', 'Too fast - try again in a moment' },
  ['invalid'] = { 'rmh_mp_ui_err_invalid', 'That request was refused' },
  ['room-limit'] = { 'rmh_mp_ui_err_room_limit', 'Too many lobbies are open right now' },
  ['not-host'] = { 'k_opts_only_host', 'Only the Lobby Host can change these options' },
  ['host-refused'] = { 'rmh_mp_ui_err_refused', 'The host did not let you in' },
  ['clipboard-empty'] = { 'rmh_mp_ui_err_clipboard_empty', 'No lobby code on the clipboard' },
  ['clipboard-denied'] = { 'rmh_mp_ui_err_clipboard_denied', 'The browser blocked the clipboard' },
  ['offline'] = { 'rmh_mp_ui_err_offline', 'Not connected to the Multiplayer service' },
  ['queued'] = { 'k_queue_guard_desc', "You can't start a run or join a lobby while searching for a match." },
}

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
  if base == 'host-lost' or base == 'host-closed' or base == 'expired' or base == 'connection-lost' then
    return O.connection_lost()
  end
  local e = O.ERRORS[base]
  local text = e and TH.T(e[1], e[2]) or TH.TV('rmh_mp_ui_err_generic', 'Something went wrong (#1#)', { base })
  return W.toast(e and e[1] or 'rmh_mp_ui_err_generic', nil, { default = text, colour = TH.col('RED') })
end

-- ── Late result (a match that ended while the player was at the menu) ──────

local function late_result(o)
  if not U.at_main_menu() then return end
  local me = MP.state.session and MP.state.session.me or (U.model.lobby and U.model.lobby.me)
  local line
  if o.draw then line = TH.T('k_ranked_result_drew', 'It was a draw.')
  elseif o.winner_id and o.winner_id == me then line = TH.T('k_ranked_result_won', 'You won.')
  elseif o.places and me and o.places[me] then
    line = TH.T('k_late_result_place', 'You finished in place') .. ' ' .. tostring(o.places[me])
  else line = TH.T('k_ranked_result_lost', 'You lost.') end
  W.toast('k_late_result_ended', nil, { default = TH.T('rmh_mp_ui_late_result', 'The match you left has ended.') .. ' ' .. line })
end

if MP.report and MP.report.on then MP.report.on('win', late_result) end

MP.net.on('lobby_error', function(d) O.error(d.code) end)

return O
