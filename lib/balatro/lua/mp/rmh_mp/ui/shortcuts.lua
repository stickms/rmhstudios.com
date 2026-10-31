-- rmh_mp/ui/shortcuts.lua — WS10 keyboard: the TAB-hold shortcuts overlay (LOB-12) and the chat
-- key (HUD-11). One wrap each on Controller.key_press_update / key_release_update (group 'ui').
--
-- In a lobby, holding TAB shows SHORTCUTS: C copy code, V view code, R ready/unready (guests),
-- O lobby options, I invite, L leave. A listed key runs its action; releasing TAB closes it.
-- T opens chat (in a lobby or an MP session) unless a text box has focus.

local MP = require 'rmh_mp.state'
local TH = require 'rmh_mp.ui.theme'
local W = require 'rmh_mp.ui.widgets'

local U = MP.ui
local SC = U.shortcuts or {}
U.shortcuts = SC

local F = G.FUNCS

--- The shortcuts for the current lobby view: { key, label, run }.
function SC.list(model)
  local view = model.lobby
  if not view then return {} end
  local out = {}
  local function add(key, label, def, fn) out[#out + 1] = { key = key, label = TH.T(label, def), run = fn } end
  if view.state.kind ~= 'casual' then
    add('c', 'rmh_mp_ui_copy_code_cap', 'COPY CODE', F.rmh_mp_copy_code)
    add('v', 'rmh_mp_ui_view_code_cap', 'VIEW CODE', F.rmh_mp_view_code)
  end
  if not view.isHost and view.state.kind ~= 'casual' then add('r', 'b_ready', 'Ready', F.rmh_mp_ready) end
  if view.state.kind == 'private' then add('o', 'k_lobby_options', 'Lobby Options', F.rmh_mp_lobby_options) end
  if view.state.kind ~= 'casual' then add('i', 'rmh_mp_invite', 'Invite', F.rmh_mp_invite) end
  add('l', 'b_leave_lobby', 'Leave Lobby', F.rmh_mp_leave)
  return out
end

function SC.contents(model)
  local rows = { W.row({ W.text(TH.T('k_sc_title', 'SHORTCUTS'), { scale = 0.6 }) }, { padding = 0.05 }) }
  for _, s in ipairs(SC.list(model)) do
    rows[#rows + 1] = W.row({
      W.col({ W.text(s.key:upper(), { scale = 0.45, colour = TH.col('GOLD') }) }, { minw = 0.8, r = 0.1, colour = TH.col('BLACK'), padding = 0.05 }),
      W.col({}, { minw = 0.2 }),
      W.col({ W.text(s.label, { scale = 0.4 }) }, { minw = 3.5, align = 'cl' }),
    }, { padding = 0.03, id = 'mp_sc_' .. s.key })
  end
  rows[#rows + 1] = W.row({ W.text(TH.T('k_sc_hint', 'Press key or release TAB to close'), { scale = 0.28, colour = TH.ui_col('TEXT_INACTIVE') }) })
  return rows
end

function SC.open()
  if SC.is_open or G.OVERLAY_MENU then return false end
  if not (U.screen == 'lobby' and U.model.lobby and U.at_main_menu()) then return false end
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
