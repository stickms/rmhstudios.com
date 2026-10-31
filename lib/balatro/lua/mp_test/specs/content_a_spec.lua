-- L2 in-engine spec for WS7 Content A (PLAN §4 WS7): the objects inside the real game.
--
-- Needs the MP pack extracted (`?mp=1` on the engine harness page). Without it the whole file
-- reports one skipped test instead of failing: the engine project boots without the pack today.
-- Each test mounts a local practice session (no network) with the layers it needs, launches the
-- seeded run through the session path, and drives it with the autopilot.

local has_mp, MP = pcall(require, 'rmh_mp')

local SEED = 'RMHWS7A1'

local function resolved(layers, extra)
  local r = {
    key = 'ruleset_mp_test', layers = layers or { 'standard' }, multiplayerContent = true, banned = {},
    bannedSilent = {}, included = {}, reworked = {}, spectralBannedEnhancements = {}, stickers = {},
    gameModifiers = {}, startingParams = {}, setupHooks = {},
    flags = { theOrder = true, enemyLocationDisabled = false, comeback = 'default' },
    timer = { enabled = false, base = 0, increment = 0, forgiveness = 0, pvpHandIncrement = 0, mode = 'default',
      pressurePlusHand = 0, countdown = 3, mult = 1 },
  }
  for k, v in pairs(extra or {}) do r[k] = v end
  return r
end

local function practice(layers, seed, extra)
  AP.run('prepare')
  if MP.state.session then MP.session.unmount('test') end
  MP.session.mount('practice', {
    resolved = resolved(layers, extra), deck = 'b_red', stake = 1, seed = seed or SEED,
    shape = { nemesisPairing = true, manhunt = false, teamBased = false, practice = true },
    options = { pvpStartRound = 2, theOrder = true, multiplayerJokers = true, timer = false },
  })
  MP.session.launch(seed or SEED)
  AP.run('wait_state', { 'BLIND_SELECT' })
end

local function leave()
  if MP and MP.state and MP.state.session then MP.session.unmount('test') end
end

local function first_hand_chips(give)
  practice({ 'standard' })
  for _, k in ipairs(give or {}) do AP.run('give', { k }) end
  AP.run('select_blind')
  local s = AP.run('play', { 'best' })
  return s.chips
end

local function find(area, key)
  for _, c in ipairs(area.cards) do if c.config.center.key == key then return c end end
end

if not has_mp then
  describe('content A (in-engine)', function()
    xit('needs the MP pack (?mp=1): ' .. tostring(MP):sub(1, 120), function() end)
  end)
  return
end

local JOKERS = {
  'j_mp_defensive_joker', 'j_mp_skip_off', 'j_mp_lets_go_gambling', 'j_mp_speedrun', 'j_mp_conjoined_joker',
  'j_mp_penny_pincher', 'j_mp_taxes', 'j_mp_pizza', 'j_mp_pacifist', 'j_mp_hanging_chad', 'j_mp_bloodstone',
  'j_mp_seltzer', 'j_mp_turtle_bean', 'j_mp_ticket', 'j_mp_ticket_experimental', 'j_mp_idol_rare', 'j_mp_todo_list',
}
local CONSUMABLES = { 'c_mp_asteroid', 'c_mp_ouija_standard', 'c_mp_wraith' }

describe('content A: registration and art', function()
  after_each(leave)

  it('every object is defined, mounted, drawn from its atlas and has text', function()
    practice({ 'standard', 'experimental', 'wraith_rework' })
    for _, key in ipairs(JOKERS) do expect(G.P_CENTERS[key] ~= nil and key).eq(key) end
    for _, key in ipairs(CONSUMABLES) do expect(G.P_CENTERS[key] ~= nil and key).eq(key) end
    expect(G.P_BLINDS.bl_mp_nemesis.atlas).eq('mp_player_blind_chip')
    for _, key in ipairs({ 'j_mp_pacifist', 'j_mp_pizza', 'j_mp_hanging_chad', 'c_mp_asteroid', 'c_mp_ouija_standard' }) do
      AP.run('give', { key })
      local area = G.P_CENTERS[key].set == 'Joker' and G.jokers or G.consumeables
      local card = find(area, key)
      local atlas = G.P_CENTERS[key].atlas
      if atlas then expect(card.children.center.atlas == G.ASSET_ATLAS[atlas]).truthy() end
      local ui = card:generate_UIBox_ability_table()
      expect(type(ui.name)).eq('table')
      expect(#ui.main > 0 and key).eq(key)
      card:start_dissolve(nil, true)
      wait_frames(2)
    end
  end)

  it('reworks carry the Balanced badge', function()
    practice({ 'standard' })
    AP.run('give', { 'j_mp_hanging_chad' })
    local ui = find(G.jokers, 'j_mp_hanging_chad'):generate_UIBox_ability_table()
    local has = {}
    for _, b in ipairs(ui.badges) do has[b] = true end
    expect(has.mp_sticker_balanced).eq(true)
  end)
end)

describe('content A: scoring in a real hand', function()
  after_each(leave)

  it('Pacifist multiplies the first hand by 10 outside a PvP blind', function()
    local base = first_hand_chips()
    leave()
    local with = first_hand_chips({ 'j_mp_pacifist' })
    expect(base > 0).truthy()
    expect(with).eq(base * 10)
    report('pacifist_first_hand', { base = base, with = with })
  end)

  it('Hanging Chad (rework) scores more than no joker on the same hand', function()
    local base = first_hand_chips()
    leave()
    local with = first_hand_chips({ 'j_mp_hanging_chad' })
    expect(with > base).truthy()
  end)

  it('Seltzer spends a use per hand', function()
    practice({ 'standard' })
    AP.run('give', { 'j_mp_seltzer' })
    AP.run('select_blind')
    AP.run('play', { 'best' })
    AP.run('wait_idle')
    expect(find(G.jokers, 'j_mp_seltzer').ability.extra).eq(7)
  end)
end)

describe('content A: consumables', function()
  after_each(leave)

  it('Asteroid stores one launch per use', function()
    practice({ 'standard' })
    AP.run('give', { 'c_mp_asteroid' })
    AP.run('use', { 1 })
    expect(MP.state.pvp.asteroids).eq(1)
  end)

  it('Ouija destroys 3 cards and leaves one rank', function()
    practice({ 'standard' })
    AP.run('select_blind')
    AP.run('give', { 'c_mp_ouija_standard' })
    local before = #G.hand.cards
    local limit = G.hand.config.card_limit
    AP.run('use', { 1 })
    AP.run('wait_idle')
    expect(#G.hand.cards).eq(before - 3)
    local id = G.hand.cards[1].base.id
    for _, c in ipairs(G.hand.cards) do expect(c.base.id).eq(id) end
    expect(G.hand.config.card_limit).eq(limit)
  end)

  it('Wraith (rework) makes an Uncommon joker and pays $5', function()
    practice({ 'standard', 'wraith_rework' })
    AP.run('give', { 'c_mp_wraith' })
    local dollars = G.GAME.dollars
    AP.run('use', { 1 })
    AP.run('wait_idle')
    expect(#G.jokers.cards).eq(1)
    expect(G.jokers.cards[1].config.center.rarity).eq(2)
    expect(G.GAME.dollars).eq(dollars + 5)
  end)
end)

describe('content A: rules objects', function()
  after_each(leave)

  it('Glass is X1.5 under standard and vanilla again after the session', function()
    practice({ 'standard' })
    expect(G.P_CENTERS.m_glass.config.Xmult).eq(1.5)
    leave()
    expect(G.P_CENTERS.m_glass.config.Xmult).eq(2)
  end)

  it('experimental stickers: a listed joker gets the enabled families', function()
    practice({ 'experimental' })
    G.GAME.modifiers.mp_sticker_draining = true
    AP.run('give', { 'j_ancient' })
    local c = find(G.jokers, 'j_ancient')
    expect(c.ability.mp_sticker_draining).eq(true)
    local ui = c:generate_UIBox_ability_table()
    local has = {}
    for _, b in ipairs(ui.badges) do has[b] = true end
    expect(has.mp_sticker_draining).eq(true)
  end)

  it('no MP key is left in a vanilla table after unmount', function()
    practice({ 'standard', 'experimental', 'wraith_rework' })
    leave()
    expect(MP.registry.leaked_keys()).eq({})
  end)
end)
