-- rmh_mp/rules/stakes_apply.lua — MP stakes as modifiers on top of a vanilla stake (ST-01…03,
-- PLAN §0 / C §2.3.6: never a 9th entry in G.P_STAKES, so profile progress and stickers stay vanilla).
--
--   planet       Red (no Small reward), scaling 3 (Green+Purple), Black (eternals), Orange (perishables)
--   spectral     planet + Gold (rentals), scaling 4
--   spectralplus spectral, scaling 5
-- EX-16 lifted — the alt stakes (a chain from White; each applies every one before it):
--   plastic      interest is $1 per $10 held instead of per $5 (same cap in held dollars)
--   pebble       + required score scales one step faster (scaling + 1)
--   ferrite      + Persistent Jokers (modifiers.mp_sticker_persistent, content/stickers.lua)
--   pyrite       + every reroll raises the reroll cost by $1 more (modifiers.mp_reroll_extra, the
--                  experimental layer's calculate_reroll_cost wrap)
--   jade         + scaling + 1 more
--   crystal      + Unreliable Jokers
--   antimatter   + Draining Jokers
-- Applied at run start (before the vanilla deck apply) only when the lobby picked an mpStake.
-- Scaling outside vanilla's 1..3 has no vanilla table: get_blind_amount is wrapped with a generic
-- curve (`stakes.generic_amount`), the published Steamodded formula for non-vanilla scalings.
--
-- Plastic interest: vanilla's interest row is computed inside G.FUNCS.evaluate_round with a fixed
-- $5 step, so while modifiers.mp_interest_rate is set the vanilla row is switched off for that
-- call (no_interest) and our own row 'mp_interest' is added before 'bottom', labelled through the
-- eval-row hook with vanilla's "interest" text. The cap stays the vanilla cap in dollars earned
-- (so Seed Money and Money Tree read as they are); To the Moon's bonus scales with the step
-- (content/alt_stakes.lua).

local MP = require 'rmh_mp.state'

local S = {}
MP.stakes = S

S.VANILLA_INTEREST_STEP = 5

S.DEFS = {
  planet = { small_no_reward = true, scaling = 3, eternals = true, perishables = true },
  spectral = { small_no_reward = true, scaling = 4, eternals = true, perishables = true, rentals = true },
  spectralplus = { small_no_reward = true, scaling = 5, eternals = true, perishables = true, rentals = true },
  plastic = { interest_rate = 10 },
  pebble = { interest_rate = 10, scaling_add = 1 },
  ferrite = { interest_rate = 10, scaling_add = 1, stickers = { 'persistent' } },
  pyrite = { interest_rate = 10, scaling_add = 1, stickers = { 'persistent' }, reroll_extra = 1 },
  jade = { interest_rate = 10, scaling_add = 2, stickers = { 'persistent' }, reroll_extra = 1 },
  crystal = { interest_rate = 10, scaling_add = 2, stickers = { 'persistent', 'unreliable' }, reroll_extra = 1 },
  antimatter = { interest_rate = 10, scaling_add = 2, stickers = { 'persistent', 'unreliable', 'draining' },
    reroll_extra = 1 },
}

function S.def(mp_stake) return mp_stake and S.DEFS[mp_stake] or nil end

function S.apply(mp_stake)
  local d = S.def(mp_stake)
  if not d then return false end
  local m = G.GAME.modifiers
  if d.small_no_reward then
    m.no_blind_reward = m.no_blind_reward or {}
    m.no_blind_reward.Small = true
  end
  if d.scaling and (m.scaling or 1) < d.scaling then m.scaling = d.scaling end
  if d.scaling_add then m.scaling = (m.scaling or 1) + d.scaling_add end
  if d.eternals then m.enable_eternals_in_shop = true end
  if d.perishables then m.enable_perishables_in_shop = true end
  if d.rentals then m.enable_rentals_in_shop = true end
  if d.interest_rate then m.mp_interest_rate = d.interest_rate end
  for _, fam in ipairs(d.stickers or {}) do m['mp_sticker_' .. fam] = true end
  if d.reroll_extra then m.mp_reroll_extra = (m.mp_reroll_extra or 0) + d.reroll_extra end
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

-- ── Plastic interest ────────────────────────────────────────────────────────

--- The interest step in dollars (5 unless a stake changed it).
function S.interest_rate()
  local m = G and G.GAME and G.GAME.modifiers
  return (m and tonumber(m.mp_interest_rate)) or S.VANILLA_INTEREST_STEP
end

--- What the interest row pays now with the stake's step: amount per step held, capped at the
--- vanilla cap counted in $5 steps (so the cap in held dollars doubles with a $10 step).
function S.interest_amount(dollars, rate)
  local g = G.GAME
  rate = rate or S.interest_rate()
  dollars = dollars or g.dollars or 0
  if dollars < rate or g.modifiers.no_interest then return 0 end
  local per = g.interest_amount or 1
  local cap_steps = (g.interest_cap or 25) / S.VANILLA_INTEREST_STEP
  return per * math.min(math.floor(dollars / rate), cap_steps)
end

S._pending_interest = nil

function S.eval_row_label(config, left_text, scale)
  if not (config and config.name == 'mp_interest') then return false end
  local g = G.GAME
  local rate = S.interest_rate()
  local cap = (g.interest_amount or 1) * (g.interest_cap or 25) / S.VANILLA_INTEREST_STEP
  local text = localize({ type = 'variable', key = 'interest', vars = { g.interest_amount or 1, rate, cap } })
  if rawget(_G, 'DynaText') then
    table.insert(left_text, { n = G.UIT.O, config = { object = DynaText({ string = { ' ' .. text },
      colours = { G.C.UI.TEXT_LIGHT }, shadow = true, pop_in = 0, scale = 0.4 * scale, silent = true }) } })
  else
    table.insert(left_text, { n = 'T', config = { text = text } })
  end
  return true
end

function S.install()
  MP.hooks.wrap(_G, 'get_blind_amount', function(orig, ante, ...)
    local s = G.GAME and G.GAME.modifiers and G.GAME.modifiers.scaling
    if s and s ~= 1 and s ~= 2 and s ~= 3 then return S.generic_amount(ante, s) end
    return orig(ante, ...)
  end, { group = 'session', optional = true, id = 'stakes.blind_amount' })

  if G and G.FUNCS then
    MP.hooks.wrap(G.FUNCS, 'evaluate_round', function(orig, ...)
      local m = G.GAME and G.GAME.modifiers
      if not (m and m.mp_interest_rate and not m.no_interest) then return orig(...) end
      S._pending_interest = S.interest_amount()
      m.no_interest = true
      local ok, err = pcall(orig, ...)
      m.no_interest = nil
      S._pending_interest = nil
      if not ok then error(err, 0) end
    end, { group = 'session', optional = true, id = 'stakes.interest' })
  end

  MP.hooks.wrap(_G, 'add_round_eval_row', function(orig, config, ...)
    local n = S._pending_interest
    if config and config.name == 'bottom' and n then
      S._pending_interest = nil
      if n > 0 then
        orig({ name = 'mp_interest', bonus = true, dollars = n, pitch = config.pitch or 1 })
        config.dollars = (config.dollars or 0) + n
      end
    end
    return orig(config, ...)
  end, { group = 'session', optional = true, id = 'stakes.interest_row' })
end

return S
