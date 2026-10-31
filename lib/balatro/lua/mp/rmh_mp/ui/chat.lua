-- rmh_mp/ui/chat.lua — WS10 chat widget (HUD-11, NET-11; transport is WS5's).
--
-- A bottom-left console: the newest lines at the bottom, each fading out after a while,
-- "name: message", coloured incoming cyan / own purple / system yellow. T opens the input (not
-- while a text box has focus, not with chat disabled in the MP settings); Enter sends
-- ui_chat{text}; Escape closes. Works in the lobby and in a run. Muted senders are dropped here
-- too (TS already filters; mute is local, D-35). vote_progress lines print here
-- ("Vote to change seed: k/n", "Vote for Draw: k/n").

local MP = require 'rmh_mp.state'
local TH = require 'rmh_mp.ui.theme'
local W = require 'rmh_mp.ui.widgets'

local U = MP.ui
local CH = U.chat or {}
U.chat = CH

CH.MAX_LINES = 8
CH.KEEP = 50
CH.SHOW_SECONDS = 10
CH.FADE_SECONDS = 2
CH.INPUT_MAX = 120   -- the text input draws one node per letter; the protocol allows 500

CH.lines = CH.lines or {}
CH.draft = CH.draft or { text = '' }

local function now()
  return (rawget(_G, 'love') and love.timer and love.timer.getTime and love.timer.getTime()) or (G.TIMERS and G.TIMERS.REAL) or 0
end

local KIND_COLOUR = { ['in'] = 'CHAT_IN', own = 'CHAT_OWN', system = 'CHAT_SYSTEM' }

function CH.enabled()
  return not (U.setting and U.setting('chat') == false)
end

--- Add a line (from chat_line, or a local system note). Returns the stored line or nil (muted).
function CH.add(d)
  if d.kind == 'in' and U.model.muted[d.from] then return nil end
  local text = d.kind == 'system' and tostring(d.text) or (tostring(d.name or '?') .. ': ' .. tostring(d.text))
  local line = { text = text, kind = d.kind, at = now(), colour = TH.col(KIND_COLOUR[d.kind] or 'CHAT_SYSTEM') }
  CH.lines[#CH.lines + 1] = line
  while #CH.lines > CH.KEEP do table.remove(CH.lines, 1) end
  CH.dirty = true
  return line
end

function CH.system(text) return CH.add({ from = 'system', name = '', text = text, kind = 'system' }) end

--- Lines still visible at time t (input open: everything recent), oldest first, with alpha.
function CH.visible(t)
  t = t or now()
  local out = {}
  local first = math.max(1, #CH.lines - CH.MAX_LINES + 1)
  for i = first, #CH.lines do
    local l = CH.lines[i]
    local age = t - l.at
    local a = 1
    if not CH.open_input then
      if age > CH.SHOW_SECONDS + CH.FADE_SECONDS then a = 0
      elseif age > CH.SHOW_SECONDS then a = 1 - (age - CH.SHOW_SECONDS) / CH.FADE_SECONDS end
    end
    if a > 0 then out[#out + 1] = { text = l.text, colour = TH.alpha(l.colour, a), kind = l.kind } end
  end
  return out
end

function CH.def(t)
  local rows = {}
  for _, l in ipairs(CH.visible(t)) do
    rows[#rows + 1] = W.row({ W.text(l.text, { scale = 0.32, colour = l.colour }) }, { align = 'cl', padding = 0.01 })
  end
  if CH.open_input then
    rows[#rows + 1] = W.row({ create_text_input({ w = 6, h = 0.5, max_length = CH.INPUT_MAX, extended_corpus = true,
      prompt_text = TH.T('rmh_mp_ui_chat_prompt', 'Say something (Enter to send)'), ref_table = CH.draft, ref_value = 'text',
      text_scale = 0.3, colour = TH.alpha(TH.col('BLACK'), 0.8), hooked_colour = TH.alpha(TH.col('BLACK'), 0.9),
      callback = function() CH.submit() end }) }, { align = 'cl', padding = 0.03, id = 'mp_chat_input' })
  end
  return { n = G.UIT.ROOT, config = { align = 'cl', colour = TH.col('CLEAR') }, nodes = {
    W.col(rows, { align = 'bl', padding = 0.05, r = 0.1, colour = (#rows > 0) and TH.alpha(TH.col('BLACK'), 0.35) or TH.col('CLEAR'),
      id = 'mp_chat' }),
  } }
end

--- (Re)draw the console box when its content changed.
function CH.render()
  CH.dirty = false
  if CH.box and not CH.box.REMOVED then pcall(CH.box.remove, CH.box) end
  CH.box = nil
  if not (G.ROOM_ATTACH and rawget(_G, 'UIBox')) then return end
  local def = CH.def()
  if #def.nodes[1].nodes == 0 then return end
  CH.box = UIBox({ definition = def, config = { align = 'bli', offset = { x = 0.3, y = -0.4 }, major = G.ROOM_ATTACH, bond = 'Weak' } })
  if CH.open_input then
    local input = CH.box:get_UIE_by_ID('text_input')
    if input and G.FUNCS.select_text_input then pcall(G.FUNCS.select_text_input, input) end
  end
end

function CH.open()
  if not CH.enabled() then
    W.toast('rmh_mp_ui_chat_disabled', nil, { default = 'Chat is off (Multiplayer settings)' })
    return false
  end
  CH.open_input = true
  CH.draft.text = ''
  CH.render()
  return true
end

function CH.close()
  CH.open_input = false
  if G.CONTROLLER then G.CONTROLLER.text_input_hook = nil end
  CH.render()
end

--- Send what the input holds; returns the text sent (or nil).
function CH.submit()
  local text = tostring(CH.draft.text or ''):gsub('^%s+', ''):gsub('%s+$', '')
  CH.draft.text = ''
  CH.open_input = false
  CH.dirty = true
  if text == '' then return nil end
  if #text > 500 then text = text:sub(1, 500) end
  if U.send('ui_chat', { text = text }) then return text end
  return nil
end

--- Only where a chat makes sense: in a lobby or an MP session.
function CH.available()
  return U.model.lobby ~= nil or MP.in_session()
end

--- Key handling (called from the Controller wrap in shortcuts.lua). True when consumed.
function CH.key(key)
  if G.CONTROLLER and G.CONTROLLER.text_input_hook then
    if CH.open_input and key == 'escape' then CH.close(); return true end
    return false
  end
  if key == 't' and CH.available() and not G.OVERLAY_MENU then return CH.open() end
  return false
end

MP.net.on('chat_line', function(d) CH.add(d) end)
MP.net.on('vote_progress', function(d)
  local label = d.kind == 'seed' and TH.T('rmh_mp_ui_vote_seed', 'Vote to change seed') or TH.T('rmh_mp_ui_draw_vote', 'Vote for Draw')
  CH.system(label .. ': ' .. tostring(d.k) .. '/' .. tostring(d.n))
end)

-- Per-frame: redraw on new lines, and while lines are fading.
U.tick[#U.tick + 1] = function()
  local t = now()
  local fading = false
  for _, l in ipairs(CH.visible(t)) do if l.colour[4] < 1 then fading = true; break end end
  local count = #CH.visible(t)
  if CH.dirty or fading or count ~= (CH.last_count or 0) then
    CH.last_count = count
    if CH.box or count > 0 or CH.open_input then pcall(CH.render) end
  end
end

return CH
