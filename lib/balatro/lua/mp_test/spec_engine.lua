-- mp_test/spec_engine.lua — the L2 in-engine spec runner (PLAN §4 WS14, §6.1).
--
-- Runs lib/balatro/lua/mp_test/specs/*_spec.lua inside the real love.wasm, in the
-- harness page (testing/balatro-e2e/engine). Same authoring API as the L1 runner
-- (lib/balatro/lua/spec/runner.lua) so a spec reads the same at either level:
--
--   describe(name, fn) / it(name, fn) / xit(name, fn) / before_each / after_each
--   expect(v).eq(x) .ne(x) .near(x, eps) .truthy() .falsy() .type(t) and expect(fn).error(text?)
--
-- plus what only the engine has. Every `it` body runs as a coroutine task, so it
-- may wait for the game:
--
--   wait_frames(n), wait_until(pred, seconds, why), sleep(seconds)
--   AP                the autopilot (mp_test/autopilot.lua): AP.run('start_run', {seed='X'}) …
--   report(key, v)    hands a JSON value back to the page (the vitest side compares
--                     reports across boots, e.g. a seed's first-shop digest)
--
-- Each spec file runs in its own environment (globals it defines stay in it, the
-- game's globals are reachable through __index), so files cannot leak into each
-- other or into the game. `it` names are 'file > describe > it' as in L1.
--
-- runner.run(files, opts) must be called inside a sched task. It returns
--   { tests = { {name, ok, skip?, msg?, ms} ... }, passed, failed, skipped, reports = {key=v} }
-- and calls opts.on_result(result) after each test (the harness streams them).

local sched = require('rmh_mp_test.sched')

local runner = {}

-- ── deep equality / expect (same semantics as the L1 runner) ────────────────

local function show(v)
  if type(v) == 'string' then return string.format('%q', v) end
  if type(v) == 'number' then return string.format('%.17g', v) end
  return tostring(v)
end

local function deep_eq(a, b, path, seen)
  if a == b then return true end
  if type(a) ~= 'table' or type(b) ~= 'table' then
    return false, path .. ': expected ' .. show(b) .. ', got ' .. show(a)
  end
  seen = seen or {}
  if seen[a] == b then return true end
  seen[a] = b
  for k, v in pairs(b) do
    local ok, why = deep_eq(a[k], v, path .. '.' .. tostring(k), seen)
    if not ok then return false, why end
  end
  for k in pairs(a) do
    if b[k] == nil then return false, path .. '.' .. tostring(k) .. ': unexpected key' end
  end
  return true
end
runner.deep_eq = deep_eq

local function failure(msg)
  error({ spec_failure = true, msg = msg }, 3)
end

function runner.expect(v)
  local e = {}
  function e.eq(x)
    local ok, why = deep_eq(v, x, 'value')
    if not ok then failure(why) end
    return e
  end
  function e.ne(x)
    if deep_eq(v, x, 'value') then failure('expected values to differ, both ' .. show(v)) end
    return e
  end
  function e.near(x, eps)
    eps = eps or 1e-9
    if type(v) ~= 'number' or type(x) ~= 'number' or math.abs(v - x) > eps then
      failure('expected ' .. show(x) .. ' ± ' .. show(eps) .. ', got ' .. show(v))
    end
    return e
  end
  function e.truthy()
    if not v then failure('expected a truthy value, got ' .. show(v)) end
    return e
  end
  function e.falsy()
    if v then failure('expected a falsy value, got ' .. show(v)) end
    return e
  end
  function e.type(t)
    if type(v) ~= t then failure('expected type ' .. t .. ', got ' .. type(v)) end
    return e
  end
  function e.error(pattern)
    if type(v) ~= 'function' then failure('expect(fn).error needs a function') end
    local ok, err = pcall(v)
    if ok then failure('expected an error, none raised') end
    if type(err) == 'table' and err.spec_failure then err = err.msg end
    if pattern and not tostring(err):find(pattern, 1, true) then
      failure('error ' .. show(tostring(err)) .. ' does not contain ' .. show(pattern))
    end
    return e
  end
  return e
end

-- ── collection ───────────────────────────────────────────────────────────────

local function err_text(err)
  if type(err) == 'table' and err.spec_failure then return err.msg end
  return tostring(err)
end

--- Loads one spec file's source into a fresh environment and collects its tests.
-- Returns tests (array) or nil, error.
function runner.collect(name, source, extra_env)
  local tests, stack = {}, { { name = name, before = {}, after = {} } }
  local function full_name(leaf)
    local parts = {}
    for _, f in ipairs(stack) do parts[#parts + 1] = f.name end
    parts[#parts + 1] = leaf
    return table.concat(parts, ' > ')
  end
  local function hooks(kind)
    local out = {}
    for _, f in ipairs(stack) do
      for _, fn in ipairs(f[kind]) do out[#out + 1] = fn end
    end
    return out
  end
  local env = setmetatable({}, { __index = _G })
  env.describe = function(dname, fn)
    stack[#stack + 1] = { name = dname, before = {}, after = {} }
    fn()
    stack[#stack] = nil
  end
  local function add(tname, fn, skip)
    tests[#tests + 1] = { name = full_name(tname), fn = fn, skip = skip, befores = hooks('before'), afters = hooks('after') }
  end
  env.it = function(tname, fn) add(tname, fn, false) end
  env.xit = function(tname, fn) add(tname, fn, true) end
  env.before_each = function(fn) local f = stack[#stack]; f.before[#f.before + 1] = fn end
  env.after_each = function(fn) local f = stack[#stack]; f.after[#f.after + 1] = fn end
  env.expect = runner.expect
  env.wait_frames = sched.wait_frames
  env.wait_until = sched.wait_until
  env.sleep = sched.sleep
  for k, v in pairs(extra_env or {}) do env[k] = v end

  local chunk, lerr = loadstring(source, '@' .. name)
  if not chunk then return nil, lerr end
  setfenv(chunk, env)
  local ok, cerr = pcall(chunk)
  if not ok then return nil, err_text(cerr) end
  return tests
end

--- Calls fn so that it may yield (wait_* inside a spec) and still has its errors
-- caught. PUC Lua 5.1 cannot yield across pcall/xpcall, so the body runs in its
-- own coroutine and this one forwards each of its yields to the enclosing task.
function runner.protected(fn)
  local co = coroutine.create(fn)
  while true do
    local ok, err = coroutine.resume(co)
    if not ok then
      if type(err) == 'table' and err.spec_failure then return false, err end
      return false, debug.traceback(co, tostring(err))
    end
    if coroutine.status(co) == 'dead' then return true end
    if coroutine.running() then
      coroutine.yield()
    else
      return false, 'the body waited, but it is not running inside a task'
    end
  end
end

local function run_one(t)
  for _, fn in ipairs(t.befores) do
    local ok, err = runner.protected(fn)
    if not ok then return false, 'before_each: ' .. err_text(err) end
  end
  local ok, err = runner.protected(t.fn)
  for i = #t.afters, 1, -1 do
    local aok, aerr = runner.protected(t.afters[i])
    if ok and not aok then ok, err = false, 'after_each: ' .. err_text(aerr) end
  end
  if not ok then return false, err_text(err) end
  return true
end

--- files: array of { name = 'x_spec', source = '...' }
-- opts: { filter = 'text', env = {...}, on_result = fn(result), clock = fn, before_file = fn(file) }
function runner.run(files, opts)
  opts = opts or {}
  local clock = opts.clock or sched.clock
  local summary = { tests = {}, passed = 0, failed = 0, skipped = 0, reports = {} }
  local env = {}
  for k, v in pairs(opts.env or {}) do env[k] = v end
  env.report = function(key, value) summary.reports[tostring(key)] = value end
  local function push(r)
    summary.tests[#summary.tests + 1] = r
    if r.skip then summary.skipped = summary.skipped + 1
    elseif r.ok then summary.passed = summary.passed + 1
    else summary.failed = summary.failed + 1 end
    if opts.on_result then opts.on_result(r) end
  end
  for i, file in ipairs(files) do
    -- Each file starts from the same place (the harness passes "back to the main menu"), so a
    -- spec that leaves a run up (for a screenshot) cannot break the files after it.
    if opts.before_file and i > 1 then
      local ok, err = pcall(opts.before_file, file)
      if not ok then push({ name = file.name .. ' (reset)', ok = false, msg = err_text(err), ms = 0 }) end
    end
    local tests, err = runner.collect(file.name, file.source, env)
    if not tests then
      push({ name = file.name .. ' (load)', ok = false, msg = err, ms = 0 })
    else
      for _, t in ipairs(tests) do
        if not opts.filter or t.name:find(opts.filter, 1, true) then
          if t.skip then
            push({ name = t.name, ok = true, skip = true, ms = 0 })
          else
            local t0 = clock()
            local ok, msg = run_one(t)
            push({ name = t.name, ok = ok, msg = msg, ms = math.floor((clock() - t0) * 1000 + 0.5) })
          end
        end
      end
    end
  end
  return summary
end

return runner
