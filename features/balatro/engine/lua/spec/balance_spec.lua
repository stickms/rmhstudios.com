-- The owner's balance changes, on the REAL base-game code as the core pack ships it (data/balatro with
-- scripts/balatro/core-patches.json applied, spec/core_patches.lua; LuaJIT-exact math.random):
--
--   Blue Stake  no longer removes a discard (vanilla: -1 at stake >= 5); every other stake effect stays
--   Blue Seal   creates its Planet card with a #1# in #2# chance (1 in 2), its own seeded stream
--               'blue_seal', scaled by G.GAME.probabilities.normal (Oops! All 6s)
--   Gold Seal   $4 when played and scoring (was $3)
--
-- plus the text of all three in every language the game ships, and nothing else in those files.

local P = require 'spec.core_patches'
local V = require 'spec.mp_vanilla'

local function noop() end

--- The real Card methods (card.lua, patched) in their own environment; globals resolve to _G.
local function card_methods()
  local env = setmetatable({ Moveable = { extend = function() return {} end } }, { __index = _G })
  local chunk = P.loadfile('card.lua')
  setfenv(chunk, env)
  chunk()
  return env.Card
end

local Card

local function new_card(fields)
  local c = { ability = { h_dollars = 0, p_dollars = 0 }, debuff = false }
  for k, v in pairs(fields or {}) do c[k] = v end
  return setmetatable(c, { __index = Card })
end

local created, queued

--- G areas and the event queue around get_end_of_round_effect (events run when flushed).
local function round_end_world(limit)
  created, queued = {}, {}
  G.consumeables = {
    cards = {},
    config = { card_limit = limit or 2 },
    emplace = function(self, card) self.cards[#self.cards + 1] = card end,
  }
  G.GAME.consumeable_buffer = 0
  G.E_MANAGER = { add_event = function(_, e) queued[#queued + 1] = e end }
  _G.Event = function(t) return t end
  _G.card_eval_status_text = noop
  _G.create_card = function(set, area, _, _, _, _, key, append)
    local c = { set = set, key = key, append = append, add_to_deck = noop }
    created[#created + 1] = c
    return c
  end
end

local function flush()
  local q = queued
  queued = {}
  for _, e in ipairs(q) do if e.func then e.func() end end
end

--- One end of round for one held Blue Seal card: did it make a Planet? (consumables emptied after)
local function blue_round(card)
  local r = card:get_end_of_round_effect({})
  flush()
  local made = #G.consumeables.cards > 0
  G.consumeables.cards = {}
  return made, r
end

local function pattern(seed, rounds, normal)
  V.new_run(seed)
  G.GAME.probabilities.normal = normal or 1
  G.GAME.last_hand_played = 'Flush'
  round_end_world(2)
  local card = new_card({ seal = 'Blue' })
  local out = {}
  for i = 1, rounds do out[i] = blue_round(card) and 'H' or '.' end
  return table.concat(out)
end

describe('balance changes on the real base game', function()
  before_each(function()
    V.install()
    Card = card_methods()
  end)
  after_each(function()
    V.uninstall()
    Card = nil
  end)

  -- ── Blue Stake ─────────────────────────────────────────────────────────────

  describe('Blue Stake: no discard penalty', function()
    --- Game:start_run's stake chain, cut from the (patched or vanilla) game.lua and run as-is.
    local function stake_chain(src)
      local from = src:find('if self.GAME.stake >= 2 then', 1, true)
      local to = src:find('self.GAME.selected_back:apply_to_run()', from, true)
      assert(from and to, 'stake chain not found in game.lua')
      return assert(loadstring('return function(self) ' .. src:sub(from, to - 1) .. ' end'))()
    end

    local function run_at(chain, stake)
      local game = { GAME = Game.init_game_object(G) }
      game.GAME.stake = stake
      chain(game)
      return game.GAME
    end

    it('starting discards stay at 3 on every stake 1..8 (vanilla drops to 2 from Blue up)', function()
      local patched = stake_chain(P.source('game.lua'))
      local f = assert(io.open((RMH_SPEC.root or '') .. 'data/balatro/game.lua', 'rb'))
      local vanilla = stake_chain(f:read('*a'))
      f:close()
      for stake = 1, 8 do
        expect(run_at(patched, stake).starting_params.discards).eq(3)
        expect(run_at(vanilla, stake).starting_params.discards).eq(stake >= 5 and 2 or 3)
      end
    end)

    it('every other stake effect still applies, stacking as before', function()
      local patched = stake_chain(P.source('game.lua'))
      for stake = 1, 8 do
        local g = run_at(patched, stake)
        local m = g.modifiers
        expect(m.no_blind_reward and m.no_blind_reward.Small or false).eq(stake >= 2)
        expect(m.scaling or 1).eq(stake >= 6 and 3 or (stake >= 3 and 2 or 1))
        expect(m.enable_eternals_in_shop or false).eq(stake >= 4)
        expect(m.enable_perishables_in_shop or false).eq(stake >= 7)
        expect(m.enable_rentals_in_shop or false).eq(stake >= 8)
        expect(g.starting_params.hands).eq(4)
        expect(g.starting_params.hand_size).eq(8)
      end
    end)

    it('nothing else in the shipped game touches starting discards by stake', function()
      local src = P.source('game.lua')
      expect(P.count(src, 'starting_params.discards - 1')).eq(0)
      expect(P.count(src, 'stake >= 5')).eq(0)
    end)
  end)

  -- ── Blue Seal ──────────────────────────────────────────────────────────────

  describe('Blue Seal: 1 in 2 chance', function()
    it('the odds live on the seal prototype', function()
      expect(G.P_SEALS.Blue.config.odds).eq(2)
    end)

    it('hits and misses for a fixed seed, the same every time (golden pattern)', function()
      local a = pattern('RMHSEAL1', 40)
      expect(a).eq(pattern('RMHSEAL1', 40))
      expect(a).eq('.HHHH.H.HH..H..H....HH.HH..HHH.HH.HH..H.')
      local _, hits = a:gsub('H', '')
      expect(hits > 10 and hits < 30).truthy()
      expect(pattern('K7Q2ZP9X', 40)).ne(a)
    end)

    it("rolls its own stream: pseudorandom('blue_seal') < normal / 2, nothing else", function()
      V.new_run('RMHSEAL2')
      local expected = {}
      for i = 1, 30 do expected[i] = pseudorandom('blue_seal') < G.GAME.probabilities.normal / 2 and 'H' or '.' end
      local others = {}
      V.new_run('RMHSEAL2')
      for k, v in pairs(G.GAME.pseudorandom) do others[k] = v end
      local got = pattern('RMHSEAL2', 30)
      expect(got).eq(table.concat(expected))
      for k, v in pairs(others) do
        if k ~= 'blue_seal' then expect(G.GAME.pseudorandom[k]).eq(v) end
      end
    end)

    it('Oops! All 6s doubles it to a certainty (2 in 2)', function()
      expect(pattern('RMHSEAL1', 40, 2)).eq(string.rep('H', 40))
      local _, hits = pattern('RMHSEAL1', 400, 1):gsub('H', '')
      expect(hits > 150 and hits < 250).truthy()
    end)

    it('a hit makes the Planet of the final hand, with the vanilla create key', function()
      V.new_run('RMHSEAL1')
      G.GAME.probabilities.normal = 2
      G.GAME.last_hand_played = 'Flush'
      round_end_world(2)
      local made, r = blue_round(new_card({ seal = 'Blue' }))
      expect(made).truthy()
      expect(r.effect).eq(true)
      expect(created[1].set).eq('Planet')
      expect(created[1].key).eq('c_jupiter')
      expect(created[1].append).eq('blusl')
      expect(G.GAME.consumeable_buffer).eq(0)
    end)

    it('a miss leaves no effect and no reserved slot', function()
      V.new_run('RMHSEAL1')
      G.GAME.probabilities.normal = 0
      round_end_world(2)
      local r = new_card({ seal = 'Blue' }):get_end_of_round_effect({})
      expect(r.effect).eq(nil)
      expect(#queued).eq(0)
      expect(G.GAME.consumeable_buffer).eq(0)
    end)

    it('no room: no roll at all (the stream does not move), no Planet', function()
      V.new_run('RMHSEAL1')
      round_end_world(1)
      G.consumeables.cards = { {} }
      local before = G.GAME.pseudorandom.blue_seal
      local r = new_card({ seal = 'Blue' }):get_end_of_round_effect({})
      expect(r.effect).eq(nil)
      expect(G.GAME.pseudorandom.blue_seal).eq(before)
    end)

    it('a debuffed Blue Seal does nothing', function()
      V.new_run('RMHSEAL1')
      G.GAME.probabilities.normal = 2
      round_end_world(2)
      local r = new_card({ seal = 'Blue', debuff = true }):get_end_of_round_effect({})
      expect(r).eq({})
      expect(#queued).eq(0)
    end)

    it('the tooltips pass the chance (#1# = probability, #2# = odds) on both info-queue sites', function()
      local src = P.source('functions/common_events.lua')
      local vars = "vars = {''..(G.GAME and G.GAME.probabilities and G.GAME.probabilities.normal or 1), G.P_SEALS.Blue.config.odds}"
      expect(P.count(src, "{key = 'blue_seal', set = 'Other', " .. vars .. '}')).eq(2)
      expect(P.count(src, "{key = 'blue_seal', set = 'Other'}")).eq(0)
    end)
  end)

  -- ── Gold Seal ──────────────────────────────────────────────────────────────

  describe('Gold Seal: $4', function()
    before_each(function()
      V.new_run('RMHGOLD1')
      G.E_MANAGER = { add_event = noop }
      _G.Event = function(t) return t end
    end)

    it('pays $4 when played and scoring, through the dollar buffer', function()
      expect(G.P_SEALS.Gold.config.dollars).eq(4)
      expect(new_card({ seal = 'Gold' }):get_p_dollars()).eq(4)
      expect(G.GAME.dollar_buffer).eq(4)
    end)

    it('adds to a card that pays on its own, and nothing when debuffed', function()
      local c = new_card({ seal = 'Gold' })
      c.ability.p_dollars = 2
      expect(c:get_p_dollars()).eq(6)
      expect(new_card({ seal = 'Gold', debuff = true }):get_p_dollars()).eq(0)
      expect(new_card({ seal = 'Red' }):get_p_dollars()).eq(0)
    end)
  end)
end)

-- ── Text, every shipped language ─────────────────────────────────────────────

describe('balance change text in every language', function()
  local LANGS = P.languages()
  local root = (RMH_SPEC and RMH_SPEC.root) or ''

  -- The real loc_parse_string / localize / init_localization, loaded once (patched misc_functions).
  P.loadfile('functions/misc_functions.lua')()

  local CHANGED = { { 'Other', 'blue_seal' }, { 'Other', 'gold_seal' }, { 'Stake', 'stake_blue' } }

  --- {loc, vanilla} for one language, loaded once.
  local cache = {}
  local function tables(lang)
    if not cache[lang] then
      local chunk = assert(loadfile(root .. 'data/balatro/localization/' .. lang .. '.lua'))
      setfenv(chunk, {})
      cache[lang] = { loc = P.localization(lang), vanilla = chunk() }
    end
    return cache[lang].loc, cache[lang].vanilla
  end

  --- The description lines as the game renders them: init_localization's parse of the entry, then
  --- localize's raw_descriptions with the vars filled in.
  local function render(entry, set, key, vars)
    local copy = { name = entry.name, text = entry.text }
    _G.G = { localization = { descriptions = { [set] = { [key] = copy } },
      misc = { v_dictionary = {}, v_text = {}, tutorial = {}, quips = {} } } }
    init_localization()
    local out = localize({ type = 'raw_descriptions', set = set, key = key, vars = vars or {} })
    _G.G = nil
    return out
  end

  it('covers all 15 languages the game ships, each with one patch per changed entry', function()
    expect(#LANGS).eq(15)
    local ids = {}
    for _, p in ipairs(P.list()) do ids[p.id] = p end
    for _, lang in ipairs(LANGS) do
      for _, what in ipairs({ 'blue-seal', 'gold-seal', 'blue-stake' }) do
        local p = ids['balance-loc-' .. what .. '-' .. lang]
        expect(p and p.path).eq('localization/' .. lang .. '.lua')
      end
    end
  end)

  for _, lang in ipairs(LANGS) do
    describe(lang, function()
      it('Blue Seal reads as a #1# in #2# chance, with the probability shown', function()
        local loc, vanilla = tables(lang)
        local d, old = loc.descriptions.Other.blue_seal, vanilla.descriptions.Other.blue_seal
        expect(d.name).eq(old.name)
        local text = table.concat(d.text, '\n')
        expect(P.count(text, '#1#')).eq(1)
        expect(P.count(text, '#2#')).eq(1)
        expect(P.count(text, '{C:green}')).eq(1)
        expect(P.count(text, '{C:planet}')).eq(1)
        expect(d.text[#d.text]).eq(old.text[#old.text])
        local lines = table.concat(render(d, 'Other', 'blue_seal', { '1', 2 }), '\n')
        expect(lines:find('#', 1, true)).eq(nil)
        expect(lines:find('ERROR', 1, true)).eq(nil)
        expect(lines:find('1', 1, true) ~= nil and lines:find('2', 1, true) ~= nil).truthy()
        local doubled = table.concat(render(d, 'Other', 'blue_seal', { '2', 2 }), '\n')
        expect(doubled ~= lines).truthy()
      end)

      it('Gold Seal earns $4', function()
        local loc, vanilla = tables(lang)
        local text = table.concat(loc.descriptions.Other.gold_seal.text, '\n')
        expect(P.count(text, '{C:money}')).eq(1)
        expect(text:find('4', 1, true) ~= nil).truthy()
        expect(text:find('3', 1, true)).eq(nil)
        local old = table.concat(vanilla.descriptions.Other.gold_seal.text, '\n')
        expect((old:gsub('3', '4'))).eq(text)
      end)

      it('Blue Stake has no discard penalty and still applies all previous stakes', function()
        local loc, vanilla = tables(lang)
        local d, old = loc.descriptions.Stake.stake_blue, vanilla.descriptions.Stake.stake_blue
        local text = table.concat(d.text, '\n')
        expect(text:find('-1', 1, true)).eq(nil)
        expect(text:find('{C:red}', 1, true)).eq(nil)
        expect(d.text[1]:sub(1, 12)).eq('{C:inactive}')
        expect(#d.text).eq(#old.text)
        expect(d.text[#d.text]).eq(old.text[#old.text])
        expect(d.name).eq(old.name)
        expect(#render(d, 'Stake', 'stake_blue')).eq(#old.text)
      end)

      it('every formatting code is balanced and nothing else in the file changed', function()
        local loc, vanilla = tables(lang)
        for _, c in ipairs(CHANGED) do
          for _, line in ipairs(loc.descriptions[c[1]][c[2]].text) do
            local _, opens = line:gsub('{', '')
            local _, closes = line:gsub('}', '')
            expect(opens).eq(closes)
          end
        end
        -- Compare the rest without touching the cached tables.
        local function without(t)
          local d = {}
          for set, entries in pairs(t.descriptions) do
            d[set] = {}
            for k, v in pairs(entries) do d[set][k] = v end
          end
          for _, c in ipairs(CHANGED) do d[c[1]][c[2]] = nil end
          return { descriptions = d, misc = t.misc }
        end
        expect(without(loc)).eq(without(vanilla))
      end)
    end)
  end
end)
