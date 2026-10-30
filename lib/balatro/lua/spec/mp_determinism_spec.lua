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
