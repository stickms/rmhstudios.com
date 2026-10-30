-- rmh_mp/content/vouchers.lua — the Manhunt ante vouchers (VO-01, VO-02, A2 §11).
--
-- Attrition bans vanilla Hieroglyph and Petroglyph; in a Manhunt lobby these stand in for them
-- (pooled for every team, D-14):
--   v_mp_hieroglyph_manhunt  $10, (5,2): -1 ante, -1 hand (vanilla Hieroglyph)
--   v_mp_petroglyph_manhunt  $10, (5,3), requires the above: -1 ante, -1 discard
-- Redeemed by the Runner, either one also reports `redeem_ante_voucher`; the host referee then
-- gives every Hunter +1 life. There is no MP text for them (D-21): the tooltip shows the vanilla
-- voucher's text plus our line "Runner: every Hunter gains a life" (rmh_mp_runner_hunters_gain_life).

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local C = require 'rmh_mp.content.jokers.core'

local V = {}
MP.content.vouchers = V

V.HIERO = 'v_mp_hieroglyph_manhunt'
V.PETRO = 'v_mp_petroglyph_manhunt'
V.TEXT_FROM = { [V.HIERO] = 'v_hieroglyph', [V.PETRO] = 'v_petroglyph' }

local manhunt = { include = function(sess)
  return sess ~= nil and sess.shape ~= nil and sess.shape.manhunt == true
end }

R.define({
  key = V.HIERO, kind = 'Voucher', cost = 10, pos = { x = 5, y = 2 }, balanced = true,
  gate = manhunt, config = { extra = 1 },
})

R.define({
  key = V.PETRO, kind = 'Voucher', cost = 10, pos = { x = 5, y = 3 }, balanced = true,
  gate = manhunt, config = { extra = 1 }, requires = { V.HIERO },
})

--- Apply a Manhunt ante voucher (the vanilla Hieroglyph/Petroglyph effect + the Runner report).
function V.apply(key, extra)
  extra = extra or 1
  local rr = G.GAME.round_resets
  if rawget(_G, 'ease_ante') then ease_ante(-extra) else rr.ante = (rr.ante or 1) - extra end
  rr.blind_ante = (rr.blind_ante or rr.ante) - extra
  if key == V.HIERO then
    rr.hands = (rr.hands or 4) - extra
    C.ease_hands(-extra)
  else
    rr.discards = (rr.discards or 3) - extra
    C.ease_discard(-extra)
  end
  if MP.state.my_team == 'RUNNER' then MP.event({ t = 'redeem_ante_voucher' }) end
end

local function line_node()
  local text = C.loc('rmh_mp_runner_hunters_gain_life', 'Runner: every Hunter gains a life')
  local colour = G.C and G.C.UI and G.C.UI.TEXT_DARK
  return { { n = G.UIT and G.UIT.T or 'T', config = { text = text, colour = colour, scale = 0.32 } } }
end
V.line_node = line_node

local proxies = {}
local function proxy(center)
  local p = proxies[center]
  if not p then
    p = setmetatable({ set = 'Other' }, { __index = center })
    proxies[center] = p
  end
  return p
end

function V.alias_text(key)
  local d = G.localization and G.localization.descriptions
  local src = d and d.Voucher and d.Voucher[V.TEXT_FROM[key]]
  if not src then return false end
  d.Other = d.Other or {}
  if d.Other[key] == nil then d.Other[key] = src end
  return true
end

function V.install()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'content.vouchers.' .. id } end

  if rawget(_G, 'Card') then
    wrap(Card, 'apply_to_run', function(orig, self, center, ...)
      local c = center or (self and self.config and self.config.center)
      if c and V.TEXT_FROM[c.key] then
        local extra = (center and center.config and center.config.extra) or (self and self.ability and self.ability.extra) or 1
        return V.apply(c.key, extra)
      end
      return orig(self, center, ...)
    end, o('apply'))
  end

  wrap(_G, 'generate_card_ui', function(orig, _c, full, vars, card_type, badges, hide_desc, main_start, main_end, ...)
    if _c and V.TEXT_FROM[_c.key] and _c.set ~= 'Other' and V.alias_text(_c.key) then
      local first = full == nil
      return orig(proxy(_c), full, vars or { (_c.config and _c.config.extra) or 1 }, card_type, badges, hide_desc,
        main_start, main_end or (first and line_node() or nil), ...)
    end
    return orig(_c, full, vars, card_type, badges, hide_desc, main_start, main_end, ...)
  end, o('text'))
end

C.add_installer(V.install)

return V
