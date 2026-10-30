-- mp_test/harness.lua — boot module of the engine-spec harness (PLAN §4 WS14, §6.1 L2).
--
-- TEST-ONLY. The harness page (testing/balatro-e2e/engine/entry.ts) boots the
-- real game through lib/balatro/runtime.ts, writes rmh_mp_test/** and the spec
-- files into /Balatro, writes the marker /rmh/test/enabled, and appends
-- `require "rmh_mp_test.harness"` to main.lua — so this runs after main.lua has
-- defined love.load/update, before love.load is called.
--
-- Channel with the page (NDJSON files on the Emscripten FS; the page and Lua run
-- on one thread, so whole-file reads and writes cannot interleave):
--   /rmh/test/cmd   page → Lua  lines {"id","cmd","args"}; Lua reads all, then removes it
--   /rmh/test/res   Lua → page  lines appended; the page reads all, then removes it:
--     {"t":"ready","version":…}          the main menu is up and idle (once)
--     {"t":"res","id","ok","data"}       a command finished
--     {"t":"spec","r":{name,ok,skip,msg,ms}}  one in-engine test result (streamed)
--     {"t":"crash","msg"}                a Lua error reached love.errhand (the game stops)
-- Commands: every autopilot command (mp_test/autopilot.lua), plus
--   ping()                           → 'pong'
--   list_specs()                     → ['x_spec', …]
--   run_specs{files?, filter?}       → {passed, failed, skipped, tests, reports}

local json = require('rmh_mp_test.json')
local sched = require('rmh_mp_test.sched')
local AP = require('rmh_mp_test.autopilot')
local spec_engine = require('rmh_mp_test.spec_engine')

local H = { ready = false, CMD = '/rmh/test/cmd', RES = '/rmh/test/res', SPEC_DIR = 'rmh_mp_test/specs' }
RMH_TEST_HARNESS = H

function H.emit(msg)
  local f = io.open(H.RES, 'a')
  if not f then return end
  f:write(json.encode(msg), '\n')
  f:close()
end

local function reply(id, ok, data)
  H.emit({ t = 'res', id = id, ok = ok, data = data })
end

function H.list_specs()
  local out = {}
  for _, item in ipairs(love.filesystem.getDirectoryItems(H.SPEC_DIR)) do
    local name = item:match('^(.-_spec)%.lua$')
    if name then out[#out + 1] = name end
  end
  table.sort(out)
  return json.array(out)
end

--- Between spec files: leave any run (and MP session) for the main menu.
local function to_main_menu()
  if not (G and G.STAGES) or G.STAGE == G.STAGES.MAIN_MENU then return end
  if G.OVERLAY_MENU and G.FUNCS.exit_overlay_menu then G.FUNCS.exit_overlay_menu() end
  G.SETTINGS.paused = false
  G.FUNCS.go_to_menu()
  sched.wait_until(function()
    return G.STAGE == G.STAGES.MAIN_MENU and G.MAIN_MENU_UI ~= nil and AP.idle()
  end, 90, 'main menu between spec files')
end

local function run_specs(args)
  local names = args.files
  if type(names) ~= 'table' or #names == 0 then names = H.list_specs() end
  local files = {}
  for _, name in ipairs(names) do
    name = tostring(name):gsub('%.lua$', '')
    if not name:match('^[%w_]+$') then error('bad spec name ' .. name) end
    local source = love.filesystem.read(H.SPEC_DIR .. '/' .. name .. '.lua')
    if not source then error('no spec ' .. name) end
    files[#files + 1] = { name = name, source = source }
  end
  local summary = spec_engine.run(files, {
    filter = type(args.filter) == 'string' and args.filter or nil,
    env = { AP = AP, json = json },
    on_result = function(r) H.emit({ t = 'spec', r = r }) end,
    before_file = to_main_menu,
  })
  summary.tests = json.array(summary.tests)
  return summary
end

local HARNESS_COMMANDS = {
  ping = function() return 'pong' end,
  list_specs = function() return H.list_specs() end,
  run_specs = run_specs,
}

function H.dispatch(line)
  local msg, err = json.decode(line)
  if type(msg) ~= 'table' or type(msg.id) ~= 'string' or type(msg.cmd) ~= 'string' then
    H.emit({ t = 'res', id = type(msg) == 'table' and msg.id or nil, ok = false, data = { error = 'bad command line: ' .. tostring(err or line) } })
    return
  end
  local args = type(msg.args) == 'table' and msg.args or {}
  local own = HARNESS_COMMANDS[msg.cmd]
  if own then
    sched.spawn(function() return own(args) end, function(ok, value)
      if ok then reply(msg.id, true, value) else reply(msg.id, false, { error = tostring(value) }) end
    end)
  else
    AP.exec(msg.id, msg.cmd, args, reply)
  end
end

function H.pump()
  local f = io.open(H.CMD, 'r')
  if not f then return end
  local text = f:read('*a') or ''
  f:close()
  os.remove(H.CMD)
  for line in text:gmatch('[^\n]+') do H.dispatch(line) end
end

local function check_ready()
  if H.ready then return end
  if G and G.STAGE == G.STAGES.MAIN_MENU and G.MAIN_MENU_UI and AP.idle() then
    H.ready = true
    H.emit({ t = 'ready', version = G.VERSION })
  end
end

-- ── install ──────────────────────────────────────────────────────────────────

if not AP.install() then
  print('[mp_test] harness: /rmh/test/enabled missing; the harness stays off')
  return H
end

-- The splash screen costs seconds on every boot and tests nothing. Skipping it on
-- a fresh profile needs the tutorial treated as done (as the autopilot's prepare
-- does, and MP does — PLAN R-01): the skip path goes straight to main_menu, which
-- indexes tutorial_progress unless the tutorial is complete.
if Game and Game.splash_screen then
  local splash = Game.splash_screen
  Game.splash_screen = function(self, ...)
    if G and G.SETTINGS then
      G.SETTINGS.skip_splash = 'Yes'
      G.SETTINGS.tutorial_complete = true
      G.SETTINGS.tutorial_progress = nil
    end
    return splash(self, ...)
  end
end

local update = love.update
love.update = function(...)
  H.pump()
  local r = update and update(...)
  check_ready()
  return r
end

-- Balatro's own error screen loops forever (`while true do … end` in main.lua's
-- love.errhand), which in the browser freezes the tab, so the page could never
-- read the crash. Under the harness a Lua error is reported and the game stops.
love.errhand = function(msg)
  local trace = debug.traceback(tostring(msg), 2)
  H.emit({ t = 'crash', msg = trace })
  print('[mp_test] CRASH ' .. trace)
end
love.errorhandler = love.errhand

print('[mp_test] harness installed')
return H
