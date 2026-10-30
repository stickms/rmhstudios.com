-- A small strict JSON decoder for the spec runner only (reads the shared
-- fixtures in lib/balatro/mp/__fixtures__). It is NOT the runtime decoder:
-- the game uses lib/balatro/lua/rmh/json.lua (WS3). Kept separate so the
-- protocol specs do not depend on another stream's module.
--
--   local J = require 'spec.json_fixture'
--   local value = J.decode(text, null_sentinel)   -- JSON null -> null_sentinel (default nil)
--   local value = J.read_file(path, null_sentinel)
--   local value = J.resolve_refs(value, objects)  -- { "$ref": name } -> objects[name], recursively

local J = {}

local escapes = { ['"'] = '"', ['\\'] = '\\', ['/'] = '/', b = '\b', f = '\f', n = '\n', r = '\r', t = '\t' }

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

function J.decode(s, null)
  local pos = 1

  local function err(msg)
    error(string.format('json: %s at byte %d', msg, pos), 0)
  end

  local function ws()
    pos = s:find('[^ \t\r\n]', pos) or (#s + 1)
  end

  local value

  local function str()
    pos = pos + 1
    local buf = {}
    while true do
      local c = s:sub(pos, pos)
      if c == '' then err('unterminated string') end
      if c == '"' then
        pos = pos + 1
        return table.concat(buf)
      end
      if c == '\\' then
        local e = s:sub(pos + 1, pos + 1)
        if e == 'u' then
          local hex = s:sub(pos + 2, pos + 5)
          if not hex:match('^%x%x%x%x$') then err('bad \\u escape') end
          local cp = tonumber(hex, 16)
          pos = pos + 6
          if cp >= 0xD800 and cp <= 0xDBFF and s:sub(pos, pos + 1) == '\\u' then
            local lo = tonumber(s:sub(pos + 2, pos + 5), 16)
            if lo and lo >= 0xDC00 and lo <= 0xDFFF then
              cp = 0x10000 + (cp - 0xD800) * 0x400 + (lo - 0xDC00)
              pos = pos + 6
            end
          end
          buf[#buf + 1] = utf8_char(cp)
        else
          local r = escapes[e]
          if not r then err('bad escape') end
          buf[#buf + 1] = r
          pos = pos + 2
        end
      else
        local stop = s:find('["\\]', pos) or (#s + 1)
        buf[#buf + 1] = s:sub(pos, stop - 1)
        pos = stop
      end
    end
  end

  local function num()
    local text = s:match('^-?%d+%.?%d*[eE]?[-+]?%d*', pos)
    if not text or text == '' or text == '-' then err('bad number') end
    pos = pos + #text
    local v = tonumber(text)
    if v == nil then err('bad number ' .. text) end
    return v
  end

  value = function()
    ws()
    local c = s:sub(pos, pos)
    if c == '{' then
      pos = pos + 1
      local obj = {}
      ws()
      if s:sub(pos, pos) == '}' then
        pos = pos + 1
        return obj
      end
      while true do
        ws()
        if s:sub(pos, pos) ~= '"' then err('expected key') end
        local k = str()
        ws()
        if s:sub(pos, pos) ~= ':' then err('expected :') end
        pos = pos + 1
        obj[k] = value()
        ws()
        local d = s:sub(pos, pos)
        pos = pos + 1
        if d == '}' then return obj end
        if d ~= ',' then err('expected , or }') end
      end
    elseif c == '[' then
      pos = pos + 1
      local arr, n = {}, 0
      ws()
      if s:sub(pos, pos) == ']' then
        pos = pos + 1
        return arr
      end
      while true do
        n = n + 1
        arr[n] = value()
        ws()
        local d = s:sub(pos, pos)
        pos = pos + 1
        if d == ']' then return arr end
        if d ~= ',' then err('expected , or ]') end
      end
    elseif c == '"' then
      return str()
    elseif s:sub(pos, pos + 3) == 'true' then
      pos = pos + 4
      return true
    elseif s:sub(pos, pos + 4) == 'false' then
      pos = pos + 5
      return false
    elseif s:sub(pos, pos + 3) == 'null' then
      pos = pos + 4
      return null
    end
    return num()
  end

  local result = value()
  ws()
  if pos <= #s then err('trailing data') end
  return result
end

function J.read_file(path, null)
  local f = assert(io.open(path, 'rb'))
  local text = f:read('*a')
  f:close()
  return J.decode(text, null)
end

function J.resolve_refs(v, objects, depth)
  depth = depth or 0
  if depth > 32 then error('fixture $ref nesting too deep') end
  -- Sentinels (e.g. protocol.lua's P.NULL) carry a metatable: keep their identity.
  if type(v) ~= 'table' or getmetatable(v) ~= nil then return v end
  local ref = v['$ref']
  if type(ref) == 'string' and next(v, next(v)) == nil then
    local target = objects[ref]
    if target == nil then error('unknown fixture $ref ' .. ref) end
    return J.resolve_refs(target, objects, depth + 1)
  end
  local out = {}
  for k, x in pairs(v) do out[k] = J.resolve_refs(x, objects, depth + 1) end
  return out
end

return J
