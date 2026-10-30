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

function J.decode(s)
  if type(s) ~= 'string' then error('json: expected a string', 0) end
  local pos, depth = 1, 0
  local function err(m) error(fmt('json: %s at byte %d', m, pos), 0) end
  local function ws() pos = find(s, '[^ \t\r\n]', pos) or #s + 1 end
  local function hex(at)
    local h = sub(s, at, at + 3)
    return find(h, '^%x%x%x%x$') and tonumber(h, 16)
  end
  local function str()
    local buf = {}
    pos = pos + 1
    while true do
      local a, b = find(s, '^[^"\\%z\1-\31]+', pos)
      if a then buf[#buf + 1] = sub(s, a, b); pos = b + 1 end
      local c = sub(s, pos, pos)
      if c == '"' then pos = pos + 1; return concat(buf) end
      if c == '' then err('unterminated string') end
      if c ~= '\\' then err('control character in string') end
      local e = sub(s, pos + 1, pos + 1)
      if e == 'u' then
        local cp = hex(pos + 2) or err('bad \\u escape')
        pos = pos + 6
        if cp >= 0xD800 and cp <= 0xDBFF then
          local lo = sub(s, pos, pos + 1) == '\\u' and hex(pos + 2)
          if lo and lo >= 0xDC00 and lo <= 0xDFFF then
            cp, pos = 0x10000 + (cp - 0xD800) * 0x400 + (lo - 0xDC00), pos + 6
          else cp = 0xFFFD end
        elseif cp >= 0xDC00 and cp <= 0xDFFF then cp = 0xFFFD end
        buf[#buf + 1] = utf8(cp)
      else
        buf[#buf + 1] = UNESC[e] or err('bad escape')
        pos = pos + 2
      end
    end
  end
  local function digits(at)
    local _, e = find(s, '^%d+', at)
    return e or err('bad number')
  end
  local function num()
    local st = pos
    if sub(s, pos, pos) == '-' then pos = pos + 1 end
    if sub(s, pos, pos) == '0' then pos = pos + 1
    elseif find(s, '^[1-9]', pos) then pos = digits(pos) + 1
    else err('bad number') end
    if sub(s, pos, pos) == '.' then pos = digits(pos + 1) + 1 end
    if find(s, '^[eE]', pos) then
      pos = pos + 1
      if find(s, '^[-+]', pos) then pos = pos + 1 end
      pos = digits(pos) + 1
    end
    return tonumber(sub(s, st, pos - 1))
  end
  local value
  local function list(close, item)
    depth = depth + 1
    if depth > J.MAX_DEPTH then err('too deep') end
    pos = pos + 1
    ws()
    if sub(s, pos, pos) == close then pos = pos + 1
    else
      while true do
        item()
        ws()
        local c = sub(s, pos, pos)
        pos = pos + 1
        if c == close then break end
        if c ~= ',' then pos = pos - 1; err("expected ',' or '" .. close .. "'") end
      end
    end
    depth = depth - 1
  end
  value = function()
    ws()
    local c = sub(s, pos, pos)
    if c == '{' then
      local t = {}
      list('}', function()
        ws()
        if sub(s, pos, pos) ~= '"' then err('expected a key') end
        local k = str()
        ws()
        if sub(s, pos, pos) ~= ':' then err("expected ':'") end
        pos = pos + 1
        local v = value()
        if v == J.null then v = nil end
        t[k] = v
      end)
      return t
    elseif c == '[' then
      local t = J.array()
      list(']', function() t[#t + 1] = value() end)
      return t
    elseif c == '"' then return str()
    elseif c == '-' or find(c, '^%d') then return num()
    elseif sub(s, pos, pos + 3) == 'true' then pos = pos + 4; return true
    elseif sub(s, pos, pos + 4) == 'false' then pos = pos + 5; return false
    elseif sub(s, pos, pos + 3) == 'null' then pos = pos + 4; return J.null
    end
    err(c == '' and 'unexpected end' or 'unexpected ' .. fmt('%q', c))
  end
  local v = value()
  ws()
  if pos <= #s then err('trailing data') end
  return v
end

return J
