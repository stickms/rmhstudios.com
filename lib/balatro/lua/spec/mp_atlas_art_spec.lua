-- MP art (L1): every MP object resolves to its own sprite.
--
-- The owner's report "every multiplayer joker has the same art" was the Card.set_sprites post-step
-- living only in the session wraps: the Multiplayer collection (and every other Card built from an
-- unmounted prototype) fell through to vanilla, which draws a Joker from the Joker sheet at the MP
-- def's pos — {0,0}, the plain Joker, for every single-sprite MP joker. These specs pin:
--   * every def/sticker/stake/challenge-back that names an atlas names one in
--     data/balatro-mp/atlases.json, of the right kind, with its pos inside that PNG's grid, and the
--     PNG exists at 1x and 2x (2x exactly twice 1x);
--   * a def drawn from vanilla art (no atlas) has a pos inside the vanilla sheet of its set;
--   * no two defs of one kind share a sprite unless the mod does too (SHARED below, one-directional:
--     an entry that no longer shares fails);
--   * the post-step is an always-on core wrap: a Card built from an unmounted prototype is drawn
--     from the MP atlas, and the Trap set (no vanilla atlas) never makes vanilla index a nil atlas.

local H = require 'spec.mp_helper'
local J = require 'rmh/json'

local ROOT = (RMH_SPEC and RMH_SPEC.root) or ''
local MP_DATA = ROOT .. 'data/balatro-mp/'
local VANILLA_TEX = ROOT .. 'data/balatro/resources/textures/'

local function read(path)
  local f = io.open(path, 'rb')
  if not f then return nil end
  local s = f:read('*a')
  f:close()
  return s
end

local function be32(s, i)
  local a, b, c, d = s:byte(i, i + 3)
  return ((a * 256 + b) * 256 + c) * 256 + d
end

--- Width and height of a PNG (its IHDR), or nil when the file is missing or not a PNG.
local function png_size(path)
  local s = read(path)
  if not s or #s < 24 or s:sub(1, 8) ~= '\137PNG\r\n\026\n' or s:sub(13, 16) ~= 'IHDR' then return nil end
  return be32(s, 17), be32(s, 21)
end

-- The vanilla sheet (and cell size) each set draws from when a def has no atlas.
local VANILLA = {
  Joker = { 'Jokers.png', 71, 95 }, Tarot = { 'Tarots.png', 71, 95 }, Planet = { 'Tarots.png', 71, 95 },
  Spectral = { 'Tarots.png', 71, 95 }, Voucher = { 'Vouchers.png', 71, 95 }, Booster = { 'boosters.png', 71, 95 },
  Back = { 'Enhancers.png', 71, 95 }, Tag = { 'tags.png', 34, 34 }, Blind = { 'BlindChips.png', 34, 34 },
}

-- Which registry `kind` a def kind may draw from.
local ATLAS_KIND = {
  Joker = 'card', Tarot = 'card', Planet = 'card', Spectral = 'card', Trap = 'card', Voucher = 'card',
  Booster = 'card', Back = 'card', Enhancement = 'card', Blind = 'animation', Tag = 'tag',
}

-- Kinds that compete for distinct art (the consumable sets share one collection tab).
local GROUP = { Tarot = 'consumable', Planet = 'consumable', Spectral = 'consumable', Trap = 'consumable' }

-- Sprites shared on purpose, exactly as the mod shares them. One-directional: each entry must
-- still be a share of exactly these keys (or a prefix family), or the spec fails.
local SHARED = {
  -- objects/jokers/sandbox/error.lua: every error decoy is drawn from j_ERROR_sandbox.png.
  { sprite = 'mp_j_ERROR_sandbox@0,0', prefix = 'j_mp_error_sandbox_' },
  -- objects/jokers/standard|experimental|sandbox ticket: the vanilla Golden Ticket cell (5,3).
  { sprite = 'vanilla:Joker@5,3', keys = { 'j_mp_ticket', 'j_mp_ticket_experimental', 'j_mp_golden_ticket_sandbox' } },
}

local function registry()
  local reg = J.decode(assert(read(MP_DATA .. 'atlases.json'), 'data/balatro-mp/atlases.json missing'))
  return reg.atlases
end

local function grid(entry)
  local w, h = png_size(MP_DATA .. '1x/' .. entry.file)
  if not w then return nil end
  return math.floor(w / entry.px), math.floor(h / entry.py), w, h
end

--- Every art reference of the booted pack: { owner, kind, atlas?, pos }.
local function references(MP)
  local refs = {}
  local R = MP.registry
  for _, def in ipairs(R.defs()) do
    if def.kind == 'Challenge' then
      local art = def.back_art or (def.extras and def.extras.back_art)
      if art then refs[#refs + 1] = { owner = def.key .. ' (back)', kind = 'Back', atlas = art.atlas, pos = art.pos, share_ok = true } end
    elseif def.kind ~= 'Rework' then
      local proto = R.proto(def.key)
      refs[#refs + 1] = { owner = def.key, kind = def.kind, atlas = proto.atlas, pos = proto.pos, def = def }
    end
  end
  local K = MP.content and MP.content.stickers
  for key, spec in pairs((K and K.SPRITES) or {}) do
    refs[#refs + 1] = { owner = key, kind = 'Sticker', atlas = spec.atlas, pos = spec.pos, atlas_kind = 'card' }
  end
  local S = MP.content and MP.content.stakes
  for _, s in ipairs((S and S.LIST) or {}) do
    refs[#refs + 1] = { owner = s.key, kind = 'Stake', atlas = s.atlas, pos = s.pos, atlas_kind = 'asset' }
  end
  return refs
end

-- The vanilla sheet a def without an atlas draws from (Tarot, Planet and Spectral share one).
local function vanilla_sheet(kind)
  if kind == 'Tarot' or kind == 'Planet' or kind == 'Spectral' then return 'Tarot' end
  return kind
end

local function sprite_id(ref)
  local p = ref.pos or {}
  local where = ref.atlas or ('vanilla:' .. vanilla_sheet(ref.kind))
  return where .. '@' .. tostring(p.x) .. ',' .. tostring(p.y)
end

describe('MP art: atlas registry files', function()
  it('every registry entry is a PNG at 1x and 2x, 2x exactly double, and holds whole cells', function()
    local bad = {}
    for key, e in pairs(registry()) do
      local files = { e.file }
      for _, v in pairs(e.variants or {}) do files[#files + 1] = v end
      for _, file in ipairs(files) do
        local w1, h1 = png_size(MP_DATA .. '1x/' .. file)
        local w2, h2 = png_size(MP_DATA .. '2x/' .. file)
        if not (w1 and w2) then bad[#bad + 1] = key .. ': ' .. file .. ' missing'
        elseif w2 ~= 2 * w1 or h2 ~= 2 * h1 then bad[#bad + 1] = key .. ': 2x is not double 1x'
        elseif w1 % e.px ~= 0 or h1 % e.py ~= 0 then
          bad[#bad + 1] = string.format('%s: %dx%d is not a whole number of %dx%d cells', key, w1, h1, e.px, e.py)
        elseif e.kind == 'animation' and w1 / e.px ~= e.frames then bad[#bad + 1] = key .. ': frame count'
        end
      end
    end
    table.sort(bad)
    expect(bad).eq({})
  end)
end)

describe('MP art: every MP object resolves to an existing cell', function()
  local MP
  before_each(function() MP = H.boot() end)
  after_each(H.teardown)

  it('names a registry atlas of the right kind, with pos inside its grid (or a vanilla cell)', function()
    local reg = registry()
    local bad, checked = {}, 0
    for _, ref in ipairs(references(MP)) do
      local p = ref.pos
      if type(p) ~= 'table' or type(p.x) ~= 'number' or type(p.y) ~= 'number' then
        bad[#bad + 1] = ref.owner .. ': no pos'
      elseif ref.atlas then
        local e = reg[ref.atlas]
        local want = ref.atlas_kind or ATLAS_KIND[ref.kind]
        if not e then bad[#bad + 1] = ref.owner .. ': unknown atlas ' .. ref.atlas
        elseif want and e.kind ~= want then bad[#bad + 1] = ref.owner .. ': atlas ' .. ref.atlas .. ' is ' .. e.kind .. ', not ' .. want
        else
          local cols, rows = grid(e)
          if e.kind == 'animation' then cols = 1 end -- x is the frame, driven by the engine
          if not cols then bad[#bad + 1] = ref.owner .. ': ' .. e.file .. ' missing'
          elseif p.x < 0 or p.y < 0 or p.x >= cols or p.y >= rows or p.x % 1 ~= 0 or p.y % 1 ~= 0 then
            bad[#bad + 1] = string.format('%s: pos %s,%s outside %s (%dx%d)', ref.owner, p.x, p.y, ref.atlas, cols, rows)
          end
        end
        checked = checked + 1
      else
        local v = VANILLA[ref.kind]
        if not v then bad[#bad + 1] = ref.owner .. ': kind ' .. ref.kind .. ' has no vanilla sheet and no atlas'
        else
          local w, h = png_size(VANILLA_TEX .. '1x/' .. v[1])
          if not w then bad[#bad + 1] = ref.owner .. ': vanilla ' .. v[1] .. ' missing'
          elseif p.x < 0 or p.y < 0 or p.x >= math.floor(w / v[2]) or p.y >= math.floor(h / v[3]) then
            bad[#bad + 1] = string.format('%s: pos %s,%s outside vanilla %s', ref.owner, p.x, p.y, v[1])
          end
        end
        checked = checked + 1
      end
    end
    table.sort(bad)
    expect(bad).eq({})
    expect(checked >= 140).truthy()
  end)

  it('every joker, consumable, deck and booster with its own art has an atlas (no vanilla fallback by accident)', function()
    -- Defs drawn from vanilla art on purpose: the mod's reworks of a vanilla card keep its sprite.
    local VANILLA_ART = {
      j_mp_hanging_chad = true, j_mp_bloodstone = true, j_mp_seltzer = true, j_mp_turtle_bean = true,
      j_mp_ticket = true, j_mp_ticket_experimental = true, j_mp_idol_rare = true, j_mp_todo_list = true,
      j_mp_golden_ticket_sandbox = true, j_mp_mime = true, j_mp_baron = true, c_mp_wraith = true, c_mp_ectoplasm_sandbox = true,
      v_mp_hieroglyph_manhunt = true, v_mp_petroglyph_manhunt = true,
      tag_mp_investment_sandbox = true, tag_mp_juggle_sandbox = true, tag_mp_ward = true,
    }
    local missing, stale = {}, {}
    local seen = {}
    for _, ref in ipairs(references(MP)) do
      if ref.def then
        seen[ref.owner] = true
        if not ref.atlas and not VANILLA_ART[ref.owner] then missing[#missing + 1] = ref.owner end
        if ref.atlas and VANILLA_ART[ref.owner] then stale[#stale + 1] = ref.owner end
      end
    end
    for k in pairs(VANILLA_ART) do if not seen[k] then stale[#stale + 1] = k end end
    table.sort(missing)
    table.sort(stale)
    expect(missing).eq({})
    expect(stale).eq({})
  end)

  it('no two objects of one kind share a sprite unless the mod shares it (SHARED)', function()
    local by = {}
    for _, ref in ipairs(references(MP)) do
      if not ref.share_ok then
        local id = (GROUP[ref.kind] or ref.kind) .. ' ' .. sprite_id(ref)
        by[id] = by[id] or {}
        table.insert(by[id], ref.owner)
      end
    end
    local function allowed(id, owners)
      for _, s in ipairs(SHARED) do
        if id:sub(-#s.sprite - 1) == ' ' .. s.sprite then
          if s.prefix then
            for _, o in ipairs(owners) do if o:sub(1, #s.prefix) ~= s.prefix then return false end end
            return true
          end
          table.sort(owners)
          local want = MP.copy(s.keys, true)
          table.sort(want)
          return table.concat(owners, ',') == table.concat(want, ',')
        end
      end
      return false
    end
    local bad, used = {}, {}
    for id, owners in pairs(by) do
      if #owners > 1 then
        if allowed(id, owners) then used[id:match(' (.*)$')] = true
        else
          table.sort(owners)
          bad[#bad + 1] = id .. ': ' .. table.concat(owners, ', ')
        end
      end
    end
    table.sort(bad)
    expect(bad).eq({})
    local stale = {}
    for _, s in ipairs(SHARED) do if not used[s.sprite] then stale[#stale + 1] = s.sprite end end
    expect(stale).eq({})
  end)
end)

describe('MP art: the set_sprites post-step is always on', function()
  local MP, A, made
  local function sprite(atlas, pos) return { atlas = atlas, pos = pos, set_sprite_pos = function(s, p) s.pos = p end } end

  before_each(function()
    made = {}
    MP = H.boot({ before = function(G)
      G.ASSET_ATLAS = { Joker = { name = 'Joker' }, Tarot = { name = 'Tarot' }, centers = { name = 'centers' }, tags = { name = 'tags' } }
      G.ANIMATION_ATLAS = { blind_chips = { name = 'blind_chips' } }
      -- Vanilla's shape: Jokers/consumables from G.ASSET_ATLAS[set] (a nil atlas raises, as Sprite does).
      _G.Card = { set_sprites = function(self, c)
        local key = (c.set == 'Joker' or c.consumeable or c.set == 'Voucher') and c.set or (c.atlas or 'centers')
        local atlas = G.ASSET_ATLAS[key]
        if not atlas then error('Sprite: nil atlas for ' .. tostring(key)) end
        self.children = { center = sprite(atlas, c.pos) }
        made[#made + 1] = self
      end }
    end })
    A = MP.registry.atlas
    -- L1 has no generated rmh_mp/data/atlases.lua: install the registry it is generated from.
    expect(A.set_registry(J.decode(read(MP_DATA .. 'atlases.json')))).eq(true)
    -- Stand in for loaded images (the fake filesystem has none, so install aliased placeholders).
    for key, e in pairs(A.registry.atlases) do
      if e.kind == 'card' then
        G.ASSET_ATLAS[key] = { name = key }
        A.loaded[key] = 'image'
      end
    end
    A.refresh_set_aliases()
  end)
  after_each(H.teardown)

  it('is installed as a core wrap (no session mounted)', function()
    expect(MP.registry.mounted()).eq(false)
    for _, key in ipairs({ 'j_mp_pacifist', 'j_mp_taxes', 'j_mp_forklift_sandbox', 'j_mp_alloy_sandbox', 'c_mp_asteroid',
      'b_mp_violet', 'p_mp_trap_jumbo' }) do
      local proto = MP.registry.proto(key)
      local card = { params = {} }
      Card.set_sprites(card, proto)
      expect(card.children.center.atlas.name .. ' ' .. key).eq(proto.atlas .. ' ' .. key)
      expect(card.children.center.pos).eq(proto.pos)
    end
  end)

  it('gives the Trap set an atlas so vanilla never indexes a nil one, and draws each trap from its cell', function()
    expect(G.ASSET_ATLAS.Trap ~= nil).truthy()
    expect(G.ASSET_ATLAS.Trap == G.ASSET_ATLAS.mp_Trap).truthy()
    local proto = MP.registry.proto('c_mp_trap_web')
    local card = { params = {} }
    Card.set_sprites(card, proto)
    expect(card.children.center.atlas == G.ASSET_ATLAS.mp_Trap).truthy()
    expect(card.children.center.pos).eq(proto.pos)
  end)

  it('re-points the Trap alias after the atlases are rebuilt (texture scaling change)', function()
    G.ASSET_ATLAS.mp_Trap = { name = 'mp_Trap', rebuilt = true }
    A.refresh_set_aliases()
    expect(G.ASSET_ATLAS.Trap.rebuilt).eq(true)
  end)

  it('leaves vanilla cards and vanilla sets alone', function()
    local card = { params = {} }
    Card.set_sprites(card, { set = 'Joker', pos = { x = 3, y = 2 } })
    expect(card.children.center.atlas.name).eq('Joker')
    expect(card.children.center.pos).eq({ x = 3, y = 2 })
    expect(G.ASSET_ATLAS.Back).eq(nil)
    expect(G.ASSET_ATLAS.Joker.name).eq('Joker')
  end)
end)
