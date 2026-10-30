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

-- The toy's save (vanilla's save_run table, in miniature) and Continue path. Loading creates new
-- cards (new sort ids), as vanilla does.
local function toy_pack(t, rec)
  local parts, keys = {}, {}
  for k in pairs(t) do keys[#keys + 1] = k end
  table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
  for _, k in ipairs(keys) do
    local v = t[k]
    local key = type(k) == 'string' and ('[' .. string.format('%q', k) .. ']') or ('[' .. k .. ']')
    local val
    if type(v) == 'table' then val = toy_pack(v, true)
    elseif type(v) == 'string' then val = string.format('%q', v)
    else val = tostring(v) end
    parts[#parts + 1] = key .. '=' .. val
  end
  return (rec and '' or 'return ') .. '{' .. table.concat(parts, ',') .. '}'
end

local function toy_save()
  local function list(name)
    local out = {}
    for _, c in ipairs(G[name].cards) do
      out[#out + 1] = { center = c.config.center.key, suit = c.base and c.base.suit, value = c.base and c.base.value,
        cost = c.cost }
    end
    return out
  end
  local g = G.GAME
  return { seed = g.pseudorandom.seed, round = g.round, dollars = g.dollars, chips = g.chips,
    ante = g.round_resets.ante, hands = g.current_round.hands_left, discards = g.current_round.discards_left,
    on_deck = g.blind_on_deck, state = G.STATE, blind = G.toy_blind, deck = list('deck'), hand = list('hand'),
    jokers = list('jokers'), shop = list('shop_jokers'), in_shop = G.shop ~= nil, eval = G.round_eval ~= nil,
    choosing = G.blind_select ~= nil }
end

local function toy_load(t)
  local g = G.GAME
  g.pseudorandom.seed = t.seed
  g.round, g.dollars, g.chips = t.round, t.dollars, t.chips
  g.round_resets.ante = t.ante
  g.current_round.hands_left, g.current_round.discards_left = t.hands, t.discards
  g.blind_on_deck = t.on_deck
  G.toy_blind = t.blind
  G.playing_cards = {}
  for _, n in ipairs({ 'deck', 'hand', 'jokers', 'shop_jokers' }) do
    G[n].cards, G[n].highlighted = {}, {}
    for _, s in ipairs(t[n == 'shop_jokers' and 'shop' or n] or {}) do
      local c = new_card(s.center, s.suit, s.value)
      c.cost = s.cost
      G[n]:emplace(c)
      if s.suit then G.playing_cards[#G.playing_cards + 1] = c end
    end
  end
  G.shop = t.in_shop and {} or nil
  G.round_eval = t.eval and {} or nil
  G.blind_select = t.choosing and {} or nil
  G.STATE = t.state
end

--- The redirected save_run: the toy's table through the real MP snapshot writer.
local function toy_save_run()
  G.ARGS = G.ARGS or {}
  G.ARGS.save_run = toy_save()
  return MP.saves.write_snapshot()
end

local function install_toy()
  for _, n in ipairs({ 'hand', 'jokers', 'consumeables', 'deck', 'shop_jokers' }) do areaify(G[n]) end
  G.P_CENTERS.c_base.key = 'c_base'
  G.P_CENTERS.j_joker.key = 'j_joker'
  G.P_CENTERS.j_greedy_joker.key = 'j_greedy_joker'
  G.STATE_COMPLETE = true
  G.STAGE = G.STAGES.RUN
  _G.STR_PACK = toy_pack
  _G.Game = {
    start_run = function(_, args)
      if args.savetext then return toy_load(args.savetext) end
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

  it('does not record the calls the game makes itself (The Hook, buy-and-use, tag boosters)', function()
    mount_practice()
    G.FUNCS.use_card = function() end
    MP.hooks.remove_group('session')
    MP.session.install_session_hooks()
    local n = #logged()
    G.FUNCS.discard_cards_from_highlighted(nil, true)
    G.FUNCS.use_card({ config = { ref_table = { from_tag = true, config = { center = G.P_CENTERS.c_fool } } } })
    G.FUNCS.use_card({ config = { ref_table = { config = { center = G.P_CENTERS.c_fool } } } }, true)
    G.FUNCS.use_card({ config = { ref_table = { config = { center = G.P_CENTERS.c_fool } } } }, nil, true)
    expect(#logged()).eq(n)
    G.FUNCS.use_card({ config = { ref_table = { config = { center = G.P_CENTERS.c_fool } } } })
    expect(find(logged(), 'use') ~= nil).truthy()
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

  it('a played-back run is read-only: the player cannot press its buttons', function()
    local _, log = record()
    G.STATE = G.STATES.MENU
    PL.open({ id = 'rep6', pov = 'u_me', speed = 0 })
    PL.feed('u_me', { log[1], log[2], log[3] })
    frames(20, function() return PL.s.pos >= 3 and PL.idle() end)
    expect(G.STATE).eq(G.STATES.BLIND_SELECT)
    G.FUNCS.select_blind({ config = { ref_table = G.P_BLINDS.bl_small } })
    expect(G.STATE).eq(G.STATES.BLIND_SELECT)
    PL.feed('u_me', log)
    frames(600, function() return PL.s.state ~= 'running' end)
    expect(PL.s.state).eq('done')
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

-- ── A reload rejoin in the log (docs/balatro-mp.md §11) ──────────────────────────────────────

describe('replay across a reload rejoin', function()
  local files

  local function memio()
    MP.saves.io = {
      write = function(p, s) files[p] = s; return true end,
      read = function(p) return files[p] end,
      remove = function(p) files[p] = nil end,
    }
  end

  local function boot_match()
    boot()
    memio()
  end

  local function match_info(over)
    local info = { runId = 'runRJ', me = 'u_me', hostId = 'u_opp', seed = SEED, deck = 'b_red', stake = 1,
      queueMode = 'pvp_nemesis', ruleset = 'ruleset_mp_balanced', resolved = H.resolved({ layers = {} }),
      options = H.options({ timer = false }), shape = { nemesisPairing = true },
      roster = { { id = 'u_me', name = 'ME' }, { id = 'u_opp', name = 'OPP' } }, contentHash = 'x' }
    for k, v in pairs(over or {}) do info[k] = v end
    return info
  end

  --- First life of the page: blind 1 won, cashed out, snapshot in the shop, then progress the
  --- reload loses (a buy, a sell). Returns the log and the snapshot's log index.
  local function first_life()
    files = {}
    boot_match()
    MP.session.mount('match', match_info())
    MP.session.launch()
    G.FUNCS.select_blind({ config = { ref_table = G.P_BLINDS.bl_small } })
    local guard = 0
    while G.STATE == G.STATES.SELECTING_HAND and guard < 10 do
      guard = guard + 1
      for i = 1, math.min(3, #G.hand.cards) do G.hand:add_to_highlighted(G.hand.cards[i]) end
      G.FUNCS.play_cards_from_highlighted()
    end
    G.FUNCS.cash_out()
    expect(toy_save_run()).eq(true)
    local snap_i = RC.i
    G.FUNCS.buy_from_shop({ config = { ref_table = G.shop_jokers.cards[1] } })
    G.FUNCS.sell_card({ config = { ref_table = G.jokers.cards[1] } })
    local log = logged()
    H.teardown() -- the page reloads: no unmount, no `end`
    return log, snap_i
  end

  --- The reloaded page: match_start with logNext, the launch, then the restore; then it plays on.
  local function second_life(log_next, opts)
    opts = opts or {}
    boot_match()
    MP.session.mount('match', match_info({ logNext = log_next }))
    if not opts.no_launch then MP.session.launch() end
    if not opts.no_snapshot then expect(MP.session.load_snapshot()).eq(true) end
    if G.STATE == G.STATES.SHOP then
      G.FUNCS.buy_from_shop({ config = { ref_table = G.shop_jokers.cards[2] } })
      G.FUNCS.toggle_shop()
    end
    G.FUNCS.select_blind({ config = { ref_table = G.P_BLINDS.bl_big } })
    for i = 1, 2 do G.hand:add_to_highlighted(G.hand.cards[i]) end
    G.FUNCS.play_cards_from_highlighted()
    local final = toy_state()
    MP.session.unmount('test')
    local log = logged()
    H.teardown()
    return log, final
  end

  local function join(old, base, new)
    local out = {}
    for k = 1, base do out[k] = old[k] end
    for _, ev in ipairs(new) do out[#out + 1] = ev end
    return out
  end

  local function play_back(feeds, opts)
    opts = opts or {}
    boot()
    G.STATE = G.STATES.MENU
    PL.open({ id = opts.live and 'live:runRJ' or 'rep-rj', pov = 'u_me', live = opts.live, speed = 0 })
    for _, f in ipairs(feeds) do
      PL.feed('u_me', f)
      frames(800, function() return PL.s.state ~= 'running' or PL.s.pos >= PL.s.n end)
    end
    frames(800, function() return PL.s.state ~= 'running' end)
    return PL.s
  end

  after_each(function()
    if PL and PL.s then PL.close(true) end
    H.teardown()
  end)

  it('the snapshot records its own log index', function()
    local _, snap_i = first_life()
    boot_match()
    local st = MP.saves.read_state()
    expect(st.log_i).eq(snap_i)
    expect(st.runId).eq('runRJ')
  end)

  it('the rejoined log continues at logNext with the mount and restore markers and the snapshot', function()
    local old, snap_i = first_life()
    local new = second_life(#old)
    expect(new[1].i).eq(#old)
    expect(new[1].op).eq('manifest')
    expect(new[1].d).eq({ rejoin = true, v = 2, mount = true, seg = #old })
    for k, ev in ipairs(new) do expect(ev.i).eq(#old + k - 1) end
    expect(find(new, 'match_manifest')).eq(nil)
    expect(find(new, 'lobby_info')).eq(nil)
    expect(new[2].op).eq('run_info') -- the launch ran before the restore (as live, E2E-14)
    local restore = new[3]
    expect(restore.d.restore).eq(true)
    expect(restore.d.from).eq(snap_i)
    expect(restore.d.seg).eq(#old)
    expect(restore.d.z).eq('raw')
    expect(restore.d.parts >= 1).truthy()
    local data = {}
    for j = 1, restore.d.parts do
      expect(new[3 + j].d.snap).eq(j)
      data[j] = new[3 + j].d.data
    end
    local run, state = REP.unpack_snapshot(REP.decode_blob(table.concat(data), 'raw'))
    expect(run).eq(files['/rmh/mp/run.jkr'])
    expect(state).eq(files['/rmh/mp/state.json'])
  end)

  it('a log without a usable logNext (< 2: no lobby info held) starts at 0 as before', function()
    local old = first_life()
    expect(old[1].op).eq('match_manifest')
    local new = second_life(1)
    expect(new[1].i).eq(0)
    expect(new[1].op).eq('match_manifest')
    local restore
    for _, ev in ipairs(new) do if ev.op == 'manifest' and ev.d.restore then restore = ev end end
    expect(restore.d.seg).eq(nil)
    expect(restore.d.mount).eq(nil)
  end)

  it('plays a stored log past the rejoin to the identical end state, skipping the lost progress', function()
    local old, snap_i = first_life()
    local new, final = second_life(#old)
    -- The lost progress would diverge if it were played (its sell is tampered): it is skipped.
    local tampered = false
    for k = snap_i + 1, #old do
      if old[k].op == 'sell' then old[k].d.ref.k = 'j_nope'; tampered = true end
    end
    expect(tampered).eq(true)
    local s = play_back({ join(old, #old, new) })
    expect(s.error).eq(nil)
    expect(s.state).eq('done')
    expect(toy_state()).eq(final)
    expect(PL.s.skips[snap_i]).eq(#old)
  end)

  it('a live (spectated) feed that played the lost progress first still restores and continues', function()
    local old = first_life()
    local new, final = second_life(#old)
    local s = play_back({ old, new }, { live = true })
    expect(s.error).eq(nil)
    expect(s.state).eq('done')
    expect(toy_state()).eq(final)
  end)

  it('a rejoin marker over events a peer held past the host drops them and continues there', function()
    local old, snap_i = first_life()
    local base = #old - 1 -- the host held one event less than this peer
    expect(base > snap_i).truthy()
    local new, final = second_life(base)
    local s = play_back({ old, new }, { live = true })
    expect(s.error).eq(nil)
    expect(s.state).eq('done')
    expect(toy_state()).eq(final)
    expect(PL.s.events[base + 1].op).eq('manifest')
  end)

  it('a rejoin without a snapshot (the run restarted from its seed) plays back', function()
    local old = first_life()
    local new, final = second_life(#old, { no_snapshot = true })
    local s = play_back({ join(old, #old, new) })
    expect(s.error).eq(nil)
    expect(s.state).eq('done')
    expect(toy_state()).eq(final)
  end)

  it('a restore without a launch first (rejoin_restore before the launch) plays back', function()
    local old = first_life()
    local new, final = second_life(#old, { no_launch = true })
    expect(new[2].d.restore).eq(true)
    local s = play_back({ join(old, #old, new) })
    expect(s.error).eq(nil)
    expect(s.state).eq('done')
    expect(toy_state()).eq(final)
  end)

  it('rejoin_restore reads the snapshot on arrival: the launch saving over the files does not matter', function()
    local old = first_life()
    local kept_run = files['/rmh/mp/run.jkr']
    boot_match()
    MP.session.mount('match', match_info({ logNext = #old }))
    MP.session.launch()
    G.screenwipe = {} -- the launch is still wiping: the load waits
    MP.net.receive('rejoin_restore', { runId = 'runRJ', snapshotPath = '/rmh/mp/run.jkr', statePath = '/rmh/mp/state.json' })
    expect(toy_save_run()).eq(true) -- the fresh run's blind-select save overwrites the files
    expect(files['/rmh/mp/run.jkr'] ~= kept_run).truthy()
    G.screenwipe = nil
    frames(3)
    expect(G.STATE).eq(G.STATES.SHOP)
    local restore
    for _, ev in ipairs(logged()) do if ev.op == 'manifest' and ev.d.restore then restore = ev end end
    expect(restore ~= nil).truthy()
    MP.session.unmount('test')
  end)

  it('seeking back across the rejoin restarts and reaches the same state', function()
    local old = first_life()
    local new, final = second_life(#old)
    local s = play_back({ join(old, #old, new) })
    expect(s.state).eq('done')
    PL.s.state = 'running'
    PL.seek(0)
    frames(800, function() return PL.s.state ~= 'running' end)
    expect(PL.s.state).eq('done')
    expect(toy_state()).eq(final)
  end)

  it('stops honestly on a truncated snapshot and on a WS13 marker without a version', function()
    local old = first_life()
    local new = second_life(#old)
    local log = join(old, #old, new)
    local cut = {}
    for _, ev in ipairs(log) do
      if ev.op == 'manifest' and ev.d.snap then break end
      cut[#cut + 1] = ev
    end
    local s = play_back({ cut })
    expect(s.state).eq('diverged')
    expect(s.error.msg:find('incomplete', 1, true) ~= nil).truthy()
    PL.close(true)
    H.teardown()
    local legacy = join(old, #old, { { i = #old, t = 1, op = 'manifest', d = { rejoin = true } } })
    s = play_back({ legacy })
    expect(s.state).eq('diverged')
    expect(s.inaccurate).eq(true)
    expect(s.error.msg:find('reloaded', 1, true) ~= nil).truthy()
  end)

  it('snapshot blobs: parts never split a UTF-8 character; the love.data path round-trips', function()
    boot()
    local s = string.rep('ab\195\169', 50) -- "abé" x 50
    for _, size in ipairs({ 4, 5, 7, 64 }) do -- ≥ 4: the longest UTF-8 sequence
      local parts = REP.split_parts(s, size)
      expect(table.concat(parts)).eq(s)
      for _, p in ipairs(parts) do
        local b = p:byte(1)
        expect(b < 128 or b >= 192).truthy()
      end
    end
    local blob = REP.pack_snapshot('return {}', '{"a":1}')
    local run, state = REP.unpack_snapshot(blob)
    expect(run).eq('return {}')
    expect(state).eq('{"a":1}')
    expect(REP.unpack_snapshot('5:ab')).eq(nil)
    -- A stand-in love.data (reversible, not real deflate): the encode path is taken when it exists.
    local had_love = rawget(_G, 'love')
    _G.love = had_love or {}
    local had = love.data
    love.data = {
      compress = function(_, _, x) return 'Z' .. x end,
      decompress = function(_, _, x) return x:sub(2) end,
      encode = function(_, _, x) return (x:gsub('.', function(c) return string.format('%02x', c:byte()) end)) end,
      decode = function(_, _, x) return (x:gsub('%x%x', function(h) return string.char(tonumber(h, 16)) end)) end,
    }
    local data, z = REP.encode_blob(blob)
    expect(z).eq('deflate')
    expect(REP.decode_blob(data, z)).eq(blob)
    love.data = had
    _G.love = had_love
    expect(REP.decode_blob(data, 'deflate')).eq(nil) -- cannot decode here: nil, never an error
    expect(REP.decode_blob('x', 'zstd')).eq(nil)
  end)
end)
