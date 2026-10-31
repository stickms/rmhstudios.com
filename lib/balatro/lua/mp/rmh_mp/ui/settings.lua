-- rmh_mp/ui/settings.lua — WS10 Multiplayer settings (HUD-20, D-37, HUD-15 avatars).
--
-- Opened from the account button of the Multiplayer panel. Settings live in the profile's
-- settings (G.SETTINGS.rmh_mp, saved by the game with its own settings) and are pushed to TS as
-- ui_settings (PLAYER_INFO cosmetics, chat) on change and once when the menu opens:
--   nemesisLayout  'standard' | 'mirrored' | 'classic'   (WS11 reads MP.ui.setting('nemesisLayout'))
--   timerSound     'always' | 'once' | 'off'            (WS11's timpani cue)
--   blindCol       1..25                                 (25 previews of the Nemesis colours)
--   avatarJoker    a Joker key: the 11 starters, plus goals from local history (locked ones show
--                  as undiscovered; "Avatar Unlocked!" when a history update unlocks one)
--   showMpContent  boolean ("Show Multiplayer content anyway")
--   chat           boolean

local MP = require 'rmh_mp.state'
local TH = require 'rmh_mp.ui.theme'
local W = require 'rmh_mp.ui.widgets'

local U = MP.ui
local ST = U.settings or {}
U.settings = ST

local F = G.FUNCS

ST.DEFAULTS = { nemesisLayout = 'standard', timerSound = 'always', blindCol = 1, avatarJoker = 'j_joker',
  showMpContent = false, chat = true }
ST.LAYOUTS = { 'standard', 'mirrored', 'classic' }
ST.SOUNDS = { 'always', 'once', 'off' }

local function store()
  G.SETTINGS = G.SETTINGS or {}
  local s = G.SETTINGS.rmh_mp
  if type(s) ~= 'table' then s = {}; G.SETTINGS.rmh_mp = s end
  return s
end

--- MP.ui.setting(name): the stored value or its default.
function U.setting(name)
  local s = store()
  if s[name] == nil then return ST.DEFAULTS[name] end
  return s[name]
end

local function save()
  if G.FILE_HANDLER then G.FILE_HANDLER.settings = true end
  if G.save_settings then pcall(G.save_settings, G) end
end

--- The ui_settings payload with every field.
function ST.payload()
  return {
    avatarJoker = U.setting('avatarJoker'), blindCol = U.setting('blindCol'), nemesisLayout = U.setting('nemesisLayout'),
    timerSound = U.setting('timerSound'), showMpContent = U.setting('showMpContent') == true, chat = U.setting('chat') ~= false,
  }
end

function ST.push() return U.send('ui_settings', ST.payload()) end

--- Change one setting; validates against the known values; returns true when stored.
function ST.set(name, value)
  if name == 'nemesisLayout' and not MP.set_of(ST.LAYOUTS)[value] then return false end
  if name == 'timerSound' and not MP.set_of(ST.SOUNDS)[value] then return false end
  if name == 'blindCol' and not (type(value) == 'number' and value >= 1 and value <= 25 and value % 1 == 0) then return false end
  if name == 'avatarJoker' and not TH.avatar_unlocked(value, U.model.history) then return false end
  if (name == 'showMpContent' or name == 'chat') and type(value) ~= 'boolean' then return false end
  if ST.DEFAULTS[name] == nil then return false end
  store()[name] = value
  save()
  U.send('ui_settings', { [name] = value })
  return true
end

--- Every avatar in display order: { key, unlocked, goal }.
function ST.avatars(history)
  local out = {}
  for _, k in ipairs(TH.AVATAR_STARTERS) do out[#out + 1] = { key = k, unlocked = true } end
  for _, g in ipairs(TH.AVATAR_GOALS) do
    out[#out + 1] = { key = g.key, unlocked = TH.avatar_unlocked(g.key, history), goal = TH.avatar_goal_text(g.key) }
  end
  return out
end

--- History update: toast newly unlocked avatars (not on the first message of a session, which
--- only records what is already unlocked in the profile).
function ST.on_history(prev, cur)
  local s = store()
  s.seen_avatars = type(s.seen_avatars) == 'table' and s.seen_avatars or {}
  local fresh = {}
  for _, a in ipairs(ST.avatars(cur)) do
    if a.unlocked and a.goal and not s.seen_avatars[a.key] then
      s.seen_avatars[a.key] = true
      fresh[#fresh + 1] = a.key
    end
  end
  if #fresh > 0 then
    save()
    if prev ~= nil then
      local names = {}
      for i, k in ipairs(fresh) do names[i] = ST.joker_name(k) end
      W.toast('rmh_mp_ui_avatar_unlocked_title', nil, { default = TH.T('rmh_mp_ui_avatar_unlocked_title', 'Avatar Unlocked!') .. ' '
        .. table.concat(names, ', ') })
    end
  end
  -- A chosen avatar that is no longer unlocked (history reset) falls back to the default.
  if not TH.avatar_unlocked(U.setting('avatarJoker'), cur) then ST.set('avatarJoker', 'j_joker') end
  return fresh
end

function ST.joker_name(key)
  local d = G.localization and G.localization.descriptions and G.localization.descriptions.Joker
  return d and d[key] and d[key].name or key
end

-- ── The overlay ─────────────────────────────────────────────────────────────

local function index_of(list, v)
  for i, x in ipairs(list) do if x == v then return i end end
  return 1
end

function ST.avatar_grid(history)
  local rows, row = {}, {}
  local current = U.setting('avatarJoker')
  for _, a in ipairs(ST.avatars(history)) do
    local center = G.P_CENTERS and G.P_CENTERS[a.key]
    local node
    if center and rawget(_G, 'Card') and rawget(_G, 'CardArea') then
      local w, h = (G.CARD_W or 2.1) * 0.45, (G.CARD_H or 2.8) * 0.45
      local area = CardArea(0, 0, w, h, { card_limit = 1, type = 'title', highlight_limit = 0 })
      local shown = center
      if not a.unlocked then
        shown = {}
        for k, v in pairs(center) do shown[k] = v end
        shown.discovered = false
      end
      local ok, card = pcall(Card, 0, 0, w, h, nil, shown, { bypass_discovery_center = a.unlocked, bypass_discovery_ui = true, discover = false })
      if ok and card then
        card.states.drag.can = false
        card.click = function() if a.unlocked then F.rmh_mp_avatar_pick({ config = { ref_table = { key = a.key } } }) end end
        card.hover = function(self)
          self.config.h_popup = W.player_tooltip({ name = a.unlocked and ST.joker_name(a.key) or '?', role = 'player' },
            { build = a.goal or TH.T('rmh_mp_ui_avatar_goal_default', 'Available to everyone') })
          if self.align_h_popup then self.config.h_popup_config = self:align_h_popup() end
          if Node and Node.hover then Node.hover(self) end
        end
        area:emplace(card)
      end
      node = W.col({ W.row({ { n = G.UIT.O, config = { object = area } } }) },
        { r = 0.1, padding = 0.03, colour = a.key == current and TH.col('GREEN') or TH.col('CLEAR'), id = 'mp_avatar_' .. a.key })
    else
      node = W.col({ W.button({ label = a.unlocked and ST.joker_name(a.key) or '?',
        button = a.unlocked and 'rmh_mp_avatar_pick' or 'nil', ref_table = { key = a.key },
        colour = a.key == current and TH.col('GREEN') or TH.col('GREY'), minw = 1.2, minh = 0.6, scale = 0.25 }) },
        { id = 'mp_avatar_' .. a.key })
    end
    node.config.mp_avatar = a.key
    node.config.mp_locked = (not a.unlocked) or nil
    row[#row + 1] = node
    if #row == 11 then rows[#rows + 1] = W.row(row); row = {} end
  end
  if #row > 0 then rows[#rows + 1] = W.row(row) end
  return W.col(rows, { id = 'mp_avatar_grid' })
end

function ST.contents()
  local layouts = TH.L('ml_nemesis_layout_opt', { 'Standard', 'Mirrored', 'Classic' })
  local sounds = TH.L('ml_mp_timersfx_opt', { 'On', 'Once per Ante', 'Off' })
  local cols = {}
  for i = 1, 25 do cols[i] = tostring(i) end
  ST.ref = { showMpContent = U.setting('showMpContent') == true, chat = U.setting('chat') ~= false }
  local chip = W.blind_chip(0.8, U.setting('blindCol'))
  return {
    W.row({ W.text(TH.T('rmh_mp_ui_multiplayer', 'Multiplayer'), { scale = 0.6 }) }, { padding = 0.05 }),
    W.row({ W.text(TH.T('rmh_mp_ui_choose_avatar', 'Choose Avatar'), { scale = 0.4 }) }),
    W.row({ ST.avatar_grid(U.model.history) }, { padding = 0.05 }),
    W.row({
      W.col({ W.cycle({ id = 'mp_set_layout', label = TH.T('k_nemesis_layout', 'Nemesis layout'), options = layouts,
        current = index_of(ST.LAYOUTS, U.setting('nemesisLayout')), callback = 'rmh_mp_set_cycle', w = 2.5, scale = 0.8,
        mp = { name = 'nemesisLayout', values = ST.LAYOUTS } }) }),
      W.col({ W.cycle({ id = 'mp_set_timer_sound', label = TH.T('k_timer_sfx', 'Timer Sound Effects'), options = sounds,
        current = index_of(ST.SOUNDS, U.setting('timerSound')), callback = 'rmh_mp_set_cycle', w = 2.5, scale = 0.8,
        mp = { name = 'timerSound', values = ST.SOUNDS } }) }),
      W.col({
        W.row({ W.cycle({ id = 'mp_set_blind_col', label = TH.T('rmh_mp_ui_blind_colour', 'Blind colour'), options = cols,
          current = U.setting('blindCol'), callback = 'rmh_mp_set_cycle', w = 1.2, scale = 0.8, no_pips = true,
          mp = { name = 'blindCol' } }) }),
        chip and W.row({ { n = G.UIT.O, config = { object = chip, id = 'mp_set_blind_chip' } } }) or nil,
      }),
    }, { padding = 0.05 }),
    W.row({
      W.col({ W.toggle({ label = TH.T('k_show_mp_content_anyway', 'Show Multiplayer content anyway*'), ref_table = ST.ref,
        ref_value = 'showMpContent', callback = function(v) ST.set('showMpContent', v == true) end, w = 4, id = 'mp_set_show_mp' }) }),
      W.col({ W.toggle({ label = TH.T('rmh_mp_ui_chat_section_title', 'Chat'), ref_table = ST.ref, ref_value = 'chat',
        callback = function(v) ST.set('chat', v == true) end, w = 1.5, id = 'mp_set_chat' }) }),
    }),
  }
end

function ST.open() return W.overlay({ name = 'settings', contents = ST.contents() }) end

F.rmh_mp_set_cycle = function(args)
  local m = args and args.cycle_config and args.cycle_config.mp
  if not m then return end
  local v = m.values and m.values[args.to_key] or args.to_key
  ST.set(m.name, v)
  if m.name == 'blindCol' and W.overlay_name() == 'settings' then ST.open() end
end

F.rmh_mp_avatar_pick = function(e)
  local key = e and e.config and e.config.ref_table and e.config.ref_table.key
  if key and ST.set('avatarJoker', key) and W.overlay_name() == 'settings' then ST.open() end
end

return ST
