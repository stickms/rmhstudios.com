-- WS7 content A (L1): the core PvP jokers, the standard/experimental reworks and the takeovers.
local CH = require 'spec.mp_content_helper'

local MP
local function setup(over)
  MP = CH.boot()
  CH.match(over)
end

local function flush() CH.H.fake.flush() end

describe('J-01 Defensive Joker', function()
  before_each(function() setup() end)
  after_each(CH.teardown)

  it('gives +125 chips per life below the nemesis', function()
    local c = CH.card('j_mp_defensive_joker', G.jokers)
    MP.state.lives.u1 = 2
    MP.state.enemy.lives = 4
    local eff = CH.calc(c, { joker_main = true })
    expect(eff.chip_mod).eq(250)
    expect(MP.registry.get('j_mp_defensive_joker').loc_vars(c)).eq({ 125, 250 })
  end)

  it('uses 75 per life at vanilla stake >= 6 (D-29)', function()
    local c = CH.card('j_mp_defensive_joker', G.jokers)
    G.GAME.stake = 6
    MP.state.lives.u1 = 3
    expect(CH.calc(c, { joker_main = true }).chip_mod).eq(75)
  end)

  it('gives nothing when level or ahead, or outside a match', function()
    local c = CH.card('j_mp_defensive_joker', G.jokers)
    expect(CH.calc(c, { joker_main = true })).eq(nil)
    MP.state.lives.u1 = 5
    expect(CH.calc(c, { joker_main = true })).eq(nil)
    MP.state.session.kind = 'practice'
    MP.state.lives.u1 = 1
    expect(CH.calc(c, { joker_main = true })).eq(nil)
  end)
end)

describe('J-02 Skip-Off', function()
  before_each(function() setup() end)
  after_each(CH.teardown)

  it('adds one hand and one discard per extra skip on setting_blind', function()
    local c = CH.card('j_mp_skip_off', G.jokers)
    G.GAME.skips = 3
    MP.state.enemy.skips = 1
    G.GAME.current_round.hands_left, G.GAME.current_round.discards_left = 4, 3
    CH.calc(c, { setting_blind = true })
    flush()
    expect(G.GAME.current_round.hands_left).eq(6)
    expect(G.GAME.current_round.discards_left).eq(5)
    local v = MP.registry.get('j_mp_skip_off').loc_vars(c)
    expect({ v[1], v[2], v[3], v[4], v[5] }).eq({ 1, 1, 2, 2, '2 Skips Ahead' })
  end)

  it('does nothing when behind or tied, and never for blueprint copies', function()
    local c = CH.card('j_mp_skip_off', G.jokers)
    G.GAME.skips = 1
    MP.state.enemy.skips = 2
    CH.calc(c, { setting_blind = true })
    flush()
    expect(G.GAME.current_round.hands_left).eq(4)
    expect(MP.registry.get('j_mp_skip_off').loc_vars(c)[5]).eq('1 Skips Behind')
    G.GAME.skips = 5
    CH.calc(c, { setting_blind = true, blueprint = true })
    flush()
    expect(G.GAME.current_round.hands_left).eq(4)
    G.GAME.skips = 2
    expect(MP.registry.get('j_mp_skip_off').loc_vars(c)[5]).eq('Tied')
  end)
end)

describe("J-03 Let's Go Gambling", function()
  before_each(function() setup() end)
  after_each(CH.teardown)

  it('1 in 4: X4 Mult and $10', function()
    local c = CH.card('j_mp_lets_go_gambling', G.jokers)
    CH.pvp(false)
    CH.roll({ j_mp_lets_go_gambling = 0.2 })
    local eff = CH.calc(c, { joker_main = true })
    expect(eff.Xmult_mod).eq(4)
    expect(G.GAME.dollars).eq(10)
    CH.roll({ j_mp_lets_go_gambling = 0.25 }) -- not < 1/4
    expect(CH.calc(c, { joker_main = true })).eq(nil)
  end)

  it('misfires only in a PvP blind, paying the ante nemesis through the sync bus', function()
    local c = CH.card('j_mp_lets_go_gambling', G.jokers)
    CH.roll({ j_mp_lets_go_gambling_misfire = 0.1 })
    CH.pvp(false)
    expect(CH.calc(c, { joker_main = true })).eq(nil)
    expect(#CH.syncs()).eq(0)
    CH.pvp(true)
    local eff = CH.calc(c, { joker_main = true })
    expect(eff.message).eq('Oops!')
    local s = CH.syncs('j_mp_lets_go_gambling')
    expect(#s).eq(1)
    expect(s[1].d.data).eq({ dollars = 10 })
    expect(s[1].d.to).eq('u2')
  end)

  it('a hit and a misfire in one hand keep the X4 and still send', function()
    local c = CH.card('j_mp_lets_go_gambling', G.jokers)
    CH.pvp(true)
    CH.roll({ j_mp_lets_go_gambling = 0.1, j_mp_lets_go_gambling_misfire = 0.1 })
    expect(CH.calc(c, { joker_main = true }).Xmult_mod).eq(4)
    expect(#CH.syncs()).eq(1)
  end)

  it('receive pays only from the ante nemesis, clamped (D-19)', function()
    CH.receive('j_mp_lets_go_gambling', 'u3', { dollars = 10 })
    expect(G.GAME.dollars).eq(0)
    CH.receive('j_mp_lets_go_gambling', 'u2', { dollars = 10 })
    expect(G.GAME.dollars).eq(10)
    CH.receive('j_mp_lets_go_gambling', 'u2', { dollars = 1e9 })
    expect(G.GAME.dollars).eq(110)
    CH.receive('j_mp_lets_go_gambling', 'u2', {})
    expect(G.GAME.dollars).eq(115)
    MP.state.pvp.bye = true
    CH.receive('j_mp_lets_go_gambling', 'u2', { dollars = 10 })
    expect(G.GAME.dollars).eq(115)
  end)

  it('a phantom display copy never calculates', function()
    local c = CH.card('j_mp_lets_go_gambling', G.jokers)
    c.ability.mp_phantom = true
    CH.roll({ j_mp_lets_go_gambling = 0.1 })
    expect(CH.calc(c, { joker_main = true })).eq(nil)
    expect(MP.registry.proto('j_mp_lets_go_gambling').phantom).eq(true)
  end)
end)

describe('J-04 SPEEDRUN', function()
  before_each(function() setup() end)
  after_each(CH.teardown)

  it('creates a Spectral on the referee speedrun outcome when there is room', function()
    CH.card('j_mp_speedrun', G.jokers)
    MP.report.apply({ t = 'speedrun', player_id = 'u1' })
    flush()
    local cc = CH.called('create_card')
    expect(#cc).eq(1)
    expect(cc[1][2]).eq('Spectral')
    -- (The Order rewrites key_append to its per-type queue; the joker passes 'mp_speedrun'.)
    expect(#G.consumeables.cards).eq(1)
    expect(G.GAME.consumeable_buffer).eq(0)
  end)

  it('ignores the outcome for another player and needs consumable room', function()
    CH.card('j_mp_speedrun', G.jokers)
    MP.report.apply({ t = 'speedrun', player_id = 'u2' })
    G.consumeables.config.card_limit = 0
    MP.report.apply({ t = 'speedrun', player_id = 'u1' })
    flush()
    expect(#CH.called('create_card')).eq(0)
  end)
end)

describe('J-05 Conjoined Joker', function()
  before_each(function() setup() end)
  after_each(CH.teardown)

  it('X(1 + 0.5 per nemesis hand), max X3, only in a PvP blind', function()
    local c = CH.card('j_mp_conjoined_joker', G.jokers)
    MP.state.enemy.hands = 3
    CH.pvp(false)
    expect(CH.calc(c, { joker_main = true })).eq(nil)
    CH.pvp(true)
    expect(CH.calc(c, { joker_main = true }).Xmult_mod).eq(2.5)
    MP.state.enemy.hands = 10
    expect(CH.calc(c, { joker_main = true }).Xmult_mod).eq(3)
    MP.state.enemy.hands = 0
    expect(CH.calc(c, { joker_main = true })).eq(nil)
    expect(MP.registry.get('j_mp_conjoined_joker').loc_vars(c)).eq({ 0.5, 3, 1 })
  end)
end)

describe('J-06 Penny Pincher', function()
  before_each(function() setup() end)
  after_each(CH.teardown)

  it('pays $1 per $3 spent in the shop three round-ends ago', function()
    local c = CH.card('j_mp_penny_pincher', G.jokers)
    MP.state.enemy.spent_in_shop = { 10, 2, 0 }
    for _ = 1, 3 do G.FUNCS.evaluate_round() end
    expect(MP.state.pincher_index).eq(0)
    expect(c:calculate_dollar_bonus()).eq(nil)
    G.FUNCS.evaluate_round()
    expect(MP.state.pincher_index).eq(1)
    expect(c:calculate_dollar_bonus()).eq(3)
    G.FUNCS.skip_blind()                         -- a skip advances the index too
    expect(MP.state.pincher_index).eq(2)
    expect(c:calculate_dollar_bonus()).eq(nil)   -- floor(2 / 3) = 0
  end)

  it('stays out of the joker pool until the first PvP draw', function()
    get_current_pool('Joker')
    expect(CH.called('get_current_pool')[1][3]).eq(true)
    expect(G.GAME.banned_keys.j_mp_penny_pincher).eq(nil)   -- restored after the roll
    MP.state.pincher_unlock = true
    get_current_pool('Joker')
    expect(CH.called('get_current_pool')[2][3]).eq(false)
  end)

  it('keeps a ruleset ban in place', function()
    G.GAME.banned_keys.j_mp_penny_pincher = true
    get_current_pool('Joker')
    expect(G.GAME.banned_keys.j_mp_penny_pincher).eq(true)
  end)
end)

describe('J-07 Taxes', function()
  before_each(function() setup() end)
  after_each(CH.teardown)

  it('files every earlier sell at the first PvP ante, then only this ante', function()
    local c = CH.card('j_mp_taxes', G.jokers)
    MP.state.enemy.sells_per_ante = { [1] = 2, [2] = 1 }
    G.GAME.round_resets.ante = 2
    CH.pvp(true)
    expect(CH.calc(c, { setting_blind = true }).message).eq('Filed!')
    expect(c.ability.extra.mult).eq(12)
    G.GAME.round_resets.ante = 3
    MP.state.enemy.sells_per_ante[3] = 1
    CH.calc(c, { setting_blind = true })
    expect(c.ability.extra.mult).eq(16)
    expect(CH.calc(c, { joker_main = true }).mult_mod).eq(16)
  end)

  it('ignores other blinds and blueprint copies', function()
    local c = CH.card('j_mp_taxes', G.jokers)
    MP.state.enemy.sells_per_ante = { [1] = 2 }
    CH.pvp(false)
    expect(CH.calc(c, { setting_blind = true })).eq(nil)
    CH.pvp(true)
    expect(CH.calc(c, { setting_blind = true, blueprint = true })).eq(nil)
    expect(CH.calc(c, { joker_main = true })).eq(nil)
  end)

  it('counts the opponent sells the core relays (opponent_selling_card)', function()
    local c = CH.card('j_mp_taxes', G.jokers)
    MP.report.on_opp_ctx('u2', { ctx = { opponent_selling_card = true } })
    MP.report.on_opp_ctx('u3', { ctx = { opponent_selling_card = true } })   -- not my nemesis
    CH.pvp(true)
    CH.calc(c, { setting_blind = true })
    expect(c.ability.extra.mult).eq(4)
  end)
end)

describe('J-08 Pizza', function()
  before_each(function() setup() end)
  after_each(CH.teardown)

  it('arms at the first PvP draw, then at round eval gives +2 discards for the ante and is eaten', function()
    local c = CH.card('j_mp_pizza', G.jokers)
    G.GAME.round_resets.discards = 3
    CH.pvp(true)
    G.STATE_COMPLETE = false
    Game.update_draw_to_hand(G, 0)
    expect(MP.state.pvp.first_draw_done).eq(true)
    expect(MP.state.after_pvp).eq(true)
    G.FUNCS.evaluate_round()
    expect(MP.state.after_pvp).eq(nil)
    expect(G.GAME.round_resets.discards).eq(5)
    expect(G.GAME.current_round.discards_left).eq(5)
    expect(MP.state.pizza_discards).eq(2)
    flush()
    expect(c.removed).eq(true)
    expect(#G.jokers.cards).eq(0)
    local s = CH.syncs('j_mp_pizza')
    expect(#s).eq(1)
    expect(s[1].d.data).eq({ discards = 1 })
    expect(s[1].d.to).eq('u2')
    G.FUNCS.evaluate_round()                      -- not armed again
    expect(G.GAME.round_resets.discards).eq(5)
    ease_ante(1)
    expect(G.GAME.round_resets.discards).eq(3)
    expect(MP.state.pizza_discards).eq(0)
  end)

  it('receive: +1 discard for the ante from the nemesis only', function()
    G.GAME.round_resets.discards = 3
    CH.receive('j_mp_pizza', 'u3', { discards = 1 })
    expect(G.GAME.round_resets.discards).eq(3)
    CH.receive('j_mp_pizza', 'u2', { discards = 1 })
    expect(G.GAME.round_resets.discards).eq(4)
    CH.receive('j_mp_pizza', 'u2', { discards = 99 })
    expect(G.GAME.round_resets.discards).eq(14)
    CH.receive('j_mp_pizza', 'u2', { discards = -5 })
    expect(G.GAME.round_resets.discards).eq(14)
  end)

  it('blueprint copies never eat it', function()
    local c = CH.card('j_mp_pizza', G.jokers)
    expect(CH.calc(c, { mp_end_of_pvp = true, blueprint = true })).eq(nil)
    expect(MP.state.pizza_discards).eq(0)
  end)
end)

describe('J-09 Pacifist', function()
  before_each(function() setup() end)
  after_each(CH.teardown)

  it('replaces the WS6 reference definition and gives X10 outside PvP', function()
    expect(MP.registry.get('j_mp_pacifist').atlas).eq('mp_j_pacifist')
    expect(#MP.registry.defs() > 2).truthy()
    local c = CH.card('j_mp_pacifist', G.jokers)
    CH.pvp(false)
    expect(CH.calc(c, { joker_main = true }).Xmult_mod).eq(10)
    CH.pvp(true)
    expect(CH.calc(c, { joker_main = true })).eq(nil)
  end)
end)

describe('J-10..J-15 standard reworks', function()
  before_each(function() setup() end)
  after_each(CH.teardown)

  it('Hanging Chad retriggers the first two scoring cards once', function()
    local c = CH.card('j_mp_hanging_chad', G.jokers)
    local a, b, d = CH.playing('Hearts', 2), CH.playing('Hearts', 3), CH.playing('Hearts', 4)
    local hand = { a, b, d }
    expect(CH.calc(c, { repetition = true, cardarea = G.play, scoring_hand = hand, other_card = a }).repetitions).eq(1)
    expect(CH.calc(c, { repetition = true, cardarea = G.play, scoring_hand = hand, other_card = b }).repetitions).eq(1)
    expect(CH.calc(c, { repetition = true, cardarea = G.play, scoring_hand = hand, other_card = d })).eq(nil)
    expect(CH.calc(c, { repetition = true, cardarea = G.hand, scoring_hand = hand, other_card = a })).eq(nil)
    expect(c.ability.mp_balanced).eq(true)
  end)

  it('Bloodstone outside PvP: 1 in 2 per scored Heart, X1.5', function()
    local c = CH.card('j_mp_bloodstone', G.jokers)
    CH.pvp(false)
    CH.roll({ bloodstone = 0.4 })
    expect(CH.calc(c, { individual = true, cardarea = G.play, other_card = CH.playing('Hearts', 5) }).x_mult).eq(1.5)
    expect(CH.calc(c, { individual = true, cardarea = G.play, other_card = CH.playing('Spades', 5) })).eq(nil)
    CH.roll({ bloodstone = 0.5 })
    expect(CH.calc(c, { individual = true, cardarea = G.play, other_card = CH.playing('Hearts', 5) })).eq(nil)
  end)

  it('Bloodstone in PvP: one shared queue per round, replayed every hand', function()
    local c = CH.card('j_mp_bloodstone', G.jokers)
    CH.pvp(true)
    local seq = { 0.1, 0.9, 0.3 }
    local n = 0
    local key = 'bloodstone' .. MP.content.round_key()
    CH.roll({ [key] = function() n = n + 1; return seq[n] end })
    local heart = CH.playing('Hearts', 5)
    local function hand()
      CH.calc(c, { before = true })
      local out = {}
      for i = 1, 3 do
        local e = CH.calc(c, { individual = true, cardarea = G.play, other_card = heart })
        out[i] = e and e.x_mult or 0
      end
      return out
    end
    expect(hand()).eq({ 1.5, 0, 1.5 })
    expect(hand()).eq({ 1.5, 0, 1.5 })            -- same rolls again
    expect(n).eq(3)                               -- no new rolls were drawn
    expect(G.GAME.round_resets.mp_bloodstone[MP.content.round_key()]).eq(seq)
  end)

  it('Seltzer retriggers for 8 hands, then is drunk', function()
    local c = CH.card('j_mp_seltzer', G.jokers)
    expect(c.ability.extra).eq(8)
    expect(CH.calc(c, { repetition = true, cardarea = G.play, other_card = CH.playing('Hearts', 2) }).repetitions).eq(1)
    for _ = 1, 7 do expect(CH.calc(c, { after = true })).eq(nil) end
    expect(c.ability.extra).eq(1)
    expect(CH.calc(c, { after = true }).message).eq('Drank!')
    flush()
    expect(c.removed).eq(true)
  end)

  it('Seltzer loses the unused hands on a pvp_timer loss only', function()
    local c = CH.card('j_mp_seltzer', G.jokers)
    expect(CH.calc(c, { mp_pvp_loss = true, hands_left = 3 })).eq(nil)
    expect(c.ability.extra).eq(8)
    MP.state.session.resolved.layers = { 'standard', 'pvp_timer' }
    MP.state.session.resolved.__layer_set = nil
    CH.calc(c, { mp_pvp_loss = true, hands_left = 3 })
    expect(c.ability.extra).eq(5)
    CH.calc(c, { mp_pvp_loss = true, hands_left = 9 })
    expect(c.ability.mp_consumed).eq(true)
  end)

  it('Turtle Bean: +4 hand size, -1 per round end, eaten at the last', function()
    local before = G.hand.config.card_limit
    local c = CH.card('j_mp_turtle_bean', G.jokers)
    expect(G.hand.config.card_limit).eq(before + 4)
    expect(CH.calc(c, { end_of_round = true }).message).ne(nil)
    expect(c.ability.extra.h_size).eq(3)
    expect(G.hand.config.card_limit).eq(before + 3)
    expect(CH.calc(c, { end_of_round = true, individual = true })).eq(nil)
    expect(CH.calc(c, { end_of_round = true, blueprint = true })).eq(nil)
    CH.calc(c, { end_of_round = true })
    CH.calc(c, { end_of_round = true })
    expect(c.ability.extra.h_size).eq(1)
    expect(CH.calc(c, { end_of_round = true }).message).eq('Eaten!')
    c:remove_from_deck()
    expect(G.hand.config.card_limit).eq(before)
  end)

  it('Golden Ticket (both keys): $4 per scored Gold card, Uncommon $6', function()
    for _, key in ipairs({ 'j_mp_ticket', 'j_mp_ticket_experimental' }) do
      local c = CH.card(key, G.jokers)
      expect(G.P_CENTERS[key].rarity).eq(2)
      expect(G.P_CENTERS[key].cost).eq(6)
      expect(CH.calc(c, { individual = true, cardarea = G.play, other_card = CH.playing('Hearts', 5, 'Gold Card') }).dollars).eq(4)
      expect(CH.calc(c, { individual = true, cardarea = G.play, other_card = CH.playing('Hearts', 5) })).eq(nil)
    end
  end)
end)

describe('J-18 / J-19 experimental', function()
  before_each(function() setup({ resolved = { layers = { 'experimental' } } }) end)
  after_each(CH.teardown)

  it('The Idol is Rare $8 and gives X2 for the idol card', function()
    expect(G.P_CENTERS.j_mp_idol_rare.rarity).eq(3)
    expect(G.P_CENTERS.j_mp_idol_rare.cost).eq(8)
    local c = CH.card('j_mp_idol_rare', G.jokers)
    expect(CH.calc(c, { individual = true, cardarea = G.play, other_card = CH.playing('Spades', 14) }).x_mult).eq(2)
    expect(CH.calc(c, { individual = true, cardarea = G.play, other_card = CH.playing('Hearts', 14) })).eq(nil)
    expect(CH.calc(c, { individual = true, cardarea = G.play, other_card = CH.playing('Spades', 13) })).eq(nil)
  end)

  it('To Do List picks from all hands, pays $5 and re-rolls to a different hand', function()
    local c = CH.card('j_mp_todo_list', G.jokers)
    c:set_ability(G.P_CENTERS.j_mp_todo_list, true)
    MP.registry.get('j_mp_todo_list').set_ability(c)
    local h = c.ability.extra.poker_hand
    expect(G.GAME.hands[h] ~= nil).truthy()
    local eff = CH.calc(c, { joker_main = true, scoring_name = h })
    expect(eff.message).eq('$5')
    expect(G.GAME.dollars).eq(5)
    expect(CH.calc(c, { joker_main = true, scoring_name = '__none' })).eq(nil)
    for _ = 1, 20 do
      local prev = c.ability.extra.poker_hand
      expect(CH.calc(c, { end_of_round = true }).message).eq('Reset')
      expect(c.ability.extra.poker_hand).ne(prev)
    end
    -- invisible hands (Flush Five etc.) are in the candidate list
    local all = MP.content.experimental.all_hands(nil)
    expect(#all).eq(12)
    expect(all[1]).eq('Flush Five')
  end)
end)

describe('J-16 / J-17 timer-loss takeovers', function()
  before_each(function() setup({ resolved = { layers = { 'standard', 'pvp_timer' } } }) end)
  after_each(CH.teardown)

  it('Ice Cream loses chip_mod per unused hand and melts at 0', function()
    local c = CH.card('j_ice_cream', G.jokers)
    CH.calc(c, { mp_pvp_loss = true, hands_left = 3 })
    expect(c.ability.extra.chips).eq(85)
    expect(CH.calc(c, { mp_pvp_loss = true, hands_left = 17 }).message).eq('Melted!')
    expect(c.ability.extra.chips).eq(0)
  end)

  it('vanilla Seltzer loses N uses; other contexts fall through to vanilla', function()
    local c = CH.card('j_selzer', G.jokers)
    CH.calc(c, { mp_pvp_loss = true, hands_left = 4 })
    expect(c.ability.extra).eq(6)
    expect(CH.calc(c, { vanilla_probe = true })).eq('vanilla')
    expect(CH.calc(c, { mp_pvp_loss = true, hands_left = 0 })).eq(nil)
  end)

  it('does nothing without the pvp_timer layer', function()
    MP.state.session.resolved.layers = { 'standard' }
    MP.state.session.resolved.__layer_set = nil
    local c = CH.card('j_ice_cream', G.jokers)
    CH.calc(c, { mp_pvp_loss = true, hands_left = 3 })
    expect(c.ability.extra.chips).eq(100)
  end)

  it('fires from the core end_pvp handler on a timer loss', function()
    local c = CH.card('j_ice_cream', G.jokers)
    G.GAME.current_round.hands_left = 2
    MP.pvp.end_pvp({ loser_id = 'u1', pvp_timer_lost = true })
    expect(c.ability.extra.chips).eq(90)
  end)
end)
