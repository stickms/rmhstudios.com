-- mp_test/autopilot.lua — the TEST-ONLY driver that plays Balatro deterministically
-- (PLAN §4 WS14; wave-1 skeleton, WS14b grows it).
--
-- NEVER ACTIVE IN PRODUCTION. This file is in no shipped pack. It reaches the
-- engine two ways only, both test-only:
--   1. the engine-spec harness page (testing/balatro-e2e/engine) writes it into
--      the virtual FS and requires it through mp_test/harness.lua;
--   2. a test build (VITE_BALATRO_MP_TEST=1) — lib/balatro/mp/test-hooks.ts
--      writes it to /Balatro/rmh_mp_test/ plus the marker /rmh/test/enabled.
-- AP.install() refuses to run without that marker, so even a stray copy is inert.
--
-- Commands (AP.run(cmd, args) inside a task, or test_cmd {id, cmd, args} over the
-- mailbox / the harness channel; each answers test_res {id, ok, data}):
--   state()                                  a snapshot (state name, ante, money, hand, shop …)
--   wait_state(name, seconds?)               until G.STATE is STATES[name] and the game is idle
--   wait_idle(seconds?)
--   speed(n)                                 game speed (default 4) + reduced motion
--   prepare()                                speed 4, reduced motion, tutorial treated as done
--   start_run{seed, stake?, deck?}           from anywhere: a fresh seeded run, at BLIND_SELECT
--   select_blind() / skip_blind()            the blind on deck
--   play(indices | 'best') / discard(indices)  1-based hand positions
--   set_chips(n) / win_blind()               win_blind: chips to target, play one card, to ROUND_EVAL
--   cash_out()                               ROUND_EVAL → SHOP
--   shop_digest()                            canonical text of the shop (determinism checks)
--   set_ante(n)                              fast-forward to ante n at blind select
--   save_info()                              the profile's save.jkr: {exists, size, hash}
--   profile_digest()                         unlocked / discovered center keys (pool inputs)
--   buy(slot, area?)                         area 'jokers' (default) | 'vouchers'
--   reroll() / open_pack(slot) / pick(i) / skip_pack() / leave_shop()
--   use(slot, targets?)                      a consumable in G.consumeables on hand targets
--   give(key)                                a joker / consumable straight into its area (no RNG draws)
--   ready / unready / timer_press / pause_menu(op) / forfeit / vote(kind)
--                                            MP UI actions: delegated to MP.test (WS10/WS11/WS14b);
--                                            'mp-unavailable' until those exist
--   mp{fn, args}                             any MP.test.<fn>(args) (ui, ui_state, draft, hud …)
--   mp_open{intent?}                         MP.open(intent): the MP menu, as the MULTIPLAYER button
--   pvp_ready / pvp_play{chips?, hands?, best?} / pvp_wait_end / pvp_round{…} / mp_ante{…} / mp_state
--                                            whole PvP rounds and antes of a match (e2e)
--   mp_send{t, d}                            a ui_* message to the session, as a screen sends it
--   mp_leave{how?}                           leave as a player does (end screen / forfeit / ui_leave)
--   mp_notice{i, name?}                      press button i of the open notice (Rejoin, Reconnect …)
--   mp_inbox{t?, since?}                     the session→Lua messages received (tapped at mp_open)
-- More commands: AP.register(name, fn(args) -> data) (fn runs inside a task).

local sched = require('rmh_mp_test.sched')

local AP = { version = 1, commands = {}, sched = sched, installed = false }

AP.MARKER = '/rmh/test/enabled'
-- Seconds a step may take by default. Software-rendered CI pages run a few frames
-- a second under load; explicit per-call timeouts override it.
AP.default_wait = 120

local function file_exists(path)
  local f = io.open(path, 'r')
  if f then f:close() return true end
  return false
end

--- True only when the page that loaded this file is a test build/harness.
function AP.enabled()
  return file_exists(AP.MARKER)
end

-- ── game helpers ─────────────────────────────────────────────────────────────

function AP.state_name(st)
  if not (G and G.STATES) then return nil end
  st = st or G.STATE
  for k, v in pairs(G.STATES) do
    if v == st then return k end
  end
  return tostring(st)
end

--- The game takes input: no controller lock, the state's setup ran, no blocking
-- event queued in the base queue.
function AP.idle()
  if not (G and G.CONTROLLER and G.E_MANAGER) then return false end
  if G.CONTROLLER.locked then return false end
  for _, v in pairs(G.CONTROLLER.locks or {}) do
    if v then return false end
  end
  if G.STAGE == (G.STAGES and G.STAGES.RUN) and not G.STATE_COMPLETE then return false end
  local q = G.E_MANAGER.queues and G.E_MANAGER.queues.base
  if q then
    for _, ev in ipairs(q) do
      if ev.blocking then return false end
    end
  end
  return true
end

local function wait(pred, seconds, why)
  return sched.wait_until(pred, seconds or AP.default_wait, why)
end

function AP.wait_idle(seconds)
  wait(AP.idle, seconds, 'game idle')
  return true
end

function AP.wait_state(name, seconds)
  if not G.STATES[name] then error('unknown state ' .. tostring(name)) end
  wait(function()
    return G.STATE == G.STATES[name] and AP.idle()
  end, seconds, 'state ' .. name .. ' (now ' .. tostring(AP.state_name()) .. ')')
  return AP.state_name()
end

--- Depth-first search of a UIBox (and UIBoxes held as node objects) for the
-- first node pred(node) accepts.
function AP.find_node(box, pred)
  if not box then return nil end
  local function walk(node, depth)
    if not node or depth > 64 then return nil end
    if node.config and pred(node) then return node end
    for _, child in pairs(node.children or {}) do
      if type(child) == 'table' then
        local hit = walk(child, depth + 1)
        if hit then return hit end
        local obj = child.config and child.config.object
        if type(obj) == 'table' and obj.UIRoot then
          hit = walk(obj.UIRoot, depth + 1)
          if hit then return hit end
        end
      end
    end
    return nil
  end
  return walk(box.UIRoot or box, 0)
end

--- The enabled button (config.button == name) in a UIBox, or nil.
function AP.button(box, name)
  return AP.find_node(box, function(n) return n.config.button == name end)
end

--- The first live UIBox anywhere in the game (G.I registries) holding an enabled
-- button `name`. Some buttons sit in their own UIBox aligned to another one (the
-- cash-out button's major is G.round_eval), so walking one tree is not enough.
function AP.any_button(name)
  for _, list in pairs(G.I or {}) do
    if type(list) == 'table' then
      for _, obj in ipairs(list) do
        if type(obj) == 'table' and obj.UIRoot and not obj.REMOVED then
          local hit = AP.button(obj, name)
          if hit then return hit end
        end
      end
    end
  end
  return nil
end

--- Presses a UI button as a click does: G.FUNCS[button](node).
function AP.press(node)
  local name = node and node.config and node.config.button
  if not name or not G.FUNCS[name] then error('button not pressable: ' .. tostring(name)) end
  G.FUNCS[name](node)
  return name
end

local function press_when(get_box, name, why, seconds)
  local node = wait(function()
    return AP.idle() and AP.button(get_box(), name)
  end, seconds, why or name)
  return AP.press(node)
end

local function card_info(card)
  local c = card.config and card.config.center
  local info = { key = c and c.key or '?', cost = card.cost }
  if card.edition then
    for k, v in pairs(card.edition) do
      if v == true then info.edition = k end
    end
  end
  if card.seal then info.seal = card.seal end
  if card.base and card.base.value and c and c.set ~= 'Joker' and card.ability and card.ability.set ~= 'Joker' then
    if card.ability.set == 'Default' or card.ability.set == 'Enhanced' then
      info.card = tostring(card.base.value) .. ' of ' .. tostring(card.base.suit)
    end
  end
  if card.ability and card.ability.eternal then info.eternal = true end
  if card.ability and card.ability.perishable then info.perishable = true end
  if card.ability and card.ability.rental then info.rental = true end
  return info
end
AP.card_info = card_info

local function area_infos(area)
  local out = {}
  if area and area.cards then
    for i, card in ipairs(area.cards) do out[i] = card_info(card) end
  end
  return out
end

function AP.snapshot()
  local s = {
    state = AP.state_name(),
    stage = G.STAGE,
    idle = AP.idle(),
    version = G.VERSION,
  }
  if G.GAME and G.STAGE == G.STAGES.RUN then
    local game = G.GAME
    s.seed = game.pseudorandom and game.pseudorandom.seed
    s.ante = game.round_resets and game.round_resets.ante
    s.round = game.round
    s.dollars = game.dollars
    s.chips = game.chips
    s.blind = game.blind and game.blind.config and game.blind.config.blind and game.blind.config.blind.key
    s.blind_chips = game.blind and game.blind.chips
    s.blind_on_deck = game.blind_on_deck
    s.won = game.won == true
    s.hands_left = game.current_round and game.current_round.hands_left
    s.discards_left = game.current_round and game.current_round.discards_left
    s.hand = area_infos(G.hand)
    s.jokers = area_infos(G.jokers)
    s.consumeables = area_infos(G.consumeables)
    if G.shop_jokers then s.shop = AP.shop() end
    if G.pack_cards then s.pack = area_infos(G.pack_cards) end
  end
  return s
end

function AP.shop()
  return {
    jokers = area_infos(G.shop_jokers),
    vouchers = area_infos(G.shop_vouchers),
    boosters = area_infos(G.shop_booster),
  }
end

--- One line per shop card, canonical (area:slot key edition cost …).
function AP.shop_digest()
  local lines = {}
  local function add(area_name, area)
    for i, info in ipairs(area_infos(area)) do
      local parts = { area_name .. ':' .. i, info.key, 'cost=' .. tostring(info.cost) }
      if info.edition then parts[#parts + 1] = 'ed=' .. info.edition end
      if info.seal then parts[#parts + 1] = 'seal=' .. info.seal end
      if info.card then parts[#parts + 1] = info.card end
      for _, flag in ipairs({ 'eternal', 'perishable', 'rental' }) do
        if info[flag] then parts[#parts + 1] = flag end
      end
      lines[#lines + 1] = table.concat(parts, ' ')
    end
  end
  add('joker', G.shop_jokers)
  add('voucher', G.shop_vouchers)
  add('booster', G.shop_booster)
  return table.concat(lines, '\n')
end

local function hand_cards(indices)
  if type(indices) ~= 'table' or #indices == 0 then error('indices: a non-empty array of hand positions') end
  if #indices > 5 then error('at most 5 cards') end
  local cards, seen = {}, {}
  for _, i in ipairs(indices) do
    local card = G.hand.cards[i]
    if type(i) ~= 'number' or not card then error('no card at hand position ' .. tostring(i)) end
    if seen[i] then error('hand position ' .. i .. ' given twice') end
    seen[i] = true
    cards[#cards + 1] = card
  end
  return cards
end

local function highlight(cards)
  G.hand:unhighlight_all()
  for _, card in ipairs(cards) do G.hand:add_to_highlighted(card, true) end
  if #G.hand.highlighted ~= #cards then error('could not highlight ' .. #cards .. ' cards') end
end

--- The best-scoring selection by base hand value (chips + scoring ranks) × mult.
-- Deterministic: ties keep the first combination in lexicographic order.
function AP.best_indices()
  local n = #G.hand.cards
  local best, best_score = nil, -1
  local pick = {}
  local function consider()
    local cards = {}
    for i, idx in ipairs(pick) do cards[i] = G.hand.cards[idx] end
    local text, _, _, scoring = G.FUNCS.get_poker_hand_info(cards)
    local hand = G.GAME.hands[text]
    if not hand then return end
    local chips = hand.chips
    for _, c in ipairs(scoring or {}) do
      if c.base and c.base.nominal and not c.debuff then chips = chips + c.base.nominal end
    end
    local score = chips * hand.mult
    if score > best_score then
      best_score = score
      best = {}
      for i, v in ipairs(pick) do best[i] = v end
    end
  end
  local function rec(start, left)
    if #pick > 0 then consider() end
    if left == 0 then return end
    for i = start, n do
      pick[#pick + 1] = i
      rec(i + 1, left - 1)
      pick[#pick] = nil
    end
  end
  rec(1, math.min(5, n))
  return best, best_score
end

-- ── commands ─────────────────────────────────────────────────────────────────

local C = AP.commands

function AP.register(name, fn)
  if type(name) ~= 'string' or type(fn) ~= 'function' then error('AP.register(name, fn)') end
  C[name] = fn
end

C.state = function() return AP.snapshot() end
C.wait_state = function(a) return AP.wait_state(a.name or a[1], a.seconds or a[2]) end
C.wait_idle = function(a) return AP.wait_idle(a.seconds or a[1]) end

-- Opens a menu holding one text field, as the seed and lobby-code screens do (the phone
-- keyboard path, lib/balatro/text-input.ts, is tested against it).
C.open_text_input = function()
  AP_TEXT = { value = '' }
  G.FUNCS.overlay_menu({
    definition = create_UIBox_generic_options({
      contents = {
        create_text_input({ w = 4, h = 0.6, max_length = 8, all_caps = true, prompt_text = 'CODE', ref_table = AP_TEXT, ref_value = 'value' }),
      },
    }),
  })
  return true
end

C.text_value = function()
  return { value = AP_TEXT and AP_TEXT.value or '', hooked = G.CONTROLLER.text_input_hook ~= nil }
end

C.speed = function(a)
  local n = tonumber(a.n or a[1]) or 4
  G.SETTINGS.GAMESPEED = n
  G.SETTINGS.reduced_motion = true
  return n
end

C.prepare = function()
  C.speed({ 4 })
  -- A fresh profile would run the tutorial (and force its seed, voucher and tags).
  G.SETTINGS.tutorial_complete = true
  G.SETTINGS.tutorial_progress = nil
  return true
end

C.start_run = function(a)
  local seed = a.seed or a[1]
  if seed ~= nil and (type(seed) ~= 'string' or not seed:match('^[%w]+$') or #seed > 16) then
    error('seed: 1–16 letters/digits')
  end
  C.prepare()
  wait(function()
    return G.STAGE == G.STAGES.MAIN_MENU and G.MAIN_MENU_UI and AP.idle()
      or G.STAGE == G.STAGES.RUN and AP.idle()
  end, 120, 'main menu or a run to start from')
  if a.deck then
    local center = G.P_CENTERS[a.deck]
    if not center or center.set ~= 'Back' then error('unknown deck ' .. tostring(a.deck)) end
    G.GAME.viewed_back = Back(center)
  end
  G.FUNCS.start_run(nil, { stake = tonumber(a.stake) or 1, seed = seed })
  wait(function()
    return G.STAGE == G.STAGES.RUN and G.STATE == G.STATES.BLIND_SELECT and G.blind_select and AP.idle()
  end, 120, 'blind select of the new run')
  return AP.snapshot()
end

local function blind_box()
  local on_deck = G.GAME.blind_on_deck
  return G.blind_select_opts and on_deck and G.blind_select_opts[string.lower(on_deck)]
end

C.select_blind = function()
  AP.wait_state('BLIND_SELECT')
  wait(function() return G.blind_select and blind_box() end, 30, 'blind choices')
  press_when(blind_box, 'select_blind', 'select blind button')
  AP.wait_state('SELECTING_HAND', 120)
  wait(function() return #G.hand.cards > 0 end, 30, 'cards dealt')
  return AP.snapshot()
end

C.skip_blind = function()
  AP.wait_state('BLIND_SELECT')
  local before = G.GAME.blind_on_deck
  if before == 'Boss' then error('the boss blind cannot be skipped') end
  press_when(blind_box, 'skip_blind', 'skip blind button')
  wait(function() return G.GAME.blind_on_deck ~= before and AP.idle() end, 60, 'next blind on deck')
  return AP.snapshot()
end

local function after_hand()
  -- A hand ends in SELECTING_HAND again, ROUND_EVAL (won) or GAME_OVER (lost).
  wait(function()
    return AP.idle() and (G.STATE == G.STATES.SELECTING_HAND or G.STATE == G.STATES.ROUND_EVAL or G.STATE == G.STATES.GAME_OVER)
  end, 120, 'hand resolved')
  if G.STATE == G.STATES.ROUND_EVAL then
    wait(function() return G.round_eval and AP.any_button('cash_out') end, 60, 'cash out button')
  end
  return AP.snapshot()
end

C.play = function(a)
  AP.wait_state('SELECTING_HAND')
  local indices = a.indices or a[1]
  if indices == 'best' or indices == nil then indices = AP.best_indices() end
  highlight(hand_cards(indices))
  if G.GAME.current_round.hands_left <= 0 then error('no hands left') end
  G.FUNCS.play_cards_from_highlighted()
  return after_hand()
end

C.discard = function(a)
  AP.wait_state('SELECTING_HAND')
  if G.GAME.current_round.discards_left <= 0 then error('no discards left') end
  highlight(hand_cards(a.indices or a[1]))
  G.FUNCS.discard_cards_from_highlighted()
  return after_hand()
end

C.set_chips = function(a)
  local n = tonumber(a.n or a[1])
  if not n then error('set_chips(n)') end
  G.GAME.chips = n
  return n
end

C.win_blind = function()
  AP.wait_state('SELECTING_HAND')
  G.GAME.chips = G.GAME.blind.chips
  C.play({ { 1 } })
  if G.STATE ~= G.STATES.ROUND_EVAL then error('blind not won (state ' .. tostring(AP.state_name()) .. ')') end
  return AP.snapshot()
end

C.cash_out = function()
  AP.wait_state('ROUND_EVAL')
  local node = wait(function() return G.round_eval and AP.idle() and AP.any_button('cash_out') end, 60, 'cash out button')
  AP.press(node)
  AP.wait_state('SHOP', 120)
  wait(function() return G.shop and G.shop_jokers and #G.shop_jokers.cards > 0 end, 60, 'shop stocked')
  return AP.snapshot()
end

--- Fast-forward (test-only): at blind select, jump the run to ante n (as ease_ante would).
C.set_ante = function(a)
  AP.wait_state('BLIND_SELECT')
  local n = tonumber(a.n or a[1])
  if not n or n < 1 or n > 100 then error('set_ante(n)') end
  ease_ante(n - G.GAME.round_resets.ante)
  G.GAME.round_resets.blind_ante = n
  AP.wait_idle()
  return AP.snapshot()
end

--- The profile's single-player save (E2E-20: MP must never touch it): {exists, size, hash}.
C.save_info = function()
  local profile = (G.SETTINGS and G.SETTINGS.profile) or 1
  local path = profile .. '/save.jkr'
  local data = love.filesystem.read(path)
  if not data then return { exists = false, path = path } end
  return { exists = true, path = path, size = #data, hash = string.format('%.13f', pseudohash(data)) }
end

--- The profile state single-player pools read (E2E-20): unlocked and discovered centers, and
-- the profile's progress counters that unlock conditions read.
C.profile_digest = function()
  local unlocked, discovered = {}, {}
  for k, c in pairs(G.P_CENTERS) do
    if c.unlocked then unlocked[#unlocked + 1] = k end
    if c.discovered then discovered[#discovered + 1] = k end
  end
  for k, c in pairs(G.P_TAGS or {}) do if c.discovered then discovered[#discovered + 1] = k end end
  for k, c in pairs(G.P_BLINDS or {}) do if c.discovered then discovered[#discovered + 1] = k end end
  table.sort(unlocked)
  table.sort(discovered)
  return { unlocked = unlocked, discovered = discovered }
end

--- Back to the main menu from a run outside any session (vanilla saves the run on the way).
C.to_menu = function()
  if G.STAGE ~= G.STAGES.MAIN_MENU then
    if G.OVERLAY_MENU and G.FUNCS.exit_overlay_menu then G.FUNCS.exit_overlay_menu() end
    G.SETTINGS.paused = false
    G.FUNCS.go_to_menu()
  end
  wait(function() return G.STAGE == G.STAGES.MAIN_MENU and G.MAIN_MENU_UI ~= nil and not G.screenwipe and AP.idle() end, 120, 'main menu')
  return AP.snapshot()
end

C.shop = function() return AP.shop() end
C.shop_digest = function()
  AP.wait_state('SHOP')
  return AP.shop_digest()
end

local function affordable(card)
  return card.cost <= (G.GAME.dollars - (G.GAME.bankrupt_at or 0))
end

C.buy = function(a)
  AP.wait_state('SHOP')
  local slot = tonumber(a.slot or a[1])
  local which = a.area or a[2] or 'jokers'
  local area = which == 'vouchers' and G.shop_vouchers or which == 'jokers' and G.shop_jokers or nil
  if not area then error('area: jokers | vouchers') end
  local card = slot and area.cards[slot]
  if not card then error('no card in shop ' .. which .. ' slot ' .. tostring(slot)) end
  if not affordable(card) then error('cannot afford ' .. tostring(card.cost)) end
  local key = card.config.center.key
  if which == 'vouchers' then
    G.FUNCS.use_card({ config = { ref_table = card } })
  else
    if not G.FUNCS.check_for_buy_space(card) then error('no room for ' .. key) end
    G.FUNCS.buy_from_shop({ config = { ref_table = card } })
  end
  wait(function() return card.area ~= area and AP.idle() and G.STATE == G.STATES.SHOP end, 60, 'purchase of ' .. key)
  return { key = key, dollars = G.GAME.dollars }
end

C.reroll = function()
  AP.wait_state('SHOP')
  local before = G.GAME.round_scores and G.GAME.round_scores.times_rerolled and G.GAME.round_scores.times_rerolled.amt
  press_when(function() return G.shop end, 'reroll_shop', 'reroll button (affordable)')
  wait(function()
    local now = G.GAME.round_scores.times_rerolled.amt
    return now ~= before and AP.idle()
  end, 60, 'reroll')
  return AP.shop()
end

local PACK_STATES = { 'TAROT_PACK', 'PLANET_PACK', 'SPECTRAL_PACK', 'STANDARD_PACK', 'BUFFOON_PACK' }
local function in_pack()
  for _, name in ipairs(PACK_STATES) do
    if G.STATE == G.STATES[name] then return name end
  end
  return nil
end

C.open_pack = function(a)
  AP.wait_state('SHOP')
  local slot = tonumber(a.slot or a[1])
  local card = slot and G.shop_booster.cards[slot]
  if not card then error('no booster in slot ' .. tostring(slot)) end
  if not affordable(card) then error('cannot afford ' .. tostring(card.cost)) end
  G.FUNCS.use_card({ config = { ref_table = card } })
  wait(function() return in_pack() and G.pack_cards and #G.pack_cards.cards > 0 and AP.idle() end, 60, 'pack opened')
  return { pack = in_pack(), cards = area_infos(G.pack_cards) }
end

C.pick = function(a)
  local i = tonumber(a.i or a[1])
  wait(function() return in_pack() and AP.idle() end, 60, 'an open pack')
  local card = i and G.pack_cards.cards[i]
  if not card then error('no pack card ' .. tostring(i)) end
  G.FUNCS.use_card({ config = { ref_table = card } })
  wait(function() return AP.idle() and (card.area ~= G.pack_cards) end, 60, 'pack pick')
  return AP.snapshot()
end

C.skip_pack = function()
  wait(function() return in_pack() and AP.idle() end, 60, 'an open pack')
  G.FUNCS.skip_booster({ config = {} })
  AP.wait_state('SHOP', 60)
  return AP.snapshot()
end

C.leave_shop = function()
  AP.wait_state('SHOP')
  press_when(function() return G.shop end, 'toggle_shop', 'next round button')
  AP.wait_state('BLIND_SELECT', 120)
  return AP.snapshot()
end

C.use = function(a)
  local slot = tonumber(a.slot or a[1])
  local card = slot and G.consumeables.cards[slot]
  if not card then error('no consumable in slot ' .. tostring(slot)) end
  local targets = a.targets or a[2]
  if targets and #targets > 0 then highlight(hand_cards(targets)) end
  if not card:can_use_consumeable() then error('cannot use ' .. card.config.center.key .. ' now') end
  G.FUNCS.use_card({ config = { ref_table = card } })
  wait(function() return card.area ~= G.consumeables and AP.idle() end, 60, 'consumable used')
  return AP.snapshot()
end

C.give = function(a)
  local key = a.key or a[1]
  local center = G.P_CENTERS[key]
  if not center then error('unknown center ' .. tostring(key)) end
  local area
  if center.set == 'Joker' then area = G.jokers
  elseif center.consumeable then area = G.consumeables
  else error('give: only jokers and consumables (got ' .. tostring(center.set) .. ')') end
  -- Built directly, as create_card does minus its edition/sticker rolls, so
  -- giving a card draws nothing from the seeded streams.
  local card = Card(area.T.x + area.T.w / 2, area.T.y, G.CARD_W, G.CARD_H, nil, center, {
    bypass_discovery_center = true, bypass_discovery_ui = true, discover = false,
    bypass_back = G.GAME.selected_back.pos,
  })
  card:add_to_deck()
  area:emplace(card)
  return card_info(card)
end

-- MP UI actions live in the MP pack's test surface (MP.test), filled by the UI
-- streams; the skeleton only routes to it.
for _, name in ipairs({ 'ready', 'unready', 'timer_press', 'pause_menu', 'forfeit', 'vote' }) do
  C[name] = function(a)
    local mp_test = rawget(_G, 'MP') and MP.test and MP.test[name]
    if not mp_test then error('mp-unavailable: ' .. name .. ' needs the MP pack test surface (MP.test.' .. name .. ')') end
    return mp_test(a)
  end
end

--- Any MP.test function by name (e2e: ui, ui_state, draft, hud, …): mp{fn='ui', args={op='create'}}.
C.mp = function(a)
  local name = a.fn or a[1]
  if type(name) ~= 'string' or not name:match('^[%w_]+$') then error('mp{fn, args}') end
  local mp_test = rawget(_G, 'MP') and MP.test and MP.test[name]
  if type(mp_test) ~= 'function' then error('mp-unavailable: MP.test.' .. name) end
  local r = mp_test(a.args or a[2] or {})
  if r == nil then return true end
  return r
end

-- ── MP match flow (e2e: the match project drives whole antes with these) ──────

local function mpg()
  local m = rawget(_G, 'MP')
  if not (m and m.pvp and m.state) then error('mp-unavailable: no MP session code') end
  return m
end

local function result_kind()
  local m = rawget(_G, 'MP')
  local r = m and m.state and m.state.result
  return r and r.kind or nil
end

--- The match is over for this player (a win/lose/draw/eliminated screen), not pending.
local function finished()
  local k = result_kind()
  return k ~= nil and k ~= 'pending'
end

--- Plays the PvP blind: `chips` (optional) is written to G.GAME.chips before each hand,
-- so a test decides who wins; `hands` caps the hands played (default: all); `best`
-- plays the best hand instead of one card. Returns when no hand is left to play.
C.pvp_play = function(a)
  local m = mpg()
  wait(function()
    return finished() or (G.STATE == G.STATES.SELECTING_HAND and AP.idle() and m.pvp.on_pvp_blind() and #G.hand.cards > 0)
  end, tonumber(a.wait) or 240, 'the PvP blind dealt (countdown over)')
  local chips = a.chips ~= nil and tonumber(a.chips) or nil
  local hands = tonumber(a.hands) or 1000
  local played = 0
  while not finished() and played < hands and G.STATE == G.STATES.SELECTING_HAND and m.pvp.on_pvp_blind()
    and G.GAME.current_round.hands_left > 0 and #G.hand.cards > 0 do
    if chips then G.GAME.chips = chips end
    highlight(hand_cards(a.best and AP.best_indices() or { 1 }))
    G.FUNCS.play_cards_from_highlighted()
    played = played + 1
    wait(function()
      return finished() or G.GAME.won or G.STATE == G.STATES.GAME_OVER
        or (AP.idle() and G.STATE ~= G.STATES.HAND_PLAYED and G.STATE ~= G.STATES.DRAW_TO_HAND)
    end, 120, 'PvP hand scored')
    if G.GAME.won then break end
  end
  return { played = played, chips = G.GAME.chips, result = result_kind() }
end

--- After the PvP hands: until end_pvp moved the run on (round eval / shop / next blind
-- select) or the match ended for this player.
C.pvp_wait_end = function(a)
  local m = mpg()
  wait(function()
    if finished() then return true end
    if not AP.idle() then return false end
    local st = G.STATE
    return not m.pvp.on_pvp_blind() and (st == G.STATES.ROUND_EVAL or st == G.STATES.SHOP or st == G.STATES.BLIND_SELECT)
      or st == G.STATES.ROUND_EVAL
  end, tonumber(a.seconds) or 240, 'end of the PvP round')
  return { state = AP.state_name(), result = result_kind(), lives = m.state.lives, ante = G.GAME.round_resets.ante }
end

--- Ready on the PvP pillar once the blind select is built and idle (a press before the pillar
-- exists is lost, as a click would be); waits until the session took it (ready or started).
C.pvp_ready = function()
  local m = mpg()
  AP.wait_state('BLIND_SELECT')
  if G.GAME.blind_on_deck ~= 'Boss' then error('pvp_ready: the Boss/PvP pillar is not on deck') end
  if not (m.test and m.test.run_ready) then error('mp-unavailable: MP.test.run_ready') end
  wait(function() return G.blind_select and blind_box() and AP.idle() end, 60, 'the PvP pillar')
  for _ = 1, 3 do
    m.test.run_ready()
    local ok = sched.protected(wait, function() return m.state.pvp.ready or m.state.pvp.started end, 5, 'ready taken')
    if ok then return { ready = m.state.pvp.ready, started = m.state.pvp.started } end
  end
  error('pvp_ready: Ready was not taken')
end

--- Ready on the PvP pillar (Boss slot), play it, wait for its end. {chips, hands, best}.
C.pvp_round = function(a)
  C.pvp_ready()
  local played = C.pvp_play(a)
  local after = C.pvp_wait_end(a)
  after.played = played.played
  return after
end

--- One normal blind: select, win (chips set to target), cash out, leave the shop.
local function normal_blind(a)
  C.select_blind()
  C.win_blind()
  C.cash_out()
  if a.reroll then pcall(C.reroll) end
  C.leave_shop()
end

--- A whole ante of a match: Small and Big blinds won, then the PvP round
-- ({chips, hands, best} as pvp_round), then cash out and leave the shop unless the match
-- ended. Returns {ante, state, result, lives}.
C.mp_ante = function(a)
  mpg()
  AP.wait_state('BLIND_SELECT')
  while not finished() and G.GAME.blind_on_deck ~= 'Boss' do normal_blind(a) end
  local r = C.pvp_round(a)
  if not finished() and G.STATE == G.STATES.ROUND_EVAL then
    C.cash_out()
    C.leave_shop()
  end
  r.state = AP.state_name()
  r.result = result_kind()
  r.ante = G.GAME and G.GAME.round_resets and G.GAME.round_resets.ante
  return r
end

--- Sends a Lua→JS UI message as the screens do (ui_chat, ui_kick, ui_mute, ui_spectate,
-- ui_return_lobby, ui_leave, ui_continue_sp …): mp_send{t, d}. Validated by the protocol.
C.mp_send = function(a)
  local m = rawget(_G, 'MP')
  local t = a.t or a[1]
  if not (m and m.net and m.net.send) then error('mp-unavailable: MP.net') end
  if type(t) ~= 'string' or not t:match('^ui_[%w_]+$') then error('mp_send{t = ui_*, d}') end
  local send = m.ui and m.ui.send or m.net.send
  if not send(t, a.d or a[2] or {}) then error('mp_send: ' .. t .. ' refused by the protocol') end
  return true
end

--- Leaves as a player does (mp_leave{how = 'leave' | 'return_lobby'}): from a match's end
-- screen (ES.leave: match_left, then the menu), by forfeiting a match still running, or
-- with ui_leave from a lobby / practice outside a run. Returns once no session is mounted.
C.mp_leave = function(a)
  local m = mpg()
  local how = a.how or a[1] or 'leave'
  if m.in_session() and G.STAGE == G.STAGES.RUN then
    if m.is_match() and finished() and m.ui and m.ui.end_screen and m.ui.end_screen.leave then
      m.ui.end_screen.leave(how)
    elseif m.is_match() and m.test and m.test.forfeit then
      m.test.forfeit()
    elseif G.FUNCS.go_to_menu then
      G.FUNCS.go_to_menu()
    end
    wait(function() return not m.state.session and G.STAGE == G.STAGES.MAIN_MENU and AP.idle() end, 120, 'session unmounted')
  end
  if how == 'leave' then
    local send = m.ui and m.ui.send or m.net.send
    send('ui_leave', {})
  end
  return { in_session = m.in_session() }
end

--- Presses button i of the open MP notice overlay (Seat held / Reconnect / errors) as a click
-- does: the overlay closes, then the button's action runs. mp_notice{i, name?}.
C.mp_notice = function(a)
  local m = mpg()
  local name = a.name
  wait(function()
    local W = m.ui and m.ui.w
    local open = W and W.overlay_name and W.overlay_name()
    return open ~= nil and (not name or open == name)
  end, tonumber(a.seconds) or 60, 'notice overlay ' .. tostring(name or ''))
  G.FUNCS.rmh_mp_notice_button({ config = { ref_table = { index = tonumber(a.i or a[1]) or 1 } } })
  return true
end

--- MP.state for assertions (lives, result, presence, pvp flags) as plain data.
C.mp_state = function()
  local m = mpg()
  local st = m.state
  return {
    result = st.result, lives = st.lives, pvp = { ready = st.pvp.ready, started = st.pvp.started },
    in_session = m.in_session(), kind = m.session_kind and m.session_kind() or nil,
    me = st.session and st.session.me or nil, ante = G.GAME and G.GAME.round_resets and G.GAME.round_resets.ante,
    state = AP.state_name(),
    -- E2E-08/23: what must agree across peers on the same seed.
    banned_digest = m.smallworld and m.smallworld.digest and G.GAME and G.GAME.banned_keys and m.smallworld.digest() or nil,
    boss = G.GAME and G.GAME.round_resets and G.GAME.round_resets.blind_choices and G.GAME.round_resets.blind_choices.Boss or nil,
    seed = G.GAME and G.GAME.pseudorandom and G.GAME.pseudorandom.seed or nil,
  }
end

local function json_array_of(t)
  local J = rawget(_G, 'RMH') and RMH.json
  if J and J.array then return J.array(t) end
  return t
end

-- The inbox tap: what the session told Lua, kept for assertions (e2e). One ring per type (so
-- a chatty type never evicts a rare one); per-frame types are counted, not stored. Every
-- entry carries `n`, its type's running count, so a caller waits for `counts[t]` to grow
-- rather than for a list length (a full ring never grows).
AP.inbox = { by_type = {}, counts = {}, max = 200 }
local NOISY = { timer_state = true, mp_pack = true }

function AP.tap_inbox()
  local m = rawget(_G, 'MP')
  if AP.inbox.tapped or not (m and m.net and m.net.receive) then return AP.inbox.tapped == true end
  AP.inbox.tapped = true
  local receive = m.net.receive
  m.net.receive = function(t, d, msg)
    local box = AP.inbox
    box.counts[t] = (box.counts[t] or 0) + 1
    if not NOISY[t] then
      local ring = box.by_type[t]
      if not ring then ring = {} box.by_type[t] = ring end
      ring[#ring + 1] = { t = t, d = d, n = box.counts[t] }
      if #ring > box.max then table.remove(ring, 1) end
    end
    return receive(t, d, msg)
  end
  return true
end

--- mp_inbox{t?, since?} → {list = [{t, d, n}], counts}: the kept messages Lua received of type
-- t (every type when absent), only those with n > since.
C.mp_inbox = function(a)
  AP.tap_inbox()
  local out = {}
  local since = tonumber(a.since) or 0
  local types = {}
  if a.t then types[1] = a.t else for t in pairs(AP.inbox.by_type) do types[#types + 1] = t end table.sort(types) end
  for _, t in ipairs(types) do
    for _, e in ipairs(AP.inbox.by_type[t] or {}) do
      if e.n > since then out[#out + 1] = e end
    end
  end
  return { list = json_array_of(out), counts = AP.inbox.counts }
end

--- Opens the MP menu as the MULTIPLAYER button does (the page may have opened the
-- session from JS, which mounts the pack without calling MP.open).
C.mp_open = function(a)
  local MPg = rawget(_G, 'MP')
  if not (MPg and MPg.open) then error('mp-unavailable: MP.open') end
  AP.tap_inbox()
  MPg.open(a.intent or a[1] or 'menu')
  return MPg.test and MPg.test.ui_state and MPg.test.ui_state() or true
end

-- ── running commands ─────────────────────────────────────────────────────────

--- Runs a command inside the current task (for specs: AP.run('win_blind')).
function AP.run(cmd, args)
  local fn = C[cmd]
  if not fn then error('unknown command ' .. tostring(cmd)) end
  args = type(args) == 'table' and args or {}
  -- The mailbox carries args as an array (bridge-protocol.ts test_cmd), so named
  -- args arrive as [{...}]: unwrap a lone object (a table with keys but no [1]).
  local only = args[1]
  if #args == 1 and type(only) == 'table' and only[1] == nil and next(only) ~= nil then args = only end
  return fn(args)
end

--- Starts a command as its own task; reply(id, ok, data) when it ends.
function AP.exec(id, cmd, args, reply)
  if not C[cmd] then
    reply(id, false, { error = 'unknown command ' .. tostring(cmd) })
    return
  end
  sched.spawn(function()
    return AP.run(cmd, args)
  end, function(ok, value)
    if ok then reply(id, true, value) else reply(id, false, { error = tostring(value) }) end
  end)
end

--- Answers test_cmd on a mailbox-like {on(type, fn(d)), send(type, d)} (RMH.net
-- in a test build).
function AP.attach(net)
  net.on('test_cmd', function(d)
    if type(d) ~= 'table' or type(d.id) ~= 'string' or type(d.cmd) ~= 'string' then return end
    AP.exec(d.id, d.cmd, d.args, function(id, ok, data)
      net.send('test_res', { id = id, ok = ok, data = data })
    end)
  end)
end

--- Installs the per-frame tick (idempotent). Returns false without the marker.
function AP.install()
  if AP.installed then return true end
  if not AP.enabled() then return false end
  AP.installed = true
  local frame_hooks = rawget(_G, 'RMH') and RMH.frame_hooks
  if type(frame_hooks) == 'table' then
    frame_hooks[#frame_hooks + 1] = sched.tick
  else
    local update = love.update
    love.update = function(...)
      local r = update and update(...)
      sched.tick()
      return r
    end
  end
  local net = rawget(_G, 'RMH') and RMH.net
  if type(net) == 'table' and net.on and net.send then AP.attach(net) end
  -- Balatro's error screen loops forever, which freezes a browser tab: a test page
  -- could never see the error. Report it on stderr (the page's console) and stop.
  -- (The engine-spec harness installs its own handler after this one.)
  love.errhand = function(msg)
    local trace = debug.traceback(tostring(msg), 2)
    io.stderr:write('[mp_test] CRASH ' .. trace:gsub('\n', ' | ') .. '\n')
    io.stderr:flush()
  end
  love.errorhandler = love.errhand
  -- With the MP pack loaded (a test build), record what the session tells Lua from now on.
  if AP.tap_inbox then pcall(AP.tap_inbox) end
  return true
end

return AP
