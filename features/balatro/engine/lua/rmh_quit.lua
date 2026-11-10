-- Options -> QUIT. The desktop game has no way out of a browser tab (F_QUIT_BUTTON is
-- off in rmh_web.lua), so the Options overlay gets a QUIT row under Credits. Credits only
-- exists on the main menu, and so does this: a run's pause menu never offers it.
-- Pressing it drops /rmh/quit for the page (lib/balatro/runtime.ts), which flushes the
-- saves and leaves for the games list.

-- create_UIBox_options builds its rows as `{ settings, seed_or_nil, restart_or_nil, ...,
-- credits_or_nil }`, a table with holes: ipairs would stop at the first one, and
-- table.insert's `#` is not defined there. So read by table.maxn and, where the row goes,
-- replace the list with a hole-free copy.
local function compact(list)
  local out = {}
  for i = 1, table.maxn(list) do
    if list[i] ~= nil then out[#out + 1] = list[i] end
  end
  return out
end

local function insert_after_credits(node, row)
  if type(node.nodes) ~= 'table' then return false end
  for i = 1, table.maxn(node.nodes) do
    local child = node.nodes[i]
    local inner = type(child) == 'table' and child.nodes and child.nodes[1]
    if inner and inner.config and inner.config.button == 'show_credits' then
      local list = compact(node.nodes)
      for at, c in ipairs(list) do
        if c == child then
          table.insert(list, at + 1, row)
          break
        end
      end
      node.nodes = list
      return true
    end
    if type(child) == 'table' and insert_after_credits(child, row) then return true end
  end
  return false
end

G.FUNCS.rmh_quit = function()
  local f = io.open('/rmh/quit', 'w')
  if f then
    f:write('1')
    f:close()
  end
end

local options = create_UIBox_options
function create_UIBox_options(...)
  local t = options(...)
  if G.STAGE == G.STAGES.MAIN_MENU then
    insert_after_credits(
      t,
      UIBox_button({ id = 'rmh_quit_button', button = 'rmh_quit', label = { localize('b_quit_cap') }, minw = 5 })
    )
  end
  return t
end
