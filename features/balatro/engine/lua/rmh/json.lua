-- rmh/json.lua: strict JSON for the Lua<->JS mailbox (PLAN §3.c; rmh/net.lua).
-- encode: numbers as %.17g (exact doubles); NaN/inf, cycles, functions and mixed or
-- sparse tables are errors; object keys sorted. An empty table is {} unless J.array.
-- decode: strict RFC 8259; a null object field is dropped (nil), a null array item
-- is J.null; arrays carry J.array's marker so [] re-encodes as []. Never loadstring.
local J = { MAX_DEPTH = 64 }
local huge = math.huge
local fmt, byte, char, sub, find, concat, floor = string.format, string.byte, string.char, string.sub, string.find, table.concat, math.floor

J.null = setmetatable({}, { __tostring = function() return 'null' end })
local ARR = { __jsontype = 'array' }
function J.array(t) return setmetatable(t or {}, ARR) end
function J.is_array(t) return getmetatable(t) == ARR end

local ESC = { ['"'] = '\\"', ['\\'] = '\\\\', ['\b'] = '\\b', ['\f'] = '\\f', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
local function esc(c) return ESC[c] or fmt('\\u%04x', byte(c)) end

local function enc(v, out, seen, depth)
  local tv = type(v)
  if v == nil or v == J.null then out[#out + 1] = 'null'
  elseif tv == 'boolean' then out[#out + 1] = v and 'true' or 'false'
  elseif tv == 'number' then
    if v ~= v or v == huge or v == -huge then error('json: cannot encode non-finite number', 0) end
    out[#out + 1] = fmt('%.17g', v)
  elseif tv == 'string' then out[#out + 1] = '"' .. v:gsub('[%c"\\]', esc) .. '"'
  elseif tv == 'table' then
    if seen[v] then error('json: cycle', 0) end
    if depth > J.MAX_DEPTH then error('json: too deep', 0) end
    seen[v] = true
    local n, keys = 0, {}
    for k in pairs(v) do
      if type(k) == 'string' then keys[#keys + 1] = k
      elseif type(k) == 'number' and k >= 1 and floor(k) == k then n = n + 1
      else error('json: bad key ' .. tostring(k), 0) end
    end
    if n > 0 and #keys > 0 then error('json: mixed table', 0) end
    if n > 0 or (#keys == 0 and getmetatable(v) == ARR) then
      if n ~= #v then error('json: sparse array', 0) end
      out[#out + 1] = '['
      for i = 1, n do
        if i > 1 then out[#out + 1] = ',' end
        enc(v[i], out, seen, depth + 1)
      end
      out[#out + 1] = ']'
    else
      table.sort(keys)
      out[#out + 1] = '{'
      for i, k in ipairs(keys) do
        if i > 1 then out[#out + 1] = ',' end
        enc(k, out, seen, depth + 1)
        out[#out + 1] = ':'
        enc(v[k], out, seen, depth + 1)
      end
      out[#out + 1] = '}'
    end
    seen[v] = nil
  else error('json: cannot encode ' .. tv, 0) end
end

function J.encode(v)
  local out = {}
  enc(v, out, {}, 0)
  return concat(out)
end

local UNESC = { ['"'] = '"', ['\\'] = '\\', ['/'] = '/', b = '\b', f = '\f', n = '\n', r = '\r', t = '\t' }

local function utf8(cp)
  if cp < 0x80 then return char(cp) end
  if cp < 0x800 then return char(0xC0 + floor(cp / 64), 0x80 + cp % 64) end
  if cp < 0x10000 then return char(0xE0 + floor(cp / 4096), 0x80 + floor(cp / 64) % 64, 0x80 + cp % 64) end
  return char(0xF0 + floor(cp / 262144), 0x80 + floor(cp / 4096) % 64, 0x80 + floor(cp / 64) % 64, 0x80 + cp % 64)
end

-- The decoder keeps its cursor in module locals (S, P, D) instead of per-call closures: the
-- mailbox decodes every inbound line on the frame it arrives (PLAN §6.4 busy budget), and a
-- string without escapes is one find + one sub. decode calls no user code, so it never re-enters.
local S, P, D = nil, 1, 0

local function derr(m) error(fmt('json: %s at byte %d', m, P), 0) end

local function ws()
  local c = byte(S, P)
  if c == 32 or c == 9 or c == 10 or c == 13 then P = find(S, '[^ \t\r\n]', P) or #S + 1 end
end

local function hex(at)
  local h = sub(S, at, at + 3)
  return find(h, '^%x%x%x%x$') and tonumber(h, 16)
end

local function dstr()
  local start = P + 1
  local _, b = find(S, '^[^"\\%z\1-\31]*"', start)
  if b then
    P = b + 1
    return sub(S, start, b - 1)
  end
  local buf = {}
  P = start
  while true do
    local a, e2 = find(S, '^[^"\\%z\1-\31]+', P)
    if a then buf[#buf + 1] = sub(S, a, e2); P = e2 + 1 end
    local c = sub(S, P, P)
    if c == '"' then P = P + 1; return concat(buf) end
    if c == '' then derr('unterminated string') end
    if c ~= '\\' then derr('control character in string') end
    local e = sub(S, P + 1, P + 1)
    if e == 'u' then
      local cp = hex(P + 2) or derr('bad \\u escape')
      P = P + 6
      if cp >= 0xD800 and cp <= 0xDBFF then
        local lo = sub(S, P, P + 1) == '\\u' and hex(P + 2)
        if lo and lo >= 0xDC00 and lo <= 0xDFFF then
          cp, P = 0x10000 + (cp - 0xD800) * 0x400 + (lo - 0xDC00), P + 6
        else cp = 0xFFFD end
      elseif cp >= 0xDC00 and cp <= 0xDFFF then cp = 0xFFFD end
      buf[#buf + 1] = utf8(cp)
    else
      buf[#buf + 1] = UNESC[e] or derr('bad escape')
      P = P + 2
    end
  end
end

local function digits(at)
  local _, e = find(S, '^%d+', at)
  return e or derr('bad number')
end

local function dnum()
  local st = P
  if byte(S, P) == 45 then P = P + 1 end
  local c = byte(S, P)
  if c == 48 then P = P + 1
  elseif c and c >= 49 and c <= 57 then P = digits(P) + 1
  else derr('bad number') end
  c = byte(S, P)
  if c == 46 then P = digits(P + 1) + 1; c = byte(S, P) end
  if c == 101 or c == 69 then
    P = P + 1
    c = byte(S, P)
    if c == 45 or c == 43 then P = P + 1 end
    P = digits(P) + 1
  end
  return tonumber(sub(S, st, P - 1))
end

local dvalue

--- After an item of a list: ',' continues (true), `close` ends it (false).
local function more(close, closech)
  ws()
  local c = byte(S, P)
  P = P + 1
  if c == close then return false end
  if c ~= 44 then P = P - 1; derr("expected ',' or '" .. closech .. "'") end
  return true
end

local function enter()
  D = D + 1
  if D > J.MAX_DEPTH then derr('too deep') end
  P = P + 1
  ws()
end

dvalue = function()
  ws()
  local c = byte(S, P)
  if c == 123 then -- {
    enter()
    local t = {}
    if byte(S, P) == 125 then P = P + 1
    else
      repeat
        ws()
        if byte(S, P) ~= 34 then derr('expected a key') end
        local k = dstr()
        ws()
        if byte(S, P) ~= 58 then derr("expected ':'") end
        P = P + 1
        local v = dvalue()
        if v == J.null then v = nil end
        t[k] = v
      until not more(125, '}')
    end
    D = D - 1
    return t
  elseif c == 91 then -- [
    enter()
    local t = J.array()
    if byte(S, P) == 93 then P = P + 1
    else
      repeat t[#t + 1] = dvalue() until not more(93, ']')
    end
    D = D - 1
    return t
  elseif c == 34 then return dstr()
  elseif c == 45 or (c and c >= 48 and c <= 57) then return dnum()
  elseif c == 116 and sub(S, P, P + 3) == 'true' then P = P + 4; return true
  elseif c == 102 and sub(S, P, P + 4) == 'false' then P = P + 5; return false
  elseif c == 110 and sub(S, P, P + 3) == 'null' then P = P + 4; return J.null
  end
  derr(c == nil and 'unexpected end' or 'unexpected ' .. fmt('%q', char(c)))
end

function J.decode(s)
  if type(s) ~= 'string' then error('json: expected a string', 0) end
  S, P, D = s, 1, 0
  local v = dvalue()
  ws()
  if P <= #S then derr('trailing data') end
  S = nil
  return v
end

return J
