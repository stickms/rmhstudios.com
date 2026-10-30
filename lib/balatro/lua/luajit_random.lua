-- luajit_random.lua — LuaJIT 2.1's math.random / math.randomseed in plain Lua 5.1.
--
-- Balatro derives every random event in a run from math.randomseed(x) followed by
-- math.random(), so a seed only reproduces the desktop run if the generator is
-- LuaJIT's, bit for bit. PUC Lua (what love.js runs) uses the C library's rand(),
-- so this replaces both functions with a port of LuaJIT's lib_math.c: a combined
-- Tausworthe generator (TW223) over four 64-bit words, seeded by stepping a
-- double through d = d*pi + e and taking its IEEE-754 bits. 64-bit words are
-- (hi, lo) pairs of u32; the bit work is rmh/u32.lua.

local u = require('rmh/u32')
local floor, frexp = math.floor, math.frexp
local xor, shl64, shr64, P = u.xor, u.shl64, u.shr64, u.P

-- State: gen[i] = hi[i], lo[i] for i = 1..4.
local hi, lo = { 0, 0, 0, 0 }, { 0, 0, 0, 0 }

-- TW223 parameters (k, q, s) per word.
local K = { 63, 58, 55, 47 }
local Q = { 31, 19, 24, 21 }
local S = { 18, 28, 7, 8 }

--- One generator step. Returns the low 52 bits of r as (hi20, lo32).
local function step()
  local rh, rl = 0, 0
  for i = 1, 4 do
    local zh, zl = hi[i], lo[i]
    local k, s = K[i], S[i]
    -- a = ((z << q) ^ z) >> (k - s)
    local ah, al = shl64(zh, zl, Q[i])
    ah, al = shr64(xor(ah, zh), xor(al, zl), k - s)
    -- b = (z & (~0 << (64 - k))) << s ; 64 - k < 32, so the mask clears only
    -- low bits of the low word
    local bh, bl = shl64(zh, zl - zl % P[64 - k], s)
    zh, zl = xor(ah, bh), xor(al, bl)
    hi[i], lo[i] = zh, zl
    rh, rl = xor(rh, zh), xor(rl, zl)
  end
  return rh % P[20], rl
end

--- IEEE-754 bit pattern of a double as (hi, lo).
local function double_bits(d)
  local sign = 0
  if d < 0 or (d == 0 and 1 / d < 0) then
    sign, d = P[31], -d
  end
  if d ~= d then
    return 2146959360, 0 -- the canonical quiet NaN 0x7ff80000_00000000
  elseif d == math.huge then
    return sign + 2146435072, 0
  elseif d == 0 then
    return sign, 0
  end
  local m, e = frexp(d) -- d = m * 2^e, 0.5 <= m < 1
  local E = e + 1022
  local mant
  if E <= 0 then -- subnormal
    mant = d * 2 ^ 1000 * 2 ^ 74 -- d / 2^-1074, exact (powers of two)
    E = 0
  else
    mant = (m * 2 - 1) * P[52]
  end
  local mh = floor(mant / P[32])
  return sign + E * P[20] + mh, mant - mh * P[32]
end

local function seed(d)
  local r = { 1, 6, 9, 17 } -- 64-k[i]: the bytes of 0x11090601
  for i = 1, 4 do
    local m = P[r[i]]
    d = d * 3.14159265358979323846 + 2.7182818284590452354
    local h, l = double_bits(d)
    if h == 0 and l < m then
      l = l + m
    end
    hi[i], lo[i] = h, l
  end
  for _ = 1, 10 do
    step()
  end
end

local function random(r1, r2)
  local h, l = step()
  local d = (h * P[32] + l) / P[52]
  if r1 then
    r1 = tonumber(r1) or error("bad argument #1 to 'random' (number expected)", 2)
    if r2 then
      r2 = tonumber(r2) or error("bad argument #2 to 'random' (number expected)", 2)
      return floor(d * (r2 - r1 + 1)) + r1
    end
    return floor(d * r1) + 1
  end
  return d
end

local function randomseed(x)
  seed(tonumber(x) or error("bad argument #1 to 'randomseed' (number expected)", 2))
end

-- LuaJIT seeds its state with 0 when the math library opens.
seed(0)

return { random = random, randomseed = randomseed, double_bits = double_bits }
