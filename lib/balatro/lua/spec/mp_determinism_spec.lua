-- WS6 determinism on the REAL base-game code (data/balatro, LuaJIT-exact math.random):
--   * golden-seed single-player invariance: shops / bosses / tags / vouchers for 5 seeds are
--     identical before the MP pack loads, after it loads, and after a session mount/unmount cycle
--     (the L1 counterpart of the L2 in-engine gate, PLAN §4 WS6 / R-02)
--   * OR-07: in a session, rolls do not depend on the profile's unlock/discovery state, and the
--     temporary flips never leak
--   * FL-20: vanilla pseudoseed is deterministic while paused
--   * The Order runs on real pools (seed prefix, boss queue per ante, stable idol)

local V = require 'spec.mp_vanilla'

local SEEDS = { 'ABCD1234', 'ZZZZ9999', 'K7Q2M4P8', '00000001', 'SEEDRUN1' }

local function goldens(opts)
  local out = {}
  for i, s in ipairs(SEEDS) do out[i] = V.golden(s, opts) end
  return out
end

local function all_meta()
  local m = { unlocked = {}, discovered = {} }
  -- Built from the real prototypes once, then used as the profile's meta.jkr.
  V.install()
  for k in pairs(G.P_CENTERS) do m.unlocked[k] = true; m.discovered[k] = true end
  V.uninstall()
  return m
end

local function pool_fingerprint()
  local parts = {}
  local names = {}
  for n in pairs(G.P_CENTER_POOLS) do names[#names + 1] = n end
  table.sort(names)
  for _, n in ipairs(names) do
    local ks = {}
    for i, v in ipairs(G.P_CENTER_POOLS[n]) do ks[i] = tostring(v.key) .. '@' .. tostring(v) end
    parts[#parts + 1] = n .. '=' .. table.concat(ks, ',')
  end
  for i = 1, 4 do
    local ks = {}
    for j, v in ipairs(G.P_JOKER_RARITY_POOLS[i]) do ks[j] = tostring(v.key) end
    parts[#parts + 1] = 'r' .. i .. '=' .. table.concat(ks, ',')
  end
  local c = {}
  for k in pairs(G.P_CENTERS) do c[#c + 1] = k end
  table.sort(c)
  parts[#parts + 1] = table.concat(c, ',')
  return table.concat(parts, '\n')
end

local function boot_mp()
  for k in pairs(package.loaded) do
    if k:sub(1, 7) == 'rmh_mp.' then package.loaded[k] = nil end
  end
  _G.MP, _G.RMH_MP = nil, nil
  local root = (RMH_SPEC and RMH_SPEC.root) or ''
  local extra = root .. 'lib/balatro/lua/mp/?/init.lua'
  if not package.path:find(extra, 1, true) then package.path = extra .. ';' .. package.path end
  require 'rmh_mp.init'
  return _G.MP
end

local function add_content(MP)
  local R = MP.registry
  R.define({ key = 'j_mp_common', kind = 'Joker', rarity = 1 })
  R.define({ key = 'j_mp_uncommon', kind = 'Joker', rarity = 2 })
  R.define({ key = 'c_mp_tarot', kind = 'Tarot' })
  R.define({ key = 'c_mp_planet', kind = 'Planet', config = { hand_type = 'Flush' } })
  R.define({ key = 'c_mp_spectral', kind = 'Spectral' })
  R.define({ key = 'v_mp_voucher', kind = 'Voucher' })
  R.define({ key = 'tag_mp_tag', kind = 'Tag', tag = { config = { type = 'immediate' } } })
  R.define({ key = 'bl_mp_boss', kind = 'Blind', blind = { boss = { min = 1, max = 10 } } })
end

local function resolved()
  return {
    key = 'ruleset_mp_expanded', layers = { 'standard' }, multiplayerContent = true, banned = {}, bannedSilent = {},
    included = {}, reworked = {}, spectralBannedEnhancements = {}, stickers = {}, gameModifiers = {},
    startingParams = {}, setupHooks = {},
    flags = { theOrder = false, enemyLocationDisabled = false, comeback = 'default' },
    timer = { enabled = false, base = 0, increment = 0, forgiveness = 0, pvpHandIncrement = 0, mode = 'default',
      pressurePlusHand = 0, countdown = 3, mult = 1 },
  }
end

describe('golden-seed single-player isolation', function()
  after_each(function()
    if rawget(_G, 'MP') and MP.hooks then MP.hooks.remove_all() end
    V.uninstall()
  end)

  it('is identical before MP loads, after it loads, and after a mount/unmount cycle', function()
    V.install()
    local before_pools = pool_fingerprint()
    local g0 = goldens()
    local MP = boot_mp()
    add_content(MP)
    expect(goldens()).eq(g0)
    expect(pool_fingerprint()).eq(before_pools)

    MP.session.mount('match', { resolved = resolved(), options = { multiplayerJokers = true, theOrder = false },
      runId = 'r1', me = 'u1', seed = 'ABCD1234', deck = 'b_red', stake = 1 })
    local during = goldens()
    MP.session.unmount('test')

    expect(pool_fingerprint()).eq(before_pools)
    expect(MP.registry.leaked_keys()).eq({})
    expect(goldens()).eq(g0)
    -- Sensitivity: with MP content in the pools the same seeds do roll differently.
    local differs = false
    for i = 1, #g0 do if during[i] ~= g0[i] then differs = true end end
    expect(differs).truthy()
  end)

  it('leaves the profile unlock/discovery flags untouched by session rolls', function()
    V.install()
    local locked = {}
    for k, v in pairs(G.P_CENTERS) do if v.unlocked == false then locked[#locked + 1] = k end end
    table.sort(locked)
    expect(#locked > 0).truthy()
    local MP = boot_mp()
    MP.session.mount('practice', { resolved = resolved(), seed = 'ABCD1234', deck = 'b_red', stake = 1 })
    goldens()
    MP.session.unmount('test')
    local after = {}
    for k, v in pairs(G.P_CENTERS) do if v.unlocked == false then after[#after + 1] = k end end
    table.sort(after)
    expect(after).eq(locked)
  end)
end)

describe('OR-07 profile-independent pools', function()
  after_each(function()
    if rawget(_G, 'MP') and MP.hooks then MP.hooks.remove_all() end
    V.uninstall()
  end)

  it('vanilla rolls depend on the profile (the bug being fixed)', function()
    local meta = all_meta()
    V.install({ meta = {} })
    local fresh = goldens()
    V.install({ meta = meta })
    local veteran = goldens()
    local same = true
    for i = 1, #fresh do if fresh[i] ~= veteran[i] then same = false end end
    expect(same).falsy()
  end)

  it('session rolls are identical for a fresh and a fully unlocked profile', function()
    local meta = all_meta()
    local results = {}
    for i, m in ipairs({ {}, meta }) do
      V.install({ meta = m })
      local MP = boot_mp()
      MP.session.mount('match', { resolved = resolved(), options = { multiplayerJokers = true, theOrder = true },
        runId = 'r', me = 'u1', seed = 'ABCD1234', deck = 'b_red', stake = 1 })
      results[i] = goldens()
      MP.session.unmount('test')
      MP.hooks.remove_all()
      V.uninstall()
    end
    expect(results[1]).eq(results[2])
  end)
end)

describe('vanilla RNG facts', function()
  after_each(V.uninstall)

  it('FL-20: pseudoseed is deterministic while paused (no paused-RNG guard needed)', function()
    V.install()
    V.new_run('PAUSED01')
    G.SETTINGS.paused = false
    local a = { pseudoseed('Joker1sho1'), pseudoseed('boss'), pseudorandom('cdt1') }
    V.new_run('PAUSED01')
    G.SETTINGS.paused = true
    local b = { pseudoseed('Joker1sho1'), pseudoseed('boss'), pseudorandom('cdt1') }
    expect(b).eq(a)
  end)
end)

describe('The Order on real pools', function()
  local MP
  before_each(function()
    V.install()
    MP = boot_mp()
    local r = resolved()
    r.flags.theOrder = true
    MP.session.mount('match', { resolved = r, options = { theOrder = true }, runId = 'r', me = 'u1',
      seed = 'ABCD1234', deck = 'b_red', stake = 1 })
  end)
  after_each(function()
    MP.session.unmount('test')
    MP.hooks.remove_all()
    V.uninstall()
  end)

  it('OR-04: prefixes the seed once', function()
    expect(MP.order.seed('ABCD1234')).eq('*ABCD1234')
    expect(MP.order.seed('*ABCD1234')).eq('*ABCD1234')
  end)

  it('OR-01: the boss queue is per ante — extra boss polls in one ante do not shift the next', function()
    local function ante2_boss(polls_in_ante1)
      V.new_run('*ABCD1234')
      G.GAME.round_resets.ante = 1
      for _ = 1, polls_in_ante1 do get_new_boss() end       -- e.g. Director's Cut rerolls
      for k in pairs(G.GAME.bosses_used) do G.GAME.bosses_used[k] = 0 end
      G.GAME.round_resets.ante = 2
      return get_new_boss()
    end
    expect(ante2_boss(3)).eq(ante2_boss(1))
    expect(MP.order.rewrite('boss')).eq('boss2')
  end)

  it('OR-01: key rewrites', function()
    V.new_run('*ABCD1234')
    G.GAME.round_resets.ante = 3
    G.GAME.blind = { config = { blind = { key = 'bl_big' } } }
    G.GAME.blind_on_deck = 'Big'
    expect(MP.order.rewrite('halu3')).eq('halu0')
    expect(MP.order.rewrite('pack_generic3')).eq('pack_generic0')
    expect(MP.order.rewrite('cdt3')).eq('cdt0')
    expect(MP.order.rewrite('stdseal3')).eq('stdseal0')
    expect(MP.order.rewrite('nr3')).eq('nr3bl_bigBig')
    expect(MP.order.rewrite('cashout3')).eq('cashout3bl_bigBig')
    expect(MP.order.rewrite('Joker1sho3_resample7')).eq('Joker1sho3')
    expect(MP.order.rewrite('Joker1sho3_resample1001')).eq('Joker1sho3_resample1001')
    expect(MP.order.rewrite('Voucher_fromtag3_resample2')).eq('Voucher_fromtag3')
    expect(MP.order.rewrite('Joker1sho3')).eq('Joker1sho3')
    expect(MP.order.rewrite('edi3')).eq('edi3')
    -- the wrap applies them: polling 'halu3' advances the shared 'halu0' stream
    pseudoseed('halu3')
    expect(G.GAME.pseudorandom.halu0 ~= nil).truthy()
    expect(G.GAME.pseudorandom.halu3).eq(nil)
  end)

  it('OR-06: the Idol pick ignores the order of G.playing_cards', function()
    V.new_run('*ABCD1234')
    local function card(v, s, id) return { base = { value = v, suit = s, id = id }, ability = {} } end
    local deck = { card('Ace', 'Spades', 14), card('King', 'Hearts', 13), card('King', 'Hearts', 13), card('2', 'Clubs', 2) }
    G.GAME.current_round.idol_card = {}
    G.playing_cards = deck
    G.GAME.pseudorandom['idol1'] = nil
    reset_idol_card()
    local first = G.GAME.current_round.idol_card.rank .. G.GAME.current_round.idol_card.suit
    V.new_run('*ABCD1234')
    G.GAME.current_round.idol_card = {}
    G.playing_cards = { deck[4], deck[3], deck[1], deck[2] }
    reset_idol_card()
    expect(G.GAME.current_round.idol_card.rank .. G.GAME.current_round.idol_card.suit).eq(first)
  end)

  it('OR-03: poker-hand picks do not depend on array order', function()
    V.new_run('*ABCD1234')
    local a = pseudorandom_element({ 'Flush', 'Pair', 'Straight', 'High Card' }, pseudoseed('to_do'))
    V.new_run('*ABCD1234')
    local b = pseudorandom_element({ 'High Card', 'Straight', 'Flush', 'Pair' }, pseudoseed('to_do'))
    expect(a).eq(b)
  end)
end)

describe('MP blinds in the real vanilla boss code', function()
  local MP
  before_each(function()
    V.install()
    MP = boot_mp()
    MP.session.mount('match', { resolved = resolved(), options = { multiplayerJokers = true }, runId = 'r',
      me = 'u1', seed = 'ABCD1234', deck = 'b_red', stake = 1 })
  end)
  after_each(function()
    MP.session.unmount('test')
    MP.hooks.remove_all()
    V.uninstall()
  end)

  it('every MP blind carries a boss table that get_new_boss never rolls', function()
    local mp_blinds = 0
    for k, v in pairs(G.P_BLINDS) do
      if MP.registry.is_mp(k) then
        mp_blinds = mp_blinds + 1
        expect(type(v.boss)).eq('table')
        expect(v.boss.showdown).eq(false)
      end
    end
    expect(mp_blinds > 0).truthy()
    V.new_run('ABCD1234')
    for ante = 1, 24 do
      G.GAME.round_resets.ante = ante
      local boss = get_new_boss()
      expect(MP.registry.is_mp(boss)).falsy()
      expect(G.P_BLINDS[boss].boss ~= nil).truthy()
    end
  end)

  it('ease_background_colour_blind on the Nemesis blind uses its boss colour (no crash)', function()
    V.new_run('ABCD1234')
    local nemesis = G.P_BLINDS.bl_mp_nemesis
    local seen
    _G.ease_colour = function() end
    _G.ease_background_colour = function(args) seen = args end
    G.GAME.blind = { name = nemesis.name, change_colour = function() end }
    ease_background_colour_blind(G.STATES.SELECTING_HAND)
    expect(seen ~= nil).truthy()
    expect(seen.special_colour).eq(nemesis.boss_colour)
    expect(seen.contrast).eq(2)
  end)
end)

describe('Charm / Meteor Tag packs are seeded in a session (vanilla math.random(1, 2))', function()
  local MP
  local opened
  local function load_tags()
    local root = (RMH_SPEC and RMH_SPEC.root) or ''
    assert(loadfile(root .. 'data/balatro/tag.lua'))()
  end
  local function trigger(name)
    local events = {}
    G.E_MANAGER = { add_event = function(_, ev) events[#events + 1] = ev end }
    _G.Event = function(t) return t end
    _G.stop_use = function() end
    _G.attention_text = function() end
    _G.play_sound = function() end
    G.play = { T = { x = 0, y = 0, w = 1, h = 1 } }
    G.P_CARDS = { empty = {} }
    G.CARD_W, G.CARD_H = 2, 3
    G.CONTROLLER.locks = {}
    G.FUNCS.use_card = function() end
    _G.Card = function(_, _, _, _, _, center)
      opened[#opened + 1] = center and center.key
      return { start_materialize = function() end }
    end
    local tag = setmetatable({ name = name, ID = 1, HUD_tag = { states = {} }, ability = {}, config = { type = 'new_blind_choice' },
      remove = function() end }, { __index = Tag })
    tag:apply_to_run({ type = 'new_blind_choice' })
    for _, ev in ipairs(events) do if ev.func then ev.func() end end
  end
  local function packs(math_seed)
    V.new_run('ABCD1234')
    math.randomseed(math_seed) -- the unseeded generator is in a different state on every peer
    opened = {}
    for _ = 1, 8 do trigger('Charm Tag') end
    for _ = 1, 8 do trigger('Meteor Tag') end
    return table.concat(opened, ',')
  end

  before_each(function()
    V.install()
    load_tags()
    MP = boot_mp()
  end)
  after_each(function()
    if MP.state.session then MP.session.unmount('test') end
    MP.hooks.remove_all()
    V.uninstall()
  end)

  it('two peers (different math.random states) open the same packs; math.random is restored', function()
    local vanilla_random = math.random
    MP.session.mount('match', { resolved = resolved(), options = {}, runId = 'r', me = 'u1', seed = 'ABCD1234',
      deck = 'b_red', stake = 1 })
    local a = packs(1)
    local b = packs(987654)
    expect(a).eq(b)
    expect(#opened).eq(16)
    expect(a:find('p_arcana_mega_', 1, true) ~= nil).truthy()
    expect(a:find('p_celestial_mega_', 1, true) ~= nil).truthy()
    expect(G.GAME.pseudorandom.mp_tag_pack ~= nil).truthy()
    expect(math.random == vanilla_random).truthy()
  end)

  it('outside a session vanilla is untouched (no seeded stream)', function()
    packs(1)
    expect(#opened).eq(16)
    expect(G.GAME.pseudorandom.mp_tag_pack).eq(nil)
  end)
end)

describe('chip_cap and shrinking_hand on the real vanilla code (EX-18 lifted)', function()
  local MP
  before_each(function()
    V.install()
    MP = boot_mp()
  end)
  after_each(function()
    if MP.state.session then MP.session.unmount('test') end
    MP.hooks.remove_all()
    V.uninstall()
  end)

  it('the layers\' modifiers drive vanilla mod_chips and the hand-size poll', function()
    local r = resolved()
    r.layers = { 'standard', 'chip_cap', 'shrinking_hand' }
    r.gameModifiers = { chips_dollar_cap = true, minus_hand_size_per_X_dollar = 10 }
    MP.session.mount('match', { resolved = r, options = {}, runId = 'r', me = 'u1', seed = 'ABCD1234',
      deck = 'b_red', stake = 1 })
    V.new_run('ABCD1234')
    MP.session.pre_roll()
    G.GAME.dollars = 23
    expect(mod_chips(500)).eq(23)                     -- chips capped at the money held
    G.GAME.dollars = -5
    expect(mod_chips(500)).eq(0)
    -- CardArea:update (cardarea.lua) on G.hand: -1 hand size per $10 held
    local root = (RMH_SPEC and RMH_SPEC.root) or ''
    assert(loadfile(root .. 'data/balatro/engine/node.lua'))()
    assert(loadfile(root .. 'data/balatro/engine/moveable.lua'))()
    assert(loadfile(root .. 'data/balatro/cardarea.lua'))()
    local sizes = {}
    local hand = setmetatable({ config = { card_limit = 8 }, cards = {}, highlighted = {} }, { __index = CardArea })
    hand.change_size = function(self, d) self.config.card_limit = self.config.card_limit + d; sizes[#sizes + 1] = d end
    G.hand = hand
    G.CONTROLLER.HID = { controller = false }
    G.GAME.dollars = 34
    CardArea.update(hand, 0)
    expect(hand.config.card_limit).eq(5)
    G.GAME.dollars = 12
    CardArea.update(hand, 0)
    expect(hand.config.card_limit).eq(7)
    expect(sizes).eq({ -3, 2 })
  end)
end)

describe('no_uncommons on the real vanilla pool code (EX-18 lifted)', function()
  local MP
  before_each(function()
    V.install()
    MP = boot_mp()
  end)
  after_each(function()
    if MP.state.session then MP.session.unmount('test') end
    MP.hooks.remove_all()
    V.uninstall()
  end)

  local function mount(layers, banned)
    local r = resolved()
    r.layers = layers
    r.setupHooks = {}
    for _, l in ipairs(layers) do if l == 'no_uncommons' then r.setupHooks = { 'no_uncommons' } end end
    r.banned = banned or {}
    MP.session.mount('match', { resolved = r, options = {}, runId = 'r', me = 'u1', seed = 'ABCD1234',
      deck = 'b_red', stake = 1 })
  end

  local function shop_jokers(seed, n)
    V.new_run(seed)
    MP.session.pre_roll()
    local out = {}
    for i = 1, n do out[i] = V.roll('Joker', 'sho') end
    return out
  end

  local function rarities(cards)
    local count = { 0, 0, 0, 0 }
    for _, k in ipairs(cards) do
      local r = G.P_CENTERS[k].rarity
      count[r] = count[r] + 1
    end
    return count
  end

  it('vanilla (layer off) rolls Uncommons; with the layer they become Commons, Rares stay', function()
    mount({ 'standard' })
    local off = rarities(shop_jokers('ABCD1234', 300))
    MP.session.unmount('test')
    mount({ 'standard', 'no_uncommons' }, { 'tag_uncommon' })
    local on = rarities(shop_jokers('ABCD1234', 300))
    expect(off[2] > 0).eq(true)
    expect(on[2]).eq(0)
    expect(on[1]).eq(off[1] + off[2])  -- every Uncommon roll became a Common
    expect(on[3]).eq(off[3])           -- the rarity stream stays in step: Rares fall on the same rolls
    expect(on[4]).eq(0)
  end)

  it('is deterministic across peers: the same seed gives the same jokers', function()
    mount({ 'no_uncommons' }, { 'tag_uncommon' })
    local a = shop_jokers('K7Q2M4P8', 120)
    local b = shop_jokers('K7Q2M4P8', 120)
    expect(a).eq(b)
  end)

  it('remaps an explicit Uncommon roll (the Uncommon Tag 0.9) and leaves Rare and Legendary alone', function()
    mount({ 'no_uncommons' }, { 'tag_uncommon' })
    V.new_run('ABCD1234')
    MP.session.pre_roll()
    -- The pool key (rarity, append, ante) names the stream the card is drawn from.
    local _, key = get_current_pool('Joker', 0.9, nil, 'uta')
    expect(key).eq('Joker1uta1')
    _, key = get_current_pool('Joker', 0.99, nil, 'wra')
    expect(key).eq('Joker3wra1')
    _, key = get_current_pool('Joker', nil, true, 'sou')
    expect(key:sub(1, 6)).eq('Joker4')
    _, key = get_current_pool('Tarot', nil, nil, 'ar1')
    expect(key).eq('Tarotar11')
    expect(MP.misc.no_uncommons_roll(0.7)).eq(0.7)
    expect(MP.misc.no_uncommons_roll(0.7000001)).eq(0)
    expect(MP.misc.no_uncommons_roll(0.95)).eq(0)
    expect(MP.misc.no_uncommons_roll(0.9500001)).eq(0.9500001)
  end)

  it('the bundle ban keeps the Uncommon Tag out of the real tag rolls', function()
    mount({ 'no_uncommons' }, { 'tag_uncommon' })
    V.new_run('ZZZZ9999')
    MP.session.pre_roll()
    expect(G.GAME.banned_keys.tag_uncommon).eq(true)
    for ante = 1, 8 do
      G.GAME.round_resets.ante = ante
      for _ = 1, 20 do expect(get_next_tag_key() ~= 'tag_uncommon').eq(true) end
    end
  end)
end)

describe('the Glass cycle on the real m_glass center (EX-18 lifted)', function()
  local MP
  before_each(function()
    V.install()
    MP = boot_mp()
  end)
  after_each(function()
    if MP.state.session then MP.session.unmount('test') end
    MP.hooks.remove_all()
    V.uninstall()
  end)

  local function glass_with(layers, banned)
    local r = resolved()
    r.layers = layers
    r.banned = banned or {}
    MP.session.mount('match', { resolved = r, options = {}, runId = 'r', me = 'u1', seed = 'ABCD1234',
      deck = 'b_red', stake = 1 })
    local c = G.P_CENTERS.m_glass.config
    local out = { c.Xmult, c.extra, c.mp_balanced == true }
    MP.session.unmount('test')
    return out
  end

  it('vanilla Glass is X2, 1 in 4 and comes back exactly after every unmount', function()
    expect(glass_with({})).eq({ 2, 4, false })
    expect(glass_with({ 'standard' })).eq({ 1.5, 4, true })
    expect(glass_with({ 'sandbox' })).eq({ 1.5, 3, true })
    expect({ G.P_CENTERS.m_glass.config.Xmult, G.P_CENTERS.m_glass.config.extra }).eq({ 2, 4 })
  end)

  it('glass_vanilla undoes the ruleset rework', function()
    expect(glass_with({ 'standard', 'glass_vanilla' })).eq({ 2, 4, false })
    expect(glass_with({ 'standard', 'sandbox', 'glass_vanilla' })).eq({ 2, 4, false })
  end)

  it('glass_standard and glass_legacy give the standard rework under any ruleset', function()
    for _, g in ipairs({ 'glass_standard', 'glass_legacy' }) do
      expect(glass_with({ g })).eq({ 1.5, 4, true })
      expect(glass_with({ 'sandbox', g })).eq({ 1.5, 4, true })  -- not Sandbox's 1 in 3
      expect(glass_with({ 'experimental', g })).eq({ 1.5, 4, true })
    end
  end)

  it('glass_experimental mounts no rework (its bundle bans Glass)', function()
    expect(glass_with({ 'standard', 'glass_experimental' }, { 'm_glass', 'c_justice' })).eq({ 2, 4, false })
    local E = MP.content.enhancements
    expect(E.glass_variant({ layers = { 'standard', 'glass_legacy' } })).eq('glass_legacy')
    expect(E.glass_variant({ layers = { 'standard' } })).eq(nil)
  end)
end)
