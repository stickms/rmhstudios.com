-- rmh_mp/content/jokers/core.lua — the core PvP jokers (J-01…J-09, A2 §2.1) and the shared
-- content helpers every WS7 module uses (MP.content).
--
-- Keys, numbers and text slots follow the mod (A2 §2.1, en-us loc). Every behaviour is written
-- against the WS6 core: MP.state (enemy mirror, lives, pairing), MP.pvp.on_pvp_blind(), the sync
-- bus (MP.sync.register/send, D-19: receivers accept only their ante nemesis) and the custom
-- contexts the core fires (mp_speedrun, mp_first_pvp_draw, opponent_*; this module adds
-- mp_end_of_pvp, see the session installer at the bottom).
--
--   j_mp_defensive_joker  +125 chips per life below the nemesis (75 at vanilla stake >= 6, D-29)
--   j_mp_skip_off         +1 hand / +1 discard per extra skip vs the nemesis, on setting_blind
--   j_mp_lets_go_gambling 1 in 4: X4 and $10; in a PvP blind 1 in 4 misfire -> nemesis gets $10
--   j_mp_speedrun         mp_speedrun (referee, D-18): a random Spectral if there is room
--   j_mp_conjoined_joker  in a PvP blind: X(1 + 0.5 x nemesis hands left), max X3
--   j_mp_penny_pincher    end of round: $1 per $3 the nemesis spent in the matching shop an ante
--                         ago (spent_in_shop[pincher_index]); pooled only after the first PvP draw
--   j_mp_taxes            on the Nemesis blind: +4 Mult per card the nemesis sold this ante
--                         (every ante up to the first PvP ante)
--   j_mp_pizza            end of the next PvP blind: +2 discards for the ante, eaten, the
--                         nemesis gets +1 discard for the ante
--   j_mp_pacifist         X10 Mult outside a PvP blind (replaces the WS6 reference definition)
--
-- MP.content (helpers, also used by standard/experimental/takeovers/consumables/...):
--   C.normal()                 G.GAME.probabilities.normal (1 outside a run)
--   C.chance(seed, odds)       pseudorandom(seed) < normal / odds
--   C.ease_dollars(n) / C.ease_discard(n) / C.ease_hands(n)   vanilla calls when present
--   C.status(card, msg, colour) card_eval_status_text (no-op without it)
--   C.consume(card, msg_key)   vanilla "eaten/drank" removal (once), returns the message effect
--   C.target()                 the ante nemesis id (nil on a bye or without a pairing)
--   C.from_target(from)        a peer message comes from the ante nemesis (D-19)
--   C.my_lives(), C.enemy()    lives / enemy mirror
--   C.in_pvp()                 the current blind is a PvP blind
--   C.on_nemesis_blind()       the current blind is bl_mp_nemesis itself (not a flagged boss)
--   C.add_installer(fn)        register a session-group wrap installer (run at every mount)
--   C.round_key()              The Order round key (ante..blind..slot), else the ante

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local session = require 'rmh_mp.rules.session'

local C = MP.content or {}
MP.content = C

C.NEMESIS = 'bl_mp_nemesis'

-- ── helpers ─────────────────────────────────────────────────────────────────

local function g(name) return rawget(_G, name) end

function C.normal()
  local p = G and G.GAME and G.GAME.probabilities
  return (p and p.normal) or 1
end

function C.chance(seed, odds)
  return pseudorandom(seed) < C.normal() / odds
end

function C.ease_dollars(n, instant)
  if n == 0 then return end
  if g('ease_dollars') then return ease_dollars(n, instant) end
  G.GAME.dollars = (G.GAME.dollars or 0) + n
end

function C.ease_discard(n)
  if n == 0 then return end
  if g('ease_discard') then return ease_discard(n) end
  local cr = G.GAME.current_round
  cr.discards_left = (cr.discards_left or 0) + n
end

function C.ease_hands(n)
  if n == 0 then return end
  if g('ease_hands_played') then return ease_hands_played(n) end
  local cr = G.GAME.current_round
  cr.hands_left = (cr.hands_left or 0) + n
end

function C.loc(key, fallback)
  if g('localize') then
    local s = localize(key)
    if s and s ~= 'ERROR' and s ~= key then return s end
  end
  return fallback or key
end

function C.loc_var(key, vars, fallback)
  if g('localize') then
    local ok, s = pcall(localize, { type = 'variable', key = key, vars = vars })
    if ok and type(s) == 'string' and s ~= 'ERROR' and s ~= key then return s end
  end
  return fallback or key
end

function C.status(card, msg, colour)
  if g('card_eval_status_text') and card then
    pcall(card_eval_status_text, card, 'extra', nil, nil, nil, { message = msg, colour = colour })
  end
end

function C.sound(name, pitch, vol)
  if g('play_sound') then pcall(play_sound, name, pitch, vol) end
end

--- Vanilla's food-joker exit (Turtle Bean / Seltzer / Ice Cream): spin, pinch, remove. Runs once.
function C.consume(card, msg_key, colour, fallback)
  local ab = card.ability
  if ab.mp_consumed then return nil end
  ab.mp_consumed = true
  G.E_MANAGER:add_event(Event({ func = function()
    C.sound('tarot1')
    if card.T then card.T.r = -0.2 end
    if card.juice_up then card:juice_up(0.3, 0.4) end
    if card.states and card.states.drag then card.states.drag.is = true end
    if card.children and card.children.center and card.children.center.pinch then card.children.center.pinch.x = true end
    G.E_MANAGER:add_event(Event({ trigger = 'after', delay = 0.3, blockable = false, func = function()
      if card.area then card.area:remove_card(card) end
      if card.remove then card:remove() end
      card.removed = true
      return true
    end }))
    return true
  end }))
  return { message = C.loc(msg_key, fallback), colour = colour or (G.C and G.C.FILTER) }
end

function C.target()
  if MP.state.pvp and MP.state.pvp.bye then return nil end
  local t = MP.state.target
  if t == '' then return nil end
  return t
end

function C.from_target(from)
  local t = C.target()
  return t ~= nil and from == t
end

function C.my_lives()
  local s = MP.state.session
  return s and s.me and MP.state.lives[s.me] or nil
end

function C.enemy() return MP.state.enemy end

function C.in_pvp()
  return MP.pvp ~= nil and MP.pvp.on_pvp_blind() == true
end

function C.on_nemesis_blind()
  local b = G.GAME and G.GAME.blind
  return b ~= nil and b.config ~= nil and b.config.blind ~= nil and b.config.blind.key == C.NEMESIS
end

function C.round_key()
  if MP.order and MP.order.active() then return MP.order.round_key() end
  return tostring(G.GAME.round_resets.ante)
end

--- Joker main-context check (vanilla: joker_main with no individual/repetition).
function C.main(ctx) return ctx.joker_main and not ctx.individual and not ctx.repetition end

--- End-of-round, once per joker (not the per-held-card pass).
function C.round_end(ctx) return ctx.end_of_round and not ctx.individual and not ctx.repetition end

--- HUD-23: a value revealed only on purchase (Misprint) must not be peeked at in the MP
--- collection or the shop. True when the card is not one the player owns.
function C.anti_peek(card)
  local area = card and card.area
  if not area then return true end
  return area ~= G.jokers and area ~= G.consumeables
end
C.ANTI_PEEK_TEXT = '?'

function C.room_for_consumable()
  local area = G.consumeables
  if not area then return false end
  return #area.cards + (G.GAME.consumeable_buffer or 0) < area.config.card_limit
end

C.installers = C.installers or {}
function C.add_installer(fn)
  for _, f in ipairs(C.installers) do if f == fn then return end end
  C.installers[#C.installers + 1] = fn
  session.add_installer(fn)
end

local function x_msg(x) return C.loc_var('a_xmult', { x }, 'X' .. tostring(x)) end
local function mult_msg(m) return C.loc_var('a_mult', { m }, '+' .. tostring(m)) end
local function chips_msg(c) return C.loc_var('a_chips', { c }, '+' .. tostring(c)) end
C.x_msg, C.mult_msg, C.chips_msg = x_msg, mult_msg, chips_msg

--- Add a dollar effect the vanilla way (dollar_buffer so Bull/Bootstraps see it this hand).
function C.pay(n)
  G.GAME.dollar_buffer = (G.GAME.dollar_buffer or 0) + n
  C.ease_dollars(n)
  G.E_MANAGER:add_event(Event({ func = function() G.GAME.dollar_buffer = 0; return true end }))
end

-- ── J-01 Defensive Joker ────────────────────────────────────────────────────

C.DEFENSIVE_HIGH_STAKE = 6 -- D-29: vanilla stake index (MP stakes are modifiers on top)

function C.defensive_chips(card)
  local ex = card.ability.extra
  if not (MP.in_session() and MP.is_match()) then return 0 end
  local mine, theirs = C.my_lives(), C.enemy().lives
  if not (mine and theirs) then return 0 end
  local per = ((G.GAME.stake or 1) >= C.DEFENSIVE_HIGH_STAKE) and ex.highstake or ex.extra
  return math.max(0, (theirs - mine) * per)
end

R.define({
  key = 'j_mp_defensive_joker', kind = 'Joker', rarity = 1, cost = 4, pos = { x = 0, y = 0 },
  atlas = 'mp_j_defensive_joker', blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  config = { extra = { extra = 125, highstake = 75 } },
  loc = { name = 'Defensive Joker', text = { '+#1# Chips per life less than your Nemesis', '(Currently +#2# Chips)' } },
  loc_vars = function(card)
    local ex = card.ability.extra
    local per = ((G.GAME and G.GAME.stake or 1) >= C.DEFENSIVE_HIGH_STAKE) and ex.highstake or ex.extra
    return { per, C.defensive_chips(card) }
  end,
  calc = function(card, ctx)
    if C.main(ctx) then
      local chips = C.defensive_chips(card)
      card.ability.t_chips = chips
      if chips > 0 then return { message = chips_msg(chips), chip_mod = chips, colour = G.C.CHIPS } end
    end
  end,
})

-- ── J-02 Skip-Off ───────────────────────────────────────────────────────────

function C.skip_diff()
  return (G.GAME.skips or 0) - (C.enemy().skips or 0)
end

R.define({
  key = 'j_mp_skip_off', kind = 'Joker', rarity = 2, cost = 5, pos = { x = 0, y = 0 }, atlas = 'mp_j_skip_off',
  blueprint_compat = false, eternal_compat = true, perishable_compat = true,
  config = { extra = { extra_hands = 1, extra_discards = 1 } },
  loc = { name = 'Skip-Off', text = { '+#1# Hands and +#2# Discards per extra Blind skipped vs your Nemesis' } },
  loc_vars = function(card)
    local ex = card.ability.extra
    local d = (G.GAME and G.GAME.skips) and C.skip_diff() or 0
    local n = math.max(d, 0)
    local rel
    if d > 0 then rel = C.loc_var('a_mp_skips_ahead', { d }, d .. ' Skips Ahead')
    elseif d < 0 then rel = C.loc_var('a_mp_skips_behind', { -d }, (-d) .. ' Skips Behind')
    else rel = C.loc_var('a_mp_skips_tied', {}, 'Tied') end
    return { ex.extra_hands, ex.extra_discards, n * ex.extra_hands, n * ex.extra_discards, rel }
  end,
  calc = function(card, ctx)
    if ctx.setting_blind and not ctx.blueprint then
      local ex = card.ability.extra
      local n = math.max(C.skip_diff(), 0)
      if n > 0 then
        local h, d = n * ex.extra_hands, n * ex.extra_discards
        G.E_MANAGER:add_event(Event({ func = function()
          C.ease_hands(h)
          C.ease_discard(d)
          return true
        end }))
      end
    end
  end,
})

-- ── J-03 Let's Go Gambling ──────────────────────────────────────────────────

C.LGG = 'j_mp_lets_go_gambling'
C.LGG_RECEIVE_DEFAULT = 5   -- what the receiver pays when the message carries no amount
C.LGG_RECEIVE_MAX = 100     -- clamp an untrusted amount

R.define({
  key = C.LGG, kind = 'Joker', rarity = 2, cost = 6, pos = { x = 0, y = 0 }, atlas = 'mp_j_lets_go_gambling',
  blueprint_compat = true, eternal_compat = true, perishable_compat = true, phantom = true,
  config = { extra = { odds = 4, xmult = 4, dollars = 10, nemesis_odds = 4, nemesis_dollars = 10 } },
  loc = { name = "Let's Go Gambling", text = { '#1# in #2# for X#3# Mult and $#4#', '#5# in #6# to give your Nemesis $#7# in PvP' } },
  loc_vars = function(card)
    local ex = card.ability.extra
    local n = C.normal()
    return { n, ex.odds, ex.xmult, ex.dollars, n, ex.nemesis_odds, ex.nemesis_dollars }
  end,
  calc = function(card, ctx)
    if not C.main(ctx) then return end
    local ex = card.ability.extra
    local eff
    if C.chance(C.LGG, ex.odds) then
      C.pay(ex.dollars)
      eff = { message = x_msg(ex.xmult), Xmult_mod = ex.xmult, colour = G.C.MULT }
    end
    if C.in_pvp() and C.chance(C.LGG .. '_misfire', ex.nemesis_odds) then
      local t = C.target()
      if t then MP.sync.send(C.LGG, { dollars = ex.nemesis_dollars }, t) end
      local oops = C.loc('k_oops_ex', 'Oops!')
      if eff then
        G.E_MANAGER:add_event(Event({ func = function() C.status(card, oops, G.C.MONEY); return true end }))
      else
        eff = { message = oops, colour = G.C.MONEY }
      end
    end
    return eff
  end,
})

--- Find a display copy (phantom) of `key` in the nemesis row, if WS11 keeps one.
function C.phantom_of(key)
  for _, c in ipairs(MP.state.phantoms or {}) do
    local center = type(c) == 'table' and c.config and c.config.center
    if center and center.key == key then return c end
  end
  return nil
end

MP.sync.register(C.LGG, {
  receive = function(from, data)
    if not C.from_target(from) then return end
    local n = tonumber(data and data.dollars) or C.LGG_RECEIVE_DEFAULT
    n = math.max(0, math.min(C.LGG_RECEIVE_MAX, math.floor(n)))
    local ph = C.phantom_of(C.LGG)
    if ph and ph.juice_up then pcall(ph.juice_up, ph, 0.5, 0.5) end
    C.ease_dollars(n)
  end,
})

-- ── J-04 SPEEDRUN ───────────────────────────────────────────────────────────

R.define({
  key = 'j_mp_speedrun', kind = 'Joker', rarity = 2, cost = 6, pos = { x = 0, y = 0 }, atlas = 'mp_j_speedrun',
  blueprint_compat = true, eternal_compat = true, perishable_compat = true, phantom = true,
  config = { extra = {} },
  loc = { name = 'SPEEDRUN', text = { 'Reach a PvP Blind within 30s of your Nemesis:', 'create a random Spectral card' } },
  calc = function(card, ctx)
    if not ctx.mp_speedrun then return end
    if not C.room_for_consumable() then return end
    G.GAME.consumeable_buffer = (G.GAME.consumeable_buffer or 0) + 1
    G.E_MANAGER:add_event(Event({ func = function()
      if g('create_card') then
        local c = create_card('Spectral', G.consumeables, nil, nil, nil, nil, nil, 'mp_speedrun')
        c:add_to_deck()
        G.consumeables:emplace(c)
      end
      G.GAME.consumeable_buffer = 0
      return true
    end }))
    return { message = C.loc('k_plus_spectral', '+1 Spectral'), colour = G.C.SECONDARY_SET and G.C.SECONDARY_SET.Spectral }
  end,
})

-- ── J-05 Conjoined Joker ────────────────────────────────────────────────────

function C.conjoined_x(card)
  local ex = card.ability.extra
  if not MP.in_session() then return 1 end
  local hands = tonumber(C.enemy().hands) or 0
  return math.max(1, math.min(ex.max_x_mult, 1 + hands * ex.x_mult_gain))
end

R.define({
  key = 'j_mp_conjoined_joker', kind = 'Joker', rarity = 2, cost = 6, pos = { x = 0, y = 0 },
  atlas = 'mp_j_conjoined_joker', blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  phantom = true,
  config = { extra = { x_mult_gain = 0.5, max_x_mult = 3 } },
  -- A2 §2.1: the isolation gate AND not the sandbox layer (the sandbox bundle also bans it).
  gate = { include = function(sess, resolved)
    local opts = sess and sess.options
    if not (resolved and resolved.multiplayerContent == true and opts and opts.multiplayerJokers == true) then return false end
    for _, l in ipairs(resolved.layers or {}) do if l == 'sandbox' then return false end end
    return true
  end },
  loc = { name = 'Conjoined Joker', text = { 'In a PvP Blind: X#1# Mult per Nemesis hand left', '(Max X#2#, Currently X#3#)' } },
  loc_vars = function(card)
    local ex = card.ability.extra
    return { ex.x_mult_gain, ex.max_x_mult, C.conjoined_x(card) }
  end,
  calc = function(card, ctx)
    if C.main(ctx) and C.in_pvp() then
      local x = C.conjoined_x(card)
      if x > 1 then return { message = x_msg(x), Xmult_mod = x, colour = G.C.MULT } end
    end
  end,
})

-- ── J-06 Penny Pincher ──────────────────────────────────────────────────────

C.PINCHER = 'j_mp_penny_pincher'

function C.pincher_amount(card)
  local spent = MP.state.enemy.spent_in_shop[MP.state.pincher_index]
  if not spent then return 0 end
  return math.floor((tonumber(spent) or 0) / card.ability.extra.nemesis_dollars) * card.ability.extra.dollars
end

R.define({
  key = C.PINCHER, kind = 'Joker', rarity = 1, cost = 4, pos = { x = 0, y = 0 }, atlas = 'mp_j_penny_pincher',
  blueprint_compat = false, eternal_compat = true, perishable_compat = true,
  config = { extra = { dollars = 1, nemesis_dollars = 3 } },
  loc = { name = 'Penny Pincher', text = { 'End of round: $#1# per $#2# your Nemesis', 'spent in the matching shop last ante' } },
  loc_vars = function(card)
    local ex = card.ability.extra
    return { ex.dollars, ex.nemesis_dollars }
  end,
  dollar_bonus = function(card)
    local n = C.pincher_amount(card)
    if n > 0 then return n end
  end,
})

-- ── J-07 Taxes ──────────────────────────────────────────────────────────────

function C.taxes_sells()
  local e = C.enemy()
  local ante = G.GAME.round_resets.ante
  local per = e.sells_per_ante or {}
  local first_pvp = MP.attrition and MP.attrition.pvp_start_round() or 2
  if ante <= first_pvp then
    local n = 0
    for a, v in pairs(per) do if type(a) == 'number' and a <= ante then n = n + v end end
    return n
  end
  return per[ante] or 0
end

R.define({
  key = 'j_mp_taxes', kind = 'Joker', rarity = 1, cost = 5, pos = { x = 0, y = 0 }, atlas = 'mp_j_taxes',
  blueprint_compat = true, eternal_compat = true, perishable_compat = false,
  config = { extra = { mult_gain = 4, mult = 0 } },
  loc = { name = 'Taxes', text = { '+#1# Mult per card your Nemesis sold since the last PvP Blind', '(Currently +#2# Mult)' } },
  loc_vars = function(card)
    local ex = card.ability.extra
    return { ex.mult_gain, ex.mult }
  end,
  calc = function(card, ctx)
    local ex = card.ability.extra
    if ctx.setting_blind and not ctx.blueprint and C.on_nemesis_blind() then
      local n = C.taxes_sells()
      if n > 0 then
        ex.mult = ex.mult + n * ex.mult_gain
        return { message = C.loc('k_filed_ex', 'Filed!'), colour = G.C.MULT }
      end
    elseif C.main(ctx) and ex.mult > 0 then
      return { message = mult_msg(ex.mult), mult_mod = ex.mult, colour = G.C.MULT }
    end
  end,
})

-- ── J-08 Pizza ──────────────────────────────────────────────────────────────

C.PIZZA = 'j_mp_pizza'
C.PIZZA_RECEIVE_MAX = 10

--- Grant `n` discards for the rest of the ante (removed at the next ante change).
function C.grant_ante_discards(n)
  if n <= 0 then return end
  G.GAME.round_resets.discards = (G.GAME.round_resets.discards or 0) + n
  C.ease_discard(n)
  MP.state.pizza_discards = (MP.state.pizza_discards or 0) + n
end

R.define({
  key = C.PIZZA, kind = 'Joker', rarity = 1, cost = 4, pos = { x = 0, y = 0 }, atlas = 'mp_j_pizza',
  blueprint_compat = false, eternal_compat = false, perishable_compat = true, phantom = true,
  config = { extra = { discards = 2, discards_nemesis = 1 } },
  loc = { name = 'Pizza', text = { 'At the end of the next PvP Blind, eat this:', '+#1# discards to you, +#2# to your Nemesis for the ante' } },
  loc_vars = function(card)
    local ex = card.ability.extra
    return { ex.discards, ex.discards_nemesis }
  end,
  calc = function(card, ctx)
    if not ctx.mp_end_of_pvp or ctx.blueprint or card.ability.mp_consumed then return end
    local ex = card.ability.extra
    C.grant_ante_discards(ex.discards)
    local t = C.target()
    if t then MP.sync.send(C.PIZZA, { discards = ex.discards_nemesis }, t) end
    return C.consume(card, 'k_eaten_ex', nil, 'Eaten!')
  end,
})

MP.sync.register(C.PIZZA, {
  receive = function(from, data)
    if not C.from_target(from) then return end
    local n = math.floor(tonumber(data and data.discards) or 0)
    n = math.max(0, math.min(C.PIZZA_RECEIVE_MAX, n))
    if n == 0 then return end
    C.grant_ante_discards(n)
    if MP.replay_hook then pcall(MP.replay_hook, 'pizza', n) end
    local ph = C.phantom_of(C.PIZZA)
    if ph and ph.juice_up then pcall(ph.juice_up, ph, 0.5, 0.5) end
  end,
})

-- ── J-09 Pacifist (takes over the WS6 reference definition) ─────────────────

R.define({
  key = 'j_mp_pacifist', kind = 'Joker', rarity = 1, cost = 4, pos = { x = 0, y = 0 }, atlas = 'mp_j_pacifist',
  blueprint_compat = true, eternal_compat = true, perishable_compat = true,
  config = { extra = { x_mult = 10 } },
  loc = { name = 'Pacifist', text = { 'X#1# Mult while not in a PvP Blind' } },
  loc_vars = function(card) return { card.ability.extra.x_mult } end,
  calc = function(card, ctx)
    if C.main(ctx) and not C.in_pvp() then
      local x = card.ability.extra.x_mult
      return { message = x_msg(x), Xmult_mod = x, colour = G.C.MULT }
    end
  end,
})

-- ── Session wraps for the core jokers (FL-18/19 content side) ───────────────
--   G.FUNCS.evaluate_round  pincher_index +1 per round end (before the dollar bonus is paid);
--                           mp_end_of_pvp after a PvP blind (the marker armed at its first draw)
--   G.FUNCS.skip_blind      pincher_index +1 per skipped blind (the opponent appends 0 for it)
--   Game.update_draw_to_hand  arms the end-of-PvP marker at the first PvP draw
--   ease_ante               the Pizza discards end with the ante
--   get_current_pool        Penny Pincher is not pooled before the first PvP draw

--- True once per PvP round, at the first frame after the core marked the first PvP draw
--- (pvp.first_draw_done; the wrap order with the core's own hook does not matter).
function C.first_pvp_draw_once(tag)
  local pvp = MP.state.pvp
  if not pvp.first_draw_done then return false end
  local token = MP.state.round and MP.state.round.token or 0
  local field = 'mp_once_' .. tag
  if pvp[field] == token then return false end
  pvp[field] = token
  return true
end

function C.fire_end_of_pvp()
  MP.state.after_pvp = nil
  return MP.ctx.calculate({ mp_end_of_pvp = true })
end

function C.end_pizza_discards()
  local n = MP.state.pizza_discards or 0
  if n <= 0 then return end
  G.GAME.round_resets.discards = (G.GAME.round_resets.discards or 0) - n
  C.ease_discard(-n)
  MP.state.pizza_discards = 0
end

function C.install_core()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'content.core.' .. id } end
  local playing = function() return MP.is_match() or MP.is_practice() end

  if G and G.FUNCS then
    wrap(G.FUNCS, 'evaluate_round', function(orig, ...)
      if playing() then
        MP.state.pincher_index = (MP.state.pincher_index or -3) + 1
        if MP.state.after_pvp then C.fire_end_of_pvp() end
      end
      return orig(...)
    end, o('evaluate_round'))

    wrap(G.FUNCS, 'skip_blind', function(orig, ...)
      local r = orig(...)
      if playing() then MP.state.pincher_index = (MP.state.pincher_index or -3) + 1 end
      return r
    end, o('skip_blind'))
  end

  if g('Game') then
    wrap(Game, 'update_draw_to_hand', function(orig, self, dt, ...)
      local r = orig(self, dt, ...)
      if C.first_pvp_draw_once('after_pvp') then MP.state.after_pvp = true end
      return r
    end, o('first_draw'))
  end

  wrap(_G, 'ease_ante', function(orig, mod, ...)
    if (mod or 0) > 0 and playing() then C.end_pizza_discards() end
    return orig(mod, ...)
  end, o('ease_ante'))

  wrap(_G, 'get_current_pool', function(orig, _type, ...)
    local bk = G.GAME and G.GAME.banned_keys
    if _type == 'Joker' and bk and not MP.state.pincher_unlock and not bk[C.PINCHER] then
      bk[C.PINCHER] = true
      local res = { pcall(orig, _type, ...) }
      bk[C.PINCHER] = nil
      if not res[1] then error(res[2], 0) end
      return unpack(res, 2, table.maxn(res))
    end
    return orig(_type, ...)
  end, o('pincher_pool'))
end

C.add_installer(C.install_core)

return C
