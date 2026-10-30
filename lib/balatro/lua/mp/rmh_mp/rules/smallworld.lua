-- rmh_mp/rules/smallworld.lua — the Small World layer (LY-04, A1 §3.3, A2 §0.3).
--
-- Run-start cull (layer hook 'smallworld', run once per run with the run seed in effect):
--   groups  = Joker by rarity (1–4), Tarot, Planet, Spectral, Voucher, Booster, Trap (if mounted),
--             and Tag. Back, Edition, Enhanced and Default are never culled.
--   members = pool entries that are not already banned, not `hidden` (The Soul, Black Hole) and
--             prerequisite-free (an upgrade voucher with `requires` is decided by its base).
--             Cavendish is never a member: it is banned iff Gros Michel is banned.
--   cull    = sort by key, shuffle with stream '<group>_mp_smallworld', ban the first
--             round(0.75 × n) (Vouchers: one fewer, never below 0).
--   then    = every upgrade voucher whose base voucher is banned is banned too.
-- In-run replacements (session wraps, active while the layer is on):
--   Tag:init       a banned tag is re-rolled (as if ante 10 under The Order); bounded retries
--   add_joker      a banned joker resamples a same-rarity joker from the pool ('mp_smallworld_resample')
--   Back.apply_to_run  starting vouchers that are banned or already used are replaced by the next
--                  voucher roll; done by sw.fix_back_vouchers before the vanilla apply
--   create_card    a 'deck' consumable is created with its real set (Ghost Deck's spectral)
-- The cull is deterministic per (seed, mounted content): E2E-08 checks the banned_keys digest.

local MP = require 'rmh_mp.state'
local rng = require 'rmh_mp.util.rng'

local SW = {}
MP.smallworld = SW

SW.CULL_FRACTION = 0.75

local function round(x) return math.floor(x + 0.5) end

--- The cull groups in a fixed order: { name, list }.
function SW.groups()
  local out = {}
  for r = 1, 4 do
    out[#out + 1] = { name = 'Joker' .. r, list = G.P_JOKER_RARITY_POOLS[r] or {} }
  end
  for _, set in ipairs({ 'Tarot', 'Planet', 'Spectral', 'Voucher', 'Booster', 'Trap', 'Tag' }) do
    if G.P_CENTER_POOLS[set] then out[#out + 1] = { name = set, list = G.P_CENTER_POOLS[set] } end
  end
  return out
end

local function member(v, banned)
  if not v or not v.key then return false end
  if banned[v.key] then return false end
  if v.hidden then return false end
  if v.key == 'j_cavendish' then return false end
  if v.set == 'Voucher' and v.requires and #v.requires > 0 then return false end
  return true
end

--- Run the cull into `banned` (default G.GAME.banned_keys). Returns the list of keys it banned.
function SW.cull(banned)
  banned = banned or G.GAME.banned_keys
  local newly = {}
  for _, g in ipairs(SW.groups()) do
    local keys = {}
    for _, v in ipairs(g.list) do
      if member(v, banned) then keys[#keys + 1] = v.key end
    end
    table.sort(keys)
    local n = #keys
    local cut = round(SW.CULL_FRACTION * n)
    if g.name == 'Voucher' then cut = math.max(0, cut - 1) end
    local shuffled = rng.shuffle(keys, g.name .. '_mp_smallworld')
    for i = 1, math.min(cut, n) do
      banned[shuffled[i]] = true
      newly[#newly + 1] = shuffled[i]
    end
  end
  if banned.j_gros_michel then
    if not banned.j_cavendish then newly[#newly + 1] = 'j_cavendish' end
    banned.j_cavendish = true
  end
  -- Upgrade vouchers follow their base.
  local changed = true
  while changed do
    changed = false
    for _, v in ipairs(G.P_CENTER_POOLS.Voucher or {}) do
      if not banned[v.key] and v.requires then
        for _, req in ipairs(v.requires) do
          if banned[req] then
            banned[v.key] = true
            newly[#newly + 1] = v.key
            changed = true
            break
          end
        end
      end
    end
  end
  table.sort(newly)
  return newly
end

--- A stable digest of the banned set (E2E-08 compares it across peers).
function SW.digest(banned)
  local keys = rng.sorted_keys(banned or G.GAME.banned_keys)
  local h = pseudohash(table.concat(keys, ','))
  return string.format('%d:%.13f', #keys, h)
end

--- Replace banned/used starting vouchers in a Back's config (called before the vanilla apply).
function SW.fix_back_vouchers(back)
  local cfg = back and back.effect and back.effect.config
  if not cfg then return end
  local function replace(key)
    if not key then return key end
    if not G.GAME.banned_keys[key] and not G.GAME.used_vouchers[key] then return key end
    local ok, nk = pcall(get_next_voucher_key)
    return ok and nk or key
  end
  local restore = {}
  if cfg.voucher then restore.voucher = cfg.voucher; cfg.voucher = replace(cfg.voucher) end
  if cfg.vouchers then
    restore.vouchers = cfg.vouchers
    local list = {}
    for i, v in ipairs(cfg.vouchers) do list[i] = replace(v) end
    cfg.vouchers = list
  end
  return restore
end

function SW.restore_back(back, restore)
  local cfg = back and back.effect and back.effect.config
  if not (cfg and restore) then return end
  if restore.voucher then cfg.voucher = restore.voucher end
  if restore.vouchers then cfg.vouchers = restore.vouchers end
end

function SW.active() return MP.in_session() and MP.layer_active('smallworld') end

local function resample_joker(key)
  local center = G.P_CENTERS[key]
  local rarity = center and center.rarity or 1
  local pool = {}
  for _, v in ipairs(G.P_JOKER_RARITY_POOLS[rarity] or {}) do
    if not G.GAME.banned_keys[v.key] then pool[#pool + 1] = v.key end
  end
  if #pool == 0 then return key end
  return rng.pick(pool, 'mp_smallworld_resample') or key
end
SW.resample_joker = resample_joker

function SW.install()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'smallworld.' .. id } end
  if rawget(_G, 'Tag') then
    wrap(Tag, 'init', function(orig, self, _tag, for_collection, _blind_type, ...)
      if SW.active() and not for_collection and G.GAME.banned_keys[_tag] then
        local tries = 0
        while G.GAME.banned_keys[_tag] and tries < 50 do
          tries = tries + 1
          if MP.order and MP.order.active() then
            _tag = rng.with_ante(10, get_next_tag_key, 'mp_smallworld')
          else
            _tag = get_next_tag_key('mp_smallworld')
          end
        end
      end
      return orig(self, _tag, for_collection, _blind_type, ...)
    end, o('tag_init'))
  end
  wrap(_G, 'add_joker', function(orig, joker, ...)
    if SW.active() and G.GAME.banned_keys[joker] and G.P_CENTERS[joker] and G.P_CENTERS[joker].set == 'Joker' then
      joker = resample_joker(joker)
    end
    return orig(joker, ...)
  end, o('add_joker'))
  wrap(_G, 'create_card', function(orig, _type, area, legendary, _rarity, skip, soulable, forced_key, key_append, ...)
    if SW.active() and key_append == 'deck' and forced_key and G.P_CENTERS[forced_key] then
      local set = G.P_CENTERS[forced_key].set
      if set and set ~= _type and set ~= 'Default' then _type = set end
    end
    return orig(_type, area, legendary, _rarity, skip, soulable, forced_key, key_append, ...)
  end, o('create_card'))
end

return SW
