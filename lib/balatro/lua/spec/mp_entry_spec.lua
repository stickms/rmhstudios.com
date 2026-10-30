-- rmh_mp_entry.lua (WS3): the MULTIPLAYER button and the lazy load, with the
-- game's UI functions stubbed. The real menu is exercised in-engine (harness).

local J = require 'rmh/json'

local function setup()
  package.loaded['rmh/net'] = nil
  package.loaded['rmh_mp_entry'] = nil
  package.loaded['rmh_mp'] = nil
  local net = require 'rmh/net'
  local logs = {}
  net.log = function(m) logs[#logs + 1] = m end
  local env = { overlays = {}, exits = 0, opened = {}, logs = logs }
  RMH_WEB = { net = net, frame_hooks = {} }
  G = {
    FUNCS = {
      overlay_menu = function(a) env.overlays[#env.overlays + 1] = a; G.OVERLAY_MENU = true end,
      exit_overlay_menu = function() env.exits = env.exits + 1; G.OVERLAY_MENU = nil end,
    },
    UIT = { R = 'R', C = 'C', T = 'T', ROOT = 'ROOT' },
    C = { UI = { TEXT_LIGHT = { 1, 1, 1, 1 } } },
  }
  local function button(args)
    return { n = 'C', nodes = { { n = 'C', config = { id = args.id, button = args.button } } } }
  end
  UIBox_button = button
  create_UIBox_generic_options = function(a) return a end
  create_UIBox_main_menu_buttons = function()
    return { n = 'ROOT', nodes = { { n = 'C', nodes = { { n = 'R', nodes = {
      button({ id = 'main_menu_play' }), { n = 'C', nodes = { button({ button = 'options' }) } }, button({ id = 'collection_button' }),
    } } } }, { n = 'C', nodes = {} } } }
  end
  Game = { start_up = function() env.started = true end }
  package.preload['rmh_mp'] = function()
    env.required = (env.required or 0) + 1
    return { open = function(intent) env.opened[#env.opened + 1] = intent end }
  end
  require 'rmh_mp_entry'
  return env, net
end

local function outbox(net)
  local out = {}
  for i, l in ipairs(net.queue) do out[i] = J.decode(l) end
  return out
end

local function inbound(net, msgs)
  for _, m in ipairs(msgs) do net.dispatch(J.encode(m)) end
end

describe('mp entry', function()
  after_each(function()
    RMH_WEB, G, UIBox_button, create_UIBox_generic_options, create_UIBox_main_menu_buttons, Game = nil, nil, nil, nil, nil, nil
    package.preload['rmh_mp'] = nil
  end)

  it('adds MULTIPLAYER to the main menu bar, after Options', function()
    setup()
    local bar = create_UIBox_main_menu_buttons().nodes[1].nodes[1]
    expect(#bar.nodes).eq(4)
    expect(bar.nodes[3].nodes[1].config.id).eq('rmh_mp_button')
    expect(bar.nodes[3].nodes[1].config.button).eq('rmh_mp_open')
    expect(bar.nodes[4].nodes[1].config.id).eq('collection_button')
  end)

  it('leaves an unrecognised menu alone', function()
    setup()
    create_UIBox_main_menu_buttons = (function(orig)
      return function() return { n = 'ROOT', nodes = {} } end
    end)()
    package.loaded['rmh_mp_entry'] = nil
    require 'rmh_mp_entry'
    expect(create_UIBox_main_menu_buttons()).eq({ n = 'ROOT', nodes = {} })
  end)

  it('click: sends mp_open, shows progress, loads on ready and opens the menu', function()
    local env, net = setup()
    G.FUNCS.rmh_mp_open()
    expect(outbox(net)[1]).eq({ s = 1, t = 'mp_open', d = { intent = 'menu' } })
    expect(#env.overlays).eq(1)
    expect(#RMH_WEB.frame_hooks).eq(1)
    local st = RMH_WEB.mp_entry.st
    inbound(net, { { s = 1, t = 'mp_pack', d = { status = 'loading', progress = 0.42 } } })
    expect(st.text).eq('LOADING 42%')
    expect(env.required).eq(nil)
    inbound(net, { { s = 2, t = 'mp_pack', d = { status = 'ready' } } })
    expect(env.required).eq(1)
    expect(env.exits).eq(1)
    expect(env.opened).eq({ 'menu' })
    -- Loaded: the next click opens directly, no message, no reload.
    G.FUNCS.rmh_mp_open()
    expect(#net.queue).eq(1)
    expect(env.opened).eq({ 'menu', 'menu' })
    inbound(net, { { s = 3, t = 'mp_pack', d = { status = 'ready' } } })
    expect(env.required).eq(1)
  end)

  it('cancel keeps loading but does not open the menu', function()
    local env, net = setup()
    G.FUNCS.rmh_mp_open()
    G.FUNCS.rmh_mp_cancel()
    inbound(net, { { s = 1, t = 'mp_pack', d = { status = 'ready' } } })
    expect(env.required).eq(1)
    expect(env.opened).eq({})
    expect(env.exits).eq(1)
  end)

  it('shows an error and reports a failing MP pack without breaking the game', function()
    local env, net = setup()
    package.preload['rmh_mp'] = function() error('boom in init') end
    G.FUNCS.rmh_mp_open()
    inbound(net, { { s = 1, t = 'mp_pack', d = { status = 'error', error = 'pack-503' } } })
    expect(RMH_WEB.mp_entry.st.text).eq('MULTIPLAYER UNAVAILABLE')
    inbound(net, { { s = 2, t = 'mp_pack', d = { status = 'ready' } } })
    expect(RMH_WEB.mp_entry.st.text).eq('MULTIPLAYER FAILED TO LOAD')
    local last = outbox(net)[#net.queue]
    expect(last.t).eq('mp_log')
    expect(last.d.msg:find('boom in init', 1, true) ~= nil).truthy()
    expect(env.opened).eq({})
  end)

  it('autoload without a mounted pack waits, then opens with the intent', function()
    local env, net = setup()
    local path = os.tmpname()
    -- The entry reads /rmh/mp/autoload; point io.open there for this test.
    local real_open = io.open
    local f = real_open(path, 'wb')
    f:write('invite')
    f:close()
    io.open = function(p, m)
      if p == '/rmh/mp/autoload' then return real_open(path, m) end
      return real_open(p, m)
    end
    local ok, err = pcall(function()
      Game:start_up()
      expect(env.started).eq(true)
      expect(env.required).eq(nil)
      expect(#RMH_WEB.frame_hooks).eq(1)
      inbound(net, { { s = 1, t = 'mp_pack', d = { status = 'ready' } } })
      expect(env.opened).eq({ 'invite' })
    end)
    io.open = real_open
    os.remove(path)
    if not ok then error(err, 0) end
  end)
end)
