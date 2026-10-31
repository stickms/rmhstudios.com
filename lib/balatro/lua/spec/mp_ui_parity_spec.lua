-- L1: the parity-audit gaps closed in the out-of-run UI (docs/balatro-mp-parity.md B08, B09,
-- A12, A13, A16 in mp_ui_misc_spec, A18): the Credits overlay and its links, the MULTIPLAYER
-- credits badge on card tooltips, Find Game's live In Queue / In Game counts and their poll, the
-- "Uses The Order" explainer, and the queue guard on vanilla run starts and lobby entry.

local UH = require 'spec.mp_ui_helper'

local MP, G, U
local started, opened

local function boot()
  started, opened = {}, {}
  MP, G = UH.boot({ before_ui = function(_, g)
    g.FUNCS.start_run = function(e, args) started[#started + 1] = { e = e, args = args } end
  end })
  U = MP.ui
  love.system.openURL = function(url) opened[#opened + 1] = url end
  UH.recv('net_status', { hub = 'connected', account = { name = 'Alice', avatarUrl = nil } })
  MP.open('menu')
  UH.clear_sent()
end

describe('ui credits (B08)', function()
  before_each(boot)
  after_each(UH.teardown)

  it('the Multiplayer panel has Credits; it shows the creator, contributors and two links', function()
    UH.frame()
    UH.click(U.boxes.panel.definition, 'mp_credits')
    local def, name = UH.overlay()
    expect(name).eq('credits')
    expect(UH.has_text(def, 'Created by')).truthy()
    expect(UH.has_text(def, 'Virtualized')).truthy()
    expect(UH.has_text(def, 'Major contributions by')).truthy()
    expect(UH.has_text(def, 'TGMM, Senfinbrare')).truthy()
    expect(UH.has_text(def, 'and many more!')).truthy()
    UH.click(def, 'mp_credits_github')
    UH.click(def, 'mp_credits_discord')
    expect(opened).eq({ U.credits.LINKS.github, U.credits.LINKS.discord })
  end)

  it('opens only its own fixed links; a missing openURL is not an error', function()
    expect(U.credits.open_link('https://evil.example/')).falsy()
    expect(U.credits.open_link(nil)).falsy()
    expect(G.FUNCS.rmh_mp_credits_link({ config = { ref_table = { link = 'javascript:alert(1)' } } })).falsy()
    expect(#opened).eq(0)
    love.system.openURL = nil
    expect(U.credits.open_link('discord')).falsy()
    love.system.openURL = function() error('blocked') end
    expect(U.credits.open_link('discord')).falsy()
  end)

  it('English fallbacks when the MP strings are missing', function()
    UH.teardown()
    MP, G = UH.boot({ no_loc = true })
    U = MP.ui
    local def = U.credits.open()
    expect(UH.has_text(def, 'Created by')).truthy()
    expect(UH.has_text(def, 'Github Project')).truthy()
  end)
end)

describe('ui credits badge (B09)', function()
  before_each(boot)
  after_each(UH.teardown)

  it('every credited key is an MP center key; every one parses into art / idea / code', function()
    local n = 0
    for key in pairs(U.credits.BY) do
      n = n + 1
      expect(key:match('^[jbc]_mp_[%w_]+$') ~= nil).truthy()
      local c = U.credits.of(key)
      expect(type(c.art) == 'table' and type(c.idea) == 'table' and type(c.code) == 'table').truthy()
      expect(#c.art + #c.idea + #c.code >= 1).truthy()
    end
    expect(n >= 72).truthy()
    expect(U.credits.of('j_joker')).eq(nil)
    expect(U.credits.of(nil)).eq(nil)
  end)

  it('lines: MULTIPLAYER, then art, idea and code names in order', function()
    expect(U.credits.lines('j_mp_skip_off')).eq({ 'MULTIPLAYER', 'Art: Aura!', 'Idea: Dr. Monty', 'Idea: Carter', 'Code: Virtualized' })
    expect(U.credits.lines('j_mp_castle_sandbox')).eq({ 'MULTIPLAYER', 'Code: steph' })
    expect(U.credits.lines('j_mp_defensive_joker')[3]).eq("Idea: didon't")
  end)

  local function popup_def(badge_row)
    local inner = { n = G.UIT.R, config = { align = 'cm', padding = 0.07 }, nodes = { { n = G.UIT.R, config = {} }, { n = G.UIT.R, config = {} } } }
    if badge_row then inner.nodes[3] = { n = G.UIT.R, config = { align = 'cm', padding = 0.03 }, nodes = { { n = G.UIT.R, config = {} } } } end
    return { n = G.UIT.ROOT, config = {}, nodes = { { n = G.UIT.C, config = {}, nodes = { { n = G.UIT.R, config = {}, nodes = { inner } } } } } }, inner
  end

  local function card(key, card_type)
    return { config = { center = { key = key } }, ability_UIBox_table = { card_type = card_type or 'Joker', badges = {} } }
  end

  local function badge_strings(node)
    local out
    UH.walk(node, function(n)
      local o = n.config and n.config.object
      if o and o.string_args and type(o.string_args.string) == 'table' then out = o.string_args.string end
    end)
    return out
  end

  it('joins the vanilla badge row, or starts one; red MULTIPLAYER colour', function()
    local def, inner = popup_def(true)
    expect(U.credits.add_badge(def, card('j_mp_pizza'))).truthy()
    expect(#inner.nodes).eq(3)
    expect(#inner.nodes[3].nodes).eq(2)
    expect(badge_strings(inner.nodes[3].nodes[2])).eq({ 'MULTIPLAYER', 'Art: TheTrueRaven', 'Idea: Virtualized', 'Code: Virtualized' })
    expect(inner.nodes[3].nodes[2].nodes[1].config.colour).eq(U.theme.col('MULTIPLAYER'))
    local def2, inner2 = popup_def(false)
    expect(U.credits.add_badge(def2, card('c_mp_trap_web'))).truthy()
    expect(#inner2.nodes).eq(3)
    expect(badge_strings(inner2.nodes[3])[2]).eq('Art: Ganpan140')
  end)

  it('no badge on uncredited, vanilla, locked or undiscovered cards, or a malformed popup', function()
    local def, inner = popup_def(false)
    expect(U.credits.add_badge(def, card('j_mp_baron'))).falsy()
    expect(U.credits.add_badge(def, card('j_joker'))).falsy()
    expect(U.credits.add_badge(def, card('j_mp_pizza', 'Locked'))).falsy()
    expect(U.credits.add_badge(def, card('j_mp_pizza', 'Undiscovered'))).falsy()
    expect(U.credits.add_badge({ nodes = {} }, card('j_mp_pizza'))).falsy()
    expect(U.credits.add_badge(def, {})).falsy()
    expect(#inner.nodes).eq(2)
  end)

  it('G.UIDEF.card_h_popup is wrapped: the real tooltip of a credited card carries the badge', function()
    _G.get_type_colour = function() return G.C.RED end
    local c = { config = { center = { key = 'j_mp_taxes', rarity = 2 } }, ability = { name = 'Taxes' }, debuff = false,
      ability_UIBox_table = { card_type = 'Joker', badges = { card_type = true },
        name = { { n = G.UIT.T, config = { text = 'Taxes' } } }, main = {} } }
    local def = G.UIDEF.card_h_popup(c)
    local found
    UH.walk(def, function(n)
      local o = n.config and n.config.object
      if o and o.string_args and type(o.string_args.string) == 'table' and o.string_args.string[1] == 'MULTIPLAYER' then found = o end
    end)
    expect(found ~= nil).truthy()
    expect(found.string_args.string[2]).eq('Art: DottyKitty')
  end)
end)

describe('ui find game counts (A12)', function()
  local now
  before_each(function()
    boot()
    now = 100
    U.pillars.clock = function() return now end
    U.pillars.last_poll = nil
  end)
  after_each(UH.teardown)

  it('the pillars show In Queue / In Game instead of a fixed Players box', function()
    U.go('find'); UH.frame()
    local top = U.boxes.top.definition
    expect(UH.has_text(top, 'In Queue')).truthy()
    expect(UH.has_text(top, 'In Game')).truthy()
    expect(UH.find(top, 'mp_find_pvp_nemesis_stat')).eq(nil)
    for _, q in ipairs(U.theme.QUEUE_MODES) do
      expect(UH.find(top, 'mp_find_' .. q.mode .. '_queued') ~= nil).truthy()
      expect(UH.find(top, 'mp_find_' .. q.mode .. '_ingame') ~= nil).truthy()
    end
  end)

  it('polls every 5 s only while Find Game is open and online', function()
    UH.frame()
    expect(#UH.sent('ui_queue_counts')).eq(0)           -- the PvP menu does not poll
    U.go('find'); UH.frame()
    expect(#UH.sent('ui_queue_counts')).eq(1)           -- at once on entering
    now = 103; UH.frame()
    expect(#UH.sent('ui_queue_counts')).eq(1)
    now = 105; UH.frame()
    expect(#UH.sent('ui_queue_counts')).eq(2)
    UH.recv('net_status', { hub = 'offline', account = { name = 'Alice', avatarUrl = nil } })
    now = 111; UH.frame()
    expect(#UH.sent('ui_queue_counts')).eq(2)           -- offline: no poll
    UH.recv('net_status', { hub = 'connected', account = { name = 'Alice', avatarUrl = nil } })
    UH.frame()
    expect(#UH.sent('ui_queue_counts')).eq(3)
    U.go('pvp'); now = 200; UH.frame()
    expect(#UH.sent('ui_queue_counts')).eq(3)           -- left the page: stopped
    U.go('find'); now = 201; UH.frame()
    expect(#UH.sent('ui_queue_counts')).eq(4)           -- back: polls at once
    G.STAGE = G.STAGES.RUN
    now = 300; UH.frame()
    expect(#UH.sent('ui_queue_counts')).eq(4)           -- not at the main menu
  end)

  it('queue_counts updates the boxes in place; unknown modes and junk are ignored', function()
    U.go('find'); UH.frame()
    local top = U.boxes.top.definition
    local q = UH.find(top, 'mp_find_pvp_royale_queued').config
    local g = UH.find(top, 'mp_find_pvp_royale_ingame').config
    expect(q.ref_table[q.ref_value]).eq('-')
    expect(UH.recv('queue_counts', { counts = {
      { queueMode = 'pvp_royale', queued = 3, inGame = 12 }, { queueMode = 'pvp_nemesis', queued = 0, inGame = 2 } } })).truthy()
    expect(q.ref_table[q.ref_value]).eq('3')
    expect(g.ref_table[g.ref_value]).eq('12')
    expect(U.pillars.counts.pvp_nemesis.inGame).eq('2')
    -- the protocol refuses malformed counts before they reach the UI
    expect(UH.recv('queue_counts', { counts = { { queueMode = 'pvp_royale', queued = -1, inGame = 0 } } })).falsy()
    expect(UH.recv('queue_counts', { counts = { { queueMode = 'nope', queued = 1, inGame = 0 } } })).falsy()
    expect(q.ref_table[q.ref_value]).eq('3')
    U.pillars.on_counts({ counts = { { queueMode = 'pvp_ranked', queued = 9, inGame = 9 } } })
    expect(q.ref_table[q.ref_value]).eq('3')
  end)
end)

describe('ui The Order explainer (A13)', function()
  before_each(boot)
  after_each(UH.teardown)

  local function load_desc()
    local J = require 'spec.json_fixture'
    local extra = J.read_file(RMH_SPEC.root .. 'data/balatro-mp/extra-strings.en-us.json')
    G.localization.descriptions.Other = G.localization.descriptions.Other or {}
    for k, v in pairs(extra.descriptions.Other) do G.localization.descriptions.Other[k] = v end
  end

  it('every Find Game pillar has "Uses The Order"; it opens the explainer at page 1, tab 1', function()
    load_desc()
    U.go('find'); UH.frame()
    local top = U.boxes.top.definition
    for _, q in ipairs(U.theme.QUEUE_MODES) do expect(UH.enabled(top, 'mp_find_' .. q.mode .. '_order')).truthy() end
    expect(UH.has_text(top, 'The Order')).truthy()
    U.order_info.st.page, U.order_info.st.tab = 5, 3
    UH.click(top, 'mp_find_pvp_teams_order')
    local def, name = UH.overlay()
    expect(name).eq('the_order')
    expect(UH.has_text(def, "What Does 'The Order' Do?")).truthy()
    expect(UH.find(def, 'mp_order_title').config.text).eq('Uncommon Tag')
    expect(UH.has_text(def, 'Uncommon Joker Queue')).truthy()
    expect(UH.find(def, 'mp_order_tab_5') ~= nil).truthy()
    expect(UH.enabled(def, 'mp_order_tab_1')).falsy()   -- the open tab
  end)

  it('tabs and pages switch; colour markup becomes coloured text; cards are shown', function()
    load_desc()
    U.order_info.open()
    UH.click((UH.overlay()), 'mp_order_tab_3')
    local def = UH.overlay()
    expect(UH.find(def, 'mp_order_title').config.text).eq('Riff-raff / Top Up')
    UH.cycle(def, 'mp_order_pages', 5)
    def = UH.overlay()
    expect(U.order_info.st.page).eq(5)
    expect(U.order_info.st.tab).eq(1)
    expect(UH.find(def, 'mp_order_title').config.text).eq('Superposition +')
    expect(#UH.find_all(def, function(n) return n.n == G.UIT.O end) >= 1).truthy()
    local nodes = U.order_info.line_nodes('{C:attention}Uncommon Tags{} take {C:chips}queue{}', 0.33)
    expect(#nodes).eq(3)
    expect(nodes[1].config.text).eq('Uncommon Tags')
    expect(nodes[2].config.text).eq(' take ')
    expect(nodes[2].config.colour).eq(U.theme.ui_col('TEXT_LIGHT'))
    -- every page and tab has its text and title
    for p, page in ipairs(U.order_info.PAGES) do
      for t = 1, #page[2] do
        local d = G.localization.descriptions.Other['rmh_mp_to_p' .. p .. 't' .. t]
        expect(d ~= nil and #d.text > 0 and type(d.name) == 'string').truthy()
      end
    end
    expect(G.FUNCS.rmh_mp_order_page({ to_key = 99 })).eq(nil)
    expect(U.order_info.st.page).eq(5)
  end)

  it('without the description strings it still opens (titles fall back)', function()
    G.localization.descriptions.Other = {}
    local def = U.order_info.open()
    expect(UH.find(def, 'mp_order_title') ~= nil).truthy()
  end)
end)

describe('ui queue guard (A18)', function()
  before_each(boot)
  after_each(UH.teardown)

  local function searching() UH.recv('queue_view', { state = 'searching', queueMode = 'pvp_royale' }) end

  it('not searching: vanilla start_run runs untouched', function()
    G.FUNCS.start_run(nil, { stake = 1 })
    expect(#started).eq(1)
    expect(UH.overlay()).eq(nil)
  end)

  it('New Run / Continue / Challenge / restart while searching: the guard; Stay Queued keeps searching', function()
    searching()
    G.FUNCS.start_run({ config = { id = 'restart_button' } }, { stake = 2 })
    expect(#started).eq(0)
    local def, name = UH.overlay()
    expect(name).eq('queue_guard')
    expect(UH.has_text(def, 'Matchmaking In Progress')).truthy()
    expect(UH.has_text(def, 'Stay Queued')).truthy()
    UH.click(def, 'overlay_menu_back_button')
    expect(#started).eq(0)
    expect(#UH.sent('ui_queue')).eq(0)
    expect(U.model.queue.state).eq('searching')
    expect(G.OVERLAY_MENU).eq(nil)
  end)

  it('Leave Queue: the search ends, nothing starts', function()
    searching()
    G.FUNCS.start_run(nil, { savetext = {} })
    UH.click((UH.overlay()), 'mp_qguard_leave')
    expect(UH.sent('ui_queue')[1].d).eq({ op = 'leave', queueMode = 'pvp_royale' })
    expect(#started).eq(0)
    expect(U.queue_busy()).falsy()
    G.FUNCS.start_run(nil, { stake = 1 })
    expect(#started).eq(1)
  end)

  it('Leave Queue & Continue: the search ends, then the same run starts with its arguments', function()
    UH.recv('queue_view', { state = 'matched', queueMode = 'pvp_royale' })
    local e = { config = { id = 'x' } }
    G.FUNCS.start_run(e, { stake = 3, seed = 'ABC' })
    UH.click((UH.overlay()), 'mp_qguard_leave_play')
    expect(#UH.sent('ui_queue')).eq(1)
    expect(#started).eq(1)
    expect(started[1].e).eq(e)
    expect(started[1].args).eq({ stake = 3, seed = 'ABC' })
  end)

  it("MP's own launches and session runs pass while searching", function()
    searching()
    MP.session.launching = true
    G.FUNCS.start_run(nil, { stake = 1 })
    MP.session.launching = nil
    expect(#started).eq(1)
    MP.state.session = { kind = 'practice' }
    G.FUNCS.start_run(nil, { stake = 1 })
    MP.state.session = nil
    expect(#started).eq(2)
  end)

  it('CREATE while searching opens the guard; Leave Queue & Continue creates the lobby', function()
    U.go('create'); UH.frame()
    searching()
    UH.click(U.boxes.top.definition, 'mp_create_pvp_teams')
    expect(#UH.sent('ui_create_lobby')).eq(0)
    expect(select(2, UH.overlay())).eq('queue_guard')
    UH.click((UH.overlay()), 'mp_qguard_leave_play')
    expect(UH.sent('ui_create_lobby')[1].d).eq({ queueMode = 'pvp_teams', kind = 'private' })
  end)
end)
