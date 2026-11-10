-- L2 in-engine spec for WS8 Content B (PLAN §4 WS8): sandbox, inactive, Extra Credit and error
-- jokers, Ectoplasm and the sandbox tags inside the real game.
--
-- Needs the MP pack extracted (`?mp=1` on the engine harness page); without it the file reports
-- one skipped test. Each test mounts a local practice session with the sandbox layer, launches
-- the seeded run through the session path and drives it with the autopilot.

local has_mp, MP = pcall(require, 'rmh_mp')

local SEED = 'RMHWS8B1'

local function resolved(extra)
  local r = {
    key = 'ruleset_mp_sandbox', layers = { 'sandbox' }, multiplayerContent = true, banned = {},
    bannedSilent = { 'j_misprint', 'j_castle', 'j_mail', 'j_square', 'j_throwback', 'j_vampire', 'j_steel_joker',
      'j_baseball', 'j_hit_the_road', 'j_ticket', 'j_idol', 'j_mp_conjoined_joker' },
    included = {}, reworked = {}, spectralBannedEnhancements = {}, stickers = {},
    gameModifiers = {}, startingParams = {}, setupHooks = { 'sandbox' },
    flags = { theOrder = true, enemyLocationDisabled = false, comeback = 'sandbox' },
    timer = { enabled = false, base = 0, increment = 0, forgiveness = 0, pvpHandIncrement = 0, mode = 'default',
      pressurePlusHand = 0, countdown = 3, mult = 1 },
  }
  for k, v in pairs(extra or {}) do r[k] = v end
  return r
end

local function practice(seed, extra)
  AP.run('prepare')
  if MP.state.session then MP.session.unmount('test') end
  MP.session.mount('practice', {
    resolved = resolved(extra), deck = 'b_red', stake = 1, seed = seed or SEED,
    shape = { nemesisPairing = true, manhunt = false, teamBased = false, practice = true },
    options = { pvpStartRound = 2, theOrder = true, multiplayerJokers = true, timer = false },
  })
  MP.session.launch(seed or SEED)
  AP.run('wait_state', { 'BLIND_SELECT' })
end

local function leave()
  if MP and MP.state and MP.state.session then MP.session.unmount('test') end
end

local function find(area, key)
  for _, c in ipairs(area.cards) do if c.config.center.key == key then return c end end
end

local function badges_of(card)
  local ui = card:generate_UIBox_ability_table()
  local has = {}
  for _, b in ipairs(ui.badges or {}) do has[b] = true end
  return has, ui
end

if not has_mp then
  describe('content B (in-engine)', function()
    xit('needs the MP pack (?mp=1): ' .. tostring(MP):sub(1, 120), function() end)
  end)
  return
end

local S = MP.sandbox

describe('content B: registration, art and text', function()
  after_each(leave)

  it('every WS8 object is defined in a sandbox session and only rotation keys are pooled', function()
    practice()
    for _, list in ipairs({ S.ACTIVE, S.INACTIVE, S.EXTRA_CREDIT, S.ERRORS }) do
      for _, key in ipairs(list) do expect(G.P_CENTERS[key] ~= nil and key).eq(key) end
    end
    for _, key in ipairs({ 'c_mp_ectoplasm_sandbox' }) do expect(G.P_CENTERS[key] ~= nil and key).eq(key) end
    for _, key in ipairs({ 'tag_mp_gambling_sandbox', 'tag_mp_investment_sandbox', 'tag_mp_juggle_sandbox' }) do
      expect(G.P_TAGS[key] ~= nil and key).eq(key)
    end
    local pooled = {}
    for r = 1, 3 do for _, v in ipairs(G.P_JOKER_RARITY_POOLS[r]) do pooled[v.key] = true end end
    for _, key in ipairs(S.ACTIVE) do expect(pooled[key] or key).eq(true) end
    for _, key in ipairs(S.EXTRA_CREDIT) do expect(pooled[key] or key).eq(true) end
    for _, key in ipairs(S.INACTIVE) do expect(pooled[key] and key or false).eq(false) end
    for _, key in ipairs(S.ERRORS) do expect(pooled[key] and key or false).eq(false) end
  end)

  it('jokers draw from their MP atlases and have text; Extra Credit shows its badge', function()
    practice()
    for _, key in ipairs({ 'j_mp_castle_sandbox', 'j_mp_idol_sandbox_zealot', 'j_mp_forklift_sandbox',
      'j_mp_clowncar_sandbox', 'j_mp_cloud_9_sandbox', 'j_mp_golden_ticket_sandbox' }) do
      AP.run('give', { key })
      local card = find(G.jokers, key)
      local atlas = G.P_CENTERS[key].atlas or 'Joker'
      expect(card.children.center.atlas == G.ASSET_ATLAS[atlas] and key).eq(key)
      local has, ui = badges_of(card)
      expect(#ui.main > 0 and key).eq(key)
      if MP.registry.get(key).extra_credit then expect(has.mp_sticker_extra_credit and key).eq(key) end
      if key == 'j_mp_castle_sandbox' then expect(has.mp_sticker_balanced).eq(true) end
      card:start_dissolve(nil, true)
      wait_frames(2)
    end
  end)

  it('error decoys read the shared description and build their flavour tooltip', function()
    practice()
    AP.run('give', { 'j_mp_error_sandbox_3' })
    local card = find(G.jokers, 'j_mp_error_sandbox_3')
    expect(G.localization.descriptions.Joker.j_mp_error_sandbox_3 ~= nil).truthy()
    local _, ui = badges_of(card)
    expect(#ui.main > 0).truthy()
    card:start_dissolve(nil, true)
  end)
end)

describe('content B: the sandbox layer', function()
  after_each(leave)

  it('keeps one idol per run, the same one for the same seed', function()
    practice('IDOLSEED')
    local b1 = { G.GAME.banned_keys.j_mp_idol_sandbox_zealot, G.GAME.banned_keys.j_mp_idol_sandbox_collector }
    leave()
    practice('IDOLSEED')
    local b2 = { G.GAME.banned_keys.j_mp_idol_sandbox_zealot, G.GAME.banned_keys.j_mp_idol_sandbox_collector }
    expect(b1).eq(b2)
    expect((b1[1] and 1 or 0) + (b1[2] and 1 or 0)).eq(1)
    report('sandbox_idol_banned', b1[1] and 'zealot' or 'collector')
  end)

  it('rolls the per-round globals at run start', function()
    practice()
    local cr = G.GAME.current_round
    expect(cr.zealot_idol ~= nil and cr.zealot_idol.id ~= nil).truthy()
    expect(cr.tuxedo_card ~= nil and cr.tuxedo_card.suit ~= nil).truthy()
    expect(cr.farmer_card ~= nil and cr.farmer_card.suit ~= nil).truthy()
    expect(cr.fish_rank ~= nil and cr.fish_rank.rank ~= nil).truthy()
    report('sandbox_globals', { zealot = cr.zealot_idol.rank, tux = cr.tuxedo_card.suit,
      farm = cr.farmer_card.suit, fish = cr.fish_rank.rank })
  end)

  it('no MP key is left in a vanilla table after unmount', function()
    practice()
    AP.run('give', { 'j_mp_hoarder_sandbox' })
    leave()
    expect(MP.registry.leaked_keys()).eq({})
  end)
end)

describe('content B: in a real hand', function()
  after_each(leave)

  local function first_hand(give)
    practice()
    for _, k in ipairs(give or {}) do AP.run('give', { k }) end
    AP.run('select_blind')
    local dollars = G.GAME.dollars
    local s = AP.run('play', { 'best' })
    AP.run('wait_idle')
    return s.chips, G.GAME.dollars - dollars
  end

  it('Clown Car adds +44 Mult before scoring and costs $3', function()
    local base = first_hand()
    leave()
    local with, spent = first_hand({ 'j_mp_clowncar_sandbox' })
    expect(with > base).truthy()
    expect(spent <= -3).truthy()
    report('clowncar_first_hand', { base = base, with = with })
  end)

  it('Traffic Light steps X2.5 -> X1.5 after the first hand', function()
    practice()
    AP.run('give', { 'j_mp_trafficlight_sandbox' })
    AP.run('select_blind')
    AP.run('play', { 'best' })
    AP.run('wait_idle')
    expect(find(G.jokers, 'j_mp_trafficlight_sandbox').ability.extra.Xmult).eq(1.5)
  end)

  it('Hoarder gains sell value when money is earned', function()
    practice()
    AP.run('give', { 'j_mp_hoarder_sandbox' })
    local h = find(G.jokers, 'j_mp_hoarder_sandbox')
    local before = h.sell_cost
    ease_dollars(4)
    AP.run('wait_idle')
    expect(h.sell_cost).eq(before + 1)
  end)

  it('Misprint fixes its value on purchase', function()
    practice()
    AP.run('give', { 'j_mp_misprint_sandbox' })
    local m = find(G.jokers, 'j_mp_misprint_sandbox').ability.extra.mult
    expect(type(m)).eq('number')
    expect(m >= -23 and m <= 46).truthy()
  end)
end)

describe('content B: consumable and tags', function()
  after_each(leave)

  it('Ectoplasm (sandbox) makes a joker Negative and costs one of hand/discard/hand size', function()
    practice()
    AP.run('give', { 'j_joker' })
    AP.run('give', { 'c_mp_ectoplasm_sandbox' })
    local h, d, size = G.GAME.round_resets.hands, G.GAME.round_resets.discards, G.hand.config.card_limit
    AP.run('use', { 1 })
    AP.run('wait_idle')
    expect(G.jokers.cards[1].edition and G.jokers.cards[1].edition.negative).eq(true)
    local lost = (h - G.GAME.round_resets.hands) + (d - G.GAME.round_resets.discards) + (size - G.hand.config.card_limit)
    expect(lost).eq(1)
  end)

  it('Investment Tag pays $5 + $10 per ante after a Boss', function()
    practice()
    local t = Tag('tag_mp_investment_sandbox')
    G.GAME.round_resets.ante = 3
    G.GAME.last_blind = { boss = true, name = 'The Wall' }
    local r = t:apply_to_run({ type = 'eval' })
    expect(r and r.dollars).eq(25)
  end)
end)
