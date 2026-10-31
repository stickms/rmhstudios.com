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
--
-- The Glass cycle (EX-18 lifted; layers.ts glass_*, at most one active) replaces the ruleset's
-- choice: glass_vanilla mounts no rework (vanilla X2, 1 in 4), glass_standard and glass_legacy
-- mount rw_mp_glass (Legacy Ranked's `classic` layer uses that same rework), glass_experimental
-- mounts none and bans Glass in the bundle (D-23). While one is active the ruleset's own
-- layer gates below are ignored.

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'

local E = {}
MP.content = MP.content or {}
MP.content.enhancements = E

E.GLASS_XMULT = 1.5
E.GLASS_ODDS = 4
E.GLASS_ODDS_SANDBOX = 3

E.GLASS_CYCLE = { 'glass_vanilla', 'glass_standard', 'glass_legacy', 'glass_experimental' }
local REWORKED_BY = { glass_standard = true, glass_legacy = true }

--- The Glass cycle layer in the bundle (the last one in chain order), or nil.
function E.glass_variant(resolved)
  local found = nil
  for _, l in ipairs((resolved and resolved.layers) or {}) do
    for _, g in ipairs(E.GLASS_CYCLE) do if l == g then found = l end end
  end
  return found
end

local function any_layer(resolved, names)
  local active = MP.set_of((resolved and resolved.layers) or {})
  for _, n in ipairs(names) do if active[n] then return true end end
  return false
end

--- Whether the standard Glass rework applies to this bundle.
function E.standard_glass(resolved)
  local v = E.glass_variant(resolved)
  if v then return REWORKED_BY[v] == true end
  return any_layer(resolved, { 'standard', 'classic', 'wsob' })
end

--- Whether the Sandbox Glass rework applies (never under a Glass cycle layer).
function E.sandbox_glass(resolved)
  return E.glass_variant(resolved) == nil and any_layer(resolved, { 'sandbox' })
end

R.define({
  key = 'rw_mp_glass', kind = 'Rework', balanced = true,
  gate = { include = function(_, resolved) return E.standard_glass(resolved) end },
  rework = { center = 'm_glass', props = { config = { Xmult = E.GLASS_XMULT, extra = E.GLASS_ODDS } } },
})

R.define({
  key = 'rw_mp_glass_sandbox', kind = 'Rework', balanced = true,
  gate = { include = function(_, resolved) return E.sandbox_glass(resolved) end },
  rework = { center = 'm_glass', props = { config = { Xmult = E.GLASS_XMULT, extra = E.GLASS_ODDS_SANDBOX } } },
})

return E
