-- L2 in-engine crash sweep: nothing reachable in Multiplayer may take the game down.
--
-- With the MP pack mounted, in a fresh menu and inside MP sessions (a practice run, and a match
-- run with the referee's messages injected as ui_run_spec does), this file
--   * opens every Collection page — the vanilla tabs (every page of each) and every MP collection
--     tab — and hovers every card on it (tooltips: generate_card_ui / loc_vars for every center);
--   * clicks every button of every MP screen and overlay, and of the vanilla overlays reachable from
--     a run, found by walking the UIBox tree (every node with config.button that names a G.FUNCS
--     entry), each from a freshly opened screen, then backs out — new buttons are covered without
--     touching this file;
--   * gives and uses / triggers every MP joker, consumable, trap, tag, voucher and blind, with an
--     empty hand and with a hand, and sells them.
-- A Lua error that escapes stops the game and fails the run (the harness crash reporter); errors a
-- click raises synchronously, and MP hook errors from the MP log, are collected and asserted empty,
-- so one run reports every crash. Counts come back as reports (`sweep_*`).
--
-- Two ways to run it:
--   * ui_sweep_spec.lua (the engine project, every CI run) loads this file in QUICK mode: the
--     collections in the menu and in a practice run (the Collection > Consumables crash) and
--     every MP menu screen's buttons (a few minutes in CI).
--   * the whole sweep (about an hour on software WebGL):
--       pnpm exec tsx testing/balatro-e2e/engine/cli.ts --spec ui_sweep_full [--filter text]
--     (not a *_spec file, so the engine project does not pick it up). FULL below (false) further
--     clicks repeated (callback, target) pairs on every screen instead of once per phase.

local has_mp, MP = pcall(require, 'rmh_mp')

local QUICK = RMH_SWEEP_QUICK == true
local QUICK_TESTS = {
  ['menu: every vanilla and MP collection page, every card hovered'] = true,
  ['practice run: the same, mid-run'] = true,
  ['every screen: every button'] = true,
  ['leaves the MP menu cleanly'] = true,
  ['summary: counts, buttons and every error seen'] = true,
}
local it_ = it
local function it(name, fn)
  if QUICK and not QUICK_TESTS[name] then return end
  return it_(name, fn)
end

if not has_mp then
  describe('ui sweep (in-engine)', function()
    xit('needs the MP pack (?mp=1): ' .. tostring(MP):sub(1, 120), function() end)
  end)
  return
end

local SEED = 'RMHSWEEP'
local found = {}            -- every error seen: 'where: message'
local count = { clicks = 0, hovers = 0, used = 0, given = 0, pages = 0, screens = 0 }
local seen_buttons = {}
local phase = 'menu'          -- menu | practice | match (what the hover dedupe keys on)

local function note(where, err)
  local msg = where .. ': ' .. tostring(err):sub(1, 300)
  print('[sweep-note] ' .. msg)
  for _, m in ipairs(found) do if m == msg then return end end
  found[#found + 1] = msg
end

local log_mark = 0
local function harvest_log(where)
  local ring = MP.log_ring or {}
  for i = 1, #ring do
    local l = ring[i]
    if l.level == 'error' and not l._swept then
      l._swept = true
      note('log@' .. where, l.msg)
    end
  end
  log_mark = #ring
end

local TRACE = not QUICK -- print each step ('[sweep] …' in the engine log) to find a hang or a crash site
local function trace(where)
  if not TRACE then return end
  if where:find('hover', 1, true) then return print('[sweep] ' .. where) end
  -- memory with every step: a leak shows up as a climb, an out-of-memory page as the last line
  local tex = love.graphics and love.graphics.getStats and love.graphics.getStats()
  print(string.format('[sweep] %s [lua %.1f MB, tex %.0f MB, cards %d, moveables %d]', where, collectgarbage('count') / 1024,
    tex and (tex.texturememory or 0) / 1048576 or -1, #(G.I and G.I.CARD or {}), #(G.MOVEABLES or {})))
end

-- Protected AND able to wait: steps that wait frames (opening a screen, AP.run) cannot run under
-- pcall in Lua 5.1 (no yield across it); the scheduler's protected() runs them in a coroutine.
local sched = require('rmh_mp_test.sched')
local function try(where, fn, ...)
  trace(where)
  local ok, err = sched.protected(fn, ...)
  if not ok then
    local msg = tostring(err):match('^[^\n]*')
    -- An autopilot step times out on wall-clock seconds; on a loaded machine (software WebGL) the
    -- game can simply be slow. Only a game that does not settle within ten more minutes is a finding.
    if fn == AP.run and msg:find('timeout', 1, true) then
      local settled = sched.protected(wait_until, function() return AP.idle() end, 600, 'settle after ' .. where)
      if settled then trace('slow: ' .. where); return false, err end
    end
    note(where, msg)
  end
  return ok, err
end

-- The lobby referee, faked: an option/team change a click sent comes back as the next lobby view
-- (so every ruleset, layer toggle and cycle value is rendered, not only sent). Filled by mp_boot.
local echoes = {}
--- End of a test: every error it collected is reported and fails it (then the list starts over).
local all_found = {}
local function clean(where)
  harvest_log(where)
  local f = found
  found = {}
  for _, m in ipairs(f) do all_found[#all_found + 1] = m; print('[sweep-error] ' .. m) end
  if #f > 0 then report('errors ' .. where, f) end
  expect(f).eq({})
end

local function settle(n)
  while #echoes > 0 do
    local e = table.remove(echoes, 1)
    pcall(e)
  end
  wait_frames(n or 3)
end

-- ── session helpers ──────────────────────────────────────────────────────────

local function all_layers()
  local set, out = {}, {}
  for _, d in ipairs(MP.registry.defs()) do
    for _, l in ipairs((d.gate and d.gate.layers) or {}) do
      if not set[l] then set[l] = true; out[#out + 1] = l end
    end
  end
  table.sort(out)
  return out
end

local function resolved(layers)
  return {
    key = 'ruleset_mp_sweep', layers = layers or all_layers(), multiplayerContent = true, banned = {}, bannedSilent = {},
    included = {}, reworked = {}, spectralBannedEnhancements = {}, stickers = {}, gameModifiers = {},
    startingParams = {}, setupHooks = {},
    flags = { theOrder = true, enemyLocationDisabled = false, timerDisplayThreshold = nil, comeback = 'default' },
    timer = { enabled = true, base = 150, increment = 60, forgiveness = 0, pvpHandIncrement = 0, mode = 'default',
      pressurePlusHand = 0, countdown = 3, mult = 1 },
  }
end

local hs = 1000
local function outcome(o)
  hs = hs + 1
  MP.net.receive('outcome', { hs = hs, o = o })
end

local function close_overlay()
  if G.OVERLAY_MENU and G.FUNCS.exit_overlay_menu then try('exit_overlay_menu', G.FUNCS.exit_overlay_menu) end
  if G.CONTROLLER then G.CONTROLLER.text_input_hook = nil; G.CONTROLLER.text_input_id = nil end
end

local function leave()
  close_overlay()
  if MP.state.session then MP.session.unmount('test') end
end

local function to_menu()
  leave()
  phase = 'menu'
  if G.STAGE ~= G.STAGES.MAIN_MENU then AP.run('to_menu') end
  wait_until(function() return G.STAGE == G.STAGES.MAIN_MENU and G.MAIN_MENU_UI ~= nil and not G.screenwipe end, 60, 'menu')
end

-- MP.open loads the out-of-run and in-run UI the first time Multiplayer opens; a spec that mounts
-- a session directly loads them the same way (else the HUD, pause menu and end screens are absent).
local function load_ui()
  require('rmh_mp.ui.menu')
  require('rmh_mp.ui.hud')
end

local function practice(opts)
  opts = opts or {}
  load_ui()
  phase = 'practice'
  AP.run('prepare')
  leave()
  MP.practice_opts = MP.practice_opts or {}
  MP.practice_opts.unlimited_slots = true
  MP.practice_opts.show_inactive = true
  MP.session.mount('practice', {
    resolved = resolved(opts.layers), deck = opts.deck or 'b_red', stake = opts.stake or 1, seed = SEED, me = 'u_me',
    shape = { nemesisPairing = true, manhunt = false, teamBased = false, practice = true },
    options = { pvpStartRound = 2, theOrder = true, multiplayerJokers = true, timer = false },
  })
  MP.session.launch(SEED)
  -- A run launched while the previous transition (Main Menu from the pause menu) was still in
  -- flight used to get that transition's leftovers on top (an overlay, a paused game);
  -- session.launch now waits for the wipe. A paused overlay on the new run is a finding.
  -- A deck may open a pack before the first blind (Orange: a free Giga Standard Pack).
  wait_until(function()
    if G.OVERLAY_MENU and G.SETTINGS.paused and G.STAGE == G.STAGES.RUN and G.STATE == G.STATES.BLIND_SELECT then
      note('a new practice run', 'started under a paused overlay')
      close_overlay()
    end
    return AP.idle() and (G.STATE == G.STATES.BLIND_SELECT or (G.pack_cards ~= nil and #G.pack_cards.cards > 0))
  end, 120, 'blind select (or a starting pack)')
end

local function match(opts)
  opts = opts or {}
  load_ui()
  phase = 'match'
  AP.run('prepare')
  leave()
  MP.session.mount('match', {
    runId = 'sweep-run', seed = SEED, stake = 1, deck = opts.deck or 'b_red', queueMode = opts.queueMode or 'pvp_nemesis',
    shape = { nemesisPairing = true, manhunt = false, teamBased = false }, ruleset = 'ruleset_mp_balanced',
    layers = all_layers(), resolved = resolved(), hostId = 'u_me', me = 'u_me', contentHash = 'x',
    options = { pvpStartRound = 1, theOrder = true, multiplayerJokers = true, timer = true, startingLives = 4,
      pvpCountdownSeconds = 3, deathOnRoundLoss = true },
    roster = { { id = 'u_me', name = 'Alice', blindCol = 1, avatarJoker = 'j_joker' },
      { id = 'u_them', name = 'Bob', blindCol = 7, avatarJoker = 'j_joker' } },
  })
  MP.session.launch(SEED)
  AP.run('wait_state', { 'BLIND_SELECT' })
  outcome({ t = 'player_lives', player_id = '*all*', lives = 4 })
  outcome({ t = 'nemesis_pairing', ante = 1, pairing = { u_me = 'u_them', u_them = 'u_me' } })
  MP.state.lives.u_them = 4
  settle(2)
end

-- ── generic UI walking ───────────────────────────────────────────────────────

local function visible(node)
  local n = node
  while n do
    if n.states and n.states.visible == false then return false end
    n = n.parent
  end
  return true
end

--- Every clickable node of a UIBox, in tree order: { node, button, id }.
local function buttons_of(box)
  local out = {}
  local function walk(n, depth)
    if type(n) ~= 'table' or depth > 60 then return end
    local cfg = n.config
    if cfg and type(cfg.button) == 'string' and type(G.FUNCS[cfg.button]) == 'function' and visible(n) then
      out[#out + 1] = { node = n, button = cfg.button, id = cfg.id }
    end
    -- an object node (a nested UIBox, e.g. a tab's contents) is walked too
    if cfg and type(cfg.object) == 'table' and cfg.object.UIRoot then walk(cfg.object.UIRoot, depth + 1) end
    for _, c in ipairs(n.children or {}) do walk(c, depth + 1) end
  end
  if box and box.UIRoot then walk(box.UIRoot, 0) end
  return out
end

-- Buttons the walker never presses: they quit the game, wipe or switch the profile, change the
-- window/language (asset reloads), open external links, or start a vanilla run outside MP.
local DENY = {
  quit = true, quit_cta = true, load_profile = true, delete_profile = true, unlock_all = true,
  reset_achievements = true, apply_window_changes = true, change_lang = true, warn_lang = true,
  go_to_playbalatro = true, go_to_discord = true, go_to_discord_loc = true, go_to_twitter = true,
  wishlist_steam = true, louisf_insta = true, demo_survey = true, loc_survey = true, go_to_demo_cta = true,
  show_main_cta = true, start_tutorial = true, profile_select = true, language_selection = true,
  start_setup_run = true, start_challenge_run = true, test_framework = true,
}
-- option_cycle callbacks that touch the window or the language
local DENY_CYCLE = {
  change_screenmode = true, change_screen_resolution = true, change_display = true, change_vsync = true,
  change_window_cycle_UI = true, change_lang = true,
}

local function deny(b)
  if DENY[b.button] then return true end
  local ref = b.node.config.ref_table
  if b.button == 'option_cycle' and type(ref) == 'table' and DENY_CYCLE[ref.opt_callback] then return true end
  return false
end

-- A tooltip is built per (phase, center, edition/seal, area kind); the same one again adds nothing
-- but frames, so each combination is hovered once per phase (menu / practice / match).
local hovered = {}
local function hover_cards(where)
  local list = {}
  for _, c in ipairs(G.I.CARD or {}) do list[#list + 1] = c end
  for _, c in ipairs(list) do
    if not c.REMOVED and c.states and c.states.visible ~= false and c.ability then
      local key = c.config and c.config.center and c.config.center.key or '?'
      local area = c.area and c.area.config and (c.area.config.collection and 'coll' or c.area.config.type) or 'none'
      local sig = table.concat({ phase, key, tostring(c.edition and c.edition.type), tostring(c.seal),
        tostring(c.ability.set), area, tostring(c.debuff) }, '|')
      if c.playing_card then sig = phase .. '|playing|' .. area end
      if not hovered[sig] then
        hovered[sig] = true
        count.hovers = count.hovers + 1
        try('hover ' .. where .. ' ' .. key, function() c:hover(); c:stop_hover() end)
      end
    end
  end
end

--- Click every button of the box get_box() returns after open() — each from a freshly opened
--- screen — then restore with back(). `max` bounds very long lists (cycles repeat their arrows).
-- What a click does is decided by its callback and the target it names (the toggle's field, the
-- cycle's callback and direction, the node id): the same pair again on another screen of the same
-- phase adds nothing but minutes. FULL = true clicks every node of every screen (exhaustive run).
local FULL = false
local clicked = {}
local function signature(b)
  local cfg = b.node.config
  local ref = cfg.ref_table
  local extra = ''
  if b.button == 'option_cycle' and type(ref) == 'table' then
    extra = tostring(ref.opt_callback) .. ':' .. tostring(cfg.ref_value)
  elseif type(ref) == 'table' then
    extra = tostring(ref.ref_value or ref.id or ref.key or ref.ruleset or ref.option or '')
  end
  return table.concat({ phase, b.button, tostring(b.id), extra }, '#')
end

local function sweep(where, open, get_box, back, opts)
  opts = opts or {}
  local ok = try(where .. ' open', open)
  if not ok then return 0 end
  settle()
  local list = buttons_of(get_box())
  count.screens = count.screens + 1
  local n = 0
  for i, b in ipairs(list) do
    local sig = signature(b)
    if not deny(b) and not (opts.skip and opts.skip[b.button]) and (FULL or opts.all or not clicked[sig]) then
      clicked[sig] = true
      if i > 1 then try(where .. ' reopen', open); settle(2) end
      local now = buttons_of(get_box())
      local cur = now[i]
      if cur and cur.button == b.button then
        local label = where .. ' [' .. b.button .. (b.id and ('#' .. tostring(b.id)) or '') .. ']'
        seen_buttons[b.button] = (seen_buttons[b.button] or 0) + 1
        count.clicks = count.clicks + 1
        n = n + 1
        try(label, G.FUNCS[b.button], cur.node)
        settle(3)
        if opts.hover then hover_cards(label) end
        if G.CONTROLLER then G.CONTROLLER.text_input_hook = nil end
        harvest_log(label)
        if back then try(where .. ' back', back); settle(2) end
      end
    end
  end
  return n
end

-- ── collections ──────────────────────────────────────────────────────────────

local VANILLA_PAGES = {
  { 'your_collection_jokers', 'your_collection_joker_page' },
  { 'your_collection_tarots', 'your_collection_tarot_page' },
  { 'your_collection_planets' },
  { 'your_collection_spectrals', 'your_collection_spectral_page' },
  { 'your_collection_vouchers', 'your_collection_voucher_page' },
  { 'your_collection_boosters', 'your_collection_booster_page' },
  { 'your_collection_decks' }, { 'your_collection_enhancements' }, { 'your_collection_seals' },
  { 'your_collection_editions' }, { 'your_collection_tags' }, { 'your_collection_blinds' },
}

local function cycle_options()
  local box = G.OVERLAY_MENU
  for _, b in ipairs(buttons_of(box)) do
    if b.button == 'option_cycle' and type(b.node.config.ref_table) == 'table' then return b.node.config.ref_table end
  end
end

local function vanilla_collection(where)
  try(where .. ' your_collection', G.FUNCS.your_collection, {})
  settle()
  for _, p in ipairs(VANILLA_PAGES) do
    local ok = try(where .. ' ' .. p[1], G.FUNCS[p[1]], {})
    settle(4)
    count.pages = count.pages + 1
    if ok then
      hover_cards(where .. ' ' .. p[1])
      local cyc = cycle_options()
      if p[2] and cyc and cyc.options then
        for page = 2, #cyc.options do
          try(where .. ' ' .. p[2] .. ' ' .. page, G.FUNCS[p[2]], { cycle_config = { current_option = page }, to_key = page })
          settle(3)
          count.pages = count.pages + 1
          hover_cards(where .. ' ' .. p[2] .. ' ' .. page)
        end
      end
      -- the deck page (and stake) are option cycles on cards of their own
      if p[1] == 'your_collection_decks' and cyc then
        sweep(where .. ' decks', function() G.FUNCS.your_collection_decks({}) end, function() return G.OVERLAY_MENU end)
      end
    end
    harvest_log(where .. ' ' .. p[1])
  end
  close_overlay()
end

local function mp_collection(where)
  require('rmh_mp.ui.menu')
  local CO = MP.ui.collection
  for _, tab in ipairs(CO.TABS) do
    local _, pages = CO.tab_def(tab, 1)
    for page = 1, pages do
      CO.st.tab, CO.st.page = tab.id, page
      try(where .. ' mp collection ' .. tab.id .. ' p' .. page, CO.open)
      settle(4)
      count.pages = count.pages + 1
      hover_cards(where .. ' mp ' .. tab.id .. ' p' .. page)
    end
    harvest_log(where .. ' mp collection ' .. tab.id)
  end
  -- and its own buttons (tabs and the page cycle)
  sweep(where .. ' mp collection', function() CO.st.tab, CO.st.page = 'jokers', 1; CO.open() end,
    function() return G.OVERLAY_MENU end, nil, { hover = true })
  close_overlay()
end

describe('sweep: collections', function()
  it('menu: every vanilla and MP collection page, every card hovered', function()
    to_menu()
    vanilla_collection('menu')
    mp_collection('menu')
    settle(10)
    harvest_log('menu collections')
    report('sweep_collection_menu', { pages = count.pages, hovers = count.hovers })
    clean('menu every vanilla and mp collection pag')
  end)

  it('practice run: the same, mid-run', function()
    practice()
    vanilla_collection('practice')
    mp_collection('practice')
    settle(10)
    harvest_log('practice collections')
    clean('practice run the same mid run')
  end)

  it('match run: the same, mid-run', function()
    match()
    vanilla_collection('match')
    mp_collection('match')
    settle(10)
    harvest_log('match collections')
    leave()
    clean('match run the same mid run')
  end)
end)

-- ── MP menu screens and overlays ────────────────────────────────────────────

local U
local sent = {}
local function recv(t, d)
  local ok = MP.net.receive(t, d)
  if not ok then note('receive ' .. t, 'refused') end
end

local function mp_boot()
  require('rmh_mp.ui.menu')
  U = MP.ui
  -- intents are captured (no mailbox reader in the harness); restored by the last test
  MP.net._sweep_real_transport = MP.net._sweep_real_transport or MP.net.transport
  MP.net.transport = { send = function(t, d)
    sent[#sent + 1] = { t = t, d = d }
    local lobby = U.model.lobby
    if lobby and type(d) == 'table' and (t == 'ui_set_option' or t == 'ui_set_team') then
      echoes[#echoes + 1] = function()
        local v = U.model.lobby
        if not v then return end
        local st = v.state
        if t == 'ui_set_option' and d.key then st.options[d.key] = d.value end
        if t == 'ui_set_team' then
          for _, p in ipairs(st.players) do if p.id == v.me then p.team = d.team end end
        end
        st.version = (st.version or 0) + 1
        recv('lobby_view', v)
      end
    end
  end, on = function() end }
  recv('net_status', { hub = 'connected', account = { name = 'Sweep Tester', avatarUrl = nil } })
end

local function player(i, over)
  local p = { id = 'u_p' .. i, name = 'Player ' .. i, avatarUrl = nil, avatarJoker = 'j_joker', blindCol = ((i - 1) % 25) + 1,
    joinedAt = 1761799900000 + i, ready = i % 2 == 0, connected = true, away = i == 3, catchingUp = false, role = 'player',
    conn = 'direct' }
  for k, v in pairs(over or {}) do p[k] = v end
  return p
end

local OPTIONS = {
  ruleset = 'ruleset_mp_balanced', gamemode = 'gamemode_mp_attrition', trapCards = true, manhuntHunterLives = 7,
  startingLives = 4, pvpStartRound = 2, timer = true, timerBaseSeconds = 150, timerIncrementSeconds = 60, timerForgiveness = 0,
  pvpCountdownSeconds = 3, deathOnRoundLoss = true, goldOnLifeLoss = true, noGoldOnRoundLoss = false, customSeed = 'random',
  theOrder = true, hideScoreUntilPlayed = false, normalBosses = false, differentSeeds = false, differentDecks = false,
  randomLoadout = false, multiplayerJokers = true, modifierLayers = {}, seatGraceMs = 120000,
}

local version = 0
local function view(n, over)
  over = over or {}
  version = version + 1
  local players = {}
  for i = 1, n do players[i] = player(i, { team = over.teams and (i % 2 == 0 and 'B' or 'A') or nil }) end
  local opts = {}
  for k, v in pairs(OPTIONS) do opts[k] = v end
  for k, v in pairs(over.options or {}) do opts[k] = v end
  local state = { code = 'SWP234', kind = over.kind or 'private', queueMode = over.queueMode or 'pvp_nemesis',
    hostId = 'u_p1', successorId = nil, version = version, open = true, players = players,
    options = opts, deck = 'b_red', stake = 1, mpStake = nil, challenge = nil, started = nil, setup = nil,
    kicked = {}, forfeited = {} }
  local me = over.me or 'u_p1'
  return { state = state, me = me, isHost = me == 'u_p1', canStart = over.canStart ~= false }
end

local function main_boxes()
  local out = {}
  for _, name in ipairs({ 'bar', 'top', 'panel' }) do
    local b = U.boxes[name]
    if b and not b.REMOVED then out[#out + 1] = { name, b } end
  end
  return out
end

--- Bring the menu back to `screen` with `lobby` (a view or nil), leaving any run a click started.
local function restore(screen, lobby, extra)
  close_overlay()
  if MP.replay and MP.replay.player and MP.replay.player.s then pcall(MP.replay.player.close, true) end
  if MP.state.session or G.STAGE ~= G.STAGES.MAIN_MENU then to_menu() end
  if U.screen == nil or not U.boxes.panel then MP.open('menu'); settle(2) end
  if lobby then recv('lobby_view', lobby) else U.model.lobby = nil; MP.state.lobby = nil end
  -- a queue a click joined would disable the practice pillars: every screen starts idle
  recv('queue_view', { state = 'idle', queueMode = 'pvp_nemesis' })
  if extra then extra() end
  U.go(screen)
  settle(3)
end

local function sweep_screen(where, screen, lobby, extra)
  restore(screen, lobby, extra)
  for _, nb in ipairs(main_boxes()) do
    local bname = nb[1]
    sweep(where .. ' ' .. bname, function() restore(screen, lobby, extra) end,
      function() return U.boxes[bname] end, nil, { hover = true })
  end
end

local function sweep_overlay(where, open, setup)
  sweep(where, function()
    close_overlay()
    if setup then setup() end
    open()
  end, function() return G.OVERLAY_MENU end, function()
    -- a click that started a run (practice SELECT, WATCH) is left for the menu again
    if MP.state.session or G.STAGE ~= G.STAGES.MAIN_MENU or (MP.replay and MP.replay.player and MP.replay.player.s) then
      if MP.replay and MP.replay.player and MP.replay.player.s then pcall(MP.replay.player.close, true) end
      to_menu()
      MP.open('menu')
      settle(2)
    end
  end, { hover = true })
  close_overlay()
end

describe('sweep: MP menu', function()
  it('every screen: every button', function()
    to_menu()
    mp_boot()
    sweep_screen('pvp', 'pvp')
    sweep_screen('create', 'create')
    sweep_screen('find', 'find')
    sweep_screen('practice', 'practice')
    sweep_screen('pvp searching', 'pvp', nil, function()
      recv('queue_view', { state = 'searching', queueMode = 'pvp_teams', waiting = 3 })
    end)
    recv('queue_view', { state = 'idle', queueMode = 'pvp_nemesis' })
    sweep_screen('lobby host', 'lobby', view(4))
    sweep_screen('lobby member', 'lobby', view(3, { me = 'u_p2', canStart = false }))
    sweep_screen('lobby 20', 'lobby', view(20))
    sweep_screen('lobby empty', 'lobby', view(0))
    sweep_screen('lobby party', 'lobby', view(3, { kind = 'party' }))
    sweep_screen('lobby teams', 'lobby', view(4, { queueMode = 'pvp_teams', teams = true }))
    sweep_screen('lobby manhunt', 'lobby', view(3, { queueMode = 'pvp_manhunt', options = { ruleset = 'ruleset_mp_chaos' } }))
    sweep_screen('lobby vote', 'lobby', view(2, { kind = 'casual' }), function()
      recv('setup_view', { stepId = 'e1', kind = 'ruleset_vote', phase = 'voting', msLeft = 15000,
        options = { { id = 'ruleset_mp_vanilla' }, { id = 'ruleset_mp_balanced' } }, voted = 0, voters = 2 })
    end)
    sweep_screen('lobby draft', 'lobby', view(2, { kind = 'casual' }), function()
      local tiles = {}
      for i, d in ipairs({ 'b_red', 'b_blue', 'b_yellow', 'b_green' }) do tiles[i] = { deck = d, stake = i, state = 'open' } end
      recv('setup_view', { stepId = 'e3', kind = 'draft', phase = 'voting', msLeft = 30000, options = {}, voted = 0, voters = 2,
        draft = { tiles = tiles, actor = 'u_p1', action = 'ban', remaining = 1 } })
    end)
    harvest_log('mp screens')
    clean('every screen every button')
  end)

  it('every overlay: every button, every tab', function()
    to_menu()
    mp_boot()
    restore('lobby', view(4))
    local LO = U.lobby_options
    for _, tab in ipairs({ 'general', 'advanced', 'modifiers' }) do
      for _, rs in ipairs({ 'ruleset_mp_balanced', 'ruleset_mp_majorleague', 'ruleset_mp_chaos', 'ruleset_mp_vanilla' }) do
        sweep_overlay('lobby options ' .. tab .. ' ' .. rs, function() LO.st.tab = tab; LO.open() end,
          function() recv('lobby_view', view(4, { options = { ruleset = rs } })) end)
      end
    end
    sweep_overlay('lobby options manhunt', function() LO.st.tab = 'general'; LO.open() end,
      function() recv('lobby_view', view(3, { queueMode = 'pvp_manhunt' })) end)
    sweep_overlay('lobby options teams', function() LO.st.tab = 'general'; LO.open() end,
      function() recv('lobby_view', view(4, { queueMode = 'pvp_teams', teams = true })) end)
    recv('lobby_view', view(4))
    sweep_overlay('run setup lobby challenges', function() U.run_setup.open('lobby', { tab = 'challenges' }) end)
    sweep_overlay('run setup lobby', function() U.run_setup.open('lobby') end)
    for _, rs in ipairs({ 'ruleset_mp_vanilla', 'ruleset_mp_balanced', 'ruleset_mp_sandbox', 'ruleset_mp_experimental' }) do
      sweep_overlay('run setup practice ' .. rs, function() U.run_setup.open('practice', { ruleset = rs }) end)
    end
    sweep_overlay('player overlay', function() U.lobby.player_overlay('u_p2') end)
    sweep_overlay('settings', function() U.settings.open() end,
      function() recv('history', { wins = 3, losses = 1, games = 4, pvpGames = 4, streak = 2, days = 1 }) end)
    sweep_overlay('join code', function() U.overlays.join_code() end)
    sweep_overlay('leave confirm', function() U.confirm_leave() end)
    sweep_overlay('shortcuts', function() U.shortcuts.open() end)
    for _, code in ipairs({ 'version-mismatch', 'seat-held:SWP234', 'kicked', 'clipboard-empty', 'lobby-full', 'bogus' }) do
      sweep_overlay('notice ' .. code, function() recv('lobby_error', { code = code }) end)
    end
    sweep_overlay('rejoin notice', function() MP.open('rejoin') end)
    local list = {}
    for i = 1, 8 do
      list[i] = { id = 'r' .. i, at = 1761799900000 + i, players = { 'Alice', 'Bob' }, queueMode = 'pvp_nemesis',
        result = ({ 'win', 'lose', 'draw' })[i % 3 + 1], ruleset = 'ruleset_mp_balanced' }
      if i == 3 then list[i].result = nil end
    end
    recv('replay_view', { list = list })
    sweep_overlay('replays', function() U.replay_open() end)
    recv('spectate_view', { lobbies = { { code = 'AAA222', ante = 3, players = 2, queueMode = 'pvp_nemesis' },
      { code = 'BBB333', ante = nil, players = 4, queueMode = 'pvp_royale' } } })
    sweep_overlay('spectate', function() U.replay.open('spectate') end)
    recv('spectate_view', { lobbies = {}, error = 'timeout' })
    sweep_overlay('spectate error', function() U.replay.open('spectate') end)
    sweep_overlay('mp collection', function() U.collection.open() end)
    -- chat (a box of its own)
    recv('chat_line', { from = 'u_p2', name = 'Player 2', text = 'gl', kind = 'in' })
    U.chat.open()
    settle()
    if U.chat.box then
      sweep('chat', function() if not U.chat.box then U.chat.open() end end, function() return U.chat.box end)
    end
    U.chat.close()
    harvest_log('mp overlays')
    clean('every overlay every button every tab')
  end)

  it('leaves the MP menu cleanly', function()
    close_overlay()
    U.leave_lobby()
    U.close()
    settle()
    if MP.net._sweep_real_transport then MP.net.transport = MP.net._sweep_real_transport; MP.net._sweep_real_transport = nil end
    expect(G.MAIN_MENU_UI:get_UIE_by_ID('main_menu_play') ~= nil).truthy()
    clean('leaves the mp menu cleanly')
  end)
end)

-- ── in-run screens ───────────────────────────────────────────────────────────

local function idle() return AP.idle == nil or AP.idle() end

--- What keeps the game busy: controller locks, the state, the blocking events (by source line).
local function busy_reason()
  local out = { 'state=' .. tostring(G.STATE), 'complete=' .. tostring(G.STATE_COMPLETE),
    'paused=' .. tostring(G.SETTINGS.paused), 'overlay=' .. tostring(G.OVERLAY_MENU ~= nil) }
  if G.CONTROLLER.locked then out[#out + 1] = 'locked' end
  for k, v in pairs(G.CONTROLLER.locks or {}) do if v then out[#out + 1] = 'lock:' .. tostring(k) end end
  local q = G.E_MANAGER.queues and G.E_MANAGER.queues.base or {}
  local n, srcs = 0, {}
  for _, ev in ipairs(q) do
    if ev.blocking then
      n = n + 1
      local info = type(ev.func) == 'function' and debug and debug.getinfo and debug.getinfo(ev.func, 'S')
      local src = info and (info.short_src .. ':' .. tostring(info.linedefined)) or '?'
      srcs[src] = (srcs[src] or 0) + 1
    end
  end
  out[#out + 1] = 'blocking=' .. n
  for src, c in pairs(srcs) do out[#out + 1] = src .. 'x' .. c end
  return table.concat(out, ' ')
end

--- Wait until the game is idle; a game that never settles is a finding (an unresponsive game),
--- noted with what holds it, and the sweep goes on.
local function wait_idle(why, seconds)
  local ok = sched.protected(wait_until, function() return idle() end, seconds or 600, why or 'idle')
  if not ok then note('never idle after ' .. tostring(why), busy_reason()) end
  return ok
end

--- (Re)enter a practice/match run at blind select when a click left it.
local function ensure(kind, state)
  close_overlay()
  local ok_stage = G.STAGE == G.STAGES.RUN and MP.state.session and MP.state.session.kind == kind
    and not MP.state.result and G.STATE ~= G.STATES.GAME_OVER and (not state or G.STATE == G.STATES[state])
  if not ok_stage then
    if kind == 'practice' then practice() else match() end
  end
  wait_idle('run idle')
end

local function in_run_sweep(kind)
  local function back() ensure(kind) end
  ensure(kind)
  sweep(kind .. ' HUD', function() ensure(kind) end, function() return G.HUD end, back, { hover = true })
  sweep(kind .. ' pause', function() ensure(kind); G.FUNCS.options() end, function() return G.OVERLAY_MENU end, back,
    { hover = true })
  sweep(kind .. ' settings', function() ensure(kind); G.FUNCS.settings() end, function() return G.OVERLAY_MENU end, back)
  sweep(kind .. ' run info', function() ensure(kind); G.FUNCS.run_info() end, function() return G.OVERLAY_MENU end, back,
    { hover = true })
  sweep(kind .. ' deck info', function() ensure(kind); G.FUNCS.deck_info() end, function() return G.OVERLAY_MENU end, back,
    { hover = true })
  if kind == 'match' then
    sweep(kind .. ' lobby info', function() ensure(kind); G.FUNCS.mp_lobby_info() end, function() return G.OVERLAY_MENU end,
      back, { hover = true })
  end
  -- the blind choices (select / skip / reroll), each from a fresh blind select
  sweep(kind .. ' blind select', function()
    ensure(kind, 'BLIND_SELECT')
    wait_until(function() return G.blind_select and idle() end, 30, 'blind select')
  end, function() return G.blind_select end, function() wait_idle(); ensure(kind) end)
  -- the hand: play / discard / sort with a hand highlighted
  local function at_hand()
    if G.STATE ~= G.STATES.SELECTING_HAND or not MP.state.session then
      ensure(kind, 'BLIND_SELECT')
      AP.run('select_blind')
    end
  end
  at_hand()
  sweep(kind .. ' hand buttons', function()
    at_hand()
    wait_idle()
    G.hand:unhighlight_all()
    for i = 1, math.min(2, #G.hand.cards) do G.hand:add_to_highlighted(G.hand.cards[i]) end
  end, function() return G.buttons end, function() wait_idle() end, { hover = true })
  harvest_log(kind .. ' in-run')
end

local function end_screen_sweep()
  local function open()
    match()
    outcome({ t = 'win', winner_id = 'u_me' })
    wait_until(function() return G.OVERLAY_MENU ~= nil end, 30, 'end screen')
  end
  sweep('end screen win', open, function() return G.OVERLAY_MENU end, function() leave(); to_menu() end, { hover = true, all = true })
  sweep('end screen pending', function()
    match()
    outcome({ t = 'death_pending', player_id = 'u_me', blind_key = 'bl_small' })
    wait_until(function() return G.OVERLAY_MENU ~= nil end, 30, 'pending screen')
  end, function() return G.OVERLAY_MENU end, function() leave(); to_menu() end, { hover = true, all = true })
  sweep('end screen loss', function()
    match()
    outcome({ t = 'player_lives', player_id = 'u_me', lives = 0, lost = 4 })
    outcome({ t = 'lose', loser_id = 'u_me', winner_id = 'u_them' })
    outcome({ t = 'win', winner_id = 'u_them' })
    wait_until(function() return G.OVERLAY_MENU ~= nil end, 30, 'loss screen')
  end, function() return G.OVERLAY_MENU end, function() leave(); to_menu() end, { hover = true, all = true })
  harvest_log('end screens')
end

describe('sweep: in-run', function()
  it('practice: HUD, pause, settings, run/deck info, blind select, hand buttons', function()
    in_run_sweep('practice')
    leave()
    clean('practice hud pause settings run deck inf')
  end)
  it('match: the same plus lobby info', function()
    in_run_sweep('match')
    leave()
    clean('match the same plus lobby info')
  end)
  it('match end screens: every button', function()
    end_screen_sweep()
    to_menu()
    clean('match end screens every button')
  end)
end)

-- ── content: give / use / trigger every MP item ──────────────────────────────

local function defs_of(pred)
  local out = {}
  for _, d in ipairs(MP.registry.defs()) do if pred(d) then out[#out + 1] = d end end
  return out
end

local function give(key)
  local ok, card = try('give ' .. key, function()
    local c, why = MP.practice.give(key)
    if not c then error('not given: ' .. tostring(why)) end
    return c
  end)
  if ok then count.given = count.given + 1 end
  return ok and card or nil
end

local function use(card, where)
  if not (card and card.area and not card.REMOVED) then return false end
  local ok, can = try('can_use ' .. where, card.can_use_consumeable, card)
  if ok and can then
    count.used = count.used + 1
    try('use ' .. where, G.FUNCS.use_card, { config = { ref_table = card } })
    wait_idle('used ' .. where)
    settle(2)
    return true
  end
  return false
end

local function sell_all(area, where)
  local list = {}
  for _, c in ipairs((area and area.cards) or {}) do list[#list + 1] = c end
  for _, c in ipairs(list) do
    if not c.REMOVED and c.area == area then
      c.ability.eternal = nil
      try('sell ' .. where .. ' ' .. tostring(c.config.center.key), G.FUNCS.sell_card, { config = { ref_table = c } })
      wait_idle('sold ' .. tostring(c.config.center.key), 300)
    end
  end
  wait_idle('sold ' .. where)
  settle(4)
end

local function play_round()
  if G.STATE == G.STATES.BLIND_SELECT then try('select blind', AP.run, 'select_blind') end
  if G.STATE == G.STATES.SELECTING_HAND then
    try('play best', AP.run, 'play', { 'best' })
    if G.STATE == G.STATES.SELECTING_HAND and G.GAME.current_round.discards_left > 0 then
      try('discard', AP.run, 'discard', { { 1, 2 } })
    end
    if G.STATE == G.STATES.SELECTING_HAND then try('win blind', AP.run, 'win_blind') end
  end
  if G.STATE == G.STATES.ROUND_EVAL then try('cash out', AP.run, 'cash_out') end
end

describe('sweep: every MP item', function()

  -- Every giveable MP joker (the error decoys are never spawnable: MP.practice.allowed says so), in
  -- batches of 8 so a scored hand stays a few seconds even on software WebGL: each batch is given,
  -- scores a hand (or its round ends and it sees the shop), and is sold. Two runs (two halves) keep
  -- one run's memory small.
  local function joker_keys()
    local keys = {}
    for _, d in ipairs(defs_of(function(d) return d.kind == 'Joker' and MP.practice.allowed(d.key) end)) do
      keys[#keys + 1] = d.key
    end
    return keys
  end

  local function jokers_sweep(half)
    practice()
    AP.run('select_blind')
    local keys = joker_keys()
    local mid = math.floor(#keys / 2 / 8) * 8
    local from, to = 1, mid
    if half == 2 then from, to = mid + 1, #keys end
    for first = from, to, 8 do
      if G.STATE == G.STATES.SHOP then try('leave shop', AP.run, 'leave_shop') end
      if G.STATE == G.STATES.BLIND_SELECT then try('select blind', AP.run, 'select_blind') end
      for i = first, math.min(to, first + 7) do give(keys[i]) end
      settle(4)
      hover_cards('jokers held')
      if G.STATE == G.STATES.SELECTING_HAND and G.GAME.current_round.hands_left > 1 then
        try('play best', AP.run, 'play', { 'best' })
      else
        play_round()
      end
      if G.STATE == G.STATES.ROUND_EVAL then try('cash out', AP.run, 'cash_out') end
      if G.STATE == G.STATES.SHOP then G.GAME.dollars = 500; try('reroll', AP.run, 'reroll') end
      sell_all(G.jokers, 'jokers')
    end
    settle(10)
    leave()
  end

  it('jokers (first half): given, played with, through the shop, sold', function()
    jokers_sweep(1)
    clean('jokers first half')
  end)

  it('jokers (second half): given, played with, through the shop, sold', function()
    jokers_sweep(2)
    clean('jokers second half')
  end)

  it('consumables: used with a hand, with nothing highlighted, and with no hand at all', function()
    practice()
    AP.run('select_blind')
    local cons = defs_of(function(d)
      local c = G.P_CENTERS[d.key]
      return c and c.consumeable and d.kind ~= 'Trap'
    end)
    for _, d in ipairs(cons) do
      -- nothing highlighted
      G.hand:unhighlight_all()
      use(give(d.key), d.key .. ' (none highlighted)')
      if G.STATE ~= G.STATES.SELECTING_HAND then break end
      -- one and three highlighted
      for _, n in ipairs({ 1, 3 }) do
        G.hand:unhighlight_all()
        for i = 1, math.min(n, #G.hand.cards) do G.hand:add_to_highlighted(G.hand.cards[i]) end
        use(give(d.key), d.key .. ' (' .. n .. ' highlighted)')
      end
    end
    G.hand:unhighlight_all()
    sell_all(G.consumeables, 'consumables in hand')
    play_round()
    -- the shop: no hand
    for _, d in ipairs(cons) do use(give(d.key), d.key .. ' (shop)') end
    sell_all(G.consumeables, 'consumables in shop')
    -- an empty hand mid-blind
    try('leave shop', AP.run, 'leave_shop')
    AP.run('select_blind')
    for _, c in ipairs(G.hand.cards) do c.REMOVED_SWEEP = true end
    local held = {}
    for _, c in ipairs(G.hand.cards) do held[#held + 1] = c end
    for _, c in ipairs(held) do G.hand:remove_card(c); G.deck:emplace(c) end
    for _, d in ipairs(cons) do use(give(d.key), d.key .. ' (empty hand)') end
    sell_all(G.consumeables, 'consumables empty hand')
    leave()
    clean('consumables used with a hand with nothin')
  end)

  it('traps: planted on me by the nemesis and fired; held and offered from a trap pack', function()
    practice()
    local T = MP.traps
    for i, d in ipairs(defs_of(function(d) return d.kind == 'Trap' end)) do
      try('plant ' .. d.key, T.receive_plant, 'u_them', { card = { key = d.key }, owner = 'u_them', uid = 'sweep-' .. i })
      -- and the card itself, held (Traps are only usable from a pack: can_use is false here)
      local c = give(d.key)
      use(c, d.key .. ' (held)')
    end
    settle(5)
    hover_cards('traps')
    for _ = 1, 2 do play_round(); if G.STATE == G.STATES.SHOP then try('leave shop', AP.run, 'leave_shop') end end
    sell_all(G.consumeables, 'traps')
    -- a trap pack bought in the shop, every card picked
    play_round()
    if G.STATE == G.STATES.SHOP then
      G.GAME.dollars = 500
      for _, key in ipairs({ 'p_mp_trap_normal', 'p_mp_trap_jumbo', 'p_mp_standard_giga' }) do
        if G.STATE == G.STATES.SHOP and G.P_CENTERS[key] then
          local ok, card = try('shop pack ' .. key, function()
            local c = Card(G.shop_booster.T.x, G.shop_booster.T.y, G.CARD_W * 1.27, G.CARD_H * 1.27, G.P_CARDS.empty,
              G.P_CENTERS[key], { bypass_discovery_center = true, bypass_discovery_ui = true })
            create_shop_card_ui(c, 'Booster', G.shop_booster)
            G.shop_booster:emplace(c)
            return c
          end)
          if ok then
            try('open ' .. key, G.FUNCS.use_card, { config = { ref_table = card } })
            wait_until(function() return idle() and (G.pack_cards and #G.pack_cards.cards > 0) end, 60, 'pack open')
            settle(5)
            hover_cards('pack ' .. key)
            local first = G.pack_cards and G.pack_cards.cards[1]
            if first then
              if first.highlight then
                for i = 1, math.min(2, #G.hand.cards) do G.hand:add_to_highlighted(G.hand.cards[i]) end
              end
              try('pick ' .. key, G.FUNCS.use_card, { config = { ref_table = first } })
            end
            wait_idle('picked ' .. key)
            if G.STATE ~= G.STATES.SHOP and G.pack_cards then try('skip pack', G.FUNCS.skip_booster, { config = {} }) end
            wait_until(function() return G.STATE == G.STATES.SHOP and idle() end, 60, 'back in shop')
            count.used = count.used + 1
          end
        end
      end
    end
    leave()
    clean('traps planted on me by the nemesis and f')
  end)

  it('vouchers: redeemed from the shop', function()
    practice()
    play_round()
    expect(G.STATE).eq(G.STATES.SHOP)
    G.GAME.dollars = 500
    for _, d in ipairs(defs_of(function(d) return d.kind == 'Voucher' end)) do
      local ok, card = try('shop voucher ' .. d.key, function()
        local c = Card(G.shop_vouchers.T.x, G.shop_vouchers.T.y, G.CARD_W, G.CARD_H, G.P_CARDS.empty, G.P_CENTERS[d.key],
          { bypass_discovery_center = true, bypass_discovery_ui = true })
        create_shop_card_ui(c, 'Voucher', G.shop_vouchers)
        G.shop_vouchers:emplace(c)
        return c
      end)
      if ok then
        hover_cards('voucher ' .. d.key)
        try('redeem ' .. d.key, G.FUNCS.use_card, { config = { ref_table = card } })
        wait_idle('redeemed ' .. d.key)
        count.used = count.used + 1
      end
    end
    try('leave shop', AP.run, 'leave_shop')
    play_round()
    leave()
    clean('vouchers redeemed from the shop')
  end)

  it('tags: every MP tag added and triggered', function()
    practice()
    for _, d in ipairs(defs_of(function(d) return d.kind == 'Tag' end)) do
      try('add tag ' .. d.key, function() add_tag(Tag(d.key, false, 'Small')) end)
      count.used = count.used + 1
    end
    settle(5)
    for _, t in ipairs(G.GAME.tags or {}) do
      if t.HUD_tag then try('hover tag ' .. t.key, function() t.HUD_tag:hover(); t.HUD_tag:stop_hover() end) end
    end
    try('skip blind', AP.run, 'skip_blind')
    for _ = 1, 2 do play_round(); if G.STATE == G.STATES.SHOP then try('leave shop', AP.run, 'leave_shop') end end
    leave()
    clean('tags every mp tag added and triggered')
  end)

  it('decks: a run on every MP deck plays a round', function()
    for _, d in ipairs(defs_of(function(d) return d.kind == 'Back' end)) do
      local ok = try('deck ' .. d.key, practice, { deck = d.key })
      if ok then
        count.used = count.used + 1
        hover_cards('deck ' .. d.key)
        if G.pack_cards and #G.pack_cards.cards > 0 and G.STATE ~= G.STATES.BLIND_SELECT then
          try('pick from the starting pack', AP.run, 'pick', { 1 })
          if G.pack_cards and #G.pack_cards.cards > 0 and G.STATE ~= G.STATES.BLIND_SELECT then
            try('skip the starting pack', function() G.FUNCS.skip_booster({ config = {} }) end)
          end
          wait_idle('starting pack closed')
        end
        play_round()
        if G.STATE == G.STATES.SHOP then try('leave shop', AP.run, 'leave_shop') end
      end
      harvest_log('deck ' .. d.key)
    end
    leave()
    clean('decks a run on every mp deck plays a rou')
  end)

  it('MP stakes: a run at every MP stake', function()
    local stakes = (MP.content.stakes and MP.content.stakes.LIST) or {}
    expect(#stakes > 0).truthy()
    for _, s in ipairs(stakes) do
      local ok = try('mp stake ' .. tostring(s.key), function()
        AP.run('prepare')
        leave()
        MP.session.mount('practice', {
          resolved = resolved(), deck = 'b_red', stake = 1, mpStake = s.id, seed = SEED, me = 'u_me',
          shape = { nemesisPairing = true, manhunt = false, teamBased = false, practice = true },
          options = { pvpStartRound = 2, theOrder = true, multiplayerJokers = true, timer = false },
        })
        MP.session.launch(SEED)
        AP.run('wait_state', { 'BLIND_SELECT' })
      end)
      if ok then count.used = count.used + 1; play_round() end
      harvest_log('mp stake ' .. tostring(s.key))
    end
    leave()
    clean('mp stakes a run at every mp stake')
  end)

  it('blinds: every non-PvP MP blind as the boss', function()
    for _, d in ipairs(defs_of(function(d) return d.kind == 'Blind' and d.key ~= 'bl_mp_nemesis' end)) do
      practice()
      AP.run('skip_blind')
      AP.run('skip_blind')
      try('select boss', AP.run, 'select_blind')
      -- the boss set on the live round, as a reroll would (set_blind runs the MP blind hooks)
      try('boss ' .. d.key, function() G.GAME.blind:set_blind(G.P_BLINDS[d.key]) end)
      settle(5)
      count.used = count.used + 1
      hover_cards('boss ' .. d.key)
      if G.STATE == G.STATES.SELECTING_HAND then try('play vs ' .. d.key, AP.run, 'play', { 'best' }) end
      harvest_log('boss ' .. d.key)
    end
    leave()
    clean('blinds every non pvp mp blind as the bos')
  end)
end)

describe('sweep: report', function()
  it('summary: counts, buttons and every error seen', function()
    report('sweep_counts', count)
    local bl = {}
    for k, v in pairs(seen_buttons) do bl[#bl + 1] = k .. '=' .. v end
    table.sort(bl)
    report('sweep_buttons', bl)
    harvest_log('end')
    for _, m in ipairs(found) do all_found[#all_found + 1] = m end
    report('sweep_errors', all_found)
    expect(found).eq({}) -- (each test already failed on its own errors; this catches the summary's)
  end)
end)
