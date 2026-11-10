-- rmh_mp/content/challenges.lua — the 22 MP challenges (CH-01…CH-22, A2 §12, D-22).
--
-- Each is a registry `Challenge` (vanilla G.CHALLENGES shape: rules.custom / rules.modifiers, jokers,
-- consumeables, vouchers, deck, restrictions) added to G.CHALLENGES only while a session is mounted
-- and listed when the ruleset has MP content, or when the lobby picked one (gate). Key = id =
-- `c_mp_<name>`; EEEEE is `c_mp_eeeee` (D-22: the mod's double prefix fixed). Names come from the
-- pack's challenge_names; rule lines from its v_text (`ch_c_<id>`).
--
-- What vanilla does not do, done here:
--   * `rental = true` on a challenge joker (vanilla only knows eternal/pinned/edition)
--   * back art for Blue Ice (Indigo), Salvaged Sibyl and Vantablack (deck art cells), drawn by
--     content/decks.lua (D.back_art reads def.back_art)
--   * `setup()` per challenge after Game:start_run (Blue Ice +1 pack pick, Planet Tycoon and
--     Salvaged Sibyl planet rates, Shared Pockets)
--   * challenges that reuse a layer's behaviour put that layer in the session's chain at mount:
--     Balancing Act -> score_instability (its `mp_ante_scaling` 0.25 is applied by WS6 post_start),
--     EEEEE -> eeeee, Polymorph Spam -> polymorph_spam, Shared Pockets -> shared_pockets
--   * Salvaged Sibyl: every Spectral created is a Medium; every seal set is Purple
--   * Polymorph Spam bans every joker that is not perishable-compatible plus Campfire, Invisible
--     Joker, Canio and Yorick (computed from the pools at mount)

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local C = require 'rmh_mp.content.jokers.core'

local CH = {}
MP.content.challenges = CH

local function g(name) return rawget(_G, name) end

local function bans(list)
  local out = {}
  for i, k in ipairs(list) do
    if type(k) == 'table' then out[i] = { id = k[1], ids = k[2] } else out[i] = { id = k } end
  end
  return out
end

local function custom(list)
  local out = {}
  for i, k in ipairs(list) do
    if type(k) == 'table' then out[i] = { id = k[1], value = k[2] } else out[i] = { id = k } end
  end
  return out
end

local CELESTIAL = { 'p_celestial_normal_1', { 'p_celestial_normal_2', 'p_celestial_normal_3', 'p_celestial_normal_4',
  'p_celestial_jumbo_1', 'p_celestial_jumbo_2', 'p_celestial_mega_1', 'p_celestial_mega_2' } }
local STANDARD = { 'p_standard_normal_1', { 'p_standard_normal_2', 'p_standard_normal_3', 'p_standard_normal_4',
  'p_standard_jumbo_1', 'p_standard_jumbo_2', 'p_standard_mega_1', 'p_standard_mega_2' } }
local ARCANA = { 'p_arcana_normal_1', { 'p_arcana_normal_2', 'p_arcana_normal_3', 'p_arcana_normal_4',
  'p_arcana_jumbo_1', 'p_arcana_jumbo_2', 'p_arcana_mega_1', 'p_arcana_mega_2' } }
local SPECTRAL = { 'p_spectral_normal_1', { 'p_spectral_normal_2', 'p_spectral_jumbo_1', 'p_spectral_mega_1' } }

local function deck_of(n, proto)
  local cards = {}
  for i = 1, n do cards[i] = MP.copy(proto) end
  return cards
end

CH.PLANET_TYCOON_RATE = 360
CH.POLYMORPH_EXTRA = { 'j_campfire', 'j_invisible', 'j_caino', 'j_yorick' }

-- name, challenge table, extras { back_art, layers, setup }
CH.LIST = {
  { 'all_must_go', { jokers = { { id = 'j_mp_taxes', eternal = true }, { id = 'j_campfire', eternal = true } } } },
  { 'bacon', {
    rules = { custom = custom({ 'mp_indigo' }) },
    restrictions = { banned_cards = bans({ CELESTIAL, STANDARD, ARCANA }) },
  }, { back_art = { atlas = 'mp_decks', pos = { x = 1, y = 0 } }, setup = function()
    local m = G.GAME.modifiers
    m.booster_choice_mod = (m.booster_choice_mod or 0) + 1
  end } },
  { 'balancing_act', {
    rules = { custom = custom({ 'mp_score_instability', 'mp_score_instability_EXAMPLE', 'mp_score_instability_LOC1',
      'mp_score_instability_LOC2', { 'mp_ante_scaling', 0.25 } }) },
  }, { layers = { 'score_instability' } } },
  { 'chore_list', {
    jokers = { { id = 'j_todo_list', eternal = true, rental = true, edition = 'negative' },
      { id = 'j_todo_list', eternal = true, rental = true, edition = 'negative' } },
    restrictions = { banned_cards = bans({ 'j_trading', 'j_midas_mask', 'j_golden', 'j_todo_list', 'j_rough_gem',
      'j_reserved_parking', 'j_to_the_moon', 'j_business', 'j_delayed_grat', 'j_satellite', 'j_egg', 'j_faceless',
      'j_mail', 'j_gift', 'j_riff_raff', 'j_chaos', 'j_mp_penny_pincher' }) },
  } },
  { 'divination', { jokers = { { id = 'j_vagabond', eternal = true } } } },
  { 'eeeee', { rules = { custom = custom({ 'mp_eeeee' }) } }, { layers = { 'eeeee' } } },
  { 'high_hand', {
    rules = { modifiers = { { id = 'hands', value = 1 }, { id = 'hand_size', value = 26 }, { id = 'discards', value = 0 } } },
    restrictions = { banned_cards = bans({ 'j_burglar' }) },
  } },
  { 'in_the_red', {
    rules = { custom = custom({ { 'no_reward_specific', 'Small' }, { 'no_reward_specific', 'Big' } }) },
    jokers = { { id = 'j_credit_card', eternal = true, edition = 'negative', rental = true } },
    restrictions = { banned_tags = bans({ 'tag_investment' }) },
  } },
  { 'legendaries', {
    rules = { modifiers = { { id = 'joker_slots', value = 6 } } },
    jokers = { { id = 'j_caino', eternal = true }, { id = 'j_perkeo', eternal = true }, { id = 'j_triboulet', eternal = true },
      { id = 'j_yorick', eternal = true }, { id = 'j_joker' } },
    restrictions = { banned_cards = bans({ 'j_selzer', 'j_dusk', 'j_sock_and_buskin', 'j_hanging_chad',
      'j_mp_hanging_chad', 'j_blueprint', 'j_brainstorm' }) },
  } },
  { 'lets_go_gambling', {
    rules = { custom = custom({ { 'no_reward_specific', 'Small' }, { 'no_reward_specific', 'Big' } }) },
    jokers = { { id = 'j_oops', eternal = true, rental = true },
      { id = 'j_mp_lets_go_gambling', eternal = true, edition = 'negative', rental = true } },
    restrictions = { banned_cards = bans({ 'j_selzer', 'j_dusk', 'j_hanging_chad', 'j_bloodstone', 'c_high_priestess',
      'c_empress', 'c_heirophant', 'c_chariot', 'c_justice', 'c_hermit', 'c_strength', 'c_hanged_man', 'c_death',
      'c_temperance', 'c_devil', 'c_tower', 'c_star', 'c_moon', 'c_sun', 'c_world' }) },
    deck = { type = 'Challenge Deck', enhancement = 'm_lucky' },
  } },
  { 'misprint_deck', { deck = { type = 'Challenge Deck', cards = deck_of(52, { s = 'S', r = 'T' }) } } },
  { 'oops_all_jokers', {
    jokers = { { id = 'j_ring_master', eternal = true, edition = 'negative' } },
    restrictions = {
      banned_cards = bans({ 'c_fool', 'c_magician', 'c_high_priestess', 'c_empress', 'c_emperor', 'c_heirophant',
        'c_lovers', 'c_chariot', 'c_justice', 'c_hermit', 'c_wheel_of_fortune', 'c_strength', 'c_hanged_man', 'c_death',
        'c_temperance', 'c_devil', 'c_tower', 'c_star', 'c_moon', 'c_sun', 'c_world', 'c_familiar', 'c_grim',
        'c_incantation', 'c_talisman', 'c_aura', 'c_sigil', 'c_ouija', 'c_ectoplasm', 'c_immolate', 'c_deja_vu', 'c_hex',
        'c_trance', 'c_medium', 'c_cryptid', 'c_black_hole', 'v_tarot_merchant' }),
      banned_tags = bans({ 'tag_charm' }),
    },
  } },
  { 'planet_tycoon', {
    rules = { custom = custom({ 'mp_shop_planets', 'mp_shop_planets_EXTENDED', 'mp_planet_tycoon_CREDITS' }) },
    restrictions = { banned_cards = bans({ { 'v_planet_merchant', { 'v_planet_tycoon' } } }) },
  }, { setup = function() G.GAME.planet_rate = CH.PLANET_TYCOON_RATE end } },
  { 'polymorph_spam', {
    rules = { custom = custom({ 'mp_polymorph_spam', 'mp_polymorph_spam_EXTENDED1', 'mp_polymorph_spam_EXTENDED2' }) },
    restrictions = { banned_cards = {} },
  }, { layers = { 'polymorph_spam' }, dynamic_bans = true } },
  { 'psychosis', { jokers = { { id = 'j_madness', eternal = true } } } },
  { 'salvaged_sibyl', {
    rules = { custom = custom({ 'mp_no_shop_planets', 'mp_only_medium', 'mp_only_purple_seals', 'mp_sibyl_CREDITS' }) },
    consumeables = { { id = 'c_medium' } },
    restrictions = { banned_cards = bans({ 'j_constellation', 'j_satellite', 'j_astronomer', 'c_high_priestess',
      { 'v_planet_merchant', { 'v_planet_tycoon' } }, { 'v_telescope', { 'v_observatory' } },
      { 'v_magic_trick', { 'v_illusion' } }, CELESTIAL, SPECTRAL, STANDARD }) },
  }, { back_art = { atlas = 'mp_decks', pos = { x = 3, y = 0 } }, setup = function() G.GAME.planet_rate = 0 end } },
  { 'scratch', {
    jokers = { { id = 'j_half' } },
    vouchers = { { id = 'v_magic_trick' } },
    deck = { type = 'Challenge Deck', cards = { { s = 'C', r = '7', e = 'm_stone' } } },
  } },
  { 'shared_pockets', {
    rules = { custom = custom({ 'mp_shared_pockets' }) },
    restrictions = { banned_cards = bans({ 'j_stencil' }) },
  }, { layers = { 'shared_pockets' }, setup = function() CH.start_shared_pockets() end } },
  { 'skip_off', { jokers = { { id = 'j_mp_skip_off', eternal = true }, { id = 'j_throwback', eternal = true } } } },
  { 'speed', { jokers = { { id = 'j_mp_conjoined_joker', eternal = true, edition = 'negative' },
    { id = 'j_mp_speedrun', eternal = true, edition = 'negative' } } } },
  { 'twin_towers', { jokers = { { id = 'j_obelisk', eternal = true }, { id = 'j_obelisk', eternal = true } } } },
  { 'vantablack', {
    rules = { custom = custom({ 'mp_vantablack_CREDITS' }),
      modifiers = { { id = 'joker_slots', value = 8 }, { id = 'hands', value = 1 } } },
  }, { back_art = { atlas = 'mp_decks', pos = { x = 3, y = 1 } } } },
}

CH.KEYS = {}
CH.BY_KEY = {}

local function gate_include(session, resolved)
  if resolved and resolved.multiplayerContent == true then return true end
  return session ~= nil and type(session.challenge) == 'string' and session.challenge:sub(1, 5) == 'c_mp_'
end

for _, e in ipairs(CH.LIST) do
  local key = 'c_mp_' .. e[1]
  local ch = MP.copy(e[2], true)
  ch.rules = ch.rules or {}
  ch.rules.custom = ch.rules.custom or {}
  ch.rules.modifiers = ch.rules.modifiers or {}
  ch.jokers = ch.jokers or {}
  ch.consumeables = ch.consumeables or {}
  ch.vouchers = ch.vouchers or {}
  ch.deck = ch.deck or { type = 'Challenge Deck' }
  ch.restrictions = ch.restrictions or {}
  ch.restrictions.banned_cards = ch.restrictions.banned_cards or {}
  ch.restrictions.banned_tags = ch.restrictions.banned_tags or {}
  ch.restrictions.banned_other = ch.restrictions.banned_other or {}
  ch.id = key
  local extra = e[3] or {}
  local def = R.define({
    key = key, kind = 'Challenge', challenge = ch, gate = { include = gate_include },
    back_art = extra.back_art, layers = extra.layers, setup = extra.setup, dynamic_bans = extra.dynamic_bans,
  })
  CH.KEYS[#CH.KEYS + 1] = key
  CH.BY_KEY[key] = def
end

-- ── helpers ─────────────────────────────────────────────────────────────────

--- Polymorph Spam: every joker that cannot be perishable, plus the listed four.
function CH.polymorph_bans()
  local out, seen = {}, {}
  for _, v in ipairs((G.P_CENTER_POOLS and G.P_CENTER_POOLS.Joker) or {}) do
    if v.key and v.perishable_compat == false and not seen[v.key] then
      seen[v.key] = true
      out[#out + 1] = { id = v.key }
    end
  end
  for _, k in ipairs(CH.POLYMORPH_EXTRA) do
    if not seen[k] then seen[k] = true; out[#out + 1] = { id = k } end
  end
  return out
end

function CH.start_shared_pockets()
  local misc = MP.misc
  if not (misc and misc.shared_pockets_start) then return end
  G.E_MANAGER:add_event(Event({ func = function()
    misc.shared_pockets_start()
    return true
  end }))
  if not CH.pockets_hooked then
    CH.pockets_hooked = true
    MP.net.add_frame_hook(function()
      if MP.in_session() and MP.layer_active('shared_pockets') and misc.shared_pockets_update then
        misc.shared_pockets_update()
      end
    end)
  end
end

--- The session's MP challenge def (from the lobby's pick, or the running game).
function CH.active()
  local key = (G.GAME and G.GAME.challenge) or (MP.state.session and MP.state.session.challenge)
  local def = key and CH.BY_KEY[key]
  return def
end

--- Rentals after vanilla has added the challenge jokers (their events run before this one).
function CH.apply_rentals(def)
  local want = {}
  for _, j in ipairs(def.challenge.jokers or {}) do
    if j.rental then want[#want + 1] = j.id end
  end
  if #want == 0 then return end
  G.E_MANAGER:add_event(Event({ func = function()
    local used = {}
    for _, id in ipairs(want) do
      for _, c in ipairs((G.jokers and G.jokers.cards) or {}) do
        if not used[c] and c.config.center.key == id then
          used[c] = true
          if c.set_rental then c:set_rental(true) end
          break
        end
      end
    end
    return true
  end }))
end

function CH.after_start()
  local key = G.GAME and G.GAME.challenge
  local def = key and CH.BY_KEY[key]
  if not def then return false end
  CH.apply_rentals(def)
  if def.setup then
    local ok, err = pcall(def.setup)
    if not ok then MP.log('error', 'challenge %s setup failed: %s', key, tostring(err)) end
  end
  return true
end

--- At mount: layers the session's challenge needs, and the computed bans.
function CH.on_mount()
  for _, def in pairs(CH.BY_KEY) do
    if def.dynamic_bans then
      local p = R.proto(def.key)
      if p then p.restrictions.banned_cards = CH.polymorph_bans() end
    end
  end
  local sess = MP.state.session
  local def = sess and sess.challenge and CH.BY_KEY[sess.challenge]
  if def and def.layers and sess.resolved then
    local r = sess.resolved
    if r == MP.EMPTY_RESOLVED then
      r = MP.copy(r, true)
      sess.resolved = r
    end
    r.layers = r.layers or {}
    local have = MP.set_of(r.layers)
    for _, l in ipairs(def.layers) do
      if not have[l] then r.layers[#r.layers + 1] = l end
    end
    r.__layer_set = nil
  end
end

function CH.install()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'content.challenges.' .. id } end
  CH.on_mount()

  if g('Game') then
    wrap(Game, 'start_run', function(orig, self, args, ...)
      local r = orig(self, args, ...)
      if not (args and args.savetext) then CH.after_start() end
      return r
    end, o('after_start'))
  end

  wrap(_G, 'create_card', function(orig, _type, area, legendary, rarity, skip, soulable, forced_key, key_append, ...)
    if _type == 'Spectral' and G.GAME and G.GAME.modifiers and G.GAME.modifiers.mp_only_medium then
      G.GAME.banned_keys.c_medium = nil
      forced_key = 'c_medium'
    end
    return orig(_type, area, legendary, rarity, skip, soulable, forced_key, key_append, ...)
  end, o('only_medium'))

  if g('Card') then
    wrap(Card, 'set_seal', function(orig, self, seal, ...)
      if seal and G.GAME and G.GAME.modifiers and G.GAME.modifiers.mp_only_purple_seals then seal = 'Purple' end
      return orig(self, seal, ...)
    end, o('only_purple'))
  end
end

C.add_installer(CH.install)

return CH
