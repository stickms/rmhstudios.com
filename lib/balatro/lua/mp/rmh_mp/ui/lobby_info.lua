-- rmh_mp/ui/lobby_info.lua — the Lobby Info overlay opened from the HUD button (HUD-09, LOB-16/17).
--
-- As the mod (the API's lobby card grid + PvP's player_status_provider.lua): one card per player
-- who started the match, their avatar Joker on the Black Deck back, 4 per row, with the name (and
-- Host) under it, then lives (and team), where they are (Enemy-location text) and connection
-- (Away / Catching up / Left / Forfeited). A player out of the run (0 lives, or forfeited) is drawn
-- debuffed. Clicking another player's card opens WS10's per-player overlay (Mute / Kick / Info) when
-- the out-of-run UI is loaded; without it a Mute toggle sends ui_mute directly. The cards come from
-- a pure model (LI.rows()) so specs can check them.
--
--   LI.rows()    -> { { id, name, host, me, team, lives, location, status, out, avatarJoker }, ... }
--   LI.open()    shows the overlay (G.FUNCS.mp_lobby_info)

local MP = require 'rmh_mp.state'
local W = require 'rmh_mp.ui.widgets'

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
      lives = lives, location = t.location_text(loc), status = status, avatarJoker = r.avatarJoker,
      -- player_status_provider.lua: lives <= 0 is out of the run (a forfeit too), drawn debuffed.
      out = (lives ~= nil and lives <= 0) or status == 'forfeited',
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

LI.COLS = 4
LI.SCALE = 0.55

--- One player's card: the avatar Joker (debuffed when out), name, lives/team, location, status.
function LI.card(p)
  local t = RU()
  local w, h = (G.CARD_W or 2.1) * LI.SCALE, (G.CARD_H or 2.8) * LI.SCALE
  local card_node
  if rawget(_G, 'CardArea') then
    local area = CardArea(0, 0, w, h, { card_limit = 1, type = 'title', highlight_limit = 0 })
    local card = W.avatar_card({ id = p.id, name = p.name, avatarJoker = p.avatarJoker },
      { scale = LI.SCALE, on_click = function() if not p.me then LI.player(p.id) end end })
    if card then
      card.debuff = p.out == true
      area:emplace(card)
    end
    card_node = { n = G.UIT.O, config = { object = area } }
  else
    card_node = W.col({}, { minw = w, minh = h })
  end
  local status, col = LI.status_text(p.status)
  local lives = (p.lives and tostring(p.lives) or '-') .. (p.team and ('  ' .. tostring(p.team)) or '')
  local name = p.name .. (p.host and (' (' .. t.t('rmh_mp_ui_host', 'Host') .. ')') or '')
  local function line(text, scale, colour)
    return W.row({ { n = G.UIT.T, config = { text = text, scale = scale, colour = colour, shadow = true } } },
      { maxw = w + 0.6 })
  end
  local nodes = {
    W.row({ card_node }),
    line(name, 0.3, p.me and t.MP_PURPLE or G.C.WHITE),
    line(lives, 0.35, p.out and G.C.UI.TEXT_INACTIVE or G.C.RED),
    line(p.location or '', 0.26, G.C.UI.TEXT_LIGHT),
  }
  if status and status ~= '' then nodes[#nodes + 1] = line(status, 0.26, col and G.C[col] or G.C.WHITE) end
  return W.col(nodes, { padding = 0.05, minw = w + 0.4, id = 'mp_lobby_info_' .. tostring(p.id) })
end

function LI.def()
  local t = RU()
  local rows, row = {}, {}
  for _, p in ipairs(LI.rows()) do
    row[#row + 1] = LI.card(p)
    if #row == LI.COLS then rows[#rows + 1] = W.row(row, { padding = 0.05 }); row = {} end
  end
  if #row > 0 then rows[#rows + 1] = W.row(row, { padding = 0.05 }) end
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
