-- The rest of what the mod defines but never enables, now native and opt-in (L1):
--   * the 7 alt stakes (EX-16): lobby mpStake values, applied on the real G.GAME of
--     data/balatro (real get_blind_amount, calculate_reroll_cost, init_game_object)
--   * mp_sticker_nemesis (EX-17): the Advanced layer `nemesis_sticker`
--   * the Judgement rework: the Advanced layer `judgement_rework`, on the real pools and RNG under
--     The Order
-- Off by default: with no mpStake and no Advanced layer, nothing here changes a run.

local V = require 'spec.mp_vanilla'
local J = require 'rmh/json'

local ROOT = (RMH_SPEC and RMH_SPEC.root) or ''
local function read(path)
  local f = assert(io.open(ROOT .. path, 'rb'), path)
  local s = f:read('*a')
  f:close()
  return s
end
local RESOLVED = J.decode(read('lib/balatro/mp/__fixtures__/rulesets-resolved.json'))

local function boot_mp()
  for k in pairs(package.loaded) do
    if k:sub(1, 7) == 'rmh_mp.' then package.loaded[k] = nil end
  end
  _G.MP, _G.RMH_MP = nil, nil
  local extra = ROOT .. 'lib/balatro/lua/mp/?/init.lua'
  if not package.path:find(extra, 1, true) then package.path = extra .. ';' .. package.path end
  require 'rmh_mp.init'
  return _G.MP
end

local MP
local rows

local function setup()
  V.install()
  rows = {}
  -- What vanilla's round evaluation does with interest (state_events.lua evaluate_round): an
  -- 'interest' row when the player holds $5+ and interest is on, then 'bottom'.
  G.FUNCS.evaluate_round = function()
    local g = G.GAME
    if g.dollars >= 5 and not g.modifiers.no_interest then
      add_round_eval_row({ name = 'interest', dollars = g.interest_amount * math.min(math.floor(g.dollars / 5), g.interest_cap / 5) })
    end
    add_round_eval_row({ name = 'bottom', dollars = 0 })
  end
  _G.add_round_eval_row = function(cfg) rows[#rows + 1] = cfg end
  MP = boot_mp()
end

local function teardown()
  if MP.state.session then MP.session.unmount('test') end
  MP.hooks.remove_all()
  _G.add_round_eval_row = nil
  V.uninstall()
end

local function mount(ruleset, over)
  local case = RESOLVED[ruleset]
  local info = { resolved = case.resolved, options = case.options, runId = 'r1', me = 'u1', seed = 'OPT00001',
    deck = 'b_red', stake = 1 }
  for k, v in pairs(over or {}) do info[k] = v end
  MP.session.mount('match', info)
end

--- A real G.GAME at `stake` with vanilla's stake modifiers (game.lua start_run, core patches).
local function run_at(stake)
  local g = V.new_run('OPT00001')
  g.stake = stake
  if stake >= 2 then g.modifiers.no_blind_reward = { Small = true } end
  if stake >= 3 then g.modifiers.scaling = 2 end
  if stake >= 4 then g.modifiers.enable_eternals_in_shop = true end
  if stake >= 6 then g.modifiers.scaling = 3 end
  if stake >= 7 then g.modifiers.enable_perishables_in_shop = true end
  if stake >= 8 then g.modifiers.enable_rentals_in_shop = true end
  g.current_round.free_rerolls = 0
  return g
end

-- ── Alt stakes ──────────────────────────────────────────────────────────────

describe('EX-16 alt stakes: lobby values and their run-start modifiers', function()
  before_each(setup)
  after_each(teardown)

  local CHAIN = { 'plastic', 'pebble', 'ferrite', 'pyrite', 'jade', 'crystal', 'antimatter' }

  it('are the seven mpStake values after the three live ones, each with a chip and its modifiers', function()
    local S = MP.content.stakes
    expect(#S.LIST).eq(10)
    for i, id in ipairs(CHAIN) do
      local e = S.LIST[3 + i]
      expect(e.id).eq(id)
      expect(e.key).eq('stake_mp_' .. id)
      expect(e.atlas).eq('mp_alt_mp_stakes')
      expect(e.applies).eq(CHAIN[i - 1])
      expect(MP.stakes.DEFS[id] ~= nil).truthy()
    end
    expect(S.check()).eq(true)
    expect(S.get('crystal').shiny and S.get('antimatter').shiny).eq(true)
  end)

  it('each applies every stake before it (scaling steps, stickers, reroll, interest step)', function()
    local want = {
      plastic = { scaling = 1, stickers = {}, reroll = nil },
      pebble = { scaling = 2, stickers = {}, reroll = nil },
      ferrite = { scaling = 2, stickers = { 'persistent' }, reroll = nil },
      pyrite = { scaling = 2, stickers = { 'persistent' }, reroll = 1 },
      jade = { scaling = 3, stickers = { 'persistent' }, reroll = 1 },
      crystal = { scaling = 3, stickers = { 'persistent', 'unreliable' }, reroll = 1 },
      antimatter = { scaling = 3, stickers = { 'persistent', 'unreliable', 'draining' }, reroll = 1 },
    }
    for _, id in ipairs(CHAIN) do
      local g = run_at(1)
      expect(MP.stakes.apply(id)).eq(true)
      local w = want[id]
      expect(id .. ':' .. tostring(g.modifiers.scaling or 1)).eq(id .. ':' .. w.scaling)
      expect(g.modifiers.mp_interest_rate).eq(10)
      expect(g.modifiers.mp_reroll_extra).eq(w.reroll)
      for _, fam in ipairs({ 'persistent', 'unreliable', 'draining' }) do
        local on = false
        for _, f in ipairs(w.stickers) do if f == fam then on = true end end
        expect(id .. fam .. tostring(g.modifiers['mp_sticker_' .. fam] == true)).eq(id .. fam .. tostring(on))
      end
      -- none of them is a vanilla-stake effect
      expect(g.modifiers.enable_eternals_in_shop).eq(nil)
      expect(g.mp_stake).eq(id)
    end
  end)

  it('scaling steps add to the vanilla stake\'s (Pebble on Green = 3, Jade on Purple = 5: the generic curve)', function()
    mount('ruleset_mp_balanced', { mpStake = 'pebble' })
    local g = run_at(3)
    MP.stakes.apply('pebble')
    expect(g.modifiers.scaling).eq(3)
    expect(get_blind_amount(2)).eq(1000) -- vanilla's scaling-3 table
    g = run_at(6)
    MP.stakes.apply('jade')
    expect(g.modifiers.scaling).eq(5)
    expect(get_blind_amount(3)).eq(MP.stakes.generic_amount(3, 5))
  end)

  it('Plastic: interest is $1 per $10 (same $5 cap), in its own row; vanilla\'s row is off', function()
    mount('ruleset_mp_balanced', { mpStake = 'plastic' })
    local g = run_at(1)
    MP.stakes.apply('plastic')
    g.dollars = 37
    G.FUNCS.evaluate_round()
    expect(#rows).eq(2)
    expect(rows[1].name).eq('mp_interest')
    expect(rows[1].dollars).eq(3)
    expect(rows[2].name).eq('bottom')
    expect(rows[2].dollars).eq(3)
    expect(g.modifiers.no_interest).eq(nil)
    rows = {}
    g.dollars = 200
    G.FUNCS.evaluate_round()
    expect(rows[1].dollars).eq(5)
    rows = {}
    g.dollars = 9
    G.FUNCS.evaluate_round()
    expect(#rows).eq(1)
    expect(rows[1].name).eq('bottom')
    -- No Interest still wins
    rows = {}
    g.modifiers.no_interest = true
    g.dollars = 50
    G.FUNCS.evaluate_round()
    expect(#rows).eq(1)
    -- the row's label: vanilla's interest text with the $10 step
    _G.localize = function(t) return t.key .. ':' .. table.concat(t.vars, ',') end
    local left = {}
    G.UIT = G.UIT or { O = 1, T = 2 }
    expect(MP.economy.eval_row_label({ name = 'mp_interest' }, left, 1)).eq(true)
    expect(left[1].config.text).eq('interest:1,10,5')
  end)

  it('without an alt stake vanilla interest is untouched', function()
    mount('ruleset_mp_balanced')
    local g = run_at(1)
    g.dollars = 37
    G.FUNCS.evaluate_round()
    expect(rows[1].name).eq('interest')
    expect(rows[1].dollars).eq(5)
  end)

  it('Pyrite: every reroll raises the reroll cost by $2 on the real calculate_reroll_cost', function()
    mount('ruleset_mp_balanced', { mpStake = 'pyrite' })
    local g = run_at(1)
    MP.stakes.apply('pyrite')
    g.round_resets.reroll_cost = 5
    g.current_round.reroll_cost_increase = 0
    calculate_reroll_cost()
    expect(g.current_round.reroll_cost).eq(7)
    calculate_reroll_cost()
    expect(g.current_round.reroll_cost).eq(9)
    calculate_reroll_cost(true)
    expect(g.current_round.reroll_cost).eq(9)
  end)

  it('Ferrite / Crystal / Antimatter put their stickers on the listed Jokers', function()
    mount('ruleset_mp_balanced', { mpStake = 'antimatter' })
    run_at(1)
    MP.stakes.apply('antimatter')
    local K = MP.content.stickers
    local card = { ability = { set = 'Joker' } }
    K.apply(card, G.P_CENTERS.j_hanging_chad) -- on all three lists
    expect(K.of(card)).eq({ 'mp_sticker_persistent', 'mp_sticker_unreliable', 'mp_sticker_draining' })
  end)

  it('To the Moon pays per step (x2 for $10) and reads its own text, only with an alt stake', function()
    mount('ruleset_mp_balanced', { mpStake = 'crystal' })
    run_at(1)
    MP.stakes.apply('crystal')
    expect(MP.registry.enabled('rw_mp_to_the_moon_plastic')).eq(true)
    local def = MP.registry.get('j_to_the_moon')
    local card = { ability = { extra = 1 } }
    def.set_ability(card)
    expect(card.ability.extra).eq(2)
    expect(def.loc_vars(card)).eq({ 2, 10 })
    MP.session.unmount('test')
    mount('ruleset_mp_balanced', { mpStake = 'spectral' })
    expect(MP.registry.enabled('rw_mp_to_the_moon_plastic')).eq(false)
  end)

  it('the default (no mpStake) applies nothing', function()
    local g = run_at(1)
    expect(MP.stakes.apply(nil)).eq(false)
    expect(g.modifiers.mp_interest_rate).eq(nil)
    expect(g.modifiers.scaling).eq(nil)
  end)
end)

-- ── Nemesis sticker ─────────────────────────────────────────────────────────

describe('EX-17 the Nemesis sticker (Advanced layer nemesis_sticker)', function()
  before_each(setup)
  after_each(teardown)

  local function bundle(layers)
    local case = MP.copy(RESOLVED.ruleset_mp_balanced, true)
    case.resolved.__layer_set = nil -- MP.layer_active's cache, from an earlier mount of the original
    for _, l in ipairs(layers) do case.resolved.layers[#case.resolved.layers + 1] = l end
    return case
  end

  it('is drawn on a card from the Nemesis only while the layer is on, never as a badge or tooltip', function()
    local K = MP.content.stickers
    expect(K.SPRITES.mp_sticker_nemesis.atlas).eq('mp_sticker_nemesis')
    local case = bundle({})
    MP.session.mount('match', { resolved = case.resolved, options = case.options, runId = 'r', me = 'u1', seed = 'S', deck = 'b_red', stake = 1 })
    local c = { ability = { set = 'Joker' } }
    expect(K.mark_nemesis(c)).eq(false)
    expect(c.ability.mp_sticker_nemesis).eq(nil)
    MP.session.unmount('test')
    case = bundle({ 'nemesis_sticker' })
    MP.session.mount('match', { resolved = case.resolved, options = case.options, runId = 'r', me = 'u1', seed = 'S', deck = 'b_red', stake = 1 })
    expect(K.mark_nemesis(c)).eq(true)
    expect(K.of(c)).eq({ 'mp_sticker_nemesis' })
    expect(K.badges_of(c)).eq({})
    expect(K.tooltips(c)).eq({})
    c.ability.mp_balanced = true
    expect(K.badges_of(c)).eq({ 'mp_sticker_balanced' })
  end)

  it('a Magnet copy from the Nemesis carries it', function()
    local case = bundle({ 'nemesis_sticker' })
    MP.session.mount('match', { resolved = case.resolved, options = case.options, runId = 'r', me = 'u1', seed = 'S', deck = 'b_red', stake = 1 })
    local built
    MP.card.build = function(sc, area) built = { ability = { set = 'Joker' }, key = sc.key }; return built end
    G.jokers = { cards = {} }
    MP.state.magnet_pending = 'u2'
    MP.peer.dispatch({ k = 'sync', from = 'u2', d = { obj = 'j_mp_magnet_sandbox', kind = 'sync',
      data = { type = 'response', card = { key = 'j_joker' } } } })
    expect(built and built.ability.mp_sticker_nemesis).eq(true)
  end)
end)

-- ── Judgement rework ────────────────────────────────────────────────────────

describe('the Judgement rework (Advanced layer judgement_rework) on the real pools under The Order', function()
  local created
  before_each(function()
    setup()
    created = {}
    -- the innermost create_card: record the key the wraps settled on
    _G.create_card = function(_type, area, legendary, rarity, skip, soulable, forced, key_append)
      local c = { key = forced, key_append = key_append, ability = {}, set_edition = function(self, e) self.edition = e end }
      created[#created + 1] = c
      return c
    end
    _G.poll_edition = _G.poll_edition or function() return nil end
  end)
  after_each(teardown)

  local function mount_with(layers)
    local case = MP.copy(RESOLVED.ruleset_mp_balanced, true)
    case.resolved.__layer_set = nil -- MP.layer_active's cache, from an earlier mount of the original
    for _, l in ipairs(layers) do case.resolved.layers[#case.resolved.layers + 1] = l end
    MP.session.mount('match', { resolved = case.resolved, options = case.options, runId = 'r', me = 'u1',
      seed = '*JUDGE001', deck = 'b_red', stake = 8 })
    local g = run_at(8) -- eternals, perishables and rentals all on: many shop rolls carry a sticker
    MP.session.pre_roll()
    return g
  end

  local function shop_sequence(n)
    local out = {}
    for i = 1, n do out[i] = MP.order.roll_shop_joker() end
    return out
  end

  it('gives the first sticker-free Joker of the shop sequence and holds the stickered ones for the shop', function()
    mount_with({ 'judgement_rework' })
    expect(MP.order.active()).eq(true)
    expect(MP.registry.enabled('rw_mp_judgement')).eq(true)
    -- what the shop would roll from this point
    local snap = MP.copy(G.GAME.pseudorandom, true)
    local seq = shop_sequence(20)
    G.GAME.pseudorandom = snap
    local card = create_card('Joker', G.jokers, nil, nil, nil, nil, nil, 'jud')
    local i = 1
    while seq[i].et or seq[i].per or seq[i].rent do i = i + 1 end
    expect(card.key).eq(seq[i].key)
    local held = MP.order.held()
    expect(#held).eq(i - 1)
    for k = 1, i - 1 do
      expect(held[k].key).eq(seq[k].key)
      expect((held[k].et or held[k].per or held[k].rent) and true).eq(true)
    end
    -- the shop shows the held rolls first, in order, stickers and all
    if i > 1 then
      local shop = create_card('Joker', G.shop_jokers, nil, nil, nil, nil, nil, 'sho')
      expect(shop.key).eq(seq[1].key)
      expect(#MP.order.held()).eq(i - 2)
    end
  end)

  it('is the same on every peer (same seed, same picks)', function()
    mount_with({ 'judgement_rework' })
    local snap = MP.copy(G.GAME.pseudorandom, true)
    local a = create_card('Joker', G.jokers, nil, nil, nil, nil, nil, 'jud').key
    local ha = MP.copy(MP.order.held(), true)
    G.GAME.pseudorandom = snap
    G.GAME.mp_held_jokers = nil
    local b = create_card('Joker', G.jokers, nil, nil, nil, nil, nil, 'jud').key
    expect(a).eq(b)
    expect(MP.order.held()).eq(ha)
  end)

  it('off by default: Judgement is the plain (vanilla/Order) Joker roll and nothing is held', function()
    mount_with({})
    expect(MP.registry.enabled('rw_mp_judgement')).eq(false)
    create_card('Joker', G.jokers, nil, nil, nil, nil, nil, 'jud')
    expect(#MP.order.held()).eq(0)
    -- and no ruleset turns it on (only a host's Advanced toggle, options.modifierLayers)
    for name, case in pairs(RESOLVED) do
      if #(case.options.modifierLayers or {}) == 0 then
        for _, l in ipairs(case.resolved.layers) do expect(name .. ':' .. l ~= name .. ':judgement_rework').truthy() end
      end
    end
  end)
end)
