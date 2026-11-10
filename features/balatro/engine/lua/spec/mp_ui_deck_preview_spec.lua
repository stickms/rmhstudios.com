-- The deck picker's preview (ui/run_setup.lua RS.deck_preview) against the REAL base-game object
-- code: engine Node / Moveable / Sprite, Card, CardArea and Back from data/balatro, on top of the
-- real UI_definitions the UI helper loads. The other UI specs stub those classes; this one proves
-- the preview builds a real face-down card of the chosen deck (vanilla and MP decks), with the
-- deck's back sprite, and that the Balanced sticker hook runs on it.

local UH = require 'spec.mp_ui_helper'

local MP, G, U

local function noop() end

--- Load the real game object classes over the helper's stand-ins.
local function real_objects()
  local root = (RMH_SPEC and RMH_SPEC.root) or ''
  local function run(f) assert(loadfile(root .. 'data/balatro/' .. f))() end
  -- Graphics stand-ins: quads and images are plain tables (nothing is drawn here).
  love.graphics.newQuad = function(x, y, w, h, sw, sh) return { x = x, y = y, w = w, h = h, sw = sw, sh = sh } end
  love.graphics.getWidth = love.graphics.getWidth or function() return 1366 end
  love.graphics.getHeight = love.graphics.getHeight or function() return 768 end
  run('engine/node.lua')
  run('engine/moveable.lua')
  run('engine/sprite.lua')
  run('engine/animatedsprite.lua')
  run('cardarea.lua')
  run('card.lua')
  run('back.lua')
  G.I = { NODE = {}, MOVEABLE = {}, SPRITE = {}, UIBOX = {}, POPUP = {}, CARD = {}, CARDAREA = {}, ALERT = {} }
  G.ARGS = G.ARGS or {}
  G.TIMERS = G.TIMERS or { REAL = 0, TOTAL = 0 }
  G.SETTINGS.paused = false
  G.CARD_W, G.CARD_H = 2.4 * 35 / 41, 2.4 * 47 / 41
  G.ROOM = G.ROOM or { T = { x = 0, y = 0, w = 20, h = 11.5 } }
  local image = { getDimensions = function() return 710, 950 end }
  local function atlas(name, px, py) return { name = name, px = px or 71, py = py or 95, image = image } end
  G.ASSET_ATLAS = setmetatable({}, { __index = function(t, k) local a = atlas(k); rawset(t, k, a); return a end })
  G.ANIMATION_ATLAS = G.ANIMATION_ATLAS or {}
  G.shared_seals, G.shared_stickers, G.shared_soul = {}, {}, nil
  G.sort_id = 0
  G.playing_cards = {}
  G.deck = nil
  G.STAGE = G.STAGES.MAIN_MENU
  -- The real prototypes (P_CARDS, P_CENTERS, ...) from game.lua's init_item_prototypes; game.lua
  -- runs in its own environment so the helper's Game stand-in stays in place.
  local env = setmetatable({}, { __index = _G })
  local chunk = assert(loadfile(root .. 'data/balatro/game.lua'))
  setfenv(chunk, env)
  chunk()
  _G.convert_save_to_meta = noop
  _G.get_compressed = function() return 'return {}' end
  _G.STR_UNPACK = function() return { unlocked = {}, discovered = {}, alerted = {} } end
  love.filesystem = love.filesystem or {}
  love.filesystem.getInfo = love.filesystem.getInfo or function() return true end
  love.filesystem.createDirectory = love.filesystem.createDirectory or noop
  local saved_challenges = G.CHALLENGES
  G.save_progress = G.save_progress or noop
  env.Game.init_item_prototypes(G)
  G.CHALLENGES = saved_challenges or G.CHALLENGES
  -- The main menu's G.GAME is a full init_game_object (Card:set_ability/set_cost read it).
  local game = env.Game.init_game_object(G)
  G.GAME = G.GAME or {}
  for k, v in pairs(game) do if G.GAME[k] == nil then G.GAME[k] = v end end
  _G.play_sound = noop
  _G.check_for_unlock = noop
  _G.set_discover_tallies = noop
  _G.discover_card = noop
end

local function boot()
  MP, G = UH.boot()
  U = MP.ui
  UH.recv('net_status', { hub = 'connected', account = { name = 'Alice', avatarUrl = nil } })
  MP.open('menu')
  real_objects()
  UH.clear_sent()
end

describe('deck preview on the real base-game builders', function()
  before_each(boot)
  after_each(UH.teardown)

  local function preview(deck)
    local node = U.run_setup.deck_preview({ deck = deck })
    expect(node ~= nil).truthy()
    expect(node.config.id).eq('mp_rs_preview')
    local area = U.run_setup.preview_area
    expect(getmetatable(area) == CardArea).truthy()          -- the real CardArea, not a stand-in
    expect(#area.cards).eq(1)
    return area, area.cards[1]
  end

  it('builds a real face-down card of a vanilla deck with that deck\'s back sprite', function()
    local area, card = preview('b_yellow')
    expect(getmetatable(card) == Card).truthy()
    expect(card.facing).eq('back')
    expect(card.sprite_facing).eq('back')
    expect(card.states.drag.can).eq(false)
    expect(card.area == area).truthy()
    expect(getmetatable(G.GAME.viewed_back) == Back).truthy()
    expect(G.GAME.viewed_back.effect.center.key).eq('b_yellow')
    expect(card.back).eq('viewed_back')
    expect(card.children.back ~= nil).truthy()
    -- vanilla's back art rule: the deck's pos when unlocked, the locked back otherwise
    local c = G.P_CENTERS.b_yellow
    expect(card.children.back.sprite_pos).eq(c.unlocked and c.pos or { x = 4, y = 0 })
    expect(card.children.back.sprite_pos).eq(G.GAME.viewed_back.pos)
    expect(area.T.w).near(G.CARD_W * 0.9, 1e-9)
  end)

  it('an MP deck previews through its registry center and draws the Balanced sticker', function()
    local key = 'b_mp_cocktail'
    local center = U.run_setup.deck_center(key)
    expect(center ~= nil).truthy()
    local D = MP.content.decks
    local calls = {}
    local real = D.draw_balanced
    D.draw_balanced = function(c, ctr) calls[#calls + 1] = ctr.key end
    local real_draw = Card.draw
    Card.draw = noop -- nothing renders here; the preview's own draw wrapper runs around it
    local _, card = preview(key)
    expect(G.GAME.viewed_back.effect.center.key).eq(key)
    expect(card.facing).eq('back')
    -- the MP deck's own back art (MP.content.decks.back_art), not the vanilla centers sheet
    local art = MP.content.decks.back_art(G.GAME.viewed_back)
    expect(art ~= nil).truthy()
    expect(card.children.back.atlas.name).eq(art.atlas)
    expect(card.children.back.sprite_pos).eq(art.pos)
    card:draw('card')
    Card.draw = real_draw
    D.draw_balanced = real
    expect(calls).eq({ key })
  end)

  it('a deck the build does not have previews nothing (and logs), never errors', function()
    local node = U.run_setup.deck_preview({ deck = 'b_nope' })
    expect(node).eq(nil)
  end)

  it('the whole picker opens with the real objects in place', function()
    U.run_setup.open('practice', { ruleset = 'ruleset_mp_balanced', deck = 'b_red' })
    expect(UH.find(UH.overlay(), 'mp_rs_preview') ~= nil).truthy()
    expect(getmetatable(U.run_setup.preview_area.cards[1]) == Card).truthy()
  end)
end)
