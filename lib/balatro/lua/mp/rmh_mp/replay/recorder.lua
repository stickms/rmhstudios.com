-- rmh_mp/replay/recorder.lua — the replay input log (REP-01, D-34; PLAN §3.c `log`).
--
-- While a match or practice session is mounted (and nothing is being played back), every input
-- the player makes and every network input Lua applies is appended to this player's log and sent
-- to TS in `log {batch}` messages (≤ 50 events / ~12 KB per frame; what is not sent yet stays
-- queued). TS keeps the log, relays it to the other peers through the host, stores the match in
-- IndexedDB and adds the `chk` hash at the end (lib/balatro/mp/replay/*).
--
-- Event = { i = index (0-based, per player), t = ms since the session started, op, d }.
-- Ops and payloads (WS13 owns the shapes; the player re-dispatches them through the real
-- G.FUNCS, replay/player.lua):
--   match_manifest {schema, runId, kind, me}             first event of a session
--   lobby_info     {kind, me, hostId, runId, resolved, options, shape, roster, queueMode, ruleset,
--                   contentHash, seed, deck, stake, mpStake, challenge}   what MP.session.mount needs
--   run_info       {seed, deck, stake, challenge}       every fresh Game:start_run (a reseed adds one)
--   manifest       {rejoin = true}                      the run was restored from a snapshot
--   select_blind   {slot, key, dg}    skip_blind {slot}
--   play / discard {cards = [ref], dg?}                 reorder {area, cards = [ref]} before them
--   cashout {dg}   reroll {cost}      leave_shop {dg}
--   buy {ref, id?} voucher {ref}      open_pack {ref}   use {area, ref, targets}
--   pack_pick {ref, targets}          pack_skip {}      sell {area, ref}
--   net_in {k = 'outcome'|'peer'|'tail', d}             a network input exactly as Lua received it
--   hand_scored / hand_result {score, hands_left}       the game's own report after a hand (checked)
--   ready_blind {} set_ante_key {key} life_lost {lives} net_pizza {n} net_trap {...}  (informational)
--   end {result}
-- A card ref is { id = sort_id - the run's base sort_id, i = position in its area, k = fingerprint }.
-- `dg` is MP.replay.digest(): the state the input acted on, compared again on playback.
--
-- Caps (D-34): 20 000 events or 1 MB of encoded events per player per match. At the cap the log
-- stops with `end {result = 'cap'}`.

local MP = require 'rmh_mp.state'

local REP = MP.replay or {}
MP.replay = REP

local RC = REP.recorder or {}
REP.recorder = RC

RC.SCHEMA = 1
RC.LIMIT_EVENTS = 20000
RC.LIMIT_BYTES = 1024 * 1024
RC.BATCH_MAX = 50
RC.BATCH_BYTES = 12 * 1024
RC.NET_KINDS = { outcome = true, peer = true, tail = true }

-- ── Clock, cards, digest ────────────────────────────────────────────────────

function REP.clock()
  local l = rawget(_G, 'love')
  if l and l.timer and l.timer.getTime then return l.timer.getTime() end
  return os.clock()
end

--- The run's base sort id (G.sort_id when the run started): card ids are relative to it.
REP.base_sort = REP.base_sort or 0

local AREAS = { 'hand', 'jokers', 'consumeables', 'shop_jokers', 'shop_vouchers', 'shop_booster', 'pack_cards', 'deck',
  'play', 'discard' }
REP.AREAS = AREAS

function REP.area(name)
  if not (G and name) then return nil end
  for _, n in ipairs(AREAS) do if n == name then return G[n] end end
  return nil
end

function REP.area_name(area)
  if not (G and area) then return nil end
  for _, n in ipairs(AREAS) do if G[n] == area then return n end end
  return nil
end

--- A short identity of what a card is (center key, plus suit/rank and edition for playing cards).
function REP.fingerprint(card)
  local c = card and card.config and card.config.center
  local k = (c and c.key) or '?'
  local b = card and card.base
  if b and b.suit and b.value and card.ability and (card.ability.set == 'Default' or card.ability.set == 'Enhanced') then
    k = k .. '|' .. tostring(b.suit) .. ':' .. tostring(b.value)
  end
  return k
end

function REP.ref(card)
  local i = 0
  if card and card.area and card.area.cards then
    for n, c in ipairs(card.area.cards) do if c == card then i = n end end
  end
  return { id = (card and card.sort_id or 0) - (REP.base_sort or 0), i = i, k = REP.fingerprint(card) }
end

function REP.refs(cards)
  local out = {}
  for _, c in ipairs(cards or {}) do out[#out + 1] = REP.ref(c) end
  return MP.json_array(out)
end

local function keys_of(area)
  local out = {}
  for _, c in ipairs((area and area.cards) or {}) do out[#out + 1] = REP.fingerprint(c) end
  return table.concat(out, ',')
end

--- The state an input acts on, as a short string (equal on recording and playback when the run
--- has not diverged). Only values that are settled while the game waits for input.
function REP.digest()
  local g = G and G.GAME
  if not g then return '' end
  local rr = g.round_resets or {}
  local cr = g.current_round or {}
  return table.concat({
    'a' .. tostring(rr.ante or 0), 'r' .. tostring(g.round or 0), '$' .. tostring(g.dollars or 0),
    'h' .. tostring(cr.hands_left or 0), 'd' .. tostring(cr.discards_left or 0),
    'D' .. tostring(#(G.playing_cards or {})), 'J' .. keys_of(G.jokers), 'C' .. keys_of(G.consumeables),
  }, ';')
end

-- ── The log ─────────────────────────────────────────────────────────────────

local function reset()
  RC.active = false
  RC.i = 0
  RC.bytes = 0
  RC.pending = {}
  RC.full = false
  RC.ended = false
  RC.t0 = REP.clock()
  RC.order = {}
  RC.result_seen = nil
end
if RC.i == nil then reset() end
RC.reset = reset

local function encode_len(ev)
  local ok, s = pcall(MP.json.encode, ev)
  if ok and type(s) == 'string' then return #s end
  return 256
end

--- Append one event (no-op unless recording). Returns the event or nil.
function RC.record(op, d)
  if not RC.active or RC.full then return nil end
  local ev = { i = RC.i, t = math.max(0, math.floor((REP.clock() - RC.t0) * 1000)), op = op, d = d or {} }
  local n = encode_len(ev)
  if RC.i + 1 >= RC.LIMIT_EVENTS or RC.bytes + n + 64 > RC.LIMIT_BYTES then
    RC.full = true
    local e = { i = RC.i, t = ev.t, op = 'end', d = { result = 'cap' } }
    RC.pending[#RC.pending + 1] = e
    RC.i = RC.i + 1
    MP.log('warn', 'replay: log cap reached after %d events', RC.i)
    return nil
  end
  RC.i = RC.i + 1
  RC.bytes = RC.bytes + n
  ev.n = n
  RC.pending[#RC.pending + 1] = ev
  return ev
end

--- Send what is pending: one batch of ≤ BATCH_MAX events / ~BATCH_BYTES per call.
function RC.flush()
  if #RC.pending == 0 or REP.playing then return 0 end
  if MP.net.transport_is_live and not MP.net.transport_is_live() then return 0 end
  local batch, bytes = {}, 0
  while RC.pending[1] and #batch < RC.BATCH_MAX do
    local ev = RC.pending[1]
    local n = ev.n or 256
    if #batch > 0 and bytes + n > RC.BATCH_BYTES then break end
    table.remove(RC.pending, 1)
    batch[#batch + 1] = { i = ev.i, t = ev.t, op = ev.op, d = ev.d }
    bytes = bytes + n
  end
  if not MP.net.send('log', { batch = MP.json_array(batch) }) then
    -- Refused (should not happen): keep the order, retry next frame.
    for k = #batch, 1, -1 do table.insert(RC.pending, 1, batch[k]) end
    return 0
  end
  return #batch
end

-- ── Session info ────────────────────────────────────────────────────────────

local function shape_out(sh)
  sh = sh or {}
  return { nemesisPairing = sh.nemesis_pairing == true, manhunt = sh.manhunt == true, teamBased = sh.team_based == true,
    practice = sh.practice == true }
end

--- What MP.session.mount needs to mount this session again (lobby_info).
function RC.lobby_info(sess)
  local roster = {}
  local ids = {}
  for id in pairs(sess.roster or {}) do ids[#ids + 1] = id end
  table.sort(ids)
  for _, id in ipairs(ids) do
    local r = sess.roster[id]
    roster[#roster + 1] = { id = id, name = r.name, team = r.team, blindCol = r.blindCol, avatarJoker = r.avatarJoker }
  end
  return {
    kind = sess.kind, me = sess.me, hostId = sess.hostId, runId = sess.runId, resolved = sess.resolved,
    options = sess.options, shape = shape_out(sess.shape), roster = MP.json_array(roster), queueMode = sess.queueMode,
    ruleset = sess.ruleset, contentHash = sess.contentHash, seed = sess.seed, deck = sess.deck, stake = sess.stake,
    mpStake = sess.mpStake, challenge = sess.challenge,
  }
end

--- Start a fresh log for the mounted session (called by the session installer).
function RC.begin(sess)
  reset()
  if not sess or (sess.kind ~= 'match' and sess.kind ~= 'practice') then return false end
  RC.active = true
  RC.record('match_manifest', { schema = RC.SCHEMA, runId = sess.runId, kind = sess.kind, me = sess.me })
  RC.record('lobby_info', RC.lobby_info(sess))
  return true
end

--- Stop recording; `result` closes the log with `end`.
function RC.finish(result)
  if RC.active and not RC.ended then
    RC.ended = true
    RC.record('end', { result = result or 'left' })
  end
  RC.active = false
end

-- ── Reorders ────────────────────────────────────────────────────────────────

local function order_key(area)
  local ids = {}
  for _, c in ipairs((area and area.cards) or {}) do ids[#ids + 1] = tostring(c.sort_id) end
  return table.concat(ids, ',')
end

--- Record the order of `name`'s cards when it changed since the last recorded one.
function RC.note_order(name)
  local area = REP.area(name)
  if not area then return end
  local key = order_key(area)
  if RC.order[name] == key then return end
  RC.order[name] = key
  RC.record('reorder', { area = name, cards = REP.refs(area.cards) })
end

local function note_orders()
  RC.note_order('hand')
  RC.note_order('jokers')
  RC.note_order('consumeables')
end

-- ── Hooks (installed at every mount, session group) ─────────────────────────

local function rec_on()
  return RC.active and not REP.playing
end

local function card_of(e)
  return e and e.config and e.config.ref_table
end

function RC.install()
  local sess = MP.state.session
  if REP.playing then
    reset()
  else
    RC.begin(sess)
  end
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'replay.' .. id } end

  if rawget(_G, 'Game') then
    wrap(Game, 'start_run', function(orig, self, args, ...)
      args = args or {}
      REP.base_sort = (G and G.sort_id) or 0
      RC.order = { hand = '', jokers = '', consumeables = '' }
      local r = orig(self, args, ...)
      if rec_on() then
        if args.savetext then
          RC.record('manifest', { rejoin = true })
        else
          local s = MP.state.session or {}
          local g = G.GAME or {}
          RC.record('run_info', { seed = (g.pseudorandom and g.pseudorandom.seed) or s.seed, deck = s.deck,
            stake = s.stake, challenge = s.challenge })
        end
      end
      if REP.player and REP.player.on_run_started then pcall(REP.player.on_run_started, args) end
      return r
    end, o('start_run'))
  end

  local F = G and G.FUNCS
  if F then
    local function input(name, op, build)
      if not F[name] then return end
      wrap(F, name, function(orig, e, ...)
        if rec_on() then
          local ok, err = pcall(function()
            local d, before = build(e)
            if d == false then return end
            if before then before() end
            RC.record(op, d or {})
          end)
          if not ok then MP.log('error', 'replay: recording %s failed: %s', op, tostring(err)) end
        end
        return orig(e, ...)
      end, o(name))
    end

    input('select_blind', 'select_blind', function(e)
      -- After start_blind the PvP pillar re-presses select_blind itself: not an input.
      if MP.state.pvp and MP.state.pvp.started then return false end
      local blind = card_of(e)
      return { slot = G.GAME.blind_on_deck or 'Small', key = blind and blind.key, dg = REP.digest() }, note_orders
    end)
    input('skip_blind', 'skip_blind', function() return { slot = G.GAME.blind_on_deck or 'Small' } end)
    input('play_cards_from_highlighted', 'play', function()
      return { cards = REP.refs(G.hand and G.hand.highlighted), dg = REP.digest() }, note_orders
    end)
    input('discard_cards_from_highlighted', 'discard', function()
      return { cards = REP.refs(G.hand and G.hand.highlighted) }, note_orders
    end)
    input('cash_out', 'cashout', function() return { dg = REP.digest() } end)
    input('reroll_shop', 'reroll', function()
      return { cost = (G.GAME.current_round and G.GAME.current_round.reroll_cost) or 0 }
    end)
    input('toggle_shop', 'leave_shop', function()
      if not G.shop then return false end
      return { dg = REP.digest() }
    end)
    input('buy_from_shop', 'buy', function(e)
      local card = card_of(e)
      if not card then return false end
      return { ref = REP.ref(card), area = REP.area_name(card.area), id = e.config.id }
    end)
    input('sell_card', 'sell', function(e)
      local card = card_of(e)
      if not card then return false end
      return { ref = REP.ref(card), area = REP.area_name(card.area) }, note_orders
    end)
    input('skip_booster', 'pack_skip', function() return {} end)

    -- use_card is several inputs: redeem a voucher, open a booster, pick from a pack, use a consumable.
    if F.use_card then
      wrap(F, 'use_card', function(orig, e, ...)
        if rec_on() then
          local ok, err = pcall(function()
            local card = card_of(e)
            if not card then return end
            local area = card.area
            if area and area == G.shop_vouchers then
              RC.record('voucher', { ref = REP.ref(card) })
            elseif area and area == G.shop_booster then
              RC.record('open_pack', { ref = REP.ref(card) })
            elseif area and area == G.pack_cards then
              note_orders()
              RC.record('pack_pick', { ref = REP.ref(card), targets = REP.refs(G.hand and G.hand.highlighted) })
            else
              note_orders()
              RC.record('use', { area = REP.area_name(area), ref = REP.ref(card),
                targets = REP.refs(G.hand and G.hand.highlighted) })
            end
          end)
          if not ok then MP.log('error', 'replay: recording use_card failed: %s', tostring(err)) end
        end
        return orig(e, ...)
      end, o('use_card'))
    end
  end

  -- Network inputs, recorded before they apply (their order against the inputs is the log's).
  -- While a replay or a spectated match plays, only the player's own injections get through.
  wrap(MP.net, 'receive', function(orig, t, d, msg)
    if REP.playing and not REP.injecting then
      -- A real session starting ends the playback (quietly: no menu round trip).
      if (t == 'match_start' or t == 'practice_start') and REP.player and REP.player.s then REP.player.close(true) end
      if REP.BLOCK_LIVE[t] and REP.playing then return false end
    end
    if rec_on() and RC.NET_KINDS[t] then RC.record('net_in', { k = t, d = d }) end
    return orig(t, d, msg)
  end, o('net_receive'))

  -- Nothing a played-back session does reaches the network (or the lobby: match_left).
  wrap(MP.net, 'send', function(orig, t, d)
    if REP.playing and REP.BLOCK_OUT[t] then return true end
    return orig(t, d)
  end, o('net_send'))
end

--- Live traffic a playback must not apply (it re-applies the recorded copies instead).
REP.BLOCK_LIVE = { outcome = true, peer = true, tail = true, rejoin_restore = true, timer_state = true, timer_cue = true,
  end_data = true, presence = true }
--- Session traffic a playback does not send.
REP.BLOCK_OUT = { ev = true, peer = true, flags = true, timer_input = true, snapshot = true, log = true,
  match_left = true, deck_res_local = true, stats_local = true }

--- MP.replay_hook(kind, data): the core and the content streams report here (net.lua MP.event,
--- flow.lua ante keys, Pizza, traps).
function REP.hook(kind, data)
  if REP.playing then
    if REP.player and REP.player.on_hook then REP.player.on_hook(kind, data) end
    return
  end
  if not rec_on() then return end
  if kind == 'event' and type(data) == 'table' then
    local e = data
    if e.t == 'play_hand' then
      local op = (MP.state.pvp and MP.state.pvp.active) and 'hand_result' or 'hand_scored'
      RC.record(op, { score = e.score, hands_left = e.hands_left })
    elseif e.t == 'ready_blind' then
      RC.record('ready_blind', {})
    end
  elseif kind == 'set_ante_key' then
    RC.record('set_ante_key', { key = tostring(data) })
  elseif kind == 'pizza' then
    RC.record('net_pizza', { n = tonumber(data) or 0 })
  elseif kind == 'net_trap' and type(data) == 'table' then
    RC.record('net_trap', { key = data.key, uid = data.uid, owner = data.owner, side = data.side })
  end
end
MP.replay_hook = REP.hook

--- Per frame: notice the result and lives, send one batch.
function RC.frame()
  if RC.active and not REP.playing then
    local res = MP.state.result
    if res and res.kind ~= 'pending' and RC.result_seen ~= res.kind then
      RC.result_seen = res.kind
      RC.finish(res.kind)
    end
  end
  RC.flush()
end

if MP.report and MP.report.on and not RC._observers then
  RC._observers = true
  MP.report.on('player_lives', function(o)
    local me = MP.state.session and MP.state.session.me
    if rec_on() and me and (o.player_id == me or o.player_id == '*all*') and o.lost then
      RC.record('life_lost', { lives = o.lives })
    end
  end)
end

if MP.session and MP.session.add_installer then MP.session.add_installer(RC.install) end

-- A session that ends without a result (left, menu, new run) closes its log too.
if MP.session and MP.session.unmount then
  MP.hooks.wrap(MP.session, 'unmount', function(orig, ...)
    if RC.active then
      local res = MP.state.result
      RC.finish(res and res.kind ~= 'pending' and res.kind or 'left')
    end
    return orig(...)
  end, { id = 'replay.unmount' })
end
MP.net.add_frame_hook(RC.frame)

return RC
