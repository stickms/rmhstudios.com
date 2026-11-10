-- rmh_mp/ui/shortcuts.lua — WS10 keyboard: the TAB-hold shortcuts overlay (LOB-12) and the chat
-- key (HUD-11). One wrap each on Controller.key_press_update / key_release_update (group 'ui').
--
-- As the mod's ui/shortcuts_menu.lua (A16), and only at the main menu: in any lobby (private,
-- party or matchmade) holding TAB shows SHORTCUTS: C copy code, V view code (a MULTIPLAYER
-- message with the code), L leave (at once, as the mod's leave from the menu). On the PvP menu
-- screens out of a lobby (online): V join from the clipboard, J join by code, C create lobby. A
-- listed key runs its action; releasing TAB closes it.
-- T opens chat (in a lobby or an MP session) unless a text box has focus.

local MP = require 'rmh_mp.state'
local TH = require 'rmh_mp.ui.theme'
local W = require 'rmh_mp.ui.widgets'

local U = MP.ui
local SC = U.shortcuts or {}
U.shortcuts = SC

local F = G.FUNCS

--- The PvP menu out of a lobby (A16, the mod's `elseif connected`): V join from the clipboard,
--- J join by code, C create a lobby (the Create Lobby page). A search running meanwhile opens the
--- queue guard instead (queue_guard.lua).
local function guarded(fn)
  return function()
    if U.queue_guard and U.queue_guard(fn) then return end
    return fn()
  end
end
SC.MENU = {
  { 'v', 'b_join_lobby_clipboard', 'Join From Clipboard', guarded(function() return F.rmh_mp_join_clipboard() end) },
  { 'j', 'b_join_lobby', 'Join Lobby', guarded(function() return F.rmh_mp_join_code() end) },
  { 'c', 'b_create_lobby', 'Create Lobby', guarded(function() return F.rmh_mp_create() end) },
}

--- The shortcuts for the current lobby view, or for the PvP menu: { key, label, run }.
function SC.list(model)
  local view = model.lobby
  local out = {}
  local function add(key, label, def, fn) out[#out + 1] = { key = key, label = TH.T(label, def), run = fn } end
  if not view then
    if U.screen and U.screen ~= 'lobby' and model.net and model.net.hub == 'connected' then
      for _, s in ipairs(SC.MENU) do add(s[1], s[2], s[3], s[4]) end
    end
    return out
  end
  add('c', 'b_copy_code', 'COPY CODE', SC.copy_code)
  add('v', 'b_view_code', 'VIEW CODE', SC.view_code)
  add('l', 'b_leave_lobby', 'Leave Lobby', function() return U.leave_lobby() end)
  return out
end

--- C: copy the lobby code (the lobby's COPY CODE button).
function SC.copy_code() return F.rmh_mp_copy_code() end

--- V: the mod's overlay_message(code): "MULTIPLAYER" over the code, with a Back button.
function SC.view_code()
  local view = U.model.lobby
  local code = view and view.state and view.state.code
  return W.overlay({ name = 'view_code', contents = {
    W.row({ W.text('MULTIPLAYER', { scale = 0.8 }) }, { padding = 0.2 }),
    W.row({ W.text(tostring(code or ''), { scale = 0.6, id = 'mp_sc_code' }) }, { padding = 0.1 }),
  } })
end

function SC.contents(model)
  -- The mod's rows: the key letter on a purple chip, the label after it, on an L_BLACK row.
  local rows = { W.row({ W.text(TH.T('k_sc_title', 'SHORTCUTS'), { scale = 0.5 }) }, { padding = 0.08 }) }
  for _, s in ipairs(SC.list(model)) do
    rows[#rows + 1] = W.row({
      W.col({ W.row({ W.text(s.key:upper(), { scale = 0.4 }) }, { minw = 0.6, r = 0.05, colour = TH.col('PURPLE'), padding = 0.04 }) },
        { minw = 1 }),
      W.col({ W.text(' ' .. s.label, { scale = 0.38, shadow = false }) }, { minw = 3.5, align = 'cl' }),
    }, { padding = 0.04, r = 0.08, colour = TH.col('L_BLACK'), id = 'mp_sc_' .. s.key })
  end
  rows[#rows + 1] = W.row({ W.text(TH.T('k_sc_hint', 'Press key or release TAB to close'), { scale = 0.3, colour = TH.ui_col('TEXT_INACTIVE'), shadow = false }) },
    { padding = 0.06 })
  return rows
end

function SC.open()
  if SC.is_open or G.OVERLAY_MENU then return false end
  if not U.at_main_menu() then return false end
  local in_lobby = U.screen == 'lobby' and U.model.lobby
  if not in_lobby and (U.model.lobby or #SC.list(U.model) == 0) then return false end
  SC.is_open = true
  W.overlay({ name = 'shortcuts', no_back = true, contents = SC.contents(U.model) })
  return true
end

function SC.close()
  if not SC.is_open then return false end
  SC.is_open = false
  W.close_overlay('shortcuts')
  return true
end

--- A key while the overlay is up: run the matching action. True when consumed.
function SC.press(key)
  if not SC.is_open then return false end
  for _, s in ipairs(SC.list(U.model)) do
    if s.key == key then
      SC.close()
      s.run()
      return true
    end
  end
  if key == 'escape' then SC.close(); return true end
  return false
end

--- The pressed-key path (exposed for specs). Returns true when the key was consumed.
function SC.on_key_press(key)
  if U.chat and U.chat.open_input and key == 'escape' then U.chat.close(); return true end
  if G.CONTROLLER and G.CONTROLLER.text_input_hook then return false end
  if SC.press(key) then return true end
  if key == 'tab' and SC.open() then return true end
  if key == 't' and U.chat and U.chat.key(key) then return true end
  return false
end

if rawget(_G, 'Controller') then
  MP.hooks.wrap(Controller, 'key_press_update', function(orig, self, key, dt)
    if not (self.locks and self.locks.frame) then
      local ok, used = pcall(SC.on_key_press, key)
      if ok and used then return end
    end
    return orig(self, key, dt)
  end, { id = 'ws10_key_press', group = 'ui' })
  MP.hooks.wrap(Controller, 'key_release_update', function(orig, self, key, dt)
    if key == 'tab' and SC.is_open then pcall(SC.close) end
    return orig(self, key, dt)
  end, { id = 'ws10_key_release', group = 'ui' })
end

return SC
