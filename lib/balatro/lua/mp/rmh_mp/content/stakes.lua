-- rmh_mp/content/stakes.lua — the MP stakes as lobby options (ST-01…ST-03, A2 §8, C §2.3.6).
--
-- MP stakes are never a 9th G.P_STAKES entry (profile progress and win stickers stay vanilla):
-- the lobby picks a vanilla stake index plus an `mpStake`, and WS6 rules/stakes_apply.lua applies
-- the modifiers at run start (and the generic blind-size curve for scaling 4 and 5). This module
-- is the content side: what the lobby picker and the collection show for each one.
--
--   MP.content.stakes.LIST   { key, id, name_fallback, atlas, pos, colour, shiny, applies }
--   MP.content.stakes.get(id_or_key)
--   MP.content.stakes.current()   the entry of the running session's mpStake (nil without one)
--
--   stake_mp_planet        (0,0) Planet colour: Red + scaling 3 + Black + Orange (no Gold; Blue
--                         has no effect of its own since the balance change, core-patches.json)
--   stake_mp_spectral      (1,0) #000000: Planet + rentals, scaling 4
--   stake_mp_spectralplus  (2,0) #000000, shiny: Spectral, scaling 5
-- EX-16 lifted — the mod's alt stakes (behind its `alt_stakes = false`), a chain from White Stake,
-- each applying the ones before it (stakes_apply.lua has the effects); atlas mp_alt_mp_stakes:
--   stake_mp_plastic     (1,0) #FF9696  interest $1 per $10
--   stake_mp_pebble      (2,0) #949494  + scaling +1
--   stake_mp_ferrite     (3,0) #B2B2B2  + Persistent Jokers
--   stake_mp_pyrite      (4,0) #F2D955  + reroll cost +$1 more per reroll
--   stake_mp_jade        (0,1) #3EA93C  + scaling +1
--   stake_mp_crystal     (1,1) #BCF9FF  shiny  + Unreliable Jokers
--   stake_mp_antimatter  (2,1) #4F6367  shiny  + Draining Jokers
-- Text: descriptions.Stake.<key> from the MP localization; chips: atlas mp_stakes_chips (29x29).

local MP = require 'rmh_mp.state'

local S = {}
MP.content = MP.content or {}
MP.content.stakes = S

S.LIST = {
  { key = 'stake_mp_planet', id = 'planet', name_fallback = 'Planet Stake', atlas = 'mp_stakes_chips',
    pos = { x = 0, y = 0 }, colour = 'Planet', shiny = false, applies = nil },
  { key = 'stake_mp_spectral', id = 'spectral', name_fallback = 'Spectral Stake', atlas = 'mp_stakes_chips',
    pos = { x = 1, y = 0 }, colour = { 0, 0, 0, 1 }, shiny = false, applies = 'planet' },
  { key = 'stake_mp_spectralplus', id = 'spectralplus', name_fallback = 'Spectral+ Stake', atlas = 'mp_stakes_chips',
    pos = { x = 2, y = 0 }, colour = { 0, 0, 0, 1 }, shiny = true, applies = 'spectral' },
  -- EX-16: the alt stakes, after the three live ones (the lobby picker lists them in this order).
  { key = 'stake_mp_plastic', id = 'plastic', name_fallback = 'Plastic Stake', atlas = 'mp_alt_mp_stakes',
    pos = { x = 1, y = 0 }, colour = { 1, 0.588, 0.588, 1 }, shiny = false, applies = nil, alt = true },
  { key = 'stake_mp_pebble', id = 'pebble', name_fallback = 'Pebble Stake', atlas = 'mp_alt_mp_stakes',
    pos = { x = 2, y = 0 }, colour = { 0.580, 0.580, 0.580, 1 }, shiny = false, applies = 'plastic', alt = true },
  { key = 'stake_mp_ferrite', id = 'ferrite', name_fallback = 'Ferrite Stake', atlas = 'mp_alt_mp_stakes',
    pos = { x = 3, y = 0 }, colour = { 0.698, 0.698, 0.698, 1 }, shiny = false, applies = 'pebble', alt = true },
  { key = 'stake_mp_pyrite', id = 'pyrite', name_fallback = 'Pyrite Stake', atlas = 'mp_alt_mp_stakes',
    pos = { x = 4, y = 0 }, colour = { 0.949, 0.851, 0.333, 1 }, shiny = false, applies = 'ferrite', alt = true },
  { key = 'stake_mp_jade', id = 'jade', name_fallback = 'Jade Stake', atlas = 'mp_alt_mp_stakes',
    pos = { x = 0, y = 1 }, colour = { 0.243, 0.663, 0.235, 1 }, shiny = false, applies = 'pyrite', alt = true },
  { key = 'stake_mp_crystal', id = 'crystal', name_fallback = 'Crystal Stake', atlas = 'mp_alt_mp_stakes',
    pos = { x = 1, y = 1 }, colour = { 0.737, 0.976, 1, 1 }, shiny = true, applies = 'jade', alt = true },
  { key = 'stake_mp_antimatter', id = 'antimatter', name_fallback = 'Antimatter Stake', atlas = 'mp_alt_mp_stakes',
    pos = { x = 2, y = 1 }, colour = { 0.310, 0.388, 0.404, 1 }, shiny = true, applies = 'crystal', alt = true },
}

local by = {}
for i, s in ipairs(S.LIST) do s.order = i; by[s.id] = s; by[s.key] = s end

function S.get(id) return by[id] end

--- The colour as an RGBA table (the Planet one is the game's Planet set colour).
function S.colour(entry)
  if type(entry.colour) == 'table' then return entry.colour end
  local set = G and G.C and G.C.SECONDARY_SET
  return (set and set[entry.colour]) or { 0.075, 0.525, 0.698, 1 }
end

function S.current()
  local sess = MP.state.session
  return sess and sess.mpStake and by[sess.mpStake] or nil
end

--- Display name (localized when the MP text is loaded).
function S.name(entry)
  local d = G and G.localization and G.localization.descriptions
  local e = d and d.Stake and d.Stake[entry.key]
  return (e and e.name) or entry.name_fallback
end

--- Consistency with the modifiers WS6 applies (stakes_apply.DEFS): every listed id exists there.
function S.check()
  local defs = MP.stakes and MP.stakes.DEFS
  if not defs then return true end
  for _, s in ipairs(S.LIST) do if not defs[s.id] then return false, s.id end end
  return true
end

return S
