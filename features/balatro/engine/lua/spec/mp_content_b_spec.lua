-- WS8 content B (L1): registration, ruleset gating, isolation, the sandbox layer hook and the
-- per-round globals, the shared session wraps, tags, Ectoplasm, the error decoys. The per-joker
-- numbers are in mp_content_b_jokers_spec.lua.

local CH = require 'spec.mp_content_helper'
local B = require 'spec.mp_content_b_helper'
local H = CH.H

local MP

describe('content B boot and registration', function()
  after_each(B.teardown)

  it('loads every WS8 module without errors', function()
    MP = H.boot()
    local errs = {}
    for _, l in ipairs(MP.log_ring) do if l.level == 'error' then errs[#errs + 1] = l.msg end end
    expect(errs).eq({})
    local loaded = MP.set_of(MP.content_loaded)
    for _, m in ipairs({ 'rmh_mp.content.jokers.sandbox', 'rmh_mp.content.jokers.sandbox_inactive',
      'rmh_mp.content.jokers.extra_credit', 'rmh_mp.content.jokers.errors', 'rmh_mp.content.sandbox_misc',
      'rmh_mp.rules.sandbox' }) do
      expect(loaded[m] or m).eq(true)
    end
  end)

  it('registers 12 active, 14 inactive (13 + Alloy), 25 Extra Credit and 21 error jokers', function()
    MP = H.boot()
    local S = MP.sandbox
    expect(#S.ACTIVE).eq(12)
    expect(#S.INACTIVE).eq(14)
    expect(#S.EXTRA_CREDIT).eq(25)
    expect(#S.ERRORS).eq(21)
    local R = MP.registry
    for _, k in ipairs(S.ACTIVE) do
      expect(R.proto(k).config.mp_balanced).eq(true)
      expect(R.proto(k).no_collection).eq(true)
    end
    for _, k in ipairs(S.EXTRA_CREDIT) do
      expect(R.get(k).extra_credit).eq(true)
      expect(R.proto(k).atlas).eq('mp_ec_jokers_sandbox')
    end
    for _, k in ipairs(S.INACTIVE) do expect(R.get(k).pool).eq(false) end
    for _, k in ipairs(S.ERRORS) do expect(R.get(k).pool).eq(false) end
    expect(R.proto('j_mp_golden_ticket_sandbox').atlas).eq(nil) -- vanilla Jokers sheet (5,3)
    expect(R.proto('j_mp_golden_ticket_sandbox').pos).eq({ x = 5, y = 3 })
    expect(R.proto('j_mp_alloy_sandbox').pos).eq({ x = 4, y = 4 })
    expect(R.proto('j_mp_magnet_sandbox').phantom).eq(true)
  end)

  it('matches the WS4 sandbox layer data (rotation + Extra Credit = reworked jokers)', function()
    MP = H.boot()
    local S = MP.sandbox
    local want = {}
    for _, k in ipairs(B.fixture('ruleset_mp_sandbox').resolved.reworked) do
      if k:match('^j_mp_.*_sandbox') or k:match('^j_mp_idol_sandbox_') then want[#want + 1] = k end
    end
    local have = {}
    for _, k in ipairs(S.ACTIVE) do have[#have + 1] = k end
    for _, k in ipairs(S.EXTRA_CREDIT) do have[#have + 1] = k end
    table.sort(want)
    table.sort(have)
    expect(have).eq(want)
    -- Every vanilla joker the active set replaces is silently banned by the layer.
    local silent = MP.set_of(B.fixture('ruleset_mp_sandbox').resolved.bannedSilent)
    for _, k in ipairs(S.ACTIVE) do
      local rep = MP.registry.get(k).silent_replaces
      if rep then expect(silent[rep] or rep).eq(true) end
    end
  end)
end)

describe('pool gating per ruleset', function()
  after_each(B.teardown)

  local function enabled_count(keys)
    local n = 0
    for _, k in ipairs(keys) do if MP.registry.enabled(k) then n = n + 1 end end
    return n
  end

  for _, name in ipairs({ 'ruleset_mp_sandbox', 'ruleset_mp_chaos' }) do
    it(name .. ' pools the rotation, Extra Credit, Ectoplasm and the three tags only', function()
      MP = B.boot()
      B.mount_ruleset(name)
      local S = MP.sandbox
      expect(enabled_count(S.ACTIVE)).eq(12)
      expect(enabled_count(S.EXTRA_CREDIT)).eq(25)
      expect(enabled_count(S.INACTIVE)).eq(0)
      expect(enabled_count(S.ERRORS)).eq(0)
      for _, k in ipairs({ 'c_mp_ectoplasm_sandbox', 'tag_mp_gambling_sandbox', 'tag_mp_investment_sandbox',
        'tag_mp_juggle_sandbox' }) do
        expect(MP.registry.enabled(k) or k).eq(true)
      end
      -- Inactive and error keys exist (saves, give-card) but are in no pool.
      expect(G.P_CENTERS.j_mp_cloud_9_sandbox ~= nil).truthy()
      expect(G.P_CENTERS.j_mp_error_sandbox_21 ~= nil).truthy()
      local inactive = MP.set_of(S.INACTIVE)
      for _, k in ipairs(S.ERRORS) do inactive[k] = true end
      for r = 1, 4 do
        for _, v in ipairs(G.P_JOKER_RARITY_POOLS[r]) do
          if inactive[v.key] then error('pooled: ' .. v.key) end
        end
      end
      local rare = {}
      for _, v in ipairs(G.P_JOKER_RARITY_POOLS[3]) do rare[v.key] = true end
      expect(rare.j_mp_baseball_sandbox).eq(true)
      expect(rare.j_mp_clowncar_sandbox).eq(true)
      local tags = {}
      for _, v in ipairs(G.P_CENTER_POOLS.Tag) do tags[v.key] = true end
      expect(tags.tag_mp_gambling_sandbox).eq(true)
    end)
  end

  for _, name in ipairs({ 'ruleset_mp_vanilla', 'ruleset_mp_balanced', 'ruleset_mp_experimental',
    'ruleset_mp_standard', 'ruleset_mp_badlatro', 'ruleset_mp_smallworld' }) do
    it(name .. ' pools no sandbox content', function()
      MP = B.boot()
      if not B.fixture(name) then return end
      B.mount_ruleset(name)
      local S = MP.sandbox
      expect(enabled_count(S.ACTIVE) + enabled_count(S.EXTRA_CREDIT) + enabled_count(S.INACTIVE)).eq(0)
      expect(MP.registry.enabled('c_mp_ectoplasm_sandbox')).eq(false)
      expect(MP.registry.enabled('tag_mp_gambling_sandbox')).eq(false)
    end)
  end

  it('leaves no MP key behind after unmount (isolation) and restores every pool', function()
    MP = B.boot()
    local before = H.fingerprint()
    B.mount_ruleset('ruleset_mp_sandbox')
    expect(#MP.registry.leaked_keys() > 0).truthy()
    MP.session.unmount('test')
    expect(MP.registry.leaked_keys()).eq({})
    expect(H.fingerprint()).eq(before)
    expect(MP.hooks.is_wrapped(_G, 'reset_castle_card', 'content.sandbox.globals')).falsy()
  end)
end)

describe('LY-09 sandbox layer hook: keep one idol', function()
  after_each(B.teardown)

  local function kept_for(seed)
    MP = B.boot()
    B.mount_ruleset('ruleset_mp_sandbox', seed)
    G.GAME.pseudorandom.seed = seed
    G.GAME.pseudorandom.hashed_seed = pseudohash(seed)
    MP.session.run_seed = seed
    MP.session.pre_roll()
    local b = G.GAME.banned_keys
    local z, c = b.j_mp_idol_sandbox_zealot == true, b.j_mp_idol_sandbox_collector == true
    B.teardown()
    expect(z ~= c).truthy() -- exactly one is banned
    return z and 'j_mp_idol_sandbox_collector' or 'j_mp_idol_sandbox_zealot'
  end

  it('bans exactly one idol, the same one for the same seed (every peer agrees)', function()
    local a1 = kept_for('SEEDAAAA')
    local a2 = kept_for('SEEDAAAA')
    expect(a1).eq(a2)
  end)

  it('different seeds keep different idols (both outcomes reachable)', function()
    local seen = {}
    for i = 1, 24 do seen[kept_for('IDOL' .. i)] = true end
    expect(seen.j_mp_idol_sandbox_zealot).eq(true)
    expect(seen.j_mp_idol_sandbox_collector).eq(true)
  end)

  it('is listed by the sandbox bundle setupHooks and only runs there', function()
    expect(MP.set_of(B.fixture('ruleset_mp_sandbox').resolved.setupHooks).sandbox).eq(true)
    MP = B.boot()
    B.mount_ruleset('ruleset_mp_balanced')
    MP.session.pre_roll()
    expect(G.GAME.banned_keys.j_mp_idol_sandbox_zealot).eq(nil)
    expect(G.GAME.banned_keys.j_mp_idol_sandbox_collector).eq(nil)
  end)
end)

describe('per-round globals (zealot, tuxedo, farmer, fish)', function()
  before_each(function()
    MP = B.boot()
    B.mount_ruleset('ruleset_mp_sandbox')
  end)
  after_each(B.teardown)

  it('are rolled after reset_castle_card in the sandbox layer only', function()
    B.deck({ { 'Hearts', '5' }, { 'Hearts', '5' }, { 'Spades', '5' }, { 'Clubs', 'King' } })
    reset_castle_card()
    local cr = G.GAME.current_round
    expect(cr.zealot_idol.rank == '5' or cr.zealot_idol.rank == 'King').truthy()
    expect(cr.tuxedo_card.suit ~= nil).truthy()
    expect(cr.farmer_card.suit ~= nil).truthy()
    expect(cr.fish_rank.id).eq(MP.sandbox.RANK_ID[cr.fish_rank.rank])
  end)

  it('never repeats last round\'s suit or rank', function()
    for _ = 1, 30 do
      local cr = G.GAME.current_round
      local t, f, r = cr.tuxedo_card and cr.tuxedo_card.suit, cr.farmer_card and cr.farmer_card.suit,
        cr.fish_rank and cr.fish_rank.rank
      MP.sandbox.rules.reset_globals()
      if t then expect(cr.tuxedo_card.suit ~= t).truthy() end
      if f then expect(cr.farmer_card.suit ~= f).truthy() end
      if r then expect(cr.fish_rank.rank ~= r).truthy() end
      G.GAME.round_resets.ante = G.GAME.round_resets.ante + 1
    end
  end)

  it('weights the Zealot rank by copies and ignores Stone cards', function()
    B.deck({ { 'Hearts', '5' }, { 'Hearts', '5' }, { 'Spades', '5' }, { 'Clubs', 'King', 'm_stone' } })
    CH.roll({ zealot_idol1 = 0.99 })
    expect(MP.sandbox.rules.reset_zealot().rank).eq('5') -- the only non-Stone rank
    B.deck({ { 'Hearts', '5' }, { 'Spades', '5' }, { 'Spades', '5' }, { 'Clubs', 'King' } })
    CH.roll({ zealot_idol1 = 0.74 })
    expect(MP.sandbox.rules.reset_zealot().rank).eq('5') -- 3/4 weight first
    CH.roll({ zealot_idol1 = 0.76 })
    expect(MP.sandbox.rules.reset_zealot().rank).eq('King')
    B.deck({})
    expect(MP.sandbox.rules.reset_zealot()).eq({ id = 14, rank = 'Ace' })
  end)

  it('does nothing outside the sandbox layer', function()
    B.teardown()
    MP = B.boot()
    B.mount_ruleset('ruleset_mp_balanced')
    reset_castle_card()
    expect(G.GAME.current_round.tuxedo_card).eq(nil)
  end)
end)

describe('Hoarder ease_dollars hook', function()
  after_each(B.teardown)

  it('adds $1 sell value per money gain to each non-debuffed Hoarder (sandbox only)', function()
    MP = B.boot()
    B.mount_ruleset('ruleset_mp_sandbox')
    local h1 = CH.card('j_mp_hoarder_sandbox', G.jokers)
    local h2 = CH.card('j_mp_hoarder_sandbox', G.jokers)
    h2.debuff = true
    ease_dollars(5)
    ease_dollars(0)
    ease_dollars(-3)
    ease_dollars(1)
    expect(h1.ability.extra_value).eq(2)
    expect(h1.sell_cost).eq(4)
    expect(h2.ability.extra_value or 0).eq(0)
    expect(G.GAME.dollars).eq(3)
  end)

  it('is inert in a ruleset without the sandbox layer and gone after unmount', function()
    MP = B.boot()
    B.mount_ruleset('ruleset_mp_balanced')
    local h = CH.card('j_mp_hoarder_sandbox', G.jokers)
    ease_dollars(5)
    expect(h.ability.extra_value or 0).eq(0)
    MP.session.unmount('test')
    expect(MP.hooks.is_wrapped(_G, 'ease_dollars', 'content.sandbox.hoarder')).falsy()
  end)
end)

describe('Clown Car: the initial scoring step (Blind.modify_hand)', function()
  after_each(B.teardown)

  it('adds +44 Mult and pays $3 after the blind modifies the hand, per copy', function()
    MP = B.boot()
    B.mount_ruleset('ruleset_mp_sandbox')
    G.GAME.dollars = 10
    CH.card('j_mp_clowncar_sandbox', G.jokers)
    CH.card('j_joker', G.jokers)
    local blind = setmetatable({}, { __index = Blind })
    local mult, chips, modded = blind:modify_hand({}, {}, 'Pair', 2, 10)
    expect(mult).eq(46)
    expect(chips).eq(10)
    expect(modded).eq(true)
    expect(G.GAME.dollars).eq(7)
  end)

  it('passes the hand through untouched without a Clown Car', function()
    MP = B.boot()
    B.mount_ruleset('ruleset_mp_sandbox')
    local blind = setmetatable({}, { __index = Blind })
    expect({ blind:modify_hand({}, {}, 'Pair', 2, 10) }).eq({ 2, 10, false })
  end)
end)

describe('Lucky 7 / Alloy "counts as" wraps', function()
  before_each(function()
    MP = B.boot()
    B.mount_ruleset('ruleset_mp_sandbox')
  end)
  after_each(B.teardown)

  it('Lucky 7 makes every scoring card roll like a Lucky card for that hand only', function()
    local l7 = CH.card('j_mp_lucky7_sandbox', G.jokers)
    local seven, five = B.pc('Hearts', '7'), B.pc('Spades', '5', 'm_mult')
    CH.calc(l7, { before = true, cardarea = G.jokers, scoring_hand = { seven, five }, full_hand = { seven, five } })
    expect(MP.sandbox.has_enh(five, 'm_lucky')).eq(true)
    CH.roll({ lucky_mult = 0.1, lucky_money = 0.01 })
    expect(five:get_chip_mult()).eq(4 + 20)
    expect(five.lucky_trigger).eq(true)
    expect(seven:get_p_dollars()).eq(20)
    CH.calc(l7, { after = true, cardarea = G.jokers, scoring_hand = { seven, five } })
    expect(MP.sandbox.has_enh(five, 'm_lucky')).eq(false)
    expect(five:get_chip_mult()).eq(4)
  end)

  it('Lucky 7 does nothing without a scoring non-debuffed 7, and never for blueprint copies', function()
    local l7 = CH.card('j_mp_lucky7_sandbox', G.jokers)
    local seven, five = B.pc('Hearts', '7'), B.pc('Spades', '5')
    seven.debuff = true
    CH.calc(l7, { before = true, cardarea = G.jokers, scoring_hand = { seven, five } })
    expect(five.mp_gambling).eq(nil)
    seven.debuff = nil
    CH.calc(l7, { before = true, cardarea = G.jokers, scoring_hand = { seven, five }, blueprint = 1 })
    expect(five.mp_gambling).eq(nil)
  end)

  it('Alloy: held Gold gives the Steel X1.5 and held Steel the Gold $3 (inactive joker)', function()
    local gold, steel = B.pc('Hearts', '5', 'm_gold'), B.pc('Spades', '5', 'm_steel')
    expect(gold:get_chip_h_x_mult()).eq(0)
    expect(steel:get_end_of_round_effect().h_dollars).eq(nil)
    CH.card('j_mp_alloy_sandbox', G.jokers)
    expect(gold:get_chip_h_x_mult()).eq(1.5)
    expect(steel:get_end_of_round_effect().h_dollars).eq(3)
    expect(MP.sandbox.has_enh(gold, 'm_steel')).eq(true)
    expect(MP.sandbox.has_enh(steel, 'm_gold')).eq(true)
  end)
end)

describe('TG-01…03 sandbox tags', function()
  before_each(function()
    MP = B.boot()
    B.mount_ruleset('ruleset_mp_sandbox')
  end)
  after_each(B.teardown)

  it('Gambling Tag: 1 in 2 a free Rare in the shop; a miss or no unowned Rare is a nope', function()
    local t = B.tag('tag_mp_gambling_sandbox')
    expect(MP.registry.proto('tag_mp_gambling_sandbox').min_ante).eq(2)
    expect(MP.registry.proto('tag_mp_gambling_sandbox').requires).eq('j_blueprint')
    expect(t:apply_to_run({ type = 'eval' })).eq(nil)
    CH.roll({ tagroll = 0.4 })
    local card = t:apply_to_run({ type = 'store_joker_create', area = G.shop_jokers })
    expect(card ~= nil).truthy()
    expect(card.ability.couponed).eq(true)
    local rta = CH.called('create_card')
    expect(rta[#rta][3]).eq(1)
    expect(rta[#rta][4]).eq('rta')
    expect(t.triggered).eq(true)
    expect(t:apply_to_run({ type = 'store_joker_create', area = G.shop_jokers })).eq(nil) -- once
    local miss = B.tag('tag_mp_gambling_sandbox')
    CH.roll({ tagroll = 0.5 })
    expect(miss:apply_to_run({ type = 'store_joker_create', area = G.shop_jokers })).eq(nil)
    expect(miss.triggered).eq(true)
    local all = B.tag('tag_mp_gambling_sandbox')
    CH.roll({ tagroll = 0.1 })
    local pool = G.P_JOKER_RARITY_POOLS[3]
    for _, p in ipairs(pool) do CH.card(p.key, G.jokers, true) end
    expect(all:apply_to_run({ type = 'store_joker_create', area = G.shop_jokers })).eq(nil)
    expect(MP.registry.get('tag_mp_gambling_sandbox').tag.loc_vars(t)).eq({ 1, 2 })
  end)

  it('Investment Tag: $5 + $10 x (ante - 1) after a Boss (the PvP Nemesis blind counts)', function()
    local t = B.tag('tag_mp_investment_sandbox')
    G.GAME.round_resets.ante = 4
    G.GAME.last_blind = { boss = false, name = 'Big Blind' }
    expect(t:apply_to_run({ type = 'eval' })).eq(nil)
    G.GAME.last_blind = { boss = false, name = 'bl_mp_nemesis' }
    local r = t:apply_to_run({ type = 'eval' })
    expect(r.dollars).eq(35)
    expect(t:apply_to_run({ type = 'eval' })).eq(nil)
    local t2 = B.tag('tag_mp_investment_sandbox')
    G.GAME.last_blind = { boss = true, name = 'The Wall' }
    G.GAME.round_resets.ante = 1
    expect(t2:apply_to_run({ type = 'eval' }).dollars).eq(5)
    expect(MP.registry.get('tag_mp_investment_sandbox').tag.loc_vars(t2)).eq({ 5, 10, 15 })
  end)

  it('Juggle Tag: +3 hand size only in a PvP blind; waits otherwise', function()
    local t = B.tag('tag_mp_juggle_sandbox')
    local size = G.hand.config.card_limit
    CH.pvp(false)
    expect(t:apply_to_run({ type = 'round_start_bonus' })).eq(nil)
    expect(G.hand.config.card_limit).eq(size)
    expect(t.triggered).eq(false)
    CH.pvp(true)
    expect(t:apply_to_run({ type = 'round_start_bonus' })).eq(true)
    expect(G.hand.config.card_limit).eq(size + 3)
    expect(G.GAME.round_resets.temp_handsize).eq(3)
    expect(t:apply_to_run({ type = 'round_start_bonus' })).eq(nil)
  end)

  it('the Gambling tag points at its tags.png extension cell while mounted', function()
    expect(MP.registry.proto('tag_mp_gambling_sandbox').atlas).eq('mp_tag_gambling_sandbox')
  end)
end)

describe('CN-04 Ectoplasm (sandbox)', function()
  before_each(function()
    MP = B.boot()
    B.mount_ruleset('ruleset_mp_sandbox')
  end)
  after_each(B.teardown)

  local function use(roll)
    local j = CH.card('j_joker', G.jokers)
    local c = CH.card('c_mp_ectoplasm_sandbox', G.consumeables)
    expect(c:can_use_consumeable()).eq(true)
    CH.roll({ ectoplasm_sandbox = roll })
    c:use_consumeable(G.consumeables)
    H.fake.flush()
    return j
  end

  it('1/3: -1 hand for the run, and a joker turns Negative', function()
    local j = use(0.1)
    expect(G.GAME.round_resets.hands).eq(3)
    expect(G.GAME.current_round.hands_left).eq(3)
    expect(j.edition).eq({ negative = true })
  end)

  it('2/3: -1 discard for the run', function()
    use(0.5)
    expect(G.GAME.round_resets.discards).eq(2)
    expect(G.GAME.current_round.discards_left).eq(2)
  end)

  it('3/3: -1 hand size (no escalating ecto_minus)', function()
    local size = G.hand.config.card_limit
    use(0.9)
    expect(G.hand.config.card_limit).eq(size - 1)
    expect(G.GAME.ecto_minus).eq(nil)
  end)

  it('needs an editionless joker', function()
    local c = CH.card('c_mp_ectoplasm_sandbox', G.consumeables)
    expect(c:can_use_consumeable()).eq(false)
    local j = CH.card('j_joker', G.jokers)
    j.edition = { foil = true }
    expect(c:can_use_consumeable()).eq(false)
  end)
end)

describe('give-card and the collection (D-26, D-28)', function()
  after_each(B.teardown)

  it('inactive keys spawn only in Practice with the toggle on; error decoys never', function()
    MP = B.boot()
    B.mount_ruleset('ruleset_mp_sandbox')
    local S = MP.sandbox
    expect(S.spawnable('j_mp_castle_sandbox')).eq(true)
    expect(S.spawnable('j_mp_forklift_sandbox')).eq(true)
    expect(S.spawnable('j_mp_cloud_9_sandbox', true)).eq(false) -- a match, not Practice
    expect(S.spawnable('j_mp_error_sandbox_3', true)).eq(false)
    B.teardown()
    MP = B.boot()
    B.mount_ruleset('ruleset_mp_sandbox', nil, 'practice')
    S = MP.sandbox
    expect(S.spawnable('j_mp_cloud_9_sandbox')).eq(false)
    expect(S.spawnable('j_mp_cloud_9_sandbox', true)).eq(true)
    expect(S.spawnable('j_mp_alloy_sandbox', true)).eq(true)
    expect(S.spawnable('j_mp_error_sandbox_3', true)).eq(false)
  end)

  it('the Sandbox tab lists Extra Credit, 14 decoys and Hanging Chad shuffled, idols in the middle', function()
    MP = H.boot()
    local list = MP.sandbox.overview_keys(42)
    expect(#list).eq(25 + 14 + 1 + 2)
    expect(MP.sandbox.overview_keys(42)).eq(list) -- deterministic for a seed
    local mid = math.floor((#list - 2) / 2) + 1
    expect(list[mid]).eq('j_mp_idol_sandbox_zealot')
    expect(list[mid + 1]).eq('j_mp_idol_sandbox_collector')
    local set = MP.set_of(list)
    for i = 1, 14 do expect(set['j_mp_error_sandbox_' .. i] or i).eq(true) end
    expect(set.j_mp_error_sandbox_15).eq(nil)
    expect(set.j_mp_hanging_chad).eq(true)
    expect(set.j_mp_cloud_9_sandbox).eq(nil)
  end)

  it('every decoy reads the shared error description, in any language table', function()
    MP = H.boot()
    local loc = { descriptions = { Joker = { j_mp_error_sandbox = { name = '????', text = { 'x' } } } } }
    expect(MP.sandbox.errors.alias_loc(loc)).eq(21)
    expect(loc.descriptions.Joker.j_mp_error_sandbox_7).eq({ name = '????', text = { 'x' } })
    expect(MP.sandbox.errors.alias_loc(loc)).eq(0)
    expect(MP.sandbox.errors.alias_loc({ descriptions = { Joker = {} } })).eq(0)
  end)

  it('the decoy tooltip gets its flavour row only for decoys', function()
    MP = B.boot()
    B.mount_ruleset('ruleset_mp_sandbox')
    _G.DynaText = function(cfg) return { dyna = cfg } end
    generate_card_ui({ key = 'j_mp_error_sandbox_2', set = 'Joker' }, nil, nil, 'Joker')
    generate_card_ui({ key = 'j_joker', set = 'Joker' }, nil, nil, 'Joker')
    local calls = CH.called('generate_card_ui')
    expect(type(calls[#calls - 1][5])).eq('table')
    expect(calls[#calls][5]).eq(nil)
    local row = calls[#calls - 1][5]
    expect(row[1].config.text:match('^%(CURRENTLY %d+%)$') ~= nil).truthy()
    _G.DynaText = nil
  end)
end)
