-- rmh_mp/replay/player.lua — the playback driver (REP-03/04/05; A3 §3 "Playback").
--
-- Plays one player's log (the POV) in a local session that is mounted exactly like the recorded
-- one (same kind, ruleset, roster, seed), with every outbound session message suppressed and
-- every live network input blocked (recorder.lua REP.BLOCK_OUT / BLOCK_LIVE). Inputs are
-- re-dispatched through the real G.FUNCS once the game is idle; recorded network inputs
-- (`net_in`) are re-injected through MP.net.receive, so referee outcomes and peer messages land
-- in the same order against the inputs as they did live. Nothing is recorded meanwhile.
--
-- Checks (divergence = playback stops with a clear error, never a crash):
--   * every card ref must resolve to a card with the same fingerprint;
--   * `dg` digests on select_blind / play / cashout / leave_shop must equal the live state;
--   * `hand_scored` / `hand_result` scores must equal the score the game reports on playback.
--
-- Pacing: recorded gaps ÷ speed (1, 2, 4); speed 0 = fast-forward (no pacing, game speed up).
-- Spectating feeds events as they arrive (`live`): no pacing, fast-forward while behind.
-- Seek: the index of blinds (ante/slot -> event index) comes from the log itself; seeking back
-- restarts the run and fast-forwards (the "dry run").
--
-- API (MP.replay.player):
--   open{ id, pov, live? }      start a session for that log (events come through feed)
--   feed(pov, events)           add events (any order, duplicates ignored)
--   speed(n) / seek(i) / close() / status() / seek_index()
--   PL.frame(dt)                per frame (MP.net frame hook)

local MP = require 'rmh_mp.state'
local REP = MP.replay or {}
MP.replay = REP
require 'rmh_mp.replay.recorder'

local PL = REP.player or {}
REP.player = PL

PL.INPUT = { select_blind = true, skip_blind = true, play = true, discard = true, cashout = true, reroll = true,
  leave_shop = true, buy = true, voucher = true, open_pack = true, use = true, pack_pick = true, pack_skip = true,
  sell = true, reorder = true }
PL.FF_GAMESPEED = 16
PL.BEHIND = 25          -- spectating: fast-forward while more than this many events are waiting
PL.STEP_BUDGET = 64     -- events executed per frame at most
PL.WAIT_LIMIT = 60      -- seconds an input may wait for its state before the playback is declared stuck

-- ── State ───────────────────────────────────────────────────────────────────

PL.s = PL.s or nil

local function new_session(opts)
  return {
    id = opts.id, pov = opts.pov, live = opts.live == true, events = {}, n = 0, pos = 0, speed = opts.speed or 1,
    state = 'loading', error = nil, mounted = false, run_started = false, last_t = 0, last_clock = REP.clock(),
    wait = nil, wait_since = nil, live_scores = {}, target = nil, inaccurate = false,
  }
end

function PL.status()
  local s = PL.s
  if not s then return nil end
  return { id = s.id, pov = s.pov, pos = s.pos, len = s.n, speed = s.speed, state = s.state, error = s.error,
    live = s.live, inaccurate = s.inaccurate }
end

local function diverge(s, ev, msg)
  s.state = 'diverged'
  s.error = { at = ev and ev.i or s.pos, op = ev and ev.op or '?', msg = tostring(msg) }
  MP.log('warn', 'replay: diverged at event %s (%s): %s', tostring(s.error.at), s.error.op, s.error.msg)
  PL.restore_speed()
  if PL.on_change then pcall(PL.on_change, s) end
end
PL.diverge = diverge

-- ── Feeding ─────────────────────────────────────────────────────────────────

--- Add events of `pov` (ignored unless it is the open session's POV). Returns the contiguous count.
function PL.feed(pov, events)
  local s = PL.s
  if not s or pov ~= s.pov then return 0 end
  for _, ev in ipairs(events or {}) do
    if type(ev) == 'table' and type(ev.i) == 'number' and ev.i >= 0 and ev.i % 1 == 0 and type(ev.op) == 'string' then
      if s.events[ev.i + 1] == nil then s.events[ev.i + 1] = ev end
    end
  end
  while s.events[s.n + 1] ~= nil do s.n = s.n + 1 end
  if s.state == 'loading' and s.n > 0 then s.state = 'running' end
  if PL.on_change then pcall(PL.on_change, s) end
  return s.n
end

-- ── Game helpers ────────────────────────────────────────────────────────────

--- The game takes input: nothing locked, the state's setup ran, no blocking event queued.
function PL.idle()
  if not (G and G.CONTROLLER and G.E_MANAGER) then return false end
  if G.CONTROLLER.locked then return false end
  for _, v in pairs(G.CONTROLLER.locks or {}) do if v then return false end end
  if G.STAGES and G.STAGE == G.STAGES.RUN and not G.STATE_COMPLETE then return false end
  return not MP.net.blocking_pending()
end

local function walk(node, pred, depth)
  if type(node) ~= 'table' or depth > 64 then return nil end
  if node.config and pred(node) then return node end
  for _, child in pairs(node.children or {}) do
    if type(child) == 'table' then
      local hit = walk(child, pred, depth + 1)
      if hit then return hit end
      local obj = child.config and child.config.object
      if type(obj) == 'table' and obj.UIRoot then
        hit = walk(obj.UIRoot, pred, depth + 1)
        if hit then return hit end
      end
    end
  end
  return nil
end

--- The live UI node whose button is `name` (inside `box` when given), or nil.
function PL.button(name, box)
  local function pred(n) return n.config.button == name end
  if box then return walk(box.UIRoot or box, pred, 0) end
  for _, list in pairs(G.I or {}) do
    if type(list) == 'table' then
      for _, obj in ipairs(list) do
        if type(obj) == 'table' and obj.UIRoot and not obj.REMOVED then
          local hit = walk(obj.UIRoot, pred, 0)
          if hit then return hit end
        end
      end
    end
  end
  return nil
end

--- Resolve refs against `area`: the same relative id with the same fingerprint, else the card
--- with that fingerprint nearest to the recorded position. nil, why on failure.
function PL.resolve(area, refs)
  local cards = (area and area.cards) or {}
  local used, out = {}, {}
  for n, ref in ipairs(refs or {}) do
    local hit
    for _, c in ipairs(cards) do
      if not used[c] and (c.sort_id or 0) - (REP.base_sort or 0) == ref.id and REP.fingerprint(c) == ref.k then hit = c end
    end
    out[n] = hit
    if hit then used[hit] = true end
  end
  for n, ref in ipairs(refs or {}) do
    if not out[n] then
      local best, dist
      for i, c in ipairs(cards) do
        if not used[c] and REP.fingerprint(c) == ref.k then
          local d = math.abs(i - (ref.i or i))
          if not best or d < dist then best, dist = c, d end
        end
      end
      if not best then return nil, 'no card ' .. tostring(ref.k) .. ' in ' .. tostring(REP.area_name(area)) end
      out[n] = best
      used[best] = true
    end
  end
  return out
end

local function one(area_name, ref)
  local area = REP.area(area_name)
  if not area then return nil, 'no area ' .. tostring(area_name) end
  local list, why = PL.resolve(area, { ref })
  if not list then return nil, why end
  return list[1]
end

local function highlight(cards)
  if not G.hand then return true end
  G.hand:unhighlight_all()
  for _, c in ipairs(cards) do G.hand:add_to_highlighted(c, true) end
  return #G.hand.highlighted == #cards
end

local function targets(d)
  if not d.targets or #d.targets == 0 then
    if G.hand then G.hand:unhighlight_all() end
    return true
  end
  local cards, why = PL.resolve(G.hand, d.targets)
  if not cards then return nil, why end
  if not highlight(cards) then return nil, 'could not highlight the targets' end
  return true
end

local function state_is(...) return MP.state_is(...) end

local PACK_STATES = { 'TAROT_PACK', 'PLANET_PACK', 'SPECTRAL_PACK', 'STANDARD_PACK', 'BUFFOON_PACK', 'SMODS_BOOSTER_OPENED' }
local function in_pack()
  for _, n in ipairs(PACK_STATES) do if G.STATES[n] and G.STATE == G.STATES[n] then return true end end
  return false
end

local function check_digest(ev)
  local want = ev.d and ev.d.dg
  if not want then return true end
  local got = REP.digest()
  if got ~= want then return nil, 'state differs: recorded ' .. want .. ' / now ' .. got end
  return true
end

-- ── Op handlers: return true | nil, why | 'wait' (not ready yet) ────────────

local OPS = {}
PL.OPS = OPS

local RC_NET = (REP.recorder and REP.recorder.NET_KINDS) or { outcome = true, peer = true, tail = true }

OPS.match_manifest = function() return true end
OPS.manifest = function(_, ev)
  if ev.d and ev.d.rejoin then
    PL.s.inaccurate = true
    return nil, 'the player reloaded mid-match; the rest of this log cannot be played back'
  end
  return true
end

OPS.lobby_info = function(s, ev)
  local info = MP.copy(ev.d or {}, true)
  if info.kind ~= 'match' and info.kind ~= 'practice' then return nil, 'unknown session kind ' .. tostring(info.kind) end
  info.perPlayer = nil
  REP.playing = true
  MP.session.mount(info.kind, info)
  local sess = MP.state.session
  sess.replay = { id = s.id, live = s.live }
  s.mounted = true
  return true
end

OPS.run_info = function(s, ev)
  if not s.mounted then return nil, 'run_info before lobby_info' end
  if s.run_started then return true end -- a reseed: the recorded outcome restarted the run already
  s.run_started = true
  MP.session.launch()
  s.wait = function() return state_is('BLIND_SELECT') and PL.idle() end
  return true
end

OPS.net_in = function(_, ev)
  local d = ev.d or {}
  if not RC_NET[d.k] then return true end
  REP.injecting = true
  local ok, err = pcall(MP.net.receive, d.k, d.d or {})
  REP.injecting = false
  if not ok then return nil, err end
  return true
end

OPS.reorder = function(_, ev)
  local area = REP.area(ev.d.area)
  if not area then return nil, 'no area ' .. tostring(ev.d.area) end
  local cards, why = PL.resolve(area, ev.d.cards)
  if not cards then return nil, why end
  local rest = {}
  local picked = {}
  for _, c in ipairs(cards) do picked[c] = true end
  for _, c in ipairs(area.cards) do if not picked[c] then rest[#rest + 1] = c end end
  for i = #area.cards, 1, -1 do area.cards[i] = nil end
  for _, c in ipairs(cards) do area.cards[#area.cards + 1] = c end
  for _, c in ipairs(rest) do area.cards[#area.cards + 1] = c end
  if area.set_ranks then area:set_ranks() end
  if area.align_cards then area:align_cards() end
  return true
end

local function blind_box(slot)
  return G.blind_select_opts and slot and G.blind_select_opts[string.lower(slot)]
end

OPS.select_blind = function(s, ev)
  if not (state_is('BLIND_SELECT') and G.blind_select) then return 'wait' end
  if G.GAME.blind_on_deck ~= ev.d.slot then return nil, 'blind on deck is ' .. tostring(G.GAME.blind_on_deck) end
  local ok, why = check_digest(ev)
  if not ok then return nil, why end
  local node = PL.button('select_blind', blind_box(ev.d.slot))
  if not node then
    local blind = ev.d.key and G.P_BLINDS[ev.d.key]
    if not blind then return 'wait' end
    node = { config = { ref_table = blind } }
  end
  G.FUNCS.select_blind(node)
  return true
end

OPS.skip_blind = function(_, ev)
  if not (state_is('BLIND_SELECT') and G.blind_select) then return 'wait' end
  local node = PL.button('skip_blind', blind_box(ev.d.slot))
  if not node then
    if G.I then return 'wait' end -- the real game: the button appears with the blind choices
    node = { config = {} }
  end
  G.FUNCS.skip_blind(node)
  local before = ev.d.slot
  PL.s.wait = function() return G.GAME.blind_on_deck ~= before and PL.idle() end
  return true
end

local function hand_op(fn_name)
  return function(_, ev)
    if not state_is('SELECTING_HAND') then return 'wait' end
    if fn_name == 'play_cards_from_highlighted' then
      local ok, why = check_digest(ev)
      if not ok then return nil, why end
    end
    local cards, why = PL.resolve(G.hand, ev.d.cards)
    if not cards then return nil, why end
    if not highlight(cards) then return nil, 'could not highlight ' .. #cards .. ' cards' end
    G.FUNCS[fn_name]()
    return true
  end
end
OPS.play = hand_op('play_cards_from_highlighted')
OPS.discard = hand_op('discard_cards_from_highlighted')

OPS.cashout = function(_, ev)
  if not state_is('ROUND_EVAL') then return 'wait' end
  local node = G.round_eval and PL.button('cash_out')
  if not node then
    if G.I or not G.round_eval then return 'wait' end -- the real game: wait for the button
    node = { config = {} }
  end
  local ok, why = check_digest(ev)
  if not ok then return nil, why end
  G.FUNCS.cash_out(node)
  return true
end

local function in_shop() return state_is('SHOP') and G.shop ~= nil end

OPS.reroll = function()
  if not in_shop() then return 'wait' end
  G.FUNCS.reroll_shop(PL.button('reroll_shop', G.shop) or { config = {} })
  return true
end

OPS.leave_shop = function(_, ev)
  if not in_shop() then return 'wait' end
  local ok, why = check_digest(ev)
  if not ok then return nil, why end
  G.FUNCS.toggle_shop(PL.button('toggle_shop', G.shop) or { config = {} })
  return true
end

OPS.buy = function(_, ev)
  if not in_shop() then return 'wait' end
  local card, why = one(ev.d.area or 'shop_jokers', ev.d.ref)
  if not card then return nil, why end
  G.FUNCS.buy_from_shop({ config = { ref_table = card, id = ev.d.id } })
  return true
end

local function use_from(area_name, need)
  return function(_, ev)
    if need and not need() then return 'wait' end
    local card, why = one(area_name or ev.d.area, ev.d.ref)
    if not card then return nil, why end
    if area_name == nil or area_name == 'pack_cards' then
      local ok, terr = targets(ev.d)
      if not ok then return nil, terr end
    end
    G.FUNCS.use_card({ config = { ref_table = card } })
    return true
  end
end
OPS.voucher = use_from('shop_vouchers', in_shop)
OPS.open_pack = use_from('shop_booster', in_shop)
OPS.pack_pick = use_from('pack_cards', function() return in_pack() and G.pack_cards ~= nil end)
OPS.use = function(s, ev)
  local area = ev.d.area or 'consumeables'
  return use_from(nil)(s, { d = { area = area, ref = ev.d.ref, targets = ev.d.targets } })
end

OPS.pack_skip = function()
  if not in_pack() then return 'wait' end
  G.FUNCS.skip_booster(PL.button('skip_booster') or { config = {} })
  return true
end

OPS.sell = function(_, ev)
  local card, why = one(ev.d.area or 'jokers', ev.d.ref)
  if not card then return nil, why end
  G.FUNCS.sell_card({ config = { ref_table = card } })
  return true
end

local function check_score(s, ev)
  local want = ev.d and ev.d.score
  if want == nil then return true end
  local got = table.remove(s.live_scores, 1)
  if got == nil then return 'wait' end
  if tostring(got) ~= tostring(want) then return nil, 'hand scored ' .. tostring(got) .. ', recorded ' .. tostring(want) end
  return true
end
OPS.hand_scored = check_score
OPS.hand_result = check_score

OPS['end'] = function(s)
  s.state = 'done'
  PL.restore_speed()
  return true
end

-- Informational ops: nothing to re-dispatch.
for _, op in ipairs({ 'ready_blind', 'set_ante_key', 'life_lost', 'net_pizza', 'net_magnet', 'net_trap', 'money_delta',
  'round_dollars', 'chk' }) do
  OPS[op] = function() return true end
end

-- ── Hooks from the recorder ─────────────────────────────────────────────────

--- During playback the recorder hands every MP.replay_hook call here.
function PL.on_hook(kind, data)
  local s = PL.s
  if not s then return end
  if kind == 'event' and type(data) == 'table' and data.t == 'play_hand' then
    s.live_scores[#s.live_scores + 1] = data.score
  end
end

function PL.on_run_started() end

-- ── Speed ───────────────────────────────────────────────────────────────────

function PL.restore_speed()
  if PL.saved_gamespeed and G and G.SETTINGS then
    G.SETTINGS.GAMESPEED = PL.saved_gamespeed
    PL.saved_gamespeed = nil
  end
end

local function set_ff(on)
  if not (G and G.SETTINGS) then return end
  if on then
    if not PL.saved_gamespeed then PL.saved_gamespeed = G.SETTINGS.GAMESPEED or 1 end
    G.SETTINGS.GAMESPEED = PL.FF_GAMESPEED
  else
    PL.restore_speed()
  end
end

--- speed 1/2/4 (paced) or 0 (fast-forward).
function PL.speed(n)
  local s = PL.s
  n = tonumber(n) or 1
  if n ~= 0 and n ~= 1 and n ~= 2 and n ~= 4 then n = 1 end
  if s then s.speed = n end
  set_ff(n == 0)
  if s and PL.on_change then pcall(PL.on_change, s) end
  return n
end

-- ── Open / close / seek ─────────────────────────────────────────────────────

function PL.open(opts)
  if PL.s then PL.close(true) end
  if MP.state.session and not (MP.state.session.replay) then
    MP.log('warn', 'replay: a session is running; playback refused')
    return false
  end
  PL.s = new_session(opts or {})
  REP.playing = true
  PL.speed(PL.s.speed)
  if PL.on_change then pcall(PL.on_change, PL.s) end
  return true
end

--- Stop playback and leave the run. `quiet` skips the menu (reopening another log).
function PL.close(quiet)
  local s = PL.s
  PL.s = nil
  PL.restore_speed()
  if s and s.mounted and MP.state.session and MP.state.session.replay then
    if not quiet and G.FUNCS and G.FUNCS.go_to_menu and G.STAGES and G.STAGE == G.STAGES.RUN then
      pcall(G.FUNCS.go_to_menu)
    else
      MP.session.unmount('replay')
    end
  end
  -- REP.playing drops once the session is gone (frame), so the go_to_menu unmount is still covered.
  if not (MP.state.session and MP.state.session.replay) then REP.playing = false end
  if PL.on_change then pcall(PL.on_change, nil) end
  return true
end

--- The blinds in the log: { {pos, ante, slot} } in order (from the select_blind digests).
function PL.seek_index()
  local s = PL.s
  local out = {}
  if not s then return out end
  for i = 1, s.n do
    local ev = s.events[i]
    if ev.op == 'select_blind' then
      local ante = tonumber(tostring(ev.d and ev.d.dg or ''):match('^a(%-?%d+)')) or 0
      out[#out + 1] = { pos = i - 1, ante = ante, slot = ev.d.slot }
    end
  end
  return out
end

--- Seek to event position `pos` (0-based count of executed events). Back = restart + fast-forward.
function PL.seek(pos)
  local s = PL.s
  if not s then return false end
  pos = math.max(0, math.min(tonumber(pos) or 0, s.n))
  if pos < s.pos then
    local keep = { id = s.id, pov = s.pov, live = s.live, speed = s.speed, events = s.events, n = s.n }
    PL.close(true)
    PL.s = new_session(keep)
    PL.s.events, PL.s.n, PL.s.state = keep.events, keep.n, keep.n > 0 and 'running' or 'loading'
    REP.playing = true
  end
  PL.s.seek_to = pos
  set_ff(true)
  return true
end

-- ── The driver ──────────────────────────────────────────────────────────────

local function paced(s, ev)
  if s.seek_to or s.speed == 0 then return true end
  if s.live then return true end
  local gap = math.max(0, (ev.t or 0) - (s.last_t or 0)) / 1000 / s.speed
  return REP.clock() - s.last_clock >= math.min(gap, 10)
end

--- Execute the next event if it may run now. Returns true when one ran.
function PL.step()
  local s = PL.s
  if not s or s.state ~= 'running' then return false end
  if s.wait then
    local ok, ready = pcall(s.wait)
    if not ok or not ready then
      s.wait_since = s.wait_since or REP.clock()
      if REP.clock() - s.wait_since > PL.WAIT_LIMIT then diverge(s, s.events[s.pos + 1], 'the game never settled') end
      return false
    end
    s.wait, s.wait_since = nil, nil
  end
  local ev = s.events[s.pos + 1]
  if not ev or s.pos >= s.n then return false end
  if not paced(s, ev) then return false end
  if PL.INPUT[ev.op] and not PL.idle() then return false end
  local fn = OPS[ev.op]
  if not fn then
    diverge(s, ev, 'unknown op')
    return false
  end
  local ok, r, why = pcall(fn, s, ev)
  if not ok then
    diverge(s, ev, r)
    return false
  end
  if r == 'wait' then
    s.wait_since = s.wait_since or REP.clock()
    if REP.clock() - s.wait_since > PL.WAIT_LIMIT then diverge(s, ev, 'the game never reached the state for ' .. ev.op) end
    return false
  end
  s.wait_since = nil
  if r == nil then
    diverge(s, ev, why)
    return false
  end
  s.pos = s.pos + 1
  s.last_t = ev.t or s.last_t
  s.last_clock = REP.clock()
  if s.seek_to and s.pos >= s.seek_to then
    s.seek_to = nil
    set_ff(s.speed == 0)
  end
  if s.state == 'running' and s.live then set_ff(s.n - s.pos > PL.BEHIND) end
  return true
end

function PL.frame()
  local s = PL.s
  if not s then
    -- The played-back session is gone (menu): playback is over.
    if REP.playing and not (MP.state.session and MP.state.session.replay) then REP.playing = false end
    return
  end
  if s.mounted and not MP.state.session then
    PL.s = nil
    REP.playing = false
    PL.restore_speed()
    if PL.on_change then pcall(PL.on_change, nil) end
    return
  end
  local budget = (s.speed == 0 or s.seek_to or (s.live and s.n - s.pos > PL.BEHIND)) and PL.STEP_BUDGET or 4
  for _ = 1, budget do
    if not PL.step() then break end
  end
end

MP.net.add_frame_hook(PL.frame)

return PL
