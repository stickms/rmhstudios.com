-- rmh_mp/util/rng.lua — deterministic helpers over the game's seeded RNG.
--
-- Everything here goes through the game's own `pseudoseed` / `pseudorandom` (so a seed means
-- the same thing on every peer) and never iterates a hash table without sorting first.
--
--   rng.sorted_keys(t)                  keys of t, sorted (strings/numbers)
--   rng.shuffle(list, key)              new array: list shuffled with stream `key` (input order matters,
--                                       sort it first); like vanilla pseudoshuffle without sort_id
--   rng.pick(list, key)                 one element of an array (nil when empty)
--   rng.weighted(entries, key)          entries = { {weight=n, ...}, ... } in a fixed order
--   rng.roll(key)                       pseudorandom(key) in [0,1)
--   rng.with_ante(ante, fn, ...)        run fn with G.GAME.round_resets.ante temporarily = ante
--   rng.is_hand_list(t)                 t is an array of poker-hand names (keys of G.GAME.hands)
--   rng.sorted_hand_list(t)             copy of such an array, sorted by the hand's `order`

local rng = {}

local function cmp_any(a, b)
  local ta, tb = type(a), type(b)
  if ta ~= tb then return ta < tb end
  if ta == 'number' or ta == 'string' then return a < b end
  return tostring(a) < tostring(b)
end

function rng.sorted_keys(t)
  local keys = {}
  for k in pairs(t or {}) do keys[#keys + 1] = k end
  table.sort(keys, cmp_any)
  return keys
end

function rng.roll(key)
  return pseudorandom(pseudoseed(key))
end

function rng.shuffle(list, key)
  local out = {}
  for i = 1, #list do out[i] = list[i] end
  if #out < 2 then return out end
  math.randomseed(pseudoseed(key))
  for i = #out, 2, -1 do
    local j = math.random(i)
    out[i], out[j] = out[j], out[i]
  end
  return out
end

function rng.pick(list, key)
  if not list or #list == 0 then return nil end
  local i = pseudorandom(pseudoseed(key), 1, #list)
  return list[i], i
end

function rng.weighted(entries, key)
  local total = 0
  for _, e in ipairs(entries) do total = total + (e.weight or 0) end
  if total <= 0 then return nil end
  local roll = pseudorandom(pseudoseed(key)) * total
  local acc = 0
  for _, e in ipairs(entries) do
    acc = acc + (e.weight or 0)
    if roll < acc then return e end
  end
  return entries[#entries]
end

function rng.with_ante(ante, fn, ...)
  local rr = G.GAME.round_resets
  local saved = rr.ante
  rr.ante = ante
  local res = { pcall(fn, ...) }
  rr.ante = saved
  if not res[1] then error(res[2], 0) end
  return unpack(res, 2, table.maxn(res))
end

function rng.is_hand_list(t)
  if type(t) ~= 'table' or #t == 0 then return false end
  local hands = G and G.GAME and G.GAME.hands
  if type(hands) ~= 'table' then return false end
  local n = 0
  for k, v in pairs(t) do
    n = n + 1
    if type(k) ~= 'number' or type(v) ~= 'string' or type(hands[v]) ~= 'table' then return false end
  end
  return n == #t
end

function rng.sorted_hand_list(t)
  local hands = G.GAME.hands
  local out = {}
  for i = 1, #t do out[i] = t[i] end
  table.sort(out, function(a, b)
    local oa, ob = hands[a].order or 0, hands[b].order or 0
    if oa ~= ob then return oa < ob end
    return a < b
  end)
  return out
end

return rng
