-- rmh_mp/ui/theme.lua — WS10: colours, sizes, text lookup and the static catalogues every
-- out-of-run screen shares (PLAN §4 WS10, A3 §1; the mod's UI design, copied with permission).
--
--   local TH = require 'rmh_mp.ui.theme'
--   TH.col('MP_PURPLE')            a colour (fresh copy, safe to ease)
--   TH.T(key, default)             a dictionary string: MP/vanilla localization, else `default`
--   TH.TV(key, default, {vars})    a v_dictionary string with #1#…#n# filled in
--   TH.L(key, default_list)        a list-valued dictionary entry (button labels with 2 lines)
--   TH.RULESETS / TH.ruleset(key) / TH.QUEUE_MODES / TH.ADVANCED_LAYERS / TH.AVATARS ...
--
-- MP Lua must not contain non-ASCII text (WS2: fonts only scan localization data), so every
-- English default here is ASCII and new strings also live in
-- data/balatro-mp/extra-strings.en-us.json under `rmh_mp_ui_*` keys (translations go there).
-- A key that is not loaded yet (an old pack, the L1 specs) shows its English default.

local MP = require 'rmh_mp.state'

MP.ui = MP.ui or {}
local TH = MP.ui.theme or {}
MP.ui.theme = TH

-- ── Text ────────────────────────────────────────────────────────────────────

local function loc_misc(cat)
  local l = rawget(_G, 'G') and G.localization
  return l and l.misc and l.misc[cat]
end

function TH.T(key, default)
  local d = loc_misc('dictionary')
  local v = d and key and d[key]
  if type(v) == 'string' then return v end
  if default ~= nil then return default end
  return tostring(key)
end

local function fill(s, vars)
  vars = vars or {}
  return (s:gsub('#(%d+)#', function(n)
    local v = vars[tonumber(n)]
    if v == nil then return '' end
    return tostring(v)
  end))
end
TH.fill = fill

function TH.TV(key, default, vars)
  local d = loc_misc('v_dictionary')
  local v = d and key and d[key]
  if type(v) ~= 'string' then v = default or tostring(key) end
  return fill(v, vars)
end

--- A list-valued dictionary entry (e.g. b_create_lobby_cap = {'CREATE','LOBBY'}). A plain string
--- entry becomes a one-line list.
function TH.L(key, default)
  local d = loc_misc('dictionary')
  local v = d and key and d[key]
  if type(v) == 'table' and #v > 0 then return v end
  if type(v) == 'string' then return { v } end
  return default or { tostring(key) }
end

--- Split a description with '\n' into lines (mod ruleset descriptions use them).
function TH.lines(s, max_lines)
  local out = {}
  for line in (tostring(s or '') .. '\n'):gmatch('(.-)\n') do
    out[#out + 1] = line
    if max_lines and #out >= max_lines then break end
  end
  return out
end

-- ── Colours ─────────────────────────────────────────────────────────────────

local function rgba(r, g, b, a) return { r, g, b, a or 1 } end

local function hex(h)
  local r, g, b = tonumber(h:sub(1, 2), 16), tonumber(h:sub(3, 4), 16), tonumber(h:sub(5, 6), 16)
  return { r / 255, g / 255, b / 255, 1 }
end
TH.hex = hex

local FIXED = {
  MP_PURPLE = rgba(0.55, 0.30, 0.70),   -- MPAPI "BMP purple" (Player badge, entry button)
  MULTIPLAYER = hex('AC3232'),          -- G.C.MULTIPLAYER, the Nemesis boss colour
  TEAL = rgba(0.20, 0.74, 0.72),
  CHAT_IN = rgba(0, 1, 1),
  CHAT_OWN = rgba(0.65, 0.36, 1),
  CHAT_SYSTEM = rgba(1, 1, 0),
  STATUS_OK = rgba(1, 1, 1),
  STATUS_WAIT = hex('EAC058'),
  STATUS_BAD = hex('FE5F55'),
}

local G_NAMES = {
  BLUE = rgba(0, 0.616, 1), RED = hex('FE5F55'), GREEN = hex('4BC292'), ORANGE = hex('FDA200'),
  PURPLE = hex('8867A5'), GOLD = hex('EAC058'), BLACK = hex('374244'), L_BLACK = hex('4F6367'),
  WHITE = rgba(1, 1, 1), PALE_GREEN = hex('56A887'), GREY = hex('5F7377'), CLEAR = rgba(0, 0, 0, 0),
  MONEY = hex('F3B958'), JOKER_GREY = hex('BFC7D5'), DARK_EDITION = rgba(0.33, 0.33, 0.33),
  ETERNAL = hex('C75985'), FILTER = hex('FF9A00'), IMPORTANT = hex('FF9A00'), BOOSTER = hex('646EB7'),
}

local function copy(c) return { c[1], c[2], c[3], c[4] or 1 } end

--- A colour by name: MP colours first, then the game's G.C, then a built-in stand-in.
function TH.col(name)
  if FIXED[name] then return copy(FIXED[name]) end
  local C = rawget(_G, 'G') and G.C
  if C and type(C[name]) == 'table' and C[name][1] then return C[name] end
  return copy(G_NAMES[name] or G_NAMES.GREY)
end

function TH.ui_col(name)
  local C = rawget(_G, 'G') and G.C and G.C.UI
  if C and C[name] then return C[name] end
  if name == 'TEXT_DARK' then return rgba(0.31, 0.39, 0.42) end
  if name == 'TEXT_INACTIVE' then return rgba(0.53, 0.53, 0.53, 0.6) end
  if name == 'BACKGROUND_INACTIVE' then return rgba(0.31, 0.39, 0.42, 1) end
  return rgba(1, 1, 1)
end

function TH.darken(c, by)
  by = by or 0.3
  return { c[1] * (1 - by), c[2] * (1 - by), c[3] * (1 - by), c[4] or 1 }
end

function TH.lighten(c, by)
  by = by or 0.3
  return { c[1] + (1 - c[1]) * by, c[2] + (1 - c[2]) * by, c[3] + (1 - c[3]) * by, c[4] or 1 }
end

function TH.alpha(c, a) return { c[1], c[2], c[3], a } end

-- Text sizes (game units), the mod's.
TH.SCALE = { big = 0.9, button = 0.5, label = 0.4, small = 0.3, tiny = 0.25 }

-- ── Rulesets (keys and forced options mirror lib/balatro/mp/rulesets/rulesets.ts) ───────────
-- `forced` is display only (locked fields in Lobby Options); TypeScript applies the real ones.

TH.RULESETS = {
  { key = 'ruleset_mp_vanilla', name = 'k_vanilla', def = 'Vanilla', desc = 'k_vanilla_description',
    mp = false, forced = { theOrder = false } },
  { key = 'ruleset_mp_balanced', name = 'k_mp_ruleset_balanced', def = 'Balanced',
    desc = 'k_mp_ruleset_balanced_description', mp = true },
  { key = 'ruleset_mp_expanded', name = 'k_mp_ruleset_expanded', def = 'Expanded',
    desc = 'k_mp_ruleset_expanded_description', mp = true },
  { key = 'ruleset_mp_smallworld', name = 'k_smallworld', def = 'Small World', desc = 'k_smallworld_description', mp = true },
  { key = 'ruleset_mp_majorleague', name = 'k_majorleague', def = 'Major League', desc = 'k_majorleague_description',
    mp = false, forced = { timerBaseSeconds = 180, timerForgiveness = 0, theOrder = false } },
  -- D-17: the Extra rulesets sub-cycle.
  { key = 'ruleset_mp_minorleague', name = 'k_minorleague', def = 'Minor League', desc = 'k_minorleague_description',
    mp = false, extra = true, forced = { timerBaseSeconds = 210, timerForgiveness = 1, theOrder = true } },
  { key = 'ruleset_mp_sandbox', name = 'k_sandbox', def = 'Sandbox', desc = 'k_sandbox_description',
    mp = true, extra = true, forced = { theOrder = true, startingLives = 4 } },
  { key = 'ruleset_mp_badlatro', name = 'k_badlatro', def = 'Badlatro', desc = 'k_badlatro_description', mp = true, extra = true },
  { key = 'ruleset_mp_chaos', name = 'k_chaos', def = 'Chaos', desc = 'k_chaos_description', mp = true, extra = true },
  { key = 'ruleset_mp_speedlatro', name = 'k_speedlatro', def = 'Speedlatro', desc = 'k_speedlatro_description', mp = true, extra = true },
  { key = 'ruleset_mp_traditional', name = 'k_traditional', def = 'Traditional', desc = 'k_traditional_description',
    mp = true, extra = true, forced = { timer = false } },
  { key = 'ruleset_mp_legacy_ranked', name = 'k_legacy_ranked', def = 'Legacy Ranked', desc = 'k_legacy_ranked_description',
    mp = false, extra = true, forced = { theOrder = true } },
  { key = 'ruleset_mp_wsob', name = 'k_wsob', def = 'WSOB', desc = 'k_wsob_description', mp = false, extra = true },
  { key = 'ruleset_mp_experimental', name = 'k_experimental', def = 'Experimental', desc = 'k_experimental_description',
    mp = true, extra = true, forced = { theOrder = true } },
  { key = 'ruleset_mp_experimental_legacy', name = 'k_experimental_legacy', def = 'Experimental (Classic)',
    desc = 'k_experimental_legacy_description', mp = true, extra = true, forced = { theOrder = true } },
}

local RS_BY_KEY = {}
for i, r in ipairs(TH.RULESETS) do r.index = i; RS_BY_KEY[r.key] = r end

function TH.ruleset(key) return RS_BY_KEY[key] end

function TH.ruleset_name(key)
  local r = RS_BY_KEY[key]
  if not r then return TH.T('k_ruleset_not_found', 'Unknown ruleset') end
  return TH.T(r.name, r.def)
end

--- Standard (non-extra) or extra ruleset lists, in display order.
function TH.ruleset_list(extra)
  local out = {}
  for _, r in ipairs(TH.RULESETS) do
    if (r.extra == true) == (extra == true) then out[#out + 1] = r end
  end
  return out
end

--- Is the option `name` locked by ruleset `key`? Returns the forced value as a second result.
function TH.forced(key, name)
  local r = RS_BY_KEY[key]
  if r and r.forced and r.forced[name] ~= nil then return true, r.forced[name] end
  return false
end

-- The casual ruleset vote and the practice pillars (rulesets.ts CASUAL_VOTE_RULESETS /
-- PRACTICE_RULESETS).
TH.PRACTICE = {
  { key = 'ruleset_mp_balanced', colour = 'BLUE', d1 = 'rmh_mp_ui_pr_balanced_1', d1d = 'Minor balance',
    d2 = 'rmh_mp_ui_pr_balanced_2', d2d = 'changes for MP' },
  { key = 'ruleset_mp_expanded', colour = 'PURPLE', d1 = 'rmh_mp_ui_pr_expanded_1', d1d = 'Standardized and',
    d2 = 'rmh_mp_ui_pr_expanded_2', d2d = 'balanced for MP' },
  { key = 'ruleset_mp_vanilla', colour = 'GREEN', d1 = 'rmh_mp_ui_pr_vanilla_1', d1d = 'Normal Balatro',
    d2 = 'rmh_mp_ui_pr_vanilla_2', d2d = 'with PvP blinds' },
  { key = 'ruleset_mp_smallworld', colour = 'RED', d1 = 'rmh_mp_ui_pr_smallworld_1', d1d = '75% of cards are',
    d2 = 'rmh_mp_ui_pr_smallworld_2', d2d = 'banned at random' },
}

-- ── Queue modes (the Create / Find Game pillars, HUD-19) ────────────────────

TH.QUEUE_MODES = {
  { mode = 'pvp_nemesis', name = 'rmh_mp_ui_mode_nemesis', def = 'Nemesis', colour = 'BLUE',
    d1 = 'rmh_mp_ui_mode_nemesis_d1', d1d = 'Face a different', d2 = 'rmh_mp_ui_mode_nemesis_d2', d2d = 'Nemesis every ante',
    players = '2-16', casual_players = '2' },
  { mode = 'pvp_royale', name = 'rmh_mp_ui_mode_royale', def = 'Battle Royale', colour = 'PURPLE',
    d1 = 'rmh_mp_ui_mode_royale_d1', d1d = 'Free for all;', d2 = 'rmh_mp_ui_mode_royale_d2', d2d = 'bottom half lose',
    players = '2-16', casual_players = '3-16' },
  { mode = 'pvp_manhunt', name = 'rmh_mp_ui_mode_manhunt', def = 'Manhunt', colour = 'RED',
    d1 = 'rmh_mp_ui_mode_manhunt_d1', d1d = 'Hunters team up', d2 = 'rmh_mp_ui_mode_manhunt_d2', d2d = 'to stop a Runner',
    players = '2-16', casual_players = '3-16' },
  { mode = 'pvp_teams', name = 'rmh_mp_ui_mode_teams', def = 'Teams', colour = 'GREEN',
    d1 = 'rmh_mp_ui_mode_teams_d1', d1d = 'Team vs team;', d2 = 'rmh_mp_ui_mode_teams_d2', d2d = 'best score wins',
    players = '2-16', casual_players = '4-16' },
  { mode = 'pvp_smallworld', name = 'k_smallworld', def = 'Small World', colour = 'ORANGE',
    d1 = 'rmh_mp_ui_mode_smallworld_d1', d1d = '75% of cards are', d2 = 'rmh_mp_ui_mode_smallworld_d2', d2d = 'banned at random',
    players = '2-16', casual_players = '2-16', casual_only = true },
}

local QM_BY_MODE = {}
for _, q in ipairs(TH.QUEUE_MODES) do QM_BY_MODE[q.mode] = q end
function TH.queue_mode(mode) return QM_BY_MODE[mode] end
function TH.queue_mode_name(mode)
  local q = QM_BY_MODE[mode]
  return q and TH.T(q.name, q.def) or tostring(mode)
end

-- ── Advanced lobby options (LOB-07) and Advanced layer toggles (LY-25) ─────

-- kind: 'toggle' | 'cycle' (values) ; names are A1's labels where the mod has them.
TH.ADVANCED_OPTIONS = {
  { key = 'startingLives', kind = 'cycle', label = 'b_opts_lives', def = 'Lives', values = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 } },
  { key = 'pvpStartRound', kind = 'cycle', label = 'k_opts_pvp_start_round', def = 'PVP Starts at Ante',
    values = { 1, 2, 3, 4, 5, 6, 7, 8 } },
  { key = 'timer', kind = 'toggle', label = 'b_opts_timer', def = 'Enable Timer' },
  { key = 'timerBaseSeconds', kind = 'cycle', label = 'k_opts_pvp_timer', def = 'Timer',
    values = { 30, 60, 90, 120, 150, 180, 210, 240, 300, 360, 420, 480, 600 }, suffix = 's' },
  { key = 'timerIncrementSeconds', kind = 'cycle', label = 'k_opts_pvp_timer_increment', def = 'Timer Increment',
    values = { 0, 15, 30, 45, 60, 90, 120, 180 }, suffix = 's' },
  { key = 'timerForgiveness', kind = 'cycle', label = 'rmh_mp_ui_opt_forgiveness', def = 'Timer Forgiveness',
    values = { 0, 1, 2, 3, 4, 5 } },
  { key = 'pvpCountdownSeconds', kind = 'cycle', label = 'k_opts_pvp_countdown_seconds', def = 'PvP Countdown Seconds',
    values = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 } },
  { key = 'deathOnRoundLoss', kind = 'toggle', label = 'b_opts_death_on_loss', def = 'Lose a life on non-PvP round loss' },
  { key = 'goldOnLifeLoss', kind = 'toggle', label = 'b_opts_cb_money', def = 'Give comeback $ on life loss' },
  { key = 'noGoldOnRoundLoss', kind = 'toggle', label = 'b_opts_no_gold_on_loss', def = "Don't get blind rewards on round loss" },
  { key = 'theOrder', kind = 'toggle', label = 'b_opts_the_order', def = 'Enable The Order' },
  { key = 'hideScoreUntilPlayed', kind = 'toggle', label = 'b_opts_hide_score', def = 'Hide opponent score until you play' },
  { key = 'normalBosses', kind = 'toggle', label = 'b_opts_normal_bosses', def = 'Enable Boss Blind effects' },
  { key = 'differentSeeds', kind = 'toggle', label = 'b_opts_diff_seeds', def = 'Players have different seeds' },
  { key = 'differentDecks', kind = 'toggle', label = 'b_opts_player_diff_deck', def = 'Players have different decks' },
  { key = 'randomLoadout', kind = 'toggle', label = 'b_opts_random_loadout', def = 'Randomize deck & stake' },
  { key = 'multiplayerJokers', kind = 'toggle', label = 'b_opts_multiplayer_jokers', def = 'Enable Multiplayer Cards' },
}

-- layers.ts ADVANCED_LAYERS, in that order (the order sanitizeModifierLayers keeps).
TH.ADVANCED_LAYERS = {
  { name = 'wraith_rework', def = 'Wraith rework' },
  { name = 'no_red_seals', def = 'No Red Seals' },
  { name = 'eeeee', def = 'EEEEE' },
  { name = 'polymorph_spam', def = 'Polymorph Spam' },
  { name = 'score_instability', def = 'Score Instability' },
  { name = 'shared_pockets', def = 'Shared Pockets' },
  { name = 'glass_cannon', def = 'Glass Cannon' },
  -- The Glass cycle: one group, at most one picked (layers.ts `group`).
  { name = 'glass_vanilla', def = 'Glass: Vanilla', group = 'glass' },
  { name = 'glass_standard', def = 'Glass: Standard', group = 'glass' },
  { name = 'glass_legacy', def = 'Glass: Legacy', group = 'glass' },
  { name = 'glass_experimental', def = 'Glass: Experimental', group = 'glass' },
  { name = 'inflation', def = 'Inflation' },
  { name = 'no_interest', def = 'No Interest' },
  { name = 'discard_tax', def = 'Discard Tax' },
  { name = 'frugal', def = 'Frugal' },
  { name = 'spartan', def = 'Spartan' },
  { name = 'pricey_packs', def = 'Pricey Packs' },
  { name = 'flipped_cards', def = 'Flipped Cards' },
  { name = 'debuff_played_cards', def = 'Debuffed Played Cards' },
  { name = 'all_eternal', def = 'All Eternal' },
  { name = 'chip_cap', def = 'Chip Cap' },
  { name = 'shrinking_hand', def = 'Shrinking Hand' },
  { name = 'gambling_opportunity', def = 'Gambling Opportunity' },
  { name = 'no_uncommons', def = 'No Uncommons' },
  { name = 'bigger_shop', def = 'Bigger Shop' },
}

function TH.layer_label(name)
  for _, l in ipairs(TH.ADVANCED_LAYERS) do
    if l.name == name then return TH.T('rmh_mp_ui_layer_' .. name, l.def) end
  end
  return name
end

-- ── Avatars (D-37: the 11 starters plus goals computable from local history) ─

TH.AVATAR_STARTERS = {
  'j_joker', 'j_greedy_joker', 'j_lusty_joker', 'j_wrathful_joker', 'j_gluttenous_joker',
  'j_jolly', 'j_zany', 'j_mad', 'j_crazy', 'j_droll', 'j_sly',
}

-- goal = { field (history key), n }
TH.AVATAR_GOALS = {
  { key = 'j_golden', field = 'wins', n = 1, text = 'rmh_mp_ui_avatar_goal_counter_wins_one', def = 'Win a game' },
  { key = 'j_cavendish', field = 'wins', n = 10, text = 'rmh_mp_ui_avatar_goal_counter_wins', def = 'Win #1# games' },
  { key = 'j_stuntman', field = 'wins', n = 50, text = 'rmh_mp_ui_avatar_goal_counter_wins', def = 'Win #1# games' },
  { key = 'j_baron', field = 'wins', n = 100, text = 'rmh_mp_ui_avatar_goal_counter_wins', def = 'Win #1# games' },
  { key = 'j_duo', field = 'pvpGames', n = 10, text = 'k_avatar_goal_counter_pvpGames', def = 'Play #1# PvP games' },
  { key = 'j_trio', field = 'pvpGames', n = 25, text = 'k_avatar_goal_counter_pvpGames', def = 'Play #1# PvP games' },
  { key = 'j_family', field = 'pvpGames', n = 50, text = 'k_avatar_goal_counter_pvpGames', def = 'Play #1# PvP games' },
  { key = 'j_hack', field = 'games', n = 5, text = 'rmh_mp_ui_avatar_goal_counter_games', def = 'Play #1# games' },
  { key = 'j_hologram', field = 'streak', n = 3, text = 'k_avatar_goal_counter_bestWinStreak', def = 'Win #1# games in a row' },
  { key = 'j_blueprint', field = 'streak', n = 5, text = 'k_avatar_goal_counter_bestWinStreak', def = 'Win #1# games in a row' },
  { key = 'j_campfire', field = 'days', n = 7, text = 'k_avatar_goal_counter_daysPlayed', def = 'Play on #1# different days' },
}

function TH.avatar_unlocked(key, history)
  for _, s in ipairs(TH.AVATAR_STARTERS) do if s == key then return true end end
  for _, g in ipairs(TH.AVATAR_GOALS) do
    if g.key == key then return (tonumber(history and history[g.field]) or 0) >= g.n end
  end
  return false
end

function TH.avatar_goal_text(key)
  for _, g in ipairs(TH.AVATAR_GOALS) do
    if g.key == key then return TH.fill(TH.T(g.text, g.def), { g.n }) end
  end
  return TH.T('rmh_mp_ui_avatar_goal_default', 'Available to everyone')
end

return TH
