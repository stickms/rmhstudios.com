-- L2 in-engine: MP objects draw their own art (the owner's "every MP joker has the same art").
--
-- Cards are built straight from unmounted prototypes, exactly as the Multiplayer collection
-- builds them (no session mounted: the always-on atlas post-step must do it, not the session
-- dispatch). For each sampled object the card's sprite must sit on its MP atlas, loaded from the
-- pack (not a placeholder alias), at the def's pos, and the pixels its quad cuts out of the atlas
-- image must differ from every other sample's and from the vanilla Joker's.
--
-- Needs the MP pack (`?mp=1`); without it the file reports one skipped test.

local has_mp = love.filesystem.getInfo('rmh_mp/init.lua') ~= nil
local IT = has_mp and it or xit

local SAMPLES = {
  'j_mp_pacifist', 'j_mp_taxes', 'j_mp_defensive_joker', 'j_mp_speedrun', 'j_mp_conjoined_joker',
  'j_mp_castle_sandbox', 'j_mp_forklift_sandbox', 'j_mp_alloy_sandbox', 'j_mp_error_sandbox_1',
  'c_mp_asteroid', 'c_mp_trap_glyph_of_warding', 'c_mp_trap_web', 'b_mp_violet', 'b_mp_cocktail',
  'b_mp_echodeck', 'p_mp_trap_normal', 'p_mp_trap_jumbo', 'p_mp_standard_giga',
}

-- A hash of the pixels a sprite's quad cuts out of its atlas image, drawn 1:1 into a canvas.
local function cell_hash(sprite)
  local atlas = sprite.atlas
  local s = (G.SETTINGS.GRAPHICS and G.SETTINGS.GRAPHICS.texture_scaling) or 2
  local w, h = atlas.px * s, atlas.py * s
  local canvas = love.graphics.newCanvas(w, h, { dpiscale = 1 })
  love.graphics.push('all')
  love.graphics.setCanvas(canvas)
  love.graphics.clear(0, 0, 0, 0)
  love.graphics.setColor(1, 1, 1, 1)
  love.graphics.draw(atlas.image, sprite.sprite, 0, 0, 0, s, s)
  love.graphics.pop()
  local data = canvas:newImageData()
  local hsh, opaque = 5381, 0
  for y = 0, h - 1, 2 do
    for x = 0, w - 1, 2 do
      local r, g, b, a = data:getPixel(x, y)
      if a > 0 then opaque = opaque + 1 end
      hsh = (hsh * 33 + math.floor(r * 255) * 65536 + math.floor(g * 255) * 256 + math.floor(b * 255)) % 2147483629
    end
  end
  canvas:release()
  return hsh, opaque
end

local function build(proto)
  local w, h = G.CARD_W, G.CARD_H
  return Card(0, 0, w, h, nil, proto, { bypass_discovery_center = true, bypass_discovery_ui = true, discover = false })
end

describe('MP art (in-engine)', function()
  IT('cards built from unmounted prototypes draw distinct MP art', function()
    local MP = require('rmh_mp')
    if MP.state.session then MP.session.unmount('test') end
    expect(MP.registry.mounted()).eq(false)
    local A = MP.registry.atlas
    local seen, hashes = {}, {}
    local vanilla = build(G.P_CENTERS.j_joker)
    local vh = cell_hash(vanilla.children.center)
    vanilla:remove()
    for _, key in ipairs(SAMPLES) do
      local proto = MP.registry.proto(key)
      expect(proto ~= nil and key).eq(key)
      local card = build(proto)
      local sprite = card.children.center
      expect((sprite.atlas == G.ASSET_ATLAS[proto.atlas]) and key).eq(key)
      expect(key .. ' ' .. tostring(A.loaded[proto.atlas])).eq(key .. ' image')
      expect(key .. ' ' .. sprite.sprite_pos.x .. ',' .. sprite.sprite_pos.y).eq(key .. ' ' .. proto.pos.x .. ',' .. proto.pos.y)
      local hsh, opaque = cell_hash(sprite)
      card:remove()
      hashes[key] = hsh
      expect(opaque > 0 and key).eq(key)
      expect(hsh ~= vh and key).eq(key)
      expect(seen[hsh] == nil and key or (key .. ' looks like ' .. seen[hsh])).eq(key)
      seen[hsh] = key
    end
    report('art_hashes', hashes)
  end)
end)
