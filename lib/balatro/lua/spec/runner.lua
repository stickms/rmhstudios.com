-- Lua L1 spec runner (PLAN §4 WS0 task 3, §6.1). Pure Lua 5.1, no dependencies.
--
--   lua5.1 lib/balatro/lua/spec/runner.lua                      -- every spec/*_spec.lua
--   lua5.1 lib/balatro/lua/spec/runner.lua --filter mailbox     -- tests whose full name contains it
--   lua5.1 lib/balatro/lua/spec/runner.lua path/a_spec.lua ...  -- just these files
--
-- Output is TAP version 13 on stdout; the exit status is 1 when anything failed.
-- `pnpm test:balatro` runs it through lib/balatro/mp/__tests__/lua-specs.test.ts.
--
-- A spec file is plain Lua that calls the globals below:
--
--   describe('name', function() ... end)        -- nestable
--   it('does a thing', function() ... end)      -- xit(...) marks one skipped
--   before_each(fn) / after_each(fn)            -- per describe level
--   expect(v).eq(x)        deep equality (tables compared key by key)
--   expect(v).ne(x)
--   expect(v).near(x, eps) |v - x| <= eps (default 1e-9)
--   expect(v).truthy() / expect(v).falsy()
--   expect(v).type('table')
--   expect(fn).error('pattern?')   fn must raise; the message must contain the plain text
--
-- Environment for spec files:
--   package.path starts with lib/balatro/lua/?.lua;lib/balatro/lua/mp/?.lua, so
--   `require 'rmh_mp.protocol'` and `require 'spec.fake_g'` work.
--   RMH_SPEC.root      repo root ('' when run from the root), ends with '/' otherwise
--   RMH_SPEC.fixtures  lib/balatro/mp/__fixtures__/ (the JSON shared with TS)
-- Globals and package.loaded entries a spec file creates are removed after it runs,
-- so files cannot leak state into each other.

local script = (arg and arg[0]) or 'lib/balatro/lua/spec/runner.lua'
local root = script:match('^(.-)lib/balatro/lua/spec/runner%.lua$') or ''

package.path = root .. 'lib/balatro/lua/?.lua;' .. root .. 'lib/balatro/lua/mp/?.lua;' .. package.path

RMH_SPEC = {
  root = root,
  dir = root .. 'lib/balatro/lua/spec/',
  fixtures = root .. 'lib/balatro/mp/__fixtures__/',
}

-- ── Arguments ────────────────────────────────────────────────────────────────

local filter, files = nil, {}
do
  local i = 1
  while arg and arg[i] do
    local a = arg[i]
    if a == '--filter' then
      filter = arg[i + 1]
      i = i + 1
    elseif a:sub(1, 9) == '--filter=' then
      filter = a:sub(10)
    else
      files[#files + 1] = a
    end
    i = i + 1
  end
end

if #files == 0 then
  local p = io.popen('ls -1 "' .. RMH_SPEC.dir .. '" 2>/dev/null')
  if p then
    for name in p:lines() do
      if name:match('_spec%.lua$') then files[#files + 1] = RMH_SPEC.dir .. name end
    end
    p:close()
  end
  table.sort(files)
end

-- ── Deep equality with a path to the first difference ───────────────────────

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

-- ── expect ───────────────────────────────────────────────────────────────────

local function failure(msg)
  error({ spec_failure = true, msg = msg }, 3)
end

function expect(v)
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

-- ── describe / it ────────────────────────────────────────────────────────────

local tests -- per file: { name, fn, skip, befores, afters }
local stack -- describe frames: { name, before = {}, after = {} }

local function full_name(leaf)
  local parts = {}
  for _, f in ipairs(stack) do parts[#parts + 1] = f.name end
  parts[#parts + 1] = leaf
  return table.concat(parts, ' > ')
end

local function collect_hooks(kind)
  local out = {}
  for _, f in ipairs(stack) do
    for _, fn in ipairs(f[kind]) do out[#out + 1] = fn end
  end
  return out
end

function describe(name, fn)
  stack[#stack + 1] = { name = name, before = {}, after = {} }
  fn()
  stack[#stack] = nil
end

local function add_test(name, fn, skip)
  tests[#tests + 1] = {
    name = full_name(name),
    fn = fn,
    skip = skip,
    befores = collect_hooks('before'),
    afters = collect_hooks('after'),
  }
end

function it(name, fn) add_test(name, fn, false) end
function xit(name, fn) add_test(name, fn, true) end
function before_each(fn) local f = stack[#stack]; f.before[#f.before + 1] = fn end
function after_each(fn) local f = stack[#stack]; f.after[#f.after + 1] = fn end

-- ── Running ──────────────────────────────────────────────────────────────────

local RUNNER_GLOBALS = {}
for k in pairs(_G) do RUNNER_GLOBALS[k] = true end
local RUNNER_LOADED = {}
for k in pairs(package.loaded) do RUNNER_LOADED[k] = true end

local n, failed, skipped = 0, 0, 0
local out = io.stdout

local function emit_fail(name, msg)
  n = n + 1
  failed = failed + 1
  out:write('not ok ', n, ' - ', name, '\n')
  out:write('  ---\n')
  for line in (tostring(msg) .. '\n'):gmatch('([^\n]*)\n') do
    out:write('  # ', line, '\n')
  end
  out:write('  ...\n')
end

local function traceback(err)
  if type(err) == 'table' and err.spec_failure then return err end
  return debug.traceback(tostring(err), 2)
end

local function run_one(t)
  for _, fn in ipairs(t.befores) do
    local ok, err = xpcall(fn, traceback)
    if not ok then return false, 'before_each: ' .. (type(err) == 'table' and err.msg or err) end
  end
  local ok, err = xpcall(t.fn, traceback)
  for i = #t.afters, 1, -1 do
    local aok, aerr = xpcall(t.afters[i], traceback)
    if ok and not aok then ok, err = false, 'after_each: ' .. (type(aerr) == 'table' and aerr.msg or aerr) end
  end
  if not ok then return false, type(err) == 'table' and err.msg or err end
  return true
end

out:write('TAP version 13\n')

for _, file in ipairs(files) do
  tests, stack = {}, {}
  local short = file:gsub('^' .. root:gsub('%p', '%%%0'), '')
  stack[1] = { name = short:match('([^/]+)%.lua$') or short, before = {}, after = {} }
  local chunk, lerr = loadfile(file)
  local ok, err = chunk ~= nil, lerr
  if chunk then ok, err = xpcall(chunk, traceback) end
  stack = {}
  if not ok then
    emit_fail(short .. ' (load)', type(err) == 'table' and err.msg or err)
  else
    for _, t in ipairs(tests) do
      if not filter or t.name:find(filter, 1, true) then
        if t.skip then
          n = n + 1
          skipped = skipped + 1
          out:write('ok ', n, ' - ', t.name, ' # SKIP\n')
        else
          local tok, terr = run_one(t)
          if tok then
            n = n + 1
            out:write('ok ', n, ' - ', t.name, '\n')
          else
            emit_fail(t.name, terr)
          end
        end
      end
    end
  end
  -- Isolation: drop whatever the file added.
  for k in pairs(package.loaded) do
    if not RUNNER_LOADED[k] then package.loaded[k] = nil end
  end
  for k in pairs(_G) do
    if not RUNNER_GLOBALS[k] then _G[k] = nil end
  end
end

out:write('1..', n, '\n')
out:write('# files ', #files, ', tests ', n, ', failed ', failed, ', skipped ', skipped, '\n')
out:flush()
os.exit(failed > 0 and 1 or 0)
