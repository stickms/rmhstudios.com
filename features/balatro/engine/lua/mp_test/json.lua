-- mp_test/json.lua — the JSON codec of the TEST-ONLY driver (PLAN §4 WS14).
--
-- The harness and the autopilot trade NDJSON lines with the page. This codec
-- belongs to the test driver so the driver does not depend on the shipped
-- mailbox codec (rmh/json.lua, WS3) while that is being written; nothing in a
-- shipped pack requires it. Pure Lua 5.1.
--
--   json.encode(v)   objects get their keys sorted (deterministic digests);
--                    numbers use %.17g; inf/-inf become "inf"/"-inf" and NaN
--                    becomes "inf" (PLAN §0.9); a table with keys 1..n only is
--                    an array, an empty table is {} unless json.array(t) marked it.
--   json.decode(s)   returns the value, or nil plus an error message. JSON null
--                    decodes to json.null (a sentinel), so arrays keep their length.

local json = {}

json.null = setmetatable({}, { __tostring = function() return 'null' end })
local ARRAY = setmetatable({}, { __mode = 'k' })

--- Marks a table so it encodes as an array even when empty.
function json.array(t)
  t = t or {}
  ARRAY[t] = true
  return t
end

local escapes = {
  ['"'] = '\\"', ['\\'] = '\\\\', ['\b'] = '\\b', ['\f'] = '\\f',
  ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t',
}

local function encode_string(s)
  return '"' .. s:gsub('[%c"\\]', function(c)
    return escapes[c] or string.format('\\u%04x', c:byte())
  end) .. '"'
end

local function encode_number(n)
  if n ~= n then return '"inf"' end
  if n == math.huge then return '"inf"' end
  if n == -math.huge then return '"-inf"' end
  if n == math.floor(n) and math.abs(n) < 1e15 then return string.format('%d', n) end
  return string.format('%.17g', n)
end

local function is_array(t)
  if ARRAY[t] then return true end
  local n = 0
  for k in pairs(t) do
    if type(k) ~= 'number' or k < 1 or k ~= math.floor(k) then return false end
    n = n + 1
  end
  if n == 0 then return false end
  for i = 1, n do
    if t[i] == nil then return false end
  end
  return true
end

local encode

local function encode_table(t, stack)
  if stack[t] then error('json.encode: cycle') end
  stack[t] = true
  local out = {}
  if is_array(t) then
    for i = 1, #t do out[i] = encode(t[i], stack) end
    stack[t] = nil
    return '[' .. table.concat(out, ',') .. ']'
  end
  local keys = {}
  for k, v in pairs(t) do
    local tk = type(k)
    if (tk == 'string' or tk == 'number') and type(v) ~= 'function' and type(v) ~= 'userdata' then
      keys[#keys + 1] = tostring(k)
    end
  end
  table.sort(keys)
  for i, k in ipairs(keys) do
    local v = t[k]
    if v == nil then v = t[tonumber(k)] end
    out[i] = encode_string(k) .. ':' .. encode(v, stack)
  end
  stack[t] = nil
  return '{' .. table.concat(out, ',') .. '}'
end

encode = function(v, stack)
  local tv = type(v)
  if v == nil or v == json.null then return 'null' end
  if tv == 'boolean' then return v and 'true' or 'false' end
  if tv == 'number' then return encode_number(v) end
  if tv == 'string' then return encode_string(v) end
  if tv == 'table' then return encode_table(v, stack) end
  return encode_string('<' .. tv .. '>')
end

function json.encode(v)
  return encode(v, {})
end

-- ── decode ───────────────────────────────────────────────────────────────────

local function utf8_char(cp)
  if cp < 0x80 then return string.char(cp) end
  if cp < 0x800 then
    return string.char(0xC0 + math.floor(cp / 0x40), 0x80 + cp % 0x40)
  end
  if cp < 0x10000 then
    return string.char(0xE0 + math.floor(cp / 0x1000), 0x80 + math.floor(cp / 0x40) % 0x40, 0x80 + cp % 0x40)
  end
  return string.char(
    0xF0 + math.floor(cp / 0x40000),
    0x80 + math.floor(cp / 0x1000) % 0x40,
    0x80 + math.floor(cp / 0x40) % 0x40,
    0x80 + cp % 0x40
  )
end

local decode_value

local function skip_ws(s, i)
  local _, e = s:find('^[ \t\r\n]*', i)
  return e + 1
end

local function decode_string(s, i)
  -- s:sub(i, i) == '"'
  local out, j = {}, i + 1
  while true do
    local c = s:sub(j, j)
    if c == '' then error('unterminated string') end
    if c == '"' then return table.concat(out), j + 1 end
    if c == '\\' then
      local n = s:sub(j + 1, j + 1)
      local simple = { ['"'] = '"', ['\\'] = '\\', ['/'] = '/', b = '\b', f = '\f', n = '\n', r = '\r', t = '\t' }
      if simple[n] then
        out[#out + 1] = simple[n]
        j = j + 2
      elseif n == 'u' then
        local hex = s:sub(j + 2, j + 5)
        if not hex:match('^%x%x%x%x$') then error('bad \\u escape') end
        local cp = tonumber(hex, 16)
        j = j + 6
        if cp >= 0xD800 and cp <= 0xDBFF and s:sub(j, j + 1) == '\\u' then
          local lo = tonumber(s:sub(j + 2, j + 5), 16)
          if lo and lo >= 0xDC00 and lo <= 0xDFFF then
            cp = 0x10000 + (cp - 0xD800) * 0x400 + (lo - 0xDC00)
            j = j + 6
          end
        end
        out[#out + 1] = utf8_char(cp)
      else
        error('bad escape')
      end
    else
      local e = s:find('["\\]', j)
      if not e then error('unterminated string') end
      out[#out + 1] = s:sub(j, e - 1)
      j = e
    end
  end
end

decode_value = function(s, i, depth)
  if depth > 64 then error('too deep') end
  i = skip_ws(s, i)
  local c = s:sub(i, i)
  if c == '{' then
    local obj = {}
    i = skip_ws(s, i + 1)
    if s:sub(i, i) == '}' then return obj, i + 1 end
    while true do
      if s:sub(i, i) ~= '"' then error('expected key at ' .. i) end
      local k
      k, i = decode_string(s, i)
      i = skip_ws(s, i)
      if s:sub(i, i) ~= ':' then error('expected : at ' .. i) end
      local v
      v, i = decode_value(s, i + 1, depth + 1)
      obj[k] = v
      i = skip_ws(s, i)
      local d = s:sub(i, i)
      if d == '}' then return obj, i + 1 end
      if d ~= ',' then error('expected , or } at ' .. i) end
      i = skip_ws(s, i + 1)
    end
  elseif c == '[' then
    local arr = json.array({})
    i = skip_ws(s, i + 1)
    if s:sub(i, i) == ']' then return arr, i + 1 end
    while true do
      local v
      v, i = decode_value(s, i, depth + 1)
      arr[#arr + 1] = v
      i = skip_ws(s, i)
      local d = s:sub(i, i)
      if d == ']' then return arr, i + 1 end
      if d ~= ',' then error('expected , or ] at ' .. i) end
      i = i + 1
    end
  elseif c == '"' then
    return decode_string(s, i)
  elseif s:sub(i, i + 3) == 'true' then
    return true, i + 4
  elseif s:sub(i, i + 4) == 'false' then
    return false, i + 5
  elseif s:sub(i, i + 3) == 'null' then
    return json.null, i + 4
  else
    local num = s:match('^-?%d+%.?%d*[eE]?[-+]?%d*', i)
    if not num or num == '' or num == '-' then error('unexpected ' .. (c == '' and 'end' or c) .. ' at ' .. i) end
    local n = tonumber(num)
    if not n then error('bad number at ' .. i) end
    return n, i + #num
  end
end

function json.decode(s)
  if type(s) ~= 'string' then return nil, 'not a string' end
  local ok, v, i = pcall(decode_value, s, 1, 0)
  if not ok then return nil, tostring(v) end
  i = skip_ws(s, i)
  if i <= #s then return nil, 'trailing data at ' .. i end
  return v
end

return json
