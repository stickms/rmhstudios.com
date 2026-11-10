-- rmh_mp/rules/order.lua — The Order: stable RNG queues (OR-01…OR-09, C §1.5, A1 §3.6).
--
-- Goal: two players who make different choices still see the same shops, packs, bosses and
-- tags at the same ante/blind. All of it is runtime wraps (group 'session'):
--
--   pseudoseed(key)           key rewrites (OR-01):
--                               'boss'               -> 'boss'..ante        (per-ante boss queue)
--                               halu<n>, pack_generic<n>, shop_pack<n>, cdt<n>, stdseal<n>,
--                               stdsealtype<n>, standard_edition<n>, stdset<n> -> '<prefix>0'
--                                                    (one game-long queue instead of per ante)
--                               nr<n>, cashout<n>    -> '<prefix><ante><blind key><slot>' (per blind)
--                               <base>_resample<k>   -> <base> while k <= 1000 (a resample advances
--                                                    the same queue instead of opening a new one)
--   create_card(...)          OR-02: runs with ante = 0 and a per-type key_append (one queue per
--                             type/rarity); a Joker is chosen sticker-first ("stable shop"): roll
--                             its stickers, draw it from the plain or the sticker queue, then roll
--                             its edition from that queue — so a sticker never shifts the next card.
--   pseudorandom_element(t)   OR-03: an array of poker-hand names (To Do List, Orbital Tag) is
--                             sorted by hand order first, so pairs() order can never matter.
--                             (Installed for every session, not only under The Order.)
--   reset_idol_card / reset_mail_rank   OR-06: weighted by copies in the deck over a sorted
--                             candidate list (independent of G.playing_cards order).
--   seed                      OR-04: the run seed gets a '*' prefix (rules/session applies it to
--                             args.seed before Game:start_run, identically on every peer).
--   tag_uncommon / tag_rare   OR-05: their shop joker goes through the create_card wrap above, so
--                             it is drawn from the ante-agnostic queue.
--   OR-07 (profile-independent pools) is registry/pools.lua; OR-08 (tutorial) is rules/session.lua.
--   OR-09: MP.order.active() — forced/disabled by the ruleset (flags.theOrder), always on in practice.

local MP = require 'rmh_mp.state'

local O = {}
MP.order = O

function O.active()
  if not MP.in_session() then return false end
  if MP.is_practice() then return true end
  local r = MP.resolved()
  if r.flags and r.flags.theOrder ~= nil then return r.flags.theOrder == true end
  return MP.option('theOrder', true) == true
end

local ANTE_ZERO = {
  'halu', 'pack_generic', 'shop_pack', 'cdt', 'stdseal', 'stdsealtype', 'standard_edition', 'stdset',
}
local ROUND_BASED = { 'nr', 'cashout' }

function O.round_key()
  local b = G.GAME.blind
  local bkey = (b and b.config and b.config.blind and b.config.blind.key) or ''
  return tostring(G.GAME.round_resets.ante) .. bkey .. tostring(G.GAME.blind_on_deck or '')
end

--- The rewritten key (or the key itself). Pure apart from reading G.GAME.
function O.rewrite(key)
  if type(key) ~= 'string' then return key end
  if key == 'boss' then return 'boss' .. tostring(G.GAME.round_resets.ante) end
  local base, n = key:match('^(.+)_resample(%d+)$')
  if base and tonumber(n) <= 1000 then return O.rewrite(base) end
  local prefix = key:match('^(%a[%a_]-)%-?%d+$')
  if prefix then
    for _, p in ipairs(ANTE_ZERO) do if p == prefix then return p .. '0' end end
    for _, p in ipairs(ROUND_BASED) do if p == prefix then return p .. O.round_key() end end
  end
  return key
end

-- ── create_card (stable shop) ───────────────────────────────────────────────

local function stable_joker(_type, area, legendary, _rarity, key_append, as_shop)
  local pool, pool_key = get_current_pool(_type, _rarity, legendary, key_append)
  local et, per, rent, ed
  local key = 'UNAVAILABLE'
  local it = 0
  while key == 'UNAVAILABLE' do
    et, per, rent, ed = nil, nil, nil, nil
    if as_shop or area == G.pack_cards or area == G.shop_jokers then
      local poll = pseudorandom('_etper' .. pool_key)
      local mods = G.GAME.modifiers
      if mods.enable_eternals_in_shop and poll > 0.7 then
        et = true
      elseif mods.enable_perishables_in_shop and poll > 0.4 and poll <= 0.7 then
        per = true
      end
      if mods.enable_rentals_in_shop and pseudorandom('_rent' .. pool_key) > 0.7 then rent = true end
    end
    local queue = pool_key .. ((et or per or rent) and '_sticker' or '')
    if it > 1000 then
      key = pseudorandom_element(pool, pseudoseed(queue .. '_fallback' .. it))
    else
      key = pseudorandom_element(pool, pseudoseed(queue))
    end
    if key ~= 'UNAVAILABLE' then
      ed = poll_edition('edi' .. queue)
    else
      pseudorandom(pseudoseed('edi' .. queue)) -- keep the edition queue aligned with the card queue
    end
    it = it + 1
    if it > 2000 then key = 'j_joker' end
  end
  return key, et, per, rent, ed
end

local function apply_stickers(card, et, per, rent, ed)
  if not card or not card.ability then return end
  card.ability.eternal, card.ability.perishable = nil, nil
  if card.ability.rental and not rent then card.ability.rental = nil end
  if G.GAME.modifiers.all_eternal and card.set_eternal then card:set_eternal(true) end
  if et and card.set_eternal then card:set_eternal(true) end
  if per and card.set_perishable then card:set_perishable(true) end
  if rent and card.set_rental then card:set_rental(true) end
  if ed and card.set_edition then card:set_edition(ed, true, true) end
end

local function order_create_card(orig, _type, area, legendary, _rarity, skip_materialize, soulable, forced_key, key_append)
  local rr = G.GAME.round_resets
  local real = rr.ante
  rr.ante = 0
  rr.mp_real_ante = real
  local ok, card = pcall(function()
    local append = key_append
    if _type == 'Tarot' or _type == 'Planet' or _type == 'Spectral' then
      append = (area == G.pack_cards) and (_type .. '_pack') or _type
    elseif not (_type == 'Base' or _type == 'Enhanced') then
      append = nil
    end
    if _type == 'Joker' and not forced_key then
      local key, et, per, rent, ed
      local held = (not legendary and not _rarity and (area == G.shop_jokers or area == G.pack_cards))
        and O.take_held() or nil
      if held then
        key, et, per, rent, ed = held.key, held.et, held.per, held.rent, held.ed
      else
        key, et, per, rent, ed = stable_joker(_type, area or G.jokers, legendary, _rarity, append)
      end
      -- Only Order's own edition roll applies: vanilla's roll would queue a juice event for an
      -- edition that apply_stickers then replaces, and that event crashes on the nil edition.
      local poll = poll_edition
      poll_edition = function() return nil end
      local cok, c = pcall(orig, _type, area, legendary, _rarity, skip_materialize, soulable, key, append)
      poll_edition = poll
      if not cok then error(c, 0) end
      apply_stickers(c, et, per, rent, ed)
      return c
    end
    return orig(_type, area, legendary, _rarity, skip_materialize, soulable, forced_key, append)
  end)
  rr.ante = real
  rr.mp_real_ante = nil
  if not ok then error(card, 0) end
  return card
end

-- ── Held shop rolls (the Judgement rework) ──────────────────────────────────
-- G.GAME.mp_held_jokers: Joker rolls taken out of the shop queue ahead of the shop (Judgement
-- under The Order, content/judgement.lua) that the shop still has to show, in order. The next
-- shop or pack Joker without a forced rarity takes the first one instead of rolling. Saved with
-- the run (plain data).

function O.held() return (G.GAME and G.GAME.mp_held_jokers) or {} end

function O.hold(roll)
  G.GAME.mp_held_jokers = G.GAME.mp_held_jokers or {}
  local h = G.GAME.mp_held_jokers
  h[#h + 1] = { key = roll.key, et = roll.et or nil, per = roll.per or nil, rent = roll.rent or nil, ed = roll.ed }
end

function O.take_held()
  local h = G.GAME and G.GAME.mp_held_jokers
  if not (h and h[1]) then return nil end
  local first = table.remove(h, 1)
  if G.P_CENTERS[first.key] == nil then return O.take_held() end
  return first
end

--- One Joker rolled exactly as the shop rolls its next one (ante 0 queues, sticker polls first),
--- without creating a card: { key, et, per, rent, ed }.
function O.roll_shop_joker()
  local rr = G.GAME.round_resets
  local real = rr.ante
  rr.ante = 0
  local ok, key, et, per, rent, ed = pcall(stable_joker, 'Joker', G.shop_jokers, nil, nil, nil, true)
  rr.ante = real
  if not ok then error(key, 0) end
  return { key = key, et = et, per = per, rent = rent, ed = ed }
end
O.apply_stickers = apply_stickers

-- ── Idol / Mail-In Rebate (OR-06) ───────────────────────────────────────────

local RANK_ORDER = { ['2'] = 2, ['3'] = 3, ['4'] = 4, ['5'] = 5, ['6'] = 6, ['7'] = 7, ['8'] = 8, ['9'] = 9,
  ['10'] = 10, Jack = 11, Queen = 12, King = 13, Ace = 14 }
local SUIT_ORDER = { Spades = 1, Hearts = 2, Clubs = 3, Diamonds = 4 }

--- Candidates grouped by `group(card)` with counts, sorted by count desc then rank/suit desc.
function O.weighted_candidates(cards, with_suit)
  local map, list = {}, {}
  for _, c in ipairs(cards or {}) do
    if c.ability and c.ability.effect ~= 'Stone Card' and c.base then
      local id = c.base.value .. (with_suit and ('|' .. tostring(c.base.suit)) or '')
      local e = map[id]
      if not e then
        e = { value = c.base.value, suit = c.base.suit, id = c.base.id, count = 0 }
        map[id] = e
        list[#list + 1] = e
      end
      e.count = e.count + 1
    end
  end
  table.sort(list, function(a, b)
    if a.count ~= b.count then return a.count > b.count end
    local ra, rb = RANK_ORDER[a.value] or 0, RANK_ORDER[b.value] or 0
    if ra ~= rb then return ra > rb end
    return (SUIT_ORDER[a.suit] or 9) < (SUIT_ORDER[b.suit] or 9)
  end)
  return list
end

local function weighted_pick(list, key)
  local total = 0
  for _, e in ipairs(list) do total = total + e.count end
  if total <= 0 then return nil end
  local roll = pseudorandom(key)
  local acc = 0
  for _, e in ipairs(list) do
    acc = acc + e.count / total
    if roll < acc then return e end
  end
  return list[#list]
end
O.weighted_pick = weighted_pick

local function order_idol(orig, ...)
  if not O.active() then return orig(...) end
  local cr = G.GAME.current_round
  cr.idol_card.rank, cr.idol_card.suit = 'Ace', 'Spades'
  local e = weighted_pick(O.weighted_candidates(G.playing_cards, true), 'idol' .. G.GAME.round_resets.ante)
  if e then cr.idol_card.rank, cr.idol_card.suit, cr.idol_card.id = e.value, e.suit, e.id end
end

local function order_mail(orig, ...)
  if not O.active() then return orig(...) end
  local cr = G.GAME.current_round
  cr.mail_card.rank = 'Ace'
  local e = weighted_pick(O.weighted_candidates(G.playing_cards, false), 'mail' .. G.GAME.round_resets.ante)
  if e then cr.mail_card.rank, cr.mail_card.id = e.value, e.id end
end

-- ── Install ─────────────────────────────────────────────────────────────────

function O.install()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'order.' .. id } end
  wrap(_G, 'pseudoseed', function(orig, key, predict_seed, ...)
    if predict_seed == nil and O.active() then key = O.rewrite(key) end
    return orig(key, predict_seed, ...)
  end, o('pseudoseed'))
  wrap(_G, 'create_card', function(orig, ...)
    if O.active() then return order_create_card(orig, ...) end
    return orig(...)
  end, o('create_card'))
  wrap(_G, 'pseudorandom_element', function(orig, t, seed, ...)
    local rng = require 'rmh_mp.util.rng'
    if rng.is_hand_list(t) then t = rng.sorted_hand_list(t) end
    return orig(t, seed, ...)
  end, o('hand_sort'))
  wrap(_G, 'reset_idol_card', order_idol, o('idol'))
  wrap(_G, 'reset_mail_rank', order_mail, o('mail'))
end

--- OR-04: the seed string every peer hashes.
function O.seed(seed)
  if not seed or seed == '' then return seed end
  if O.active() and seed:sub(1, 1) ~= '*' then return '*' .. seed end
  return seed
end

return O
