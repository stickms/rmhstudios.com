-- rmh_mp/ui/credits.lua — the mod's credits (B08, B09).
--
--   Credits overlay (B08): "Created by Virtualized", the major contributors, and the project's
--   Github / Discord buttons. Opened by the Credits button in the Multiplayer panel (menu.lua).
--   The links open through love.system.openURL (the page's browser-open path, the same one the
--   vanilla Discord / Twitter buttons use), and only ever one of the fixed URLs in CR.LINKS.
--
--   MULTIPLAYER badge (B09): the tooltip (G.UIDEF.card_h_popup) of an MP object the mod credits
--   gets a MULTIPLAYER badge in the mod's red that cycles through "Art: <name>", "Idea: <name>"
--   and "Code: <name>" (a_mp_art / a_mp_idea / a_mp_code). CR.BY is the mod's per-object
--   mp_credits data as "art;idea;code", names separated by ','. Locked and undiscovered cards
--   show no badge.

local MP = require 'rmh_mp.state'
local TH = require 'rmh_mp.ui.theme'
local W = require 'rmh_mp.ui.widgets'

local U = MP.ui
local CR = U.credits or {}
U.credits = CR

local F = G.FUNCS

CR.LINKS = {
  github = 'https://github.com/Balatro-Multiplayer/BalatroMultiplayer/',
  discord = 'https://discord.gg/gEemz4ptuF',
}

CR.CREATOR = 'Virtualized'
CR.CONTRIBUTORS = 'TGMM, Senfinbrare, CUexter, Brawmario, Divvy, Andy, Steph, SleepyG11,'

-- key = "art;idea;code" (the mod's mp_credits, objects/**).
CR.BY = {
  b_mp_cocktail = "aura!,shai1n;;Toneblock",
  b_mp_echodeck = "neatoqueen;;CampfireCollective",
  b_mp_gradient = "aura!,Ganpan140;;Toneblock",
  b_mp_heidelberg = "aura!;;steph",
  b_mp_indigo = "aura!;;Toneblock",
  b_mp_oracle = "aura!,Ganpan140;;Toneblock",
  b_mp_orange = "aura!;;Toneblock",
  b_mp_violet = "aura!;;Toneblock",
  b_mp_white = "aura!;;Toneblock",
  c_mp_asteroid = "TheTrueRaven;Zilver;Virtualized",
  c_mp_ouija_standard = "aura!;;steph",
  c_mp_trap_alarm = "Zwei;Virtualized;Virtualized",
  c_mp_trap_arcane_lock = "shai1n;Virtualized;Virtualized",
  c_mp_trap_explosive_runes = "shai1n;Virtualized;Virtualized",
  c_mp_trap_faithful_hound = "StaticTyr;Virtualized;Virtualized",
  c_mp_trap_fire_trap = "Ganpan140;Virtualized;Virtualized",
  c_mp_trap_forbiddance = "shai1n;Virtualized;Virtualized",
  c_mp_trap_glyph_of_warding = "OvertLeaf4;Virtualized;Virtualized",
  c_mp_trap_guards_and_wards = "Nas4xou;Virtualized;Virtualized",
  c_mp_trap_magic_mouth = "TypeFate;Virtualized;Virtualized",
  c_mp_trap_mental_prison = "Ganpan140;Virtualized;Virtualized",
  c_mp_trap_phase_door = "Ganpan140;Virtualized;Virtualized",
  c_mp_trap_programmed_illusion = "TypeFate;Virtualized;Virtualized",
  c_mp_trap_sepia_snake_sigil = "DottyKitty;Virtualized;Virtualized",
  c_mp_trap_snare = "Ganpan140;Virtualized;Virtualized",
  c_mp_trap_symbol = "OvertLeaf4;Virtualized;Virtualized",
  c_mp_trap_web = "Ganpan140;Virtualized;Virtualized",
  j_mp_alloy_sandbox = "DottyKitty;;CampfireCollective",
  j_mp_ambrosia_sandbox = "DottyKitty;;CampfireCollective",
  j_mp_baseball_sandbox = ";Sylvie;",
  j_mp_bloodstone_sandbox = ";LocalThunk;",
  j_mp_bobby_sandbox = "R3venantR3mnant;;CampfireCollective",
  j_mp_candynecklace_sandbox = "DottyKitty;;CampfireCollective",
  j_mp_castle_sandbox = ";;steph",
  j_mp_chainlightning_sandbox = "Wingcap;;CampfireCollective",
  j_mp_cloud_9_sandbox = ";;steph",
  j_mp_clowncar_sandbox = "R3venantR3mnant;;CampfireCollective,steph",
  j_mp_clowncollege_sandbox = "DottyKitty;;CampfireCollective",
  j_mp_conjoined_joker = "Nas4xou;Zilver;Virtualized",
  j_mp_constellation_sandbox = ";;steph",
  j_mp_couponsheet_sandbox = "neatoqueen;;CampfireCollective",
  j_mp_defensive_joker = "TheTrueRaven;didon't;Virtualized",
  j_mp_doublerainbow_sandbox = "DottyKitty;;CampfireCollective",
  j_mp_error_sandbox_ = "aura?;;",
  j_mp_espresso_sandbox = "DottyKitty;;CampfireCollective",
  j_mp_faceless_sandbox = ";;steph",
  j_mp_farmer_sandbox = "HonuKane;;CampfireCollective",
  j_mp_forklift_sandbox = "DottyKitty;;CampfireCollective",
  j_mp_gofish_sandbox = "bishopcorrigan;;CampfireCollective,steph",
  j_mp_golden_ticket_sandbox = ";;steph",
  j_mp_hit_the_road_sandbox = ";;steph",
  j_mp_hoarder_sandbox = "neatoqueen;;CampfireCollective,steph",
  j_mp_idol_sandbox_collector = ";Fantom;steph",
  j_mp_idol_sandbox_zealot = ";;steph",
  j_mp_jokalisa_sandbox = "R3venantR3mnant;;CampfireCollective",
  j_mp_jokeroftheyear_sandbox = "neatoqueen;;CampfireCollective",
  j_mp_juggler_sandbox = ";;steph",
  j_mp_lets_go_gambling = "Carter;Dr. Monty;Virtualized",
  j_mp_loyalty_card_sandbox = ";;steph",
  j_mp_lucky7_sandbox = "bishopcorrigan;;CampfireCollective,steph",
  j_mp_lucky_cat_sandbox = ";;steph",
  j_mp_magnet_sandbox = "Ganpan140;Zilver;Virtualized",
  j_mp_mail_sandbox = ";;steph",
  j_mp_misprint_sandbox = ";;steph",
  j_mp_montehaul_sandbox = "UselessReptile8;;CampfireCollective",
  j_mp_order_sandbox = ";;steph",
  j_mp_pacifist = "zeathemays;Zilver;Virtualized",
  j_mp_penny_pincher = "Coo29;Nxkoozie;Virtualized",
  j_mp_photograph_sandbox = ";;steph",
  j_mp_pizza = "TheTrueRaven;Virtualized;Virtualized",
  j_mp_pocketaces_sandbox = "Wingcap;;CampfireCollective",
  j_mp_pyromancer_sandbox = "Wingcap;;CampfireCollective",
  j_mp_ride_the_bus_sandbox = ";;steph",
  j_mp_runner_sandbox = ";;steph",
  j_mp_satellite_sandbox = ";;steph",
  j_mp_shipoftheseus_sandbox = "neatoqueen;;CampfireCollective,steph",
  j_mp_skip_off = "Aura!;Dr. Monty,Carter;Virtualized",
  j_mp_speedrun = "Aura!;Virtualized;Virtualized",
  j_mp_square_sandbox = ";Owen;steph",
  j_mp_starfruit_sandbox = "DottyKitty;;CampfireCollective",
  j_mp_steel_joker_sandbox = ";;steph",
  j_mp_taxes = "DottyKitty;Zwei;Virtualized",
  j_mp_throwback_sandbox = ";;steph",
  j_mp_trafficlight_sandbox = "Wingcap;;CampfireCollective",
  j_mp_tuxedo_sandbox = "DottyKitty;;CampfireCollective",
  j_mp_vampire_sandbox = ";;steph",
  j_mp_warlock_sandbox = "DottyKitty;;CampfireCollective",
  j_mp_werewolf_sandbox = "bishopcorrigan,splatter_proto;;CampfireCollective",
}

-- ── Credits overlay (B08) ───────────────────────────────────────────────────

--- A v_dictionary string (the mod keeps some as one-line lists), filled.
local function v_text(key, default, vars)
  local d = rawget(_G, 'G') and G.localization and G.localization.misc and G.localization.misc.v_dictionary
  local v = d and d[key]
  if type(v) == 'table' then v = v[1] end
  if type(v) ~= 'string' then v = default end
  return TH.fill(v, vars)
end
CR.v_text = v_text

function CR.contents()
  local s = 0.6
  local function link(id, which, label, w)
    return W.row({ W.button({ id = id, label = label, button = 'rmh_mp_credits_link', ref_table = { link = which },
      colour = TH.col('RED'), minw = w, minh = 0.6, scale = 0.4 }) })
  end
  return {
    W.col({
      W.row({
        W.text(TH.T('k_created_by', 'Created by') .. ' ', { scale = s, id = 'mp_credits_created' }),
        W.text(CR.CREATOR, { scale = s, colour = TH.col('DARK_EDITION') }),
      }, { padding = 0.2 }),
      W.row({ W.text(TH.T('k_major_contributors', 'Major contributions by'), { scale = s }) }),
      W.row({ W.text(v_text('k_credits_list', '#1# and many more!', { CR.CONTRIBUTORS }),
        { scale = s, colour = TH.col('RED'), id = 'mp_credits_list' }) }, { padding = 0.2 }),
      link('mp_credits_github', 'github', TH.T('rmh_mp_ui_github_project', 'Github Project'), 3.85),
      link('mp_credits_discord', 'discord', TH.T('b_mp_discord', 'Balatro Multiplayer Discord Server'), 7.7),
    }, { r = 0.1, emboss = 0.05, minw = 6, minh = 6, padding = 0.2, colour = TH.col('BLACK') }),
  }
end

function CR.open()
  return W.overlay({ name = 'credits', contents = CR.contents() })
end

--- Open one of CR.LINKS (never any other URL). True when handed to the browser.
function CR.open_link(which)
  local url = which and CR.LINKS[which]
  local sys = rawget(_G, 'love') and love.system
  if not (url and sys and sys.openURL) then return false end
  return (pcall(sys.openURL, url))
end

F.rmh_mp_credits = function() CR.open() end
F.rmh_mp_credits_link = function(e)
  local r = e and e.config and e.config.ref_table
  return CR.open_link(type(r) == 'table' and r.link or nil)
end

-- ── MULTIPLAYER badge (B09) ─────────────────────────────────────────────────

local ROLES = { { 'art', 'a_mp_art', 'Art: #1#' }, { 'idea', 'a_mp_idea', 'Idea: #1#' }, { 'code', 'a_mp_code', 'Code: #1#' } }

--- { art = {...}, idea = {...}, code = {...} } for a center key, or nil.
function CR.of(key)
  local s = type(key) == 'string' and CR.BY[key]
  if not s then return nil end
  local out, i = {}, 0
  for field in (s .. ';'):gmatch('([^;]*);') do
    i = i + 1
    local list = {}
    for name in field:gmatch('[^,]+') do list[#list + 1] = name end
    if ROLES[i] then out[ROLES[i][1]] = list end
  end
  return out
end

--- The badge's lines: MULTIPLAYER, then one per credited name (art, idea, code).
function CR.lines(key)
  local c = CR.of(key)
  if not c then return nil end
  local out = { 'MULTIPLAYER' }
  for _, r in ipairs(ROLES) do
    for _, name in ipairs(c[r[1]] or {}) do out[#out + 1] = v_text(r[2], r[3], { name }) end
  end
  return out
end

--- Add the badge to a card_h_popup definition (in place). True when added.
function CR.add_badge(def, card)
  local center = card and card.config and card.config.center
  local aut = card and card.ability_UIBox_table
  if not (center and aut) or aut.card_type == 'Locked' or aut.card_type == 'Undiscovered' then return false end
  local lines = CR.lines(center.key)
  if not lines then return false end
  -- ROOT > C > R (outer) > R (inner: name, description, badge row?)
  local c = def and def.nodes and def.nodes[1]
  local outer = c and c.nodes and c.nodes[1]
  local inner = outer and outer.nodes and outer.nodes[1]
  if not (inner and inner.nodes and rawget(_G, 'create_badge')) then return false end
  local badge = create_badge(lines, TH.col('MULTIPLAYER'), nil, 0.9)
  -- the name row may be nil (a hole), so count with maxn
  local n = table.maxn(inner.nodes)
  local last = inner.nodes[n]
  -- vanilla's badge row ({align = 'cm', padding = 0.03}) follows the name and description
  if n >= 3 and last and last.n == G.UIT.R and last.config and last.config.padding == 0.03 and last.nodes then
    last.nodes[#last.nodes + 1] = badge
  else
    inner.nodes[n + 1] = { n = G.UIT.R, config = { align = 'cm', padding = 0.03 }, nodes = { badge } }
  end
  return true
end

if G.UIDEF and G.UIDEF.card_h_popup then
  MP.hooks.wrap(G.UIDEF, 'card_h_popup', function(orig, card, ...)
    local def = orig(card, ...)
    if def then pcall(CR.add_badge, def, card) end
    return def
  end, { id = 'ws10_mp_badge', group = 'ui' })
end

return CR
