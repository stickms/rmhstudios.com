-- rmh_mp/ui/widgets.lua — WS10 shared UI pieces (PLAN §3.d MP.ui.*), built from the base game's
-- own UI system (G.UIT nodes, UIBox_button, create_option_cycle, create_toggle, overlay_menu).
--
-- Exported on MP.ui (frozen names, §3.d):
--   MP.ui.button{label, colour, button, minw, minh, scale, id, disabled, col, ref_table}
--   MP.ui.pillar_row{pillars = {...}}          the Blind-Select-style pillar row (A3 §1.3)
--   MP.ui.overlay(def)                         a generic options overlay (create_UIBox_generic_options)
--   MP.ui.toast(key, vars)                     a short notice (attention text; also kept in MP.ui.toasts)
--   MP.ui.player_card(player, opts)            an avatar Joker card node with the player tooltip
-- Helpers (WS11 may use them too): MP.ui.w.text/row/col/panel/badge/cycle/toggle/blind_chip.
--
-- Every builder is pure (returns a definition table) except overlay/toast, which show something.
-- A disabled button keeps its node and id but has no `button` and the inactive colour.

local MP = require 'rmh_mp.state'
local TH = require 'rmh_mp.ui.theme'

local U = MP.ui
local W = U.w or {}
U.w = W

local function uit(name) return G.UIT[name] end

function W.text(str, opts)
  opts = opts or {}
  return { n = uit('T'), config = {
    text = tostring(str or ''), scale = opts.scale or TH.SCALE.label, colour = opts.colour or TH.ui_col('TEXT_LIGHT'),
    shadow = opts.shadow ~= false, id = opts.id, ref_table = opts.ref_table, ref_value = opts.ref_value,
    vert = opts.vert,
  } }
end

--- A text node bound to a live value (ref_table[ref_value]).
function W.live_text(ref_table, ref_value, opts)
  opts = opts or {}
  return { n = uit('T'), config = { ref_table = ref_table, ref_value = ref_value, scale = opts.scale or TH.SCALE.label,
    colour = opts.colour or TH.ui_col('TEXT_LIGHT'), shadow = true, id = opts.id } }
end

--- Drop nil holes from a node list (`cond and node or nil` in the middle of a literal would
--- otherwise hide every node after it from ipairs).
function W.compact(list)
  if not list then return {} end
  local n = table.maxn(list)
  local out = {}
  for i = 1, n do if list[i] ~= nil then out[#out + 1] = list[i] end end
  return out
end

function W.row(nodes, cfg)
  cfg = cfg or {}
  cfg.align = cfg.align or 'cm'
  return { n = uit('R'), config = cfg, nodes = W.compact(nodes) }
end

function W.col(nodes, cfg)
  cfg = cfg or {}
  cfg.align = cfg.align or 'cm'
  return { n = uit('C'), config = cfg, nodes = W.compact(nodes) }
end

--- The mod's embossed dark bar (`L_BLACK`, r 0.1, emboss 0.1).
function W.panel(nodes, cfg)
  cfg = cfg or {}
  cfg.align = cfg.align or 'cm'
  cfg.padding = cfg.padding or 0.2
  cfg.r = cfg.r or 0.1
  cfg.emboss = cfg.emboss or 0.1
  cfg.colour = cfg.colour or TH.col('L_BLACK')
  return { n = cfg.col and uit('C') or uit('R'), config = cfg, nodes = W.compact(nodes) }
end

--- A small rounded badge ("Player", "Ready", "Not Ready", "Host").
function W.badge(text, colour, opts)
  opts = opts or {}
  return { n = uit('R'), config = { align = 'cm', padding = 0.03 }, nodes = {
    { n = uit('C'), config = { align = 'cm', r = 0.1, padding = 0.04, minw = opts.minw or 1.4, colour = colour,
      emboss = 0.05, id = opts.id }, nodes = {
      W.text(text, { scale = opts.scale or 0.3 }),
    } },
  } }
end

local function as_label(l)
  if type(l) == 'table' then return l end
  return { tostring(l or '') }
end

--- UIBox_button with the mod's defaults; `disabled` greys it out and removes the callback.
function W.button(args)
  args = args or {}
  local disabled = args.disabled == true
  local t = UIBox_button({
    id = args.id,
    label = as_label(args.label),
    button = disabled and 'nil' or (args.button or 'nil'),
    colour = disabled and TH.ui_col('BACKGROUND_INACTIVE') or (args.colour or TH.col('RED')),
    text_colour = disabled and TH.ui_col('TEXT_INACTIVE') or args.text_colour,
    minw = args.minw or 2.65, minh = args.minh or 0.9, scale = args.scale or TH.SCALE.button,
    col = args.col, ref_table = args.ref_table, focus_args = args.focus_args, one_press = args.one_press,
    shadow = true,
  })
  t.config.mp_disabled = disabled or nil
  return t
end
U.button = W.button

--- The vanilla option cycle; `on_change` names a G.FUNCS callback (args.cycle_config = {…}).
--- `disabled` shows only the current value (a one-option cycle has no arrows or callback).
function W.cycle(args)
  local options, current = args.options, args.current or 1
  if args.disabled then options = { options[current] or '' }; current = 1 end
  local t = create_option_cycle({
    id = args.id, label = args.label, options = options, current_option = current,
    opt_callback = (not args.disabled) and args.callback or nil, colour = args.colour or TH.col('RED'),
    w = args.w or 3.5, scale = args.scale or 0.8, text_scale = args.text_scale, info = args.info,
    mp = args.mp, no_pips = args.no_pips,
  })
  t.config.mp_disabled = args.disabled or nil
  return t
end

function W.toggle(args)
  local t = create_toggle({
    label = args.label, ref_table = args.ref_table, ref_value = args.ref_value, callback = args.callback,
    w = args.w or 0, label_scale = args.label_scale or 0.35, active_colour = args.colour, col = args.col,
    info = args.info,
  })
  t.config.id = args.id
  return t
end

--- An animated blind chip sprite (the pillar icon slot; Nemesis colour row `n` when given).
function W.blind_chip(size, row)
  local A = G.ANIMATION_ATLAS or {}
  local atlas = A[row and 'mp_player_blind_col' or 'mp_player_blind_chip'] or A['blind_chips']
  if not atlas or not rawget(_G, 'AnimatedSprite') then return nil end
  local ok, s = pcall(AnimatedSprite, 0, 0, size or 1, size or 1, atlas, { x = 0, y = row and (row - 1) or 0 })
  if not ok then return nil end
  if s.define_draw_steps then
    s:define_draw_steps({ { shader = 'dissolve', shadow_height = 0.05 }, { shader = 'dissolve' } })
  end
  return s
end

--- One pillar (A3 §1.3): button, outlined name plate, icon, description box, stat box
--- (`stat_label`/`stat_value`, or a node of its own in `stat_node`), then an optional `extra` node.
function W.pillar(p)
  local col = p.colour or TH.col('BLUE')
  local dark = TH.darken(col, 0.3)
  local icon = W.blind_chip(1.2, p.chip_row)
  local desc = {}
  for _, line in ipairs(p.desc or {}) do
    desc[#desc + 1] = W.row({ W.text(line, { scale = 0.32, colour = TH.ui_col('TEXT_LIGHT') }) }, { padding = 0.02 })
  end
  return W.col({
    W.row({ W.button({ id = p.id, label = p.button_label or 'SELECT', button = p.button, colour = col, minw = 2.4,
      minh = 0.65, scale = 0.45, ref_table = p.ref, disabled = p.disabled }) }, { padding = 0.07 }),
    W.row({ W.col({ W.text(p.name or '', { scale = 0.45 }) },
      { r = 0.1, padding = 0.08, minw = 2.4, colour = dark, outline = 1, outline_colour = col }) }, { padding = 0.05 }),
    W.row({ icon and { n = uit('O'), config = { object = icon } } or W.col({}, { minw = 1.2, minh = 1.2 }) },
      { minh = 1.3 }),
    W.row(desc, { r = 0.1, padding = 0.08, minw = 2.4, minh = 0.9, colour = TH.col('BLACK'), emboss = 0.05 }),
    p.stat_node,
    p.stat_label and not p.stat_node and W.row({
      W.col({ W.row({ W.text(p.stat_label, { scale = 0.3 }) }),
        W.row({ W.text(p.stat_value or '', { scale = 0.45, colour = TH.col('MONEY'), id = p.id and (p.id .. '_stat') }) }) },
        { r = 0.1, padding = 0.06, minw = 2.4, colour = TH.col('BLACK'), emboss = 0.05 }),
    }, { padding = 0.05 }) or nil,
    p.extra,
  }, { r = 0.15, padding = 0.12, colour = TH.alpha(TH.col('BLACK'), 0.6), emboss = 0.05, id = p.id and (p.id .. '_pillar') })
end

--- A row of pillars (Create / Practice / Find Game).
function W.pillar_row(args)
  local nodes = {}
  for _, p in ipairs(args.pillars or {}) do nodes[#nodes + 1] = W.pillar(p) end
  return W.row(nodes, { padding = 0.15, id = args.id })
end
U.pillar_row = W.pillar_row

-- ── Overlays ────────────────────────────────────────────────────────────────

--- Show an overlay. def = { name, contents = {nodes}, back_func?, no_back?, back_label?, colour?, minw? }
--- Returns the definition (tests read it through MP.ui.last_overlay).
function W.overlay(def)
  local t = create_UIBox_generic_options({
    contents = W.compact(def.contents), back_func = def.back_func, no_back = def.no_back, back_label = def.back_label,
    colour = def.colour, minw = def.minw, outline_colour = def.outline_colour, back_colour = def.back_colour,
    padding = def.padding,
  })
  U.last_overlay = { name = def.name, def = t }
  if G.FUNCS and G.FUNCS.overlay_menu then G.FUNCS.overlay_menu({ definition = t }) end
  return t
end
U.overlay = W.overlay

function W.close_overlay(name)
  if name and not (U.last_overlay and U.last_overlay.name == name) then return false end
  U.last_overlay = nil
  if G.OVERLAY_MENU and G.FUNCS and G.FUNCS.exit_overlay_menu then G.FUNCS.exit_overlay_menu() end
  return true
end

--- The name of the MP overlay that is up, or nil.
function W.overlay_name()
  if not G.OVERLAY_MENU and G.FUNCS and G.FUNCS.overlay_menu then return nil end
  return U.last_overlay and U.last_overlay.name or nil
end

-- ── Toasts ──────────────────────────────────────────────────────────────────

U.toasts = U.toasts or {}

local function loc_has(cat, key)
  local l = G.localization and G.localization.misc and G.localization.misc[cat]
  return l ~= nil and l[key] ~= nil
end

--- MP.ui.toast(key, vars): key is a dictionary key (or a literal), vars fill #1#… (array) or
--- {name=...} records from the `toast` message (filled in key order).
function W.toast(key, vars, opts)
  opts = opts or {}
  local list = {}
  if type(vars) == 'table' then
    if vars[1] ~= nil then list = vars else
      local ks = {}
      for k in pairs(vars) do ks[#ks + 1] = k end
      table.sort(ks)
      for i, k in ipairs(ks) do list[i] = vars[k] end
    end
  end
  local text
  if loc_has('v_dictionary', key) then text = TH.TV(key, nil, list)
  else text = TH.fill(TH.T(key, opts.default or key), list) end
  local entry = { key = key, text = text, colour = opts.colour }
  U.toasts[#U.toasts + 1] = entry
  if #U.toasts > 20 then table.remove(U.toasts, 1) end
  if rawget(_G, 'attention_text') and G.ROOM_ATTACH and not opts.silent then
    pcall(attention_text, {
      text = text, scale = 0.45, hold = opts.hold or 3, major = G.ROOM_ATTACH, align = 'tm',
      offset = { x = 0, y = 1.6 }, colour = TH.ui_col('TEXT_LIGHT'),
      backdrop_colour = opts.colour or TH.col('MP_PURPLE'), silent = true,
    })
  end
  return entry
end

U.toast = W.toast

-- ── Player cards (LOB-10) ───────────────────────────────────────────────────

--- The tooltip body: name, build badge, Muted, Player, Ready/Not Ready.
function W.player_tooltip(player, info)
  info = info or {}
  local rows = {
    W.row({ W.text(player.name or '?', { scale = 0.45 }) }, { padding = 0.04 }),
  }
  if info.build then rows[#rows + 1] = W.row({ W.text(info.build, { scale = 0.28, colour = TH.ui_col('TEXT_INACTIVE') }) }) end
  if info.muted then rows[#rows + 1] = W.badge(TH.T('rmh_mp_ui_muted_label', 'Muted'), TH.col('RED')) end
  if info.host then rows[#rows + 1] = W.badge(TH.T('rmh_mp_ui_host', 'Host'), TH.col('GOLD')) end
  rows[#rows + 1] = W.badge(player.role == 'spectator' and TH.T('rmh_mp_spectating', 'Spectating') or TH.T('rmh_mp_ui_player', 'Player'),
    TH.col('MP_PURPLE'))
  if info.show_ready then
    rows[#rows + 1] = player.ready and W.badge(TH.T('rmh_mp_ui_ready', 'Ready'), TH.col('GREEN'))
      or W.badge(TH.T('rmh_mp_ui_not_ready', 'Not Ready'), TH.col('RED'))
  end
  if player.away or player.connected == false then
    rows[#rows + 1] = W.badge(TH.T('rmh_mp_conn_away', 'Away'), TH.col('ORANGE'))
  end
  return { n = uit('ROOT'), config = { align = 'cm', colour = TH.col('CLEAR') }, nodes = {
    { n = uit('R'), config = { align = 'cm', r = 0.12, padding = 0.05, emboss = 0.07,
      colour = TH.lighten(TH.col('JOKER_GREY'), 0.5) }, nodes = {
      { n = uit('R'), config = { align = 'cm', r = 0.1, padding = 0.08, colour = TH.col('BLACK') }, nodes = rows },
    } },
  } }
end

--- A Card showing the player's avatar Joker; hover = tooltip, click = opts.on_click(player).
--- Returns the Card (or nil when the game objects are unavailable).
function W.avatar_card(player, opts)
  opts = opts or {}
  local key = player.avatarJoker
  local center = G.P_CENTERS and (G.P_CENTERS[key] or G.P_CENTERS.j_joker)
  if not center or not rawget(_G, 'Card') then return nil end
  local w, h = (G.CARD_W or 2.1) * (opts.scale or 0.7), (G.CARD_H or 2.8) * (opts.scale or 0.7)
  local back = G.P_CENTERS.b_black and G.P_CENTERS.b_black.pos
  local ok, card = pcall(Card, 0, 0, w, h, nil, center,
    { bypass_discovery_center = true, bypass_discovery_ui = true, bypass_back = back, discover = false })
  if not ok then
    MP.log('warn', 'ui: avatar card failed: %s', tostring(card))
    return nil
  end
  card.mp_player = player
  if card.states and card.states.drag then card.states.drag.can = false end
  card.hover = function(self)
    self.config.h_popup = W.player_tooltip(player, opts.info)
    if self.align_h_popup then self.config.h_popup_config = self:align_h_popup() end
    if Node and Node.hover then Node.hover(self) end
  end
  card.click = function(self)
    if opts.on_click then opts.on_click(player) end
  end
  return card
end

--- A node holding one player card in a title-type CardArea (keeps cards from being dragged off).
function W.player_card(player, opts)
  opts = opts or {}
  local scale = opts.scale or 0.7
  local w, h = (G.CARD_W or 2.1) * scale, (G.CARD_H or 2.8) * scale
  if not rawget(_G, 'CardArea') then
    return W.col({ W.text(player.name or '?') }, { minw = w, minh = h, id = 'mp_player_' .. tostring(player.id) })
  end
  local area = CardArea(0, 0, w, h, { card_limit = 1, type = 'title', highlight_limit = 0 })
  local card = W.avatar_card(player, opts)
  if card then area:emplace(card) end
  return W.col({
    W.row({ { n = uit('O'), config = { object = area } } }),
    W.row({ W.text(player.name or '?', { scale = 0.3 }) }, { maxw = w }),
  }, { padding = 0.04, id = 'mp_player_' .. tostring(player.id) })
end
U.player_card = W.player_card

return W
