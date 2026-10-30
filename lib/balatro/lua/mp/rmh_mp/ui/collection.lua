-- rmh_mp/ui/collection.lua — WS10 Multiplayer collection page (HUD-21, D-26).
--
-- Its own page (the vanilla collection never lists MP keys, PLAN §0.6). Tabs: Jokers,
-- Consumables (Tarot/Planet/Spectral/Trap), Decks, Blinds, Tags, Vouchers, Stakes, Challenges,
-- Sandbox (the sandbox and Extra Credit cards plus 14 error decoys in a fixed shuffled order).
-- Lists come from the registry (MP.registry.defs()) — nothing is mounted: card kinds are drawn
-- as Cards built straight from their prototypes in a 'title' area (no pools, no RNG touched),
-- the rest as name rows. A tooltip that fails for an unmounted prototype falls back to its name.

local MP = require 'rmh_mp.state'
local TH = require 'rmh_mp.ui.theme'
local W = require 'rmh_mp.ui.widgets'

local U = MP.ui
local CO = U.collection or {}
U.collection = CO

local F = G.FUNCS

CO.PER_PAGE = 10
CO.COLS = 5
CO.ERROR_DECOYS = 14

CO.TABS = {
  { id = 'jokers', label = 'b_jokers', def = 'Jokers', kinds = { Joker = true } },
  { id = 'consumables', label = 'rmh_mp_ui_consumables_traps', def = 'Consumables', kinds = { Tarot = true, Planet = true, Spectral = true, Trap = true } },
  { id = 'decks', label = 'b_decks', def = 'Decks', kinds = { Back = true } },
  { id = 'blinds', label = 'b_blinds', def = 'Blinds', kinds = { Blind = true }, rows = true },
  { id = 'tags', label = 'b_tags', def = 'Tags', kinds = { Tag = true }, rows = true },
  { id = 'vouchers', label = 'b_vouchers', def = 'Vouchers', kinds = { Voucher = true } },
  { id = 'stakes', label = 'b_stakes', def = 'Stakes', stakes = true, rows = true },
  { id = 'challenges', label = 'b_challenges', def = 'Challenges', kinds = { Challenge = true }, rows = true },
  { id = 'sandbox', label = 'k_sandbox', def = 'Sandbox', sandbox = true },
}

local function has_layer(def, name)
  for _, l in ipairs((def.gate and def.gate.layers) or {}) do if l == name then return true end end
  return false
end

function CO.is_error(def) return def.key:find('error', 1, true) ~= nil and def.kind == 'Joker' end

function CO.is_sandbox(def)
  return has_layer(def, 'sandbox') or def.extra_credit == true or def.key:find('sandbox', 1, true) ~= nil or CO.is_error(def)
end

--- A fixed "shuffle" (no RNG: a string hash of the key decides the order).
local function hash(s)
  local h = 5381
  for i = 1, #s do h = (h * 33 + s:byte(i)) % 2147483647 end
  return h
end

--- The entries of a tab: { key, kind, name, def }.
function CO.entries(tab)
  local out = {}
  if tab.stakes then
    for _, s in ipairs((U.run_setup and U.run_setup.MP_STAKES) or {}) do
      if s.id then out[#out + 1] = { key = 'stake_mp_' .. s.id, kind = 'Stake', name = TH.T(s.key, s.def) } end
    end
    return out
  end
  local defs = (MP.registry and MP.registry.defs and MP.registry.defs()) or {}
  local errors = {}
  for _, d in ipairs(defs) do
    if not d.no_collection and d.kind ~= 'Rework' then
      if tab.sandbox then
        if CO.is_error(d) then errors[#errors + 1] = d
        elseif CO.is_sandbox(d) then out[#out + 1] = { key = d.key, kind = d.kind, def = d } end
      elseif tab.kinds[d.kind] and not CO.is_sandbox(d) then
        out[#out + 1] = { key = d.key, kind = d.kind, def = d }
      end
    end
  end
  if tab.sandbox and #errors > 0 then
    table.sort(errors, function(a, b) return hash(a.key) < hash(b.key) end)
    for i = 1, math.min(CO.ERROR_DECOYS, #errors) do out[#out + 1] = { key = errors[i].key, kind = 'Joker', def = errors[i] } end
  end
  for _, e in ipairs(out) do e.name = e.name or CO.name(e) end
  return out
end

local SETS = { Joker = 'Joker', Tarot = 'Tarot', Planet = 'Planet', Spectral = 'Spectral', Trap = 'Trap', Back = 'Back',
  Voucher = 'Voucher', Booster = 'Other', Blind = 'Blind', Tag = 'Tag', Enhancement = 'Enhanced' }

function CO.name(e)
  local d = G.localization and G.localization.descriptions
  local set = SETS[e.kind]
  local entry = d and set and d[set] and d[set][e.key]
  if entry and type(entry.name) == 'string' then return entry.name end
  if e.kind == 'Challenge' then
    local n = G.localization and G.localization.misc and G.localization.misc.challenge_names
    if n and n[e.key] then return n[e.key] end
  end
  return (e.def and e.def.loc and e.def.loc.name) or e.key
end

CO.st = CO.st or { tab = 'jokers', page = 1 }

function CO.card_node(e)
  local proto = MP.registry and MP.registry.proto and MP.registry.proto(e.key)
  if not (proto and rawget(_G, 'Card') and rawget(_G, 'CardArea')) then
    return W.button({ id = 'mp_coll_' .. e.key, label = e.name, button = 'nil', colour = TH.col('GREY'), minw = 1.6, minh = 2,
      scale = 0.25, col = true })
  end
  local w, h = (G.CARD_W or 2.1) * 0.75, (G.CARD_H or 2.8) * 0.75
  local area = CardArea(0, 0, w, h, { card_limit = 1, type = 'title', highlight_limit = 0 })
  local ok, card = pcall(Card, 0, 0, w, h, nil, proto, { bypass_discovery_center = true, bypass_discovery_ui = true, discover = false })
  if ok and card then
    card.states.drag.can = false
    local base_hover = card.hover
    card.hover = function(self)
      local hok = pcall(base_hover, self)
      if not hok then
        self.config.h_popup = W.player_tooltip({ name = e.name, role = 'player' }, { build = e.key })
        if self.align_h_popup then self.config.h_popup_config = self:align_h_popup() end
        if Node and Node.hover then pcall(Node.hover, self) end
      end
    end
    area:emplace(card)
  else
    MP.log('warn', 'ui: collection card %s failed: %s', e.key, tostring(card))
  end
  return W.col({ { n = G.UIT.O, config = { object = area } } }, { id = 'mp_coll_' .. e.key, padding = 0.04 })
end

function CO.row_node(e)
  return W.row({ W.col({ W.text(e.name, { scale = 0.35 }) }, { minw = 4, align = 'cl' }),
    W.col({ W.text(e.key, { scale = 0.25, colour = TH.ui_col('TEXT_INACTIVE') }) }, { minw = 3, align = 'cl' }) },
    { id = 'mp_coll_' .. e.key, padding = 0.04, r = 0.1, colour = TH.alpha(TH.col('BLACK'), 0.5) })
end

function CO.tab_def(tab, page)
  local entries = CO.entries(tab)
  local per = tab.rows and 8 or CO.PER_PAGE
  local pages = math.max(1, math.ceil(#entries / per))
  page = math.min(math.max(1, page or 1), pages)
  local nodes, row = {}, {}
  if #entries == 0 then
    nodes[1] = W.row({ W.text(TH.T('rmh_mp_ui_collection_empty', 'Nothing here yet'), { scale = 0.4 }) }, { padding = 0.3, id = 'mp_coll_empty' })
  end
  for i = (page - 1) * per + 1, math.min(#entries, page * per) do
    local e = entries[i]
    if tab.rows then nodes[#nodes + 1] = CO.row_node(e) else
      row[#row + 1] = CO.card_node(e)
      if #row == CO.COLS then nodes[#nodes + 1] = W.row(row); row = {} end
    end
  end
  if #row > 0 then nodes[#nodes + 1] = W.row(row) end
  if pages > 1 then
    local names = {}
    for i = 1, pages do names[i] = TH.TV('rmh_mp_ui_page', 'Page #1#/#2#', { i, pages }) end
    nodes[#nodes + 1] = W.row({ W.cycle({ id = 'mp_coll_pages', options = names, current = page, callback = 'rmh_mp_coll_page',
      w = 3, scale = 0.7, no_pips = true, mp = { tab = tab.id } }) })
  end
  return { n = G.UIT.ROOT, config = { align = 'cm', colour = TH.col('CLEAR'), padding = 0.05, minh = 5, minw = 9 }, nodes = nodes },
    #entries, pages
end

function CO.contents()
  local tabs = {}
  for _, t in ipairs(CO.TABS) do
    tabs[#tabs + 1] = { label = TH.T(t.label, t.def), chosen = CO.st.tab == t.id, tab_definition_function = function()
      if CO.st.tab ~= t.id then CO.st.tab = t.id; CO.st.page = 1 end
      return (CO.tab_def(t, CO.st.page))
    end }
  end
  return {
    W.row({ W.text(TH.T('rmh_mp_ui_mp_collection', 'Multiplayer Collection'), { scale = 0.6 }) }),
    create_tabs({ snap_to_nav = true, colour = TH.col('MP_PURPLE'), scale = 0.6, text_scale = 0.3, tabs = tabs }),
  }
end

function CO.open(tab)
  if tab then CO.st.tab = tab; CO.st.page = 1 end
  return W.overlay({ name = 'collection', contents = CO.contents() })
end

F.rmh_mp_collection = function() CO.open() end
F.rmh_mp_coll_page = function(args)
  CO.st.page = args and args.to_key or 1
  CO.open()
end

return CO
