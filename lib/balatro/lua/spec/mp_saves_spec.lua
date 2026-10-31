-- WS6 save guards (R-03, §0.4): the single-player save is never written or deleted by a session;
-- the MP snapshot goes to /rmh/mp/run.jkr; Continue-in-SP writes the sidecar and re-mounts at boot.

local H = require 'spec.mp_helper'

local files, lfs
local function stub_fs(MP)
  files, lfs = {}, {}
  MP.saves.io = {
    write = function(p, s) files[p] = s; return true end,
    read = function(p) return files[p] end,
    remove = function(p) files[p] = nil end,
  }
  MP.saves.lfs = {
    write = function(p, s) lfs[p] = s; return true end,
    read = function(p) return lfs[p] end,
    remove = function(p) lfs[p] = nil end,
  }
end

local pushes
local function stub_game()
  pushes = {}
  -- A tiny STR_PACK good enough for flat/nested tables of scalars.
  local function pack(t, rec)
    local parts = {}
    local keys = {}
    for k in pairs(t) do keys[#keys + 1] = k end
    table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
    for _, k in ipairs(keys) do
      local v = t[k]
      local key = type(k) == 'string' and ('[' .. string.format('%q', k) .. ']') or ('[' .. k .. ']')
      local val
      if type(v) == 'table' then val = pack(v, true)
      elseif type(v) == 'string' then val = string.format('%q', v)
      else val = tostring(v) end
      parts[#parts + 1] = key .. '=' .. val
    end
    return (rec and '' or 'return ') .. '{' .. table.concat(parts, ',') .. '}'
  end
  _G.STR_PACK = pack
  G.FILE_HANDLER = {}
  G.SETTINGS.tutorial_complete = false
  G.SETTINGS.tutorial_progress = { forced_shop = { 'j_joker' }, completed_parts = {} }
  _G.save_run = function()
    if G.F_NO_SAVING == true then return end
    G.ARGS.save_run = { GAME = { round = G.GAME.round, seed = 'ABCD' }, STATE = G.STATE,
      BLIND = { chips = G.GAME.blind and G.GAME.blind.chips or 0 } }
    G.FILE_HANDLER.run = true
    G.FILE_HANDLER.update_queued = true
  end
  _G.remove_save = function() pushes[#pushes + 1] = 'REMOVED' end
  G.SAVE_MANAGER = { channel = setmetatable({}, { __index = { push = function(_, msg) pushes[#pushes + 1] = msg end } }) }
  _G.Game = { start_run = function(self, args) pushes[#pushes + 1] = { 'start_run', args.savetext ~= nil } end }
end

local function match_info()
  return { runId = 'run9', seed = 'ABCD1234', stake = 1, deck = 'b_red', queueMode = 'pvp_nemesis',
    shape = { nemesisPairing = true, manhunt = false, teamBased = false }, ruleset = 'ruleset_mp_balanced',
    layers = {}, options = H.options(), resolved = H.resolved(), roster = {}, startedAt = 0, hostId = 'u1',
    contentHash = 'x', me = 'u1', mpStake = nil, challenge = nil }
end

describe('save guards', function()
  local MP
  before_each(function()
    MP = H.boot({ before = stub_game })
    H.transport()
    stub_fs(MP)
    MP.session.launcher = function() return true end
  end)
  after_each(H.teardown)

  it('outside a session save_run and remove_save are vanilla', function()
    save_run()
    expect(G.FILE_HANDLER.run).eq(true)
    remove_save()
    expect(pushes[#pushes]).eq('REMOVED')
  end)

  it('redirects save_run to the MP slot and never queues the profile save', function()
    MP.session.mount('match', match_info())
    expect(G.F_NO_SAVING).eq(true)
    G.GAME.round = 7
    save_run()
    expect(G.FILE_HANDLER.run).eq(nil)
    expect(files['/rmh/mp/run.jkr']:sub(1, 6)).eq('return')
    expect(files['/rmh/mp/snap']).eq('run9')
    expect(files['/rmh/mp/state.json']:sub(1, 1)).eq('{')
    expect(H.sent('snapshot')[1].d).eq({ runId = 'run9' })
    local snap = MP.saves.read_snapshot()
    expect(snap.GAME.round).eq(7)
    local st = MP.saves.read_state()
    expect(st.runId).eq('run9')
    MP.session.unmount('t')
  end)

  it('keeps an infinite PvP requirement loadable (STR_PACK has no inf literal)', function()
    MP.session.mount('match', match_info())
    G.GAME.blind = { chips = math.huge }
    save_run()
    expect(G.GAME.blind.chips).eq(math.huge)
    expect(MP.saves.read_snapshot().BLIND.chips).eq(1e308)
    MP.session.unmount('t')
  end)

  it('never deletes the single-player save during a session (MP game over)', function()
    MP.session.mount('match', match_info())
    remove_save()
    expect(#pushes).eq(0)
    MP.session.unmount('t')
    remove_save()
    expect(pushes[1]).eq('REMOVED')
  end)

  it('drops profile save_run pushes and keeps the real tutorial flags in settings pushes', function()
    MP.session.mount('practice', { resolved = H.resolved(), deck = 'b_red', stake = 1 })
    expect(G.SETTINGS.tutorial_complete).eq(true)          -- OR-08 in the session
    expect(G.SETTINGS.tutorial_progress).eq(nil)
    G.SAVE_MANAGER.channel:push({ type = 'save_run', save_table = {} })
    G.SAVE_MANAGER.channel:push({ type = 'save_settings', save_settings = G.SETTINGS })
    expect(#pushes).eq(1)
    expect(pushes[1].save_settings.tutorial_complete).eq(false)
    expect(pushes[1].save_settings.tutorial_progress.forced_shop).eq({ 'j_joker' })
    expect(G.SETTINGS.tutorial_complete).eq(true)          -- live table untouched
    MP.session.unmount('t')
    expect(G.SETTINGS.tutorial_complete).eq(false)
    expect(G.SETTINGS.tutorial_progress.forced_shop).eq({ 'j_joker' })
    G.SAVE_MANAGER.channel:push({ type = 'save_run', save_table = {} })
    expect(#pushes).eq(2)                                   -- filter gone with the session
  end)

  it('practice sessions block the profile save but write no rejoin snapshot', function()
    MP.session.mount('practice', { resolved = H.resolved(), deck = 'b_red', stake = 1 })
    save_run()
    expect(G.FILE_HANDLER.run).eq(nil)
    expect(files['/rmh/mp/run.jkr']).eq(nil)
    MP.session.unmount('t')
  end)

  it('loads snapshots in an empty environment (no code execution)', function()
    expect(MP.saves.unpack_sandboxed('return {a=1,b={2,3}}')).eq({ a = 1, b = { 2, 3 } })
    expect(MP.saves.unpack_sandboxed('return os.exit(1)')).eq(nil)
    expect(MP.saves.unpack_sandboxed('os.exit(1)')).eq(nil)
    expect(MP.saves.unpack_sandboxed('return {x=print}')).eq({})
    expect(MP.saves.unpack_sandboxed(nil)).eq(nil)
  end)

  it('Continue in Singleplayer: sidecar, profile saving back on, MP content stays mounted', function()
    MP.session.mount('match', match_info())
    MP.state.pvp.active = true
    G.STATE = G.STATES.HAND_PLAYED
    G.GAME.blind = { chips = math.huge, mult = 2 }
    _G.get_blind_amount = function() return 300 end
    G.GAME.starting_params.ante_scaling = 1
    G.GAME.chips = 100
    expect(MP.saves.continue_singleplayer()).eq(true)
    expect(MP.session_kind()).eq('continued')
    expect(G.F_NO_SAVING).eq(false)
    expect(G.STATE).eq(G.STATES.NEW_ROUND)
    expect(G.GAME.blind.chips).eq(600)
    expect(G.GAME.chips).eq(600)
    expect(G.P_CENTERS.j_mp_pacifist ~= nil).truthy()
    expect(MP.attrition.pvp_enabled()).falsy()
    expect(H.sent('match_left')[1].d).eq({ how = 'continue_sp' })
    local side = MP.saves.read_sidecar()
    expect(side.runId).eq('run9')
    save_run()
    expect(G.FILE_HANDLER.run).eq(true)                     -- the SP save now holds the run
    remove_save()                                           -- its game over clears the sidecar too
    expect(MP.saves.read_sidecar()).eq(nil)
    MP.session.unmount('t')
    _G.get_blind_amount = nil
  end)

  it('boot: Continue with a sidecar re-mounts MP content before the save loads; a new run drops it', function()
    MP.saves.write_sidecar({ runId = 'run9', resolved = H.resolved(), options = H.options() })
    expect(G.P_CENTERS.j_mp_pacifist).eq(nil)
    Game.start_run(G, { savetext = { GAME = {} } })
    expect(MP.session_kind()).eq('continued')
    expect(G.P_CENTERS.j_mp_pacifist ~= nil).truthy()
    expect(G.F_NO_SAVING).eq(false)
    MP.session.unmount('t')
    Game.start_run(G, {})
    expect(MP.saves.read_sidecar()).eq(nil)
    expect(MP.state.session).eq(nil)
  end)
end)

-- The profile's challenge bookkeeping. The stand-ins below do what vanilla's do with the
-- profile (state_events.lua win_game, misc_functions.lua set_challenge_unlock and
-- set_profile_progress): count over G.CHALLENGES, mark the run's challenge completed.
describe('save guards: the profile challenge progress', function()
  local MP, profile
  local function stub_profile()
    stub_game()
    G.PROFILES = { { challenge_progress = { completed = {} }, challenges_unlocked = 5, progress = {} } }
    _G.set_challenge_unlock = function()
      local p = G.PROFILES[G.SETTINGS.profile]
      local done = 0
      for _, v in ipairs(G.CHALLENGES) do if p.challenge_progress.completed[v.id] then done = done + 1 end end
      p.challenges_unlocked = math.min(#G.CHALLENGES, done + 5)
    end
    _G.set_profile_progress = function()
      local p = G.PROFILES[G.SETTINGS.profile]
      local tally, of = 0, 0
      for _, v in ipairs(G.CHALLENGES) do
        of = of + 1
        if p.challenge_progress.completed[v.id] then tally = tally + 1 end
      end
      p.progress.challenges = { tally = tally, of = of }
    end
    _G.win_game = function()
      set_profile_progress()
      if G.GAME.challenge then
        G.PROFILES[G.SETTINGS.profile].challenge_progress.completed[G.GAME.challenge] = true
        set_challenge_unlock()
      end
      return 'won'
    end
  end

  before_each(function()
    MP = H.boot({ before = stub_profile })
    H.transport()
    stub_fs(MP)
    MP.session.launcher = function() return true end
    profile = G.PROFILES[1]
    -- vanilla's list has 6 here; MP adds two while mounted
    G.CHALLENGES = {}
    for i = 1, 6 do G.CHALLENGES[i] = { id = 'c_v' .. i } end
    G.CHALLENGES[7] = { id = 'c_mp_a', rmh_mp = true }
    G.CHALLENGES[8] = { id = 'c_mp_b', rmh_mp = true }
  end)
  after_each(H.teardown)

  it('counts only vanilla challenges, and leaves G.CHALLENGES as it was (same table, same order)', function()
    local list = G.CHALLENGES
    local before = {}
    for i, c in ipairs(list) do before[i] = c end
    profile.challenge_progress.completed = { c_v1 = true, c_mp_a = true }
    set_profile_progress()
    expect(profile.progress.challenges).eq({ tally = 1, of = 6 })
    set_challenge_unlock()
    expect(profile.challenges_unlocked).eq(6)
    expect(G.CHALLENGES == list).eq(true)
    expect(#list).eq(8)
    for i, c in ipairs(before) do expect(list[i] == c).eq(true) end
  end)

  it('restores G.CHALLENGES when the wrapped call fails', function()
    local list = G.CHALLENGES
    expect(function()
      MP.saves.with_vanilla_challenges(function()
        expect(#G.CHALLENGES).eq(6)
        error('boom')
      end)
    end).error('boom')
    expect(#list).eq(8)
    expect(list[8].id).eq('c_mp_b')
  end)

  it('a won MP challenge is never marked completed, in a session or out of one', function()
    G.GAME.challenge = 'c_mp_a'
    expect(win_game()).eq('won')
    expect(profile.challenge_progress.completed).eq({})
    expect(profile.challenges_unlocked).eq(5)
    MP.session.mount('practice', { resolved = H.resolved(), deck = 'b_red', stake = 1 })
    expect(win_game()).eq('won')
    expect(profile.challenge_progress.completed).eq({})
    MP.session.unmount('t')
  end)

  it('a vanilla challenge won in a match or practice is not recorded; outside a session it is', function()
    G.GAME.challenge = 'c_v2'
    MP.session.mount('match', match_info())
    win_game()
    expect(profile.challenge_progress.completed.c_v2).eq(nil)
    expect(profile.challenges_unlocked).eq(5)
    MP.session.unmount('t')
    win_game()
    expect(profile.challenge_progress.completed.c_v2).eq(true)
    expect(profile.challenges_unlocked).eq(6)
    expect(profile.progress.challenges).eq({ tally = 0, of = 6 })
  end)

  it('a run continued in single player records its vanilla challenge (the save is the profile again)', function()
    G.GAME.challenge = 'c_v3'
    MP.session.mount('match', match_info())
    _G.get_blind_amount = function() return 300 end
    MP.saves.continue_singleplayer()
    win_game()
    expect(profile.challenge_progress.completed.c_v3).eq(true)
    MP.session.unmount('t')
    _G.get_blind_amount = nil
  end)

  it('discovery tallies leave out MP centers, so mounted MP content never unlocks a vanilla deck', function()
    -- vanilla: count discovered centers, then the discover_amount unlocks read the total
    local unlocked = {}
    _G.set_discover_tallies = nil
    G.P_CENTERS = {
      j_joker = { set = 'Joker', discovered = true }, c_pluto = { set = 'Planet', consumeable = true, discovered = true },
      j_mp_taxes = { set = 'Joker', discovered = true, rmh_mp = true },
      c_mp_asteroid = { set = 'Planet', consumeable = true, discovered = true, rmh_mp = true },
      j_mp_hidden = { set = 'Joker', discovered = true, rmh_mp = true, omit = true },
      b_mp_violet = { set = 'Back', discovered = true, unlocked = true, rmh_mp = true },
    }
    local function tallies()
      local n = 0
      for _, v in pairs(G.P_CENTERS) do if not v.omit and v.discovered then n = n + 1 end end
      if n >= 3 then unlocked[#unlocked + 1] = 'b_blue' end
      return n
    end
    expect(MP.saves.without_mp_centers(tallies)).eq(2)
    expect(unlocked).eq({})
    -- every flag is back, the MP center that was omitted already stays omitted
    expect(G.P_CENTERS.j_mp_taxes.omit).eq(nil)
    expect(G.P_CENTERS.b_mp_violet.omit).eq(nil)
    expect(G.P_CENTERS.j_mp_hidden.omit).eq(true)
    -- and when the tally raises, too
    expect(function() MP.saves.without_mp_centers(function() error('tally failed') end) end).error('tally failed')
    expect(G.P_CENTERS.c_mp_asteroid.omit).eq(nil)
    expect(tallies()).eq(5)
  end)

  it('set_discover_tallies is wrapped at boot (the vanilla function sees no MP center)', function()
    local seen
    MP = H.boot({ before = function()
      stub_profile()
      _G.set_discover_tallies = function()
        seen = {}
        for k, v in pairs(G.P_CENTERS) do if not v.omit then seen[#seen + 1] = k end end
        table.sort(seen)
      end
    end })
    G.P_CENTERS = { j_joker = { set = 'Joker' }, j_mp_taxes = { set = 'Joker', rmh_mp = true } }
    set_discover_tallies()
    expect(seen).eq({ 'j_joker' })
    expect(G.P_CENTERS.j_mp_taxes.omit).eq(nil)
  end)
end)
