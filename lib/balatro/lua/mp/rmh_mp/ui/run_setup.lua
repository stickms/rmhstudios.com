-- rmh_mp/ui/run_setup.lua — WS10 MP run setup (LOB-08, PR-01): deck + stake (+ MP stake), the
-- Challenges tab, and the Practice variant (optional seed, New Run tab only).
--
-- Not the vanilla run-setup screen (C §1.7: it would start a run): our own overlay that only
-- picks, then sends
--   lobby host:   ui_set_deck{deck, stake, mpStake?, challenge?}           button "Select"
--   practice:     ui_practice{ruleset, deck, stake, seed?}                  button "Start"
-- MP decks (b_mp_*), MP stakes and MP challenges are listed only for rulesets with Multiplayer
-- content, or with the "Show Multiplayer content anyway" setting. Guests never open it (the deck
-- box is display only).

local MP = require 'rmh_mp.state'
local TH = require 'rmh_mp.ui.theme'
local W = require 'rmh_mp.ui.widgets'

local U = MP.ui
local RS = U.run_setup or {}
U.run_setup = RS

local F = G.FUNCS

RS.MP_STAKES = {
  { id = nil, key = 'rmh_mp_ui_stake_none', def = 'None' },
  { id = 'planet', key = 'rmh_mp_ui_stake_planet', def = 'Planet Stake' },
  { id = 'spectral', key = 'rmh_mp_ui_stake_spectral', def = 'Spectral Stake' },
  { id = 'spectralplus', key = 'rmh_mp_ui_stake_spectralplus', def = 'Spectral+ Stake' },
}

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
  for _, s in ipairs(RS.MP_STAKES) do if s.id == id then return TH.T(s.key, s.def) end end
  return TH.T('rmh_mp_ui_stake_none', 'None')
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

--- Open the picker. mode 'lobby' (host) | 'practice' (args.ruleset).
function RS.open(mode, args)
  args = args or {}
  local lobby = U.model.lobby and U.model.lobby.state
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
  RS.st = st
  return RS.show()
end

local function deck_cycle(st)
  local names = {}
  for i, k in ipairs(st.decks) do names[i] = RS.deck_name(k) end
  return W.cycle({ id = 'mp_rs_deck', label = TH.T('rmh_mp_ui_deck', 'Deck'), options = names,
    current = index_of(st.decks, st.deck), callback = 'rmh_mp_rs_cycle', w = 4, mp = { field = 'deck', values = st.decks } })
end

local function stake_cycle(st)
  local names, vals = {}, {}
  for i = 1, 8 do names[i] = RS.stake_name(i); vals[i] = i end
  return W.cycle({ id = 'mp_rs_stake', label = TH.T('rmh_mp_ui_stake', 'Stake'), options = names, current = st.stake,
    callback = 'rmh_mp_rs_cycle', w = 4, mp = { field = 'stake', values = vals } })
end

local function mp_stake_cycle(st)
  local names, vals, cur = {}, {}, 1
  for i, s in ipairs(RS.MP_STAKES) do
    names[i] = TH.T(s.key, s.def); vals[i] = s.id or false
    if s.id == st.mpStake then cur = i end
  end
  return W.cycle({ id = 'mp_rs_mp_stake', label = TH.T('rmh_mp_ui_mp_stake', 'Multiplayer Stake'), options = names,
    current = cur, callback = 'rmh_mp_rs_cycle', w = 4, mp = { field = 'mpStake', values = vals } })
end

function RS.new_run_tab(st)
  local nodes = {
    W.row({ deck_cycle(st) }, { padding = 0.05 }),
    W.row({ stake_cycle(st) }, { padding = 0.05 }),
  }
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
  if st.mode == 'practice' then return { header, W.row({ { n = G.UIT.O, config = {
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
end

--- Send what the picker holds. Returns the message sent (tests).
function RS.submit()
  local st = RS.st
  if st.mode == 'practice' then
    local seed = tostring(st.seed.text or ''):upper():gsub('[^A-Z0-9]', ''):sub(1, 8) or ''
    local d = { ruleset = st.ruleset, deck = st.deck, stake = st.stake, seed = seed ~= '' and seed or nil }
    if U.model.queue.state == 'searching' then U.overlays.error('queued'); return nil end
    if U.send('ui_practice', d) then W.close_overlay('run_setup'); return d end
    return nil
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
