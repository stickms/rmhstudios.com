-- protocol.lua (generated, WS0) against the fixtures shared with TS
-- (lib/balatro/mp/__fixtures__/bridge.json + types.json; the TS half is
-- lib/balatro/mp/__tests__/contracts.test.ts). A valid fixture must pass in
-- both directions' validators; an invalid one must fail unless it is marked
-- `tsOnly` (a regex or refinement Lua does not check).

local P = require 'rmh_mp.protocol'
local J = require 'spec.json_fixture'

local types = J.read_file(RMH_SPEC.fixtures .. 'types.json', P.NULL)
local bridge = J.resolve_refs(J.read_file(RMH_SPEC.fixtures .. 'bridge.json', P.NULL), types.objects)

-- The same value with every P.NULL removed (what a nil-dropping encoder sends).
local function strip_nulls(v)
  if type(v) ~= 'table' or v == P.NULL then return v end
  local out = {}
  for k, x in pairs(v) do
    if x ~= P.NULL then out[k] = strip_nulls(x) end
  end
  return out
end

local function sorted_keys(t)
  local out = {}
  for k in pairs(t) do out[#out + 1] = k end
  table.sort(out)
  return out
end

for _, dir in ipairs({ 'l2j', 'j2l' }) do
  describe(dir, function()
    it('has a fixture for every generated type and a type for every fixture', function()
      local missing, orphan = {}, {}
      for _, t in ipairs(sorted_keys(P.SCHEMA[dir])) do
        if not bridge[dir][t] or #bridge[dir][t].valid == 0 then missing[#missing + 1] = t end
      end
      for _, t in ipairs(sorted_keys(bridge[dir])) do
        if not P.SCHEMA[dir][t] then orphan[#orphan + 1] = t end
      end
      expect(missing).eq({})
      expect(orphan).eq({})
    end)

    for _, t in ipairs(sorted_keys(bridge[dir])) do
      local set = bridge[dir][t]
      it(t .. ': accepts its valid fixtures (null or absent)', function()
        for i, d in ipairs(set.valid) do
          local ok, err = P.validate(dir, t, d)
          if not ok then error('valid #' .. i .. ': ' .. tostring(err)) end
          ok, err = P.validate(dir, t, strip_nulls(d))
          if not ok then error('valid #' .. i .. ' without nulls: ' .. tostring(err)) end
        end
      end)
      it(t .. ': rejects its invalid fixtures', function()
        for _, bad in ipairs(set.invalid) do
          if not bad.tsOnly then
            local ok = P.validate(dir, t, bad.d)
            if ok then error('accepted invalid fixture: ' .. bad.why) end
          end
        end
      end)
    end
  end)
end

describe('validate', function()
  it('rejects unknown types and directions', function()
    expect(P.validate('j2l', 'no_such_type', {})).falsy()
    expect(P.validate('sideways', 'toast', {})).falsy()
    expect(P.known('l2j', 'ui_ready')).truthy()
    expect(P.known('j2l', 'ui_ready')).falsy()
  end)

  it('treats a missing d as an empty object', function()
    expect(P.validate('l2j', 'ui_start', nil)).truthy()
    expect(P.validate('l2j', 'ui_ready', nil)).falsy()
  end)

  it('rejects non-finite numbers and arrays where objects belong', function()
    expect(P.validate('j2l', 'outcome', { o = { t = 'player_lives', player_id = 'u', lives = 1 / 0 }, hs = 1 })).falsy()
    expect(P.validate('j2l', 'vote_progress', { kind = 'seed', k = 0 / 0, n = 1 })).falsy()
    expect(P.validate('l2j', 'ui_ready', { true })).falsy()
  end)

  it('counts string length in code points, like JS for BMP text', function()
    local e = '\195\169' -- é, 2 bytes, 1 code point
    expect(P.validate('l2j', 'ui_chat', { text = string.rep(e, 500) })).truthy()
    expect(P.validate('l2j', 'ui_chat', { text = string.rep(e, 501) })).falsy()
  end)

  it('accepts a decoder-specific null sentinel once registered', function()
    local sentinel = {}
    local d = { status = 'loading' }
    expect(P.validate('j2l', 'mp_pack', d)).truthy()
    P.set_null(sentinel)
    expect(P.validate('j2l', 'replay_view', { playing = sentinel })).truthy()
    P.set_null(P.NULL)
  end)

  it('returns a path to the failing field', function()
    local ok, err = P.validate('j2l', 'lobby_view', { state = {}, me = 'u', isHost = true, canStart = false })
    expect(ok).falsy()
    expect(err:find('lobby_view.state.', 1, true) ~= nil).truthy()
  end)
end)

describe('constants', function()
  it('carries the protocol version, type names, enums, paths and limits', function()
    expect(P.VERSION).eq(1)
    expect(P.L2J.ui_ready).eq('ui_ready')
    expect(P.J2L.lobby_view).eq('lobby_view')
    expect(P.ENTRY_L2J).eq({ 'mp_log', 'mp_open' })
    expect(P.ENTRY_J2L).eq({ 'mp_pack' })
    expect(P.ENUM.queueMode).eq({ 'pvp_nemesis', 'pvp_royale', 'pvp_manhunt', 'pvp_teams', 'pvp_smallworld' })
    expect(P.PATHS.IN).eq('/rmh/net/in')
    expect(P.PATHS.MP_RUN).eq('/rmh/mp/run.jkr')
    expect(P.LIMITS.LINE_MAX_BYTES).eq(65536)
  end)
end)
