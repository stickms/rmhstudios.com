-- rmh_mp/ui/run_setup.lua — WS10 MP run setup (LOB-08, PR-01): deck + stake (+ MP stake), the
-- Challenges tab, and the Practice variant (optional seed, New Run tab only).
--
-- Not the vanilla run-setup screen (C §1.7: it would start a run): our own overlay that only
-- picks, then sends
--   lobby host:   ui_set_deck{deck, stake, mpStake?, challenge?}           button "Select"
--   practice:     ui_practice{ruleset, deck, stake, seed?}                  button "Start"
--   lobby guest:  MP.loadout = {deck, stake} (Lobby Options "Players have different decks", C15;
--                 read by MP.session.mount, nothing sent: as in the mod, each player applies its own)
-- MP decks (b_mp_*), MP stakes and MP challenges are listed only for rulesets with Multiplayer
-- content, or with the "Show Multiplayer content anyway" setting. Guests open it ('loadout') only
-- while different decks are on and the loadout is not random; their deck box is display only otherwise.

local MP = require 'rmh_mp.state'
local TH = require 'rmh_mp.ui.theme'
local W = require 'rmh_mp.ui.widgets'

local U = MP.ui
local RS = U.run_setup or {}
U.run_setup = RS

local F = G.FUNCS

-- Fallback when WS7's MP.content.stakes is not in the pack (its LIST is the source of truth).
RS.MP_STAKES = {
  { id = 'planet', key = 'rmh_mp_ui_stake_planet', def = 'Planet Stake', colour = 'BLUE' },
  { id = 'spectral', key = 'rmh_mp_ui_stake_spectral', def = 'Spectral Stake', colour = 'BLACK' },
  { id = 'spectralplus', key = 'rmh_mp_ui_stake_spectralplus', def = 'Spectral+ Stake', colour = 'BLACK' },
}

--- The MP stakes as { id, key, name, colour }: MP.content.stakes.LIST (name and colour from it), else
--- the fallback above.
function RS.mp_stakes()
  local S = MP.content and MP.content.stakes
  local out = {}
  if S and S.LIST then
    for _, e in ipairs(S.LIST) do
      out[#out + 1] = { id = e.id, key = e.key, name = S.name and S.name(e) or e.name_fallback,
        colour = S.colour and S.colour(e) or TH.col('BLACK') }
    end
    return out
  end
  for _, s in ipairs(RS.MP_STAKES) do
    out[#out + 1] = { id = s.id, key = 'stake_mp_' .. s.id, name = TH.T(s.key, s.def), colour = TH.col(s.colour) }
  end
  return out
end

local function desc_name(set, key)
  local d = G.localization and G.localization.descriptions and G.localization.descriptions[set]
  local e = d and d[key]
  if e and type(e.name) == 'string' then return e.name end
  return nil
end

function RS.deck_name(key)
  if not key then return '?' end
  local n = desc_name('Back', key)
  if n then return n end
  local c = (G.P_CENTERS and G.P_CENTERS[key]) or (MP.registry and MP.registry.get and MP.registry.get(key))
  return (c and c.name ~= key and c.name) or key
end

-- The vanilla stake keys, in stake order (game.lua P_STAKES).
RS.STAKE_KEYS = { 'stake_white', 'stake_red', 'stake_green', 'stake_black', 'stake_blue', 'stake_purple', 'stake_orange', 'stake_gold' }
local function stake_keys() return RS.STAKE_KEYS end

function RS.stake_name(i)
  local key = stake_keys()[i]
  return (key and desc_name('Stake', key)) or TH.TV('rmh_mp_ui_stake_n', 'Stake #1#', { i })
end

function RS.mp_stake_name(id)
  for _, s in ipairs(RS.mp_stakes()) do if s.id == id then return s.name end end
  return TH.T('rmh_mp_ui_stake_none', 'None')
end

function RS.mp_stake_colour(id)
  for _, s in ipairs(RS.mp_stakes()) do if s.id == id then return s.colour end end
  return TH.col('MP_PURPLE')
end

--- May the Multiplayer decks/stakes/challenges be listed for this ruleset?
function RS.mp_visible(ruleset)
  local r = TH.ruleset(ruleset)
  if r and r.mp then return true end
  return U.setting and U.setting('showMpContent') == true or false
end

--- Vanilla backs in collection order, then the MP backs (registry definition order).
function RS.decks(mp)
  local out = {}
  for _, c in ipairs((G.P_CENTER_POOLS and G.P_CENTER_POOLS.Back) or {}) do
    if c.key and not (MP.registry and MP.registry.is_mp and MP.registry.is_mp(c.key)) then out[#out + 1] = c.key end
  end
  if mp and MP.registry and MP.registry.defs then
    for _, d in ipairs(MP.registry.defs()) do
      if d.kind == 'Back' and not d.no_collection then out[#out + 1] = d.key end
    end
  end
  if #out == 0 then out[1] = 'b_red' end
  return out
end

function RS.challenges(mp)
  local out = {}
  local seen = {}
  for _, c in ipairs(G.CHALLENGES or {}) do
    if c.id and not seen[c.id] and not (MP.registry and MP.registry.is_mp and MP.registry.is_mp(c.id)) then
      out[#out + 1] = { id = c.id, name = c.name, deck = c.deck and c.deck.type }
      seen[c.id] = true
    end
  end
  if mp and MP.registry and MP.registry.defs then
    for _, d in ipairs(MP.registry.defs()) do
      if d.kind == 'Challenge' and not seen[d.key] then out[#out + 1] = { id = d.key, name = d.name, mp = true }; seen[d.key] = true end
    end
  end
  return out
end

function RS.challenge_name(id)
  local n = G.localization and G.localization.misc and G.localization.misc.challenge_names
  return (n and n[id]) or id
end

local function index_of(list, v)
  for i, x in ipairs(list) do if x == v then return i end end
  return 1
end

-- The picker's working state (one at a time).
RS.st = RS.st or {}

--- Open the picker. mode 'lobby' (host) | 'loadout' (guest, C15) | 'practice' (args.ruleset).
function RS.open(mode, args)
  args = args or {}
  local lobby = U.model.lobby and U.model.lobby.state
  if mode == 'loadout' then
    local own = MP.loadout or lobby or {}
    args.deck, args.stake = args.deck or own.deck, args.stake or own.stake
  end
  local ruleset = args.ruleset or (lobby and lobby.options.ruleset) or 'ruleset_mp_balanced'
  -- Practice mounts MP content for the MP rulesets, so their decks are offered there.
  local mp = RS.mp_visible(ruleset)
  local decks = RS.decks(mp)
  local st = {
    mode = mode, ruleset = ruleset, mp = mp, decks = decks,
    deck = (lobby and mode == 'lobby' and lobby.deck) or args.deck or 'b_red',
    stake = (lobby and mode == 'lobby' and lobby.stake) or args.stake or 1,
    mpStake = (lobby and mode == 'lobby' and lobby.mpStake) or nil,
    challenge = (lobby and mode == 'lobby' and lobby.challenge) or nil,
    seed = { text = '' },
    tab = args.tab or 'new_run',
  }
  if decks[index_of(decks, st.deck)] ~= st.deck then st.deck = decks[1] end
  local cap = RS.stake_cap(ruleset)
  st.stake = math.max(1, math.min(cap, math.floor(tonumber(st.stake) or 1)))
  RS.st = st
  return RS.show()
end

local function deck_cycle(st)
  local names = {}
  for i, k in ipairs(st.decks) do names[i] = RS.deck_name(k) end
  return W.cycle({ id = 'mp_rs_deck', label = TH.T('rmh_mp_ui_deck', 'Deck'), options = names,
    current = index_of(st.decks, st.deck), callback = 'rmh_mp_rs_cycle', w = 4, mp = { field = 'deck', values = st.decks } })
end

--- The highest vanilla stake the picker offers (A1 §1.3: "stake capped by a compat max, else 8"):
--- 8, lowered to the stakes this game build has, and to a ruleset's max_stake when theme.lua's
--- ruleset entry sets one.
RS.MAX_STAKE = 8
function RS.stake_cap(ruleset)
  local cap = RS.MAX_STAKE
  local pool = G.P_CENTER_POOLS and G.P_CENTER_POOLS.Stake
  if type(pool) == 'table' and #pool > 0 and #pool < cap then cap = #pool end
  local r = ruleset and TH.ruleset(ruleset)
  if r and tonumber(r.max_stake) and r.max_stake >= 1 and r.max_stake < cap then cap = math.floor(r.max_stake) end
  return cap
end

-- ── The deck preview (the chosen deck face down, D-24 Balanced sticker on MP decks) ──

--- The registry or vanilla center of a deck key.
function RS.deck_center(key)
  return (G.P_CENTERS and G.P_CENTERS[key]) or (MP.registry and MP.registry.proto and MP.registry.proto(key)) or nil
end

--- A one-card area showing the deck back, as vanilla's deck screens do (G.GAME.viewed_back).
--- The Balanced sticker is drawn through MP.content.decks.draw_balanced (WS9). nil when the game
--- objects are not available (specs, an early frame).
function RS.deck_preview(st)
  local center = RS.deck_center(st.deck)
  if not (center and rawget(_G, 'Card') and rawget(_G, 'CardArea') and rawget(_G, 'Back') and G.GAME
    and G.P_CENTERS and G.P_CENTERS.c_base) then return nil end
  local ok, area = pcall(function()
    G.GAME.viewed_back = Back(center)
    local w, h = G.CARD_W * 0.9, G.CARD_H * 0.9
    local a = CardArea(0, 0, w, h, { card_limit = 1, type = 'deck', highlight_limit = 0 })
    local card = Card(0, 0, w, h, nil, G.P_CENTERS.c_base, { playing_card = 1, viewed_back = true })
    card.sprite_facing = 'back'
    card.facing = 'back'
    local D = MP.content and MP.content.decks
    if D and D.apply_back_sprite then pcall(D.apply_back_sprite, card) end
    local base_draw = card.draw
    card.draw = function(self, layer)
      if base_draw then base_draw(self, layer) end
      -- In a session the content's Card.draw wrap already draws the sticker.
      if D and D.draw_balanced and not MP.in_session() then pcall(D.draw_balanced, self, center) end
    end
    a:emplace(card)
    -- After emplace: CardArea:set_ranks (run by emplace) makes a lone card draggable again.
    card.states.drag.can = false
    return a
  end)
  if not ok then
    MP.log('warn', 'ui: deck preview %s failed: %s', tostring(st.deck), tostring(area))
    return nil
  end
  RS.preview_area = area
  return W.col({ { n = G.UIT.O, config = { object = area } } }, { id = 'mp_rs_preview', padding = 0.05 })
end

--- The Cocktail Deck's "Edit Deck" button (WS9's editor, G.FUNCS.mp_cocktail_edit), or nil.
function RS.cocktail_button(st)
  local key = MP.cocktail and MP.cocktail.KEY or 'b_mp_cocktail'
  if st.deck ~= key or not G.FUNCS.mp_cocktail_edit then return nil end
  return W.button({ id = 'mp_rs_cocktail_edit', label = TH.T('rmh_mp_ui_edit_deck', 'Edit Deck'), button = 'rmh_mp_rs_cocktail',
    colour = TH.col('ORANGE'), minw = 2.4, minh = 0.6, scale = 0.4 })
end

F.rmh_mp_rs_cocktail = function(e)
  RS.cocktail_open = true
  return G.FUNCS.mp_cocktail_edit(e)
end

-- Closing the Cocktail editor opened from this picker comes back to it (cocktail_edit.lua calls
-- the hook); opened anywhere else it just closes.
U.cocktail_back = function()
  if RS.cocktail_open and RS.st and RS.st.mode then
    RS.cocktail_open = false
    return RS.show()
  end
  RS.cocktail_open = false
  if G.FUNCS.exit_overlay_menu then G.FUNCS.exit_overlay_menu() end
end

local function stake_cycle(st)
  local names, vals = {}, {}
  for i = 1, RS.stake_cap(st.ruleset) do names[i] = RS.stake_name(i); vals[i] = i end
  return W.cycle({ id = 'mp_rs_stake', label = TH.T('rmh_mp_ui_stake', 'Stake'), options = names, current = st.stake,
    callback = 'rmh_mp_rs_cycle', w = 4, mp = { field = 'stake', values = vals } })
end

local function mp_stake_cycle(st)
  local names, vals, cur = { TH.T('rmh_mp_ui_stake_none', 'None') }, { false }, 1
  for _, s in ipairs(RS.mp_stakes()) do
    names[#names + 1] = s.name; vals[#vals + 1] = s.id
    if s.id == st.mpStake then cur = #names end
  end
  -- The cycle takes the chosen stake's colour (WS7 MP.content.stakes colour).
  local colour = st.mpStake and RS.mp_stake_colour(st.mpStake) or TH.col('RED')
  return W.cycle({ id = 'mp_rs_mp_stake', label = TH.T('rmh_mp_ui_mp_stake', 'Multiplayer Stake'), options = names,
    current = cur, callback = 'rmh_mp_rs_cycle', w = 4, colour = colour, mp = { field = 'mpStake', values = vals } })
end

function RS.new_run_tab(st)
  local nodes = {
    W.row({ RS.deck_preview(st), W.col({ deck_cycle(st) }) }, { padding = 0.05 }),
  }
  local cocktail = RS.cocktail_button(st)
  if cocktail then nodes[#nodes + 1] = W.row({ cocktail }, { padding = 0.05 }) end
  nodes[#nodes + 1] = W.row({ stake_cycle(st) }, { padding = 0.05 })
  if st.mp and st.mode == 'lobby' then nodes[#nodes + 1] = W.row({ mp_stake_cycle(st) }, { padding = 0.05 }) end
  if st.mode == 'practice' then
    nodes[#nodes + 1] = W.row({ W.text(TH.T('rmh_mp_ui_seed_optional', 'Seed (optional)'), { scale = 0.35 }) })
    nodes[#nodes + 1] = W.row({ create_text_input({ w = 3, h = 0.6, max_length = 8, all_caps = true,
      prompt_text = TH.T('k_random', 'Random'), ref_table = st.seed, ref_value = 'text' }) }, { padding = 0.05 })
  end
  nodes[#nodes + 1] = W.row({ W.button({ id = 'mp_rs_select',
    label = st.mode == 'practice' and TH.T('b_start', 'START') or TH.T('rmh_mp_ui_select', 'Select'),
    button = 'rmh_mp_rs_select', colour = TH.col(st.mode == 'practice' and 'BLUE' or 'GREEN'), minw = 3, minh = 0.8 }) },
    { padding = 0.1 })
  return { n = G.UIT.ROOT, config = { align = 'cm', colour = TH.col('CLEAR'), padding = 0.1 }, nodes = nodes }
end

function RS.challenges_tab(st)
  local list = RS.challenges(st.mp)
  local names, ids, cur = { TH.T('rmh_mp_ui_stake_none', 'None') }, { false }, 1
  for i, c in ipairs(list) do
    names[i + 1] = RS.challenge_name(c.id); ids[i + 1] = c.id
    if c.id == st.challenge then cur = i + 1 end
  end
  return { n = G.UIT.ROOT, config = { align = 'cm', colour = TH.col('CLEAR'), padding = 0.1 }, nodes = {
    W.row({ W.cycle({ id = 'mp_rs_challenge', label = TH.T('k_challenge', 'Challenge'), options = names, current = cur,
      callback = 'rmh_mp_rs_cycle', w = 5, mp = { field = 'challenge', values = ids } }) }, { padding = 0.05 }),
    W.row({ W.button({ id = 'mp_rs_select_challenge', label = TH.T('rmh_mp_ui_select', 'Select'), button = 'rmh_mp_rs_select',
      colour = TH.col('GREEN'), minw = 3, minh = 0.8 }) }, { padding = 0.1 }),
  } }
end

function RS.contents(st)
  st = st or RS.st
  local header = W.row({ W.text(st.mode == 'practice' and (TH.T('b_practice', 'Practice') .. ': ' .. TH.ruleset_name(st.ruleset))
    or TH.T('b_sc_choose_deck', 'Choose Deck/Stake'), { scale = 0.55 }) }, { padding = 0.05 })
  if st.mode ~= 'lobby' then return { header, W.row({ { n = G.UIT.O, config = {
    object = UIBox({ definition = RS.new_run_tab(st), config = { offset = { x = 0, y = 0 } } }) } } }) } end
  return { header, create_tabs({ snap_to_nav = true, colour = TH.col('BOOSTER'), tabs = {
    { label = TH.T('b_new_run', 'New Run'), chosen = st.tab ~= 'challenges', tab_definition_function = function() return RS.new_run_tab(RS.st) end },
    { label = TH.T('b_challenges', 'Challenges'), chosen = st.tab == 'challenges', tab_definition_function = function()
      RS.st.tab = 'challenges'; return RS.challenges_tab(RS.st) end },
  } }) }
end

function RS.show()
  return W.overlay({ name = 'run_setup', contents = RS.contents(RS.st) })
end

F.rmh_mp_rs_cycle = function(args)
  local m = args and args.cycle_config and args.cycle_config.mp
  if not m then return end
  local v = m.values[args.to_key]
  if v == false then v = nil end
  RS.st[m.field] = v
  if m.field == 'challenge' then RS.st.tab = 'challenges' end
  -- Re-colour the MP stake cycle; a new deck redraws the preview and the Cocktail button.
  if m.field == 'mpStake' or m.field == 'deck' then RS.show() end
end

--- Send what the picker holds. Returns the message sent (tests).
function RS.submit()
  local st = RS.st
  if st.mode == 'practice' then
    local seed = tostring(st.seed.text or ''):upper():gsub('[^A-Z0-9]', ''):sub(1, 8) or ''
    local d = { ruleset = st.ruleset, deck = st.deck, stake = st.stake, seed = seed ~= '' and seed or nil }
    if U.queue_busy() then U.overlays.error('queued'); return nil end
    if U.send('ui_practice', d) then W.close_overlay('run_setup'); return d end
    return nil
  end
  if st.mode == 'loadout' then
    MP.loadout = { deck = st.deck, stake = st.stake }
    W.close_overlay('run_setup')
    U.changed()
    return MP.loadout
  end
  local d = { deck = st.deck, stake = st.stake, mpStake = st.mpStake, challenge = nil }
  if st.tab == 'challenges' and st.challenge then
    d.challenge = st.challenge
    for _, c in ipairs(RS.challenges(st.mp)) do
      if c.id == st.challenge and c.deck then d.deck = c.deck end
    end
  end
  if U.send('ui_set_deck', d) then W.close_overlay('run_setup'); return d end
  return nil
end

F.rmh_mp_rs_select = function() RS.submit() end

return RS
