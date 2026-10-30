-- WS6 registry: define / mount / unmount isolation, gates, reworks, dispatch, atlases, loc.

local H = require 'spec.mp_helper'
local J = require 'spec.json_fixture'

local function define_sample(R)
  R.define({ key = 'j_mp_alpha', kind = 'Joker', rarity = 1, cost = 4, config = { extra = 3 } })
  R.define({ key = 'j_mp_beta', kind = 'Joker', rarity = 2, gate = { layers = { 'standard' } } })
  R.define({ key = 'j_mp_hanging_chad', kind = 'Joker', rarity = 1, gate = { layers = { 'standard' } },
    silent_replaces = 'j_hanging_chad', balanced = true })
  R.define({ key = 'j_mp_inactive', kind = 'Joker', rarity = 1, pool = false })
  R.define({ key = 'c_mp_asteroid', kind = 'Planet', cost = 3, config = { hand_type = 'High Card' } })
  R.define({ key = 'c_mp_trap_alarm', kind = 'Trap', gate = { layers = { 'traps' } } })
  R.define({ key = 'p_mp_trap_normal', kind = 'Booster', weight = 1, booster_kind = 'Trap', gate = { layers = { 'traps' } } })
  R.define({ key = 'b_mp_violet', kind = 'Back', config = { vouchers = {} } })
  R.define({ key = 'v_mp_test', kind = 'Voucher' })
  R.define({ key = 'tag_mp_gambling', kind = 'Tag', tag = { config = { type = 'immediate' } } })
  R.define({ key = 'bl_mp_nemesis', kind = 'Blind', blind = { dollars = 5, mult = 1, boss = { min = 1, max = 10 } } })
  R.define({ key = 'c_mp_eeeee', kind = 'Challenge', challenge = { rules = { custom = {}, modifiers = {} } } })
  R.define({ key = 'm_glass_mp_rework', kind = 'Rework', gate = { layers = { 'standard' } }, balanced = true,
    rework = { center = 'm_glass', props = { config = { Xmult = 1.5 } } } })
end

describe('MP.registry', function()
  local MP, R
  before_each(function()
    MP = H.fresh()
    R = MP.registry
  end)
  after_each(H.teardown)

  it('assigns stable orders from definition order and rejects duplicates', function()
    define_sample(R)
    expect(R.get('j_mp_alpha').order).eq(1001)
    expect(R.get('j_mp_beta').order).eq(1002)
    expect(R.proto('j_mp_alpha').name).eq('j_mp_alpha')            -- name = key (§0.8)
    expect(R.proto('j_mp_alpha').unlocked).eq(true)
    expect(R.proto('j_mp_alpha').discovered).eq(true)
    expect(function() R.define({ key = 'j_mp_alpha', kind = 'Joker' }) end).error('duplicate key')
    expect(function() R.define({ key = 'x', kind = 'Nope' }) end).error('unknown kind')
    expect(R.is_mp('j_mp_alpha')).truthy()
    expect(R.is_mp('m_glass_mp_rework')).falsy()
  end)

  it('keeps every vanilla table free of MP keys outside a session', function()
    define_sample(R)
    expect(R.leaked_keys()).eq({})
    expect(G.P_CENTERS.j_mp_alpha).eq(nil)
  end)

  it('mounts gated content and restores every pool byte-identically on unmount', function()
    define_sample(R)
    local before = H.fingerprint()
    local glass_cfg = G.P_CENTERS.m_glass.config
    local m = R.mount(H.resolved({ layers = { 'standard', 'traps' } }), { options = H.options() })
    expect(G.P_CENTERS.j_mp_alpha ~= nil).truthy()
    expect(G.P_BLINDS.bl_mp_nemesis ~= nil).truthy()
    expect(G.P_TAGS.tag_mp_gambling ~= nil).truthy()
    expect(G.P_CENTER_POOLS.Trap ~= nil).truthy()
    expect(m.enabled.j_mp_beta).eq(true)
    expect(m.enabled.j_mp_inactive).eq(nil)            -- pool = false: in P_CENTERS, never pooled
    local commons = G.P_JOKER_RARITY_POOLS[1]
    expect(commons[#commons].key).eq('j_mp_hanging_chad')
    -- The vanilla Joker collection pool is untouched (the MP collection is its own page).
    for _, v in ipairs(G.P_CENTER_POOLS.Joker) do expect(R.is_mp(v.key)).falsy() end
    expect(G.P_CENTER_POOLS.Tarot_Planet[#G.P_CENTER_POOLS.Tarot_Planet].key).eq('c_mp_asteroid')
    for _, v in ipairs(G.P_CENTER_POOLS.Consumeables) do expect(v.key ~= 'c_mp_trap_alarm').truthy() end
    expect(G.P_BLINDS.bl_mp_nemesis.boss).eq(nil)      -- never in boss rolls
    expect(G.P_CENTERS.m_glass.config.Xmult).eq(1.5)  -- rework swapped in
    expect(G.P_CENTERS.m_glass.config.extra).eq(4)    -- untouched siblings stay
    expect(G.P_CENTERS.m_glass.config.mp_balanced).eq(true)
    expect(G.CHALLENGES[#G.CHALLENGES].id).eq('c_mp_eeeee')
    expect(#R.leaked_keys() > 0).truthy()

    R.unmount()
    expect(R.leaked_keys()).eq({})
    expect(H.fingerprint()).eq(before)
    expect(G.P_CENTERS.m_glass.config == glass_cfg).truthy()
    expect(G.P_CENTERS.m_glass.config).eq({ Xmult = 2, extra = 4 })
    expect(G.P_CENTER_POOLS.Trap).eq(nil)
    expect(MP.mounted).eq(false)
  end)

  it('survives repeated mount/unmount cycles and remounts', function()
    define_sample(R)
    local before = H.fingerprint()
    for _ = 1, 5 do
      R.mount(H.resolved({ layers = { 'standard' } }))
      R.mount(H.resolved({ layers = {} }))      -- remount = unmount first
      R.unmount()
    end
    expect(H.fingerprint()).eq(before)
    expect(R.unmount()).eq(false)
  end)

  it('applies the isolation gate (multiplayerContent and the multiplayerJokers option)', function()
    define_sample(R)
    local m = R.mount(H.resolved({ multiplayerContent = false }))
    expect(m.enabled.j_mp_alpha).eq(nil)
    expect(G.P_CENTERS.j_mp_alpha ~= nil).truthy()       -- registered (cards can be built) …
    for _, v in ipairs(G.P_JOKER_RARITY_POOLS[1]) do expect(v.key ~= 'j_mp_alpha').truthy() end -- … not pooled
    R.unmount()
    m = R.mount(H.resolved(), { options = H.options({ multiplayerJokers = false }) })
    expect(m.enabled.j_mp_alpha).eq(nil)
    R.unmount()
    m = R.mount(H.resolved({ multiplayerContent = false, included = { 'j_mp_alpha' } }))
    expect(m.enabled.j_mp_alpha).eq(true)                -- included wins
    expect(m.enabled.j_mp_beta).eq(nil)                  -- layer gate closed
    expect(m.enabled.m_glass_mp_rework).eq(nil)
    expect(G.P_CENTERS.m_glass.config.Xmult).eq(2)
    R.unmount()
  end)

  it('include functions and reworked lists open gates', function()
    R.define({ key = 'j_mp_fn', kind = 'Joker', gate = { include = function(s) return s and s.kind == 'practice' end } })
    R.define({ key = 'j_mp_rw', kind = 'Joker', gate = { layers = { 'nothing' } } })
    local m = R.mount(H.resolved({ reworked = { 'j_mp_rw' } }), { kind = 'practice' })
    expect(m.enabled.j_mp_fn).eq(true)
    expect(m.enabled.j_mp_rw).eq(true)
    R.unmount()
    m = R.mount(H.resolved(), { kind = 'match' })
    expect(m.enabled.j_mp_fn).eq(nil)
    R.unmount()
  end)

  it('refuses a key collision with vanilla and leaves nothing behind', function()
    R.define({ key = 'j_mp_ok', kind = 'Joker' })
    R.define({ key = 'j_joker', kind = 'Joker' })
    local before = H.fingerprint()
    expect(function() R.mount(H.resolved()) end).error('already present')
    expect(R.mounted()).falsy()
    expect(H.fingerprint()).eq(before)
    expect(G.P_CENTERS.j_mp_ok).eq(nil)
  end)

  it('cannot define while mounted', function()
    R.mount(H.resolved())
    expect(function() R.define({ key = 'j_mp_late', kind = 'Joker' }) end).error('mounted')
    R.unmount()
  end)

  it('removes the session dispatch wraps on unmount', function()
    _G.Card = { calculate_joker = function() return 'vanilla' end, generate_UIBox_ability_table = function() end,
      use_consumeable = function() end, can_use_consumeable = function() return false end,
      add_to_deck = function(self) self.added_to_deck = true end, remove_from_deck = function(self) self.added_to_deck = false end,
      calculate_dollar_bonus = function() end, open = function() end, update = function() end,
      set_sprites = function() end, set_ability = function(self, c) self.config = { center = c }; self.ability = {} end }
    local orig = Card.calculate_joker
    local calls = {}
    R.define({ key = 'j_mp_disp', kind = 'Joker', calc = function(card, ctx) return { mult_mod = ctx.n } end,
      add = function() calls[#calls + 1] = 'add' end, dollar_bonus = function() return 3 end })
    R.mount(H.resolved())
    local card = { config = { center = G.P_CENTERS.j_mp_disp }, ability = { set = 'Joker' } }
    expect(Card.calculate_joker(card, { n = 7 })).eq({ mult_mod = 7 })
    card.debuff = true
    expect(Card.calculate_joker(card, { n = 7 })).eq(nil)
    card.debuff = false
    card.ability.mp_phantom = true
    expect(Card.calculate_joker(card, { n = 7 })).eq(nil)      -- phantoms never calculate
    card.ability.mp_phantom = nil
    Card.add_to_deck(card)
    Card.add_to_deck(card)                                     -- second add is not a new add
    expect(calls).eq({ 'add' })
    expect(Card.calculate_dollar_bonus(card)).eq(3)
    local vcard = { config = { center = G.P_CENTERS.j_joker }, ability = {} }
    expect(Card.calculate_joker(vcard, {})).eq('vanilla')
    local balanced = { }
    Card.set_ability(balanced, G.P_CENTERS.j_mp_disp)
    R.unmount()
    expect(Card.calculate_joker == orig).truthy()
    _G.Card = nil
  end)

  it('hides MP tags/blinds from the fixed vanilla collection grids', function()
    local seen
    _G.create_UIBox_your_collection_tags = function()
      seen = {}
      for k in pairs(G.P_TAGS) do seen[#seen + 1] = k end
      return 'ui'
    end
    R.define({ key = 'tag_mp_x', kind = 'Tag' })
    R.mount(H.resolved())
    expect(create_UIBox_your_collection_tags()).eq('ui')
    for _, k in ipairs(seen) do expect(k ~= 'tag_mp_x').truthy() end
    expect(G.P_TAGS.tag_mp_x ~= nil).truthy()                 -- restored after the build
    R.unmount()
    _G.create_UIBox_your_collection_tags = nil
  end)
end)

describe('MP.registry.atlas', function()
  local MP, A
  before_each(function()
    MP = H.fresh()
    A = MP.registry.atlas
    G.ASSET_ATLAS = { Joker = { name = 'Joker', px = 71, py = 95 }, Tarot = { name = 'Tarot', px = 71, py = 95 }, tags = { name = 'tags' } }
    G.ANIMATION_ATLAS = { blind_chips = { name = 'blind_chips', px = 34, py = 34, frames = 21 } }
  end)
  after_each(H.teardown)

  it('reads the WS2 registry and aliases placeholders for files that are not in the pack', function()
    local reg = J.read_file(RMH_SPEC.root .. 'data/balatro-mp/atlases.json')
    expect(A.set_registry(reg)).truthy()
    A.install()
    expect(G.ASSET_ATLAS.mp_j_pacifist == G.ASSET_ATLAS.Joker).truthy()
    expect(G.ANIMATION_ATLAS.mp_player_blind_chip == G.ANIMATION_ATLAS.blind_chips).truthy()
    expect(A.loaded.mp_j_pacifist).eq('placeholder')
    expect(A.tag_pos('mp_tag_gambling_sandbox')).eq(nil)
  end)

  it('drops malformed entries', function()
    A.set_registry({ atlases = { mp_ok = { file = 'a.png', px = 1, py = 1, kind = 'card', placeholder = 'Joker' },
      bad = { file = 'b.png', px = 1, py = 1, kind = 'card' }, mp_bad = { file = 3 } } })
    expect(A.entry('mp_ok') ~= nil).truthy()
    expect(A.entry('bad')).eq(nil)
    expect(A.entry('mp_bad')).eq(nil)
  end)

  it('points a card sprite at the MP atlas after set_sprites', function()
    A.set_registry({ stub = false, atlases = { mp_x = { file = 'x.png', px = 71, py = 95, kind = 'card', placeholder = 'Joker' } } })
    G.ASSET_ATLAS.mp_x = { name = 'mp_x', px = 71, py = 95 }
    A.loaded.mp_x = 'image'
    local sprite = { set_sprite_pos = function(s, p) s.pos = p end }
    local card = { children = { center = sprite }, params = {} }
    A.apply_card(card, { atlas = 'mp_x', pos = { x = 2, y = 1 }, discovered = true })
    expect(sprite.atlas.name).eq('mp_x')
    expect(sprite.pos).eq({ x = 2, y = 1 })
  end)
end)

describe('MP.registry.loc', function()
  local MP
  before_each(function() MP = H.fresh() end)
  after_each(H.teardown)

  it('adds MP text without overwriting vanilla text, falling back to en-us', function()
    local R = MP.registry
    R.define({ key = 'j_mp_text', kind = 'Joker', loc = { name = 'Inline', text = { 'a' } } })
    G.localization.descriptions.Joker.j_joker = { name = 'Joker', text = { 'vanilla' } }
    R.loc.add('en-us', { descriptions = { Joker = { j_joker = { name = 'HACK', text = {} } } },
      misc = { dictionary = { k_mp_lobby = 'Lobby' } } })
    R.loc.add('fr', { misc = { dictionary = { k_mp_lobby = 'Salon' } } })
    R.loc.merge_into(G.localization, 'fr')
    expect(G.localization.descriptions.Joker.j_joker.name).eq('Joker')
    expect(G.localization.descriptions.Joker.j_mp_text.name).eq('Inline')
    expect(G.localization.misc.dictionary.k_mp_lobby).eq('Salon')
  end)

  it('runs the merge inside init_localization', function()
    local saw
    _G.init_localization = function() saw = G.localization.descriptions.Joker.j_mp_text end
    MP.registry.define({ key = 'j_mp_text', kind = 'Joker', loc = { name = 'N', text = {} } })
    MP.registry.loc.install_core_wrap()
    init_localization()
    expect(saw.name).eq('N')
    _G.init_localization = nil
  end)
end)
