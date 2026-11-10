-- rmh_mp/ui/setup.lua — WS10 pre-game Setup in casual lobbies (A3 §1.6; MM-03, MM-04, MM-05).
--
-- Rendered inside the matchmade lobby's status panel from `setup_view` (types.ts SetupView):
--   ruleset_vote / trap_vote
--     voting   "Your turn: vote", option buttons + Random, Confirm Vote -> ui_vote{stepId, option};
--              after sending "Vote sent. Waiting for the vote to close..." and a "Your vote" tag.
--              Counts stay hidden (the host only reveals them at close). voted/voters + time left.
--     rolling  the highlight runs over the options at 12 Hz (1.2 s), landing on `result`
--     reveal   counts and chances, the result highlighted
--     done     "Setting up the game..."
--   draft      9 deck tiles (deck name + stake), banned ones greyed. On my turn: pick a tile,
--              Confirm Ban / Confirm Pick -> ui_draft{stepId, key=deck}; else "Waiting for opponent...".
-- The time left counts down locally from msLeft (re-anchored on every view).

local MP = require 'rmh_mp.state'
local TH = require 'rmh_mp.ui.theme'
local W = require 'rmh_mp.ui.widgets'

local U = MP.ui
local S = U.setup or {}
U.setup = S

local F = G.FUNCS

S.sel = S.sel or {}       -- { stepId, option, sent } my choice for the current step
S.clock = S.clock or { text = '', at = 0, ms = 0 }

local function now()
  return (rawget(_G, 'love') and love.timer and love.timer.getTime and love.timer.getTime()) or (G.TIMERS and G.TIMERS.REAL) or 0
end

--- A new view: keep my selection only within the same step; re-anchor the clock.
function U.setup_seen(v)
  if S.sel.stepId ~= v.stepId then S.sel = { stepId = v.stepId } end
  S.clock.at = now()
  S.clock.ms = v.msLeft or 0
  S.clock.phase = v.phase
  S.clock.text = S.time_text(S.clock.ms)
  if v.phase == 'rolling' then S.roll_start = now() end
end

function S.time_text(ms)
  local s = math.max(0, math.ceil((ms or 0) / 1000))
  return TH.T('rmh_mp_ui_banpick_time_left', 'Time left:') .. ' ' .. tostring(s) .. 's'
end

function S.option_label(kind, id)
  if id == 'random' then return TH.T('k_random', 'Random') end
  if kind == 'trap_vote' then
    if id == 'traps_on' then return TH.T('k_pvp_setup_traps_on', 'Traps On') end
    if id == 'traps_off' then return TH.T('k_pvp_setup_traps_off', 'Traps Off') end
  end
  if TH.ruleset(id) then return TH.ruleset_name(id) end
  return tostring(id)
end

local function percent(x) return tostring(math.floor((x or 0) * 100 + 0.5)) .. '%' end

--- During `rolling`, which option is lit (12 Hz, landing on the result after 1.2 s).
function S.rolling_index(v, t)
  local n = #(v.options or {})
  if n == 0 then return nil end
  local elapsed = (t or now()) - (S.roll_start or now())
  if elapsed >= 1.2 and v.result then
    for i, o in ipairs(v.options) do if o.id == v.result then return i end end
  end
  return (math.floor(elapsed * 12) % n) + 1
end

function S.vote_nodes(v, model)
  local nodes = {}
  local title = v.kind == 'trap_vote' and TH.T('k_pvp_setup_title_traps', 'Vote: Trap Cards') or TH.T('k_pvp_setup_title_ruleset', 'Vote: Ruleset')
  nodes[#nodes + 1] = W.row({ W.text(title, { scale = 0.45 }) })
  local mine = S.sel.stepId == v.stepId and S.sel or {}
  local lit = v.phase == 'rolling' and S.rolling_index(v) or nil
  local opts = {}
  for i, o in ipairs(v.options or {}) do
    local label = S.option_label(v.kind, o.id)
    if v.phase == 'reveal' or v.phase == 'done' then
      if o.count ~= nil then label = label .. '  ' .. tostring(o.count) .. ' (' .. percent(o.chance) .. ')' end
    end
    local chosen = (v.phase == 'voting' and mine.option == o.id) or (lit == i)
      or ((v.phase == 'reveal' or v.phase == 'done') and v.result == o.id)
    local colour = chosen and TH.col('GREEN') or TH.col('GREY')
    local can = v.phase == 'voting' and not mine.sent
    opts[#opts + 1] = W.col({
      W.button({ id = 'mp_vote_' .. o.id, label = label, button = can and 'rmh_mp_vote_pick' or 'nil', colour = colour,
        minw = 2.1, minh = 0.55, scale = 0.32, ref_table = { option = o.id } }),
      (mine.sent and mine.option == o.id) and W.badge(TH.T('k_pvp_setup_your_vote_tag', 'Your vote'), TH.col('MP_PURPLE'), { minw = 1.2, scale = 0.25 }) or nil,
    }, { padding = 0.03 })
  end
  nodes[#nodes + 1] = W.row(opts, { id = 'mp_vote_options' })
  if v.phase == 'voting' then
    if mine.sent then
      nodes[#nodes + 1] = W.row({ W.text(TH.T('k_pvp_setup_vote_sent', 'Vote sent. Waiting for the vote to close...'), { scale = 0.3 }) })
    else
      nodes[#nodes + 1] = W.row({
        W.text(TH.T('k_pvp_setup_your_vote', 'Your turn: vote'), { scale = 0.32, colour = TH.col('STATUS_WAIT') }),
        W.col({}, { minw = 0.2 }),
        W.button({ id = 'mp_vote_random', label = TH.T('k_random', 'Random'), button = 'rmh_mp_vote_pick', ref_table = { option = 'random' },
          colour = mine.option == 'random' and TH.col('GREEN') or TH.col('BLUE'), minw = 1.4, minh = 0.5, scale = 0.3, col = true }),
        W.col({}, { minw = 0.1 }),
        W.button({ id = 'mp_vote_confirm', label = TH.T('k_pvp_setup_confirm_vote', 'Confirm Vote'), button = 'rmh_mp_vote_confirm',
          colour = TH.col('GREEN'), minw = 2, minh = 0.5, scale = 0.3, col = true, disabled = mine.option == nil }),
      })
    end
    nodes[#nodes + 1] = W.row({ W.text(tostring(v.voted) .. '/' .. tostring(v.voters), { scale = 0.3, id = 'mp_vote_count' }),
      W.col({}, { minw = 0.3 }), W.live_text(S.clock, 'text', { scale = 0.3, id = 'mp_setup_clock' }) })
  end
  return nodes
end

function S.draft_nodes(v, model)
  local d = v.draft or { tiles = {}, action = 'ban', remaining = 0 }
  local me = model.lobby and model.lobby.me
  local my_turn = v.phase == 'voting' and d.actor ~= nil and d.actor == me
  local mine = S.sel.stepId == v.stepId and S.sel or {}
  local nodes = { W.row({ W.text(TH.T('rmh_mp_ui_banpick_title', 'DECK BAN'), { scale = 0.45 }) }) }
  local rows, row = {}, {}
  for i, t in ipairs(d.tiles or {}) do
    local name = U.run_setup.deck_name(t.deck)
    local stake = U.run_setup.stake_name(t.stake)
    local colour
    if t.state == 'banned' then colour = TH.ui_col('BACKGROUND_INACTIVE')
    elseif t.state == 'picked' or (v.result and v.result == t.deck) then colour = TH.col('GREEN')
    elseif mine.option == t.deck then colour = TH.col('RED')
    else colour = TH.col('MP_PURPLE') end
    local label = { name, t.state == 'banned' and TH.T('rmh_mp_ui_banpick_banned', 'BANNED') or stake }
    row[#row + 1] = W.button({ id = 'mp_draft_' .. i, label = label,
      button = (my_turn and t.state == 'open' and not mine.sent) and 'rmh_mp_draft_pick' or 'nil',
      ref_table = { key = t.deck }, colour = colour, minw = 2, minh = 0.8, scale = 0.28, col = true })
    if #row == 3 then rows[#rows + 1] = W.row(row, { padding = 0.04 }); row = {} end
  end
  if #row > 0 then rows[#rows + 1] = W.row(row, { padding = 0.04 }) end
  nodes[#nodes + 1] = W.row({ W.col(rows, { id = 'mp_draft_tiles' }) })
  if v.phase == 'done' then
    nodes[#nodes + 1] = W.row({ W.text(TH.T('rmh_mp_ui_banpick_selected', 'Selected:') .. ' ' .. U.run_setup.deck_name(v.result), { scale = 0.32 }) })
  elseif my_turn then
    local pick = d.action == 'pick'
    nodes[#nodes + 1] = W.row({
      W.text(pick and TH.T('rmh_mp_ui_banpick_pick_turn', 'Your turn: pick your deck') or TH.T('rmh_mp_ui_banpick_your_turn', 'Your turn: ban a deck'),
        { scale = 0.32, colour = TH.col('STATUS_WAIT') }),
      W.col({}, { minw = 0.2 }),
      W.button({ id = 'mp_draft_confirm', label = pick and TH.T('rmh_mp_ui_banpick_confirm_pick', 'Confirm Pick') or TH.T('rmh_mp_ui_banpick_confirm', 'Confirm Ban'),
        button = 'rmh_mp_draft_confirm', colour = TH.col(pick and 'GREEN' or 'RED'), minw = 2, minh = 0.5, scale = 0.3, col = true,
        disabled = mine.option == nil or mine.sent == true }),
    })
    nodes[#nodes + 1] = W.row({ W.text(TH.T('rmh_mp_ui_banpick_bans_left', 'Bans left:') .. ' ' .. tostring(d.remaining), { scale = 0.28 }),
      W.col({}, { minw = 0.3 }), W.live_text(S.clock, 'text', { scale = 0.28, id = 'mp_setup_clock' }) })
  else
    nodes[#nodes + 1] = W.row({ W.text(TH.T('rmh_mp_ui_banpick_their_turn', 'Waiting for opponent...'), { scale = 0.32 }),
      W.col({}, { minw = 0.3 }), W.live_text(S.clock, 'text', { scale = 0.28, id = 'mp_setup_clock' }) })
  end
  return nodes
end

--- The status panel of a matchmade lobby.
function S.panel(model)
  local v = model.setup
  local nodes
  if not v then
    nodes = { W.row({ W.text(TH.T('rmh_mp_ui_waiting_for_players', 'Waiting for players...'), { scale = 0.45, id = 'mp_setup_waiting' }) }) }
  elseif v.kind == 'draft' then
    nodes = S.draft_nodes(v, model)
  elseif v.phase == 'done' and not v.result then
    nodes = { W.row({ W.text(TH.T('k_pvp_setup_waiting', 'Setting up the game...'), { scale = 0.45 }) }) }
  else
    nodes = S.vote_nodes(v, model)
  end
  return W.col(nodes, { r = 0.1, padding = 0.1, colour = TH.col('BLACK'), minw = 7, minh = 1.35, id = 'mp_setup_panel' })
end

-- ── Intents ─────────────────────────────────────────────────────────────────

function S.pick(option)
  local v = U.model.setup
  if not (v and v.phase == 'voting' and v.kind ~= 'draft') then return false end
  if S.sel.stepId ~= v.stepId then S.sel = { stepId = v.stepId } end
  if S.sel.sent then return false end
  S.sel.option = option
  U.invalidate()
  return true
end

function S.confirm()
  local v = U.model.setup
  if not (v and v.phase == 'voting' and S.sel.stepId == v.stepId and S.sel.option and not S.sel.sent) then return false end
  if U.send('ui_vote', { stepId = v.stepId, option = S.sel.option }) then
    S.sel.sent = true
    U.invalidate()
    return true
  end
  return false
end

function S.draft_pick(key)
  local v = U.model.setup
  if not (v and v.kind == 'draft' and v.phase == 'voting') then return false end
  if S.sel.stepId ~= v.stepId then S.sel = { stepId = v.stepId } end
  S.sel.option = key
  U.invalidate()
  return true
end

function S.draft_confirm()
  local v = U.model.setup
  local me = U.model.lobby and U.model.lobby.me
  if not (v and v.kind == 'draft' and v.draft and v.draft.actor == me and S.sel.option and not S.sel.sent) then return false end
  if U.send('ui_draft', { stepId = v.stepId, key = S.sel.option }) then
    -- A ban turn may hold several bans: the next view (same step, fewer remaining) re-opens it.
    S.sel = { stepId = v.stepId, sent = true }
    U.invalidate()
    return true
  end
  return false
end

F.rmh_mp_vote_pick = function(e) S.pick(e and e.config and e.config.ref_table and e.config.ref_table.option) end
F.rmh_mp_vote_confirm = function() S.confirm() end
F.rmh_mp_draft_pick = function(e) S.draft_pick(e and e.config and e.config.ref_table and e.config.ref_table.key) end
F.rmh_mp_draft_confirm = function() S.draft_confirm() end

-- Draft: a new view on the same step (my next ban) clears the "sent" lock.
local seen_setup = U.setup_seen
function U.setup_seen(v)
  local prev = U.model.setup_prev
  seen_setup(v)
  if v.kind == 'draft' and prev and prev.stepId == v.stepId and prev.draft and v.draft
    and (prev.draft.remaining ~= v.draft.remaining or prev.draft.actor ~= v.draft.actor) then
    S.sel = { stepId = v.stepId }
  end
  U.model.setup_prev = v
end

-- Per-frame: the clock text and the rolling highlight.
U.tick[#U.tick + 1] = function()
  local v = U.model.setup
  if not v then return end
  local left = S.clock.ms - (now() - S.clock.at) * 1000
  local text = S.time_text(left)
  if text ~= S.clock.text then S.clock.text = text end
  if v.phase == 'rolling' then
    local i = S.rolling_index(v)
    if i ~= S.lit then S.lit = i; U.invalidate() end
  end
end

return S
