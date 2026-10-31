-- rmh_mp/content/jokers/errors.lua — the sandbox error decoys (J-45, A2 §2.4, D-26).
--
-- j_mp_error_sandbox_1 … _21: registered, never pooled (pool = false), never spawnable; shown only
-- in the MP collection's Sandbox tab (1-14, shuffled into MP.sandbox.overview_keys()).
-- Text: every decoy reads the mod's single `j_mp_error_sandbox` entry ("????" / "something's
-- wrong"), aliased per language by a core init_localization layer. The tooltip adds the DynaText
-- flavour: a random "(CURRENTLY n)" (1-333), a cycling number and cycling BSOD strings and
-- currency marks. Pure UI: it uses math.random only while a tooltip is built, never the game RNG
-- streams (every seeded roll in the game reseeds through pseudoseed first).
-- Deviation: the mod's non-ASCII currency glyphs are dropped (MP Lua is ASCII-only; the game fonts
-- are subset to loc text).

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local S = require 'rmh_mp.content.jokers.sandbox'

local E = {}
S.errors = E

E.COUNT = 21
E.SHOWN = 14
E.LOC_KEY = 'j_mp_error_sandbox'
E.PATTERN = '^j_mp_error_sandbox_%d+$'

for i = 1, E.COUNT do
  local key = 'j_mp_error_sandbox_' .. i
  R.define({
    key = key, kind = 'Joker', rarity = 1, cost = 3, pos = { x = 0, y = 0 }, atlas = 'mp_j_ERROR_sandbox',
    blueprint_compat = false, eternal_compat = true, perishable_compat = true,
    no_collection = true, pool = false, sandbox_group = 'error',
    config = { extra = {} },
    calc = function() return nil end,
  })
  S.ERRORS[#S.ERRORS + 1] = key
end

function E.is_error(key) return type(key) == 'string' and key:match(E.PATTERN) ~= nil end

--- Copy the shared description onto every decoy key of a G.localization-shaped table (adds only).
function E.alias_loc(loc)
  local jokers = loc and loc.descriptions and loc.descriptions.Joker
  local src = jokers and jokers[E.LOC_KEY]
  if not src then return 0 end
  local n = 0
  for _, key in ipairs(S.ERRORS) do
    if jokers[key] == nil then
      jokers[key] = MP.copy(src, true)
      n = n + 1
    end
  end
  return n
end

E.BSOD = {
  'SYSTEM_SERVICE_EXCEPTION', 'KERNEL_DATA_INPAGE_ERROR', 'IRQL_NOT_LESS_OR_EQUAL', 'PAGE_FAULT_IN_NONPAGED_AREA',
  'KMODE_EXCEPTION_NOT_HANDLED', 'DRIVER_POWER_STATE_FAILURE', 'CRITICAL_PROCESS_DIED', 'BAD_POOL_HEADER',
  'MEMORY_MANAGEMENT', 'SYSTEM_THREAD_EXCEPTION', 'DPC_WATCHDOG_VIOLATION', 'CLOCK_WATCHDOG_TIMEOUT',
  'WHEA_UNCORRECTABLE_ERROR', 'PFN_LIST_CORRUPT', 'DRIVER_VERIFIER_DETECTED', 'THREAD_STUCK_IN_DEVICE_DRIVER',
  'VIDEO_TDR_TIMEOUT_DETECTED', 'APC_INDEX_MISMATCH', 'DRIVER_IRQL_NOT_LESS_OR_EQUAL', 'BUGCODE_USB_DRIVER',
  'HYPERVISOR_ERROR', 'UNEXPECTED_KERNEL_MODE_TRAP', 'ATTEMPTED_WRITE_TO_READONLY_MEMORY',
  'DRIVER_CORRUPTED_EXPOOL', 'NTFS_FILE_SYSTEM', 'FAT_FILE_SYSTEM', 'KERNEL_SECURITY_CHECK_FAILURE',
  'STOP: 0x0000007E', 'STOP: 0x000000D1', 'STOP: 0x0000001E', 'STOP: 0x00000050', 'STOP: 0x000000A',
  'corrupted heap', 'BSOD', 'malloc(): corrupted top size', 'use after free', 'stack smashing detected',
  'double free or corruption', 'zombie process', 'killed by signal 9', '$', 'despair',
}

local function lighten(c, amt)
  local game_lighten = rawget(_G, 'lighten')
  if c and game_lighten then return game_lighten(c, amt) end
  return c
end

--- The tooltip's extra row (a `main_end` node list), or nil outside the real UI.
function E.main_end()
  if not (rawget(_G, 'DynaText') and G.UIT) then return nil end
  local numbers = {}
  for i = 1, 333 do numbers[i] = tostring(i) end
  local blues = { G.C.BLUE, G.C.CHIPS, G.C.SECONDARY_SET and G.C.SECONDARY_SET.Planet, G.C.RED, G.C.MONEY }
  local strings = {}
  for i, s in ipairs(E.BSOD) do
    strings[i] = { string = s, colour = blues[(i % #blues) + 1] or G.C.BLUE }
  end
  strings[#strings + 1] = { string = string.format('0x%08X', math.random(0, 0x7FFFFFFF)), colour = G.C.MONEY }
  return {
    { n = G.UIT.T, config = { text = '(CURRENTLY ' .. math.random(1, 333) .. ')',
      colour = lighten(G.C.PURPLE, 0.2), scale = 0.4 } },
    { n = G.UIT.O, config = { object = DynaText({ string = numbers, colours = { G.C.MONEY }, pop_in_rate = 9999999,
      silent = true, random_element = true, pop_delay = 1.52, scale = 0.32, min_cycle_time = 0 }) } },
    { n = G.UIT.O, config = { object = DynaText({ string = strings, colours = { G.C.UI.TEXT_DARK }, pop_in_rate = 1,
      silent = true, random_element = true, pop_delay = 0.38, scale = 0.32, min_cycle_time = 0 }) } },
  }
end

-- Core (always-on) layers: the collection page can show the decoys outside a session.
if rawget(_G, 'init_localization') then
  MP.hooks.wrap(_G, 'init_localization', function(orig, ...)
    if G and G.localization then
      local ok, err = pcall(E.alias_loc, G.localization)
      if not ok then MP.log('error', 'error decoy loc alias failed: %s', tostring(err)) end
    end
    return orig(...)
  end, { id = 'sandbox.errors.loc', optional = true })
end

if rawget(_G, 'generate_card_ui') then
  MP.hooks.wrap(_G, 'generate_card_ui', function(orig, _c, full_UI_table, specific_vars, card_type, badges,
                                              hide_desc, main_start, main_end, ...)
    if main_end == nil and not hide_desc and _c and E.is_error(_c.key) then
      main_end = E.main_end()
    end
    return orig(_c, full_UI_table, specific_vars, card_type, badges, hide_desc, main_start, main_end, ...)
  end, { id = 'sandbox.errors.ui', optional = true })
end

return E
