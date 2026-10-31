-- mp_test/challenge_check.lua — does a started run carry its challenge's definition? (test-only)
--
-- Pure: `CC.compare(challenge, digest)` takes a challenge table (the vanilla G.CHALLENGES shape:
-- rules.custom / rules.modifiers, jokers, consumeables, vouchers, deck, restrictions) and a digest
-- of the run's state (`CC.digest()` builds it inside the engine) and returns the list of
-- mismatches (empty = the run applies the challenge as defined). L1: spec/mp_challenge_check_spec.lua;
-- L2: mp_test/specs/challenges_spec.lua.
--
-- The digest:
--   { challenge = id, jokers = { {key, eternal, rental, pinned, edition} }, consumeables = { key },
--     vouchers = { [key] = true }, deck = { 'S|T|m_stone||' ... } (CC.card_sig), banned = { [key] = true },
--     modifiers = G.GAME.modifiers, starting_params = G.GAME.starting_params,
--     hands, discards, hand_size, joker_slots, consumable_slots, dollars, reroll_cost, joker_rate }

local CC = {}

local RANKS = { '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A' }
local SUITS = { 'H', 'C', 'D', 'S' }
local RANK_LETTER = { ['10'] = 'T', Jack = 'J', Queen = 'Q', King = 'K', Ace = 'A' }

--- One playing card as 'suit|rank|enhancement|edition|seal' (missing parts empty).
function CC.card_sig(s, r, e, d, g)
  return table.concat({ s or '', r or '', e or '', d or '', g or '' }, '|')
end

--- The sorted signatures of the deck a challenge's `deck` table deals (vanilla's start_run rules).
function CC.expected_deck(deck, no_faces)
  local out = {}
  if deck and deck.cards then
    for _, c in ipairs(deck.cards) do out[#out + 1] = CC.card_sig(c.s, c.r, c.e, c.d, c.g) end
  else
    deck = deck or {}
    for _, s in ipairs(SUITS) do
      for _, r in ipairs(RANKS) do
        local keep = true
        if deck.yes_ranks and not deck.yes_ranks[r] then keep = false end
        if deck.no_ranks and deck.no_ranks[r] then keep = false end
        if deck.yes_suits and not deck.yes_suits[s] then keep = false end
        if deck.no_suits and deck.no_suits[s] then keep = false end
        if no_faces and (r == 'K' or r == 'Q' or r == 'J') then keep = false end
        if keep then
          out[#out + 1] = CC.card_sig(s, r, deck.enhancement, deck.edition, deck.gold_seal and 'Gold' or nil)
        end
      end
    end
  end
  table.sort(out)
  return out
end

local function str(v)
  if type(v) == 'table' then
    local parts = {}
    for k, x in pairs(v) do parts[#parts + 1] = tostring(k) .. '=' .. tostring(x) end
    table.sort(parts)
    return '{' .. table.concat(parts, ',') .. '}'
  end
  return tostring(v)
end

-- Where a rules.modifiers id lands in the run (vanilla Game:start_run / Back:apply_to_run).
local MODIFIER_FIELD = {
  hands = 'hands', discards = 'discards', hand_size = 'hand_size', joker_slots = 'joker_slots',
  consumable_slots = 'consumable_slots', dollars = 'dollars', reroll_cost = 'reroll_cost',
}

function CC.compare(ch, d)
  local probs = {}
  local function want(ok, fmt, ...)
    if not ok then probs[#probs + 1] = string.format(fmt, ...) end
  end
  want(d.challenge == ch.id, 'challenge id %s, want %s', tostring(d.challenge), tostring(ch.id))

  -- jokers: in order, with their stickers and edition
  local jokers = ch.jokers or {}
  local negatives = 0
  want(#d.jokers == #jokers, 'jokers: %d held, want %d', #d.jokers, #jokers)
  for i, j in ipairs(jokers) do
    local got = d.jokers[i]
    if not got then
      want(false, 'joker %d (%s) missing', i, j.id)
    else
      want(got.key == j.id, 'joker %d is %s, want %s', i, tostring(got.key), j.id)
      want(not not got.eternal == not not j.eternal, 'joker %d (%s) eternal=%s', i, j.id, tostring(got.eternal))
      want(not not got.rental == not not j.rental, 'joker %d (%s) rental=%s', i, j.id, tostring(got.rental))
      want(not not got.pinned == not not j.pinned, 'joker %d (%s) pinned=%s', i, j.id, tostring(got.pinned))
      want(got.edition == j.edition, 'joker %d (%s) edition %s, want %s', i, j.id, tostring(got.edition), tostring(j.edition))
    end
    if j.edition == 'negative' then negatives = negatives + 1 end
  end

  local cons = ch.consumeables or {}
  want(#d.consumeables == #cons, 'consumables: %d held, want %d', #d.consumeables, #cons)
  for i, c in ipairs(cons) do
    want(d.consumeables[i] == c.id, 'consumable %d is %s, want %s', i, tostring(d.consumeables[i]), c.id)
  end

  for _, v in ipairs(ch.vouchers or {}) do
    want(d.vouchers[v.id] == true, 'voucher %s not redeemed', v.id)
  end

  -- the deck, as a multiset
  local want_deck = CC.expected_deck(ch.deck, d.starting_params and d.starting_params.no_faces)
  local got_deck = {}
  for i, s in ipairs(d.deck) do got_deck[i] = s end
  table.sort(got_deck)
  want(#got_deck == #want_deck, 'deck: %d cards, want %d', #got_deck, #want_deck)
  if #got_deck == #want_deck then
    for i = 1, #want_deck do
      if got_deck[i] ~= want_deck[i] then
        want(false, 'deck card %s, want %s', got_deck[i], want_deck[i])
        break
      end
    end
  end

  -- restrictions: every listed key (and its `ids`) is banned
  local r = ch.restrictions or {}
  for _, list in ipairs({ r.banned_cards or {}, r.banned_tags or {}, r.banned_other or {} }) do
    for _, b in ipairs(list) do
      want(d.banned[b.id] == true, 'not banned: %s', b.id)
      for _, k in ipairs(b.ids or {}) do want(d.banned[k] == true, 'not banned: %s (with %s)', k, b.id) end
    end
  end

  -- rules
  local rules = ch.rules or {}
  for _, m in ipairs(rules.modifiers or {}) do
    local field = MODIFIER_FIELD[m.id]
    local value = m.value
    if m.id == 'joker_slots' then value = value + negatives end
    if field then
      want(d[field] == value, 'modifier %s: %s, want %s', m.id, tostring(d[field]), tostring(value))
    else
      want(d.starting_params[m.id] == m.value, 'starting param %s: %s, want %s', m.id,
        tostring(d.starting_params[m.id]), tostring(m.value))
    end
  end
  local mods = d.modifiers or {}
  for _, c in ipairs(rules.custom or {}) do
    if c.id == 'no_reward' then
      local nr = mods.no_blind_reward or {}
      want(nr.Small and nr.Big and nr.Boss, 'no_reward: %s', str(nr))
    elseif c.id == 'no_reward_specific' then
      want((mods.no_blind_reward or {})[c.value] == true, 'no_reward_specific %s: %s', tostring(c.value), str(mods.no_blind_reward))
    elseif c.id == 'no_shop_jokers' then
      want(d.joker_rate == 0, 'no_shop_jokers: joker_rate %s', tostring(d.joker_rate))
    elseif c.id == 'mp_ante_scaling' then
      want(mods.mp_ante_scaling == c.value, 'mp_ante_scaling modifier %s', tostring(mods.mp_ante_scaling))
      want(d.starting_params.ante_scaling == c.value, 'ante_scaling %s, want %s', tostring(d.starting_params.ante_scaling),
        tostring(c.value))
    else
      local v = c.value
      if v == nil then v = true end
      want(mods[c.id] == v, 'custom rule %s: %s, want %s', c.id, tostring(mods[c.id]), tostring(v))
    end
  end
  return probs
end

-- ── in the engine ───────────────────────────────────────────────────────────

local function rank_letter(value)
  return RANK_LETTER[value] or value
end

--- The digest of the running game (call once the run's start events have run).
function CC.digest()
  local g = G.GAME
  local d = {
    challenge = g.challenge, jokers = {}, consumeables = {}, vouchers = {}, deck = {}, banned = {},
    modifiers = g.modifiers, starting_params = g.starting_params,
    hands = g.round_resets.hands, discards = g.round_resets.discards, hand_size = G.hand.config.card_limit,
    joker_slots = G.jokers.config.card_limit, consumable_slots = G.consumeables.config.card_limit,
    dollars = g.dollars, reroll_cost = g.base_reroll_cost, joker_rate = g.joker_rate,
  }
  for _, c in ipairs(G.jokers.cards) do
    d.jokers[#d.jokers + 1] = { key = c.config.center.key, eternal = c.ability.eternal, rental = c.ability.rental,
      pinned = c.pinned, edition = c.edition and c.edition.type or nil }
  end
  for _, c in ipairs(G.consumeables.cards) do d.consumeables[#d.consumeables + 1] = c.config.center.key end
  for k, v in pairs(g.used_vouchers or {}) do if v then d.vouchers[k] = true end end
  for _, c in ipairs(G.playing_cards or {}) do
    local key = c.config.center.key
    d.deck[#d.deck + 1] = CC.card_sig(c.base.suit:sub(1, 1), rank_letter(c.base.value),
      key ~= 'c_base' and key or nil, c.edition and c.edition.type or nil, c.seal)
  end
  for k, v in pairs(g.banned_keys or {}) do if v then d.banned[k] = true end end
  return d
end

return CC
