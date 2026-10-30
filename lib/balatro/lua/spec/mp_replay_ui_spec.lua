-- WS13 L1: the replay and spectate UI on the real base-game UI builders (mp_ui_helper): the
-- REPLAYS button opens the browser, paging, WATCH, the SPECTATE tab (list, errors, WATCH), the
-- playback bar text, Replay settings (speed, POV, close) and the string inventory.

local UH = require 'spec.mp_ui_helper'
local J = require 'spec.json_fixture'

local MP, G, U, REP

local function boot()
  MP, G = UH.boot()
  U = MP.ui
  REP = MP.replay
  UH.recv('net_status', { hub = 'connected', account = { name = 'Alice', avatarUrl = nil } })
  MP.open('menu')
  UH.frame()
  UH.clear_sent()
end

local function list(n)
  local out = {}
  for i = 1, n do
    out[i] = { id = 'run' .. i, at = 1762000000000 - i * 60000, queueMode = 'pvp_nemesis', ruleset = 'ruleset_mp_balanced',
      players = { 'Alice', 'Bob' }, result = (i % 3 == 0) and 'lose' or 'win' }
  end
  return out
end

local function overlay()
  local def, name = UH.overlay()
  return def, name
end

local function sent_ops(t)
  local out = {}
  for _, m in ipairs(UH.sent(t)) do out[#out + 1] = m.d end
  return out
end

describe('replay browser (REP-03)', function()
  before_each(boot)
  after_each(UH.teardown)

  it('the REPLAYS button asks for the list and opens the browser', function()
    local defs = U.build('pvp')
    UH.click(defs.bar, 'mp_replays')
    local reqs = sent_ops('ui_replay')
    expect(reqs[1].op).eq('list')
    local def, name = overlay()
    expect(name).eq('mp_replays')
    expect(UH.has_text(def, 'Loading')).truthy()
  end)

  it('lists newest first, 6 per page, with Newer/Older, and WATCH opens a replay', function()
    U.replay_open()
    UH.recv('replay_view', { list = list(7) })
    local def = overlay()
    expect(UH.find(def, 'mp_replay_row_run1') ~= nil).truthy()
    expect(UH.find(def, 'mp_replay_row_run6') ~= nil).truthy()
    expect(UH.find(def, 'mp_replay_row_run7')).eq(nil)
    expect(UH.enabled(def, 'mp_replay_newer')).eq(false)
    expect(UH.enabled(def, 'mp_replay_older')).eq(true)
    expect(UH.has_text(def, 'Win')).truthy()
    UH.click(def, 'mp_replay_older')
    def = overlay()
    expect(UH.find(def, 'mp_replay_row_run7') ~= nil).truthy()
    expect(UH.enabled(def, 'mp_replay_older')).eq(false)
    UH.clear_sent()
    UH.click(def, 'mp_replay_watch_run7')
    local reqs = sent_ops('ui_replay')
    expect(reqs[1].op).eq('open')
    expect(reqs[1].id).eq('run7')
  end)

  it('an empty list says so', function()
    U.replay_open()
    UH.recv('replay_view', { list = {} })
    expect(UH.find(overlay(), 'mp_replay_empty') ~= nil).truthy()
  end)
end)

describe('spectate tab (MM-07, REP-04)', function()
  before_each(boot)
  after_each(UH.teardown)

  it('asks the hub, lists the lobbies, and WATCH joins as a spectator', function()
    U.replay_open()
    UH.click(overlay(), 'mp_replay_tab_spectate')
    expect(#UH.sent('ui_spectate_list')).eq(1)
    UH.recv('spectate_view', { lobbies = { { code = 'ABC234', queueMode = 'pvp_nemesis', players = 2, ante = 3 },
      { code = 'XYZ789', queueMode = 'pvp_royale', players = 5 } } })
    local def = overlay()
    expect(UH.find(def, 'mp_spectate_row_ABC234') ~= nil).truthy()
    expect(UH.has_text(def, 'Ante 3')).truthy()
    expect(UH.has_text(def, 'In lobby')).truthy()
    UH.clear_sent()
    UH.click(def, 'mp_spectate_watch_XYZ789')
    expect(UH.sent('ui_spectate')[1].d.code).eq('XYZ789')
  end)

  it('shows the offline and empty states; REFRESH asks again', function()
    REP.load_ui().open('spectate')
    UH.recv('spectate_view', { lobbies = {}, error = 'offline' })
    expect(UH.find(overlay(), 'mp_spectate_error') ~= nil).truthy()
    UH.recv('spectate_view', { lobbies = {} })
    expect(UH.find(overlay(), 'mp_spectate_empty') ~= nil).truthy()
    UH.clear_sent()
    UH.click(overlay(), 'mp_spectate_refresh')
    expect(#UH.sent('ui_spectate_list')).eq(1)
  end)
end)

describe('playback bar and replay settings (HUD-09 replay variant)', function()
  before_each(boot)
  after_each(function()
    if REP.player.s then REP.player.close(true) end
    UH.teardown()
  end)

  local function playing(live)
    REP.load_ui()
    UH.recv('replay_view', { playing = { id = live and 'live:run1' or 'run1', pov = 'u_bob', pos = 0, len = 10 }, speed = 2 })
    MP.state.session = { kind = 'match', replay = { id = 'run1' }, roster = {
      u_alice = { name = 'Alice' }, u_bob = { name = 'Bob' } } }
  end

  it('the bar says what plays, whose log, where and how fast', function()
    playing(false)
    local line = U.replay.status_line(REP.player.status())
    expect(line:find('REPLAY', 1, true) ~= nil).truthy()
    expect(line:find('Bob', 1, true) ~= nil).truthy()
    expect(line:find('0/0', 1, true) ~= nil).truthy()
    expect(line:find('2x', 1, true) ~= nil).truthy()
    playing(true)
    expect(U.replay.status_line(REP.player.status()):find('LIVE', 1, true) ~= nil).truthy()
    local hud = U.replay.hud_def()
    expect(UH.find(hud, 'mp_replay_settings') ~= nil).truthy()
  end)

  it('settings change the speed, switch the POV and close the replay', function()
    playing(false)
    U.replay.settings()
    local def, name = overlay()
    expect(name).eq('mp_replay_settings')
    UH.clear_sent()
    UH.click(def, 'mp_replay_speed_0')
    expect(REP.player.s.speed).eq(0)
    expect(G.SETTINGS.GAMESPEED).eq(REP.player.FF_GAMESPEED)
    expect(sent_ops('ui_replay')[1].value).eq(0)
    def = overlay()
    UH.clear_sent()
    UH.cycle(def, 'mp_replay_pov', 1) -- Alice (sorted by name)
    expect(sent_ops('ui_replay')[1].op).eq('pov')
    expect(sent_ops('ui_replay')[1].value).eq('u_alice')
    U.replay.settings()
    UH.clear_sent()
    UH.click(overlay(), 'mp_replay_close')
    expect(REP.player.s).eq(nil)
    expect(sent_ops('ui_replay')[1].op).eq('close')
    expect(G.SETTINGS.GAMESPEED ~= REP.player.FF_GAMESPEED).truthy()
  end)

  it('a divergence shows a notice with the event and the reason', function()
    playing(false)
    REP.player.diverge(REP.player.s, { i = 42, op = 'play' }, 'no card c_base|Hearts:Ace in hand')
    U.replay.frame()
    local def, name = overlay()
    expect(name).eq('mp_replay_diverged')
    expect(UH.has_text(def, '42')).truthy()
    expect(UH.has_text(def, 'no card')).truthy()
  end)

  it('spectating: closing the playback also leaves the lobby', function()
    playing(true)
    UH.clear_sent()
    REP.stop()
    expect(#UH.sent('ui_leave')).eq(1)
  end)
end)

describe('replay ui strings', function()
  it('every rmh_mp_replay_* / rmh_mp_spectate_* key the UI reads ships in extra-strings.en-us.json', function()
    local root = RMH_SPEC.root or ''
    local extra = J.read_file(root .. 'data/balatro-mp/extra-strings.en-us.json')
    local have = {}
    for _, cat in ipairs({ 'dictionary', 'v_dictionary' }) do
      for k in pairs(extra.misc[cat] or {}) do have[k] = true end
    end
    local missing = {}
    for _, f in ipairs({ 'ui/replay', 'ui/spectate' }) do
      local src = assert(io.open(root .. 'lib/balatro/lua/mp/rmh_mp/' .. f .. '.lua')):read('*a')
      for line in src:gmatch('[^\n]+') do
        local code = line:gsub('%-%-.*$', '')
        expect(code:find('[\128-\255]') == nil and 'ascii' or line).eq('ascii')
      end
      for key in src:gmatch("'(rmh_mp_[a-z0-9_]+)'") do
        local is_func = src:find('F.' .. key .. ' =', 1, true) ~= nil
        if (key:find('^rmh_mp_replay_') or key:find('^rmh_mp_spectate_')) and not is_func and not have[key] then missing[#missing + 1] = f .. ':' .. key end
      end
    end
    for _, key in ipairs({ 'rmh_mp_replay_inaccurate', 'rmh_mp_replay_missing' }) do
      if not have[key] then missing[#missing + 1] = 'ts:' .. key end
    end
    expect(missing).eq({})
  end)
end)
