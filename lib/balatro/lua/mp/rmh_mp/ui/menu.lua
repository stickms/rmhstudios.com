-- rmh_mp/ui/menu.lua — WS10 root of the out-of-run UI (PLAN §4 WS10; HUD-18, LOB-01…03, MM-01/02).
--
-- `require 'rmh_mp.ui.menu'` loads every WS10 module (theme, widgets, pillars, practice_menu,
-- lobby, lobby_options, run_setup, setup, chat, overlays, settings, collection, shortcuts), binds
-- the J2L view models and defines MP.ui.open(intent) (called by MP.open from rmh_mp_entry.lua).
--
-- Model: everything drawn is a pure view of the last messages from TypeScript, kept in
-- MP.ui.model:
--   net      net_status   {hub, reason?, account{name, avatarUrl}}
--   lobby    lobby_view   {state: LobbyState, me, isHost, canStart, startBlockReason?} (also MP.state.lobby)
--   setup    setup_view   (or lobby.state.setup)
--   queue    queue_view   {state, queueMode, waiting?}
--   history  history      {wins, losses, games, pvpGames, streak, days}
-- Intents go back as `ui_*` messages through MP.net.send (validated by protocol.lua).
--
-- Screens (MP.ui.screen): nil (the vanilla menu) | 'pvp' | 'create' | 'find' | 'practice' | 'lobby'.
-- A screen is two UIBoxes on G.ROOM_ATTACH: the bottom bar (it takes G.MAIN_MENU_UI's place, so
-- vanilla's delete_run removes it with the menu) and an optional centre box (pillars, roster).
-- The top-left Multiplayer panel shows on every MP screen. Rendering is coalesced to once per
-- frame (MP.ui.invalidate → frame hook). Off the main menu nothing is drawn; the screen is
-- re-drawn by the set_main_menu_UI wrap when the player comes back.

local MP = require 'rmh_mp.state'
local TH = require 'rmh_mp.ui.theme'
local W = require 'rmh_mp.ui.widgets'

local U = MP.ui
if U._menu_loaded then return U end

U.model = U.model or {
  net = { hub = 'connecting', account = { name = '', avatarUrl = nil } },
  lobby = nil, setup = nil, queue = { state = 'idle', queueMode = 'pvp_nemesis' }, history = nil,
  muted = {}, errors = {},
}
U.screens = U.screens or {}
U.boxes = U.boxes or {}
U.refreshers = U.refreshers or {}

-- ── Screens ─────────────────────────────────────────────────────────────────

--- Register a screen: def = { bar = fn(model) -> UIBox def, top = fn(model) -> def|nil, top_align? }
function U.register_screen(name, def) U.screens[name] = def end

--- Overlays that re-draw themselves when the model changes: fn(model) is called while that
--- overlay is up (by name).
function U.register_refresh(name, fn) U.refreshers[name] = fn end

function U.at_main_menu()
  return rawget(_G, 'G') ~= nil and G.STAGES ~= nil and G.STAGE == G.STAGES.MAIN_MENU and G.ROOM_ATTACH ~= nil
end

local function remove_box(name)
  local b = U.boxes[name]
  U.boxes[name] = nil
  if b and b.remove and not b.REMOVED then pcall(b.remove, b) end
end

local function new_box(def, align, offset)
  return UIBox({ definition = def, config = { align = align, offset = offset or { x = 0, y = 0 },
    major = G.ROOM_ATTACH, bond = 'Weak' } })
end

-- The PvP title art (pvp_title.png) instead of the BALATRO logo while the MP menu is up.
local function swap_logo(on)
  local logo = G.SPLASH_LOGO
  local A = G.ASSET_ATLAS
  if not (logo and A and logo.T) then return end
  local pvp = A.mp_pvp_title
  if on and pvp and logo.atlas ~= pvp then
    U._logo = { atlas = logo.atlas, h = logo.T.h }
    pcall(function()
      logo.atlas = pvp
      logo:set_sprite_pos({ x = 0, y = 0 })
      logo.T.h = logo.T.w * (pvp.py / pvp.px)
    end)
  elseif not on and U._logo then
    local o = U._logo
    U._logo = nil
    pcall(function()
      logo.atlas = o.atlas
      logo:set_sprite_pos({ x = 0, y = 0 })
      logo.T.h = o.h
    end)
  end
end

--- The vanilla bottom menu, rebuilt (set_main_menu_UI without the profile button event).
local function restore_vanilla_bar()
  if G.MAIN_MENU_UI and not G.MAIN_MENU_UI.REMOVED then pcall(G.MAIN_MENU_UI.remove, G.MAIN_MENU_UI) end
  G.MAIN_MENU_UI = new_box(create_UIBox_main_menu_buttons(), 'bmi')
  if G.MAIN_MENU_UI.align_to_major then G.MAIN_MENU_UI:align_to_major() end
end

--- Build the definitions of a screen without drawing (specs use this).
function U.build(name, model)
  local s = U.screens[name]
  if not s then return nil end
  model = model or U.model
  return { bar = s.bar and s.bar(model) or nil, top = s.top and s.top(model) or nil, panel = U.panel_def(model) }
end

function U.render()
  U.dirty = false
  local name = U.screen
  if not name then return false end
  if not U.at_main_menu() then return false end
  local defs = U.build(name)
  if not defs then return false end
  remove_box('panel'); remove_box('top')
  if G.MAIN_MENU_UI and not G.MAIN_MENU_UI.REMOVED then pcall(G.MAIN_MENU_UI.remove, G.MAIN_MENU_UI) end
  G.MAIN_MENU_UI = nil
  if defs.bar then
    G.MAIN_MENU_UI = new_box(defs.bar, 'bmi')
    U.boxes.bar = G.MAIN_MENU_UI
  end
  if defs.top then
    U.boxes.top = new_box(defs.top, (U.screens[name].top_align or 'cm'), U.screens[name].top_offset or { x = 0, y = -1.2 })
  end
  U.boxes.panel = new_box(defs.panel, 'tli', { x = 0.3, y = 0.3 })
  swap_logo(true)
  U.rendered = name
  return true
end

function U.invalidate() U.dirty = true end

--- Show an MP screen (or nil for the vanilla menu).
function U.go(name)
  if name == nil then return U.close() end
  U.screen = name
  U.invalidate()
  return true
end

--- Leave the MP menu for the vanilla main menu.
function U.close()
  U.screen = nil
  U.dirty = false
  remove_box('panel'); remove_box('top')
  U.boxes.bar = nil
  if U.at_main_menu() then
    restore_vanilla_bar()
    swap_logo(false)
  end
  U.rendered = nil
  return true
end

local function on_frame()
  if U.dirty then
    local ok, err = pcall(U.render)
    if not ok then
      U.dirty = false
      MP.log('error', 'ui: render %s failed: %s', tostring(U.screen), tostring(err))
    end
  end
  if U.tick then for _, fn in ipairs(U.tick) do pcall(fn) end end
end
U.tick = U.tick or {}
U.on_frame = on_frame

--- Model changed: re-draw the screen and any overlay that asked to follow the model.
function U.changed()
  U.invalidate()
  local name = W.overlay_name()
  local fn = name and U.refreshers[name]
  if fn then
    local ok, err = pcall(fn, U.model)
    if not ok then MP.log('error', 'ui: refresh %s failed: %s', name, tostring(err)) end
  end
end

-- ── The Multiplayer panel (top left, HUD-18) ────────────────────────────────

local STATUS = {
  connected = { key = 'k_status_connected', def = 'Connected', col = 'STATUS_OK' },
  connecting = { key = 'k_status_connecting', def = 'Connecting...', col = 'STATUS_WAIT' },
  offline = { key = 'k_status_offline', def = 'Offline', col = 'STATUS_BAD' },
}

function U.status(model)
  model = model or U.model
  local st = STATUS[model.net.hub] or STATUS.connecting
  if model.queue and model.queue.state == 'searching' and model.net.hub == 'connected' then
    return TH.T('k_status_queueing', 'Queueing'), TH.col('STATUS_WAIT')
  end
  return TH.T(st.key, st.def), TH.col(st.col)
end

function U.online(model)
  return (model or U.model).net.hub == 'connected'
end

function U.panel_def(model)
  model = model or U.model
  local status, scol = U.status(model)
  local name = model.net.account and model.net.account.name or ''
  if name == '' then name = TH.T('rmh_mp_ui_signed_out', 'Not signed in') end
  local reason = model.net.hub == 'offline' and model.net.reason
  return { n = G.UIT.ROOT, config = { align = 'cm', colour = TH.col('CLEAR') }, nodes = {
    W.panel({
      W.row({ W.text(TH.T('k_multiplayer', 'Multiplayer'), { scale = 0.5 }) }, { padding = 0.05 }),
      W.row({ W.button({ id = 'mp_account', label = name, button = 'rmh_mp_settings', minw = 2.3, minh = 0.55, scale = 0.35,
        colour = TH.lighten(TH.col('GREY'), 0.6), text_colour = TH.ui_col('TEXT_DARK') }) }, { padding = 0.04 }),
      W.row({ W.button({ id = 'mp_collection', label = TH.T('b_collection', 'Collection'), button = 'rmh_mp_collection',
        colour = TH.col('PALE_GREEN'), minw = 2.3, minh = 0.55, scale = 0.35 }) }, { padding = 0.04 }),
      W.row({ W.button({ id = 'mp_back', label = TH.T('b_back', 'Back'), button = 'rmh_mp_back', colour = TH.col('ORANGE'),
        minw = 2.3, minh = 0.55, scale = 0.4 }) }, { padding = 0.04 }),
      W.row({ W.text(status, { scale = 0.33, colour = scol, id = 'mp_status' }) }, { padding = 0.03 }),
      reason and W.row({ W.text(TH.T('k_offline_' .. tostring(reason), tostring(reason)), { scale = 0.25, colour = scol }) }) or nil,
    }, { col = true, padding = 0.12, minw = 2.6 }),
  } }
end

-- ── The PvP menu bar (HUD-18) ───────────────────────────────────────────────

local function pvp_bar(model)
  local online = U.online(model)
  local q = model.queue or {}
  local searching = q.state == 'searching'
  local find
  if searching then
    find = W.button({ id = 'mp_find_game', label = { TH.T('b_cancel_search_cap', 'CANCEL') }, button = 'rmh_mp_queue_cancel',
      colour = TH.col('RED'), minw = 3.65, minh = 1.55, scale = 0.6, col = true })
  else
    find = W.button({ id = 'mp_find_game', label = { TH.T('b_find_game_cap', 'FIND GAME') }, button = 'rmh_mp_find_game',
      colour = TH.col('BLUE'), minw = 3.65, minh = 1.55, scale = 0.6, col = true, disabled = not online })
  end
  local search_line = searching and W.row({
    W.text(TH.T('b_searching_cap', 'SEARCHING...') .. ' ' .. TH.queue_mode_name(q.queueMode)
      .. (q.waiting and ('  (' .. tostring(q.waiting) .. ')') or ''), { scale = 0.35, colour = TH.col('STATUS_WAIT'),
        id = 'mp_queue_status' }),
  }, { padding = 0.05 }) or nil
  return { n = G.UIT.ROOT, config = { align = 'cm', colour = TH.col('CLEAR') }, nodes = {
    W.col({
      search_line,
      W.panel({
        find,
        W.col({
          W.button({ id = 'mp_replays', label = { TH.T('b_replay_cap', 'REPLAYS') }, button = 'rmh_mp_replays',
            colour = TH.col('TEAL'), minw = 2.65, minh = 0.65, scale = 0.45 }),
          W.button({ id = 'mp_practice', label = { TH.T('b_practice_cap', 'PRACTICE') }, button = 'rmh_mp_practice',
            colour = TH.col('ORANGE'), minw = 2.65, minh = 0.65, scale = 0.45, disabled = searching }),
        }, { padding = 0.05 }),
        W.col({
          W.col({ W.text(TH.T('k_join_lobby_cap', 'JOIN LOBBY'), { scale = 0.35, vert = true }) }, { padding = 0.05 }),
          W.col({
            W.button({ id = 'mp_join_code', label = { TH.T('b_by_code_cap', 'BY CODE') }, button = 'rmh_mp_join_code',
              colour = TH.col('RED'), minw = 3.65, minh = 0.6, scale = 0.4, disabled = not online or searching }),
            W.button({ id = 'mp_join_clipboard', label = { TH.T('b_from_clipboard_cap', 'FROM CLIPBOARD') },
              button = 'rmh_mp_join_clipboard', colour = TH.col('MP_PURPLE'), minw = 3.65, minh = 0.6, scale = 0.4,
              disabled = not online or searching }),
          }, { padding = 0.05 }),
        }, { r = 0.1, padding = 0.05, colour = TH.col('BLACK') }),
        W.button({ id = 'mp_create_lobby', label = TH.L('b_create_lobby_cap', { 'CREATE', 'LOBBY' }), button = 'rmh_mp_create',
          colour = TH.col('GREEN'), minw = 3.65, minh = 1.55, scale = 0.6, col = true, disabled = not online or searching }),
      }, { padding = 0.2 }),
    }, { align = 'bm' }),
  } }
end

U.register_screen('pvp', { bar = pvp_bar })

--- A plain bottom bar with one Back button (pillar pages).
function U.back_bar(back_func, extra)
  local nodes = { W.button({ id = 'mp_pillars_back', label = TH.T('b_back', 'Back'), button = back_func or 'rmh_mp_to_pvp',
    colour = TH.col('ORANGE'), minw = 2.65, minh = 0.8, scale = 0.5 }) }
  for _, n in ipairs(extra or {}) do nodes[#nodes + 1] = n end
  return { n = G.UIT.ROOT, config = { align = 'cm', colour = TH.col('CLEAR') }, nodes = { W.panel(nodes, { padding = 0.15 }) } }
end

-- ── Intents ─────────────────────────────────────────────────────────────────

function U.send(t, d)
  local ok = MP.net.send(t, d or {})
  if not ok then MP.log('warn', 'ui: %s refused by the protocol', tostring(t)) end
  return ok
end

local F = G.FUNCS

F.rmh_mp_back = function()
  if U.screen == 'lobby' and U.model.lobby then return U.confirm_leave() end
  if U.screen and U.screen ~= 'pvp' then return U.go('pvp') end
  U.close()
end
F.rmh_mp_to_pvp = function() U.go('pvp') end
F.rmh_mp_find_game = function() U.go('find') end
F.rmh_mp_create = function() U.go('create') end
F.rmh_mp_practice = function()
  if U.model.queue.state == 'searching' then return W.toast('rmh_mp_ui_practice_queued', nil,
    { default = "You can't start a run while searching for a match" }) end
  U.go('practice')
end
F.rmh_mp_queue_cancel = function()
  U.send('ui_queue', { op = 'leave', queueMode = U.model.queue.queueMode or 'pvp_nemesis' })
end
F.rmh_mp_join_clipboard = function() U.send('ui_join_clipboard', {}) end
F.rmh_mp_join_code = function() if U.overlays then U.overlays.join_code() end end
F.rmh_mp_settings = function() if U.settings then U.settings.open() end end
F.rmh_mp_replays = function()
  U.send('ui_replay', { op = 'list' })
  if U.replay_open then pcall(U.replay_open) end -- WS13's browser, when present
end

-- ── Inbound view models ─────────────────────────────────────────────────────

local function on_net_status(d)
  U.model.net = d
  U.changed()
end

local function on_lobby_view(d)
  local had = U.model.lobby
  U.model.lobby = d
  MP.state.lobby = d
  -- Setup comes in the lobby state or as its own setup_view; a setup_view for this lobby survives
  -- a lobby_view without one.
  local code = d.state and d.state.code
  if d.state and d.state.setup then
    U.model.setup = d.state.setup
    U.model.setup_code = code
    if U.setup_seen then U.setup_seen(d.state.setup) end
  elseif U.model.setup_code ~= code then
    U.model.setup = nil
  end
  if d.state and d.state.started == nil then
    if not had or had.state.code ~= d.state.code then
      U.model.leaving = nil
      if U.lobby_reset then U.lobby_reset() end
    end
    if U.screen ~= 'lobby' and not U.model.leaving then U.screen = 'lobby' end
  end
  U.changed()
end

local function on_setup_view(d)
  U.model.setup = d
  U.model.setup_code = U.model.lobby and U.model.lobby.state.code or nil
  if U.setup_seen then U.setup_seen(d) end
  U.changed()
end

local function on_queue_view(d)
  U.model.queue = d
  U.changed()
end

local function on_history(d)
  local prev = U.model.history
  U.model.history = d
  if U.settings and U.settings.on_history then U.settings.on_history(prev, d) end
  U.changed()
end

local function on_toast(d) W.toast(d.key, d.vars) end

--- Leave the lobby (after confirm): tell TS, forget the view, back to the PvP menu.
function U.leave_lobby()
  U.send('ui_leave', {})
  U.model.lobby = nil
  U.model.setup = nil
  U.model.leaving = true
  MP.state.lobby = nil
  if U.screen == 'lobby' then U.screen = 'pvp' end
  U.changed()
end

function U.confirm_leave()
  if U.overlays then return U.overlays.confirm({ name = 'confirm_leave',
    text = TH.T('rmh_mp_ui_leave_confirm', 'Leave the lobby?'), on_yes = U.leave_lobby }) end
  U.leave_lobby()
end

-- ── Open ────────────────────────────────────────────────────────────────────

--- MP.ui.open(intent): 'menu' (the PvP menu, or the lobby while seated), 'join' / 'invite'
--- (a code is joining in TS: the menu shows until lobby_view arrives), 'rejoin' (Reconnect prompt).
function U.open(intent)
  intent = intent or 'menu'
  if U.settings and U.settings.push then pcall(U.settings.push) end
  if U.model.lobby and U.model.lobby.state and not U.model.lobby.state.started then
    U.go('lobby')
  else
    U.go('pvp')
  end
  if intent == 'rejoin' and U.overlays then U.overlays.reconnect() end
  if U.at_main_menu() then pcall(U.render) end
  return true
end

-- Re-draw after the game comes back to the main menu (a match ended, Main Menu pressed).
local function install_wraps()
  if rawget(_G, 'set_main_menu_UI') then
    MP.hooks.wrap(_G, 'set_main_menu_UI', function(orig, ...)
      local r = orig(...)
      if U.screen then
        U.rendered = nil
        local ok, err = pcall(U.render)
        if not ok then MP.log('error', 'ui: menu re-render failed: %s', tostring(err)) end
      end
      return r
    end, { id = 'ws10_main_menu', group = 'ui' })
  end
end

-- ── Load the rest, bind ─────────────────────────────────────────────────────

U.MODULES = {
  'rmh_mp.ui.overlays', 'rmh_mp.ui.pillars', 'rmh_mp.ui.practice_menu', 'rmh_mp.ui.run_setup',
  'rmh_mp.ui.lobby', 'rmh_mp.ui.lobby_options', 'rmh_mp.ui.setup', 'rmh_mp.ui.chat', 'rmh_mp.ui.settings',
  'rmh_mp.ui.collection', 'rmh_mp.ui.shortcuts',
}
for _, name in ipairs(U.MODULES) do
  local ok, err = pcall(require, name)
  if not ok then MP.log('error', 'ui: %s failed to load: %s', name, tostring(err)) end
end

-- ── Test surface (WS14a autopilot: MP.test.*; harmless in production, only called by tests) ──
-- vote/ready/unready act on the out-of-run screens this stream owns; in a run they delegate to
-- WS11's MP.test.run_vote / run_ready / run_unready when those exist.

MP.test = MP.test or {}
local T = MP.test

--- What the out-of-run UI shows (for e2e assertions).
function T.ui_state()
  local v = U.model.lobby
  local s = U.model.setup
  return {
    screen = U.screen, rendered = U.rendered, overlay = W.overlay_name(), hub = U.model.net.hub,
    queue = U.model.queue and U.model.queue.state or nil,
    lobby = v and { code = v.state.code, kind = v.state.kind, isHost = v.isHost, canStart = v.canStart,
      players = #v.state.players, version = v.state.version } or nil,
    setup = s and { kind = s.kind, phase = s.phase, stepId = s.stepId } or nil,
    toasts = #U.toasts,
  }
end

local function in_menu_lobby()
  return U.model.lobby ~= nil and not MP.in_session()
end

function T.vote(a)
  a = a or {}
  local s = U.model.setup
  if a.kind ~= 'seed' and a.kind ~= 'draw' and s and s.kind ~= 'draft' and s.phase == 'voting' then
    local opt = a.option or 'random'
    if not U.setup.pick(opt) then error('vote: cannot pick ' .. tostring(opt)) end
    if not U.setup.confirm() then error('vote: not sent') end
    return { stepId = s.stepId, option = opt }
  end
  if T.run_vote then return T.run_vote(a) end
  error('vote: no setup vote open and no in-run vote surface')
end

function T.draft(a)
  a = a or {}
  local s = U.model.setup
  if not (s and s.kind == 'draft' and s.draft) then error('draft: no draft open') end
  local key = a.key
  if not key then
    for _, t in ipairs(s.draft.tiles) do if t.state == 'open' then key = t.deck; break end end
  end
  if not (U.setup.draft_pick(key) and U.setup.draft_confirm()) then error('draft: not my turn or no tile') end
  return { stepId = s.stepId, key = key }
end

function T.ready(a)
  if in_menu_lobby() then return U.send('ui_ready', { ready = true }) end
  if T.run_ready then return T.run_ready(a) end
  error('ready: not in a lobby')
end

function T.unready(a)
  if in_menu_lobby() then return U.send('ui_ready', { ready = false }) end
  if T.run_unready then return T.run_unready(a) end
  error('unready: not in a lobby')
end

local OVERLAYS = {
  lobby_options = function() return U.lobby_options.open() end,
  settings = function() return U.settings.open() end,
  collection = function(a) return U.collection.open(a.tab) end,
  join_code = function() return U.overlays.join_code() end,
  run_setup = function(a) return U.run_setup.open(a.mode or 'lobby', a) end,
  shortcuts = function() return U.shortcuts.open() end,
}

local OPS = {
  open = function(a) U.open(a.intent or 'menu') end,
  close = function() U.close() end,
  screen = function(a) U.go(a.screen) end,
  create = function(a) U.send('ui_create_lobby', { queueMode = a.queueMode or 'pvp_nemesis', kind = a.kind or 'private' }) end,
  join = function(a) U.send('ui_join', { code = a.code }) end,
  leave = function() U.leave_lobby() end,
  start = function() U.send('ui_start', {}) end,
  option = function(a) U.send('ui_set_option', { key = a.key, value = a.value }) end,
  deck = function(a) U.send('ui_set_deck', { deck = a.deck or 'b_red', stake = a.stake or 1 }) end,
  queue = function(a) U.send('ui_queue', { op = 'join', queueMode = a.queueMode or 'pvp_nemesis' }) end,
  cancel = function(a) U.send('ui_queue', { op = 'leave', queueMode = a.queueMode or U.model.queue.queueMode or 'pvp_nemesis' }) end,
  practice = function(a)
    U.send('ui_practice', { ruleset = a.ruleset or 'ruleset_mp_balanced', deck = a.deck or 'b_red', stake = a.stake or 1, seed = a.seed })
  end,
  overlay = function(a)
    local fn = OVERLAYS[a.name]
    if not fn then error('ui: unknown overlay ' .. tostring(a.name)) end
    fn(a)
  end,
}

--- Drive a screen action by name (e2e). a = { op, ... }.
function T.ui(a)
  a = a or {}
  local fn = OPS[a.op]
  if not fn then error('ui: unknown op ' .. tostring(a.op)) end
  fn(a)
  return T.ui_state()
end

MP.net.on('net_status', on_net_status)
MP.net.on('lobby_view', on_lobby_view)
MP.net.on('setup_view', on_setup_view)
MP.net.on('queue_view', on_queue_view)
MP.net.on('history', on_history)
MP.net.on('toast', on_toast)
MP.net.on('glyphs', function(d) U.model.glyphs = d end)
MP.net.add_frame_hook(on_frame)
install_wraps()

U._menu_loaded = true
return U
