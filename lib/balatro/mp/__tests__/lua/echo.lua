-- Conformance peer for bridge-lua.test.ts: the real rmh/net.lua + rmh/json.lua
-- in a loop against a temp dir. Echoes every `toast` back as `mp_log` (msg =
-- key), sends `count` `ui_chat` lines of its own (10 per frame), and exits after
-- the `stop` toast once its outbox is empty.
--   lua5.1 echo.lua <repo root> <dir> <count>
local root, dir, count = arg[1], arg[2], tonumber(arg[3])
package.path = root .. '/lib/balatro/lua/?.lua;' .. package.path
local N = require('rmh/net')
local J = require('rmh/json')
N.OUT_TMP, N.OUT, N.IN, N.IN_SIG = dir .. '/rmh/net/out.tmp', dir .. '/rmh/net/out', dir .. '/rmh/net/in', dir .. '/rmh/net/in.sig'
N.log = function(m) io.stderr:write(m, '\n') end
local stop, sent = false, 0
N.on('toast', function(d)
  if d.key == 'stop' then stop = true return end
  N.send('mp_log', { level = 'info', msg = d.key })
end)
N.on('chat_line', function(d)
  N.send('mp_log', { level = 'info', msg = d.name .. '|' .. d.text })
end)
local deadline = os.clock() + 60
while os.clock() < deadline do
  for _ = 1, 10 do
    if sent < count then
      sent = sent + 1
      N.send('ui_chat', { text = tostring(sent) })
    end
  end
  N.pump()
  if stop and #N.queue == 0 and N.acked == N.last then
    local f = io.open(N.OUT, 'rb')
    if not f then break end
    f:close()
  end
  local t = os.clock() + 0.0005
  while os.clock() < t do end
end
io.stdout:write(J.encode({ last = N.last, seq = N.seq, frame = N.frame }), '\n')
