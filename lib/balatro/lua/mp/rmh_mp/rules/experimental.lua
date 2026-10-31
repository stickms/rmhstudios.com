-- rmh_mp/rules/experimental.lua — the `experimental` layer's run-start effects (LY-10, A1 §3.3).
--
-- Layer hook 'experimental' (run once, run seed in effect):
--   +1 shop joker slot; blind size × 1.15 (starting_params.ante_scaling); every reroll raises the
--   reroll cost by an extra +$1 (calculate_reroll_cost wrap); each sticker family is enabled
--   independently with p = 1/3 from stream 'experimental_<family>':
--     G.GAME.modifiers.mp_sticker_persistent / mp_sticker_unreliable / mp_sticker_draining
--   (the sticker effects themselves are content, WS7 ST-01…03).

local MP = require 'rmh_mp.state'

local E = {}
MP.experimental = E

E.STICKERS = { 'persistent', 'unreliable', 'draining' }
-- Fallbacks; the bundle's `mp_` params (WS4 layers.ts `experimental`) win.
E.STICKER_P = 1 / 3       -- mp_sticker_chance
E.ANTE_SCALING = 1.15     -- mp_ante_scaling_mult
E.REROLL_EXTRA = 1        -- mp_reroll_increment_bonus
E.SHOP_SLOTS = 1          -- mp_shop_slots_bonus

local function param(name, default) return tonumber(MP.layer_param(name, default)) or default end

function E.apply(ctx)
  local g = G.GAME
  g.shop = g.shop or { joker_max = 2 }
  g.shop.joker_max = (g.shop.joker_max or 2) + param('mp_shop_slots_bonus', E.SHOP_SLOTS)
  g.starting_params.ante_scaling = (g.starting_params.ante_scaling or 1) * param('mp_ante_scaling_mult', E.ANTE_SCALING)
  -- mp_reroll_extra is run state (saved with G.GAME, so a rejoin keeps it), not a bundle param.
  g.modifiers.mp_reroll_extra = (g.modifiers.mp_reroll_extra or 0) + param('mp_reroll_increment_bonus', E.REROLL_EXTRA)
  local p = param('mp_sticker_chance', E.STICKER_P)
  local enabled = {}
  for _, fam in ipairs(E.STICKERS) do
    if pseudorandom(pseudoseed('experimental_' .. fam)) < p then
      g.modifiers['mp_sticker_' .. fam] = true
      enabled[#enabled + 1] = fam
    end
  end
  return enabled
end

function E.register(rules)
  rules.layer_hook('experimental', E.apply)
end

function E.install()
  MP.hooks.wrap(_G, 'calculate_reroll_cost', function(orig, skip_increment, ...)
    local extra = G.GAME and G.GAME.modifiers and G.GAME.modifiers.mp_reroll_extra
    local cr = G.GAME and G.GAME.current_round
    if extra and extra > 0 and not skip_increment and cr and (cr.free_rerolls or 0) <= 0 then
      cr.reroll_cost_increase = (cr.reroll_cost_increase or 0) + extra
    end
    return orig(skip_increment, ...)
  end, { group = 'session', optional = true, id = 'experimental.reroll' })
end

return E
