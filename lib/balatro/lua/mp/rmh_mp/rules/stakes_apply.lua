-- rmh_mp/rules/stakes_apply.lua — MP stakes as modifiers on top of a vanilla stake (ST-01…03,
-- PLAN §0 / C §2.3.6: never a 9th entry in G.P_STAKES, so profile progress and stickers stay vanilla).
--
--   planet       Red (no Small reward), scaling 3 (Green+Purple), Black (eternals), Orange (perishables)
--   spectral     planet + Gold (rentals), scaling 4
--   spectralplus spectral, scaling 5
-- Applied at run start (before the vanilla deck apply) only when the lobby picked an mpStake.
-- Scaling 4/5 has no vanilla table: get_blind_amount is wrapped with a generic curve
-- (`stakes.generic_amount`), the published Steamodded formula for non-vanilla scalings.

local MP = require 'rmh_mp.state'

local S = {}
MP.stakes = S

S.DEFS = {
  planet = { small_no_reward = true, scaling = 3, eternals = true, perishables = true },
  spectral = { small_no_reward = true, scaling = 4, eternals = true, perishables = true, rentals = true },
  spectralplus = { small_no_reward = true, scaling = 5, eternals = true, perishables = true, rentals = true },
}

function S.apply(mp_stake)
  local d = mp_stake and S.DEFS[mp_stake]
  if not d then return false end
  local m = G.GAME.modifiers
  if d.small_no_reward then
    m.no_blind_reward = m.no_blind_reward or {}
    m.no_blind_reward.Small = true
  end
  if d.scaling and (m.scaling or 1) < d.scaling then m.scaling = d.scaling end
  if d.eternals then m.enable_eternals_in_shop = true end
  if d.perishables then m.enable_perishables_in_shop = true end
  if d.rentals then m.enable_rentals_in_shop = true end
  G.GAME.mp_stake = mp_stake
  return true
end

local function trim(amount)
  if amount <= 0 then return amount end
  return amount - amount % (10 ^ math.floor(math.log10(amount) - 1))
end

--- Blind base amount for a scaling outside vanilla's 1..3.
function S.generic_amount(ante, scale)
  local amounts = {
    300,
    700 + 100 * scale,
    1400 + 600 * scale,
    2100 + 2900 * scale,
    15000 + 5000 * scale * math.log(scale),
    12000 + 8000 * (scale + 1) * (0.4 * scale),
    10000 + 25000 * (scale + 1) * ((scale / 4) ^ 2),
    50000 * (scale + 1) ^ 2 * (scale / 7) ^ 2,
  }
  if ante < 1 then return 100 end
  if ante <= 8 then return trim(amounts[ante]) end
  local a, b, c, d = amounts[8], amounts[8] / amounts[7], ante - 8, 1 + 0.2 * (ante - 8)
  return trim(math.floor(a * (b + (0.75 * c) ^ d) ^ c))
end

function S.install()
  MP.hooks.wrap(_G, 'get_blind_amount', function(orig, ante, ...)
    local s = G.GAME and G.GAME.modifiers and G.GAME.modifiers.scaling
    if s and s ~= 1 and s ~= 2 and s ~= 3 then return S.generic_amount(ante, s) end
    return orig(ante, ...)
  end, { group = 'session', optional = true, id = 'stakes.blind_amount' })
end

return S
