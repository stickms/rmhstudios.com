-- rmh_mp/content/white_deck.lua — the White Deck (EX-15 lifted).
--
--   b_mp_white   "View Nemesis' current deck and Joker setup (Updates at PvP blind)". Art: mp_decks
--                (2,1), the cell the mod's deck sheet keeps for it. No starting changes.
--
-- The mod defines it in objects/decks/09_white.lua inside a comment block: its apply sets
-- G.GAME.modifiers.view_nemesis_deck in a lobby and the state transfer (PVP.WHITE.send_state /
-- request_state) is an empty stub, so the text is the only spec. Written natively from it:
--
--   * apply: in a match (not Practice, which has no Nemesis) turn on modifiers.view_nemesis_deck.
--     Cocktail runs MP decks' own apply, so a Cocktail that picks White gets the same view.
--   * at the first draw of every PvP Blind the view takes a snapshot: the Nemesis' Jokers as their
--     last interim player_result reported them (sent when they leave each shop, so this is the
--     setup they bring into the blind), the ante, and who the Nemesis is; and it asks the Nemesis
--     for their deck (peer deck_req -> deck_res, the end screen's own exchange, which stores it in
--     MP.state.nemesis_decks). Nothing else asks for a deck mid-run, so the deck shown is the one
--     sent at the last PvP Blind. The snapshot is saved with the run (G.GAME.mp_white).
--   * the deck view (vanilla G.UIDEF.deck_info: click the deck, or Run Info's View Deck) gets a
--     "Nemesis Deck" tab: their Jokers, then their deck by suit, or a waiting line before the first
--     PvP Blind.
-- Availability: an MP deck like the others (the isolation gate: MP content on and the
-- multiplayerJokers option), and part of the Cocktail pool (D-24 kept its sticker column, 18).

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local C = require 'rmh_mp.content.jokers.core'

local W = {}
MP.content.white_deck = W

W.KEY = 'b_mp_white'
W.MAX_JOKERS = 64
W.MAX_CARDS = 300
W.SUITS = { 'Spades', 'Hearts', 'Clubs', 'Diamonds' }

local function g(name) return rawget(_G, name) end
local function mods() return (G.GAME and G.GAME.modifiers) or {} end

R.define({
  key = 'b_mp_white', kind = 'Back', atlas = 'mp_decks', pos = { x = 2, y = 1 }, config = {},
  loc = { name = 'White Deck', text = { "View {X:purple,C:white}Nemesis'{} current", 'deck and Joker setup',
    '{C:inactive}(Updates at PvP blind){}' } },
  apply = function() W.apply() end,
})

function W.apply()
  if MP.is_match() then G.GAME.modifiers.view_nemesis_deck = true end
end

--- The view is on: the modifier is set and a match is running.
function W.active()
  return mods().view_nemesis_deck == true and MP.is_match()
end

local function copy_jokers(list)
  local out = {}
  for _, j in ipairs(type(list) == 'table' and list or {}) do
    if #out >= W.MAX_JOKERS then break end
    if type(j) == 'table' and type(j.key) == 'string' then
      out[#out + 1] = { key = j.key, edition = type(j.edition) == 'string' and j.edition or nil,
        eternal = j.eternal == true or nil, perishable = j.perishable == true or nil }
    end
  end
  return out
end

--- Take the PvP Blind snapshot (once per PvP round; the caller decides when). Returns it.
function W.snapshot()
  if not W.active() then return nil end
  local target = C.target()
  if not target then return nil end
  local res = MP.state.player_results and MP.state.player_results[target]
  local snap = { ante = G.GAME.round_resets and G.GAME.round_resets.ante or 0, target = target,
    jokers = copy_jokers(res and res.jokers) }
  G.GAME.mp_white = snap
  MP.peer.send('deck_req', {})
  return snap
end

--- What the tab shows: { ante, jokers, deck = string|nil } or nil before the first PvP Blind.
function W.view()
  local snap = G.GAME and G.GAME.mp_white
  if type(snap) ~= 'table' then return nil end
  local decks = MP.state.nemesis_decks
  return { ante = snap.ante, jokers = snap.jokers or {}, deck = decks and decks[snap.target] or nil }
end

--- 'Hearts-Ace-m_glass-foil-Red;...' (MP.card.deck_string) -> SafeCards for playing cards.
function W.parse_deck(s)
  local out = {}
  if type(s) ~= 'string' then return out end
  for part in s:gmatch('[^;]+') do
    local f = {}
    for field in (part .. '-'):gmatch('([^-]*)-') do f[#f + 1] = field end
    if f[1] and f[1] ~= '' and f[2] and f[2] ~= '' then
      out[#out + 1] = { key = 'c_base', front = { suit = f[1], rank = f[2] },
        enhancement = (f[3] and f[3] ~= '' and f[3]) or nil, edition = (f[4] and f[4] ~= '' and f[4]) or nil,
        seal = (f[5] and f[5] ~= '' and f[5]) or nil }
    end
    if #out >= W.MAX_CARDS then break end
  end
  return out
end

-- ── the Nemesis Deck tab ────────────────────────────────────────────────────

local function text_row(text, colour)
  return { n = G.UIT.R, config = { align = 'cm', padding = 0.05 }, nodes = {
    { n = G.UIT.T, config = { text = text, scale = 0.4, colour = colour or G.C.WHITE, shadow = true } } } }
end

local function area_row(area)
  return { n = G.UIT.R, config = { align = 'cm' }, nodes = { { n = G.UIT.O, config = { object = area } } } }
end

local function jokers_area(jokers)
  if #jokers == 0 or not (g('CardArea') and g('Card')) then return nil end
  local w = G.CARD_W * 0.7
  local area = CardArea(0, 0, 6.5 * G.CARD_W, G.CARD_H * 0.7,
    { card_limit = #jokers, type = 'title', highlight_limit = 0, card_w = w })
  for _, j in ipairs(jokers) do
    local center = G.P_CENTERS[j.key]
    if center then
      local c = Card(0, 0, w, G.CARD_H * 0.7, nil, center,
        { bypass_discovery_center = true, bypass_discovery_ui = true, discover = false })
      if j.edition and c.set_edition then pcall(c.set_edition, c, { [j.edition] = true }, true, true) end
      c.ability.mp_phantom = true
      area:emplace(c)
    end
  end
  return area
end

local function suit_area(list)
  if not g('CardArea') then return nil end
  local area = CardArea(0, 0, 6.5 * G.CARD_W, 0.6 * G.CARD_H,
    { card_limit = #list, type = 'title', view_deck = true, highlight_limit = 0, card_w = G.CARD_W * 0.7,
      draw_layers = { 'card' } })
  for _, sc in ipairs(list) do
    local c = MP.card.build(sc, area)
    if c then area:emplace(c) end
  end
  return area
end

--- The tab body (a UIBox ROOT, like vanilla G.UIDEF.view_deck).
function W.tab_def()
  local rows = {}
  local v = W.view()
  if not v then
    rows[#rows + 1] = text_row(C.loc('rmh_mp_white_waiting', 'Shown from the first PvP Blind'), G.C.UI.TEXT_LIGHT)
  else
    rows[#rows + 1] = text_row(C.loc_var('rmh_mp_white_as_of', { v.ante }, 'At the PvP Blind of Ante ' .. tostring(v.ante)),
      G.C.UI.TEXT_LIGHT)
    local ja = jokers_area(v.jokers)
    if ja then rows[#rows + 1] = area_row(ja) end
    local cards = W.parse_deck(v.deck)
    if #cards == 0 then rows[#rows + 1] = text_row('...') end
    for _, suit in ipairs(W.SUITS) do
      local list = {}
      for _, sc in ipairs(cards) do if sc.front.suit == suit then list[#list + 1] = sc end end
      local area = #list > 0 and suit_area(list)
      if area then rows[#rows + 1] = area_row(area) end
    end
  end
  return { n = G.UIT.ROOT, config = { align = 'cm', colour = G.C.CLEAR, r = 0.2, padding = 0.1 }, nodes = rows }
end

function W.tab()
  return { label = C.loc('k_nemesis_deck', 'Nemesis Deck'), tab_definition_function = W.tab_def }
end

-- ── session wraps ───────────────────────────────────────────────────────────

function W.install()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'content.white_deck.' .. id } end

  if g('Game') and Game.update_draw_to_hand then
    wrap(Game, 'update_draw_to_hand', function(orig, self, dt, ...)
      local r = orig(self, dt, ...)
      if W.active() and C.first_pvp_draw_once('white_deck') then W.snapshot() end
      return r
    end, o('snapshot'))
  end

  if G.UIDEF and G.UIDEF.deck_info then
    wrap(G.UIDEF, 'deck_info', function(orig, ...)
      local make = g('create_tabs')
      if not (W.active() and make) then return orig(...) end
      _G.create_tabs = function(args)
        if type(args) == 'table' and type(args.tabs) == 'table' then args.tabs[#args.tabs + 1] = W.tab() end
        return make(args)
      end
      local ok, res = pcall(orig, ...)
      _G.create_tabs = make
      if not ok then error(res, 0) end
      return res
    end, o('deck_info'))
  end
end

C.add_installer(W.install)

return W
