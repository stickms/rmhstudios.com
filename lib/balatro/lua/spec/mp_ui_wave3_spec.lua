-- WS10 wave-3 fixes: queue_view drawing (searching / matched), Practice greyed while searching, the
-- mp_invited Join row, every lobby_error code localized, the party "Return to lobby XXXXXX" row
-- (MM-06), the deck picker's preview / Balanced sticker / Cocktail "Edit Deck" / stake cap, and
-- the string inventory (every k_/b_ key the UI reads is shipped localization).

local UH = require 'spec.mp_ui_helper'
local J = require 'spec.json_fixture'

local MP, G, U

local function boot()
  MP, G = UH.boot()
  U = MP.ui
  UH.recv('net_status', { hub = 'connected', account = { name = 'Alice', avatarUrl = nil } })
  MP.open('menu')
  UH.clear_sent()
end

local function bar() UH.frame(); return G.MAIN_MENU_UI.definition end

describe('ui wave 3: queue_view', function()
  before_each(boot)
  after_each(UH.teardown)

  it('draws the search status and CANCEL; matched shows MATCH FOUND and keeps everything greyed', function()
    UH.recv('queue_view', { state = 'searching', queueMode = 'pvp_nemesis', waiting = 2 })
    local b = bar()
    expect(UH.has_text(b, 'SEARCHING...')).truthy()
    expect(UH.has_text(b, '(2)')).truthy()
    expect(UH.enabled(b, 'mp_find_game')).truthy()               -- it is CANCEL now
    expect(UH.enabled(b, 'mp_practice')).falsy()
    UH.recv('queue_view', { state = 'matched', queueMode = 'pvp_nemesis' })
    b = bar()
    expect(UH.has_text(b, 'MATCH FOUND!')).truthy()
    expect(UH.enabled(b, 'mp_find_game')).falsy()
    expect(UH.enabled(b, 'mp_practice')).falsy()
    expect(UH.enabled(b, 'mp_create_lobby')).falsy()
    G.FUNCS.rmh_mp_practice()
    expect(U.screen).eq('pvp')
    expect(U.toasts[#U.toasts].key).eq('rmh_mp_ui_practice_queued')
    UH.recv('queue_view', { state = 'cancelled', queueMode = 'pvp_nemesis' })
    b = bar()
    expect(UH.find(b, 'mp_queue_status')).eq(nil)
    expect(UH.enabled(b, 'mp_practice')).truthy()
  end)

  it('the Practice pillars and run setup refuse while matched', function()
    UH.recv('queue_view', { state = 'matched', queueMode = 'pvp_royale' })
    U.run_setup.open('practice', { ruleset = 'ruleset_mp_balanced' })
    expect(U.run_setup.submit()).eq(nil)
    expect(#UH.sent('ui_practice')).eq(0)
  end)
end)

describe('ui wave 3: invites', function()
  before_each(boot)
  after_each(UH.teardown)

  it('mp_invited shows a toast and a Join row; Join sends ui_join {code}', function()
    UH.recv('toast', { key = 'mp_invited', vars = { name = 'Bob', code = 'XYZ234' } })
    expect(U.toasts[#U.toasts].text).eq('Bob invited you')
    UH.frame()
    local panel = U.boxes.panel.definition
    expect(UH.has_text(panel, 'Bob invited you')).truthy()
    UH.click(panel, 'mp_invite_join')
    expect(UH.sent('ui_join')[1].d).eq({ code = 'XYZ234' })
    expect(U.model.invite).eq(nil)
    UH.frame()
    expect(UH.find(U.boxes.panel.definition, 'mp_invite')).eq(nil)
  end)

  it('Dismiss forgets it; a malformed code is ignored; Join is refused while searching', function()
    UH.recv('toast', { key = 'mp_invited', vars = { name = 'Bob', code = 'nope' } })
    expect(U.model.invite).eq(nil)
    UH.recv('toast', { key = 'mp_invited', vars = { name = 'Cy', code = 'ABC234' } })
    UH.frame()
    UH.click(U.boxes.panel.definition, 'mp_invite_dismiss')
    expect(U.model.invite).eq(nil)
    UH.recv('toast', { key = 'mp_invited', vars = { name = 'Cy', code = 'ABC234' } })
    UH.recv('queue_view', { state = 'searching', queueMode = 'pvp_nemesis' })
    G.FUNCS.rmh_mp_invite_join()
    expect(#UH.sent('ui_join')).eq(0)
    -- A18: the queue guard; Stay Queued keeps the invite and the search
    local def, name = UH.overlay()
    expect(name).eq('queue_guard')
    UH.click(def, 'overlay_menu_back_button')
    expect(#UH.sent('ui_join')).eq(0)
    expect(U.model.queue.state).eq('searching')
    expect(U.model.invite ~= nil).truthy()
    -- Leave Queue & Continue: the search ends, then the join goes through
    G.FUNCS.rmh_mp_invite_join()
    UH.click((UH.overlay()), 'mp_qguard_leave_play')
    expect(UH.sent('ui_queue')[1].d).eq({ op = 'leave', queueMode = 'pvp_nemesis' })
    expect(UH.sent('ui_join')[1].d).eq({ code = 'ABC234' })
  end)
end)

describe('ui wave 3: lobby_error codes', function()
  before_each(boot)
  after_each(UH.teardown)

  -- WS3 (page), WS12 (matchmaking), the session and the hub (net/events.ts).
  local TOASTED = {
    'clipboard-empty', 'clipboard-denied', 'offline',
    'practice', 'in-lobby', 'no-players', 'party-not-ready', 'party-not-host', 'party-disconnected',
    'party-too-many', 'party-started', 'party-not-party', 'full', 'not-host',
    'auth-required', 'not-found', 'started', 'rate-limited', 'invalid', 'room-limit', 'host-refused',
    'practice-busy', 'queued', 'start-started', 'start-setup', 'start-players', 'start-disconnected', 'start-ready',
  }

  it('every code has its own shipped, translatable line', function()
    local root = RMH_SPEC.root or ''
    local extra = J.read_file(root .. 'data/balatro-mp/extra-strings.en-us.json')
    local mod = J.read_file(root .. 'data/balatro-mp/localization/en-us.json')
    for _, code in ipairs(TOASTED) do
      local text, key = U.overlays.error_text(code)
      expect({ code = code, generic = key == 'rmh_mp_ui_err_generic' }).eq({ code = code, generic = false })
      expect({ code = code, shipped = (extra.misc.dictionary[key] or mod.misc.dictionary[key]) ~= nil })
        .eq({ code = code, shipped = true })
      expect(text ~= key).truthy()
      U.overlays.error(code)
      expect(U.toasts[#U.toasts].key).eq(key)
    end
  end)

  it('version-mismatch, seat-held, kicked, forfeited and lost-lobby codes open dialogs', function()
    local cases = { ['version-mismatch'] = 'version_mismatch', ['seat-held:ABC234'] = 'seat_held', kicked = 'kicked',
      forfeited = 'forfeited', ['host-lost'] = 'connection_lost', ['host-closed'] = 'connection_lost',
      expired = 'connection_lost', closed = 'connection_lost', disconnected = 'connection_lost' }
    for code, name in pairs(cases) do
      U.overlays.error(code)
      local _, shown = UH.overlay()
      expect({ code = code, overlay = shown }).eq({ code = code, overlay = name })
    end
  end)

  it('an unknown code still shows the generic line with the code', function()
    local before = #U.toasts
    UH.recv('lobby_error', { code = 'weird-thing' })
    expect(#U.toasts).eq(before + 1)
    expect(U.toasts[#U.toasts].text).eq('Something went wrong (weird-thing)')
  end)

  it('the host start-block line is localized', function()
    UH.recv('lobby_view', UH.view({ players = 1, canStart = false, startBlockReason = 'players' }))
    UH.frame()
    expect(UH.has_text(G.MAIN_MENU_UI.definition, 'Waiting for more players')).truthy()
  end)

  it('offline reasons are localized', function()
    UH.recv('net_status', { hub = 'offline', reason = 'io server disconnect', account = { name = 'Alice', avatarUrl = nil } })
    UH.frame()
    expect(UH.has_text(U.boxes.panel.definition, 'Disconnected by the server')).truthy()
    UH.recv('net_status', { hub = 'offline', reason = 'attempt 4', account = { name = 'Alice', avatarUrl = nil } })
    UH.frame()
    expect(UH.has_text(U.boxes.panel.definition, 'Trying to reconnect...')).truthy()
    expect(UH.has_text(U.boxes.panel.definition, 'attempt 4')).falsy()
  end)
end)

describe('ui wave 3: party Return to lobby (MM-06)', function()
  before_each(boot)
  after_each(UH.teardown)

  local function party_then_casual()
    local p = UH.view({ players = 2, state = { kind = 'party', code = 'PARTY2' } })
    UH.recv('lobby_view', p)
    expect(U.model.party).eq(nil)
    local c = UH.view({ players = 3, state = { kind = 'casual', code = 'CASUA2' } })
    UH.recv('lobby_view', c)
  end

  it('a matched party is remembered; after leaving the match lobby the row rejoins its code', function()
    party_then_casual()
    expect(U.model.party).eq({ code = 'PARTY2', host = true })
    U.leave_lobby()
    local b = bar()
    expect(UH.has_text(b, 'Return to lobby PARTY2')).truthy()
    UH.click(b, 'mp_party_return')
    expect(UH.sent('ui_join')[1].d).eq({ code = 'PARTY2' })
    -- Back in the party: it is the lobby on screen, not a row any more.
    UH.recv('lobby_view', UH.view({ players = 1, state = { kind = 'party', code = 'PARTY2' } }))
    expect(U.model.party).eq(nil)
  end)

  it('no row while searching, in a lobby, or for a party left on purpose', function()
    party_then_casual()
    expect(UH.find(bar(), 'mp_party_return')).eq(nil)                 -- still in the casual lobby
    U.leave_lobby()
    UH.recv('queue_view', { state = 'searching', queueMode = 'pvp_nemesis' })
    expect(UH.find(bar(), 'mp_party_return')).eq(nil)
    expect(G.FUNCS.rmh_mp_party_return()).eq(false)
    UH.recv('queue_view', { state = 'cancelled', queueMode = 'pvp_nemesis' })
    UH.recv('lobby_view', UH.view({ players = 2, state = { kind = 'party', code = 'OTHER2' } }))
    U.leave_lobby()
    expect(U.model.party).eq(nil)
    expect(UH.find(bar(), 'mp_party_return')).eq(nil)
  end)
end)

describe('ui wave 3: deck picker', function()
  before_each(boot)
  after_each(function()
    _G.Back = nil
    UH.teardown()
  end)

  it('caps the stakes and clamps the current one', function()
    expect(U.run_setup.stake_cap('ruleset_mp_balanced')).eq(8)
    G.P_CENTER_POOLS.Stake = { {}, {}, {}, {}, {} }
    expect(U.run_setup.stake_cap('ruleset_mp_balanced')).eq(5)
    U.run_setup.open('practice', { ruleset = 'ruleset_mp_balanced', stake = 8 })
    expect(U.run_setup.st.stake).eq(5)
    local def = UH.overlay()
    expect(UH.cycle(def, 'mp_rs_stake', 5)).truthy()
    G.P_CENTER_POOLS.Stake = nil
  end)

  it('shows the Cocktail "Edit Deck" button only for the Cocktail Deck; closing the editor comes back', function()
    local opened = 0
    local real = G.FUNCS.mp_cocktail_edit
    G.FUNCS.mp_cocktail_edit = function() opened = opened + 1 end
    U.run_setup.open('practice', { ruleset = 'ruleset_mp_balanced', deck = 'b_red' })
    expect(UH.find(UH.overlay(), 'mp_rs_cocktail_edit')).eq(nil)
    local has = false
    for _, k in ipairs(U.run_setup.st.decks) do if k == 'b_mp_cocktail' then has = true end end
    expect(has).truthy()
    U.run_setup.st.deck = 'b_mp_cocktail'
    U.run_setup.show()
    local def, name = UH.overlay()
    expect(name).eq('run_setup')
    expect(UH.has_text(def, 'Edit Deck')).truthy()
    UH.click(def, 'mp_rs_cocktail_edit')
    expect(opened).eq(1)
    U.cocktail_back()
    local _, back = UH.overlay()
    expect(back).eq('run_setup')
    expect(U.run_setup.st.deck).eq('b_mp_cocktail')
    G.FUNCS.mp_cocktail_edit = real
  end)

  it('cycling the deck redraws the picker', function()
    U.run_setup.open('practice', { ruleset = 'ruleset_mp_balanced', deck = 'b_red' })
    local before = #UH.overlays
    UH.cycle(UH.overlay(), 'mp_rs_deck', 2)
    expect(#UH.overlays).eq(before + 1)
    expect(U.run_setup.st.deck).eq(U.run_setup.st.decks[2])
  end)

  it('previews the deck face down and draws the Balanced sticker through MP.content.decks', function()
    _G.Back = function(center) return { effect = { center = center } } end
    G.P_CENTERS.c_base = G.P_CENTERS.c_base or { key = 'c_base', set = 'Default', config = {} }
    local D = MP.content.decks
    local calls = {}
    local real = D.draw_balanced
    D.draw_balanced = function(card, center) calls[#calls + 1] = center.key end
    U.run_setup.open('practice', { ruleset = 'ruleset_mp_balanced', deck = 'b_mp_cocktail' })
    expect(UH.find(UH.overlay(), 'mp_rs_preview') ~= nil).truthy()
    local card = U.run_setup.preview_area.cards[1]
    expect(card.sprite_facing).eq('back')
    expect(card.params.viewed_back).eq(true)
    expect(G.GAME.viewed_back.effect.center.key).eq('b_mp_cocktail')
    card:draw()
    expect(calls).eq({ 'b_mp_cocktail' })
    D.draw_balanced = real
  end)
end)

describe('ui wave 3: string inventory', function()
  it('every k_/b_ key the UI reads is shipped localization (translatable)', function()
    local root = RMH_SPEC.root or ''
    local have = {}
    for _, f in ipairs({ 'data/balatro-mp/extra-strings.en-us.json', 'data/balatro-mp/localization/en-us.json' }) do
      local t = J.read_file(root .. f)
      for _, cat in pairs(t.misc or {}) do for k in pairs(cat) do have[k] = true end end
    end
    local vanilla = assert(io.open(root .. 'data/balatro/localization/en-us.lua')):read('*a')
    local missing = {}
    for _, f in ipairs({ 'theme', 'widgets', 'menu', 'overlays', 'pillars', 'practice_menu', 'run_setup', 'lobby',
      'lobby_options', 'setup', 'chat', 'settings', 'collection', 'shortcuts', 'cocktail_edit' }) do
      local src = assert(io.open(root .. 'lib/balatro/lua/mp/rmh_mp/ui/' .. f .. '.lua')):read('*a')
      -- (b_mp_* are deck keys, not text.)
      for key in src:gmatch("'([kb]_[a-z0-9_]+)'") do
        local ok = key:match('^b_mp_') or have[key] or vanilla:find('%f[%w_]' .. key .. '%s*=') ~= nil
        if not ok then missing[#missing + 1] = f .. ':' .. key end
      end
      for key in src:gmatch("'(rmh_mp_ui_[a-z0-9_]+)'") do
        if not key:match('_$') and not have[key] then missing[#missing + 1] = f .. ':' .. key end
      end
    end
    expect(table.concat(missing, ' ')).eq('')
  end)
end)
