-- rmh_quit.lua: Options -> QUIT, with the game's UI functions stubbed. The real menu is
-- exercised in-engine (harness).

local function setup(stage)
  package.loaded['rmh_quit'] = nil
  G = {
    FUNCS = {},
    STAGE = stage,
    STAGES = { MAIN_MENU = 'main', RUN = 'run' },
  }
  localize = function(key) return key == 'b_quit_cap' and 'QUIT' or key end
  UIBox_button = function(args)
    return { n = 'R', nodes = { { n = 'C', config = { id = args.id, button = args.button, label = args.label[1] } } } }
  end
  local function row(button) return UIBox_button({ button = button, label = { button } }) end
  create_UIBox_options = function()
    -- The real one is a constructor with holes (seed, restart, main menu, collection are nil
    -- on the main menu): { settings, nil, nil, nil, stats, nil, customize, credits }.
    local rows = stage == 'main'
      and { row('settings'), nil, nil, nil, row('high_scores'), nil, row('customize_deck'), row('show_credits') }
      or { row('settings'), nil, row('high_scores') }
    return { n = 'ROOT', nodes = { { n = 'C', nodes = { { n = 'C', nodes = rows } } } } }
  end
  require 'rmh_quit'
end

local function rows(def)
  local out = {}
  local list = def.nodes[1].nodes[1].nodes
  for i = 1, table.maxn(list) do
    if list[i] ~= nil then out[#out + 1] = list[i] end
  end
  return out
end

describe('options quit', function()
  after_each(function()
    G, localize, UIBox_button, create_UIBox_options = nil, nil, nil, nil
    package.loaded['rmh_quit'] = nil
  end)

  it('adds QUIT under Credits on the main menu', function()
    setup('main')
    local r = rows(create_UIBox_options())
    expect(#r).eq(5)
    expect(r[1].nodes[1].config.button).eq('settings')
    expect(r[4].nodes[1].config.button).eq('show_credits')
    expect(r[5].nodes[1].config.id).eq('rmh_quit_button')
    expect(r[5].nodes[1].config.button).eq('rmh_quit')
    expect(r[5].nodes[1].config.label).eq('QUIT')
  end)

  it('stays out of a run (the pause menu never offers it)', function()
    setup('run')
    expect(#rows(create_UIBox_options())).eq(2)
  end)

  it('writes /rmh/quit for the page when pressed', function()
    setup('main')
    local written = {}
    local real_open = io.open
    io.open = function(path, mode)
      if path == '/rmh/quit' then
        return { write = function(_, d) written[#written + 1] = d end, close = function() end }
      end
      return real_open(path, mode)
    end
    local ok, err = pcall(G.FUNCS.rmh_quit)
    io.open = real_open
    expect(ok).truthy()
    expect(err).eq(nil)
    expect(written).eq({ '1' })
  end)
end)
