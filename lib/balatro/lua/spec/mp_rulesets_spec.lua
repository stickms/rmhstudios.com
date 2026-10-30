-- M1 fix 5: apply every REAL ResolvedRuleset bundle (WS4 resolveRuleset output, kept fresh by
-- lib/balatro/mp/__tests__/rulesets-lua-fixture.test.ts) with fake_g and check the WS4
-- conventions: dot-path gameModifiers are nested tables, `mp_` keys are layer-hook params (not
-- modifiers), setupHooks alone decides which layer hooks run and in what order, the MP-content
-- pool gate is resolved.multiplayerContent && options.multiplayerJokers, and the trap packs are
-- banned unless `traps` is in the chain.

local H = require 'spec.mp_helper'
local J = require 'rmh/json'

local function load_fixture()
  local root = (RMH_SPEC and RMH_SPEC.root) or ''
  local f = assert(io.open(root .. 'lib/balatro/mp/__fixtures__/rulesets-resolved.json', 'rb'))
  local text = f:read('*a')
  f:close()
  return J.decode(text)
end

local FIX = load_fixture()
local NAMES = {}
for name in pairs(FIX) do NAMES[#NAMES + 1] = name end
table.sort(NAMES)

local TRAP_PACKS = { 'p_mp_trap_normal', 'p_mp_trap_jumbo' }

local function has(list, x)
  for _, v in ipairs(list or {}) do if v == x then return true end end
  return false
end

local function boot()
  local MP = H.boot()
  G.GAME.shop = { joker_max = 2 }
  G.GAME.starting_params.ante_scaling = 1
  return MP
end

local function mount(MP, case, seed)
  return MP.session.mount('match', { resolved = case.resolved, options = case.options, runId = 'r1', me = 'u1',
    seed = seed or 'RULESET1', deck = 'b_red', stake = 1 })
end

describe('real ResolvedRuleset bundles (WS4) applied by the Lua core', function()
  local MP
  before_each(function() MP = boot() end)
  after_each(H.teardown)

  it('the fixture covers every ruleset plus the advanced/trap/practice variants', function()
    expect(#NAMES >= 19).truthy()
    expect(FIX['ruleset_mp_balanced'] ~= nil and FIX['balanced+traps+advanced'] ~= nil).truthy()
  end)

  for _, name in ipairs(NAMES) do
    local case = FIX[name]

    it(name .. ': bans, gameModifiers (dot paths, mp_ params) and the trap-pack rule', function()
      mount(MP, case)
      MP.session.pre_roll()
      local r, b, m = case.resolved, G.GAME.banned_keys, G.GAME.modifiers
      for _, k in ipairs(r.banned) do if not b[k] then error('not banned: ' .. k) end end
      for _, k in ipairs(r.bannedSilent) do if not b[k] then error('not silently banned: ' .. k) end end
      local traps = has(r.layers, 'traps')
      for _, k in ipairs(TRAP_PACKS) do
        expect(b[k] == true).eq(not traps)
      end
      for k, v in pairs(r.gameModifiers) do
        if k:sub(1, 3) == 'mp_' then
          expect(m[k]).eq(nil)                      -- a layer param, never a modifier
          expect(MP.layer_param(k)).eq(v)
        elseif k:find('.', 1, true) then
          local outer, inner = k:match('^([^.]+)%.(.+)$')
          expect(type(m[outer])).eq('table')
          expect(m[outer][inner]).eq(v)
          expect(m[k]).eq(nil)                      -- never a flat dotted key
        else
          expect(m[k]).eq(v)
        end
      end
      MP.session.unmount('t')
    end)

    it(name .. ': layer hooks run exactly in setupHooks order', function()
      local ran = {}
      for _, l in ipairs(case.resolved.layers) do
        MP.rules.layer_hook(l, function() ran[#ran + 1] = l end)
      end
      mount(MP, case)
      MP.session.pre_roll()
      expect(ran).eq(case.resolved.setupHooks)
      MP.session.unmount('t')
    end)

    it(name .. ': MP-content pool gate = multiplayerContent && options.multiplayerJokers', function()
      local sess = mount(MP, case)
      local def = { key = 'j_mp_gate_probe', kind = 'Joker' }      -- default { isolation = true }
      expect(MP.registry.gate_open(def, case.resolved, sess)).eq(case.mpContentPooled)
      MP.session.unmount('t')
    end)
  end
end)

describe('real bundles: the layer effects', function()
  local MP
  before_each(function() MP = boot() end)
  after_each(H.teardown)

  it('experimental: params drive +1 shop slot, x1.15 blinds, +$1 reroll steps', function()
    mount(MP, FIX.ruleset_mp_experimental, 'EXP00001')
    MP.session.run_seed = 'EXP00001'
    MP.session.pre_roll()
    expect(G.GAME.shop.joker_max).eq(3)
    expect(G.GAME.starting_params.ante_scaling).near(1.15)
    expect(G.GAME.modifiers.mp_reroll_extra).eq(1)
    MP.session.unmount('t')
  end)

  it('experimental + bigger_shop: each layer adds its own shop slot', function()
    mount(MP, FIX['experimental+bigger_shop'])
    MP.session.pre_roll()
    expect(G.GAME.shop.joker_max).eq(4)
    MP.session.unmount('t')
  end)

  it('experimental params are read from the bundle, not hard-coded', function()
    local case = FIX.ruleset_mp_experimental
    local res = MP.copy(case.resolved, true)
    res.gameModifiers.mp_shop_slots_bonus = 2
    res.gameModifiers.mp_ante_scaling_mult = 2
    res.gameModifiers.mp_reroll_increment_bonus = 3
    res.gameModifiers.mp_sticker_chance = 1          -- every family on
    mount(MP, { resolved = res, options = case.options })
    MP.session.pre_roll()
    expect(G.GAME.shop.joker_max).eq(4)
    expect(G.GAME.starting_params.ante_scaling).near(2)
    expect(G.GAME.modifiers.mp_reroll_extra).eq(3)
    for _, fam in ipairs(MP.experimental.STICKERS) do expect(G.GAME.modifiers['mp_sticker_' .. fam]).eq(true) end
    MP.session.unmount('t')
  end)

  it('advanced modifier layers: vanilla modifiers via gameModifiers, mp_ params via MP.layer_param', function()
    mount(MP, FIX['balanced+traps+advanced'])
    MP.session.pre_roll()
    local m = G.GAME.modifiers
    expect(m.no_blind_reward).eq({ Small = true, Big = true })
    expect(m.inflation).eq(true)
    expect(m.no_interest).eq(true)
    expect(m.discard_cost).eq(1)
    expect(m.money_per_discard).eq(1)
    expect(m.booster_ante_scaling).eq(true)
    expect(m.flipped_cards).eq(4)
    expect(m.debuff_played_cards).eq(true)
    expect(m.all_eternal).eq(true)
    expect(m.chips_dollar_cap).eq(true)               -- chip_cap (vanilla mod_chips)
    expect(m.minus_hand_size_per_X_dollar).eq(10)     -- shrinking_hand (vanilla CardArea:update)
    expect(G.GAME.shop.joker_max).eq(3)              -- bigger_shop
    expect({ MP.misc.glass_cannon(30, 4) }).eq({ 30, 16 })
    expect(MP.layer_param('mp_eeeee_chance')).eq(0.4)
    expect(MP.layer_param('mp_shared_slots')).eq(15)
    expect(G.GAME.banned_keys.p_mp_trap_normal).eq(nil)
    MP.session.unmount('t')
  end)

  it('glass_cannon follows mp_glass_cannon_xmult', function()
    local res = MP.copy(FIX['balanced+traps+advanced'].resolved, true)
    res.gameModifiers.mp_glass_cannon_xmult = 3
    mount(MP, { resolved = res, options = FIX['balanced+traps+advanced'].options })
    expect({ MP.misc.glass_cannon(30, 4) }).eq({ 30, 12 })
    MP.session.unmount('t')
    expect({ MP.misc.glass_cannon(30, 4) }).eq({ 30, 16 })  -- fallback outside a session
  end)

  it('smallworld: the cull fraction comes from mp_smallworld_cull', function()
    local case = FIX.ruleset_mp_smallworld
    expect(case.resolved.gameModifiers.mp_smallworld_cull).eq(0.75)
    local res = MP.copy(case.resolved, true)
    res.gameModifiers.mp_smallworld_cull = 0
    mount(MP, { resolved = res, options = case.options })
    expect(#MP.smallworld.cull({})).eq(0)
    MP.session.unmount('t')
  end)

  it('a registered hook for an active layer that setupHooks does not list is not run', function()
    local ran = false
    MP.rules.layer_hook('standard', function() ran = true end)
    mount(MP, FIX.ruleset_mp_balanced)
    MP.session.pre_roll()
    expect(ran).eq(false)
    MP.session.unmount('t')
  end)

  it('practice_start (no options on the wire) keeps MP content pooled like the TS practice bundle', function()
    local case = FIX['practice-balanced']
    expect(case.mpContentPooled).eq(true)
    local handler = MP.net.handlers and MP.net.handlers.practice_start
    expect(type(handler)).eq('function')
    MP.net.defer = function() end                   -- no launch in this spec
    handler({ resolved = case.resolved, deck = 'b_red', stake = 1, seed = 'PRAC0001' })
    local sess = MP.state.session
    expect(MP.registry.gate_open({ key = 'j_mp_gate_probe', kind = 'Joker' }, sess.resolved, sess)).eq(true)
    MP.session.unmount('t')
  end)
end)
