-- The Release ruleset (EX-14 lifted) on the REAL base game (L1): content/release.lua's 65 Rework
-- defs against the real prototypes, pools and RNG of data/balatro (spec/mp_vanilla.lua), and their
-- behaviour against the real Card:calculate_joker / get_end_of_round_effect / set_ability
-- (card.lua) and Blind:debuff_hand (blind.lua) as the core pack ships them (core patches applied).
--
-- The expected numbers below are the 1.0.0 values the mod's (commented-out) rulesets/release.lua
-- lists, used here as the test oracle.

local V = require 'spec.mp_vanilla'
local P = require 'spec.core_patches'
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

--- A class file of the shipped game (card.lua, blind.lua) loaded into its own environment.
local function vanilla_class(path, name)
  local env = setmetatable({ Moveable = { extend = function() return {} end } }, { __index = _G })
  local chunk = P.loadfile(path)
  setfenv(chunk, env)
  chunk()
  return env[name]
end

local noop = function() end

-- What the real card code calls besides the prototypes: events run at once, a recorder for
-- create_card, two card areas.
local created
local function stub_world()
  created = {}
  _G.Event = function(t) return t end
  G.E_MANAGER = { add_event = function(_, e) if e.func then e.func() end end }
  _G.localize = function(k) return 'L:' .. tostring(type(k) == 'table' and k.key or k) end
  _G.card_eval_status_text = noop
  _G.check_for_unlock = noop
  _G.play_sound = noop
  _G.delay = noop
  _G.ease_dollars = function(n) G.GAME.dollars = (G.GAME.dollars or 0) + n end
  _G.level_up_hand = function(_, hand, _, amount)
    local h = G.GAME.hands[hand]
    h.level = h.level + (amount or 1)
  end
  _G.create_card = function(_type, area, legendary, rarity, skip, soulable, forced, key_append)
    local c = { _type = _type, rarity = rarity, forced = forced, key_append = key_append, ability = {},
      states = {}, add_to_deck = noop, start_materialize = noop }
    created[#created + 1] = c
    return c
  end
  _G.create_shop_card_ui = noop
  G.GAME.dollars = 0
  G.GAME.consumeable_buffer = 0
  G.GAME.used_jokers = {}
  G.GAME.blind = { debuff_card = noop }
  G.consumeables = { cards = {}, config = { card_limit = 2 }, emplace = function(self, c) self.cards[#self.cards + 1] = c end }
  G.jokers = { cards = {}, config = { card_limit = 5, type = 'joker' } }
  G.hand = { cards = {} }
  G.play = { cards = {} }
  G.CARD_W, G.CARD_H = 2.4, 3.2
  G.C = setmetatable({ SECONDARY_SET = { Planet = { 0, 0, 1, 1 } } }, { __index = function() return { 1, 1, 1, 1 } end })
  G.STAGE, G.STAGES = 2, { RUN = 2 }
end

local CardClass, BlindClass

local function install_real_classes()
  CardClass = vanilla_class('card.lua', 'Card')
  CardClass.set_sprites = noop
  CardClass.juice_up = noop
  CardClass.start_dissolve = function(self) self.dissolved = true end
  CardClass.is_face = function(self) return self.base.id >= 11 and self.base.id <= 13 end
  CardClass.get_id = function(self) return self.base.id end
  CardClass.is_suit = function(self, s, bypass)
    if self.debuff and not bypass then return false end
    if self.ability.name == 'Wild Card' then return true end
    return self.base.suit == s
  end
  _G.Card = CardClass
  BlindClass = vanilla_class('blind.lua', 'Blind')
  BlindClass.wiggle = noop
  _G.Blind = BlindClass
end

local function new_card(key, area)
  local c = setmetatable({ T = { x = 0, y = 0, w = G.CARD_W, h = G.CARD_H }, params = {}, config = { card = {} },
    base = { suit = 'Spades', id = 14 } }, { __index = Card })
  c:set_ability(G.P_CENTERS[key], true)
  c.sell_cost = c.sell_cost or 3
  if area then
    area.cards[#area.cards + 1] = c
    c.area = area
  end
  return c
end

local function playing(suit, id, center)
  local c = setmetatable({ T = { x = 0, y = 0, w = 1, h = 1 }, params = {}, config = { card = {} },
    base = { suit = suit, id = id }, playing_card = id }, { __index = Card })
  c:set_ability(center or G.P_CENTERS.c_base, true)
  return c
end

local MP, REL

local function mount(ruleset, over)
  local case = RESOLVED[ruleset]
  assert(case, 'no bundle ' .. ruleset)
  local info = { resolved = case.resolved, options = case.options, runId = 'r1', me = 'u1', seed = 'REL00001',
    deck = 'b_red', stake = 1 }
  for k, v in pairs(over or {}) do info[k] = v end
  MP.session.mount('match', info)
end

local function setup()
  V.install()
  install_real_classes()
  MP = boot_mp()
  V.new_run('REL00001')
  stub_world()
  REL = MP.content.release
end

local function teardown()
  if MP.state.session then MP.session.unmount('test') end
  MP.hooks.remove_all()
  _G.Card, _G.Blind = nil, nil
  V.uninstall()
end

-- ── The 1.0.0 values (oracle) ───────────────────────────────────────────────

local JOKER_PROPS = {
  j_greedy_joker = { config = { extra = { s_mult = 4, suit = 'Diamonds' } } },
  j_lusty_joker = { config = { extra = { s_mult = 4, suit = 'Hearts' } } },
  j_wrathful_joker = { config = { extra = { s_mult = 4, suit = 'Spades' } } },
  j_gluttenous_joker = { config = { extra = { s_mult = 4, suit = 'Clubs' } } },
  j_mad = { config = { t_mult = 20, type = 'Four of a Kind' }, atlas = 'mp_release_jokers' },
  j_clever = { config = { t_chips = 150, type = 'Four of a Kind' }, atlas = 'mp_release_jokers' },
  j_banner = { config = { extra = 40 } },
  j_8_ball = { config = { extra = 2 }, atlas = 'mp_release_jokers' },
  j_fibonacci = { cost = 7 },
  j_steel_joker = { config = { extra = 0.25 } },
  j_gros_michel = { config = { extra = { odds = 4, mult = 15 } } },
  j_odd_todd = { config = { extra = 30 } },
  j_runner = { config = { extra = { chips = 20, chip_mod = 10 } } },
  j_sixth_sense = { rarity = 3 },
  j_hiker = { config = { extra = 4 } },
  j_todo_list = { config = { extra = { dollars = 5, poker_hand = 'High Card' } } },
  j_madness = {},
  j_square = { config = { extra = { chips = 16, chip_mod = 4 } }, cost = 5, atlas = 'mp_release_jokers' },
  j_seance = { rarity = 3, cost = 7 },
  j_riff_raff = { cost = 4 },
  j_vampire = { config = { extra = 0.2, Xmult = 1 } },
  j_vagabond = { rarity = 2, config = { extra = 3 }, cost = 6 },
  j_cloud_9 = { cost = 6 },
  j_midas_mask = { cost = 6 },
  j_luchador = { eternal_compat = true },
  j_reserved_parking = { rarity = 2 },
  j_mail = { config = { extra = 3 } },
  j_lucky_cat = { config = { Xmult = 1, extra = 0.2 } },
  j_trading = { cost = 5 },
  j_smiley = { config = { extra = 4 } },
  j_campfire = { config = { extra = 0.5 } },
  j_ticket = { config = { extra = 3 } },
  j_swashbuckler = { config = { mult = 1 } },
  j_hanging_chad = { config = { extra = 1 } },
  j_bloodstone = { config = { extra = { odds = 3, Xmult = 2 } } },
  j_onyx_agate = { config = { extra = 8 } },
  j_glass = { config = { extra = 0.5, Xmult = 1 } },
  j_flower_pot = {},
  j_wee = { config = { extra = { chips = 10, chip_mod = 8 } } },
  j_stuntman = { rarity = 2, config = { extra = { h_size = 2, chip_mod = 300 } }, cost = 6 },
  j_invisible = { config = { extra = 3 }, cost = 10 },
  j_burnt = { rarity = 2, cost = 6 },
  j_yorick = { config = { extra = { xmult = 5, discards = 23 } } },
  c_magician = { config = { mod_conv = 'm_lucky', max_highlighted = 1 } },
}

local MOD_ORDER = {
  'j_greedy_joker', 'j_lusty_joker', 'j_wrathful_joker', 'j_gluttenous_joker', 'j_mad', 'j_clever', 'j_banner',
  'j_8_ball', 'j_fibonacci', 'j_steel_joker', 'j_gros_michel', 'j_odd_todd', 'j_runner', 'j_sixth_sense', 'j_hiker',
  'j_todo_list', 'j_madness', 'j_square', 'j_seance', 'j_riff_raff', 'j_vampire', 'j_vagabond', 'j_cloud_9',
  'j_midas_mask', 'j_luchador', 'j_reserved_parking', 'j_mail', 'j_lucky_cat', 'j_trading', 'j_smiley', 'j_campfire',
  'j_ticket', 'j_swashbuckler', 'j_hanging_chad', 'j_bloodstone', 'j_onyx_agate', 'j_glass', 'j_flower_pot', 'j_wee',
  'j_stuntman', 'j_invisible', 'j_burnt', 'j_yorick', 'c_magician', 'tag_uncommon', 'tag_rare', 'tag_negative',
  'tag_foil', 'tag_holo', 'tag_polychrome', 'tag_investment', 'Blue', 'Straight', 'c_saturn', 'Straight Flush',
  'c_neptune', 'Flush House', 'c_ceres', 'Flush Five', 'c_eris', 'stake_green', 'stake_purple', 'stake_orange',
  'stake_gold', 'bl_arm',
}

local function subset(want, got, path, bad)
  for k, v in pairs(want) do
    if type(v) == 'table' then
      if type(got[k]) ~= 'table' then bad[#bad + 1] = path .. '.' .. k .. ' missing'
      else subset(v, got[k], path .. '.' .. k, bad) end
    elseif got[k] ~= v then
      bad[#bad + 1] = string.format('%s.%s = %s (want %s)', path, k, tostring(got[k]), tostring(v))
    end
  end
end

local function in_pool(r, key)
  for _, c in ipairs(G.P_JOKER_RARITY_POOLS[r]) do if c.key == key then return true end end
  return false
end

-- ── Definitions ─────────────────────────────────────────────────────────────

describe('Release ruleset: the 65 rework definitions', function()
  before_each(setup)
  after_each(teardown)

  it('are defined in the mod order, after every earlier definition, all gated on the release layer', function()
    expect(#REL.DEFS).eq(65)
    local keys = {}
    for i, d in ipairs(REL.DEFS) do
      expect(d.rework.center).eq(MOD_ORDER[i])
      expect(d.gate.layers).eq({ 'release' })
      keys[#keys + 1] = d.key
    end
    -- Appended: no earlier definition moved (the content order before EX-14 ends with the White Deck).
    local first = REL.DEFS[1].order
    for _, d in ipairs(MP.registry.defs()) do
      if d.order < first then expect(d.key:find('^rw_mp_release_') == nil).truthy() end
    end
    expect(MP.registry.get('b_mp_white').order < first).truthy()
  end)

  it('are enabled only by the Release bundle, never by any other ruleset', function()
    local names = {}
    for name in pairs(RESOLVED) do names[#names + 1] = name end
    table.sort(names)
    for _, name in ipairs(names) do
      mount(name)
      local on = 0
      for _, d in ipairs(REL.DEFS) do if MP.registry.enabled(d.key) then on = on + 1 end end
      expect(name .. ':' .. on).eq(name .. ':' .. (name == 'ruleset_mp_release' and 65 or 0))
      MP.session.unmount('test')
    end
  end)
end)

-- ── Properties on the real prototypes ───────────────────────────────────────

describe('Release: the real prototypes take the 1.0.0 values and get them back', function()
  before_each(setup)
  after_each(teardown)

  it('every property rework applies while mounted and is restored exactly after', function()
    local before = MP.copy(G.P_CENTERS, true)
    local pools_before = {}
    for r = 1, 4 do pools_before[r] = #G.P_JOKER_RARITY_POOLS[r] end
    mount('ruleset_mp_release')
    local bad = {}
    for key, want in pairs(JOKER_PROPS) do subset(want, G.P_CENTERS[key], key, bad) end
    expect(bad).eq({})
    -- Balanced sticker on every reworked Joker, Tarot and Planet (the mod's ReworkCenter does it).
    for _, k in ipairs({ 'j_8_ball', 'j_madness', 'c_magician', 'c_saturn', 'c_eris' }) do
      expect(G.P_CENTERS[k].config.mp_balanced).eq(true)
    end
    expect(G.P_TAGS.tag_investment.config.dollars).eq(15)
    MP.session.unmount('test')
    expect(MP.copy(G.P_CENTERS, true)).eq(before)
    for r = 1, 4 do expect(#G.P_JOKER_RARITY_POOLS[r]).eq(pools_before[r]) end
    expect(G.P_TAGS.tag_investment.config.dollars).eq(25)
  end)

  it('a rarity rework moves the Joker between the real rarity pools (and back)', function()
    expect(in_pool(2, 'j_sixth_sense') and not in_pool(3, 'j_sixth_sense')).truthy()
    expect(in_pool(3, 'j_vagabond')).truthy()
    mount('ruleset_mp_release')
    for key, r in pairs({ j_sixth_sense = 3, j_seance = 3, j_vagabond = 2, j_reserved_parking = 2, j_stuntman = 2, j_burnt = 2 }) do
      expect(in_pool(r, key) and key or (key .. ' missing')).eq(key)
      for other = 1, 4 do
        if other ~= r then expect(in_pool(other, key)).eq(false) end
      end
    end
    -- the real shop roll can draw a moved card from its new rarity
    local seen = {}
    for _ = 1, 400 do seen[V.roll('Joker', 'sho', 0.99)] = true end
    expect(seen.j_sixth_sense or seen.j_seance).truthy()
    MP.session.unmount('test')
    expect(in_pool(2, 'j_sixth_sense') and in_pool(3, 'j_vagabond')).truthy()
    expect(in_pool(3, 'j_sixth_sense')).eq(false)
  end)

  it('the text of a reworked card is the mod\'s *_release entry while mounted, vanilla after', function()
    local d = G.localization.descriptions
    d.Joker = { j_8_ball = { name = '8 Ball (1.0.1)' }, j_mp_8ball_release = { name = '8 Ball (1.0.0)' } }
    d.Stake = { stake_gold = { name = 'Gold (1.0.1)' }, stake_mp_gold_release = { name = 'Gold (1.0.0)' } }
    d.Other = { blue_seal = { name = 'Blue (1.0.1)' }, mp_blue_seal_release = { name = 'Blue (1.0.0)' } }
    mount('ruleset_mp_release')
    expect(d.Joker.j_8_ball.name).eq('8 Ball (1.0.0)')
    expect(d.Stake.stake_gold.name).eq('Gold (1.0.0)')
    expect(d.Other.blue_seal.name).eq('Blue (1.0.0)')
    -- a language change rebuilds the tables: the swap is applied again
    d.Joker.j_8_ball = { name = 'reloaded' }
    MP.registry.reapply_loc_swaps()
    expect(d.Joker.j_8_ball.name).eq('8 Ball (1.0.0)')
    MP.session.unmount('test')
    expect(d.Joker.j_8_ball.name).eq('reloaded')
    expect(d.Stake.stake_gold.name).eq('Gold (1.0.1)')
    expect(d.Other.blue_seal.name).eq('Blue (1.0.1)')
  end)
end)

-- ── Behaviour on the real Card ──────────────────────────────────────────────

describe('Release: Joker behaviour on the real Card:calculate_joker', function()
  before_each(function()
    setup()
    mount('ruleset_mp_release')
  end)
  after_each(teardown)

  it('Greedy Joker gives +4 Mult per Diamond (vanilla +3)', function()
    local j = new_card('j_greedy_joker', G.jokers)
    local r = j:calculate_joker({ individual = true, cardarea = G.play, other_card = playing('Diamonds', 5) })
    expect(r.mult).eq(4)
  end)

  it('Mad Joker: +20 Mult on a Four of a Kind, nothing on a Two Pair', function()
    local j = new_card('j_mad', G.jokers)
    local four = { ['Four of a Kind'] = { { 1 } }, ['Two Pair'] = {} }
    local r = j:calculate_joker({ joker_main = true, cardarea = G.jokers, poker_hands = four, scoring_name = 'Four of a Kind' })
    expect(r and r.mult_mod).eq(20)
    local two = { ['Four of a Kind'] = {}, ['Two Pair'] = { { 1 } } }
    expect(j:calculate_joker({ joker_main = true, cardarea = G.jokers, poker_hands = two, scoring_name = 'Two Pair' })).eq(nil)
  end)

  it('8 Ball: no Tarot per 8; a Planet once the hand holds two 8s and there is room', function()
    local j = new_card('j_8_ball', G.jokers)
    local e1, e2, k = playing('Spades', 8), playing('Hearts', 8), playing('Clubs', 13)
    expect(j:calculate_joker({ individual = true, cardarea = G.play, other_card = e1 })).eq(nil)
    expect(j:calculate_joker({ joker_main = true, cardarea = G.jokers, full_hand = { e1, k } })).eq(nil)
    expect(#created).eq(0)
    local r = j:calculate_joker({ joker_main = true, cardarea = G.jokers, full_hand = { e1, e2, k } })
    expect(r.message).eq('L:k_plus_planet')
    expect(created[1]._type).eq('Planet')
    -- The Order (on in Release) draws every consumable from its per-type queue
    expect(created[1].key_append).eq(MP.order.active() and 'Planet' or '8ba')
    G.consumeables.cards = { {}, {} }
    expect(j:calculate_joker({ joker_main = true, cardarea = G.jokers, full_hand = { e1, e2 } })).eq(nil)
    expect(#created).eq(1)
  end)

  it('To Do List pays $5 and only then changes its hand; the round end leaves it', function()
    local j = new_card('j_todo_list', G.jokers)
    local hand = j.ability.to_do_poker_hand
    expect(j:calculate_joker({ end_of_round = true, cardarea = G.jokers })).eq(nil)
    expect(j.ability.to_do_poker_hand).eq(hand)
    expect(j:calculate_joker({ before = true, cardarea = G.jokers, scoring_name = '__none__' })).eq(nil)
    expect(G.GAME.dollars).eq(0)
    local r = j:calculate_joker({ before = true, cardarea = G.jokers, scoring_name = hand })
    expect(r.dollars).eq(5)
    expect(G.GAME.dollars).eq(5)
    expect(j.ability.to_do_poker_hand ~= hand).truthy()
    expect(G.GAME.hands[j.ability.to_do_poker_hand].visible).eq(true)
  end)

  it('Madness grows and destroys a Joker on every Blind, the Boss included', function()
    local m = new_card('j_madness', G.jokers)
    local victim = new_card('j_joker', G.jokers)
    local r = m:calculate_joker({ setting_blind = true, blind = { boss = true }, cardarea = G.jokers })
    expect(r).eq(nil)
    expect(m.ability.x_mult).eq(1.5)
    expect(victim.dissolved).eq(true)
    expect(m:calculate_joker({ setting_blind = true, blind = {}, cardarea = G.jokers, blueprint = 1 })).eq(nil)
    expect(m.ability.x_mult).eq(1.5)
  end)

  it('Vampire takes every played card\'s Enhancement (X0.2 each), scoring or not', function()
    local v = new_card('j_vampire', G.jokers)
    local a, b = playing('Spades', 5, G.P_CENTERS.m_bonus), playing('Hearts', 9, G.P_CENTERS.m_mult)
    local plain = playing('Clubs', 2)
    local r = v:calculate_joker({ before = true, cardarea = G.jokers, full_hand = { a, b, plain }, scoring_hand = { a } })
    expect(v.ability.x_mult).eq(1.4)
    expect(r.message).eq('L:a_xmult')
    expect(a.config.center).eq(G.P_CENTERS.c_base)
    expect(b.config.center).eq(G.P_CENTERS.c_base)
  end)

  it('Midas Mask turns every played face card Gold, scoring or not', function()
    local m = new_card('j_midas_mask', G.jokers)
    local k, q, two = playing('Spades', 13), playing('Hearts', 12), playing('Clubs', 2)
    m:calculate_joker({ before = true, cardarea = G.jokers, full_hand = { k, q, two }, scoring_hand = { k } })
    expect(k.config.center).eq(G.P_CENTERS.m_gold)
    expect(q.config.center).eq(G.P_CENTERS.m_gold)
    expect(two.config.center).eq(G.P_CENTERS.c_base)
  end)

  it('Swashbuckler adds the sell value of the Jokers to its left only', function()
    local a = new_card('j_joker', G.jokers)
    local s = new_card('j_swashbuckler', G.jokers)
    local c = new_card('j_joker', G.jokers)
    a.sell_cost, c.sell_cost = 4, 7
    MP.registry.get('j_swashbuckler').update(s)
    expect(s.ability.mult).eq(4)
  end)

  it('Flower Pot needs four suits that count (a debuffed card does not)', function()
    local f = new_card('j_flower_pot', G.jokers)
    local h, d, s, c = playing('Hearts', 2), playing('Diamonds', 3), playing('Spades', 4), playing('Clubs', 5)
    local r = f:calculate_joker({ joker_main = true, cardarea = G.jokers, scoring_hand = { h, d, s, c } })
    expect(r.Xmult_mod).eq(3)
    h.debuff = true
    expect(f:calculate_joker({ joker_main = true, cardarea = G.jokers, scoring_hand = { h, d, s, c } })).eq(nil)
    local wild = playing('Hearts', 6, G.P_CENTERS.m_wild)
    r = f:calculate_joker({ joker_main = true, cardarea = G.jokers, scoring_hand = { wild, d, s, c } })
    expect(r.Xmult_mod).eq(3)
  end)

  it('Yorick: X5 Mult only once 23 discards (actions, not cards) have been used', function()
    local y = new_card('j_yorick', G.jokers)
    expect(y.ability.yorick_discards).eq(23)
    for i = 1, 23 do
      local a, b = playing('Spades', 2), playing('Hearts', 3)
      expect(y:calculate_joker({ joker_main = true, cardarea = G.jokers })).eq(nil)
      y:calculate_joker({ discard = true, other_card = a, full_hand = { a, b } })
      y:calculate_joker({ discard = true, other_card = b, full_hand = { a, b } })
      expect(y.ability.yorick_discards).eq(23 - i)
    end
    local r = y:calculate_joker({ joker_main = true, cardarea = G.jokers })
    expect(r.Xmult_mod).eq(5)
    expect(y.ability.x_mult).eq(1)
  end)

  it('Hanging Chad retriggers the first scoring card once (vanilla twice)', function()
    local h = new_card('j_hanging_chad', G.jokers)
    local a = playing('Spades', 9)
    local r = h:calculate_joker({ repetition = true, cardarea = G.play, other_card = a, scoring_hand = { a } })
    expect(r.repetitions).eq(1)
  end)

  it('Runner starts at +20 Chips and gains +10 per Straight', function()
    local j = new_card('j_runner', G.jokers)
    expect(j.ability.extra.chips).eq(20)
    j:calculate_joker({ before = true, cardarea = G.jokers, poker_hands = { Straight = { { 1 } } } })
    expect(j.ability.extra.chips).eq(30)
  end)

  it('Square Joker is card-shaped with its 1.0.0 art, square without it, and always "Square Joker"', function()
    G.P_CENTERS.j_square.discovered = true
    MP.registry.atlas.loaded[REL.ATLAS] = 'placeholder'
    local sq = new_card('j_square', G.jokers)
    expect(sq.T.h).eq(sq.T.w)
    MP.registry.atlas.loaded[REL.ATLAS] = 'image'
    local sq2 = new_card('j_square', G.jokers)
    expect(sq2.T.h).eq(G.CARD_H)
    expect(sq2.ability.name).eq('Square Joker')
    expect(G.P_CENTERS.j_square.name).eq('Square Joker')
    local r = sq2:calculate_joker({ before = true, cardarea = G.jokers, full_hand = { 1, 2, 3, 4 } })
    expect(sq2.ability.extra.chips).eq(20)
    expect(r.message).eq('L:k_upgrade_ex')
  end)
end)

describe('Release: tags, the Blue Seal, hands, stakes and The Arm', function()
  before_each(function()
    setup()
    mount('ruleset_mp_release')
  end)
  after_each(teardown)

  local function fake_tag(key)
    return { key = key, ID = 7, triggered = false, config = MP.copy(G.P_TAGS[key].config, true),
      yep = function(self, _, _, fn) self.yepped = true; fn() end, nope = function(self) self.noped = true end }
  end

  it('Uncommon and Rare Tags put a Joker in the shop that is not free', function()
    local def = MP.registry.get('tag_uncommon')
    local t = fake_tag('tag_uncommon')
    local card = def.tag.apply(t, { type = 'store_joker_create', area = {} })
    expect(card.rarity).eq(0.9)
    expect(card.key_append).eq(not MP.order.active() and 'uta' or nil)
    expect(card.ability.couponed).eq(nil)
    expect(t.triggered).eq(true)
    expect(def.tag.apply(t, { type = 'store_joker_create', area = {} })).eq(nil)
    local rare = fake_tag('tag_rare')
    card = MP.registry.get('tag_rare').tag.apply(rare, { type = 'store_joker_create', area = {} })
    expect(card.rarity).eq(1)
    expect(card.ability.couponed).eq(nil)
    -- every Rare held: the tag fails
    for _, c in ipairs(G.P_JOKER_RARITY_POOLS[3]) do
      G.jokers.cards[#G.jokers.cards + 1] = { config = { center = c } }
    end
    local rare2 = fake_tag('tag_rare')
    expect(MP.registry.get('tag_rare').tag.apply(rare2, { type = 'store_joker_create', area = {} })).eq(nil)
    expect(rare2.noped and rare2.triggered).eq(true)
  end)

  it('edition Tags give their edition to the next base shop Joker without making it free', function()
    local G_locks = G.CONTROLLER.locks
    for key, ed in pairs({ tag_foil = 'foil', tag_holo = 'holo', tag_polychrome = 'polychrome', tag_negative = 'negative' }) do
      local t = fake_tag(key)
      local got
      local card = { ability = { set = 'Joker' }, set_edition = function(_, e) got = e end }
      expect(MP.registry.get(key).tag.apply(t, { type = 'store_joker_modify', card = card })).eq(true)
      expect(got[ed]).eq(true)
      expect(card.ability.couponed).eq(nil)
      expect(G_locks[7]).eq(nil)
      local t2 = fake_tag(key)
      expect(MP.registry.get(key).tag.apply(t2, { type = 'store_joker_modify', card = { edition = {}, ability = { set = 'Joker' } } })).eq(nil)
    end
  end)

  it('a Blue Seal makes a random Planet whenever there is room (no 1 in 2, not the last hand\'s)', function()
    local c = playing('Spades', 5)
    c.seal = 'Blue'
    G.GAME.last_hand_played = 'Flush'
    local ret = c:get_end_of_round_effect({})
    expect(ret.effect).eq(true)
    expect(created[1]._type).eq('Planet')
    expect(created[1].forced).eq(nil)
    expect(created[1].key_append).eq(MP.order.active() and 'Planet' or 'blusl')
    expect(c.seal).eq('Blue')
    G.consumeables.cards = { {}, {} }
    ret = c:get_end_of_round_effect({})
    expect(ret.effect).eq(nil)
    expect(#created).eq(1)
  end)

  it('the Blue Seal\'s Planet goes through Magic Mouth\'s watch (a planted trap can still steal it)', function()
    local th = package.loaded['rmh_mp.content.trap_hooks']
    local real, watched = th.seal_watch, {}
    th.seal_watch = function(card, call) watched[#watched + 1] = card; return call() end
    local c = playing('Hearts', 7)
    c.seal = 'Blue'
    c:get_end_of_round_effect({})
    th.seal_watch = real
    expect(#watched >= 1 and watched[#watched] == c).eq(true)
    expect(#created).eq(1)
  end)

  it('the real hands get 1.0.0\'s level-up values at run start; their Planets show the Balanced sticker', function()
    G.GAME.stake = 1
    REL.apply({ session = MP.state.session })
    expect(G.GAME.hands['Straight'].l_mult).eq(2)
    expect(G.GAME.hands['Straight Flush'].l_mult).eq(3)
    expect(G.GAME.hands['Flush House'].l_mult).eq(3)
    expect(G.GAME.hands['Flush Five'].l_chips).eq(40)
    expect(G.GAME.hands['Flush'].l_mult).eq(2) -- untouched
    expect(MP.registry.enabled('rw_mp_release_straight_flush')).eq(true)
  end)

  it('Gold Stake is -1 hand size (no Rentals), Orange is pricier packs (no Perishables), Purple sizes', function()
    local g = G.GAME
    g.stake = 8
    g.modifiers.scaling = 3
    g.modifiers.enable_perishables_in_shop, g.modifiers.enable_rentals_in_shop = true, true
    local hs = g.starting_params.hand_size
    REL.apply({ session = MP.state.session })
    expect(g.starting_params.hand_size).eq(hs - 1)
    expect(g.modifiers.booster_ante_scaling).eq(true)
    expect(g.modifiers.enable_perishables_in_shop).eq(nil)
    expect(g.modifiers.enable_rentals_in_shop).eq(nil)
    expect(g.mp_release_scaling).eq('purple')
    local want = { 300, 1200, 3600, 10000, 25000, 50000, 90000, 180000 }
    for ante = 1, 8 do expect(get_blind_amount(ante)).eq(want[ante]) end
    expect(get_blind_amount(0)).eq(100)
    expect(get_blind_amount(9) > 180000).truthy()
  end)

  it('Green Stake uses 1.0.0\'s sizes; below Green and with an MP stake past scaling 3 vanilla/generic stays', function()
    local g = G.GAME
    g.stake, g.modifiers.scaling = 3, 2
    REL.apply({ session = MP.state.session })
    expect(g.mp_release_scaling).eq('green')
    local want = { 300, 1000, 3200, 9000, 18000, 32000, 56000, 90000 }
    for ante = 1, 8 do expect(get_blind_amount(ante)).eq(want[ante]) end
    g.modifiers.scaling = 4 -- spectral stake on top: the generic curve
    expect(get_blind_amount(2)).eq(MP.stakes.generic_amount(2, 4))
  end)

  it('an MP stake that brings Perishables / Rentals keeps them under Orange / Gold', function()
    local g = G.GAME
    g.stake = 8
    MP.state.session.mpStake = 'spectral'
    g.modifiers.enable_perishables_in_shop, g.modifiers.enable_rentals_in_shop = true, true
    REL.apply({ session = MP.state.session })
    expect(g.modifiers.enable_perishables_in_shop).eq(true)
    expect(g.modifiers.enable_rentals_in_shop).eq(true)
  end)

  it('The Arm lowers a level-1 hand to level 0 on the real Blind:debuff_hand (1.0.1 stops at 1)', function()
    local b = setmetatable({ name = 'The Arm', config = { blind = G.P_BLINDS.bl_arm }, children = { animatedSprite = {} } },
      { __index = Blind })
    G.GAME.hands.Pair.level = 1
    b:debuff_hand({}, {}, 'Pair', false)
    expect(G.GAME.hands.Pair.level).eq(0)
    expect(b.triggered).eq(true)
    b:debuff_hand({}, {}, 'Pair', false)
    expect(G.GAME.hands.Pair.level).eq(0)
    expect(b.triggered).eq(false)
  end)
end)

describe('Release off: the same real code is vanilla', function()
  before_each(function()
    setup()
    mount('ruleset_mp_balanced')
  end)
  after_each(teardown)

  it('Greedy +3, a Blue Seal rolls its 1 in 2 for the last hand\'s Planet, The Arm stops at 1', function()
    local j = new_card('j_greedy_joker', G.jokers)
    expect(j:calculate_joker({ individual = true, cardarea = G.play, other_card = playing('Diamonds', 5) }).mult).eq(3)
    local m = new_card('j_madness', G.jokers)
    new_card('j_joker', G.jokers)
    m:calculate_joker({ setting_blind = true, blind = { boss = true }, cardarea = G.jokers })
    expect(m.ability.x_mult).eq(1)
    local b = setmetatable({ name = 'The Arm', config = { blind = G.P_BLINDS.bl_arm }, children = { animatedSprite = {} } },
      { __index = Blind })
    G.GAME.hands.Pair.level = 1
    b:debuff_hand({}, {}, 'Pair', false)
    expect(G.GAME.hands.Pair.level).eq(1)
    expect(G.P_CENTERS.j_8_ball.config.extra).eq(4)
    expect(G.P_CENTERS.j_square.atlas).eq(nil)
  end)
end)
