-- L2 in-engine crash sweep, QUICK mode (the engine project runs it on every CI run).
--
-- The sweep itself lives in ui_sweep_full.lua (read its header). This file runs the part of it
-- that guards what broke and what players reach most: every Collection page and tooltip in the
-- menu and in a practice run (the Collection > Consumables crash) and every MP menu screen's
-- buttons. The whole sweep (overlays, in-run, end screens, every MP item used):
--   pnpm exec tsx testing/balatro-e2e/engine/cli.ts --spec ui_sweep_full

local env = getfenv(1)
env.RMH_SWEEP_QUICK = true
local path = 'rmh_mp_test/specs/ui_sweep_full.lua'
local source = love.filesystem.read(path)
if not source then
  describe('ui sweep (quick)', function() it('finds ui_sweep_full.lua', function() error('missing ' .. path) end) end)
  return
end
local chunk, err = loadstring(source, '@ui_sweep_full')
if not chunk then error(err, 0) end
setfenv(chunk, env)
return chunk()
