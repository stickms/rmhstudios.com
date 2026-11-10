-- rmh_mp/ui/pause.lua — the pause menu in a session run (HUD-10, PR-04, D-38).
--
-- create_UIBox_options is wrapped while a session is mounted and the stage is a run:
--   match     Settings · Seed Change (blue; greyed out, not removed, after the first 300 s of the
--             run, as the mod's pvp_run_options.lua) · Vote for Draw (blue) ·
--             Forfeit (red, at once as the mod: its only step between is the ranked contest modal,
--             out of scope) · Collection (the API's pause_menu_extra_rows)
--   practice  Settings · Seed Change (same window: restarts the practice run on a fresh seed) ·
--             Forfeit (red, straight to the main menu, as the mod) · Collection · Unlimited Slots /
--             Edition Cycling (Q) / Show inactive sandbox cards toggles (D-38, D-28; hooks/practice.lua)
-- Restart is gone in both (holding R is disabled by the core, hooks/guards.lua).
-- Votes are game events (seed_vote / draw_vote) the referee counts; their k/n progress comes back
-- as vote_progress outcomes and is shown as a toast (and in the chat when the chat UI is there).
--
--   PZ.items()          -> ordered list of { id, label, button, colour } for the current session
--   PZ.build()          -> the menu definition (create_UIBox_generic_options)
--   PZ.forfeit()        sends forfeit and leaves to the main menu (the core sends match_left)
--   PZ.vote(kind)       'seed' | 'draw'
-- MP.test.pause_menu(op?) / forfeit() / run_vote(kind) drive it for the autopilot.

local MP = require 'rmh_mp.state'

MP.ui = MP.ui or {}
local PZ = MP.ui.pause or {}
MP.ui.pause = PZ

PZ.SEED_VOTE_WINDOW = 300

MP.practice_opts = MP.practice_opts or { unlimited_slots = false, edition_cycling = false, show_inactive = false }

local function RU() return MP.ui.run end
local function g(name) return rawget(_G, name) end

local function now() return (G and G.TIMERS and G.TIMERS.REAL) or 0 end

--- Seconds since this run started (Seed Change is offered only in the first 300 s).
function PZ.run_age()
  return now() - (PZ.run_started or now())
end

function PZ.items()
  local t = RU().t
  local loc = function(key, fb)
    if g('localize') then
      local s = localize(key)
      if type(s) == 'string' and s ~= key and s ~= 'ERROR' then return s end
    end
    return fb
  end
  local list = { { id = 'mp_pause_settings', label = loc('b_settings', 'Settings'), button = 'settings' } }
  local match = MP.is_match()
  local seed = { id = 'mp_pause_seed', label = t('rmh_mp_seed_change', 'Seed Change'), button = 'mp_vote_seed', colour = 'BLUE' }
  if PZ.run_age() > PZ.SEED_VOTE_WINDOW then seed.button, seed.disabled = nil, true end
  list[#list + 1] = seed
  if match then
    list[#list + 1] = { id = 'mp_pause_draw', label = t('rmh_mp_vote_draw', 'Vote for Draw'), button = 'mp_vote_draw', colour = 'BLUE' }
  end
  list[#list + 1] = { id = 'mp_pause_forfeit', label = t('b_pvp_forfeit', 'Forfeit'),
    button = match and 'mp_forfeit' or 'go_to_menu', colour = 'RED' }
  list[#list + 1] = { id = 'your_collection', label = loc('b_collection', 'Collection'), button = 'your_collection' }
  return list
end

function PZ.strip(n)
  if type(n) ~= 'table' then return end
  if n.config then n.config.button = nil end
  for _, c in ipairs(n.nodes or {}) do PZ.strip(c) end
end

function PZ.build()
  local contents = {}
  for _, it in ipairs(PZ.items()) do
    local node = UIBox_button({ id = it.id, label = { it.label }, button = it.button, minw = 5,
      colour = it.disabled and G.C.UI.BACKGROUND_INACTIVE or it.colour and G.C[it.colour] or nil })
    -- Greyed out and inert: UIBox_button falls back to exit_overlay_menu for a nil button.
    if it.disabled then PZ.strip(node) end
    contents[#contents + 1] = node
  end
  if MP.is_practice() then
    local t = RU().t
    local o = MP.practice_opts
    contents[#contents + 1] = create_toggle({ label = t('k_unlimited_slots', 'Unlimited Slots'), ref_table = o, ref_value = 'unlimited_slots', w = 4 })
    contents[#contents + 1] = create_toggle({ label = t('k_edition_cycling', 'Edition Cycling (Q)'), ref_table = o, ref_value = 'edition_cycling', w = 4 })
    contents[#contents + 1] = create_toggle({ label = t('rmh_mp_practice_show_inactive', 'Show inactive sandbox cards'), ref_table = o, ref_value = 'show_inactive', w = 4 })
  end
  return create_UIBox_generic_options({ contents = contents })
end

PZ.votes_sent = PZ.votes_sent or {}

function PZ.vote(kind)
  if kind == 'seed' and PZ.run_age() > PZ.SEED_VOTE_WINDOW then return false end
  -- Practice is solo: its one vote is unanimous, so the run restarts on a fresh seed.
  if kind == 'seed' and MP.is_practice() then return MP.session.launch('') == true end
  if not MP.is_match() then return false end
  local ev = kind == 'seed' and 'seed_vote' or 'draw_vote'
  MP.event({ t = ev })
  PZ.votes_sent[kind] = (PZ.votes_sent[kind] or 0) + 1
  return true
end

function PZ.forfeit()
  if MP.is_match() and not MP.state.result then MP.event({ t = 'forfeit' }) end
  if G.OVERLAY_MENU and G.FUNCS.exit_overlay_menu then pcall(G.FUNCS.exit_overlay_menu) end
  if G.FUNCS.go_to_menu then G.FUNCS.go_to_menu() end
  return true
end

function PZ.on_vote_progress(o)
  local kind = o.kind == 'seed' and 'rmh_mp_vote_seed_progress' or 'rmh_mp_vote_draw_progress'
  local fb = o.kind == 'seed' and 'Vote to change seed: #1#/#2#' or 'Vote for Draw: #1#/#2#'
  local text = RU().tv(kind, fb, { o.k or 0, o.n or 0 })
  PZ.last_progress = text
  -- The chat (WS10 ui/chat.lua) prints vote progress itself; without it, a toast.
  if not MP.ui.chat then RU().toast(text, G.C and G.C.BLUE) end
  return text
end

function PZ.install()
  PZ.run_started = nil
  PZ.votes_sent = {}
  if G and G.FUNCS then
    G.FUNCS.mp_vote_seed = function()
      if PZ.vote('seed') and G.FUNCS.exit_overlay_menu then G.FUNCS.exit_overlay_menu() end
    end
    G.FUNCS.mp_vote_draw = function()
      if PZ.vote('draw') and G.FUNCS.exit_overlay_menu then G.FUNCS.exit_overlay_menu() end
    end
    G.FUNCS.mp_forfeit = function() PZ.forfeit() end
  end
  local wrap = MP.hooks.wrap
  wrap(_G, 'create_UIBox_options', function(orig, ...)
    if not (G.STAGE == G.STAGES.RUN and (MP.is_match() or MP.is_practice())) then return orig(...) end
    local ok, def = pcall(PZ.build)
    if ok and def then return def end
    MP.log('error', 'pause menu failed: %s', tostring(def))
    return orig(...)
  end, { group = 'session', optional = true, id = 'ui.pause' })
  if rawget(_G, 'Game') then
    wrap(Game, 'start_run', function(orig, self, args, ...)
      PZ.run_started = now()
      return orig(self, args, ...)
    end, { group = 'session', optional = true, id = 'ui.pause.start' })
  end
end

if MP.report and MP.report.on and not PZ.observing then
  PZ.observing = true
  MP.report.on('vote_progress', function(o) if MP.is_match() then PZ.on_vote_progress(o) end end)
end

-- ── Autopilot surface ───────────────────────────────────────────────────────

MP.test = MP.test or {}

--- pause_menu() opens it and lists the button ids; pause_menu('close') closes it.
function MP.test.pause_menu(a)
  local op = type(a) == 'table' and (a.op or a[1]) or a
  if op == 'close' then
    if G.FUNCS.exit_overlay_menu then G.FUNCS.exit_overlay_menu() end
    return { open = false }
  end
  G.FUNCS.options()
  local ids = {}
  for _, it in ipairs(PZ.items()) do ids[#ids + 1] = it.id end
  return { open = G.OVERLAY_MENU ~= nil, items = ids }
end

function MP.test.forfeit()
  return { ok = PZ.forfeit() }
end

function MP.test.run_vote(a)
  if not (MP.is_match() and G.STAGE == G.STAGES.RUN) then error('vote: no setup vote open and not in a match run') end
  local kind = type(a) == 'table' and (a.kind or a[1]) or a
  return { sent = PZ.vote(kind == 'seed' and 'seed' or 'draw') }
end

return PZ
