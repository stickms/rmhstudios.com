-- mp_test/challenge_check.lua: the comparison the in-engine challenge specs rely on
-- (mp_test/specs/ui_run_challenges_*_spec.lua). A comparator that passes everything would make those
-- specs pass everything, so its mismatches are pinned here.

local CC = require 'mp_test.challenge_check'

local function full_deck(enh)
  local out = {}
  for _, s in ipairs({ 'H', 'C', 'D', 'S' }) do
    for _, r in ipairs({ '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A' }) do
      out[#out + 1] = CC.card_sig(s, r, enh)
    end
  end
  return out
end

--- A digest that matches `ch` exactly.
local function digest_for(ch, over)
  local d = {
    challenge = ch.id, jokers = {}, consumeables = {}, vouchers = {}, deck = full_deck(), banned = {},
    modifiers = {}, starting_params = {}, hands = 4, discards = 3, hand_size = 8, joker_slots = 5,
    consumable_slots = 2, dollars = 4, reroll_cost = 5, joker_rate = 20,
  }
  for k, v in pairs(over or {}) do d[k] = v end
  return d
end

local CHORES = {
  id = 'c_mp_chore_list',
  jokers = { { id = 'j_todo_list', eternal = true, rental = true, edition = 'negative' },
    { id = 'j_todo_list', eternal = true, rental = true, edition = 'negative' } },
  restrictions = { banned_cards = { { id = 'j_trading' }, { id = 'p_celestial_normal_1', ids = { 'p_celestial_mega_2' } } },
    banned_tags = { { id = 'tag_investment' } }, banned_other = { { id = 'bl_wall', type = 'blind' } } },
  rules = { modifiers = { { id = 'joker_slots', value = 6 }, { id = 'hands', value = 1 } },
    custom = { { id = 'no_reward_specific', value = 'Small' }, { id = 'mp_indigo' }, { id = 'mp_ante_scaling', value = 0.25 } } },
}

local function good()
  return digest_for(CHORES, {
    jokers = { { key = 'j_todo_list', eternal = true, rental = true, edition = 'negative' },
      { key = 'j_todo_list', eternal = true, rental = true, edition = 'negative' } },
    banned = { j_trading = true, p_celestial_normal_1 = true, p_celestial_mega_2 = true, tag_investment = true, bl_wall = true },
    joker_slots = 8, hands = 1,
    modifiers = { no_blind_reward = { Small = true }, mp_indigo = true, mp_ante_scaling = 0.25 },
    starting_params = { ante_scaling = 0.25 },
  })
end

describe('challenge_check', function()
  it('a run that carries the definition has no mismatch (negative jokers widen the joker slots)', function()
    expect(CC.compare(CHORES, good())).eq({})
  end)

  it('reports each kind of mismatch', function()
    local cases = {
      { function(d) d.challenge = 'c_mp_other' end, 'challenge id' },
      { function(d) d.jokers[2] = nil end, 'jokers: 1 held' },
      { function(d) d.jokers[1].rental = nil end, 'rental=nil' },
      { function(d) d.jokers[2].eternal = false end, 'eternal=false' },
      { function(d) d.jokers[1].edition = nil end, 'edition nil, want negative' },
      { function(d) d.jokers[1].key = 'j_joker' end, 'is j_joker' },
      { function(d) d.banned.p_celestial_mega_2 = nil end, 'not banned: p_celestial_mega_2' },
      { function(d) d.banned.tag_investment = nil end, 'not banned: tag_investment' },
      { function(d) d.banned.bl_wall = nil end, 'not banned: bl_wall' },
      { function(d) d.joker_slots = 6 end, 'modifier joker_slots: 6, want 8' },
      { function(d) d.hands = 4 end, 'modifier hands' },
      { function(d) d.modifiers.no_blind_reward = {} end, 'no_reward_specific Small' },
      { function(d) d.modifiers.mp_indigo = nil end, 'custom rule mp_indigo' },
      { function(d) d.starting_params.ante_scaling = 1 end, 'ante_scaling 1' },
      { function(d) d.deck[1] = CC.card_sig('S', 'A', 'm_stone') end, 'deck card' },
      { function(d) d.deck[#d.deck] = nil end, 'deck: 51 cards' },
      { function(d) d.consumeables = { 'c_pluto' } end, 'consumables: 1 held' },
    }
    for _, c in ipairs(cases) do
      local d = good()
      c[1](d)
      local probs = CC.compare(CHORES, d)
      expect(#probs >= 1).truthy()
      local hit = false
      for _, p in ipairs(probs) do if p:find(c[2], 1, true) then hit = true end end
      expect(hit and c[2] or table.concat(probs, '; ')).eq(c[2])
    end
  end)

  it('decks: explicit cards as a multiset, and the filtered 52 (enhancement, ranks, suits, no faces)', function()
    local scratch = { id = 'c_mp_scratch', deck = { cards = { { s = 'C', r = '7', e = 'm_stone' } } } }
    expect(CC.compare(scratch, digest_for(scratch, { deck = { 'C|7|m_stone||' } }))).eq({})
    local lucky = { id = 'c_lucky', deck = { enhancement = 'm_lucky' } }
    expect(CC.compare(lucky, digest_for(lucky, { deck = full_deck('m_lucky') }))).eq({})
    expect(#CC.compare(lucky, digest_for(lucky))).eq(1)
    expect(#CC.expected_deck({ yes_suits = { S = true } })).eq(13)
    expect(#CC.expected_deck({ no_ranks = { A = true }, no_suits = { D = true } })).eq(36)
    expect(#CC.expected_deck(nil, true)).eq(40)
    local twice = CC.expected_deck({ cards = { { s = 'S', r = 'T' }, { s = 'S', r = 'T' } } })
    expect(twice).eq({ 'S|T|||', 'S|T|||' })
  end)

  it('vanilla rules: vouchers, dollars, no_reward, no_shop_jokers, other starting params', function()
    local ch = { id = 'c_v', vouchers = { { id = 'v_magic_trick' } },
      rules = { modifiers = { { id = 'dollars', value = 100 }, { id = 'discards', value = 1 } },
        custom = { { id = 'no_reward' }, { id = 'no_shop_jokers' }, { id = 'inflation' } } } }
    local d = digest_for(ch, { vouchers = { v_magic_trick = true }, dollars = 100, discards = 1, joker_rate = 0,
      modifiers = { no_blind_reward = { Small = true, Big = true, Boss = true }, inflation = true } })
    expect(CC.compare(ch, d)).eq({})
    d.vouchers = {}
    d.joker_rate = 20
    d.modifiers.no_blind_reward.Boss = nil
    expect(#CC.compare(ch, d)).eq(3)
    local sp = { id = 'c_sp', rules = { modifiers = { { id = 'ante_scaling_x', value = 2 } } } }
    expect(#CC.compare(sp, digest_for(sp))).eq(1)
    expect(CC.compare(sp, digest_for(sp, { starting_params = { ante_scaling_x = 2 } }))).eq({})
  end)
end)
