-- Score Preview (M03; B06, B07, G10) on the REAL base-game scoring with the MP pack mounted
-- (spec/mp_preview_world.lua): the preview equals the score and money the hand then really makes,
-- min/max bracket every random effect, a preview changes no game state and advances no random
-- stream, preview_disabled and the forced rulesets switch it off, and the timer layers set its
-- delay and cost.

local PW = require 'spec.mp_preview_world'
local H = require 'spec.mp_helper'
local J = require 'rmh/json'

local MP, SIM, PV

local function boot(o)
  MP = PW.boot(o)
  PV = require 'rmh_mp.preview'
  SIM = PV.sim
  PV.set('preview', true)
  PV.install()
  return MP
end

--- Preview, then play for real; returns the preview and the real (score, dollars).
local function preview_then_play()
  local d = SIM.run()
  assert(d, 'no preview: ' .. tostring((MP.log_ring[#MP.log_ring] or {}).msg))
  local s, m = PW.play()
  return d, s, m
end

-- A hand: cards are { suit, rank, enhancement?, opts? }; `sel` = indices played; jokers = keys or
-- { key, opts }.
local function deal(spec)
  local cards = {}
  for i, c in ipairs(spec.cards) do cards[i] = PW.card(c[1], c[2], c[3], c[4]) end
  for _, j in ipairs(spec.jokers or {}) do
    if type(j) == 'table' then PW.joker(j[1], j[2]) else PW.joker(j) end
  end
  if spec.blind then PW.blind(spec.blind) end
  G.E_MANAGER:clear_queue() -- add_to_deck's visual follow-ups
  if spec.setup then spec.setup(cards) end
  local sel = {}
  for _, i in ipairs(spec.sel) do sel[#sel + 1] = cards[i] end
  PW.select(sel)
  return cards
end

local HAND5 = {
  { 'H', 'K' }, { 'S', 'K' }, { 'D', 'K' }, { 'C', '4' }, { 'H', '9' }, { 'S', '2' }, { 'D', 'Q', 'm_steel' },
  { 'C', 'J', 'm_gold' },
}

-- Deterministic scenarios: preview min = exact = max = the real score and money.
local FIXED = {
  { name = 'three of a kind, Joker + Greedy', cards = HAND5, sel = { 1, 2, 3 }, jokers = { 'j_joker', 'j_greedy_joker' } },
  { name = 'flush with a red seal, a mult and a bonus card',
    cards = { { 'H', '2', 'm_mult', { seal = 'Red' } }, { 'H', '5', 'm_bonus' }, { 'H', '8' }, { 'H', 'T' },
      { 'H', 'A' }, { 'S', '3' } },
    sel = { 1, 2, 3, 4, 5 }, jokers = { 'j_droll', 'j_lusty_joker' } },
  { name = 'held steel + Baron, gold seal money', cards = HAND5, sel = { 1, 2 },
    jokers = { 'j_baron', 'j_shoot_the_moon' }, setup = function(c) c[1].seal = 'Gold' end },
  { name = 'scaling jokers mutate in `before` (Ride the Bus, Green, Square, Runner, Spare Trousers)',
    cards = { { 'H', '4' }, { 'S', '5' }, { 'D', '6' }, { 'C', '7' }, { 'H', '8' }, { 'S', '8' } },
    sel = { 1, 2, 3, 4, 5 }, jokers = { 'j_ride_the_bus', 'j_green_joker', 'j_square', 'j_runner', 'j_trousers' } },
  { name = 'card-changing jokers (Midas Mask, Vampire, Hiker) and a held gold card', cards = HAND5, sel = { 1, 2, 3 },
    jokers = { 'j_midas_mask', 'j_hiker', 'j_vampire' } },
  { name = 'editions: foil/holo/poly cards and a polychrome Blueprint copying Supernova',
    cards = { { 'H', 'Q', nil, { edition = { foil = true } } }, { 'S', 'Q', nil, { edition = { holo = true } } },
      { 'D', 'Q', nil, { edition = { polychrome = true } } }, { 'C', '3' } },
    sel = { 1, 2, 3 }, jokers = { { 'j_blueprint', { edition = { polychrome = true } } }, 'j_supernova', 'j_card_sharp' } },
  { name = 'Acrobat on the last hand, Bull with money', cards = HAND5, sel = { 5 }, jokers = { 'j_acrobat', 'j_bull' },
    setup = function() G.GAME.current_round.hands_left = 1 end },
  { name = 'The Flint halves the base', cards = HAND5, sel = { 1, 2 }, jokers = { 'j_joker' }, blind = 'bl_flint' },
  { name = 'The Tooth takes $1 per played card', cards = HAND5, sel = { 1, 2, 3, 4 }, blind = 'bl_tooth' },
  { name = 'The Psychic debuffs a 2-card hand (Matador pays)', cards = HAND5, sel = { 1, 2 }, blind = 'bl_psychic',
    jokers = { 'j_matador' } },
  { name = 'The Arm levels the hand down', cards = HAND5, sel = { 1, 2 }, blind = 'bl_arm',
    setup = function() level_up_hand(nil, 'Pair', true, 2) end },
  { name = 'Plasma Deck balances chips and mult', cards = HAND5, sel = { 1, 2, 3 }, jokers = { 'j_joker' },
    setup = function() G.GAME.selected_back = Back(G.P_CENTERS.b_plasma) end },
  { name = 'MP: Pacifist (off PvP), Defensive Joker, Taxes, Hanging Chad, Seltzer',
    cards = HAND5, sel = { 1, 2, 3 },
    jokers = { 'j_mp_pacifist', 'j_mp_defensive_joker', 'j_mp_taxes', 'j_mp_hanging_chad', 'j_mp_seltzer' },
    setup = function() MP.state.lives.u1 = 2; MP.state.enemy.lives = 4 end },
  { name = 'MP: Conjoined Joker on the PvP blind', cards = HAND5, sel = { 1, 2 }, blind = 'bl_mp_nemesis',
    jokers = { 'j_mp_conjoined_joker', 'j_mp_pacifist' } },
}

describe('preview equals the real scored hand (vanilla scoring, MP pack mounted)', function()
  after_each(function() PW.teardown() end)

  for _, sc in ipairs(FIXED) do
    it(sc.name, function()
      boot()
      deal(sc)
      local d, s, m = preview_then_play()
      expect(d.score.exact).eq(s)
      expect(d.score.min).eq(s)
      expect(d.score.max).eq(s)
      expect(d.dollars.exact).eq(m)
      expect(d.dollars.min).eq(m)
      expect(d.dollars.max).eq(m)
    end)
  end

  it('a plain pair scores (10 + 10 + 10) x 2, x1.5 for the held Steel Queen, and names the hand', function()
    boot()
    deal({ cards = HAND5, sel = { 1, 2 } })
    local d, s = preview_then_play()
    expect(d.hand).eq('Pair')
    expect(s).eq(90)
    expect(d.score.exact).eq(90)
  end)
end)

-- Random scenarios: exact = the real result (same seed, same streams), min <= real <= max, and the
-- range is real (min < max) once over the seeds.
local RANDOM = {
  { name = 'Lucky cards (mult and money)', cards = { { 'H', '9', 'm_lucky' }, { 'S', '9', 'm_lucky' }, { 'D', '2' } },
    sel = { 1, 2 } },
  { name = 'Misprint', cards = HAND5, sel = { 1, 2 }, jokers = { 'j_misprint' } },
  { name = 'Bloodstone and Business Card', cards = { { 'H', 'K' }, { 'H', 'Q' }, { 'H', 'J' }, { 'S', '2' } },
    sel = { 1, 2, 3 }, jokers = { 'j_bloodstone', 'j_business' } },
  { name = 'Space Joker levels the hand before scoring', cards = HAND5, sel = { 1, 2 }, jokers = { 'j_space' } },
  { name = 'Glass cards (the shatter roll moves no score this hand; Glass Joker)', same = true,
    cards = { { 'H', '7', 'm_glass' }, { 'S', '7', 'm_glass' } }, sel = { 1, 2 }, jokers = { 'j_glass' } },
  { name = "MP: Let's Go Gambling and the MP Bloodstone", cards = { { 'H', 'A' }, { 'H', '5' }, { 'S', '2' } },
    sel = { 1, 2 }, jokers = { 'j_mp_lets_go_gambling', 'j_mp_bloodstone' } },
}

describe('min / max bracket every random effect; exact is the real roll', function()
  after_each(function() PW.teardown() end)

  for _, sc in ipairs(RANDOM) do
    it(sc.name, function()
      local spread = false
      for i = 1, 6 do
        boot({ seed = 'SEED' .. i })
        deal(sc)
        local d, s, m = preview_then_play()
        expect(d.score.exact).eq(s)
        expect(d.dollars.exact).eq(m)
        expect(d.score.min <= s and s <= d.score.max).truthy()
        expect(d.dollars.min <= m and m <= d.dollars.max).truthy()
        if d.score.min < d.score.max or d.dollars.min < d.dollars.max then spread = true end
        PW.teardown()
      end
      expect(spread).eq(not sc.same)
    end)
  end

  it('Oops! All 6s makes a 1-in-2 certain: min = max', function()
    boot()
    deal({ cards = { { 'H', 'K' }, { 'H', 'Q' }, { 'S', '2' } }, sel = { 1, 2 }, jokers = { 'j_oops', 'j_bloodstone' } })
    local d = SIM.run()
    expect(d.score.min).eq(d.score.max)
  end)

  it('The Hook: exact is the real discard roll; min/max cover every pair it could take', function()
    for i = 1, 4 do
      boot({ seed = 'HOOK' .. i })
      deal({ cards = { { 'H', 'K' }, { 'S', 'K' }, { 'D', 'K', 'm_steel' }, { 'C', 'K', 'm_steel' }, { 'H', '2' },
        { 'S', '3' } }, sel = { 1, 2 }, jokers = { 'j_baron' }, blind = 'bl_hook' })
      local d, s = preview_then_play()
      expect(d.score.exact).eq(s)
      expect(d.score.min <= s and s <= d.score.max).truthy()
      expect(d.score.min < d.score.max).truthy() -- losing both steel Kings vs none
      PW.teardown()
    end
  end)
end)

describe('a preview changes nothing and draws from no stream', function()
  after_each(function() PW.teardown() end)

  local ALL = {}
  for _, sc in ipairs(FIXED) do ALL[#ALL + 1] = sc end
  for _, sc in ipairs(RANDOM) do ALL[#ALL + 1] = sc end
  ALL[#ALL + 1] = { name = 'The Hook', cards = HAND5, sel = { 1, 2 }, jokers = { 'j_baron', 'j_castle' }, blind = 'bl_hook' }
  ALL[#ALL + 1] = { name = 'DNA on the first hand', cards = HAND5, sel = { 7 }, jokers = { 'j_dna' } }

  for _, sc in ipairs(ALL) do
    it(sc.name .. ': G, the cards, MP.state, streams, events, UI and the wire are untouched', function()
      boot()
      deal(sc)
      local before = PW.fingerprint()
      local sent = #H.sent()
      local calls = 0
      local real_random, real_seed = math.random, math.randomseed
      math.random = function(...) calls = calls + 1; return real_random(...) end
      math.randomseed = function(...) calls = calls + 1; return real_seed(...) end
      PW.reset_calls()
      local d = SIM.run()
      local after = PW.fingerprint()
      math.random, math.randomseed = real_random, real_seed
      expect(d ~= nil).truthy()
      expect(calls).eq(0)            -- the game's generator is never stepped or reseeded
      expect(after).eq(before)       -- G.GAME (pseudorandom streams included), blind, areas, cards, MP.state
      expect(#H.sent()).eq(sent)     -- nothing reaches the transport
      for _, name in ipairs(PW.UI) do expect(PW.calls(name)).eq(0) end
      expect(PW.calls('set_hand_usage')).eq(0)
    end)
  end

  it('two peers on one seed, one previewing every selection: the same play, the same state after', function()
    local function session(preview)
      boot({ seed = 'PEERS' })
      local cards = deal({ cards = { { 'H', '9', 'm_lucky' }, { 'S', '9', 'm_glass' }, { 'H', 'K' }, { 'D', 'K' },
        { 'C', '3' } }, sel = { 1, 2 }, jokers = { 'j_misprint', 'j_mp_lets_go_gambling', 'j_bloodstone' } })
      if preview then
        for _, sel in ipairs({ { 3, 4 }, { 1 }, { 1, 2, 3 }, { 1, 2 } }) do
          local pick = {}
          for _, i in ipairs(sel) do pick[#pick + 1] = cards[i] end
          PW.select(pick)
          SIM.run()
        end
      end
      local s, m = PW.play()
      local fp = PW.fingerprint()
      local draw = math.random()
      PW.teardown()
      return s, m, fp, draw
    end
    local s1, m1, f1, r1 = session(false)
    local s2, m2, f2, r2 = session(true)
    expect(s2).eq(s1)
    expect(m2).eq(m1)
    if f2 ~= f1 then
      local a, b = {}, {}
      for l in f1:gmatch('[^\n]+') do a[l] = true end
      for l in f2:gmatch('[^\n]+') do b[l] = true end
      for l in pairs(a) do if not b[l] then print('only plain:   ' .. l) end end
      for l in pairs(b) do if not a[l] then print('only preview: ' .. l) end end
    end
    expect(f2 == f1).truthy()
    expect(r2).eq(r1)
  end)

  it('restores even when scoring raises', function()
    boot()
    deal({ cards = HAND5, sel = { 1, 2 } })
    local before = PW.fingerprint()
    local orig = G.FUNCS.evaluate_play
    G.FUNCS.evaluate_play = function() G.GAME.dollars = 999; error('boom') end
    expect(SIM.play('exact')).eq(nil)
    G.FUNCS.evaluate_play = orig
    expect(PW.fingerprint()).eq(before)
  end)

  it('no preview without a selection, with a face-down card, or outside a hand', function()
    boot()
    local cards = deal({ cards = HAND5, sel = {} })
    expect(SIM.run()).eq(nil)
    PW.select({ cards[1] })
    cards[1].facing = 'back'
    expect(SIM.run()).eq(nil)
    cards[1].facing = 'front'
    G.STATE = G.STATES.SHOP
    expect(SIM.run()).eq(nil)
    G.STATE = G.STATES.SELECTING_HAND
    expect(SIM.run() ~= nil).truthy()
  end)
end)

-- ── Setting, lobby option, forced rulesets ──────────────────────────────────

local FIX
local function fixture(name)
  if not FIX then
    local f = assert(io.open(((RMH_SPEC and RMH_SPEC.root) or '') .. 'lib/balatro/mp/__fixtures__/rulesets-resolved.json', 'rb'))
    FIX = J.decode(f:read('*a'))
    f:close()
  end
  return FIX[name]
end

local function hud_def()
  return { n = 1, config = {}, nodes = { { n = 2, config = { id = 'hand_text_area' }, nodes = { { n = 3, config = {}, nodes = {} } } } } }
end

local function wait(sec) for _ = 1, math.floor(sec * 60 + 0.5) do PW.fake.advance(1 / 60) end end

local tree = function() return require 'rmh_mp.util.tree' end

describe('availability: setting, preview_disabled, forced rulesets', function()
  after_each(function() PW.teardown() end)

  it('off by default (B06); the setting turns the HUD rows on', function()
    MP = PW.boot()
    PV = require 'rmh_mp.preview'
    PV.install()
    G.SETTINGS.rmh_mp = nil
    expect(PV.setting('preview')).eq(false)
    expect(PV.active()).falsy()
    local def = hud_def()
    expect(PV.patch_hud(def)).falsy()
    expect(MP.hooks.count('session') > 0).truthy()
    expect(MP.hooks.is_wrapped(CardArea or {}, 'update', 'preview.order')).falsy() -- off: no wraps
    expect(MP.hooks.is_wrapped(_G, 'create_UIBox_HUD', 'preview.hud')).falsy()
    expect(PV.set('preview', true)).truthy()
    PV.install()
    expect(MP.hooks.is_wrapped(G.FUNCS, 'play_cards_from_highlighted', 'preview.play')).truthy()
    expect(G.SETTINGS.rmh_mp.preview).eq(true)
    expect(PV.patch_hud(def)).truthy()
    expect(tree().contains_id(def, 'mp_preview')).truthy()
    expect(tree().find_button(def, 'rmh_mp_preview_calculate') ~= nil).truthy()
    expect(PV.patch_hud(def)).falsy() -- once
  end)

  it('previewDisabled switches it off for the match', function()
    boot({ options = { previewDisabled = true } })
    expect(PV.active()).falsy()
    expect(PV.patch_hud(hud_def())).falsy()
    expect(PV.calculate()).falsy()
  end)

  it('Major League and Sandbox force previewDisabled; Balanced does not', function()
    for name, off in pairs({ ruleset_mp_majorleague = true, ruleset_mp_sandbox = true, ruleset_mp_balanced = false }) do
      local case = fixture(name)
      boot({ resolved = case.resolved, options = case.options })
      expect(case.options.previewDisabled).eq(off)
      expect(PV.active()).eq(not off)
      PW.teardown()
    end
  end)

  it('practice has it; replays and spectating do not', function()
    boot({ kind = 'practice' })
    expect(PV.active()).truthy()
    PW.teardown()
    boot({ kind = 'replay' })
    expect(PV.active()).falsy()
  end)

  it('customization (B07): the two texts only, validated and saved; the button is always red', function()
    boot()
    expect(PV.label('button')).eq('Calculate Score')
    expect(PV.label('text')).eq('CALCULATING')
    expect(PV.set('preview_button', 'Go')).truthy()
    expect(PV.set('preview_text', 'Thinking')).truthy()
    expect(PV.set('preview_text', string.rep('x', 26))).falsy()
    -- the mod's customization is text-only: no button colour setting
    expect(PV.set('preview_colour', 'BLUE')).falsy()
    expect(PV.label('button')).eq('Go')
    expect(PV.label('text')).eq('Thinking')
    local def = hud_def()
    PV.patch_hud(def)
    local btn = tree().find_button(def, 'rmh_mp_preview_calculate')
    expect(btn.config.colour).eq(G.C.RED)
    expect(btn.nodes[1].nodes[1].config.text).eq('Go')
  end)

  it("no money readout: the HUD rows carry the score and the button only (the mod's money node is dead code)", function()
    boot()
    local def = hud_def()
    expect(PV.patch_hud(def)).truthy()
    expect(tree().find_id(def, 'mp_preview_dollars')).eq(nil)
    local score = tree().find_id(def, 'mp_preview_score')
    local ids = {}
    for i, n in ipairs(score.nodes) do ids[i] = n.config.id end
    expect(ids).eq({ 'mp_preview_l', 'mp_preview_m', 'mp_preview_r' })
    deal({ cards = HAND5, sel = { 1, 2 }, jokers = { 'j_bull' } })
    PV.calculate()
    expect(PV.state).eq('shown')
    expect(PV.data.dollars ~= nil).truthy()
    expect(PV.text.dollars).eq(nil)
    for _, v in pairs(PV.text) do expect(tostring(v):find('%$')).eq(nil) end
  end)
end)

-- ── Timer layers (G10) and the request lifecycle ────────────────────────────

local function timed(mode, enabled)
  return H.resolved({ layers = { 'standard' }, timer = { enabled = enabled ~= false, base = 150, increment = 60,
    forgiveness = 0, pvpBase = nil, pvpHandIncrement = 0, mode = mode, pressurePlusHand = 0, countdown = 3, mult = 1 } })
end

describe('timer layers: delay and cost', function()
  after_each(function() PW.teardown() end)

  it('per layer (the mod: pressure / no_animation 1.5 s + 3.5 s, speedlatro and default 5 s free)', function()
    for mode, want in pairs({ pressure = { 1.5, 3.5 }, no_animation = { 1.5, 3.5 }, speedlatro = { 5, 0 },
      default = { 5, 0 } }) do
      boot({ resolved = timed(mode) })
      local dl, cost = PV.delay_cost()
      expect(dl).eq(want[1])
      expect(cost).eq(want[2])
      PW.teardown()
    end
  end)

  it('no delay or cost with the timer off, in practice, or on the PvP blind', function()
    boot({ resolved = timed('pressure', false) })
    expect(select(2, PV.delay_cost())).eq(0)
    expect(PV.delay_cost()).eq(0)
    PW.teardown()
    boot({ resolved = timed('pressure'), kind = 'practice' })
    expect(PV.delay_cost()).eq(0)
    PW.teardown()
    boot({ resolved = timed('pressure'), blind = 'bl_mp_nemesis' })
    expect(PV.delay_cost()).eq(0)
  end)

  it('pressure: CALCULATING for 1.5 s real time, then the numbers and one timer_input preview', function()
    boot({ resolved = timed('pressure') })
    local cards = deal({ cards = HAND5, sel = { 1, 2 } })
    H.sent_list = {}
    expect(PV.calculate()).truthy()
    expect(PV.state).eq('calculating')
    expect(PV.text.m).eq(' CALCULATING ')
    expect(PV.calculate()).falsy() -- one request at a time
    wait(1.4)
    expect(PV.state).eq('calculating')
    -- A selection change while calculating does not cancel (the mod's no_interrupt).
    PV.stop(true)
    expect(PV.state).eq('calculating')
    wait(0.2)
    expect(PV.state).eq('shown')
    expect(PV.text.l).eq('90')
    local ti = H.sent('timer_input')
    expect(#ti).eq(1)
    expect(ti[1].d.op).eq('preview')
    expect(require('rmh_mp.protocol').validate('l2j', 'timer_input', ti[1].d)).truthy()
    -- A selection change now clears the shown numbers.
    PV.stop(true)
    expect(PV.state).eq('idle')
    expect(PV.text.l).eq('')
    local _ = cards
  end)

  it('the default ante timer: 5 s, free (no timer_input)', function()
    boot({ resolved = timed('default') })
    deal({ cards = HAND5, sel = { 1, 2 } })
    H.sent_list = {}
    PV.calculate()
    wait(4.9)
    expect(PV.state).eq('calculating')
    wait(0.2)
    expect(PV.state).eq('shown')
    expect(#H.sent('timer_input')).eq(0)
  end)

  it('a play, a discard (not The Hook\'s) or a consumable cancels a pending request and clears the numbers', function()
    boot({ resolved = timed('default') })
    deal({ cards = HAND5, sel = { 1, 2 } })
    local function through(owner, name, ...)
      local orig = MP.hooks.swap_original(owner, name, function() end)
      owner[name](...)
      MP.hooks.swap_original(owner, name, orig)
    end
    through(G.FUNCS, 'play_cards_from_highlighted') -- idle: nothing to stop
    PV.calculate()
    through(G.FUNCS, 'play_cards_from_highlighted')
    expect(PV.state).eq('idle')
    wait(6)
    expect(PV.state).eq('idle')
    expect(PV.data).eq(nil)
    PV.calculate()
    through(G.FUNCS, 'discard_cards_from_highlighted', nil, true)
    expect(PV.state).eq('calculating')
    through(G.FUNCS, 'discard_cards_from_highlighted', nil, nil)
    expect(PV.state).eq('idle')
    PV.calculate()
    through(Card, 'use_consumeable', G.jokers.cards[1] or PW.joker('j_joker'))
    expect(PV.state).eq('idle')
  end)

  it('a range renders as min - max; a winning score is flagged', function()
    boot()
    deal({ cards = HAND5, sel = { 1, 2 }, jokers = { 'j_misprint' } })
    PV.calculate()
    expect(PV.state).eq('shown')
    expect(PV.text.m).eq(' - ')
    expect(tonumber(PV.text.l) < tonumber(PV.text.r)).truthy()
    G.GAME.blind.chips = 1
    expect(PV.enough(PV.data.score.min)).truthy()
    G.GAME.blind.chips = 10 ^ 9
    expect(PV.enough(PV.data.score.max)).falsy()
  end)
end)

-- ── The settings row (B06 toggle, B07 texts and colour) on the real UI builders ─

describe('Multiplayer settings: the Score Preview row', function()
  local UH
  before_each(function()
    UH = require 'spec.mp_ui_helper'
    MP = UH.boot()
    MP.open('menu')
  end)
  after_each(function() UH.teardown() end)

  it("the settings row carries the mod's credit line, restart note and tooltip", function()
    MP.ui.settings.open()
    local def = UH.overlay()
    expect(UH.find(def, 'mp_set_preview_credit').config.text).eq('*Credit to @Fantom, @Divvy')
    expect(UH.find(def, 'mp_set_preview_restart').config.text).eq('*Requires a restart to take effect')
    expect(UH.find(def, 'mp_set_preview_credit').config.colour).eq(G.C.UI.TEXT_INACTIVE)
    local tip = UH.find(def, 'mp_set_preview_tip').config.on_demand_tooltip.text
    expect(tip).eq({ 'This will enable score preview before playing a hand', '*Credit to @Fantom, @Divvy' })
    -- and "Show Multiplayer content anyway*" explains its asterisk the same way
    expect(UH.find(def, 'mp_set_show_mp_tip').config.on_demand_tooltip.text)
      .eq({ '*Applies in singleplayer and vanilla rulesets' })
  end)

  it('toggle and the two texts (no colour cycle); each stored in the profile settings', function()
    PV = MP.preview
    expect(PV ~= nil).truthy()
    MP.ui.settings.open()
    local def = UH.overlay()
    for _, id in ipairs({ 'mp_set_preview', 'mp_set_preview_text', 'mp_set_preview_button' }) do
      expect(UH.find(def, id) ~= nil).truthy()
    end
    expect(UH.find(def, 'mp_set_preview_colour')).eq(nil)
    expect(UH.has_text(def, 'Enable Score Preview')).truthy()
    expect(PV.setting('preview')).eq(false)
    expect(UH.toggle(def, 'mp_set_preview')).eq(true)
    expect(G.SETTINGS.rmh_mp.preview).eq(true)
    expect(UH.saved >= 1).truthy()
    -- The old rows are all still there.
    for _, id in ipairs({ 'mp_set_layout', 'mp_set_timer_sound', 'mp_set_show_mp', 'mp_set_chat' }) do
      expect(UH.find(def, id) ~= nil).truthy()
    end
  end)

  it('the Advanced lobby options carry Disable Score Preview', function()
    local TH = require 'rmh_mp.ui.theme'
    local found
    for _, o in ipairs(TH.ADVANCED_OPTIONS) do if o.key == 'previewDisabled' then found = o end end
    expect(found ~= nil).truthy()
    expect(found.label).eq('b_opts_disable_preview')
  end)
end)
