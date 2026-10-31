-- rmh_mp/content/trap_hooks.lua — where the victim's own actions fire planted traps (A1 §5.4,
-- A2 §3.5). Vanilla only calculates jokers at these points, so each site is wrapped (session
-- group, installed at every mount) and turned into T.event(name, ctx) (content/traps.lua):
--
--   'use'          Card.use_consumeable (after): {set, key, hand_type}  Glyph, Web, Faithful Hound
--   'reroll'       G.FUNCS.reroll_shop (after)                         Alarm
--   'wheel_left'   reroll_shop / toggle_shop / end_consumeable (before: a Wheel of Fortune is still
--                  on offer)                                            Mental Prison
--   'before'       Blind.modify_hand — right after the jokers' `before` pass, before any card
--                  scores: {poker_hands, scoring_hand, full_hand}       Symbol, Fire Trap, Explosive
--   'buy'          G.FUNCS.buy_from_shop (an event after the purchase)  Sepia Snake Sigil
--   'card_added'   playing_card_joker_effects (after)                  Guards and Wards
--   'skip'         G.FUNCS.skip_blind (the tag on the skipped blind is read BEFORE vanilla runs) Snare
--   'open'         Card.open (after; boosters)                         Programmed Illusion
--   'gold_payout'  Card.get_end_of_round_effect of the first held, non-debuffed Gold card  Phase Door
--   'seal_reward'  Blue seal (get_end_of_round_effect) / Purple seal (calculate_seal, discard)
--                  that really made a consumable: the new card is taken  Magic Mouth
--   'forbiddance'  a player discard arms it; Blind.stay_flipped keeps the refill face-down; an event
--                  after the refill fires it when >= 1 card was flipped; new_round disarms it
--
-- Also: Explosive Runes' marked Glass cards break in the destroy pass (highlight_card 'down' just
-- before the check makes the roll certain; the 'glass' stream is consumed exactly as vanilla
-- would); Programmed Illusion's fake card (built with the pack's set; G.GAME.pseudorandom and
-- used_jokers saved and restored around it, so no stream moves) and its dud pick; hidden traps
-- can't be sold or copied live; Alarm's banked rerolls land when the next shop opens; ante change
-- resets fired ids; a player coming back gets my trap list again (NET-08).

local MP = require 'rmh_mp.state'
local C = require 'rmh_mp.content.jokers.core'
local T = require 'rmh_mp.content.traps'

local H = {}
T.hooks = H

local function g(name) return rawget(_G, name) end
local function center_key(card) return card and card.config and card.config.center and card.config.center.key end

-- ── helpers ─────────────────────────────────────────────────────────────────

function H.area_holds_wheel(area)
  for _, c in ipairs((area and area.cards) or {}) do
    if center_key(c) == T.WHEEL and not (c.ability and c.ability.mp_illusion_fake) then return true end
  end
  return false
end

local function wheel_check(area)
  if H.area_holds_wheel(area) then T.event('wheel_left', {}) end
end

--- Set of the pack kinds a fake card can be made for, by the booster's card set.
H.ILLUSION_SET = { Arcana = 'Tarot', Celestial = 'Planet', Spectral = 'Spectral', Standard = 'Base',
  Buffoon = 'Joker', Trap = 'Trap' }

local function booster_set(card)
  local center = card.config and card.config.center
  local kind = center and center.kind
  if center and center.mp_open_as then kind = center.mp_open_as end
  return H.ILLUSION_SET[kind or ''] or 'Tarot'
end

local function copy_flat(t)
  local o = {}
  for k, v in pairs(t or {}) do o[k] = v end
  return o
end
local function refill(dst, src)
  for k in pairs(dst) do dst[k] = nil end
  for k, v in pairs(src) do dst[k] = v end
end

--- Build the fake card with every shared stream untouched (A2 §3.5 #11).
function H.make_fake(set)
  if not g('create_card') then return nil end
  local game = G.GAME
  local saved_rng = copy_flat(game.pseudorandom)
  local saved_used = copy_flat(game.used_jokers)
  local ok, card = pcall(create_card, set, G.pack_cards, nil, nil, true, true, nil, 'mp_illusion')
  refill(game.pseudorandom, saved_rng)
  refill(game.used_jokers, saved_used)
  if not ok then
    MP.log('error', 'programmed illusion: %s', tostring(card))
    return nil
  end
  if card and card.ability then card.ability.mp_illusion_fake = true end
  return card
end

--- Programmed Illusion's trigger (T.SPEC): arm the opened pack for one extra fake card. The card is
--- added once vanilla has filled the pack (a condition event; it gives up if the pack closes).
function T.add_illusion(booster)
  local ab = booster and booster.ability
  if not (ab and ab.set == 'Booster') or ab.mp_illusion then return false end
  ab.mp_illusion = true
  local size = ab.extra or 1
  local set = booster_set(booster)
  local waited = 0
  G.E_MANAGER:add_event(Event({ trigger = 'condition', blocking = false, blockable = false, func = function()
    waited = waited + 1
    if not G.pack_cards then return waited > 6000 end
    if #G.pack_cards.cards < size then return false end
    local fake = H.make_fake(set)
    if fake then
      G.pack_cards.config.card_limit = math.max(G.pack_cards.config.card_limit or 0, #G.pack_cards.cards + 1)
      G.pack_cards:emplace(fake)
      if fake.start_materialize then fake:start_materialize() end
    end
    return true
  end }))
  return true
end

local function count_held_gold()
  local n = 0
  for _, c in ipairs((G.hand and G.hand.cards) or {}) do
    if not c.debuff and T.is_gold(c) then n = n + 1 end
  end
  return n
end
H.count_held_gold = count_held_gold

--- Magic Mouth: after the seal's own creation event, take the new consumable away.
local function steal_after(trap, before)
  G.E_MANAGER:add_event(Event({ trigger = 'before', delay = 0, blockable = false, func = function()
    if trap.ability.mp_trap_fired then return true end
    local known = {}
    for _, c in ipairs(before) do known[c] = true end
    for _, c in ipairs(G.consumeables.cards) do
      if not known[c] and c ~= trap and not (c.ability and c.ability.mp_trap_hidden) then
        local sc = MP.card.serialize(c)
        G.consumeables:remove_card(c)
        if c.remove then c:remove() end
        local spec = T.SPEC[T.MAGIC_MOUTH]
        local payload = spec.trigger(trap, { card = sc })
        if payload then T.fire(trap, payload) end
        break
      end
    end
    return true
  end }))
end

local function seal_watch(card, call)
  local trap = (card.seal == 'Blue' or card.seal == 'Purple') and T.find_hidden(T.MAGIC_MOUTH)
  if not trap then return call() end
  local before = {}
  for i, c in ipairs(G.consumeables.cards) do before[i] = c end
  local buf = G.GAME.consumeable_buffer or 0
  local a, b = call()
  if (G.GAME.consumeable_buffer or 0) > buf then steal_after(trap, before) end
  return a, b
end

-- Forbiddance state lives on the trap card (saved with the run).
local function armed_forbiddance()
  for _, t in ipairs(T.hidden(T.FORBIDDANCE)) do
    if t.ability.mp_forbiddance_armed then return t end
  end
  return nil
end
function H.disarm_forbiddance()
  for _, t in ipairs(T.hidden(T.FORBIDDANCE)) do
    t.ability.mp_forbiddance_armed = nil
    t.ability.mp_forbiddance_flipped = nil
  end
end

-- ── session wraps ───────────────────────────────────────────────────────────

local eval_capture = nil

function H.install()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'content.trap_hooks.' .. id } end
  T.install_colours()
  T.reset()

  if g('Card') then
    wrap(Card, 'use_consumeable', function(orig, self, area, copier, ...)
      local r = orig(self, area, copier, ...)
      local ab = self.ability or {}
      if ab.set ~= 'Trap' and not ab.mp_illusion_fake then
        local cons = ab.consumeable
        T.event('use', { card = self, key = center_key(self), set = ab.set,
          hand_type = type(cons) == 'table' and cons.hand_type or nil })
      end
      return r
    end, o('use'))

    wrap(Card, 'open', function(orig, self, ...)
      local r = orig(self, ...)
      if self.ability and self.ability.set == 'Booster' then T.event('open', { booster = self }) end
      return r
    end, o('open'))

    wrap(Card, 'get_end_of_round_effect', function(orig, self, ...)
      local args = { ... }
      local n = select('#', ...)
      local r = seal_watch(self, function() return orig(self, unpack(args, 1, n)) end)
      if self.area == G.hand and not self.debuff and T.is_gold(self) then
        T.event('gold_payout', { count = count_held_gold() })
      end
      return r
    end, o('round_end_effect'))

    wrap(Card, 'calculate_seal', function(orig, self, context, ...)
      local args = { ... }
      local n = select('#', ...)
      if context and context.discard then
        return seal_watch(self, function() return orig(self, context, unpack(args, 1, n)) end)
      end
      return orig(self, context, ...)
    end, o('seal'))

    wrap(Card, 'can_sell_card', function(orig, self, ...)
      if self.ability and self.ability.mp_trap_hidden then return false end
      return orig(self, ...)
    end, o('can_sell'))

    wrap(Card, 'can_use_consumeable', function(orig, self, ...)
      if self.ability and self.ability.mp_trap_hidden then return false end
      return orig(self, ...)
    end, o('can_use'))
  end

  if g('copy_card') then
    wrap(_G, 'copy_card', function(orig, other, new_card, ...)
      local card = orig(other, new_card, ...)
      local ab = card and card.ability
      if ab and ab.mp_trap_hidden then
        -- A live copy would fire twice under the same uid: it becomes an inert, sellable card.
        ab.mp_trap_hidden, ab.mp_trap_uid, ab.mp_trap_owner, ab.mp_trap_slot = nil, nil, nil, nil
        ab.mp_trap_fired = true
        card.facing, card.sprite_facing = 'front', 'front'
      end
      return card
    end, o('copy_card'))
  end

  if g('highlight_card') then
    wrap(_G, 'highlight_card', function(orig, card, percent, dir, ...)
      if dir == 'down' and card and card.ability and card.ability.mp_trap_break and not card.debuff
        and card.ability.name == 'Glass Card' then
        card.ability.mp_trap_break = nil
        card.ability.extra = 1e-300 -- the vanilla glass roll right after this always breaks it
      end
      return orig(card, percent, dir, ...)
    end, o('explosive_runes'))
  end

  if g('Blind') then
    wrap(Blind, 'modify_hand', function(orig, self, cards, poker_hands, text, ...)
      local cap = eval_capture
      eval_capture = nil
      if cap then
        T.event('before', { poker_hands = cap.poker_hands or poker_hands, scoring_hand = cap.scoring_hand or {},
          full_hand = cards, scoring_name = text })
      end
      return orig(self, cards, poker_hands, text, ...)
    end, o('before'))

    wrap(Blind, 'stay_flipped', function(orig, self, area, card, ...)
      if area == G.hand then
        local trap = armed_forbiddance()
        if trap then
          trap.ability.mp_forbiddance_flipped = (trap.ability.mp_forbiddance_flipped or 0) + 1
          return true
        end
      end
      return orig(self, area, card, ...)
    end, o('forbiddance_flip'))
  end

  if G.FUNCS then
    wrap(G.FUNCS, 'evaluate_play', function(orig, e, ...)
      eval_capture = 'pending'
      local ok, r = pcall(orig, e, ...)
      eval_capture = nil
      for _, c in ipairs((G.play and G.play.cards) or {}) do
        if c.ability then c.ability.mp_trap_break = nil end
      end
      if not ok then error(r, 0) end
      return r
    end, o('evaluate_play'))

    wrap(G.FUNCS, 'get_poker_hand_info', function(orig, cards, ...)
      local text, disp, poker_hands, scoring_hand, nd = orig(cards, ...)
      if eval_capture == 'pending' then
        eval_capture = { poker_hands = poker_hands, scoring_hand = scoring_hand } -- same table vanilla extends
      end
      return text, disp, poker_hands, scoring_hand, nd
    end, o('hand_info'))

    wrap(G.FUNCS, 'reroll_shop', function(orig, e, ...)
      wheel_check(G.shop_jokers)
      local r = orig(e, ...)
      T.event('reroll', {})
      return r
    end, o('reroll'))

    wrap(G.FUNCS, 'toggle_shop', function(orig, e, ...)
      if G.shop then wheel_check(G.shop_jokers) end
      return orig(e, ...)
    end, o('leave_shop'))

    wrap(G.FUNCS, 'end_consumeable', function(orig, e, ...)
      wheel_check(G.pack_cards)
      return orig(e, ...)
    end, o('end_pack'))

    wrap(G.FUNCS, 'buy_from_shop', function(orig, e, ...)
      local c1 = e and e.config and e.config.ref_table
      local r = orig(e, ...)
      if r ~= false and c1 and c1.ability and c1.ability.set == 'Joker' then
        G.E_MANAGER:add_event(Event({ func = function()
          if c1.area == G.jokers then T.event('buy', { card = c1 }) end
          return true
        end }))
      end
      return r
    end, o('buy'))

    wrap(G.FUNCS, 'skip_blind', function(orig, e, ...)
      local tags = G.GAME.round_resets and G.GAME.round_resets.blind_tags
      local tag_key = tags and G.GAME.blind_on_deck and tags[G.GAME.blind_on_deck]
      local r = orig(e, ...)
      T.event('skip', { tag_key = tag_key })
      return r
    end, o('skip'))

    wrap(G.FUNCS, 'discard_cards_from_highlighted', function(orig, e, hook, ...)
      local had = not hook and G.hand and #G.hand.highlighted > 0
      local r = orig(e, hook, ...)
      if had and G.STATE == G.STATES.DRAW_TO_HAND then
        for _, t in ipairs(T.hidden(T.FORBIDDANCE)) do
          t.ability.mp_forbiddance_armed = true
          t.ability.mp_forbiddance_flipped = 0
        end
      end
      return r
    end, o('forbiddance_arm'))

    wrap(G.FUNCS, 'draw_from_deck_to_hand', function(orig, e, ...)
      local trap = armed_forbiddance()
      local r = orig(e, ...)
      if trap then
        G.E_MANAGER:add_event(Event({ trigger = 'immediate', func = function()
          local flipped = trap.ability.mp_forbiddance_flipped or 0
          trap.ability.mp_forbiddance_armed, trap.ability.mp_forbiddance_flipped = nil, nil
          if flipped > 0 and not trap.ability.mp_trap_fired then T.event('forbiddance', { flipped = flipped }) end
          return true
        end }))
      end
      return r
    end, o('forbiddance_fire'))

    -- Programmed Illusion's fake: picking it spends a pick and gives nothing.
    wrap(G.FUNCS, 'use_card', function(orig, e, mute, nosave, ...)
      local card = e and e.config and e.config.ref_table
      local ab = card and card.ability
      if not (ab and ab.mp_illusion_fake) then return orig(e, mute, nosave, ...) end
      local set, cons = ab.set, ab.consumeable
      ab.set, ab.consumeable = 'mp_illusion', nil
      local ok, r = pcall(orig, e, mute, nosave, ...)
      ab.set, ab.consumeable = set, cons
      if G.hand and G.hand.unhighlight_all then G.hand:unhighlight_all() end
      if not ok then error(r, 0) end
      return r
    end, o('illusion_pick'))
  end

  if g('playing_card_joker_effects') then
    wrap(_G, 'playing_card_joker_effects', function(orig, cards, ...)
      local r = orig(cards, ...)
      T.event('card_added', { cards = cards })
      return r
    end, o('card_added'))
  end

  if g('new_round') then
    wrap(_G, 'new_round', function(orig, ...)
      H.disarm_forbiddance()
      return orig(...)
    end, o('forbiddance_disarm'))
  end

  if g('Game') then
    wrap(Game, 'update_shop', function(orig, self, dt, ...)
      if not G.STATE_COMPLETE and (G.GAME.mp_pending_free_rerolls or 0) > 0 then
        local n = G.GAME.mp_pending_free_rerolls
        G.GAME.mp_pending_free_rerolls = nil
        local cr = G.GAME.current_round
        cr.free_rerolls = (cr.free_rerolls or 0) + n
        if g('calculate_reroll_cost') then calculate_reroll_cost(true) end
      end
      return orig(self, dt, ...)
    end, o('pending_rerolls'))
  end
end

-- ── per-frame bookkeeping: ante change; players coming back (presence observer) ─

H.seen_ante = nil
H.seen_presence = {}
H.rebroadcast = false

--- MP.report presence observer: a player who is back (or caught up after a rejoin) gets my
--- trap list again on the next frame (NET-08). Repeated frames with the same status are ignored.
function H.on_presence(p)
  if not MP.in_session() then return end
  if p.status == H.seen_presence[p.id] then return end
  H.seen_presence[p.id] = p.status
  if p.status == 'back' or p.status == 'caught_up' then H.rebroadcast = true end
end

function H.frame()
  if not (MP.in_session() and G.GAME and G.GAME.round_resets) then
    -- Runs every frame outside a session too: reset without allocating a table each frame.
    H.seen_ante = nil
    if H.seen_presence == nil or next(H.seen_presence) ~= nil then H.seen_presence = {} end
    H.rebroadcast = false
    return
  end
  local ante = G.GAME.round_resets.ante
  local force = H.seen_ante == nil or H.rebroadcast -- a session (or a rejoin) just started: tell everyone
  H.rebroadcast = false
  if H.seen_ante ~= nil and ante ~= H.seen_ante then T.new_ante() end
  H.seen_ante = ante
  if force then T.broadcast_held(true) end
end

if not H.frame_hooked then
  H.frame_hooked = true
  MP.net.add_frame_hook(function() local ok, err = pcall(H.frame); if not ok then MP.log('error', 'trap frame: %s', tostring(err)) end end)
  if MP.report and MP.report.on then MP.report.on('presence', H.on_presence) end
end

C.add_installer(H.install)

return H
