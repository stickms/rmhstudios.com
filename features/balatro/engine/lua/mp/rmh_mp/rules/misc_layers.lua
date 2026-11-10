-- rmh_mp/rules/misc_layers.lua — modifier layers LY-12…LY-24 (A1 §3.3, D-39).
--
-- Data-only layers (bans/reworks: wraith_rework, gambling_opportunity, …) need nothing here —
-- the resolved bundle carries their keys. This file implements the behavioural ones:
--   bigger_shop          +1 shop slot (run start)
--   no_red_seals         Card:set_seal('Red') is a no-op (the existing seal stays)
--   eeeee                per ante and key, a seeded 40 % chance that pseudoseed returns a fixed
--                        value for the whole ante instead of advancing
--   polymorph_spam       at the start of every blind each joker/consumable becomes the N-th next
--                        included center of its set (N = slot position); MP.misc.polymorph_chain(card)
--                        feeds the "Transmutations" tooltip
--   score_instability    final scoring step: d = chips − mult, clamped, chips += d, mult −= d (D-03)
--   glass_cannon         final scoring step: mult × 4
--   shared_pockets       hand, jokers and consumables share 15 slots (hand size = base + 7 − held)
--   no_uncommons         get_current_pool('Joker'): an Uncommon rarity roll (0.7 < r <= 0.95)
--                        becomes Common. The roll is drawn exactly as vanilla draws it (same key,
--                        once), so the seeded streams stay in step across peers; Rare and
--                        Legendary are untouched. The bundle also bans the Uncommon Tag (EX-18)
--   economy / esoteric   nothing here: the bundle's gameModifiers carry them (D-39: inflation,
--                        no_interest, discard_cost, money_per_discard, no_blind_reward.Small/Big,
--                        booster_ante_scaling, flipped_cards, debuff_played_cards, all_eternal) and
--                        session.apply_modifiers writes them into G.GAME.modifiers
-- Numbers come from the bundle's `mp_` params (MP.layer_param), the constants below are fallbacks:
--   mp_shop_slots_bonus, mp_eeeee_chance, mp_shared_slots, mp_glass_cannon_xmult

local MP = require 'rmh_mp.state'
local rng = require 'rmh_mp.util.rng'

local M = {}
MP.misc = M

M.EEEEE_P = 0.4           -- mp_eeeee_chance
M.SHARED_SLOTS = 15       -- mp_shared_slots
M.SHARED_HAND_BONUS = 7
M.GLASS_CANNON_XMULT = 4  -- mp_glass_cannon_xmult
M.SHOP_SLOTS_BONUS = 1     -- mp_shop_slots_bonus

local function param(name, default) return tonumber(MP.layer_param(name, default)) or default end


function M.score_instability(chips, mult)
  local d = chips - mult
  if d > 0 then d = math.min(d, mult - 1) elseif d < 0 then d = math.max(d, -chips) end
  return chips + d, mult - d, d
end

--- no_uncommons: the rarity roll get_current_pool should use instead of `r` (Common for Uncommon).
M.NO_UNCOMMONS_FALLBACK = 0 -- any roll <= 0.7 is Common in vanilla's ladder
function M.no_uncommons_roll(r)
  if type(r) == 'number' and r > 0.7 and r <= 0.95 then return M.NO_UNCOMMONS_FALLBACK end
  return r
end

function M.glass_cannon(chips, mult) return chips, mult * param('mp_glass_cannon_xmult', M.GLASS_CANNON_XMULT) end

-- ── polymorph ───────────────────────────────────────────────────────────────

local function included_pool(set)
  local out = {}
  for _, v in ipairs(G.P_CENTER_POOLS[set] or {}) do
    if not G.GAME.banned_keys[v.key] and not v.hidden then out[#out + 1] = v end
  end
  return out
end

function M.polymorph_target(card, steps)
  local center = card.config and card.config.center
  local set = card.ability and card.ability.set or (center and center.set)
  local pool = included_pool(set)
  if #pool == 0 or not center then return nil end
  local idx = 0
  for i, v in ipairs(pool) do if v.key == center.key then idx = i; break end end
  if idx == 0 then return pool[(steps - 1) % #pool + 1] end
  return pool[(idx - 1 + steps) % #pool + 1]
end

function M.polymorph_chain(card, length)
  local chain = {}
  for i = 1, (length or 5) do
    local t = M.polymorph_target(card, i)
    if not t then break end
    chain[#chain + 1] = t.key
  end
  return chain
end

function M.polymorph_all()
  for _, area in ipairs({ G.jokers, G.consumeables }) do
    for i, card in ipairs((area and area.cards) or {}) do
      local target = M.polymorph_target(card, i)
      if target and card.set_ability and target ~= card.config.center then
        card:set_ability(target)
        if card.set_cost then card:set_cost() end
      end
    end
  end
end

-- ── shared pockets ──────────────────────────────────────────────────────────

local pockets = nil
function M.shared_pockets_start()
  if not (G.hand and G.jokers and G.consumeables) then return end
  pockets = { base = G.hand.config.card_limit, last = nil }
  local slots = param('mp_shared_slots', M.SHARED_SLOTS)
  G.jokers.config.card_limit = slots
  G.consumeables.config.card_limit = slots
  M.shared_pockets_update()
end

function M.shared_pockets_update()
  if not pockets or not G.hand or not G.hand.config then return end
  if pockets.last and G.hand.config.card_limit ~= pockets.last then
    pockets.base = pockets.base + (G.hand.config.card_limit - pockets.last) -- Juggler, Troubadour, …
  end
  local held = #(G.jokers and G.jokers.cards or {}) + #(G.consumeables and G.consumeables.cards or {})
  local want = math.max(1, pockets.base + M.SHARED_HAND_BONUS - held)
  G.hand.config.card_limit = want
  pockets.last = want
end

function M.shared_pockets_stop() pockets = nil end

-- ── registration ────────────────────────────────────────────────────────────

function M.register(rules)
  rules.layer_hook('bigger_shop', function()
    G.GAME.shop = G.GAME.shop or { joker_max = 2 }
    G.GAME.shop.joker_max = (G.GAME.shop.joker_max or 2) + param('mp_shop_slots_bonus', M.SHOP_SLOTS_BONUS)
  end)
  rules.layer_post_hook('shared_pockets', M.shared_pockets_start)
end

function M.install()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'misc.' .. id } end
  if rawget(_G, 'Card') then
    wrap(Card, 'set_seal', function(orig, self, seal, ...)
      if seal == 'Red' and MP.layer_active('no_red_seals') then return end
      return orig(self, seal, ...)
    end, o('no_red_seals'))
  end
  wrap(_G, 'pseudoseed', function(orig, key, predict_seed, ...)
    if predict_seed == nil and key ~= 'seed' and type(key) == 'string' and MP.layer_active('eeeee') then
      local g = G.GAME
      local salt = tostring(g.round_resets.ante) .. tostring(g.pseudorandom.seed or '')
      if pseudohash(key .. '_eeeee' .. salt) < param('mp_eeeee_chance', M.EEEEE_P) then
        return (pseudohash(key .. '_eeeee_v' .. salt) + (g.pseudorandom.hashed_seed or 0)) / 2
      end
    end
    return orig(key, predict_seed, ...)
  end, o('eeeee'))
  wrap(_G, 'get_current_pool', function(orig, _type, _rarity, _legendary, _append, ...)
    if _type == 'Joker' and not _legendary and MP.layer_active('no_uncommons') then
      -- Vanilla's own draw (common_events.lua get_current_pool), made here so it can be remapped.
      local r = _rarity or pseudorandom('rarity' .. G.GAME.round_resets.ante .. (_append or ''))
      return orig(_type, M.no_uncommons_roll(r), _legendary, _append, ...)
    end
    return orig(_type, _rarity, _legendary, _append, ...)
  end, o('no_uncommons'))
  wrap(_G, 'new_round', function(orig, ...)
    local r = orig(...)
    if MP.layer_active('polymorph_spam') then
      G.E_MANAGER:add_event(Event({ func = function() M.polymorph_all(); return true end }))
    end
    return r
  end, o('polymorph'))
  if rawget(_G, 'Back') then
    wrap(Back, 'trigger_effect', function(orig, self, args, ...)
      local c, m = orig(self, args, ...)
      if args and args.context == 'final_scoring_step' then
        local chips, mult = c or args.chips, m or args.mult
        local touched = false
        if MP.layer_active('glass_cannon') then chips, mult = M.glass_cannon(chips, mult); touched = true end
        if MP.layer_active('score_instability') then
          local d
          chips, mult, d = M.score_instability(chips, mult)
          touched = true
          if d ~= 0 and MP.ui and MP.ui.toast then pcall(MP.ui.toast, 'k_destabilized') end
        end
        if touched then
          if rawget(_G, 'update_hand_text') then pcall(update_hand_text, { delay = 0 }, { chips = chips, mult = mult }) end
          return chips, mult
        end
      end
      return c, m
    end, o('final_scoring'))
  end
  if MP.layer_active('shared_pockets') then
    -- One hook for the whole boot: add_frame_hook dedupes by identity, and a fresh closure per
    -- mount added another per-frame hook every session (found by WS14b's perf_spec).
    M.pockets_frame = M.pockets_frame or function()
      if MP.in_session() and MP.layer_active('shared_pockets') then M.shared_pockets_update() end
    end
    MP.net.add_frame_hook(M.pockets_frame)
  end
end

M._rng = rng
return M
