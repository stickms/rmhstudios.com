-- rmh_mp/ui/nemesis_rows.lua — the Nemesis rows above your jokers and consumables (HUD-06).
--
-- Phantoms: every player broadcasts the keys of its `phantom = true` jokers (registry flag, WS7) on
-- the sync bus — obj 'mp_phantom_row', kind 'phantom', data { keys = [...] } — whenever that list
-- changes and when its target changes. A receiver keeps every sender's list (the "hidden store")
-- and shows display copies of its ANTE NEMESIS's list only. A copy is a Card with
-- ability.mp_phantom = true: never in G.jokers, never added to the deck, $0, eternal, not
-- draggable, and the registry dispatch already skips its effects. The visible copies are kept in
-- MP.state.phantoms (WS7's LGG/Pizza juice them).
-- Traps: WS9's MP.traps.nemesis_row() ({uid, key, owner, mine}) is shown face down in the
-- consumable row, rebuilt on MP.traps.on_change events (row / held / fired_own); only `mine`
-- entries keep their hover details.
--
-- Layouts (WS10's MP.ui.setting('nemesisLayout'); default Standard):
--   standard  each Nemesis row sits above your own row, same x and width
--   mirrored  rows swap sides and every card is turned 180 degrees in reverse order
--   classic   one half-width row under the consumables (fixed for the run: a switch to or from
--             Classic applies from the next run)
-- Fitting the 16:9 room: vanilla puts your jokers and consumables at y = 0, and the room shows only
-- ROOM_PADDING_H (0.7) above that, so a full-size row "above" would be off-screen. Standard and
-- Mirrored rows are therefore compact (cards at NR.SCALE) and start at NR.TOP, inside the top
-- padding; while a row has cards to show, your joker and consumable areas move down by
-- NR.shift() (about 0.94: their bottom stays above the shop, whose top is at hand.y - 5.3 = 3.6)
-- and move back when the rows are empty. During Blind Select the rows hide and nothing moves, as
-- vanilla anchors the blind choices to G.jokers.T.y when it builds them. Only T moves (the areas
-- ease there), so your cards stay usable; hit areas follow the cards as everywhere in the game.
-- Phantom copies' tooltips carry a "Phantom" badge in place of the eternal one.
--
--   NR.phantom_keys()          my phantom-flagged joker keys (sorted)
--   NR.receive(from, data)     sync receiver (also used by specs)
--   NR.visible_keys()          keys the visible row should show now
--   NR.frame()                 send on change, rebuild on change (called by ui/hud.lua)

local MP = require 'rmh_mp.state'

MP.ui = MP.ui or {}
local NR = MP.ui.nemesis_rows or {}
MP.ui.nemesis_rows = NR

NR.OBJ = 'mp_phantom_row'
NR.MAX = 16
NR.SCALE = 0.55      -- Standard/Mirrored card scale
NR.TOP = -0.6        -- top of the compact rows, relative to the own rows' vanilla y (padding 0.7)
NR.ROW_GAP = 0.1     -- between a compact row and the own row under it
NR.CLASSIC_GAP = 0.4 -- Classic: below the consumables
NR.BADGE = 'rmh_mp_phantom'
NR.BADGE_COLOUR = { 0.42, 0.40, 0.55, 1 }

NR.received = NR.received or {}
NR.sent_sig = nil

local function g(name) return rawget(_G, name) end

function NR.layout()
  local l = MP.ui.setting and MP.ui.setting('nemesisLayout') or nil
  if l == 'mirrored' or l == 'classic' then return l end
  return 'standard'
end

local function sorted_copy(list)
  local out = {}
  for i, v in ipairs(list or {}) do if type(v) == 'string' then out[#out + 1] = v end; if i >= NR.MAX then break end end
  table.sort(out)
  return out
end

function NR.phantom_keys()
  local keys = {}
  for _, c in ipairs((G.jokers and G.jokers.cards) or {}) do
    local key = c.config and c.config.center and c.config.center.key
    local def = key and MP.registry and MP.registry.get and MP.registry.get(key)
    if def and def.phantom and not (c.ability and c.ability.mp_phantom) then keys[#keys + 1] = key end
  end
  return sorted_copy(keys)
end

local function sig(list) return table.concat(list or {}, ',') end

function NR.receive(from, data)
  if type(from) ~= 'string' or type(data) ~= 'table' then return end
  local keys = {}
  for _, k in ipairs(type(data.keys) == 'table' and data.keys or {}) do
    if type(k) == 'string' and G.P_CENTERS and G.P_CENTERS[k] then keys[#keys + 1] = k end
  end
  NR.received[from] = sorted_copy(keys)
end

function NR.nemesis()
  local st = MP.state
  return (st.ante_nemesis and st.ante_nemesis[1]) or st.target
end

function NR.visible_keys()
  local id = NR.nemesis()
  return (id and NR.received[id]) or {}
end

--- The face-down trap row for my ante nemesis (WS9 MP.traps.nemesis_row(): {uid, key, owner,
--- mine}); entries whose key is not mounted are dropped.
function NR.trap_list()
  local out = {}
  local T = MP.traps
  if not (T and T.nemesis_row) then return out end
  local ok, row = pcall(T.nemesis_row)
  if not ok or type(row) ~= 'table' then return out end
  for _, e in ipairs(row) do
    if type(e) == 'table' and type(e.key) == 'string' and G.P_CENTERS and G.P_CENTERS[e.key] then
      out[#out + 1] = e
    end
    if #out >= NR.MAX then break end
  end
  return out
end

local function trap_sig(list)
  local parts = {}
  for i, e in ipairs(list) do parts[i] = tostring(e.uid) .. ':' .. e.key .. (e.mine and '*' or '') end
  return table.concat(parts, ',')
end

-- ── Areas ────────────────────────────────────────────────────────────────────

NR.areas = NR.areas or nil

local function alive(area) return area and not area.REMOVED end

function NR.create()
  if not (g('CardArea') and G.jokers and G.consumeables and G.jokers.T and G.consumeables.T) then return false end
  NR.remove()
  local layout = NR.layout()
  local jw, jh = G.jokers.T.w, G.jokers.T.h
  local cw, ch = G.consumeables.T.w, G.consumeables.T.h
  -- 'title' areas draw no backdrop and no "n/limit" count (display rows, not slots).
  local cfg = function(limit) return { card_limit = limit, type = 'title', highlight_limit = 0 } end
  local jl = (G.jokers.config and G.jokers.config.card_limit) or 5
  local cl = (G.consumeables.config and G.consumeables.config.card_limit) or 2
  local a = { layout = layout }
  local function area(w, h, limit, scale)
    local c = cfg(limit)
    c.card_w = G.CARD_W * scale
    local ar = CardArea(0, 0, w, h, c)
    ar.T.w, ar.T.h = w, h
    ar.mp_card_scale = scale
    return ar
  end
  if layout == 'classic' then
    a.jokers = area(cw / 2, ch, cl, 1)
    a.traps = a.jokers
  else
    a.jokers = area(jw, jh * NR.SCALE, jl, NR.SCALE)
    a.traps = area(cw, ch * NR.SCALE, cl, NR.SCALE)
  end
  a.jokers.mp_nemesis_row = true
  a.traps.mp_nemesis_row = true
  NR.areas = a
  NR.shown_sig, NR.trap_sig = nil, nil
  NR.place()
  return true
end

function NR.remove()
  local a = NR.areas
  NR.areas = nil
  MP.state.phantoms = {}
  NR.unshift()
  if not a then return end
  for _, area in ipairs({ a.jokers, a.traps }) do
    if alive(area) then
      for i = #area.cards, 1, -1 do pcall(function() area.cards[i]:remove() end) end
      pcall(function() area:remove() end)
    end
  end
end

local function place_area(area, x, y)
  area.T.x, area.T.y = x, y
  if area.hard_set_VT then area:hard_set_VT() end
end

-- ── Placement ────────────────────────────────────────────────────────────────

NR.applied = NR.applied or 0 -- how far the own joker/consumable areas are moved down right now

--- How far the own rows move down while a compact row is shown.
function NR.shift()
  local h = (NR.areas and NR.areas.jokers and NR.areas.jokers.T.h) or 0
  return math.max(0, NR.TOP + h + NR.ROW_GAP)
end

local function own_alive() return G.jokers and G.jokers.T and G.consumeables and G.consumeables.T end

local function move_own(to)
  local d = to - (NR.applied or 0)
  if d ~= 0 and own_alive() then
    G.jokers.T.y = G.jokers.T.y + d
    G.consumeables.T.y = G.consumeables.T.y + d
  end
  NR.applied = to
end

--- Put the own rows back where vanilla placed them.
function NR.unshift() move_own(0) end

--- A compact row is drawn now: it has cards, and the blind choices are not up.
function NR.rows_shown()
  local a = NR.areas
  if not a or a.layout == 'classic' then return false end
  if G.STATE and G.STATES and G.STATE == G.STATES.BLIND_SELECT then return false end
  local n = (alive(a.jokers) and #a.jokers.cards or 0) + (alive(a.traps) and #a.traps.cards or 0)
  return n > 0
end

function NR.place()
  local a = NR.areas
  if not (a and own_alive()) then return end
  if a.layout == 'classic' then
    move_own(0)
    place_area(a.jokers, G.consumeables.T.x + G.consumeables.T.w / 2,
      G.consumeables.T.y + G.consumeables.T.h + NR.CLASSIC_GAP)
    NR.placed_shown = false
    return
  end
  local shown = NR.rows_shown()
  move_own(shown and NR.shift() or 0)
  local jy = G.jokers.T.y - NR.applied + NR.TOP
  local cy = G.consumeables.T.y - NR.applied + NR.TOP
  if NR.layout() == 'mirrored' then
    place_area(a.traps, G.jokers.T.x, jy)
    place_area(a.jokers, G.consumeables.T.x + G.consumeables.T.w - a.jokers.T.w, cy)
  else
    place_area(a.jokers, G.jokers.T.x, jy)
    place_area(a.traps, G.consumeables.T.x, cy)
  end
  for _, ar in ipairs({ a.jokers, a.traps }) do
    if alive(ar) and ar.states then ar.states.visible = shown end
  end
  NR.placed_shown = shown
end

local function new_card(area, key)
  local center = G.P_CENTERS[key]
  if not (center and g('Card')) then return nil end
  local scale = area.mp_card_scale or 1
  local card = Card(area.T.x, area.T.y, G.CARD_W * scale, G.CARD_H * scale, nil, center,
    { bypass_discovery_center = true, bypass_discovery_ui = true, discover = false })
  card.ability = card.ability or {}
  card.ability.mp_phantom = true
  card.ability.eternal = true
  card.sell_cost = 0
  if card.states and card.states.drag then card.states.drag.can = false end
  area:emplace(card)
  return card
end

local function clear(area, pred)
  for i = #area.cards, 1, -1 do
    local c = area.cards[i]
    if pred(c) then
      area:remove_card(c)
      pcall(function() c:remove() end)
    end
  end
end

function NR.rebuild()
  local a = NR.areas
  if not (a and alive(a.jokers)) then return end
  local keys = NR.visible_keys()
  local s = tostring(NR.nemesis()) .. '|' .. sig(keys)
  if s ~= NR.shown_sig then
    NR.shown_sig = s
    clear(a.jokers, function(c) return not c.ability.mp_trap_display end)
    local list = {}
    for _, k in ipairs(keys) do
      local c = new_card(a.jokers, k)
      if c then c.ability.mp_phantom_from = NR.nemesis(); list[#list + 1] = c end
    end
    MP.state.phantoms = list
  end
  local traps = NR.trap_list()
  local ts = trap_sig(traps)
  if ts ~= NR.trap_sig and alive(a.traps) then
    NR.trap_sig = ts
    clear(a.traps, function(c) return c.ability.mp_trap_display end)
    local shown = {}
    for _, e in ipairs(traps) do
      local c = new_card(a.traps, e.key)
      if c then
        c.ability.mp_trap_display = true
        c.ability.mp_trap_uid, c.ability.mp_trap_mine = e.uid, e.mine == true
        c.facing, c.sprite_facing = 'back', 'back'
        -- Only the trap's owner may read it (A1 5.3.4): no hover details for the others.
        if not e.mine and c.states and c.states.hover then c.states.hover.can = false end
        shown[#shown + 1] = c
      end
    end
    NR.trap_cards = shown
  end
end

--- Per frame (matches): broadcast my list on change; keep the rows built and current.
function NR.frame()
  if not MP.is_match() or not (G.jokers and G.jokers.T) then return end
  local mine = NR.phantom_keys()
  local s = sig(mine) .. '>' .. tostring(MP.state.target)
  if s ~= NR.sent_sig then
    NR.sent_sig = s
    MP.sync.send(NR.OBJ, { keys = MP.json_array(mine) }, nil, 'phantom')
  end
  if not (NR.areas and alive(NR.areas.jokers)) or NR.areas.jokers_owner ~= G.jokers then
    if NR.areas and NR.areas.jokers_owner ~= G.jokers then NR.applied = 0 end -- a new run's areas
    if NR.create() then NR.areas.jokers_owner = G.jokers end
  end
  NR.rebuild()
  if NR.areas and NR.rows_shown() ~= NR.placed_shown then NR.place() end
end

--- Card.generate_UIBox_ability_table post-step: a phantom copy shows "Phantom" instead of the
--- eternal badge it carries only to block selling.
function NR.decorate(card, ui)
  local ab = card and card.ability
  if type(ui) ~= 'table' or not (ab and ab.mp_phantom) or ab.mp_trap_display then return ui end
  ui.badges = ui.badges or {}
  for i = #ui.badges, 1, -1 do
    if ui.badges[i] == 'eternal' or ui.badges[i] == NR.BADGE then table.remove(ui.badges, i) end
  end
  ui.badges[#ui.badges + 1] = NR.BADGE
  if g('get_badge_colour') then pcall(get_badge_colour, 'eternal') end -- vanilla fills G.BADGE_COL
  G.BADGE_COL = G.BADGE_COL or {}
  if G.BADGE_COL[NR.BADGE] == nil then G.BADGE_COL[NR.BADGE] = NR.BADGE_COLOUR end
  return ui
end

--- WS9 trap events: a nemesis row changed / one of mine fired -> rebuild on the next frame.
function NR.on_trap_change(ev)
  if ev == 'row' or ev == 'held' or ev == 'fired_own' then NR.trap_sig = nil end
end

function NR.install()
  NR.received, NR.sent_sig, NR.areas = {}, nil, nil
  NR.applied, NR.placed_shown = 0, nil
  if MP.traps and MP.traps.on_change and not NR.trap_listening then
    NR.trap_listening = true
    MP.traps.on_change(NR.on_trap_change)
  end
  MP.sync.register(NR.OBJ, { receive = function(from, data, kind)
    if kind ~= 'phantom' then return end
    NR.receive(from, data)
  end })
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'ui.nemesis.' .. id } end
  wrap(_G, 'set_screen_positions', function(orig, ...)
    local r = orig(...)
    -- vanilla has just put the own rows back at their y: nothing is moved any more
    if G.STAGES and G.STAGE == G.STAGES.RUN then NR.applied = 0 end
    NR.placed_shown = nil
    pcall(NR.place)
    return r
  end, o('place'))
  if rawget(_G, 'Card') and Card.generate_UIBox_ability_table then
    wrap(Card, 'generate_UIBox_ability_table', function(orig, self, ...)
      local ui = orig(self, ...)
      local ok, out = pcall(NR.decorate, self, ui)
      if ok and out then return out end
      return ui
    end, o('badge'))
  end
  if rawget(_G, 'Game') then
    wrap(Game, 'delete_run', function(orig, self, ...)
      pcall(NR.remove)
      return orig(self, ...)
    end, o('delete_run'))
  end
  if rawget(_G, 'CardArea') then
    wrap(CardArea, 'align_cards', function(orig, self, ...)
      local r = orig(self, ...)
      if self.mp_nemesis_row and NR.areas and NR.areas.layout ~= 'classic' and NR.layout() == 'mirrored' and self.cards then
        for _, card in ipairs(self.cards) do
          if not card.states.drag.is then
            card.T.x = 2 * self.T.x + self.T.w - card.T.x - card.T.w
            card.T.r = (card.T.r or 0) + math.pi
          end
        end
      end
      return r
    end, o('mirror'))
  end
end

return NR
