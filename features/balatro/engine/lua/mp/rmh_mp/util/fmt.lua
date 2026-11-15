-- rmh_mp/util/fmt.lua — the canonical score format (PLAN §0.9, D-08).
--
--   fmt.score(x)  -> string   string.format('%.17g', x); 'inf' / '-inf'; NaN travels as 'inf'.
--   fmt.parse(s)  -> number   inverse ('inf', '-inf', decimal or exponent forms); nil if invalid
--   fmt.short(x)  -> string   HUD text via the game's number_format when present
--
-- PUC Lua's tostring keeps only 14 significant digits, so never send tostring(score).

local fmt = {}

local INF = math.huge

function fmt.score(x)
  x = tonumber(x)
  if x == nil then return '0' end
  if x ~= x then return 'inf' end -- NaN
  if x == INF then return 'inf' end
  if x == -INF then return '-inf' end
  local s = string.format('%.17g', x)
  -- Normalise exponent forms to the wire regex ^-?\d+(\.\d+)?(e[+-]\d+)?$ ("1e+300" is fine;
  -- some C libraries print "1E+300" or "1e+0300").
  s = s:gsub('E', 'e')
  local mant, sign, digits = s:match('^(.-)e([+-])0*(%d+)$')
  if mant then s = mant .. 'e' .. sign .. digits end
  return s
end

function fmt.parse(s)
  if type(s) == 'number' then return s end
  if type(s) ~= 'string' then return nil end
  if s == 'inf' or s == '+inf' then return INF end
  if s == '-inf' then return -INF end
  if not s:match('^%-?%d+%.?%d*[eE]?[%+%-]?%d*$') then return nil end
  return tonumber(s)
end

function fmt.short(x)
  if rawget(_G, 'number_format') then
    local ok, s = pcall(number_format, x)
    if ok and s then return s end
  end
  return fmt.score(x)
end

return fmt
