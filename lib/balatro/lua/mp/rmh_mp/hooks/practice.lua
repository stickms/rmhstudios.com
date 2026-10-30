-- rmh_mp/hooks/practice.lua — practice-only tools (PR-03, PR-04, D-38). WS11.
--
-- Loaded at pack load as a content module (init.lua CONTENT_MODULES); its wraps are session
-- installers, active only while a practice session is mounted.
--   Give-card (PR-03): with the Collection open, hover a Joker or consumable and press 3, or left
--     click it: a copy goes into your jokers/consumables. Slot limits hold unless Unlimited Slots
--     is on. The card is built directly (no create_card), so giving draws nothing from the run's
--     seeded streams.
--   Edition Cycling (PR-04): with the toggle on, Q on a hovered owned Joker/consumable cycles
--     base -> Foil -> Holographic -> Polychrome -> Negative -> base (Negative's extra slot is
--     given back when it leaves).
-- The toggles live in MP.practice_opts (ui/pause.lua shows them in the practice pause menu):
--   unlimited_slots, edition_cycling, show_inactive (D-28: inactive sandbox jokers may be given)
--
--   PR.give(key)            -> card | nil, reason
--   PR.cycle_edition(card)  -> the new edition type or 'base'
--   PR.collection_card(t)   -> the hovered collection card's center key, or nil

local MP = require 'rmh_mp.state'

local PR = MP.practice or {}
MP.practice = PR

MP.practice_opts = MP.practice_opts or { unlimited_slots = false, edition_cycling = false, show_inactive = false }

PR.EDITIONS = { 'base', 'foil', 'holo', 'polychrome', 'negative' }

local function g(name) return rawget(_G, name) end

local CONSUMABLE_SETS = { Tarot = true, Planet = true, Spectral = true, Trap = true }

--- The area a given center goes to, or nil when it cannot be given.
function PR.area_for(center)
  if not center then return nil end
  if center.set == 'Joker' then return G.jokers end
  if CONSUMABLE_SETS[center.set] or center.consumeable then return G.consumeables end
  return nil
end

--- May this key be given? Vanilla keys always; MP keys through WS8's MP.sandbox.spawnable
--- (inactive sandbox jokers only with the "Show inactive sandbox cards" toggle, error decoys
--- never, D-28). Without the sandbox module, unpooled MP jokers need the toggle.
function PR.allowed(key)
  local R = MP.registry
  if not (R and R.is_mp and R.is_mp(key)) then return true end
  local show = MP.practice_opts.show_inactive == true
  if MP.sandbox and MP.sandbox.spawnable then return MP.sandbox.spawnable(key, show) == true end
  local def = R.get and R.get(key)
  if def and def.pool == false and def.kind == 'Joker' and not show then return false end
  return true
end

function PR.give(key)
  if not MP.is_practice() then return nil, 'not practice' end
  local center = G.P_CENTERS and G.P_CENTERS[key]
  local area = PR.area_for(center)
  if not area then return nil, 'not giveable' end
  if not PR.allowed(key) then return nil, 'inactive' end
  if not MP.practice_opts.unlimited_slots and #area.cards >= (area.config.card_limit or 0) then
    if g('play_sound') then pcall(play_sound, 'cancel') end
    return nil, 'full'
  end
  local card
  if PR.make then
    card = PR.make(center, area)
  else
    card = Card(area.T.x + area.T.w / 2, area.T.y, G.CARD_W, G.CARD_H, nil, center,
      { bypass_discovery_center = true, bypass_discovery_ui = true, discover = false })
  end
  if not card then return nil, 'constructor failed' end
  if card.add_to_deck then card:add_to_deck() end
  area:emplace(card)
  if g('play_sound') then pcall(play_sound, 'card1') end
  return card
end

function PR.cycle_edition(card)
  if not (card and card.set_edition) then return nil end
  local cur = card.edition and card.edition.type or 'base'
  local idx = 1
  for i, e in ipairs(PR.EDITIONS) do if e == cur then idx = i end end
  local nxt = PR.EDITIONS[idx % #PR.EDITIONS + 1]
  local was_negative = cur == 'negative'
  if nxt == 'base' then card:set_edition(nil, true, true) else card:set_edition({ [nxt] = true }, true, true) end
  if was_negative and card.added_to_deck and card.area and card.area.config then
    card.area.config.card_limit = math.max(0, (card.area.config.card_limit or 1) - 1)
  end
  if card.juice_up then card:juice_up(0.3, 0.3) end
  return nxt
end

--- A hovered card inside an open collection page, as its center key.
function PR.collection_card(target)
  if not (G.OVERLAY_MENU and target and target.config and target.config.center) then return nil end
  local area = target.area
  if not (area and area.config and area.config.collection) then return nil end
  return target.config.center.key
end

local function owned(target)
  return target and target.area and (target.area == G.jokers or target.area == G.consumeables)
end

function PR.on_key(key)
  if not MP.is_practice() then return false end
  local target = G.CONTROLLER and G.CONTROLLER.hovering and G.CONTROLLER.hovering.target
  if key == '3' then
    local k = PR.collection_card(target)
    if k then PR.give(k); return true end
  elseif key == 'q' and MP.practice_opts.edition_cycling and owned(target) and not G.OVERLAY_MENU then
    PR.cycle_edition(target)
    return true
  end
  return false
end

function PR.install()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'practice.' .. id } end
  if g('Controller') then
    wrap(Controller, 'key_press_update', function(orig, self, key, dt, ...)
      if not self.text_input_hook and not (self.locks and self.locks.frame) then
        local ok, used = pcall(PR.on_key, key)
        if ok and used then return end
      end
      return orig(self, key, dt, ...)
    end, o('keys'))
  end
  if g('Card') then
    wrap(Card, 'click', function(orig, self, ...)
      if MP.is_practice() then
        local k = PR.collection_card(self)
        if k then PR.give(k); return end
      end
      return orig(self, ...)
    end, o('click'))
  end
end

if MP.session and MP.session.add_installer then MP.session.add_installer(PR.install) end

return PR
