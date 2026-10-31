-- rmh_mp/state.lua — the MP namespace and its session state (PLAN §3.d, WS6).
--
-- Every MP module starts with `local MP = require 'rmh_mp.state'`. This file creates the
-- global `MP` table (aliased as `RMH_MP` for the one-line build-time source hooks, C §1.9),
-- the logger, and `MP.state`, the per-session state every stream reads:
--
--   MP.state.session    nil | { kind, runId, me, hostId, resolved, options, shape, roster, seed, ... }
--   MP.state.lobby      nil | LobbyView (from `lobby_view`, WS10)
--   MP.state.lives      { [id] = n }        team_lives = { A = n, B = n }   my_team
--   MP.state.pairing    { ante = n, [id] = partnerId | '' }   target   ante_nemesis = { id, ... }
--   MP.state.enemy      display mirror of the current target (score strings, hands, skips, ...)
--   MP.state.pvp        PvP blind flags (active, reached, ready, countdown, ended, bye, ...)
--   MP.state.timer      last `timer_state`        flags_sent   last `flags` payload
--   MP.state.traps / phantoms / comeback / pincher_* / pizza_discards / result
--
-- `MP.state_reset()` puts everything back to the out-of-session shape. It never touches the
-- game (that is the registry's and the hooks' job on unmount).

local MP = rawget(_G, 'MP')
if type(MP) ~= 'table' then
  MP = {}
  _G.MP = MP
end
_G.RMH_MP = MP

MP.version = MP.version or '1.0.0-ws6'

-- ── Logging ─────────────────────────────────────────────────────────────────
-- Goes to the page through the mailbox (`mp_log`) when the transport exists; also kept in a
-- small ring for tests and the debug overlay. Never throws.

MP.log_ring = MP.log_ring or {}
local RING_MAX = 200

function MP.log(level, msg, ...)
  if select('#', ...) > 0 then
    local ok, s = pcall(string.format, tostring(msg), ...)
    msg = ok and s or tostring(msg)
  end
  msg = tostring(msg)
  if #msg > 4000 then msg = msg:sub(1, 4000) end
  local ring = MP.log_ring
  ring[#ring + 1] = { level = level, msg = msg }
  if #ring > RING_MAX then table.remove(ring, 1) end
  local net = MP.net
  if net and net.send_raw and level ~= 'debug' then
    pcall(net.send_raw, 'mp_log', { level = level, msg = msg })
  end
  if level == 'error' and rawget(_G, 'sendWarnMessage') then
    pcall(sendWarnMessage, msg, 'RMH_MP')
  end
end

-- ── State ───────────────────────────────────────────────────────────────────

local function fresh_enemy()
  return {
    score = 0, real_score = 0, score_str = '0', hands = 4, skips = 0, lives = 0,
    info_received = false, spent_in_shop = {}, sells = 0, sells_per_ante = {}, location = nil,
    highest_score = 0,
  }
end

local function fresh_pvp()
  return {
    active = false,        -- the current round is a PvP round (Boss slot from pvp_start_round)
    nemesis_blind = false, -- the PvP round is played on bl_mp_nemesis (not a flagged vanilla boss)
    reached = false,       -- the PvP blind has been entered this ante
    reached_first = false, -- I readied first (start_blind.first_player == me)
    ready = false,         -- I pressed Ready on the PvP pillar
    countdown = false,     -- 3-2-1 running (controls locked, WS11 draws it)
    started = false,       -- start_blind received for this ante
    ended = false,         -- end_pvp received; the round may now leave
    waiting = false,       -- out of hands, waiting for the referee
    bye = false,           -- no nemesis this ante
    first_draw_done = false,
    asteroids = 0,
    starting_hands = 4,
    loser = nil,           -- last end_pvp loser_id ('' on a tie)
    timer_lost = false,
  }
end

function MP.state_reset()
  MP.state = {
    session = nil,
    lobby = nil,
    lives = {},
    team_lives = { A = 0, B = 0 },
    my_team = nil,
    pairing = { ante = 0 },
    target = nil,
    ante_nemesis = {},
    enemy = fresh_enemy(),
    pvp = fresh_pvp(),
    timer = nil,
    flags_sent = nil,
    traps = { held = {}, nemesis_rows = {}, fired = {} },
    phantoms = {},
    comeback = { count = 0, armed = false, total_lost = 0 },
    pincher_unlock = false,
    pincher_index = -3,
    pizza_discards = 0,
    result = nil,
    -- WS6 bookkeeping (not part of the frozen surface, but stable):
    round = { token = 0, ended_token = -1, eval_done = false, failed = false, hands_played_on_fail = 0 },
    ante_key = nil,         -- FL-08: random per-blind key (also recorded by the replay log)
    furthest_blind = 0,
    spent = { total = 0, before_shop = 0, in_shop = 0 },
    stats = { reroll_count = 0, reroll_cost_total = 0 },
    blind_results = {},     -- ["<ante>:<slot>"] = true/false (beaten)
    highest_pvp_score = 0,
    tail = {},              -- queued `tail` results (NET-07), applied at the next safe point
  }
  return MP.state
end

function MP.reset_pvp()
  local keep_asteroids = MP.state.pvp and MP.state.pvp.asteroids or 0
  MP.state.pvp = fresh_pvp()
  MP.state.pvp.asteroids = keep_asteroids
end

function MP.reset_enemy()
  MP.state.enemy = fresh_enemy()
end

if not MP.state then MP.state_reset() end

--- True while a match, practice, replay or spectate session is mounted.
function MP.in_session()
  return MP.state.session ~= nil and MP.mounted == true
end

--- 'match' | 'practice' | 'replay' | 'spectate' | nil
function MP.session_kind()
  local s = MP.state.session
  return s and s.kind or nil
end

function MP.is_practice()
  return MP.session_kind() == 'practice'
end

--- A real networked match (lives, referee, reports).
function MP.is_match()
  return MP.session_kind() == 'match'
end

--- Lobby option lookup with a default (options are camelCase, see types.ts).
function MP.option(name, default)
  local s = MP.state.session
  local o = s and s.options
  if o and o[name] ~= nil then return o[name] end
  return default
end

--- Resolved ruleset (types.ts ResolvedRuleset) or an empty stand-in.
function MP.resolved()
  local s = MP.state.session
  return (s and s.resolved) or MP.EMPTY_RESOLVED
end

MP.EMPTY_RESOLVED = {
  key = 'ruleset_mp_vanilla', layers = {}, multiplayerContent = false, banned = {}, bannedSilent = {},
  included = {}, reworked = {}, spectralBannedEnhancements = {}, stickers = {}, gameModifiers = {},
  startingParams = {}, setupHooks = {},
  flags = { theOrder = false, enemyLocationDisabled = false, comeback = 'default' },
  timer = { enabled = false, base = 0, increment = 0, forgiveness = 0, pvpHandIncrement = 0, mode = 'default',
    pressurePlusHand = 0, countdown = 3, mult = 1 },
}

--- Is layer `name` in the active chain?
function MP.layer_active(name)
  local r = MP.resolved()
  local cache = r.__layer_set
  if not cache then
    cache = {}
    for _, l in ipairs(r.layers or {}) do cache[l] = true end
    if r ~= MP.EMPTY_RESOLVED then r.__layer_set = cache end
  end
  return cache[name] == true
end

--- A layer-hook parameter: an `mp_` key of resolved.gameModifiers (WS4 convention, e.g.
--- mp_smallworld_cull = 0.75). `default` when the bundle does not carry it.
function MP.layer_param(name, default)
  local v = (MP.resolved().gameModifiers or {})[name]
  if v == nil then return default end
  return v
end

--- Shared shallow/deep copy helpers (no metatables).
function MP.copy(t, deep, seen)
  if type(t) ~= 'table' then return t end
  seen = seen or {}
  if seen[t] then return seen[t] end
  local o = {}
  seen[t] = o
  for k, v in pairs(t) do
    if deep and type(v) == 'table' then o[k] = MP.copy(v, true, seen) else o[k] = v end
  end
  return o
end

function MP.set_of(list)
  local s = {}
  for _, v in ipairs(list or {}) do s[v] = true end
  return s
end

return MP
