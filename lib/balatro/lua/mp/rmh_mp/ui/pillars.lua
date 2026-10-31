-- rmh_mp/ui/pillars.lua — WS10 pillar pages (HUD-19, LOB-01, MM-01): Create Lobby and Find Game.
-- (Practice has its own page in practice_menu.lua.)
--
-- Create: Nemesis (blue), Battle Royale (purple), Manhunt (red), Teams (green), Party (orange).
--   CREATE -> ui_create_lobby{queueMode, kind='private'} ; Party -> {queueMode='pvp_nemesis', kind='party'}
-- Find Game (the Casual tab only; ranked is EX-01): one pillar per casual queue.
--   FIND -> ui_queue{op='join', queueMode} and back to the PvP menu, which shows CANCEL and the status.

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

function P.find_def(model)
  local online = U.online(model)
  local pillars = {}
  for i, q in ipairs(TH.QUEUE_MODES) do
    pillars[#pillars + 1] = {
      id = 'mp_find_' .. q.mode, button = 'rmh_mp_queue_join', ref = { queueMode = q.mode },
      button_label = TH.T('rmh_mp_ui_find_game_cap', 'FIND GAME'), colour = TH.col(q.colour), name = TH.T(q.name, q.def),
      desc = { TH.T(q.d1, q.d1d), TH.T(q.d2, q.d2d) }, stat_label = TH.T('b_players', 'Players'),
      stat_value = q.casual_players, disabled = not online, chip_row = i,
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
  if U.queue_busy() then return U.overlays.error('queued') end
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
