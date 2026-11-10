-- rmh_mp/util/codec.lua — MP.card: schema-checked card (de)serialisation (types.ts SafeCard).
--
-- Network data NEVER goes through STR_UNPACK/loadstring (R-13). A SafeCard is plain data:
--   { key, edition?, seal?, enhancement?, front?={suit,rank}, eternal?, perishable?, rental?, extra? }
--
--   MP.card.validate(sc)          -> true | false, reason   (keys must exist in G.P_CENTERS now —
--                                    i.e. vanilla, or MP content of the mounted session)
--   MP.card.serialize(card)       -> SafeCard
--   MP.card.build(sc, area, opts) -> card | nil, reason      (opts.make = custom constructor for tests)
--   MP.card.deck_string(cards)    -> 'Hearts-Ace-m_glass-foil-Red;...' (HUD-13 nemesis deck)
--   MP.card.extra_fields          whitelist of ability fields carried in `extra` (content streams
--                                    may append to it at load time)

local MP = require 'rmh_mp.state'

local C = {}
MP.card = C

local EDITIONS = { foil = true, holo = true, polychrome = true, negative = true }
local SEALS = { Red = true, Blue = true, Gold = true, Purple = true }
local SUITS = { Hearts = 'H', Diamonds = 'D', Clubs = 'C', Spades = 'S' }
local RANKS = {
  ['2'] = '2', ['3'] = '3', ['4'] = '4', ['5'] = '5', ['6'] = '6', ['7'] = '7', ['8'] = '8',
  ['9'] = '9', ['10'] = 'T', Jack = 'J', Queen = 'Q', King = 'K', Ace = 'A',
}
local KEY_PATTERN = '^[A-Za-z][A-Za-z0-9_]*$'

C.extra_fields = {
  mult = true, x_mult = true, t_mult = true, t_chips = true, h_mult = true, h_chips = true,
  perish_tally = true, extra_value = true, bonus = true, perma_bonus = true,
  -- scalar `extra` (e.g. Ride the Bus counters) travels as extra.extra
  extra = true,
}

local function valid_key(k)
  return type(k) == 'string' and #k <= 64 and k:match(KEY_PATTERN) ~= nil
end

function C.validate(sc)
  if type(sc) ~= 'table' then return false, 'not a table' end
  if not valid_key(sc.key) then return false, 'bad key' end
  local center = G.P_CENTERS[sc.key]
  if not center then return false, 'unknown key ' .. sc.key end
  if sc.edition ~= nil and not EDITIONS[sc.edition] then return false, 'bad edition' end
  if sc.seal ~= nil and not SEALS[sc.seal] then return false, 'bad seal' end
  if sc.enhancement ~= nil then
    if not valid_key(sc.enhancement) then return false, 'bad enhancement' end
    local e = G.P_CENTERS[sc.enhancement]
    if not e or e.set ~= 'Enhanced' then return false, 'unknown enhancement' end
  end
  if sc.front ~= nil then
    if type(sc.front) ~= 'table' or not SUITS[sc.front.suit] or not RANKS[sc.front.rank] then
      return false, 'bad front'
    end
  end
  for _, f in ipairs({ 'eternal', 'perishable', 'rental' }) do
    if sc[f] ~= nil and type(sc[f]) ~= 'boolean' then return false, 'bad ' .. f end
  end
  if sc.extra ~= nil then
    if type(sc.extra) ~= 'table' then return false, 'bad extra' end
    local n = 0
    for k, v in pairs(sc.extra) do
      n = n + 1
      if type(k) ~= 'string' or #k > 32 then return false, 'bad extra key' end
      local tv = type(v)
      if tv == 'number' then
        if v ~= v then return false, 'NaN in extra' end
      elseif tv == 'string' then
        if #v > 64 then return false, 'extra string too long' end
      elseif tv ~= 'boolean' then
        return false, 'bad extra value'
      end
    end
    if n > 32 then return false, 'too many extra fields' end
  end
  for k in pairs(sc) do
    if k ~= 'key' and k ~= 'edition' and k ~= 'seal' and k ~= 'enhancement' and k ~= 'front'
      and k ~= 'eternal' and k ~= 'perishable' and k ~= 'rental' and k ~= 'extra' then
      return false, 'unknown field ' .. tostring(k)
    end
  end
  return true
end

local function edition_name(card)
  local ed = card.edition
  if type(ed) ~= 'table' then return nil end
  if ed.type and EDITIONS[ed.type] then return ed.type end
  for name in pairs(EDITIONS) do if ed[name] then return name end end
  return nil
end

function C.serialize(card)
  local center = card.config and card.config.center or {}
  local sc = { key = center.key or 'c_base' }
  local ed = edition_name(card)
  if ed then sc.edition = ed end
  if card.seal and SEALS[card.seal] then sc.seal = card.seal end
  local ab = card.ability or {}
  if center.set == 'Enhanced' then sc.enhancement = center.key end
  if card.base and card.base.suit and card.base.value and SUITS[card.base.suit] and RANKS[card.base.value] then
    sc.front = { suit = card.base.suit, rank = card.base.value }
  end
  if ab.eternal then sc.eternal = true end
  if ab.perishable then sc.perishable = true end
  if ab.rental then sc.rental = true end
  local extra
  for f in pairs(C.extra_fields) do
    local v = ab[f]
    local tv = type(v)
    if (tv == 'number' and v == v) or tv == 'boolean' or (tv == 'string' and #v <= 64) then
      extra = extra or {}
      extra[f] = v
    end
  end
  if extra then sc.extra = extra end
  return sc
end

local function front_for(front)
  if not front or not G.P_CARDS then return nil end
  return G.P_CARDS[SUITS[front.suit] .. '_' .. RANKS[front.rank]]
end

function C.build(sc, area, opts)
  opts = opts or {}
  local ok, why = C.validate(sc)
  if not ok then
    MP.log('warn', 'card.build rejected: %s', why)
    return nil, why
  end
  local center = G.P_CENTERS[sc.enhancement or sc.key]
  local front = front_for(sc.front)
  local card
  if opts.make then
    card = opts.make(center, front, sc)
  else
    local x, y = 0, 0
    if area and area.T then x, y = area.T.x, area.T.y end
    card = Card(x, y, G.CARD_W, G.CARD_H, front, center,
      { bypass_discovery_center = true, bypass_discovery_ui = true })
  end
  if not card then return nil, 'constructor failed' end
  if sc.edition and card.set_edition then card:set_edition({ [sc.edition] = true }, true, true) end
  if sc.seal and card.set_seal then card:set_seal(sc.seal, true, true) end
  if sc.eternal and card.set_eternal then card:set_eternal(true) end
  if sc.perishable and card.set_perishable then card:set_perishable(true) end
  if sc.rental and card.set_rental then card:set_rental(true) end
  if sc.extra and card.ability then
    for k, v in pairs(sc.extra) do
      if C.extra_fields[k] then card.ability[k] = v end
    end
  end
  return card
end

-- ── JSON for local state files (state.json) ────────────────────────────────
-- The mailbox JSON is WS3's rmh/json.lua; MP.json uses it when present and falls back to this
-- small codec (numbers %.17g, arrays = tables with 1..n only, no cycles).

local J = {}
C.json = J

local function esc(s)
  return (s:gsub('[%c"\\]', function(c)
    local m = { ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
    return m[c] or string.format('\\u%04x', c:byte())
  end))
end

local function is_array(t)
  local n = 0
  for k in pairs(t) do
    if type(k) ~= 'number' or k < 1 or k % 1 ~= 0 then return false end
    n = n + 1
  end
  return n == #t
end

function J.encode(v, depth)
  depth = depth or 0
  if depth > 32 then error('json: too deep') end
  local t = type(v)
  if v == nil then return 'null' end
  if t == 'boolean' then return v and 'true' or 'false' end
  if t == 'number' then
    if v ~= v or v == math.huge or v == -math.huge then return 'null' end
    return string.format('%.17g', v)
  end
  if t == 'string' then return '"' .. esc(v) .. '"' end
  if t == 'table' then
    local parts = {}
    if next(v) == nil then return '{}' end
    if is_array(v) then
      for i = 1, #v do parts[i] = J.encode(v[i], depth + 1) end
      return '[' .. table.concat(parts, ',') .. ']'
    end
    local keys = {}
    for k in pairs(v) do if type(k) == 'string' or type(k) == 'number' then keys[#keys + 1] = k end end
    table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
    for _, k in ipairs(keys) do
      local val = v[k]
      local tv = type(val)
      if tv ~= 'function' and tv ~= 'userdata' and tv ~= 'thread' and not (tv == 'table' and k == '__layer_set') then
        parts[#parts + 1] = '"' .. esc(tostring(k)) .. '":' .. J.encode(val, depth + 1)
      end
    end
    return '{' .. table.concat(parts, ',') .. '}'
  end
  return 'null'
end

function J.decode(s)
  local pos = 1
  local function ws() pos = s:find('[^ \t\r\n]', pos) or (#s + 1) end
  local value
  local function str()
    local out = {}
    pos = pos + 1
    while true do
      local c = s:sub(pos, pos)
      if c == '' then error('json: unterminated string') end
      if c == '"' then pos = pos + 1; break end
      if c == '\\' then
        local n = s:sub(pos + 1, pos + 1)
        local map = { b = '\b', f = '\f', n = '\n', r = '\r', t = '\t', ['"'] = '"', ['\\'] = '\\', ['/'] = '/' }
        if n == 'u' then
          local cp = tonumber(s:sub(pos + 2, pos + 5), 16) or 63
          out[#out + 1] = cp < 128 and string.char(cp) or '?'
          pos = pos + 6
        else
          out[#out + 1] = map[n] or n
          pos = pos + 2
        end
      else
        out[#out + 1] = c
        pos = pos + 1
      end
    end
    return table.concat(out)
  end
  value = function()
    ws()
    local c = s:sub(pos, pos)
    if c == '{' then
      local t = {}
      pos = pos + 1
      ws()
      if s:sub(pos, pos) == '}' then pos = pos + 1; return t end
      while true do
        ws()
        if s:sub(pos, pos) ~= '"' then error('json: key expected at ' .. pos) end
        local k = str()
        ws()
        if s:sub(pos, pos) ~= ':' then error('json: colon expected at ' .. pos) end
        pos = pos + 1
        t[k] = value()
        ws()
        local d = s:sub(pos, pos)
        pos = pos + 1
        if d == '}' then return t end
        if d ~= ',' then error('json: comma expected at ' .. pos) end
      end
    elseif c == '[' then
      local t = {}
      pos = pos + 1
      ws()
      if s:sub(pos, pos) == ']' then pos = pos + 1; return t end
      while true do
        t[#t + 1] = value()
        ws()
        local d = s:sub(pos, pos)
        pos = pos + 1
        if d == ']' then return t end
        if d ~= ',' then error('json: comma expected at ' .. pos) end
      end
    elseif c == '"' then
      return str()
    elseif s:sub(pos, pos + 3) == 'true' then pos = pos + 4; return true
    elseif s:sub(pos, pos + 4) == 'false' then pos = pos + 5; return false
    elseif s:sub(pos, pos + 3) == 'null' then pos = pos + 4; return nil
    else
      local num = s:match('^-?%d+%.?%d*[eE]?[+-]?%d*', pos)
      if not num or num == '' then error('json: bad value at ' .. pos) end
      pos = pos + #num
      return tonumber(num)
    end
  end
  local v = value()
  ws()
  if pos <= #s then error('json: trailing data') end
  return v
end

do
  local ok, ext = pcall(require, 'rmh.json')
  MP.json = (ok and type(ext) == 'table' and ext.encode and ext.decode) and ext or J
end

function C.deck_string(cards)
  local parts = {}
  for _, card in ipairs(cards or {}) do
    local sc = C.serialize(card)
    local f = sc.front or {}
    parts[#parts + 1] = table.concat({
      f.suit or '', f.rank or '', sc.enhancement or '', sc.edition or '', sc.seal or '',
    }, '-')
  end
  local s = table.concat(parts, ';')
  if #s > 8192 then s = s:sub(1, 8192) end
  return s
end

return C
