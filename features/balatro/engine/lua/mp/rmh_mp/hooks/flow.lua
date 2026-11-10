-- rmh_mp/hooks/flow.lua — match flow hooks (FL-06, 08, 12, 13, 14, 15; C §1.1, §3).
--
-- Session-group wraps:
--   G.FUNCS.select_blind  PvP pillar = Ready toggle until start_blind (MP.pvp.toggle_ready);
--                         any real selection: new ante key, play_hand(0, hands), new_round,
--                         location loc_playing-<blind>
--   G.FUNCS.skip_blind    blind_result(beaten) + skip report + furthest blind + timer skip
--   new_round             per-round token (re-arms the duplicate end_round guard)
--   end_round             duplicate guard; PvP deck-out -> 0 hands reported, wait; vanilla game
--                         over never happens in a session (failed normal blind -> report, treated
--                         as beaten; practice can never fail); the ante-8 win is suppressed in
--                         matches (win_ante 999 for the round's end); furthest blind reported
--   ease_ante             set_ante reported after the change; one +1 per round (no double ease)
--   Game.update_game_over the vanilla game-over screen never shows in a match without a result
--   location reporters    BLIND_SELECT -> loc_selecting, SHOP -> loc_shop

local MP = require 'rmh_mp.state'
local att = require 'rmh_mp.rules.attrition'
local fmt = require 'rmh_mp.util.fmt'

local F = {}
MP.flow = F

F.SUPPRESSED_WIN_ANTE = 999

local function lives_field(ev)
  local me = MP.state.session and MP.state.session.me
  local l = me and MP.state.lives[me]
  if l then ev.lives = math.min(100, math.max(0, l)) end
  return ev
end

local function new_ante_key()
  local t = {}
  for i = 1, 8 do t[i] = string.format('%x', math.random(0, 15)) end
  return table.concat(t)
end

function F.on_select(e)
  local st = MP.state
  st.ante_key = new_ante_key()
  st.round.eval_done = false
  st.round.failed = false
  local hands = G.GAME.round_resets.hands or 4
  MP.event(lives_field({ t = 'play_hand', score = '0', hands_left = math.min(1000, hands), skips = G.GAME.skips or 0 }))
  MP.event({ t = 'new_round' })
  local blind = e and e.config and e.config.ref_table
  local key = blind and blind.key or 'bl_small'
  if att.slot_is_pvp(G.GAME.blind_on_deck or 'Small') and att.uses_nemesis_blind() then key = att.PVP_BLIND end
  if MP.pvp then MP.pvp.set_location('loc_playing-' .. key) end
  if MP.replay_hook then pcall(MP.replay_hook, 'set_ante_key', st.ante_key) end
end

local function report_blind_result(slot, ante, beaten)
  local id = tostring(ante) .. ':' .. slot
  local prev = MP.state.blind_results[id]
  if prev == false then return end -- a recorded failure is final
  MP.state.blind_results[id] = beaten
  MP.event({ t = 'blind_result', ante = math.max(0, math.min(1000, ante)), blind = slot, beaten = beaten })
end
F.report_blind_result = report_blind_result

local function report_furthest(slot, ante)
  local v = att.furthest_blind(slot, ante)
  if v > (MP.state.furthest_blind or 0) then
    MP.state.furthest_blind = v
    MP.event({ t = 'furthest_blind', value = v })
  end
end

--- Decide the end of a round in a session. Returns false when end_round must not run yet.
function F.before_end_round()
  local st = MP.state
  local pvp = st.pvp
  local blind = G.GAME.blind
  local on_pvp = MP.pvp and MP.pvp.on_pvp_blind()
  if on_pvp and att.pvp_enabled() and not pvp.ended then
    local live_referee = MP.is_match() or (MP.is_practice() and MP.net.transport_is_live())
    if live_referee then
      -- Deck-out (or any early end_round) on the PvP blind: report 0 hands and wait for end_pvp.
      local cr = G.GAME.current_round
      if not pvp.waiting then
        if cr.hands_left > 0 then cr.hands_left = 0 end
        pvp.waiting = true
        if MP.pvp then MP.pvp.report_hand(0) end
      end
      return false
    end
  end
  if st.round.ended_token == st.round.token then return false end -- FL-12 duplicate end_round
  st.round.ended_token = st.round.token

  local ante = G.GAME.round_resets.ante
  local slot = att.current_slot()
  if on_pvp then
    blind.chips = -1                          -- no game over; the $5 is always paid (FL-16)
    pvp.active = false
  else
    local failed = (G.GAME.chips or 0) - (blind.chips or 0) < 0
    if failed then
      st.round.failed = true
      if MP.is_match() then
        local cr = G.GAME.current_round
        if (cr.hands_played or 0) > 0 or (cr.discards_used or 0) > 0 then -- D-07
          report_blind_result(slot, ante, false)
          MP.event({ t = 'fail_round' })
        end
        if MP.option('noGoldOnRoundLoss', false) then blind.dollars = 0 end
      end
      blind.chips = -1                        -- treated as beaten (FL-14; practice never fails)
    elseif MP.is_match() then
      report_blind_result(slot, ante, true)
    end
  end
  if MP.is_match() then report_furthest(slot, ante) end
  return true
end

function F.install()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'flow.' .. id } end

  if G and G.FUNCS then
    wrap(G.FUNCS, 'select_blind', function(orig, e, ...)
      local pvp = MP.state.pvp
      if not F.bypass_ready and att.pvp_enabled() and (MP.is_match() or MP.is_practice())
        and att.slot_is_pvp(G.GAME.blind_on_deck or 'Small') and not pvp.started then
        if MP.pvp.toggle_ready(e) then return end
      end
      F.on_select(e)
      return orig(e, ...)
    end, o('select_blind'))

    wrap(G.FUNCS, 'skip_blind', function(orig, e, ...)
      local slot = G.GAME.blind_on_deck or 'Small'
      local ante = G.GAME.round_resets.ante
      local r = orig(e, ...)
      if MP.is_match() or MP.is_practice() then
        report_blind_result(slot, ante, true)
        MP.event(lives_field({ t = 'skip', score = fmt.score(G.GAME.chips or 0),
          hands_left = math.min(1000, G.GAME.round_resets.hands or 0), skips = G.GAME.skips or 0 }))
        if MP.is_match() then report_furthest(slot, ante) end
        if MP.timer and MP.timer.input then MP.timer.input('skip') end
      end
      return r
    end, o('skip_blind'))
  end

  --- PvP: the pending pillar press, replayed after the countdown.
  if MP.pvp then
    function MP.pvp.select_original(e)
      F.bypass_ready = true
      local ok, err = pcall(G.FUNCS.select_blind, e)
      F.bypass_ready = false
      if not ok then MP.log('error', 'select_blind (PvP) failed: %s', tostring(err)) end
    end
  end

  wrap(_G, 'new_round', function(orig, ...)
    local st = MP.state
    st.round.token = st.round.token + 1
    st.round.ante_eased = nil
    if MP.pvp and MP.pvp.round_is_pvp() then
      st.pvp.first_draw_done = false
      st.pvp.ended = false
      st.pvp.waiting = false
    end
    return orig(...)
  end, o('new_round'))

  wrap(_G, 'end_round', function(orig, ...)
    if not F.before_end_round() then return end
    local raised = false
    if MP.is_match() and G.GAME.win_ante ~= F.SUPPRESSED_WIN_ANTE then
      F.saved_win_ante = G.GAME.win_ante
      G.GAME.win_ante = F.SUPPRESSED_WIN_ANTE   -- FL-13: no ante-8 victory in matches
      raised = true
    end
    local r = orig(...)
    if raised then
      -- Runs after end_round's own (blocking) event, i.e. after the win check.
      G.E_MANAGER:add_event(Event({ trigger = 'immediate', func = function()
        if G.GAME.win_ante == F.SUPPRESSED_WIN_ANTE then G.GAME.win_ante = F.saved_win_ante or 8 end
        return true
      end }))
    end
    return r
  end, o('end_round'))

  wrap(_G, 'ease_ante', function(orig, mod, ...)
    local st = MP.state
    if mod == 1 and st.round.ante_eased == st.round.token and MP.is_match() then
      MP.log('warn', 'flow: duplicate ease_ante(1) in one round ignored')
      return
    end
    if mod == 1 then st.round.ante_eased = st.round.token end
    local r = orig(mod, ...)
    G.E_MANAGER:add_event(Event({ trigger = 'immediate', func = function()
      local ante = G.GAME.round_resets.ante
      MP.event({ t = 'set_ante', ante = math.max(0, math.min(1000, ante)) })
      if (mod or 0) > 0 then
        MP.reset_pvp()                -- a new ante: Ready/start_blind/end_pvp flags start over
        local sess = MP.state.session
        local n = 0
        for _ in pairs((sess and sess.roster) or {}) do n = n + 1 end
        -- D-01: with rotating pairings, Ready waits for this ante's pairing.
        if sess and sess.shape.nemesis_pairing and n > 2 and (MP.state.pairing.ante or 0) < ante then
          MP.state.pairing_pending = true
        end
      end
      return true
    end }))
    return r
  end, o('ease_ante'))

  if rawget(_G, 'Game') then
    wrap(Game, 'update_game_over', function(orig, self, dt, ...)
      if MP.is_match() and not MP.state.result then
        if not F.game_over_logged then
          F.game_over_logged = true
          MP.log('warn', 'flow: vanilla game over reached in a match without a result; waiting for the referee')
          MP.event({ t = 'fail_round' })
        end
        return
      end
      return orig(self, dt, ...)
    end, o('game_over'))

    wrap(Game, 'update_blind_select', function(orig, self, dt, ...)
      if not G.STATE_COMPLETE and MP.pvp then
        MP.pvp.set_location(MP.state.pvp.ready and 'loc_ready' or 'loc_selecting')
      end
      return orig(self, dt, ...)
    end, o('loc_blind_select'))
  end
end

return F
