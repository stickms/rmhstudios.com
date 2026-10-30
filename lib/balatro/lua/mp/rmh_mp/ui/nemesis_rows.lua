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
NR.GAP = 0.25
NR.MAX = 16

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
  if layout == 'classic' then
    a.jokers = CardArea(0, 0, cw / 2, ch, cfg(cl))
    a.traps = a.jokers
  else
    a.jokers = CardArea(0, 0, jw, jh, cfg(jl))
    a.traps = CardArea(0, 0, cw, ch, cfg(cl))
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

function NR.place()
  local a = NR.areas
  if not (a and G.jokers and G.consumeables) then return end
  if a.layout == 'classic' then
    place_area(a.jokers, G.consumeables.T.x + G.consumeables.T.w / 2, G.consumeables.T.y + G.consumeables.T.h + 0.4)
  elseif NR.layout() == 'mirrored' then
    place_area(a.traps, G.jokers.T.x, G.jokers.T.y - NR.GAP - a.traps.T.h)
    place_area(a.jokers, G.consumeables.T.x + G.consumeables.T.w - a.jokers.T.w, G.consumeables.T.y - NR.GAP - a.jokers.T.h)
  else
    place_area(a.jokers, G.jokers.T.x, G.jokers.T.y - NR.GAP - a.jokers.T.h)
    place_area(a.traps, G.consumeables.T.x, G.consumeables.T.y - NR.GAP - a.traps.T.h)
  end
end

local function new_card(area, key)
  local center = G.P_CENTERS[key]
  if not (center and g('Card')) then return nil end
  local card = Card(area.T.x, area.T.y, G.CARD_W, G.CARD_H, nil, center,
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
    if NR.create() then NR.areas.jokers_owner = G.jokers end
  end
  NR.rebuild()
end

--- WS9 trap events: a nemesis row changed / one of mine fired -> rebuild on the next frame.
function NR.on_trap_change(ev)
  if ev == 'row' or ev == 'held' or ev == 'fired_own' then NR.trap_sig = nil end
end

function NR.install()
  NR.received, NR.sent_sig, NR.areas = {}, nil, nil
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
    pcall(NR.place)
    return r
  end, o('place'))
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
