-- L2 in-engine spec for the Score Preview (M03; B06, B07, G10) in a practice run inside the real
-- love.wasm: the HUD carries the preview rows when the setting is on, the button's numbers equal
-- what the hand then scores, and the preview leaves the run's streams and money untouched.
--
-- Needs the MP pack (`?mp=1`); without it the file reports one skipped test.

local has_mp, MP = pcall(require, 'rmh_mp')

local SEED = 'RMHPREV1'

local function resolved()
  return {
    key = 'ruleset_mp_test', layers = { 'standard' }, multiplayerContent = true, banned = {},
    bannedSilent = {}, included = {}, reworked = {}, spectralBannedEnhancements = {}, stickers = {},
    gameModifiers = {}, startingParams = {}, setupHooks = {},
    flags = { theOrder = true, enemyLocationDisabled = false, comeback = 'default' },
    timer = { enabled = false, base = 0, increment = 0, forgiveness = 0, pvpHandIncrement = 0, mode = 'default',
      pressurePlusHand = 0, countdown = 3, mult = 1 },
  }
end

local function practice(options)
  AP.run('prepare')
  if MP.state.session then MP.session.unmount('test') end
  local o = { pvpStartRound = 2, theOrder = true, multiplayerJokers = true, timer = false }
  for k, v in pairs(options or {}) do o[k] = v end
  MP.session.mount('practice', {
    resolved = resolved(), deck = 'b_red', stake = 1, seed = SEED,
    shape = { nemesisPairing = true, manhunt = false, teamBased = false, practice = true }, options = o,
  })
  MP.session.launch(SEED)
  AP.run('wait_state', { 'BLIND_SELECT' })
end

local function leave()
  if MP and MP.state and MP.state.session then MP.session.unmount('test') end
end

local function copy(t)
  local o = {}
  for k, v in pairs(t) do o[k] = v end
  return o
end

local function same(a, b)
  for k, v in pairs(a) do if b[k] ~= v then return false end end
  for k in pairs(b) do if a[k] == nil then return false end end
  return true
end

local function select_best()
  local idx = AP.best_indices()
  for _, c in ipairs(G.hand.highlighted) do c.highlighted = false end
  for i = #G.hand.highlighted, 1, -1 do G.hand.highlighted[i] = nil end
  for _, i in ipairs(idx) do G.hand:add_to_highlighted(G.hand.cards[i], true) end
  return idx
end

if not has_mp then
  describe('score preview (in-engine)', function()
    xit('needs the MP pack (?mp=1): ' .. tostring(MP):sub(1, 120), function() end)
  end)
  return
end

-- The in-run UI (and with it the preview's session installer) loads when Multiplayer opens.
pcall(require, 'rmh_mp.ui.hud')

describe('score preview in a practice run', function()
  after_each(function()
    leave()
    if MP.preview then MP.preview.set('preview', false) end
  end)

  it('off by default: no HUD rows', function()
    expect(MP.preview ~= nil).truthy()
    MP.preview.set('preview', false)
    practice()
    AP.run('select_blind')
    expect(G.HUD:get_UIE_by_ID('mp_preview')).eq(nil)
  end)

  it('on: the HUD rows, and the numbers equal the hand then played (MP and random jokers held)', function()
    MP.preview.set('preview', true)
    practice()
    AP.run('give', { 'j_misprint' })
    AP.run('give', { 'j_mp_lets_go_gambling' })
    AP.run('give', { 'j_joker' })
    AP.run('select_blind')
    expect(G.HUD:get_UIE_by_ID('mp_preview_button') ~= nil).truthy()
    local idx = select_best()
    local streams, dollars = copy(G.GAME.pseudorandom), G.GAME.dollars
    local hands = G.GAME.current_round.hands_left
    expect(MP.preview.calculate()).truthy() -- practice: no timer, no delay
    local d = MP.preview.data
    expect(d ~= nil).truthy()
    expect(MP.preview.state).eq('shown')
    expect(d.score.min <= d.score.exact and d.score.exact <= d.score.max).truthy()
    expect(d.score.min < d.score.max).truthy() -- Misprint and the gamble
    expect(same(streams, G.GAME.pseudorandom)).truthy()
    expect(G.GAME.dollars).eq(dollars)
    expect(G.GAME.current_round.hands_left).eq(hands)
    wait_frames(2)
    expect(G.HUD:get_UIE_by_ID('mp_preview_l') ~= nil).truthy()
    local chips0 = G.GAME.chips
    local s = AP.run('play', { idx })
    expect(s.chips - chips0).eq(d.score.exact)
    report('preview_exact', d.score.exact)
  end)

  it('previewDisabled: no rows even with the setting on', function()
    MP.preview.set('preview', true)
    practice({ previewDisabled = true })
    AP.run('select_blind')
    expect(G.HUD:get_UIE_by_ID('mp_preview')).eq(nil)
    expect(MP.preview.calculate()).falsy()
  end)
end)
