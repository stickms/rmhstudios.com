-- rmh_mp/ui/lobby_options.lua — WS10 Lobby Options (LOB-06, LOB-07, LY-25, D-17).
--
-- Tabs:
--   General   Ruleset cycle (Vanilla / Balanced / Expanded / Small World / Major League / Extra...),
--             the "Extra ruleset" sub-cycle when an extra is chosen, its description, Trap Cards;
--             Manhunt: Role Hunter/Runner (own; Runner disabled when taken) + Hunter Lives 7-16 (host);
--             Teams: My Team A/B (own).
--   Advanced  starting lives, PvP start ante, timer settings, the rules toggles, custom seed.
--   Modifiers the Advanced layer toggles (LY-25).
-- Only the host edits (ui_set_option{key, value}); guests see it disabled with "Only the Lobby Host
-- can change these options". A field the ruleset forces shows its forced value, locked.
-- Own role/team: ui_set_team{team}. The overlay re-draws when a newer lobby_view arrives.

local MP = require 'rmh_mp.state'
local TH = require 'rmh_mp.ui.theme'
local W = require 'rmh_mp.ui.widgets'

local U = MP.ui
local LO = U.lobby_options or {}
U.lobby_options = LO

local F = G.FUNCS

LO.st = LO.st or { tab = 'general' }

local function index_of(list, v)
  for i, x in ipairs(list) do if x == v then return i end end
  return nil
end

local function editable(view) return view.isHost == true end

--- Is `key` locked for this lobby (forced by the ruleset)? Returns locked, value.
function LO.locked(options, key) return TH.forced(options.ruleset, key) end

function LO.value(options, key)
  local locked, v = LO.locked(options, key)
  if locked then return v end
  return options[key]
end

-- ── General ─────────────────────────────────────────────────────────────────

function LO.ruleset_nodes(view)
  local o = view.state.options
  local std = TH.ruleset_list(false)
  local extras = TH.ruleset_list(true)
  local names, vals = {}, {}
  for i, r in ipairs(std) do names[i] = TH.ruleset_name(r.key); vals[i] = r.key end
  names[#names + 1] = TH.T('rmh_mp_ui_extra_cycle', 'Extra...')
  vals[#vals + 1] = '__extra'
  local cur_rs = TH.ruleset(o.ruleset)
  local is_extra = cur_rs and cur_rs.extra
  local cur = is_extra and #vals or (index_of(vals, o.ruleset) or 2)
  local can = editable(view) and view.state.kind == 'private'
  local nodes = {
    W.row({ W.cycle({ id = 'mp_opt_ruleset', label = TH.T('k_rulesets', 'Rulesets'), options = names, current = cur,
      callback = 'rmh_mp_opt_cycle', disabled = not can, colour = can and TH.col('RED') or TH.col('GREY'),
      w = 4, mp = { key = 'ruleset', values = vals } }) }),
  }
  if is_extra then
    local xn, xv = {}, {}
    for i, r in ipairs(extras) do xn[i] = TH.ruleset_name(r.key); xv[i] = r.key end
    nodes[#nodes + 1] = W.row({ W.cycle({ id = 'mp_opt_extra_ruleset', label = TH.T('rmh_mp_ui_extra_rulesets', 'Extra rulesets'),
      options = xn, current = index_of(xv, o.ruleset) or 1, callback = 'rmh_mp_opt_cycle', disabled = not can,
      colour = can and TH.col('GOLD') or TH.col('GREY'), w = 4, no_pips = true, mp = { key = 'ruleset', values = xv } }) })
  end
  local desc = {}
  for _, line in ipairs(TH.lines(cur_rs and TH.T(cur_rs.desc, '') or '', 4)) do
    desc[#desc + 1] = W.row({ W.text(line, { scale = 0.28 }) })
  end
  if #desc > 0 then nodes[#nodes + 1] = W.row(desc, { r = 0.1, padding = 0.08, colour = TH.col('BLACK'), minw = 6, id = 'mp_opt_desc' }) end
  return nodes
end

--- A toggle bound to a scratch copy of the option (the view stays the source of truth).
function LO.toggle(view, key, label, opts)
  opts = opts or {}
  local o = view.state.options
  local locked, forced = LO.locked(o, key)
  local val = locked and forced or o[key]
  local ref = { v = val == true, key = key }
  local can = editable(view) and not locked and not opts.readonly
  local t = W.toggle({ label = label .. (locked and (' ' .. TH.T('rmh_mp_ui_locked', '(locked)')) or ''), ref_table = ref,
    ref_value = 'v', callback = can and LO.toggle_cb(key) or LO.revert_cb(ref, val == true), w = opts.w or 4.5,
    colour = can and TH.col('RED') or TH.col('GREY'), id = 'mp_opt_' .. key })
  t.config.mp_option = key
  t.config.mp_locked = locked or nil
  t.config.mp_readonly = (not can) or nil
  return t
end

function LO.toggle_cb(key)
  return function(v) U.send('ui_set_option', { key = key, value = v == true }) end
end

--- A read-only toggle snaps back (vanilla toggles flip their ref before calling back).
function LO.revert_cb(ref, val)
  return function() ref.v = val end
end

function LO.general_nodes(view)
  local st = view.state
  local nodes = LO.ruleset_nodes(view)
  nodes[#nodes + 1] = W.row({ LO.toggle(view, 'trapCards', TH.T('k_pvp_lobby_trap_cards', 'Trap Cards')) })
  local mode = st.queueMode
  local me = U.lobby.me(view)
  if mode == 'pvp_manhunt' then
    local runner_taken = false
    for _, p in ipairs(st.players) do if p.team == 'RUNNER' and p.id ~= view.me then runner_taken = true end end
    local roles = { 'HUNTER', 'RUNNER' }
    local names = { TH.T('rmh_mp_ui_hunter', 'Hunter'), TH.T('rmh_mp_ui_runner', 'Runner') }
    if runner_taken then roles = { 'HUNTER' }; names = { names[1] } end
    nodes[#nodes + 1] = W.row({ W.cycle({ id = 'mp_opt_role', label = TH.T('rmh_mp_ui_role', 'Role'), options = names,
      current = index_of(roles, me and me.team) or 1, callback = 'rmh_mp_team_cycle', w = 3, mp = { values = roles } }) })
    local lives = {}
    for i = 7, 16 do lives[#lives + 1] = i end
    local ln = {}
    for i, v in ipairs(lives) do ln[i] = tostring(v) end
    local can = editable(view)
    nodes[#nodes + 1] = W.row({ W.cycle({ id = 'mp_opt_manhuntHunterLives', label = TH.T('rmh_mp_ui_hunter_lives', 'Hunter Lives'),
      options = ln, current = index_of(lives, st.options.manhuntHunterLives) or 1,
      callback = 'rmh_mp_opt_cycle', disabled = not can, colour = can and TH.col('RED') or TH.col('GREY'), w = 2, no_pips = true,
      mp = { key = 'manhuntHunterLives', values = lives } }) })
  elseif mode == 'pvp_teams' then
    local teams = { 'A', 'B' }
    nodes[#nodes + 1] = W.row({ W.cycle({ id = 'mp_opt_team', label = TH.T('rmh_mp_ui_my_team', 'My Team'),
      options = { TH.TV('rmh_mp_ui_team_n', 'Team #1#', { 'A' }), TH.TV('rmh_mp_ui_team_n', 'Team #1#', { 'B' }) },
      current = index_of(teams, me and me.team) or 1, callback = 'rmh_mp_team_cycle', w = 3, mp = { values = teams } }) })
  end
  return nodes
end

-- ── Advanced ────────────────────────────────────────────────────────────────

function LO.cycle_option(view, def)
  local o = view.state.options
  local locked, forced = LO.locked(o, def.key)
  local cur = locked and forced or o[def.key]
  local values = {}
  for i, v in ipairs(def.values) do values[i] = v end
  if not index_of(values, cur) then values[#values + 1] = cur; table.sort(values) end
  local names = {}
  for i, v in ipairs(values) do names[i] = tostring(v) .. (def.suffix or '') end
  local can = editable(view) and not locked
  local c = W.cycle({ id = 'mp_opt_' .. def.key, label = TH.T(def.label, def.def) .. (locked and (' ' .. TH.T('rmh_mp_ui_locked', '(locked)')) or ''),
    options = names, current = index_of(values, cur) or 1, callback = 'rmh_mp_opt_cycle', disabled = not can,
    colour = can and TH.col('RED') or TH.col('GREY'), w = 1.6, scale = 0.7, no_pips = true, mp = { key = def.key, values = values } })
  c.config.mp_option = def.key
  c.config.mp_locked = locked or nil
  return c
end

LO.seed = LO.seed or { text = '' }

function LO.advanced_nodes(view)
  local rows, row = {}, {}
  local function flush() if #row > 0 then rows[#rows + 1] = W.row(row, { padding = 0.02 }); row = {} end end
  for _, def in ipairs(TH.ADVANCED_OPTIONS) do
    if def.kind == 'cycle' then
      row[#row + 1] = W.col({ LO.cycle_option(view, def) })
      if #row == 3 then flush() end
    end
  end
  flush()
  local toggles, col1, col2 = {}, {}, {}
  for _, def in ipairs(TH.ADVANCED_OPTIONS) do
    if def.kind == 'toggle' then toggles[#toggles + 1] = def end
  end
  for i, def in ipairs(toggles) do
    local t = W.row({ LO.toggle(view, def.key, TH.T(def.label, def.def), { w = 4.2 }) })
    if i <= math.ceil(#toggles / 2) then col1[#col1 + 1] = t else col2[#col2 + 1] = t end
  end
  rows[#rows + 1] = W.row({ W.col(col1), W.col(col2) })
  -- Custom seed: 'random' or up to 8 A-Z0-9.
  local o = view.state.options
  local can = editable(view)
  LO.seed.text = o.customSeed ~= 'random' and o.customSeed or ''
  rows[#rows + 1] = W.row({
    W.text(TH.T('k_current_seed', 'Current seed: ') .. (o.customSeed == 'random' and TH.T('k_random', 'Random') or o.customSeed),
      { scale = 0.3, id = 'mp_opt_seed_label' }),
    W.col({}, { minw = 0.2 }),
    can and create_text_input({ w = 2.4, h = 0.5, max_length = 8, all_caps = true, prompt_text = TH.T('b_set_custom_seed', 'Set Custom Seed'),
      ref_table = LO.seed, ref_value = 'text', callback = function() F.rmh_mp_opt_seed() end }) or nil,
    can and W.button({ id = 'mp_opt_seed_set', label = TH.T('rmh_mp_ui_set', 'Set'), button = 'rmh_mp_opt_seed', minw = 1, minh = 0.5,
      scale = 0.35, colour = TH.col('GREEN'), col = true }) or nil,
    can and W.button({ id = 'mp_opt_seed_random', label = TH.T('k_random', 'Random'), button = 'rmh_mp_opt_seed_random', minw = 1.2,
      minh = 0.5, scale = 0.35, colour = TH.col('BLUE'), col = true }) or nil,
  }, { padding = 0.05 })
  return rows
end

-- ── Modifiers ───────────────────────────────────────────────────────────────

function LO.modifier_nodes(view)
  local o = view.state.options
  local on = MP.set_of(o.modifierLayers)
  local can = editable(view)
  local cols = { {}, {} }
  for i, l in ipairs(TH.ADVANCED_LAYERS) do
    local ref = { v = on[l.name] == true }
    local t = W.toggle({ label = TH.layer_label(l.name), ref_table = ref, ref_value = 'v',
      callback = can and LO.layer_cb(l.name) or LO.revert_cb(ref, on[l.name] == true), w = 3.2,
      colour = can and TH.col('RED') or TH.col('GREY'), id = 'mp_layer_' .. l.name })
    t.config.mp_layer = l.name
    local c = cols[(i - 1) % 2 + 1]
    c[#c + 1] = W.row({ t })
  end
  return { W.row({ W.col(cols[1]), W.col(cols[2]) }) }
end

--- The modifierLayers list after toggling `name` (keeps TH.ADVANCED_LAYERS order).
function LO.layers_with(current, name, v)
  local set = MP.set_of(current)
  set[name] = v and true or nil
  local out = {}
  for _, l in ipairs(TH.ADVANCED_LAYERS) do if set[l.name] then out[#out + 1] = l.name end end
  return out
end

function LO.layer_cb(name)
  return function(v)
    local view = U.model.lobby
    if not view then return end
    U.send('ui_set_option', { key = 'modifierLayers', value = MP.json_array(LO.layers_with(view.state.options.modifierLayers, name, v)) })
  end
end

-- ── The overlay ─────────────────────────────────────────────────────────────

local function tab_root(nodes)
  return { n = G.UIT.ROOT, config = { align = 'cm', colour = TH.col('CLEAR'), padding = 0.05 }, nodes = nodes }
end

function LO.contents(model)
  local view = model.lobby
  if not view then return nil end
  local head = {
    W.row({ W.text(TH.T('k_lobby_options', 'Lobby Options'), { scale = 0.6 }) }, { padding = 0.05 }),
  }
  if not editable(view) then
    head[#head + 1] = W.row({ W.text(TH.T('k_opts_only_host', 'Only the Lobby Host can change these options'),
      { scale = 0.3, colour = TH.col('STATUS_WAIT'), id = 'mp_opt_only_host' }) })
  end
  head[#head + 1] = create_tabs({ snap_to_nav = true, colour = TH.col('ORANGE'), tabs = {
    { label = TH.T('k_lobby_general', 'General'), chosen = LO.st.tab == 'general',
      tab_definition_function = function() LO.st.tab = 'general'; return tab_root(LO.general_nodes(U.model.lobby or view)) end },
    { label = TH.T('k_lobby_advanced', 'Advanced'), chosen = LO.st.tab == 'advanced',
      tab_definition_function = function() LO.st.tab = 'advanced'; return tab_root(LO.advanced_nodes(U.model.lobby or view)) end },
    { label = TH.T('k_lobby_modifiers', 'Modifiers'), chosen = LO.st.tab == 'modifiers',
      tab_definition_function = function() LO.st.tab = 'modifiers'; return tab_root(LO.modifier_nodes(U.model.lobby or view)) end },
  } })
  return head
end

function LO.open()
  local c = LO.contents(U.model)
  if not c then return nil end
  LO.st.version = U.model.lobby.state.version
  return W.overlay({ name = 'lobby_options', contents = c })
end

U.register_refresh('lobby_options', function(model)
  if not model.lobby then return W.close_overlay('lobby_options') end
  if LO.st.version ~= model.lobby.state.version then LO.open() end
end)

-- ── Callbacks ───────────────────────────────────────────────────────────────

F.rmh_mp_opt_cycle = function(args)
  local m = args and args.cycle_config and args.cycle_config.mp
  if not (m and m.key) then return end
  local v = m.values[args.to_key]
  if v == '__extra' then v = TH.ruleset_list(true)[1].key end
  if v == nil then return end
  U.send('ui_set_option', { key = m.key, value = v })
end

F.rmh_mp_team_cycle = function(args)
  local m = args and args.cycle_config and args.cycle_config.mp
  local v = m and m.values[args.to_key]
  if v then U.send('ui_set_team', { team = v }) end
end

F.rmh_mp_opt_seed = function()
  local s = tostring(LO.seed.text or ''):upper():gsub('[^A-Z0-9]', ''):sub(1, 8)
  if s == '' then return end
  U.send('ui_set_option', { key = 'customSeed', value = s })
end

F.rmh_mp_opt_seed_random = function() U.send('ui_set_option', { key = 'customSeed', value = 'random' }) end

return LO
