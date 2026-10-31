-- L2 in-engine (WS10): every out-of-run MP screen is built by the REAL engine (UIBox layout,
-- DynaText, Cards, CardAreas, sprites) from fixture view models, updated and drawn for a few
-- frames, and torn down — no Lua error, no ui error in the MP log, and the expected element ids
-- are found through the engine's own get_UIE_by_ID.
--
-- Needs the MP pack in the page (`?mp=1`); without it every test is skipped. Each test leaves
-- its screen up, so a driver can screenshot it (e.g. cli/scratch drivers run one test per
-- --filter and take --shot).

local has_mp = love.filesystem.getInfo('rmh_mp/init.lua') ~= nil
local IT = has_mp and it or xit

local MP, U
local sent = {}
local real_transport

local function recv(t, d)
  local ok = MP.net.receive(t, d)
  if not ok then error('receive ' .. t .. ' refused') end
end

local function boot()
  -- A lobby left by an earlier run of this file must not hide this run's lobby views.
  local g = rawget(_G, 'MP')
  if g and g.ui and g.ui.model then g.ui.model.left_code = nil end
  if MP then return end
  MP = require('rmh_mp')
  require('rmh_mp.ui.menu')
  U = MP.ui
  -- Capture intents instead of writing them to a mailbox nobody reads in the harness.
  -- (kept on MP.net so a later run of this file, in a fresh spec environment, restores the real one)
  MP.net._ws10_real_transport = MP.net._ws10_real_transport or MP.net.transport
  real_transport = MP.net._ws10_real_transport
  MP.net.transport = { send = function(t, d) sent[#sent + 1] = { t = t, d = d } end, on = function() end }
  if not MP.ui.model.net.account.name or MP.ui.model.net.hub ~= 'connected' then
    recv('net_status', { hub = 'connected', account = { name = 'Engine Tester', avatarUrl = nil } })
  end
end

local function sent_of(t)
  local out = {}
  for _, m in ipairs(sent) do if m.t == t then out[#out + 1] = m.d end end
  return out
end

local function ui_errors()
  local out = {}
  for _, l in ipairs(MP.log_ring) do
    if l.level == 'error' and (l.msg:find('ui', 1, true) or l.msg:find('render', 1, true)) then out[#out + 1] = l.msg end
  end
  return out
end

--- Let the engine lay out, update and draw what is on screen.
local function settle(n) wait_frames(n or 6) end

local function by_id(box, id)
  return box and box.get_UIE_by_ID and box:get_UIE_by_ID(id) or nil
end

local function bar(id) return by_id(G.MAIN_MENU_UI, id) end
local function top(id) return by_id(U.boxes.top, id) end
local function overlay(id) return by_id(G.OVERLAY_MENU, id) end

--- Click a UIE like the engine does.
local function click(e)
  if not e then error('click: no element') end
  local b = e.config.button
  if not b then error('click: element has no button') end
  G.FUNCS[b](e)
end

local function player(i, over)
  local p = { id = 'u_p' .. i, name = 'Player ' .. i, avatarUrl = nil, avatarJoker = 'j_joker', blindCol = ((i - 1) % 25) + 1,
    joinedAt = 1761799900000 + i, ready = i % 2 == 0, connected = true, away = false, catchingUp = false, role = 'player', conn = 'direct' }
  for k, v in pairs(over or {}) do p[k] = v end
  return p
end

local OPTIONS = {
  ruleset = 'ruleset_mp_balanced', gamemode = 'gamemode_mp_attrition', trapCards = false, manhuntHunterLives = 7,
  startingLives = 4, pvpStartRound = 2, timer = true, timerBaseSeconds = 150, timerIncrementSeconds = 60, timerForgiveness = 0,
  pvpCountdownSeconds = 3, deathOnRoundLoss = true, goldOnLifeLoss = true, noGoldOnRoundLoss = false, customSeed = 'random',
  theOrder = true, hideScoreUntilPlayed = false, previewDisabled = false, normalBosses = false, differentSeeds = false, differentDecks = false,
  randomLoadout = false, multiplayerJokers = true, modifierLayers = {}, seatGraceMs = 120000,
}

local AVATARS = { 'j_joker', 'j_greedy_joker', 'j_lusty_joker', 'j_wrathful_joker', 'j_gluttenous_joker', 'j_jolly', 'j_zany' }

local version = 0
local function view(n, over)
  over = over or {}
  version = version + 1
  local players = {}
  for i = 1, n do players[i] = player(i, { avatarJoker = AVATARS[(i - 1) % #AVATARS + 1] }) end
  local opts = {}
  for k, v in pairs(OPTIONS) do opts[k] = v end
  for k, v in pairs(over.options or {}) do opts[k] = v end
  local state = { code = 'ABC234', kind = over.kind or 'private', queueMode = over.queueMode or 'pvp_nemesis',
    hostId = players[1] and players[1].id or 'u_p1', successorId = nil, version = version, open = true, players = players,
    options = opts, deck = 'b_red', stake = 1, mpStake = nil, challenge = nil, started = nil, setup = over.setup or nil,
    kicked = {}, forfeited = {} }
  local me = over.me or state.hostId
  return { state = state, me = me, isHost = me == state.hostId, canStart = over.canStart == true }
end

local function at_menu()
  if G.OVERLAY_MENU then G.FUNCS.exit_overlay_menu() end
  wait_until(function() return G.STAGE == G.STAGES.MAIN_MENU and G.MAIN_MENU_UI ~= nil end, 30, 'main menu')
end

describe('ui (in engine)', function()
  if has_mp then before_each(boot) end
  IT('loads the UI on top of the MP pack and opens the PvP menu', function()
    at_menu()
    boot()
    expect(type(MP.ui.open)).eq('function')
    recv('net_status', { hub = 'connected', account = { name = 'Engine Tester', avatarUrl = nil } })
    MP.open('menu')
    settle()
    expect(U.rendered).eq('pvp')
    for _, id in ipairs({ 'mp_find_game', 'mp_practice', 'mp_replays', 'mp_join_code', 'mp_join_clipboard', 'mp_create_lobby' }) do
      expect(bar(id) ~= nil).truthy()
    end
    expect(by_id(U.boxes.panel, 'mp_account') ~= nil).truthy()
    expect(ui_errors()).eq({})
  end)

  IT('pvp menu while searching', function()
    at_menu()
    if U.screen ~= 'pvp' then MP.open('menu') end
    recv('queue_view', { state = 'searching', queueMode = 'pvp_teams', waiting = 3 })
    settle()
    expect(bar('mp_queue_status') ~= nil).truthy()
    recv('queue_view', { state = 'idle', queueMode = 'pvp_teams' })
    settle()
    expect(ui_errors()).eq({})
  end)

  IT('create pillars', function()
    at_menu()
    U.go('pvp')
    settle()
    click(bar('mp_create_lobby'))
    settle()
    expect(top('mp_create_pvp_nemesis') ~= nil).truthy()
    expect(top('mp_create_party') ~= nil).truthy()
    expect(ui_errors()).eq({})
  end)

  IT('find game pillars', function()
    U.go('find')
    settle()
    expect(top('mp_find_pvp_smallworld') ~= nil).truthy()
    expect(top('mp_find_pvp_teams') ~= nil).truthy()
    expect(top('mp_find_pvp_manhunt')).eq(nil)   -- the mod's casual set has no Manhunt (N1)
    expect(ui_errors()).eq({})
  end)

  IT('find game live counts: polled while open, drawn in place (A12)', function()
    at_menu()
    U.go('find')
    settle()
    expect(#sent_of('ui_queue_counts') >= 1).truthy()
    expect(top('mp_find_pvp_royale_queued') ~= nil).truthy()
    expect(top('mp_find_pvp_royale_ingame') ~= nil).truthy()
    recv('queue_counts', { counts = { { queueMode = 'pvp_royale', queued = 4, inGame = 11 } } })
    settle()
    local q = top('mp_find_pvp_royale_queued')
    expect(q.config.ref_table[q.config.ref_value]).eq('4')
    expect(ui_errors()).eq({})
  end)

  IT('Uses The Order opens the explainer; tabs and pages switch (A13)', function()
    U.go('find')
    settle()
    click(top('mp_find_pvp_nemesis_order'))
    settle()
    expect(overlay('mp_order_title') ~= nil).truthy()
    expect(overlay('mp_order_pages') ~= nil).truthy()
    click(overlay('mp_order_tab_3'))
    settle()
    expect(U.order_info.st.tab).eq(3)
    G.FUNCS.rmh_mp_order_page({ to_key = 5 })   -- Jokers: cards in a CardArea
    settle(8)
    expect(overlay('mp_order_tab_9') ~= nil).truthy()
    G.FUNCS.rmh_mp_order_page({ to_key = 1 })   -- Skip Tags: tags
    settle(8)
    expect(ui_errors()).eq({})
  end)

  IT('credits overlay from the Multiplayer panel; links open their fixed URLs (B08)', function()
    at_menu()
    U.go('pvp')
    settle()
    local real = love.system.openURL
    local opened = {}
    love.system.openURL = function(url) opened[#opened + 1] = url end
    click(by_id(U.boxes.panel, 'mp_credits'))
    settle()
    expect(overlay('mp_credits_list') ~= nil).truthy()
    click(overlay('mp_credits_github'))
    click(overlay('mp_credits_discord'))
    love.system.openURL = real
    expect(opened).eq({ U.credits.LINKS.github, U.credits.LINKS.discord })
    expect(ui_errors()).eq({})
  end)

  IT('a credited MP card tooltip carries the MULTIPLAYER badge (B09)', function()
    at_menu()
    -- the MP collection's own card builder (MP centers live in the registry outside a session)
    local proto = MP.registry.proto('j_mp_taxes')
    local ok, c = U.collection.build_card(proto, G.CARD_W, G.CARD_H)
    expect(ok and c ~= nil).truthy()
    c:hover()
    settle(2)
    local found
    local function walk(n, d)
      if type(n) ~= 'table' or d > 40 or found then return end
      local o = n.config and n.config.object
      local s = o and o.config and o.config.string
      if type(s) == 'table' and s[1] == 'MULTIPLAYER' then found = s end
      for _, ch in ipairs(n.nodes or {}) do walk(ch, d + 1) end
    end
    walk(c.config.h_popup, 0)
    c:stop_hover()
    c:remove()
    expect(found ~= nil).truthy()
    expect(found[2]).eq('Art: DottyKitty')
    expect(ui_errors()).eq({})
  end)

  IT('PvP menu TAB shortcuts out of a lobby: V / J / C (A16)', function()
    at_menu()
    U.go('pvp')
    settle()
    expect(U.shortcuts.open()).truthy()
    settle()
    expect(overlay('mp_sc_v') ~= nil).truthy()
    expect(overlay('mp_sc_j') ~= nil).truthy()
    expect(overlay('mp_sc_c') ~= nil).truthy()
    expect(U.shortcuts.press('j')).truthy()
    settle()
    expect(overlay('mp_join_submit') ~= nil).truthy()
    expect(ui_errors()).eq({})
  end)

  IT('queue guard on a vanilla New Run while searching; Stay Queued keeps the search (A18)', function()
    at_menu()
    U.go('pvp')
    recv('queue_view', { state = 'searching', queueMode = 'pvp_nemesis', waiting = 1 })
    settle()
    G.FUNCS.start_run(nil, { stake = 1 })
    settle()
    expect(G.STAGE).eq(G.STAGES.MAIN_MENU)
    expect(overlay('mp_qguard_leave_play') ~= nil).truthy()
    click(overlay('overlay_menu_back_button'))
    settle()
    expect(G.OVERLAY_MENU).eq(nil)
    expect(U.model.queue.state).eq('searching')
    G.FUNCS.start_run(nil, { stake = 1 })
    settle()
    click(overlay('mp_qguard_leave'))
    settle()
    expect(sent_of('ui_queue')[#sent_of('ui_queue')].op).eq('leave')
    expect(G.STAGE).eq(G.STAGES.MAIN_MENU)
    recv('queue_view', { state = 'idle', queueMode = 'pvp_nemesis' })
    expect(ui_errors()).eq({})
  end)

  IT('practice pillars and the practice run setup', function()
    U.go('practice')
    settle()
    expect(top('mp_practice_ruleset_mp_balanced') ~= nil).truthy()
    expect(top('mp_practice_extra_pillar') ~= nil).truthy()
    click(top('mp_practice_ruleset_mp_vanilla'))
    settle()
    expect(overlay('mp_rs_select') ~= nil).truthy()
    expect(ui_errors()).eq({})
  end)

  IT('join by code overlay', function()
    at_menu()
    U.go('pvp')
    settle()
    click(bar('mp_join_code'))
    settle()
    expect(overlay('mp_join_submit') ~= nil).truthy()
    expect(ui_errors()).eq({})
  end)

  IT('lobby host with two players', function()
    at_menu()
    recv('lobby_view', view(2))
    settle(10)
    expect(U.rendered).eq('lobby')
    expect(bar('mp_start') ~= nil).truthy()
    expect(bar('mp_deck_box') ~= nil).truthy()
    expect(top('mp_player_u_p2') ~= nil).truthy()
    -- the title card and logo give way to the roster; the profile button to the bar
    if G.SPLASH_LOGO then expect(G.SPLASH_LOGO.states.visible).eq(false) end
    if G.PROFILE_BUTTON then expect(G.PROFILE_BUTTON.states.visible).eq(false) end
    expect(ui_errors()).eq({})
  end)

  IT('lobby member view', function()
    recv('lobby_view', view(3, { me = 'u_p2', canStart = false }))
    settle(10)
    expect(bar('mp_ready') ~= nil).truthy()
    expect(ui_errors()).eq({})
  end)

  IT('lobby with 16 players', function()
    recv('lobby_view', view(16, { canStart = true }))
    settle(12)
    expect(top('mp_player_u_p16') ~= nil).truthy()
    expect(top('mp_roster_pages')).eq(nil)
    expect(ui_errors()).eq({})
  end)

  IT('lobby with 20 players pages', function()
    recv('lobby_view', view(20))
    settle(12)
    expect(top('mp_roster_pages') ~= nil).truthy()
    expect(ui_errors()).eq({})
  end)

  IT('empty roster', function()
    recv('lobby_view', view(0))
    settle()
    expect(top('mp_roster_empty') ~= nil).truthy()
    expect(ui_errors()).eq({})
  end)

  IT('player overlay and kick confirm', function()
    recv('lobby_view', view(2))
    settle()
    U.lobby.player_overlay('u_p2')
    settle()
    expect(overlay('mp_player_kick') ~= nil).truthy()
    click(overlay('mp_player_kick'))
    settle()
    expect(overlay('mp_confirm_yes') ~= nil).truthy()
    expect(ui_errors()).eq({})
  end)

  IT('lobby options: general (extra ruleset), advanced, modifiers, manhunt', function()
    at_menu()
    recv('lobby_view', view(3, { options = { ruleset = 'ruleset_mp_majorleague' } }))
    settle()
    for _, tab in ipairs({ 'general', 'advanced', 'modifiers' }) do
      U.lobby_options.st.tab = tab
      U.lobby_options.open()
      settle()
      expect(G.OVERLAY_MENU ~= nil).truthy()
    end
    expect(overlay('mp_layer_glass_cannon') ~= nil).truthy()
    U.lobby_options.st.tab = 'general'
    recv('lobby_view', view(3, { queueMode = 'pvp_manhunt', options = { ruleset = 'ruleset_mp_chaos' } }))
    U.lobby_options.open()
    settle()
    expect(overlay('mp_opt_extra_ruleset') ~= nil).truthy()
    expect(overlay('mp_opt_role') ~= nil).truthy()
    expect(ui_errors()).eq({})
  end)

  IT('host run setup with the challenges tab', function()
    at_menu()
    U.run_setup.open('lobby')
    settle()
    expect(overlay('mp_rs_deck') ~= nil).truthy()
    U.run_setup.open('lobby', { tab = 'challenges' })
    settle()
    expect(overlay('mp_rs_challenge') ~= nil).truthy()
    expect(ui_errors()).eq({})
  end)

  IT('party lobby', function()
    at_menu()
    recv('lobby_view', view(3, { kind = 'party', canStart = true }))
    settle()
    expect(bar('mp_party_find') ~= nil).truthy()
    recv('queue_view', { state = 'searching', queueMode = 'pvp_nemesis', waiting = 4 })
    settle()
    expect(bar('mp_party_status') ~= nil).truthy()
    recv('queue_view', { state = 'idle', queueMode = 'pvp_nemesis' })
    expect(ui_errors()).eq({})
  end)

  IT('casual lobby ruleset vote', function()
    recv('lobby_view', view(2, { kind = 'casual' }))
    recv('setup_view', { stepId = 'e1', kind = 'ruleset_vote', phase = 'voting', msLeft = 15000,
      options = { { id = 'ruleset_mp_vanilla' }, { id = 'ruleset_mp_majorleague' }, { id = 'ruleset_mp_balanced' }, { id = 'ruleset_mp_expanded' } },
      voted = 0, voters = 2, result = nil, draft = nil })
    settle()
    expect(bar('mp_vote_confirm') ~= nil).truthy()
    click(bar('mp_vote_ruleset_mp_balanced'))
    settle()
    click(bar('mp_vote_confirm'))
    settle()
    expect(sent_of('ui_vote')[1].option).eq('ruleset_mp_balanced')
    expect(ui_errors()).eq({})
  end)

  IT('casual lobby vote rolling and reveal', function()
    recv('lobby_view', view(2, { kind = 'casual' }))
    recv('setup_view', { stepId = 'e1', kind = 'ruleset_vote', phase = 'rolling', msLeft = 1200,
      options = { { id = 'ruleset_mp_vanilla' }, { id = 'ruleset_mp_balanced' } }, voted = 2, voters = 2,
      result = 'ruleset_mp_balanced', draft = nil })
    settle(30)
    recv('setup_view', { stepId = 'e1', kind = 'ruleset_vote', phase = 'reveal', msLeft = 3000,
      options = { { id = 'ruleset_mp_vanilla', count = 1, chance = 0.5 }, { id = 'ruleset_mp_balanced', count = 1, chance = 0.5 } },
      voted = 2, voters = 2, result = 'ruleset_mp_balanced', draft = nil })
    settle()
    expect(ui_errors()).eq({})
  end)

  IT('casual lobby draft', function()
    recv('lobby_view', view(2, { kind = 'casual' }))
    local tiles = {}
    local decks = { 'b_red', 'b_blue', 'b_yellow', 'b_green', 'b_black', 'b_magic', 'b_nebula', 'b_ghost', 'b_abandoned' }
    for i, d in ipairs(decks) do tiles[i] = { deck = d, stake = (i % 8) + 1, state = i == 2 and 'banned' or 'open' } end
    recv('setup_view', { stepId = 'e3', kind = 'draft', phase = 'voting', msLeft = 30000, options = {}, voted = 0, voters = 2,
      result = nil, draft = { tiles = tiles, actor = 'u_p1', action = 'ban', remaining = 1 } })
    settle()
    expect(bar('mp_draft_9') ~= nil).truthy()
    click(bar('mp_draft_3'))
    settle()
    click(bar('mp_draft_confirm'))
    settle()
    expect(sent_of('ui_draft')[1].key).eq('b_yellow')
    expect(ui_errors()).eq({})
  end)

  IT('chat console with input', function()
    recv('chat_line', { from = 'u_p2', name = 'Player 2', text = 'good luck!', kind = 'in' })
    recv('chat_line', { from = 'u_p1', name = 'Player 1', text = 'you too', kind = 'own' })
    recv('vote_progress', { kind = 'draw', k = 1, n = 2 })
    settle()
    U.chat.open()
    settle()
    expect(U.chat.box ~= nil).truthy()
    expect(ui_errors()).eq({})
  end)

  IT('shortcuts overlay', function()
    U.chat.close()
    recv('lobby_view', view(2))
    settle()
    expect(U.shortcuts.open()).truthy()
    settle()
    expect(overlay('mp_sc_c') ~= nil).truthy()
    U.shortcuts.close()
    expect(ui_errors()).eq({})
  end)

  IT('settings with avatars', function()
    at_menu()
    recv('history', { wins = 12, losses = 3, games = 15, pvpGames = 15, streak = 4, days = 3 })
    U.settings.open()
    settle(10)
    expect(overlay('mp_avatar_grid') ~= nil).truthy()
    expect(overlay('mp_set_blind_col') ~= nil).truthy()
    expect(ui_errors()).eq({})
  end)

  IT('collection, every tab', function()
    at_menu()
    for _, t in ipairs(U.collection.TABS) do
      U.collection.open(t.id)
      settle(4)
      expect(G.OVERLAY_MENU ~= nil).truthy()
    end
    expect(MP.registry.mounted()).falsy()
    expect(G.P_CENTERS.j_mp_pacifist).eq(nil)
    expect(ui_errors()).eq({})
  end)

  IT('notices: version mismatch, seat held, reconnect, kicked', function()
    at_menu()
    for _, code in ipairs({ 'version-mismatch', 'seat-held:ABC234', 'kicked' }) do
      recv('lobby_error', { code = code })
      settle(4)
      expect(G.OVERLAY_MENU ~= nil).truthy()
    end
    MP.open('rejoin')
    settle(4)
    expect(overlay('mp_notice_1') ~= nil).truthy()
    recv('lobby_error', { code = 'clipboard-empty' })
    settle(4)
    expect(ui_errors()).eq({})
  end)

  IT('leaves cleanly: back to the vanilla menu, which still starts a run', function()
    at_menu()
    U.leave_lobby()
    U.close()
    settle()
    expect(G.MAIN_MENU_UI:get_UIE_by_ID('main_menu_play') ~= nil).truthy()
    if G.SPLASH_LOGO then expect(G.SPLASH_LOGO.states.visible).eq(true) end
    if G.PROFILE_BUTTON then expect(G.PROFILE_BUTTON.states.visible).eq(true) end
    expect(U.boxes.panel).eq(nil)
    if real_transport then MP.net.transport = real_transport; MP.net._ws10_real_transport = nil end
    expect(ui_errors()).eq({})
  end)
end)
