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
E.STICKER_P = 1 / 3
E.ANTE_SCALING = 1.15
E.REROLL_EXTRA = 1

function E.apply(ctx)
  local g = G.GAME
  g.shop = g.shop or { joker_max = 2 }
  g.shop.joker_max = (g.shop.joker_max or 2) + 1
  g.starting_params.ante_scaling = (g.starting_params.ante_scaling or 1) * E.ANTE_SCALING
  g.modifiers.mp_reroll_extra = (g.modifiers.mp_reroll_extra or 0) + E.REROLL_EXTRA
  local enabled = {}
  for _, fam in ipairs(E.STICKERS) do
    if pseudorandom(pseudoseed('experimental_' .. fam)) < E.STICKER_P then
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
