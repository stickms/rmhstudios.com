-- rmh_mp/hooks/saves.lua — save guards (PLAN §0.4, R-03, C §2.6.2).
--
-- In a session the player's single-player save is untouchable:
--   * G.F_NO_SAVING = true for the profile slot while mounted (restored on unmount)
--   * save_run      -> the MP slot: vanilla builds the snapshot table, we write it to
--                      /rmh/mp/run.jkr (+ /rmh/mp/state.json, marker /rmh/mp/snap) and tell JS
--                      (`snapshot`), and the profile save is never queued
--   * remove_save   -> no-op (an MP game over would otherwise delete <profile>/save.jkr)
--   * the save thread's channel drops any 'save_run' push and re-applies the player's real
--     tutorial flags to 'save_settings' pushes (OR-08 forces them on in sessions)
-- The profile's bookkeeping (always on, see below): set_discover_tallies counts vanilla's centers
-- only (so mounted MP content never unlocks a deck), set_profile_progress and
-- set_challenge_unlock count vanilla's challenges only, and win_game never marks an MP challenge,
-- nor any challenge won in a match or practice, completed in the profile.
-- Continue in Singleplayer (HUD-14) turns the session into kind 'continued': saving goes back to
-- the profile and a sidecar <profile>/mp.jkr records what the save needs, so boot loads the MP
-- pack and re-mounts the content before Continue (rules/session.lua).
--
--   saves.begin() / saves.finish()
--   saves.write_snapshot()  saves.read_snapshot(path) -> table | nil   (sandboxed; local data only)
--   saves.write_sidecar(tbl) / saves.read_sidecar() / saves.remove_sidecar()
--   saves.continue_singleplayer()
--   saves.io                   file layer (tests replace it): { write(path, s), read(path), remove(path), exists(path) }

local MP = require 'rmh_mp.state'
local P = require 'rmh_mp.protocol'

local S = {}
MP.saves = S

S.SIDECAR = 'mp.jkr'

S.io = S.io or {
  write = function(path, s)
    local f = io.open(path, 'wb')
    if not f then return false end
    f:write(s)
    f:close()
    return true
  end,
  read = function(path)
    local f = io.open(path, 'rb')
    if not f then return nil end
    local s = f:read('*a')
    f:close()
    return s
  end,
  remove = function(path) return os.remove(path) end,
}

-- love.filesystem for the profile sidecar (it lives in the save directory with save.jkr).
S.lfs = S.lfs or {
  write = function(path, s) return love.filesystem.write(path, s) end,
  read = function(path)
    if not love.filesystem.getInfo(path) then return nil end
    return love.filesystem.read(path)
  end,
  remove = function(path) return love.filesystem.remove(path) end,
}

local function profile()
  return (G.SETTINGS and G.SETTINGS.profile) or 1
end

local function pack(t)
  if rawget(_G, 'STR_PACK') then return STR_PACK(t) end
  return nil
end

--- Load a STR_PACK text without giving it any globals (only constructors and literals work).
local function unpack_sandboxed(s)
  if type(s) ~= 'string' or s:sub(1, 6) ~= 'return' then return nil end
  local fn = loadstring(s, '=mp_snapshot')
  if not fn then return nil end
  setfenv(fn, {})
  local ok, res = pcall(fn)
  if ok and type(res) == 'table' then return res end
  return nil
end
S.unpack_sandboxed = unpack_sandboxed

function S.kind_blocks_profile()
  local k = MP.session_kind()
  return k ~= nil and k ~= 'continued'
end

function S.begin()
  S.saved_no_saving = G.F_NO_SAVING
  G.F_NO_SAVING = true
  local st = G.SETTINGS or {}
  S.tutorial = { complete = st.tutorial_complete, progress = st.tutorial_progress }
  st.tutorial_complete = true          -- OR-08: no forced shop/tags/voucher, no "TUTORIAL" seed
  st.tutorial_progress = nil
  S.install_channel_filter()
end

function S.restore_tutorial()
  if S.tutorial and G.SETTINGS then
    G.SETTINGS.tutorial_complete = S.tutorial.complete
    G.SETTINGS.tutorial_progress = S.tutorial.progress
  end
  S.tutorial = nil
end

function S.finish()
  if S.saved_no_saving ~= nil then G.F_NO_SAVING = S.saved_no_saving else G.F_NO_SAVING = false end
  S.saved_no_saving = nil
  S.restore_tutorial()
end

function S.install_channel_filter()
  local ch = G.SAVE_MANAGER and G.SAVE_MANAGER.channel
  if not ch then return end
  MP.hooks.wrap(ch, 'push', function(orig, self, msg, ...)
    if type(msg) == 'table' and S.kind_blocks_profile() then
      if msg.type == 'save_run' then
        MP.log('debug', 'saves: dropped a profile save_run push during a session')
        return
      end
      if msg.type == 'save_settings' and S.tutorial and type(msg.save_settings) == 'table' then
        local copy = {}
        for k, v in pairs(msg) do copy[k] = v end
        local st = {}
        for k, v in pairs(msg.save_settings) do st[k] = v end
        st.tutorial_complete = S.tutorial.complete
        st.tutorial_progress = S.tutorial.progress
        copy.save_settings = st
        msg = copy
      end
    end
    return orig(self, msg, ...)
  end, { group = 'session', optional = true, id = 'saves.channel' })
end

-- ── MP snapshot ─────────────────────────────────────────────────────────────

local function state_snapshot()
  local s = MP.state
  -- log_i: this player's replay log index when the snapshot was taken (the state is the run
  -- after events [0, log_i)). A rejoin from it writes the index into its restore marker, so a
  -- playback can skip the progress the reload lost (replay/recorder.lua, replay/player.lua).
  local rc = MP.replay and MP.replay.recorder
  local log_i = (rc and rc.active and not MP.replay.playing) and rc.i or nil
  return {
    log_i = log_i,
    runId = s.session and s.session.runId, lives = s.lives, team_lives = s.team_lives, my_team = s.my_team,
    pairing = s.pairing, target = s.target, enemy = s.enemy, comeback = s.comeback,
    furthest_blind = s.furthest_blind, spent = s.spent, stats = s.stats, blind_results = s.blind_results,
    highest_pvp_score = s.highest_pvp_score, pincher_unlock = s.pincher_unlock, pincher_index = s.pincher_index,
    pizza_discards = s.pizza_discards, traps = s.traps, ante_key = s.ante_key,
  }
end
S.state_snapshot = state_snapshot

function S.write_snapshot()
  local sess = MP.state.session
  if not (sess and sess.kind == 'match' and sess.runId) then return false end
  local text = G.ARGS and G.ARGS.save_run and pack(G.ARGS.save_run)
  if not text then return false end
  if not S.io.write(P.PATHS.MP_RUN, text) then
    MP.log('warn', 'saves: cannot write %s', P.PATHS.MP_RUN)
    return false
  end
  -- Local state file: our own codec (it writes inf/NaN as null instead of failing).
  local ok, json = pcall(MP.card.json.encode, state_snapshot())
  if ok and json then S.io.write(P.PATHS.MP_STATE, json) else MP.log('warn', 'saves: state.json skipped: %s', tostring(json)) end
  S.io.write(P.PATHS.MP_SNAP_MARKER, sess.runId)
  MP.net.send('snapshot', { runId = sess.runId })
  return true
end

function S.read_snapshot(path)
  return unpack_sandboxed(S.io.read(path or P.PATHS.MP_RUN))
end

--- The snapshot files' text as written (nil when absent): the rejoin path keeps the exact texts.
function S.read_raw(path) return S.io.read(path or P.PATHS.MP_RUN) end
function S.read_state_raw(path) return S.io.read(path or P.PATHS.MP_STATE) end

function S.read_state(path)
  local s = S.io.read(path or P.PATHS.MP_STATE)
  if not s then return nil end
  local ok, t = pcall(MP.card.json.decode, s)
  if ok and type(t) == 'table' then return t end
  return nil
end

-- ── Sidecar (Continue in Singleplayer) ──────────────────────────────────────

function S.sidecar_path() return profile() .. '/' .. S.SIDECAR end

function S.write_sidecar(tbl)
  local text = pack(tbl)
  if not text then return false end
  return S.lfs.write(S.sidecar_path(), text) and true or false
end

function S.read_sidecar()
  local ok, s = pcall(S.lfs.read, S.sidecar_path())
  if not ok then return nil end
  return unpack_sandboxed(s)
end

function S.remove_sidecar()
  pcall(S.lfs.remove, S.sidecar_path())
end

-- ── The profile's challenge bookkeeping ─────────────────────────────────────
-- While MP content is mounted, G.CHALLENGES also lists the MP challenges, and vanilla's profile
-- bookkeeping reads it: set_profile_progress counts `progress.challenges` over it and
-- set_challenge_unlock sets `challenges_unlocked` = completed + 5 out of it. And win_game marks
-- the run's challenge completed in the profile (then saves) for any challenge run, seeded or not.
-- So an MP challenge won in practice (the ante-8 win), or a match's referee win, wrote `c_mp_*`
-- into the single-player profile, and every count was taken over 42 challenges, not vanilla's 20.
-- The profile only ever sees vanilla's list, and a session that keeps away from the profile
-- (match, practice) records no completion at all; nor does an MP challenge anywhere.

function S.is_mp_challenge(id)
  return type(id) == 'string' and id:sub(1, 5) == 'c_mp_'
end

--- Run fn(...) with G.CHALLENGES holding only vanilla's challenges (same table, restored after).
function S.with_vanilla_challenges(fn, ...)
  local list = rawget(_G, 'G') and G.CHALLENGES
  local has_mp = false
  if type(list) == 'table' then
    for _, c in ipairs(list) do if type(c) == 'table' and c.rmh_mp then has_mp = true; break end end
  end
  if not has_mp then return fn(...) end
  local all = {}
  for i, c in ipairs(list) do all[i] = c end
  for i = #all, 1, -1 do list[i] = nil end
  for _, c in ipairs(all) do if not c.rmh_mp then list[#list + 1] = c end end
  local res = { pcall(fn, ...) }
  for i = #list, 1, -1 do list[i] = nil end
  for i, c in ipairs(all) do list[i] = c end
  if not res[1] then error(res[2], 0) end
  return unpack(res, 2, table.maxn(res))
end

--- Run fn(...) with every MP center left out of vanilla's discovery tallies (`omit`, which
--- set_discover_tallies skips; restored after). The tallies feed the profile's unlocks
--- (check_for_unlock 'discover_amount': Blue/Yellow/Green/Black Deck at 20/50/75/100 discovered,
--- Cartomancer, Astronomer), and set_discover_tallies also runs when no seeded run guards them:
--- vanilla's main menu event and discover_card. A session mounted while the menu is still being
--- built (a practice or match start arriving during Main Menu's transition) counted the ~200
--- registered, discovered MP centers there and unlocked those decks in the single-player profile.
function S.without_mp_centers(fn, ...)
  local centers = rawget(_G, 'G') and G.P_CENTERS
  if type(centers) ~= 'table' then return fn(...) end
  local hidden = {}
  for _, c in pairs(centers) do
    if type(c) == 'table' and c.rmh_mp and not c.omit then
      c.omit = true
      hidden[#hidden + 1] = c
    end
  end
  if #hidden == 0 then return fn(...) end
  local res = { pcall(fn, ...) }
  for _, c in ipairs(hidden) do c.omit = nil end
  if not res[1] then error(res[2], 0) end
  return unpack(res, 2, table.maxn(res))
end

--- May this run's challenge be marked completed in the profile?
function S.records_challenge(id)
  if not id then return true end
  if S.is_mp_challenge(id) then return false end
  return not S.kind_blocks_profile()
end

-- ── Wraps ───────────────────────────────────────────────────────────────────

function S.install_core()
  local wrap = MP.hooks.wrap
  for _, name in ipairs({ 'set_profile_progress', 'set_challenge_unlock' }) do
    wrap(_G, name, function(orig, ...)
      return S.with_vanilla_challenges(orig, ...)
    end, { id = 'saves.' .. name, optional = true })
  end
  wrap(_G, 'set_discover_tallies', function(orig, ...)
    return S.without_mp_centers(orig, ...)
  end, { id = 'saves.set_discover_tallies', optional = true })
  wrap(_G, 'win_game', function(orig, ...)
    local id = G.GAME and G.GAME.challenge
    local p = G.PROFILES and G.SETTINGS and G.PROFILES[G.SETTINGS.profile]
    local cp = p and p.challenge_progress
    if not (cp and cp.completed) or S.records_challenge(id) then return orig(...) end
    local had, unlocked = cp.completed[id], p.challenges_unlocked
    local res = { pcall(orig, ...) }
    cp.completed[id] = had
    p.challenges_unlocked = unlocked
    if not res[1] then error(res[2], 0) end
    return unpack(res, 2, table.maxn(res))
  end, { id = 'saves.win_game', optional = true })
  wrap(_G, 'save_run', function(orig, ...)
    if not S.kind_blocks_profile() then return orig(...) end
    -- Let vanilla build the table, then keep it out of the profile and write the MP slot.
    local prev = G.F_NO_SAVING
    G.F_NO_SAVING = false
    -- STR_PACK writes math.huge as `inf`, which reads back as nil: keep the PvP blind's
    -- requirement finite in the snapshot (1e308 is just as unreachable).
    local b = G.GAME and G.GAME.blind
    local chips = b and b.chips
    if chips == math.huge then b.chips = 1e308 end
    local ok, err = pcall(orig, ...)
    if chips == math.huge then b.chips = chips end
    G.F_NO_SAVING = prev
    if G.FILE_HANDLER then G.FILE_HANDLER.run = nil end
    if not ok then error(err, 0) end
    local wok, werr = pcall(S.write_snapshot)
    if not wok then MP.log('error', 'saves: snapshot failed: %s', tostring(werr)) end
  end, { id = 'saves.save_run', optional = true })
  wrap(_G, 'remove_save', function(orig, ...)
    if S.kind_blocks_profile() then
      MP.log('info', 'saves: remove_save suppressed during a session (single-player save kept)')
      return
    end
    if MP.session_kind() == 'continued' then S.remove_sidecar() end
    return orig(...)
  end, { id = 'saves.remove_save', optional = true })
end

--- HUD-14: keep playing this run alone.
function S.continue_singleplayer()
  local sess = MP.state.session
  if not sess then return false end
  local was_kind = sess.kind
  S.write_sidecar({
    version = MP.version, runId = sess.runId, resolved = sess.resolved, options = sess.options,
    mpStake = sess.mpStake, seed = sess.seed, deck = sess.deck,
  })
  sess.kind = 'continued'
  MP.state.result = nil
  G.F_NO_SAVING = false
  S.saved_no_saving = false
  S.restore_tutorial()
  -- An unfinished PvP blind (or a game-over screen) counts as beaten: chips are raised to the
  -- requirement and the round ends normally (cards back to the deck, ante +1 on the boss, round
  -- eval, shop). Later boss slots are vanilla (attrition.pvp_enabled() is false now).
  local pvp = MP.state.pvp
  local in_round = MP.state_is('SELECTING_HAND', 'HAND_PLAYED', 'DRAW_TO_HAND', 'GAME_OVER')
  if (pvp.active or MP.state_is('GAME_OVER')) and in_round and G.GAME and G.GAME.blind then
    local b = G.GAME.blind
    local need = (get_blind_amount(G.GAME.round_resets.ante) or 0) * (b.mult or 1) * (G.GAME.starting_params.ante_scaling or 1)
    b.chips = need
    if b.chip_text ~= nil and rawget(_G, 'number_format') then b.chip_text = number_format(need) end
    if (G.GAME.chips or 0) < need then G.GAME.chips = need end
    if G.OVERLAY_MENU and G.FUNCS.exit_overlay_menu then pcall(G.FUNCS.exit_overlay_menu) end
    G.STATE = G.STATES.NEW_ROUND
    G.STATE_COMPLETE = false
  end
  MP.reset_pvp()
  if was_kind == 'match' then MP.net.send('match_left', { how = 'continue_sp' }) end
  return true
end

return S
