-- WS10 L1: the Multiplayer menu, pillar pages, overlays and the view-model plumbing, built with
-- the REAL base-game UI builders (spec/mp_ui_helper.lua).

local UH = require 'spec.mp_ui_helper'

local MP, G, U

local function boot(opts)
  MP, G = UH.boot(opts)
  U = MP.ui
  UH.recv('net_status', { hub = 'connected', account = { name = 'Alice', avatarUrl = MP.net and nil } })
  UH.clear_sent()
end

describe('ui menu: loading and open', function()
  before_each(function() boot() end)
  after_each(UH.teardown)

  it('defines MP.ui.open and the frozen widget names', function()
    for _, k in ipairs({ 'open', 'button', 'pillar_row', 'overlay', 'toast', 'player_card' }) do
      expect(type(U[k])).eq('function')
    end
    expect(MP.open('menu')).truthy()
    expect(U.screen).eq('pvp')
  end)

  it('MP.open replaces the vanilla bar with the PvP bar and adds the panel', function()
    MP.open('menu')
    expect(U.rendered).eq('pvp')
    local bar = G.MAIN_MENU_UI.definition
    for _, id in ipairs({ 'mp_find_game', 'mp_practice', 'mp_replays', 'mp_join_code', 'mp_join_clipboard', 'mp_create_lobby' }) do
      expect(UH.find(bar, id) ~= nil).truthy()
    end
    expect(UH.find(bar, 'main_menu_play')).eq(nil)
    local panel = U.boxes.panel.definition
    expect(UH.has_text(panel, 'Alice')).truthy()
    expect(UH.has_text(panel, 'Connected')).truthy()
    expect(UH.find(panel, 'mp_back') ~= nil).truthy()
    expect(G.SPLASH_LOGO).eq(nil) -- no logo in the fake menu: the swap is a no-op
  end)

  it('Back restores the vanilla menu', function()
    MP.open('menu')
    UH.click(U.boxes.panel.definition, 'mp_back')
    expect(U.screen).eq(nil)
    expect(UH.find(G.MAIN_MENU_UI.definition, 'main_menu_play') ~= nil).truthy()
    expect(U.boxes.panel).eq(nil)
  end)

  it('draws nothing off the main menu and catches up through set_main_menu_UI', function()
    G.STAGE = G.STAGES.RUN
    MP.open('menu')
    expect(U.rendered).eq(nil)
    G.STAGE = G.STAGES.MAIN_MENU
    set_main_menu_UI()
    expect(U.rendered).eq('pvp')
    expect(UH.find(G.MAIN_MENU_UI.definition, 'mp_find_game') ~= nil).truthy()
  end)

  it('renders at most once per frame after model changes', function()
    MP.open('menu')
    local n = #UH.boxes
    UH.recv('net_status', { hub = 'connecting', account = { name = 'Alice', avatarUrl = nil } })
    UH.recv('net_status', { hub = 'offline', reason = 'other', account = { name = 'Alice', avatarUrl = nil } })
    UH.frame()
    expect(#UH.boxes - n).eq(2) -- bar + panel, once
    expect(UH.has_text(U.boxes.panel.definition, 'Offline')).truthy()
  end)
end)

describe('ui menu: PvP bar states', function()
  before_each(function() boot(); MP.open('menu') end)
  after_each(UH.teardown)

  it('offline: Find Game, Join and Create are disabled; Practice and Replays stay enabled', function()
    UH.recv('net_status', { hub = 'offline', account = { name = 'Alice', avatarUrl = nil } })
    UH.frame()
    local bar = G.MAIN_MENU_UI.definition
    expect(UH.enabled(bar, 'mp_find_game')).falsy()
    expect(UH.enabled(bar, 'mp_join_code')).falsy()
    expect(UH.enabled(bar, 'mp_join_clipboard')).falsy()
    expect(UH.enabled(bar, 'mp_create_lobby')).falsy()
    expect(UH.enabled(bar, 'mp_practice')).truthy()
    expect(UH.enabled(bar, 'mp_replays')).truthy()
  end)

  it('searching: FIND GAME becomes CANCEL (ui_queue leave); Practice opens its page (the guard is at START)', function()
    UH.recv('queue_view', { state = 'searching', queueMode = 'pvp_royale', waiting = 3 })
    UH.frame()
    local bar = G.MAIN_MENU_UI.definition
    expect(UH.has_text(bar, 'CANCEL')).truthy()
    expect(UH.has_text(bar, 'Battle Royale')).truthy()
    expect(UH.enabled(bar, 'mp_practice')).truthy()
    UH.click(bar, 'mp_find_game')
    local q = UH.sent('ui_queue')
    expect(#q).eq(1)
    expect(q[1].d).eq({ op = 'leave', queueMode = 'pvp_royale' })
    G.FUNCS.rmh_mp_practice()
    expect(U.screen).eq('practice')
  end)

  it('FROM CLIPBOARD sends ui_join_clipboard; REPLAYS asks for the list', function()
    local bar = G.MAIN_MENU_UI.definition
    UH.click(bar, 'mp_join_clipboard')
    UH.click(bar, 'mp_replays')
    expect(#UH.sent('ui_join_clipboard')).eq(1)
    expect(UH.sent('ui_replay')[1].d).eq({ op = 'list' })
  end)
end)

describe('ui menu: join by code', function()
  before_each(function() boot(); MP.open('menu') end)
  after_each(UH.teardown)

  it('opens the LOBBY CODE overlay and joins with a clean 6-char code', function()
    UH.click(G.MAIN_MENU_UI.definition, 'mp_join_code')
    local def, name = UH.overlay()
    expect(name).eq('join_code')
    expect(UH.has_text(def, 'LOBBY CODE')).truthy()
    U.overlays.join.code = 'ab c2-34'
    UH.click(def, 'mp_join_submit')
    expect(UH.sent('ui_join')[1].d).eq({ code = 'ABC234' })
    expect(G.OVERLAY_MENU).eq(nil)
  end)

  it('refuses short codes and drops characters lobby codes never use', function()
    expect(U.overlays.clean_code('o0i1l')).eq('L')
    UH.click(G.MAIN_MENU_UI.definition, 'mp_join_code')
    U.overlays.join.code = 'ABC'
    expect(G.FUNCS.rmh_mp_join_submit()).falsy()
    expect(#UH.sent('ui_join')).eq(0)
    expect(U.toasts[#U.toasts].text).eq('A lobby code has 6 characters')
  end)
end)

describe('ui menu: pillar pages', function()
  before_each(function() boot(); MP.open('menu') end)
  after_each(UH.teardown)

  it('Create: five pillars; CREATE sends ui_create_lobby (party = party kind)', function()
    UH.click(G.MAIN_MENU_UI.definition, 'mp_create_lobby')
    UH.frame()
    expect(U.rendered).eq('create')
    local top = U.boxes.top.definition
    for _, id in ipairs({ 'mp_create_pvp_nemesis', 'mp_create_pvp_royale', 'mp_create_pvp_manhunt', 'mp_create_pvp_teams', 'mp_create_party' }) do
      expect(UH.enabled(top, id)).truthy()
    end
    expect(UH.find(top, 'mp_create_pvp_smallworld')).eq(nil)
    expect(UH.has_text(top, 'Face a different')).truthy()
    UH.click(top, 'mp_create_pvp_teams')
    UH.click(top, 'mp_create_party')
    local c = UH.sent('ui_create_lobby')
    expect(c[1].d).eq({ queueMode = 'pvp_teams', kind = 'private' })
    expect(c[2].d).eq({ queueMode = 'pvp_nemesis', kind = 'party' })
    UH.click(G.MAIN_MENU_UI.definition, 'mp_pillars_back')
    expect(U.screen).eq('pvp')
  end)

  it('Create pillars are disabled offline', function()
    UH.recv('net_status', { hub = 'offline', account = { name = 'Alice', avatarUrl = nil } })
    U.go('create'); UH.frame()
    expect(UH.enabled(U.boxes.top.definition, 'mp_create_pvp_nemesis')).falsy()
  end)

  it("Find Game: the mod's four casual pillars (no Manhunt); FIND joins the queue and returns to the menu", function()
    U.go('find'); UH.frame()
    local top = U.boxes.top.definition
    for _, m in ipairs({ 'pvp_nemesis', 'pvp_royale', 'pvp_teams', 'pvp_smallworld' }) do
      expect(UH.find(top, 'mp_find_' .. m) ~= nil).truthy()
    end
    expect(UH.find(top, 'mp_find_pvp_manhunt')).eq(nil)
    expect(UH.has_text(top, 'One Nemesis,')).truthy()
    expect(UH.has_text(top, 'head to head')).truthy()
    expect(UH.has_text(top, 'Face a different')).falsy()
    UH.click(top, 'mp_find_pvp_smallworld')
    expect(UH.sent('ui_queue')[1].d).eq({ op = 'join', queueMode = 'pvp_smallworld' })
    expect(U.screen).eq('pvp')
    expect(U.model.queue.state).eq('searching')
  end)

  it('Practice: four pillars plus Extra rulesets; START opens the run setup; it sends ui_practice', function()
    U.go('practice'); UH.frame()
    local top = U.boxes.top.definition
    for _, k in ipairs({ 'balanced', 'expanded', 'vanilla', 'smallworld' }) do
      expect(UH.enabled(top, 'mp_practice_ruleset_mp_' .. k)).truthy()
    end
    expect(UH.find(top, 'mp_practice_extra_pillar') ~= nil).truthy()
    UH.click(top, 'mp_practice_ruleset_mp_smallworld')
    local def, name = UH.overlay()
    expect(name).eq('run_setup')
    expect(UH.has_text(def, 'Small World')).truthy()
    U.run_setup.st.seed.text = 'ab12'
    UH.click(def, 'mp_rs_select')
    local p = UH.sent('ui_practice')[1].d
    expect(p.ruleset).eq('ruleset_mp_smallworld')
    expect(p.seed).eq('AB12')
    expect(p.stake).eq(1)
  end)

  it('Practice with an extra ruleset and no seed', function()
    U.go('practice'); UH.frame()
    UH.cycle(U.boxes.top.definition, 'mp_practice_extra_cycle', 2)   -- Sandbox
    UH.frame()
    UH.click(U.boxes.top.definition, 'mp_practice_extra')
    UH.click((UH.overlay()), 'mp_rs_select')
    local p = UH.sent('ui_practice')[1].d
    expect(p.ruleset).eq('ruleset_mp_sandbox')
    expect(p.seed).eq(nil)
  end)

  it('Practice does not start while queued: START opens the queue guard (PR-05, A18)', function()
    UH.recv('queue_view', { state = 'searching', queueMode = 'pvp_nemesis' })
    U.go('practice'); UH.frame()
    expect(UH.enabled(U.boxes.top.definition, 'mp_practice_ruleset_mp_balanced')).truthy()
    G.FUNCS.rmh_mp_practice_pick({ config = { ref_table = { ruleset = 'ruleset_mp_balanced' } } })
    U.run_setup.submit()
    expect(#UH.sent('ui_practice')).eq(0)
    expect(select(2, UH.overlay())).eq('queue_guard')
  end)
end)

describe('ui menu: lobby_error and prompts', function()
  before_each(function() boot(); MP.open('menu') end)
  after_each(UH.teardown)

  it('localizes the page codes clipboard-empty / clipboard-denied / offline', function()
    UH.recv('lobby_error', { code = 'clipboard-empty' })
    expect(U.toasts[#U.toasts].text).eq('No lobby code on the clipboard')
    UH.recv('lobby_error', { code = 'clipboard-denied' })
    expect(U.toasts[#U.toasts].text).eq('The browser blocked the clipboard')
    UH.recv('lobby_error', { code = 'offline' })
    expect(U.toasts[#U.toasts].text).eq('Not connected to the Multiplayer service')
    UH.recv('lobby_error', { code = 'full' })
    expect(U.toasts[#U.toasts].text).eq('Lobby is full')
  end)

  it('an unknown code still says something, with the code', function()
    UH.recv('lobby_error', { code = 'weird-thing' })
    expect(U.toasts[#U.toasts].text).eq('Something went wrong (weird-thing)')
  end)

  it('version-mismatch shows the Version mismatch overlay (LOB-15)', function()
    UH.recv('lobby_error', { code = 'version-mismatch' })
    local def, name = UH.overlay()
    expect(name).eq('version_mismatch')
    expect(UH.has_text(def, 'Reload the page to update')).truthy()
  end)

  it('seat-held prompt: Rejoin / Leave it send ui_seat (LOB-14)', function()
    UH.recv('lobby_error', { code = 'seat-held:ABC234' })
    local def, name = UH.overlay()
    expect(name).eq('seat_held')
    expect(UH.has_text(def, 'ABC234')).truthy()
    UH.click(def, 'mp_notice_1')
    expect(UH.sent('ui_seat')[1].d).eq({ op = 'rejoin' })
    UH.clear_sent()
    UH.recv('lobby_error', { code = 'seat-held' })
    UH.click((UH.overlay()), 'mp_notice_2')
    expect(UH.sent('ui_seat')[1].d).eq({ op = 'abandon' })
  end)

  it('rejoin intent shows the Reconnect prompt', function()
    MP.open('rejoin')
    local def, name = UH.overlay()
    expect(name).eq('reconnect')
    UH.click(def, 'mp_notice_1')
    expect(UH.sent('ui_seat')[1].d).eq({ op = 'rejoin' })
  end)

  it('kicked / forfeited / connection lost notices go back to the PvP menu', function()
    for _, code in ipairs({ 'kicked', 'forfeited', 'host-lost' }) do
      U.model.lobby = UH.view()
      UH.recv('lobby_error', { code = code })
      local def = UH.overlay()
      UH.click(def, 'mp_notice_1')
      expect(U.model.lobby).eq(nil)
      expect(U.screen).eq('pvp')
    end
  end)

  it('toast messages fill their vars', function()
    UH.recv('toast', { key = 'rmh_mp_player_away', vars = { name = 'Bob' } })
    expect(U.toasts[#U.toasts].text).eq('Bob is away')
    expect(#UH.attention > 0).truthy()
  end)

  it('shows English defaults when the MP strings are not loaded', function()
    UH.teardown()
    boot({ no_loc = true })
    MP.open('menu')
    expect(UH.has_text(G.MAIN_MENU_UI.definition, 'FIND GAME')).truthy()
    expect(UH.has_text(G.MAIN_MENU_UI.definition, 'PRACTICE')).truthy()
  end)
end)
