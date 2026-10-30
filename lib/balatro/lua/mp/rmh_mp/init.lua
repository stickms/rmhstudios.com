-- rmh_mp/init.lua — MP pack bootstrap (PLAN §3.d). `require 'rmh_mp'` (rmh_mp_entry.lua, WS3)
-- runs this once the pack is in /Balatro/rmh_mp; requiring it again is a no-op.
--
-- Order: core modules -> rules/hook modules -> built-in layer hooks -> content modules (fixed
-- order: registry `order` = 1000 + definition index must match on every peer) -> reference
-- content for keys nobody defined -> atlas registry -> core wraps (atlases, localization, save
-- guards, Continue-in-SP boot) -> net (transport, handlers, frame hook) -> late install of atlases
-- and text when the game is already running.
--
-- Session-only wraps are installed by MP.session.mount and removed by unmount (group 'session').

local MP = require 'rmh_mp.state'
if MP._booted then return MP end

require 'rmh_mp.util.wrap'
require 'rmh_mp.util.fmt'
require 'rmh_mp.util.rng'
require 'rmh_mp.util.tree'
require 'rmh_mp.util.codec'
require 'rmh_mp.net'
local R = require 'rmh_mp.registry'
require 'rmh_mp.registry.pools'
require 'rmh_mp.registry.dispatch'
local atlas = require 'rmh_mp.registry.atlas'
local loc = require 'rmh_mp.registry.loc'
local ref = require 'rmh_mp.registry.reference'
require 'rmh_mp.rules.attrition'
require 'rmh_mp.rules.order'
local sw = require 'rmh_mp.rules.smallworld'
require 'rmh_mp.rules.stakes_apply'
local exp = require 'rmh_mp.rules.experimental'
local misc = require 'rmh_mp.rules.misc_layers'
local saves = require 'rmh_mp.hooks.saves'
local session = require 'rmh_mp.rules.session'
local pvp = require 'rmh_mp.hooks.pvp_blind'
local flow = require 'rmh_mp.hooks.flow'
local economy = require 'rmh_mp.hooks.economy'
local guards = require 'rmh_mp.hooks.guards'
local timer = require 'rmh_mp.hooks.timer_hooks'
local report = require 'rmh_mp.hooks.report'

-- Built-in layer hooks (content streams add theirs through MP.rules.layer_hook).
MP.rules.layer_hook('smallworld', function() sw.cull() end)
exp.register(MP.rules)
misc.register(MP.rules)

-- Content modules, in the fixed registry order. A module that is not in the pack yet (wave 1)
-- is skipped; its keys then fall back to the reference content where one exists.
MP.CONTENT_MODULES = {
  'rmh_mp.content.jokers.core', 'rmh_mp.content.jokers.standard', 'rmh_mp.content.jokers.experimental',
  'rmh_mp.content.jokers.takeovers', 'rmh_mp.content.consumables', 'rmh_mp.content.enhancements',
  'rmh_mp.content.stickers', 'rmh_mp.content.blinds', 'rmh_mp.content.tags', 'rmh_mp.content.vouchers',
  'rmh_mp.content.stakes',
  'rmh_mp.content.jokers.sandbox', 'rmh_mp.content.jokers.sandbox_inactive', 'rmh_mp.content.jokers.extra_credit',
  'rmh_mp.content.jokers.errors', 'rmh_mp.content.sandbox_misc', 'rmh_mp.rules.sandbox',
  'rmh_mp.content.traps', 'rmh_mp.content.trap_hooks', 'rmh_mp.content.boosters', 'rmh_mp.content.decks',
  'rmh_mp.content.cocktail', 'rmh_mp.content.challenges',
  'rmh_mp.hooks.practice',
}
MP.content_loaded = {}

local function is_missing(err, name)
  local s = tostring(err)
  return s:find("module '" .. name .. "' not found", 1, true) ~= nil
end

for _, name in ipairs(MP.CONTENT_MODULES) do
  local ok, err = pcall(require, name)
  if ok then
    MP.content_loaded[#MP.content_loaded + 1] = name
  elseif is_missing(err, name) then
    MP.log('debug', 'content module %s not in the pack', name)
  else
    MP.log('error', 'content module %s failed to load: %s', name, tostring(err))
  end
end
ref.define_missing()

-- Atlas registry: a Lua data module generated into the pack, else the JSON file.
local function load_atlas_registry()
  local ok, t = pcall(require, 'rmh_mp.data.atlases')
  if ok and type(t) == 'table' then return atlas.set_registry(t) end
  local lf = rawget(_G, 'love') and love.filesystem
  if lf and lf.getInfo and lf.getInfo('rmh_mp/atlases.json') then
    local rok, text = pcall(lf.read, 'rmh_mp/atlases.json')
    if rok and text then
      local dok, tbl = pcall(MP.json.decode, text)
      if dok then return atlas.set_registry(tbl) end
    end
  end
  MP.log('warn', 'atlas registry not found; MP art uses placeholders')
  return false
end
load_atlas_registry()

-- Tag atlases pasted into tags.png: point the prototypes at their cells while mounted.
R.on_mount = function()
  for _, def in ipairs(R.defs()) do
    if def.kind == 'Tag' and def.atlas and atlas.tag_pos(def.atlas) then
      R.proto(def.key).pos = atlas.tag_pos(def.atlas)
    end
  end
  report.reset()
end

-- Core wraps (always on).
atlas.install_core_wrap()
loc.install_core_wrap()
saves.install_core()
session.install_core()

-- Session wraps (installed at every mount, removed at unmount).
session.add_installer(pvp.install)
session.add_installer(flow.install)
session.add_installer(economy.install)
session.add_installer(guards.install)
session.add_installer(timer.install)

-- Net.
MP.net.bind()
session.install_net()
report.install_net()
timer.install_net()
MP.net.install_frame_hook()

-- The pack usually loads after Game:start_up: install the art and merge the text now.
if rawget(_G, 'G') and G.ASSET_ATLAS then pcall(atlas.install) end
if rawget(_G, 'G') and G.localization then pcall(loc.refresh) end

--- rmh_mp_entry.lua calls MP.open(intent) when the player opens Multiplayer (or at autoload).
function MP.open(intent)
  if MP.ui and MP.ui.open then return MP.ui.open(intent) end
  MP.log('warn', 'MP.open(%s): no menu UI in this pack yet (WS10)', tostring(intent))
  return false
end

MP._booted = true
MP.log('info', 'rmh_mp %s ready (%d definitions, %d content modules)', MP.version, #R.defs(), #MP.content_loaded)

return MP
