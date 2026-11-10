-- bit.lua — LuaJIT's built-in `bit` library (LuaBitOp) in plain Lua 5.1.
--
-- Balatro does `require "bit"` at startup; desktop LÖVE gets it from LuaJIT, the
-- love.js build has PUC Lua and no such module. Same semantics as LuaBitOp:
-- operands are reduced to 32 bits, results are signed 32-bit integers, shift
-- counts use their low 5 bits.

local u = require('rmh/u32')
local floor = math.floor
local norm, xor, band, bor, P = u.norm, u.xor, u.band, u.bor, u.P

local function signed(x)
  if x >= 2147483648 then
    return x - 4294967296
  end
  return x
end

local function fold(f, x, ...)
  local r = norm(x)
  for i = 1, select('#', ...) do
    r = f(r, norm((select(i, ...))))
  end
  return signed(r)
end

local bit = {}

function bit.tobit(x)
  return signed(norm(x))
end

function bit.bnot(x)
  return signed(4294967295 - norm(x))
end

function bit.band(...)
  return fold(band, ...)
end

function bit.bor(...)
  return fold(bor, ...)
end

function bit.bxor(...)
  return fold(xor, ...)
end

function bit.lshift(x, n)
  return signed(u.lshift(norm(x), norm(n) % 32))
end

function bit.rshift(x, n)
  return signed(u.rshift(norm(x), norm(n) % 32))
end

function bit.arshift(x, n)
  x, n = norm(x), norm(n) % 32
  local r = u.rshift(x, n)
  if x >= 2147483648 and n > 0 then
    r = r + (P[32] - P[32 - n])
  end
  return signed(r)
end

function bit.rol(x, n)
  x, n = norm(x), norm(n) % 32
  return signed(u.lshift(x, n) + u.rshift(x, 32 - n) % P[n])
end

function bit.ror(x, n)
  x, n = norm(x), norm(n) % 32
  return signed(u.rshift(x, n) + u.lshift(x % P[n], 32 - n))
end

function bit.bswap(x)
  x = norm(x)
  local b0 = x % 256
  local b1 = floor(x / 256) % 256
  local b2 = floor(x / 65536) % 256
  local b3 = floor(x / 16777216)
  return signed(b0 * 16777216 + b1 * 65536 + b2 * 256 + b3)
end

function bit.tohex(x, n)
  n = n or 8
  local upper = n < 0
  if upper then
    n = -n
  end
  x = norm(x)
  if n < 8 then
    x = x % P[4 * n]
  end
  local s = string.format(upper and '%08X' or '%08x', x)
  return n < 8 and s:sub(9 - n) or s
end

return bit
