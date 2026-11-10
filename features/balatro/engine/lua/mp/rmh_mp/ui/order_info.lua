-- rmh_mp/ui/order_info.lua — "What Does 'The Order' Do?" (A13): the explainer the "Uses The
-- Order" card on a Find Game pillar opens (pillars.lua; the mod's API ui/the_order.lua).
--
-- Nine pages (an option cycle at the bottom), each a column of topic tabs on the left and the
-- topic on the right: its title, its text (descriptions.Other.rmh_mp_to_p<page>t<tab> in
-- extra-strings, {C:...} colour markup honoured) and the cards and tags it is about. Opening
-- starts at page 1, tab 1; a tab or page change re-opens the overlay in place.
--
--   MP.ui.order_info.open()   OI.contents()   OI.PAGES   OI.st = { page, tab }

local MP = require 'rmh_mp.state'
local TH = require 'rmh_mp.ui.theme'
local W = require 'rmh_mp.ui.widgets'

local U = MP.ui
local OI = U.order_info or {}
U.order_info = OI

local F = G.FUNCS

OI.st = OI.st or { page = 1, tab = 1 }

-- Per page: its name (rmh_mp_to_page_<n>) and its tabs: { jokers, consumables, tags } shown.
OI.PAGES = {
  { 'Skip Tags', { { tags = { 'tag_uncommon' } }, { tags = { 'tag_voucher' } },
    { jokers = { 'j_riff_raff' }, tags = { 'tag_top_up' } }, { tags = { 'tag_orbital' } },
    { tags = { 'tag_rare' }, consumables = { 'c_wraith' } } } },
  { 'Consumables', { { consumables = { 'c_aura' } }, { tags = { 'tag_rare' }, consumables = { 'c_wraith' } },
    { consumables = { 'c_judgement' } } } },
  { 'Card Modifiers', { { consumables = { 'c_familiar', 'c_grim', 'c_incantation' } }, {}, {} } },
  { 'Decks', { { consumables = { 'c_hanged_man' } }, {} } },
  { 'Jokers', { { jokers = { 'j_superposition', 'j_vagabond', 'j_cartomancer' } },
    { jokers = { 'j_8_ball', 'j_business', 'j_gros_michel', 'j_space', 'j_hallucination', 'j_cavendish' } },
    { jokers = { 'j_ticket' } }, { jokers = { 'j_seance', 'j_sixth_sense' } },
    { jokers = { 'j_riff_raff' }, tags = { 'tag_top_up' } }, { jokers = { 'j_todo_list' } }, { jokers = { 'j_invisible' } },
    { jokers = { 'j_bloodstone' } }, { jokers = { 'j_idol', 'j_mail' } } } },
  { 'Misc', { {} } },
  { 'Packs', { {}, {}, {} } },
  { 'Shop Queue', { {}, {}, {} } },
  { 'Vouchers', { {} } },
}

local function desc_of(page, tab)
  local O = G.localization and G.localization.descriptions and G.localization.descriptions.Other
  return O and O['rmh_mp_to_p' .. page .. 't' .. tab] or nil
end

function OI.page_name(i)
  return TH.T('rmh_mp_to_page_' .. i, OI.PAGES[i] and OI.PAGES[i][1] or tostring(i))
end

function OI.tab_name(page, tab)
  local d = desc_of(page, tab)
  return d and d.name or (OI.page_name(page) .. ' ' .. tab)
end

--- One text line with {C:colour} markup as T nodes ({} resets; other controls are ignored).
function OI.line_nodes(line, scale)
  local out, col, pos = {}, nil, 1
  local function add(s)
    if s == '' then return end
    local c = col and rawget(_G, 'loc_colour') and loc_colour(col) or (col and TH.col('BLUE')) or TH.ui_col('TEXT_LIGHT')
    out[#out + 1] = W.text(s, { scale = scale, colour = c })
  end
  while true do
    local s, e, ctrl = line:find('{([^}]*)}', pos)
    add(line:sub(pos, s and (s - 1) or nil))
    if not s then break end
    col = ctrl:match('C:([%w_]+)')
    pos = e + 1
  end
  return out
end

local function text_rows(d)
  local rows = {}
  for _, line in ipairs(d and d.text or {}) do
    local nodes = OI.line_nodes(line, 0.33)
    if #nodes == 0 or line:match('^%s*$') then
      rows[#rows + 1] = W.row({}, { align = 'cl', minh = 0.18 })
    else
      rows[#rows + 1] = W.row(nodes, { align = 'cl', padding = 0.03 })
    end
  end
  return rows
end

--- A CardArea of these centers (unknown keys skipped), as an O node; nil when none.
local function card_area(keys)
  if not (keys and rawget(_G, 'CardArea') and rawget(_G, 'Card') and G.P_CENTERS) then return nil end
  local valid = {}
  for _, k in ipairs(keys) do if G.P_CENTERS[k] then valid[#valid + 1] = k end end
  if #valid == 0 then return nil end
  local sz = 0.6
  local ok, area = pcall(CardArea, G.ROOM.T.x + 0.2 * G.ROOM.T.w / 2, G.ROOM.T.h, #valid * G.CARD_W * sz + 0.1, G.CARD_H * sz,
    { card_limit = #valid, type = 'title_2', highlight_limit = 0 })
  if not ok then return nil end
  for _, k in ipairs(valid) do
    local c = Card(area.T.x + area.T.w / 2, area.T.y, G.CARD_W * sz, G.CARD_H * sz, nil, G.P_CENTERS[k],
      { bypass_discovery_center = true, bypass_discovery_ui = true, bypass_lock = true })
    area:emplace(c)
  end
  return W.col({ { n = G.UIT.O, config = { object = area } } }, { padding = 0.05 })
end

local function objects_row(t)
  local cols = {}
  cols[#cols + 1] = card_area(t.jokers)
  cols[#cols + 1] = card_area(t.consumables)
  for _, k in ipairs(t.tags or {}) do
    if G.P_TAGS and G.P_TAGS[k] and rawget(_G, 'Tag') then
      local ok, ui = pcall(function() return (Tag(k, true):generate_UI()) end)
      if ok and ui then cols[#cols + 1] = W.col({ ui }, { padding = 0.06 }) end
    end
  end
  if #cols == 0 then return nil end
  return W.row({ W.row(cols, { padding = 0.05 }) }, { padding = 0.08 })
end

function OI.contents()
  local st = OI.st
  local page = OI.PAGES[st.page] or OI.PAGES[1]
  if not OI.PAGES[st.page] then st.page = 1 end
  if not page[2][st.tab] then st.tab = 1 end
  local tabs = {}
  for i = 1, #page[2] do
    local chosen = i == st.tab
    tabs[#tabs + 1] = W.row({ W.button({ id = 'mp_order_tab_' .. i, label = OI.tab_name(st.page, i),
      button = chosen and 'nil' or 'rmh_mp_order_tab', ref_table = { idx = i }, minw = 2.8, minh = 0.62, scale = 0.3,
      colour = chosen and TH.col('RED') or TH.ui_col('BACKGROUND_INACTIVE') }) }, { padding = 0.05 })
  end
  local d = desc_of(st.page, st.tab)
  local body = W.col({
    W.row({ W.text(OI.tab_name(st.page, st.tab), { scale = 0.4, id = 'mp_order_title' }) }, { padding = 0.06 }),
    W.row({}, { minh = 0.04, minw = 9.2, colour = TH.ui_col('BACKGROUND_INACTIVE') }),
    W.row({ W.col(text_rows(d), { align = 'tl', padding = 0.05 }) }, { align = 'tl', padding = 0.06 }),
    objects_row(page[2][st.tab]),
  }, { align = 'tm', padding = 0.15, minw = 9.5, minh = 6.2, colour = TH.col('BLACK'), r = 0.1, emboss = 0.05 })
  local names = {}
  for i = 1, #OI.PAGES do names[i] = OI.page_name(i) end
  return {
    W.row({ W.text(TH.T('rmh_mp_to_title', "What Does 'The Order' Do?"), { scale = 0.48 }) }, { padding = 0.08 }),
    W.row({
      W.col(tabs, { align = 'tm', padding = 0.08, minw = 3, colour = TH.col('L_BLACK'), r = 0.1, emboss = 0.05 }),
      W.col({}, { minw = 0.12 }),
      body,
    }, { padding = 0.1 }),
    W.row({ W.cycle({ id = 'mp_order_pages', options = names, current = st.page, callback = 'rmh_mp_order_page', w = 5.5,
      scale = 0.8, no_pips = true }) }, { padding = 0.1 }),
  }
end

local function show()
  return W.overlay({ name = 'the_order', minw = 13.4, contents = OI.contents() })
end

function OI.open()
  OI.st.page, OI.st.tab = 1, 1
  return show()
end

F.rmh_mp_order_open = function() OI.open() end
F.rmh_mp_order_tab = function(e)
  local i = e and e.config and e.config.ref_table and tonumber(e.config.ref_table.idx)
  if not i or i == OI.st.tab then return end
  OI.st.tab = i
  show()
end
F.rmh_mp_order_page = function(args)
  local p = args and tonumber(args.to_key)
  if not p or not OI.PAGES[p] then return end
  OI.st.page, OI.st.tab = p, 1
  show()
end

return OI
