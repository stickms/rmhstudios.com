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
