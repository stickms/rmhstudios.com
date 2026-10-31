-- L2: the owner's balance changes in the real love.wasm, on the committed core pack (the anchored
-- patches of scripts/balatro/core-patches.json; the L1 side is lib/balatro/lua/spec/balance_spec.lua):
-- Blue Stake keeps every discard, a Blue Seal makes its Planet with a #1# in #2# (1 in 2) chance on
-- the 'blue_seal' stream, a Gold Seal pays $4.

local SEED = 'RMHBAL1'

describe('balance changes in the shipped game', function()
  it('Blue Stake and above keep all 3 discards; the other stake effects stay', function()
    for _, stake in ipairs({ 5, 8 }) do
      local s = AP.run('start_run', { seed = SEED, stake = stake, deck = 'b_blue' })
      expect(s.state).eq('BLIND_SELECT')
      expect(G.GAME.stake).eq(stake)
      expect(G.GAME.starting_params.discards).eq(3)
      expect(G.GAME.round_resets.discards).eq(3)
      expect(G.GAME.modifiers.enable_eternals_in_shop).eq(true)
      expect(G.GAME.modifiers.enable_rentals_in_shop or false).eq(stake >= 8)
      expect(G.GAME.modifiers.scaling).eq(stake >= 6 and 3 or 2)
    end
  end)

  it('a Gold Seal pays $4 and a Blue Seal rolls 1 in 2 (scaled by probabilities.normal)', function()
    AP.run('start_run', { seed = SEED, stake = 1 })
    AP.run('select_blind')
    local card = G.hand.cards[1]
    expect(G.P_SEALS.Gold.config.dollars).eq(4)
    expect(G.P_SEALS.Blue.config.odds).eq(2)

    card:set_seal('Gold', true, true)
    expect(card:get_p_dollars()).eq(4)

    local normal = G.GAME.probabilities.normal
    G.GAME.last_hand_played = 'Pair'
    card:set_seal('Blue', true, true)
    local n = #G.consumeables.cards

    G.GAME.probabilities.normal = 0 -- a certain miss: nothing made, no slot reserved
    expect(card:get_end_of_round_effect().effect).eq(nil)
    expect(G.GAME.consumeable_buffer).eq(0)

    G.GAME.probabilities.normal = 2 -- Oops! All 6s twice over: 2 in 2
    expect(card:get_end_of_round_effect().effect).eq(true)
    wait_until(function() return #G.consumeables.cards == n + 1 end, 5, 'the Blue Seal Planet')
    expect(G.consumeables.cards[n + 1].config.center.key).eq('c_mercury')
    G.GAME.probabilities.normal = normal
  end)

  it('the text reads the new rules in the current language', function()
    local seal = table.concat(localize({ type = 'raw_descriptions', set = 'Other', key = 'blue_seal', vars = { '1', 2 } }), ' ')
    expect(seal:find('#', 1, true)).eq(nil)
    expect(seal:find('2', 1, true) ~= nil).truthy()
    local gold = table.concat(localize({ type = 'raw_descriptions', set = 'Other', key = 'gold_seal', vars = {} }), ' ')
    expect(gold:find('4', 1, true) ~= nil).truthy()
    local stake = table.concat(localize({ type = 'raw_descriptions', set = 'Stake', key = 'stake_blue', vars = {} }), ' ')
    expect(stake:find('-1', 1, true)).eq(nil)
    report('balance_text', { language = G.SETTINGS.language, blue_seal = seal, gold_seal = gold, stake_blue = stake })
  end)
end)
