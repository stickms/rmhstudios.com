-- WS8 content B (L1): one block per sandbox / inactive / Extra Credit joker — its spec numbers
-- and the contexts it answers (A2 §2.4, §2.5), through the real dispatch wraps.

local CH = require 'spec.mp_content_helper'
local B = require 'spec.mp_content_b_helper'
local H = CH.H

local MP
local function setup()
  MP = B.boot()
  B.mount_ruleset('ruleset_mp_sandbox')
end
local function flush() H.fake.flush() end
local function card(key, area) return CH.card(key, area or G.jokers) end
local function calc(c, ctx) return c:calculate_joker(ctx) end
local function lv(c) return MP.registry.get(c.config.center.key).loc_vars(c) end
local function main(extra)
  local ctx = { joker_main = true, cardarea = G.jokers }
  for k, v in pairs(extra or {}) do ctx[k] = v end
  return ctx
end
local function before(scoring, full, extra)
  local ctx = { before = true, cardarea = G.jokers, scoring_hand = scoring or {}, full_hand = full or scoring or {} }
  for k, v in pairs(extra or {}) do ctx[k] = v end
  return ctx
end
local function indiv(pc, scoring) return { individual = true, cardarea = G.play, other_card = pc, scoring_hand = scoring or { pc } } end
local function rep(pc, scoring) return { repetition = true, cardarea = G.play, other_card = pc, scoring_hand = scoring or { pc } } end
local function round_end() return { end_of_round = true, game_over = false } end
local function straight() return { Straight = { { 1 } } } end
local function no_straight() return { Straight = {} } end
local function boss(on) G.GAME.blind = { get_type = function() return on and 'Boss' or 'Small' end } end

-- ── In rotation ─────────────────────────────────────────────────────────────

describe('J-20 Misprint (sandbox)', function()
  before_each(setup)
  after_each(B.teardown)

  it('rolls normal x (-23..46) once on purchase and scores it every hand', function()
    CH.roll({ misprint_sandbox = 10 })
    local c = card('j_mp_misprint_sandbox')
    expect(c.ability.extra.mult).eq(10)
    expect(calc(c, main()).mult_mod).eq(10)
    CH.roll({ misprint_sandbox = -23 })
    c:remove_from_deck(true)
    c:add_to_deck(true)
    expect(c.ability.extra.mult).eq(10) -- fixed for life
    local neg = card('j_mp_misprint_sandbox')
    expect(calc(neg, main()).mult_mod).eq(-23)
  end)

  it('doubles with Oops! All 6s and turns the text green', function()
    G.GAME.probabilities.normal = 2
    CH.roll({ misprint_sandbox = 7 })
    local c = card('j_mp_misprint_sandbox')
    expect(c.ability.extra.mult).eq(14)
    expect(lv(c).colours[1]).eq(G.C.GREEN)
  end)

  it('HUD-23: the value is hidden outside the owned jokers (shop, collection)', function()
    CH.roll({ misprint_sandbox = 5 })
    local c = card('j_mp_misprint_sandbox')
    expect(lv(c)[1]).eq(5)
    local shop = card('j_mp_misprint_sandbox', G.shop_jokers)
    expect(lv(shop)[1]).eq(MP.content.ANTI_PEEK_TEXT)
    c.area = nil
    expect(lv(c)[1]).eq(MP.content.ANTI_PEEK_TEXT)
  end)
end)

describe('J-21 Castle (sandbox)', function()
  before_each(setup)
  after_each(B.teardown)

  it('locks the suit on purchase and gains +10 chips per discarded card of it', function()
    G.GAME.current_round.castle_card = { suit = 'Hearts' }
    local c = card('j_mp_castle_sandbox')
    G.GAME.current_round.castle_card = { suit = 'Spades' }
    expect(c.ability.extra.suit).eq('Hearts')
    expect(calc(c, { discard = true, other_card = B.pc('Hearts', '4') }).message).eq('Upgrade!')
    expect(calc(c, { discard = true, other_card = B.pc('Spades', '4') })).eq(nil)
    local d = B.pc('Hearts', '4')
    d.debuff = true
    expect(calc(c, { discard = true, other_card = d })).eq(nil)
    expect(calc(c, { discard = true, other_card = B.pc('Hearts', '9'), blueprint = 1 })).eq(nil)
    expect(calc(c, main()).chip_mod).eq(10)
    expect(lv(c)[2]).eq(10)
  end)
end)

describe('J-22 Mail-in Rebate (sandbox)', function()
  before_each(setup)
  after_each(B.teardown)

  it('$5 per discarded card of the rank locked on purchase', function()
    G.GAME.current_round.mail_card = { rank = 'Jack', id = 11 }
    local c = card('j_mp_mail_sandbox')
    G.GAME.current_round.mail_card = { rank = 'King', id = 13 }
    calc(c, { discard = true, other_card = B.pc('Hearts', 'Jack') })
    calc(c, { discard = true, other_card = B.pc('Hearts', 'King') })
    expect(G.GAME.dollars).eq(5)
    expect(lv(c)).eq({ 5, 'Jack' })
  end)
end)

describe('J-23 Square Joker (sandbox)', function()
  before_each(setup)
  after_each(B.teardown)

  it('starts at +64, +16 per 4-card hand, and only scores 4-card hands', function()
    local c = card('j_mp_square_sandbox')
    local four = { B.pc('Hearts', '2'), B.pc('Hearts', '3'), B.pc('Hearts', '4'), B.pc('Hearts', '5') }
    expect(calc(c, main({ full_hand = four })).chip_mod).eq(64)
    calc(c, before(four))
    expect(c.ability.extra.chips).eq(80)
    calc(c, before({ four[1] }))
    calc(c, before(four, four, { blueprint = 1 }))
    expect(c.ability.extra.chips).eq(80)
    expect(calc(c, main({ full_hand = { four[1], four[2], four[3] } }))).eq(nil)
    expect(calc(c, main({ full_hand = four })).chip_mod).eq(80)
  end)
end)

describe('J-24 Throwback (sandbox)', function()
  before_each(setup)
  after_each(B.teardown)

  it('X(1 + 0.25/skip + owned): a skip adds X0.75, an unskipped round loses it', function()
    local c = card('j_mp_throwback_sandbox')
    G.GAME.skips = 2
    expect(calc(c, main()).Xmult_mod).eq(1.5)
    calc(c, { skip_blind = true })
    expect(calc(c, main()).Xmult_mod).eq(2.25)
    expect(calc(c, round_end())).eq(nil) -- the round after a skip keeps the bonus
    expect(c.ability.extra.owned_skip_mult).eq(0.75)
    expect(calc(c, round_end()).colour).eq(G.C.RED)
    expect(c.ability.extra.owned_skip_mult).eq(0)
    expect(calc(c, round_end())).eq(nil) -- floor 0
    G.GAME.skips = 0
    expect(calc(c, main())).eq(nil)
  end)
end)

describe('J-25 Vampire (sandbox)', function()
  before_each(setup)
  after_each(B.teardown)

  it('turns scoring enhanced cards to Stone for +X0.2 each; otherwise Stone cards pay $3', function()
    local c = card('j_mp_vampire_sandbox')
    local m, s, plain = B.pc('Hearts', '5', 'm_mult'), B.pc('Hearts', '6', 'm_stone'), B.pc('Hearts', '7')
    calc(c, before({ m, s, plain }))
    flush()
    expect(m.config.center.key).eq('m_stone')
    expect(c.ability.extra.Xmult).eq(1.2)
    expect(G.GAME.dollars).eq(0) -- exclusive: converted this hand, so no stone money
    calc(c, before({ m, s, plain }))
    expect(G.GAME.dollars).eq(6)
    expect(calc(c, main()).Xmult_mod).eq(1.2)
    local d = B.pc('Hearts', '8', 'm_gold')
    d.debuff = true
    calc(c, before({ d }))
    expect(d.config.center.key).eq('m_gold')
  end)
end)

describe('J-26 Steel Joker (sandbox)', function()
  before_each(setup)
  after_each(B.teardown)

  it('retriggers played Steel cards once', function()
    local c = card('j_mp_steel_joker_sandbox')
    expect(calc(c, rep(B.pc('Hearts', '5', 'm_steel'))).repetitions).eq(1)
    expect(calc(c, rep(B.pc('Hearts', '5')))).eq(nil)
    expect(calc(c, { repetition = true, cardarea = G.hand, other_card = B.pc('Hearts', '5', 'm_steel') })).eq(nil)
  end)
end)

describe('J-27 Baseball Card (sandbox)', function()
  before_each(setup)
  after_each(B.teardown)

  it('each Uncommon joker gives X2', function()
    local c = card('j_mp_baseball_sandbox')
    local unc = card('j_mp_throwback_sandbox')
    local com = card('j_joker')
    expect(calc(c, { other_joker = unc }).Xmult_mod).eq(2)
    expect(calc(c, { other_joker = com })).eq(nil)
    expect(calc(c, { other_joker = c })).eq(nil)
  end)
end)

describe('J-28 Hit the Road (sandbox)', function()
  before_each(setup)
  after_each(B.teardown)

  it('+X0.75 per discarded Jack, destroying it; the gain never resets', function()
    local c = card('j_mp_hit_the_road_sandbox')
    local eff = calc(c, { discard = true, other_card = B.pc('Hearts', 'Jack') })
    expect(eff.remove).eq(true)
    calc(c, { discard = true, other_card = B.pc('Spades', 'Jack') })
    calc(c, { discard = true, other_card = B.pc('Spades', 'Queen') })
    calc(c, round_end())
    expect(calc(c, main()).Xmult_mod).eq(2.5)
  end)
end)

describe('J-29 Golden Ticket (sandbox)', function()
  before_each(setup)
  after_each(B.teardown)

  it('scored Gold cards: 1 in 2 for $5', function()
    local c = card('j_mp_golden_ticket_sandbox')
    CH.roll({ j_mp_golden_ticket_sandbox = 0.4 })
    expect(calc(c, indiv(B.pc('Hearts', '5', 'm_gold'))).dollars).eq(5)
    expect(G.GAME.dollar_buffer).eq(5)
    CH.roll({ j_mp_golden_ticket_sandbox = 0.6 })
    expect(calc(c, indiv(B.pc('Hearts', '5', 'm_gold')))).eq(nil)
    CH.roll({ j_mp_golden_ticket_sandbox = 0.1 })
    expect(calc(c, indiv(B.pc('Hearts', '5')))).eq(nil)
    expect(lv(c)).eq({ 5, 1, 2 })
  end)
end)

describe('J-30/31 the idols', function()
  before_each(setup)
  after_each(B.teardown)

  it('Zealot: scored cards of the round rank give X1.5; buying it bans and dissolves the Collector', function()
    G.GAME.current_round.zealot_idol = { id = 5, rank = '5' }
    local shop_col = card('j_mp_idol_sandbox_collector', G.shop_jokers)
    local z = card('j_mp_idol_sandbox_zealot')
    expect(G.GAME.banned_keys.j_mp_idol_sandbox_collector).eq(true)
    expect(shop_col.dissolved).eq(true)
    expect(calc(z, indiv(B.pc('Clubs', '5'))).x_mult).eq(1.5)
    expect(calc(z, indiv(B.pc('Clubs', '6')))).eq(nil)
  end)

  it("Collector: the deck's most common card gives X(1 + 0.05 per copy); ties by suit then rank", function()
    B.deck({ { 'Hearts', '5' }, { 'Hearts', '5' }, { 'Hearts', '5' }, { 'Spades', 'King' }, { 'Clubs', 'Ace', 'm_stone' },
      { 'Clubs', 'Ace', 'm_stone' }, { 'Clubs', 'Ace', 'm_stone' }, { 'Clubs', 'Ace', 'm_stone' } })
    local col = card('j_mp_idol_sandbox_collector')
    expect(G.GAME.banned_keys.j_mp_idol_sandbox_zealot).eq(true)
    expect(calc(col, indiv(B.pc('Hearts', '5'))).x_mult).near(1.15)
    expect(calc(col, indiv(B.pc('Spades', '5')))).eq(nil)
    B.deck({ { 'Hearts', '5' }, { 'Hearts', '5' }, { 'Spades', '9' }, { 'Spades', '9' } })
    local mc = MP.sandbox.most_common_card()
    expect({ mc.suit, mc.rank, mc.count }).eq({ 'Spades', '9', 2 })
    local v = lv(col)
    expect({ v[1], v[2] }).eq({ '9', 'Spades' })
    expect(v[3]).near(1.1)
  end)
end)

-- ── Out of rotation (D-28) ─────────────────────────────────────────────────

describe('J-32…J-44 inactive sandbox jokers', function()
  before_each(setup)
  after_each(B.teardown)

  it('Bloodstone: 1 in 3 for X2 per scored Heart', function()
    local c = card('j_mp_bloodstone_sandbox')
    CH.roll({ j_mp_bloodstone_sandbox = 0.3 })
    expect(calc(c, indiv(B.pc('Hearts', '5'))).x_mult).eq(2)
    expect(calc(c, indiv(B.pc('Spades', '5')))).eq(nil)
    CH.roll({ j_mp_bloodstone_sandbox = 0.34 })
    expect(calc(c, indiv(B.pc('Hearts', '5')))).eq(nil)
  end)

  it('Cloud 9: $min(9s, 4) + $2 per 9 beyond 4; scored cards 1 in 4 become a 9', function()
    local c = card('j_mp_cloud_9_sandbox')
    B.deck({ { 'Hearts', '9' }, { 'Hearts', '9' }, { 'Hearts', '9' }, { 'Hearts', '9' }, { 'Spades', '9' }, { 'Clubs', '9' } })
    expect(c:calculate_dollar_bonus()).eq(8)
    B.deck({ { 'Hearts', '9' } })
    expect(c:calculate_dollar_bonus()).eq(1)
    B.deck({})
    expect(c:calculate_dollar_bonus()).eq(nil)
    local pc = B.pc('Hearts', 'King')
    CH.roll({ j_mp_cloud_9_sandbox = 0.2 })
    calc(c, indiv(pc))
    expect(pc:get_id()).eq(9)
    expect(pc.base.suit).eq('Hearts')
  end)

  it('Constellation: +X0.2 per Planet used, -X0.2 per round (floor X1)', function()
    local c = card('j_mp_constellation_sandbox')
    local planet = { ability = { set = 'Planet' } }
    calc(c, { using_consumeable = true, consumeable = planet })
    calc(c, { using_consumeable = true, consumeable = { ability = { set = 'Tarot' } } })
    expect(calc(c, main()).Xmult_mod).near(1.2)
    calc(c, round_end())
    calc(c, round_end())
    expect(c.ability.extra.Xmult).eq(1)
    expect(calc(c, main())).eq(nil)
  end)

  it('Faceless: $15 when one discard holds a Jack, a Queen and a King', function()
    local c = card('j_mp_faceless_sandbox')
    local fh = { B.pc('Hearts', 'Jack'), B.pc('Hearts', 'Queen'), B.pc('Hearts', 'King') }
    expect(calc(c, { discard = true, other_card = fh[1], full_hand = fh })).eq(nil)
    calc(c, { discard = true, other_card = fh[3], full_hand = fh })
    expect(G.GAME.dollars).eq(15)
    local no_k = { fh[1], fh[2] }
    expect(calc(c, { discard = true, other_card = no_k[2], full_hand = no_k })).eq(nil)
  end)

  it('Juggler: +3 hand size, -1 per hand under 5 cards, extinct at 0', function()
    local size = G.hand.config.card_limit
    local c = card('j_mp_juggler_sandbox')
    expect(G.hand.config.card_limit).eq(size + 3)
    local three = { B.pc('Hearts', '2'), B.pc('Hearts', '3'), B.pc('Hearts', '4') }
    calc(c, before(three))
    calc(c, before({ 1, 2, 3, 4, 5 }))
    expect(G.hand.config.card_limit).eq(size + 2)
    calc(c, before(three))
    local eff = calc(c, before(three))
    expect(eff.message).eq('Extinct!')
    expect(G.hand.config.card_limit).eq(size)
    c:remove_from_deck()
    expect(G.hand.config.card_limit).eq(size)
  end)

  it('Loyalty Card: X6 on every 4th consecutive play of its hand; another hand resets', function()
    local c = card('j_mp_loyalty_card_sandbox')
    expect(c.ability.extra.poker_hand ~= nil).truthy()
    c.ability.extra.poker_hand = 'Pair'
    for _ = 1, 3 do calc(c, before({}, {}, { scoring_name = 'Pair' })); expect(calc(c, main())).eq(nil) end
    calc(c, before({}, {}, { scoring_name = 'Pair' }))
    expect(calc(c, main()).Xmult_mod).eq(6)
    expect(c.ability.extra.loyalty_remaining).eq(4)
    calc(c, before({}, {}, { scoring_name = 'Pair' }))
    expect(calc(c, before({}, {}, { scoring_name = 'Flush' })).message).eq('Reset')
    expect(c.ability.extra.loyalty_remaining).eq(4)
  end)

  it('Lucky Cat: +X0.25 per Lucky trigger; 1 in 4 the card turns Glass', function()
    local c = card('j_mp_lucky_cat_sandbox')
    local pc = B.pc('Hearts', '5', 'm_lucky')
    expect(calc(c, indiv(pc))).eq(nil)
    pc.lucky_trigger = true
    CH.roll({ j_lucky_cat_mp_sandbox = 0.1 })
    calc(c, indiv(pc))
    expect(pc.config.center.key).eq('m_glass')
    CH.roll({ j_lucky_cat_mp_sandbox = 0.5 })
    local pc2 = B.pc('Hearts', '6', 'm_lucky')
    pc2.lucky_trigger = true
    calc(c, indiv(pc2))
    expect(pc2.config.center.key).eq('m_lucky')
    expect(calc(c, main()).Xmult_mod).eq(1.5)
  end)

  it('Magnet: active after 2 rounds, sold -> copies the nemesis best-selling joker; gone after 5', function()
    local c = card('j_mp_magnet_sandbox')
    expect(calc(c, round_end()).message).eq('1/2')
    expect(calc(c, round_end()).message).eq('Active!')
    calc(c, { selling_self = true })
    local req = CH.syncs('j_mp_magnet_sandbox')
    expect(#req).eq(1)
    expect(req[1].d.data).eq({ type = 'request' })
    expect(req[1].d.to).eq('u2')
    -- The nemesis answers with a serialized copy; only that answer is accepted, once.
    local built = {}
    MP.card.build = function(sc, area) built[#built + 1] = sc; return { area = area } end
    CH.receive('j_mp_magnet_sandbox', 'u3', { type = 'response', card = { k = 'j_joker' } })
    CH.receive('j_mp_magnet_sandbox', 'u2', { type = 'response', card = { k = 'j_joker' } })
    CH.receive('j_mp_magnet_sandbox', 'u2', { type = 'response', card = { k = 'j_joker' } })
    expect(#built).eq(1)
    for _ = 1, 4 do calc(c, round_end()) end
    expect(c.ability.mp_consumed).eq(true)
  end)

  it('Magnet receiver: answers its nemesis with the highest sell-cost joker', function()
    MP.card.serialize = function(cd) return { k = cd.config.center.key } end
    local a = card('j_joker')
    local b = card('j_mp_baseball_sandbox')
    a.sell_cost, b.sell_cost = 2, 4
    H.sent_list = {}
    CH.receive('j_mp_magnet_sandbox', 'u3', { type = 'request' })
    expect(#CH.syncs('j_mp_magnet_sandbox')).eq(0)
    CH.receive('j_mp_magnet_sandbox', 'u2', { type = 'request' })
    local out = CH.syncs('j_mp_magnet_sandbox')
    expect(#out).eq(1)
    expect(out[1].d.data).eq({ type = 'response', card = { k = 'j_mp_baseball_sandbox' } })
    expect(out[1].d.to).eq('u2')
    expect(MP.registry.proto('j_mp_magnet_sandbox').blueprint_compat).eq(false)
  end)

  it('The Order: X3 on Straights, +X0.5 per consecutive Straight, reset otherwise', function()
    local c = card('j_mp_order_sandbox')
    expect(calc(c, main({ poker_hands = no_straight() }))).eq(nil)
    calc(c, before({}, {}, { poker_hands = straight() }))
    calc(c, before({}, {}, { poker_hands = straight() }))
    expect(calc(c, main({ poker_hands = straight() })).Xmult_mod).eq(4)
    calc(c, before({}, {}, { poker_hands = no_straight() }))
    expect(c.ability.extra.Xmult).eq(3)
  end)

  it('Photograph: X4 for the scored face card only when exactly one face card scores', function()
    local c = card('j_mp_photograph_sandbox')
    local k, q, five = B.pc('Hearts', 'King'), B.pc('Hearts', 'Queen'), B.pc('Hearts', '5')
    expect(calc(c, indiv(k, { k, five })).x_mult).eq(4)
    expect(calc(c, indiv(five, { k, five }))).eq(nil)
    expect(calc(c, indiv(k, { k, q }))).eq(nil)
  end)

  it('Ride the Bus: +1, +2 … +5 Mult per faceless hand; a scoring face card destroys it', function()
    local c = card('j_mp_ride_the_bus_sandbox')
    local seq = {}
    for _ = 1, 6 do calc(c, before({ B.pc('Hearts', '5') })); seq[#seq + 1] = c.ability.extra.mult end
    expect(seq).eq({ 1, 3, 6, 10, 15, 20 })
    expect(calc(c, main()).mult_mod).eq(20)
    expect(calc(c, before({ B.pc('Hearts', 'Jack') })).message).eq('Extinct!')
    expect(calc(c, main())).eq(nil)
  end)

  it('Runner: +50 chips per Straight; scores only on Straights', function()
    local c = card('j_mp_runner_sandbox')
    calc(c, before({}, {}, { poker_hands = straight() }))
    calc(c, before({}, {}, { poker_hands = no_straight() }))
    expect(calc(c, main({ poker_hands = straight() })).chip_mod).eq(50)
    expect(calc(c, main({ poker_hands = no_straight() }))).eq(nil)
  end)

  it('Satellite: $1 +$1 per Planet; loses min($, 2) at shop end; pays at round end', function()
    local c = card('j_mp_satellite_sandbox')
    expect(c:calculate_dollar_bonus()).eq(1)
    calc(c, { using_consumeable = true, consumeable = { ability = { set = 'Planet' } } })
    calc(c, { using_consumeable = true, consumeable = { ability = { set = 'Planet' } } })
    expect(c:calculate_dollar_bonus()).eq(3)
    calc(c, { ending_shop = true })
    expect(c:calculate_dollar_bonus()).eq(1)
    calc(c, { ending_shop = true })
    expect(c:calculate_dollar_bonus()).eq(nil)
    calc(c, { ending_shop = true })
    expect(c.ability.extra.dollars).eq(0)
  end)
end)

-- ── Extra Credit ────────────────────────────────────────────────────────────

describe('J-46…J-71 Extra Credit jokers', function()
  before_each(setup)
  after_each(B.teardown)

  it('carry the Extra Credit sticker flag', function()
    local c = card('j_mp_forklift_sandbox')
    expect(c.ability.mp_extra_credit).eq(true)
  end)

  it('Forklift: +2 consumable slots while held', function()
    local n = G.consumeables.config.card_limit
    local c = card('j_mp_forklift_sandbox')
    flush()
    expect(G.consumeables.config.card_limit).eq(n + 2)
    c:remove_from_deck()
    flush()
    expect(G.consumeables.config.card_limit).eq(n)
  end)

  it('Double Rainbow: retriggers Lucky cards (held ones only with an effect)', function()
    local c = card('j_mp_doublerainbow_sandbox')
    local lucky = B.pc('Hearts', '5', 'm_lucky')
    expect(calc(c, rep(lucky)).repetitions).eq(1)
    expect(calc(c, rep(B.pc('Hearts', '5')))).eq(nil)
    local held = { repetition = true, cardarea = G.hand, other_card = lucky, card_effects = { {} } }
    expect(calc(c, held)).eq(nil)
    held.card_effects = { { h_mult = 2 } }
    expect(calc(c, held).repetitions).eq(1)
  end)

  it('Starfruit: first hand 1 in 2 to level up; 5 uses (copies do not spend)', function()
    local c = card('j_mp_starfruit_sandbox')
    CH.roll({ j_mp_starfruit_sandbox = 0.4 })
    expect(calc(c, before()).level_up).eq(true)
    expect(c.ability.extra.uses).eq(4)
    calc(c, before({}, {}, { blueprint = 1 }))
    expect(c.ability.extra.uses).eq(4)
    G.GAME.current_round.hands_played = 1
    expect(calc(c, before())).eq(nil)
    G.GAME.current_round.hands_played = 0
    CH.roll({ j_mp_starfruit_sandbox = 0.6 })
    for _ = 1, 3 do calc(c, before()) end
    local eff = calc(c, before())
    expect(eff.message).eq('Eaten!')
    expect(c.ability.mp_consumed).eq(true)
  end)

  it('Pocket Aces: +$2 per scored Ace to the payout, reset after the Boss', function()
    local c = card('j_mp_pocketaces_sandbox')
    calc(c, indiv(B.pc('Hearts', 'Ace')))
    calc(c, indiv(B.pc('Spades', 'Ace')))
    calc(c, indiv(B.pc('Spades', 'King')))
    calc(c, (function() local x = indiv(B.pc('Clubs', 'Ace')); x.blueprint = 1; return x end)())
    boss(false)
    expect(c:calculate_dollar_bonus()).eq(4)
    expect(c:calculate_dollar_bonus()).eq(4)
    boss(true)
    expect(c:calculate_dollar_bonus()).eq(4)
    expect(c:calculate_dollar_bonus()).eq(nil)
  end)

  it('Warlock: an armed hand destroys one scoring Lucky card for a random Spectral', function()
    local c = card('j_mp_warlock_sandbox')
    local l1, l2, plain = B.pc('Hearts', '5', 'm_lucky'), B.pc('Hearts', '6', 'm_lucky'), B.pc('Hearts', '7')
    local scoring = { plain, l1, l2 }
    calc(c, before(scoring))
    CH.roll({ j_mp_warlock_sandbox = 0.14 }) -- just under 1 in 7
    calc(c, indiv(l1, scoring))
    expect(c.ability.extra.succeed).eq(true)
    CH.roll({ warlock_target = 2 })
    local hits = {}
    for _, pc in ipairs(scoring) do hits[#hits + 1] = calc(c, { destroying_card = pc, full_hand = scoring }) == true end
    expect(hits).eq({ false, false, true })
    flush()
    local made = CH.called('create_card')
    expect(made[#made][2]).eq('Spectral')
    calc(c, { after = true, cardarea = G.jokers })
    -- Not armed: nothing is destroyed.
    calc(c, before(scoring))
    CH.roll({ j_mp_warlock_sandbox = 0.15 }) -- just over 1 in 7
    calc(c, indiv(l1, scoring))
    expect(calc(c, { destroying_card = l2, full_hand = scoring })).eq(nil)
  end)

  it('Warlock: no consumable room, no destruction', function()
    local c = card('j_mp_warlock_sandbox')
    local l1 = B.pc('Hearts', '5', 'm_lucky')
    calc(c, before({ l1 }))
    CH.roll({ j_mp_warlock_sandbox = 0.1 })
    calc(c, indiv(l1))
    G.consumeables.config.card_limit = 0
    expect(calc(c, { destroying_card = l1, full_hand = { l1 } })).eq(nil)
  end)

  it('Candy Necklace: a Booster tag at every shop end, 5 uses', function()
    local c = card('j_mp_candynecklace_sandbox')
    for _ = 1, 4 do calc(c, { ending_shop = true }) end
    calc(c, { ending_shop = true, blueprint = 1 })
    flush()
    expect(#B.tags_added).eq(5)
    for _, k in ipairs(B.tags_added) do expect(MP.set_of(MP.sandbox.CANDY_FLAVOURS)[k] or k).eq(true) end
    calc(c, { ending_shop = true })
    expect(c.ability.mp_consumed).eq(true)
  end)

  it('Clown College: Boss defeated -> The Fool in every empty consumable slot', function()
    local c = card('j_mp_clowncollege_sandbox')
    boss(false)
    calc(c, round_end())
    flush()
    expect(#CH.called('create_card')).eq(0)
    boss(true)
    calc(c, round_end())
    flush()
    expect(#G.consumeables.cards).eq(G.consumeables.config.card_limit)
  end)

  it('Monte Haul: after a round, selling it gives 2 tags', function()
    local c = card('j_mp_montehaul_sandbox')
    calc(c, { selling_self = true })
    flush()
    expect(#B.tags_added).eq(0)
    calc(c, round_end())
    calc(c, { selling_self = true })
    flush()
    expect(#B.tags_added).eq(2)
    for _, k in ipairs(B.tags_added) do expect(MP.set_of(MP.sandbox.MONTY_FLAVOURS)[k] or k).eq(true) end
  end)

  it('Espresso: $30 on a skip (then gone); cools $5 per round, gone at $0', function()
    local c = card('j_mp_espresso_sandbox')
    calc(c, { skip_blind = true })
    expect(G.GAME.dollars).eq(30)
    expect(c.ability.mp_consumed).eq(true)
    local e = card('j_mp_espresso_sandbox')
    for _ = 1, 5 do expect(calc(e, round_end()).message).eq('Cooled!') end
    expect(calc(e, round_end()).message).eq('Too cold!')
    expect(e.ability.mp_consumed).eq(true)
  end)

  it('Traffic Light: X2.5 -> X1.5 -> X0.5 -> X2.5 after each hand', function()
    local c = card('j_mp_trafficlight_sandbox')
    local seq = {}
    for _ = 1, 4 do
      seq[#seq + 1] = calc(c, main()).Xmult_mod
      calc(c, { after = true, cardarea = G.jokers })
    end
    expect(seq).eq({ 2.5, 1.5, 0.5, 2.5 })
  end)

  it('Farmer: held cards of the round suit pay $2 at round end', function()
    local c = card('j_mp_farmer_sandbox')
    G.GAME.current_round.farmer_card = { suit = 'Hearts' }
    local ctx = { individual = true, end_of_round = true, cardarea = G.hand, other_card = B.pc('Hearts', '5') }
    expect(calc(c, ctx).h_dollars).eq(2)
    ctx.other_card = B.pc('Spades', '5')
    expect(calc(c, ctx)).eq(nil)
  end)

  it('Werewolf: played enhanced cards become Wild', function()
    local c = card('j_mp_werewolf_sandbox')
    local m, w, p = B.pc('Hearts', '5', 'm_mult'), B.pc('Hearts', '6', 'm_wild'), B.pc('Hearts', '7')
    expect(calc(c, before({ m }, { m, w, p })).message).eq('Awooo!')
    expect(m.config.center.key).eq('m_wild')
    expect(p.config.center.key).eq('c_base')
    expect(calc(c, before({ w }, { w, p }))).eq(nil)
  end)

  it('Tuxedo: retriggers cards of the round suit', function()
    local c = card('j_mp_tuxedo_sandbox')
    G.GAME.current_round.tuxedo_card = { suit = 'Clubs' }
    expect(calc(c, rep(B.pc('Clubs', '5'))).repetitions).eq(1)
    expect(calc(c, rep(B.pc('Hearts', '5')))).eq(nil)
    local held = { repetition = true, cardarea = G.hand, other_card = B.pc('Clubs', '5'), card_effects = { { x_mult = 1.5 } } }
    expect(calc(c, held).repetitions).eq(1)
  end)

  it('Ambrosia: a skip fills the consumable slots with Spectrals; selling a Spectral drinks it', function()
    local c = card('j_mp_ambrosia_sandbox')
    calc(c, { skip_blind = true })
    flush()
    local made = CH.called('create_card')
    expect(#made).eq(2)
    expect(made[1][2]).eq('Spectral') -- (The Order rewrites the key_append)
    calc(c, { selling_card = true, card = { ability = { set = 'Tarot' } } })
    expect(c.ability.mp_consumed or false).eq(false)
    calc(c, { selling_card = true, card = { ability = { set = 'Spectral' } } })
    expect(c.ability.mp_consumed).eq(true)
  end)

  it('Ship of Theseus: destroyed playing cards come back as copies, +X0.4 each', function()
    local c = card('j_mp_shipoftheseus_sandbox')
    local gone = { B.pc('Hearts', '5'), B.pc('Spades', 'King', 'm_gold') }
    local deck_limit = G.deck.config.card_limit
    calc(c, { remove_playing_cards = true, cardarea = G.jokers, removed = gone })
    expect(#G.playing_cards).eq(2)
    expect(G.playing_cards[2].config.center.key).eq('m_gold')
    expect(G.deck.config.card_limit).eq(deck_limit + 2)
    expect(calc(c, main()).Xmult_mod).near(1.8)
    calc(c, { remove_playing_cards = true, cardarea = G.jokers, removed = { gone[1] }, blueprint = 1 })
    expect(#G.playing_cards).eq(3)
    expect(c.ability.extra.Xmult).near(1.8)
  end)

  it('Go Fish: the first hand with the round rank destroys those scoring cards', function()
    local c = card('j_mp_gofish_sandbox')
    G.GAME.current_round.fish_rank = { rank = '5', id = 5 }
    calc(c, { first_hand_drawn = true })
    local a, b, k = B.pc('Hearts', '5'), B.pc('Spades', '5'), B.pc('Hearts', 'King')
    calc(c, before({ a, b, k }))
    expect(calc(c, { destroying_card = a })).eq(true)
    expect(calc(c, { destroying_card = b })).eq(true)
    expect(calc(c, { destroying_card = k })).eq(nil)
    calc(c, { after = true, cardarea = G.jokers })
    calc(c, before({ a }))
    expect(calc(c, { destroying_card = a })).eq(nil) -- once per round
    calc(c, round_end())
    calc(c, { first_hand_drawn = true })
    calc(c, before({ a }))
    expect(calc(c, { destroying_card = a })).eq(true)
  end)

  it('Bobby: -2 hands +4 discards; -1/+2 with exactly 2 hands; nothing below', function()
    local c = card('j_mp_bobby_sandbox')
    local cr = G.GAME.current_round
    local function run(h)
      cr.hands_left, cr.discards_left = h, 3
      calc(c, { setting_blind = true })
      flush()
      return { cr.hands_left, cr.discards_left }
    end
    expect(run(4)).eq({ 2, 7 })
    expect(run(2)).eq({ 1, 5 })
    expect(run(1)).eq({ 1, 3 })
  end)

  it('Pyromancer: +20 Mult when hands left <= discards left', function()
    local c = card('j_mp_pyromancer_sandbox')
    local cr = G.GAME.current_round
    cr.hands_left, cr.discards_left = 3, 3
    expect(calc(c, main()).mult_mod).eq(20)
    cr.hands_left = 4
    expect(calc(c, main())).eq(nil)
  end)

  it('Chain Lightning: the n-th scored Mult card gives X(1 + 0.1(n-1)), per hand', function()
    local c = card('j_mp_chainlightning_sandbox')
    local m = B.pc('Hearts', '5', 'm_mult')
    calc(c, before({ m, m, m }))
    local xs = {}
    for i = 1, 3 do local e = calc(c, indiv(m)); xs[i] = e and e.x_mult or 1 end
    expect(xs[1]).eq(1)
    expect(xs[2]).near(1.1)
    expect(xs[3]).near(1.2)
    expect(calc(c, indiv(B.pc('Hearts', '5')))).eq(nil)
    calc(c, { after = true, cardarea = G.jokers })
    calc(c, before({ m }))
    expect(calc(c, indiv(m))).eq(nil)
  end)

  it('Joka Lisa: +X0.1 per unique enhancement in the scoring hand, permanent', function()
    local c = card('j_mp_jokalisa_sandbox')
    calc(c, before({ B.pc('Hearts', '5', 'm_mult'), B.pc('Hearts', '6', 'm_mult'), B.pc('Hearts', '7', 'm_gold'),
      B.pc('Hearts', '8') }))
    expect(c.ability.extra.Xmult).near(1.2)
    expect(calc(c, before({ B.pc('Hearts', '8') }))).eq(nil)
    expect(calc(c, main()).Xmult_mod).near(1.2)
  end)

  it('Joker of the Year: 5 scoring cards retrigger every played card', function()
    local c = card('j_mp_jokeroftheyear_sandbox')
    local five = { 1, 2, 3, 4, 5 }
    expect(calc(c, rep(B.pc('Hearts', '5'), five)).repetitions).eq(1)
    expect(calc(c, rep(B.pc('Hearts', '5'), { 1, 2, 3, 4 }))).eq(nil)
  end)

  it('Coupon Sheet: Boss defeated -> a Coupon Tag and a Voucher Tag', function()
    local c = card('j_mp_couponsheet_sandbox')
    boss(false)
    calc(c, round_end())
    flush()
    expect(B.tags_added).eq({})
    boss(true)
    calc(c, round_end())
    flush()
    expect(B.tags_added).eq({ 'tag_coupon', 'tag_voucher' })
  end)

  it('Blueprint-incompatible Extra Credit jokers ignore copies', function()
    for _, k in ipairs({ 'j_mp_forklift_sandbox', 'j_mp_pocketaces_sandbox', 'j_mp_clowncollege_sandbox',
      'j_mp_espresso_sandbox', 'j_mp_werewolf_sandbox', 'j_mp_ambrosia_sandbox', 'j_mp_gofish_sandbox',
      'j_mp_lucky7_sandbox', 'j_mp_couponsheet_sandbox', 'j_mp_hoarder_sandbox', 'j_mp_alloy_sandbox' }) do
      expect(MP.registry.proto(k).blueprint_compat or k).eq(k)
    end
  end)
end)
