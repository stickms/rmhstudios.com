-- Shared setup for the WS7 content specs (mp_content_a*_spec.lua). Not a spec itself.
--
--   local CH = require 'spec.mp_content_helper'
--   local MP = CH.boot()                         fake G + a vanilla-shaped Card class + the whole pack
--   CH.match{ resolved = {...}, options = {...}, shape = {...} }   mount a 2-player match (u1 vs u2)
--   CH.card('j_mp_pizza', G.jokers)              a card built like Card:set_ability (added to deck)
--   CH.playing('Hearts', 14, 'Gold Card')        a playing card
--   CH.roll{ seed = value }                      force pseudorandom(seed) results (else 0.99)
--   CH.calc(card, ctx)                           Card.calculate_joker through the dispatch
--   CH.syncs()                                   peer sync messages sent so far
--   CH.pvp(on)                                   put G.GAME.blind on bl_mp_nemesis (or a Small Blind)

local H = require 'spec.mp_helper'

local CH = {}
CH.H = H

CH.calls = {}
local function rec(name, ret)
  return function(...)
    CH.calls[#CH.calls + 1] = { name, ... }
    return ret
  end
end

function CH.called(name)
  local out = {}
  for _, c in ipairs(CH.calls) do if c[1] == name then out[#out + 1] = c end end
  return out
end

local function copy(t)
  if type(t) ~= 'table' then return t end
  local o = {}
  for k, v in pairs(t) do o[k] = copy(v) end
  return o
end

CH.ROLLS = {}
function CH.roll(t) for k, v in pairs(t) do CH.ROLLS[k] = v end end

local function stub_globals(G)
  CH.calls = {}
  CH.ROLLS = {}
  _G.Card = {
    calculate_joker = function(self, ctx) return ctx and ctx.vanilla_probe and 'vanilla' or nil end,
    add_to_deck = function(self) self.added_to_deck = true end,
    remove_from_deck = function(self) self.added_to_deck = false end,
    use_consumeable = function() return 'vanilla_use' end,
    can_use_consumeable = function() return 'vanilla_can_use' end,
    calculate_dollar_bonus = function() return nil end,
    open = function() end,
    set_sprites = function() end,
    draw = function(self) self.drawn = (self.drawn or 0) + 1 end,
    set_ability = function(self, center, initial)
      self.config.center = center
      local cfg = center.config or {}
      self.ability = { name = center.name, set = center.set, effect = center.effect, extra = copy(cfg.extra),
        x_mult = cfg.Xmult or 1, consumeable = center.consumeable and cfg or nil }
    end,
    set_cost = function(self)
      self.sell_cost = 2 + (self.ability.extra_value or 0)
      self.sell_cost_label = self.sell_cost
    end,
    can_sell_card = function(self) return not self.ability.eternal end,
    sell_card = function(self) CH.calls[#CH.calls + 1] = { 'sell', self.sell_cost }; G.GAME.dollars = G.GAME.dollars + self.sell_cost end,
    generate_UIBox_ability_table = function(self)
      return { badges = { card_type = self.ability.set }, info = {}, main = {} }
    end,
    juice_up = function() end,
    is_suit = function(self, s) return self.base.suit == s end,
    get_id = function(self) return self.base.id end,
    apply_to_run = rec('vanilla_apply_to_run'),
    flip = function() end,
    set_base = function(self, front) self.base = { suit = front.suit, id = front.id, value = front.value } end,
    start_dissolve = function(self) if self.area then self.area:remove_card(self) end; self.dissolved = true end,
    remove = function(self) self.removed = true end,
  }
  _G.Game = { update_draw_to_hand = function() end }
  _G.Blind = { set_blind = function() end }
  G.FUNCS.evaluate_round = rec('evaluate_round')
  G.FUNCS.skip_blind = function() G.GAME.skips = (G.GAME.skips or 0) + 1 end
  G.FUNCS.go_to_menu = rec('go_to_menu')
  G.FUNCS.start_run = rec('funcs_start_run')
  G.FUNCS.can_sell_card = rec('vanilla_can_sell')
  G.C.MULT = { 1, 0, 0, 1 }; G.C.CHIPS = { 0, 0, 1, 1 }; G.C.MONEY = { 1, 1, 0, 1 }; G.C.FILTER = { 1, 0.5, 0, 1 }
  G.C.UI.BACKGROUND_INACTIVE = { 0.5, 0.5, 0.5, 1 }
  G.C.SUITS = { Hearts = { 1, 0, 0, 1 }, Spades = { 0, 0, 0, 1 } }
  G.UIT = { T = 1, R = 2, C = 3 }
  G.GAME.skips = 0
  G.GAME.probabilities = { normal = 1 }
  G.GAME.consumeable_buffer = 0
  G.GAME.dollars = 0
  G.handlist = { 'Flush Five', 'Flush House', 'Five of a Kind', 'Straight Flush', 'Four of a Kind', 'Full House',
    'Flush', 'Straight', 'Three of a Kind', 'Two Pair', 'Pair', 'High Card' }
  G.GAME.hands = {}
  for i, name in ipairs(G.handlist) do
    G.GAME.hands[name] = { level = 1, visible = i > 3, chips = 10, mult = 1, order = i }
  end
  G.GAME.current_round.discards_left = 3
  G.GAME.current_round.idol_card = { rank = 'Ace', suit = 'Spades', id = 14 }
  G.P_CARDS = {}
  for _, s in ipairs({ 'H', 'S', 'D', 'C' }) do
    local suit = ({ H = 'Hearts', S = 'Spades', D = 'Diamonds', C = 'Clubs' })[s]
    for id, r in pairs({ [2] = '2', [3] = '3', [4] = '4', [5] = '5', [6] = '6', [7] = '7', [8] = '8', [9] = '9',
      [10] = 'T', [11] = 'J', [12] = 'Q', [13] = 'K', [14] = 'A' }) do
      G.P_CARDS[s .. '_' .. r] = { suit = suit, id = id, value = r }
    end
  end
  for _, area in ipairs({ G.jokers, G.consumeables, G.hand, G.play }) do
    area.change_size = function(self, n) self.config.card_limit = self.config.card_limit + n end
  end
  G.jokers.config.type = 'joker'
  -- Vanilla centers the content and stickers touch.
  local fake = H.fake
  G.P_CENTERS.j_ice_cream = { set = 'Joker', rarity = 1, order = 51, name = 'Ice Cream', config = { extra = { chips = 100, chip_mod = 5 } } }
  G.P_CENTERS.j_selzer = { set = 'Joker', rarity = 2, order = 92, name = 'Seltzer', config = { extra = 10 } }
  G.P_CENTERS.j_ticket = { set = 'Joker', rarity = 1, order = 35, name = 'Golden Ticket', config = { extra = 4 } }
  G.P_CENTERS.j_ancient = { set = 'Joker', rarity = 3, order = 120, name = 'Ancient Joker', config = { extra = 1.5 } }
  G.P_CENTERS.j_abstract = { set = 'Joker', rarity = 1, order = 30, name = 'Abstract Joker', config = { extra = 3 } }
  fake.rebuild_pools()
  G.P_BLINDS.bl_final_bell = { name = 'Cerulean Bell', order = 28, pos = { x = 0, y = 26 }, boss_colour = { 0, 0, 1, 1 }, key = 'bl_final_bell' }
  G.P_BLINDS.bl_small.pos = { x = 0, y = 0 }

  -- Vanilla functions with observable effects.
  _G.ease_dollars = function(n) G.GAME.dollars = G.GAME.dollars + n end
  _G.ease_discard = function(n) local cr = G.GAME.current_round; cr.discards_left = cr.discards_left + n end
  _G.ease_hands_played = function(n) local cr = G.GAME.current_round; cr.hands_left = cr.hands_left + n end
  _G.ease_ante = function(n) G.GAME.round_resets.ante = G.GAME.round_resets.ante + n end
  _G.level_up_hand = function(_, hand, _, amount)
    local h = G.GAME.hands[hand]
    h.level = math.max(0, h.level + (amount or 1))
  end
  _G.create_card = function(_type, area, legendary, rarity, skip, soulable, forced, key_append)
    CH.calls[#CH.calls + 1] = { 'create_card', _type, rarity, key_append }
    local c = setmetatable({ config = {}, base = {} }, { __index = Card })
    c:set_ability(G.P_CENTERS.j_joker or { set = _type, name = _type, config = {} }, true)
    return c
  end
  _G.set_consumeable_usage = rec('set_consumeable_usage')
  _G.get_current_pool = function(_type)
    CH.calls[#CH.calls + 1] = { 'get_current_pool', _type, G.GAME.banned_keys.j_mp_penny_pincher == true }
    return {}, 'pool'
  end
  _G.generate_card_ui = function(_c, full, vars, card_type, badges, hide, main_start, main_end)
    CH.calls[#CH.calls + 1] = { 'generate_card_ui', _c.key, _c.set, vars, main_end }
    return full or { badges = badges or {}, info = {}, main = {} }
  end
  local orig_random = _G.pseudorandom
  _G.pseudorandom = function(seed, min, max)
    if type(seed) == 'string' and CH.ROLLS[seed] ~= nil then
      local v = CH.ROLLS[seed]
      if type(v) == 'function' then return v() end
      return v
    end
    if type(seed) == 'string' and not min then return 0.99 end
    return orig_random(seed, min, max)
  end
end

function CH.boot()
  local MP = H.boot({ before = stub_globals })
  H.transport()
  return MP
end

function CH.match(over)
  over = over or {}
  local MP = _G.MP
  local info = {
    runId = 'run1', seed = 'ABCD1234', stake = 1, deck = 'b_red',
    shape = over.shape or { nemesisPairing = true, manhunt = false, teamBased = false },
    options = H.options(over.options), resolved = H.resolved(over.resolved or { layers = { 'standard' } }),
    roster = over.roster or { { id = 'u1', name = 'Me', blindCol = 1 }, { id = 'u2', name = 'Them', blindCol = 2 } },
    hostId = 'u1', me = 'u1', contentHash = 'x',
  }
  MP.session.launcher = function() return true end
  local sess = MP.session.mount(over.kind or 'match', info)
  MP.state.lives = { u1 = 4, u2 = 4 }
  MP.state.target = 'u2'
  MP.state.enemy.lives = 4
  H.sent_list = {}
  return sess
end

function CH.card(key, area, no_deck)
  local c = setmetatable({ config = {}, base = { suit = 'Spades', id = 14 } }, { __index = Card })
  local center = G.P_CENTERS[key]
  assert(center, 'no center ' .. key)
  c:set_ability(center, true)
  if area then area:emplace(c) end
  if area == G.jokers and not no_deck then c:add_to_deck() end
  return c
end

function CH.playing(suit, id, name)
  local c = setmetatable({ config = {}, base = { suit = suit, id = id }, playing_card = id }, { __index = Card })
  c.ability = { name = name or 'Default Base', set = 'Default' }
  return c
end

function CH.calc(card, ctx) return card:calculate_joker(ctx) end

function CH.syncs(obj)
  local out = {}
  for _, m in ipairs(H.sent('peer')) do
    if m.d.k == 'sync' and (not obj or m.d.d.obj == obj) then out[#out + 1] = m.d end
  end
  return out
end

function CH.pvp(on)
  if on then
    G.GAME.blind = { config = { blind = { key = 'bl_mp_nemesis' } }, mp_pvp = true }
  else
    G.GAME.blind = { config = { blind = G.P_BLINDS.bl_small } }
  end
end

--- Deliver a sync message as if `from` sent it.
function CH.receive(obj, from, data)
  MP.peer.dispatch({ k = 'sync', from = from, d = { obj = obj, kind = 'sync', data = data or {} } })
end

function CH.teardown()
  if rawget(_G, 'MP') and MP.session and MP.state.session then pcall(MP.session.unmount, 'test') end
  H.teardown()
end

return CH
