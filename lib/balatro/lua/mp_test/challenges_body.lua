-- L2 in-engine: every Multiplayer challenge (rmh_mp/content/challenges.lua) STARTED and PLAYED.
-- Loaded by specs/ui_run_challenges_a_spec.lua (CHALLENGE_PART 'a': the first half of the MP
-- challenges) and specs/ui_run_challenges_b_spec.lua ('b': the second half, the win/loss paths and
-- the vanilla challenges), two files so each stays a few minutes inside the CI engine job. They
-- are ui_run_* because part b loads the in-run UI (end screens): in the engine project's one boot
-- they must sort after engine_smoke_spec and perf_spec, which measure the game without it.
--
-- For each MP challenge, in a local practice session (no network):
--   * the run carries the definition: jokers (order, eternal/rental/pinned, edition), consumables,
--     vouchers, the deck, every banned card/tag/blind, rules.modifiers and rules.custom
--     (mp_test/challenge_check.lua compares the definition with a digest of the run), and the
--     challenge's back art where it has one;
--   * its special rule is exercised at least once (SPECIAL below: what the mod's challenge does,
--     checked through the real game);
--   * the rest of the first ante is played: Small, Big and Boss blinds selected, hands played (the
--     round won with set_chips/win_blind), cash out, the shop (no banned card offered), next blind,
--     ending at ante 2's blind select.
-- Then (part b) the win/loss paths of a challenge run: a lost blind in practice is survived
-- (practice never fails), a match's lost blind is reported and its loss ends on the loss screen,
-- the referee's win on the win screen, and the practice ante-8 win shows the vanilla win screen
-- without marking anything in the single-player profile's challenge progress (hooks/saves.lua).
-- And vanilla challenges still start (and apply) with the MP pack loaded, outside any session
-- and in a practice session.
--
-- Needs the MP pack (`?mp=1`); without it the file reports one skipped test.

local PART = CHALLENGE_PART or 'a'

local has_mp, MP = pcall(require, 'rmh_mp')
local CC = require('rmh_mp_test.challenge_check')
local sched = require('rmh_mp_test.sched')

local SEED = 'RMHCHAL1'
local hs = 3000

if not has_mp then
  describe('challenges (in-engine)', function()
    xit('needs the MP pack (?mp=1): ' .. tostring(MP):sub(1, 120), function() end)
  end)
  return
end

local function resolved(mp_content)
  return {
    key = 'ruleset_mp_test', layers = { 'standard' }, multiplayerContent = mp_content ~= false, banned = {}, bannedSilent = {},
    included = {}, reworked = {}, spectralBannedEnhancements = {}, stickers = {}, gameModifiers = {},
    startingParams = {}, setupHooks = {},
    flags = { theOrder = true, enemyLocationDisabled = false, comeback = 'default' },
    timer = { enabled = false, base = 0, increment = 0, forgiveness = 0, pvpHandIncrement = 0, mode = 'default',
      pressurePlusHand = 0, countdown = 3, mult = 1 },
  }
end

local function lua_errors()
  local out = {}
  for _, l in ipairs(MP.log_ring) do if l.level == 'error' then out[#out + 1] = l.msg end end
  return out
end

local function leave()
  if G.OVERLAY_MENU and G.FUNCS.exit_overlay_menu then G.FUNCS.exit_overlay_menu() end
  if MP.state.session then MP.session.unmount('test') end
end

local function settled()
  wait_until(function() return AP.idle() end, 60, 'run idle')
  wait_frames(5)
  wait_until(function() return AP.idle() end, 60, 'run idle')
end

local function practice(challenge, seed)
  AP.run('prepare')
  leave()
  MP.session.mount('practice', {
    resolved = resolved(), deck = 'b_red', stake = 1, seed = seed or SEED, challenge = challenge, me = 'u1',
    shape = { nemesisPairing = true, manhunt = false, teamBased = false, practice = true },
    options = { pvpStartRound = 2, theOrder = true, multiplayerJokers = true, timer = false },
  })
  MP.session.launch(seed or SEED)
  AP.run('wait_state', { 'BLIND_SELECT' })
  settled()
end

local function outcome(o)
  hs = hs + 1
  MP.net.receive('outcome', { hs = hs, o = o })
end

local function match(challenge, mp_content)
  require('rmh_mp.ui.menu')
  require('rmh_mp.ui.hud')
  AP.run('prepare')
  leave()
  MP.session.mount('match', {
    runId = 'challenge-run', seed = SEED, stake = 1, deck = 'b_red', queueMode = 'pvp_nemesis', challenge = challenge,
    shape = { nemesisPairing = true, manhunt = false, teamBased = false }, ruleset = 'ruleset_mp_test',
    resolved = resolved(mp_content), hostId = 'u_me', me = 'u_me', contentHash = 'x',
    options = { pvpStartRound = 2, theOrder = true, multiplayerJokers = true, timer = false, startingLives = 4,
      pvpCountdownSeconds = 3, deathOnRoundLoss = true },
    roster = { { id = 'u_me', name = 'Alice', blindCol = 1, avatarJoker = 'j_joker' },
      { id = 'u_them', name = 'Bob', blindCol = 7, avatarJoker = 'j_joker' } },
  })
  MP.session.launch(SEED)
  AP.run('wait_state', { 'BLIND_SELECT' })
  outcome({ t = 'player_lives', player_id = '*all*', lives = 4 })
  outcome({ t = 'nemesis_pairing', ante = 1, pairing = { u_me = 'u_them', u_them = 'u_me' } })
  MP.state.lives.u_them = 4
  settled()
end

local function challenge_table(key)
  for _, c in ipairs(G.CHALLENGES) do if c.id == key then return c end end
end

local function find(area, key)
  for _, c in ipairs((area and area.cards) or {}) do if c.config.center.key == key then return c end end
end

local function count_set(area, set)
  local n = 0
  for _, c in ipairs((area and area.cards) or {}) do if c.ability.set == set then n = n + 1 end end
  return n
end

local function give(key)
  local c, why = MP.practice.give(key)
  if not c then error('not given ' .. key .. ': ' .. tostring(why)) end
  settled()
  return c
end

--- The challenge's definition holds in the running game.
local function check_definition(key)
  local ch = challenge_table(key)
  expect(ch ~= nil and key).eq(key)
  expect(CC.compare(ch, CC.digest())).eq({})
end

--- Every playing card shows `art` (the challenge's back art) face down.
local function check_back_art(art)
  local atlas = G.ASSET_ATLAS[art.atlas]
  expect(atlas ~= nil).truthy()
  local c = G.playing_cards[1]
  expect(c.children.back.atlas == atlas).truthy()
  expect(c.children.back.sprite_pos.x).eq(art.pos.x)
  expect(c.children.back.sprite_pos.y).eq(art.pos.y)
end

-- ── playing ─────────────────────────────────────────────────────────────────

--- Indices to play: the best hand while that is cheap to find, else the first five cards.
local function hand_to_play()
  if #G.hand.cards <= 8 then return 'best' end
  return { 1, 2, 3, 4, 5 }
end

--- Play hands in the current blind until it is won (the last one with set_chips).
local function win_round(opts)
  opts = opts or {}
  if G.STATE == G.STATES.BLIND_SELECT then AP.run('select_blind') end
  settled()
  if opts.before_play then opts.before_play() end
  if G.STATE == G.STATES.SELECTING_HAND and G.GAME.current_round.hands_left > 1 and #G.hand.cards > 0 then
    AP.run('play', { hand_to_play() })
  end
  if G.STATE == G.STATES.SELECTING_HAND then
    if #G.hand.cards == 0 then error('no cards left to play') end
    AP.run('win_blind')
  end
  expect(AP.state_name()).eq('ROUND_EVAL')
end

local function check_shop()
  for _, area in ipairs({ G.shop_jokers, G.shop_vouchers, G.shop_booster }) do
    for _, c in ipairs(area.cards) do
      local k = c.config.center.key
      if G.GAME.banned_keys[k] then error('the shop offers banned ' .. k) end
    end
  end
end

--- One blind: won, cashed out, the shop visited (and checked), left for the next blind.
local function play_blind(opts)
  opts = opts or {}
  win_round(opts)
  if opts.after_round then opts.after_round() end
  AP.run('cash_out')
  settled()
  check_shop()
  if opts.in_shop then opts.in_shop() end
  AP.run('leave_shop')
  settled()
end

--- Play blinds until the ante changes (the rest of the current ante, from whichever blind is on
--- deck); `per` = { Small = opts, Big = opts, Boss = opts } (any may be nil).
local function play_ante(per)
  per = per or {}
  local ante = G.GAME.round_resets.ante
  local n = 0
  while G.GAME.round_resets.ante == ante do
    n = n + 1
    if n > 3 then error('ante ' .. ante .. ' did not end after three blinds') end
    local slot = G.GAME.blind_on_deck
    play_blind(per[slot])
  end
  expect(G.GAME.round_resets.ante).eq(ante + 1)
  expect(AP.state_name()).eq('BLIND_SELECT')
end

--- After a round won by hand: cash out and leave the shop.
local function finish_blind()
  AP.run('cash_out'); settled()
  check_shop()
  AP.run('leave_shop'); settled()
end

-- ── the special rules ───────────────────────────────────────────────────────

local function rental_watch()
  local w = { n = 0 }
  local orig = Card.calculate_rental
  Card.calculate_rental = function(self, ...)
    if self.ability.rental then w.n = w.n + 1 end
    return orig(self, ...)
  end
  w.stop = function() Card.calculate_rental = orig end
  return w
end

--- Rentals are charged at the end of the round (the rental sticker vanilla never puts on a
--- challenge joker): win the blind on deck with the watch on.
local function rental_round(n_rentals)
  local w = rental_watch()
  local ok, err = sched.protected(win_round)
  w.stop()
  if not ok then error(err, 0) end
  expect(w.n).eq(n_rentals)
end

local function shop_sets(rerolls)
  local sets = {}
  local function take()
    for _, c in ipairs(G.shop_jokers.cards) do sets[#sets + 1] = c.ability.set end
  end
  take()
  G.GAME.dollars = 1000
  for _ = 1, rerolls do AP.run('reroll'); take() end
  return sets
end

local function frac(list, value)
  local n = 0
  for _, v in ipairs(list) do if v == value then n = n + 1 end end
  return n / math.max(1, #list)
end

local SPECIAL = {}

SPECIAL.c_mp_all_must_go = function()
  -- Campfire (eternal) gains X0.25 per card sold; neither challenge joker can be sold.
  local fire = find(G.jokers, 'j_campfire')
  expect(fire:can_sell_card()).eq(false)
  expect(find(G.jokers, 'j_mp_taxes'):can_sell_card()).eq(false)
  local x = fire.ability.x_mult
  local j = give('j_joker')
  G.FUNCS.sell_card({ config = { ref_table = j } })
  settled()
  expect(fire.ability.x_mult).eq(x + fire.ability.extra)
  play_ante()
end

SPECIAL.c_mp_bacon = function()
  check_back_art({ atlas = 'mp_decks', pos = { x = 1, y = 0 } })
  -- Indigo rule: +1 pick in every pack, and no skipping while something in it can be used.
  MP.content.boosters.open_free('p_buffoon_normal_1')
  wait_until(function() return G.pack_cards and #G.pack_cards.cards >= 2 and AP.idle() end, 30, 'pack open')
  expect(G.GAME.pack_choices).eq(2)
  local e = { config = {} }
  G.FUNCS.can_skip_booster(e)
  expect(e.config.button).eq(nil)
  AP.run('pick', { 1 })
  AP.run('pick', { 1 })
  wait_until(function() return G.STATE == G.STATES.BLIND_SELECT and AP.idle() end, 60, 'pack done')
  play_ante()
end

SPECIAL.c_mp_balancing_act = function()
  -- Score instability (chips and mult pulled toward each other on the final scoring step) …
  local c, m = G.GAME.selected_back:trigger_effect({ context = 'final_scoring_step', chips = 100, mult = 4 })
  expect({ c, m }).eq({ 103, 1 })
  c, m = G.GAME.selected_back:trigger_effect({ context = 'final_scoring_step', chips = 4, mult = 100 })
  expect({ c, m }).eq({ 0, 104 })
  -- … and blinds at a quarter of their size.
  play_ante({ Small = { before_play = function()
    expect(G.GAME.blind.chips).eq(get_blind_amount(1) * G.GAME.blind.mult * 0.25)
  end } })
end

SPECIAL.c_mp_chore_list = function()
  -- Both To Do Lists are rentals: $3 each at the end of every round.
  rental_round(2)
  finish_blind()
  play_ante()
end

SPECIAL.c_mp_divination = function()
  -- Vagabond: a hand played with $4 or less makes a Tarot.
  AP.run('select_blind')
  G.GAME.dollars = 0
  AP.run('play', { hand_to_play() })
  settled()
  expect(count_set(G.consumeables, 'Tarot')).eq(1)
  win_round()
  finish_blind()
  play_ante()
end

SPECIAL.c_mp_eeeee = function()
  -- About 40 % of the RNG keys return one fixed value for the whole ante.
  local fixed = 0
  for i = 1, 60 do
    local key = 'mp_test_eeeee_' .. i
    if pseudoseed(key) == pseudoseed(key) then fixed = fixed + 1 end
  end
  expect(fixed > 10 and fixed < 40).truthy()
  play_ante()
end

SPECIAL.c_mp_high_hand = function()
  -- One hand, no discards, 26 cards dealt.
  AP.run('select_blind')
  settled()
  expect(#G.hand.cards).eq(26)
  expect(G.GAME.current_round.hands_left).eq(1)
  expect(G.GAME.current_round.discards_left).eq(0)
  play_ante()
end

SPECIAL.c_mp_in_the_red = function()
  -- No money for the Small and Big blinds; Credit Card lets the money go to -$20; rental.
  expect(G.GAME.bankrupt_at).eq(-20)
  local function no_reward() expect(G.GAME.blind.dollars).eq(0) end
  local w = rental_watch()
  play_ante({ Small = { before_play = no_reward }, Big = { before_play = no_reward },
    Boss = { before_play = function() expect(G.GAME.blind.dollars > 0).truthy() end } })
  w.stop()
  expect(w.n).eq(3)
end

SPECIAL.c_mp_legendaries = function()
  -- Perkeo copies a consumable (Negative) when the shop is left.
  play_ante({ Small = { in_shop = function()
    give('c_pluto')
    expect(#G.consumeables.cards).eq(1)
  end }, Big = { before_play = function()
    expect(#G.consumeables.cards).eq(2)
    local neg = 0
    for _, c in ipairs(G.consumeables.cards) do if c.edition and c.edition.negative then neg = neg + 1 end end
    expect(neg).eq(1)
  end } })
end

SPECIAL.c_mp_lets_go_gambling = function()
  -- Let's Go Gambling pays $10 (and X4) when it hits; Oops! doubles the odds. Force the hit.
  AP.run('select_blind')
  G.GAME.probabilities.normal = 100
  local before = G.GAME.dollars
  AP.run('play', { hand_to_play() })
  settled()
  expect(G.GAME.dollars - before >= 10).truthy()
  G.GAME.probabilities.normal = 2
  win_round()
  finish_blind()
  play_ante()
end

SPECIAL.c_mp_misprint_deck = function()
  -- Every card is the 10 of Spades: five of them are a Flush Five.
  AP.run('select_blind')
  AP.run('play', { { 1, 2, 3, 4, 5 } })
  expect(G.GAME.last_hand_played).eq('Flush Five')
  win_round()
  finish_blind()
  play_ante()
end

-- The consumables Oops! All Jokers leaves in the pools: the ones that make jokers.
local JOKER_MAKERS = { c_judgement = true, c_wraith = true, c_soul = true }

SPECIAL.c_mp_oops_all_jokers = function()
  -- Showman: a joker already held stays in the pool.
  give('j_joker')
  local pool = get_current_pool('Joker', 0)
  local seen = false
  for _, k in ipairs(pool) do if k == 'j_joker' then seen = true end end
  expect(seen).eq(true)
  play_ante({ Small = { in_shop = function()
    for _, c in ipairs(G.shop_jokers.cards) do
      local k = c.config.center.key
      if c.ability.set == 'Tarot' or c.ability.set == 'Spectral' then expect(JOKER_MAKERS[k] and k).eq(k) end
    end
    -- and a Tarot pool holds nothing else
    for _, k in ipairs(get_current_pool('Tarot')) do
      if k ~= 'UNAVAILABLE' then expect(JOKER_MAKERS[k] and k).eq(k) end
    end
  end } })
end

SPECIAL.c_mp_planet_tycoon = function()
  -- The shop is almost all Planets.
  play_ante({ Small = { in_shop = function()
    local sets = shop_sets(3)
    expect(frac(sets, 'Planet') >= 0.6).truthy()
  end } })
end

SPECIAL.c_mp_polymorph_spam = function()
  -- Every blind, each joker turns into the N-th next center of its set (N = its slot).
  local banned = 0
  for _, v in ipairs(G.P_CENTER_POOLS.Joker) do
    if v.perishable_compat == false then
      expect(G.GAME.banned_keys[v.key] and v.key).eq(v.key)
      banned = banned + 1
    end
  end
  expect(banned > 0).truthy()
  local j = give('j_joker')
  local want = MP.misc.polymorph_target(j, 1).key
  expect(want ~= 'j_joker').truthy()
  AP.run('select_blind')
  settled()
  expect(j.config.center.key).eq(want)
  win_round()
  finish_blind()
  play_ante()
end

SPECIAL.c_mp_psychosis = function()
  -- Madness: on a non-boss blind, X0.5 and a random other joker destroyed (it is the only one
  -- that is not eternal).
  local m = find(G.jokers, 'j_madness')
  local x = m.ability.x_mult
  give('j_joker')
  AP.run('select_blind')
  settled()
  expect(m.ability.x_mult).eq(x + m.ability.extra)
  expect(find(G.jokers, 'j_joker')).eq(nil)
  win_round()
  finish_blind()
  play_ante()
end

SPECIAL.c_mp_salvaged_sibyl = function()
  check_back_art({ atlas = 'mp_decks', pos = { x = 3, y = 0 } })
  -- Every Spectral is a Medium, every seal is Purple, no Planets in the shop.
  local c = create_card('Spectral', G.consumeables, nil, nil, nil, nil, nil, 'mp_test')
  expect(c.config.center.key).eq('c_medium')
  c:remove()
  local pc = G.playing_cards[1]
  pc:set_seal('Red', true, true)
  expect(pc.seal).eq('Purple')
  pc:set_seal(nil, true, true)
  play_ante({ Small = { in_shop = function()
    expect(frac(shop_sets(2), 'Planet')).eq(0)
  end } })
end

SPECIAL.c_mp_scratch = function()
  -- One Stone 7 of Clubs, Half Joker, Magic Trick (playing cards in the shop).
  expect(G.GAME.playing_card_rate > 0).truthy()
  AP.run('select_blind')
  expect(#G.hand.cards).eq(1)
  play_ante()
end

SPECIAL.c_mp_shared_pockets = function()
  -- Hand, jokers and consumables share 15 slots: each joker held takes a card from the hand.
  local base = G.hand.config.card_limit
  expect(G.jokers.config.card_limit).eq(15)
  expect(G.consumeables.config.card_limit).eq(15)
  give('j_joker')
  wait_frames(3)
  expect(G.hand.config.card_limit).eq(base - 1)
  give('c_pluto')
  wait_frames(3)
  expect(G.hand.config.card_limit).eq(base - 2)
  play_ante()
end

SPECIAL.c_mp_skip_off = function()
  -- Skip the Small blind: Throwback grows and Skip-Off gives +1 hand and +1 discard on the Big.
  local tb = find(G.jokers, 'j_throwback')
  AP.run('skip_blind')
  settled()
  expect(G.GAME.skips).eq(1)
  local hands, discards = G.GAME.round_resets.hands, G.GAME.round_resets.discards
  AP.run('select_blind')
  settled()
  expect(G.GAME.current_round.hands_left).eq(hands + 1)
  expect(G.GAME.current_round.discards_left).eq(discards + 1)
  expect(tb.ability.x_mult).eq(1 + tb.ability.extra)
  win_round()
  finish_blind()
  play_blind() -- Boss
  expect(G.GAME.round_resets.ante).eq(2)
end

SPECIAL.c_mp_speed = function()
  -- SPEEDRUN makes a Spectral on the referee's speedrun signal; Conjoined Joker counts the
  -- nemesis's hands (outside a PvP blind it stays quiet).
  local sr = find(G.jokers, 'j_mp_speedrun')
  sr:calculate_joker({ mp_speedrun = true })
  settled()
  expect(count_set(G.consumeables, 'Spectral')).eq(1)
  local cj = find(G.jokers, 'j_mp_conjoined_joker')
  MP.state.enemy.hands = 4
  expect(MP.content.conjoined_x(cj)).eq(3)
  play_ante()
end

SPECIAL.c_mp_twin_towers = function()
  -- Obelisk: X0.2 per hand played that is not the most played.
  G.GAME.hands['Flush Five'].played = 50
  play_ante({ Small = { after_round = function()
    for _, c in ipairs(G.jokers.cards) do expect(c.ability.x_mult > 1).truthy() end
  end } })
end

SPECIAL.c_mp_vantablack = function()
  check_back_art({ atlas = 'mp_decks', pos = { x = 3, y = 1 } })
  play_ante()
end

-- ── the specs ───────────────────────────────────────────────────────────────

describe('MP challenges: started, applied as defined, first ante played', function()
  after_each(leave)

  if PART == 'a' then it('every MP challenge has a special-rule check here', function()
    for _, key in ipairs(MP.content.challenges.KEYS) do expect(SPECIAL[key] ~= nil and key).eq(key) end
    expect(#MP.content.challenges.KEYS).eq(22)
  end) end

  local keys = MP.content.challenges.KEYS
  local half = math.ceil(#keys / 2)
  local from, to = 1, half
  if PART == 'b' then from, to = half + 1, #keys end

  for i = from, to do
    local key = keys[i]
    it(key, function()
      local before = #lua_errors()
      local t0 = love.timer.getTime()
      practice(key)
      expect(G.GAME.challenge).eq(key)
      check_definition(key)
      SPECIAL[key]()
      local errs = lua_errors()
      expect({ unpack(errs, before + 1) }).eq({})
      report('challenge_s_' .. key, math.floor(love.timer.getTime() - t0))
    end)
  end
end)

-- ── win and loss ────────────────────────────────────────────────────────────

--- Capture the session's referee events (MP.event) while fn runs.
local function events_during(fn)
  local seen = {}
  local orig = MP.event
  MP.event = function(e)
    seen[#seen + 1] = e
    return orig(e)
  end
  local ok, err = sched.protected(fn)
  MP.event = orig
  if not ok then error(err, 0) end
  return seen
end

local function has_event(list, t)
  for _, e in ipairs(list) do if e.t == t then return true end end
  return false
end

--- Lose the blind on deck: every hand played into a blind nobody can reach.
local function lose_blind()
  AP.run('select_blind')
  settled()
  G.GAME.blind.chips = 1e300
  while G.STATE == G.STATES.SELECTING_HAND and G.GAME.current_round.hands_left > 0 and #G.hand.cards > 0 do
    AP.run('play', { { 1 } })
  end
  settled()
end

local function profile_challenges()
  local p = G.PROFILES[G.SETTINGS.profile]
  local completed = {}
  for k, v in pairs(p.challenge_progress.completed) do completed[k] = v end
  return { completed = completed, unlocked = p.challenges_unlocked }
end

if PART == 'b' then

describe('MP challenges: the win and loss paths', function()
  after_each(leave)

  it('practice: a lost blind is survived (practice never fails) and the run goes on', function()
    practice('c_mp_high_hand')
    lose_blind()
    expect(AP.state_name()).eq('ROUND_EVAL')
    AP.run('cash_out')
    expect(AP.state_name()).eq('SHOP')
  end)

  it('match: a lost blind is reported to the referee, and its loss ends on the loss screen', function()
    match('c_mp_twin_towers')
    expect(G.GAME.challenge).eq('c_mp_twin_towers')
    check_definition('c_mp_twin_towers')
    local evs = events_during(lose_blind)
    expect(has_event(evs, 'fail_round')).eq(true)
    -- the referee's answer to a last life lost
    outcome({ t = 'player_lives', player_id = 'u_me', lives = 0, lost = 4 })
    outcome({ t = 'win', winner_id = 'u_them' })
    wait_until(function() return G.OVERLAY_MENU ~= nil and AP.idle() end, 60, 'loss screen')
    expect(MP.state.result.kind).eq('lose')
  end)

  it('match on a ruleset without MP content: the MP challenge the lobby picked still applies and plays', function()
    match('c_mp_speed', false)
    expect(G.GAME.challenge).eq('c_mp_speed')
    check_definition('c_mp_speed')
    play_blind()
    expect(G.GAME.blind_on_deck).eq('Big')
  end)

  it("match: the referee's win ends on the win screen", function()
    match('c_mp_misprint_deck')
    check_definition('c_mp_misprint_deck')
    play_blind()
    outcome({ t = 'win', winner_id = 'u_me' })
    wait_until(function() return G.OVERLAY_MENU ~= nil and AP.idle() end, 60, 'win screen')
    expect(MP.state.result.kind).eq('win')
  end)

  it('practice: the ante-8 win shows the vanilla win screen; the SP profile challenge progress is untouched', function()
    local before = profile_challenges()
    require('rmh_mp.ui.menu')
    require('rmh_mp.ui.hud')
    practice('c_mp_vantablack')
    AP.run('set_ante', { 8 })
    AP.run('skip_blind')
    AP.run('skip_blind')
    -- ante 8's boss is the practice PvP blind: Ready, the practice referee's start (the page's TS
    -- session sends it), the one hand, then the referee's end of the PvP round
    AP.run('pvp_ready')
    outcome({ t = 'start_blind', first_player = MP.state.session.me or '', starting_hands = {} })
    wait_until(function() return G.STATE == G.STATES.SELECTING_HAND and AP.idle() and #G.hand.cards > 0 end, 120,
      'the PvP blind dealt')
    G.hand:add_to_highlighted(G.hand.cards[1])
    G.FUNCS.play_cards_from_highlighted()
    wait_until(function() return MP.state.pvp.waiting end, 120, 'waiting for the nemesis')
    outcome({ t = 'end_pvp', loser_id = 'u_practice_bot', pvp_timer_lost = false })
    wait_until(function() return G.GAME.won == true and G.OVERLAY_MENU ~= nil end, 60, 'win screen')
    wait_frames(30)
    expect(profile_challenges()).eq(before)
  end)
end)

-- ── vanilla challenges with the MP pack loaded ──────────────────────────────

local function vanilla_keys()
  local out = {}
  for _, c in ipairs(G.CHALLENGES) do if not c.rmh_mp and c.id then out[#out + 1] = c.id end end
  return out
end

describe('vanilla challenges with MP loaded', function()
  after_each(leave)

  it('every vanilla challenge starts outside a session and applies as defined', function()
    leave()
    local keys = vanilla_keys()
    expect(#keys >= 20).truthy()
    for _, key in ipairs(keys) do
      AP.run('prepare')
      AP.run('to_menu')
      G.FUNCS.start_run(nil, { stake = 1, challenge = challenge_table(key) })
      AP.run('wait_state', { 'BLIND_SELECT' })
      settled()
      expect(MP.state.session).eq(nil)
      local probs = CC.compare(challenge_table(key), CC.digest())
      expect({ key, probs }).eq({ key, {} })
    end
    AP.run('to_menu')
  end)

  it('a vanilla challenge in a practice session applies and plays its first ante', function()
    for _, key in ipairs({ 'c_omelette_1', 'c_city_1', 'c_medusa_1' }) do
      practice(key)
      expect(G.GAME.challenge).eq(key)
      check_definition(key)
    end
    play_ante()
  end)
end)

end -- PART b
