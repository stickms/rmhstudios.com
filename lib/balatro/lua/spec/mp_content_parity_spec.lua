-- Content parity with the reference mod (L1): the inventory of every mod content key and its
-- native counterpart (lib/balatro/mp/__fixtures__/mod-inventory.json), and the EX-15 content —
-- the rarity-shifted Mime and Baron (content/jokers/rarity_shifted.lua) and the White Deck
-- (content/white_deck.lua).
--
-- Mime and Baron are checked against the REAL base-game Card:calculate_joker (data/balatro/card.lua)
-- on the vanilla j_mime / j_baron prototypes read from data/balatro/game.lua: for every context
-- shape evaluate_play and the end-of-round pass build, the MP card returns what the vanilla card
-- returns. Only rarity and cost differ.

local CH = require 'spec.mp_content_helper'
local H = CH.H
local J = require 'rmh/json'

local ROOT = (RMH_SPEC and RMH_SPEC.root) or ''

local function read(path)
  local f = assert(io.open(ROOT .. path, 'rb'), path)
  local s = f:read('*a')
  f:close()
  return s
end

local INV = J.decode(read('lib/balatro/mp/__fixtures__/mod-inventory.json'))
local RESOLVED = J.decode(read('lib/balatro/mp/__fixtures__/rulesets-resolved.json'))

--- A vanilla prototype line of game.lua (`j_mime=   {...},`) as a table.
local function vanilla_proto(key)
  local src = read('data/balatro/game.lua')
  local body = src:match('\n%s*' .. key .. '%s*=%s*(%b{})')
  assert(body, 'no ' .. key .. ' in game.lua')
  return assert(loadstring('return ' .. body))()
end

--- The real Card:calculate_joker, loaded from card.lua into its own environment (globals resolve
--- to the spec's G, localize, ...).
local function vanilla_calculate_joker()
  local env = setmetatable({ Moveable = { extend = function() return {} end } }, { __index = _G })
  local chunk = assert(loadfile(ROOT .. 'data/balatro/card.lua'))
  setfenv(chunk, env)
  chunk()
  return env.Card.calculate_joker
end

local MP

local function errors()
  local out = {}
  for _, l in ipairs(MP.log_ring) do if l.level == "error" then out[#out + 1] = l.msg end end
  return out
end

-- ── inventory ───────────────────────────────────────────────────────────────

describe('mod inventory: every mod content key has a native counterpart', function()
  before_each(function() MP = H.boot() end)
  after_each(H.teardown)

  it('the inventory is not empty and covers every kind the mod registers', function()
    expect(#INV.objects >= 150).truthy()
    local kinds = {}
    for _, e in ipairs(INV.objects) do kinds[e.kind] = true end
    for _, k in ipairs({ 'Joker', 'Planet', 'Spectral', 'Trap', 'Booster', 'Back', 'Blind', 'Tag', 'Voucher', 'Challenge' }) do
      expect(kinds[k] and k).eq(k)
    end
    expect(#INV.stickers).eq(6)
    expect(#INV.stakes).eq(10)
    expect(#INV.layers >= 43).truthy()
    expect(#INV.rulesets).eq(16)
    -- EX-14 (65 Release reworks), EX-16, EX-17 and the Judgement rework: nothing is excluded.
    expect(#INV.excluded).eq(0)
    local release = 0
    for _, e in ipairs(INV.reworks) do if e.layers[1] == 'release' then release = release + 1 end end
    expect(release).eq(65)
  end)

  it('objects: each mod key is a registry def of the same kind (the diff is empty)', function()
    local R = MP.registry
    local missing = {}
    for _, e in ipairs(INV.objects) do
      local def = R.get(e.native)
      if not def then missing[#missing + 1] = e.mod .. ' -> ' .. e.native .. ' (missing)'
      elseif def.kind ~= e.kind then missing[#missing + 1] = e.mod .. ': ' .. def.kind .. ' ~= ' .. e.kind end
    end
    table.sort(missing)
    expect(missing).eq({})
  end)

  it('every native object def comes from the mod (no def outside the inventory)', function()
    local listed = {}
    for _, e in ipairs(INV.objects) do listed[e.native] = true end
    for _, e in ipairs(INV.reworks) do listed[e.native] = true end
    local extra = {}
    for _, def in ipairs(MP.registry.defs()) do
      if not listed[def.key] then extra[#extra + 1] = def.key end
    end
    table.sort(extra)
    expect(extra).eq({})
  end)

  it('stickers, stakes and reworks have their native counterparts', function()
    local K, S, R = MP.content.stickers, MP.content.stakes, MP.registry
    local bad = {}
    for _, e in ipairs(INV.stickers) do
      if not (K.SPRITES and K.SPRITES[e.native]) then bad[#bad + 1] = 'sticker ' .. e.mod end
    end
    for _, e in ipairs(INV.stakes) do
      if not S.get(e.native) then bad[#bad + 1] = 'stake ' .. e.mod end
    end
    for _, e in ipairs(INV.reworks) do
      local def = R.get(e.native)
      if not (def and def.kind == 'Rework' and def.rework.center == e.mod) then bad[#bad + 1] = 'rework ' .. e.native end
    end
    expect(bad).eq({})
  end)

  it('every exclusion names an EX id of the parity doc (or is inert) and really has no native def', function()
    local doc = read('docs/balatro-mp-parity.md')
    local table_part = doc:match('## Excluded.*$')
    expect(table_part ~= nil).truthy()
    local bad = {}
    for _, e in ipairs(INV.excluded) do
      if e.ex ~= 'inert' and not table_part:find('| ' .. e.ex .. ' |', 1, true) then bad[#bad + 1] = e.mod .. ' ' .. e.ex end
      if MP.registry.get(e.mod) or (e.kind == 'Stake' and MP.content.stakes.get(e.mod)) then
        bad[#bad + 1] = e.mod .. ' is excluded but defined'
      end
      if type(e.reason) ~= 'string' or #e.reason < 10 then bad[#bad + 1] = e.mod .. ' has no reason' end
    end
    expect(bad).eq({})
  end)

  it('the EX-15 content is no longer excluded', function()
    for _, e in ipairs(INV.excluded) do expect(e.ex ~= 'EX-15').truthy() end
    for _, key in ipairs({ 'j_mp_mime', 'j_mp_baron', 'b_mp_white' }) do
      expect(MP.registry.get(key) ~= nil).truthy()
    end
  end)
end)

-- ── Mime and Baron on the real vanilla calculate_joker ──────────────────────

describe('rarity-shifted Mime and Baron behave as the vanilla cards', function()
  local vcalc, VMIME, VBARON

  before_each(function()
    MP = CH.boot()
    _G.localize = function(k) return 'L:' .. tostring(k) end
    CH.match({ resolved = { layers = { 'standard', 'experimental' } } })
    vcalc = vanilla_calculate_joker()
    VMIME, VBARON = vanilla_proto('j_mime'), vanilla_proto('j_baron')
  end)
  after_each(H.teardown)

  local function vanilla_card(proto)
    -- the fields Card:set_ability gives every joker (the generic joker_main checks read them)
    return { ability = { name = proto.name, set = proto.set, extra = proto.config.extra, mult = 0, h_mult = 0,
      x_mult = 1, t_mult = 0, t_chips = 0, type = '', h_size = 0, d_size = 0 }, config = { center = proto } }
  end

  local function same(mp_card, v_card, ctx)
    local a = CH.calc(mp_card, ctx)
    local b = vcalc(v_card, ctx)
    if a == nil or b == nil then
      expect(a).eq(b)
      return a
    end
    expect(a.card == mp_card).eq(b.card == v_card)
    a, b = MP.copy(a), MP.copy(b)
    a.card, b.card = nil, nil
    expect(a).eq(b)
    return a
  end

  it('keep the vanilla numbers with the rarity and cost swapped (Balanced)', function()
    local mime, baron = G.P_CENTERS.j_mp_mime, G.P_CENTERS.j_mp_baron
    expect(VMIME.rarity .. '/' .. VMIME.cost).eq('2/5')
    expect(mime.rarity .. '/' .. mime.cost).eq('3/8')
    expect(VBARON.rarity .. '/' .. VBARON.cost).eq('3/8')
    expect(baron.rarity .. '/' .. baron.cost).eq('2/5')
    expect(mime.config.extra).eq(VMIME.config.extra)
    expect(baron.config.extra).eq(VBARON.config.extra)
    expect(mime.config.mp_balanced and baron.config.mp_balanced).eq(true)
    expect(mime.no_collection and baron.no_collection).eq(true)
    expect(mime.pos).eq(VMIME.pos)
    expect(baron.pos).eq(VBARON.pos)
    expect(mime.blueprint_compat and baron.blueprint_compat).eq(true)
  end)

  it('Mime retriggers a held card exactly when vanilla Mime does (mid-hand and at round end)', function()
    local m, v = CH.card('j_mp_mime', G.jokers), vanilla_card(VMIME)
    local king = CH.playing('Spades', 13)
    local cases = {
      { repetition = true, cardarea = G.hand, other_card = king, card_effects = { {} } },
      { repetition = true, cardarea = G.hand, other_card = king, card_effects = { { h_mult = 13 } } },
      { repetition = true, cardarea = G.hand, other_card = king, card_effects = { {}, { x_mult = 1.5 } } },
      { repetition = true, cardarea = G.hand, other_card = king, card_effects = { { h_dollars = 3 } }, end_of_round = true },
      { repetition = true, cardarea = G.hand, other_card = king, card_effects = { {} }, end_of_round = true },
      { repetition = true, cardarea = G.play, other_card = king, card_effects = { { chips = 10 } } },
      { individual = true, cardarea = G.hand, other_card = king },
      { joker_main = true, cardarea = G.jokers },
    }
    local fired = 0
    for _, ctx in ipairs(cases) do
      local r = same(m, v, ctx)
      if r then
        fired = fired + 1
        expect(r.repetitions).eq(1)
        expect(r.message).eq('L:k_again_ex')
      end
    end
    expect(fired).eq(3)
    expect(errors()).eq({})
  end)

  it('Baron gives X1.5 per held King exactly when vanilla Baron does; a debuffed King only flashes', function()
    local b, v = CH.card('j_mp_baron', G.jokers), vanilla_card(VBARON)
    local king, queen = CH.playing('Hearts', 13), CH.playing('Hearts', 12)
    local dking = CH.playing('Clubs', 13)
    dking.debuff = true
    local cases = {
      { individual = true, cardarea = G.hand, other_card = king },
      { individual = true, cardarea = G.hand, other_card = queen },
      { individual = true, cardarea = G.hand, other_card = dking },
      { individual = true, cardarea = G.play, other_card = king },
      { individual = true, cardarea = G.hand, other_card = king, end_of_round = true },
      { repetition = true, cardarea = G.hand, other_card = king, card_effects = { { x_mult = 1.5 } } },
    }
    local results = {}
    for i, ctx in ipairs(cases) do results[i] = same(b, v, ctx) end
    expect(results[1].x_mult).eq(1.5)
    expect(results[2]).eq(nil)
    expect(results[3].message).eq('L:k_debuffed')
    expect(results[3].x_mult).eq(nil)
    expect(results[4]).eq(nil)
    expect(results[5]).eq(nil)
    expect(results[6]).eq(nil)
    expect(errors()).eq({})
  end)

  it('a debuffed Mime or Baron does nothing, as vanilla', function()
    local m, b = CH.card('j_mp_mime', G.jokers), CH.card('j_mp_baron', G.jokers)
    m.debuff, b.debuff = true, true
    local vm, vb = vanilla_card(VMIME), vanilla_card(VBARON)
    vm.debuff, vb.debuff = true, true
    same(m, vm, { repetition = true, cardarea = G.hand, other_card = CH.playing('Spades', 13), card_effects = { { h_mult = 1 } } })
    same(b, vb, { individual = true, cardarea = G.hand, other_card = CH.playing('Spades', 13) })
  end)

  it('Baron shows its X Mult in the description', function()
    local b = CH.card('j_mp_baron', G.jokers)
    local def = MP.registry.get('j_mp_baron')
    expect(def.loc_vars(b)).eq({ 1.5 })
  end)
end)

-- ── availability ────────────────────────────────────────────────────────────

describe('EX-15 availability across every real ResolvedRuleset bundle', function()
  local names = {}
  for name in pairs(RESOLVED) do names[#names + 1] = name end
  table.sort(names)

  before_each(function() MP = H.boot() end)
  after_each(H.teardown)

  local function in_pool(pool, key)
    for _, c in ipairs(pool or {}) do if c.key == key then return true end end
    return false
  end

  for _, name in ipairs(names) do
    it(name .. ': Mime and Baron are never pooled; White only where MP content is pooled', function()
      local case = RESOLVED[name]
      MP.session.mount('match', { resolved = case.resolved, options = case.options, runId = 'r1', me = 'u1',
        seed = 'PARITY1', deck = 'b_red', stake = 1 })
      local R = MP.registry
      expect(R.enabled('j_mp_mime')).eq(false)
      expect(R.enabled('j_mp_baron')).eq(false)
      -- registered all the same: the codec, saves and replays resolve them while mounted
      expect(G.P_CENTERS.j_mp_mime ~= nil and G.P_CENTERS.j_mp_baron ~= nil and G.P_CENTERS.b_mp_white ~= nil).truthy()
      for _, pool in pairs(G.P_JOKER_RARITY_POOLS) do
        expect(in_pool(pool, 'j_mp_mime') or in_pool(pool, 'j_mp_baron')).eq(false)
      end
      local pooled = case.resolved.multiplayerContent == true and case.options.multiplayerJokers == true
      expect(R.enabled('b_mp_white')).eq(pooled)
      expect(in_pool(G.P_CENTER_POOLS.Back, 'b_mp_white')).eq(pooled)
      expect(R.enabled('b_mp_white')).eq(R.enabled('b_mp_violet'))
      MP.session.unmount()
      expect(G.P_CENTERS.j_mp_mime).eq(nil)
      expect(G.P_CENTERS.b_mp_white).eq(nil)
    end)
  end

  it('Practice give-card can hand out Mime and Baron', function()
    MP.session.mount('practice', { resolved = H.resolved({ layers = { 'standard' } }), options = H.options(),
      runId = 'p1', me = 'u1', seed = 'PRAC1', deck = 'b_red', stake = 1 })
    expect(MP.practice.allowed('j_mp_mime')).eq(true)
    expect(MP.practice.allowed('j_mp_baron')).eq(true)
  end)
end)

-- ── White Deck ──────────────────────────────────────────────────────────────

describe('White Deck: the Nemesis deck and Jokers, as of the last PvP Blind', function()
  local W, tabs_seen

  local function install_ui_stand_ins()
    tabs_seen = nil
    G.UIDEF = G.UIDEF or {}
    _G.create_tabs = function(args) tabs_seen = args.tabs; return { tabs = args.tabs } end
    _G.create_UIBox_generic_options = function(args) return args end
    -- vanilla's shape: one create_tabs call over the Full Deck (and Remaining) tabs
    G.UIDEF.deck_info = function(show_remaining)
      local tabs = { { label = 'b_full_deck', chosen = true } }
      if show_remaining then table.insert(tabs, 1, { label = 'b_remaining', chosen = true }) end
      return create_UIBox_generic_options({ contents = { create_tabs({ tabs = tabs, tab_h = 8 }) } })
    end
    G.UIT = G.UIT or {}
    G.UIT.ROOT, G.UIT.O = 0, 4
    G.C.CLEAR, G.C.WHITE = { 0, 0, 0, 0 }, { 1, 1, 1, 1 }
    G.C.UI.TEXT_LIGHT = { 1, 1, 1, 1 }
    G.CARD_W, G.CARD_H = 2, 3
    G.P_CENTERS.c_base = G.P_CENTERS.c_base or { set = 'Default', name = 'Default Base', config = {} }
    G.P_CENTERS.j_joker = G.P_CENTERS.j_joker or { set = 'Joker', name = 'Joker', rarity = 1, order = 1, config = {} }
    -- a callable class, as vanilla's (session wraps hook CardArea.emplace)
    _G.CardArea = setmetatable({ emplace = function(self, c) self.cards[#self.cards + 1] = c end },
      { __call = function(cls) return setmetatable({ cards = {} }, { __index = cls }) end })
    setmetatable(Card, { __call = function(_, _x, _y, _w, _h, front, center)
      local c = setmetatable({ config = {}, base = front or {} }, { __index = Card })
      c:set_ability(center, true)
      return c
    end })
  end

  local function mount(kind)
    install_ui_stand_ins()
    CH.match({ kind = kind })
    W = MP.content.white_deck
  end

  local function deck_reqs()
    local n = 0
    for _, m in ipairs(H.sent('peer')) do if m.d.k == 'deck_req' then n = n + 1 end end
    return n
  end

  before_each(function()
    MP = CH.boot()
    _G.localize = function(k) return 'L:' .. tostring(k) end
  end)
  after_each(function()
    _G.CardArea, _G.create_tabs, _G.create_UIBox_generic_options = nil, nil, nil
    H.teardown()
  end)

  it('is a deck drawn from mp_decks (2,1) with the mod text', function()
    local p = MP.registry.proto('b_mp_white')
    expect(p.set).eq('Back')
    expect(p.atlas).eq('mp_decks')
    expect(p.pos).eq({ x = 2, y = 1 })
    expect(MP.registry.get('b_mp_white').loc.name).eq('White Deck')
  end)

  it('turns the view on in a match only (Practice has no Nemesis)', function()
    mount('match')
    MP.registry.get('b_mp_white').apply()
    expect(G.GAME.modifiers.view_nemesis_deck).eq(true)
    expect(W.active()).eq(true)
    H.teardown()
    MP = CH.boot()
    mount('practice')
    MP.registry.get('b_mp_white').apply()
    expect(G.GAME.modifiers.view_nemesis_deck).eq(nil)
    expect(W.active()).eq(false)
  end)

  it('snapshots the Nemesis Jokers and asks for their deck once per PvP Blind, at its first draw', function()
    mount('match')
    G.GAME.modifiers.view_nemesis_deck = true
    MP.state.player_results = { u2 = { interim = true, jokers = { { key = 'j_joker', edition = 'foil' }, { key = 'j_mp_baron', eternal = true } } } }
    CH.pvp(false)
    G.STATE_COMPLETE = false
    Game.update_draw_to_hand(G, 0)
    expect(G.GAME.mp_white).eq(nil)               -- not a PvP blind
    expect(deck_reqs()).eq(0)
    CH.pvp(true)
    Game.update_draw_to_hand(G, 0)
    expect(G.GAME.mp_white.target).eq('u2')
    expect(G.GAME.mp_white.ante).eq(G.GAME.round_resets.ante)
    expect(G.GAME.mp_white.jokers).eq({ { key = 'j_joker', edition = 'foil' }, { key = 'j_mp_baron', eternal = true } })
    expect(deck_reqs()).eq(1)
    -- later frames of the same blind, and jokers bought since, do not move the snapshot
    MP.state.player_results.u2.jokers = {}
    Game.update_draw_to_hand(G, 0)
    expect(#G.GAME.mp_white.jokers).eq(2)
    expect(deck_reqs()).eq(1)
    -- the deck arrives on the end screen's exchange
    MP.peer.dispatch({ k = 'deck_res', from = 'u2', d = { cards = 'Hearts-Ace--foil-Red;Spades-King---' } })
    local v = W.view()
    expect(v.deck).eq('Hearts-Ace--foil-Red;Spades-King---')
    expect(#W.parse_deck(v.deck)).eq(2)
    expect(W.parse_deck(v.deck)[1]).eq({ key = 'c_base', front = { suit = 'Hearts', rank = 'Ace' }, edition = 'foil', seal = 'Red' })
    expect(errors()).eq({})
  end)

  it('does nothing without the White Deck, in Practice, or on a bye', function()
    mount('match')
    CH.pvp(true)
    G.STATE_COMPLETE = false
    Game.update_draw_to_hand(G, 0)
    expect(G.GAME.mp_white).eq(nil)
    expect(deck_reqs()).eq(0)
    G.GAME.modifiers.view_nemesis_deck = true
    MP.state.pvp.bye = true
    expect(W.snapshot()).eq(nil)
    expect(deck_reqs()).eq(0)
  end)

  it('adds a Nemesis Deck tab to the deck view only while the view is on', function()
    mount('match')
    G.UIDEF.deck_info(true)
    expect(#tabs_seen).eq(2)
    local make = create_tabs
    G.GAME.modifiers.view_nemesis_deck = true
    G.UIDEF.deck_info(true)
    expect(#tabs_seen).eq(3)
    expect(tabs_seen[3].label).eq('L:k_nemesis_deck')
    expect(tabs_seen[3].tab_definition_function == W.tab_def).truthy()
    expect(create_tabs == make).truthy()           -- the swap is undone
    G.UIDEF.deck_info(false)
    expect(#tabs_seen).eq(2)
  end)

  it('the tab waits for the first PvP Blind, then shows the Jokers and the deck by suit', function()
    mount('match')
    G.GAME.modifiers.view_nemesis_deck = true
    local root = W.tab_def()
    expect(root.n).eq(G.UIT.ROOT)
    expect(#root.nodes).eq(1)
    expect(root.nodes[1].nodes[1].config.text).eq('L:rmh_mp_white_waiting')
    G.GAME.mp_white = { ante = 2, target = 'u2', jokers = { { key = 'j_joker' }, { key = 'j_gone_missing' } } }
    MP.state.nemesis_decks = { u2 = 'Hearts-Ace---;Hearts-2---;Spades-King---' }
    root = W.tab_def()
    -- header, jokers, Spades, Hearts
    expect(#root.nodes).eq(4)
    expect(#root.nodes[2].nodes[1].config.object.cards).eq(1) -- unknown keys are skipped
    expect(root.nodes[2].nodes[1].config.object.cards[1].ability.mp_phantom).eq(true)
    expect(#root.nodes[3].nodes[1].config.object.cards).eq(1)
    expect(#root.nodes[4].nodes[1].config.object.cards).eq(2)
    expect(errors()).eq({})
  end)

  it('parse_deck ignores malformed parts and caps the count', function()
    W = MP.content.white_deck
    expect(W.parse_deck(nil)).eq({})
    expect(W.parse_deck(';;-;Hearts-;-Ace')).eq({})
    local many = {}
    for i = 1, 400 do many[i] = 'Hearts-Ace---' end
    expect(#W.parse_deck(table.concat(many, ';'))).eq(W.MAX_CARDS)
  end)

  it('is in the Cocktail pool now (D-24 kept its sticker column)', function()
    install_ui_stand_ins()
    CH.match({})
    local keys = {}
    for _, c in ipairs(MP.content.cocktail.all_decks(true)) do keys[c.key] = true end
    expect(keys.b_mp_white).eq(true)
    expect(MP.content.cocktail.STICKER_COL.b_mp_white).eq(18)
  end)
end)
