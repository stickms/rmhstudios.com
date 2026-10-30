-- rmh_mp/ui/practice_menu.lua — WS10 Practice page (HUD-19, PR-01, PR-05).
--
-- Pillars: Balanced (blue), Expanded (purple), Vanilla (green), Small World (red), plus an
-- "Extra rulesets" pillar with its own cycle over the D-17 extras. START opens the run setup
-- (deck, stake, optional seed) which sends ui_practice{ruleset, deck, stake, seed?}.
-- Practice is local and works offline; it is refused while queued (PR-05).

local MP = require 'rmh_mp.state'
local TH = require 'rmh_mp.ui.theme'
local W = require 'rmh_mp.ui.widgets'

local U = MP.ui
local PM = U.practice or {}
U.practice = PM

local F = G.FUNCS

PM.extra_index = PM.extra_index or 1

function PM.extra_list() return TH.ruleset_list(true) end

function PM.def(model)
  local queued = model.queue and model.queue.state == 'searching'
  local pillars = {}
  for i, p in ipairs(TH.PRACTICE) do
    pillars[#pillars + 1] = {
      id = 'mp_practice_' .. p.key, button = 'rmh_mp_practice_pick', ref = { ruleset = p.key },
      button_label = TH.T('b_start', 'START'), colour = TH.col(p.colour), name = TH.ruleset_name(p.key),
      desc = { TH.T(p.d1, p.d1d), TH.T(p.d2, p.d2d) },
      stat_label = TH.T('b_players', 'Players'), stat_value = '1', disabled = queued, chip_row = i,
    }
  end
  local extras = PM.extra_list()
  local names = {}
  for i, r in ipairs(extras) do names[i] = TH.ruleset_name(r.key) end
  if PM.extra_index > #extras then PM.extra_index = 1 end
  local cur = extras[PM.extra_index]
  local extra_pillar = W.col({
    W.row({ W.button({ id = 'mp_practice_extra', label = TH.T('b_start', 'START'), button = 'rmh_mp_practice_pick',
      ref_table = { extra = true }, colour = TH.col('GOLD'), minw = 2.6, minh = 0.65, scale = 0.45, disabled = queued }) },
      { padding = 0.07 }),
    W.row({ W.text(TH.T('rmh_mp_ui_extra_rulesets', 'Extra rulesets'), { scale = 0.4 }) }, { padding = 0.05 }),
    W.row({ W.cycle({ id = 'mp_practice_extra_cycle', options = names, current = PM.extra_index,
      callback = 'rmh_mp_practice_extra_cycle', w = 2.2, scale = 0.7, no_pips = true, colour = TH.col('GOLD') }) }),
    W.row(PM.desc_rows(cur and cur.key), { r = 0.1, padding = 0.08, minw = 2.6, minh = 1.3, colour = TH.col('BLACK'), emboss = 0.05 }),
  }, { r = 0.15, padding = 0.12, colour = TH.alpha(TH.col('BLACK'), 0.6), emboss = 0.05, id = 'mp_practice_extra_pillar' })
  local row = W.pillar_row({ id = 'mp_practice_row', pillars = pillars })
  row.nodes[#row.nodes + 1] = extra_pillar
  return { n = G.UIT.ROOT, config = { align = 'cm', colour = TH.col('CLEAR') }, nodes = {
    W.col({ W.row({ W.text(TH.T('b_practice', 'Practice'), { scale = 0.7 }) }, { padding = 0.1 }), row }),
  } }
end

--- The first lines of a ruleset's description.
function PM.desc_rows(key)
  local r = key and TH.ruleset(key)
  local rows = {}
  if not r then return rows end
  for _, line in ipairs(TH.lines(TH.T(r.desc, ''), 3)) do
    rows[#rows + 1] = W.row({ W.text(line, { scale = 0.25 }) }, { maxw = 2.6 })
  end
  return rows
end

U.register_screen('practice', { top = PM.def, bar = function() return U.back_bar('rmh_mp_to_pvp') end })

F.rmh_mp_practice_extra_cycle = function(args)
  PM.extra_index = args and args.to_key or 1
  U.invalidate()
end

F.rmh_mp_practice_pick = function(e)
  if U.model.queue.state == 'searching' then return U.overlays.error('queued') end
  local r = e and e.config and e.config.ref_table or {}
  local key = r.ruleset
  if r.extra then
    local x = PM.extra_list()[PM.extra_index]
    key = x and x.key
  end
  if not key then return end
  U.run_setup.open('practice', { ruleset = key })
end

return PM
