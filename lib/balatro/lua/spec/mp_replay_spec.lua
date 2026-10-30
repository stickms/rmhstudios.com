-- WS13 replays with a fake G (L1): the recorder's ops, batching and caps, and the playback
-- driver's determinism on a small deterministic toy game (deal, play, discard, cash out, shop,
-- reorder, network inputs), plus divergence detection and the playback's network isolation.

local H = require 'spec.mp_helper'
local fake = require 'spec.fake_g'

local MP, G, REP, RC, PL

-- ── The toy game: just enough of Balatro's shape for the recorder and the player ──────────

local VALUES = { '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King', 'Ace' }
local SUITS = { 'Hearts', 'Spades', 'Clubs', 'Diamonds' }

local function areaify(a)
  a.highlighted = {}
  function a:unhighlight_all() self.highlighted = {} end
  function a:add_to_highlighted(c) self.highlighted[#self.highlighted + 1] = c end
  function a:set_ranks() end
  function a:align_cards() end
  function a:emplace(card)
    self.cards[#self.cards + 1] = card
    card.area = self
  end
  function a:remove_card(card)
    for i, c in ipairs(self.cards) do
      if c == card then table.remove(self.cards, i); card.area = nil; return card end
    end
  end
end

local function new_card(center, suit, value)
  G.sort_id = (G.sort_id or 0) + 1
  local c = { sort_id = G.sort_id, config = { center = G.P_CENTERS[center] }, ability = { set = 'Joker' } }
  if suit then
    c.base = { suit = suit, value = value, nominal = 0 }
    for i, v in ipairs(VALUES) do if v == value then c.base.nominal = i + 1 end end
    c.ability.set = 'Default'
  end
  return c
end

local function draw(n)
  for _ = 1, n do
    local c = table.remove(G.deck.cards, 1)
    if not c then return end
    G.hand:emplace(c)
  end
end

local function install_toy()
  for _, n in ipairs({ 'hand', 'jokers', 'consumeables', 'deck', 'shop_jokers' }) do areaify(G[n]) end
  G.P_CENTERS.c_base.key = 'c_base'
  G.P_CENTERS.j_joker.key = 'j_joker'
  G.P_CENTERS.j_greedy_joker.key = 'j_greedy_joker'
  G.STATE_COMPLETE = true
  G.STAGE = G.STAGES.RUN
  _G.Game = {
    start_run = function(_, args)
      G.GAME.pseudorandom.seed = args.seed
      G.GAME.round, G.GAME.dollars, G.GAME.chips = 0, 4, 0
      G.GAME.round_resets.ante = 1
      G.GAME.current_round.hands_left, G.GAME.current_round.discards_left = 4, 3
      G.GAME.blind_on_deck = 'Small'
      for _, n in ipairs({ 'hand', 'jokers', 'deck', 'shop_jokers' }) do G[n].cards = {}; G[n].highlighted = {} end
      local h = pseudohash(args.seed or 'X')
      G.playing_cards = {}
      for i = 1, 24 do
        local k = math.floor((h * 7919 + i * 104729) % 52)
        local c = new_card('c_base', SUITS[(k % 4) + 1], VALUES[(math.floor(k / 4) % 13) + 1])
        G.deck:emplace(c)
        G.playing_cards[#G.playing_cards + 1] = c
      end
      G.STATE = G.STATES.BLIND_SELECT
      G.blind_select = {}
    end,
  }
  G.FUNCS.start_run = function(_, args) Game.start_run(G, args or {}) end
  G.FUNCS.go_to_menu = function() end
  G.FUNCS.select_blind = function(e)
    G.GAME.round = G.GAME.round + 1
    G.GAME.chips = 0
    G.GAME.current_round.hands_left = 4
    G.blind_select = nil
    G.toy_blind = e.config.ref_table.key
    draw(5)
    G.STATE = G.STATES.SELECTING_HAND
  end
  G.FUNCS.play_cards_from_highlighted = function()
    local sum = 0
    for _, c in ipairs(G.hand.highlighted) do sum = sum + c.base.nominal; G.hand:remove_card(c) end
    sum = sum * (1 + #G.jokers.cards)
    G.hand.highlighted = {}
    G.GAME.chips = G.GAME.chips + sum
    G.GAME.current_round.hands_left = G.GAME.current_round.hands_left - 1
    MP.event({ t = 'play_hand', score = tostring(G.GAME.chips), hands_left = G.GAME.current_round.hands_left, skips = 0 })
    draw(5 - #G.hand.cards)
    if G.GAME.chips >= 30 then
      G.STATE = G.STATES.ROUND_EVAL
      G.round_eval = {}
    end
  end
  G.FUNCS.discard_cards_from_highlighted = function()
    for _, c in ipairs(G.hand.highlighted) do G.hand:remove_card(c) end
    G.hand.highlighted = {}
    G.GAME.current_round.discards_left = G.GAME.current_round.discards_left - 1
    draw(5 - #G.hand.cards)
  end
  G.FUNCS.cash_out = function()
    G.GAME.dollars = G.GAME.dollars + 5
    G.round_eval = nil
    G.hand.cards = {}
    G.shop = {}
    G.shop_jokers.cards = {}
    local j = new_card('j_joker'); j.cost = 2; G.shop_jokers:emplace(j)
    local k = new_card('j_greedy_joker'); k.cost = 5; G.shop_jokers:emplace(k)
    G.STATE = G.STATES.SHOP
  end
  G.FUNCS.buy_from_shop = function(e)
    local c = e.config.ref_table
    G.shop_jokers:remove_card(c)
    G.jokers:emplace(c)
    G.GAME.dollars = G.GAME.dollars - (c.cost or 0)
  end
  G.FUNCS.sell_card = function(e)
    local c = e.config.ref_table
    c.area:remove_card(c)
    G.GAME.dollars = G.GAME.dollars + 1
  end
  G.FUNCS.toggle_shop = function()
    G.shop = nil
    G.GAME.blind_on_deck = 'Big'
    G.blind_select = {}
    G.STATE = G.STATES.BLIND_SELECT
  end
  -- Outcomes change the run: a `reseed` restarts it; `player_lives` moves the lives.
end

local SEED = 'TOYSEED1'

local function boot()
  MP, G = H.boot()
  H.transport()
  install_toy()
  REP = MP.replay
  RC = REP.recorder
  PL = REP.player
end

local function mount_practice()
  MP.session.mount('practice', { resolved = H.resolved({ layers = {} }), deck = 'b_red', stake = 1, seed = SEED, me = 'u_me',
    shape = { nemesisPairing = true, practice = true }, options = H.options() })
  MP.session.launch()
end

local function frames(n, until_fn)
  for _ = 1, n do
    MP.net.frame(0.016)
    fake.advance(0.016)
    if until_fn and until_fn() then return true end
  end
  return until_fn == nil
end

--- Every logged event so far (flushing all pending batches).
local function logged()
  for _ = 1, 200 do if RC.flush() == 0 then break end end
  local out = {}
  for _, m in ipairs(H.sent('log')) do
    for _, ev in ipairs(m.d.batch) do out[#out + 1] = ev end
  end
  return out
end

local function ops(list)
  local out = {}
  for _, ev in ipairs(list) do out[#out + 1] = ev.op end
  return out
end

local function find(list, op, n)
  n = n or 1
  for _, ev in ipairs(list) do
    if ev.op == op then
      n = n - 1
      if n == 0 then return ev end
    end
  end
end

local function hand_keys()
  local out = {}
  for _, c in ipairs(G.hand.cards) do out[#out + 1] = REP.fingerprint(c) end
  return table.concat(out, ',')
end

local function toy_state()
  return { digest = REP.digest(), chips = G.GAME.chips, hand = hand_keys(), state = G.STATE, blind = G.toy_blind,
    lives = MP.state.lives.u_me }
end

--- A short scripted run: select, reorder + play, discard, play to win, cash out, buy, sell,
--- leave; an outcome and a peer message arrive in between.
local function scripted_run()
  mount_practice()
  G.FUNCS.select_blind({ config = { ref_table = G.P_BLINDS.bl_small } })
  MP.net.receive('outcome', { o = { t = 'player_lives', player_id = 'u_me', lives = 3, lost = 1 }, hs = 1 })
  -- The player drags the hand around.
  local a, b = G.hand.cards[1], G.hand.cards[5]
  G.hand.cards[1], G.hand.cards[5] = b, a
  G.hand:add_to_highlighted(G.hand.cards[1]); G.hand:add_to_highlighted(G.hand.cards[2])
  G.FUNCS.play_cards_from_highlighted()
  G.hand:add_to_highlighted(G.hand.cards[3])
  G.FUNCS.discard_cards_from_highlighted()
  MP.net.receive('peer', { k = 'nemesis_info', from = 'u_opp', d = { score = '120', hands_left = 3, skips = 0, lives = 4 } })
  local guard = 0
  while G.STATE == G.STATES.SELECTING_HAND and guard < 10 do
    guard = guard + 1
    for i = 1, math.min(3, #G.hand.cards) do G.hand:add_to_highlighted(G.hand.cards[i]) end
    G.FUNCS.play_cards_from_highlighted()
  end
  G.FUNCS.cash_out()
  G.FUNCS.buy_from_shop({ config = { ref_table = G.shop_jokers.cards[1] } })
  G.FUNCS.sell_card({ config = { ref_table = G.jokers.cards[1] } })
  G.FUNCS.buy_from_shop({ config = { ref_table = G.shop_jokers.cards[1] } })
  G.FUNCS.toggle_shop()
  G.FUNCS.select_blind({ config = { ref_table = G.P_BLINDS.bl_big } })
  G.FUNCS.play_cards_from_highlighted() -- nothing highlighted: scores 0
  return toy_state()
end

describe('replay recorder', function()
  before_each(boot)
  after_each(H.teardown)

  it('opens the log with the manifest, the lobby info and the run info', function()
    mount_practice()
    local log = logged()
    expect(ops(log)[1]).eq('match_manifest')
    expect(log[1].d.kind).eq('practice')
    expect(log[1].d.me).eq('u_me')
    expect(log[2].op).eq('lobby_info')
    expect(log[2].d.seed).eq(SEED)
    expect(log[2].d.resolved.key).eq('ruleset_mp_balanced')
    expect(log[2].d.shape.practice).eq(true)
    local run = find(log, 'run_info')
    expect(run ~= nil).truthy()
    expect(run.d.seed).eq(G.GAME.pseudorandom.seed)
    for i, ev in ipairs(log) do expect(ev.i).eq(i - 1) end
  end)

  it('records inputs with card refs, digests, reorders and network inputs, in order', function()
    scripted_run()
    local log = logged()
    local seq = table.concat(ops(log), ' ')
    expect(seq:find('select_blind hand_scored set_ante_key net_in life_lost reorder play', 1, true) ~= nil).truthy()
    local sel = find(log, 'select_blind')
    expect(sel.d.slot).eq('Small')
    expect(sel.d.key).eq('bl_small')
    expect(sel.d.dg:match('^a1;') ~= nil).truthy()
    local re = find(log, 'reorder')
    expect(re.d.area).eq('hand')
    expect(#re.d.cards).eq(5)
    local play = find(log, 'play')
    expect(#play.d.cards).eq(2)
    expect(play.d.cards[1].k:find('c_base|', 1, true) ~= nil).truthy()
    expect(play.d.cards[1].i).eq(1)
    local net = find(log, 'net_in')
    expect(net.d.k).eq('outcome')
    expect(net.d.d.o.t).eq('player_lives')
    expect(find(log, 'life_lost').d.lives).eq(3)
    expect(find(log, 'net_in', 2).d.k).eq('peer')
    expect(find(log, 'discard') ~= nil).truthy()
    expect(find(log, 'cashout').d.dg ~= nil).truthy()
    expect(find(log, 'buy').d.ref.k).eq('j_joker')
    expect(find(log, 'sell').d.area).eq('jokers')
    expect(find(log, 'leave_shop') ~= nil).truthy()
    expect(find(log, 'hand_scored', 2).d.score ~= '0').truthy()
  end)

  it('sends batches of at most 50 events and 12 KB, keeping what is not sent', function()
    mount_practice()
    for k = 1, 130 do RC.record('money_delta', { n = k, pad = string.rep('x', 200) }) end
    MP.net.flush()
    H.sent_list = {}
    local n = RC.flush()
    expect(n <= RC.BATCH_MAX).truthy()
    local b = H.sent('log')[1].d.batch
    expect(#b).eq(n)
    expect(#MP.json.encode(b) <= RC.BATCH_BYTES + 1024).truthy()
    expect(#RC.pending > 0).truthy()
    local all = logged()
    expect(#all > 100).truthy()
    expect(all[#all].i).eq(RC.i - 1)
  end)

  it('stops at the event cap with an end {cap} event', function()
    RC.LIMIT_EVENTS = 12
    mount_practice()
    for k = 1, 40 do RC.record('money_delta', { n = k }) end
    local log = logged()
    expect(#log).eq(12)
    expect(log[#log].op).eq('end')
    expect(log[#log].d.result).eq('cap')
    expect(RC.full).eq(true)
    RC.LIMIT_EVENTS = 20000
  end)

  it('stops at the byte cap', function()
    RC.LIMIT_BYTES = 4000
    mount_practice()
    for k = 1, 40 do RC.record('money_delta', { pad = string.rep('y', 300), n = k }) end
    local log = logged()
    expect(log[#log].d.result).eq('cap')
    expect(#log < 20).truthy()
    RC.LIMIT_BYTES = 1024 * 1024
  end)

  it('closes the log with end when the session unmounts, and records nothing after', function()
    mount_practice()
    MP.session.unmount('test')
    local log = logged()
    expect(log[#log].op).eq('end')
    expect(log[#log].d.result).eq('left')
    local n = #log
    G.FUNCS.select_blind({ config = { ref_table = G.P_BLINDS.bl_small } })
    expect(#logged()).eq(n)
  end)

  it('records the match result once', function()
    mount_practice()
    MP.state.result = { kind = 'win' }
    frames(2)
    MP.session.unmount('test')
    local log = logged()
    local ends = 0
    for _, ev in ipairs(log) do if ev.op == 'end' then ends = ends + 1; expect(ev.d.result).eq('win') end end
    expect(ends).eq(1)
  end)

  it('does not record outside match/practice sessions', function()
    MP.session.mount('continued', { resolved = H.resolved(), deck = 'b_red', seed = SEED })
    expect(RC.active).eq(false)
    expect(#logged()).eq(0)
  end)
end)

describe('replay playback', function()
  before_each(boot)
  after_each(function()
    if PL and PL.s then PL.close(true) end
    H.teardown()
  end)

  local function record()
    local final = scripted_run()
    MP.session.unmount('test')
    local log = logged()
    H.sent_list = {}
    return final, log
  end

  local function play(log, opts)
    opts = opts or {}
    G.STATE = G.STATES.MENU
    PL.open({ id = 'rep1', pov = 'u_me', speed = opts.speed or 0 })
    PL.feed('u_me', log)
    frames(opts.frames or 600, function() return PL.s == nil or PL.s.state ~= 'running' end)
    return PL.s
  end

  it('re-executes the log to the identical end state', function()
    local final, log = record()
    local s = play(log)
    expect(s.error).eq(nil)
    expect(s.state).eq('done')
    expect(s.pos).eq(#log)
    expect(toy_state()).eq(final)
  end)

  it('is deterministic at every speed, fed in shuffled chunks', function()
    local final, log = record()
    local shuffled = {}
    for i = #log, 1, -1 do shuffled[#shuffled + 1] = log[i] end
    G.STATE = G.STATES.MENU
    PL.open({ id = 'rep2', pov = 'u_me', speed = 4 })
    PL.feed('u_me', { shuffled[1], shuffled[2] })
    PL.feed('u_me', shuffled)
    PL.feed('u_me', log) -- duplicates are ignored
    frames(800, function() return PL.s.state ~= 'running' end)
    expect(PL.s.state).eq('done')
    expect(toy_state()).eq(final)
  end)

  it('plays back without sending session traffic or applying live traffic', function()
    local _, log = record()
    G.STATE = G.STATES.MENU
    PL.open({ id = 'rep3', pov = 'u_me', speed = 0 })
    PL.feed('u_me', { log[1], log[2], log[3] })
    frames(5)
    expect(MP.state.session.replay.id).eq('rep3')
    expect(MP.net.receive('outcome', { o = { t = 'player_lives', player_id = 'u_me', lives = 1 }, hs = 99 })).eq(false)
    expect(MP.state.lives.u_me).eq(nil)
    PL.feed('u_me', log)
    frames(600, function() return PL.s.state ~= 'running' end)
    expect(#H.sent('ev')).eq(0)
    expect(#H.sent('log')).eq(0)
    expect(#H.sent('peer')).eq(0)
    expect(MP.state.lives.u_me).eq(3)
  end)

  it('stops with a divergence error when a card cannot be found', function()
    local _, log = record()
    local play_ev = find(log, 'play')
    play_ev.d.cards[1].k = 'c_base|Stars:Zero'
    local s = play(log)
    expect(s.state).eq('diverged')
    expect(s.error.op).eq('play')
    expect(s.error.msg:find('no card', 1, true) ~= nil).truthy()
  end)

  it('stops with a divergence error when the state digest differs', function()
    local _, log = record()
    local ev = find(log, 'cashout')
    ev.d.dg = ev.d.dg .. 'X'
    local s = play(log)
    expect(s.state).eq('diverged')
    expect(s.error.op).eq('cashout')
    expect(s.error.msg:find('state differs', 1, true) ~= nil).truthy()
  end)

  it('stops with a divergence error when a hand scores differently', function()
    local _, log = record()
    local ev = find(log, 'hand_scored', 2)
    ev.d.score = '99999'
    local s = play(log)
    expect(s.state).eq('diverged')
    expect(s.error.op).eq('hand_scored')
  end)

  it('builds a seek index and seeks back by restarting', function()
    local final, log = record()
    local s = play(log)
    expect(s.state).eq('done')
    local idx = PL.seek_index()
    expect(#idx).eq(2)
    expect(idx[1].slot).eq('Small')
    expect(idx[2].slot).eq('Big')
    expect(idx[1].ante).eq(1)
    PL.s.state = 'running'
    PL.seek(idx[2].pos)
    expect(PL.s.pos).eq(0)
    frames(600, function() return PL.s.state ~= 'running' end)
    expect(PL.s.state).eq('done')
    expect(toy_state()).eq(final)
  end)

  it('waits at the end of a live (spectated) feed for more events', function()
    local final, log = record()
    G.STATE = G.STATES.MENU
    PL.open({ id = 'live:run1', pov = 'u_me', live = true })
    local half = math.floor(#log / 2)
    local first = {}
    for i = 1, half do first[i] = log[i] end
    PL.feed('u_me', first)
    frames(300, function() return PL.s.pos >= half end)
    expect(PL.s.pos).eq(half)
    expect(PL.s.state).eq('running')
    PL.feed('u_me', log)
    frames(600, function() return PL.s.state ~= 'running' end)
    expect(PL.s.state).eq('done')
    expect(toy_state()).eq(final)
  end)

  it('a real match_start ends the playback and mounts the match', function()
    local _, log = record()
    PL.open({ id = 'rep4', pov = 'u_me', speed = 0 })
    PL.feed('u_me', { log[1], log[2] })
    frames(3)
    expect(MP.state.session.replay ~= nil).truthy()
    MP.net.handlers.match_start = function(d) MP.session.mount('match', d) end
    REP.playing = true
    MP.net.receive('match_start', { runId = 'r2', me = 'u_me' })
    expect(PL.s).eq(nil)
  end)

  it('speed accepts 0, 1, 2 and 4 only', function()
    PL.open({ id = 'rep5', pov = 'u_me' })
    expect(PL.speed(2)).eq(2)
    expect(PL.speed(3)).eq(1)
    expect(PL.speed(0)).eq(0)
    expect(G.SETTINGS.GAMESPEED).eq(PL.FF_GAMESPEED)
    PL.close(true)
    expect(G.SETTINGS.GAMESPEED).eq(1)
  end)
end)
