-- WS7 content A (L1): consumables, Glass, stickers, blinds, vouchers, stakes, gating, isolation.
local CH = require 'spec.mp_content_helper'

local MP
local function setup(over)
  MP = CH.boot()
  CH.match(over)
end
local function flush() CH.H.fake.flush() end

describe('CN-01 Asteroid', function()
  before_each(function() setup() end)
  after_each(CH.teardown)

  it('is a $3 Planet, always usable, storing one asteroid per use', function()
    local a = CH.card('c_mp_asteroid', G.consumeables)
    expect(G.P_CENTERS.c_mp_asteroid.cost).eq(3)
    expect(G.P_CENTERS.c_mp_asteroid.set).eq('Planet')
    expect(a:can_use_consumeable()).eq(true)
    a:use_consumeable(G.consumeables)
    a:use_consumeable(G.consumeables)
    expect(MP.state.pvp.asteroids).eq(2)
    expect(#CH.called('set_consumeable_usage')).eq(2)
  end)

  it('launches every stored asteroid at the nemesis on the first PvP draw, once', function()
    MP.state.pvp.asteroids = 2
    CH.pvp(true)
    G.STATE_COMPLETE = false
    Game.update_draw_to_hand(G, 0)
    Game.update_draw_to_hand(G, 0)
    local s = CH.syncs('c_mp_asteroid')
    expect(#s).eq(2)
    expect(s[1].d.to).eq('u2')
    expect(MP.state.pvp.asteroids).eq(0)
  end)

  it("the hand text labels the amount 'Amt.' as the mod (k_amount_short), on use and at launch", function()
    local shown = {}
    _G.update_hand_text = function(_, vals) shown[#shown + 1] = vals end
    local a = CH.card('c_mp_asteroid', G.consumeables)
    a:use_consumeable(G.consumeables)
    expect(shown[1].handname).eq('Asteroids')
    expect(shown[1].chips).eq('Amt.')
    shown = {}
    MP.state.pvp.asteroids = 2
    CH.pvp(true)
    expect(MP.content.consumables.launch_asteroids()).eq(2)
    expect(shown[1].chips).eq('Amt.')
    expect(shown[1].mult).eq(2)
    _G.update_hand_text = nil
  end)

  it('keeps the asteroids on a bye', function()
    MP.state.pvp.asteroids = 1
    MP.state.pvp.bye = true
    expect(MP.content.consumables.launch_asteroids()).eq(0)
    expect(MP.state.pvp.asteroids).eq(1)
  end)

  it('the receiver lowers its highest visible hand; ties go by the hand priority', function()
    local h = G.GAME.hands
    h['Pair'].level = 3
    h['Flush'].level = 3
    h['Flush Five'].level = 9            -- invisible: ignored
    CH.receive('c_mp_asteroid', 'u2')
    expect(h['Flush'].level).eq(2)        -- Flush outranks Pair at the same level
    expect(h['Pair'].level).eq(3)
    expect(h['Flush Five'].level).eq(9)
    CH.receive('c_mp_asteroid', 'u2')
    expect(h['Pair'].level).eq(2)
    CH.receive('c_mp_asteroid', 'u3')    -- not my nemesis
    expect(h['Pair'].level).eq(2)
    MP.state.pvp.bye = true
    CH.receive('c_mp_asteroid', 'u2')
    expect(h['Pair'].level).eq(2)
  end)

  it('a hand at level 0 everywhere is left alone', function()
    for _, v in pairs(G.GAME.hands) do v.level = 0 end
    expect(MP.content.consumables.asteroid_target()).eq(nil)
  end)
end)

describe('CN-02 Ouija (standard)', function()
  before_each(function() setup() end)
  after_each(CH.teardown)

  local function fill(n)
    for i = 1, n do
      local c = CH.playing(i % 2 == 0 and 'Hearts' or 'Spades', 2 + i)
      c.playing_card = i
      G.hand:emplace(c)
    end
  end

  it('needs 3 cards in hand', function()
    local o = CH.card('c_mp_ouija_standard', G.consumeables)
    fill(2)
    expect(o:can_use_consumeable()).eq(false)
    fill(1)
    expect(o:can_use_consumeable()).eq(true)
  end)

  it('destroys 3 cards and converts the rest to one rank, with no hand size loss', function()
    local function run()
      local _, G0 = nil, G
      for i = #G0.hand.cards, 1, -1 do G0.hand.cards[i] = nil end
      fill(7)
      local o = CH.card('c_mp_ouija_standard', G.consumeables)
      local destroyed, rank = MP.registry.get('c_mp_ouija_standard').use(o, G.consumeables)
      flush()
      local ids = {}
      for _, c in ipairs(destroyed) do ids[#ids + 1] = c.playing_card end
      return ids, rank
    end
    G.GAME.pseudorandom.seed = 'OUIJA1'
    local ids, rank = run()
    expect(#ids).eq(3)
    expect(#G.hand.cards).eq(4)
    local want = G.P_CARDS['H_' .. rank].id
    for _, c in ipairs(G.hand.cards) do expect(c.base.id).eq(want) end
    expect(G.hand.config.card_limit).eq(8)   -- no hand size loss
    expect(G.P_CENTERS.c_mp_ouija_standard.config.mp_balanced).eq(true)
  end)
end)

describe('CN-03 Wraith (rework)', function()
  before_each(function() setup({ resolved = { layers = { 'standard', 'wraith_rework' } } }) end)
  after_each(CH.teardown)

  it('creates an Uncommon joker and gives $5', function()
    local w = CH.card('c_mp_wraith', G.consumeables)
    expect(w:can_use_consumeable()).eq(true)
    G.GAME.dollars = 20
    w:use_consumeable(G.consumeables)
    flush()
    local cc = CH.called('create_card')
    expect(#cc).eq(1)
    expect(cc[1][2]).eq('Joker')
    expect(G.GAME.dollars).eq(25)
    expect(#G.jokers.cards).eq(1)
    expect(MP.registry.enabled('c_mp_wraith')).eq(true)
  end)

  it('needs joker room', function()
    local w = CH.card('c_mp_wraith', G.consumeables)
    G.jokers.config.card_limit = 0
    expect(w:can_use_consumeable()).eq(false)
  end)
end)

describe('consumable text', function()
  before_each(function() setup() end)
  after_each(CH.teardown)

  it('renders MP consumables through their own loc_vars (Other alias)', function()
    G.localization.descriptions.Planet.c_mp_asteroid = { name = 'Asteroid', text = { 'x' } }
    generate_card_ui(G.P_CENTERS.c_mp_asteroid, nil, nil, 'Planet', {})
    local c = CH.called('generate_card_ui')
    expect(c[#c][3]).eq('Other')
    expect(c[#c][4]).eq({ 1 })
    expect(G.localization.descriptions.Other.c_mp_asteroid == G.localization.descriptions.Planet.c_mp_asteroid).truthy()
    generate_card_ui(G.P_CENTERS.c_mercury, nil, nil, 'Planet', {})
    c = CH.called('generate_card_ui')
    expect(c[#c][3]).eq('Planet')
  end)
end)

describe('EN-01 Glass rework', function()
  after_each(CH.teardown)

  local function glass(layers)
    MP = CH.boot()
    CH.match({ resolved = { layers = layers } })
    return G.P_CENTERS.m_glass.config
  end

  it('standard / classic / wsob: X1.5, 1 in 4, Balanced', function()
    for _, l in ipairs({ 'standard', 'classic', 'wsob' }) do
      local cfg = glass({ l })
      expect(cfg.Xmult).eq(1.5)
      expect(cfg.extra).eq(4)
      expect(cfg.mp_balanced).eq(true)
      CH.teardown()
    end
  end)

  it('sandbox: 1 in 3, and wins when both are active (Chaos); unmount restores vanilla', function()
    local cfg = glass({ 'standard', 'sandbox' })
    expect(cfg.Xmult).eq(1.5)
    expect(cfg.extra).eq(3)
    MP.session.unmount('t')
    expect(G.P_CENTERS.m_glass.config).eq({ Xmult = 2, extra = 4 })
  end)

  it('untouched in rulesets without the rework (vanilla, experimental bans it)', function()
    expect(glass({ 'experimental' })).eq({ Xmult = 2, extra = 4 })
  end)
end)

describe('SK stickers', function()
  before_each(function()
    setup({ resolved = { layers = { 'experimental' } } })
    G.GAME.modifiers.mp_sticker_persistent = true
    G.GAME.modifiers.mp_sticker_unreliable = true
    G.GAME.modifiers.mp_sticker_draining = true
  end)
  after_each(CH.teardown)

  it('applies only the enabled families to listed jokers', function()
    local chad = CH.card('j_hanging_chad', G.jokers)   -- in all three lists
    expect(chad.ability.mp_sticker_persistent).eq(true)
    expect(chad.ability.mp_sticker_unreliable).eq(true)
    expect(chad.ability.mp_sticker_draining).eq(true)
    local j = CH.card('j_joker', G.jokers)
    expect(MP.content.stickers.of(j)).eq({})
    G.GAME.modifiers.mp_sticker_draining = nil
    local anc = CH.card('j_ancient', G.jokers)          -- persistent + draining lists
    expect(anc.ability.mp_sticker_persistent).eq(true)
    expect(anc.ability.mp_sticker_draining).eq(nil)
    local rw = CH.card('j_mp_hanging_chad', G.jokers)   -- reworks are not listed
    expect(MP.content.stickers.of(rw)).eq({ 'mp_sticker_balanced' })
  end)

  it("Persistent: the round-end popup says 'Cost Up' as the mod (k_cost_up), and the price rises", function()
    local msgs = {}
    _G.card_eval_status_text = function(_, _, _, _, _, extra) msgs[#msgs + 1] = extra end
    local chad = CH.card('j_hanging_chad', G.jokers)
    local before = MP.content.stickers.sell_price(chad)
    MP.content.stickers.round_end_cost(chad)
    flush()
    expect(msgs[1].message).eq('Cost Up')
    expect(MP.content.stickers.sell_price(chad) > before).truthy()
    _G.card_eval_status_text = nil
  end)

  it('Unreliable: no calculation at all on the final hand', function()
    local c = CH.card('j_abstract', G.jokers)
    G.GAME.current_round.hands_left = 0
    expect(CH.calc(c, { vanilla_probe = true })).eq(nil)
    G.GAME.current_round.hands_left = 1
    expect(CH.calc(c, { vanilla_probe = true })).eq('vanilla')
  end)

  it('Draining: X0.75 in joker_main, combined with the joker own effect', function()
    G.GAME.modifiers.mp_sticker_unreliable = nil
    G.GAME.modifiers.mp_sticker_persistent = nil
    local c = CH.card('j_ticket', G.jokers)
    expect(CH.calc(c, { joker_main = true }).Xmult_mod).eq(0.75)
    MP.state.session.resolved = CH.H.resolved({ layers = { 'standard' }, multiplayerContent = true })
    local lgg = CH.card('j_mp_lets_go_gambling', G.jokers)
    G.GAME.modifiers.mp_sticker_draining = true
    lgg.ability.mp_sticker_draining = true
    CH.roll({ j_mp_lets_go_gambling = 0.1 })
    CH.pvp(false)
    expect(CH.calc(lgg, { joker_main = true }).Xmult_mod).eq(3)
    expect(CH.calc(c, { joker_main = true, blueprint = true })).eq(nil)
  end)

  it('Persistent: eternal except for selling, +$3 per round, selling costs the price', function()
    G.GAME.modifiers.mp_sticker_unreliable = nil
    G.GAME.modifiers.mp_sticker_draining = nil
    local c = CH.card('j_ticket', G.jokers)
    c:set_cost()
    expect(c.ability.eternal).eq(true)
    expect(c:can_sell_card()).eq(true)
    CH.calc(c, { end_of_round = true })
    CH.calc(c, { end_of_round = true, blueprint = true })
    expect(c.ability.mp_extra_sell_price).eq(3)
    expect(c.ability.mp_sell_price).eq(5)
    expect(c.sell_cost_label).eq(5)
    local e = { config = { ref_table = c } }
    G.GAME.dollars = 4
    G.FUNCS.can_sell_card(e)
    expect(e.config.button).eq(nil)
    G.GAME.dollars = 5
    G.FUNCS.can_sell_card(e)
    expect(e.config.button).eq('sell_card')
    expect(e.config.colour).eq(G.C.RED)
    c:sell_card()
    expect(G.GAME.dollars).eq(0)
    -- a really eternal joker is never sellable
    local d = CH.card('j_joker', G.jokers)
    d.ability.eternal = true
    expect(d:can_sell_card()).eq(false)
  end)

  it('HUD-22: badges and tooltips (specific Balanced text when the loc has it)', function()
    G.localization.descriptions.Other.mp_sticker_balanced = { name = 'Balanced' }
    G.localization.descriptions.Other.mp_sticker_balanced_j_mp_hanging_chad = { name = 'Balanced' }
    G.localization.descriptions.Other.mp_sticker_persistent = { name = 'Persistent' }
    G.localization.descriptions.Other.mp_internal_sell_value = { name = 'Sell Value' }
    local rw = CH.card('j_mp_hanging_chad', G.jokers)
    local ui = rw:generate_UIBox_ability_table()
    expect(ui.badges[#ui.badges]).eq('mp_sticker_balanced')
    local calls = CH.called('generate_card_ui')
    expect(calls[#calls][2]).eq('mp_sticker_balanced_j_mp_hanging_chad')
    local p = CH.card('j_ticket', G.jokers)
    p:set_cost()
    local ui2 = p:generate_UIBox_ability_table()
    local has = MP.set_of(ui2.badges)
    expect(has.mp_sticker_persistent).eq(true)
    expect(has.eternal).eq(nil)
    expect(G.BADGE_COL.mp_sticker_balanced).eq({ 0.675, 0.196, 0.196, 1 })
    local tips = MP.content.stickers.tooltips(p)
    expect(tips[#tips].key).eq('mp_internal_sell_value')
    expect(tips[#tips].vars).eq({ p.ability.mp_sell_price })
  end)

  it('Extra Credit badge comes from the def flag', function()
    local c = CH.card('j_joker', G.jokers)
    c.ability.mp_extra_credit = true
    expect(MP.content.stickers.of(c)).eq({ 'mp_sticker_extra_credit' })
  end)

  it('phantoms never get stickers', function()
    local c = setmetatable({ config = {}, base = {}, ability = { mp_phantom = true } }, { __index = Card })
    MP.content.stickers.apply(c, G.P_CENTERS.j_hanging_chad)
    expect(c.ability.mp_sticker_persistent).eq(nil)
  end)
end)

describe('BL-01..03 blinds', function()
  before_each(function() setup() end)
  after_each(CH.teardown)

  it('defines the Nemesis blind ($5, mult 1, #AC3232, never a boss roll) and the Manhunt chips', function()
    local n = G.P_BLINDS.bl_mp_nemesis
    expect(n.dollars).eq(5)
    expect(n.mult).eq(1)
    expect(n.boss.showdown).eq(false)                     -- a boss table vanilla can read ...
    expect(n.boss.min > 1000).truthy()                     -- ... that no boss roll reaches
    expect(n.boss_colour).eq({ 0.675, 0.196, 0.196, 1 })
    expect(n.atlas).eq('mp_player_blind_chip')
    expect(G.P_BLINDS.bl_mp_manhunt_hunter.atlas).eq('mp_manhunt_hunter_blind_chip')
    expect(G.P_BLINDS.bl_mp_manhunt_runner.atlas).eq('mp_manhunt_runner_blind_chip')
  end)

  it('chip: the opponent colour, showdown at <= 1 life each, Manhunt reskins', function()
    local B = MP.content.blinds
    local chip = B.chip()
    expect(chip.blind_key).eq('bl_small')            -- u2 has blindCol 2
    expect(chip.atlas).eq('mp_player_blind_col')
    MP.state.lives = { u1 = 1, u2 = 1 }
    chip = B.chip()
    expect(chip.blind_key).eq('bl_final_bell')
    expect(chip.pos).eq({ x = 0, y = 26 })
    expect(chip.showdown).eq(true)
    G.STATE = G.STATES.ROUND_EVAL
    expect(B.chip().showdown).eq(false)
    expect(B.colour_index(99)).eq(1)
    expect(B.colour_index('x')).eq(1)
    MP.state.session.shape.manhunt = true
    MP.state.my_team = 'RUNNER'
    expect(B.chip().blind_key).eq('bl_mp_manhunt_hunter')
    MP.state.my_team = 'HUNTER'
    expect(B.chip().blind_key).eq('bl_mp_manhunt_runner')
  end)
end)

describe('VO-01/02 Manhunt vouchers', function()
  after_each(CH.teardown)

  it('are pooled only in Manhunt', function()
    setup()
    expect(MP.registry.enabled('v_mp_hieroglyph_manhunt')).eq(false)
    CH.teardown()
    setup({ shape = { manhunt = true } })
    expect(MP.registry.enabled('v_mp_hieroglyph_manhunt')).eq(true)
    expect(MP.registry.enabled('v_mp_petroglyph_manhunt')).eq(true)
    expect(G.P_CENTERS.v_mp_petroglyph_manhunt.requires).eq({ 'v_mp_hieroglyph_manhunt' })
  end)

  it('Hieroglyph: -1 ante, -1 hand; the Runner reports redeem_ante_voucher', function()
    setup({ shape = { manhunt = true } })
    MP.state.my_team = 'RUNNER'
    G.GAME.round_resets.ante = 3
    Card.apply_to_run(nil, G.P_CENTERS.v_mp_hieroglyph_manhunt)
    expect(G.GAME.round_resets.ante).eq(2)
    expect(G.GAME.round_resets.hands).eq(3)
    expect(CH.H.events('redeem_ante_voucher')[1]).eq({ t = 'redeem_ante_voucher' })
    expect(#CH.called('vanilla_apply_to_run')).eq(0)
  end)

  it('Petroglyph: -1 discard; a Hunter reports nothing; vanilla vouchers fall through', function()
    setup({ shape = { manhunt = true } })
    MP.state.my_team = 'HUNTER'
    Card.apply_to_run(nil, G.P_CENTERS.v_mp_petroglyph_manhunt)
    expect(G.GAME.round_resets.discards).eq(2)
    expect(#CH.H.events('redeem_ante_voucher')).eq(0)
    Card.apply_to_run(nil, G.P_CENTERS.v_overstock_norm)
    expect(#CH.called('vanilla_apply_to_run')).eq(1)
  end)

  it('text: the vanilla voucher text plus the Runner line (D-21)', function()
    setup({ shape = { manhunt = true } })
    G.localization.descriptions.Voucher.v_hieroglyph = { name = 'Hieroglyph' }
    generate_card_ui(G.P_CENTERS.v_mp_hieroglyph_manhunt, nil, nil, 'Voucher', {})
    local c = CH.called('generate_card_ui')
    expect(c[#c][3]).eq('Other')
    expect(c[#c][4]).eq({ 1 })
    expect(c[#c][5][1].config.text).eq('Runner: every Hunter gains a life')
  end)
end)

describe('ST-01..03 stakes', function()
  before_each(function() setup() end)
  after_each(CH.teardown)

  it('lists the three MP stakes, then the seven alt stakes (EX-16), matching the modifiers WS6 applies', function()
    local S = MP.content.stakes
    expect(#S.LIST).eq(10)
    local ids = {}
    for i, e in ipairs(S.LIST) do ids[i] = e.id end
    expect(ids).eq({ 'planet', 'spectral', 'spectralplus', 'plastic', 'pebble', 'ferrite', 'pyrite', 'jade',
      'crystal', 'antimatter' })
    expect(S.get('spectral').key).eq('stake_mp_spectral')
    expect(S.get('stake_mp_spectralplus').shiny).eq(true)
    expect(S.check()).eq(true)
    expect(S.current()).eq(nil)
    MP.state.session.mpStake = 'planet'
    expect(S.current().pos).eq({ x = 0, y = 0 })
    expect(S.name(S.get('planet'))).eq('Planet Stake')
  end)
end)

describe('content A gating and isolation', function()
  after_each(CH.teardown)

  local CORE = { 'j_mp_defensive_joker', 'j_mp_skip_off', 'j_mp_lets_go_gambling', 'j_mp_speedrun',
    'j_mp_conjoined_joker', 'j_mp_penny_pincher', 'j_mp_taxes', 'j_mp_pizza', 'j_mp_pacifist', 'c_mp_asteroid' }

  it('core content is pooled only with MP content and the multiplayerJokers option', function()
    setup()
    for _, k in ipairs(CORE) do expect(MP.registry.enabled(k) and k).eq(k) end
    CH.teardown()
    setup({ options = { multiplayerJokers = false } })
    for _, k in ipairs(CORE) do expect(MP.registry.enabled(k)).eq(false) end
    CH.teardown()
    setup({ resolved = { layers = {}, multiplayerContent = false } })
    for _, k in ipairs(CORE) do expect(MP.registry.enabled(k)).eq(false) end
  end)

  it('Conjoined Joker is off in sandbox; reworks follow their layers', function()
    setup({ resolved = { layers = { 'sandbox' } } })
    expect(MP.registry.enabled('j_mp_conjoined_joker')).eq(false)
    expect(MP.registry.enabled('j_mp_pizza')).eq(true)
    expect(MP.registry.enabled('j_mp_hanging_chad')).eq(true)
    expect(MP.registry.enabled('j_mp_idol_rare')).eq(false)
    expect(MP.registry.enabled('c_mp_wraith')).eq(false)
    CH.teardown()
    setup({ resolved = { layers = { 'standard' } } })
    expect(MP.registry.enabled('j_mp_turtle_bean')).eq(true)
    expect(MP.registry.enabled('j_mp_ticket_experimental')).eq(false)
    CH.teardown()
    setup({ resolved = { layers = { 'experimental' } } })
    expect(MP.registry.enabled('j_mp_idol_rare')).eq(true)
    expect(MP.registry.enabled('j_mp_todo_list')).eq(true)
    expect(MP.registry.enabled('j_mp_ticket_experimental')).eq(true)
    expect(MP.registry.enabled('j_mp_turtle_bean')).eq(false)
    CH.teardown()
    setup({ resolved = { layers = { 'majorleague' }, multiplayerContent = false } })
    expect(MP.registry.enabled('j_mp_bloodstone')).eq(true)
    expect(MP.registry.enabled('j_mp_pizza')).eq(false)
  end)

  it('mount/unmount with every WS7 object leaves the vanilla tables byte-identical', function()
    MP = CH.boot()
    local before = CH.H.fingerprint()
    local cfg = {}
    for k, v in pairs(G.P_CENTERS.m_glass.config) do cfg[k] = v end
    for _, layers in ipairs({ { 'standard', 'pvp_timer' }, { 'experimental' }, { 'standard', 'sandbox' },
      { 'wraith_rework', 'standard' }, { 'classic' } }) do
      CH.match({ resolved = { layers = layers }, shape = { manhunt = true } })
      expect(#MP.registry.leaked_keys() > 0).truthy()
      MP.session.unmount('t')
      expect(MP.registry.leaked_keys()).eq({})
      expect(CH.H.fingerprint()).eq(before)
      expect(G.P_CENTERS.m_glass.config).eq(cfg)
    end
  end)

  it('session wraps are gone after unmount', function()
    setup()
    expect(MP.hooks.is_wrapped(_G, 'get_current_pool', 'content.core.pincher_pool')).truthy()
    MP.session.unmount('t')
    expect(MP.hooks.is_wrapped(_G, 'get_current_pool', 'content.core.pincher_pool')).falsy()
    expect(MP.hooks.is_wrapped(Card, 'calculate_joker', 'content.stickers.calculate_joker')).falsy()
  end)
end)
