-- L2 in-engine spec for the Release ruleset (EX-14 lifted): in the real game, a Practice run on the
-- Release ruleset gets its optional art pack (`release-<sha>.zip`) through the production loader
-- (the harness page answers /rmh/test/want_pack with createOptionalPacks → loadPack → unpackPack →
-- mountOptionalFiles, as a lobby's session runtime does), mounts the 65 reworks, plays ante 1, and
-- sampled reworked Jokers draw from the release sheet — Square Joker with its own 1.0.0 art,
-- card-shaped.
--
-- Needs the MP pack (`?mp=1`); without it the file reports one skipped test.

local has_mp, MP = pcall(require, 'rmh_mp')
local IT = has_mp and it or xit

local SEED = 'RMHREL01'
local ATLAS = 'mp_release_jokers'
local MARKER = '/rmh/mp/packs/release'

local function exists(path)
  local f = io.open(path, 'rb')
  if f then f:close(); return true end
  return false
end

local function release_resolved()
  return {
    key = 'ruleset_mp_release', layers = { 'release' }, multiplayerContent = false, banned = {},
    bannedSilent = {}, included = {}, reworked = {}, spectralBannedEnhancements = {},
    stickers = { 'mp_sticker_balanced' }, gameModifiers = {}, startingParams = {}, setupHooks = { 'release' },
    flags = { theOrder = true, enemyLocationDisabled = false, comeback = 'default' },
    timer = { enabled = false, base = 0, increment = 0, forgiveness = 0, pvpHandIncrement = 0, mode = 'default',
      pressurePlusHand = 0, countdown = 3, mult = 1 },
  }
end

--- Ask the page for the pack and wait for its marker (or its error).
local function fetch_release_pack()
  if exists(MARKER) then return true end
  local f = assert(io.open('/rmh/test/want_pack', 'wb'))
  f:write('release')
  f:close()
  wait_until(function() return exists(MARKER) or exists('/rmh/test/pack_error') end, 60, 'release pack mounted')
  return exists(MARKER)
end

-- Pixels a sprite's quad cuts out of its atlas, hashed (as art_spec does).
local function cell_hash(atlas, pos)
  local s = (G.SETTINGS.GRAPHICS and G.SETTINGS.GRAPHICS.texture_scaling) or 2
  local w, h = atlas.px * s, atlas.py * s
  -- Images load with dpiscale = s: quads are in logical (1x) units, drawn scaled by s (as Sprite does).
  local quad = love.graphics.newQuad(pos.x * atlas.px, pos.y * atlas.py, atlas.px, atlas.py, atlas.image:getDimensions())
  local canvas = love.graphics.newCanvas(w, h, { dpiscale = 1 })
  love.graphics.push('all')
  love.graphics.setCanvas(canvas)
  love.graphics.clear(0, 0, 0, 0)
  love.graphics.setColor(1, 1, 1, 1)
  love.graphics.draw(atlas.image, quad, 0, 0, 0, s, s)
  love.graphics.pop()
  local data = canvas:newImageData()
  local hsh = 5381
  for y = 0, h - 1, 2 do
    for x = 0, w - 1, 2 do
      local r, g, b, a = data:getPixel(x, y)
      -- A fully transparent pixel's colour is not art (lossless recompression may clear it).
      if a == 0 then r, g, b = 0, 0, 0 end
      hsh = (hsh * 33 + math.floor(r * 255) * 65536 + math.floor(g * 255) * 256 + math.floor(b * 255)
        + math.floor(a * 255) * 7) % 2147483629
    end
  end
  canvas:release()
  return hsh
end

local function find(area, key)
  for _, c in ipairs((area and area.cards) or {}) do if c.config.center.key == key then return c end end
end

local function lua_errors()
  local out = {}
  for _, l in ipairs(MP.log_ring) do if l.level == 'error' then out[#out + 1] = l.msg end end
  return out
end

describe('Release ruleset (in-engine)', function()
  after_each(function()
    if has_mp and MP.state and MP.state.session then MP.session.unmount('test') end
  end)

  IT('fetches its pack, plays ante 1 on 1.0.0 values, and draws the reworked Jokers from the release sheet', function()
    local A = MP.registry.atlas
    AP.run('prepare')
    if MP.state.session then MP.session.unmount('test') end
    expect(fetch_release_pack()).eq(true)
    expect(love.filesystem.getInfo('rmh_mp/assets/2x/release_jokers.png') ~= nil and 'art on disk').eq('art on disk')

    MP.session.mount('practice', {
      resolved = release_resolved(), deck = 'b_red', stake = 1, seed = SEED, me = 'u1',
      shape = { nemesisPairing = true, manhunt = false, teamBased = false, practice = true },
      options = { pvpStartRound = 2, theOrder = true, multiplayerJokers = true, timer = false },
    })
    -- The mount loaded the art the pack brought (it arrived after the MP pack's atlases).
    expect(A.loaded[ATLAS]).eq('image')
    expect(MP.registry.enabled('rw_mp_release_j_square')).eq(true)
    MP.session.launch(SEED)
    AP.run('wait_state', { 'BLIND_SELECT' })

    -- 1.0.0 values in the running game
    expect(G.P_CENTERS.j_8_ball.config.extra).eq(2)
    expect(G.P_CENTERS.j_sixth_sense.rarity).eq(3)
    expect(G.GAME.hands['Straight'].l_mult).eq(2)
    expect(G.GAME.hands['Flush Five'].l_chips).eq(40)

    -- Sampled reworked Jokers draw from the release sheet at their vanilla cells.
    for _, key in ipairs({ 'j_square', 'j_8_ball', 'j_mad', 'j_clever' }) do
      AP.run('give', { key })
      local card = find(G.jokers, key)
      expect(card ~= nil and key).eq(key)
      local sprite = card.children.center
      expect((sprite.atlas == G.ASSET_ATLAS[ATLAS]) and key).eq(key)
      expect(key .. ' ' .. sprite.sprite_pos.x .. ',' .. sprite.sprite_pos.y)
        .eq(key .. ' ' .. G.P_CENTERS[key].pos.x .. ',' .. G.P_CENTERS[key].pos.y)
    end
    -- Square Joker's 1.0.0 art differs from today's, and it is card-shaped.
    local sq = find(G.jokers, 'j_square')
    local pos = G.P_CENTERS.j_square.pos
    local rh, vh = cell_hash(G.ASSET_ATLAS[ATLAS], pos), cell_hash(G.ASSET_ATLAS.Joker, pos)
    expect('square art differs: ' .. tostring(rh ~= vh)).eq('square art differs: true')
    expect(string.format('square h %.3f w %.3f', sq.T.h, sq.T.w)).eq(string.format('square h %.3f w %.3f', G.CARD_H, G.CARD_W))
    expect(sq.ability.name).eq('Square Joker')
    -- The release cell each sampled card draws is its own art: non-empty, and not the Square's.
    local ball = G.P_CENTERS.j_8_ball.pos
    expect(cell_hash(G.ASSET_ATLAS[ATLAS], ball) ~= rh and '8 Ball cell').eq('8 Ball cell')
    expect(sq.ability.mp_balanced).eq(true)

    -- Ante 1: Small, Big and the Boss, with the shops between.
    for i = 1, 3 do
      AP.run('select_blind')
      AP.run('win_blind')
      AP.run('cash_out')
      if i < 3 then AP.run('leave_shop') end
    end
    expect(G.GAME.round_resets.ante).eq(2)
    -- still drawn from the release sheet after a whole ante of play
    expect(find(G.jokers, 'j_square').children.center.atlas == G.ASSET_ATLAS[ATLAS] and 'release sheet').eq('release sheet')
    expect(lua_errors()).eq({})
    report('release_art', { atlas = A.loaded[ATLAS], ante = G.GAME.round_resets.ante })

    MP.session.unmount('test')
    -- unmounted: the vanilla prototypes are back
    expect(G.P_CENTERS.j_8_ball.config.extra).eq(4)
    expect(G.P_CENTERS.j_square.atlas).eq(nil)
  end)
end)
