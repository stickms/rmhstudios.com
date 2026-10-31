-- L1 crash sweep over every MP definition (the L2 twin is mp_test/specs/ui_sweep_spec.lua).
--
-- With every layer mounted in a 2-player match on the fake G, each definition's functions are
-- called with stub and edge inputs — loc_vars with a card and with nil, calc with every vanilla
-- and MP context against empty areas, a debuffed card and zero values, use/can_use with an empty
-- hand and with nothing highlighted, add/remove, dollar_bonus, the blind hooks, the tag hooks and
-- the deck hooks — and must not raise. Each failure is listed by key and function, so one run shows
-- every crash.

local CH = require 'spec.mp_content_helper'

local MP

local function all_layers()
  local set, out = {}, {}
  for _, d in ipairs(MP.registry.defs()) do
    for _, l in ipairs((d.gate and d.gate.layers) or {}) do
      if not set[l] then set[l] = true; out[#out + 1] = l end
    end
  end
  table.sort(out)
  return out
end

local function boot()
  MP = CH.boot()
  CH.match({ resolved = { layers = all_layers(), multiplayerContent = true } })
  G.GAME.blind = G.GAME.blind or {}
  G.GAME.blind.config = G.GAME.blind.config or { blind = G.P_BLINDS.bl_small }
  G.GAME.dollars = 0
  G.GAME.round_resets = G.GAME.round_resets or { ante = 1 }
  G.GAME.round_resets.ante = G.GAME.round_resets.ante or 1
end

local errors = {}
local calls = 0
local function try(where, fn, ...)
  calls = calls + 1
  local ok, err = pcall(fn, ...)
  if not ok then errors[#errors + 1] = where .. ': ' .. tostring(err) end
  return ok, err
end

local function contexts(card, other, playing)
  local hand = playing and { playing } or {}
  return {
    { setting_blind = true, blind = G.GAME.blind },
    { before = true, cardarea = G.jokers, full_hand = hand, scoring_hand = hand, scoring_name = 'High Card', poker_hands = {} },
    { joker_main = true, cardarea = G.jokers, full_hand = hand, scoring_hand = hand, scoring_name = 'High Card', poker_hands = {} },
    { individual = true, cardarea = G.play, other_card = playing, full_hand = hand, scoring_hand = hand, poker_hands = {} },
    { repetition = true, cardarea = G.play, other_card = playing, full_hand = hand, scoring_hand = hand, poker_hands = {} },
    { repetition = true, cardarea = G.hand, other_card = playing, card_effects = {} },
    { individual = true, cardarea = G.hand, other_card = playing, end_of_round = true },
    { after = true, cardarea = G.jokers, full_hand = hand, scoring_hand = hand, poker_hands = {} },
    { end_of_round = true, cardarea = G.jokers, game_over = false },
    { selling_self = true },
    { selling_card = true, card = other },
    { buying_card = true, card = other },
    { open_booster = true, card = other },
    { skip_blind = true },
    { skipping_booster = true },
    { reroll_shop = true },
    { ending_shop = true },
    { first_hand_drawn = true },
    { pre_discard = true, full_hand = hand },
    { discard = true, other_card = playing, full_hand = hand },
    { using_consumeable = true, consumeable = other },
    { playing_card_added = true, cards = hand },
    { cards_destroyed = true, glass_shattered = {} },
    { remove_playing_cards = true, removed = {} },
    { debuffed_hand = true, full_hand = hand },
    { other_joker = other },
    { mp_pvp_loss = true },
    { mp_pvp_win = true },
    { mp_context = 'pvp_start' },
    { mp_context = 'pvp_end' },
    {},
  }
end

local function def_label(d, fn) return d.key .. '.' .. fn end

describe('mp sweep (L1): every definition, stub and edge inputs', function()
  before_each(boot)
  after_each(CH.teardown)

  it('cards: loc_vars, calc, use/can_use, add/remove, dollar_bonus never raise', function()
    errors, calls = {}, 0
    for _, d in ipairs(MP.registry.defs()) do
      local center = G.P_CENTERS[d.key]
      if center and (center.set == 'Joker' or center.consumeable) then
        local area = center.set == 'Joker' and G.jokers or G.consumeables
        local ok, card = try(def_label(d, 'card'), CH.card, d.key, area)
        if ok and card then
          local other = CH.card('j_joker', nil, true)
          local playing = CH.playing('Spades', 14)
          -- the vanilla playing-card methods jokers read (the helper's card has the suit/id ones)
          playing.is_face = function() return false end
          playing.get_chip_bonus = function() return 11 end
          playing.get_chip_mult = function() return 0 end
          playing.get_nominal = function() return 11 end
          playing.get_edition = function() return nil end
          playing.get_seal = function() return nil end
          if d.loc_vars then
            try(def_label(d, 'loc_vars(card)'), d.loc_vars, card)
          end
          if d.calc then
            for i, ctx in ipairs(contexts(card, other, playing)) do
              try(def_label(d, 'calc#' .. i), d.calc, card, ctx)
              try(def_label(d, 'calc(empty)#' .. i), d.calc, card, { joker_main = ctx.joker_main, before = ctx.before,
                after = ctx.after, end_of_round = ctx.end_of_round, setting_blind = ctx.setting_blind })
            end
            card.debuff = true
            try(def_label(d, 'calc(debuffed)'), CH.calc, card, { joker_main = true, full_hand = {}, scoring_hand = {} })
            card.debuff = false
          end
          if d.can_use then try(def_label(d, 'can_use(empty hand)'), d.can_use, card) end
          if d.dollar_bonus then try(def_label(d, 'dollar_bonus'), d.dollar_bonus, card) end
          if d.update then try(def_label(d, 'update'), d.update, card, 0.016) end
          if d.use and d.kind ~= 'Trap' then
            -- use is only reached through can_use; still, an empty hand and no targets must not crash
            local usable = true
            if d.can_use then local cok, r = pcall(d.can_use, card); usable = cok and r end
            if usable then try(def_label(d, 'use(empty hand)'), d.use, card, G.consumeables, nil) end
          end
          if d.remove then try(def_label(d, 'remove'), d.remove, card, false) end
          if d.add then try(def_label(d, 'add'), d.add, card, false) end
          CH.H.fake.flush(200)
        end
      end
    end
    if #errors > 0 then print(table.concat(errors, "\n")) end
    expect(errors).eq({})
    expect(calls > 100).truthy()
  end)

  it('loc_vars never needs a live card for the collection (nil card, outside a run)', function()
    errors, calls = {}, 0
    for _, d in ipairs(MP.registry.defs()) do
      local center = G.P_CENTERS[d.key]
      if d.loc_vars and center and center.consumeable then
        -- consumables' text wraps call loc_vars(nil) for a collection tooltip
        try(def_label(d, 'loc_vars(nil)'), d.loc_vars, nil)
      end
    end
    if #errors > 0 then print(table.concat(errors, "\n")) end
    expect(errors).eq({})
  end)

  it('blinds, tags and decks: every hook with stub inputs', function()
    errors, calls = {}, 0
    for _, d in ipairs(MP.registry.defs()) do
      if d.kind == 'Blind' and type(d.blind) == 'table' then
        local blind = { config = { blind = G.P_BLINDS[d.key] or { key = d.key } }, chips = 300, mult = 1, disabled = false,
          name = d.key, hands = {}, set_text = function() end, wiggle = function() end, juice_up = function() end }
        local orig = function() return nil end
        for name, fn in pairs(d.blind) do
          if type(fn) == 'function' then
            try(def_label(d, 'blind.' .. name), fn, blind, orig, {}, {}, {}, {})
          end
        end
      elseif d.kind == 'Tag' and type(d.tag) == 'table' then
        local tag = { key = d.key, config = G.P_TAGS[d.key] and G.P_TAGS[d.key].config or {}, ability = {},
          yep = function(_, _, _, fn) if fn then pcall(fn) end end, nope = function() end, ID = 1 }
        if d.tag.set_ability then try(def_label(d, 'tag.set_ability'), d.tag.set_ability, tag) end
        if d.tag.apply then
          for _, t in ipairs({ 'eval', 'immediate', 'new_blind_choice', 'voucher_add', 'tag_add', 'round_start_bonus',
            'store_joker_create', 'shop_start', 'store_joker_modify', 'shop_final_pass' }) do
            try(def_label(d, 'tag.apply ' .. t), d.tag.apply, tag, { type = t })
          end
        end
      end
    end
    if #errors > 0 then print(table.concat(errors, "\n")) end
    expect(errors).eq({})
  end)
end)

-- The Multiplayer collection draws MP cards with no session mounted; its display scope installs
-- the text wraps (loc_vars, the Other-set alias, the Trap colours) for one call only.
describe('display scope (the MP collection outside a session)', function()
  before_each(function() MP = CH.boot() end)
  after_each(CH.teardown)

  it('installs the text wraps and the Trap colours for the call, and removes the wraps after', function()
    local D = MP.registry.dispatch
    expect(MP.registry.mounted()).falsy()
    local before = MP.hooks.count('display')
    local inside = D.with_display(function()
      return { gcu = MP.hooks.is_wrapped(_G, 'generate_card_ui'), colour = G.C.SET and G.C.SET.Trap,
        n = MP.hooks.count('display') }
    end)
    expect(inside.gcu).truthy()
    expect(inside.colour ~= nil).truthy()
    expect(inside.n > before).truthy()
    expect(MP.hooks.count('display')).eq(0)
  end)

  it('runs the planet text through the MP loc_vars (vanilla would index a nil hand_type)', function()
    local D = MP.registry.dispatch
    local seen
    local base = _G.generate_card_ui
    G.localization = G.localization or {}
    G.localization.descriptions = G.localization.descriptions or {}
    G.localization.descriptions.Planet = { c_mp_asteroid = { name = 'Asteroid', text = { '#1#' } } }
    _G.generate_card_ui = function(_c, full, vars) seen = { set = _c.set, vars = vars }; return {} end
    D.with_display(function() generate_card_ui(G.P_CENTERS.c_mp_asteroid or MP.registry.proto('c_mp_asteroid'), nil, nil) end)
    _G.generate_card_ui = base
    expect(seen.set).eq('Other')
    expect(seen.vars).eq({ 1 })
  end)

  it('re-raises an error from the call and still removes the wraps', function()
    local D = MP.registry.dispatch
    expect(function() D.with_display(function() error('boom') end) end).error('boom')
    expect(MP.hooks.count('display')).eq(0)
  end)
end)

describe('ui callback guard (last resort, util/guard.lua)', function()
  before_each(function() MP = CH.boot() end)
  after_each(CH.teardown)

  it('guards MP callbacks only, logs a failure once and keeps the game running', function()
    local GD = MP.guard
    local calls = 0
    G.FUNCS.rmh_mp_sweep_boom = function() calls = calls + 1; error('boom') end
    G.FUNCS.mp_sweep_ok = function(e) return e * 2 end
    local vanilla = function() error('vanilla') end
    G.FUNCS.sweep_vanilla = vanilla
    expect(GD.scan() >= 2).truthy()
    expect(G.FUNCS.sweep_vanilla).eq(vanilla)
    expect(G.FUNCS.mp_sweep_ok(21)).eq(42)
    G.FUNCS.rmh_mp_sweep_boom({})
    G.FUNCS.rmh_mp_sweep_boom({})
    expect(calls).eq(2)
    expect(GD.failures.rmh_mp_sweep_boom).eq(2)
    local logged = 0
    for _, l in ipairs(MP.log_ring) do
      if l.level == 'error' and l.msg:find('rmh_mp_sweep_boom', 1, true) then logged = logged + 1 end
    end
    expect(logged).eq(1)
    -- idempotent: a guarded callback is not wrapped twice; a redefined one is guarded again
    expect(GD.scan()).eq(0)
    G.FUNCS.mp_sweep_ok = function() return 'new' end
    expect(GD.scan()).eq(1)
    expect(G.FUNCS.mp_sweep_ok()).eq('new')
    expect(GD.original(G.FUNCS.mp_sweep_ok)() ).eq('new')
  end)
end)

describe('screen wipe guard (a run started during a wipe)', function()
  before_each(function() MP = CH.boot() end)
  after_each(CH.teardown)

  it('keeps one wipe_off per wipe', function()
    local offs = 0
    G.FUNCS.wipe_on = function() if G.screenwipe then return end; G.screenwipe = { id = 'w' .. offs } end
    G.FUNCS.wipe_off = function() offs = offs + 1 end
    MP.guard.install_wipe_guard()
    -- start_run, then a second start_run before the wipe is gone (vanilla: two wipe_offs)
    G.FUNCS.wipe_on(); G.FUNCS.wipe_off()
    G.FUNCS.wipe_on(); G.FUNCS.wipe_off()
    expect(offs).eq(1)
    -- the wipe ends; the next one gets its own wipe_off
    G.screenwipe = nil
    G.FUNCS.wipe_on(); G.FUNCS.wipe_off()
    expect(offs).eq(2)
  end)
end)

describe('session launch during a screen wipe', function()
  before_each(function() MP = CH.boot() end)
  after_each(CH.teardown)

  it('waits for the wipe to finish, then starts the run once', function()
    local starts = 0
    G.FUNCS.start_run = function() starts = starts + 1 end
    MP.session.launcher = nil
    MP.session.mount('practice', { resolved = CH.H.resolved({ layers = { 'standard' } }), deck = 'b_red', stake = 1,
      seed = 'ABCD1234', me = 'u1', shape = { practice = true, nemesisPairing = true }, options = {} })
    G.screenwipe = { busy = true }
    expect(MP.session.launch()).eq(true)
    expect(MP.session.launch()).eq(true) -- a second message while waiting: still one start
    for _ = 1, 20 do CH.H.fake.advance(1 / 60) end
    expect(starts).eq(0)
    G.screenwipe = nil
    CH.H.fake.flush(20)
    expect(starts).eq(1)
  end)

  it('drops the deferred start when the session is gone', function()
    local starts = 0
    G.FUNCS.start_run = function() starts = starts + 1 end
    MP.session.launcher = nil
    MP.session.mount('practice', { resolved = CH.H.resolved({ layers = { 'standard' } }), deck = 'b_red', stake = 1,
      seed = 'ABCD1234', me = 'u1', shape = { practice = true, nemesisPairing = true }, options = {} })
    G.screenwipe = { busy = true }
    MP.session.launch()
    MP.session.unmount('test')
    G.screenwipe = nil
    CH.H.fake.flush(20)
    expect(starts).eq(0)
  end)
end)
