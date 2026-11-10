-- rmh_mp/registry/init.lua — the native content registry (PLAN §0.6–§0.8, §3.d, C §2).
--
-- Content streams describe objects with MP.registry.define(def); nothing reaches a vanilla
-- table until a session mounts:
--
--   MP.registry.define(def)        register (once per key, at pack load; order = 1000 + index)
--   MP.registry.mount(resolved, session?)
--                                  add every MP prototype to G.P_CENTERS / G.P_BLINDS / G.P_TAGS /
--                                  G.CHALLENGES, add the ENABLED ones to their pools, swap reworks in,
--                                  install the dispatch wraps. Idempotent (re-mount = unmount first).
--   MP.registry.unmount()          exact inverse: no MP key is left in any vanilla table and every
--                                  pool array is restored in place (byte-identical)
--   MP.registry.is_mp(key)         key belongs to a defined MP object (rework centers are vanilla)
--   MP.registry.get(key)           the def (for a vanilla key: the active Rework def, if mounted)
--   MP.registry.enabled(key)       in the pools for this session
--   MP.registry.defs()             array of defs in registry order
--   MP.registry.mounted()          bool
--
-- Definition shape (frozen, §3.d) — the fields this file reads:
--   key, kind = 'Joker'|'Tarot'|'Planet'|'Spectral'|'Trap'|'Booster'|'Back'|'Blind'|'Tag'|'Voucher'
--               |'Challenge'|'Rework'|'Enhancement'
--   rarity, cost, pos, atlas, soul_pos, config, blueprint_compat, eternal_compat, perishable_compat
--   gate = { isolation = true } | { layers = {...} } | { include = function(session) end }
--          (default { isolation = true }: pooled when resolved.multiplayerContent and the
--          multiplayerJokers lobby option are both true — WS4 mpContentPooled, A2 §0.1)
--   pool = false            never pooled (blinds always; inactive sandbox; error decoys)
--   no_collection, phantom, balanced, extra_credit
--   silent_replaces         vanilla key the TS bundle silently bans for this rework (informational)
--   proto = {...}           extra prototype fields copied verbatim (e.g. Booster kind/weight, Back
--                           stake, Voucher requires, Tag min_ante/requires, Blind boss_colour)
--   blind = { dollars, mult, boss_colour, debuff, vars, ... hook functions (see dispatch.lua) }
--   tag = { config, apply = fn, ... }
--   rework = { center = 'm_glass', props = { config = {...} }, table = 'P_CENTERS'|'P_TAGS'|'P_BLINDS'
--              |'P_SEALS'|'P_STAKES', loc = { set, key, target? }, virtual = true? }
--            (a `rarity` prop moves a Joker between the rarity pools; `loc` shows another
--            description while mounted; `virtual` swaps nothing — poker hands, run-start effects)
--   challenge = { id?, rules, jokers, consumeables, vouchers, deck, restrictions }
--   loc = { name = '...', text = {...} } (en-us; the pack's loc tables win when present)
--   behaviour hooks: calc, loc_vars, update, add, remove, dollar_bonus, use, can_use, open, apply,
--   trigger, generate_ui, set_ability — dispatched by registry/dispatch.lua.

local MP = require 'rmh_mp.state'
local pools = require 'rmh_mp.registry.pools'

local R = MP.registry or {}
MP.registry = R

R._defs = R._defs or {}
R._by_key = R._by_key or {}
R._protos = R._protos or {}      -- key -> prototype table (stable identity across mounts)
R._mounted = R._mounted or nil   -- mount record

local KINDS = {
  Joker = { table = 'P_CENTERS', set = 'Joker' },
  Tarot = { table = 'P_CENTERS', set = 'Tarot', consumeable = true },
  Planet = { table = 'P_CENTERS', set = 'Planet', consumeable = true },
  Spectral = { table = 'P_CENTERS', set = 'Spectral', consumeable = true },
  Trap = { table = 'P_CENTERS', set = 'Trap', consumeable = true },
  Booster = { table = 'P_CENTERS', set = 'Booster' },
  Back = { table = 'P_CENTERS', set = 'Back' },
  Voucher = { table = 'P_CENTERS', set = 'Voucher' },
  Enhancement = { table = 'P_CENTERS', set = 'Enhanced' },
  Blind = { table = 'P_BLINDS' },
  Tag = { table = 'P_TAGS', set = 'Tag' },
  Challenge = { table = 'CHALLENGES' },
  Rework = { table = nil },
}
R.KINDS = KINDS

local ORDER_BASE = 1000

-- An MP blind's boss.min: higher than any ante (finite, so it survives copies and JSON).
R.NEVER_ROLLED_ANTE = 1000000000

-- Fields copied from a def onto its prototype.
local PROTO_FIELDS = {
  'rarity', 'cost', 'pos', 'soul_pos', 'blueprint_compat', 'eternal_compat', 'perishable_compat',
  'no_collection', 'phantom', 'balanced', 'extra_credit', 'hidden', 'requires', 'min_ante',
  'weight', 'stake', 'boss_colour', 'dollars', 'mult', 'debuff', 'vars', 'enhancement_gate',
  'kind_name',
}

local function build_proto(def, order)
  local k = KINDS[def.kind]
  local p = { key = def.key, name = def.name or def.key, order = order, rmh_mp = true }
  for _, f in ipairs(PROTO_FIELDS) do
    if def[f] ~= nil then p[f] = MP.copy(def[f], true) end
  end
  p.config = MP.copy(def.config or {}, true)
  if def.balanced then p.config.mp_balanced = true end
  if def.atlas then p.atlas = def.atlas end
  if k.set then p.set = k.set end
  if k.consumeable then p.consumeable = true end
  if def.kind == 'Joker' then
    p.rarity = p.rarity or 1
    p.cost = p.cost or 4
    p.effect = p.effect or ''
    if p.blueprint_compat == nil then p.blueprint_compat = true end
    if p.eternal_compat == nil then p.eternal_compat = true end
    if p.perishable_compat == nil then p.perishable_compat = true end
  elseif k.consumeable then
    p.cost = p.cost or 3
  elseif def.kind == 'Blind' then
    local b = def.blind or {}
    p.dollars = b.dollars or p.dollars or 5
    p.mult = b.mult or p.mult or 1
    p.vars = MP.copy(b.vars or p.vars or {}, true)
    p.debuff = MP.copy(b.debuff or p.debuff or {}, true)
    p.boss_colour = b.boss_colour or p.boss_colour
    p.pos = p.pos or { x = 0, y = 0 }
    -- Vanilla reads blind.boss as a table wherever a blind can be a boss (Blind:set_blind's
    -- self.boss and spin, ease_background_colour_blind's boss.showdown), so every MP blind has
    -- one. Unless the def asks for boss rolls (pool_boss), it is one get_new_boss never picks:
    -- not a showdown, and a min ante no run reaches.
    if b.boss and def.pool_boss then
      p.boss = MP.copy(b.boss, true)
    else
      p.boss = { min = R.NEVER_ROLLED_ANTE, max = R.NEVER_ROLLED_ANTE, showdown = false, mp_never_rolled = true }
    end
    p.atlas = def.atlas
  elseif def.kind == 'Tag' then
    local t = def.tag or {}
    p.config = MP.copy(t.config or def.config or {}, true)
    p.pos = p.pos or { x = 0, y = 0 }
  elseif def.kind == 'Back' then
    p.stake = p.stake or 1
    p.pos = p.pos or { x = 0, y = 0 }
  elseif def.kind == 'Voucher' then
    p.cost = p.cost or 10
  elseif def.kind == 'Booster' then
    p.weight = p.weight or 1
    p.kind = def.booster_kind or (def.proto and def.proto.kind) or 'Standard'
    p.cost = p.cost or 4
  end
  for k2, v in pairs(def.proto or {}) do p[k2] = MP.copy(v, true) end
  p.unlocked, p.discovered, p.alerted = true, true, true
  return p
end

local function build_challenge(def)
  local c = MP.copy(def.challenge or {}, true)
  c.id = c.id or def.key
  c.name = c.name or def.key
  c.rmh_mp = true
  c.rules = c.rules or { custom = {}, modifiers = {} }
  c.jokers = c.jokers or {}
  c.consumeables = c.consumeables or {}
  c.vouchers = c.vouchers or {}
  c.deck = c.deck or { type = 'Challenge Deck' }
  c.restrictions = c.restrictions or { banned_cards = {}, banned_tags = {}, banned_other = {} }
  return c
end

function R.define(def)
  assert(type(def) == 'table', 'registry.define: def must be a table')
  assert(type(def.key) == 'string' and def.key:match('^[A-Za-z][A-Za-z0-9_]*$'), 'registry.define: bad key')
  assert(KINDS[def.kind], 'registry.define: unknown kind ' .. tostring(def.kind) .. ' for ' .. def.key)
  if R._by_key[def.key] then
    error('registry.define: duplicate key ' .. def.key, 2)
  end
  if R._mounted then
    error('registry.define: cannot define ' .. def.key .. ' while a session is mounted', 2)
  end
  if def.kind == 'Rework' then
    assert(def.rework and type(def.rework.center) == 'string', 'registry.define: Rework needs rework.center')
  end
  local index = #R._defs + 1
  def.order = ORDER_BASE + index
  def.gate = def.gate or (def.kind == 'Rework' and { layers = {} }) or { isolation = true }
  R._defs[index] = def
  R._by_key[def.key] = def
  if def.kind == 'Challenge' then
    R._protos[def.key] = build_challenge(def)
  elseif def.kind ~= 'Rework' then
    R._protos[def.key] = build_proto(def, def.order)
  end
  if R.on_define then R.on_define(def) end
  return def
end

function R.defs() return R._defs end

function R.is_mp(key)
  local d = R._by_key[key]
  return d ~= nil and d.kind ~= 'Rework'
end

function R.get(key)
  local d = R._by_key[key]
  if d then return d end
  local m = R._mounted
  if m and m.reworks_by_center[key] then return m.reworks_by_center[key] end
  return nil
end

function R.proto(key) return R._protos[key] end
function R.mounted() return R._mounted ~= nil end

--- Gate evaluation (A2 §0.1). `resolved` is a ResolvedRuleset, `session` the MP.state.session.
function R.gate_open(def, resolved, session)
  if def.pool == false then return false end
  resolved = resolved or MP.EMPTY_RESOLVED
  local key = def.key
  for _, k in ipairs(resolved.included or {}) do if k == key then return true end end
  for _, k in ipairs(resolved.reworked or {}) do if k == key then return true end end
  local gate = def.gate or { isolation = true }
  if gate.include then
    local ok, res = pcall(gate.include, session, resolved)
    if not ok then MP.log('error', 'gate.include %s failed: %s', key, tostring(res)) end
    return ok and res == true
  end
  if gate.layers and #gate.layers > 0 then
    local active = MP.set_of(resolved.layers)
    for _, l in ipairs(gate.layers) do if active[l] then return true end end
    return false
  end
  if gate.isolation then
    local opts = session and session.options
    -- mpContentPooled (WS4 resolve.ts): resolved.multiplayerContent && options.multiplayerJokers.
    return resolved.multiplayerContent == true and opts ~= nil and opts.multiplayerJokers == true
  end
  return false
end

function R.enabled(key)
  local m = R._mounted
  return m ~= nil and m.enabled[key] == true
end

-- ── Rework swap ─────────────────────────────────────────────────────────────

local function apply_props(target, props, saved, path)
  for k, v in pairs(props) do
    local cur = target[k]
    if k == '__replace' then
      -- marker only
    elseif type(v) == 'table' and type(cur) == 'table' and not v.__replace then
      saved[#saved + 1] = { target = target, key = k, nested = true }
      local inner = {}
      saved[#saved].inner = inner
      apply_props(cur, v, inner, path .. '.' .. k)
    else
      saved[#saved + 1] = { target = target, key = k, value = MP.copy(cur, true), had = cur ~= nil }
      local nv = MP.copy(v, true)
      if type(nv) == 'table' then nv.__replace = nil end
      target[k] = nv
    end
  end
end

local function restore_props(saved)
  for i = #saved, 1, -1 do
    local s = saved[i]
    if s.nested then
      restore_props(s.inner)
    elseif s.had then
      s.target[s.key] = s.value
    else
      s.target[s.key] = nil
    end
  end
end

-- ── Rework text ─────────────────────────────────────────────────────────────
-- `rework.loc = { set, key }`: while mounted, the center's description IS the entry `key` of
-- descriptions[set] (the mod's `loc_key`), e.g. j_8_ball reads j_mp_8ball_release. The vanilla
-- entry is put back at unmount, and the swap is re-applied after every init_localization (a
-- language change reloads G.localization). `set` may also be 'Other' with a seal's info key.

local function desc_table(set)
  local d = G and G.localization and G.localization.descriptions
  return d and d[set]
end

function R.swap_loc(m, center, loc)
  m.loc_swaps = m.loc_swaps or {}
  local entry = { set = loc.set, target = loc.target or center, key = loc.key }
  m.loc_swaps[#m.loc_swaps + 1] = entry
  R.apply_loc_swap(entry)
end

function R.apply_loc_swap(e)
  local t = desc_table(e.set)
  if not (t and t[e.key]) then return false end
  if e.table == t and t[e.target] == t[e.key] then return true end -- already swapped here
  e.original, e.had = t[e.target], t[e.target] ~= nil
  e.table = t
  t[e.target] = t[e.key]
  return true
end

--- Re-apply every swap of the mounted session (after init_localization rebuilt the tables, or
--- replaced an entry): a swap still in place is left alone, so its saved original survives.
function R.reapply_loc_swaps()
  local m = R._mounted
  if not (m and m.loc_swaps) then return end
  for _, e in ipairs(m.loc_swaps) do R.apply_loc_swap(e) end
end

function R.restore_loc(m)
  for i = #(m.loc_swaps or {}), 1, -1 do
    local e = m.loc_swaps[i]
    local t = desc_table(e.set)
    -- Only undo a swap this table still shows (a reload already restored the vanilla text).
    if t and e.table == t and t[e.target] == t[e.key] then
      if e.had then t[e.target] = e.original else t[e.target] = nil end
    end
  end
  m.loc_swaps = nil
end

-- ── Mount / unmount ─────────────────────────────────────────────────────────

local function pools_for(proto, def)
  local out = {}
  local set = proto.set
  if def.kind == 'Joker' then
    local r = proto.rarity or 1
    out[#out + 1] = G.P_JOKER_RARITY_POOLS[r]
    -- The vanilla Joker collection pool is left alone: the MP collection is its own page.
  elseif def.kind == 'Tag' then
    out[#out + 1] = pools.ensure('Tag')
  elseif set then
    out[#out + 1] = pools.ensure(set)
    if set == 'Tarot' or set == 'Planet' then out[#out + 1] = pools.ensure('Tarot_Planet') end
    if proto.consumeable and set ~= 'Trap' then out[#out + 1] = pools.ensure('Consumeables') end
  end
  return out
end

function R.mount(resolved, session)
  if R._mounted then R.unmount() end
  resolved = resolved or MP.EMPTY_RESOLVED
  local m = {
    snap = pools.snapshot(),
    added = {},              -- { tbl, key }
    challenges_len = G.CHALLENGES and #G.CHALLENGES or nil,
    challenges_added = {},
    enabled = {},
    reworks = {},            -- { def, saved }
    reworks_by_center = {},
    resolved = resolved,
  }
  R._mounted = m
  local ok, err = pcall(function()
    for _, def in ipairs(R._defs) do
      local kind = KINDS[def.kind]
      if def.kind == 'Rework' then
        if R.gate_open(def, resolved, session) then
          local rw = def.rework
          local tbl = (not rw.virtual) and G[rw.table or 'P_CENTERS'] or nil
          local target = tbl and tbl[rw.center]
          if rw.virtual then
            -- Nothing to swap (a poker hand, a run-start effect): the def is reachable through
            -- R.get(center) while mounted and its module reads it from there.
            m.reworks[#m.reworks + 1] = { def = def, saved = {} }
            m.reworks_by_center[rw.center] = def
            m.enabled[def.key] = true
          elseif target then
            local saved = {}
            local old_rarity = target.rarity
            apply_props(target, rw.props or {}, saved, rw.center)
            -- A rarity change moves the Joker between the rarity pools (restored at unmount with
            -- every other pool array).
            if target.set == 'Joker' and target.rarity ~= old_rarity and G.P_JOKER_RARITY_POOLS then
              local from, to = G.P_JOKER_RARITY_POOLS[old_rarity], G.P_JOKER_RARITY_POOLS[target.rarity]
              if from then
                for i = #from, 1, -1 do if from[i] == target then table.remove(from, i) end end
              end
              if to then pools.append(to, target) end
            end
            if rw.loc then R.swap_loc(m, rw.center, rw.loc) end
            if def.balanced then
              target.config = target.config or {}
              saved[#saved + 1] = { target = target.config, key = 'mp_balanced', value = target.config.mp_balanced,
                had = target.config.mp_balanced ~= nil }
              target.config.mp_balanced = true
            end
            m.reworks[#m.reworks + 1] = { def = def, saved = saved }
            m.reworks_by_center[rw.center] = def
            m.enabled[def.key] = true
          else
            MP.log('warn', 'rework %s: no %s.%s', def.key, tostring(rw.table or 'P_CENTERS'), rw.center)
          end
        end
      elseif def.kind == 'Challenge' then
        if G.CHALLENGES and R.gate_open(def, resolved, session) then
          local c = R._protos[def.key]
          G.CHALLENGES[#G.CHALLENGES + 1] = c
          m.challenges_added[#m.challenges_added + 1] = c
          m.enabled[def.key] = true
        end
      else
        local tbl = G[kind.table]
        if tbl[def.key] ~= nil then
          error('registry.mount: key ' .. def.key .. ' already present in G.' .. kind.table)
        end
        local proto = R._protos[def.key]
        tbl[def.key] = proto
        m.added[#m.added + 1] = { tbl = tbl, key = def.key }
        if def.kind ~= 'Blind' and R.gate_open(def, resolved, session) then
          m.enabled[def.key] = true
          for _, list in ipairs(pools_for(proto, def)) do pools.append(list, proto) end
        end
      end
    end
  end)
  if not ok then
    MP.log('error', 'registry.mount failed: %s', tostring(err))
    R.unmount()
    error(err, 0)
  end
  MP.mounted = true
  if R.dispatch and R.dispatch.install then R.dispatch.install() end
  pools.install_session_wraps()
  if R.on_mount then R.on_mount(resolved, session) end
  return m
end

function R.unmount()
  local m = R._mounted
  if not m then return false end
  if R.on_unmount then pcall(R.on_unmount) end
  for i = #m.reworks, 1, -1 do restore_props(m.reworks[i].saved) end
  R.restore_loc(m)
  for i = #m.added, 1, -1 do
    local a = m.added[i]
    if a.tbl[a.key] == R._protos[a.key] then a.tbl[a.key] = nil end
  end
  if G.CHALLENGES then
    for i = #G.CHALLENGES, 1, -1 do
      for _, c in ipairs(m.challenges_added) do
        if G.CHALLENGES[i] == c then table.remove(G.CHALLENGES, i); break end
      end
    end
  end
  pools.restore(m.snap)
  R._mounted = nil
  MP.mounted = false
  MP.hooks.remove_group('session')
  -- Discovery tallies count pooled centers; refresh them now that the pools are vanilla again.
  if rawget(_G, 'set_discover_tallies') and G.DISCOVER_TALLIES then pcall(set_discover_tallies) end
  return true
end

--- Every key the registry has put in a vanilla table right now (tests / diagnostics).
function R.leaked_keys()
  local found = {}
  local function scan(tbl, label)
    if type(tbl) ~= 'table' then return end
    for k, v in pairs(tbl) do
      local key = type(k) == 'string' and k or (type(v) == 'table' and v.key)
      if key and R.is_mp(key) then found[#found + 1] = label .. ':' .. key end
    end
  end
  scan(G.P_CENTERS, 'P_CENTERS'); scan(G.P_BLINDS, 'P_BLINDS'); scan(G.P_TAGS, 'P_TAGS')
  for name, list in pairs(G.P_CENTER_POOLS) do scan(list, 'P_CENTER_POOLS.' .. name) end
  for i, list in pairs(G.P_JOKER_RARITY_POOLS) do scan(list, 'P_JOKER_RARITY_POOLS.' .. i) end
  if G.CHALLENGES then
    for _, c in ipairs(G.CHALLENGES) do if c.rmh_mp then found[#found + 1] = 'CHALLENGES:' .. tostring(c.id) end end
  end
  table.sort(found)
  return found
end

--- Test helper: forget every definition (never call in the game).
function R._reset_for_tests()
  if R._mounted then R.unmount() end
  R._defs, R._by_key, R._protos = {}, {}, {}
end

return R
