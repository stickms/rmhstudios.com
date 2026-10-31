-- rmh_mp/ui/lobby_info.lua — the Lobby Info overlay opened from the HUD button (HUD-09, LOB-16/17).
--
-- One row per player who started the match: name (with Host), team, lives, where they are
-- (Enemy-location text), and connection (Away / Catching up / Left). A player's row opens WS10's
-- per-player overlay (Mute / Kick / Info) when the out-of-run UI is loaded; without it a Mute toggle
-- sends ui_mute directly. The rows are a pure model (LI.rows()) so specs can check them.
--
--   LI.rows()    -> { { id, name, host, me, team, lives, location, status }, ... }
--   LI.open()    shows the overlay (G.FUNCS.mp_lobby_info)

local MP = require 'rmh_mp.state'

MP.ui = MP.ui or {}
local LI = MP.ui.lobby_info or {}
MP.ui.lobby_info = LI

local function RU() return MP.ui.run end

LI.muted = LI.muted or {}

function LI.rows()
  local t = RU()
  local st = MP.state
  local s = st.session
  local out = {}
  local ids = MP.ui.end_screen and MP.ui.end_screen.players and MP.ui.end_screen.players() or {}
  for _, id in ipairs(ids) do
    local r = s.roster[id] or {}
    local pres = st.presence and st.presence[id]
    local status = pres and pres.status or 'here'
    local loc = (st.locations and st.locations[id]) or (id == st.target and st.enemy.location) or nil
    if id == s.me then loc = st.location end
    local lives = st.lives[id]
    if r.team and (r.team == 'A' or r.team == 'B') then lives = st.team_lives[r.team] end
    out[#out + 1] = {
      id = id, name = t.name_of(id), host = id == s.hostId, me = id == s.me, team = r.team,
      lives = lives, location = t.location_text(loc), status = status,
    }
  end
  return out
end

local STATUS = {
  away = { 'rmh_mp_conn_away', 'Away', 'ORANGE' },
  catching_up = { 'rmh_mp_ui_catching_up', 'Catching up', 'ORANGE' },
  left = { 'rmh_mp_ui_left', 'Left', 'RED' },
  forfeited = { 'rmh_mp_ui_forfeited', 'Forfeited', 'RED' },
}

function LI.status_text(status)
  local s = STATUS[status]
  if not s then return '' end
  return RU().t(s[1], s[2]), s[3]
end

function LI.def()
  local t = RU()
  local rows = {}
  for _, p in ipairs(LI.rows()) do
    local status, col = LI.status_text(p.status)
    local name = p.name .. (p.host and (' (' .. t.t('rmh_mp_ui_host', 'Host') .. ')') or '')
    local row = { n = G.UIT.R, config = { align = 'cm', padding = 0.06, r = 0.1, minw = 10, colour = p.me and t.MP_PURPLE or G.C.BLACK,
      button = (not p.me) and 'mp_lobby_info_player' or nil, hover = not p.me, ref_table = { id = p.id } }, nodes = {
      { n = G.UIT.C, config = { align = 'cl', minw = 3.2 }, nodes = { { n = G.UIT.T, config = { text = name, scale = 0.4, colour = G.C.WHITE, shadow = true } } } },
      { n = G.UIT.C, config = { align = 'cm', minw = 1 }, nodes = { { n = G.UIT.T, config = { text = p.team and tostring(p.team) or '', scale = 0.33, colour = G.C.UI.TEXT_LIGHT } } } },
      { n = G.UIT.C, config = { align = 'cm', minw = 1.2 }, nodes = { { n = G.UIT.T, config = { text = p.lives and tostring(p.lives) or '-', scale = 0.45, colour = G.C.RED, shadow = true } } } },
      { n = G.UIT.C, config = { align = 'cl', minw = 3.2 }, nodes = { { n = G.UIT.T, config = { text = p.location, scale = 0.32, colour = G.C.UI.TEXT_LIGHT } } } },
      { n = G.UIT.C, config = { align = 'cm', minw = 1.4 }, nodes = { { n = G.UIT.T, config = { text = status, scale = 0.32, colour = col and G.C[col] or G.C.WHITE } } } },
    } }
    rows[#rows + 1] = row
  end
  local title = table.concat(t.tl('ml_lobby_info', { 'Lobby', 'Info' }), ' ')
  table.insert(rows, 1, { n = G.UIT.R, config = { align = 'cm', padding = 0.1 }, nodes = {
    { n = G.UIT.T, config = { text = title, scale = 0.6, colour = G.C.WHITE, shadow = true } } } })
  return create_UIBox_generic_options({ contents = rows })
end

function LI.open()
  if not MP.in_session() then return false end
  G.SETTINGS.paused = true
  G.FUNCS.overlay_menu({ definition = LI.def() })
  return true
end

function LI.player(id)
  local L = MP.ui.lobby
  if L and L.player_overlay and MP.ui.model and MP.ui.model.lobby then
    local ok, r = pcall(L.player_overlay, id)
    if ok and r then return r end
  end
  -- Fallback: toggle mute directly.
  LI.muted[id] = not LI.muted[id]
  MP.net.send('ui_mute', { userId = id, on = LI.muted[id] == true })
  RU().toast((LI.muted[id] and RU().t('k_mute_player', 'Mute Player') or RU().t('k_unmute_player', 'Unmute Player')) .. ': ' .. RU().name_of(id))
  return true
end

function LI.install()
  if G and G.FUNCS then
    G.FUNCS.mp_lobby_info_player = function(e)
      local id = e and e.config and e.config.ref_table and e.config.ref_table.id
      if id then LI.player(id) end
    end
  end
end

return LI
