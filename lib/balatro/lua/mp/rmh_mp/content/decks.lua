-- rmh_mp/content/decks.lua — the MP decks (DK-01…DK-07; Cocktail, DK-08, is content/cocktail.lua)
-- (A2 §6, D-24).
--
--   b_mp_violet      +1 Voucher in the shop; Vouchers 50% off in Ante 1, 30% off in Ante 2
--   b_mp_indigo      +1 pick in every booster; boosters are unskippable unless nothing in the pack
--                    can be used (the softlock guard); bans Red Card
--   b_mp_orange      2 x The Hanged Man; opens a free Giga Standard Pack before the first blind
--   b_mp_oracle      Medium + Clearance Sale; money capped at $50 + the interest cap ("MAX" alert)
--   b_mp_gradient    cards also count one rank higher or lower for joker effects (+1, 0, -1 in that
--                    order; the first variant that triggers wins; Ace wraps to 2 and back except for
--                    Raised Fist); 10s and Aces are also face cards; Cloud 9 counts 8, 9 and 10;
--                    Photograph, Faceless and Ramen are left alone; 8 Ball, Hit the Road, Business,
--                    Reserved Parking and Bloodstone stop at the first variant whose rank/suit
--                    condition holds, so their rolls are not repeated
--   b_mp_heidelberg  at the end of every shop a Negative copy of 1 random consumable ('mp_heidelberg')
--   b_mp_echodeck    every played card retriggers, held cards with an effect retrigger; X1.2 base
--                    blind size, +X0.2 after every Boss
--
-- Every deck turns a G.GAME.modifiers flag on in `apply`; the session wraps act on the flags, so the
-- same behaviour works when Cocktail mixes the deck in. Card backs: playing cards of an MP deck (and
-- of an MP challenge with its own back art) draw from the MP atlas (vanilla always uses `centers`).
-- The Balanced sticker is drawn on MP decks shown face-down in the deck picker (D-24):
-- D.draw_balanced(card) is called from the session Card.draw wrap and can be called by WS10's picker.

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local C = require 'rmh_mp.content.jokers.core'

local D = {}
MP.content.decks = D

local function g(name) return rawget(_G, name) end
local function mods() return (G.GAME and G.GAME.modifiers) or {} end

D.KEYS = { 'b_mp_violet', 'b_mp_indigo', 'b_mp_orange', 'b_mp_oracle', 'b_mp_gradient', 'b_mp_heidelberg',
  'b_mp_echodeck' }
D.ORACLE_MAX = 50
D.VIOLET_DISCOUNT = { [1] = 0.5, [2] = 0.7 }
D.ECHO_SCALING = 1.2
D.ECHO_STEP = 0.2

-- ── definitions ─────────────────────────────────────────────────────────────

R.define({
  key = 'b_mp_violet', kind = 'Back', atlas = 'mp_decks', pos = { x = 0, y = 0 }, config = {}, balanced = true,
  apply = function() G.GAME.modifiers.mp_violet = true end,
})

R.define({
  key = 'b_mp_indigo', kind = 'Back', atlas = 'mp_decks', pos = { x = 1, y = 0 }, config = {}, balanced = true,
  apply = function()
    local m = G.GAME.modifiers
    m.mp_indigo = true
    m.booster_choice_mod = (m.booster_choice_mod or 0) + 1
    G.GAME.banned_keys.j_red_card = true
  end,
})

R.define({
  key = 'b_mp_orange', kind = 'Back', atlas = 'mp_decks', pos = { x = 2, y = 0 }, balanced = true,
  config = { consumables = { 'c_hanged_man', 'c_hanged_man' } },
  apply = function() D.orange_open() end,
})

R.define({
  key = 'b_mp_oracle', kind = 'Back', atlas = 'mp_decks', pos = { x = 1, y = 1 }, balanced = true,
  config = { vouchers = { 'v_clearance_sale' }, consumables = { 'c_medium' } },
  apply = function() G.GAME.modifiers.oracle_max = D.ORACLE_MAX end,
})

R.define({
  key = 'b_mp_gradient', kind = 'Back', atlas = 'mp_decks', pos = { x = 0, y = 1 }, config = {}, balanced = true,
  apply = function() G.GAME.modifiers.mp_gradient = true end,
})

R.define({
  key = 'b_mp_heidelberg', kind = 'Back', atlas = 'mp_b_heidelberg', pos = { x = 0, y = 0 }, config = {}, balanced = true,
  apply = function() G.GAME.modifiers.mp_heidelberg = true end,
})

R.define({
  key = 'b_mp_echodeck', kind = 'Back', atlas = 'mp_misc', pos = { x = 0, y = 0 }, config = {}, balanced = true,
  loc = { name = 'Echo Deck', text = { '{C:attention}Retrigger{} all playing cards', '{C:red}X1.2{} base Blind size',
    'Increases by {C:red}X0.2{} each Ante' } },
  apply = function()
    G.GAME.modifiers.mp_echo = true
    G.GAME.starting_params.ante_scaling = D.ECHO_SCALING
  end,
  trigger = function(_, args)
    if args and args.context == 'eval' then D.echo_after_round() end
  end,
})

-- ── Echo ────────────────────────────────────────────────────────────────────

function D.echo_after_round()
  if not mods().mp_echo then return end
  local last = G.GAME.last_blind
  if last and last.boss then
    G.GAME.starting_params.ante_scaling = (G.GAME.starting_params.ante_scaling or 1) + D.ECHO_STEP
  end
end

-- ── Orange ──────────────────────────────────────────────────────────────────

D.ORANGE_LOCK = 'mp_orange_giga'

function D.orange_open()
  if not (G.E_MANAGER and g('Event')) then return end
  if G.CONTROLLER and G.CONTROLLER.locks then G.CONTROLLER.locks[D.ORANGE_LOCK] = true end
  local tries = 0
  G.E_MANAGER:add_event(Event({ trigger = 'condition', blocking = false, blockable = false, func = function()
    tries = tries + 1
    local ready = G.STATE == G.STATES.BLIND_SELECT and G.blind_select ~= nil and G.play ~= nil
    if not ready and tries < 36000 then return false end
    if G.CONTROLLER and G.CONTROLLER.locks then G.CONTROLLER.locks[D.ORANGE_LOCK] = nil end
    if ready and MP.content.boosters then MP.content.boosters.open_free(MP.content.boosters.GIGA) end
    return true
  end }))
end

-- ── Violet ──────────────────────────────────────────────────────────────────

function D.violet_cost(card)
  local f = D.VIOLET_DISCOUNT[G.GAME.round_resets and G.GAME.round_resets.ante or 0]
  if not f then return nil end
  local disc = G.GAME.discount_percent or 0
  return math.max(1, math.floor(f * ((card.base_cost or 0) + (card.extra_cost or 0) + 0.5) * (100 - disc) / 100))
end

--- The second voucher of the ante (rolled once per ante, kept until bought).
function D.violet_fill()
  local area = G.shop_vouchers
  if not (area and mods().mp_violet) then return false end
  local ante = G.GAME.round_resets.ante
  local st = G.GAME.mp_violet_voucher
  if not st or st.ante ~= ante then
    st = { ante = ante }
    G.GAME.mp_violet_voucher = st
  end
  if st.key and G.GAME.used_vouchers[st.key] then return false end
  for _, c in ipairs(area.cards) do
    if st.key and c.config.center.key == st.key then return false end
  end
  if not st.key then
    if not g('get_next_voucher_key') then return false end
    st.key = get_next_voucher_key(true)
  end
  local center = st.key and G.P_CENTERS[st.key]
  if not center or G.GAME.used_vouchers[st.key] then return false end
  local card = Card(area.T.x + area.T.w / 2, area.T.y, G.CARD_W, G.CARD_H, G.P_CARDS.empty, center,
    { bypass_discovery_center = true, bypass_discovery_ui = true })
  card.mp_violet_voucher = true
  if g('create_shop_card_ui') then create_shop_card_ui(card, 'Voucher', area) end
  if card.start_materialize then card:start_materialize() end
  area.config.card_limit = (area.config.card_limit or 1) + 1
  area:emplace(card)
  return true
end

-- ── Indigo softlock guard ───────────────────────────────────────────────────

local function joker_room(card)
  if card.edition and card.edition.negative then return true end
  local limit = G.jokers.config.card_limit
  local stuck = 0
  for _, j in ipairs(G.jokers.cards) do
    if j.edition and j.edition.negative then
      limit = limit - 1
    elseif j.ability.eternal then
      stuck = stuck + 1
    else
      return true -- a sellable joker frees a slot
    end
  end
  return stuck < limit
end

local HAND_SPECTRALS = { c_familiar = true, c_grim = true, c_incantation = true, c_immolate = true, c_sigil = true,
  c_ouija = true, c_mp_ouija_standard = true }

--- Can this pack card be taken (A2 §6 Indigo: per-set usability)?
function D.pack_card_usable(card)
  local center = card.config and card.config.center or {}
  local key, set = center.key, center.set
  local cons = card.ability and card.ability.consumeable
  if card.ability and card.ability.mp_illusion_fake then return false end
  if set == 'Enhanced' or set == 'Default' or set == 'Planet' then return true end
  if set == 'Joker' then return joker_room(card) end
  if set == 'Trap' then return true end
  local hand = #((G.hand and G.hand.cards) or {})
  if set == 'Tarot' then
    if key == 'c_fool' then return G.GAME.last_tarot_planet ~= nil and G.GAME.last_tarot_planet ~= 'c_fool' end
    if key == 'c_judgement' then return joker_room(card) end
    if key == 'c_wheel_of_fortune' then return card.eligible_strength_jokers ~= nil and next(card.eligible_strength_jokers) ~= nil end
    if type(cons) == 'table' and cons.max_highlighted then return hand >= (cons.min_highlighted or 1) end
    return true
  end
  if set == 'Spectral' then
    if HAND_SPECTRALS[key] then return hand > 1 end
    if key == 'c_aura' then
      for _, c in ipairs((G.hand and G.hand.cards) or {}) do if not c.edition then return true end end
      return false
    end
    if key == 'c_ectoplasm' or key == 'c_hex' or key == 'c_mp_ectoplasm_sandbox' then
      return card.eligible_editionless_jokers ~= nil and next(card.eligible_editionless_jokers) ~= nil
    end
    if key == 'c_wraith' or key == 'c_soul' or key == 'c_mp_wraith' then return joker_room(card) end
    if key == 'c_ankh' then return G.jokers.cards[1] ~= nil and joker_room(card) end
    if type(cons) == 'table' and cons.max_highlighted then return hand >= (cons.min_highlighted or 1) end
    return true
  end
  return true
end

--- True when nothing in the open pack can be used (Skip must stay available).
function D.pack_softlocked()
  for _, c in ipairs((G.pack_cards and G.pack_cards.cards) or {}) do
    if D.pack_card_usable(c) then return false end
  end
  return true
end

-- ── Oracle ──────────────────────────────────────────────────────────────────

function D.oracle_cap()
  local m = mods().oracle_max
  if not m then return nil end
  return m + (G.GAME.interest_cap or 25)
end

function D.max_alert()
  if not (g('attention_text') and G.HUD) then return end
  G.E_MANAGER:add_event(Event({ func = function()
    local ui = G.HUD:get_UIE_by_ID('dollar_text_UI')
    if ui then
      attention_text({ text = 'MAX', scale = 0.8, hold = 0.7, cover = ui.parent, cover_colour = G.C.RED, align = 'cm' })
    end
    C.sound('timpani', 0.9, 0.7)
    C.sound('timpani', 1.2, 0.7)
    return true
  end }))
end

--- The capped gain (nil = blocked, show MAX).
function D.oracle_gain(mod)
  local cap = D.oracle_cap()
  if not cap or type(mod) ~= 'number' or mod <= 0 then return mod end
  local room = cap - (G.GAME.dollars or 0)
  if room <= 0 then return nil end
  return math.min(mod, room)
end

-- ── Gradient ────────────────────────────────────────────────────────────────

D.GRADIENT_SKIP = { j_photograph = true, j_faceless = true, j_ramen = true }
D.GRADIENT_ALWAYS = { j_superposition = true, j_sixth_sense = true }
D.GRADIENT_DELTAS = { 1, 0, -1 }

local function rank_is(ids) return function(c) local id = c:get_id(); for _, v in ipairs(ids) do if id == v then return true end end end end
D.GRADIENT_VALID = {
  j_8_ball = rank_is({ 8 }), j_hit_the_road = rank_is({ 11 }),
  j_business = function(c) return c:is_face() end, j_reserved_parking = function(c) return c:is_face() end,
  j_bloodstone = function(c) return c:is_suit('Hearts') end, j_mp_bloodstone = function(c) return c:is_suit('Hearts') end,
}

--- Blueprint / Brainstorm resolve to the joker they copy.
function D.effective_key(joker)
  local cards = (G.jokers and G.jokers.cards) or {}
  local key = joker.config.center.key
  local pos = 0
  for i, v in ipairs(cards) do if v == joker then pos = i end end
  local hops = 0
  while (key == 'j_blueprint' or key == 'j_brainstorm') and hops <= #cards do
    if key == 'j_blueprint' then
      pos = pos + 1
      key = cards[pos] and cards[pos].config.center.key or 'none'
    else
      pos = 1
      key = cards[1] and cards[1].config.center.key or 'none'
    end
    hops = hops + 1
  end
  return key
end

D.shifting = false

local function shift_all(delta, raised_fist)
  local saved = {}
  for _, c in ipairs(G.playing_cards or {}) do
    local base = c.base
    if base and base.id then
      saved[#saved + 1] = { c, base.id }
      local id = base.id + delta
      if not raised_fist then
        if id == 15 then id = 2 elseif id == 1 then id = 14 end
      end
      base.id = id
    end
  end
  return saved
end
local function unshift(saved) for i = #saved, 1, -1 do saved[i][1].base.id = saved[i][2] end end

function D.gradient_calc(orig, self, ctx, ...)
  local key = D.effective_key(self)
  if D.GRADIENT_SKIP[key] then return orig(self, ctx, ...) end
  local valid = D.GRADIENT_VALID[key]
  local raised = key == 'j_raised_fist'
  local first_ret, first_post
  for i, delta in ipairs(D.GRADIENT_DELTAS) do
    local saved = shift_all(delta, raised)
    D.shifting = true
    local ok, r, post = pcall(orig, self, ctx, ...)
    local stop = ok and (r or post or (valid and ctx.other_card and ctx.other_card.base and valid(ctx.other_card)))
    D.shifting = false
    unshift(saved)
    if not ok then error(r, 0) end
    if stop then return r, post end
    if delta == 0 then first_ret, first_post = r, post end
    if i == #D.GRADIENT_DELTAS then return first_ret, first_post end
  end
end

-- ── Heidelberg ──────────────────────────────────────────────────────────────

function D.heidelberg_copy()
  if not (mods().mp_heidelberg and G.consumeables) then return false end
  local pool = {}
  for _, c in ipairs(G.consumeables.cards) do
    local ab = c.ability or {}
    if not ab.mp_trap_hidden and not ab.mp_trap_fired then pool[#pool + 1] = c end
  end
  if #pool == 0 then return false end
  G.E_MANAGER:add_event(Event({ func = function()
    local src = pseudorandom_element(pool, pseudoseed('mp_heidelberg'))
    if src and g('copy_card') then
      local card = copy_card(src)
      card:set_edition({ negative = true }, true)
      card:add_to_deck()
      G.consumeables:emplace(card)
      C.status(card, C.loc('k_duplicated_ex', 'Duplicated!'), G.C.DARK_EDITION)
    end
    return true
  end }))
  return true
end

-- ── card backs (MP atlases) ─────────────────────────────────────────────────

--- { atlas, pos } for the back a playing card shows, or nil for vanilla art.
function D.back_art(back)
  if not back then return nil end
  if back == G.GAME.selected_back and G.GAME.challenge then
    local def = R.get(G.GAME.challenge)
    if def and def.back_art then return def.back_art end
  end
  local center = back.effect and back.effect.center
  if center and center.rmh_mp and center.atlas and center.set == 'Back' then
    return { atlas = center.atlas, pos = center.pos }
  end
  return nil
end

function D.apply_back_sprite(card)
  local sprite = card.children and card.children.back
  if not (sprite and card.playing_card and card.back) then return end
  local art = D.back_art(G.GAME[card.back])
  local atlas = art and G.ASSET_ATLAS and G.ASSET_ATLAS[art.atlas]
  if atlas and sprite.set_sprite_pos then
    sprite.atlas = atlas
    sprite:set_sprite_pos(art.pos)
  end
end

local balanced_sprite = nil
--- D-24: the Balanced sticker on an MP deck shown face-down (deck picker, main menu stage).
function D.draw_balanced(card, center)
  center = center or (G.GAME.viewed_back and G.GAME.viewed_back.effect and G.GAME.viewed_back.effect.center)
  if not (center and center.rmh_mp and center.set == 'Back' and center.config and center.config.mp_balanced) then return end
  if card.sprite_facing ~= 'back' or not (card.children and card.children.back) then return end
  local atlas = G.ASSET_ATLAS and G.ASSET_ATLAS.mp_sticker_balanced
  if not (atlas and g('Sprite')) then return end
  if not balanced_sprite or balanced_sprite.atlas ~= atlas then
    balanced_sprite = Sprite(0, 0, G.CARD_W, G.CARD_H, atlas, { x = 0, y = 0 })
  end
  balanced_sprite.role.draw_major = card
  balanced_sprite:draw_shader('dissolve', nil, nil, true, card.children.back)
  balanced_sprite:draw_shader('voucher', nil, card.ARGS and card.ARGS.send_to_shader, true, card.children.back)
end

-- ── session wraps ───────────────────────────────────────────────────────────

function D.install()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'content.decks.' .. id } end
  balanced_sprite = nil

  if g('Card') then
    wrap(Card, 'set_sprites', function(orig, self, ...)
      local r = orig(self, ...)
      if self.playing_card then D.apply_back_sprite(self) end
      return r
    end, o('back_art'))

    if Card.draw then
      wrap(Card, 'draw', function(orig, self, layer, ...)
        local r = orig(self, layer, ...)
        if self.sprite_facing == 'back' and G.STAGE == (G.STAGES and G.STAGES.MAIN_MENU) and self.back == 'viewed_back' then
          D.draw_balanced(self)
        end
        return r
      end, o('balanced_back'))
    end

    wrap(Card, 'set_cost', function(orig, self, ...)
      local r = orig(self, ...)
      if mods().mp_violet and self.ability and self.ability.set == 'Voucher' then
        local c = D.violet_cost(self)
        if c then self.cost = c end
      end
      return r
    end, o('violet_cost'))

    wrap(Card, 'calculate_joker', function(orig, self, ctx, ...)
      if mods().mp_gradient and ctx and not ctx.blueprint and not D.shifting and self.ability
        and self.ability.set == 'Joker' and (ctx.other_card or D.GRADIENT_ALWAYS[D.effective_key(self)]) then
        return D.gradient_calc(orig, self, ctx, ...)
      end
      return orig(self, ctx, ...)
    end, o('gradient'))

    wrap(Card, 'is_face', function(orig, self, from_boss, ...)
      local r = orig(self, from_boss, ...)
      if not r and mods().mp_gradient and not D.shifting and not (self.debuff and not from_boss) then
        local id = self:get_id()
        if id == 10 or id == 14 then return true end
      end
      return r
    end, o('gradient_face'))

    wrap(Card, 'calculate_dollar_bonus', function(orig, self, ...)
      if mods().mp_gradient and self.ability and self.ability.name == 'Cloud 9' then
        local n = 0
        for _, c in ipairs(G.playing_cards or {}) do
          local id = c:get_id()
          if id == 8 or id == 9 or id == 10 then n = n + 1 end
        end
        self.ability.nine_tally = n
      end
      return orig(self, ...)
    end, o('gradient_cloud9'))

    wrap(Card, 'calculate_seal', function(orig, self, ctx, ...)
      local r = orig(self, ctx, ...)
      if mods().mp_echo and ctx and ctx.repetition and not self.debuff
        and (ctx.cardarea == G.play or ctx.cardarea == G.hand) then
        local reps = (type(r) == 'table' and r.repetitions or 0) + 1
        return { message = C.loc('k_again_ex', 'Again!'), repetitions = reps, card = self }
      end
      return r
    end, o('echo'))
  end

  wrap(_G, 'ease_dollars', function(orig, mod, instant, ...)
    if D.oracle_cap() and type(mod) == 'number' and mod > 0 then
      local capped = D.oracle_gain(mod)
      if capped == nil then
        D.max_alert()
        return
      end
      mod = capped
    end
    return orig(mod, instant, ...)
  end, o('oracle'))

  if G.FUNCS then
    wrap(G.FUNCS, 'toggle_shop', function(orig, e, ...)
      if G.shop then D.heidelberg_copy() end
      return orig(e, ...)
    end, o('heidelberg'))
  end

  if g('Game') then
    wrap(Game, 'update_shop', function(orig, self, dt, ...)
      local fresh = not G.STATE_COMPLETE
      local r = orig(self, dt, ...)
      if fresh and mods().mp_violet then
        local waited = 0
        G.E_MANAGER:add_event(Event({ trigger = 'condition', blocking = false, blockable = false, func = function()
          waited = waited + 1
          if not G.shop or waited > 6000 then return true end
          if not G.shop_vouchers or G.load_shop_vouchers then return false end
          if G.GAME.current_round.voucher and not G.shop_vouchers.cards[1] then return false end
          D.violet_fill()
          return true
        end }))
      end
      return r
    end, o('violet_voucher'))
  end
end

C.add_installer(D.install)

return D
