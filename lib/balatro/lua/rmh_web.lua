-- rmh_web.lua — the web platform layer for a player's own copy of Balatro.
--
-- Balatro is written for desktop LÖVE 11.5 (LuaJIT, real OS threads, a native
-- window). In the browser it runs on love.js, LÖVE compiled to WebAssembly by
-- Emscripten, single-threaded and with PUC Lua 5.1. The loader injects this file
-- into the game's virtual filesystem and prefixes `require "rmh_web";` onto the
-- first line of main.lua (so no line numbers move), which makes it the first code
-- to run after LÖVE's boot. It only ever adapts the platform; no game rule changes.
--
-- Talking to the page: there is no JS bridge in the love.js build, but Lua's `io`
-- library reaches the whole Emscripten filesystem, so the two sides trade small
-- files under /rmh (see lib/balatro/runtime.ts):
--   /rmh/size   page → Lua   "<w> <h>" pixel size of the game's frame
--   /rmh/dirty  Lua → page   exists when the save directory changed and should be
--                            flushed to IndexedDB

local RMH = { dirty = false }
_G.RMH_WEB = RMH

local function log(...)
  print('[rmh_web]', ...)
end

----------------------------------------------------------------------------------
-- 0. LuaJIT built-ins. Desktop Balatro runs on LuaJIT; love.js runs PUC Lua 5.1.
-- Every Balatro file parses as 5.1, so what differs is the library: `bit` does
-- not exist, and math.random is a different generator — which would make a
-- seeded run deal different cards than on desktop. Both are ported bit-exact.
----------------------------------------------------------------------------------

if not jit then
  package.loaded['bit'] = require('rmh/bit')
  local luajit_random = require('rmh/luajit_random')
  math.random = luajit_random.random
  math.randomseed = luajit_random.randomseed
end

----------------------------------------------------------------------------------
-- 1. Native modules that have no browser build.
----------------------------------------------------------------------------------

-- `https` (lua-https) only serves the opt-in crash reporter and high-score
-- uploads, both off for this platform. A request reports "no connection".
package.preload['https'] = function()
  return {
    request = function()
      return 0, '', {}
    end,
  }
end

-- luasteam is only required when love.system.getOS() is Windows or OS X, which
-- it never is here ('Web'), but answer the require anyway so nothing can crash on
-- it: without Steam the game uses its own local achievement tracking.
package.preload['luasteam'] = function()
  return {
    init = function()
      return false
    end,
    shutdown = function() end,
  }
end

----------------------------------------------------------------------------------
-- 2. love.thread → cooperative coroutines.
--
-- Balatro runs its sound, save and HTTP managers as threads that loop on
-- Channel:demand(). The love.js compat build has no threads, so each "thread"
-- becomes a coroutine with its own global environment (a real LÖVE thread has its
-- own Lua state; sound_manager.lua, for one, defines a SOURCES global that would
-- otherwise collide with the main state's). Channel:demand() on an empty channel
-- yields, and Channel:push() resumes a waiting consumer straight away, so a save
-- request is written before push() returns. Values are deep-copied on push, as
-- LÖVE serialises them, because the game reuses the tables it pushes.
----------------------------------------------------------------------------------

local threads = {} -- every started, unfinished thread
local current = nil -- the thread whose coroutine is running, if any

local function copy(value, seen)
  if type(value) ~= 'table' then
    return value
  end
  seen = seen or {}
  if seen[value] then
    return seen[value]
  end
  local out = {}
  seen[value] = out
  for k, v in pairs(value) do
    out[copy(k, seen)] = copy(v, seen)
  end
  return out
end

local Channel = {}
Channel.__index = Channel

local function new_channel()
  return setmetatable({ items = {}, first = 1, last = 0, pushed = 0, popped = 0, waiting = {} }, Channel)
end

local resume -- forward declaration

function Channel:getCount()
  return self.last - self.first + 1
end

function Channel:push(value)
  self.last = self.last + 1
  self.items[self.last] = copy(value)
  self.pushed = self.pushed + 1
  local id = self.pushed
  -- Wake one waiting consumer per message, oldest first.
  local waiter = table.remove(self.waiting, 1)
  if waiter then
    resume(waiter)
  end
  return id
end

function Channel:supply(value)
  self:push(value)
  return true
end

function Channel:pop()
  if self.last < self.first then
    return nil
  end
  local value = self.items[self.first]
  self.items[self.first] = nil
  self.first = self.first + 1
  self.popped = self.popped + 1
  return value
end

function Channel:peek()
  return self.items[self.first]
end

function Channel:demand(timeout)
  while self.last < self.first do
    if not current then
      -- The main state cannot block the browser; behave like a timed-out demand.
      return nil
    end
    local me = current
    table.insert(self.waiting, me)
    me.waiting_on = self
    coroutine.yield()
    me.waiting_on = nil
    if timeout then
      break
    end
  end
  return self:pop()
end

function Channel:clear()
  self.items, self.first, self.last = {}, 1, 0
end

function Channel:hasRead(id)
  return self.popped >= id
end

function Channel:performAtomic(fn, ...)
  return fn(self, ...)
end

function Channel:release()
  return true
end

local named_channels = {}

local Thread = {}
Thread.__index = Thread

resume = function(thread)
  if not thread.co or coroutine.status(thread.co) ~= 'suspended' then
    return
  end
  local previous = current
  current = thread
  local ok, err = coroutine.resume(thread.co, unpack(thread.args or {}))
  thread.args = nil
  current = previous
  if not ok then
    thread.error = tostring(err)
    log('thread error: ' .. thread.error)
    if love.threaderror then
      love.threaderror(thread, thread.error)
    end
  end
  if coroutine.status(thread.co) == 'dead' then
    thread.co = nil
    threads[thread] = nil
  end
end

-- The audio pack arrives after the game has started (runtime.ts writes it into
-- resources/sounds, then /rmh/audio-ready). Balatro's sound thread lists that
-- directory once at startup, so it is held until the files are there.
local SOUND_THREAD = 'engine/sound_manager.lua'
local deferred_sound = nil

local function audio_present()
  return love.filesystem.getInfo('resources/sounds/music1.ogg') ~= nil
end

function Thread:start(...)
  if self.co then
    return false
  end
  if self.source == SOUND_THREAD and not audio_present() then
    deferred_sound = { thread = self, args = { ... } }
    return true
  end
  local env = setmetatable({}, { __index = _G })
  setfenv(self.chunk, env)
  local chunk = self.chunk
  self.error = nil
  self.co = coroutine.create(function(...)
    return chunk(...)
  end)
  self.args = { ... }
  threads[self] = true
  resume(self)
  return true
end

function Thread:wait()
  -- Nothing can block; the work a thread does on a message happens inside push().
end

function Thread:isRunning()
  return self.co ~= nil
end

function Thread:getError()
  return self.error
end

function Thread:release()
  self.co = nil
  threads[self] = nil
  return true
end

function Thread:type()
  return 'Thread'
end

function Thread:typeOf(name)
  return name == 'Thread' or name == 'Object'
end

local function load_thread_chunk(source)
  if type(source) == 'string' and not source:find('\n') and love.filesystem.getInfo(source) then
    return assert(love.filesystem.load(source))
  end
  if type(source) == 'userdata' and source.getString then
    return assert(loadstring(source:getString(), '=' .. (source.getFilename and source:getFilename() or 'thread')))
  end
  return assert(loadstring(source, '=thread'))
end

local function install_threads()
  love.thread = love.thread or {}
  love.thread.newThread = function(source)
    return setmetatable({ chunk = load_thread_chunk(source), source = source }, Thread)
  end
  love.thread.getChannel = function(name)
    local channel = named_channels[name]
    if not channel then
      channel = new_channel()
      named_channels[name] = channel
    end
    return channel
  end
  love.thread.newChannel = new_channel
  package.loaded['love.thread'] = love.thread
end

install_threads()

-- `require "love.thread"` inside a thread must keep returning the shim.
package.preload['love.thread'] = function()
  return love.thread
end

-- While the sound thread is held, its channel keeps only what still matters
-- when it starts: the latest message of each kind except one-shot sound
-- effects (a burst of stale effects on arrival is worse than none). The latest
-- 'modulate' carries the music state, so the music starts in the right place.
local function compact_sound_channel()
  local channel = love.thread.getChannel('sound_request')
  local latest, order = {}, {}
  while channel:getCount() > 0 do
    local msg = channel:pop()
    local kind = type(msg) == 'table' and msg.type or tostring(msg)
    if kind ~= 'sound' then
      if not latest[kind] then
        order[#order + 1] = kind
      end
      latest[kind] = msg
    end
  end
  for _, kind in ipairs(order) do
    channel.last = channel.last + 1
    channel.items[channel.last] = latest[kind]
  end
end

local function release_sound_thread()
  if not deferred_sound then
    return
  end
  local f = io.open('/rmh/audio-ready', 'r')
  if not f then
    compact_sound_channel()
    return
  end
  f:close()
  local held = deferred_sound
  deferred_sound = nil
  compact_sound_channel()
  held.thread:start(unpack(held.args))
end

-- Resume any thread that is waiting on a channel that has items again (a push
-- that happened while its consumer was mid-resume) and any thread that slept.
local function pump_threads()
  for thread in pairs(threads) do
    if thread.sleeping then
      thread.sleeping = nil
      resume(thread)
    elseif thread.waiting_on and thread.waiting_on:getCount() > 0 then
      for i, waiter in ipairs(thread.waiting_on.waiting) do
        if waiter == thread then
          table.remove(thread.waiting_on.waiting, i)
          break
        end
      end
      resume(thread)
    end
  end
end

----------------------------------------------------------------------------------
-- 3. Time. The browser paces frames (requestAnimationFrame); a sleep on the main
-- state would only spin, and a sleep inside a thread yields until the next frame.
----------------------------------------------------------------------------------

local function install_timer()
  if not love.timer then
    return
  end
  love.timer.sleep = function()
    if current then
      current.sleeping = true
      coroutine.yield()
    end
  end
end

----------------------------------------------------------------------------------
-- 4. The window is the page's frame. Desktop sizes, displays and fullscreen modes
-- all resolve to it; the page itself provides browser fullscreen.
----------------------------------------------------------------------------------

local web_w, web_h = 1280, 720
local size_check = 0

local function read_size()
  local f = io.open('/rmh/size', 'r')
  if not f then
    return false
  end
  local text = f:read('*a')
  f:close()
  local w, h = text:match('(%d+)%s+(%d+)')
  w, h = tonumber(w), tonumber(h)
  if w and h and w > 0 and h > 0 and (w ~= web_w or h ~= web_h) then
    web_w, web_h = w, h
    return true
  end
  return false
end

local function install_window()
  if not love.window then
    return
  end
  local set_mode = love.window.setMode
  local function web_mode(_, _, flags)
    local merged = {}
    for k, v in pairs(flags or {}) do
      merged[k] = v
    end
    merged.fullscreen = false
    merged.fullscreentype = nil
    merged.borderless = false
    merged.resizable = true
    merged.highdpi = false
    merged.display = 1
    merged.x, merged.y = nil, nil
    return set_mode(web_w, web_h, merged)
  end
  love.window.setMode = web_mode
  love.window.updateMode = web_mode
  love.window.getDesktopDimensions = function()
    return web_w, web_h
  end
  love.window.getFullscreenModes = function()
    return { { width = web_w, height = web_h } }
  end
  love.window.getDisplayCount = function()
    return 1
  end
  love.window.setFullscreen = function()
    return false
  end
  love.window.getFullscreen = function()
    return false, 'desktop'
  end
end

local function follow_size(dt)
  size_check = size_check - dt
  if size_check > 0 then
    return
  end
  size_check = 0.2
  if not read_size() then
    return
  end
  local cw, ch = love.graphics.getDimensions()
  if cw == web_w and ch == web_h then
    return
  end
  love.window.setMode(web_w, web_h, select(3, love.window.getMode()))
  -- Balatro's resize handler re-lays the room and rebuilds its canvas; it needs
  -- G.window_prev, which only exists once the game has initialised its window.
  if love.resize and G and G.window_prev then
    love.resize(love.graphics.getWidth(), love.graphics.getHeight())
  end
end

----------------------------------------------------------------------------------
-- 5. Saves. LÖVE's save directory lives on an IndexedDB-backed mount; every write
-- marks it dirty and the page flushes it (see runtime.ts).
----------------------------------------------------------------------------------

local function install_filesystem()
  local fs = love.filesystem
  for _, name in ipairs({ 'write', 'append', 'remove', 'createDirectory' }) do
    local original = fs[name]
    fs[name] = function(...)
      RMH.dirty = true
      return original(...)
    end
  end
end

local function signal_dirty()
  if not RMH.dirty then
    return
  end
  RMH.dirty = false
  local f = io.open('/rmh/dirty', 'w')
  if f then
    f:write('1')
    f:close()
  end
end

----------------------------------------------------------------------------------
-- 6. Platform flags. Balatro picks features per OS in Game:set_globals(); the web
-- gets the desktop set, minus what a browser tab cannot do (quit, change video
-- mode — the page owns the window), plus a 5 s run-save interval like desktop.
----------------------------------------------------------------------------------

local function web_flags(game)
  game.F_SAVE_TIMER = 5
  game.F_ENGLISH_ONLY = false
  game.F_DISCORD = true
  game.F_CRASH_REPORTS = false
  game.F_HTTP_SCORES = false
  game.F_QUIT_BUTTON = false
  game.F_VIDEO_SETTINGS = false
end

local original_require = require
function require(name, ...)
  local result = original_require(name, ...)
  if name == 'globals' and Game and Game.set_globals and not RMH.flags_hooked then
    RMH.flags_hooked = true
    local set_globals = Game.set_globals
    Game.set_globals = function(self, ...)
      local r = set_globals(self, ...)
      web_flags(self)
      return r
    end
    -- globals.lua ends with `G = Game()`, which has already run set_globals.
    if G then
      web_flags(G)
    end
  end
  return result
end

----------------------------------------------------------------------------------
-- 7. Shaders. love.js renders through WebGL 1, i.e. GLSL ES 1.00, whose Appendix A
-- only allows `for` loops whose bounds are constant expressions. Desktop GL is
-- lenient. hologram.fs bounds its glow loop by `int glow_samples = 4;` — never
-- reassigned — so any such loop-bound local is made `const`. A file ending on a
-- directive with no newline also gets one (the ES preprocessor warns, some fail).
----------------------------------------------------------------------------------

function RMH.webgl_shader_source(code)
  local bounds = {}
  for header in code:gmatch('for%s*(%b())') do
    local index = header:match('^%(%s*int%s+([%a_][%w_]*)')
    for name in header:gmatch('[%a_][%w_]*') do
      if name ~= index then
        bounds[name] = true
      end
    end
  end
  for name in pairs(bounds) do
    local assigned = code:match('[^%w_]' .. name .. '%s*[%+%-%*/]?=[^=]')
    local decl = '([^%w_])int(%s+' .. name .. '%s*=%s*%-?[%d%.]+%s*;)'
    -- Only the declaration itself may assign it.
    local _, assignments = code:gsub('[^%w_]' .. name .. '%s*[%+%-%*/]?=[^=]', '')
    if assigned and assignments == 1 and code:match(decl) then
      code = code:gsub(decl, '%1const int%2', 1)
    end
  end
  if code:sub(-1) ~= '\n' then
    code = code .. '\n'
  end
  return code
end

-- WebGL 1 cannot build mipmaps for a texture whose sides are not powers of two,
-- and Balatro asks for mipmaps on every atlas. Those images load without them
-- (the game never sets a mipmap filter, so nothing else changes).
local function is_pot(n)
  while n > 1 and n % 2 == 0 do
    n = n / 2
  end
  return n == 1
end

local function install_images()
  local new_image = love.graphics.newImage
  love.graphics.newImage = function(source, settings, ...)
    if type(settings) == 'table' and settings.mipmaps then
      if type(source) == 'string' then
        source = love.image.newImageData(source)
      end
      if type(source) == 'userdata' and source.getDimensions then
        local w, h = source:getDimensions()
        if not (is_pot(w) and is_pot(h)) then
          local copy = {}
          for k, v in pairs(settings) do
            copy[k] = v
          end
          copy.mipmaps = false
          settings = copy
        end
      end
    end
    return new_image(source, settings, ...)
  end
end

local function install_shaders()
  local new_shader = love.graphics.newShader
  love.graphics.newShader = function(a, b, ...)
    if type(a) == 'string' and not a:find('\n') and love.filesystem.getInfo(a) then
      a = love.filesystem.read(a)
    end
    if type(a) == 'string' then
      a = RMH.webgl_shader_source(a)
    end
    if type(b) == 'string' and b:find('\n') then
      b = RMH.webgl_shader_source(b)
    end
    return new_shader(a, b, ...)
  end
end

----------------------------------------------------------------------------------
-- 8. One per-frame hook. Balatro's love.run calls love.event.pump() every frame.
----------------------------------------------------------------------------------

install_timer()
install_window()
install_filesystem()
install_images()
install_shaders()
read_size()

local pump = love.event.pump
local last = love.timer.getTime()
love.event.pump = function(...)
  local now = love.timer.getTime()
  local dt = now - last
  last = now
  release_sound_thread()
  pump_threads()
  follow_size(dt)
  signal_dirty()
  return pump(...)
end

log('platform layer ready (' .. tostring(love.system.getOS()) .. ', save dir ' .. tostring(love.filesystem.getSaveDirectory()) .. ')')

return RMH
