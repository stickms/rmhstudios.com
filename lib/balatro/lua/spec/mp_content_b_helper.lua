-- Shared setup for the WS8 content specs (mp_content_b*_spec.lua). Not a spec itself.
-- Builds on WS7's spec.mp_content_helper (fake G + vanilla-shaped Card + the whole pack).
--
--   local B = require 'spec.mp_content_b_helper'
--   local MP = B.boot()                       CH.boot() + the vanilla card getters, Blind.modify_hand,
--                                             Tag, reset_castle_card, enhancement centers, LuaJIT random
--   B.fixture(name)                           a real WS4 ResolvedRuleset case (rulesets-resolved.json)
--   B.mount_ruleset(name, seed?, kind?)       mount that bundle as a 2-player match (or practice)
--   B.pc('Hearts', 'King', 'm_gold')          a playing card (base suit/value/id, enhancement center)
--   B.deck({ {suit, value, enh}, ... })       G.playing_cards
--   B.tag(key)                                a Tag instance of an MP tag (dispatched through Tag)

local CH = require 'spec.mp_content_helper'
local H = CH.H
local J = require 'rmh/json'

local B = {}

local FIX
function B.fixture(name)
  if not FIX then
    local root = (RMH_SPEC and RMH_SPEC.root) or ''
    local f = assert(io.open(root .. 'lib/balatro/mp/__fixtures__/rulesets-resolved.json', 'rb'))
    FIX = J.decode(f:read('*a'))
    f:close()
  end
  return FIX[name]
end

B.RANK_ID = { ['2'] = 2, ['3'] = 3, ['4'] = 4, ['5'] = 5, ['6'] = 6, ['7'] = 7, ['8'] = 8, ['9'] = 9,
  ['10'] = 10, Jack = 11, Queen = 12, King = 13, Ace = 14 }

local ENHANCEMENTS = {
  m_bonus = { name = 'Bonus', effect = 'Bonus Card', config = { bonus = 30 }, order = 1 },
  m_mult = { name = 'Mult', effect = 'Mult', config = { mult = 4 }, order = 2 },
  m_wild = { name = 'Wild Card', effect = 'Wild Card', config = {}, order = 3 },
  m_steel = { name = 'Steel Card', effect = 'Steel Card', config = { h_x_mult = 1.5 }, order = 5 },
  m_stone = { name = 'Stone Card', effect = 'Stone Card', config = { bonus = 50 }, order = 7 },
  m_gold = { name = 'Gold Card', effect = 'Gold Card', config = { h_dollars = 3 }, order = 8 },
  m_lucky = { name = 'Lucky Card', effect = 'Lucky Card', config = { mult = 20, p_dollars = 20 }, order = 9 },
}

local saved_random, saved_randomseed

local function install_luajit_random()
  local root = (RMH_SPEC and RMH_SPEC.root) or ''
  package.preload['rmh/u32'] = package.preload['rmh/u32'] or assert(loadfile(root .. 'lib/balatro/lua/u32.lua'))
  local lr = assert(loadfile(root .. 'lib/balatro/lua/luajit_random.lua'))()
  if not saved_random then saved_random, saved_randomseed = math.random, math.randomseed end
  math.random, math.randomseed = lr.random, lr.randomseed
end

function B.restore_random()
  if saved_random then math.random, math.randomseed = saved_random, saved_randomseed end
  saved_random, saved_randomseed = nil, nil
end

local function patch()
  -- The game seeds math.random with fractional pseudoseeds; PUC's would truncate them to 0.
  install_luajit_random()
  for k, v in pairs(ENHANCEMENTS) do
    v.set = 'Enhanced'
    G.P_CENTERS[k] = v
  end
  local glass = G.P_CENTERS.m_glass
  glass.effect = 'Glass Card'
  H.fake.rebuild_pools()

  local base_set_ability = Card.set_ability
  Card.set_ability = function(self, center, initial, delay)
    base_set_ability(self, center, initial, delay)
    local cfg, ab = center.config or {}, self.ability
    ab.effect = center.effect
    ab.mult = cfg.mult or 0
    ab.h_x_mult = cfg.h_x_mult or 0
    ab.h_dollars = cfg.h_dollars or 0
    ab.p_dollars = cfg.p_dollars or 0
    ab.extra_value = ab.extra_value or 0
  end
  Card.is_face = function(self)
    local id = self:get_id()
    return id == 11 or id == 12 or id == 13
  end
  Card.set_edition = function(self, e) self.edition = e end
  Card.set_cost = function(self)
    self.sell_cost = 2 + (self.ability.extra_value or 0)
    self.sell_cost_label = self.sell_cost
  end
  Card.get_chip_mult = function(self)
    if self.debuff or self.ability.set == 'Joker' then return 0 end
    if self.ability.effect == 'Lucky Card' then
      if pseudorandom('lucky_mult') < G.GAME.probabilities.normal / 5 then
        self.lucky_trigger = true
        return self.ability.mult
      end
      return 0
    end
    return self.ability.mult or 0
  end
  Card.get_p_dollars = function(self)
    if self.debuff then return 0 end
    local ret = 0
    if (self.ability.p_dollars or 0) > 0 then
      if self.ability.effect == 'Lucky Card' then
        if pseudorandom('lucky_money') < G.GAME.probabilities.normal / 15 then
          self.lucky_trigger = true
          ret = ret + self.ability.p_dollars
        end
      else
        ret = ret + self.ability.p_dollars
      end
    end
    return ret
  end
  Card.get_chip_h_x_mult = function(self)
    if self.debuff then return 0 end
    return self.ability.h_x_mult or 0
  end
  Card.get_end_of_round_effect = function(self)
    if self.debuff then return {} end
    local ret = {}
    if (self.ability.h_dollars or 0) > 0 then ret.h_dollars = self.ability.h_dollars; ret.card = self end
    return ret
  end
  Blind.modify_hand = function(_, _, _, _, mult, chips) return mult, chips, false end
  _G.Tag = {
    apply_to_run = function() return 'vanilla' end,
    set_ability = function() end,
  }
  _G.reset_castle_card = function() G.GAME.current_round.castle_card = { suit = 'Spades' } end
  G.GAME.current_round.castle_card = { suit = 'Hearts' }
  G.GAME.current_round.mail_card = { rank = 'Jack', id = 11 }
  G.GAME.round_resets.hands = 4
  G.GAME.round_resets.discards = 3
  G.GAME.current_round.hands_left = 4
  G.GAME.current_round.hands_played = 0
  G.GAME.dollar_buffer = 0
  G.playing_cards = {}
  G.C.GREEN = G.C.GREEN or { 0, 1, 0, 1 }
  G.C.SECONDARY_SET = G.C.SECONDARY_SET or {}
  for _, s in ipairs({ 'Hearts', 'Spades', 'Clubs', 'Diamonds' }) do G.C.SUITS[s] = G.C.SUITS[s] or { 1, 1, 1, 1 } end
end

function B.boot()
  local MP = CH.boot()
  patch()
  return MP
end

function B.mount_ruleset(name, seed, kind)
  local case = assert(B.fixture(name), 'no fixture ' .. tostring(name))
  local sess = CH.match({ resolved = case.resolved, options = case.options, kind = kind })
  if seed then sess.seed = seed end
  return sess, case
end

function B.pc(suit, value, enh)
  local c = setmetatable({ config = {}, base = { suit = suit, value = value, id = B.RANK_ID[value] },
    playing_card = true }, { __index = Card })
  c:set_ability(G.P_CENTERS[enh or 'c_base'], true)
  return c
end

function B.deck(list)
  G.playing_cards = {}
  for i, e in ipairs(list) do G.playing_cards[i] = B.pc(e[1], e[2], e[3]) end
  return G.playing_cards
end

function B.tag(key)
  local proto = assert(G.P_TAGS[key], 'no tag ' .. key)
  return setmetatable({ key = key, config = MP.copy(proto.config, true), pos = proto.pos, name = proto.name,
    triggered = false, ability = {} }, { __index = Tag })
end

function B.teardown()
  CH.teardown()
  B.restore_random()
end

return B
