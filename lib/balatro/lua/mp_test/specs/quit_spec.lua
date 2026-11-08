-- L2 in-engine: Options -> QUIT (lua/rmh_quit.lua) in the real Options overlay.
-- It is on the main menu only; a run's pause menu never offers it. Pressing it drops
-- /rmh/quit for the page (lib/balatro/runtime.ts).

local function overlay_has(id)
  return G.OVERLAY_MENU and G.OVERLAY_MENU.get_UIE_by_ID and G.OVERLAY_MENU:get_UIE_by_ID(id) ~= nil
end

describe('options quit', function()
  it('shows QUIT in the main menu Options and writes /rmh/quit when pressed', function()
    expect(G.STAGE).eq(G.STAGES.MAIN_MENU)
    G.FUNCS.options({})
    wait_frames(8)
    expect(overlay_has('rmh_quit_button')).truthy()
    expect(G.FUNCS.rmh_quit ~= nil).truthy()
    os.remove('/rmh/quit')
    G.FUNCS.rmh_quit()
    local f = io.open('/rmh/quit', 'rb')
    expect(f ~= nil).truthy()
    if f then f:close() end
    os.remove('/rmh/quit')
    -- Leave the overlay up so a driver can screenshot it (--shot).
  end)

  it('is not in a run\'s Options (the pause menu)', function()
    G.FUNCS.exit_overlay_menu()
    wait_frames(6)
    AP.run('start_run', { seed = 'RMHQUIT1', stake = 1 })
    G.FUNCS.options({})
    wait_frames(8)
    expect(G.OVERLAY_MENU ~= nil).truthy()
    expect(overlay_has('rmh_quit_button')).eq(false)
    G.FUNCS.exit_overlay_menu()
  end)
end)
