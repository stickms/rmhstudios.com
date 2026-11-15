-- MULTIPLAYER menu button (PLAN §3.d): mp_open -> mp_pack progress -> on ready
-- (message or /rmh/mp/ready) require 'rmh_mp' and call its open(intent).
local R = RMH_WEB
local net = R.net
local E = { st = { text = 'LOADING...' } }
R.mp_entry = E

local function has(p)
  local f = io.open(p, 'rb')
  if f then f:close() end
  return f ~= nil
end

local function fail(err)
  net.send('mp_log', { level = 'error', msg = tostring(err):sub(1, 4000) })
end

local function close()
  if E.shown and G.OVERLAY_MENU then G.FUNCS.exit_overlay_menu() end
  E.shown = nil
end

function E.load()
  if E.mp then return E.mp end
  local ok, mp = pcall(require, 'rmh_mp')
  if not ok then
    E.st.text = 'MULTIPLAYER FAILED TO LOAD'
    return fail(mp)
  end
  E.mp = type(mp) == 'table' and mp or {}
  local want = E.want
  E.want = nil
  close()
  if want and E.mp.open then
    local done, err = pcall(E.mp.open, want)
    if not done then fail(err) end
  end
  return E.mp
end

local function wait()
  if E.waiting then return end
  E.waiting = true
  R.frame_hooks[#R.frame_hooks + 1] = function()
    if not E.mp and has('/rmh/mp/ready') then E.load() end
  end
end

net.on('mp_pack', function(d)
  if d.status == 'ready' then E.load()
  elseif d.status == 'error' then E.st.text = 'MULTIPLAYER UNAVAILABLE'
  elseif not E.mp then E.st.text = 'LOADING ' .. math.floor((tonumber(d.progress) or 0) * 100) .. '%' end
end)

G.FUNCS.rmh_mp_open = function()
  if E.mp then
    if E.mp.open then E.mp.open('menu') end
    return
  end
  E.want, E.st.text, E.shown = 'menu', 'LOADING...', true
  net.send('mp_open', { intent = 'menu' })
  wait()
  G.FUNCS.overlay_menu({ definition = create_UIBox_generic_options({ back_func = 'rmh_mp_cancel', contents = {
    { n = G.UIT.R, config = { align = 'cm', padding = 0.3, minw = 5, minh = 1.2 }, nodes = {
      { n = G.UIT.T, config = { ref_table = E.st, ref_value = 'text', scale = 0.5, colour = G.C.UI.TEXT_LIGHT, shadow = true } },
    } },
  } }) })
end

G.FUNCS.rmh_mp_cancel = function()
  E.want, E.shown = nil, nil
  G.FUNCS.exit_overlay_menu()
end

local function find_bar(node)
  for i, c in ipairs(node.nodes or {}) do
    if c.nodes and c.nodes[1] and c.nodes[1].config and c.nodes[1].config.id == 'main_menu_play' then return node, i end
    local bar, at = find_bar(c)
    if bar then return bar, at end
  end
end

local buttons = create_UIBox_main_menu_buttons
function create_UIBox_main_menu_buttons(...)
  local t = buttons(...)
  local bar, at = find_bar(t)
  if bar then
    table.insert(bar.nodes, math.min(at + 2, #bar.nodes + 1), UIBox_button({ id = 'rmh_mp_button', button = 'rmh_mp_open',
      colour = { 0.55, 0.3, 0.7, 1 }, minw = 2.65, minh = 1.35, label = { 'MULTIPLAYER' }, scale = 0.5, col = true }))
  end
  return t
end

-- /rmh/mp/autoload: invite, rejoin or a continued MP run
local start_up = Game.start_up
function Game:start_up(...)
  local r = start_up(self, ...)
  local f = io.open('/rmh/mp/autoload', 'rb')
  if f then
    local intent = (f:read('*a') or ''):match('^%a+')
    f:close()
    E.want = (intent == 'invite' or intent == 'rejoin' or intent == 'join') and intent or nil
    if has('/rmh/mp/ready') then E.load() else wait() end
  end
  return r
end
