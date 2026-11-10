-- rmh_mp/registry/pools.lua — pool snapshots, MP insertion, profile-independent rolls.
--
-- Isolation contract (PLAN §0.6, R-02): outside a mounted session no vanilla pool holds an MP
-- key, so single-player RNG, discovery tallies and collections stay vanilla. mount() takes a
-- snapshot of every pool array and unmount() restores each array IN PLACE (same table
-- identity, same element identity and order) — byte-identical to before.
--
--   pools.snapshot()        -> snap        (every P_CENTER_POOLS[*] and P_JOKER_RARITY_POOLS[*])
--   pools.restore(snap)                    puts every array back in place; drops pools we created
--   pools.append(list, proto)              append keeping `order` ascending (MP orders are > vanilla)
--   pools.profile_independent(fn, ...)     OR-07: run fn with unlocked/discovered forced true on the
--                                          centers the roll can read, then restore (synchronous)
--   pools.install_session_wraps()          get_current_pool / get_next_tag_key flip wraps and the
--                                          collection-grid guards (tags 4×6, blinds 6×5)

local MP = require 'rmh_mp.state'

local pools = {}

local function list_copy(t)
  local o = {}
  for i = 1, #t do o[i] = t[i] end
  return o
end

local function refill(target, source)
  for i = #target, 1, -1 do target[i] = nil end
  for i = 1, #source do target[i] = source[i] end
end

function pools.snapshot()
  local snap = { centers = {}, rarity = {}, existed = {}, rarity_tables = {} }
  for name, list in pairs(G.P_CENTER_POOLS) do
    snap.existed[name] = list
    snap.centers[name] = list_copy(list)
  end
  for i, list in pairs(G.P_JOKER_RARITY_POOLS) do
    snap.rarity_tables[i] = list
    snap.rarity[i] = list_copy(list)
  end
  return snap
end

function pools.restore(snap)
  if not snap then return end
  for name, list in pairs(G.P_CENTER_POOLS) do
    if not snap.existed[name] then G.P_CENTER_POOLS[name] = nil end
  end
  for name, original in pairs(snap.existed) do
    G.P_CENTER_POOLS[name] = original
    refill(original, snap.centers[name])
  end
  for i, list in pairs(G.P_JOKER_RARITY_POOLS) do
    if not snap.rarity_tables[i] then G.P_JOKER_RARITY_POOLS[i] = nil end
  end
  for i, original in pairs(snap.rarity_tables) do
    G.P_JOKER_RARITY_POOLS[i] = original
    refill(original, snap.rarity[i])
  end
end

--- Append keeping ascending order. MP orders (1000+) sort after every vanilla entry, so this is
--- an append in practice; the scan keeps it correct if a pool already holds a larger order.
function pools.append(list, proto)
  for i = 1, #list do if list[i] == proto then return end end
  local pos = #list + 1
  while pos > 1 and (list[pos - 1].order or 0) > (proto.order or 0) do pos = pos - 1 end
  table.insert(list, pos, proto)
end

function pools.ensure(name)
  local p = G.P_CENTER_POOLS[name]
  if not p then p = {}; G.P_CENTER_POOLS[name] = p end
  return p
end

-- ── OR-07: profile-independent pools ────────────────────────────────────────
-- get_current_pool admits a joker/voucher only if `unlocked ~= false`; the Tag pool needs the
-- tag's `requires` center to be discovered. Both differ per profile and change mid-run, so
-- peers would diverge. Flip them inside the (synchronous) call and restore before returning:
-- nothing can save in between, so the flip never reaches the profile.

local function flip(center, field, changed)
  if not center then return end
  local needs
  if field == 'unlocked' then needs = (center.unlocked == false) else needs = not center[field] end
  if needs then
    changed[#changed + 1] = { center, field, center[field] }
    center[field] = true
  end
end

local function flip_for(_type, changed)
  if _type == 'Tag' then
    for _, tag in ipairs(G.P_CENTER_POOLS.Tag or {}) do
      if tag.requires then flip(G.P_CENTERS[tag.requires], 'discovered', changed) end
    end
    return
  end
  if _type == 'Joker' then
    for i = 1, 4 do
      for _, c in ipairs(G.P_JOKER_RARITY_POOLS[i] or {}) do flip(c, 'unlocked', changed) end
    end
    return
  end
  for _, c in ipairs(G.P_CENTER_POOLS[_type] or {}) do flip(c, 'unlocked', changed) end
end

local function unflip(changed)
  for i = #changed, 1, -1 do
    local c = changed[i]
    c[1][c[2]] = c[3]
  end
end

function pools.profile_independent(_type, fn, ...)
  local changed = {}
  flip_for(_type, changed)
  local res = { pcall(fn, ...) }
  unflip(changed)
  if not res[1] then error(res[2], 0) end
  return unpack(res, 2, table.maxn(res))
end

-- ── Session wraps ───────────────────────────────────────────────────────────

local function strip_mp(tbl, fn, ...)
  local removed = {}
  for k, v in pairs(tbl) do
    if MP.registry.is_mp(k) then removed[k] = v end
  end
  for k in pairs(removed) do tbl[k] = nil end
  local res = { pcall(fn, ...) }
  for k, v in pairs(removed) do tbl[k] = v end
  if not res[1] then error(res[2], 0) end
  return unpack(res, 2, table.maxn(res))
end

function pools.install_session_wraps()
  local wrap = MP.hooks.wrap
  local opts = { group = 'session', optional = true }
  wrap(_G, 'get_current_pool', function(orig, _type, ...)
    return pools.profile_independent(_type, orig, _type, ...)
  end, { group = 'session', optional = true, id = 'pools.flip' })
  wrap(_G, 'get_next_tag_key', function(orig, ...)
    return pools.profile_independent('Tag', orig, ...)
  end, { group = 'session', optional = true, id = 'pools.flip_tag' })
  -- R-06: the vanilla tag (24) and blind (30) pages are fixed matrices; one extra key indexes a
  -- nil row and crashes. Hide MP keys while they build (the MP collection is its own page).
  wrap(_G, 'create_UIBox_your_collection_tags', function(orig, ...)
    return strip_mp(G.P_TAGS, orig, ...)
  end, { group = 'session', optional = true, id = 'pools.grid_tags' })
  wrap(_G, 'create_UIBox_your_collection_blinds', function(orig, ...)
    return strip_mp(G.P_BLINDS, orig, ...)
  end, { group = 'session', optional = true, id = 'pools.grid_blinds' })
  return opts
end

pools.strip_mp = strip_mp

return pools
