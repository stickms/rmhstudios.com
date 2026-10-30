-- WS9 content C (L1): traps (plant -> hidden on the target -> fire -> pay), boosters, decks,
-- Cocktail, challenges, gating and isolation. Built on the WS7 content helper (fake G, a
-- vanilla-shaped Card, the whole pack), plus stand-ins for the vanilla functions the WS9 hooks wrap.
-- The stand-ins only do what the hook under test needs to observe; the real call sites are
-- exercised in-engine by lib/balatro/lua/mp_test/specs/content_c_spec.lua.
local CH = require 'spec.mp_content_helper'
local H = CH.H
local fake = H.fake

local MP, T

local function errors()
  local out = {}
  for _, l in ipairs(MP.log_ring) do if l.level == 'error' then out[#out + 1] = l.msg end end
  return out
end

local function noop() end

-- ── vanilla stand-ins (installed after boot, before the session mounts) ─────

local HAND = { text = 'High Card', poker_hands = {}, scoring = {} }

local function new_card(front, center, params)
  local c = setmetatable({ config = {}, base = {}, T = { x = 0, y = 0, w = 1, h = 1 }, children = {},
    params = params or {}, facing = 'front', sprite_facing = 'front', states = { visible = true } }, { __index = Card })
  if front then c.base = { suit = front.suit, id = front.id, value = front.value } end
  c:set_ability(center, true)
  return c
end

local function stubs()
  setmetatable(Card, { __call = function(_, _x, _y, _w, _h, front, center, params) return new_card(front, center, params) end })
  Card.open = function(self)
    CH.calls[#CH.calls + 1] = { 'vanilla_open', self.ability.name }
    G.GAME.pack_choices = self.config.center.config.choose or 1
  end
  Card.get_end_of_round_effect = function(self)
    if self.seal == 'Blue' and #G.consumeables.cards + G.GAME.consumeable_buffer < G.consumeables.config.card_limit then
      G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1
      G.E_MANAGER:add_event(Event({ trigger = 'before', func = function()
        local p = new_card(nil, G.P_CENTERS.c_mercury)
        G.consumeables:emplace(p)
        G.GAME.consumeable_buffer = 0
        return true
      end }))
    end
    return {}
  end
  Card.calculate_seal = function(self, ctx)
    if self.debuff then return nil end
    if ctx.repetition and self.seal == 'Red' then return { repetitions = 1, card = self } end
  end
  Card.set_seal = function(self, s) self.seal = s end
  Card.set_cost = function(self)
    self.cost = math.max(1, math.floor((self.base_cost + self.extra_cost + 0.5) * (100 - G.GAME.discount_percent) / 100))
  end
  Card.is_face = function(self)
    local id = self:get_id()
    return id == 11 or id == 12 or id == 13 or nil
  end
  Card.change_suit = function(self, s) self.base.suit = s end
  Card.set_edition = function(self, ed)
    if not ed then self.edition = nil return end
    local k = next(ed)
    self.edition = { type = k, [k] = true }
  end
  Card.set_rental = function(self, v) self.ability.rental = v end
  Card.set_eternal = function(self, v) self.ability.eternal = v end
  Card.start_materialize = noop
  Card.calculate_joker = function(self, ctx)
    if ctx and ctx.vanilla_probe then return 'vanilla' end
    if self.ability.name == 'Eight Counter' and ctx.other_card and ctx.other_card:get_id() == 8 then
      return { mult = 8 }
    end
  end
  _G.highlight_card = noop
  _G.playing_card_joker_effects = function(cards) CH.calls[#CH.calls + 1] = { 'pcje', #cards } end
  _G.new_round = noop
  _G.delay = noop
  _G.play_sound = noop
  _G.card_eval_status_text = function(...) CH.calls[#CH.calls + 1] = { 'status', ... } end
  _G.attention_text = function(a) CH.calls[#CH.calls + 1] = { 'attention', a.text } end
  _G.copy_card = function(other)
    local c = new_card(nil, other.config.center)
    c.ability = MP.copy(other.ability, true)
    c.edition = other.edition and MP.copy(other.edition) or nil
    return c
  end
  _G.create_playing_card = function(init, area)
    local c = new_card(init.front, init.center)
    G.playing_cards[#G.playing_cards + 1] = c
    c.playing_card = #G.playing_cards
    area:emplace(c)
    return c
  end
  _G.add_tag = function(tag) G.GAME.tags[#G.GAME.tags + 1] = tag end
  _G.Tag = setmetatable({ init = noop, apply_to_run = noop, set_ability = noop },
    { __call = function(_, key) return { key = key } end })
  _G.calculate_reroll_cost = function()
    if G.GAME.current_round.free_rerolls > 0 then G.GAME.current_round.reroll_cost = 0 end
  end
  _G.get_next_voucher_key = function() return 'v_overstock_norm' end
  _G.create_shop_card_ui = noop
  local orig_create = _G.create_card
  _G.create_card = function(_type, area, legendary, rarity, skip, soulable, forced, append)
    if _type == 'Trap' or _type == 'Tarot' or _type == 'Spectral' or _type == 'Planet' then
      CH.calls[#CH.calls + 1] = { 'create_card', _type, rarity, append, forced }
      pseudoseed('create_' .. _type)
      local key = forced or (_type == 'Trap' and 'c_mp_trap_alarm') or (_type == 'Planet' and 'c_mercury')
        or (_type == 'Spectral' and 'c_wraith') or 'c_fool'
      return new_card(nil, G.P_CENTERS[key])
    end
    return orig_create(_type, area, legendary, rarity, skip, soulable, forced, append)
  end
  _G.Back = {
    apply_to_run = function(self) CH.calls[#CH.calls + 1] = { 'back_apply', self.name } end,
    trigger_effect = function(self, args)
      if self.name == 'Plasma Deck' and args.context == 'final_scoring_step' then
        local tot = args.chips + args.mult
        return math.floor(tot / 2), math.floor(tot / 2)
      end
    end,
    generate_UI = noop,
  }
  Blind.modify_hand = function(_, _, _, _, mult, chips) return mult, chips, false end
  Blind.stay_flipped = function() return false end
  Game.update_shop = function() G.STATE_COMPLETE = true end
  Game.start_run = function(_, args)
    if args and args.challenge then G.GAME.challenge = args.challenge.id end
  end

  G.FUNCS.reroll_shop = function() CH.calls[#CH.calls + 1] = { 'reroll' } end
  G.FUNCS.toggle_shop = function() CH.calls[#CH.calls + 1] = { 'toggle_shop' } end
  G.FUNCS.end_consumeable = function() CH.calls[#CH.calls + 1] = { 'end_consumeable' } end
  G.FUNCS.buy_from_shop = function(e)
    local c = e.config.ref_table
    G.E_MANAGER:add_event(Event({ func = function()
      if c.area then c.area:remove_card(c) end
      G.jokers:emplace(c)
      return true
    end }))
  end
  G.FUNCS.discard_cards_from_highlighted = function(_, hook)
    if not hook then G.STATE = G.STATES.DRAW_TO_HAND end
  end
  G.FUNCS.draw_from_deck_to_hand = function()
    while G.deck.cards[1] and #G.hand.cards < G.hand.config.card_limit do
      local c = G.deck.cards[1]
      G.deck:remove_card(c)
      local flipped = G.GAME.blind:stay_flipped(G.hand, c)
      c.facing = flipped and 'back' or 'front'
      G.hand:emplace(c)
    end
  end
  G.FUNCS.get_poker_hand_info = function() return HAND.text, HAND.text, HAND.poker_hands, HAND.scoring, HAND.text end
  G.FUNCS.evaluate_play = function()
    local text, _, ph, scoring = G.FUNCS.get_poker_hand_info(G.play.cards)
    G.GAME.blind:modify_hand(G.play.cards, ph, text, 1, 10)
    for _, c in ipairs(scoring) do
      highlight_card(c, 0, 'down')
      if c.ability.name == 'Glass Card' and pseudorandom('glass') < G.GAME.probabilities.normal / c.ability.extra then
        c.shattered = true
      end
    end
  end
  G.FUNCS.use_card = function(e)
    local c = e.config.ref_table
    CH.calls[#CH.calls + 1] = { 'use_card', c.config.center.key, c.ability.set }
    if c.ability.consumeable then c:use_consumeable(c.area) end
  end
  G.FUNCS.can_skip_booster = function(e) e.config.button = 'skip_booster' end

  G.C.SECONDARY_SET = { Spectral = { 0, 0, 1, 1 }, Enhanced = { 1, 1, 1, 1 } }
  G.C.DARK_EDITION = { 1, 1, 1, 1 }
  G.C.RED = { 1, 0, 0, 1 }
  G.C.PURPLE = { 1, 0, 1, 1 }
  G.CARD_W, G.CARD_H = 1, 1
  for _, a in ipairs({ G.jokers, G.consumeables, G.hand, G.deck, G.play, G.shop_jokers }) do
    a.T = { x = 0, y = 0, w = 1, h = 1 }
  end
  G.GAME.tags = {}
  G.GAME.used_jokers = {}
  G.GAME.used_vouchers = {}
  G.GAME.discount_percent = 0
  G.GAME.interest_cap = 25
  G.GAME.current_round.free_rerolls = 0
  G.GAME.round_resets.blind_tags = { Small = 'tag_uncommon', Big = 'tag_rare' }
  G.GAME.blind_on_deck = 'Small'
  G.GAME.blind = setmetatable({ config = { blind = G.P_BLINDS.bl_small } }, { __index = Blind })
  G.playing_cards = {}
  G.pack_cards = nil
  local fk = fake
  for key, def in pairs({
    c_wheel_of_fortune = { set = 'Tarot', consumeable = true, order = 10, name = 'The Wheel of Fortune', config = {} },
    c_hanged_man = { set = 'Tarot', consumeable = true, order = 12, name = 'The Hanged Man', config = { max_highlighted = 2 } },
    c_medium = { set = 'Spectral', consumeable = true, order = 15, name = 'Medium', config = {} },
    c_mercury = { set = 'Planet', consumeable = true, order = 1, name = 'Mercury', config = { hand_type = 'Pair' } },
    m_glass = { set = 'Enhanced', order = 6, name = 'Glass Card', config = { Xmult = 2, extra = 4 } },
    m_gold = { set = 'Enhanced', order = 7, name = 'Gold Card', config = { h_dollars = 3 } },
    m_stone = { set = 'Enhanced', order = 5, name = 'Stone Card', config = { bonus = 50 } },
    j_rare_one = { set = 'Joker', rarity = 3, order = 120, name = 'Rare One', config = {} },
    j_eight = { set = 'Joker', rarity = 1, order = 121, name = 'Eight Counter', config = {} },
    j_photograph = { set = 'Joker', rarity = 1, order = 78, name = 'Photograph', config = {} },
    j_campfire = { set = 'Joker', rarity = 3, order = 105, name = 'Campfire', config = {}, perishable_compat = false },
    p_spectral_jumbo_1 = { set = 'Booster', order = 20, name = 'Jumbo Spectral Pack', kind = 'Spectral', weight = 0.3,
      config = { extra = 4, choose = 1 } },
    p_arcana_normal_1 = { set = 'Booster', order = 2, name = 'Arcana Pack', kind = 'Arcana', weight = 4,
      config = { extra = 3, choose = 1 } },
    b_plasma = { set = 'Back', order = 14, name = 'Plasma Deck', config = { ante_scaling = 2 } },
    b_challenge = { set = 'Back', order = 16, name = 'Challenge Deck', config = {}, omit = true },
    v_clearance_sale = { set = 'Voucher', order = 3, cost = 10, name = 'Clearance Sale' },
  }) do G.P_CENTERS[key] = def end
  fk.rebuild_pools()
  G.P_TAGS.tag_investment = { name = 'Investment Tag', order = 10, key = 'tag_investment' }
end

local function setup(over)
  MP = CH.boot()
  stubs()
  over = over or {}
  over.resolved = over.resolved or { layers = { 'standard', 'traps' } }
  CH.match(over)
  T = MP.traps
  H.sent_list = {}
  CH.calls = {}
end

local function flush() fake.flush() end

local function playing(suit, id, enh)
  local front = { suit = suit, id = id, value = tostring(id) }
  local c = new_card(front, G.P_CENTERS[enh or 'c_base'] or { set = 'Default', name = 'Default Base', config = {} })
  c.playing_card = id
  return c
end

local function peers(kind)
  local out = {}
  for _, m in ipairs(H.sent('peer')) do if m.d.k == kind then out[#out + 1] = m.d.d end end
  return out
end

--- Plant `key` on me as if u2 had taken it from a pack.
local function planted(key, uid)
  expect(T.receive_plant('u2', { card = { key = key }, owner = 'u2', uid = uid or ('t-' .. key) })).eq(true)
  MP.net.run_deferred()
  return T.find_hidden(key)
end

local function fired_to_owner(key)
  for _, d in ipairs(peers('trap_fired')) do if d.key == key then return d end end
  return nil
end

-- ── boot ────────────────────────────────────────────────────────────────────

describe('boot', function()
  after_each(CH.teardown)
  it('loads every WS9 module without errors and leaves no MP key behind after unmount', function()
    setup()
    expect(errors()).eq({})
    expect(MP.content_loaded ~= nil).truthy()
    MP.session.unmount('test')
    expect(MP.registry.leaked_keys()).eq({})
  end)
end)

-- ── CN-05 the Trap type ─────────────────────────────────────────────────────

describe('CN-05 Trap consumables', function()
  after_each(CH.teardown)

  it('defines the 16 traps in sheet order: $4, set Trap, the Trap atlas', function()
    setup()
    expect(#T.KEYS).eq(16)
    for i, key in ipairs(T.KEYS) do
      local p = G.P_CENTERS[key]
      expect(p.set).eq('Trap')
      expect(p.cost).eq(4)
      expect(p.atlas).eq('mp_Trap')
      expect(p.pos.x).eq(i - 1)
      expect(p.consumeable).eq(true)
    end
    expect(T.KEYS[1]).eq('c_mp_trap_glyph_of_warding')
    expect(T.KEYS[10]).eq('c_mp_trap_arcane_lock')
    expect(T.KEYS[16]).eq('c_mp_trap_mental_prison')
    expect(G.C.SET.Trap).eq(T.COLOUR)
    expect(G.C.SECONDARY_SET.Trap).eq(T.DARK_PINK)
  end)

  it('pools traps and trap packs only with the traps layer, never in Consumeables (no shop rate)', function()
    setup()
    expect(#G.P_CENTER_POOLS.Trap).eq(16)
    for _, v in ipairs(G.P_CENTER_POOLS.Consumeables) do expect(v.set ~= 'Trap').truthy() end
    local packs = {}
    for _, v in ipairs(G.P_CENTER_POOLS.Booster) do packs[v.key] = true end
    expect(packs.p_mp_trap_normal and packs.p_mp_trap_jumbo).truthy()
    expect(packs.p_mp_standard_giga).eq(nil)
    CH.teardown()
    setup({ resolved = { layers = { 'standard' } } })
    expect(#(G.P_CENTER_POOLS.Trap or {})).eq(0)
    packs = {}
    for _, v in ipairs(G.P_CENTER_POOLS.Booster) do packs[v.key] = true end
    expect(packs.p_mp_trap_normal).eq(nil)
    local banned = MP.set_of(MP.session.ban_list(MP.state.session, MP.resolved()))
    expect(banned.p_mp_trap_normal and banned.p_mp_trap_jumbo).truthy()
  end)

  it('is usable only while it sits in a pack', function()
    setup()
    local c = CH.card('c_mp_trap_alarm', G.consumeables)
    expect(c:can_use_consumeable()).eq(false)
    G.pack_cards = { cards = {}, config = {} }
    c.area = G.pack_cards
    expect(c:can_use_consumeable()).eq(true)
  end)
end)

-- ── planting ────────────────────────────────────────────────────────────────

describe('planting', function()
  after_each(CH.teardown)

  local function in_pack(key)
    G.pack_cards = { cards = {}, config = {}, remove_card = function() end }
    local c = new_card(nil, G.P_CENTERS[key])
    c.area = G.pack_cards
    return c
  end

  it('sends trap_plant {card, owner, uid} to my nemesis', function()
    setup()
    local c = in_pack('c_mp_trap_alarm')
    expect(c:use_consumeable(G.pack_cards)).eq('planted')
    local p = peers('trap_plant')
    expect(#p).eq(1)
    expect(p[1].card.key).eq('c_mp_trap_alarm')
    expect(p[1].owner).eq('u1')
    expect(type(p[1].uid) == 'string' and #p[1].uid <= 32).truthy()
    expect(require('rmh_mp.protocol').validate('l2j', 'peer', { k = 'trap_plant', d = p[1] })).truthy()
  end)

  it('fizzles with no nemesis (a bye, practice) and toasts', function()
    setup()
    MP.state.pvp.bye = true
    local c = in_pack('c_mp_trap_alarm')
    expect(c:use_consumeable(G.pack_cards)).eq('fizzled')
    expect(#peers('trap_plant')).eq(0)
    expect(#CH.called('attention')).eq(1)
    CH.teardown()
    setup({ kind = 'practice' })
    c = in_pack('c_mp_trap_web')
    expect(c:use_consumeable(G.pack_cards)).eq('fizzled')
  end)

  it('prefers the Teams card target', function()
    setup()
    MP.state.card_target = 'u3'
    expect(T.target()).eq('u3')
  end)

  it('a received trap lands face-down, slotless, unsellable and unusable, and is announced in trap_held', function()
    setup()
    local limit = G.consumeables.config.card_limit
    local c = planted('c_mp_trap_alarm', 'u2.1')
    expect(c ~= nil).truthy()
    expect(c.facing).eq('back')
    expect(c.sprite_facing).eq('back')
    expect(c.ability.mp_trap_owner).eq('u2')
    expect(G.consumeables.config.card_limit).eq(limit + 1)
    expect(c:can_sell_card()).eq(false)
    expect(c:can_use_consumeable()).eq(false)
    local held = peers('trap_held')
    expect(#held).eq(1)
    expect(held[1].cards[1].key).eq('c_mp_trap_alarm')
    expect(held[1].cards[1].owner).eq('u2')
    expect(require('rmh_mp.protocol').validate('l2j', 'peer', { k = 'trap_held', d = held[1] })).truthy()
  end)

  it('rejects forged owners, non-trap keys and duplicate uids', function()
    setup()
    expect(T.receive_plant('u2', { card = { key = 'c_mp_trap_alarm' }, owner = 'u9', uid = 'x' })).eq(false)
    expect(T.receive_plant('u2', { card = { key = 'j_joker' }, owner = 'u2', uid = 'x' })).eq(false)
    expect(T.receive_plant('u2', { card = 'nope', owner = 'u2', uid = 'x' })).eq(false)
    planted('c_mp_trap_alarm', 'dup')
    expect(T.receive_plant('u2', { card = { key = 'c_mp_trap_alarm' }, owner = 'u2', uid = 'dup' })).eq(false)
    expect(#T.hidden()).eq(1)
  end)

  it('Arcane Lock bounces the trap I take onto me, owned by the lock owner; the lock fires', function()
    setup()
    planted('c_mp_trap_arcane_lock', 'lock1')
    H.sent_list = {}
    local c = in_pack('c_mp_trap_fire_trap')
    expect(c:use_consumeable(G.pack_cards)).eq('bounced')
    expect(#peers('trap_plant')).eq(0)
    local bounced = T.find_hidden('c_mp_trap_fire_trap')
    expect(bounced ~= nil).truthy()
    expect(bounced.ability.mp_trap_owner).eq('u2')
    local f = fired_to_owner('c_mp_trap_arcane_lock')
    expect(f.owner).eq('u2')
    expect(f.uid).eq('lock1')
    expect(T.find_hidden('c_mp_trap_arcane_lock')).eq(nil)
  end)
end)

-- ── firing: one spec per trap (victim effect + owner reward) ────────────────

describe('CN-06..21 the 16 traps', function()
  after_each(CH.teardown)

  it('reveal gives the slot back, and a trap fires only once', function()
    setup()
    local limit = G.consumeables.config.card_limit
    planted('c_mp_trap_alarm')
    expect(T.event('reroll', {})).eq(1)
    expect(T.event('reroll', {})).eq(0)
    expect(G.consumeables.config.card_limit).eq(limit)
    flush()
    expect(#G.consumeables.cards).eq(0)
    expect(#peers('trap_fired')).eq(1)
    expect(require('rmh_mp.protocol').validate('l2j', 'peer', { k = 'trap_fired', d = peers('trap_fired')[1] })).truthy()
  end)

  it('Glyph of Warding: a Spectral used -> the owner gets a Ward Tag', function()
    setup()
    planted('c_mp_trap_glyph_of_warding')
    local tarot = new_card(nil, G.P_CENTERS.c_fool)
    tarot:use_consumeable(G.consumeables)
    expect(fired_to_owner('c_mp_trap_glyph_of_warding')).eq(nil)
    local sp = new_card(nil, G.P_CENTERS.c_medium)
    sp:use_consumeable(G.consumeables)
    local f = fired_to_owner('c_mp_trap_glyph_of_warding')
    expect(f ~= nil).truthy()
    -- owner side
    MP.state.session.me = 'u2'
    expect(T.receive_fired('u1', f)).eq(true)
    MP.net.run_deferred()
    flush()
    expect(G.GAME.tags[#G.GAME.tags].key).eq('tag_mp_ward')
    expect(#CH.called('attention') >= 1).truthy()
  end)

  it('Symbol: a Flush -> every scored card gets a seeded random suit', function()
    setup()
    planted('c_mp_trap_symbol')
    local cards = { playing('Hearts', 2), playing('Hearts', 5), playing('Hearts', 9) }
    HAND.text, HAND.poker_hands, HAND.scoring = 'Flush', { Flush = { cards }, Pair = {} }, cards
    G.play.cards = cards
    G.FUNCS.evaluate_play()
    expect(fired_to_owner('c_mp_trap_symbol') ~= nil).truthy()
    local any = false
    for _, c in ipairs(cards) do
      expect(MP.set_of(T.SUITS)[c.base.suit]).eq(true)
      if c.base.suit ~= 'Hearts' then any = true end
    end
    expect(any).truthy()
  end)

  it('Symbol stays hidden without a Flush', function()
    setup()
    planted('c_mp_trap_symbol')
    local cards = { playing('Hearts', 2) }
    HAND.text, HAND.poker_hands, HAND.scoring = 'High Card', { Flush = {}, Pair = {} }, cards
    G.FUNCS.evaluate_play()
    expect(T.find_hidden('c_mp_trap_symbol') ~= nil).truthy()
  end)

  it('Alarm: a reroll -> 2 free rerolls for the owner, banked outside a shop', function()
    setup()
    planted('c_mp_trap_alarm')
    G.FUNCS.reroll_shop()
    local f = fired_to_owner('c_mp_trap_alarm')
    expect(f.payload.rerolls).eq(2)
    MP.state.session.me = 'u2'
    G.shop = nil
    T.receive_fired('u1', f)
    MP.net.run_deferred()
    expect(G.GAME.mp_pending_free_rerolls).eq(2)
    G.STATE_COMPLETE = false
    Game.update_shop(G, 0)
    expect(G.GAME.current_round.free_rerolls).eq(2)
    expect(G.GAME.mp_pending_free_rerolls).eq(nil)
    -- in a shop: immediately; and the payload is clamped
    G.shop = {}
    T.receive_fired('u1', { owner = 'u2', key = 'c_mp_trap_alarm', uid = 'other', payload = { rerolls = 99 } })
    MP.net.run_deferred()
    expect(G.GAME.current_round.free_rerolls).eq(4)
  end)

  it('Explosive Runes: scored non-debuffed Glass cards break after scoring', function()
    setup()
    planted('c_mp_trap_explosive_runes')
    local glass = playing('Spades', 9, 'm_glass')
    local glass2 = playing('Spades', 4, 'm_glass')
    glass2.debuff = true
    local plain = playing('Spades', 3)
    HAND.text, HAND.poker_hands, HAND.scoring = 'High Card', {}, { glass, glass2, plain }
    G.play.cards = { glass, glass2, plain }
    G.FUNCS.evaluate_play()
    expect(fired_to_owner('c_mp_trap_explosive_runes') ~= nil).truthy()
    expect(glass.shattered).eq(true)
    expect(glass2.shattered).eq(nil)
    expect(plain.shattered).eq(nil)
    expect(glass.ability.mp_trap_break).eq(nil)
  end)

  it('Sepia Snake Sigil: buying a Rare joker -> the owner gets a copy (if there is room)', function()
    setup()
    planted('c_mp_trap_sepia_snake_sigil')
    local common = new_card(nil, G.P_CENTERS.j_joker)
    G.shop_jokers:emplace(common)
    G.FUNCS.buy_from_shop({ config = { ref_table = common } })
    flush()
    expect(fired_to_owner('c_mp_trap_sepia_snake_sigil')).eq(nil)
    local rare = new_card(nil, G.P_CENTERS.j_rare_one)
    G.shop_jokers:emplace(rare)
    G.FUNCS.buy_from_shop({ config = { ref_table = rare } })
    flush()
    local f = fired_to_owner('c_mp_trap_sepia_snake_sigil')
    expect(f.payload.key).eq('j_rare_one')
    MP.state.session.me = 'u2'
    for i = #G.jokers.cards, 1, -1 do G.jokers:remove_card(G.jokers.cards[i]) end
    T.receive_fired('u1', f)
    MP.net.run_deferred()
    expect(G.jokers.cards[1].config.center.key).eq('j_rare_one')
    -- a non-joker key is ignored
    T.receive_fired('u1', { owner = 'u2', key = 'c_mp_trap_sepia_snake_sigil', uid = 'z', payload = { key = 'c_fool' } })
    MP.net.run_deferred()
    expect(#G.jokers.cards).eq(1)
  end)

  it('Fire Trap: a Pair -> every scored card one rank down, floor 2', function()
    setup()
    planted('c_mp_trap_fire_trap')
    local a, b, two = playing('Clubs', 14), playing('Spades', 14), playing('Hearts', 2)
    HAND.text, HAND.poker_hands, HAND.scoring = 'Pair', { Pair = { { a, b } }, Flush = {} }, { a, b, two }
    G.FUNCS.evaluate_play()
    expect(a.base.id).eq(13)
    expect(b.base.id).eq(13)
    expect(two.base.id).eq(2)
    expect(a.base.suit).eq('Clubs')
  end)

  it('Guards and Wards: a playing card added -> 2 Stone cards join the deck, no re-trigger', function()
    setup()
    planted('c_mp_trap_guards_and_wards')
    local n = #G.deck.cards
    playing_card_joker_effects({ playing('Hearts', 5) })
    expect(#G.deck.cards).eq(n + 2)
    expect(G.deck.cards[n + 1].config.center.key).eq('m_stone')
    expect(#CH.called('pcje')).eq(1)
    expect(fired_to_owner('c_mp_trap_guards_and_wards') ~= nil).truthy()
  end)

  it('Magic Mouth: a Blue seal makes a Planet -> it is taken and given to the owner', function()
    setup()
    planted('c_mp_trap_magic_mouth')
    local c = playing('Hearts', 5)
    c.seal = 'Blue'
    G.hand:emplace(c)
    c:get_end_of_round_effect()
    flush()
    local f = fired_to_owner('c_mp_trap_magic_mouth')
    expect(f.payload.card.key).eq('c_mercury')
    for _, cc in ipairs(G.consumeables.cards) do expect(cc.config.center.key ~= 'c_mercury').truthy() end
    MP.state.session.me = 'u2'
    T.receive_fired('u1', f)
    MP.net.run_deferred()
    expect(G.consumeables.cards[#G.consumeables.cards].config.center.key).eq('c_mercury')
  end)

  it('Magic Mouth stays hidden when the seal made nothing (no room)', function()
    setup()
    planted('c_mp_trap_magic_mouth')
    G.consumeables.config.card_limit = #G.consumeables.cards
    local c = playing('Hearts', 5)
    c.seal = 'Blue'
    c:get_end_of_round_effect()
    flush()
    expect(T.find_hidden('c_mp_trap_magic_mouth') ~= nil).truthy()
  end)

  it('Snare: a skip -> the owner gets a copy of the skipped blind tag', function()
    setup()
    planted('c_mp_trap_snare')
    G.FUNCS.skip_blind()
    local f = fired_to_owner('c_mp_trap_snare')
    expect(f.payload.tag_key).eq('tag_uncommon')
    MP.state.session.me = 'u2'
    T.receive_fired('u1', f)
    MP.net.run_deferred()
    expect(G.GAME.tags[#G.GAME.tags].key).eq('tag_uncommon')
  end)

  it('Programmed Illusion: one extra fake card, built without moving any RNG stream', function()
    setup()
    planted('c_mp_trap_programmed_illusion')
    local pack = new_card(nil, G.P_CENTERS.p_arcana_normal_1)
    G.pack_cards = { cards = {}, config = { card_limit = 3 }, T = { x = 0, y = 0 } }
    function G.pack_cards:emplace(c) self.cards[#self.cards + 1] = c; c.area = self end
    pack:open()
    expect(fired_to_owner('c_mp_trap_programmed_illusion') ~= nil).truthy()
    for i = 1, 3 do G.pack_cards:emplace(new_card(nil, G.P_CENTERS.c_fool)) end
    local before = MP.copy(G.GAME.pseudorandom, true)
    flush()
    expect(#G.pack_cards.cards).eq(4)
    local fake_card = G.pack_cards.cards[4]
    expect(fake_card.ability.mp_illusion_fake).eq(true)
    expect(G.GAME.pseudorandom).eq(before)
    -- picking it runs vanilla's pick bookkeeping but uses nothing
    G.FUNCS.use_card({ config = { ref_table = fake_card } })
    local uc = CH.called('use_card')
    expect(uc[#uc][3]).eq('mp_illusion')
    expect(fake_card.ability.set).eq('Tarot')
  end)

  it('Web: any consumable used -> a Negative copy for the owner; a Trap taken from a pack does not count', function()
    setup()
    planted('c_mp_trap_web')
    G.pack_cards = { cards = {}, config = {} }
    local tr = new_card(nil, G.P_CENTERS.c_mp_trap_alarm)
    tr.area = G.pack_cards
    MP.state.pvp.bye = true
    tr:use_consumeable(G.pack_cards)
    expect(fired_to_owner('c_mp_trap_web')).eq(nil)
    new_card(nil, G.P_CENTERS.c_fool):use_consumeable(G.consumeables)
    local f = fired_to_owner('c_mp_trap_web')
    expect(f.payload.key).eq('c_fool')
    MP.state.session.me = 'u2'
    T.receive_fired('u1', f)
    MP.net.run_deferred()
    local got = G.consumeables.cards[#G.consumeables.cards]
    expect(got.config.center.key).eq('c_fool')
    expect(got.edition.negative).eq(true)
  end)

  it('Forbiddance: the refill after a player discard comes face-down, then it fires', function()
    setup()
    local trap = planted('c_mp_trap_forbiddance')
    G.hand.config.card_limit = 3
    for i = 1, 3 do G.deck:emplace(playing('Spades', i + 2)) end
    G.hand.highlighted = { playing('Clubs', 9) }
    G.FUNCS.discard_cards_from_highlighted(nil, false)
    expect(trap.ability.mp_forbiddance_armed).eq(true)
    G.FUNCS.draw_from_deck_to_hand()
    for _, c in ipairs(G.hand.cards) do expect(c.facing).eq('back') end
    flush()
    expect(fired_to_owner('c_mp_trap_forbiddance') ~= nil).truthy()
  end)

  it('Forbiddance ignores a blind-forced discard, stays hidden on an empty refill, disarms on a new blind', function()
    setup()
    local trap = planted('c_mp_trap_forbiddance')
    G.hand.highlighted = { playing('Clubs', 9) }
    G.FUNCS.discard_cards_from_highlighted(nil, true)
    expect(trap.ability.mp_forbiddance_armed).eq(nil)
    G.FUNCS.discard_cards_from_highlighted(nil, false)
    G.FUNCS.draw_from_deck_to_hand() -- empty deck
    flush()
    expect(fired_to_owner('c_mp_trap_forbiddance')).eq(nil)
    expect(T.find_hidden('c_mp_trap_forbiddance') ~= nil).truthy()
    G.FUNCS.discard_cards_from_highlighted(nil, false)
    new_round()
    expect(trap.ability.mp_forbiddance_armed).eq(nil)
  end)

  it('Faithful Hound: a Planet used -> the owner levels that hand +3', function()
    setup()
    planted('c_mp_trap_faithful_hound')
    new_card(nil, G.P_CENTERS.c_mercury):use_consumeable(G.consumeables)
    local f = fired_to_owner('c_mp_trap_faithful_hound')
    expect(f.payload.hand_type).eq('Pair')
    MP.state.session.me = 'u2'
    local lvl = G.GAME.hands.Pair.level
    T.receive_fired('u1', f)
    MP.net.run_deferred()
    expect(G.GAME.hands.Pair.level).eq(lvl + 3)
  end)

  it('Phase Door: held Gold cards pay -> $4 per held, non-debuffed Gold card to the owner', function()
    setup()
    planted('c_mp_trap_phase_door')
    local g1, g2, g3 = playing('Hearts', 5, 'm_gold'), playing('Hearts', 6, 'm_gold'), playing('Hearts', 7, 'm_gold')
    g3.debuff = true
    for _, c in ipairs({ g1, g2, g3 }) do G.hand:emplace(c) end
    g3:get_end_of_round_effect()
    expect(fired_to_owner('c_mp_trap_phase_door')).eq(nil)
    g1:get_end_of_round_effect()
    g2:get_end_of_round_effect()
    local f = fired_to_owner('c_mp_trap_phase_door')
    expect(f.payload.dollars).eq(8)
    expect(#peers('trap_fired')).eq(1)
    MP.state.session.me = 'u2'
    local d = G.GAME.dollars
    T.receive_fired('u1', f)
    MP.net.run_deferred()
    expect(G.GAME.dollars).eq(d + 8)
    T.receive_fired('u1', { owner = 'u2', key = 'c_mp_trap_phase_door', uid = 'big', payload = { dollars = 1e9 } })
    MP.net.run_deferred()
    expect(G.GAME.dollars).eq(d + 8 + 256)
  end)

  it('Mental Prison: a Wheel of Fortune left in the shop -> 2 Wheels for the owner (room permitting)', function()
    setup()
    planted('c_mp_trap_mental_prison')
    G.shop = {}
    G.FUNCS.toggle_shop()
    expect(fired_to_owner('c_mp_trap_mental_prison')).eq(nil)
    G.shop_jokers:emplace(new_card(nil, G.P_CENTERS.c_wheel_of_fortune))
    G.FUNCS.reroll_shop()
    local f = fired_to_owner('c_mp_trap_mental_prison')
    expect(f ~= nil).truthy()
    MP.state.session.me = 'u2'
    for i = #G.consumeables.cards, 1, -1 do G.consumeables:remove_card(G.consumeables.cards[i]) end
    G.consumeables.config.card_limit = 1
    T.receive_fired('u1', f)
    MP.net.run_deferred()
    expect(#G.consumeables.cards).eq(1)
    expect(G.consumeables.cards[1].config.center.key).eq('c_wheel_of_fortune')
  end)

  it('Mental Prison also fires when a pack ends with a Wheel still in it', function()
    setup()
    planted('c_mp_trap_mental_prison')
    G.pack_cards = { cards = { new_card(nil, G.P_CENTERS.c_wheel_of_fortune) }, config = {} }
    G.FUNCS.end_consumeable()
    expect(fired_to_owner('c_mp_trap_mental_prison') ~= nil).truthy()
  end)
end)

-- ── owner side and the trap row ─────────────────────────────────────────────

describe('trap_fired and the trap row (NET-08)', function()
  after_each(CH.teardown)

  it('pays only the owner, once per uid, and ignores unknown keys', function()
    setup()
    local d0 = G.GAME.dollars
    expect(T.receive_fired('u2', { owner = 'u9', key = 'c_mp_trap_phase_door', uid = 'a', payload = { dollars = 4 } })).eq(false)
    expect(T.receive_fired('u2', { owner = 'u1', key = 'j_joker', uid = 'a', payload = {} })).eq(false)
    expect(T.receive_fired('u2', { owner = 'u1', key = 'c_mp_trap_phase_door', uid = 'a', payload = { dollars = 4 } })).eq(true)
    expect(T.receive_fired('u2', { owner = 'u1', key = 'c_mp_trap_phase_door', uid = 'a', payload = { dollars = 4 } })).eq(false)
    MP.net.run_deferred()
    expect(G.GAME.dollars).eq(d0 + 4)
  end)

  it("keeps the nemesis' face-down row; only my own entries are revealable; fired ids reset per ante", function()
    setup()
    expect(T.receive_held('u2', { cards = { { uid = 'a', key = 'c_mp_trap_alarm', owner = 'u1' },
      { uid = 'b', key = 'c_mp_trap_web', owner = 'u3' }, { uid = 'c', key = 'j_joker', owner = 'u1' } }, fired = { 'b' } })).eq(true)
    local row = T.nemesis_row()
    expect(#row).eq(1)
    expect(row[1].mine).eq(true)
    T.new_ante()
    row = T.nemesis_row()
    expect(#row).eq(2)
    expect(row[2].mine).eq(false)
    expect(T.receive_held('u1', { cards = {}, fired = {} })).eq(false) -- my own echo
  end)

  it('re-sends my list when the session starts and when a player comes back', function()
    setup()
    planted('c_mp_trap_alarm')
    H.sent()
    H.sent_list = {}
    MP.traps.hooks.frame()
    expect(#peers('trap_held')).eq(1)
    H.sent_list = {}
    MP.traps.hooks.frame()
    expect(#peers('trap_held')).eq(0)
    MP.state.presence = { u2 = { status = 'away' } }
    MP.traps.hooks.frame()
    expect(#peers('trap_held')).eq(0)
    MP.state.presence.u2.status = 'back'
    MP.traps.hooks.frame()
    expect(#peers('trap_held')).eq(1)
    -- ante change forgets fired ids
    T.state().fired = { 'x' }
    G.GAME.round_resets.ante = 2
    MP.traps.hooks.frame()
    expect(#T.state().fired).eq(0)
  end)

  it('hidden traps survive as plain ability data (save/rejoin) and a live copy is inert', function()
    setup()
    local c = planted('c_mp_trap_snare')
    local cp = copy_card(c)
    expect(cp.ability.mp_trap_hidden).eq(nil)
    expect(cp.ability.mp_trap_fired).eq(true)
    expect(c.ability.mp_trap_uid ~= nil and c.ability.mp_trap_owner == 'u2').truthy()
  end)
end)

-- ── boosters ────────────────────────────────────────────────────────────────

describe('BO-01..03 boosters, TG-04 Ward', function()
  after_each(CH.teardown)

  it('defines the Giga pack (weight 0, 10 choose 4, $16, never pooled) and the trap packs (weight 1)', function()
    setup()
    local giga = G.P_CENTERS.p_mp_standard_giga
    expect(giga.weight).eq(0)
    expect(giga.cost).eq(16)
    expect(giga.config.extra).eq(10)
    expect(giga.config.choose).eq(4)
    local n, j = G.P_CENTERS.p_mp_trap_normal, G.P_CENTERS.p_mp_trap_jumbo
    expect(n.weight).eq(1); expect(j.weight).eq(1)
    expect(n.kind).eq('Trap')
    expect(n.cost).eq(4); expect(j.cost).eq(6)
    expect(n.config.extra).eq(3); expect(j.config.extra).eq(5)
    expect(n.config.choose).eq(1); expect(j.config.choose).eq(1)
    expect(j.pos.x).eq(1)
  end)

  it('opens a Trap pack as a planet-style pack whose cards are Traps', function()
    setup()
    local pack = new_card(nil, G.P_CENTERS.p_mp_trap_normal)
    pack:open()
    local vo = CH.called('vanilla_open')
    expect(vo[1][2]:find('Celestial') ~= nil).truthy()
    expect(G.GAME.mp_open_pack).eq('p_mp_trap_normal')
    G.pack_cards = { cards = {}, config = {} }
    local c = create_card('Planet', G.pack_cards, nil, nil, true, true, 'c_mercury', 'pl1')
    expect(c.config.center.set).eq('Trap')
    G.FUNCS.end_consumeable()
    expect(G.GAME.mp_open_pack).eq(nil)
    c = create_card('Planet', G.pack_cards, nil, nil, true, true, nil, 'pl1')
    expect(c.config.center.set).eq('Planet')
  end)

  it('the Giga pack opens as Standard, cannot be skipped; picks grow with booster_choice_mod', function()
    setup()
    local pack = new_card(nil, G.P_CENTERS.p_mp_standard_giga)
    G.GAME.modifiers.booster_choice_mod = 1
    pack:open()
    expect(CH.called('vanilla_open')[1][2]:find('Standard') ~= nil).truthy()
    expect(G.GAME.pack_choices).eq(5)
    G.pack_cards = { cards = { new_card(nil, G.P_CENTERS.c_fool) }, config = {} }
    local e = { config = {} }
    G.FUNCS.can_skip_booster(e)
    expect(e.config.button).eq(nil)
    G.GAME.mp_open_pack = nil
    G.GAME.modifiers.booster_choice_mod = nil
    G.FUNCS.can_skip_booster(e)
    expect(e.config.button).eq('skip_booster')
  end)

  it('caps the extra picks at the pack size', function()
    setup()
    G.GAME.modifiers.booster_choice_mod = 5
    new_card(nil, G.P_CENTERS.p_mp_trap_normal):open()
    expect(G.GAME.pack_choices).eq(3)
  end)

  it('the Ward tag is never pooled and opens a free Jumbo Spectral pack at the blind choice', function()
    setup()
    expect(G.P_TAGS.tag_mp_ward ~= nil).truthy()
    for _, t in ipairs(G.P_CENTER_POOLS.Tag) do expect(t.key ~= 'tag_mp_ward').truthy() end
    local def = MP.registry.get('tag_mp_ward')
    local tag = { key = 'tag_mp_ward', ID = 7, yep = function(_, _, _, fn) fn() end }
    expect(def.tag.apply(tag, { type = 'shop_start' })).eq(nil)
    expect(def.tag.apply(tag, { type = 'new_blind_choice' })).eq(true)
    local uc = CH.called('use_card')
    expect(uc[1][2]).eq('p_spectral_jumbo_1')
    expect(G.CONTROLLER.locks[7]).eq(nil)
  end)
end)

-- ── decks ───────────────────────────────────────────────────────────────────

describe('DK-01..07 decks', function()
  after_each(CH.teardown)

  local function apply(key)
    local def = MP.registry.get(key)
    def.apply(MP.content.cocktail.pseudo_back(key))
  end

  it('defines the MP decks with their art cells and the Balanced flag', function()
    setup()
    local cells = { b_mp_violet = { 0, 0 }, b_mp_indigo = { 1, 0 }, b_mp_orange = { 2, 0 }, b_mp_cocktail = { 4, 0 },
      b_mp_gradient = { 0, 1 }, b_mp_oracle = { 1, 1 } }
    for k, pos in pairs(cells) do
      local p = G.P_CENTERS[k]
      expect(p.set).eq('Back')
      expect(p.atlas).eq('mp_decks')
      expect(p.pos.x).eq(pos[1]); expect(p.pos.y).eq(pos[2])
      expect(p.config.mp_balanced).eq(true)
    end
    expect(G.P_CENTERS.b_mp_heidelberg.atlas).eq('mp_b_heidelberg')
    expect(G.P_CENTERS.b_mp_echodeck.atlas).eq('mp_misc')
    expect(G.P_CENTERS.b_mp_orange.config.consumables).eq({ 'c_hanged_man', 'c_hanged_man' })
    expect(G.P_CENTERS.b_mp_oracle.config.vouchers).eq({ 'v_clearance_sale' })
  end)

  it('Violet: vouchers 50% off in Ante 1, 30% off in Ante 2, full price after; a second voucher', function()
    setup()
    apply('b_mp_violet')
    local v = new_card(nil, G.P_CENTERS.v_overstock_norm)
    v.base_cost, v.extra_cost = 10, 0
    v:set_cost()
    expect(v.cost).eq(5)
    G.GAME.round_resets.ante = 2
    v:set_cost()
    expect(v.cost).eq(7)
    G.GAME.round_resets.ante = 3
    v:set_cost()
    expect(v.cost).eq(10)
    G.shop_vouchers = { cards = {}, config = { card_limit = 1 }, T = { x = 0, y = 0, w = 1 } }
    function G.shop_vouchers:emplace(c) self.cards[#self.cards + 1] = c end
    expect(MP.content.decks.violet_fill()).eq(true)
    expect(MP.content.decks.violet_fill()).eq(false) -- already there
    expect(#G.shop_vouchers.cards).eq(1)
    expect(G.shop_vouchers.config.card_limit).eq(2)
  end)

  it('Indigo: +1 pick, bans Red Card; unskippable unless nothing in the pack can be used', function()
    setup()
    apply('b_mp_indigo')
    expect(G.GAME.modifiers.booster_choice_mod).eq(1)
    expect(G.GAME.banned_keys.j_red_card).eq(true)
    local D = MP.content.decks
    -- a joker with every slot held by eternal jokers: unusable -> softlock -> Skip stays
    G.jokers.config.card_limit = 1
    local e1 = new_card(nil, G.P_CENTERS.j_joker); e1.ability.eternal = true; G.jokers:emplace(e1)
    G.pack_cards = { cards = { new_card(nil, G.P_CENTERS.j_rare_one) }, config = {} }
    expect(D.pack_softlocked()).eq(true)
    local e = { config = {} }
    G.FUNCS.can_skip_booster(e)
    expect(e.config.button).eq('skip_booster')
    -- a planet is always usable
    G.pack_cards.cards[2] = new_card(nil, G.P_CENTERS.c_mercury)
    expect(D.pack_softlocked()).eq(false)
    e = { config = {} }
    G.FUNCS.can_skip_booster(e)
    expect(e.config.button).eq(nil)
    -- a selection tarot needs cards in hand
    G.pack_cards.cards = { new_card(nil, G.P_CENTERS.c_hanged_man) }
    expect(D.pack_softlocked()).eq(true)
    G.hand:emplace(playing('Hearts', 4))
    expect(D.pack_softlocked()).eq(false)
    -- The Fool needs a last tarot that is not The Fool
    G.pack_cards.cards = { new_card(nil, G.P_CENTERS.c_fool) }
    expect(D.pack_card_usable(G.pack_cards.cards[1])).eq(false)
    G.GAME.last_tarot_planet = 'c_mercury'
    expect(D.pack_card_usable(G.pack_cards.cards[1])).eq(true)
  end)

  it('Orange: opens a free Giga pack once the blind select is up', function()
    setup()
    apply('b_mp_orange')
    expect(G.CONTROLLER.locks.mp_orange_giga).eq(true)
    fake.advance(0.1)
    expect(#CH.called('use_card')).eq(0)
    G.STATE = G.STATES.BLIND_SELECT
    G.blind_select = {}
    flush()
    expect(CH.called('use_card')[1][2]).eq('p_mp_standard_giga')
    expect(G.CONTROLLER.locks.mp_orange_giga).eq(nil)
  end)

  it('Oracle: money capped at $50 + the interest cap, MAX when full', function()
    setup()
    apply('b_mp_oracle')
    G.GAME.dollars = 70
    ease_dollars(10)
    expect(G.GAME.dollars).eq(75)
    ease_dollars(3)
    expect(G.GAME.dollars).eq(75)
    ease_dollars(-20)
    expect(G.GAME.dollars).eq(55)
    G.GAME.interest_cap = 50
    ease_dollars(100)
    expect(G.GAME.dollars).eq(100)
  end)

  it('Gradient: ranks count one higher or lower for jokers; 10 and Ace are faces; Photograph untouched', function()
    setup()
    apply('b_mp_gradient')
    local eight = CH.card('j_eight', G.jokers)
    for _, id in ipairs({ 7, 8, 9 }) do
      local c = playing('Spades', id)
      G.playing_cards[#G.playing_cards + 1] = c
      local r = eight:calculate_joker({ other_card = c, individual = true, cardarea = G.play })
      expect(r and r.mult).eq(8)
      expect(c.base.id).eq(id) -- restored
    end
    local ten = playing('Spades', 10)
    G.playing_cards[#G.playing_cards + 1] = ten
    expect(eight:calculate_joker({ other_card = ten, individual = true })).eq(nil)
    expect(ten.base.id).eq(10)
    expect(ten:is_face()).eq(true)
    expect(playing('Spades', 14):is_face()).eq(true)
    expect(playing('Spades', 9):is_face()).eq(nil)
    expect(MP.content.decks.GRADIENT_SKIP.j_photograph).eq(true)
  end)

  it('Heidelberg: a Negative copy of a random consumable at the end of the shop (never a hidden trap)', function()
    setup()
    apply('b_mp_heidelberg')
    planted('c_mp_trap_alarm')
    G.shop = {}
    G.FUNCS.toggle_shop()
    flush()
    expect(#G.consumeables.cards).eq(1)
    G.consumeables:emplace(new_card(nil, G.P_CENTERS.c_fool))
    G.FUNCS.toggle_shop()
    flush()
    local last = G.consumeables.cards[#G.consumeables.cards]
    expect(last.config.center.key).eq('c_fool')
    expect(last.edition.negative).eq(true)
  end)

  it('Echo: every card retriggers (stacks with Red seals); X1.2 blind size, +0.2 per Boss', function()
    setup()
    apply('b_mp_echodeck')
    expect(G.GAME.starting_params.ante_scaling).eq(1.2)
    local c = playing('Hearts', 5)
    local r = c:calculate_seal({ repetition = true, repetition_only = true, cardarea = G.play })
    expect(r.repetitions).eq(1)
    c.seal = 'Red'
    r = c:calculate_seal({ repetition = true, repetition_only = true, cardarea = G.play })
    expect(r.repetitions).eq(2)
    c.debuff = true
    expect(c:calculate_seal({ repetition = true, cardarea = G.play })).eq(nil)
    G.GAME.last_blind = { boss = false }
    MP.registry.get('b_mp_echodeck').trigger(nil, { context = 'eval' })
    expect(G.GAME.starting_params.ante_scaling).eq(1.2)
    G.GAME.last_blind = { boss = true }
    MP.registry.get('b_mp_echodeck').trigger(nil, { context = 'eval' })
    expect(math.abs(G.GAME.starting_params.ante_scaling - 1.4) < 1e-9).truthy()
  end)

  it('playing cards of an MP deck draw their back from the MP atlas', function()
    setup()
    G.ASSET_ATLAS = { mp_decks = { name = 'mp_decks' } }
    G.GAME.selected_back = { effect = { center = G.P_CENTERS.b_mp_indigo }, pos = G.P_CENTERS.b_mp_indigo.pos }
    local c = playing('Hearts', 3)
    c.back = 'selected_back'
    c.children.back = { set_sprite_pos = function(self, p) self.pos = p end }
    MP.content.decks.apply_back_sprite(c)
    expect(c.children.back.atlas.name).eq('mp_decks')
    expect(c.children.back.pos.x).eq(1)
  end)
end)

-- ── DK-08 Cocktail ──────────────────────────────────────────────────────────

describe('DK-08 Cocktail', function()
  after_each(CH.teardown)

  it('config strings round-trip; anything but the default counts as edited', function()
    setup()
    local K = MP.content.cocktail
    local cfg = K.parse('H|b_red=0|b_mp_oracle=2|bad=7')
    expect(cfg.show).eq(false)
    expect(cfg.decks).eq({ b_red = 0, b_mp_oracle = 2 })
    expect(K.encode(cfg)).eq('H|b_mp_oracle=2|b_red=0')
    expect(K.is_edited(K.parse('S'))).eq(false)
    expect(K.is_edited(K.parse('S|b_red=1'))).eq(false)
    expect(K.is_edited(cfg)).eq(true)
    expect(K.parse(nil).show).eq(true)
  end)

  it('the pool holds vanilla and MP decks but never Cocktail, White or the Challenge Deck (D-24)', function()
    setup()
    local keys = {}
    for _, c in ipairs(MP.content.cocktail.all_decks(true)) do keys[c.key] = true end
    expect(keys.b_red and keys.b_blue and keys.b_plasma and keys.b_mp_oracle and keys.b_mp_echodeck).truthy()
    expect(keys.b_mp_cocktail).eq(nil)
    expect(keys.b_challenge).eq(nil)
  end)

  it('picks 3 decks deterministically per seed: forced first (max 3), off decks never', function()
    setup()
    local K = MP.content.cocktail
    local cfg = K.parse('S|b_red=0|b_mp_oracle=2')
    G.GAME.pseudorandom.seed = 'SEEDA'
    local a = K.pick(cfg)
    fake.install()
    stubs()
    G.GAME.pseudorandom.seed = 'SEEDA'
    MP.registry.mount(H.resolved({ layers = { 'standard' } }), { options = H.options() })
    local b = K.pick(cfg)
    expect(a).eq(b)
    expect(#a).eq(3)
    expect(a[1]).eq('b_mp_oracle')
    for _, k in ipairs(a) do expect(k ~= 'b_red').truthy() end
    local four = K.parse('S|b_red=2|b_blue=2|b_plasma=2|b_mp_oracle=2')
    local p, st = K.pick(four)
    expect(p).eq({ 'b_red', 'b_blue', 'b_plasma' })
    expect(#st).eq(3)
    p, st = K.pick(K.parse('H'))
    expect(#p).eq(3)
    expect(#st).eq(0)
  end)

  it('applies each pick (vanilla through the original apply, MP through its own) and delegates triggers', function()
    setup()
    local K = MP.content.cocktail
    G.SETTINGS.rmh_mp_cocktail = K.encode({ show = true, decks = { b_plasma = 2, b_mp_indigo = 2, b_mp_oracle = 2 } })
    local back = { loc_name = 'Cocktail Deck' }
    local picks = K.apply(back)
    expect(picks).eq({ 'b_plasma', 'b_mp_indigo', 'b_mp_oracle' })
    expect(G.GAME.modifiers.mp_indigo).eq(true)
    expect(G.GAME.modifiers.oracle_max).eq(50)
    local applied = {}
    for _, c in ipairs(CH.called('back_apply')) do applied[c[2]] = true end
    expect(applied['Plasma Deck']).eq(true)
    expect(G.GAME.modifiers.mp_cocktail_edited).eq(true)
    expect(back.loc_name).eq('Cocktail Deck*')
    expect(#G.GAME.modifiers.mp_cocktail_sticker).eq(3)
    local c, m = K.trigger(nil, { context = 'final_scoring_step', chips = 10, mult = 30 })
    expect(c).eq(20); expect(m).eq(20)
    expect(K.trigger(nil, { context = 'eval' })).eq(nil)
  end)

  it('the editor click rules: toggle, shift forces (max 3), select all', function()
    setup()
    local E = MP.content.cocktail.editor
    local K = MP.content.cocktail
    local cfg = K.parse('S')
    E.cycle(cfg, 'b_red', false)
    expect(K.state_of(cfg, 'b_red')).eq(0)
    E.cycle(cfg, 'b_red', false)
    expect(K.state_of(cfg, 'b_red')).eq(1)
    expect(E.cycle(cfg, 'b_a', true)).eq(true)
    expect(E.cycle(cfg, 'b_b', true)).eq(true)
    expect(E.cycle(cfg, 'b_c', true)).eq(true)
    expect(E.cycle(cfg, 'b_d', true)).eq(false)
    expect(E.cycle(cfg, 'b_a', true)).eq(true)
    expect(K.state_of(cfg, 'b_a')).eq(1)
    E.select_all(cfg)
    expect(K.is_edited(cfg)).eq(false)
  end)
end)

-- ── challenges ──────────────────────────────────────────────────────────────

describe('CH-01..22 challenges', function()
  after_each(CH.teardown)

  local function ch(key)
    for _, c in ipairs(G.CHALLENGES) do if c.id == key then return c end end
  end

  it('registers all 22 with the c_mp_ prefix (EEEEE as c_mp_eeeee, D-22), only while mounted', function()
    setup()
    local CHL = MP.content.challenges
    expect(#CHL.KEYS).eq(22)
    local n = 0
    for _, c in ipairs(G.CHALLENGES) do if c.rmh_mp then n = n + 1 end end
    expect(n).eq(22)
    expect(ch('c_mp_eeeee') ~= nil).truthy()
    expect(ch('c_mp_mp_eeeee')).eq(nil)
    for _, key in ipairs(CHL.KEYS) do
      local c = ch(key)
      expect(c.rules ~= nil and c.restrictions ~= nil and c.deck ~= nil).truthy()
      for _, j in ipairs(c.jokers) do
        if j.id:sub(1, 5) == 'j_mp_' then expect(MP.registry.get(j.id) ~= nil).truthy() end
      end
    end
    MP.session.unmount('t')
    expect(ch('c_mp_eeeee')).eq(nil)
  end)

  it('is listed only with MP content, or when the lobby picked one', function()
    setup({ resolved = { layers = {}, multiplayerContent = false } })
    expect(ch('c_mp_speed')).eq(nil)
    CH.teardown()
    setup({ resolved = { layers = {}, multiplayerContent = false } })
    MP.session.unmount('t')
    MP = CH.boot(); stubs()
    MP.session.launcher = function() return true end
    MP.session.mount('match', { runId = 'r', me = 'u1', resolved = H.resolved({ layers = {}, multiplayerContent = false }),
      options = H.options(), challenge = 'c_mp_speed' })
    expect(ch('c_mp_speed') ~= nil).truthy()
  end)

  it('has the listed rules and restrictions', function()
    setup()
    expect(ch('c_mp_high_hand').rules.modifiers).eq({ { id = 'hands', value = 1 }, { id = 'hand_size', value = 26 },
      { id = 'discards', value = 0 } })
    expect(ch('c_mp_balancing_act').rules.custom[5]).eq({ id = 'mp_ante_scaling', value = 0.25 })
    expect(#ch('c_mp_misprint_deck').deck.cards).eq(52)
    expect(ch('c_mp_misprint_deck').deck.cards[52]).eq({ s = 'S', r = 'T' })
    expect(ch('c_mp_scratch').deck.cards).eq({ { s = 'C', r = '7', e = 'm_stone' } })
    expect(ch('c_mp_lets_go_gambling').deck.enhancement).eq('m_lucky')
    expect(ch('c_mp_in_the_red').restrictions.banned_tags).eq({ { id = 'tag_investment' } })
    expect(#ch('c_mp_oops_all_jokers').restrictions.banned_cards).eq(37)
    expect(ch('c_mp_salvaged_sibyl').consumeables).eq({ { id = 'c_medium' } })
    expect(ch('c_mp_vantablack').rules.modifiers[1]).eq({ id = 'joker_slots', value = 8 })
    local poly = ch('c_mp_polymorph_spam').restrictions.banned_cards
    local set = {}
    for _, b in ipairs(poly) do set[b.id] = true end
    expect(set.j_campfire and set.j_invisible and set.j_caino and set.j_yorick).truthy()
  end)

  it('applies rentals and per-challenge setup after start_run', function()
    setup()
    G.GAME.challenge = 'c_mp_chore_list'
    local a, b
    G.P_CENTERS.j_todo_list = { key = 'j_todo_list', set = 'Joker', rarity = 1, order = 70, name = 'To Do List', config = {} }
    a = new_card(nil, G.P_CENTERS.j_todo_list)
    b = new_card(nil, G.P_CENTERS.j_todo_list)
    G.jokers:emplace(a); G.jokers:emplace(b)
    MP.content.challenges.after_start()
    flush()
    expect(a.ability.rental).eq(true)
    expect(b.ability.rental).eq(true)
    G.GAME.challenge = 'c_mp_planet_tycoon'
    MP.content.challenges.after_start()
    expect(G.GAME.planet_rate).eq(360)
    G.GAME.challenge = 'c_mp_salvaged_sibyl'
    MP.content.challenges.after_start()
    expect(G.GAME.planet_rate).eq(0)
    G.GAME.challenge = 'c_mp_bacon'
    G.GAME.modifiers.booster_choice_mod = nil
    MP.content.challenges.after_start()
    expect(G.GAME.modifiers.booster_choice_mod).eq(1)
  end)

  it('puts the layer a challenge reuses into the chain (EEEEE, Balancing Act, Polymorph, Shared Pockets)', function()
    MP = CH.boot(); stubs()
    MP.session.launcher = function() return true end
    MP.session.mount('match', { runId = 'r', me = 'u1', resolved = H.resolved({ layers = { 'standard' } }),
      options = H.options(), challenge = 'c_mp_eeeee' })
    expect(MP.layer_active('eeeee')).eq(true)
    expect(MP.layer_active('polymorph_spam')).eq(false)
  end)

  it('Salvaged Sibyl: every Spectral is a Medium, every seal Purple', function()
    setup()
    G.GAME.modifiers.mp_only_medium = true
    G.GAME.banned_keys.c_medium = true
    local c = create_card('Spectral', G.consumeables)
    expect(c.config.center.key).eq('c_medium')
    G.GAME.modifiers.mp_only_purple_seals = true
    local p = playing('Hearts', 4)
    p:set_seal('Red')
    expect(p.seal).eq('Purple')
    p:set_seal(nil)
    expect(p.seal).eq(nil)
  end)

  it('challenge back art: Blue Ice, Salvaged Sibyl and Vantablack', function()
    setup()
    local D = MP.content.decks
    G.GAME.selected_back = { effect = { center = G.P_CENTERS.b_challenge } }
    G.GAME.challenge = 'c_mp_vantablack'
    expect(D.back_art(G.GAME.selected_back)).eq({ atlas = 'mp_decks', pos = { x = 3, y = 1 } })
    G.GAME.challenge = 'c_mp_bacon'
    expect(D.back_art(G.GAME.selected_back).pos).eq({ x = 1, y = 0 })
    G.GAME.challenge = 'c_mp_speed'
    expect(D.back_art(G.GAME.selected_back)).eq(nil)
  end)
end)
