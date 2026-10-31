-- rmh_mp/ui/pillars.lua — WS10 pillar pages (HUD-19, LOB-01, MM-01): Create Lobby and Find Game.
-- (Practice has its own page in practice_menu.lua.)
--
-- Create: Nemesis (blue), Battle Royale (purple), Manhunt (red), Teams (green), Party (orange).
--   CREATE -> ui_create_lobby{queueMode, kind='private'} ; Party -> {queueMode='pvp_nemesis', kind='party'}
-- Find Game (the Casual tab only; ranked is EX-01): the mod's four casual pillars, Nemesis
--   ("One Nemesis, head to head"), Battle Royale, Teams, Small World (red). No Manhunt: the mod
--   leaves it to Create Lobby (find_game.lua CASUAL_MODES).
--   FIND -> ui_queue{op='join', queueMode} and back to the PvP menu, which shows CANCEL and the status.
--   Each pillar shows the live In Queue / In Game counts (A12) and a "Uses The Order" card (A13).
--   CREATE while searching opens the queue guard (A18, queue_guard.lua).

local MP = require 'rmh_mp.state'
local TH = require 'rmh_mp.ui.theme'
local W = require 'rmh_mp.ui.widgets'

local U = MP.ui
local P = U.pillars or {}
U.pillars = P

local F = G.FUNCS

local function root(nodes)
  return { n = G.UIT.ROOT, config = { align = 'cm', colour = TH.col('CLEAR') }, nodes = nodes }
end

local function title(text)
  return W.row({ W.text(text, { scale = 0.7 }) }, { padding = 0.1 })
end

function P.create_def(model)
  local online = U.online(model)
  local pillars = {}
  for i, q in ipairs(TH.QUEUE_MODES) do
    if not q.casual_only then
      pillars[#pillars + 1] = {
        id = 'mp_create_' .. q.mode, button = 'rmh_mp_create_lobby', ref = { queueMode = q.mode, kind = 'private' },
        button_label = TH.T('rmh_mp_ui_create_cap', 'CREATE'), colour = TH.col(q.colour), name = TH.T(q.name, q.def),
        desc = { TH.T(q.d1, q.d1d), TH.T(q.d2, q.d2d) }, stat_label = TH.T('b_players', 'Players'), stat_value = q.players,
        disabled = not online, chip_row = i,
      }
    end
  end
  pillars[#pillars + 1] = {
    id = 'mp_create_party', button = 'rmh_mp_create_lobby', ref = { queueMode = 'pvp_nemesis', kind = 'party' },
    button_label = TH.T('rmh_mp_ui_create_cap', 'CREATE'), colour = TH.col('ORANGE'), name = TH.T('rmh_mp_ui_party', 'Party'),
    desc = { TH.T('rmh_mp_ui_party_desc_1', 'Queue Casual'), TH.T('rmh_mp_ui_party_desc_2', 'together') },
    stat_label = TH.T('b_players', 'Players'), stat_value = '2-8', disabled = not online, chip_row = 6,
  }
  return root({ W.col({ title(TH.T('b_create_lobby', 'Create Lobby')), W.pillar_row({ id = 'mp_create_row', pillars = pillars }) }) })
end

-- ── Find Game live counts (A12) ─────────────────────────────────────────────
-- While Find Game is on screen (and the hub is up) Lua asks for the per-mode counts every
-- POLL_S seconds (`ui_queue_counts`; TS forwards it to the hub's aggregate counters) and the
-- answer (`queue_counts`) updates the In Queue / In Game boxes in place (live text). Leaving the
-- page stops the poll; coming back polls at once.

P.POLL_S = 5
P.counts = P.counts or {}
for _, q in ipairs(TH.FIND_MODES) do P.counts[q.mode] = P.counts[q.mode] or { queued = '-', inGame = '-' } end

--- Seconds (G.TIMERS.REAL in the game; specs may replace it).
function P.clock()
  return (G.TIMERS and G.TIMERS.REAL) or os.clock()
end

--- Once a frame (U.tick): ask for the counts when due. True when a request went out.
function P.poll_tick()
  local want = U.screen == 'find' and U.rendered == 'find' and U.at_main_menu() and U.online()
  if not want then P.last_poll = nil; return false end
  local now = P.clock()
  if P.last_poll and now - P.last_poll < P.POLL_S then return false end
  P.last_poll = now
  return U.send('ui_queue_counts', {})
end
U.tick[#U.tick + 1] = P.poll_tick

function P.on_counts(d)
  for _, c in ipairs(d.counts or {}) do
    local slot = P.counts[c.queueMode]
    if slot then
      slot.queued = tostring(math.max(0, math.floor(tonumber(c.queued) or 0)))
      slot.inGame = tostring(math.max(0, math.floor(tonumber(c.inGame) or 0)))
    end
  end
end
MP.net.on('queue_counts', P.on_counts)

local function count_half(id, label, ref, key)
  return W.col({
    W.row({ W.text(label, { scale = 0.24 }) }),
    W.row({ W.live_text(ref, key, { scale = 0.5, colour = TH.col('IMPORTANT'), id = id }) }),
  }, { padding = 0.02, minw = 1, minh = 0.85, r = 0.1, emboss = 0.05, colour = TH.darken(TH.col('L_BLACK'), 0.25) })
end

--- The In Queue / In Game box of a Find Game pillar (in place of the fixed Players stat).
function P.count_box(mode)
  local ref = P.counts[mode]
  return W.row({ W.col({
    count_half('mp_find_' .. mode .. '_queued', TH.T('rmh_mp_ui_in_queue', 'In Queue'), ref, 'queued'),
    W.col({}, { minw = 0.06 }),
    count_half('mp_find_' .. mode .. '_ingame', TH.T('rmh_mp_ui_in_game', 'In Game'), ref, 'inGame'),
  }, { r = 0.1, padding = 0.06, minw = 2.4, colour = TH.col('BLACK'), emboss = 0.05 }) }, { padding = 0.05 })
end

--- The "Uses The Order" card (A13): opens the explainer (order_info.lua).
function P.order_card(mode)
  return W.row({ W.button({ id = 'mp_find_' .. mode .. '_order', label = TH.L('rmh_mp_ui_uses_order', { 'Uses', 'The Order' }),
    button = 'rmh_mp_order_open', colour = TH.col('BLUE'), minw = 2.2, minh = 0.6, scale = 0.32 }) },
    { padding = 0.06, r = 0.1, colour = TH.col('BLACK'), emboss = 0.05 })
end

-- Every casual queue plays with The Order (the mod's casual pillars all set uses_order).
P.USES_ORDER = { pvp_nemesis = true, pvp_royale = true, pvp_teams = true, pvp_smallworld = true }

function P.find_def(model)
  local online = U.online(model)
  local pillars = {}
  for _, q in ipairs(TH.FIND_MODES) do
    pillars[#pillars + 1] = {
      id = 'mp_find_' .. q.mode, button = 'rmh_mp_queue_join', ref = { queueMode = q.mode },
      button_label = TH.T('rmh_mp_ui_find_game_cap', 'FIND GAME'), colour = TH.col(q.colour), name = TH.T(q.name, q.def),
      desc = { TH.T(q.cd1 or q.d1, q.cd1d or q.d1d), TH.T(q.cd2 or q.d2, q.cd2d or q.d2d) }, stat_node = P.count_box(q.mode),
      extra = P.USES_ORDER[q.mode] and P.order_card(q.mode) or nil, disabled = not online, chip_row = q.row,
    }
  end
  return root({ W.col({
    title(TH.T('rmh_mp_ui_casual_cap', 'CASUAL')),
    W.pillar_row({ id = 'mp_find_row', pillars = pillars }),
  }) })
end

U.register_screen('create', { top = P.create_def, bar = function() return U.back_bar('rmh_mp_to_pvp') end })
U.register_screen('find', { top = P.find_def, bar = function() return U.back_bar('rmh_mp_to_pvp') end })

F.rmh_mp_create_lobby = function(e)
  local r = e and e.config and e.config.ref_table or {}
  if U.queue_guard(function() return F.rmh_mp_create_lobby(e) end) then return end
  if U.send('ui_create_lobby', { queueMode = r.queueMode or 'pvp_nemesis', kind = r.kind or 'private' }) then
    W.toast('rmh_mp_ui_creating', nil, { default = 'Creating lobby...' })
  end
end

F.rmh_mp_queue_join = function(e)
  local r = e and e.config and e.config.ref_table or {}
  local mode = r.queueMode or 'pvp_nemesis'
  if U.send('ui_queue', { op = 'join', queueMode = mode }) then
    U.model.queue = { state = 'searching', queueMode = mode }
    U.go('pvp')
  end
end

return P
