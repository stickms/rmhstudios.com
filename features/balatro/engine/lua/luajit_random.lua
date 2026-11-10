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
local xor, P = u.xor, u.P

-- State: gen[i] = hi[i], lo[i] for i = 1..4.
local hi, lo = { 0, 0, 0, 0 }, { 0, 0, 0, 0 }

-- TW223 parameters (k, q, s) per word, and the powers of two each shift needs,
-- precomputed so a step is arithmetic on locals plus the byte-table XORs (a
-- step runs 11 times per math.randomseed, and Balatro reseeds before every draw).
local K = { 63, 58, 55, 47 }
local Q = { 31, 19, 24, 21 }
local S = { 18, 28, 7, 8 }
local Q_UP, Q_DOWN, N_BIG, N_DOWN, N_UP, N_HI, MASK, S_UP, S_DOWN = {}, {}, {}, {}, {}, {}, {}, {}, {}
for i = 1, 4 do
  local n = K[i] - S[i] -- the right shift
  Q_UP[i], Q_DOWN[i] = P[Q[i]], P[32 - Q[i]]
  N_BIG[i] = n >= 32
  if n >= 32 then
    N_DOWN[i] = P[n - 32]
  else
    N_DOWN[i], N_UP[i], N_HI[i] = P[n], P[32 - n], P[n]
  end
  MASK[i] = P[64 - K[i]]
  S_UP[i], S_DOWN[i] = P[S[i]], P[32 - S[i]]
end
local P20, P32 = P[20], P[32]

--- One generator step. Returns the low 52 bits of r as (hi20, lo32).
-- z = (((z << q) ^ z) >> (k - s)) ^ ((z & (~0 << (64 - k))) << s); r ^= z
local function step()
  local rh, rl = 0, 0
  for i = 1, 4 do
    local zh, zl = hi[i], lo[i]
    -- a = (z << q) ^ z
    local qd = Q_DOWN[i]
    local ah = xor((zh % qd) * Q_UP[i] + floor(zl / qd), zh)
    local al = xor((zl % qd) * Q_UP[i], zl)
    -- a >>= k - s
    if N_BIG[i] then
      ah, al = 0, floor(ah / N_DOWN[i])
    else
      local nd = N_DOWN[i]
      ah, al = floor(ah / nd), floor(al / nd) + (ah % N_HI[i]) * N_UP[i]
    end
    -- b = (z & mask) << s; 64 - k < 32, so the mask only clears low bits of zl
    local ml = zl - zl % MASK[i]
    local sd = S_DOWN[i]
    local bh = (zh % sd) * S_UP[i] + floor(ml / sd)
    local bl = (ml % sd) * S_UP[i]
    zh = ah == 0 and bh or xor(ah, bh)
    zl = xor(al, bl)
    hi[i], lo[i] = zh, zl
    rh, rl = xor(rh, zh), xor(rl, zl)
  end
  return rh % P20, rl
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
  local d = (h * P32 + l) / P[52]
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
