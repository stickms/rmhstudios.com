-- WS6 game hooks with a fake G: PvP blind slot and loop, ready/start_blind/end_pvp, failed
-- blinds, duplicate guards, win suppression, outcomes, peers, flags, game speed.

local H = require 'spec.mp_helper'

-- Minimal vanilla-shaped functions the hooks wrap. Each records what it was called with.
local calls
local function stub_game()
  calls = {}
  local function rec(name) return function(...) calls[#calls + 1] = { name, ... } end end
  _G.Game = {
    update_hand_played = function() calls[#calls + 1] = { 'vanilla_hand_played' } end,
    update_draw_to_hand = function() end,
    update_game_over = rec('vanilla_game_over'),
    update_blind_select = function() end,
    update_shop = function() end,
    update_round_eval = function() G.STATE_COMPLETE = true; calls[#calls + 1] = { 'round_eval' } end,
    update = function() calls[#calls + 1] = { 'update', G.SETTINGS.GAMESPEED } end,
    start_run = function(self, args)
      calls[#calls + 1] = { 'start_run', args and args.seed }
      -- As vanilla: a Continue checks the continue_game unlock before G.GAME becomes the save's.
      if args and args.savetext then check_for_unlock({ type = 'continue_game' }) end
    end,
  }
  _G.check_for_unlock = function(args) calls[#calls + 1] = { 'check_for_unlock', args.type } end
  _G.Blind = {
    set_blind = function(self, blind, reset)
      if reset then return end
      self.config = { blind = blind or {} }
      self.name = blind and blind.name or ''
      self.chips = 300 * ((blind and blind.mult) or 0)
      self.dollars = blind and blind.dollars or 0
      self.boss = blind and not not blind.boss                    -- as vanilla Blind:set_blind
      G.GAME.last_blind = G.GAME.last_blind or {}
      G.GAME.last_blind.boss = self.boss
    end,
    disable = function(self) self.disabled = true end,
  }
  _G.Card = {}
  G.GAME.blind = setmetatable({}, { __index = Blind })
  G.GAME.round_resets.blind = G.P_BLINDS.bl_small
  G.GAME.round_resets.hands = 4
  G.GAME.skips = 0
  G.GAME.current_round.discards_used = 0
  G.FUNCS.select_blind = function(e)
    G.GAME.round_resets.blind = e.config.ref_table
    calls[#calls + 1] = { 'select_blind', e.config.ref_table.key }
  end
  G.FUNCS.skip_blind = function() G.GAME.skips = G.GAME.skips + 1 end
  G.FUNCS.go_to_menu = rec('go_to_menu')
  G.FUNCS.start_run = rec('funcs_start_run')
  _G.new_round = function()
    G.GAME.blind:set_blind(G.GAME.round_resets.blind)
  end
  _G.end_round = function() calls[#calls + 1] = { 'end_round', G.GAME.win_ante, G.GAME.blind.chips } end
  _G.ease_ante = function(mod)
    G.E_MANAGER:add_event(Event({ func = function() G.GAME.round_resets.ante = G.GAME.round_resets.ante + mod; return true end }))
  end
  _G.ease_hands_played = function(mod)
    G.E_MANAGER:add_event(Event({ func = function()
      G.GAME.current_round.hands_left = G.GAME.current_round.hands_left + mod; return true end }))
  end
  _G.ease_dollars = function(mod) G.GAME.dollars = G.GAME.dollars + mod end
  _G.add_round_eval_row = rec('row')
  _G.draw_card = rec('draw_card')
  _G.create_UIBox_options = function()
    return { n = 1, nodes = { { n = 2, config = { id = 'restart_button' } }, { n = 2, config = { button = 'go_to_menu' } } } }
  end
end

local function boot()
  local MP = H.boot({ before = stub_game })
  H.transport()
  return MP
end

local function start_match(MP, over)
  local info = {
    runId = 'run1', seed = 'ABCD1234', stake = 1, mpStake = nil, deck = 'b_red', challenge = nil,
    queueMode = 'pvp_nemesis', shape = { nemesisPairing = true, manhunt = false, teamBased = false },
    ruleset = 'ruleset_mp_balanced', layers = {}, options = H.options(), resolved = H.resolved(),
    roster = { { id = 'u1', name = 'Me', blindCol = 1, avatarJoker = 'j_joker' },
      { id = 'u2', name = 'Them', blindCol = 2, avatarJoker = 'j_joker' } },
    startedAt = 0, hostId = 'u1', contentHash = 'x', me = 'u1',
  }
  for k, v in pairs(over or {}) do info[k] = v end
  MP.session.launcher = function() return true end
  MP.net.receive('match_start', info)
  MP.net.frame(0)
  MP.state.lives = { u1 = 4, u2 = 4 }
  MP.state.target = 'u2'
  H.sent_list = {}
  return MP.state.session
end

local function find_call(name)
  for _, c in ipairs(calls) do if c[1] == name then return c end end
end

describe('PvP blind slot and loop', function()
  local MP
  before_each(function() MP = boot(); start_match(MP) end)
  after_each(function() MP.session.unmount('t'); H.teardown() end)

  it('mounts the session: profile saving off, reference content present', function()
    expect(G.F_NO_SAVING).eq(true)
    expect(G.P_CENTERS.j_mp_pacifist ~= nil).truthy()
    expect(G.P_BLINDS.bl_mp_nemesis ~= nil).truthy()
  end)

  it('Small/Big before pvp_start_round are plain; selecting reports play_hand(0) + new_round + location', function()
    G.GAME.blind_on_deck = 'Small'
    G.FUNCS.select_blind({ config = { ref_table = G.P_BLINDS.bl_small } })
    local evs = H.events()
    expect(evs[1]).eq({ t = 'play_hand', score = '0', hands_left = 4, skips = 0, lives = 4 })
    expect(evs[2]).eq({ t = 'new_round' })
    local loc = H.sent('peer')
    expect(loc[1].d).eq({ k = 'location', d = { loc = 'loc_playing-bl_small' } })
    expect(find_call('select_blind')[2]).eq('bl_small')
    expect(MP.state.ante_key ~= nil).truthy()
  end)

  it('the PvP pillar is a Ready toggle until start_blind (FL-06)', function()
    G.GAME.round_resets.ante = 2
    G.GAME.blind_on_deck = 'Boss'
    local e = { config = { ref_table = G.P_BLINDS.bl_wall } }
    G.FUNCS.select_blind(e)
    expect(find_call('select_blind')).eq(nil)
    expect(MP.state.pvp.ready).eq(true)
    expect(H.events()[1]).eq({ t = 'ready_blind', starting_hands = 4 })
    H.sent_list = {}
    G.FUNCS.select_blind(e)
    expect(MP.state.pvp.ready).eq(false)
    expect(H.events()[1]).eq({ t = 'unready_blind' })
  end)

  it('start_blind -> countdown -> auto-select -> nemesis blind with infinite chips (FL-03/07/09)', function()
    G.GAME.round_resets.ante = 2
    G.GAME.blind_on_deck = 'Boss'
    G.STATE = G.STATES.BLIND_SELECT
    G.FUNCS.select_blind({ config = { ref_table = G.P_BLINDS.bl_wall } })
    MP.net.receive('outcome', { hs = 1, o = { t = 'start_blind', first_player = 'u1', starting_hands = { u1 = 4, u2 = 5 } } })
    MP.net.frame(0)
    expect(MP.state.pvp.started).eq(true)
    expect(MP.state.pvp.reached_first).eq(true)
    expect(MP.state.enemy.hands).eq(5)
    expect(MP.state.pvp.countdown).eq(true)
    H.fake.advance(1.0); H.fake.advance(1.0); H.fake.advance(1.01)
    H.fake.flush()
    expect(MP.state.pvp.countdown).eq(false)
    expect(find_call('select_blind')[2]).eq('bl_wall')           -- the real slot is kept…
    expect(G.GAME.round_resets.blind == G.P_BLINDS.bl_wall).truthy()
    new_round()                                                   -- …and Blind:set_blind swaps in the PvP blind
    expect(G.GAME.blind.config.blind.key).eq('bl_mp_nemesis')
    expect(G.GAME.blind.chips).eq(math.huge)
    expect(G.GAME.blind.dollars).eq(5)
    expect(MP.pvp.on_pvp_blind()).eq(true)
    G.GAME.blind:disable()
    expect(G.GAME.blind.disabled).eq(nil)                         -- FL-05
  end)

  it('the Nemesis blind counts as a boss (Chicot, Campfire, Rocket, last_blind.boss)', function()
    G.GAME.round_resets.ante = 2
    G.GAME.round_resets.blind = G.P_BLINDS.bl_wall
    new_round()
    expect(G.GAME.blind.config.blind.key).eq('bl_mp_nemesis')
    expect(G.GAME.blind.boss).eq(true)
    expect(G.GAME.last_blind.boss).eq(true)
    G.GAME.round_resets.ante = 1                                  -- not a PvP round: vanilla untouched
    G.GAME.round_resets.blind = G.P_BLINDS.bl_small
    new_round()
    expect(G.GAME.blind.boss).eq(false)
    expect(G.GAME.last_blind.boss).eq(false)
  end)

  it('a bye (or normal_bosses) plays the vanilla boss flagged as PvP', function()
    G.GAME.round_resets.ante = 3
    MP.state.pvp.bye = true
    G.GAME.round_resets.blind = G.P_BLINDS.bl_wall
    new_round()
    expect(G.GAME.blind.config.blind.key).eq('bl_wall')
    expect(G.GAME.blind.mp_pvp).eq(true)
    expect(MP.pvp.on_pvp_blind()).eq(true)
  end)

  it('reports each PvP hand, keeps drawing, then waits at 0 hands; end_pvp leaves at a safe point', function()
    G.GAME.round_resets.ante = 2
    G.GAME.round_resets.blind = G.P_BLINDS.bl_wall
    new_round()
    G.GAME.chips = 123456789012345678
    G.GAME.current_round.hands_left = 2
    G.STATE, G.STATE_COMPLETE = G.STATES.HAND_PLAYED, false
    Game.update_hand_played(G, 0)
    H.fake.flush()
    expect(G.STATE).eq(G.STATES.DRAW_TO_HAND)
    local ev = H.events('play_hand')[1]
    expect(ev.score).eq('1.2345678901234568e+17')
    expect(ev.hands_left).eq(2)
    local info = H.sent('peer')
    expect(info[1].d.k).eq('nemesis_info')
    H.sent_list = {}
    G.GAME.current_round.hands_left = 0
    G.STATE, G.STATE_COMPLETE = G.STATES.HAND_PLAYED, false
    Game.update_hand_played(G, 0)
    H.fake.flush()
    expect(G.STATE).eq(G.STATES.HAND_PLAYED)       -- waiting, not NEW_ROUND
    expect(MP.state.pvp.waiting).eq(true)
    expect(find_call('vanilla_hand_played')).eq(nil)
    -- end_pvp waits while something blocks, then ends the round
    G.E_MANAGER:add_event(Event({ func = function() return false end }))
    MP.net.receive('outcome', { hs = 2, o = { t = 'end_pvp', loser_id = 'u2', pvp_timer_lost = false } })
    MP.net.frame(0)
    expect(MP.state.pvp.ended).eq(false)
    G.E_MANAGER:clear_queue()
    MP.net.frame(0)
    expect(MP.state.pvp.ended).eq(true)
    expect(G.STATE).eq(G.STATES.NEW_ROUND)
    -- end_round on the PvP blind: no game over, $5 paid, no win at ante 8 in matches
    calls = {}
    G.GAME.win_ante = 8
    end_round()
    local c = find_call('end_round')
    expect(c[2]).eq(999)
    expect(c[3]).eq(-1)
    H.fake.flush()
    expect(G.GAME.win_ante).eq(8)
  end)

  it('PvP deck-out reports 0 hands once and waits instead of ending the round', function()
    G.GAME.round_resets.ante = 2
    G.GAME.round_resets.blind = G.P_BLINDS.bl_wall
    new_round()
    G.GAME.current_round.hands_left = 3
    end_round(); end_round(); end_round()
    expect(find_call('end_round')).eq(nil)
    local ph = H.events('play_hand')
    expect(#ph).eq(1)
    expect(ph[1].hands_left).eq(0)
    expect(G.GAME.current_round.hands_left).eq(0)
  end)

  it('hands gained mid-PvP are re-reported (FL-10)', function()
    G.GAME.round_resets.ante = 2
    G.GAME.round_resets.blind = G.P_BLINDS.bl_wall
    new_round()
    G.GAME.current_round.hands_left = 0
    ease_hands_played(2)
    H.fake.flush()
    local ph = H.events('play_hand')
    expect(ph[#ph].hands_left).eq(2)
  end)

  it('timer_hand_lost costs me one hand and re-reports', function()
    G.GAME.round_resets.ante = 2
    G.GAME.round_resets.blind = G.P_BLINDS.bl_wall
    new_round()
    G.GAME.current_round.hands_left = 3
    G.STATE = G.STATES.SELECTING_HAND
    MP.net.receive('outcome', { hs = 5, o = { t = 'timer_hand_lost', player_id = 'u1' } })
    MP.net.frame(0)
    expect(G.GAME.current_round.hands_left).eq(2)
    expect(H.events('play_hand')[1].hands_left).eq(2)
  end)
end)

describe('normal blinds, guards and economy', function()
  local MP
  before_each(function() MP = boot(); start_match(MP) end)
  after_each(function() MP.session.unmount('t'); H.teardown() end)

  it('a failed normal blind reports blind_result(false) + fail_round and is treated as beaten (FL-14)', function()
    G.GAME.round_resets.blind = G.P_BLINDS.bl_big
    new_round()
    G.GAME.chips = 10
    G.GAME.current_round.hands_played = 4
    end_round()
    local evs = H.events()
    expect(evs[1]).eq({ t = 'blind_result', ante = 1, blind = 'Big', beaten = false })
    expect(evs[2]).eq({ t = 'fail_round' })
    expect(evs[3]).eq({ t = 'furthest_blind', value = 12 })
    expect(find_call('end_round')[3]).eq(-1)
  end)

  it('the shop reports loc_shop-<next blind> (HUD-02 "Shopping before ...")', function()
    local function shop_loc()
      MP.state.location = nil
      H.sent_list = {}
      G.STATE_COMPLETE = false
      Game.update_shop(G, 0)
      local loc = H.sent('peer')
      return loc[#loc] and loc[#loc].d.d.loc
    end
    G.GAME.round_resets.ante = 1
    G.GAME.round_resets.blind_states = { Small = 'Defeated', Big = 'Upcoming', Boss = 'Upcoming' }
    expect(shop_loc()).eq('loc_shop-bl_big')
    G.GAME.round_resets.blind_states = { Small = 'Skipped', Big = 'Defeated', Boss = 'Upcoming' }
    expect(shop_loc()).eq('loc_shop-bl_wall')             -- before PvP starts: the real boss
    G.GAME.round_resets.ante = 2
    expect(shop_loc()).eq('loc_shop-bl_mp_nemesis')       -- a PvP Boss slot plays the Nemesis
    G.GAME.round_resets.blind_states = { Small = 'Upcoming', Big = 'Upcoming', Boss = 'Upcoming' }
    expect(shop_loc()).eq('loc_shop-bl_small')            -- after a Boss: cash_out reset the states
    G.GAME.round_resets.blind_choices = nil
    expect(shop_loc()).eq('loc_shop')
    G.GAME.round_resets.blind_choices = { Small = 'bl_small', Big = 'bl_big', Boss = 'bl_wall' }
  end)

  it('no_gold_on_round_loss zeroes the reward; D-07 sends nothing for an untouched blind', function()
    MP.state.session.options.noGoldOnRoundLoss = true
    G.GAME.round_resets.blind = G.P_BLINDS.bl_small
    new_round()
    G.GAME.chips = 0
    G.GAME.current_round.hands_played = 0
    G.GAME.current_round.discards_used = 0
    end_round()
    expect(#H.events('blind_result')).eq(0)
    expect(#H.events('fail_round')).eq(0)
    expect(G.GAME.blind.dollars).eq(0)
  end)

  it('a beaten blind reports once; a duplicate end_round is dropped (FL-12)', function()
    G.GAME.round_resets.blind = G.P_BLINDS.bl_small
    new_round()
    G.GAME.chips = 1e9
    end_round()
    end_round()
    local n = 0
    for _, c in ipairs(calls) do if c[1] == 'end_round' then n = n + 1 end end
    expect(n).eq(1)
    expect(H.events('blind_result')).eq({ { t = 'blind_result', ante = 1, blind = 'Small', beaten = true } })
  end)

  it('a recorded failure is final for that blind key', function()
    MP.flow.report_blind_result('Big', 2, false)
    MP.flow.report_blind_result('Big', 2, true)
    expect(#H.events('blind_result')).eq(1)
  end)

  it('skips report beaten + skip + furthest', function()
    G.GAME.blind_on_deck = 'Small'
    G.FUNCS.skip_blind({})
    local evs = H.events()
    expect(evs[1]).eq({ t = 'blind_result', ante = 1, blind = 'Small', beaten = true })
    expect(evs[2].t).eq('skip')
    expect(evs[2].skips).eq(1)
  end)

  it('ease_ante reports set_ante and ignores a second +1 in the same round', function()
    G.GAME.round_resets.blind = G.P_BLINDS.bl_wall
    new_round()
    ease_ante(1); ease_ante(1)
    H.fake.flush()
    expect(G.GAME.round_resets.ante).eq(2)
    expect(H.events('set_ante')).eq({ { t = 'set_ante', ante = 2 } })
  end)

  it('the vanilla game-over screen never shows in a match without a result', function()
    Game.update_game_over(G, 0)
    expect(find_call('vanilla_game_over')).eq(nil)
    MP.state.result = { kind = 'lose' }
    Game.update_game_over(G, 0)
    expect(find_call('vanilla_game_over') ~= nil).truthy()
  end)

  it('round evaluation runs once per round', function()
    G.STATE_COMPLETE = false
    Game.update_round_eval(G, 0)
    G.STATE_COMPLETE = false
    Game.update_round_eval(G, 0)
    local n = 0
    for _, c in ipairs(calls) do if c[1] == 'round_eval' then n = n + 1 end end
    expect(n).eq(1)
  end)

  it('removes the restart button from the options menu', function()
    local t = create_UIBox_options()
    expect(#t.nodes).eq(1)
    expect(t.nodes[1].config.button).eq('go_to_menu')
  end)

  it('ignores a duplicate draw_card into the same area', function()
    local card = {}
    local to = { cards = { card } }
    draw_card({ cards = {} }, to, 50, 'up', nil, card)
    expect(find_call('draw_card')).eq(nil)
    draw_card(to, { cards = {} }, 50, 'up', nil, card)
    expect(find_call('draw_card') ~= nil).truthy()
  end)

  it('tracks money spent', function()
    ease_dollars(-5); ease_dollars(3); ease_dollars(-2)
    expect(MP.state.spent.total).eq(7)
  end)
end)

describe('outcomes and peers', function()
  local MP
  before_each(function() MP = boot(); start_match(MP) end)
  after_each(function() MP.session.unmount('t'); H.teardown() end)

  it('dedupes by hs and applies lives / pairing / bye', function()
    MP.net.receive('outcome', { hs = 3, o = { t = 'player_lives', player_id = 'u1', lives = 3, lost = 1 } })
    MP.net.receive('outcome', { hs = 3, o = { t = 'player_lives', player_id = 'u1', lives = 1, lost = 1 } })
    expect(MP.state.lives.u1).eq(3)
    expect(MP.state.comeback.armed).eq(true)
    MP.net.receive('outcome', { hs = 4, o = { t = 'nemesis_pairing', ante = 2, pairing = { u1 = '', u2 = '' } } })
    expect(MP.state.pvp.bye).eq(true)
    expect(MP.state.target).eq(nil)
    MP.net.receive('outcome', { hs = 5, o = { t = 'nemesis_pairing', ante = 3, pairing = { u1 = 'u2', u2 = 'u1' } } })
    expect(MP.state.target).eq('u2')
    expect(MP.state.ante_nemesis).eq({ 'u2' })
    MP.net.receive('outcome', { hs = 6, o = { t = 'player_lives', player_id = '*all*', lives = 2 } })
    expect(MP.state.lives).eq({ u1 = 2, u2 = 2 })
  end)

  it('stores presence and notifies only presence observers', function()
    local seen, star = {}, 0
    MP.report.on('presence', function(p) seen[#seen + 1] = p.id .. ':' .. p.status end)
    MP.report.on('presence', function() error('boom') end)          -- a failing observer is isolated
    MP.report.on('*', function() star = star + 1 end)
    MP.net.receive('presence', { id = 'u2', status = 'away', graceMsLeft = 5000 })
    MP.net.receive('presence', { id = 'u2', status = 'back' })
    expect(MP.state.presence.u2).eq({ status = 'back' })
    expect(seen).eq({ 'u2:away', 'u2:back' })
    expect(star).eq(0)
    MP.report.observers.presence = nil
    MP.report.observers['*'] = nil
  end)

  it('maps win variants to my result once', function()
    local seen = {}
    MP.ui = { show_result = function(r) seen[#seen + 1] = r.kind end }
    MP.net.receive('outcome', { hs = 10, o = { t = 'win', winner_id = 'u1' } })
    MP.net.receive('outcome', { hs = 11, o = { t = 'win', winner_id = 'u2' } })  -- re-send: ignored
    expect(seen).eq({ 'win' })
    MP.state.result = nil
    MP.net.receive('outcome', { hs = 12, o = { t = 'win', places = { u1 = 1, u2 = 1 } } })
    expect(seen[2]).eq('draw')
    MP.state.result = nil
    MP.net.receive('outcome', { hs = 13, o = { t = 'win', places = { u1 = 2, u2 = 1 } } })
    expect(seen[3]).eq('lose')
    MP.state.result = nil
    MP.state.my_team = 'A'
    MP.net.receive('outcome', { hs = 14, o = { t = 'win', winner_team_id = 'A' } })
    expect(seen[4]).eq('win')
    MP.ui = nil
  end)

  it('only the current target updates the enemy display; skips append 0 spent', function()
    MP.net.receive('peer', { k = 'nemesis_info', from = 'u3', d = { score = '999', hands_left = 1, skips = 0, lives = 1 } })
    expect(MP.state.enemy.info_received).eq(false)
    MP.net.receive('peer', { k = 'nemesis_info', from = 'u2', d = { score = '1e+20', hands_left = 2, skips = 1, lives = 3 } })
    local e = MP.state.enemy
    expect(e.score).eq(1e20)
    expect(e.hands).eq(2)
    expect(e.spent_in_shop).eq({ 0 })
    expect(#H.sent('timer_input')).eq(1)
    MP.net.receive('peer', { k = 'opp_ctx', from = 'u2', d = { ctx = { opponent_spent_in_shop = 7 } } })
    expect(e.spent_in_shop).eq({ 0, 7 })
  end)

  it('answers deck and stats requests', function()
    G.playing_cards = { { config = { center = G.P_CENTERS.c_base }, base = { suit = 'Hearts', value = 'Ace' }, ability = {}, seal = 'Red' } }
    MP.net.receive('peer', { k = 'deck_req', from = 'u2', d = {} })
    MP.net.receive('peer', { k = 'stats_req', from = 'u2', d = {} })
    local peers = H.sent('peer')
    expect(peers[1].d).eq({ k = 'deck_res', d = { cards = 'Hearts-Ace---Red' } })
    expect(peers[2].d.k).eq('stats_res')
  end)

  it('reports flags only when they change', function()
    MP.net.frame(0)
    local n1 = #H.sent('flags')
    MP.net.frame(0)
    expect(#H.sent('flags')).eq(n1)
    G.STATE = G.STATES.SHOP
    MP.net.frame(0)
    local f = H.sent('flags')
    expect(f[#f].d.inShop).eq(true)
  end)

  it('forces game speed >= 4 only while the timer ticks (TIM-08)', function()
    G.SETTINGS.GAMESPEED = 1
    Game.update(G, 0.016)
    expect(calls[#calls]).eq({ 'update', 1 })
    MP.net.receive('timer_state', { value = 30, mode = 'ante', ticking = true, beingTimered = false, timering = true,
      pressable = false, auto = false, color = 'normal', display = nil })
    Game.update(G, 0.016)
    expect(calls[#calls]).eq({ 'update', 4 })
    expect(G.SETTINGS.GAMESPEED).eq(1)
  end)

  it('reseed restarts the run with the new seed', function()
    local launched
    MP.session.launcher = function(s) launched = s.seed end
    MP.net.receive('outcome', { hs = 20, o = { t = 'reseed', seed = 'NEWSEED1' } })
    MP.net.frame(0)
    expect(launched).eq('NEWSEED1')
  end)
end)

describe('different_decks / random_loadout at launch (C15, LOB-07)', function()
  local MP
  before_each(function()
    MP = boot()
    for _, k in ipairs({ 'b_plasma', 'b_green' }) do G.P_CENTERS[k] = { set = 'Back', order = 2, name = k } end
    _G.Back = function(center) return { effect = { center = center } } end
  end)
  after_each(function()
    MP.loadout = nil
    _G.Back = nil
    H.teardown()
  end)

  -- Mount as player `me` of a match the host set to b_red, stake 2, a challenge; launch for real.
  local function launch(me, options, over)
    local o = H.options()
    for k, v in pairs(options or {}) do o[k] = v end
    local info = { me = me, options = o, deck = 'b_red', stake = 2, challenge = 'c_omelette_1' }
    for k, v in pairs(over or {}) do info[k] = v end
    start_match(MP, info)
    MP.session.launcher = nil
    calls = {}
    expect(MP.session.launch()).eq(true)
    local c = find_call('funcs_start_run')
    local args = c and c[3] or {}
    return G.GAME.viewed_back.effect.center.name, args.stake, args.challenge and args.challenge.id
  end

  it('different_decks off: every player plays the host deck, whatever it picked', function()
    MP.loadout = { deck = 'b_plasma', stake = 5 }
    expect({ launch('u2', { differentDecks = false }) }).eq({ 'Red Deck', 2, 'c_omelette_1' })
  end)

  it('different_decks on: a player plays its own pick and no challenge; with no pick, the host deck', function()
    MP.loadout = { deck = 'b_plasma', stake = 5 }
    expect({ launch('u2', { differentDecks = true }) }).eq({ 'b_plasma', 5 })
    MP.session.unmount('t')
    MP.loadout = nil
    expect({ launch('u2', { differentDecks = true }) }).eq({ 'Red Deck', 2, 'c_omelette_1' })
  end)

  it('a random loadout (perPlayer, rolled by the host) wins over the pick, for this player only', function()
    MP.loadout = { deck = 'b_plasma', stake = 5 }
    local per = { u1 = { deck = 'b_green', stake = 7 }, u2 = { deck = 'b_plasma', stake = 1 } }
    expect({ launch('u1', { differentDecks = true, randomLoadout = true }, { perPlayer = per }) })
      .eq({ 'b_green', 7 })
    expect(MP.state.session.deck).eq('b_green')
  end)

  it('practice ignores a lobby pick', function()
    MP.loadout = { deck = 'b_plasma', stake = 5 }
    MP.session.mount('practice', { resolved = H.resolved(), options = { differentDecks = true }, seed = 'S',
      deck = 'b_red', stake = 1 })
    expect(MP.state.session.deck).eq('b_red')
  end)
end)

describe('session lifecycle', function()
  local MP
  before_each(function() MP = boot() end)
  after_each(H.teardown)

  it('mount -> unmount restores the vanilla tables, hooks and saving flag', function()
    local before = H.fingerprint()
    local sel = G.FUNCS.select_blind
    G.F_NO_SAVING = false
    start_match(MP)
    expect(G.FUNCS.select_blind ~= sel).truthy()
    MP.session.unmount('t')
    expect(G.FUNCS.select_blind == sel).truthy()
    expect(H.fingerprint()).eq(before)
    expect(G.F_NO_SAVING).eq(false)
    expect(MP.state.session).eq(nil)
    expect(MP.hooks.count('session')).eq(0)
  end)

  it('a rejoin restore after the launch waits for its screen wipe (NET-06, E2E-14)', function()
    local sess = start_match(MP, { runId = 'runR' })
    expect(sess.runId).eq('runR')
    local loads = {}
    local load = MP.session.load_snapshot
    MP.session.load_snapshot = function(path) loads[#loads + 1] = path end
    G.screenwipe = {} -- the launch's start_run is still wiping
    MP.net.receive('rejoin_restore', { runId = 'runR', snapshotPath = '/rmh/mp/run.jkr', statePath = '/rmh/mp/state.json' })
    MP.net.frame(0)
    expect(#loads).eq(0)
    G.screenwipe = nil
    MP.net.frame(0)
    expect(loads).eq({ '/rmh/mp/run.jkr' })
    MP.session.load_snapshot = load
  end)

  it('a restore from the menu does not unlock Throwback over the restored run (E2E-14)', function()
    start_match(MP, { runId = 'runR' })
    -- A reloaded page restores before any launch: G.GAME is the menu's unseeded game object.
    G.GAME.seeded = nil
    calls = {}
    expect(MP.session.restore_raw('return {STATE=5}', nil)).eq(true)
    expect(find_call('funcs_start_run') ~= nil).truthy()
    -- G.FUNCS.start_run queues Game:start_run; run it as that event does.
    Game.start_run(G, { savetext = { STATE = 5 } })
    expect(find_call('start_run') ~= nil).truthy()
    expect(find_call('check_for_unlock')).eq(nil)
    expect(MP.session.restoring).eq(nil)
    -- Outside a restore the check is vanilla's.
    check_for_unlock({ type = 'continue_game' })
    expect(find_call('check_for_unlock')).eq({ 'check_for_unlock', 'continue_game' })
  end)

  it('go_to_menu leaves the session after the run is deleted', function()
    start_match(MP)
    G.FUNCS.go_to_menu()
    expect(MP.state.session ~= nil).truthy()
    H.fake.flush()
    expect(MP.state.session).eq(nil)
    expect(#H.sent('match_left')).eq(1)
  end)

  it('applies The Order seed prefix at Game:start_run', function()
    start_match(MP)
    Game.start_run(G, { seed = 'ABCD1234' })
    expect(find_call('start_run')[2]).eq('*ABCD1234')
    expect(H.events('set_ante')).eq({ { t = 'set_ante', ante = 0 } })
    MP.session.unmount('t')
  end)

  it('practice: PvP from ante 2, The Order on, failed blinds never fail', function()
    MP.session.launcher = function() return true end
    MP.net.receive('practice_start', { resolved = H.resolved({ flags = { theOrder = false, enemyLocationDisabled = false, comeback = 'default' } }),
      deck = 'b_red', stake = 1, seed = nil })
    MP.net.frame(0)
    expect(MP.is_practice()).truthy()
    expect(MP.order.active()).truthy()
    expect(MP.attrition.slot_is_pvp('Boss', 2)).truthy()
    expect(MP.attrition.slot_is_pvp('Boss', 1)).falsy()
    G.GAME.round_resets.blind = G.P_BLINDS.bl_big
    new_round()
    G.GAME.chips = 0
    end_round()
    expect(find_call('end_round')[3]).eq(-1)
    expect(#H.events('fail_round')).eq(0)
    MP.session.unmount('t')
  end)
end)

describe('reference joker j_mp_pacifist (M1 smoke, end to end through the dispatch)', function()
  local MP
  before_each(function()
    MP = boot()
    -- Vanilla-shaped Card methods the dispatch wraps.
    Card.calculate_joker = function() return nil end
    Card.generate_UIBox_ability_table = function(self)
      return generate_card_ui(self.config.center, nil, nil, 'Joker')
    end
    _G.generate_card_ui = function(_c, _, vars) return { key = _c.key, vars = vars } end
    start_match(MP)
  end)
  after_each(function() MP.session.unmount('t'); _G.generate_card_ui = nil; H.teardown() end)

  it('is pooled in an MP-content ruleset and scores X10 outside the PvP blind only', function()
    expect(MP.registry.enabled('j_mp_pacifist')).eq(true)
    local commons = G.P_JOKER_RARITY_POOLS[1]
    expect(commons[#commons].key).eq('j_mp_pacifist')
    local center = G.P_CENTERS.j_mp_pacifist
    local card = { config = { center = center }, ability = { set = 'Joker', extra = { x_mult = center.config.extra.x_mult } } }
    local eff = Card.calculate_joker(card, { joker_main = true })
    expect(eff.Xmult_mod).eq(10)
    expect(Card.calculate_joker(card, { before = true })).eq(nil)
    G.GAME.round_resets.ante = 2
    G.GAME.round_resets.blind = G.P_BLINDS.bl_wall
    new_round()
    expect(Card.calculate_joker(card, { joker_main = true })).eq(nil)
    expect(Card.generate_UIBox_ability_table(card)).eq({ key = 'j_mp_pacifist', vars = { 10 } })
  end)

  it('is not pooled under a ruleset without MP content, and vanishes on unmount', function()
    MP.session.unmount('t')
    start_match(MP, { resolved = H.resolved({ multiplayerContent = false }) })
    expect(MP.registry.enabled('j_mp_pacifist')).eq(false)
    MP.session.unmount('t')
    expect(G.P_CENTERS.j_mp_pacifist).eq(nil)
    start_match(MP)
  end)
end)
