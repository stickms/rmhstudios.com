-- WS6 rules: resolved-bundle application, Small World cull, experimental, misc layers, stakes,
-- comeback formulas.

local H = require 'spec.mp_helper'
local V = require 'spec.mp_vanilla'

local function boot_on_vanilla(meta)
  V.install({ meta = meta })
  for k in pairs(package.loaded) do if k:sub(1, 7) == 'rmh_mp.' then package.loaded[k] = nil end end
  _G.MP, _G.RMH_MP = nil, nil
  local root = (RMH_SPEC and RMH_SPEC.root) or ''
  local extra = root .. 'lib/balatro/lua/mp/?/init.lua'
  if not package.path:find(extra, 1, true) then package.path = extra .. ';' .. package.path end
  require 'rmh_mp.init'
  return _G.MP
end

local function teardown_vanilla()
  if rawget(_G, 'MP') and MP.hooks then MP.hooks.remove_all() end
  V.uninstall()
end

describe('Small World cull (real pools)', function()
  local MP
  before_each(function()
    MP = boot_on_vanilla()
    V.new_run('SMALLW01')
  end)
  after_each(teardown_vanilla)

  local function members(list, banned)
    local n = 0
    for _, v in ipairs(list) do
      if not banned[v.key] and not v.hidden and v.key ~= 'j_cavendish'
        and not (v.set == 'Voucher' and v.requires and #v.requires > 0) then n = n + 1 end
    end
    return n
  end

  it('bans round(75%) of each group (vouchers one fewer), skipping already-banned keys', function()
    G.GAME.banned_keys.j_joker = true -- pre-banned: not a member
    local counts = {}
    for _, g in ipairs(MP.smallworld.groups()) do counts[g.name] = { list = g.list, n = members(g.list, G.GAME.banned_keys) } end
    local pre = {}
    for k in pairs(G.GAME.banned_keys) do pre[k] = true end
    MP.smallworld.cull()
    for name, c in pairs(counts) do
      local banned = 0
      for _, v in ipairs(c.list) do
        if G.GAME.banned_keys[v.key] and not pre[v.key] and v.key ~= 'j_cavendish'
          and not (v.set == 'Voucher' and v.requires and #v.requires > 0) then banned = banned + 1 end
      end
      local want = math.floor(0.75 * c.n + 0.5)
      if name == 'Voucher' then want = math.max(0, want - 1) end
      if banned ~= want then error(name .. ': banned ' .. banned .. ', want ' .. want) end
    end
  end)

  it('ties Cavendish to Gros Michel and upgrade vouchers to their base', function()
    for _, seed in ipairs({ 'A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8' }) do
      V.new_run(seed)
      MP.smallworld.cull()
      local b = G.GAME.banned_keys
      expect(b.j_cavendish == true).eq(b.j_gros_michel == true)
      for _, v in ipairs(G.P_CENTER_POOLS.Voucher) do
        for _, req in ipairs(v.requires or {}) do
          if b[req] then expect(b[v.key]).eq(true) end
        end
      end
    end
  end)

  it('is a pure function of the seed (identical digest on every peer)', function()
    V.new_run('PEER0001'); MP.smallworld.cull()
    local a = MP.smallworld.digest()
    V.new_run('PEER0001'); MP.smallworld.cull()
    expect(MP.smallworld.digest()).eq(a)
    V.new_run('PEER0002'); MP.smallworld.cull()
    expect(MP.smallworld.digest() ~= a).truthy()
  end)

  it('runs once per run even if the layer is listed twice; only setupHooks decides', function()
    local calls = 0
    MP.rules.layer_hook('twice', function() calls = calls + 1 end)
    local order = MP.session.hook_order({ setupHooks = { 'twice', 'twice' }, layers = { 'twice', 'smallworld' } })
    expect(order).eq({ 'twice' })   -- smallworld is active but unlisted: WS4 lists every hooked layer
  end)
end)

describe('resolved bundle application (pre-roll)', function()
  local MP
  before_each(function()
    MP = H.fresh()
    for _, m in ipairs({ 'rmh_mp.rules.attrition', 'rmh_mp.rules.order', 'rmh_mp.rules.smallworld',
      'rmh_mp.rules.stakes_apply', 'rmh_mp.rules.experimental', 'rmh_mp.rules.misc_layers',
      'rmh_mp.hooks.saves', 'rmh_mp.rules.session' }) do require(m) end
    MP.experimental.register(MP.rules)
    MP.misc.register(MP.rules)
    G.GAME.shop = { joker_max = 2 }
    G.GAME.starting_params.ante_scaling = 1
  end)
  after_each(H.teardown)

  local function mount(res, extra)
    local info = { resolved = res, options = H.options(), runId = 'r', me = 'u1', seed = 'APPLY001', deck = 'b_red', stake = 1 }
    for k, v in pairs(extra or {}) do info[k] = v end
    return MP.session.mount('match', info)
  end

  it('bans the union of loud, silent, Attrition and ban-source keys', function()
    mount(H.resolved({ banned = { 'c_justice' }, bannedSilent = { 'j_hanging_chad' } }))
    MP.session.pre_roll()
    local b = G.GAME.banned_keys
    expect(b.c_justice and b.j_hanging_chad and b.j_mr_bones and b.v_hieroglyph and b.tag_boss and b.bl_wall
      and b.bl_final_vessel).eq(true)
    expect(b.p_mp_trap_normal).eq(true)        -- no traps layer
    MP.session.unmount('t')
    mount(H.resolved({ layers = { 'traps' } }))
    G.GAME.banned_keys = {}
    MP.session.pre_roll()
    expect(G.GAME.banned_keys.p_mp_trap_normal).eq(nil)
    MP.session.unmount('t')
  end)

  it('merges gameModifiers, the MP stake and startingParams', function()
    _G.get_starting_params = function() return { hands = 4, discards = 3, dollars = 4 } end
    mount(H.resolved({ gameModifiers = { inflation = true, discard_cost = 1 }, startingParams = { hands = 3 } }),
      { mpStake = 'spectral' })
    MP.session.pre_roll()
    local m = G.GAME.modifiers
    expect(m.inflation).eq(true)
    expect(m.discard_cost).eq(1)
    expect(m.scaling).eq(4)
    expect(m.enable_rentals_in_shop).eq(true)
    expect(m.no_blind_reward.Small).eq(true)
    expect(get_starting_params()).eq({ hands = 3, discards = 3, dollars = 4 })
    MP.session.unmount('t')
    expect(get_starting_params()).eq({ hands = 4, discards = 3, dollars = 4 })
    _G.get_starting_params = nil
  end)

  it('runs layer hooks in setupHooks order only, with the run seed in effect', function()
    local seen = {}
    MP.rules.layer_hook('alpha', function(ctx) seen[#seen + 1] = 'alpha:' .. ctx.seed end)
    MP.rules.layer_hook('beta', function() seen[#seen + 1] = 'beta' end)
    MP.rules.layer_hook('gamma', function() error('content bug') end)
    mount(H.resolved({ setupHooks = { 'beta', 'alpha' }, layers = { 'gamma', 'alpha', 'zeta' } }))
    MP.session.run_seed = '*APPLY001'
    MP.session.pre_roll()
    expect(seen).eq({ 'beta', 'alpha:*APPLY001' })
    expect(G.GAME.pseudorandom.seed).eq('*APPLY001')
    MP.session.unmount('t')
  end)

  it('experimental: +1 shop slot, ×1.15 blinds, +$1 reroll steps, seeded 1/3 stickers', function()
    local EXP = { layers = { 'experimental' }, setupHooks = { 'experimental' }, gameModifiers = {
      mp_shop_slots_bonus = 1, mp_ante_scaling_mult = 1.15, mp_reroll_increment_bonus = 1, mp_sticker_chance = 1 / 3 } }
    mount(H.resolved(EXP))
    MP.session.run_seed = 'EXP00001'
    MP.session.pre_roll()
    expect(G.GAME.shop.joker_max).eq(3)
    expect(G.GAME.starting_params.ante_scaling).near(1.15)
    local first = {}
    for _, f in ipairs(MP.experimental.STICKERS) do first[f] = G.GAME.modifiers['mp_sticker_' .. f] or false end
    -- reroll increment
    _G.calculate_reroll_cost = function(skip)
      local cr = G.GAME.current_round
      if not skip then cr.reroll_cost_increase = (cr.reroll_cost_increase or 0) + 1 end
      cr.reroll_cost = 5 + cr.reroll_cost_increase
    end
    MP.experimental.install()
    G.GAME.current_round.free_rerolls = 0
    G.GAME.current_round.reroll_cost_increase = 0
    calculate_reroll_cost()
    expect(G.GAME.current_round.reroll_cost).eq(7)
    calculate_reroll_cost(true)
    expect(G.GAME.current_round.reroll_cost).eq(7)
    MP.session.unmount('t')
    _G.calculate_reroll_cost = nil
    -- same seed, same stickers
    G.GAME = H.fake.install().GAME
    G.GAME.shop = { joker_max = 2 }
    G.GAME.starting_params.ante_scaling = 1
    mount(H.resolved(EXP))
    MP.session.run_seed = 'EXP00001'
    MP.session.pre_roll()
    for _, f in ipairs(MP.experimental.STICKERS) do
      expect(G.GAME.modifiers['mp_sticker_' .. f] or false).eq(first[f])
    end
    MP.session.unmount('t')
  end)

  it('modifier layers map to the vanilla modifiers through gameModifiers (D-39, dot paths)', function()
    mount(H.resolved({ layers = { 'spartan', 'frugal', 'pricey_packs', 'bigger_shop' }, setupHooks = { 'bigger_shop' },
      gameModifiers = { ['no_blind_reward.Small'] = true, ['no_blind_reward.Big'] = true, money_per_discard = 1,
        booster_ante_scaling = true, mp_shop_slots_bonus = 1 } }))
    MP.session.pre_roll()
    local m = G.GAME.modifiers
    expect(m.no_blind_reward).eq({ Small = true, Big = true })
    expect(m.money_per_discard).eq(1)
    expect(m.booster_ante_scaling).eq(true)
    expect(G.GAME.shop.joker_max).eq(3)
    MP.session.unmount('t')
  end)
end)

describe('misc layers and stakes', function()
  local MP
  before_each(function()
    MP = H.fresh()
    require 'rmh_mp.rules.misc_layers'
    require 'rmh_mp.rules.stakes_apply'
  end)
  after_each(H.teardown)

  it('score_instability is exactly as coded (D-03) and glass_cannon is ×4 mult', function()
    expect({ MP.misc.score_instability(100, 10) }).eq({ 109, 1, 9 })   -- d = min(90, 9)
    expect({ MP.misc.score_instability(10, 100) }).eq({ 0, 110, -10 })  -- d = max(-90, -10)
    expect({ MP.misc.score_instability(5, 5) }).eq({ 5, 5, 0 })
    expect({ MP.misc.glass_cannon(30, 4) }).eq({ 30, 16 })
  end)

  it('generic blind scaling for MP stakes grows with the scale and the ante', function()
    local s = MP.stakes
    expect(s.generic_amount(0, 4)).eq(100)
    expect(s.generic_amount(1, 4)).eq(300)
    local prev = 0
    for ante = 1, 12 do
      local a = s.generic_amount(ante, 4)
      if a <= prev then error('not increasing at ante ' .. ante) end
      prev = a
      expect(s.generic_amount(ante, 5) >= a).truthy()
    end
    expect(s.generic_amount(8, 4) > 200000).truthy()  -- above vanilla scaling 3's 200000
  end)

  it('eeeee freezes ~40% of streams per ante, deterministically', function()
    MP.state.session = { kind = 'match', resolved = H.resolved({ layers = { 'eeeee' } }) }
    MP.mounted = true
    MP.misc.install()
    local frozen, total = 0, 0
    for i = 1, 200 do
      local k = 'key' .. i
      local a, b = pseudoseed(k), pseudoseed(k)
      total = total + 1
      if a == b then frozen = frozen + 1 end
    end
    expect(frozen > 50 and frozen < 110).truthy()
    MP.hooks.remove_group('session')
  end)

  it('no_red_seals turns a Red seal into a no-op', function()
    _G.Card = { set_seal = function(self, s) self.seal = s end }
    MP.state.session = { kind = 'match', resolved = H.resolved({ layers = { 'no_red_seals' } }) }
    MP.mounted = true
    MP.misc.install()
    local c = { seal = 'Gold' }
    Card.set_seal(c, 'Red')
    expect(c.seal).eq('Gold')
    Card.set_seal(c, 'Blue')
    expect(c.seal).eq('Blue')
    MP.hooks.remove_group('session')
    _G.Card = nil
  end)
end)

describe('comeback bonus (FL-17, D-04)', function()
  local MP
  before_each(function()
    MP = H.fresh()
    require 'rmh_mp.hooks.economy'
    MP.state.session = { kind = 'match', resolved = H.resolved(), options = H.options() }
    MP.mounted = true
  end)
  after_each(H.teardown)

  it('arms only on a decrease and pays by ruleset', function()
    local E = MP.economy
    E.on_my_lives(4, 5)
    expect(MP.state.comeback.armed).eq(false)
    E.on_my_lives(4, 3)
    expect(MP.state.comeback.armed).eq(true)
    expect(MP.state.comeback.count).eq(1)
    G.GAME.stake = 1
    expect(E.comeback_amount()).eq(4)
    G.GAME.stake = 6
    expect(E.comeback_amount()).eq(2)
    E.on_my_lives(3, 1)
    MP.state.session.resolved.flags.comeback = 'majorleague'
    expect(E.comeback_amount()).eq(4 * 3)
    MP.state.session.resolved.flags.comeback = 'sandbox'
    G.GAME.round_resets.ante = 5
    expect(E.comeback_amount()).eq(12)
  end)

  it('does not arm when gold_on_life_loss is off', function()
    MP.state.session.options.goldOnLifeLoss = false
    MP.economy.on_my_lives(4, 3)
    expect(MP.state.comeback.armed).eq(false)
    expect(MP.state.comeback.total_lost).eq(1)
  end)

  it('adds the comeback row before the bottom row and pays it once', function()
    local rows = {}
    _G.add_round_eval_row = function(c) rows[#rows + 1] = { name = c.name, dollars = c.dollars } end
    G.FUNCS.evaluate_round = function() end
    G.FUNCS.toggle_shop, G.FUNCS.reroll_shop = function() end, function() end
    MP.economy.install()
    MP.economy.on_my_lives(2, 1)
    add_round_eval_row({ name = 'blind1', dollars = 5 })
    add_round_eval_row({ name = 'bottom', dollars = 9 })
    add_round_eval_row({ name = 'bottom', dollars = 3 })
    expect(rows).eq({ { name = 'blind1', dollars = 5 }, { name = 'mp_comeback', dollars = 4 },
      { name = 'bottom', dollars = 13 }, { name = 'bottom', dollars = 3 } })
    local left = {}
    expect(MP.eval_row_label({ name = 'mp_comeback' }, left, 1, 4)).eq(true)
    expect(#left).eq(1)
    expect(MP.eval_row_label({ name = 'hands' }, left, 1, 4)).eq(false)
    MP.hooks.remove_group('session')
    _G.add_round_eval_row = nil
  end)
end)
