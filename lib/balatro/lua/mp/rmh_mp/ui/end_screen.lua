-- rmh_mp/ui/end_screen.lua — the match end screens (HUD-12, HUD-13 show side, HUD-14 button).
--
-- MP.ui.show_result(result) is the core's hook (hooks/report.lua RP.finish / death_pending). The
-- result is { kind = 'win'|'lose'|'draw'|'pending'|'eliminated', places?, forfeit? }. The screen is
-- an overlay the player cannot Esc out of, laid out like the mod's shared end screen:
--   background  green (win) / red (lose, eliminated, pending) / blue (draw)
--   title       YOU WIN! / GAME OVER / DRAW! / OUT OF LIVES (pending, with its three lines)
--   left        the Jimbo quip spot (win quips on a win, loss quips otherwise; no Ko-fi line)
--   body        Nemesis row (label + opponent); a player selector over everyone who started; that
--               player's joker row with "<name>'s Jokers" / "<name> -- left the match" /
--               "<name> -- still playing..."; View Deck (Nemesis Deck / Your Deck) and Roster
--   buttons     Continue in Singleplayer (blue) · Return to Lobby (green, private lobbies only) ·
--               Leave Lobby (red). The pending screen has Leave only.
-- Showing it also hands the page our own deck and stats (report.lua RP.send_local_end_data) and asks
-- the nemesis for theirs (deck_req / stats_req), so View Deck can show both.
--
--   ES.model(result)      -> pure description of the screen (title, colour, lines, buttons, players)
--   ES.show(result)       builds and shows the overlay (MP.ui.show_result)
--   ES.parse_deck(s)      'Hearts-Ace-m_glass-foil-Red;...' -> SafeCard list

local MP = require 'rmh_mp.state'

MP.ui = MP.ui or {}
local ES = MP.ui.end_screen or {}
MP.ui.end_screen = ES

local function RU() return MP.ui.run end
local function g(name) return rawget(_G, name) end
local function me() return MP.state.session and MP.state.session.me end

ES.BG = {
  win = { 'GREEN', 0.5 }, lose = { 'RED', 0.8 }, eliminated = { 'RED', 0.8 }, pending = { 'RED', 0.8 },
  draw = { 'BLUE', 0.65 },
}

--- Everyone who started the match, in roster order of names (me first).
function ES.players()
  local s = MP.state.session
  local ids = {}
  for id in pairs((s and s.roster) or {}) do if id ~= me() then ids[#ids + 1] = id end end
  table.sort(ids, function(a, b) return RU().name_of(a) < RU().name_of(b) end)
  if me() then table.insert(ids, 1, me()) end
  return ids
end

function ES.private_lobby()
  local m = MP.ui.model
  local l = (m and m.lobby) or MP.state.lobby
  local kind = l and l.state and l.state.kind
  return kind == 'private'
end

--- Joker caption for a player (HUD-12).
function ES.caption(id)
  local t = RU()
  local name = t.name_of(id)
  local pres = MP.state.presence and MP.state.presence[id]
  if id ~= me() and pres and (pres.status == 'left' or pres.status == 'forfeited') then
    return t.tv('k_end_player_left', '#1# -- left the match', { name })
  end
  local res = MP.state.player_results and MP.state.player_results[id]
  if id ~= me() and (not res or res.interim) and not (MP.state.lives[id] == 0) then
    return t.tv('k_end_player_playing', '#1# -- still playing...', { name })
  end
  return t.tv('k_end_player_jokers', "#1#'s Jokers", { name })
end

--- The joker list for a player: own jokers live, others from their player_result.
function ES.jokers_of(id)
  if id == me() then
    local r = MP.report and MP.report.player_result and MP.report.player_result(false)
    return (r and r.jokers) or {}
  end
  local res = MP.state.player_results and MP.state.player_results[id]
  return (res and res.jokers) or {}
end

function ES.model(result)
  local t = RU()
  result = result or {}
  local kind = result.kind or 'lose'
  local m = { kind = kind, lines = {}, buttons = {} }
  if kind == 'win' then
    m.title = g('localize') and localize('ph_you_win') or 'YOU WIN!'
  elseif kind == 'draw' then
    m.title = t.t('rmh_mp_draw_title', 'DRAW!')
  elseif kind == 'pending' then
    m.title = t.t('k_pvp_pending_death_title', 'OUT OF LIVES')
    m.lines[#m.lines + 1] = t.t('k_pvp_pending_death_result', 'Your result is pending.')
    local n = 0
    for _ in pairs((MP.state.session and MP.state.session.roster) or {}) do n = n + 1 end
    m.lines[#m.lines + 1] = n > 2 and t.t('k_pvp_pending_death_wait_many', 'The others must beat the same blind.')
      or t.t('k_pvp_pending_death_wait', 'Your Nemesis must beat the same blind.')
    m.lines[#m.lines + 1] = t.t('k_pvp_pending_death_leave', 'Leaving is not a forfeit. The result still counts.')
  else
    m.title = g('localize') and localize('ph_game_over') or 'GAME OVER'
  end
  if m.title == 'ph_you_win' then m.title = 'YOU WIN!' end
  if m.title == 'ph_game_over' then m.title = 'GAME OVER' end
  local place = result.places and me() and result.places[me()]
  if place then m.lines[#m.lines + 1] = t.tv('rmh_mp_place', 'Place #1#', { place }) end
  local bg = ES.BG[kind] or ES.BG.lose
  m.bg, m.bg_alpha = bg[1], bg[2]
  m.nemesis = MP.state.target and t.name_of(MP.state.target) or t.opponent_title()
  m.players = ES.players()
  if kind == 'pending' then
    m.buttons = { 'leave' }
  else
    m.buttons = { 'continue_sp' }
    if ES.private_lobby() then m.buttons[#m.buttons + 1] = 'return_lobby' end
    m.buttons[#m.buttons + 1] = 'leave'
  end
  return m
end

-- ── Building ────────────────────────────────────────────────────────────────

ES.sel = ES.sel or { current_option = 1 }

local function text_row(text, scale, colour)
  return { n = G.UIT.R, config = { align = 'cm', padding = 0.03 }, nodes = {
    { n = G.UIT.T, config = { text = text, scale = scale or 0.4, colour = colour or G.C.WHITE, shadow = true } } } }
end

local function joker_area(id)
  if not (g('CardArea') and g('Card')) then return nil end
  local area = CardArea(0, 0, 5 * G.CARD_W * 0.8, G.CARD_H * 0.8,
    { card_limit = 5, type = 'title', highlight_limit = 0, card_w = G.CARD_W * 0.8 })
  for _, j in ipairs(ES.jokers_of(id)) do
    local center = G.P_CENTERS[j.key]
    if center then
      local c = Card(0, 0, G.CARD_W * 0.8, G.CARD_H * 0.8, nil, center,
        { bypass_discovery_center = true, bypass_discovery_ui = true, discover = false })
      if j.edition and c.set_edition then pcall(c.set_edition, c, { [j.edition] = true }, true, true) end
      c.ability.mp_phantom = true
      area:emplace(c)
    end
  end
  return area
end

local BUTTONS = {
  continue_sp = { 'b_continue_singleplayer', 'Continue in Singleplayer', 'BLUE', 'mp_end_continue' },
  return_lobby = { 'b_return_lobby', 'Return to Lobby', 'GREEN', 'mp_end_return' },
  leave = { 'b_leave_lobby', 'Leave Lobby', 'RED', 'mp_end_leave' },
}

function ES.def(result)
  local t = RU()
  local m = ES.model(result)
  ES.current = m
  local players = m.players
  local names = {}
  for i, id in ipairs(players) do names[i] = t.name_of(id) end
  if ES.sel.current_option > #players then ES.sel.current_option = 1 end
  local sel_id = players[ES.sel.current_option]
  local title = g('DynaText') and DynaText({ string = { m.title }, colours = { G.C.WHITE }, shadow = true, float = true,
    rotate = m.kind == 'win' or m.kind == 'draw', spacing = (m.kind == 'win' or m.kind == 'draw') and 2 or nil,
    scale = 1.2, pop_in = 0.4, maxw = 6.5 })
  local body = {
    { n = G.UIT.R, config = { align = 'cm', padding = 0.05 }, nodes = { { n = G.UIT.O, config = { object = title, id = 'mp_end_title' } } } },
  }
  for _, line in ipairs(m.lines) do body[#body + 1] = text_row(line, 0.38) end
  -- Nemesis row
  body[#body + 1] = { n = G.UIT.R, config = { align = 'cm', padding = 0.08, r = 0.1, colour = darken and darken(G.C.JOKER_GREY or G.C.GREY, 0.1) or G.C.BLACK, minw = 6 }, nodes = {
    { n = G.UIT.C, config = { align = 'cm', minw = 2 }, nodes = { { n = G.UIT.T, config = { text = t.t('rmh_mp_nemesis', 'Nemesis'), scale = 0.4, colour = G.C.WHITE, shadow = true } } } },
    { n = G.UIT.C, config = { align = 'cm', minw = 3.5 }, nodes = { { n = G.UIT.T, config = { text = m.nemesis, scale = 0.45, colour = RU().MULTIPLAYER, shadow = true } } } },
  } }
  if m.kind ~= 'pending' and #players > 0 then
    ES.sel.options = names
    if #players > 1 and g('create_option_cycle') then
      body[#body + 1] = { n = G.UIT.R, config = { align = 'cm' }, nodes = {
        create_option_cycle({ options = names, current_option = ES.sel.current_option, opt_callback = 'mp_end_player',
          w = 4, scale = 0.8, colour = G.C.RED, no_pips = true }) } }
    end
    body[#body + 1] = text_row(ES.caption(sel_id), 0.35)
    local area = joker_area(sel_id)
    if area then body[#body + 1] = { n = G.UIT.R, config = { align = 'cm', id = 'mp_end_jokers' }, nodes = { { n = G.UIT.O, config = { object = area } } } } end
    body[#body + 1] = { n = G.UIT.R, config = { align = 'cm', padding = 0.05 }, nodes = {
      UIBox_button({ id = 'mp_end_view_deck', col = true, label = { t.t('rmh_mp_view_deck', 'View Deck') }, button = 'mp_end_view_deck', colour = G.C.ORANGE, minw = 2.6, minh = 0.6, scale = 0.4 }),
      UIBox_button({ id = 'mp_end_roster', col = true, label = { t.t('rmh_mp_roster', 'Roster') }, button = 'mp_end_roster', colour = RU().MP_PURPLE, minw = 2.6, minh = 0.6, scale = 0.4 }),
    } }
  end
  local btns = {}
  for _, b in ipairs(m.buttons) do
    local spec = BUTTONS[b]
    btns[#btns + 1] = UIBox_button({ id = 'mp_end_' .. b, label = { t.t(spec[1], spec[2]) }, button = spec[4], colour = G.C[spec[3]], minw = 5, minh = 0.7, scale = 0.45 })
  end
  body[#body + 1] = { n = G.UIT.R, config = { align = 'cm', padding = 0.05 }, nodes = { { n = G.UIT.C, config = { align = 'cm' }, nodes = btns } } }
  local bgc = G.C[m.bg] or G.C.RED
  return create_UIBox_generic_options({ no_back = true, bg_colour = { bgc[1], bgc[2], bgc[3], m.bg_alpha }, contents = {
    { n = G.UIT.R, config = { align = 'cm' }, nodes = {
      { n = G.UIT.C, config = { align = 'cm', minw = 2.5, minh = 3 }, nodes = { { n = G.UIT.O, config = { id = 'jimbo_spot', object = g('Moveable') and Moveable(0, 0, 0, 0) or nil } } } },
      { n = G.UIT.C, config = { align = 'cm', padding = 0.05 }, nodes = body },
    } },
  } })
end

local function quip(kind)
  if not (g('Card_Character') and G.E_MANAGER) then return end
  G.E_MANAGER:add_event(Event({ trigger = 'after', delay = 1.5, blocking = false, blockable = false, timer = 'REAL', func = function()
    local spot = G.OVERLAY_MENU and G.OVERLAY_MENU:get_UIE_by_ID('jimbo_spot')
    if not spot then return true end
    pcall(function()
      local jimbo = Card_Character({ x = 0, y = 5 })
      if spot.config.object and spot.config.object.remove then spot.config.object:remove() end
      spot.config.object = jimbo
      jimbo.ui_object_updated = true
      jimbo:add_speech_bubble((kind == 'win' and 'wq_' or 'lq_') .. math.random(1, kind == 'win' and 7 or 10), nil, { quip = true })
      jimbo:say_stuff(5)
    end)
    return true
  end }))
end

function ES.render()
  if not (G.FUNCS and G.FUNCS.overlay_menu) then return false end
  G.SETTINGS.paused = true
  G.FUNCS.overlay_menu({ definition = ES.def(ES.result), config = { no_esc = true } })
  ES.shown = true
  return true
end

function ES.show(result)
  ES.result = result
  ES.sel.current_option = 1
  if MP.is_match() and MP.report and MP.report.send_local_end_data then
    pcall(MP.report.send_local_end_data)
    if MP.state.target then
      MP.peer.send('deck_req', {})
      MP.peer.send('stats_req', {})
    end
  end
  local ok = ES.render()
  if ok and result and result.kind ~= 'pending' then quip(result.kind) end
  return ok
end

MP.ui.show_result = ES.show

-- ── Sub-screens: deck viewer and roster ─────────────────────────────────────

local SUITS = { 'Spades', 'Hearts', 'Clubs', 'Diamonds' }

function ES.parse_deck(s)
  local out = {}
  if type(s) ~= 'string' then return out end
  for part in s:gmatch('[^;]+') do
    local f = {}
    for field in (part .. '-'):gmatch('([^-]*)-') do f[#f + 1] = field end
    if f[1] and f[1] ~= '' and f[2] and f[2] ~= '' then
      out[#out + 1] = { key = 'c_base', front = { suit = f[1], rank = f[2] },
        enhancement = (f[3] ~= '' and f[3]) or nil, edition = (f[4] ~= '' and f[4]) or nil, seal = (f[5] ~= '' and f[5]) or nil }
    end
    if #out >= 300 then break end
  end
  return out
end

function ES.nemesis_deck_string()
  local t = MP.state.target
  local d = MP.state.nemesis_decks and t and MP.state.nemesis_decks[t]
  if d then return d end
  local ed = MP.state.end_data
  return ed and ed.deck and ed.deck.cards or nil
end

ES.deck_tab = ES.deck_tab or 'nemesis'

local function deck_def()
  local t = RU()
  local s = ES.deck_tab == 'nemesis' and ES.nemesis_deck_string()
    or (MP.card and MP.card.deck_string and MP.card.deck_string(G.playing_cards or {})) or ''
  local cards = ES.parse_deck(s or '')
  local rows = {}
  rows[#rows + 1] = { n = G.UIT.R, config = { align = 'cm', padding = 0.05 }, nodes = {
    UIBox_button({ col = true, label = { t.t('k_nemesis_deck', 'Nemesis Deck') }, button = 'mp_end_deck_nemesis', colour = ES.deck_tab == 'nemesis' and G.C.RED or G.C.GREY, minw = 3, minh = 0.6, scale = 0.4 }),
    UIBox_button({ col = true, label = { t.t('k_your_deck', 'Your Deck') }, button = 'mp_end_deck_mine', colour = ES.deck_tab == 'mine' and G.C.RED or G.C.GREY, minw = 3, minh = 0.6, scale = 0.4 }),
  } }
  if #cards == 0 then rows[#rows + 1] = text_row('...', 0.5) end
  for _, suit in ipairs(SUITS) do
    local list = {}
    for _, sc in ipairs(cards) do if sc.front.suit == suit then list[#list + 1] = sc end end
    if #list > 0 and g('CardArea') then
      local area = CardArea(0, 0, 6.5 * G.CARD_W, 0.6 * G.CARD_H,
        { card_limit = #list, type = 'title', view_deck = true, highlight_limit = 0, card_w = G.CARD_W * 0.7, draw_layers = { 'card' } })
      for _, sc in ipairs(list) do
        local c = MP.card.build(sc, area)
        if c then area:emplace(c) end
      end
      rows[#rows + 1] = { n = G.UIT.R, config = { align = 'cm' }, nodes = { { n = G.UIT.O, config = { object = area } } } }
    end
  end
  return create_UIBox_generic_options({ back_func = 'mp_end_back', contents = rows })
end

local function roster_def()
  local t = RU()
  local rows = {}
  for _, id in ipairs(ES.players()) do
    local res = MP.state.player_results and MP.state.player_results[id]
    local deck = res and res.deck_back
    local deck_name = deck and G.P_CENTERS[deck] and g('localize') and localize({ type = 'name_text', key = deck, set = 'Back' }) or (deck or '-')
    local best = res and res.highest_pvp_score or (id == me() and tostring(MP.state.highest_pvp_score or 0)) or '0'
    rows[#rows + 1] = { n = G.UIT.R, config = { align = 'cm', padding = 0.05, r = 0.1, colour = G.C.BLACK, minw = 9 }, nodes = {
      { n = G.UIT.C, config = { align = 'cl', minw = 2.6 }, nodes = { { n = G.UIT.T, config = { text = t.name_of(id), scale = 0.4, colour = G.C.WHITE, shadow = true } } } },
      { n = G.UIT.C, config = { align = 'cl', minw = 2.4 }, nodes = { { n = G.UIT.T, config = { text = tostring(deck_name), scale = 0.33, colour = G.C.UI.TEXT_LIGHT } } } },
      { n = G.UIT.C, config = { align = 'cl', minw = 2.6 }, nodes = { { n = G.UIT.T, config = { text = t.tv('rmh_mp_best_pvp', 'Best PvP score: #1#', { best }), scale = 0.33, colour = G.C.UI.TEXT_LIGHT } } } },
      UIBox_button({ col = true, label = { t.t('rmh_mp_jokers', 'Jokers') }, button = 'mp_end_roster_jokers', ref_table = { id = id }, colour = RU().MP_PURPLE, minw = 1.4, minh = 0.5, scale = 0.35 }),
    } }
  end
  return create_UIBox_generic_options({ back_func = 'mp_end_back', contents = rows })
end

ES.deck_def, ES.roster_def = deck_def, roster_def

function ES.install()
  ES.shown, ES.result, ES.current = false, nil, nil
  ES.sel = { current_option = 1 }
  MP.ui.show_result = ES.show
  local F = G and G.FUNCS
  if not F then return end
  F.mp_end_player = function(args)
    ES.sel.current_option = (args and args.to_key) or 1
    ES.render()
  end
  F.mp_end_back = function() ES.render() end
  F.mp_end_view_deck = function()
    ES.deck_tab = MP.state.target and 'nemesis' or 'mine'
    G.FUNCS.overlay_menu({ definition = deck_def(), config = { no_esc = true } })
  end
  F.mp_end_deck_nemesis = function() ES.deck_tab = 'nemesis'; G.FUNCS.overlay_menu({ definition = deck_def(), config = { no_esc = true } }) end
  F.mp_end_deck_mine = function() ES.deck_tab = 'mine'; G.FUNCS.overlay_menu({ definition = deck_def(), config = { no_esc = true } }) end
  F.mp_end_roster = function() G.FUNCS.overlay_menu({ definition = roster_def(), config = { no_esc = true } }) end
  F.mp_end_roster_jokers = function(e)
    local id = e and e.config and e.config.ref_table and e.config.ref_table.id
    for i, p in ipairs(ES.players()) do if p == id then ES.sel.current_option = i end end
    ES.render()
  end
  F.mp_end_continue = function() ES.continue_sp() end
  F.mp_end_return = function() ES.leave('return_lobby') end
  F.mp_end_leave = function() ES.leave('leave') end
end

local function close()
  if G.OVERLAY_MENU and G.FUNCS.exit_overlay_menu then pcall(G.FUNCS.exit_overlay_menu) end
  G.SETTINGS.paused = false
  ES.shown = false
end

--- Continue in Singleplayer (HUD-14): the core converts the run; we just close the screen.
function ES.continue_sp()
  close()
  if MP.saves and MP.saves.continue_singleplayer then return MP.saves.continue_singleplayer() end
  return false
end

--- Leave ('leave') or go back to the lobby ('return_lobby'), then the Multiplayer menu.
function ES.leave(how)
  if MP.is_match() then MP.net.send('match_left', { how = how }) end
  close()
  if G.FUNCS.go_to_menu then G.FUNCS.go_to_menu() end
  if G.E_MANAGER and MP.open then
    G.E_MANAGER:add_event(Event({ no_delete = true, blockable = false, blocking = false, trigger = 'after', delay = 1.5,
      timer = 'REAL', func = function()
        if not MP.state.session then pcall(MP.open, 'menu') end
        return true
      end }))
  end
  return true
end

return ES
