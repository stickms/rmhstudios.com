-- WS10 L1: the lobby screen, Lobby Options, run setup, Setup votes and the Draft — view model ->
-- UI tree, and every intent the screens send (spec/mp_ui_helper.lua: real base-game builders).

local UH = require 'spec.mp_ui_helper'

local MP, G, U

local function boot()
  MP, G = UH.boot()
  U = MP.ui
  UH.recv('net_status', { hub = 'connected', account = { name = 'Alice', avatarUrl = nil } })
  MP.open('menu')
  UH.clear_sent()
end

local function show(view)
  expect(UH.recv('lobby_view', view)).truthy()
  UH.frame()
  return G.MAIN_MENU_UI.definition, U.boxes.top and U.boxes.top.definition
end

describe('ui lobby: screen from lobby_view', function()
  before_each(boot)
  after_each(UH.teardown)

  it('a lobby_view switches to the lobby screen; the fixture validates', function()
    local bar, top = show(UH.view())
    expect(U.screen).eq('lobby')
    expect(MP.state.lobby.state.code).eq('ABC234')
    expect(UH.find(top, 'mp_player_u_alice') ~= nil).truthy()
    expect(UH.find(top, 'mp_player_u_bob') ~= nil).truthy()
    expect(UH.find(bar, 'mp_lobby_bar') ~= nil).truthy()
  end)

  it('private host: START (disabled until canStart), OPTIONS, deck box, code panel, INVITE, LEAVE', function()
    local bar = show(UH.view())
    for _, id in ipairs({ 'mp_start', 'mp_lobby_options', 'mp_deck_box', 'mp_view_code', 'mp_copy_code', 'mp_invite', 'mp_leave_lobby' }) do
      expect(UH.find(bar, id) ~= nil).truthy()
    end
    expect(UH.find(bar, 'mp_ready')).eq(nil)
    expect(UH.enabled(bar, 'mp_start')).falsy()
    expect(UH.has_text(bar, 'GUEST TO READY UP')).truthy()
    expect(UH.enabled(bar, 'mp_deck_box')).truthy()
    bar = show(UH.view({ canStart = true }))
    expect(UH.enabled(bar, 'mp_start')).truthy()
    UH.click(bar, 'mp_start')
    expect(#UH.sent('ui_start')).eq(1)
  end)

  it('host alone: WAITING FOR PLAYERS and the block reason', function()
    local bar = show(UH.view({ players = 1, startBlockReason = 'need-players' }))
    expect(UH.has_text(bar, 'PLAYERS')).truthy()
    expect(UH.has_text(bar, 'need-players')).truthy()
    expect(UH.enabled(bar, 'mp_start')).falsy()
  end)

  it('private member: READY toggles (green -> orange UNREADY), deck box is display only', function()
    local view = UH.view({ me = 'u_alice', isHost = false })
    view.state.hostId = 'u_bob'
    local bar = show(view)
    expect(UH.find(bar, 'mp_start')).eq(nil)
    expect(UH.has_text(bar, 'READY')).truthy()
    expect(UH.enabled(bar, 'mp_deck_box')).falsy()
    UH.click(bar, 'mp_ready')
    expect(UH.sent('ui_ready')[1].d).eq({ ready = true })
    view.state.players[1].ready = true
    view.state.version = 4
    bar = show(view)
    expect(UH.has_text(bar, 'UNREADY')).truthy()
    UH.clear_sent()
    UH.click(bar, 'mp_ready')
    expect(UH.sent('ui_ready')[1].d).eq({ ready = false })
  end)

  it('code panel: VIEW CODE shows the code, COPY CODE sends ui_copy_code and flashes COPIED!', function()
    local bar = show(UH.view())
    expect(UH.has_text(bar, 'ABC234')).falsy()
    UH.click(bar, 'mp_view_code'); UH.frame()
    bar = G.MAIN_MENU_UI.definition
    expect(UH.has_text(bar, 'ABC234')).truthy()
    UH.click(bar, 'mp_copy_code'); UH.frame()
    expect(#UH.sent('ui_copy_code')).eq(1)
    expect(UH.has_text(G.MAIN_MENU_UI.definition, 'COPIED!')).truthy()
    UH.click(G.MAIN_MENU_UI.definition, 'mp_invite')
    expect(#UH.sent('ui_invite')).eq(1)
  end)

  it('LEAVE asks first; Yes sends ui_leave and returns to the PvP menu', function()
    local bar = show(UH.view())
    UH.click(bar, 'mp_leave_lobby')
    local def, name = UH.overlay()
    expect(name).eq('confirm_leave')
    expect(#UH.sent('ui_leave')).eq(0)
    UH.click(def, 'mp_confirm_yes')
    expect(#UH.sent('ui_leave')).eq(1)
    expect(U.screen).eq('pvp')
    expect(U.model.lobby).eq(nil)
    expect(MP.state.lobby).eq(nil)
    -- a late lobby_view for the lobby we left does not pull us back
    show(UH.view())
    expect(U.screen).eq('pvp')
  end)

  it('an empty roster says Waiting for players', function()
    local _, top = show(UH.view({ players = {} }))
    expect(UH.find(top, 'mp_roster_empty') ~= nil).truthy()
  end)

  it('16 players fit one page (4 x 4); 20 players page with a cycler', function()
    local _, top = show(UH.view({ players = 16 }))
    expect(#UH.find_all(top, function(n) return n.config and type(n.config.id) == 'string' and n.config.id:find('^mp_player_') end)).eq(16)
    expect(UH.find(top, 'mp_roster_pages')).eq(nil)
    expect(#UH.cards).eq(16)
    local view = UH.view({ players = 20 })
    _, top = show(view)
    expect(UH.find(top, 'mp_roster_pages') ~= nil).truthy()
    expect(UH.has_text(top, 'Page 1/2')).truthy()
    UH.cycle(top, 'mp_roster_pages', 2)
    UH.frame()
    top = U.boxes.top.definition
    expect(#UH.find_all(top, function(n) return n.config and type(n.config.id) == 'string' and n.config.id:find('^mp_player_') end)).eq(4)
  end)

  it('spectators are counted, not dealt a card', function()
    local view = UH.view({ players = 3 })
    view.state.players[3].role = 'spectator'
    local _, top = show(view)
    expect(UH.find(top, 'mp_player_u_p3')).eq(nil)
    expect(UH.has_text(top, '2 players  1 spectators')).truthy()
  end)

  it('player cards show the avatar joker; hover gives the tooltip with badges', function()
    local view = UH.view()
    view.state.players[2].avatarJoker = 'j_greedy_joker'
    show(view)
    local bob
    for _, c in ipairs(UH.cards) do if c.mp_player and c.mp_player.id == 'u_bob' then bob = c end end
    expect(bob.center.name).eq('Greedy Joker')
    bob:hover()
    local tip = bob.config.h_popup
    expect(UH.has_text(tip, 'Bob')).truthy()
    expect(UH.has_text(tip, 'Player')).truthy()
    expect(UH.has_text(tip, 'Ready')).truthy()
    expect(UH.has_text(tip, 'Direct')).truthy()
  end)

  it('clicking another player opens Actions; the host can kick (confirmed) and mute', function()
    show(UH.view())
    local bob
    for _, c in ipairs(UH.cards) do if c.mp_player and c.mp_player.id == 'u_bob' then bob = c end end
    bob:click()
    local def, name = UH.overlay()
    expect(name).eq('player')
    UH.click(def, 'mp_player_mute')
    expect(UH.sent('ui_mute')[1].d).eq({ userId = 'u_bob', on = true })
    expect(U.model.muted.u_bob).eq(true)
    def = UH.overlay()
    expect(UH.has_text(def, 'Unmute Player')).truthy()
    UH.click(def, 'mp_player_kick')
    def, name = UH.overlay()
    expect(name).eq('confirm_kick')
    UH.click(def, 'mp_confirm_yes')
    expect(UH.sent('ui_kick')[1].d).eq({ userId = 'u_bob' })
  end)

  it('a member sees no Kick; clicking yourself opens nothing', function()
    local view = UH.view({ me = 'u_bob', isHost = false })
    show(view)
    local alice, bob
    for _, c in ipairs(UH.cards) do
      if c.mp_player.id == 'u_alice' then alice = c elseif c.mp_player.id == 'u_bob' then bob = c end
    end
    bob:click()
    expect(UH.overlay()).eq(nil)
    alice:click()
    expect(UH.find((UH.overlay()), 'mp_player_kick')).eq(nil)
  end)

  it('the player overlay closes when that player leaves', function()
    local view = UH.view()
    show(view)
    U.lobby.player_overlay('u_bob')
    table.remove(view.state.players, 2)
    view.state.version = 9
    show(view)
    expect(G.OVERLAY_MENU).eq(nil)
  end)
end)

describe('ui lobby: a hidden tab shows as away in the waiting room (NET-09)', function()
  before_each(boot)
  after_each(UH.teardown)

  local function card_player(top, id)
    local node = UH.find(top, 'mp_player_' .. id)
    local area
    UH.walk(node, function(n)
      local o = n.config and n.config.object
      if type(o) == 'table' and o.cards then area = o end
    end)
    return area and area.cards[1] and area.cards[1].mp_player
  end

  it('a display-only away (no graceMsLeft) marks the row, the tooltip and the Info tab; state.away stays false', function()
    local view = UH.view()
    local _, top = show(view)
    local L = U.lobby
    expect(card_player(top, 'u_bob').away).falsy()
    expect(UH.recv('presence', { id = 'u_bob', status = 'away' })).truthy()
    UH.frame()
    top = U.boxes.top and U.boxes.top.definition
    expect(card_player(top, 'u_bob').away).eq(true)
    expect(card_player(top, 'u_alice').away).falsy()
    expect(L.find_player(MP.state.lobby, 'u_bob').away).falsy() -- the lobby state is not touched
    local W = require 'rmh_mp.ui.widgets'
    expect(UH.has_text(W.player_tooltip(card_player(top, 'u_bob'), {}), 'Away')).truthy()
    -- The Info tab of the per-player overlay (vanilla create_tabs keeps each tab in a ref_table).
    local c = L.player_overlay_contents(U.model, 'u_bob')
    local found = false
    UH.walk({ nodes = c }, function(n)
      local t = n.config and n.config.ref_table
      if type(t) == 'table' and t.tab_definition_function and UH.has_text(t.tab_definition_function(), 'Away') then
        found = true
      end
    end)
    expect(found).eq(true)
  end)

  it('back, a graced away and leaving clear it; a later lobby never inherits it', function()
    local view = UH.view()
    show(view)
    local L = U.lobby
    UH.recv('presence', { id = 'u_bob', status = 'away' })
    expect(L.hidden_away(U.model.lobby, 'u_bob')).eq(true)
    UH.recv('presence', { id = 'u_bob', status = 'back' })
    expect(L.hidden_away(U.model.lobby, 'u_bob')).eq(false)
    UH.recv('presence', { id = 'u_bob', status = 'away' })
    UH.recv('presence', { id = 'u_bob', status = 'away', graceMsLeft = 120000 })
    expect(L.hidden_away(U.model.lobby, 'u_bob')).eq(false) -- the link away shows through state.away
    UH.recv('presence', { id = 'u_bob', status = 'away' })
    UH.recv('presence', { id = 'u_bob', status = 'left' })
    expect(L.hidden_away(U.model.lobby, 'u_bob')).eq(false)
    -- Heard in lobby ABC234, then the player moves to another lobby: not shown there.
    UH.recv('presence', { id = 'u_bob', status = 'away' })
    local other = UH.view()
    other.state.code = 'XYZ789'
    show(other)
    expect(L.hidden_away(U.model.lobby, 'u_bob')).eq(false)
    expect(L.display_player(U.model.lobby, L.find_player(U.model.lobby, 'u_bob')).away).falsy()
  end)

  it('a player already away by link keeps its own row object', function()
    local view = UH.view()
    view.state.players[2].away = true
    show(view)
    UH.recv('presence', { id = view.state.players[2].id, status = 'away' })
    local p = U.lobby.find_player(U.model.lobby, view.state.players[2].id)
    expect(U.lobby.display_player(U.model.lobby, p) == p).eq(true)
  end)
end)

describe('ui lobby: party and casual', function()
  before_each(boot)
  after_each(UH.teardown)

  it('party host: FIND GAME with a mode cycle sends ui_party_queue; searching shows status + Cancel', function()
    local bar = show(UH.view({ state = { kind = 'party' }, canStart = true }))
    expect(UH.enabled(bar, 'mp_party_find')).truthy()
    -- The mod's casual modes: Nemesis, Battle Royale, Teams, Small World (no Manhunt, N1).
    local cyc = UH.find(bar, 'mp_party_mode')
    expect(UH.has_text(bar, 'Manhunt')).falsy()
    UH.cycle(bar, 'mp_party_mode', 3)
    UH.click(bar, 'mp_party_find')
    expect(UH.sent('ui_party_queue')[1].d).eq({ queueMode = 'pvp_teams' })
    UH.recv('queue_view', { state = 'searching', queueMode = 'pvp_teams', waiting = 5 }); UH.frame()
    bar = G.MAIN_MENU_UI.definition
    expect(UH.find(bar, 'mp_party_status') ~= nil).truthy()
    UH.click(bar, 'mp_party_cancel')
    expect(UH.sent('ui_queue')[1].d).eq({ op = 'leave', queueMode = 'pvp_teams' })
    expect(cyc ~= nil).truthy()
  end)

  it('party member: READY and the hint, no FIND GAME', function()
    local bar = show(UH.view({ state = { kind = 'party' }, me = 'u_bob', isHost = false }))
    expect(UH.find(bar, 'mp_ready') ~= nil).truthy()
    expect(UH.find(bar, 'mp_party_find')).eq(nil)
    expect(UH.has_text(bar, 'The host can queue')).truthy()
  end)

  it('casual: one status panel and LEAVE; auto-ready is re-sent at most 6 times', function()
    local view = UH.view({ state = { kind = 'casual' }, me = 'u_alice' })
    local bar = show(view)
    expect(UH.find(bar, 'mp_setup_panel') ~= nil).truthy()
    expect(UH.find(bar, 'mp_setup_waiting') ~= nil).truthy()
    expect(UH.find(bar, 'mp_start')).eq(nil)
    expect(UH.find(bar, 'mp_copy_code')).eq(nil)
    for _ = 1, 20 do G.TIMERS.REAL = G.TIMERS.REAL + 1.3; UH.frame() end
    expect(#UH.sent('ui_ready')).eq(6)
    UH.clear_sent()
    view.state.players[1].ready = true
    show(view)
    for _ = 1, 3 do G.TIMERS.REAL = G.TIMERS.REAL + 1.3; UH.frame() end
    expect(#UH.sent('ui_ready')).eq(0)
  end)
end)

describe('ui lobby: setup votes and draft', function()
  before_each(function()
    boot()
    show(UH.view({ state = { kind = 'casual' }, me = 'u_alice' }))
    U.lobby.ui.auto_ready = { sent = 6, at = 0 }
    UH.clear_sent()
  end)
  after_each(UH.teardown)

  local function vote(over)
    local v = UH.fixture('setupView')
    for k, x in pairs(over or {}) do v[k] = x end
    expect(UH.recv('setup_view', v)).truthy()
    UH.frame()
    return G.MAIN_MENU_UI.definition, v
  end

  it('voting: pick, Confirm Vote -> ui_vote; then "Vote sent" and the Your vote tag', function()
    local bar = vote()
    expect(UH.has_text(bar, 'Vote: Ruleset')).truthy()
    expect(UH.has_text(bar, 'Your turn: vote')).truthy()
    expect(UH.has_text(bar, '1/2')).truthy()
    expect(UH.enabled(bar, 'mp_vote_confirm')).falsy()
    UH.click(bar, 'mp_vote_ruleset_mp_balanced'); UH.frame()
    bar = G.MAIN_MENU_UI.definition
    expect(UH.enabled(bar, 'mp_vote_confirm')).truthy()
    UH.click(bar, 'mp_vote_confirm'); UH.frame()
    expect(UH.sent('ui_vote')[1].d).eq({ stepId = 's1', option = 'ruleset_mp_balanced' })
    bar = G.MAIN_MENU_UI.definition
    expect(UH.has_text(bar, 'Vote sent')).truthy()
    expect(UH.has_text(bar, 'Your vote')).truthy()
    expect(UH.enabled(bar, 'mp_vote_ruleset_mp_vanilla')).falsy()
    expect(U.setup.confirm()).falsy() -- once per step
  end)

  it('Random is a vote option', function()
    local bar = vote()
    UH.click(bar, 'mp_vote_random')
    U.setup.confirm()
    expect(UH.sent('ui_vote')[1].d.option).eq('random')
  end)

  it('trap vote labels; reveal shows counts and chances with the result lit', function()
    local bar = vote({ stepId = 's2', kind = 'trap_vote', phase = 'reveal', result = 'traps_on',
      options = { { id = 'traps_on', count = 2, chance = 0.6667 }, { id = 'traps_off', count = 1, chance = 0.3333 } } })
    expect(UH.has_text(bar, 'Vote: Trap Cards')).truthy()
    expect(UH.has_text(bar, 'Traps On  2 (67%)')).truthy()
    expect(UH.has_text(bar, 'Traps Off  1 (33%)')).truthy()
    expect(UH.enabled(bar, 'mp_vote_traps_on')).falsy()
  end)

  it('rolling lights options at 12 Hz and lands on the result after 1.2 s', function()
    local _, v = vote({ phase = 'rolling', result = 'ruleset_mp_vanilla' })
    local seen = {}
    for _ = 1, 10 do G.TIMERS.REAL = G.TIMERS.REAL + 1 / 12; seen[U.setup.rolling_index(v)] = true end
    expect(seen[1] and seen[2]).truthy()
    G.TIMERS.REAL = G.TIMERS.REAL + 2
    expect(U.setup.rolling_index(v)).eq(1)
  end)

  it('a new step forgets the last selection; the clock counts down', function()
    local bar = vote()
    UH.click(bar, 'mp_vote_random'); U.setup.confirm()
    vote({ stepId = 's2', kind = 'trap_vote', options = { { id = 'traps_on' }, { id = 'traps_off' } } })
    expect(U.setup.sel.sent).eq(nil)
    expect(U.setup.clock.text).eq('Time left: 15s')
    G.TIMERS.REAL = G.TIMERS.REAL + 5.5; UH.frame()
    expect(U.setup.clock.text).eq('Time left: 10s')
    G.TIMERS.REAL = G.TIMERS.REAL + 100; UH.frame()
    expect(U.setup.clock.text).eq('Time left: 0s')
  end)

  it('draft on my turn: banned tiles are inert; pick + Confirm Ban -> ui_draft; the next ban re-opens', function()
    local d = UH.fixture('setupDraft')
    d.draft.actor = 'u_alice'
    UH.recv('setup_view', d); UH.frame()
    local bar = G.MAIN_MENU_UI.definition
    expect(UH.has_text(bar, 'Your turn: ban a deck')).truthy()
    expect(UH.has_text(bar, 'BANNED')).truthy()
    expect(UH.enabled(bar, 'mp_draft_2')).falsy()
    expect(UH.enabled(bar, 'mp_draft_confirm')).falsy()
    UH.click(bar, 'mp_draft_3'); UH.frame()
    UH.click(G.MAIN_MENU_UI.definition, 'mp_draft_confirm')
    expect(UH.sent('ui_draft')[1].d).eq({ stepId = 's3', key = 'b_mp_violet' })
    expect(U.setup.draft_confirm()).falsy()
    d = UH.fixture('setupDraft')
    d.draft.actor = 'u_alice'
    d.draft.remaining = 2
    d.draft.tiles[3].state = 'banned'
    UH.recv('setup_view', d); UH.frame()
    expect(U.setup.sel.sent).eq(nil)
    expect(UH.enabled(G.MAIN_MENU_UI.definition, 'mp_draft_1')).truthy()
  end)

  it('draft on their turn: waiting, nothing clickable', function()
    UH.recv('setup_view', UH.fixture('setupDraft')); UH.frame()
    local bar = G.MAIN_MENU_UI.definition
    expect(UH.has_text(bar, 'Waiting for opponent...')).truthy()
    expect(UH.enabled(bar, 'mp_draft_1')).falsy()
    expect(U.setup.draft_pick('b_red')).truthy()
    expect(U.setup.draft_confirm()).falsy()
  end)

  it('setup inside lobby_view state is shown too', function()
    local view = UH.view({ state = { kind = 'casual', setup = UH.fixture('setupView') }, me = 'u_alice' })
    local bar = show(view)
    expect(UH.has_text(bar, 'Vote: Ruleset')).truthy()
  end)

  it('MP.test.vote and MP.test.draft drive the same intents', function()
    vote()
    expect(MP.test.vote({ option = 'ruleset_mp_vanilla' }).stepId).eq('s1')
    expect(UH.sent('ui_vote')[1].d.option).eq('ruleset_mp_vanilla')
    local d = UH.fixture('setupDraft'); d.draft.actor = 'u_alice'
    UH.recv('setup_view', d)
    expect(MP.test.draft({}).key).eq('b_red')
    expect(MP.test.ui_state().setup.kind).eq('draft')
  end)
end)

describe('ui lobby: Lobby Options', function()
  before_each(boot)
  after_each(UH.teardown)

  local function open(view)
    show(view)
    UH.click(G.MAIN_MENU_UI.definition, 'mp_lobby_options')
    local def, name = UH.overlay()
    expect(name).eq('lobby_options')
    return def
  end

  local function tab(def, label)
    -- create_tabs builds the chosen tab into a UIBox; other tabs are switched by state + reopen
    return def
  end

  it('host: ruleset cycle sends ui_set_option; Extra... picks the first extra ruleset', function()
    local def = open(UH.view())
    UH.cycle(def, 'mp_opt_ruleset', 1)
    expect(UH.sent('ui_set_option')[1].d).eq({ key = 'ruleset', value = 'ruleset_mp_vanilla' })
    UH.cycle(def, 'mp_opt_ruleset', 6)
    expect(UH.sent('ui_set_option')[2].d).eq({ key = 'ruleset', value = 'ruleset_mp_minorleague' })
  end)

  it('an extra ruleset shows the sub-cycle; it re-opens on a newer version', function()
    local view = UH.view()
    view.state.options.ruleset = 'ruleset_mp_chaos'
    local def = open(view)
    expect(UH.find(def, 'mp_opt_extra_ruleset') ~= nil).truthy()
    expect(UH.has_text(def, 'Chaos')).truthy()
    local n = #UH.overlays
    view.state.version = 10
    view.state.options.ruleset = 'ruleset_mp_wsob'
    show(view)
    expect(#UH.overlays).eq(n + 1)
    expect(UH.has_text((UH.overlay()), 'WSOB')).truthy()
  end)

  it('Trap Cards toggle sends a boolean', function()
    local def = open(UH.view())
    expect(UH.toggle(def, 'mp_opt_trapCards')).eq(true)
    expect(UH.sent('ui_set_option')[1].d).eq({ key = 'trapCards', value = true })
  end)

  it('member: read only, with the host-only note; toggles snap back and send nothing', function()
    local def = open(UH.view({ me = 'u_bob', isHost = false }))
    expect(UH.find(def, 'mp_opt_only_host') ~= nil).truthy()
    expect(UH.cycle(def, 'mp_opt_ruleset', 1)).eq(false)
    UH.toggle(def, 'mp_opt_trapCards')
    expect(#UH.sent('ui_set_option')).eq(0)
  end)

  it('Advanced: cycles and toggles; forced options are locked (Major League timer 180, no Order)', function()
    U.lobby_options.st.tab = 'advanced'
    local view = UH.view()
    view.state.options.ruleset = 'ruleset_mp_majorleague'
    local def = open(view)
    expect(UH.has_text(def, '180s')).truthy()
    local base = UH.find(def, 'mp_opt_timerBaseSeconds')
    expect(base.config.mp_locked).eq(true)
    expect(UH.find(def, 'mp_opt_theOrder').config.mp_locked).eq(true)
    UH.toggle(def, 'mp_opt_theOrder')
    expect(#UH.sent('ui_set_option')).eq(0)
    UH.cycle(def, 'mp_opt_startingLives', 2)
    expect(UH.sent('ui_set_option')[1].d).eq({ key = 'startingLives', value = 2 })
    UH.toggle(def, 'mp_opt_differentSeeds')
    expect(UH.sent('ui_set_option')[2].d).eq({ key = 'differentSeeds', value = true })
  end)

  it('Advanced: custom seed Set / Random', function()
    U.lobby_options.st.tab = 'advanced'
    local def = open(UH.view())
    U.lobby_options.seed.text = 'ab-12z'
    UH.click(def, 'mp_opt_seed_set')
    UH.click(def, 'mp_opt_seed_random')
    local s = UH.sent('ui_set_option')
    expect(s[1].d).eq({ key = 'customSeed', value = 'AB12Z' })
    expect(s[2].d).eq({ key = 'customSeed', value = 'random' })
  end)

  it('Modifiers: a layer toggle sends the whole ordered list (empty stays an array)', function()
    U.lobby_options.st.tab = 'modifiers'
    local view = UH.view()
    view.state.options.modifierLayers = { 'glass_cannon' }
    local def = open(view)
    UH.toggle(def, 'mp_layer_wraith_rework')
    local v = UH.sent('ui_set_option')[1].d
    expect(v.key).eq('modifierLayers')
    expect(v.value[1]).eq('wraith_rework')
    expect(v.value[2]).eq('glass_cannon')
    expect(U.lobby_options.layers_with({ 'glass_cannon' }, 'glass_cannon', false)).eq({})
  end)

  it('Modifiers: the Glass cycle is one choice, No Uncommons is its own toggle (EX-18)', function()
    local LO = U.lobby_options
    expect(LO.layers_with({ 'glass_cannon', 'glass_vanilla' }, 'glass_legacy', true))
      .eq({ 'glass_cannon', 'glass_legacy' })
    expect(LO.layers_with({ 'glass_legacy' }, 'glass_legacy', false)).eq({})
    expect(LO.layers_with({ 'glass_standard' }, 'no_uncommons', true)).eq({ 'glass_standard', 'no_uncommons' })
    LO.st.tab = 'modifiers'
    local view = UH.view()
    view.state.options.modifierLayers = { 'glass_standard' }
    local def = open(view)
    expect(UH.find(def, 'mp_layer_glass_experimental') ~= nil).eq(true)
    expect(UH.find(def, 'mp_layer_no_uncommons') ~= nil).eq(true)
    UH.toggle(def, 'mp_layer_glass_experimental')
    expect(UH.sent('ui_set_option')[1].d.value).eq({ 'glass_experimental' })
    expect(U.theme.layer_label('glass_experimental')).eq('Glass: Experimental')
  end)

  it('Manhunt: Role (Runner hidden when taken) and Hunter Lives 7-16', function()
    U.lobby_options.st.tab = 'general'
    local view = UH.view({ state = { queueMode = 'pvp_manhunt' } })
    view.state.players[2].team = 'RUNNER'
    local def = open(view)
    local role = UH.find(def, 'mp_opt_role')
    expect(UH.has_text(role, 'Runner')).falsy()
    UH.cycle(def, 'mp_opt_manhuntHunterLives', 4)
    expect(UH.sent('ui_set_option')[1].d).eq({ key = 'manhuntHunterLives', value = 10 })
    view.state.players[2].team = 'HUNTER'
    view.state.version = 20
    show(view)
    def = UH.overlay()
    UH.cycle(def, 'mp_opt_role', 2)
    expect(UH.sent('ui_set_team')[1].d).eq({ team = 'RUNNER' })
  end)

  it('Teams: My Team A/B', function()
    U.lobby_options.st.tab = 'general'
    local def = open(UH.view({ state = { queueMode = 'pvp_teams' }, me = 'u_bob', isHost = false }))
    UH.cycle(def, 'mp_opt_team', 2)
    expect(UH.sent('ui_set_team')[1].d).eq({ team = 'B' })
  end)
end)

describe('ui lobby: a guest picks its own deck with different decks (C15)', function()
  before_each(boot)
  after_each(function() MP.loadout = nil; UH.teardown() end)

  local function guest(options)
    local view = UH.view({ me = 'u_alice', isHost = false })
    view.state.hostId = 'u_bob'
    for k, v in pairs(options or {}) do view.state.options[k] = v end
    return view
  end

  it('off (the default) or with a random loadout: the guest deck box stays display only', function()
    expect(UH.enabled(show(guest()), 'mp_deck_box')).falsy()
    local bar = show(guest({ differentDecks = true, randomLoadout = true }))
    expect(UH.enabled(bar, 'mp_deck_box')).falsy()
    -- Even called directly (a stale button), a guest without the option opens nothing.
    G.FUNCS.rmh_mp_deck_box()
    expect(UH.overlay()).eq(nil)
  end)

  it('on: the box opens the picker (no Challenges tab, no MP stake); Select keeps the pick locally', function()
    local bar = show(guest({ differentDecks = true }))
    expect(UH.enabled(bar, 'mp_deck_box')).truthy()
    UH.click(bar, 'mp_deck_box')
    local def, name = UH.overlay()
    expect(name).eq('run_setup')
    expect(U.run_setup.st.mode).eq('loadout')
    expect(UH.find(def, 'mp_rs_challenge')).eq(nil)
    expect(UH.find(def, 'mp_rs_mp_stake')).eq(nil)
    UH.cycle(def, 'mp_rs_deck', 2)
    UH.cycle(def, 'mp_rs_stake', 4)
    UH.click(def, 'mp_rs_select')
    expect(MP.loadout).eq({ deck = 'b_blue', stake = 4 })
    -- Nothing goes to the host: the player's Lua applies its own pick at launch (session.lua).
    expect(#UH.sent('ui_set_deck')).eq(0)
    local view = guest({ differentDecks = true })
    view.state.version = view.state.version + 1
    bar = show(view)
    expect(UH.has_text(bar, 'Blue Deck')).truthy()
  end)

  it('a new lobby forgets the pick', function()
    MP.loadout = { deck = 'b_blue', stake = 4 }
    U.lobby_reset()
    expect(MP.loadout).eq(nil)
  end)
end)

describe('ui lobby: run setup (LOB-08)', function()
  before_each(boot)
  after_each(UH.teardown)

  it('host deck box opens the picker; Select sends ui_set_deck', function()
    show(UH.view())
    UH.click(G.MAIN_MENU_UI.definition, 'mp_deck_box')
    local def, name = UH.overlay()
    expect(name).eq('run_setup')
    UH.cycle(def, 'mp_rs_deck', 2)
    UH.cycle(def, 'mp_rs_stake', 5)
    UH.click(def, 'mp_rs_select')
    local d = UH.sent('ui_set_deck')[1].d
    expect(d.deck).eq('b_blue')
    expect(d.stake).eq(5)
    expect(d.challenge).eq(nil)
  end)

  it('MP decks and the MP stake cycle only for MP-content rulesets or with Show MP content', function()
    -- Content C defines the real deck when its modules are loaded; define a
    -- stand-in only when it is absent.
    if not MP.registry.get('b_mp_violet') then
      MP.registry.define({ key = 'b_mp_violet', kind = 'Back', pos = { x = 0, y = 0 }, atlas = 'mp_decks' })
    end
    local view = UH.view()
    view.state.options.ruleset = 'ruleset_mp_vanilla'
    show(view)
    U.run_setup.open('lobby')
    local def = UH.overlay()
    expect(UH.find(def, 'mp_rs_mp_stake')).eq(nil)
    local function has_mp_deck()
      for _, k in ipairs(U.run_setup.st.decks) do
        if k == 'b_mp_violet' then return true end
      end
      return false
    end
    expect(has_mp_deck()).eq(false)
    U.settings.set('showMpContent', true)
    U.run_setup.open('lobby')
    def = UH.overlay()
    expect(UH.find(def, 'mp_rs_mp_stake') ~= nil).truthy()
    expect(has_mp_deck()).eq(true)
    UH.cycle(def, 'mp_rs_mp_stake', 3)
    UH.click(def, 'mp_rs_select')
    expect(UH.sent('ui_set_deck')[1].d.mpStake).eq('spectral')
  end)

  it('Challenges tab: Select sends the challenge and its deck', function()
    G.CHALLENGES = { { id = 'c_omelette_1', name = 'Omelette', deck = { type = 'Challenge Deck' } } }
    show(UH.view())
    U.run_setup.open('lobby', { tab = 'challenges' })
    local def = UH.overlay()
    UH.cycle(def, 'mp_rs_challenge', 2)
    UH.click(def, 'mp_rs_select_challenge')
    local d = UH.sent('ui_set_deck')[1].d
    expect(d.challenge).eq('c_omelette_1')
  end)

  it('the deck box names the deck and stake', function()
    local view = UH.view()
    view.state.stake = 2
    local bar = show(view)
    expect(UH.has_text(bar, 'Red Deck')).truthy()
    expect(UH.has_text(bar, 'Red Stake')).truthy()
  end)
end)
