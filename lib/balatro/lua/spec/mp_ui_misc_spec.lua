-- WS10 L1: chat, MP settings and avatars, the MP collection, TAB shortcuts, the late result
-- notice, the test surface, and the string inventory (every rmh_mp_ui_* key the UI reads ships
-- in extra-strings.en-us.json).

local UH = require 'spec.mp_ui_helper'
local J = require 'spec.json_fixture'

local MP, G, U

local function boot()
  MP, G = UH.boot()
  U = MP.ui
  UH.recv('net_status', { hub = 'connected', account = { name = 'Alice', avatarUrl = nil } })
  MP.open('menu')
  UH.clear_sent()
end

local function lobby(over)
  UH.recv('lobby_view', UH.view(over))
  UH.frame()
end

describe('ui chat (HUD-11)', function()
  before_each(boot)
  after_each(UH.teardown)

  it('lines are "name: text", coloured by kind, newest last, capped', function()
    UH.recv('chat_line', { from = 'u_bob', name = 'Bob', text = 'hi', kind = 'in' })
    UH.recv('chat_line', { from = 'u_alice', name = 'Alice', text = 'yo', kind = 'own' })
    UH.recv('chat_line', { from = 'system', name = '', text = 'Bob joined', kind = 'system' })
    local v = U.chat.visible()
    expect(#v).eq(3)
    expect(v[1].text).eq('Bob: hi')
    expect(v[1].colour[1]).eq(0)        -- cyan
    expect(v[2].colour[3]).eq(1)        -- purple
    expect(v[3].text).eq('Bob joined')
    for i = 1, 30 do UH.recv('chat_line', { from = 'u_bob', name = 'Bob', text = 'm' .. i, kind = 'in' }) end
    expect(#U.chat.visible()).eq(U.chat.MAX_LINES)
    UH.frame()
    expect(U.chat.box ~= nil).truthy()
  end)

  it('lines fade out, then the console disappears', function()
    UH.recv('chat_line', { from = 'u_bob', name = 'Bob', text = 'hi', kind = 'in' })
    G.TIMERS.REAL = G.TIMERS.REAL + U.chat.SHOW_SECONDS + 1
    local a = U.chat.visible()[1].colour[4]
    expect(a > 0 and a < 1).truthy()
    G.TIMERS.REAL = G.TIMERS.REAL + 5
    expect(#U.chat.visible()).eq(0)
  end)

  it('muted senders are dropped locally', function()
    U.model.muted.u_bob = true
    UH.recv('chat_line', { from = 'u_bob', name = 'Bob', text = 'spam', kind = 'in' })
    expect(#U.chat.visible()).eq(0)
  end)

  it('T opens the input only in a lobby; Enter sends ui_chat (trimmed); empty sends nothing', function()
    expect(U.shortcuts.on_key_press('t')).falsy()
    lobby()
    expect(U.shortcuts.on_key_press('t')).truthy()
    expect(U.chat.open_input).eq(true)
    U.chat.draft.text = '  gl hf  '
    expect(U.chat.submit()).eq('gl hf')
    expect(UH.sent('ui_chat')[1].d).eq({ text = 'gl hf' })
    U.chat.open()
    U.chat.draft.text = '   '
    expect(U.chat.submit()).eq(nil)
  end)

  it('T does nothing while a text box has focus; Escape closes the chat', function()
    lobby()
    G.CONTROLLER.text_input_hook = {}
    expect(U.shortcuts.on_key_press('t')).falsy()
    G.CONTROLLER.text_input_hook = nil
    U.chat.open()
    expect(U.shortcuts.on_key_press('escape')).truthy()
    expect(U.chat.open_input).eq(false)
  end)

  it('chat disabled in settings: T only toasts', function()
    lobby()
    U.settings.set('chat', false)
    expect(U.chat.open()).falsy()
    expect(U.chat.open_input).falsy()
  end)

  it('vote_progress prints k/n system lines', function()
    UH.recv('vote_progress', { kind = 'seed', k = 1, n = 3 })
    UH.recv('vote_progress', { kind = 'draw', k = 2, n = 2 })
    local v = U.chat.visible()
    expect(v[1].text).eq('Vote to change seed: 1/3')
    expect(v[2].text).eq('Vote for Draw: 2/2')
  end)
end)

describe('ui settings (HUD-20) and avatars (D-37)', function()
  before_each(boot)
  after_each(UH.teardown)

  it('opening the menu pushes every setting to TS', function()
    UH.teardown(); boot()
    MP.open('menu')
    local s = UH.sent('ui_settings')
    expect(#s >= 1).truthy()
    expect(s[#s].d).eq({ avatarJoker = 'j_joker', blindCol = 1, nemesisLayout = 'standard', timerSound = 'always',
      showMpContent = false, chat = true })
  end)

  it('the overlay lists layouts, timer sound, blind colours and the avatars', function()
    UH.click(U.boxes.panel.definition, 'mp_account')
    local def, name = UH.overlay()
    expect(name).eq('settings')
    for _, id in ipairs({ 'mp_set_layout', 'mp_set_timer_sound', 'mp_set_blind_col', 'mp_set_show_mp', 'mp_set_chat', 'mp_avatar_grid' }) do
      expect(UH.find(def, id) ~= nil).truthy()
    end
    expect(UH.find(def, 'mp_avatar_j_joker') ~= nil).truthy()
    expect(UH.find(def, 'mp_avatar_j_golden').config.mp_locked).eq(true)
    expect(UH.find(def, 'mp_avatar_j_sly').config.mp_locked).eq(nil)
  end)

  it('cycles store the value, persist it and send only that field', function()
    U.settings.open()
    local def = UH.overlay()
    UH.cycle(def, 'mp_set_layout', 3)
    UH.cycle(def, 'mp_set_timer_sound', 2)
    UH.cycle(def, 'mp_set_blind_col', 25)
    expect(U.setting('nemesisLayout')).eq('classic')
    expect(U.setting('timerSound')).eq('once')
    expect(U.setting('blindCol')).eq(25)
    expect(G.SETTINGS.rmh_mp.blindCol).eq(25)
    expect(UH.saved >= 3).truthy()
    local s = UH.sent('ui_settings')
    expect(s[1].d).eq({ nemesisLayout = 'classic' })
    expect(s[3].d).eq({ blindCol = 25 })
  end)

  it('rejects unknown values and locked avatars', function()
    expect(U.settings.set('nemesisLayout', 'upside_down')).falsy()
    expect(U.settings.set('blindCol', 26)).falsy()
    expect(U.settings.set('blindCol', 1.5)).falsy()
    expect(U.settings.set('avatarJoker', 'j_golden')).falsy()
    expect(U.settings.set('nope', 1)).falsy()
    expect(U.settings.set('avatarJoker', 'j_zany')).truthy()
    expect(U.setting('avatarJoker')).eq('j_zany')
  end)

  it('history unlocks goal avatars; only a later update toasts "Avatar Unlocked!"', function()
    UH.recv('history', { wins = 1, losses = 0, games = 1, pvpGames = 1, streak = 1, days = 1 })
    local n = #U.toasts
    expect(U.settings.set('avatarJoker', 'j_golden')).truthy()
    UH.recv('history', { wins = 10, losses = 0, games = 10, pvpGames = 10, streak = 3, days = 2 })
    expect(#U.toasts).eq(n + 1)
    expect(U.toasts[#U.toasts].text:find('Avatar Unlocked!', 1, true) ~= nil).truthy()
    UH.recv('history', { wins = 10, losses = 0, games = 10, pvpGames = 10, streak = 3, days = 2 })
    expect(#U.toasts).eq(n + 1)
  end)

  it('an avatar that is no longer unlocked falls back to j_joker', function()
    UH.recv('history', { wins = 1, losses = 0, games = 1, pvpGames = 1, streak = 1, days = 1 })
    U.settings.set('avatarJoker', 'j_golden')
    UH.recv('history', { wins = 0, losses = 0, games = 0, pvpGames = 0, streak = 0, days = 0 })
    expect(U.setting('avatarJoker')).eq('j_joker')
  end)

  it('every avatar key is a real vanilla joker', function()
    local game = assert(io.open((RMH_SPEC.root or '') .. 'data/balatro/game.lua')):read('*a')
    for _, a in ipairs(U.settings.avatars({})) do
      expect(game:find('\n%s*' .. a.key .. '=') ~= nil).truthy()
    end
  end)
end)

describe('ui collection (HUD-21)', function()
  before_each(boot)
  after_each(UH.teardown)

  it('opens with the nine tabs; the reference joker is listed, the blind is a row', function()
    UH.click(U.boxes.panel.definition, 'mp_collection')
    local def, name = UH.overlay()
    expect(name).eq('collection')
    for _, t in ipairs({ 'Jokers', 'Consumables', 'Decks', 'Blinds', 'Tags', 'Vouchers', 'Stakes', 'Challenges' }) do
      expect(UH.has_text(def, t)).truthy()
    end
    expect(UH.find(def, 'mp_coll_j_mp_pacifist') ~= nil).truthy()
    local blinds = U.collection.tab_def(U.collection.TABS[4], 1)
    expect(UH.find(blinds, 'mp_coll_bl_mp_nemesis') ~= nil).truthy()
  end)

  it('never mounts: no MP key reaches the vanilla tables', function()
    U.collection.open()
    expect(MP.registry.mounted()).falsy()
    expect(G.P_CENTERS.j_mp_pacifist).eq(nil)
  end)

  it('sandbox tab: Content B overview (D-26) - Extra Credit, decoys 1-14, Hanging Chad, idols in the middle', function()
    local tab = U.collection.TABS[9]
    local S = MP.sandbox
    expect(S and S.overview_keys ~= nil).truthy()
    local e = U.collection.entries(tab)
    local keys = {}
    for i, x in ipairs(e) do keys[i] = x.key end
    -- Exactly the overview's defined keys, in its (per-boot) order.
    local want = {}
    for _, k in ipairs(S.overview_keys()) do if MP.registry.get(k) then want[#want + 1] = k end end
    expect(keys).eq(want)
    local errors, ec, misprint = {}, 0, false
    for _, x in ipairs(e) do
      local n = x.key:match('^j_mp_error_sandbox_(%d+)$')
      if n then errors[#errors + 1] = tonumber(n) end
      if x.def.extra_credit then ec = ec + 1 end
      if x.key == 'j_mp_misprint_sandbox' then misprint = true end
    end
    table.sort(errors)
    expect(#errors).eq(14)
    expect(errors[1]).eq(1)
    expect(errors[14]).eq(14)
    expect(ec).eq(#S.EXTRA_CREDIT)
    expect(misprint).eq(false)                                   -- active sandbox jokers are not the overview
    local mid = math.floor((#S.EXTRA_CREDIT + 15) / 2) + 1
    expect(keys[mid]).eq('j_mp_idol_sandbox_zealot')
    expect(keys[mid + 1]).eq('j_mp_idol_sandbox_collector')
    local again = U.collection.entries(tab)
    for i = 1, #e do expect(again[i].key).eq(e[i].key) end         -- stable within a boot
    local jokers = U.collection.entries(U.collection.TABS[1])
    for _, x in ipairs(jokers) do expect(x.key:find('error') == nil and x.key:find('sandbox') == nil).truthy() end
  end)

  it('sandbox tab without Content B: sandbox defs plus at most 14 error decoys', function()
    local tab = U.collection.TABS[9]
    local S = MP.sandbox
    MP.sandbox = nil
    MP.registry.define({ key = 'j_mp_error_x1', kind = 'Joker', rarity = 1, pos = { x = 0, y = 0 }, pool = false })
    local e = U.collection.entries(tab)
    MP.sandbox = S
    local errors = 0
    for _, x in ipairs(e) do
      if x.key:find('error', 1, true) then errors = errors + 1 else expect(errors).eq(0) end -- decoys come last
    end
    expect(errors <= 14 and errors >= 1).truthy()
  end)

  it('pages past ten cards and says so when a tab is empty', function()
    local before = #U.collection.entries(U.collection.TABS[1])
    for i = 1, 12 do MP.registry.define({ key = 'j_mp_test_' .. i, kind = 'Joker', rarity = 1, pos = { x = 0, y = 0 } }) end
    local def, n, pages = U.collection.tab_def(U.collection.TABS[1], 1)
    expect(n).eq(before + 12)
    expect(pages).eq(math.ceil((before + 12) / U.collection.PER_PAGE))
    expect(UH.find(def, 'mp_coll_pages') ~= nil).truthy()
    local empty = U.collection.tab_def({ id = 'none', kinds = {}, rows = true }, 1)
    expect(UH.find(empty, 'mp_coll_empty') ~= nil).truthy()
  end)
end)

describe('ui shortcuts (LOB-12)', function()
  before_each(boot)
  after_each(UH.teardown)

  it('TAB in a private lobby shows the list; a key runs it; release closes', function()
    lobby()
    expect(U.shortcuts.on_key_press('tab')).truthy()
    local def, name = UH.overlay()
    expect(name).eq('shortcuts')
    expect(UH.find(def, 'mp_sc_c') ~= nil).truthy()
    expect(UH.find(def, 'mp_sc_o') ~= nil).truthy()
    expect(UH.find(def, 'mp_sc_r')).eq(nil)   -- the host has START, not READY
    expect(U.shortcuts.on_key_press('c')).truthy()
    expect(#UH.sent('ui_copy_code')).eq(1)
    expect(G.OVERLAY_MENU).eq(nil)
    U.shortcuts.open()
    U.shortcuts.close()
    expect(G.OVERLAY_MENU).eq(nil)
  end)

  it('a guest gets R (ready); not on the vanilla menu; not over another overlay', function()
    U.close()
    expect(U.shortcuts.open()).falsy()
    lobby({ me = 'u_bob', isHost = false })
    U.settings.open()
    expect(U.shortcuts.open()).falsy()
    G.FUNCS.exit_overlay_menu()
    U.shortcuts.open()
    expect(U.shortcuts.on_key_press('r')).truthy()
    expect(UH.sent('ui_ready')[1].d).eq({ ready = false }) -- Bob is ready in the fixture
  end)

  it('A16: on the PvP menu out of a lobby: V join from clipboard, J join by code, C create lobby', function()
    expect(U.screen).eq('pvp')
    expect(U.shortcuts.on_key_press('tab')).truthy()
    local def, name = UH.overlay()
    expect(name).eq('shortcuts')
    for _, k in ipairs({ 'v', 'j', 'c' }) do expect(UH.find(def, 'mp_sc_' .. k) ~= nil).truthy() end
    expect(UH.find(def, 'mp_sc_l')).eq(nil)
    expect(UH.has_text(def, 'Join From Clipboard')).truthy()
    expect(U.shortcuts.on_key_press('v')).truthy()
    expect(#UH.sent('ui_join_clipboard')).eq(1)
    U.shortcuts.open()
    expect(U.shortcuts.on_key_press('j')).truthy()
    expect(select(2, UH.overlay())).eq('join_code')
    G.FUNCS.exit_overlay_menu()
    U.shortcuts.open()
    expect(U.shortcuts.on_key_press('c')).truthy()
    expect(U.screen).eq('create')
    -- also on the other MP pages
    expect(U.shortcuts.open()).truthy()
    U.shortcuts.close()
  end)

  it('A16: no menu shortcuts offline; a search running opens the queue guard instead', function()
    UH.recv('net_status', { hub = 'offline', account = { name = 'Alice', avatarUrl = nil } })
    expect(U.shortcuts.open()).falsy()
    UH.recv('net_status', { hub = 'connected', account = { name = 'Alice', avatarUrl = nil } })
    UH.recv('queue_view', { state = 'searching', queueMode = 'pvp_teams' })
    U.shortcuts.open()
    expect(U.shortcuts.on_key_press('v')).truthy()
    expect(#UH.sent('ui_join_clipboard')).eq(0)
    local def, name = UH.overlay()
    expect(name).eq('queue_guard')
    UH.click(def, 'mp_qguard_leave_play')
    expect(UH.sent('ui_queue')[1].d).eq({ op = 'leave', queueMode = 'pvp_teams' })
    expect(#UH.sent('ui_join_clipboard')).eq(1)
  end)

  it('the Controller wrap consumes handled keys and passes the rest on', function()
    local seen = {}
    _G.Controller = { key_press_update = function(self, key) seen[#seen + 1] = key end, key_release_update = function() end }
    package.loaded['rmh_mp.ui.shortcuts'] = nil
    require 'rmh_mp.ui.shortcuts'
    lobby()
    Controller.key_press_update({ locks = {} }, 'tab')
    Controller.key_press_update({ locks = {} }, 'x')
    expect(seen).eq({ 'x' })
    Controller.key_release_update({ locks = {} }, 'tab')
    expect(U.shortcuts.is_open).falsy()
  end)
end)

describe('ui: late result, test surface', function()
  before_each(boot)
  after_each(UH.teardown)

  it('a win outcome while at the menu leaves a notice', function()
    lobby()
    local n = #U.toasts
    MP.report.apply = MP.report.apply -- (the core handles the outcome first)
    for _, fn in ipairs(MP.report.observers.win or {}) do fn({ t = 'win', winner_id = 'u_alice' }) end
    expect(#U.toasts).eq(n + 1)
    expect(U.toasts[#U.toasts].text:find('You won.', 1, true) ~= nil).truthy()
  end)

  it('MP.test.ready / unready in a lobby; ui ops; unknown ops fail loudly', function()
    lobby({ me = 'u_bob', isHost = false })
    MP.test.ready()
    MP.test.unready()
    local r = UH.sent('ui_ready')
    expect(r[1].d.ready).eq(true)
    expect(r[2].d.ready).eq(false)
    local st = MP.test.ui({ op = 'overlay', name = 'lobby_options' })
    expect(st.overlay).eq('lobby_options')
    expect(st.lobby.code).eq('ABC234')
    expect(function() MP.test.ui({ op = 'nope' }) end).error('unknown op')
    UH.teardown(); boot()
    expect(function() MP.test.ready() end).error('not in a lobby')
    expect(function() MP.test.vote({}) end).error('no setup vote')
  end)
end)

describe('ui: MP stakes come from WS7 content (MP.content.stakes.LIST)', function()
  before_each(boot)
  after_each(UH.teardown)

  it('lists the content stakes with their names and colours, in order', function()
    local list = U.run_setup.mp_stakes()
    expect(#list).eq(#MP.content.stakes.LIST)
    for i, e in ipairs(MP.content.stakes.LIST) do
      expect(list[i].id).eq(e.id)
      expect(list[i].name).eq(MP.content.stakes.name(e))
      expect(type(list[i].colour)).eq('table')
    end
    expect(U.run_setup.mp_stake_name('spectralplus')).eq(MP.content.stakes.name(MP.content.stakes.get('spectralplus')))
    local stakes = U.collection.entries(U.collection.TABS[7])
    expect(stakes[1].key).eq('stake_mp_planet')
  end)

  it('falls back to its own list without the content module', function()
    MP.content.stakes = nil
    expect(#U.run_setup.mp_stakes()).eq(3)
    expect(U.run_setup.mp_stake_name('planet')).eq('Planet Stake')
  end)
end)

describe('ui strings', function()
  it('every rmh_mp_ui_* key the UI reads ships in extra-strings.en-us.json', function()
    local root = RMH_SPEC.root or ''
    local extra = J.read_file(root .. 'data/balatro-mp/extra-strings.en-us.json')
    local have = {}
    for _, cat in ipairs({ 'dictionary', 'v_dictionary' }) do
      for k in pairs(extra.misc[cat] or {}) do have[k] = true end
    end
    local files = { 'theme', 'widgets', 'menu', 'overlays', 'pillars', 'practice_menu', 'run_setup', 'lobby', 'lobby_options',
      'setup', 'chat', 'settings', 'collection', 'shortcuts' }
    local missing = {}
    for _, f in ipairs(files) do
      local src = assert(io.open(root .. 'lib/balatro/lua/mp/rmh_mp/ui/' .. f .. '.lua')):read('*a')
      expect(src:find('[\128-\255]', 1) == nil or src:match('^[^\n]*') ~= nil).truthy()
      for key in src:gmatch("'(rmh_mp_ui_[a-z0-9_]+)'") do
        if not key:match('_$') and not have[key] then missing[#missing + 1] = f .. ':' .. key end
      end
    end
    local TH = require 'rmh_mp.ui.theme'
    for _, l in ipairs(TH.ADVANCED_LAYERS) do
      if not have['rmh_mp_ui_layer_' .. l.name] then missing[#missing + 1] = 'layer:' .. l.name end
    end
    expect(missing).eq({})
  end)

  it('no UI source has non-ASCII outside comments (fonts only scan localization data)', function()
    local root = RMH_SPEC.root or ''
    for _, f in ipairs({ 'theme', 'widgets', 'menu', 'overlays', 'pillars', 'practice_menu', 'run_setup', 'lobby', 'lobby_options',
      'setup', 'chat', 'settings', 'collection', 'shortcuts' }) do
      local n = 0
      for line in io.lines(root .. 'lib/balatro/lua/mp/rmh_mp/ui/' .. f .. '.lua') do
        n = n + 1
        local code = line:gsub('%-%-.*$', '')
        if code:find('[\128-\255]') then error(f .. '.lua:' .. n .. ' has non-ASCII outside a comment') end
      end
    end
  end)
end)
