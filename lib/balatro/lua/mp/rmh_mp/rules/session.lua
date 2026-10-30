-- rmh_mp/rules/session.lua — session mount/unmount and the resolved-ruleset application
-- (PLAN §0.6, §0.10, FL-01/02, RS-16 application side, OR-04/08/09).
--
-- Lifecycle:
--   match_start / practice_start (JS) -> MP.session.mount(kind, info) -> MP.session.launch()
--     mount: MP.state.session filled; registry.mount(resolved); every session-group hook
--            installed; saves.begin() (profile slot off, tutorial complete)
--     launch: viewed_back = the lobby deck; G.FUNCS.start_run(nil, {stake, seed, challenge})
--   Game:start_run (session wrap): seed gets The Order prefix; a new run marks the pre-roll
--     pipeline pending
--   Back:apply_to_run (session wrap, BEFORE the deck applies — i.e. before the ante-1 boss,
--     voucher and tag rolls, FL-02):
--       run seed in effect -> bans (banned ∪ bannedSilent ∪ Attrition ∪ ban sources) ->
--       gameModifiers -> MP stake -> layer hooks (setupHooks order, then built-in layers that are
--       active but not listed) -> Small World starting-voucher fix -> vanilla apply
--   get_starting_params (session wrap): resolved.startingParams merged into the base values
--   after Game:start_run: layer post hooks; `set_ante 0` reported (FL-01)
--   go_to_menu / a non-MP G.FUNCS.start_run -> MP.session.unmount() (registry restored exactly)
--
-- Rules API for content streams (§3.d):
--   MP.rules.layer_hook(name, fn(ctx))       run once at run start when layer `name` is active;
--                                            ctx = { session, resolved, seed, back }
--   MP.rules.layer_post_hook(name, fn(ctx))  same, after Game:start_run (card areas exist)
--   MP.rules.ban_source(fn(session, resolved) -> {keys})  extra bans (e.g. trap packs w/o traps)

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local att = require 'rmh_mp.rules.attrition'
local order = require 'rmh_mp.rules.order'
local sw = require 'rmh_mp.rules.smallworld'
local stakes = require 'rmh_mp.rules.stakes_apply'
local saves = require 'rmh_mp.hooks.saves'

local RULES = MP.rules or {}
MP.rules = RULES
RULES._hooks = RULES._hooks or {}
RULES._post = RULES._post or {}
RULES._ban_sources = RULES._ban_sources or {}

function RULES.layer_hook(name, fn)
  RULES._hooks[name] = RULES._hooks[name] or {}
  table.insert(RULES._hooks[name], fn)
end

function RULES.layer_post_hook(name, fn)
  RULES._post[name] = RULES._post[name] or {}
  table.insert(RULES._post[name], fn)
end

function RULES.ban_source(fn)
  table.insert(RULES._ban_sources, fn)
end

-- Without the traps layer, the trap packs are banned (A2 §0.3 "traps").
RULES.ban_source(function(_, resolved)
  for _, l in ipairs(resolved.layers or {}) do if l == 'traps' then return {} end end
  return { 'p_mp_trap_normal', 'p_mp_trap_jumbo' }
end)

local S = MP.session or {}
MP.session = S

--- Layer names whose hooks run at run start, deduplicated, in order (setupHooks first).
function S.hook_order(resolved, hooks)
  hooks = hooks or RULES._hooks
  local out, seen = {}, {}
  for _, n in ipairs(resolved.setupHooks or {}) do
    if not seen[n] then seen[n] = true; out[#out + 1] = n end
  end
  for _, n in ipairs(resolved.layers or {}) do
    if not seen[n] and hooks[n] then seen[n] = true; out[#out + 1] = n end
  end
  return out
end

local function run_hooks(tbl, names, ctx)
  for _, name in ipairs(names) do
    for _, fn in ipairs(tbl[name] or {}) do
      local ok, err = pcall(fn, ctx)
      if not ok then MP.log('error', 'layer hook %s failed: %s', name, tostring(err)) end
    end
  end
end

--- All keys banned for this session (sorted, deduplicated).
function S.ban_list(session, resolved)
  local set = {}
  for _, k in ipairs(resolved.banned or {}) do set[k] = true end
  for _, k in ipairs(resolved.bannedSilent or {}) do set[k] = true end
  for _, k in ipairs(att.BANS) do set[k] = true end
  for _, src in ipairs(RULES._ban_sources) do
    local ok, keys = pcall(src, session, resolved)
    if ok and type(keys) == 'table' then for _, k in ipairs(keys) do set[k] = true end end
  end
  local list = {}
  for k in pairs(set) do list[#list + 1] = k end
  table.sort(list)
  return list
end

--- The pre-roll pipeline (also callable directly by tests).
function S.pre_roll(back)
  local sess = MP.state.session
  local resolved = MP.resolved()
  local g = G.GAME
  local seed = S.run_seed or (sess and sess.seed) or g.pseudorandom.seed
  if seed then
    g.pseudorandom.seed = seed
    g.pseudorandom.hashed_seed = pseudohash(seed)
  end
  for _, k in ipairs(S.ban_list(sess, resolved)) do g.banned_keys[k] = true end
  for k, v in pairs(resolved.gameModifiers or {}) do g.modifiers[k] = v end
  if sess and sess.mpStake then stakes.apply(sess.mpStake) end
  local ctx = { session = sess, resolved = resolved, seed = seed, back = back }
  run_hooks(RULES._hooks, S.hook_order(resolved), ctx)
  return ctx
end

function S.post_start()
  local resolved = MP.resolved()
  local ctx = { session = MP.state.session, resolved = resolved, seed = S.run_seed }
  run_hooks(RULES._post, S.hook_order(resolved, RULES._post), ctx)
  -- challenges.toml: vanilla stores custom rule values in modifiers; mp_ante_scaling feeds the blinds.
  local m = G.GAME.modifiers
  if m and m.mp_ante_scaling then G.GAME.starting_params.ante_scaling = m.mp_ante_scaling end
  if MP.is_match() or MP.is_practice() then MP.event({ t = 'set_ante', ante = 0 }) end
end

local function shape_of(sh)
  sh = sh or {}
  return { nemesis_pairing = sh.nemesisPairing == true, manhunt = sh.manhunt == true,
    team_based = sh.teamBased == true, practice = sh.practice == true }
end

--- Mount a session. info: the match_start payload, or { resolved, deck, stake, seed } for practice.
function S.mount(kind, info)
  if MP.state.session then S.unmount('remount') end
  MP.state_reset()
  local me = info.me
  local per = info.perPlayer and me and info.perPlayer[me] or {}
  local roster = {}
  for _, r in ipairs(info.roster or {}) do
    roster[r.id] = { name = r.name, team = r.team, blindCol = r.blindCol, avatarJoker = r.avatarJoker }
  end
  local sess = {
    kind = kind, runId = info.runId or ('practice-' .. tostring(os.time())), me = me, hostId = info.hostId,
    resolved = info.resolved or MP.EMPTY_RESOLVED, options = info.options or {},
    shape = shape_of(info.shape or (kind == 'practice' and { nemesisPairing = true, practice = true })),
    roster = roster, seed = per.seed or info.seed, deck = per.deck or info.deck or 'b_red',
    stake = per.stake or info.stake or 1, mpStake = info.mpStake, challenge = info.challenge,
    queueMode = info.queueMode, ruleset = info.ruleset or (info.resolved and info.resolved.key),
    contentHash = info.contentHash,
  }
  if kind == 'practice' then
    sess.options.pvpStartRound = 2
    sess.options.theOrder = true
  end
  MP.state.session = sess
  if me and roster[me] then MP.state.my_team = roster[me].team end
  R.mount(sess.resolved, sess)
  S.install_session_hooks()
  saves.begin()
  if S.on_mount then pcall(S.on_mount, sess) end
  return sess
end

function S.unmount(why)
  if not MP.state.session and not R.mounted() then return false end
  if S.on_unmount then pcall(S.on_unmount, why) end
  saves.finish()
  R.unmount()                      -- also removes every 'session' hook
  if MP.misc and MP.misc.shared_pockets_stop then MP.misc.shared_pockets_stop() end
  MP.net.clear_deferred()
  S.run_seed, S.pending_setup, S.launching = nil, nil, nil
  MP.state_reset()
  return true
end

local function generated_seed()
  if rawget(_G, 'random_string') then
    local ok, s = pcall(random_string, 8, os.time() + (G.TIMERS and G.TIMERS.REAL or 0))
    if ok and s then return s end
  end
  return 'PRACTICE'
end

--- Start (or restart, with `seed`) the session's run through the normal start_run path.
function S.launch(seed)
  local sess = MP.state.session
  if not sess then return false end
  if seed then sess.seed = seed end
  if not sess.seed or sess.seed == '' then sess.seed = generated_seed() end
  if S.launcher then return S.launcher(sess) end
  local center = G.P_CENTERS[sess.deck] or G.P_CENTERS.b_red
  if rawget(_G, 'Back') then G.GAME.viewed_back = Back(center) end
  local challenge
  if sess.challenge and G.CHALLENGES then
    for _, c in ipairs(G.CHALLENGES) do if c.id == sess.challenge then challenge = c end end
  end
  S.launching = true
  G.FUNCS.start_run(nil, { stake = sess.stake, seed = sess.seed, challenge = challenge })
  S.launching = nil
  return true
end

--- Rejoin: load the MP snapshot through vanilla's Continue path (§0.4).
function S.load_snapshot(path)
  local save = saves.read_snapshot(path)
  if not save then
    MP.log('error', 'session: rejoin snapshot unreadable')
    return false
  end
  local st = saves.read_state()
  if st then
    for _, k in ipairs({ 'lives', 'team_lives', 'my_team', 'pairing', 'target', 'enemy', 'comeback', 'furthest_blind',
      'spent', 'stats', 'blind_results', 'highest_pvp_score', 'pincher_unlock', 'pincher_index', 'pizza_discards',
      'traps', 'ante_key' }) do
      if st[k] ~= nil then MP.state[k] = st[k] end
    end
  end
  S.restoring = true
  S.launching = true
  G.FUNCS.start_run(nil, { savetext = save })
  S.launching = nil
  return true
end

-- ── Hook installation ───────────────────────────────────────────────────────

function S.install_session_hooks()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'session.' .. id } end

  if rawget(_G, 'Game') then
    wrap(Game, 'start_run', function(orig, self, args, ...)
      args = args or {}
      if args.savetext then
        S.pending_setup = false
      else
        local sess = MP.state.session
        args.seed = order.seed(args.seed or (sess and sess.seed))
        S.run_seed = args.seed
        S.pending_setup = true
      end
      local r = orig(self, args, ...)
      if args.savetext and MP.pvp and MP.pvp.round_is_pvp() and G.GAME.blind and G.GAME.blind.config
        and G.GAME.blind.config.blind and G.GAME.blind.config.blind.name then
        -- Rejoined inside a PvP round: Blind:load does not run set_blind, so restore the flags.
        G.GAME.blind.mp_pvp = true
        G.GAME.blind.chips = math.huge
        MP.state.pvp.active = true
      end
      if not args.savetext then
        local ok, err = pcall(S.post_start)
        if not ok then MP.log('error', 'session.post_start failed: %s', tostring(err)) end
      end
      S.restoring = nil
      return r
    end, o('start_run'))
  end

  if rawget(_G, 'Back') then
    wrap(Back, 'apply_to_run', function(orig, self, ...)
      if not S.pending_setup then return orig(self, ...) end
      S.pending_setup = false
      local ok, err = pcall(S.pre_roll, self)
      if not ok then MP.log('error', 'session.pre_roll failed: %s', tostring(err)) end
      local restore = sw.active() and sw.fix_back_vouchers(self) or nil
      local r = orig(self, ...)
      if restore then sw.restore_back(self, restore) end
      return r
    end, o('pre_roll'))
  end

  wrap(_G, 'get_starting_params', function(orig, ...)
    local p = orig(...)
    if type(p) == 'table' then
      for k, v in pairs(MP.resolved().startingParams or {}) do p[k] = v end
    end
    return p
  end, o('starting_params'))

  if G and G.FUNCS then
    wrap(G.FUNCS, 'go_to_menu', function(orig, ...)
      local kind = MP.session_kind()
      local r = orig(...)
      if kind == 'match' and not MP.state.result then MP.net.send('match_left', { how = 'leave' }) end
      -- Unmount after delete_run has run (the queue was cleared by the original; ours follows it).
      G.E_MANAGER:add_event(Event({ no_delete = true, blockable = false, blocking = false, func = function()
        if MP.state.session then S.unmount('menu') end
        return true
      end }))
      return r
    end, o('go_to_menu'))
    wrap(G.FUNCS, 'start_run', function(orig, e, args, ...)
      if not S.launching and MP.state.session then
        -- New Run / Restart from inside a session leaves it (PR-02 clean exit).
        if MP.is_match() and not MP.state.result then MP.net.send('match_left', { how = 'leave' }) end
        S.unmount('new_run')
      end
      return orig(e, args, ...)
    end, o('funcs_start_run'))
  end

  order.install()
  sw.install()
  stakes.install()
  if MP.experimental then MP.experimental.install() end
  if MP.misc then MP.misc.install() end
  for _, mod in ipairs(S.extra_installers or {}) do
    local ok, err = pcall(mod)
    if not ok then MP.log('error', 'session installer failed: %s', tostring(err)) end
  end
end

--- Installers run on every mount (hooks/* register theirs here from init.lua).
S.extra_installers = S.extra_installers or {}
function S.add_installer(fn)
  for _, f in ipairs(S.extra_installers) do if f == fn then return end end
  S.extra_installers[#S.extra_installers + 1] = fn
end

-- ── Core (always-on) wraps: Continue-in-SP boot path ────────────────────────

function S.install_core()
  if not rawget(_G, 'Game') then return end
  MP.hooks.wrap(Game, 'start_run', function(orig, self, args, ...)
    args = args or {}
    if not MP.state.session then
      local side = saves.read_sidecar()
      if args.savetext and side then
        -- A continued MP run: put its content back before vanilla loads the cards.
        S.mount('continued', { resolved = side.resolved, options = side.options, runId = side.runId,
          mpStake = side.mpStake, seed = side.seed, deck = side.deck })
        G.F_NO_SAVING = false
        saves.saved_no_saving = false
        saves.restore_tutorial()
      elseif not args.savetext and side then
        saves.remove_sidecar() -- a fresh single-player run replaces that save
      end
    end
    return orig(self, args, ...)
  end, { id = 'session.core_start_run', optional = true })
end

-- ── Net handlers ────────────────────────────────────────────────────────────

S.pending_rejoin = nil

local function deferred_launch()
  S.launch_pending = true
  MP.net.defer(function()
    S.launch_pending = false
    if not MP.state.session then return end
    if S.pending_rejoin and S.pending_rejoin.runId == MP.state.session.runId then
      local p = S.pending_rejoin
      S.pending_rejoin = nil
      S.load_snapshot(p.snapshotPath)
    else
      S.launch()
    end
  end, function() return true end, 'launch')
end

function S.install_net()
  MP.net.on('match_start', function(d)
    S.mount('match', d)
    deferred_launch()
  end)
  MP.net.on('practice_start', function(d)
    S.mount('practice', { resolved = d.resolved, deck = d.deck, stake = d.stake, seed = d.seed,
      shape = { nemesisPairing = true, manhunt = false, teamBased = false, practice = true },
      options = { pvpStartRound = 2, theOrder = true, startingLives = 1, deathOnRoundLoss = false,
        goldOnLifeLoss = false, timer = false } })
    deferred_launch()
  end)
  MP.net.on('rejoin_restore', function(d)
    local sess = MP.state.session
    if sess and sess.runId == d.runId and not S.launch_pending then
      S.load_snapshot(d.snapshotPath)
    else
      S.pending_rejoin = d       -- applied by the pending launch (or the next match_start)
    end
  end)
end

return S
