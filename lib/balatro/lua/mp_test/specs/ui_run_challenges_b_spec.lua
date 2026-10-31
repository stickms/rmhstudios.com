-- L2 in-engine: the Multiplayer challenges started and played, part b (read
-- mp_test/challenges_body.lua: the second half of the MP challenges, the win/loss paths and the vanilla challenges).

local env = getfenv(1)
env.CHALLENGE_PART = 'b'
local path = 'rmh_mp_test/challenges_body.lua'
local source = love.filesystem.read(path)
if not source then
  describe('challenges b', function() it('finds challenges_body.lua', function() error('missing ' .. path) end) end)
  return
end
local chunk, err = loadstring(source, '@challenges_body')
if not chunk then error(err, 0) end
setfenv(chunk, env)
return chunk()
