-- rmh_mp/content/traps.lua — the Trap consumable type and the 16 traps (CN-05…CN-21, A1 §5,
-- A2 §3.5, A3 §2.4): plant, disguise, fire, pay, the trap row data and `trap_held` (NET-08).
--
-- Lifecycle (everything here; the vanilla call sites that FIRE traps are content/trap_hooks.lua):
--   1. Take: a Trap is usable only while it sits in a pack (can_use). Using it plants it:
--        * if I hold a hidden, unfired Arcane Lock (planted on me), the trap BOUNCES: a copy goes
--          face-down into my own consumables, owned by the lock's owner, and the lock fires;
--        * else it is serialised (MP.card, SafeCard) and sent as `trap_plant {card, owner, uid}` to
--          my card target / ante nemesis (JS routes P>H>T: lib/balatro/mp/match/routing.ts);
--        * with no nemesis (practice, a bye, no pairing yet) the trap is wasted and the toast
--          `rmh_mp_trap_fizzled` is shown (D-09).
--   2. Disguise (receiver): rebuilt face-down in G.consumeables, never sellable or usable. It does
--      not take a slot: the area's card_limit grows by one while it is held (`mp_trap_slot`).
--   3. Fire: when the victim's own action matches (T.event(name, ctx) from trap_hooks), the trap is
--      marked fired once, flips face-up mid-screen and dissolves after 0.9 s; the victim-side
--      effect runs in its `trigger`, and `trap_fired {owner, key, uid, payload}` goes to the owner
--      (the owner fixed at plant time, even if pairings rotated since).
--   4. Pay (owner): `reward(payload)` after Lua-side validation of the payload, then the
--      "<Name> Triggered!" notice over the consumables.
--   5. Trap row: `trap_held {cards:[{uid,key,owner}], fired:[uid]}` is broadcast whenever my held
--      list changes, and again when a player comes back (NET-08). Received rows are kept in
--      MP.state.traps.nemesis_rows[from]; T.nemesis_row() is the face-down row WS11 draws (each
--      entry says whether I own it: only the owner may see its text). Fired ids reset every ante.
--
-- Public: MP.traps (= MP.content.traps)
--   T.KEYS, T.SPEC[key] = { on, trigger(card, ctx) -> payload|nil, reward(payload, from) }
--   T.event(name, ctx) -> n fired       T.hidden(key?) -> cards      T.find_hidden(key)
--   T.plant(card) T.receive_plant(from, d) T.disguise(card, owner, uid) T.fire(card, payload)
--   T.receive_fired(from, d) T.broadcast_held(force) T.receive_held(from, d) T.nemesis_row()
--   T.target() T.on_change(fn) T.give(key, opts) T.reveal(card)

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local C = require 'rmh_mp.content.jokers.core'
local CN = require 'rmh_mp.content.consumables'

local T = MP.traps or {}
MP.traps = T
MP.content.traps = T

local function g(name) return rawget(_G, name) end
local function me() local s = MP.state.session; return s and s.me end

T.COLOUR = { 0x4F / 255, 0x63 / 255, 0x67 / 255, 1 }      -- #4F6367 (primary)
T.DARK_PINK = { 0xAF / 255, 0x50 / 255, 0x50 / 255, 1 }   -- #AF5070 (secondary, notices)
T.ARCANE_LOCK = 'c_mp_trap_arcane_lock'
T.FORBIDDANCE = 'c_mp_trap_forbiddance'
T.MAGIC_MOUTH = 'c_mp_trap_magic_mouth'
T.MENTAL_PRISON = 'c_mp_trap_mental_prison'
T.ILLUSION = 'c_mp_trap_programmed_illusion'
T.WHEEL = 'c_wheel_of_fortune'
T.MAX_ROW = 64

-- Sheet order = Trap.png column (A2 §3.5).
T.ORDER = {
  { 'glyph_of_warding', 'Glyph of Warding' }, { 'symbol', 'Symbol' }, { 'alarm', 'Alarm' },
  { 'explosive_runes', 'Explosive Runes' }, { 'sepia_snake_sigil', 'Sepia Snake Sigil' },
  { 'fire_trap', 'Fire Trap' }, { 'guards_and_wards', 'Guards and Wards' }, { 'magic_mouth', 'Magic Mouth' },
  { 'snare', 'Snare' }, { 'arcane_lock', 'Arcane Lock' }, { 'programmed_illusion', 'Programmed Illusion' },
  { 'web', 'Web' }, { 'forbiddance', 'Forbiddance' }, { 'faithful_hound', 'Faithful Hound' },
  { 'phase_door', 'Phase Door' }, { 'mental_prison', 'Mental Prison' },
}
T.KEYS = {}
T.NAMES = {}
for i, e in ipairs(T.ORDER) do
  local key = 'c_mp_trap_' .. e[1]
  T.KEYS[i] = key
  T.NAMES[key] = e[2]
end

-- ── small helpers ───────────────────────────────────────────────────────────

local function is_trap_key(key) return type(key) == 'string' and T.NAMES[key] ~= nil end
T.is_trap_key = is_trap_key

local function center_key(card) return card and card.config and card.config.center and card.config.center.key end

function T.name(key)
  if g('localize') then
    local ok, s = pcall(localize, { type = 'name_text', set = 'Trap', key = key })
    if ok and type(s) == 'string' and s ~= 'ERROR' and s ~= '' then return s end
  end
  return T.NAMES[key] or tostring(key)
end

T.listeners = T.listeners or {}
--- UI observers: fn(event, data) with event 'row' (a nemesis row changed), 'held' (my held list
--- changed), 'fired_own' (one of MY traps fired on someone: data = key).
function T.on_change(fn) T.listeners[#T.listeners + 1] = fn end
local function notify(ev, data)
  for _, fn in ipairs(T.listeners) do
    local ok, err = pcall(fn, ev, data)
    if not ok then MP.log('error', 'traps listener failed: %s', tostring(err)) end
  end
end
T.notify = notify

local function traps_state()
  local st = MP.state.traps
  if type(st) ~= 'table' then st = {}; MP.state.traps = st end
  st.held = st.held or {}
  st.nemesis_rows = st.nemesis_rows or {}
  st.fired = st.fired or {}
  return st
end
T.state = traps_state

--- Where my traps go: the Teams card target, else the ante nemesis (nil on a bye / no pairing).
function T.target()
  local ct = MP.state.card_target
  if ct and ct ~= '' then return ct end
  return C.target()
end

local uid_n = 0
function T.new_uid()
  uid_n = uid_n + 1
  local who = tostring(me() or 'p'):gsub('[^%w]', ''):sub(1, 12)
  return string.format('%s.%x.%d', who, os.time() % 0x1000000, uid_n):sub(1, 32)
end

--- Room in the consumable area, counting cards still being made (the buffer).
function T.room()
  local area = G.consumeables
  if not area then return false end
  return #area.cards + (G.GAME.consumeable_buffer or 0) < area.config.card_limit
end

--- Make a card of `key` without touching any shared RNG stream (no create_card polls).
--- opts: { area, edition = 'negative'|..., check_room = bool }. Returns the card or nil.
function T.give(key, opts)
  opts = opts or {}
  local center = G.P_CENTERS[key]
  local area = opts.area or (center and center.set == 'Joker' and G.jokers) or G.consumeables
  if not center or not area then return nil end
  if opts.check_room then
    local n = #area.cards
    if area == G.consumeables then n = n + (G.GAME.consumeable_buffer or 0) end
    if n >= area.config.card_limit and opts.edition ~= 'negative' then return nil end
  end
  local at = area.T or { x = 0, y = 0 }
  local card = Card(at.x, at.y, G.CARD_W, G.CARD_H, nil, center,
    { bypass_discovery_center = true, bypass_discovery_ui = true })
  if opts.edition and card.set_edition then card:set_edition({ [opts.edition] = true }, true, true) end
  if card.add_to_deck then card:add_to_deck() end
  area:emplace(card)
  return card
end

-- ── hidden traps (victim side) ──────────────────────────────────────────────

local function is_hidden(card)
  local ab = card and card.ability
  return ab ~= nil and ab.mp_trap_hidden == true and not ab.mp_trap_fired
end
T.is_hidden = is_hidden

--- My hidden, unfired traps (in area order), optionally of one key.
function T.hidden(key)
  local out = {}
  for _, c in ipairs((G.consumeables and G.consumeables.cards) or {}) do
    if is_hidden(c) and (not key or center_key(c) == key) then out[#out + 1] = c end
  end
  return out
end

function T.find_hidden(key) return T.hidden(key)[1] end

--- Turn a freshly built trap card in G.consumeables into a planted one (face-down, slotless).
function T.disguise(card, owner, uid)
  local ab = card.ability
  ab.mp_trap_hidden = true
  ab.mp_trap_owner = owner
  ab.mp_trap_uid = uid or T.new_uid()
  card.facing = 'back'
  card.sprite_facing = 'back'
  if not ab.mp_trap_slot and G.consumeables then
    ab.mp_trap_slot = true
    G.consumeables.config.card_limit = G.consumeables.config.card_limit + 1
  end
  if card.area ~= G.consumeables and G.consumeables then G.consumeables:emplace(card) end
  T.broadcast_held()
  return card
end

--- Give the slot back (the trap is leaving the area).
local function release_slot(card)
  local ab = card.ability
  if ab.mp_trap_slot and G.consumeables then
    ab.mp_trap_slot = nil
    G.consumeables.config.card_limit = math.max(0, G.consumeables.config.card_limit - 1)
  end
end
T.release_slot = release_slot

--- The victim-side reveal: out of the area, mid-screen, flip, dissolve (like a used Tarot).
function T.reveal(card)
  release_slot(card)
  if card.area then card.area:remove_card(card) end
  card.ability.mp_trap_hidden = nil
  G.E_MANAGER:add_event(Event({ trigger = 'after', delay = 0.1, blockable = false, func = function()
    if G.play and G.play.T and card.T then
      card.T.x = G.play.T.x + G.play.T.w / 2 - card.T.w / 2
      card.T.y = G.play.T.y + G.play.T.h / 2 - card.T.h / 2
    end
    if card.flip then card:flip() end
    if card.juice_up then card:juice_up(0.8, 0.5) end
    C.sound('tarot2')
    return true
  end }))
  G.E_MANAGER:add_event(Event({ trigger = 'after', delay = 0.9, blockable = false, func = function()
    if card.start_dissolve then card:start_dissolve() end
    return true
  end }))
end

--- Fire one hidden trap: once only, reveal it, notify its owner.
function T.fire(card, payload)
  local ab = card.ability
  if ab.mp_trap_fired then return false end
  ab.mp_trap_fired = true
  local key, uid, owner = center_key(card), ab.mp_trap_uid, ab.mp_trap_owner
  local st = traps_state()
  if uid then st.fired[#st.fired + 1] = uid end
  T.reveal(card)
  payload = payload or {}
  if owner and owner == me() then
    T.pay(key, payload, me())                  -- never expected (a trap never targets its owner)
  elseif owner then
    MP.peer.send('trap_fired', { owner = owner, key = key, uid = uid or '', payload = payload })
  end
  if MP.replay_hook then pcall(MP.replay_hook, 'net_trap', { key = key, uid = uid, owner = owner, side = 'victim' }) end
  T.broadcast_held()
  return true
end

--- Fire every hidden trap whose `on` is `name` and whose trigger answers. Returns how many fired.
function T.event(name, ctx)
  if not (MP.in_session() and G.consumeables) then return 0 end
  ctx = ctx or {}
  local n = 0
  for _, card in ipairs(T.hidden()) do
    local spec = T.SPEC[center_key(card)]
    if spec and spec.on == name then
      local ok, payload = pcall(spec.trigger or function() return {} end, card, ctx)
      if not ok then
        MP.log('error', 'trap %s trigger failed: %s', tostring(center_key(card)), tostring(payload))
      elseif payload then
        if T.fire(card, payload) then n = n + 1 end
      end
    end
  end
  return n
end

-- ── planting (taker side) ───────────────────────────────────────────────────

function T.fizzle()
  if MP.ui and MP.ui.toast then
    local ok = pcall(MP.ui.toast, 'rmh_mp_trap_fizzled')
    if ok then return end
  end
  if g('attention_text') and G.play then
    attention_text({ text = C.loc('rmh_mp_trap_fizzled', 'No Nemesis - trap fizzled'), scale = 0.6, hold = 1.4,
      major = G.play, align = 'cm', offset = { x = 0, y = -1 }, colour = T.DARK_PINK })
  end
end

--- Arcane Lock bounce: the taken trap is planted on ME, owned by the lock's owner.
function T.bounce(card, lock)
  local sc = MP.card.serialize(card)
  sc.edition = nil
  local copy = MP.card.build(sc, G.consumeables)
  if copy then
    if copy.add_to_deck then copy:add_to_deck() end
    G.consumeables:emplace(copy)
    T.disguise(copy, lock.ability.mp_trap_owner, T.new_uid())
  end
  T.fire(lock, {})
  return 'bounced'
end

--- Using a Trap from a pack. Returns 'bounced' | 'planted' | 'fizzled'.
function T.plant(card)
  local lock = T.find_hidden(T.ARCANE_LOCK)
  if lock then return T.bounce(card, lock) end
  local target = T.target()
  if not (target and me() and MP.is_match()) then
    T.fizzle()
    return 'fizzled'
  end
  local sc = MP.card.serialize(card)
  sc.edition, sc.seal, sc.extra = nil, nil, nil
  local uid = T.new_uid()
  MP.peer.send('trap_plant', { card = sc, owner = me(), uid = uid })
  if MP.replay_hook then pcall(MP.replay_hook, 'net_trap', { key = sc.key, uid = uid, owner = me(), side = 'plant' }) end
  return 'planted'
end

local function planting_ready()
  return G.consumeables ~= nil and G.STAGE == (G.STAGES and G.STAGES.RUN) and MP.in_session()
end

--- `trap_plant` from a peer: build it face-down in my consumables.
function T.receive_plant(from, d)
  if type(d) ~= 'table' or type(d.card) ~= 'table' then return false end
  local key = d.card.key
  if not is_trap_key(key) then
    MP.log('warn', 'trap_plant: %s is not a trap', tostring(key))
    return false
  end
  -- The host stamps `from`; an owner other than the sender is a forgery.
  if from and d.owner ~= from then
    MP.log('warn', 'trap_plant: owner %s is not the sender %s', tostring(d.owner), tostring(from))
    return false
  end
  local uid = type(d.uid) == 'string' and d.uid:sub(1, 32) or T.new_uid()
  for _, c in ipairs((G.consumeables and G.consumeables.cards) or {}) do
    if c.ability and c.ability.mp_trap_uid == uid and c.ability.mp_trap_owner == d.owner then return false end
  end
  MP.net.defer(function()
    local card = MP.card.build({ key = key }, G.consumeables)
    if not card then return end
    if card.add_to_deck then card:add_to_deck() end
    G.consumeables:emplace(card)
    T.disguise(card, d.owner, uid)
  end, planting_ready, 'traps')
  return true
end

-- ── paying (owner side) ─────────────────────────────────────────────────────

function T.announce(key)
  local name = T.name(key)
  local text = C.loc_var('rmh_mp_trap_triggered', { name }, name .. ' Triggered!')
  if g('attention_text') and G.consumeables and G.consumeables.T then
    G.E_MANAGER:add_event(Event({ trigger = 'after', delay = 0.1, blockable = false, func = function()
      attention_text({ text = text, scale = 0.8, colour = T.DARK_PINK, align = 'cm', hold = 1.2,
        pos = { x = G.consumeables.T.x + G.consumeables.T.w / 2, y = G.consumeables.T.y } })
      C.sound('tarot2')
      return true
    end }))
  end
  notify('fired_own', key)
end

function T.pay(key, payload, from)
  local spec = T.SPEC[key]
  if not spec then return false end
  if spec.reward then
    local ok, err = pcall(spec.reward, type(payload) == 'table' and payload or {}, from)
    if not ok then MP.log('error', 'trap %s reward failed: %s', key, tostring(err)) end
  end
  T.announce(key)
  return true
end

--- `trap_fired` from a victim: pay me if I own the trap.
function T.receive_fired(from, d)
  if type(d) ~= 'table' or d.owner ~= me() or not is_trap_key(d.key) then return false end
  local st = traps_state()
  st.paid = st.paid or {}
  local id = tostring(from) .. ':' .. tostring(d.uid)
  if d.uid and d.uid ~= '' and st.paid[id] then return false end   -- duplicate delivery
  if d.uid and d.uid ~= '' then st.paid[id] = true end
  local row = st.nemesis_rows[from]
  if row and d.uid then row.fired[d.uid] = true; notify('row', from) end
  MP.net.defer(function() T.pay(d.key, d.payload, from) end, function()
    return G.consumeables ~= nil and MP.in_session()
  end, 'traps')
  return true
end

-- ── trap row (NET-08) ───────────────────────────────────────────────────────

local last_held_sig = nil
local function held_payload()
  local cards, sig = {}, {}
  for _, c in ipairs(T.hidden()) do
    if #cards >= T.MAX_ROW then break end
    local ab = c.ability
    cards[#cards + 1] = { uid = ab.mp_trap_uid or '', key = center_key(c), owner = ab.mp_trap_owner or '' }
    sig[#sig + 1] = cards[#cards].uid
  end
  local st = traps_state()
  local fired = {}
  for i = math.max(1, #st.fired - T.MAX_ROW + 1), #st.fired do fired[#fired + 1] = st.fired[i] end
  st.held = cards
  return { cards = MP.json_array(cards), fired = MP.json_array(fired) },
    table.concat(sig, ',') .. '|' .. table.concat(fired, ',')
end

function T.broadcast_held(force)
  if not MP.is_match() then return false end
  local d, sig = held_payload()
  if not force and sig == last_held_sig then return false end
  last_held_sig = sig
  MP.peer.send('trap_held', d)
  notify('held', d)
  return true
end

function T.receive_held(from, d)
  if type(d) ~= 'table' or type(d.cards) ~= 'table' or not from or from == me() then return false end
  local cards = {}
  for _, c in ipairs(d.cards) do
    if #cards >= T.MAX_ROW then break end
    if type(c) == 'table' and is_trap_key(c.key) then
      cards[#cards + 1] = { uid = tostring(c.uid), key = c.key, owner = tostring(c.owner) }
    end
  end
  local fired = {}
  for _, u in ipairs(type(d.fired) == 'table' and d.fired or {}) do fired[tostring(u)] = true end
  traps_state().nemesis_rows[from] = { cards = cards, fired = fired }
  notify('row', from)
  return true
end

--- The face-down row for my ante nemesis: { {uid, key, owner, mine}, ... } minus fired ones.
--- Only `mine` entries may show their name/text (A1 §5.3.4).
function T.nemesis_row(id)
  id = id or T.target()
  local row = id and traps_state().nemesis_rows[id]
  local out = {}
  if not row then return out end
  for _, c in ipairs(row.cards) do
    if not row.fired[c.uid] then
      out[#out + 1] = { uid = c.uid, key = c.key, owner = c.owner, mine = (c.owner == me()) }
    end
  end
  return out
end

--- New ante: forget fired ids (mine and the rows').
function T.new_ante()
  local st = traps_state()
  st.fired = {}
  for _, row in pairs(st.nemesis_rows) do row.fired = {} end
  last_held_sig = nil
end

function T.reset()
  last_held_sig = nil
  uid_n = 0
end

-- ── the 16 traps ────────────────────────────────────────────────────────────

local function has_hand(ctx, name)
  local ph = ctx.poker_hands
  return type(ph) == 'table' and type(ph[name]) == 'table' and next(ph[name]) ~= nil
end

local RANK_CODE = { [2] = '2', [3] = '3', [4] = '4', [5] = '5', [6] = '6', [7] = '7', [8] = '8', [9] = '9',
  [10] = 'T', [11] = 'J', [12] = 'Q', [13] = 'K', [14] = 'A' }
T.SUITS = { 'Spades', 'Hearts', 'Clubs', 'Diamonds' }

--- Fire Trap: one rank down, floor 2 (Stone cards keep their base too, as vanilla Strength does).
function T.rank_down(card)
  local base = card.base
  if not (base and base.suit and base.id and G.P_CARDS) then return false end
  local id = math.max(2, base.id - 1)
  local front = G.P_CARDS[base.suit:sub(1, 1) .. '_' .. RANK_CODE[id]]
  if front and card.set_base then card:set_base(front); return true end
  return false
end

local function is_glass(card)
  return card.config and card.config.center and card.config.center.key == 'm_glass'
end
local function is_gold(card)
  return card.config and card.config.center and card.config.center.key == 'm_gold'
end
T.is_glass, T.is_gold = is_glass, is_gold

local function clamp_int(v, lo, hi)
  v = tonumber(v)
  if not v or v ~= v then return nil end
  v = math.floor(v)
  if v < lo then v = lo end
  if v > hi then v = hi end
  return v
end

local CONSUMABLE_SETS = { Tarot = true, Planet = true, Spectral = true }

T.SPEC = {
  -- 1. Spectral used -> owner gets a Ward Tag (a free Jumbo Spectral pack at the next blind choice)
  c_mp_trap_glyph_of_warding = {
    on = 'use',
    trigger = function(_, ctx) if ctx.set == 'Spectral' then return {} end end,
    reward = function()
      if G.P_TAGS.tag_mp_ward and g('add_tag') and g('Tag') then add_tag(Tag('tag_mp_ward')) end
    end,
  },
  -- 2. A Flush is played -> every scored card becomes a random suit ('mp_trap_symbol')
  c_mp_trap_symbol = {
    on = 'before',
    trigger = function(_, ctx)
      if not has_hand(ctx, 'Flush') then return nil end
      for _, c in ipairs(ctx.scoring_hand or {}) do
        local suit = pseudorandom_element(T.SUITS, pseudoseed('mp_trap_symbol'))
        if c.change_suit then c:change_suit(suit) end
      end
      return {}
    end,
  },
  -- 3. Shop reroll -> owner gets 2 free rerolls (now in a shop, else at the next one)
  c_mp_trap_alarm = {
    on = 'reroll',
    trigger = function() return { rerolls = 2 } end,
    reward = function(p) T.grant_free_rerolls(clamp_int(p.rerolls, 0, 2) or 2) end,
  },
  -- 4. A scored, non-debuffed Glass card -> those Glass cards break after scoring
  c_mp_trap_explosive_runes = {
    on = 'before',
    trigger = function(_, ctx)
      local armed = false
      for _, c in ipairs(ctx.scoring_hand or {}) do
        if not c.debuff and is_glass(c) then
          c.ability.mp_trap_break = true
          armed = true
        end
      end
      if armed then return {} end
    end,
  },
  -- 5. A Rare joker is bought -> owner gets a copy (if there is room)
  c_mp_trap_sepia_snake_sigil = {
    on = 'buy',
    trigger = function(_, ctx)
      local c = ctx.card
      local center = c and c.config and c.config.center
      if center and center.set == 'Joker' and center.rarity == 3 then return { key = center.key } end
    end,
    reward = function(p)
      local center = type(p.key) == 'string' and G.P_CENTERS[p.key]
      if center and center.set == 'Joker' then T.give(p.key, { area = G.jokers, check_room = true }) end
    end,
  },
  -- 6. A Pair is played -> every scored card's rank -1 (floor 2)
  c_mp_trap_fire_trap = {
    on = 'before',
    trigger = function(_, ctx)
      if not has_hand(ctx, 'Pair') then return nil end
      for _, c in ipairs(ctx.scoring_hand or {}) do T.rank_down(c) end
      return {}
    end,
  },
  -- 7. A playing card is added -> 2 Stone cards with random fronts join the deck ('mp_trap_guards')
  c_mp_trap_guards_and_wards = {
    on = 'card_added',
    trigger = function()
      if not (g('create_playing_card') and G.P_CENTERS.m_stone and G.deck) then return {} end
      for _ = 1, 2 do
        local front = pseudorandom_element(G.P_CARDS, pseudoseed('mp_trap_guards'))
        local card = create_playing_card({ front = front, center = G.P_CENTERS.m_stone }, G.deck, nil, nil,
          { G.C.SECONDARY_SET and G.C.SECONDARY_SET.Enhanced or G.C.WHITE })
        if card and G.deck.config then G.deck.config.card_limit = (G.deck.config.card_limit or 0) + 1 end
      end
      return {}
    end,
  },
  -- 8. A Blue/Purple seal makes a consumable -> it is taken from the victim and given to the owner
  --    (fired from trap_hooks, which carries the stolen SafeCard in the payload)
  c_mp_trap_magic_mouth = {
    on = 'seal_reward',
    trigger = function(_, ctx) if ctx.card then return { card = ctx.card } end end,
    reward = function(p)
      local sc = p.card
      if type(sc) ~= 'table' or not MP.card.validate(sc) then return end
      local center = G.P_CENTERS[sc.key]
      if not (center and CONSUMABLE_SETS[center.set]) then return end
      if not T.room() then return end
      local card = MP.card.build(sc, G.consumeables)
      if card then
        if card.add_to_deck then card:add_to_deck() end
        G.consumeables:emplace(card)
        if MP.content.stickers then MP.content.stickers.mark_nemesis(card) end
      end
    end,
  },
  -- 9. A blind is skipped -> owner gets a copy of the tag the victim got
  c_mp_trap_snare = {
    on = 'skip',
    trigger = function(_, ctx) return { tag_key = ctx.tag_key } end,
    reward = function(p)
      local key = p.tag_key
      if type(key) == 'string' and G.P_TAGS[key] and g('add_tag') and g('Tag') then add_tag(Tag(key)) end
    end,
  },
  -- 10. Fires from T.plant (the bounce); the owner only sees the notice
  c_mp_trap_arcane_lock = { on = 'never' },
  -- 11. A booster is opened -> one fake card is added (content/trap_hooks.lua builds it)
  c_mp_trap_programmed_illusion = {
    on = 'open',
    trigger = function(_, ctx)
      if ctx.booster and T.add_illusion and T.add_illusion(ctx.booster) then return {} end
    end,
  },
  -- 12. Any consumable used -> owner gets a Negative copy (Traps taken from packs do not count)
  c_mp_trap_web = {
    on = 'use',
    trigger = function(_, ctx)
      if ctx.key and CONSUMABLE_SETS[ctx.set] then return { key = ctx.key } end
    end,
    reward = function(p)
      local center = type(p.key) == 'string' and G.P_CENTERS[p.key]
      if center and CONSUMABLE_SETS[center.set] then T.give(p.key, { area = G.consumeables, edition = 'negative' }) end
    end,
  },
  -- 13. Armed by a player discard; the refill arrives face-down (trap_hooks fires it)
  c_mp_trap_forbiddance = { on = 'forbiddance', trigger = function() return {} end },
  -- 14. A Planet with a hand type is used -> owner levels that hand +3
  c_mp_trap_faithful_hound = {
    on = 'use',
    trigger = function(_, ctx)
      if ctx.set == 'Planet' and ctx.hand_type then return { hand_type = ctx.hand_type } end
    end,
    reward = function(p)
      local h = p.hand_type
      if type(h) == 'string' and G.GAME.hands and G.GAME.hands[h] and g('level_up_hand') then
        level_up_hand(nil, h, true, 3)
      end
    end,
  },
  -- 15. Held Gold cards pay at round end -> owner gets $4 per held, non-debuffed Gold card
  c_mp_trap_phase_door = {
    on = 'gold_payout',
    trigger = function(_, ctx)
      local n = ctx.count or 0
      if n > 0 then return { dollars = 4 * n } end
    end,
    reward = function(p)
      local d = clamp_int(p.dollars, 0, 4 * 64)
      if d and d > 0 then C.ease_dollars(d, true) end
    end,
  },
  -- 16. A Wheel of Fortune left on offer (shop left or rerolled, pack ended) -> owner gets 2 Wheels
  c_mp_trap_mental_prison = {
    on = 'wheel_left',
    trigger = function() return {} end,
    reward = function()
      for _ = 1, 2 do
        if T.room() and G.P_CENTERS[T.WHEEL] then T.give(T.WHEEL, { area = G.consumeables }) end
      end
    end,
  },
}

--- Alarm: free rerolls now (a shop is open, also while a pack from it is open), else banked in
--- G.GAME (saved with the run) and added when the next shop opens (trap_hooks Game.update_shop).
function T.grant_free_rerolls(n)
  if not n or n <= 0 then return end
  if G.shop then
    local cr = G.GAME.current_round
    cr.free_rerolls = (cr.free_rerolls or 0) + n
    if g('calculate_reroll_cost') then calculate_reroll_cost(true) end
  else
    G.GAME.mp_pending_free_rerolls = (G.GAME.mp_pending_free_rerolls or 0) + n
  end
end

-- ── definitions ─────────────────────────────────────────────────────────────

local function trap_can_use(card)
  return G.pack_cards ~= nil and card.area == G.pack_cards and not (card.ability and card.ability.mp_trap_hidden)
end

for i, key in ipairs(T.KEYS) do
  R.define({
    key = key, kind = 'Trap', cost = 4, pos = { x = i - 1, y = 0 }, atlas = 'mp_Trap',
    config = {}, gate = { layers = { 'traps' } },
    loc = { name = T.NAMES[key], text = { 'When your Nemesis ...' } },
    can_use = trap_can_use,
    -- vanilla use_card takes the card out of the pack before calling use: can_use guarded it
    use = function(card)
      if card.ability and card.ability.mp_trap_hidden then return nil end
      return T.plant(card)
    end,
  })
  CN.render_as_other(key)
end

-- Colours for the new consumable set. Its text (k_trap, b_trap_cards, undiscovered_trap,
-- rmh_mp_trap_triggered) ships in data/balatro-mp/extra-strings.en-us.json, so it is translatable.

function T.install_colours()
  if not (G and G.C) then return end
  G.C.SET = G.C.SET or {}
  G.C.SECONDARY_SET = G.C.SECONDARY_SET or {}
  G.C.SET.Trap = T.COLOUR
  G.C.SECONDARY_SET.Trap = T.DARK_PINK
  -- (the set's atlas, G.ASSET_ATLAS.Trap, is aliased by registry/atlas.lua at every install)
end
-- The MP collection shows Trap cards with no session mounted: their badges need the set's colours.
require('rmh_mp.registry.dispatch').add_display_installer(function() T.install_colours() end)

-- Net (one handler per peer kind; nobody else owns these).
MP.peer.on('trap_plant', function(from, d) T.receive_plant(from, d) end)
MP.peer.on('trap_held', function(from, d) T.receive_held(from, d) end)
MP.peer.on('trap_fired', function(from, d) T.receive_fired(from, d) end)

return T
