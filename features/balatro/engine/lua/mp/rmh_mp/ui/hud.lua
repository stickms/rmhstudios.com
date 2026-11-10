-- rmh_mp/ui/hud.lua — the in-run HUD (WS11; PLAN HUD-01/02/07/08/09/17, TIM-01, FL-09 UI).
--
-- This is the entry of the in-run UI. hooks/practice.lua (a content module init.lua loads) requires
-- it, and it requires the other in-run UI modules:
--   ui/pvp_hud.lua       the blind panel while a PvP blind is played (HUD-03)
--   ui/blind_select.lua  the Nemesis pillar, Ready/Unready, the "????" previews (HUD-04/05, FL-06)
--   ui/countdown.lua     3-2-1 before the PvP blind, timpani cue (FL-07, TIM-02 cue)
--   ui/nemesis_rows.lua  phantom and trap rows above the jokers (HUD-06)
--   ui/pause.lua         the pause menu (HUD-10, PR-04 toggles)
--   ui/end_screen.lua    match end screens (HUD-12/13/14)
--   ui/lobby_info.lua    Lobby Info overlay, in-run chat fallback (HUD-09, LOB-16/17)
--
-- Design: every live value on screen is a field of one view table, RU.view, recomputed once a frame
-- from MP.state by RU.compute (pure: no game calls). UI nodes point at it with ref_table/ref_value,
-- so they update without rebuilding anything. RU.patch_hud(def) is pure tree surgery on the vanilla
-- create_UIBox_HUD definition: the Ante box becomes the Lives box, the Round box the Timer box, the
-- score row gains the Enemy location line and the button column the Lobby Info button. The ids the
-- game caches (hud_ante, ante_UI_count, round_UI_count, row_round_text, chip_UI_count) stay alive.
--
-- Strings: RU.t(key, fallback) reads the merged localization (mod strings + rmh_mp_* extras) and
-- falls back to an ASCII English literal for keys the pack does not carry yet.
--
-- Public: MP.ui.run (= RU): view, compute(view?), refresh(), t, tv, patch_hud(def), install(),
-- banner_text(), toast(text, colour); MP.ui.show_result / countdown_tick / timer_cue (core hooks);
-- MP.test.{run_ready, run_unready, run_vote, timer_press, pause_menu, forfeit, hud} (autopilot
-- surface; WS10's MP.test.ready/unready/vote delegate to the run_* ones inside a run).

local MP = require 'rmh_mp.state'
local tree = require 'rmh_mp.util.tree'
local fmt = require 'rmh_mp.util.fmt'

MP.ui = MP.ui or {}
local RU = MP.ui.run or {}
MP.ui.run = RU

RU.MULTIPLAYER = { 0.675, 0.196, 0.196, 1 } -- #AC3232 (G.C.MULTIPLAYER in the mod)
RU.MP_PURPLE = { 0.55, 0.30, 0.70, 1 }
RU.SCORE_EASE = 3                           -- seconds to ease the enemy score (HUD-03)
RU.SURVIVOR_HOLD = 8                        -- HUD-08

local function g(name) return rawget(_G, name) end
local function gc(name, fallback) return (G and G.C and G.C[name]) or fallback end

-- ── Strings ─────────────────────────────────────────────────────────────────

local function misc() return G and G.localization and G.localization.misc end

--- A dictionary string (or the ASCII fallback). Lists (ml_* keys) are joined with a space.
function RU.t(key, fallback)
  local m = misc()
  local s = m and m.dictionary and m.dictionary[key]
  if type(s) == 'table' then s = table.concat(s, ' ') end
  if type(s) == 'string' and s ~= '' then return s end
  return fallback or key
end

--- A dictionary list (ml_* keys), or the fallback list.
function RU.tl(key, fallback)
  local m = misc()
  local s = m and m.dictionary and m.dictionary[key]
  if type(s) == 'table' and #s > 0 then return s end
  if type(s) == 'string' and s ~= '' then return { s } end
  return fallback
end

--- A v_dictionary string with #1#, #2#... replaced.
function RU.tv(key, fallback, vars)
  local m = misc()
  local s = m and m.v_dictionary and m.v_dictionary[key]
  if type(s) == 'table' then s = s[1] end
  if type(s) ~= 'string' or s == '' then s = fallback or key end
  for i, v in ipairs(vars or {}) do s = s:gsub('#' .. i .. '#', (tostring(v):gsub('%%', '%%%%'))) end
  return s
end

-- ── Session helpers ─────────────────────────────────────────────────────────

local function sess() return MP.state.session end
local function me() local s = sess(); return s and s.me end

function RU.name_of(id)
  local s = sess()
  local r = s and s.roster and id and s.roster[id]
  return (r and r.name) or '?'
end

--- 'nemesis' | 'royale' | 'manhunt' | 'teams' | 'practice' | nil
function RU.shape()
  local s = sess()
  if not s then return nil end
  if s.kind == 'practice' then return 'practice' end
  local sh = s.shape or {}
  if sh.manhunt then return 'manhunt' end
  if sh.team_based then return 'teams' end
  if s.queueMode == 'pvp_royale' then return 'royale' end
  if sh.nemesis_pairing then return 'nemesis' end
  local n = 0
  for _ in pairs(s.roster or {}) do n = n + 1 end
  return n > 2 and 'royale' or 'nemesis'
end

local function is_major_league()
  local r = MP.resolved()
  return r and r.key == 'ruleset_mp_majorleague'
end

local function lives_text(n)
  if n == nil then return '-' end
  return tostring(math.max(0, math.floor(n)))
end

--- The opponent lives shown in the Lives box (HUD-01): the ante nemesis under pairing, the other
--- team in Teams, the Runner/top Hunter in Manhunt (the target), else the highest of the others.
function RU.opponent_lives()
  local st = MP.state
  local shape = RU.shape()
  if shape == 'teams' then
    local mine = st.my_team
    local other = (mine == 'A' and 'B') or (mine == 'B' and 'A') or nil
    return other and st.team_lives[other] or nil
  end
  if (shape == 'nemesis' or shape == 'manhunt') and st.target then
    return st.lives[st.target]
  end
  local best
  for id, n in pairs(st.lives or {}) do
    if id ~= me() and n and n > 0 and (best == nil or n > best) then best = n end
  end
  if best == nil and st.target then best = st.lives[st.target] end
  return best
end

function RU.my_lives()
  local st = MP.state
  if RU.shape() == 'teams' and st.my_team and st.team_lives[st.my_team] then return st.team_lives[st.my_team] end
  return me() and st.lives[me()] or nil
end

--- The PvP blind's title (HUD-03).
function RU.opponent_title()
  local st = MP.state
  if st.pvp.bye then return RU.t('k_bye', 'Bye') end
  local shape = RU.shape()
  if shape == 'practice' then return '???' end
  if shape == 'royale' then return RU.t('rmh_mp_the_royale', 'The Royale') end
  if shape == 'manhunt' then
    if st.my_team == 'RUNNER' then return RU.t('rmh_mp_the_hunters', 'The Hunters') end
    return RU.t('rmh_mp_the_runner', 'The Runner')
  end
  if shape == 'teams' then
    local other = st.my_team == 'A' and 'B' or 'A'
    return RU.t('rmh_mp_team_' .. other:lower(), 'Team ' .. other)
  end
  if st.target then return RU.name_of(st.target) end
  return RU.t('rmh_mp_waiting_for_pairing', 'Waiting for pairing...')
end

-- ── Location text (HUD-02) ─────────────────────────────────────────────────

local function blind_name(key)
  if not key or key == '' then return '' end
  if g('localize') and G.P_BLINDS and G.P_BLINDS[key] then
    local ok, s = pcall(localize, { type = 'name_text', key = key, set = 'Blind' })
    if ok and type(s) == 'string' and s ~= '' and s ~= 'ERROR' and s ~= key then return s end
  end
  local p = G.P_BLINDS and G.P_BLINDS[key]
  return (p and p.name) or key
end
RU.blind_name = blind_name

--- 'loc_ready' | 'loc_selecting' | 'loc_shop[-<blind>]' | 'loc_playing-<blind>' -> display text.
function RU.location_text(loc)
  if type(loc) ~= 'string' or loc == '' then return '-' end
  local base, blind = loc:match('^([%a_]+)%-(.+)$')
  base = base or loc
  if base == 'loc_ready' then return RU.t('loc_ready', 'Ready for PvP') end
  if base == 'loc_selecting' then return RU.t('loc_selecting', 'Selecting') end
  if base == 'loc_shop' then
    if blind then return RU.t('loc_shop', 'Shopping before') .. ' ' .. blind_name(blind) end
    return RU.t('rmh_mp_shopping', 'Shopping')
  end
  if base == 'loc_playing' then return RU.t('loc_playing', 'Playing') .. ' ' .. blind_name(blind) end
  return loc
end

--- The blind a location names ('loc_shop-bl_big' -> 'bl_big'), or nil (no blind, or not loaded).
function RU.location_blind(loc)
  if type(loc) ~= 'string' then return nil end
  local key = loc:match('^[%a_]+%-(.+)$')
  if key and G.P_BLINDS and G.P_BLINDS[key] then return key end
  return nil
end

-- ── Timer text (TIM-01) ─────────────────────────────────────────────────────

--- Whole seconds above 9.95, one decimal at or below it.
function RU.timer_text(value)
  value = tonumber(value)
  if not value or value ~= value then return '--' end
  if value < 0 then value = 0 end
  if value == math.huge then return '--' end
  if value > 9.95 then return tostring(math.floor(value + 0.5)) end
  return string.format('%.1f', value)
end

-- ── Score easing (HUD-03) ───────────────────────────────────────────────────

RU.ease = RU.ease or { from = 0, to = 0, t0 = 0, shown = 0 }

local function now() return (G and G.TIMERS and G.TIMERS.REAL) or os.clock() end

function RU.ease_score(target, t)
  local e = RU.ease
  t = t or now()
  target = tonumber(target) or 0
  if target ~= e.to then
    e.from, e.to, e.t0 = e.shown, target, t
  end
  if e.to == math.huge or e.to ~= e.to or e.from == math.huge then
    e.shown = e.to
  else
    local k = math.min(1, math.max(0, (t - e.t0) / RU.SCORE_EASE))
    -- ease-out: fast at first, settles on the value
    k = 1 - (1 - k) * (1 - k)
    e.shown = e.from + (e.to - e.from) * k
    if k >= 1 then e.shown = e.to end
  end
  return e.shown
end

function RU.reset_ease()
  RU.ease = { from = 0, to = 0, t0 = 0, shown = 0 }
end

local function score_text(x)
  if x == math.huge then return 'inf' end
  x = math.floor((tonumber(x) or 0) + 0.5)
  return fmt.short(x)
end

-- ── The view model ──────────────────────────────────────────────────────────

RU.view = RU.view or {}

--- Recompute every on-screen value from MP.state into `v` (default RU.view). Pure apart from the
--- score easing clock. Returns v.
function RU.compute(v, t)
  v = v or RU.view
  local st = MP.state
  local s = sess()
  local pvp = st.pvp
  local enemy = st.enemy
  local shape = RU.shape()
  v.shape = shape or ''
  v.in_match = s ~= nil and s.kind == 'match'

  -- Lives (HUD-01)
  v.my_lives = lives_text(RU.my_lives())
  v.opp_lives = lives_text(RU.opponent_lives())
  v.lives_label = RU.t('k_lives', 'Lives')

  -- Timer (TIM-01, TIM-06)
  local ts = st.timer
  local r = MP.resolved()
  local threshold = r and r.flags and r.flags.timerDisplayThreshold
  v.timer_label = RU.t('k_timer', 'Timer')
  if ts then
    local value = tonumber(ts.value) or 0
    if threshold and type(threshold) == 'number' and value > threshold and not ts.ticking then
      v.timer_text = '--'
    else
      v.timer_text = RU.timer_text(value)
    end
    if ts.display == '>>' then v.timer_text = '>> ' .. v.timer_text end
    v.timer_pressable = ts.pressable == true
    v.timer_running = ts.ticking == true
    v.timer_colour = ts.color or 'normal'
    v.timer_mode = ts.mode
    v.timer_value = value
    v.timer_timered = ts.beingTimered == true
    v.timer_on_pvp = (MP.pvp and MP.pvp.on_pvp_blind and MP.pvp.on_pvp_blind()) and true or false
    v.timer_ready = (pvp and pvp.ready) == true
  else
    v.timer_text = '--'
    v.timer_pressable, v.timer_running, v.timer_colour = false, false, 'normal'
    v.timer_mode, v.timer_value, v.timer_timered, v.timer_on_pvp, v.timer_ready = nil, 0, false, false, false
  end

  -- Enemy location (HUD-02)
  local loc_disabled = r and r.flags and r.flags.enemyLocationDisabled
  v.enemy_name = st.target and RU.name_of(st.target) or RU.opponent_title()
  if loc_disabled then
    v.enemy_loc = '-'
    v.enemy_loc_blind = nil
  else
    v.enemy_loc = RU.location_text(enemy.location)
    v.enemy_loc_blind = RU.location_blind(enemy.location)
    local pres = st.presence and st.target and st.presence[st.target]
    if pres and pres.status == 'catching_up' then
      v.enemy_loc = v.enemy_loc .. RU.t('rmh_mp_catching_up', ' (catching up)')
    end
  end
  v.enemy_loc_label = table.concat(RU.tl('ml_enemy_loc', { 'Enemy', 'location' }), ' ')

  -- PvP blind panel (HUD-03)
  local on_pvp = MP.pvp and MP.pvp.on_pvp_blind and MP.pvp.on_pvp_blind() or false
  v.on_pvp = on_pvp and true or false
  v.opponent_title = RU.opponent_title()
  if on_pvp then
    local hide = MP.option('hideScoreUntilPlayed', false)
      and ((G.GAME and G.GAME.current_round and G.GAME.current_round.hands_played) or 0) == 0
    if not enemy.info_received or hide then
      RU.ease_score(0, t)
      v.enemy_score = '???'
    else
      v.enemy_score = score_text(RU.ease_score(enemy.score or 0, t))
    end
    v.score_label = RU.t('k_enemy_score', 'Current Enemy score')
    v.reward_label = RU.t('k_enemy_hands', 'Enemy hands left: ')
    v.reward_value = tostring(math.max(0, math.floor(enemy.hands or 0)))
    v.blind_name = v.opponent_title
  else
    v.score_label = RU.t('ph_blind_score_at_least', 'Score at least')
    local gm = G.GAME
    local nb = gm and gm.modifiers and gm.modifiers.no_blind_reward
    local bt = gm and gm.blind and gm.blind.get_type and gm.blind:get_type()
    v.reward_label = (nb and bt and nb[bt]) and RU.t('k_no_reward', 'No reward') or (RU.t('k_reward', 'Reward') .. ': ')
    v.reward_value = (gm and gm.current_round and gm.current_round.dollars_to_be_earned) or ''
    v.blind_name = (gm and gm.blind and gm.blind.loc_name) or ''
  end

  -- Ready button (FL-06, D-01)
  if pvp.started or pvp.countdown then
    v.ready_label, v.ready_state = RU.t('b_ready', 'Ready'), 'started'
  elseif st.pairing_pending then
    v.ready_label, v.ready_state = RU.t('rmh_mp_waiting_for_pairing', 'Waiting for pairing...'), 'waiting'
  elseif pvp.ready then
    v.ready_label, v.ready_state = RU.t('b_unready', 'Unready'), 'ready'
  else
    v.ready_label, v.ready_state = RU.t('b_ready', 'Ready'), 'unready'
  end

  v.banner = RU.banner_text(t)
  return v
end

-- ── Banners: own disconnect, opponent away, waiting for the enemy (HUD-17, FL-09) ──

RU.away_seen = RU.away_seen or {}

--- The status banner text ('' when nothing to show), in priority order.
function RU.banner_text(t)
  local st = MP.state
  local pres = st.presence or {}
  local mine = me() and pres[me()]
  if mine and mine.status == 'away' then
    return RU.t('rmh_mp_reconnecting', 'Connection lost, reconnecting...')
  end
  t = t or now()
  -- Per frame: list (and sort) the players only when someone else is away.
  local any_away = false
  for id, p in pairs(pres) do
    if id ~= me() and p and p.status == 'away' then any_away = true break end
  end
  if not any_away then
    if st.pvp.waiting then return RU.t('k_wait_enemy', 'Waiting for enemy to finish...') end
    return ''
  end
  local ids = {}
  for id in pairs(pres) do ids[#ids + 1] = id end
  table.sort(ids)
  for _, id in ipairs(ids) do
    local p = pres[id]
    if id ~= me() and p and p.status == 'away' then
      local seen = RU.away_seen[id]
      if not seen or seen.ms ~= p.graceMsLeft then
        seen = { ms = p.graceMsLeft, t0 = t }
        RU.away_seen[id] = seen
      end
      local text = RU.tv('rmh_mp_player_away', '#1# is away', { RU.name_of(id) })
      if p.graceMsLeft then
        local left = math.max(0, math.ceil(p.graceMsLeft / 1000 - (t - seen.t0)))
        text = text .. ' - ' .. left .. 's'
      end
      return text
    end
  end
  if st.pvp.waiting then return RU.t('k_wait_enemy', 'Waiting for enemy to finish...') end
  return ''
end

-- ── Toasts ──────────────────────────────────────────────────────────────────

function RU.toast(text, colour, hold)
  RU.toasts = RU.toasts or {}
  RU.toasts[#RU.toasts + 1] = text
  if #RU.toasts > 20 then table.remove(RU.toasts, 1) end
  if MP.ui.toast then
    local ok = pcall(MP.ui.toast, text, nil, { default = text, colour = colour, hold = hold })
    if ok then return true end
  end
  if not (g('attention_text') and G.play) then return false end
  attention_text({ text = text, scale = 0.7, hold = hold or 3, major = G.play, align = 'tm',
    offset = { x = 0, y = -1 }, colour = gc('WHITE'), backdrop_colour = colour or RU.MP_PURPLE, silent = true })
  return true
end

local function sound(name, per, vol)
  if g('play_sound') then pcall(play_sound, name, per, vol) end
end
RU.sound = sound

-- ── HUD tree surgery ────────────────────────────────────────────────────────

local function UIT() return G.UIT end

local function dyna(ref, colours, scale, extra)
  local cfg = { string = { { ref_table = RU.view, ref_value = ref } }, colours = colours, shadow = true,
    scale = scale }
  for k, val in pairs(extra or {}) do cfg[k] = val end
  if g('DynaText') then return DynaText(cfg) end
  return cfg
end
RU.dyna = dyna

local function en_font()
  return G.LANGUAGES and G.LANGUAGES['en-us'] and G.LANGUAGES['en-us'].font or nil
end

--- Replace the Ante box contents with the Lives box (HUD-01). Returns true when patched.
function RU.patch_lives(def, scale)
  local box = tree.find_id(def, 'hud_ante')
  if not box then return false end
  local inner = box.nodes and box.nodes[2]
  local dark = inner and inner.config and inner.config.colour or gc('BLACK')
  local U = UIT()
  box.nodes = {
    { n = U.R, config = { align = 'cm', minh = 0.33, maxw = 1.35 }, nodes = {
      { n = U.T, config = { ref_table = RU.view, ref_value = 'lives_label', scale = 0.85 * scale, colour = G.C.UI.TEXT_LIGHT, shadow = true } },
    } },
    { n = U.R, config = { align = 'cm', r = 0.1, minw = 1.2, colour = dark, id = 'mp_lives_row' }, nodes = {
      { n = U.O, config = { id = 'ante_UI_count', object = dyna('my_lives', { gc('IMPORTANT') }, 2 * scale, { font = en_font() }) } },
      { n = U.T, config = { text = ' vs ', scale = 0.6 * scale, colour = G.C.UI.TEXT_DARK or gc('WHITE'), shadow = true } },
      { n = U.O, config = { id = 'mp_opp_lives', object = dyna('opp_lives', { gc('RED') }, 1.6 * scale, { font = en_font() }) } },
    } },
  }
  return true
end

--- Replace the Round box with the Timer box (TIM-01). The timer value carries round_UI_count.
function RU.patch_timer(def, scale)
  local _, row = tree.find_id(def, 'hud_ante')
  if not row then return false end
  local col
  for _, n in ipairs(row.nodes or {}) do
    if n ~= tree.find_id(def, 'hud_ante') and tree.contains_id(n, 'round_UI_count') then col = n end
  end
  if not col then return false end
  local inner = tree.find_id(col, 'row_round_text')
  local dark = inner and inner.config and inner.config.colour or gc('BLACK')
  RU.timer_dark = dark
  local U = UIT()
  col.config = col.config or {}
  col.config.id = 'mp_timer_box'
  col.nodes = {
    { n = U.R, config = { align = 'cm', minh = 0.33, maxw = 1.35 }, nodes = {
      { n = U.T, config = { ref_table = RU.view, ref_value = 'timer_label', scale = 0.85 * scale, colour = G.C.UI.TEXT_LIGHT, shadow = true } },
    } },
    { n = U.R, config = { id = 'row_round_text', align = 'cm', r = 0.1, minw = 1.2, colour = dark, button = 'mp_timer_press',
      func = 'mp_timer_ui', hover = true, shadow = true }, nodes = {
      { n = U.O, config = { id = 'round_UI_count', object = dyna('timer_text', { RU.timer_fg }, 1.6 * scale) } },
    } },
  }
  return true
end

RU.timer_fg = RU.timer_fg or { 1, 1, 1, 1 }

RU.LOC_CHIP_SIZE = 0.4

--- The chip sprite of the Enemy location line (one per HUD build; RU.loc_chip is the live one).
function RU.new_loc_chip()
  local A = G.ANIMATION_ATLAS
  if not (A and A.blind_chips and g('AnimatedSprite')) then return nil end
  local ok, s = pcall(AnimatedSprite, 0, 0, RU.LOC_CHIP_SIZE, RU.LOC_CHIP_SIZE, A.blind_chips, { x = 0, y = 0 })
  if not ok or not s then return nil end
  if s.define_draw_steps then
    pcall(s.define_draw_steps, s, { { shader = 'dissolve', shadow_height = 0.05 }, { shader = 'dissolve' } })
  end
  if s.states then s.states.visible = false end
  s.mp_loc_blind = nil
  RU.loc_chip = s
  return s
end

--- Point the location chip at view.enemy_loc_blind (the blind's own atlas for MP blinds); hide it
--- when the location names no blind. Cheap when nothing changed.
function RU.sync_loc_chip(v)
  local s = RU.loc_chip
  if not s or s.REMOVED then return end
  local key = v.enemy_loc_blind
  if s.states then s.states.visible = key ~= nil end
  if not key or s.mp_loc_blind == key then return end
  local proto = G.P_BLINDS and G.P_BLINDS[key]
  local R = MP.registry
  local atlas = (R and R.atlas and R.atlas.blind_atlas and R.atlas.blind_atlas(key))
    or (G.ANIMATION_ATLAS and G.ANIMATION_ATLAS.blind_chips)
  if not (proto and atlas) then return end
  s.mp_loc_blind = key
  s.atlas = atlas
  if s.set_sprite_pos then pcall(s.set_sprite_pos, s, proto.pos or { x = 0, y = 0 }) end
end

--- Add the Enemy location line under the round score (HUD-02); chip_UI_count stays where it is.
function RU.patch_location(def)
  local row = tree.find_id(def, 'row_dollars_chips')
  if not row or not row.nodes then return false end
  local U = UIT()
  local label = RU.tl('ml_enemy_loc', { 'Enemy', 'location' })
  local label_rows = {}
  for i, line in ipairs(label) do
    label_rows[i] = { n = U.R, config = { align = 'cm', maxw = 1.3 }, nodes = {
      { n = U.T, config = { text = line, scale = 0.3, colour = G.C.UI.TEXT_LIGHT, shadow = true } } } }
  end
  -- The blind the enemy is at (HUD-02): a small chip before the text, hidden when none is named.
  local loc_nodes = {}
  local chip = RU.new_loc_chip()
  if chip then
    loc_nodes[#loc_nodes + 1] = { n = U.O, config = { object = chip, id = 'mp_enemy_loc_chip' } }
    loc_nodes[#loc_nodes + 1] = { n = U.B, config = { w = 0.08, h = 0.1 } }
  end
  loc_nodes[#loc_nodes + 1] = { n = U.T, config = { ref_table = RU.view, ref_value = 'enemy_loc', scale = 0.32,
    colour = gc('WHITE'), shadow = true, id = 'mp_enemy_loc_text' } }
  local loc_row = { n = U.R, config = { align = 'cm', padding = 0.05, id = 'mp_enemy_location' }, nodes = {
    { n = U.C, config = { align = 'cm', minw = 1.3 }, nodes = label_rows },
    { n = U.C, config = { align = 'cm', minw = 3.3, minh = 0.45, r = 0.1, colour = G.C.DYN_UI and G.C.DYN_UI.BOSS_DARK or gc('BLACK'),
      on_demand_tooltip = { text = { { ref_table = RU.view, ref_value = 'enemy_name' } } } }, nodes = {
      { n = U.R, config = { align = 'cm' }, nodes = loc_nodes },
    } },
  } }
  local old = row.nodes
  row.nodes = { { n = U.C, config = { align = 'cm' }, nodes = {
    { n = U.R, config = { align = 'cm' }, nodes = old },
    loc_row,
  } } }
  return true
end

--- Lobby Info button next to Run Info (HUD-09): both shrink to minh 1.2.
function RU.patch_buttons(def, scale)
  local area = tree.find_id(def, 'button_area')
  if not area or not area.nodes then return false end
  for _, n in ipairs(area.nodes) do
    if n.config and n.config.minh then n.config.minh = 1.2 end
  end
  local U = UIT()
  local lines = RU.tl('ml_lobby_info', { 'Lobby', 'Info' })
  local rows = {}
  for i, line in ipairs(lines) do
    rows[i] = { n = U.R, config = { align = 'cm', padding = 0, maxw = 1.4 }, nodes = {
      { n = U.T, config = { text = line, scale = (i == 1 and 1.2 or 1) * scale, colour = G.C.UI.TEXT_LIGHT, shadow = true } } } }
  end
  local btn = { n = U.R, config = { id = 'mp_lobby_info_button', align = 'cm', minh = 1.2, minw = 1.5, padding = 0.05, r = 0.1,
    hover = true, colour = RU.MP_PURPLE, button = 'mp_lobby_info', shadow = true }, nodes = rows }
  local ok = tree.insert_after(area, function(n) return n.config and n.config.id == 'run_info_button' end, btn)
  if not ok then table.insert(area.nodes, 1, btn) end
  return true
end

--- The whole create_UIBox_HUD surgery. Matches only: practice keeps the vanilla Ante/Round boxes
--- (no lives, no timer, PR-02).
function RU.patch_hud(def)
  if type(def) ~= 'table' then return def end
  local kind = MP.session_kind()
  if kind ~= 'match' then return def end
  local scale = 0.4
  RU.patch_lives(def, scale)
  RU.patch_timer(def, scale)
  RU.patch_location(def)
  RU.patch_buttons(def, scale)
  return def
end

-- ── G.FUNCS used by the patched nodes ───────────────────────────────────────

local function mix(a, b, k)
  return { a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k, 1 }
end

--- The game's mix_colours(C1, C2, p): p of C1 and 1 - p of C2.
local function mix_colours(c1, c2, p) return mix(c2, c1, p) end
RU.mix_colours = mix_colours

--- A one-second SMODS gradient over `stops` at phase t: equal segments with the default cosine
--- ("trig") easing between neighbouring stops, the last easing back to the first.
function RU.gradient(stops, t)
  local n = #stops
  local x = (tonumber(t) or 0) % 1
  if x ~= x then x = 0 end
  local i = math.ceil(x * n)
  if i == 0 then i = 1 end
  local a, b = stops[i], stops[i == n and 1 or i + 1]
  local k = (x % (1 / n)) * n
  local e = 0.5 * (1 - math.cos(k * math.pi))
  return { a[1] + e * (b[1] - a[1]), a[2] + e * (b[2] - a[2]), a[3] + e * (b[3] - a[3]), 1 }
end

--- The mod's `mp_timer_accelerated` text gradient (ui/game/timer.lua): over each second the text
--- runs a light orange (mix_colours(WHITE, IMPORTANT, 0.55)) -> IMPORTANT, holds IMPORTANT, and
--- eases back.
function RU.timer_pulse(t)
  local imp = gc('IMPORTANT', { 1, 0.6, 0, 1 })
  return RU.gradient({ mix_colours(gc('WHITE', { 1, 1, 1, 1 }), imp, 0.55), imp, imp, imp, imp }, t)
end

RU.SPEEDLATRO_SPEEDUP = 2 -- the speedlatro_timer layer's timer_speedup_multiplier (timer-model.ts)

--- The mod's `mp_speedlatro_timer_accelerated` text gradient (ui/game/timer.lua): WHITE for four
--- of its five stops, then mix_colours(IMPORTANT, WHITE, 0.55), cosine-eased, one-second cycle.
function RU.speedlatro_pulse(phase)
  local w = gc('WHITE', { 1, 1, 1, 1 })
  local imp = gc('IMPORTANT', { 1, 0.6, 0, 1 })
  return RU.gradient({ w, w, w, w, mix_colours(imp, w, 0.55) }, phase)
end

RU.speed_seen = RU.speed_seen or { value = nil, at = 0 }

--- The Speedlatro clock's text, as the mod's mp_update_speedlatro_timer: the gradient while being
--- timered (the clock runs x2) off the PvP blind with time left, G.C.WHITE otherwise. The gradient's
--- phase is the clock itself, -(value) / speedup, or 0 while ready (the mod's ready_blind). The value
--- arrives at 10 Hz; between two updates a ticking clock is carried on at the timered rate (at most
--- one update interval) so the colour moves per frame as the mod's per-frame clock does.
function RU.speedlatro_colour(v, t)
  local white = gc('WHITE', { 1, 1, 1, 1 })
  local value = tonumber(v.timer_value) or 0
  if not (v.timer_timered and not v.timer_on_pvp and value > 0) then return white end
  local seen = RU.speed_seen
  t = tonumber(t) or 0
  if seen.value ~= value then seen.value, seen.at = value, t end
  local est = value
  if v.timer_running then
    est = math.max(0, value - math.min(math.max(t - seen.at, 0), 0.1) * RU.SPEEDLATRO_SPEEDUP)
  end
  local phase = v.timer_ready and 0 or -est
  return RU.speedlatro_pulse(phase / RU.SPEEDLATRO_SPEEDUP)
end

--- Colours of the timer box for the current view (pure; exposed for specs). As the mod's
--- set_timer_box: running, the box stays dark and the TEXT pulses; pressable (the opponent can be
--- timered), an IMPORTANT box with light text.
function RU.timer_colours(v, t)
  v = v or RU.view
  t = t or now()
  local white = gc('WHITE', { 1, 1, 1, 1 })
  local fg = white
  if v.timer_colour == 'orange' then fg = gc('ORANGE', fg) end
  if v.timer_colour == 'important' then fg = gc('IMPORTANT', fg) end
  local bg = RU.timer_dark or gc('BLACK', { 0, 0, 0, 1 })
  if v.timer_mode == 'speedlatro' and not v.timer_pressable then
    -- Speedlatro: the clock's own text colours (white, or its gradient while timered)
    fg = RU.speedlatro_colour(v, t)
  elseif v.timer_running then
    fg = RU.timer_pulse(t)
  elseif v.timer_pressable then
    bg = gc('IMPORTANT', bg)
    fg = (G.C and G.C.UI and G.C.UI.TEXT_LIGHT) or white
  end
  return fg, bg
end

function RU.install_funcs()
  if not (G and G.FUNCS) then return end
  G.FUNCS.mp_timer_press = function()
    if MP.timer and MP.timer.press and MP.timer.press() then sound('timpani', 1.2, 0.6) end
  end
  G.FUNCS.mp_timer_ui = function(e)
    local fg, bg = RU.timer_colours()
    for i = 1, 4 do RU.timer_fg[i] = fg[i] or 1 end
    e.config.colour = bg
  end
  G.FUNCS.mp_lobby_info = function()
    if MP.ui.lobby_info and MP.ui.lobby_info.open then MP.ui.lobby_info.open() end
  end
end

-- ── Per-frame: view refresh, popups and sounds (HUD-01/07/08) ──────────────

RU.prev = RU.prev or {}

local function lives_popup(delta, mine)
  if delta == 0 or not (G.HUD and g('attention_text')) then return end
  local node = G.HUD:get_UIE_by_ID(mine and 'ante_UI_count' or 'mp_opp_lives')
  if not node then return end
  attention_text({ text = (delta > 0 and '+' or '-') .. math.abs(delta), scale = 0.8, hold = 0.8,
    cover = node.parent, cover_colour = delta > 0 and gc('GREEN') or gc('RED'), align = 'cm' })
end

--- Edge-triggered effects; returns the list of effects fired (for specs).
function RU.effects(t)
  local st = MP.state
  local p = RU.prev
  local fired = {}
  local my = RU.my_lives()
  local opp = RU.opponent_lives()
  local target = st.target
  if p.target == target then
    if p.my and my and my ~= p.my then
      -- the mod's PVP.UI.ease_lives: the +n / -n popup with highlight2 + generic1, either way
      fired[#fired + 1] = 'my_lives'
      lives_popup(my - p.my, true)
      sound('highlight2', 0.685, 0.2); sound('generic1')
    end
    if p.opp and opp and opp ~= p.opp then
      fired[#fired + 1] = 'opp_lives'
      lives_popup(opp - p.opp, false)
      if opp < p.opp then sound('holo1'); sound('gong', 1, 0.6) end
    end
    local skips = st.enemy.skips or 0
    if p.skips and skips > p.skips and not is_major_league() then
      fired[#fired + 1] = 'opp_skip'
      sound('negative'); sound('gong', 1.4, 0.4)
    end
  end
  local pend = st.opponent_pending
  if pend and pend ~= p.pending then
    fired[#fired + 1] = 'survivor'
    RU.toast(RU.t('k_pvp_pending_death_survivor', 'Opponent lost their last life to the blind, finish this blind to end the game!'),
      gc('RED'), RU.SURVIVOR_HOLD)
  end
  local host = sess() and sess().hostId
  if p.host and host and host ~= p.host then
    fired[#fired + 1] = 'host'
    if host == me() then RU.toast(RU.t('rmh_mp_host_you', 'You are now the host'))
    else RU.toast(RU.t('rmh_mp_host_migrating', 'Host left - switching host...')) end
  end
  for id, pr in pairs(st.presence or {}) do
    local was = p.presence and p.presence[id]
    if pr.status ~= was then
      if pr.status == 'forfeited' or pr.status == 'left' then
        fired[#fired + 1] = 'forfeit:' .. id
        if id ~= me() then RU.toast(RU.tv('rmh_mp_player_forfeit', '#1# forfeited', { RU.name_of(id) }), gc('RED')) end
      end
    end
  end
  p.my, p.opp, p.target, p.skips, p.pending, p.host = my, opp, target, st.enemy.skips or 0, pend, host
  -- Updated in place (this runs every frame).
  local seen = p.presence or {}
  p.presence = seen
  for id in pairs(seen) do if not (st.presence and st.presence[id]) then seen[id] = nil end end
  for id, pr in pairs(st.presence or {}) do seen[id] = pr.status end
  return fired
end

-- The status banner: a small UIBox at the top of the play area, shown while view.banner is set.
function RU.update_banner()
  local text = RU.view.banner or ''
  if text == '' then
    if RU.banner_box then RU.banner_box.states.visible = false end
    return
  end
  if not RU.banner_box and g('UIBox') and G.ROOM_ATTACH then
    local U = UIT()
    RU.banner_box = UIBox({
      definition = { n = U.ROOT, config = { align = 'cm', padding = 0.08, r = 0.1, colour = { 0, 0, 0, 0.6 } }, nodes = {
        { n = U.T, config = { ref_table = RU.view, ref_value = 'banner', scale = 0.45, colour = gc('WHITE'), shadow = true } },
      } },
      config = { align = 'tm', offset = { x = 0, y = 0.6 }, major = G.ROOM_ATTACH, bond = 'Weak' },
    })
  end
  if RU.banner_box then RU.banner_box.states.visible = true end
end

function RU.remove_banner()
  if RU.banner_box then pcall(function() RU.banner_box:remove() end) end
  RU.banner_box = nil
end

--- PvP blind: keep the blind's chip text equal to the shown enemy score (HUD-03).
local function sync_blind_text(v)
  local b = G.GAME and G.GAME.blind
  if not b then return end
  if v.on_pvp then
    if b.chip_text ~= v.enemy_score then b.chip_text = v.enemy_score end
  end
end

function RU.frame(dt)
  if not MP.in_session() then
    if RU.banner_box then RU.remove_banner() end
    return
  end
  local kind = MP.session_kind()
  if kind ~= 'match' and kind ~= 'practice' then return end
  local t = now()
  RU.compute(RU.view, t)
  sync_blind_text(RU.view)
  RU.sync_loc_chip(RU.view)
  if MP.ui.pvp_hud and MP.ui.pvp_hud.frame then MP.ui.pvp_hud.frame(RU.view) end
  if kind == 'match' then
    RU.effects(t)
    RU.update_banner()
    if MP.ui.nemesis_rows and MP.ui.nemesis_rows.frame then MP.ui.nemesis_rows.frame(dt) end
  elseif RU.view.banner ~= '' then
    RU.update_banner()
  elseif RU.banner_box then
    RU.banner_box.states.visible = false
  end
  if MP.ui.lobby_info and MP.ui.lobby_info.frame then MP.ui.lobby_info.frame(dt) end
end

-- ── Install ─────────────────────────────────────────────────────────────────

local mods = {}
local function load(name)
  local ok, m = pcall(require, name)
  if ok then mods[name] = m; return m end
  MP.log('error', 'in-run UI module %s failed to load: %s', name, tostring(m))
  return nil
end

RU.modules = {
  'rmh_mp.ui.countdown', 'rmh_mp.ui.pvp_hud', 'rmh_mp.ui.blind_select', 'rmh_mp.ui.nemesis_rows',
  'rmh_mp.ui.pause', 'rmh_mp.ui.end_screen', 'rmh_mp.ui.lobby_info',
  'rmh_mp.preview', -- Score Preview (M03): its HUD rows, button and invalidation wraps
}
for _, name in ipairs(RU.modules) do load(name) end

--- Session installer (group 'session', run at every mount).
function RU.install()
  RU.prev = {}
  RU.away_seen = {}
  RU.reset_ease()
  RU.remove_banner()
  RU.install_funcs()
  local wrap = MP.hooks.wrap
  wrap(_G, 'create_UIBox_HUD', function(orig, ...)
    local def = orig(...)
    local ok, err = pcall(RU.patch_hud, def)
    if not ok then MP.log('error', 'HUD patch failed: %s', tostring(err)) end
    return def
  end, { group = 'session', optional = true, id = 'ui.hud' })
  for _, name in ipairs(RU.modules) do
    local m = mods[name]
    if m and m.install then
      local ok, err = pcall(m.install)
      if not ok then MP.log('error', '%s install failed: %s', name, tostring(err)) end
    end
  end
end

if MP.session and MP.session.add_installer then MP.session.add_installer(RU.install) end
-- Loaded after a session was mounted (MP.open requires this lazily): install now.
if MP.in_session() then
  local ok, err = pcall(RU.install)
  if not ok then MP.log('error', 'in-run UI late install failed: %s', tostring(err)) end
end
if MP.net and MP.net.add_frame_hook then
  RU.frame_hook = RU.frame_hook or function(dt)
    local ok, err = pcall(RU.frame, dt)
    if not ok and not RU.frame_error_logged then
      RU.frame_error_logged = true
      MP.log('error', 'in-run UI frame failed: %s', tostring(err))
    end
  end
  MP.net.add_frame_hook(RU.frame_hook)
end

-- ── Autopilot surface (WS14a; test builds drive these) ──────────────────────

MP.test = MP.test or {}

local function pillar_e()
  local slot = G.GAME and G.GAME.blind_on_deck or 'Boss'
  local key = G.GAME.round_resets.blind_choices[slot]
  return { config = { ref_table = G.P_BLINDS[key] } }
end

local function need_run(name)
  if not (MP.in_session() and G.STAGE == G.STAGES.RUN and G.FUNCS.select_blind) then
    error(name .. ': not in a lobby or a run')
  end
end

function MP.test.run_ready()
  need_run('ready')
  if MP.state.pvp.ready then return { ready = true } end
  G.FUNCS.select_blind(pillar_e())
  return { ready = MP.state.pvp.ready, started = MP.state.pvp.started }
end

function MP.test.run_unready()
  need_run('unready')
  if MP.state.pvp.ready and not MP.state.pvp.started then G.FUNCS.select_blind(pillar_e()) end
  return { ready = MP.state.pvp.ready }
end

function MP.test.timer_press()
  return { sent = (MP.timer and MP.timer.press and MP.timer.press()) and true or false }
end

function MP.test.hud()
  RU.compute(RU.view)
  local out = {}
  for k, val in pairs(RU.view) do
    if type(val) ~= 'table' then out[k] = val end
  end
  return out
end

return RU
