-- rmh_mp/content/judgement.lua — the Judgement rework (Advanced layer `judgement_rework`).
--
-- The mod's c_judgement ReworkCenter is commented out ("gotta redefine the logic"); it was meant
-- for every standard ruleset but Minor League, and only does anything under The Order. Its intent,
-- rebuilt on the native Order (rules/order.lua):
--
--   Under The Order, the Joker Judgement creates is the shop's next Joker: it is rolled exactly as
--   a shop Joker (ante-0 queues, the shop's sticker polls first, then the card, then its edition),
--   so using Judgement takes a card out of the same sequence the shop draws from. A roll that would
--   carry an Eternal / Perishable / Rental sticker is not given to the player: it is held for the
--   shop (O.hold — the next shop or pack Joker shows it, sticker and all) and Judgement rolls again,
--   until a sticker-free Joker comes up. Without The Order Judgement stays vanilla.
--
-- Off by default (the mod never enables it): only while the Advanced layer is on. The rework def
-- changes no property of c_judgement; the behaviour is a create_card wrap that recognises
-- Judgement's call by its vanilla key_append 'jud'.

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local C = require 'rmh_mp.content.jokers.core'
local O = require 'rmh_mp.rules.order'

local J = {}
MP.content.judgement = J

J.KEY = 'rw_mp_judgement'
J.LAYER = 'judgement_rework'
--- Rolls before Judgement gives up on finding a sticker-free Joker (then strips the stickers of
--- the last roll; at most every shop sticker modifier is on, so 0.7 x 0.7 of rolls carry one).
J.MAX_ROLLS = 64

R.define({
  key = J.KEY, kind = 'Rework',
  gate = { layers = { J.LAYER } },
  rework = { center = 'c_judgement', props = {} },
})

function J.active()
  return R.enabled(J.KEY) and O.active()
end

--- The Joker Judgement gives: { key, ed } (stickered rolls are held for the shop on the way).
function J.roll()
  local roll = O.roll_shop_joker()
  local n = 1
  while (roll.et or roll.per or roll.rent) and n < J.MAX_ROLLS do
    O.hold(roll)
    roll = O.roll_shop_joker()
    n = n + 1
  end
  return { key = roll.key, ed = roll.ed }, n
end

function J.install()
  MP.hooks.wrap(_G, 'create_card', function(orig, _type, area, legendary, _rarity, skip_materialize, soulable,
      forced_key, key_append, ...)
    if not (_type == 'Joker' and key_append == 'jud' and not forced_key and not legendary and J.active()) then
      return orig(_type, area, legendary, _rarity, skip_materialize, soulable, forced_key, key_append, ...)
    end
    local pick = J.roll()
    -- The edition is the roll's own (as for a shop Joker), never vanilla's 'edijud' roll.
    local poll = poll_edition
    poll_edition = function() return nil end
    local ok, card = pcall(orig, _type, area, legendary, _rarity, skip_materialize, soulable, pick.key, key_append, ...)
    poll_edition = poll
    if not ok then error(card, 0) end
    if card and pick.ed and card.set_edition then card:set_edition(pick.ed, true, true) end
    return card
  end, { group = 'session', optional = true, id = 'content.judgement.create_card' })
end

C.add_installer(J.install)

return J
