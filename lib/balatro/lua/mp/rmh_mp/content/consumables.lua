-- rmh_mp/content/consumables.lua — Asteroid, Ouija (standard) and Wraith (rework) (CN-01…CN-03,
-- A2 §3.1–3.3).
--
--   c_mp_asteroid        Planet, $3, always usable. Use: store one asteroid (MP.state.pvp.asteroids).
--                        At the first draw of a PvP blind every stored asteroid launches: one sync
--                        message each to the ante nemesis (FL-19). The receiver (only from its ante
--                        nemesis, never on a bye) lowers its highest-level VISIBLE hand by 1; ties go
--                        to the hand that ranks higher in G.handlist (Flush Five ... High Card; a hand
--                        missing from the list beats them all, as the mod's priority 0 does).
--                        Deviation: with no nemesis (a bye) the asteroids stay stored for the next
--                        PvP blind instead of being wasted.
--   c_mp_ouija_standard  Spectral, $4: shuffle the hand (playing-card order, then 'ouija_destroy'),
--                        destroy the first 3, convert the rest to one random rank ('ouija'); no hand
--                        size loss. Usable with >= 3 cards in hand.
--   c_mp_wraith          Spectral, $4 (vanilla Tarot sheet 5,4): a random Uncommon joker ('mp_wra')
--                        and +$5. Usable with joker room.
--
-- Text: vanilla's generate_card_ui computes Planet/Spectral/Voucher variables by center name and
-- ignores the per-card ones (and a Planet without hand_type would index nil). A session wrap
-- renders MP consumables and vouchers as `Other`-set entries (descriptions.Other aliases the real
-- entry) so their own loc_vars are used; badges and the card type stay those of the real set.

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local C = require 'rmh_mp.content.jokers.core'
local Dsp = require 'rmh_mp.registry.dispatch'

local K = {}
MP.content.consumables = K

local function g(name) return rawget(_G, name) end

local function used_by(card, copier)
  if not copier and g('set_consumeable_usage') then set_consumeable_usage(card) end
  return copier or card
end

-- ── CN-01 Asteroid ──────────────────────────────────────────────────────────

K.ASTEROID = 'c_mp_asteroid'
K.ASTEROID_MAX_PER_LAUNCH = 100

R.define({
  key = K.ASTEROID, kind = 'Planet', cost = 3, pos = { x = 0, y = 0 }, atlas = 'mp_c_asteroid',
  config = {},
  loc = { name = 'Asteroid', text = { 'Remove #1# level from your Nemesis', 'highest level poker hand at start of PvP Blind' } },
  loc_vars = function() return { 1 } end,
  can_use = function() return true end,
  use = function(card, area, copier)
    local by = used_by(card, copier)
    local pvp = MP.state.pvp
    pvp.asteroids = (pvp.asteroids or 0) + 1
    if g('update_hand_text') then
      update_hand_text({ sound = 'button', volume = 0.7, pitch = 0.8, delay = 0.3 },
        { handname = C.loc('k_asteroids', 'Asteroids'), chips = '', mult = pvp.asteroids - 1 })
      G.E_MANAGER:add_event(Event({ trigger = 'after', delay = 0.2, func = function()
        C.sound('tarot1', 0.9 + pvp.asteroids / 10, 1)
        if by.juice_up then by:juice_up(0.8, 0.5) end
        return true
      end }))
      update_hand_text({ delay = 0 }, { mult = pvp.asteroids, StatusText = true })
      if g('delay') then delay(1.3) end
      update_hand_text({ sound = 'button', volume = 0.7, pitch = 1.1, delay = 0 },
        { mult = 0, chips = 0, handname = '', level = '' })
    end
  end,
})

--- Launch every stored asteroid at the ante nemesis. Returns how many were sent.
function K.launch_asteroids()
  local pvp = MP.state.pvp
  local n = math.min(K.ASTEROID_MAX_PER_LAUNCH, pvp.asteroids or 0)
  if n <= 0 then return 0 end
  local t = C.target()
  if not t then return 0 end -- a bye: keep them for the next PvP blind (see header)
  for _ = 1, n do MP.sync.send(K.ASTEROID, {}, t) end
  pvp.asteroids = 0
  if g('update_hand_text') then
    update_hand_text({ sound = 'button', volume = 0.7, pitch = 0.8, delay = 0.3 },
      { handname = C.loc('k_asteroids', 'Asteroids'), chips = '', mult = n })
    update_hand_text({ sound = 'button', volume = 0.7, pitch = 1.1, delay = 0.6 },
      { mult = 0, chips = 0, handname = '', level = '' })
  end
  return n
end

--- The hand an incoming asteroid lowers: the highest level among visible hands (nothing when
--- every visible hand is already at level 0; level_up_hand floors there). Ties: G.handlist order.
function K.asteroid_target()
  local hands = G.GAME and G.GAME.hands
  if not hands then return nil end
  local rank = {}
  for i, name in ipairs(G.handlist or {}) do rank[name] = i end
  local names = {}
  for name, h in pairs(hands) do if h.visible then names[#names + 1] = name end end
  table.sort(names)
  local best, best_level, best_rank
  for _, name in ipairs(names) do
    local h = hands[name]
    local lvl = h.level or 1
    local r = rank[name] or 0
    if best == nil or lvl > best_level or (lvl == best_level and r < best_rank) then
      best, best_level, best_rank = name, lvl, r
    end
  end
  if best and best_level <= 0 then return nil end
  return best
end

function K.receive_asteroid()
  local hand = K.asteroid_target()
  if not hand then return nil end
  if g('level_up_hand') then
    local animate = g('update_hand_text') ~= nil
    if animate then
      update_hand_text({ sound = 'button', volume = 0.7, pitch = 0.8, delay = 0.3 },
        { handname = (g('localize') and localize(hand, 'poker_hands')) or hand,
          chips = G.GAME.hands[hand].chips, mult = G.GAME.hands[hand].mult, level = G.GAME.hands[hand].level })
    end
    level_up_hand(nil, hand, not animate, -1)
    if animate then
      update_hand_text({ sound = 'button', volume = 0.7, pitch = 1.1, delay = 0 },
        { mult = 0, chips = 0, handname = '', level = '' })
    end
  else
    local h = G.GAME.hands[hand]
    h.level = math.max(0, (h.level or 1) - 1)
  end
  return hand
end

MP.sync.register(K.ASTEROID, {
  receive = function(from)
    if not C.from_target(from) then return end
    K.receive_asteroid()
  end,
})

-- ── CN-02 Ouija (standard) ──────────────────────────────────────────────────

K.OUIJA_DESTROY = 3
K.RANKS = { '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A' }

--- Pick the cards to destroy and the new rank (synchronously, so the seeds are spent at use time).
function K.ouija_plan(hand_cards, n)
  local temp = {}
  for _, c in ipairs(hand_cards) do temp[#temp + 1] = c end
  table.sort(temp, function(a, b) return (a.playing_card or 0) < (b.playing_card or 0) end)
  if g('pseudoshuffle') then
    pseudoshuffle(temp, pseudoseed('ouija_destroy'))
  else
    math.randomseed(pseudoseed('ouija_destroy'))
    for i = #temp, 2, -1 do local j = math.random(i); temp[i], temp[j] = temp[j], temp[i] end
  end
  local destroyed, keep, gone = {}, {}, {}
  for i = 1, math.min(n, #temp) do destroyed[#destroyed + 1] = temp[i]; gone[temp[i]] = true end
  for _, c in ipairs(hand_cards) do if not gone[c] then keep[#keep + 1] = c end end
  local rank = pseudorandom_element(K.RANKS, pseudoseed('ouija'))
  return destroyed, keep, rank
end

local function front_key(card, rank)
  local suit = card.base and card.base.suit or 'Spades'
  return string.sub(suit, 1, 1) .. '_' .. rank
end
K.front_key = front_key

R.define({
  key = 'c_mp_ouija_standard', kind = 'Spectral', cost = 4, pos = { x = 0, y = 0 }, atlas = 'mp_c_ouija_2',
  balanced = true, silent_replaces = 'c_ouija',
  gate = { layers = { 'standard', 'experimental', 'sandbox' } },
  config = { extra = { destroy = K.OUIJA_DESTROY } },
  loc = { name = 'Ouija', text = { 'Destroy #1# random cards, then convert', 'all remaining cards to a single random rank' } },
  loc_vars = function(card)
    local ex = card and card.ability and card.ability.extra
    return { (ex and ex.destroy) or K.OUIJA_DESTROY }
  end,
  can_use = function(card)
    return G.hand ~= nil and #G.hand.cards >= ((card.ability.extra and card.ability.extra.destroy) or K.OUIJA_DESTROY)
  end,
  use = function(card, area, copier)
    local by = used_by(card, copier)
    local destroyed, keep, rank = K.ouija_plan(G.hand.cards, card.ability.extra.destroy or K.OUIJA_DESTROY)
    for _, c in ipairs(destroyed) do c.destroyed = true end
    G.E_MANAGER:add_event(Event({ trigger = 'after', delay = 0.4, func = function()
      C.sound('tarot1')
      if by.juice_up then by:juice_up(0.3, 0.5) end
      return true
    end }))
    G.E_MANAGER:add_event(Event({ trigger = 'after', delay = 0.1, func = function()
      for i = #destroyed, 1, -1 do
        local c = destroyed[i]
        if c.ability and c.ability.name == 'Glass Card' and c.shatter then c:shatter()
        elseif c.start_dissolve then c:start_dissolve(nil, i == #destroyed)
        elseif c.area then c.area:remove_card(c) end
      end
      return true
    end }))
    for i, c in ipairs(keep) do
      local pct = 1.15 - (i - 0.999) / (math.max(#keep, 1) - 0.998) * 0.3
      G.E_MANAGER:add_event(Event({ trigger = 'after', delay = 0.15, func = function()
        if c.flip then c:flip() end
        C.sound('card1', pct)
        return true
      end }))
    end
    for _, c in ipairs(keep) do
      G.E_MANAGER:add_event(Event({ func = function()
        local front = G.P_CARDS and G.P_CARDS[front_key(c, rank)]
        if front and c.set_base then c:set_base(front) end
        return true
      end }))
    end
    for i, c in ipairs(keep) do
      local pct = 0.85 + (i - 0.999) / (math.max(#keep, 1) - 0.998) * 0.3
      G.E_MANAGER:add_event(Event({ trigger = 'after', delay = 0.15, func = function()
        if c.flip then c:flip() end
        C.sound('tarot2', pct, 0.6)
        if c.juice_up then c:juice_up(0.3, 0.3) end
        return true
      end }))
    end
    for _, j in ipairs((G.jokers and G.jokers.cards) or {}) do
      j:calculate_joker({ remove_playing_cards = true, removed = destroyed })
    end
    return destroyed, rank
  end,
})

-- ── CN-03 Wraith (rework) ───────────────────────────────────────────────────

K.WRAITH_DOLLARS = 5
K.UNCOMMON_ROLL = 0.9 -- get_current_pool: > 0.7 and <= 0.95 is Uncommon

R.define({
  key = 'c_mp_wraith', kind = 'Spectral', cost = 4, pos = { x = 5, y = 4 },
  balanced = true, silent_replaces = 'c_wraith',
  gate = { layers = { 'wraith_rework' } },
  config = { extra = { dollars = K.WRAITH_DOLLARS } },
  loc = { name = 'Wraith', text = { 'Creates a random Uncommon Joker', 'Gain $#1#' } },
  loc_vars = function(card)
    local ex = card and card.ability and card.ability.extra
    return { (ex and ex.dollars) or K.WRAITH_DOLLARS }
  end,
  can_use = function(card)
    return G.jokers ~= nil and (#G.jokers.cards < G.jokers.config.card_limit or card.area == G.jokers)
  end,
  use = function(card, area, copier)
    local by = used_by(card, copier)
    local dollars = card.ability.extra.dollars or K.WRAITH_DOLLARS
    G.E_MANAGER:add_event(Event({ trigger = 'after', delay = 0.4, func = function()
      C.sound('timpani')
      if g('create_card') then
        local j = create_card('Joker', G.jokers, nil, K.UNCOMMON_ROLL, nil, nil, nil, 'mp_wra')
        j:add_to_deck()
        G.jokers:emplace(j)
      end
      if by.juice_up then by:juice_up(0.3, 0.5) end
      C.ease_dollars(dollars)
      return true
    end }))
    if g('delay') then delay(0.6) end
  end,
})

-- The Wraith sprite is the vanilla Tarot sheet: the def has no atlas, so set_sprites keeps it.

-- ── Session wraps ───────────────────────────────────────────────────────────

--- Centers whose text this module renders through the Other-set alias.
K.TEXT_KEYS = {}
function K.render_as_other(key) K.TEXT_KEYS[key] = true end
for _, k in ipairs({ K.ASTEROID, 'c_mp_ouija_standard', 'c_mp_wraith' }) do K.render_as_other(k) end

local proxies = {}
local function proxy_of(center)
  local p = proxies[center]
  if not p then
    p = setmetatable({ set = 'Other' }, { __index = center })
    proxies[center] = p
  end
  return p
end

function K.alias_text(center)
  local d = G.localization and G.localization.descriptions
  if not d then return false end
  local src = d[center.set] and d[center.set][center.key]
  if not src then return false end
  d.Other = d.Other or {}
  if d.Other[center.key] == nil then d.Other[center.key] = src end
  return true
end

--- The text wrap: installed with the session, and by the display scope (the MP collection draws
--- these cards with no session mounted; vanilla's Planet branch indexes a nil hand_type).
function K.install_text(o)
  MP.hooks.wrap(_G, 'generate_card_ui', function(orig, _c, full_UI_table, specific_vars, ...)
    if _c and _c.key and K.TEXT_KEYS[_c.key] and _c.set ~= 'Other' and K.alias_text(_c) then
      if specific_vars == nil then
        local def = R.get(_c.key)
        if def and def.loc_vars then
          local ok, res = pcall(def.loc_vars, nil)
          if ok and type(res) == 'table' then specific_vars = res.vars or res end
        end
      end
      return orig(proxy_of(_c), full_UI_table, specific_vars, ...)
    end
    return orig(_c, full_UI_table, specific_vars, ...)
  end, o('text'))
end
Dsp.add_display_installer(K.install_text)

function K.install()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'content.consumables.' .. id } end
  K.install_text(o)

  -- FL-19: launch the stored asteroids right after the core marks the first PvP draw.
  if g('Game') then
    wrap(Game, 'update_draw_to_hand', function(orig, self, dt, ...)
      local r = orig(self, dt, ...)
      if C.first_pvp_draw_once('asteroids') then K.launch_asteroids() end
      return r
    end, o('asteroid_launch'))
  end
end

C.add_installer(K.install)

return K
