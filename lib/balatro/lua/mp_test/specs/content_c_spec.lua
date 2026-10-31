-- L2 in-engine spec for WS9 Content C (PLAN §4 WS9): traps, boosters, decks, Cocktail and the
-- challenges inside the real game.
--
-- Needs the MP pack extracted (`?mp=1` on the engine harness page); without it the file reports one
-- skipped test. Each test mounts a local practice session (no network) and drives the seeded run
-- with the autopilot. Traps are planted through the real `trap_plant` receiver as if a nemesis 'u2'
-- had sent them (the loopback peer); the owner side is exercised by feeding the `trap_fired` the
-- victim side produced back into the receiver as player 'u2'.

local has_mp, MP = pcall(require, 'rmh_mp')

local SEED = 'RMHWS9C1'

local function resolved(layers, extra)
  local r = {
    key = 'ruleset_mp_test', layers = layers or { 'standard', 'traps' }, multiplayerContent = true, banned = {},
    bannedSilent = {}, included = {}, reworked = {}, spectralBannedEnhancements = {}, stickers = {},
    gameModifiers = {}, startingParams = {}, setupHooks = {},
    flags = { theOrder = true, enemyLocationDisabled = false, comeback = 'default' },
    timer = { enabled = false, base = 0, increment = 0, forgiveness = 0, pvpHandIncrement = 0, mode = 'default',
      pressurePlusHand = 0, countdown = 3, mult = 1 },
  }
  for k, v in pairs(extra or {}) do r[k] = v end
  return r
end

local function practice(opts)
  opts = opts or {}
  AP.run('prepare')
  if MP.state.session then MP.session.unmount('test') end
  MP.session.mount('practice', {
    resolved = resolved(opts.layers), deck = opts.deck or 'b_red', stake = 1, seed = opts.seed or SEED,
    challenge = opts.challenge, me = 'u1',
    shape = { nemesisPairing = true, manhunt = false, teamBased = false, practice = true },
    options = { pvpStartRound = 2, theOrder = true, multiplayerJokers = true, timer = false },
  })
  MP.session.launch(opts.seed or SEED)
  if opts.wait ~= false then AP.run('wait_state', { 'BLIND_SELECT' }) end
end

local function leave()
  if MP and MP.state and MP.state.session then MP.session.unmount('test') end
end

local function find(area, key)
  for _, c in ipairs((area and area.cards) or {}) do if c.config.center.key == key then return c end end
end

local function lua_errors()
  local out = {}
  for _, l in ipairs(MP.log_ring) do if l.level == 'error' then out[#out + 1] = l.msg end end
  return out
end

--- Plant `key` on me as nemesis u2 would.
local function plant(key, uid)
  local T = MP.traps
  expect(T.receive_plant('u2', { card = { key = key }, owner = 'u2', uid = uid or ('l2-' .. key) })).eq(true)
  wait_until(function() return T.find_hidden(key) ~= nil end, 5, 'planted ' .. key)
  return T.find_hidden(key)
end

local function fired(key)
  for _, m in ipairs(MP.net.outbox or {}) do
    if m.t == 'peer' and m.d.k == 'trap_fired' and m.d.d.key == key then return m.d.d end
  end
  return MP.traps.last_fired and MP.traps.last_fired[key]
end

if not has_mp then
  describe('content C (in-engine)', function()
    xit('needs the MP pack (?mp=1): ' .. tostring(MP):sub(1, 120), function() end)
  end)
  return
end

-- Record what victims send, independent of the transport's flush timing.
MP.traps.last_fired = {}
local orig_send = MP.peer.send
MP.peer.send = function(kind, d, to)
  if kind == 'trap_fired' and type(d) == 'table' and d.key then MP.traps.last_fired[d.key] = d end
  return orig_send(kind, d, to)
end

describe('content C: registration and art', function()
  after_each(leave)

  it('every trap, pack, deck, tag and challenge is mounted; traps draw from the Trap sheet and have text', function()
    practice()
    for i, key in ipairs(MP.traps.KEYS) do
      local p = G.P_CENTERS[key]
      expect(p ~= nil and p.set).eq('Trap')
      expect(p.pos.x).eq(i - 1)
    end
    for _, key in ipairs({ 'p_mp_trap_normal', 'p_mp_trap_jumbo', 'p_mp_standard_giga', 'b_mp_violet', 'b_mp_indigo',
      'b_mp_orange', 'b_mp_oracle', 'b_mp_gradient', 'b_mp_heidelberg', 'b_mp_echodeck', 'b_mp_cocktail' }) do
      expect(G.P_CENTERS[key] ~= nil and key).eq(key)
    end
    expect(G.P_TAGS.tag_mp_ward ~= nil).truthy()
    local n = 0
    for _, c in ipairs(G.CHALLENGES) do if c.rmh_mp then n = n + 1 end end
    expect(n).eq(22)
    AP.run('give', { 'c_mp_trap_alarm' })
    local card = find(G.consumeables, 'c_mp_trap_alarm')
    expect(card.children.center.atlas == G.ASSET_ATLAS.mp_Trap).truthy()
    local ui = card:generate_UIBox_ability_table()
    expect(#ui.main > 0).truthy()
    expect(card:can_use_consumeable()).eq(false)
    expect(lua_errors()).eq({})
  end)
end)

describe('content C: traps in a real run', function()
  after_each(leave)

  it('a planted trap is face-down, slotless and unsellable', function()
    practice()
    local limit = G.consumeables.config.card_limit
    local c = plant('c_mp_trap_alarm')
    expect(c.facing).eq('back')
    expect(c.sprite_facing).eq('back')
    expect(G.consumeables.config.card_limit).eq(limit + 1)
    expect(c:can_sell_card()).eq(false)
    expect(c:can_use_consumeable()).eq(false)
    expect(c:generate_UIBox_ability_table() ~= nil).truthy()
  end)

  it('Alarm fires on a shop reroll; the owner gets 2 free rerolls', function()
    practice()
    plant('c_mp_trap_alarm')
    AP.run('select_blind')
    AP.run('win_blind')
    AP.run('cash_out')
    G.GAME.dollars = 50
    AP.run('reroll')
    local f = fired('c_mp_trap_alarm')
    expect(f ~= nil and f.payload.rerolls).eq(2)
    wait_until(function() return find(G.consumeables, 'c_mp_trap_alarm') == nil end, 5, 'trap revealed and gone')
    -- the owner side, in a shop
    local free = G.GAME.current_round.free_rerolls
    MP.state.session.me = 'u2'
    expect(MP.traps.receive_fired('u1', f)).eq(true)
    wait_until(function() return G.GAME.current_round.free_rerolls == free + 2 end, 5, 'free rerolls')
    expect(G.GAME.current_round.reroll_cost).eq(0)
    MP.state.session.me = 'u1'
  end)

  it('Fire Trap lowers every scored card of a Pair by one rank', function()
    practice()
    plant('c_mp_trap_fire_trap')
    AP.run('select_blind')
    local a, b = G.hand.cards[1], G.hand.cards[2]
    b:set_base(G.P_CARDS[b.base.suit:sub(1, 1) .. '_' .. (a.base.value == '10' and 'T' or a.base.value:sub(1, 1))])
    local before = a.base.id
    AP.run('play', { { 1, 2 } })
    expect(fired('c_mp_trap_fire_trap') ~= nil).truthy()
    expect(a.base.id).eq(math.max(2, before - 1))
  end)

  it('Arcane Lock bounces the trap I take from a Trap pack', function()
    practice()
    plant('c_mp_trap_arcane_lock', 'lock')
    MP.content.boosters.open_free('p_mp_trap_normal')
    wait_until(function() return G.pack_cards and #G.pack_cards.cards >= 3 and AP.idle() end, 30, 'trap pack open')
    expect(G.pack_cards.cards[1].config.center.set).eq('Trap')
    local key = G.pack_cards.cards[1].config.center.key
    AP.run('pick', { 1 })
    wait_until(function() return AP.idle() end, 30, 'pack closed')
    local bounced
    for _, c in ipairs(MP.traps.hidden()) do
      if c.config.center.key == key and c.ability.mp_trap_owner == 'u2' and c.ability.mp_trap_uid ~= 'l2-' .. key then bounced = c end
    end
    if key == 'c_mp_trap_arcane_lock' then bounced = bounced or MP.traps.hidden(key)[1] end
    expect(bounced ~= nil).truthy()
    expect(fired('c_mp_trap_arcane_lock') ~= nil).truthy()
  end)

  it('Programmed Illusion adds a fake card without moving any RNG stream', function()
    local function open_pack(with_trap)
      practice({ seed = 'RMHWS9IL' })
      if with_trap then plant('c_mp_trap_programmed_illusion') end
      MP.content.boosters.open_free('p_arcana_normal_1')
      wait_until(function() return G.pack_cards and #G.pack_cards.cards >= 3 and AP.idle() end, 30, 'pack open')
      wait_frames(30)
      local snap = MP.copy(G.GAME.pseudorandom, true)
      local n = #G.pack_cards.cards
      local fake_card = G.pack_cards.cards[n]
      local is_fake = fake_card.ability.mp_illusion_fake == true
      G.FUNCS.skip_booster({ config = {} })
      wait_until(function() return G.STATE == G.STATES.BLIND_SELECT and AP.idle() end, 30, 'pack skipped')
      leave()
      return snap, n, is_fake
    end
    local plain, n0 = open_pack(false)
    local trapped, n1, fake_last = open_pack(true)
    expect(n1).eq(n0 + 1)
    expect(fake_last).eq(true)
    expect(trapped).eq(plain)
  end)

  it('Forbiddance: the refill after a discard is face-down', function()
    practice()
    plant('c_mp_trap_forbiddance')
    AP.run('select_blind')
    AP.run('discard', { { 1, 2 } })
    wait_until(function() return AP.idle() and G.STATE == G.STATES.SELECTING_HAND end, 30, 'refill')
    local down = 0
    for _, c in ipairs(G.hand.cards) do if c.facing == 'back' then down = down + 1 end end
    expect(down).eq(2)
    expect(fired('c_mp_trap_forbiddance') ~= nil).truthy()
  end)
end)

describe('content C: boosters and decks', function()
  after_each(leave)

  it('Orange Deck opens a free, unskippable Giga Standard Pack (10 choose 4)', function()
    practice({ deck = 'b_mp_orange', wait = false })
    wait_until(function() return G.STATE == G.STATES.STANDARD_PACK and G.pack_cards and #G.pack_cards.cards >= 10 end,
      60, 'giga pack')
    expect(G.GAME.pack_choices).eq(4)
    expect(MP.content.boosters.is_unskippable()).eq(true)
    local e = { config = {} }
    G.FUNCS.can_skip_booster(e)
    expect(e.config.button).eq(nil)
    expect(find(G.consumeables, 'c_hanged_man') ~= nil).truthy()
  end)

  it('Oracle Deck caps money at $50 + the interest cap', function()
    practice({ deck = 'b_mp_oracle' })
    expect(find(G.consumeables, 'c_medium') ~= nil).truthy()
    expect(G.GAME.used_vouchers.v_clearance_sale).eq(true)
    ease_dollars(500, true)
    wait_frames(5)
    expect(G.GAME.dollars).eq(50 + G.GAME.interest_cap)
  end)

  it('Indigo Deck: +1 pick; Skip is disabled while something is usable', function()
    practice({ deck = 'b_mp_indigo' })
    expect(G.GAME.banned_keys.j_red_card).eq(true)
    MP.content.boosters.open_free('p_celestial_normal_1')
    wait_until(function() return G.pack_cards and #G.pack_cards.cards >= 3 and AP.idle() end, 30, 'pack open')
    expect(G.GAME.pack_choices).eq(2)
    local e = { config = {} }
    G.FUNCS.can_skip_booster(e)
    expect(e.config.button).eq(nil)
  end)

  it('Cocktail picks the same 3 decks for the same seed', function()
    practice({ deck = 'b_mp_cocktail' })
    local a = MP.copy(G.GAME.modifiers.mp_cocktail)
    leave()
    practice({ deck = 'b_mp_cocktail' })
    local b = MP.copy(G.GAME.modifiers.mp_cocktail)
    expect(#a).eq(3)
    expect(b).eq(a)
    for _, k in ipairs(a) do expect(k ~= 'b_mp_cocktail' and k ~= 'b_challenge').truthy() end
    report('cocktail_picks', a)
  end)
end)

describe('content C: every challenge boots and applies its rules', function()
  after_each(leave)

  local CHECKS = {
    c_mp_high_hand = function() return G.GAME.round_resets.hands == 1 and G.hand.config.card_limit == 26 end,
    c_mp_misprint_deck = function()
      for _, c in ipairs(G.playing_cards) do if c.base.id ~= 10 or c.base.suit ~= 'Spades' then return false end end
      return #G.playing_cards == 52
    end,
    c_mp_scratch = function() return #G.playing_cards == 1 and G.GAME.used_vouchers.v_magic_trick == true end,
    c_mp_vantablack = function() return G.jokers.config.card_limit == 8 and G.GAME.round_resets.hands == 1 end,
    c_mp_legendaries = function() return #G.jokers.cards == 5 end,
    c_mp_salvaged_sibyl = function() return G.GAME.planet_rate == 0 and G.GAME.modifiers.mp_only_medium == true end,
    c_mp_planet_tycoon = function() return G.GAME.planet_rate == 360 end,
    c_mp_bacon = function() return G.GAME.modifiers.booster_choice_mod == 1 and G.GAME.modifiers.mp_indigo == true end,
    c_mp_eeeee = function() return MP.layer_active('eeeee') end,
    c_mp_balancing_act = function() return G.GAME.starting_params.ante_scaling == 0.25 end,
    c_mp_chore_list = function()
      local n = 0
      for _, j in ipairs(G.jokers.cards) do if j.ability.rental and j.ability.eternal then n = n + 1 end end
      return n == 2
    end,
    c_mp_in_the_red = function() return G.GAME.modifiers.no_blind_reward.Small and G.GAME.banned_keys.tag_investment end,
  }

  for _, key in ipairs(MP.content.challenges.KEYS) do
    it(key, function()
      local before = #lua_errors()
      practice({ challenge = key })
      wait_until(function() return AP.idle() end, 30, 'challenge setup')
      wait_frames(10)
      expect(G.GAME.challenge).eq(key)
      local check = CHECKS[key]
      if check then expect(check() and key).eq(key) end
      expect(#lua_errors()).eq(before)
    end)
  end
end)
