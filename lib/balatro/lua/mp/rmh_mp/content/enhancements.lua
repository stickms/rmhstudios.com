-- rmh_mp/content/enhancements.lua — the Glass Card rework (EN-01, A2 §7).
--
-- m_glass keeps its vanilla center; while a layer that reworks it is active its config is
-- swapped (registry Rework, restored exactly on unmount) and it carries the Balanced sticker:
--   standard / classic / wsob   X1.5 Mult, breaks 1 in 4  (vanilla X2, 1 in 4)
--   sandbox                     X1.5 Mult, breaks 1 in 3
-- Both defs can be active together (Chaos: standard + sandbox); the later one (sandbox) is applied
-- last and wins. Experimental bans Glass outright (D-23), so it needs no variant.
-- The vanilla Glass code reads ability.x_mult (from config.Xmult) and ability.extra (the odds), so
-- the swap is all the behaviour there is.

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'

local E = {}
MP.content = MP.content or {}
MP.content.enhancements = E

E.GLASS_XMULT = 1.5
E.GLASS_ODDS = 4
E.GLASS_ODDS_SANDBOX = 3

R.define({
  key = 'rw_mp_glass', kind = 'Rework', balanced = true,
  gate = { layers = { 'standard', 'classic', 'wsob' } },
  rework = { center = 'm_glass', props = { config = { Xmult = E.GLASS_XMULT, extra = E.GLASS_ODDS } } },
})

R.define({
  key = 'rw_mp_glass_sandbox', kind = 'Rework', balanced = true,
  gate = { layers = { 'sandbox' } },
  rework = { center = 'm_glass', props = { config = { Xmult = E.GLASS_XMULT, extra = E.GLASS_ODDS_SANDBOX } } },
})

return E
