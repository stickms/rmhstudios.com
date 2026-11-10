-- u32.lua — 32-bit unsigned bitwise operations for PUC Lua 5.1, which has none.
--
-- Values are Lua numbers (doubles) holding integers in [0, 2^32). XOR, AND and OR
-- go a byte at a time through 256×256 lookup tables built once (~130k entries);
-- shifts are exact multiplications and divisions. Shared by rmh/bit.lua (the
-- LuaJIT `bit` library) and rmh/luajit_random.lua (LuaJIT's math.random).

local floor = math.floor

local XOR, AND, OR = {}, {}, {}
for a = 0, 255 do
  for b = 0, 255 do
    local x, y, r_xor, r_and, r_or, s = a, b, 0, 0, 0, 1
    for _ = 1, 8 do
      local p, q = x % 2, y % 2
      if p ~= q then
        r_xor = r_xor + s
      end
      if p == 1 and q == 1 then
        r_and = r_and + s
      end
      if p == 1 or q == 1 then
        r_or = r_or + s
      end
      x, y, s = (x - p) / 2, (y - q) / 2, s * 2
    end
    local i = a * 256 + b + 1
    XOR[i], AND[i], OR[i] = r_xor, r_and, r_or
  end
end

local function op(T)
  return function(a, b)
    local a0, b0 = a % 256, b % 256
    a, b = (a - a0) / 256, (b - b0) / 256
    local a1, b1 = a % 256, b % 256
    a, b = (a - a1) / 256, (b - b1) / 256
    local a2, b2 = a % 256, b % 256
    a, b = (a - a2) / 256, (b - b2) / 256
    return T[a0 * 256 + b0 + 1]
      + T[a1 * 256 + b1 + 1] * 256
      + T[a2 * 256 + b2 + 1] * 65536
      + T[(a % 256) * 256 + (b % 256) + 1] * 16777216
  end
end

local M = {}
M.xor = op(XOR)
M.band = op(AND)
M.bor = op(OR)

local P = {}
for i = 0, 64 do
  P[i] = 2 ^ i
end
M.P = P

--- Any number to its low 32 bits as an unsigned integer (LuaBitOp semantics:
--- non-integers round to nearest, ties to even, as the 2^52+2^51 trick does).
function M.norm(x)
  local f = floor(x)
  local frac = x - f
  if frac > 0.5 or (frac == 0.5 and f % 2 == 1) then
    f = f + 1
  end
  return f % 4294967296
end

function M.lshift(a, n)
  return (a % P[32 - n]) * P[n]
end

function M.rshift(a, n)
  return floor(a / P[n])
end

-- 64-bit values as (hi, lo) pairs of u32.
function M.shl64(hi, lo, n)
  if n == 0 then
    return hi, lo
  elseif n < 32 then
    return (hi % P[32 - n]) * P[n] + floor(lo / P[32 - n]), (lo % P[32 - n]) * P[n]
  end
  return (lo % P[64 - n]) * P[n - 32], 0
end

function M.shr64(hi, lo, n)
  if n == 0 then
    return hi, lo
  elseif n < 32 then
    return floor(hi / P[n]), floor(lo / P[n]) + (hi % P[n]) * P[32 - n]
  end
  return 0, floor(hi / P[n - 32])
end

return M
