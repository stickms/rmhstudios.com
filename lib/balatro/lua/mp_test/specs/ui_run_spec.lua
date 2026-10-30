-- L2 in-engine spec for WS11 (the in-run UI): the HUD, the Nemesis pillar, the countdown, the PvP
-- blind panel, the pause menu and the end screens build and run inside the real love.wasm without a
-- Lua error, driven by the autopilot.
--
-- Needs the MP pack extracted (`?mp=1` on the engine harness page: `cli.ts --query mp=1`, and the
-- engine project opens with it). Without it the file reports one skipped test.
-- The harness has no TypeScript session, so the referee's messages (start_blind, end_pvp,
-- player_lives, nemesis_info) are injected with MP.net.receive / MP.peer.dispatch, as the page's
-- runtime would deliver them.
-- Order matters: the last test leaves a match run on the PvP blind, so `cli.ts --shot` captures
-- the in-run HUD.

local has_mp, MP = pcall(require, 'rmh_mp')
local has_ui, RU
if has_mp then has_ui, RU = pcall(require, 'rmh_mp.ui.hud') end

local SEED = 'RMHWS11B'
local hs = 100

local function resolved()
  return {
    key = 'ruleset_mp_balanced', layers = { 'standard' }, multiplayerContent = true, banned = {}, bannedSilent = {},
    included = {}, reworked = {}, spectralBannedEnhancements = {}, stickers = {}, gameModifiers = {},
    startingParams = {}, setupHooks = {},
    flags = { theOrder = true, enemyLocationDisabled = false, timerDisplayThreshold = nil, comeback = 'default' },
    timer = { enabled = true, base = 150, increment = 60, forgiveness = 0, pvpHandIncrement = 0, mode = 'default',
      pressurePlusHand = 0, countdown = 3, mult = 1 },
  }
end

local function outcome(o)
  hs = hs + 1
  MP.net.receive('outcome', { hs = hs, o = o })
end

local function leave()
  if MP and MP.state and MP.state.session then
    if G.OVERLAY_MENU and G.FUNCS.exit_overlay_menu then G.FUNCS.exit_overlay_menu() end
    MP.session.unmount('test')
  end
end

local function practice()
  AP.run('prepare')
  leave()
  MP.session.mount('practice', {
    resolved = resolved(), deck = 'b_red', stake = 1, seed = SEED,
    shape = { nemesisPairing = true, manhunt = false, teamBased = false, practice = true },
    options = { pvpStartRound = 2, theOrder = true, multiplayerJokers = true, timer = false },
  })
  MP.session.launch(SEED)
  AP.run('wait_state', { 'BLIND_SELECT' })
end

local function match()
  AP.run('prepare')
  leave()
  MP.session.mount('match', {
    runId = 'ws11-run', seed = SEED, stake = 1, deck = 'b_red', queueMode = 'pvp_nemesis',
    shape = { nemesisPairing = true, manhunt = false, teamBased = false }, ruleset = 'ruleset_mp_balanced',
    layers = { 'standard' }, resolved = resolved(), hostId = 'u_me', me = 'u_me', contentHash = 'x',
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
  wait_frames(2)
end

local function boss_pillar_texts()
  local box = G.blind_select_opts and G.blind_select_opts.boss
  local out = {}
  local function walk(n)
    if type(n) ~= 'table' then return end
    if n.config then
      if n.config.text then out[#out + 1] = n.config.text end
      local o = n.config.object
      if o and o.strings then for _, s in ipairs(o.strings) do out[#out + 1] = s.string end end
    end
    for _, c in ipairs(n.children or {}) do walk(c) end
  end
  if box then walk(box.UIRoot) end
  return table.concat(out, '|')
end

if not (has_mp and has_ui) then
  describe('in-run UI (in-engine)', function()
    xit('needs the MP pack (?mp=1): ' .. tostring(has_mp and RU or MP):sub(1, 120), function() end)
  end)
  return
end

describe('in-run UI: practice run', function()
  after_each(leave)

  it('practice keeps the vanilla HUD; ease_round and ease_ante do not crash', function()
    practice()
    expect(G.HUD:get_UIE_by_ID('round_UI_count') ~= nil).truthy()
    expect(G.HUD:get_UIE_by_ID('mp_enemy_location')).eq(nil)
    ease_round(1)
    ease_ante(0)
    AP.run('wait_idle')
  end)

  it('reaches the Nemesis pillar at ante 2, readies, counts down and plays the PvP blind', function()
    practice()
    AP.run('skip_blind')
    AP.run('skip_blind')
    AP.run('select_blind')
    AP.run('win_blind')
    AP.run('cash_out')
    AP.run('leave_shop')
    expect(G.GAME.round_resets.ante).eq(2)
    AP.run('skip_blind')
    AP.run('skip_blind')
    AP.run('wait_idle')
    wait_until(function() return G.blind_select_opts and G.blind_select_opts.boss end, 30, 'boss pillar')
    local t = boss_pillar_texts()
    expect(t:find('????', 1, true) ~= nil).truthy()
    MP.test.run_ready()
    expect(MP.state.pvp.ready).eq(true)
    wait_frames(5)
    expect(MP.ui.blind_select.labels.Boss).eq(RU.t('b_unready', 'Unready'))
    MP.test.run_unready()
    expect(MP.state.pvp.ready).eq(false)
    MP.test.run_ready()
    -- the practice referee (TS) would answer; the harness injects it
    outcome({ t = 'start_blind', first_player = MP.state.session.me or '', starting_hands = {} })
    wait_until(function() return MP.state.pvp.countdown end, 10, 'countdown')
    expect(G.CONTROLLER.locks.mp_countdown).eq(true)
    AP.run('wait_state', { 'SELECTING_HAND', 60 })
    expect(MP.ui.countdown.shown).eq({ 3, 2, 1 })
    expect(MP.pvp.on_pvp_blind()).eq(true)
    wait_frames(3)
    expect(RU.view.blind_name).eq('???')
    expect(RU.view.enemy_score).eq('???')
    expect(G.GAME.blind.chip_text).eq('???')
    report('practice_pvp_hud', { name = RU.view.blind_name, score = RU.view.enemy_score })
  end)

  it('the practice pause menu has the toggles and gives cards from the collection', function()
    practice()
    G.FUNCS.options()
    wait_frames(2)
    expect(G.OVERLAY_MENU ~= nil).truthy()
    expect(G.OVERLAY_MENU:get_UIE_by_ID('mp_pause_menu') ~= nil).truthy()
    G.FUNCS.exit_overlay_menu()
    local c = MP.practice.give('j_joker')
    expect(c ~= nil).truthy()
    expect(MP.practice.cycle_edition(c)).eq('foil')
  end)
end)

describe('in-run UI: match run', function()
  after_each(leave)

  it('the match HUD carries lives, timer, enemy location and Lobby Info; cached ids work', function()
    match()
    for _, id in ipairs({ 'hud_ante', 'ante_UI_count', 'round_UI_count', 'chip_UI_count', 'mp_enemy_location',
      'mp_lobby_info_button' }) do
      expect(G.HUD:get_UIE_by_ID(id) ~= nil and id).eq(id)
    end
    ease_round(1)
    ease_ante(0)
    AP.run('wait_idle')
    MP.net.receive('timer_state', { value = 42.5, mode = 'ante', ticking = false, beingTimered = false, timering = false,
      pressable = true, auto = false, color = 'normal', display = nil })
    wait_frames(2)
    expect(RU.view.timer_text).eq('43')
    expect(RU.view.my_lives).eq('4')
    outcome({ t = 'player_lives', player_id = 'u_them', lives = 3, lost = 1 })
    wait_frames(2)
    expect(RU.view.opp_lives).eq('3')
    MP.peer.dispatch({ k = 'location', from = 'u_them', d = { loc = 'loc_selecting' } })
    wait_frames(2)
    expect(RU.view.enemy_loc).eq(RU.t('loc_selecting', 'Selecting'))
    G.FUNCS.mp_lobby_info()
    wait_frames(2)
    expect(G.OVERLAY_MENU ~= nil).truthy()
    G.FUNCS.exit_overlay_menu()
    G.FUNCS.options()
    wait_frames(2)
    expect(G.OVERLAY_MENU:get_UIE_by_ID('mp_pause_forfeit') ~= nil).truthy()
    expect(G.OVERLAY_MENU:get_UIE_by_ID('restart_button')).eq(nil)
    G.FUNCS.exit_overlay_menu()
  end)

  it('the end screens build: pending, then a win', function()
    match()
    outcome({ t = 'death_pending', player_id = 'u_me', blind_key = 'bl_small' })
    wait_frames(3)
    expect(G.OVERLAY_MENU:get_UIE_by_ID('mp_end_leave') ~= nil).truthy()
    expect(G.OVERLAY_MENU:get_UIE_by_ID('mp_end_continue_sp')).eq(nil)
    outcome({ t = 'win', winner_id = 'u_me' })
    wait_frames(3)
    expect(G.OVERLAY_MENU:get_UIE_by_ID('mp_end_continue_sp') ~= nil).truthy()
    G.FUNCS.mp_end_view_deck()
    wait_frames(3)
    G.FUNCS.mp_end_roster()
    wait_frames(3)
    G.FUNCS.mp_end_back()
    wait_frames(3)
    expect(G.OVERLAY_MENU:get_UIE_by_ID('mp_end_title') ~= nil).truthy()
    G.FUNCS.mp_end_continue()
    AP.run('wait_idle')
    expect(MP.session_kind()).eq('continued')
  end)

end)

-- No after_each here: the run stays on the PvP blind for `cli.ts --shot`.
describe('in-run UI: PvP blind', function()
  it('plays the PvP blind against an injected nemesis and stays on it (screenshot state)', function()
    match()
    AP.run('skip_blind')
    AP.run('skip_blind')
    wait_until(function() return G.blind_select_opts and G.blind_select_opts.boss end, 30, 'boss pillar')
    expect(boss_pillar_texts():find('Bob', 1, true) ~= nil).truthy()
    MP.test.run_ready()
    outcome({ t = 'start_blind', first_player = 'u_me', starting_hands = { u_me = 4, u_them = 4 } })
    AP.run('wait_state', { 'SELECTING_HAND', 60 })
    MP.peer.dispatch({ k = 'nemesis_info', from = 'u_them', d = { score = '12345', hands_left = 3, skips = 0, lives = 3 } })
    MP.peer.dispatch({ k = 'sync', from = 'u_them', d = { obj = 'mp_phantom_row', kind = 'phantom', data = { keys = { 'j_mp_speedrun' } } } })
    wait_until(function() return #MP.state.phantoms == 1 end, 10, 'phantom row')
    expect(MP.state.phantoms[1].ability.mp_phantom).eq(true)
    expect(MP.state.phantoms[1].area ~= G.jokers).truthy()
    AP.run('play', { 'best' })
    sleep(3.5)
    expect(RU.view.blind_name).eq('Bob')
    expect(RU.view.reward_value).eq('3')
    expect((RU.view.enemy_score:gsub(',', ''))).eq('12345')
    local sprite = G.GAME.blind.children.animatedSprite
    expect(sprite.atlas == G.ANIMATION_ATLAS.mp_player_blind_col).truthy()
    report('match_pvp_hud', { name = RU.view.blind_name, score = RU.view.enemy_score, lives = RU.view.my_lives .. ' vs ' .. RU.view.opp_lives })
  end)
end)
