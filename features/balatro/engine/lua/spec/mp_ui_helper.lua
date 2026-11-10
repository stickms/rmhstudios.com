-- Shared setup for the WS10 UI specs (mp_ui_*_spec.lua). Not a spec itself.
--
--   local UH = require 'spec.mp_ui_helper'
--   local MP, G = UH.boot()          fake G + the whole MP pack + the REAL base-game UI builders
--                                    (data/balatro UI_definitions.lua, misc_functions.lua, G.C/G.UIT
--                                    from globals.lua, en-us localization + the MP en-us strings),
--                                    game objects (UIBox, Card, CardArea, DynaText, Sprite...) stubbed
--                                    as recorders; then rmh_mp.ui.menu
--   UH.view{...}                     a lobby_view from the shared fixture (types.json lobbyState)
--   UH.recv(t, d)                    inject a JS->Lua message (validated like the real one)
--   UH.find(def, id) / UH.find_all(def, pred) / UH.buttons(def) / UH.texts(def)
--   UH.click(node)                   run the node's G.FUNCS button like the engine would
--   UH.sent(t)                       messages Lua sent (after a flush)
--   UH.frame()                       one MP.net frame (renders, ticks)
--   UH.teardown()

local H = require 'spec.mp_helper'
local J = require 'spec.json_fixture'

local UH = {}
local root = (RMH_SPEC and RMH_SPEC.root) or ''
local BASE = root .. 'data/balatro/'

local function run_file(path)
  local fn = assert(loadfile(path))
  return fn()
end

-- ── Recording stand-ins for the engine's game objects ──────────────────────

local function class(name)
  local C = {}
  C.__index = C
  C.__name = name
  setmetatable(C, { __call = function(cls, ...) local o = setmetatable({}, cls); o:init(...); return o end })
  return C
end

local function make_objects()
  local Stub = {}
  local Node = class('Node')
  function Node:init(args) self.args = args; self.T = { x = 0, y = 0, w = 1, h = 1 }; self.config = {}; self.children = {}
    self.states = { drag = { can = true }, collide = { can = true }, visible = true, hover = {}, focus = {} } end
  function Node:remove() self.REMOVED = true end
  function Node:hover() self.hovered = true end
  function Node:stop_hover() end
  function Node:align_to_major() end
  function Node:set_alignment() end
  function Node:define_draw_steps() end
  function Node:set_sprite_pos(p) self.sprite_pos = p end
  function Node:juice_up() end
  function Node:align_h_popup() return { align = 'cm' } end
  Stub.Node = Node

  local UIBox = class('UIBox')
  setmetatable(UIBox, { __index = Node, __call = getmetatable(UIBox).__call })
  function UIBox:init(args)
    Node.init(self, args)
    self.definition = args.definition
    self.config = args.config or {}
    UH.boxes[#UH.boxes + 1] = self
  end
  function UIBox:get_UIE_by_ID(id)
    local n = UH.find(self.definition, id)
    if n then return { config = n.config, UIBox = self, children = { { children = { {} } } } } end
    return nil
  end
  function UIBox:recalculate() end
  Stub.UIBox = UIBox

  local function simple(name)
    local C = class(name)
    setmetatable(C, { __index = Node, __call = getmetatable(C).__call })
    function C:init(...) Node.init(self, { ... }); self.kind = name end
    return C
  end
  Stub.Moveable = simple('Moveable')
  Stub.Sprite = simple('Sprite')
  Stub.AnimatedSprite = simple('AnimatedSprite')
  Stub.DynaText = class('DynaText')
  setmetatable(Stub.DynaText, { __index = Node, __call = getmetatable(Stub.DynaText).__call })
  function Stub.DynaText:init(args) Node.init(self, args); self.string_args = args end

  local CardArea = class('CardArea')
  setmetatable(CardArea, { __index = Node, __call = getmetatable(CardArea).__call })
  function CardArea:init(x, y, w, h, cfg) Node.init(self, cfg); self.cards = {}; self.config = cfg or {} end
  function CardArea:emplace(c) self.cards[#self.cards + 1] = c; c.area = self end
  Stub.CardArea = CardArea

  local Card = class('Card')
  setmetatable(Card, { __index = Node, __call = getmetatable(Card).__call })
  function Card:init(x, y, w, h, front, center, params)
    Node.init(self, params); self.center = center; self.params = params or {}; self.config = { center = center }
    UH.cards[#UH.cards + 1] = self
  end
  Stub.Card = Card
  return Stub
end

-- ── Boot ───────────────────────────────────────────────────────────────────

function UH.boot(opts)
  opts = opts or {}
  UH.boxes, UH.cards, UH.overlays = {}, {}, {}
  local MP, G = H.boot()
  H.transport()
  -- Real base-game helpers and UI builders.
  local keep = { STATES = G.STATES, STAGES = G.STAGES, SETTINGS = G.SETTINGS, FUNCS = G.FUNCS, P_CENTERS = G.P_CENTERS,
    P_CENTER_POOLS = G.P_CENTER_POOLS, GAME = G.GAME, CONTROLLER = G.CONTROLLER, E_MANAGER = G.E_MANAGER }
  local fake_localize = _G.localize
  run_file(BASE .. 'engine/object.lua')
  run_file(BASE .. 'functions/misc_functions.lua')
  local stubs = make_objects()
  for k, v in pairs(stubs) do _G[k] = v end
  local Game = setmetatable({}, { __call = function() return {} end })
  _G.Game = Game
  _G.love = _G.love or {}
  love.system = { getOS = function() return 'Web' end }
  love.graphics = love.graphics or { getWidth = function() return 1366 end, getHeight = function() return 768 end }
  run_file(BASE .. 'globals.lua')
  _G.G = G
  Game.set_globals(G)
  for k, v in pairs(keep) do G[k] = v end
  run_file(BASE .. 'functions/UI_definitions.lua')
  _G.localize = function(a, cat)
    if type(a) == 'string' then
      local d = G.localization.misc[cat or 'dictionary']
      return d and d[a] or 'ERROR'
    end
    return fake_localize(a)
  end
  -- Localization: vanilla en-us, then the MP en-us table and our extra strings (as the pack does).
  G.localization = run_file(BASE .. 'localization/en-us.lua')
  local mp = J.read_file(root .. 'data/balatro-mp/localization/en-us.json')
  local extra = J.read_file(root .. 'data/balatro-mp/extra-strings.en-us.json')
  for _, src in ipairs({ mp, extra }) do
    for cat, t in pairs(src.misc or {}) do
      G.localization.misc[cat] = G.localization.misc[cat] or {}
      for k, v in pairs(t) do G.localization.misc[cat][k] = v end
    end
  end
  if opts.no_loc then G.localization.misc.dictionary = {}; G.localization.misc.v_dictionary = {} end
  -- Screen and the main menu.
  G.ROOM = { T = { x = 0, y = 0, w = 20, h = 11.5 } }
  G.ROOM_ATTACH = stubs.Moveable()
  G.STAGE = G.STAGES.MAIN_MENU
  G.STATE = G.STATES.MENU
  G.CARD_W, G.CARD_H = 2.1, 2.8
  G.ASSET_ATLAS = { icons = {}, balatro = { px = 333, py = 216 }, mp_pvp_title = { px = 333, py = 216 } }
  G.ANIMATION_ATLAS = { blind_chips = {}, mp_player_blind_chip = {}, mp_player_blind_col = {} }
  G.P_CENTERS.b_black = G.P_CENTERS.b_black or { set = 'Back', order = 5, name = 'Black Deck', pos = { x = 0, y = 2 } }
  G.SPEEDFACTOR = 1
  G.LANG = { label = 'English', key = 'en-us' }
  _G.attention_text = function(args) UH.attention[#UH.attention + 1] = args end
  UH.attention = {}
  G.FUNCS.overlay_menu = function(args)
    if G.OVERLAY_MENU then G.OVERLAY_MENU:remove() end
    G.OVERLAY_MENU = stubs.UIBox({ definition = args.definition, config = {} })
    UH.overlays[#UH.overlays + 1] = args.definition
  end
  G.FUNCS.exit_overlay_menu = function()
    if G.OVERLAY_MENU then G.OVERLAY_MENU:remove() end
    G.OVERLAY_MENU = nil
  end
  G.save_settings = function() UH.saved = (UH.saved or 0) + 1 end
  _G.set_main_menu_UI = function()
    G.MAIN_MENU_UI = stubs.UIBox({ definition = create_UIBox_main_menu_buttons(), config = {} })
  end
  set_main_menu_UI()
  if opts.before_ui then opts.before_ui(MP, G) end
  require 'rmh_mp.ui.menu'
  return MP, G
end

function UH.teardown() H.teardown() end

-- ── Fixtures ───────────────────────────────────────────────────────────────

local types = J.read_file(RMH_SPEC.fixtures .. 'types.json')

function UH.fixture(name)
  return J.resolve_refs(J.read_file(RMH_SPEC.fixtures .. 'types.json'), types.objects).objects[name]
end

local function player(i, over)
  local p = {
    id = 'u_p' .. i, name = 'Player' .. i, avatarUrl = nil, avatarJoker = 'j_joker', blindCol = ((i - 1) % 25) + 1,
    joinedAt = 1761799900000 + i, ready = false, connected = true, away = false, catchingUp = false, role = 'player', conn = 'direct',
  }
  for k, v in pairs(over or {}) do p[k] = v end
  return p
end
UH.player = player

--- A lobby_view. over = { me, isHost, canStart, startBlockReason, state = {...overrides}, players = n | list }
function UH.view(over)
  over = over or {}
  local state = UH.fixture('lobbyState')
  for k, v in pairs(over.state or {}) do state[k] = v end
  if type(over.players) == 'number' then
    local list = {}
    for i = 1, over.players do list[i] = player(i) end
    state.players = list
    state.hostId = list[1] and list[1].id or state.hostId
  elseif type(over.players) == 'table' then
    state.players = over.players
  end
  local me = over.me or state.hostId
  return { state = state, me = me, isHost = over.isHost == nil and (me == state.hostId) or over.isHost,
    canStart = over.canStart == true, startBlockReason = over.startBlockReason }
end

function UH.recv(t, d)
  local ok = MP.net.receive(t, d)
  return ok
end

function UH.sent(t) return H.sent(t) end
function UH.clear_sent() H.sent(); H.sent_list = {} end

function UH.frame() MP.net.frame(1 / 60) end

-- ── Tree helpers ───────────────────────────────────────────────────────────

local function walk(node, fn, seen)
  if type(node) ~= 'table' then return end
  seen = seen or {}
  if seen[node] then return end
  seen[node] = true
  fn(node)
  for _, c in ipairs(node.nodes or {}) do walk(c, fn, seen) end
  local obj = node.config and node.config.object
  if type(obj) == 'table' and obj.definition then walk(obj.definition, fn, seen) end
end
UH.walk = walk

function UH.find_all(def, pred)
  local out = {}
  walk(def, function(n) if pred(n) then out[#out + 1] = n end end)
  return out
end

function UH.find(def, id)
  return UH.find_all(def, function(n) return n.config and n.config.id == id end)[1]
end

--- The clickable element of a W.button / UIBox_button node (the C with the callback).
function UH.button_of(node)
  if not node then return nil end
  if node.config and (node.config.button or node.config.mp_disabled ~= nil) and node.n == G.UIT.C and node.config.hover then return node end
  for _, c in ipairs(node.nodes or {}) do
    local b = UH.button_of(c)
    if b then return b end
  end
  return nil
end

--- Every element with a `button` callback: { [name] = {node, ...} }.
function UH.buttons(def)
  local out = {}
  walk(def, function(n)
    local b = n.config and n.config.button
    if b then out[b] = out[b] or {}; table.insert(out[b], n) end
  end)
  return out
end

function UH.texts(def)
  local out = {}
  walk(def, function(n)
    if n.config and n.config.text then out[#out + 1] = n.config.text end
    local obj = n.config and n.config.object
    if type(obj) == 'table' and obj.string_args and obj.string_args.string then
      for _, s in ipairs(obj.string_args.string) do
        if type(s) == 'table' and s.ref_table then out[#out + 1] = tostring(s.ref_table[s.ref_value]) end
      end
    end
  end)
  return out
end

function UH.has_text(def, needle)
  for _, t in ipairs(UH.texts(def)) do if tostring(t):find(needle, 1, true) then return true end end
  return false
end

--- Click: the element with that id (or the node itself), like the engine's button dispatch.
function UH.click(def_or_node, id)
  local node = id and UH.find(def_or_node, id) or def_or_node
  local b = UH.button_of(node) or node
  local name = b and b.config and b.config.button
  if not name then error('click: no button on ' .. tostring(id)) end
  local fn = G.FUNCS[name]
  if not fn then error('click: no G.FUNCS.' .. name) end
  return fn({ config = b.config, UIBox = { get_UIE_by_ID = function() return nil end } })
end

--- Is the button with this id enabled (has a callback)?
function UH.enabled(def, id)
  local b = UH.button_of(UH.find(def, id))
  return b ~= nil and b.config.button ~= nil
end

--- Cycle an option cycle with id to option index k (calls its opt_callback like the engine).
function UH.cycle(def, id, k)
  local n = UH.find(def, id)
  local args
  walk(n, function(x) if x.config and x.config.ref_table and x.config.ref_table.options and not args then args = x.config.ref_table end end)
  if not args then error('cycle: no option cycle ' .. id) end
  if not args.opt_callback then return false end
  args.current_option = k
  G.FUNCS[args.opt_callback]({ to_key = k, to_val = args.options[k], cycle_config = args })
  return true
end

--- Flip a toggle (create_toggle) with id like the engine's toggle_button.
function UH.toggle(def, id)
  local n = UH.find(def, id)
  local el
  walk(n, function(x) if x.config and x.config.button == 'toggle_button' then el = x end end)
  if not el then error('toggle: none in ' .. id) end
  local r = el.config.ref_table
  r.ref_table[r.ref_value] = not r.ref_table[r.ref_value]
  if el.config.toggle_callback then el.config.toggle_callback(r.ref_table[r.ref_value]) end
  return r.ref_table[r.ref_value]
end

function UH.overlay() return MP.ui.last_overlay and MP.ui.last_overlay.def, MP.ui.last_overlay and MP.ui.last_overlay.name end

return UH
