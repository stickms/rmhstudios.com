-- L2 in-engine: the Multiplayer challenges started and played, part a (read
-- mp_test/challenges_body.lua: the first half of the MP challenges).

local env = getfenv(1)
env.CHALLENGE_PART = 'a'
local path = 'rmh_mp_test/challenges_body.lua'
local source = love.filesystem.read(path)
if not source then
  describe('challenges a', function() it('finds challenges_body.lua', function() error('missing ' .. path) end) end)
  return
end
local chunk, err = loadstring(source, '@challenges_body')
if not chunk then error(err, 0) end
setfenv(chunk, env)
return chunk()
