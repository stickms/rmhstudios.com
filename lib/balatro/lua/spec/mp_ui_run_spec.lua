-- WS11 L1: the in-run UI against the REAL base-game builders (spec.mp_ui_helper): HUD tree surgery,
-- the PvP blind panel, the Nemesis pillar and Ready button, the countdown, the timer box, the pause
-- menu, the end screens, Lobby Info, HUD effects and banners, the Nemesis rows and the practice
-- tools. Every check is "state in -> what the UI shows / which intent goes out".

local UH = require 'spec.mp_ui_helper'
local H = require 'spec.mp_helper'

local MP, G, RU
local sounds

local function roster(n)
  local list = {}
  for i = 1, n do list[i] = { id = 'u' .. i, name = 'P' .. i, blindCol = i, avatarJoker = 'j_joker' } end
  return list
end

local function game_stub()
  G.STAGE = G.STAGES.RUN
  G.STATE = G.STATES.BLIND_SELECT
  G.LANGUAGES = { ['en-us'] = { font = {} } }
  G.FUNCS.select_blind = function(e) G.selected = e end
  G.FUNCS.skip_blind = function() end
  G.P_CENTER_POOLS.Stake = { { pos = { x = 0, y = 0 } } }
  G.ASSET_ATLAS.chips = {}
  G.GAME.current_round.current_hand = { handname_text = '', chip_total_text = '', hand_level = '', chip_text = '0', mult_text = '0' }
  G.GAME.current_round.dollars_to_be_earned = '$$$'
  G.GAME.current_round.most_played_poker_hand = 'High Card'
  G.GAME.chips_text = '0'
  G.GAME.hands = { ['High Card'] = { visible = true } }
  G.GAME.round_resets.loc_blind_states = { Small = 'Select', Big = 'Upcoming', Boss = 'Upcoming' }
  G.GAME.round_resets.blind_states = { Small = 'Select', Big = 'Upcoming', Boss = 'Upcoming' }
  G.GAME.starting_params.ante_scaling = 1
  G.GAME.blind = { loc_debuff_lines = { '', '' }, loc_name = 'Small Blind', chip_text = '300', chips = 300,
    change_dim = function() end, get_type = function() return 'Small' end }
  for _, k in ipairs({ 'bl_small', 'bl_big', 'bl_wall' }) do G.P_BLINDS[k].pos = { x = 0, y = 0 } end
  _G.get_blind_amount = function() return 300 end
  _G.play_sound = function(name) sounds[#sounds + 1] = name end
  _G.Event = _G.Event
end

local function boot(n, over)
  sounds = {}
  MP, G = UH.boot()
  MP.open('menu')
  RU = MP.ui.run
  game_stub()
  local info = {
    runId = 'run1', seed = 'ABCD1234', stake = 1, mpStake = nil, deck = 'b_red', challenge = nil,
    queueMode = 'pvp_nemesis', shape = { nemesisPairing = true, manhunt = false, teamBased = false },
    ruleset = 'ruleset_mp_balanced', layers = {}, options = H.options(), resolved = H.resolved(),
    roster = roster(n or 2), startedAt = 0, hostId = 'u1', contentHash = 'x', me = 'u1',
  }
  for k, v in pairs(over or {}) do info[k] = v end
  MP.session.launcher = function() return true end
  MP.net.receive('match_start', info)
  MP.net.frame(0)
  MP.state.lives = { u1 = 4, u2 = 3 }
  MP.state.target = 'u2'
  UH.clear_sent()
end

local function practice()
  sounds = {}
  MP, G = UH.boot()
  MP.open('menu')
  RU = MP.ui.run
  game_stub()
  MP.session.launcher = function() return true end
  MP.net.receive('practice_start', { resolved = H.resolved(), deck = 'b_red', stake = 1, seed = 'PRACTICE' })
  MP.net.frame(0)
  UH.clear_sent()
end

local function texts_of(def)
  local out = {}
  UH.walk(def, function(n)
    if n.config and n.config.text then out[#out + 1] = tostring(n.config.text) end
    if n.config and n.config.ref_table and n.config.ref_value then out[#out + 1] = tostring(n.config.ref_table[n.config.ref_value]) end
    local obj = n.config and n.config.object
    local str = type(obj) == 'table' and obj.string_args and obj.string_args.string
    if type(str) == 'string' then out[#out + 1] = str end
    if type(str) == 'table' then
      for _, x in ipairs(str) do
        if type(x) == 'string' then out[#out + 1] = x
        elseif type(x) == 'table' and x.ref_table then out[#out + 1] = tostring(x.ref_table[x.ref_value])
        elseif type(x) == 'table' and x.string then out[#out + 1] = tostring(x.string) end
      end
    end
  end)
  return table.concat(out, '|')
end

local function num(s) return tonumber((tostring(s):gsub(',', ''))) end

-- ── View model ──────────────────────────────────────────────────────────────

describe('in-run view model (HUD-01/02/03, TIM-01)', function()
  after_each(UH.teardown)

  it('loads with MP.open and installs its session wraps on mount', function()
    boot()
    expect(RU ~= nil).truthy()
    expect(MP.hooks.is_wrapped(_G, 'create_UIBox_HUD')).truthy()
    expect(MP.hooks.is_wrapped(_G, 'create_UIBox_options')).truthy()
    expect(MP.ui.show_result == MP.ui.end_screen.show).truthy()
  end)

  it('lives: mine vs the nemesis; Teams use the pools; royale the best other', function()
    boot(2)
    local v = RU.compute({})
    expect(v.my_lives).eq('4')
    expect(v.opp_lives).eq('3')
    MP.state.lives.u2 = 0
    expect(RU.compute({}).opp_lives).eq('0')
    UH.teardown()
    boot(4, { queueMode = 'pvp_royale', shape = { nemesisPairing = false, manhunt = false, teamBased = false } })
    MP.state.lives = { u1 = 2, u2 = 1, u3 = 5, u4 = 0 }
    MP.state.target = 'u2'
    v = RU.compute({})
    expect(v.opp_lives).eq('5')
    expect(v.opponent_title).eq('The Royale')
    UH.teardown()
    boot(4, { queueMode = 'pvp_teams', shape = { nemesisPairing = false, manhunt = false, teamBased = true } })
    MP.state.my_team = 'A'
    MP.state.team_lives = { A = 3, B = 2 }
    v = RU.compute({})
    expect(v.my_lives).eq('3')
    expect(v.opp_lives).eq('2')
    expect(v.opponent_title).eq('Team B')
  end)

  it('opponent title per shape: name, bye, manhunt, practice', function()
    boot(2)
    expect(RU.opponent_title()).eq('P2')
    MP.state.pvp.bye = true
    expect(RU.opponent_title()).eq('Bye')
    MP.state.pvp.bye = false
    MP.state.target = nil
    expect(RU.opponent_title()).eq('Waiting for pairing...')
    UH.teardown()
    boot(3, { queueMode = 'pvp_manhunt', shape = { nemesisPairing = false, manhunt = true, teamBased = false } })
    MP.state.my_team = 'RUNNER'
    expect(RU.opponent_title()).eq('The Hunters')
    MP.state.my_team = 'HUNTER'
    expect(RU.opponent_title()).eq('The Runner')
    UH.teardown()
    practice()
    expect(RU.opponent_title()).eq('???')
  end)

  it('enemy location text, (catching up), disabled under Major League flags', function()
    boot()
    expect(RU.location_text('loc_ready')).eq('Ready for PvP')
    expect(RU.location_text('loc_selecting')).eq('Selecting')
    expect(RU.location_text('loc_playing-bl_small')).eq('Playing Small Blind')
    expect(RU.location_text('loc_shop')).eq('Shopping')
    expect(RU.location_text('loc_shop-bl_big')).eq('Shopping before Big Blind')
    expect(RU.location_text(nil)).eq('-')
    MP.state.enemy.location = 'loc_selecting'
    MP.state.presence = { u2 = { status = 'catching_up' } }
    expect(RU.compute({}).enemy_loc).eq('Selecting (catching up)')
    MP.state.session.resolved.flags.enemyLocationDisabled = true
    expect(RU.compute({}).enemy_loc).eq('-')
  end)

  it('timer text: whole seconds above 9.95, one decimal below; >> variant; threshold hides', function()
    boot()
    expect(RU.timer_text(125.6)).eq('126')
    expect(RU.timer_text(10.2)).eq('10')
    expect(RU.timer_text(9.5)).eq('9.5')
    expect(RU.timer_text(0)).eq('0.0')
    expect(RU.timer_text(-3)).eq('0.0')
    expect(RU.timer_text(0 / 0)).eq('--')
    expect(RU.timer_text(math.huge)).eq('--')
    expect(RU.compute({}).timer_text).eq('--')
    MP.state.timer = { value = 47.2, mode = 'ante', ticking = true, beingTimered = true, timering = false, pressable = false,
      auto = false, color = 'important', display = '>>' }
    local v = RU.compute({})
    expect(v.timer_text).eq('>> 47')
    expect(v.timer_running).eq(true)
    MP.state.session.resolved.flags.timerDisplayThreshold = 30
    MP.state.timer.ticking = false
    MP.state.timer.display = nil
    expect(RU.compute({}).timer_text).eq('--')
    MP.state.timer.value = 12
    expect(RU.compute({}).timer_text).eq('12')
  end)

  it('timer box colours: orange when pressable, IMPORTANT text when asked', function()
    boot()
    local fg, bg = RU.timer_colours({ timer_pressable = true, timer_colour = 'important', timer_running = false }, 0)
    expect(bg).eq(G.C.ORANGE)
    expect(fg).eq(G.C.IMPORTANT)
    fg = RU.timer_colours({ timer_colour = 'orange' }, 0)
    expect(fg).eq(G.C.ORANGE)
  end)

  it('enemy score: masked until the first info, then eased over 3 s; hands left', function()
    boot()
    MP.pvp.on_pvp_blind = function() return true end
    local v = RU.compute({}, 0)
    expect(v.enemy_score).eq('???')
    expect(v.score_label).eq('Current Enemy score')
    expect(v.reward_label).eq('Enemy hands left: ')
    expect(v.blind_name).eq('P2')
    MP.peer.dispatch({ k = 'nemesis_info', from = 'u2', d = { score = '3000', hands_left = 2, skips = 0, lives = 3 } })
    v = RU.compute({}, 10)
    expect(v.enemy_score).eq('0')
    v = RU.compute({}, 11.5)
    local mid = num(v.enemy_score)
    expect(mid > 0 and mid < 3000).truthy()
    v = RU.compute({}, 13.1)
    expect(num(v.enemy_score)).eq(3000)
    expect(v.reward_value).eq('2')
    MP.peer.dispatch({ k = 'nemesis_info', from = 'u2', d = { score = 'inf', hands_left = 0, skips = 0, lives = 3 } })
    expect(RU.compute({}, 14).enemy_score).eq('inf')
  end)

  it('hideScoreUntilPlayed masks until my first hand (D-02)', function()
    boot(2, { options = H.options({ hideScoreUntilPlayed = true }) })
    MP.pvp.on_pvp_blind = function() return true end
    MP.peer.dispatch({ k = 'nemesis_info', from = 'u2', d = { score = '50', hands_left = 3, skips = 0, lives = 3 } })
    G.GAME.current_round.hands_played = 0
    expect(RU.compute({}, 0).enemy_score).eq('???')
    G.GAME.current_round.hands_played = 1
    RU.compute({}, 10)
    expect(RU.compute({}, 14).enemy_score).eq('50')
  end)

  it('ready button label: Ready / Unready / Waiting for pairing (D-01)', function()
    boot()
    expect(RU.compute({}).ready_state).eq('unready')
    MP.state.pvp.ready = true
    local v = RU.compute({})
    expect(v.ready_label).eq('Unready')
    MP.state.pvp.ready = false
    MP.state.pairing_pending = true
    v = RU.compute({})
    expect(v.ready_state).eq('waiting')
    expect(v.ready_label).eq('Waiting for pairing...')
  end)
end)

-- ── HUD surgery on the real create_UIBox_HUD ────────────────────────────────

describe('HUD tree surgery (HUD-01/02/09, TIM-01)', function()
  after_each(UH.teardown)

  it('keeps the ids the game caches and adds lives, timer, location, Lobby Info', function()
    boot()
    RU.compute()
    local def = create_UIBox_HUD()
    for _, id in ipairs({ 'hud_ante', 'ante_UI_count', 'round_UI_count', 'row_round_text', 'chip_UI_count',
      'hud_hands', 'dollar_text_UI', 'row_dollars_chips', 'run_info_button', 'button_area', 'hand_chips' }) do
      expect(UH.find(def, id) ~= nil).truthy()
    end
    expect(UH.find(def, 'mp_enemy_location') ~= nil).truthy()
    expect(UH.find(def, 'mp_lobby_info_button').config.button).eq('mp_lobby_info')
    expect(UH.find(def, 'run_info_button').config.minh).eq(1.2)
    expect(UH.find(def, 'row_round_text').config.button).eq('mp_timer_press')
    local t = texts_of(def)
    expect(t:find('Lives', 1, true) ~= nil).truthy()
    expect(t:find('Timer', 1, true) ~= nil).truthy()
    expect(t:find('Enemy', 1, true) ~= nil).truthy()
    -- the lives values are live refs into the view
    local lives = UH.find(def, 'ante_UI_count').config.object.string_args.string[1]
    expect(lives.ref_table == RU.view).truthy()
    expect(lives.ref_value).eq('my_lives')
  end)

  it('practice keeps the vanilla Ante and Round boxes', function()
    practice()
    local def = create_UIBox_HUD()
    expect(UH.find(def, 'mp_enemy_location')).eq(nil)
    expect(UH.find(def, 'mp_lobby_info_button')).eq(nil)
    expect(UH.find(def, 'round_UI_count') ~= nil).truthy()
  end)

  it('the timer button presses only when pressable', function()
    boot()
    G.FUNCS.mp_timer_press()
    expect(#UH.sent('timer_input')).eq(0)
    MP.state.timer = { value = 10, mode = 'ante', ticking = false, beingTimered = false, timering = false, pressable = true,
      auto = false, color = 'normal', display = nil }
    G.FUNCS.mp_timer_press()
    expect(UH.sent('timer_input')[1].d).eq({ op = 'press' })
    RU.compute()
    local e = { config = {} }
    G.FUNCS.mp_timer_ui(e)
    expect(e.config.colour).eq(G.C.ORANGE)
  end)

  it('the PvP blind panel is repointed at the view', function()
    boot()
    RU.compute()
    local def = create_UIBox_HUD_blind()
    local name = UH.find(def, 'HUD_blind_name').config.object.string_args.string[1]
    expect(name.ref_value).eq('blind_name')
    local labels = UH.find_all(def, function(n) return n.config and n.config.ref_value == 'score_label' end)
    expect(#labels).eq(1)
    local reward = UH.find_all(def, function(n) return n.config and n.config.func == 'mp_hud_blind_reward' end)
    expect(#reward).eq(1)
    MP.pvp.on_pvp_blind = function() return true end
    G.GAME.blind.chip_text = '????'
    RU.frame(0)
    expect(G.GAME.blind.chip_text).eq('???')
  end)
end)

-- ── Blind select ────────────────────────────────────────────────────────────

describe('Nemesis pillar (HUD-04/05, FL-06)', function()
  after_each(UH.teardown)

  it('restyles the PvP Boss pillar only from pvp_start_round', function()
    boot()
    G.GAME.round_resets.ante = 1
    local def = create_UIBox_blind_choice('Boss')
    expect(texts_of(def):find('????', 1, true)).eq(nil)
    G.GAME.round_resets.ante = 2
    def = create_UIBox_blind_choice('Boss')
    local t = texts_of(def)
    expect(t:find('????', 1, true) ~= nil).truthy()
    expect(t:find('Life or Death', 1, true) ~= nil).truthy()
    expect(t:find('Most chips wins', 1, true) ~= nil).truthy()
    expect(t:find('$$$$$', 1, true) ~= nil).truthy()
    expect(t:find('P2', 1, true) ~= nil).truthy()
    expect(UH.find(def, 'select_blind_button').config.one_press).eq(nil)
    -- the Run Info preview shows "????" too (HUD-05)
    def = create_UIBox_blind_choice('Boss', true)
    expect(texts_of(def):find('????', 1, true) ~= nil).truthy()
    -- Small stays vanilla
    def = create_UIBox_blind_choice('Small')
    expect(texts_of(def):find('????', 1, true)).eq(nil)
  end)

  it('a bye shows only "Most chips wins"', function()
    boot()
    G.GAME.round_resets.ante = 3
    MP.state.pvp.bye = true
    local t = texts_of(create_UIBox_blind_choice('Boss'))
    expect(t:find('Life or Death', 1, true)).eq(nil)
    expect(t:find('Bye', 1, true) ~= nil).truthy()
  end)

  it('the button follows ready state: red Ready -> green Unready -> inactive while waiting', function()
    boot()
    G.GAME.round_resets.ante = 2
    G.GAME.blind_on_deck = 'Boss'
    local top = { config = { colour = G.C.FILTER, button = 'select_blind' }, disable_button = true }
    local e = { config = { id = 'Boss', ref_table = {} }, UIBox = { get_UIE_by_ID = function() return top end } }
    RU.compute()
    MP.ui.blind_select.handle(e)
    expect(top.config.colour).eq(G.C.RED)
    expect(top.disable_button).eq(nil)
    expect(MP.ui.blind_select.labels.Boss).eq('Ready')
    MP.test.run_ready()
    expect(MP.state.pvp.ready).eq(true)
    expect(H.events('ready_blind')[1].starting_hands).eq(4)
    RU.compute()
    MP.ui.blind_select.handle(e)
    expect(top.config.colour).eq(G.C.GREEN)
    expect(MP.ui.blind_select.labels.Boss).eq('Unready')
    MP.test.run_unready()
    expect(MP.state.pvp.ready).eq(false)
    MP.state.pairing_pending = true
    RU.compute()
    MP.ui.blind_select.handle(e)
    expect(top.config.button).eq(nil)
    expect(top.config.colour).eq(G.C.UI.BACKGROUND_INACTIVE)
  end)
end)

-- ── Countdown ───────────────────────────────────────────────────────────────

describe('countdown (FL-07)', function()
  after_each(UH.teardown)

  it('start_blind -> 3, 2, 1 drawn big on red, controls locked until the auto-select', function()
    boot()
    G.GAME.round_resets.ante = 2
    G.GAME.blind_on_deck = 'Boss'
    G.FUNCS.select_blind = G.FUNCS.select_blind or function() end
    MP.test.run_ready()
    MP.net.receive('outcome', { hs = 1, o = { t = 'start_blind', first_player = 'u1', starting_hands = { u1 = 4, u2 = 4 } } })
    MP.net.frame(0)
    expect(MP.state.pvp.countdown).eq(true)
    expect(G.CONTROLLER.locks.mp_countdown).eq(true)
    for _ = 1, 4 do H.fake.advance(1.01) end
    H.fake.flush()
    expect(MP.ui.countdown.shown).eq({ 3, 2, 1 })
    local big = UH.attention[#UH.attention]
    expect(big.scale).eq(5)
    expect(big.backdrop_colour).eq(G.C.MULT)
    expect(MP.state.pvp.countdown).eq(false)
    expect(G.CONTROLLER.locks.mp_countdown).eq(nil)
    local tarot = 0
    for _, s in ipairs(sounds) do if s == 'tarot2' then tarot = tarot + 1 end end
    expect(tarot).eq(3)
  end)

  it('timer cue plays the timpani unless the setting is off', function()
    boot()
    MP.net.receive('timer_cue', {})
    expect(sounds[#sounds]).eq('timpani')
    G.SETTINGS.rmh_mp = { timerSound = 'off' }
    sounds = {}
    MP.net.receive('timer_cue', {})
    expect(#sounds).eq(0)
  end)
end)

-- ── Pause menu ──────────────────────────────────────────────────────────────

describe('pause menu (HUD-10, D-38)', function()
  after_each(UH.teardown)

  local function ids(def)
    local out = {}
    for _, n in ipairs(UH.find_all(def, function(x) return x.config and x.config.button end)) do out[n.config.button] = true end
    return out
  end

  it('match: settings, seed change (first 300 s), vote for draw, forfeit, collection; no restart', function()
    boot()
    G.TIMERS.REAL = 100
    MP.ui.pause.run_started = 0
    local def = create_UIBox_options()
    local b = ids(def)
    expect(b.settings and b.mp_vote_seed and b.mp_vote_draw and b.mp_forfeit_ask and b.your_collection).truthy()
    expect(b.setup_run).eq(nil)
    expect(b.go_to_menu).eq(nil)
    G.TIMERS.REAL = 301
    b = ids(create_UIBox_options())
    expect(b.mp_vote_seed).eq(nil)
    expect(b.mp_vote_draw).truthy()
  end)

  it('votes are game events; progress is shown', function()
    boot()
    MP.ui.pause.run_started = G.TIMERS.REAL
    expect(MP.test.run_vote({ kind = 'seed' }).sent).eq(true)
    expect(MP.test.run_vote({ kind = 'draw' }).sent).eq(true)
    expect(#H.events('seed_vote')).eq(1)
    expect(#H.events('draw_vote')).eq(1)
    G.TIMERS.REAL = G.TIMERS.REAL + 400
    expect(MP.test.run_vote({ kind = 'seed' }).sent).eq(false)
    MP.net.receive('outcome', { hs = 5, o = { t = 'vote_progress', kind = 'draw', k = 1, n = 2 } })
    expect(MP.ui.pause.last_progress).eq('Vote for Draw: 1/2')
  end)

  it('forfeit asks first, then reports forfeit and leaves to the menu', function()
    boot()
    local left = 0
    G.FUNCS.go_to_menu = function() left = left + 1 end
    G.FUNCS.mp_forfeit_ask()
    expect(texts_of(UH.overlays[#UH.overlays]):find('Are you sure?', 1, true) ~= nil).truthy()
    expect(#H.events('forfeit')).eq(0)
    G.FUNCS.mp_forfeit_yes()
    expect(#H.events('forfeit')).eq(1)
    expect(left).eq(1)
  end)

  it('practice: main menu and the practice toggles, no votes', function()
    practice()
    local def = create_UIBox_options()
    local b = ids(def)
    expect(b.go_to_menu).truthy()
    expect(b.mp_vote_draw).eq(nil)
    expect(b.mp_forfeit_ask).eq(nil)
    local t = texts_of(def)
    expect(t:find('Unlimited Slots', 1, true) ~= nil).truthy()
    expect(t:find('Edition Cycling', 1, true) ~= nil).truthy()
  end)
end)

-- ── End screens ─────────────────────────────────────────────────────────────

describe('end screens (HUD-12/13/14)', function()
  after_each(UH.teardown)

  it('win: green, YOU WIN!, nemesis row, players, Continue + Leave; asks for the nemesis deck', function()
    boot()
    MP.net.receive('outcome', { hs = 9, o = { t = 'win', winner_id = 'u1' } })
    local def = UH.overlays[#UH.overlays]
    local t = texts_of(def)
    expect(t:find('YOU WIN!', 1, true) ~= nil).truthy()
    expect(t:find('Nemesis', 1, true) ~= nil).truthy()
    expect(t:find('Continue in Singleplayer', 1, true) ~= nil).truthy()
    expect(t:find('Leave Lobby', 1, true) ~= nil).truthy()
    expect(t:find('Return to Lobby', 1, true)).eq(nil)
    expect(def.config.colour[1]).eq(G.C.GREEN[1])
    local reqs = {}
    for _, m in ipairs(UH.sent('peer')) do reqs[m.d.k] = true end
    expect(reqs.deck_req and reqs.stats_req and reqs.player_result).truthy()
    expect(#UH.sent('deck_res_local')).eq(1)
  end)

  it('lose and draw titles; a place line for Royale', function()
    boot()
    MP.net.receive('outcome', { hs = 9, o = { t = 'win', winner_id = 'u2' } })
    expect(texts_of(UH.overlays[#UH.overlays]):find('GAME OVER', 1, true) ~= nil).truthy()
    UH.teardown()
    boot(3)
    MP.net.receive('outcome', { hs = 9, o = { t = 'win', places = { u1 = 1, u2 = 1, u3 = 3 } } })
    local t = texts_of(UH.overlays[#UH.overlays])
    expect(t:find('DRAW!', 1, true) ~= nil).truthy()
    expect(t:find('Place 1', 1, true) ~= nil).truthy()
  end)

  it('pending death: OUT OF LIVES, three lines, Leave only', function()
    boot()
    MP.net.receive('outcome', { hs = 3, o = { t = 'death_pending', player_id = 'u1', blind_key = 'bl_small' } })
    local def = UH.overlays[#UH.overlays]
    local t = texts_of(def)
    expect(t:find('OUT OF LIVES', 1, true) ~= nil).truthy()
    expect(t:find('Your result is pending.', 1, true) ~= nil).truthy()
    expect(t:find('Your Nemesis must beat the same blind.', 1, true) ~= nil).truthy()
    expect(t:find('Continue in Singleplayer', 1, true)).eq(nil)
    expect(t:find('Leave Lobby', 1, true) ~= nil).truthy()
  end)

  it('Return to Lobby only for private lobbies; leaving sends match_left', function()
    boot()
    MP.ui.model.lobby = { state = { kind = 'private' } }
    local m = MP.ui.end_screen.model({ kind = 'lose' })
    expect(m.buttons).eq({ 'continue_sp', 'return_lobby', 'leave' })
    G.FUNCS.go_to_menu = function() end
    MP.ui.end_screen.leave('return_lobby')
    expect(UH.sent('match_left')[1].d).eq({ how = 'return_lobby' })
  end)

  it('player captions, the nemesis deck string, the roster', function()
    boot(3)
    local ES = MP.ui.end_screen
    MP.state.player_results = { u2 = { jokers = { { key = 'j_joker', edition = nil, eternal = false, perishable = false } },
      deck_back = 'b_red', highest_pvp_score = '1234', interim = false } }
    MP.state.presence = { u3 = { status = 'left' } }
    expect(ES.caption('u2')).eq("P2's Jokers")
    expect(ES.caption('u3')).eq('P3 -- left the match')
    MP.state.presence = {}
    expect(ES.caption('u3')).eq('P3 -- still playing...')
    local deck = ES.parse_deck('Hearts-Ace-m_glass-foil-Red;Spades-10----;bad')
    expect(#deck).eq(2)
    expect(deck[1]).eq({ key = 'c_base', front = { suit = 'Hearts', rank = 'Ace' }, enhancement = 'm_glass', edition = 'foil', seal = 'Red' })
    expect(deck[2].enhancement).eq(nil)
    local roster = texts_of(ES.roster_def())
    expect(roster:find('Best PvP score: 1234', 1, true) ~= nil).truthy()
  end)
end)

-- ── Effects, banners, Lobby Info ────────────────────────────────────────────

describe('HUD effects and banners (HUD-07/08/17)', function()
  after_each(UH.teardown)

  it('opponent life lost -> holo1 + gong; opponent skip -> negative + gong', function()
    boot()
    RU.effects()
    MP.net.receive('outcome', { hs = 2, o = { t = 'player_lives', player_id = 'u2', lives = 2 } })
    local fired = RU.effects()
    expect(fired[1]).eq('opp_lives')
    expect(sounds).eq({ 'holo1', 'gong' })
    sounds = {}
    MP.peer.dispatch({ k = 'nemesis_info', from = 'u2', d = { score = '0', hands_left = 4, skips = 1, lives = 2 } })
    fired = RU.effects()
    expect(fired[1]).eq('opp_skip')
    expect(sounds).eq({ 'negative', 'gong' })
  end)

  it('no skip sound under Major League', function()
    boot(2, { resolved = H.resolved({ key = 'ruleset_mp_majorleague' }) })
    RU.effects()
    MP.peer.dispatch({ k = 'nemesis_info', from = 'u2', d = { score = '0', hands_left = 4, skips = 1, lives = 3 } })
    expect(#RU.effects()).eq(0)
  end)

  it('survivor banner on the opponent pending death; host change toast', function()
    boot()
    RU.effects()
    MP.net.receive('outcome', { hs = 2, o = { t = 'death_pending', player_id = 'u2', blind_key = 'bl_small' } })
    expect(RU.effects()[1]).eq('survivor')
    MP.net.receive('host_changed', { hostId = 'u1' })
    MP.state.session.hostId = 'u2'
    RU.effects()
    MP.state.session.hostId = 'u1'
    local fired = RU.effects()
    expect(fired[1]).eq('host')
    expect(RU.toasts[#RU.toasts]).eq('You are now the host')
  end)

  it('banner: own reconnect first, then the away countdown, then waiting', function()
    boot()
    expect(RU.banner_text(0)).eq('')
    MP.state.pvp.waiting = true
    expect(RU.banner_text(0)).eq('Waiting for enemy to finish...')
    MP.net.receive('presence', { id = 'u2', status = 'away', graceMsLeft = 120000 })
    expect(RU.banner_text(10)).eq('P2 is away - 120s')
    expect(RU.banner_text(40)).eq('P2 is away - 90s')
    MP.net.receive('presence', { id = 'u1', status = 'away' })
    expect(RU.banner_text(41)).eq('Connection lost, reconnecting...')
    MP.net.receive('presence', { id = 'u1', status = 'back' })
    MP.net.receive('presence', { id = 'u2', status = 'forfeited' })
    local fired = RU.effects()
    local seen = false
    for _, f in ipairs(fired) do if f == 'forfeit:u2' then seen = true end end
    expect(seen).truthy()
  end)

  it('Lobby Info lists every player with lives, location and status', function()
    boot(3)
    MP.state.lives = { u1 = 4, u2 = 2, u3 = 0 }
    MP.state.locations = { u2 = 'loc_ready' }
    MP.state.presence = { u3 = { status = 'away' } }
    local rows = MP.ui.lobby_info.rows()
    expect(#rows).eq(3)
    expect(rows[1].me).eq(true)
    expect(rows[1].host).eq(true)
    expect(rows[2].location).eq('Ready for PvP')
    expect(rows[3].status).eq('away')
    expect(MP.ui.lobby_info.open()).eq(true)
    expect(texts_of(UH.overlays[#UH.overlays]):find('Lobby Info', 1, true) ~= nil).truthy()
  end)
end)

-- ── Nemesis rows ────────────────────────────────────────────────────────────

describe('Nemesis rows (HUD-06)', function()
  after_each(UH.teardown)

  local function setup_areas()
    G.jokers = CardArea(0, 0, 5, 1.4, { card_limit = 5 })
    G.jokers.T = { x = 1, y = 0, w = 5, h = 1.4 }
    G.consumeables = CardArea(0, 0, 2, 1.4, { card_limit = 2 })
    G.consumeables.T = { x = 7, y = 0, w = 2, h = 1.4 }
    function CardArea:remove_card(c) for i, x in ipairs(self.cards) do if x == c then table.remove(self.cards, i) end end end
    function CardArea:hard_set_VT() end
    G.P_CENTERS.j_mp_speedrun = G.P_CENTERS.j_mp_speedrun or { key = 'j_mp_speedrun', set = 'Joker' }
  end

  it('broadcasts my phantom-flagged jokers once per change (kind phantom)', function()
    boot()
    setup_areas()
    expect(MP.registry.get('j_mp_speedrun').phantom).eq(true)
    G.jokers:emplace(Card(0, 0, 1, 1, nil, G.P_CENTERS.j_mp_speedrun))
    G.jokers:emplace(Card(0, 0, 1, 1, nil, G.P_CENTERS.j_joker))
    MP.ui.nemesis_rows.frame()
    MP.ui.nemesis_rows.frame()
    local syncs = UH.sent('peer')
    local n = 0
    for _, m in ipairs(syncs) do
      if m.d.k == 'sync' then
        n = n + 1
        expect(m.d.d.obj).eq('mp_phantom_row')
        expect(m.d.d.kind).eq('phantom')
        expect(m.d.d.data.keys).eq({ 'j_mp_speedrun' })
      end
    end
    expect(n).eq(1)
  end)

  it('shows the ante nemesis copies only, as phantoms in MP.state.phantoms', function()
    boot(3)
    setup_areas()
    MP.state.ante_nemesis = { 'u2' }
    MP.peer.dispatch({ k = 'sync', from = 'u3', d = { obj = 'mp_phantom_row', kind = 'phantom', data = { keys = { 'j_joker' } } } })
    MP.ui.nemesis_rows.frame()
    expect(#MP.state.phantoms).eq(0)
    MP.peer.dispatch({ k = 'sync', from = 'u2', d = { obj = 'mp_phantom_row', kind = 'phantom', data = { keys = { 'j_mp_speedrun', 'j_nope' } } } })
    MP.ui.nemesis_rows.frame()
    expect(#MP.state.phantoms).eq(1)
    local c = MP.state.phantoms[1]
    expect(c.ability.mp_phantom).eq(true)
    expect(c.sell_cost).eq(0)
    expect(c.area ~= G.jokers).truthy()
    -- a sync of kind 'sync' for the row is ignored
    MP.peer.dispatch({ k = 'sync', from = 'u2', d = { obj = 'mp_phantom_row', kind = 'sync', data = { keys = {} } } })
    MP.ui.nemesis_rows.frame()
    expect(#MP.state.phantoms).eq(1)
    -- the nemesis changes: the u3 store is shown
    MP.state.ante_nemesis = { 'u3' }
    MP.ui.nemesis_rows.frame()
    expect(MP.state.phantoms[1].config.center.key).eq('j_joker')
  end)

  it('the trap row shows the nemesis row face down; only mine keep hover details; events rebuild', function()
    boot()
    setup_areas()
    MP.state.ante_nemesis = { 'u2' }
    MP.ui.nemesis_rows.frame()
    expect(#(MP.ui.nemesis_rows.trap_cards or {})).eq(0)
    local k = MP.traps.KEYS[1]
    MP.traps.receive_held('u2', { cards = { { uid = 'a1', key = k, owner = 'u1' }, { uid = 'b2', key = k, owner = 'u3' } }, fired = {} })
    MP.ui.nemesis_rows.frame()
    local cards = MP.ui.nemesis_rows.trap_cards
    expect(#cards).eq(2)
    expect(cards[1].facing).eq('back')
    expect(cards[1].ability.mp_trap_mine).eq(true)
    expect(cards[2].states.hover.can).eq(false)
    expect(cards[1].area == MP.ui.nemesis_rows.areas.traps).truthy()
    -- one fires: the row shrinks
    MP.traps.receive_held('u2', { cards = { { uid = 'a1', key = k, owner = 'u1' }, { uid = 'b2', key = k, owner = 'u3' } }, fired = { 'b2' } })
    MP.ui.nemesis_rows.frame()
    expect(#MP.ui.nemesis_rows.trap_cards).eq(1)
  end)

  it('layouts: standard above own rows, classic one half-width row under the consumables', function()
    boot()
    setup_areas()
    MP.ui.nemesis_rows.frame()
    local a = MP.ui.nemesis_rows.areas
    expect(a.layout).eq('standard')
    expect(a.jokers.T.x).eq(1)
    expect(a.jokers.T.y < 0).truthy()
    UH.teardown()
    boot()
    setup_areas()
    G.SETTINGS.rmh_mp = { nemesisLayout = 'classic' }
    MP.ui.nemesis_rows.frame()
    a = MP.ui.nemesis_rows.areas
    expect(a.layout).eq('classic')
    expect(a.jokers == a.traps).truthy()
    expect(a.jokers.T.x).eq(8)
  end)
end)

-- ── Practice tools ──────────────────────────────────────────────────────────

describe('practice tools (PR-03, PR-04)', function()
  after_each(UH.teardown)

  local function areas()
    G.jokers = CardArea(0, 0, 5, 1.4, { card_limit = 1 })
    G.jokers.T = { x = 0, y = 0, w = 5, h = 1.4 }
    G.consumeables = CardArea(0, 0, 2, 1.4, { card_limit = 2 })
    G.consumeables.T = { x = 0, y = 0, w = 2, h = 1.4 }
  end

  it('give-card from the collection respects slots unless Unlimited Slots', function()
    practice()
    areas()
    local PR = MP.practice
    MP.practice_opts.unlimited_slots = false
    expect(PR.give('j_joker') ~= nil).truthy()
    local c, why = PR.give('j_greedy_joker')
    expect(c).eq(nil)
    expect(why).eq('full')
    MP.practice_opts.unlimited_slots = true
    expect(PR.give('j_greedy_joker') ~= nil).truthy()
    expect(#G.jokers.cards).eq(2)
    expect(PR.give('c_fool').area).eq(G.consumeables)
    expect(select(2, PR.give('b_red'))).eq('not giveable')
    MP.practice_opts.unlimited_slots = false
  end)

  it('key 3 on a hovered collection card gives it; not outside practice', function()
    practice()
    areas()
    G.OVERLAY_MENU = UIBox({ definition = {}, config = {} })
    local shown = Card(0, 0, 1, 1, nil, G.P_CENTERS.j_joker)
    shown.area = { config = { collection = true } }
    G.CONTROLLER.hovering = { target = shown }
    expect(MP.practice.on_key('3')).eq(true)
    expect(#G.jokers.cards).eq(1)
  end)

  it('edition cycling: base -> foil -> holo -> polychrome -> negative -> base', function()
    practice()
    local card = { edition = nil, area = { config = { card_limit = 5 } }, added_to_deck = true }
    function card:set_edition(e) if e then for k in pairs(e) do self.edition = { type = k } end else self.edition = nil end end
    local seq = {}
    for _ = 1, 5 do seq[#seq + 1] = MP.practice.cycle_edition(card) end
    expect(seq).eq({ 'foil', 'holo', 'polychrome', 'negative', 'base' })
    expect(card.area.config.card_limit).eq(4)
  end)

  it('MP keys go through MP.sandbox.spawnable: inactive only with the toggle, decoys never (D-28)', function()
    practice()
    areas()
    MP.practice_opts.unlimited_slots = true
    local inactive = MP.sandbox.INACTIVE[1]
    expect(inactive ~= nil and G.P_CENTERS[inactive] ~= nil).truthy()
    MP.practice_opts.show_inactive = false
    expect(select(2, MP.practice.give(inactive))).eq('inactive')
    MP.practice_opts.show_inactive = true
    expect(MP.practice.give(inactive) ~= nil).truthy()
    if G.P_CENTERS.j_mp_error_sandbox_1 then
      expect(select(2, MP.practice.give('j_mp_error_sandbox_1'))).eq('inactive')
    end
    expect(MP.practice.give('j_mp_pacifist') ~= nil).truthy()
    MP.practice_opts.show_inactive, MP.practice_opts.unlimited_slots = false, false
  end)

  it('give-card is refused outside practice', function()
    boot()
    expect(select(2, MP.practice.give('j_joker'))).eq('not practice')
  end)
end)
