-- rmh_mp/preview/sim.lua — the Score Preview's scoring simulation (M03, B06/B07/G10).
--
-- The mod re-implements scoring joker by joker. This port runs the game's OWN scoring instead —
-- the vanilla G.FUNCS.evaluate_play with every MP layer on it (MP jokers, stickers, decks, traps,
-- sandbox rules) — inside a transaction that leaves the game exactly as it found it:
--
--   1. snapshot: G.GAME (deep, prototypes and objects by reference), the blind and the back, every
--      card in the run (all plain fields, deep), the card areas, G.playing_cards, MP.state, the
--      scoring globals (hand_chips, mult), G's scalar fields and G.I's registries;
--   2. stub: the event queue (nothing is queued), sounds, status text, unlock/profile/career
--      bookkeeping, saves, the transport (nothing is sent), and the RNG generator: math.random /
--      math.randomseed are a PRIVATE LuaJIT generator for the duration, so the game's own
--      generator state is never touched (seeded draws reseed it first anyway, which is why the
--      exact result still equals the real one);
--   3. play the hand the way play_cards_from_highlighted leaves the game before evaluate_play
--      (hands_left - 1, times_played, cards moved to G.play, the boss's press_play), then
--      evaluate_play; read floor(hand_chips * mult) and the money every ease_dollars added;
--   4. restore everything in place (same table identities), the stubs and the generator.
--
-- Three passes: 'exact' (the real seeded rolls, on the snapshot's streams — G.GAME.pseudorandom is
-- put back, so no stream advances), 'min' (every pseudorandom(...) fails: 0.9999999999, ranges at
-- their low end) and 'max' (every roll succeeds: 0, ranges at their high end). The Hook's two
-- random discards are enumerated for min/max (every pair of held cards) and rolled for exact.
--
--   SIM.run()   -> { score = {min, exact, max}, dollars = {min, exact, max}, hand = name }
--                  | nil (nothing selected, a face-down card selected/held as a joker, not in a hand)
--   SIM.play(mode, hook_drop)   one pass (tests)
--   SIM.transaction(fn)         run fn inside the snapshot/stub/restore (tests)

local MP = require 'rmh_mp.state'

local SIM = {}

local FAIL, PASS = 0.9999999999, 0

-- ── Snapshots ───────────────────────────────────────────────────────────────

-- Tables never copied: prototypes and colours (cards point at them; nothing scoring writes them).
local function static_set()
  local s = {}
  local function mark(t, depth)
    if type(t) ~= 'table' or s[t] then return end
    s[t] = true
    if depth > 0 then for _, v in pairs(t) do mark(v, depth - 1) end end
  end
  for _, k in ipairs({ 'P_CENTERS', 'P_CARDS', 'P_BLINDS', 'P_TAGS', 'P_SEALS', 'P_STAKES', 'P_CENTER_POOLS',
    'P_JOKER_RARITY_POOLS', 'C', 'localization', 'ARGS' }) do
    mark(G[k], 2)
  end
  return s
end

-- node = { t = table, d = { k = value | node }, n = { k = true when d[k] is a node } }
local function snap(t, seen, static)
  local node = seen[t]
  if node then return node end
  node = { t = t, d = {}, n = {} }
  seen[t] = node
  for k, v in pairs(t) do
    if type(v) == 'table' and not static[v] and getmetatable(v) == nil then
      node.d[k] = snap(v, seen, static)
      node.n[k] = true
    else
      node.d[k] = v
    end
  end
  return node
end

local function restore(node, done)
  if done[node] then return end
  done[node] = true
  local t, d, n = node.t, node.d, node.n
  for k in pairs(t) do
    if d[k] == nil then t[k] = nil end
  end
  for k, v in pairs(d) do
    if n[k] then
      restore(v, done)
      t[k] = v.t
    else
      t[k] = v
    end
  end
end

local AREAS = { 'hand', 'play', 'jokers', 'consumeables', 'deck', 'discard' }

local function all_cards()
  local list, seen = {}, {}
  local function add(c)
    if type(c) == 'table' and not seen[c] then
      seen[c] = true
      list[#list + 1] = c
    end
  end
  for _, c in ipairs(G.playing_cards or {}) do add(c) end
  for _, a in ipairs(AREAS) do
    local area = G[a]
    for _, c in ipairs((area and area.cards) or {}) do add(c) end
  end
  return list
end

local SCALAR_GLOBALS = { 'hand_chips', 'mult' }

local function take()
  local static, seen = static_set(), {}
  local roots = {}
  local function root(t) if type(t) == 'table' then roots[#roots + 1] = snap(t, seen, static) end end
  root(G.GAME)
  root(G.GAME.blind)
  root(G.GAME.selected_back)
  for _, c in ipairs(all_cards()) do root(c) end
  for _, a in ipairs(AREAS) do root(G[a]) end
  root(G.playing_cards)
  root(MP.state)
  local g = {}
  for k, v in pairs(G) do
    if type(v) ~= 'table' and type(v) ~= 'function' then g[k] = v end
  end
  local reg = {}
  if type(G.I) == 'table' then
    for k, v in pairs(G.I) do
      if type(v) == 'table' then
        local c = {}
        for i, x in pairs(v) do c[i] = x end
        reg[k] = c
      end
    end
  end
  local globals = {}
  for _, k in ipairs(SCALAR_GLOBALS) do globals[k] = rawget(_G, k) end
  return { roots = roots, g = g, reg = reg, globals = globals, playing_cards = G.playing_cards }
end

local function put_back(s)
  local done = {}
  for _, node in ipairs(s.roots) do restore(node, done) end
  for k, v in pairs(G) do
    if type(v) ~= 'table' and type(v) ~= 'function' and s.g[k] == nil then G[k] = nil end
  end
  for k, v in pairs(s.g) do G[k] = v end
  for k, c in pairs(s.reg) do
    local t = G.I[k]
    if type(t) == 'table' then
      for i in pairs(t) do if c[i] == nil then t[i] = nil end end
      for i, x in pairs(c) do t[i] = x end
    end
  end
  G.playing_cards = s.playing_cards
  for _, k in ipairs(SCALAR_GLOBALS) do rawset(_G, k, s.globals[k]) end
end

-- ── Stubs ───────────────────────────────────────────────────────────────────

local function noop() end

-- A second LuaJIT generator: math.random's own state is never stepped by a preview.
local private_rng
local function rng()
  if private_rng ~= nil then return private_rng or nil end
  local name = 'rmh/luajit_random'
  local cached = package.loaded[name]
  package.loaded[name] = nil
  local ok, inst = pcall(require, name)
  package.loaded[name] = cached
  if ok and type(inst) == 'table' and inst.random and inst.randomseed then
    private_rng = inst
  else
    private_rng = false
    MP.log('warn', 'preview: no private generator (%s); previews are off', tostring(inst))
  end
  return private_rng or nil
end
SIM.rng = rng

-- Vanilla's set_hand_usage writes the profile and saves the settings; the run's half only.
local function hand_usage(hand)
  local key = tostring(hand):gsub('%s+', '')
  local u = G.GAME.hand_usage
  if type(u) ~= 'table' then return end
  if u[key] then u[key].count = u[key].count + 1 else u[key] = { count = 1, order = hand } end
end

local UI_STUBS = {
  'play_sound', 'attention_text', 'card_eval_status_text', 'update_hand_text', 'delay', 'juice_card',
  'juice_card_until', 'highlight_card', 'play_area_status_text', 'check_for_unlock', 'inc_career_stat',
  'check_and_set_high_score', 'unlock_card', 'discover_card', 'save_run', 'stop_use', 'draw_card',
}

SIM.dollars = 0

local function sim_ease_dollars(mod, instant)
  mod = tonumber(mod) or 0
  SIM.dollars = SIM.dollars + mod
  -- Vanilla applies a queued change after scoring; an instant one now (put back afterwards).
  if instant then G.GAME.dollars = (G.GAME.dollars or 0) + mod end
end

local function stub(mode)
  local saved = { g = {}, em = nil, net = {}, G = {} }
  for _, k in ipairs(UI_STUBS) do
    saved.g[k] = rawget(_G, k)
    if saved.g[k] ~= nil then rawset(_G, k, noop) end
  end
  saved.g.set_hand_usage = rawget(_G, 'set_hand_usage')
  rawset(_G, 'set_hand_usage', hand_usage)
  saved.g.pseudorandom = rawget(_G, 'pseudorandom')
  if mode ~= 'exact' then
    local v = mode == 'max' and PASS or FAIL
    rawset(_G, 'pseudorandom', function(_, lo, hi)
      if lo and hi then return mode == 'max' and hi or lo end
      return v
    end)
  end
  local em = G.E_MANAGER
  if em then
    saved.em = { has = rawget(em, 'add_event') ~= nil, fn = rawget(em, 'add_event') }
    em.add_event = noop
  end
  for _, k in ipairs({ 'save_settings', 'save_progress' }) do
    saved.G[k] = rawget(G, k)
    G[k] = noop
  end
  local net = MP.net
  if net then
    for _, k in ipairs({ 'send', 'send_raw' }) do
      saved.net[k] = rawget(net, k)
      if saved.net[k] then net[k] = function() return false end end
    end
  end
  saved.random, saved.randomseed = math.random, math.randomseed
  local r = rng()
  math.random, math.randomseed = r.random, r.randomseed
  saved.ease = MP.hooks.swap_original(_G, 'ease_dollars', sim_ease_dollars)
  saved.log = MP.log
  MP.log = noop
  return saved
end

local function unstub(saved)
  MP.log = saved.log
  MP.hooks.swap_original(_G, 'ease_dollars', saved.ease)
  math.random, math.randomseed = saved.random, saved.randomseed
  local net = MP.net
  if net then for k, fn in pairs(saved.net) do net[k] = fn end end
  for k, fn in pairs(saved.G) do G[k] = fn end
  local em = G.E_MANAGER
  if em and saved.em then
    if saved.em.has then em.add_event = saved.em.fn else em.add_event = nil end
  end
  for k, fn in pairs(saved.g) do rawset(_G, k, fn) end
end

--- Run fn(...) inside the transaction; returns pcall's results. The game is restored even when
--- fn raises.
function SIM.transaction(mode, fn, ...)
  if not rng() then return false, 'no private generator' end
  local s = take()
  local saved = stub(mode or 'exact')
  SIM.dollars = 0
  SIM.busy = true
  local res = { pcall(fn, ...) }
  SIM.busy = false
  unstub(saved)
  put_back(s)
  return unpack(res, 1, table.maxn(res))
end

-- ── One pass ────────────────────────────────────────────────────────────────

local function by_x(a, b) return (a.T and a.T.x or 0) < (b.T and b.T.x or 0) end

local function replace(list, with)
  for i = #list, 1, -1 do list[i] = nil end
  for i, v in ipairs(with) do list[i] = v end
end

--- The discards The Hook makes between press_play and evaluate_play (vanilla's
--- discard_cards_from_highlighted with hook = true, its scoring-relevant part).
local function hook_discard(cards)
  if #cards == 0 then return end
  table.sort(cards, by_x)
  local keep = {}
  local drop = {}
  for _, c in ipairs(cards) do drop[c] = true end
  for _, c in ipairs(G.hand.cards) do if not drop[c] then keep[#keep + 1] = c end end
  for _, j in ipairs(G.jokers.cards) do j:calculate_joker({ pre_discard = true, full_hand = cards, hook = true }) end
  local destroyed = {}
  for _, c in ipairs(cards) do
    c:calculate_seal({ discard = true })
    local removed = false
    for _, j in ipairs(G.jokers.cards) do
      local eval = j:calculate_joker({ discard = true, other_card = c, full_hand = cards })
      if eval and eval.remove then removed = true end
    end
    if removed then destroyed[#destroyed + 1] = c else c.ability.discarded = true end
  end
  if destroyed[1] then
    for _, j in ipairs(G.jokers.cards) do
      eval_card(j, { cardarea = G.jokers, remove_playing_cards = true, removed = destroyed })
    end
  end
  local rs = G.GAME.round_scores
  if rs and rs.cards_discarded then rs.cards_discarded.amt = rs.cards_discarded.amt + #cards end
  replace(G.hand.cards, keep)
  for _, c in ipairs(cards) do c.area = G.discard end
end

--- The Hook's own roll: two held cards, as Blind:press_play's event picks them.
local function hook_roll()
  local pool = {}
  for _, c in ipairs(G.hand.cards) do pool[#pool + 1] = c end
  local out = {}
  for _ = 1, 2 do
    if #pool == 0 then break end
    local c, k = pseudorandom_element(pool, pseudoseed('hook'))
    out[#out + 1] = c
    table.remove(pool, k)
  end
  return out
end

local function hook_live()
  local b = G.GAME.blind
  return b and not b.disabled and b.name == 'The Hook'
end

--- One pass, inside a transaction. `hook_drop`: the held cards The Hook discards (nil: roll them).
local function play_pass(mode, hook_drop)
  local played = {}
  for _, c in ipairs(G.hand.highlighted) do played[#played + 1] = c end
  table.sort(played, by_x)
  local is_played = {}
  for _, c in ipairs(played) do is_played[c] = true end
  local held = {}
  for _, c in ipairs(G.hand.cards) do if not is_played[c] then held[#held + 1] = c end end

  -- play_cards_from_highlighted, up to evaluate_play.
  G.GAME.blind.triggered = false
  for _, c in ipairs(G.playing_cards or {}) do c.ability.forced_selection = nil end
  local cr = G.GAME.current_round
  cr.hands_left = cr.hands_left - 1
  local rs = G.GAME.round_scores
  for _, c in ipairs(played) do
    c.base.times_played = (c.base.times_played or 0) + 1
    c.ability.played_this_ante = true
    if rs and rs.cards_played then rs.cards_played.amt = rs.cards_played.amt + 1 end
  end
  replace(G.hand.cards, held)
  replace(G.hand.highlighted, {})
  replace(G.play.cards, played)
  for _, c in ipairs(played) do
    c.area = G.play
    c.highlighted = false
  end
  G.STATE = G.STATES.HAND_PLAYED
  G.GAME.blind:press_play()
  local b = G.GAME.blind
  if not b.disabled and b.name == 'The Tooth' then
    for _ = 1, #played do ease_dollars(-1, true) end
  end
  if hook_live() then hook_discard(hook_drop or hook_roll()) end

  G.FUNCS.evaluate_play()
  SIM.last_hand = G.GAME.last_hand_played
  local chips, m = rawget(_G, 'hand_chips') or 0, rawget(_G, 'mult') or 0
  return math.floor(chips * m), SIM.dollars
end

function SIM.play(mode, hook_drop)
  local ok, score, dollars = SIM.transaction(mode, play_pass, mode, hook_drop)
  if not ok then
    MP.log('warn', 'preview: %s pass failed: %s', tostring(mode), tostring(score))
    return nil
  end
  return score, dollars
end

-- ── The preview ─────────────────────────────────────────────────────────────

--- Is there a hand to preview? (mod: SELECTING_HAND / DRAW_TO_HAND / PLAY_TAROT, a selection, and
--- no face-down card among the selection or — with a selection — the jokers.)
function SIM.can_run()
  if not (G and G.GAME and G.GAME.blind and G.hand and G.play and G.jokers and G.FUNCS.evaluate_play) then
    return false
  end
  local st = G.STATES
  if not (G.STATE == st.SELECTING_HAND or G.STATE == st.DRAW_TO_HAND or G.STATE == st.PLAY_TAROT) then return false end
  if #G.hand.highlighted < 1 or (G.play.cards and G.play.cards[1]) then return false end
  for _, c in ipairs(G.hand.highlighted) do if c.facing == 'back' then return false end end
  for _, c in ipairs(G.jokers.cards) do if c.facing == 'back' then return false end end
  return true
end

local function lo_hi(acc, s, d)
  if not s then return end
  acc.smin = math.min(acc.smin or s, s)
  acc.smax = math.max(acc.smax or s, s)
  acc.dmin = math.min(acc.dmin or d, d)
  acc.dmax = math.max(acc.dmax or d, d)
end

--- Every pair (or the single card) of held cards The Hook could discard.
local function hook_sets()
  local sel = {}
  for _, c in ipairs(G.hand.highlighted) do sel[c] = true end
  local held = {}
  for _, c in ipairs(G.hand.cards) do if not sel[c] then held[#held + 1] = c end end
  local sets = {}
  if #held <= 2 then return { held } end
  for a = 1, #held - 1 do
    for b = a + 1, #held do sets[#sets + 1] = { held[a], held[b] } end
  end
  return sets
end

function SIM.run()
  if not SIM.can_run() then return nil end
  local exact, dollars = SIM.play('exact')
  if not exact then return nil end
  local name = SIM.last_hand
  local acc = {}
  lo_hi(acc, exact, dollars)
  local sets = hook_live() and hook_sets() or { false }
  for _, set in ipairs(sets) do
    lo_hi(acc, SIM.play('min', set or nil))
    lo_hi(acc, SIM.play('max', set or nil))
  end
  return {
    score = { min = acc.smin, exact = exact, max = acc.smax },
    dollars = { min = acc.dmin, exact = dollars, max = acc.dmax },
    hand = name,
  }
end

return SIM
