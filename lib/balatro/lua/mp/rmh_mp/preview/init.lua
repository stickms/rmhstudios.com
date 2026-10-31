-- rmh_mp/preview/init.lua — Score Preview (M03; B06 setting, B07 customization, G10 timer costs).
--
-- The mod's opt-in preview ("Preview is a PvP feature", compatibility/Preview): a "Calculate Score"
-- button under the hand's chips × mult shows what the selected hand would score — min - max when a
-- random effect is involved, one number otherwise — and the money it would make. The numbers come
-- from preview/sim.lua, which runs the game's own scoring in a transaction that changes nothing
-- and draws from no stream.
--
-- When it shows (all of): the player's setting (off by default) · a match or practice session ·
-- the lobby option `previewDisabled` off (Major League and Sandbox force it on). Like the mod
-- (whose toggle "requires restart"), the setting is read when the session mounts: a session
-- without the preview installs no wrap and pays nothing per frame.
--
-- Timer layers (the mod's preview_calculate_delay / _cost; only with the timer on and outside the
-- PvP blind): default ante timer 5 s / free; pressure_timer and no_animation_timer 1.5 s / 3.5 s;
-- speedlatro_timer 5 s / free. The delay is real time (game speed does not shorten it); the cost
-- is a `timer_input {op = 'preview'}` and the TS timer model takes it (timer-model.ts `preview`).
--
-- Invalidation (as the mod): a selection change or joker/hand reorder clears a shown preview (a
-- calculation in progress keeps going); a consumable used, a card leaving the hand/jokers/
-- consumables, a play or a discard clears it and cancels a pending calculation.
--
--   MP.preview.active()           the preview is available in this session
--   MP.preview.calculate()        the button
--   MP.preview.stop(no_interrupt) clear (and cancel)
--   MP.preview.delay_cost()       -> delay, cost (seconds)
--   MP.preview.data / .text       last result / the HUD strings
--   MP.preview.setting(name) / set(name, value)   preview, preview_text, preview_button, preview_colour
--   MP.preview.settings_row()     the Multiplayer settings row (toggle, texts, colour)
--   MP.preview.hud_nodes()        the HUD rows (score + button)

local MP = require 'rmh_mp.state'
local SIM = require 'rmh_mp.preview.sim'

local PV = MP.preview or {}
MP.preview = PV
PV.sim = SIM

PV.DEFAULTS = { preview = false, preview_text = '', preview_button = '', preview_colour = 'RED' }
PV.COLOURS = { 'RED', 'BLUE', 'GREEN', 'PURPLE', 'ORANGE', 'GOLD' }
PV.MAX_TEXT = 25

-- The mod's layer scalars (layers/*.lua): [mode] = { delay, cost }.
PV.TIMER = {
  default = { 5, 0 },
  pressure = { 1.5, 3.5 },
  no_animation = { 1.5, 3.5 },
  speedlatro = { 5, 0 },
}

PV.text = PV.text or { l = '', m = '', r = '', dollars = '' }
PV.data = nil
PV.state = 'idle' -- 'idle' | 'calculating' | 'shown'

-- ── Settings (G.SETTINGS.rmh_mp, saved with the game's settings) ────────────

local function store()
  G.SETTINGS = G.SETTINGS or {}
  local s = G.SETTINGS.rmh_mp
  if type(s) ~= 'table' then s = {}; G.SETTINGS.rmh_mp = s end
  return s
end

function PV.setting(name)
  local v = store()[name]
  if v == nil then return PV.DEFAULTS[name] end
  return v
end

local function valid(name, v)
  if name == 'preview' then return type(v) == 'boolean' end
  if name == 'preview_text' or name == 'preview_button' then return type(v) == 'string' and #v <= PV.MAX_TEXT end
  if name == 'preview_colour' then return MP.set_of(PV.COLOURS)[v] == true end
  return false
end

function PV.set(name, v)
  if not valid(name, v) then return false end
  store()[name] = v
  if G.FILE_HANDLER then G.FILE_HANDLER.settings = true end
  if G.save_settings then pcall(G.save_settings, G) end
  return true
end

--- The mod's PVP.UTILS.get_preview_cfg: the custom text, or the default.
function PV.label(which)
  local v = PV.setting(which == 'button' and 'preview_button' or 'preview_text')
  if type(v) == 'string' and #v > 0 then return v end
  return which == 'button' and 'Calculate Score' or 'CALCULATING'
end

-- ── Availability, delay and cost ────────────────────────────────────────────

function PV.disabled_by_lobby()
  return MP.option('previewDisabled', false) == true
end

function PV.active()
  if not MP.in_session() then return false end
  local kind = MP.session_kind()
  if kind ~= 'match' and kind ~= 'practice' then return false end
  if PV.disabled_by_lobby() then return false end
  return PV.setting('preview') == true
end

local function on_pvp()
  return MP.pvp and MP.pvp.on_pvp_blind and MP.pvp.on_pvp_blind() and true or false
end

--- delay, cost in seconds for the next calculation.
function PV.delay_cost()
  local t = MP.resolved().timer or {}
  if not (MP.is_match() and t.enabled and MP.option('timer', true) ~= false) or on_pvp() then return 0, 0 end
  local row = PV.TIMER[t.mode or 'default'] or PV.TIMER.default
  return row[1], row[2]
end

-- ── The calculation ─────────────────────────────────────────────────────────

local function set_text(l, m, r, d)
  PV.text.l, PV.text.m, PV.text.r, PV.text.dollars = l or '', m or '', r or '', d or ''
end

local function fmt(n)
  if rawget(_G, 'number_format') then return number_format(n) end
  return tostring(n)
end

--- The mod's money text: '+N' / '-N', a range when min ~= max, nothing for none.
local function money(d)
  if not d then return '' end
  local function s(n) return (n >= 0 and '+$' or '-$') .. math.abs(n) end
  if d.min == d.max then return d.min == 0 and '' or s(d.min) end
  return s(d.min) .. ' / ' .. s(d.max)
end

function PV.render()
  if PV.state == 'calculating' then
    set_text('', ' ' .. PV.label('text') .. ' ', '', '')
  elseif PV.state == 'shown' then
    local d = PV.data
    if not d then
      set_text(' ?????? ', '', '', '')
    elseif d.score.min ~= d.score.max then
      set_text(fmt(d.score.min), ' - ', fmt(d.score.max), money(d.dollars))
    else
      set_text(fmt(d.score.min), '', '', money(d.dollars))
    end
  else
    set_text('', '', '', '')
  end
end

--- Would `chips` win the blind now? (the mod's is_enough_to_win: juice and money colour)
function PV.enough(chips)
  if not (chips and G.GAME and G.GAME.blind) then return false end
  local st = G.STATES
  if not (G.STATE == st.SELECTING_HAND or G.STATE == st.DRAW_TO_HAND or G.STATE == st.PLAY_TAROT) then return false end
  return (tonumber(G.GAME.chips) or 0) + chips >= (tonumber(G.GAME.blind.chips) or math.huge)
end

function PV.compute()
  PV.request = nil
  local d = SIM.run()
  PV.data = d
  PV.state = 'shown'
  PV.render()
  local _, cost = PV.delay_cost()
  if cost > 0 and d and MP.timer and MP.timer.input then MP.timer.input('preview') end
  return d
end

function PV.calculate()
  if not PV.active() or PV.request then return false end
  local delay = PV.delay_cost()
  PV.state = 'calculating'
  PV.render()
  if delay <= 0 or not (G.E_MANAGER and rawget(_G, 'Event')) then
    PV.compute()
    return true
  end
  local req = Event({ trigger = 'after', delay = delay, timer = 'REAL', blockable = false, blocking = false,
    func = function()
      if PV.request then PV.compute() end
      return true
    end })
  PV.request = req
  G.E_MANAGER:add_event(req)
  return true
end

function PV.stop(no_interrupt)
  if no_interrupt and PV.state == 'calculating' then return end
  if PV.request then
    PV.request.func = function() return true end
    PV.request.complete = true
    PV.request = nil
  end
  PV.state, PV.data = 'idle', nil
  PV.render()
end

-- ── HUD ─────────────────────────────────────────────────────────────────────

PV.text_ids = { mp_preview_l = 'l', mp_preview_m = 'm', mp_preview_r = 'r', mp_preview_dollars = 'dollars' }

local function text_node(id, maxw)
  local cfg = { id = id, func = 'rmh_mp_preview_text' }
  local key = PV.text_ids[id]
  if rawget(_G, 'DynaText') then
    cfg.object = DynaText({ string = { { ref_table = PV.text, ref_value = key } }, colours = { G.C.UI.TEXT_LIGHT },
      shadow = true, float = true, scale = id == 'mp_preview_dollars' and 0.4 or 0.5, maxw = maxw })
    return { n = G.UIT.O, config = cfg }
  end
  cfg.ref_table, cfg.ref_value, cfg.scale, cfg.colour = PV.text, key, 0.5, G.C.UI.TEXT_LIGHT
  return { n = G.UIT.T, config = cfg }
end

function PV.hud_nodes()
  local colour = G.C[PV.setting('preview_colour')] or G.C.RED
  local score = { n = G.UIT.R, config = { id = 'mp_preview_wrap', align = 'cm', padding = 0.1 }, nodes = {
    { n = G.UIT.C, config = { id = 'mp_preview_score', align = 'cm', minh = 0.5 }, nodes = {
      text_node('mp_preview_l', 2), text_node('mp_preview_m', 4), text_node('mp_preview_r', 2),
      text_node('mp_preview_dollars', 2),
    } },
  } }
  local button = { n = G.UIT.R, config = { id = 'mp_preview_button_wrap', align = 'cm', padding = 0.1 }, nodes = {
    { n = G.UIT.C, config = { id = 'mp_preview_button', button = 'rmh_mp_preview_calculate', align = 'cm', minh = 0.42,
      padding = 0.05, minw = 3, maxw = 4.5, r = 0.02, colour = colour, hover = true, shadow = true }, nodes = {
      { n = G.UIT.R, config = { align = 'cm' }, nodes = {
        { n = G.UIT.T, config = { text = PV.label('button'), colour = G.C.UI.TEXT_LIGHT, shadow = true, scale = 0.36 } },
      } },
    } },
  } }
  return { n = G.UIT.R, config = { id = 'mp_preview', align = 'cm', padding = 0 }, nodes = { score, button } }
end

--- Put the rows under the hand's chips × mult (the mod's spot) when the preview is on.
function PV.patch_hud(def)
  if not PV.active() then return false end
  local tree = require 'rmh_mp.util.tree'
  if tree.contains_id(def, 'mp_preview') then return false end
  local area = tree.find_id(def, 'hand_text_area')
  local col = area and area.nodes and area.nodes[1]
  if not (col and col.nodes) then return false end
  col.nodes[#col.nodes + 1] = PV.hud_nodes()
  PV.stop()
  return true
end

local F = G and G.FUNCS or {}

F.rmh_mp_preview_calculate = function() PV.calculate() end

-- Per-frame text update (the mod's fn_pre_score_UI_set): re-render on change, money colour and a
-- wobble when the shown score would win the blind.
F.rmh_mp_preview_text = function(e)
  local key = PV.text_ids[e.config.id]
  if not key then return end
  local txt = PV.text[key]
  if e.config.mp_last == txt then return end
  e.config.mp_last = txt
  local d = PV.data
  local juice, colour = false, G.C.UI.TEXT_LIGHT
  if key == 'dollars' then
    colour = d and d.dollars.min < 0 and G.C.RED or G.C.MONEY
  elseif PV.state == 'calculating' then
    juice = key == 'm'
  elseif PV.state == 'shown' and d then
    local n = key == 'r' and d.score.max or d.score.min
    juice = PV.enough(n)
    if juice then colour = G.C.MONEY end
  end
  local obj = e.config.object
  if obj then
    obj.colours = { colour }
    if obj.update_text then pcall(obj.update_text, obj) end
    if not G.TAROT_INTERRUPT_PULSE and G.FUNCS.text_super_juice then pcall(G.FUNCS.text_super_juice, e, juice and 5 or 0) end
  else
    e.config.colour = colour
  end
  if e.UIBox and e.UIBox.recalculate then pcall(e.UIBox.recalculate, e.UIBox) end
end

-- ── Settings row (Multiplayer settings) ─────────────────────────────────────

function PV.settings_row()
  local TH = require 'rmh_mp.ui.theme'
  local W = MP.ui.w
  PV.ref = { preview = PV.setting('preview') == true, preview_text = PV.setting('preview_text'),
    preview_button = PV.setting('preview_button') }
  local names = {}
  for i, c in ipairs(PV.COLOURS) do names[i] = c:sub(1, 1) .. c:sub(2):lower() end
  local current = 1
  for i, c in ipairs(PV.COLOURS) do if c == PV.setting('preview_colour') then current = i end end
  local function input(value, prompt, colour)
    if not rawget(_G, 'create_text_input') then return nil end
    return create_text_input({ w = 3, h = 0.5, max_length = PV.MAX_TEXT, prompt_text = prompt,
      extended_corpus = true, ref_table = PV.ref, ref_value = value, colour = colour,
      hooked_colour = darken and darken(colour, 0.3) or colour, keyboard_offset = -3,
      callback = function() PV.set(value, tostring(PV.ref[value] or ''):sub(1, PV.MAX_TEXT)) end })
  end
  -- The mod's config tab: the toggle's tooltip carries the description and the credit, and under it
  -- a grey "*Credit to @Fantom, @Divvy" and "*Requires a restart to take effect" (the HUD rows are
  -- built with the run's HUD, so a change shows from the next run).
  local inactive = TH.ui_col('TEXT_INACTIVE')
  return W.row({
    W.col({
      W.row({ W.toggle({ label = TH.T('b_preview_integration', 'Enable Score Preview'), ref_table = PV.ref,
        ref_value = 'preview', callback = function(v) PV.set('preview', v == true) end, w = 3, id = 'mp_set_preview' }) },
        { id = 'mp_set_preview_tip', on_demand_tooltip = { text = {
          TH.T('k_preview_integration_desc', 'This will enable score preview before playing a hand'),
          TH.T('k_preview_credit', '*Credit to @Fantom, @Divvy') } } }),
      W.row({ W.text(TH.T('k_preview_credit', '*Credit to @Fantom, @Divvy'), { scale = 0.25, colour = inactive,
        id = 'mp_set_preview_credit' }) }),
      W.row({ W.text(TH.T('k_requires_restart', '*Requires a restart to take effect'), { scale = 0.25, colour = inactive,
        id = 'mp_set_preview_restart' }) }),
    }),
    W.col({
      W.row({ W.text(TH.T('k_customize_preview', 'Customize Preview Text:'), { scale = 0.3 }) }),
      W.row({ input('preview_text', 'CALCULATING', TH.col('BLACK')) }, { id = 'mp_set_preview_text' }),
      W.row({ input('preview_button', 'Calculate Score', G.C[PV.setting('preview_colour')] or TH.col('RED')) },
        { id = 'mp_set_preview_button' }),
      W.row({ W.text(TH.T('k_enter_to_save', 'Press enter to save'), { scale = 0.25 }) }),
    }, { padding = 0.05 }),
    W.col({ W.cycle({ id = 'mp_set_preview_colour', label = TH.T('rmh_mp_ui_preview_colour', 'Preview button'),
      options = names, current = current, callback = 'rmh_mp_preview_colour', w = 1.6, scale = 0.7, no_pips = true }) }),
  }, { padding = 0.05, id = 'mp_set_preview_row' })
end

F.rmh_mp_preview_colour = function(args)
  local c = args and PV.COLOURS[args.to_key]
  if c then PV.set('preview_colour', c) end
end

-- ── Session wraps ───────────────────────────────────────────────────────────

local tracked = {}

local function order_changed(area, kind)
  local prev = tracked[kind] or {}
  local cards = area.cards or {}
  local changed = #prev ~= #cards
  for i, c in ipairs(cards) do
    if prev[i] ~= c.sort_id then changed = true; prev[i] = c.sort_id end
  end
  for i = #cards + 1, #prev do prev[i] = nil end
  tracked[kind] = prev
  return changed
end

local function in_hand_state()
  local st = G.STATES
  return G.STATE == st.SELECTING_HAND or G.STATE == st.DRAW_TO_HAND or G.STATE == st.PLAY_TAROT
end

local function idle() return PV.state == 'idle' and not PV.request end

function PV.install()
  tracked = {}
  PV.request, PV.data, PV.state = nil, nil, 'idle'
  PV.render()
  -- Off (the default, or the lobby's previewDisabled): no wraps at all, so a session without the
  -- preview pays nothing per frame. The setting is changed outside a run; the next mount sees it.
  if not PV.active() then return end
  local wrap = MP.hooks.wrap
  local function o(id, hot) return { group = 'session', optional = true, id = 'preview.' .. id, hot = hot } end
  local function live() return not SIM.busy and PV.active() end

  wrap(_G, 'create_UIBox_HUD', function(orig, ...)
    local def = orig(...)
    local ok, err = pcall(PV.patch_hud, def)
    if not ok then MP.log('error', 'preview HUD patch failed: %s', tostring(err)) end
    return def
  end, o('hud'))

  if rawget(_G, 'CardArea') then
    wrap(CardArea, 'parse_highlighted', function(orig, self, ...)
      local r = orig(self, ...)
      if live() and not idle() then PV.stop(true) end
      return r
    end, o('highlight'))
    -- Joker or hand reorder (the mod's per-frame order check).
    wrap(CardArea, 'update', function(orig, self, dt, ...)
      local r = orig(self, dt, ...)
      if (self == G.jokers or self == G.hand) and not SIM.busy and PV.state ~= 'idle' and in_hand_state()
        and PV.active() then
        if order_changed(self, self == G.jokers and 'jokers' or 'hand') then PV.stop(true) end
      end
      return r
    end, o('order', true))
  end

  if rawget(_G, 'Card') then
    wrap(Card, 'use_consumeable', function(orig, self, ...)
      local r = orig(self, ...)
      if live() then PV.stop() end
      return r
    end, o('use'))
    wrap(Card, 'remove_from_area', function(orig, self, ...)
      local area = self.area
      local r = orig(self, ...)
      if live() and area and (area == G.jokers or area == G.consumeables or area == G.hand)
        and G.STATE ~= G.STATES.HAND_PLAYED then
        PV.stop()
      end
      return r
    end, o('remove'))
  end

  if G.FUNCS then
    wrap(G.FUNCS, 'play_cards_from_highlighted', function(orig, ...)
      if live() then PV.stop() end
      return orig(...)
    end, o('play'))
    wrap(G.FUNCS, 'discard_cards_from_highlighted', function(orig, e, hook, ...)
      local r = orig(e, hook, ...)
      if live() and not hook then PV.stop() end
      return r
    end, o('discard'))
  end
end

return PV
