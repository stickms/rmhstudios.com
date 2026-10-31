-- mp_test/sched.lua — coroutine tasks for the TEST-ONLY driver (PLAN §4 WS14).
--
-- Autopilot commands and in-engine specs need to wait for the game: a state, an
-- idle event queue, a number of frames. Each command runs as a coroutine task
-- that the frame hook resumes once per frame (sched.tick()).
--
--   sched.spawn(fn, done)          start a task; done(ok, value_or_error) when it ends
--   sched.wait_frames(n)           yield n frames (inside a task); while one waits, frames are
--                                  full frames (sched.full_frames(): the autopilot's turbo is off)
--   sched.wait_until(pred, s, why) yield until pred() is truthy; errors 'timeout: why'
--                                  after s seconds of the injected clock (default 30)
--   sched.sleep(s)                 yield for s seconds
--   sched.tick()                   resume every task once (call once per frame)
--   sched.clock = fn               the clock (love.timer.getTime in the engine)
--   sched.in_task()                true inside a task
-- Errors raised inside a task end it with done(false, message-with-traceback).

local sched = { tasks = {}, frame = 0, full_until = 0 }

sched.clock = function()
  if love and love.timer and love.timer.getTime then return love.timer.getTime() end
  return os.clock()
end

-- Inside any coroutine counts: a task's body may run in a nested coroutine that
-- forwards its yields (spec_engine.protected), since PUC Lua 5.1 cannot yield
-- across pcall.
function sched.in_task()
  return coroutine.running() ~= nil
end

local function need_task(what)
  if not sched.in_task() then error(what .. ' can only be called inside a test task', 3) end
end

--- pcall for task code that waits: PUC Lua 5.1 cannot yield across pcall, so fn runs in
-- its own coroutine whose yields are forwarded to the enclosing task. Returns
-- true, value or false, error (with a traceback).
function sched.protected(fn, ...)
  local args = { n = select('#', ...), ... }
  local co = coroutine.create(function() return fn(unpack(args, 1, args.n)) end)
  while true do
    local ok, v = coroutine.resume(co)
    if not ok then return false, debug.traceback(co, tostring(v)) end
    if coroutine.status(co) == 'dead' then return true, v end
    if coroutine.running() then
      coroutine.yield()
    else
      return false, 'protected: the body waited outside a task'
    end
  end
end

function sched.spawn(fn, done)
  local task = { done = done }
  task.co = coroutine.create(function()
    return fn()
  end)
  sched.tasks[#sched.tasks + 1] = task
  return task
end

function sched.wait_frames(n)
  need_task('wait_frames')
  n = math.max(1, n or 1)
  -- A spec that waits frames wants what a player's frames do (one update, one draw each:
  -- "let the engine lay out, update and draw"), so the autopilot's turbo pauses until the
  -- wait is over. A frame count, not a counter, so an abandoned task cannot pin it.
  sched.full_until = math.max(sched.full_until, sched.frame + n)
  for _ = 1, n do coroutine.yield() end
end

--- True while some task is inside wait_frames (see there).
function sched.full_frames()
  return sched.frame <= sched.full_until
end

function sched.wait_until(pred, timeout, why)
  need_task('wait_until')
  local deadline = sched.clock() + (timeout or 30)
  while true do
    local ok, v = pcall(pred)
    if ok and v then return v end
    if sched.clock() > deadline then
      error('timeout: ' .. tostring(why or 'condition') .. (ok and '' or (' (last error: ' .. tostring(v) .. ')')), 2)
    end
    coroutine.yield()
  end
end

function sched.sleep(s)
  need_task('sleep')
  local t = sched.clock() + (s or 0)
  while sched.clock() < t do coroutine.yield() end
end

local function finish(task, ok, value)
  task.finished = true
  if task.done then
    local cok, cerr = pcall(task.done, ok, value)
    if not cok and print then print('[mp_test] task callback failed: ' .. tostring(cerr)) end
  end
end

function sched.tick()
  sched.frame = sched.frame + 1
  -- Tasks spawned during this tick (by a task or a done callback) are appended
  -- to the new list and first run on the next tick.
  local list = sched.tasks
  local live = {}
  sched.tasks = live
  for _, task in ipairs(list) do
    if not task.finished then
      local ok, value = coroutine.resume(task.co)
      if not ok then
        finish(task, false, debug.traceback(task.co, tostring(value)))
      elseif coroutine.status(task.co) == 'dead' then
        finish(task, true, value)
      else
        live[#live + 1] = task
      end
    end
  end
end

function sched.pending()
  return #sched.tasks
end

return sched
