-- rmh_mp/ui/pvp_hud.lua — the blind panel during a PvP blind (HUD-03).
--
-- create_UIBox_HUD_blind (wrapped while a session is mounted) is repointed at the in-run view
-- (ui/hud.lua RU.view), so the same panel shows vanilla values on normal blinds and, on the PvP
-- blind:
--   name   -> the opponent: player name / "The Royale" / "The Hunters" / "The Runner" / "Team A|B" /
--             "Bye" / "???" in practice
--   "Score at least" -> "Current Enemy score"; the count is the enemy score eased over 3 s, masked
--             "???" until the first info (RU.view.enemy_score is written into blind.chip_text)
--   "Reward" -> "Enemy hands left: N"
-- The chip sprite is swapped every frame it drifts (vanilla's delayed set_sprite_pos included):
-- MP.content.blinds.chip() (WS7: opponent blind colour 1-25, Manhunt art, showdown art at <= 1 life
-- each) on bl_mp_nemesis; the plain Nemesis chip in practice. A bye plays the flagged vanilla boss
-- and keeps its art. Leaving the PvP blind restores the vanilla atlas.
--
--   PH.patch(def)        pure surgery on the create_UIBox_HUD_blind definition
--   PH.chip()            -> { atlas, pos, colour, blind_key } wanted for the current PvP blind, or nil
--   PH.frame(view)       per-frame sprite/colour upkeep (called by ui/hud.lua)

local MP = require 'rmh_mp.state'
local tree = require 'rmh_mp.util.tree'

MP.ui = MP.ui or {}
local PH = MP.ui.pvp_hud or {}
MP.ui.pvp_hud = PH

local function RU() return MP.ui.run end
local function g(name) return rawget(_G, name) end

PH.reward_fg = PH.reward_fg or { 0.918, 0.753, 0.345, 1 }

local function same_text(node, key)
  if not (node.config and node.config.text) then return false end
  local want = g('localize') and localize(key) or nil
  return want ~= nil and node.config.text == want
end

function PH.patch(def)
  if type(def) ~= 'table' then return false end
  local view = RU().view
  local changed = 0
  local name = tree.find_id(def, 'HUD_blind_name')
  if name then
    name.config.object = RU().dyna('blind_name', { G.C.UI.TEXT_LIGHT }, 1.6 * 0.4,
      { rotate = true, silent = true, float = true, y_offset = -4 })
    changed = changed + 1
  end
  local label = tree.find(def, function(n) return same_text(n, 'ph_blind_score_at_least') end)
  if label then
    label.config.ref_table, label.config.ref_value = view, 'score_label'
    changed = changed + 1
  end
  local reward = tree.find(def, function(n) return n.config and n.config.func == 'HUD_blind_reward' end)
  if reward and reward.nodes then
    reward.config.func = 'mp_hud_blind_reward'
    local t = reward.nodes[1]
    if t and t.config then
      t.config.text = view.reward_label or ''
      t.config.ref_table, t.config.ref_value = view, 'reward_label'
    end
    local o = reward.nodes[2]
    if o and o.config and o.config.id == 'dollars_to_be_earned' then
      o.config.object = RU().dyna('reward_value', { PH.reward_fg }, 0.45, { rotate = true, bump = true, silent = true })
    end
    changed = changed + 1
  end
  return changed == 3
end

--- The chip art wanted on the current PvP blind (nil off the PvP blind or on a bye's vanilla boss).
function PH.chip()
  if not (MP.pvp and MP.pvp.on_pvp_blind and MP.pvp.on_pvp_blind()) then return nil end
  if not MP.state.pvp.nemesis_blind then return nil end
  local blinds = MP.content and MP.content.blinds
  if MP.is_match() and blinds and blinds.chip then
    local ok, c = pcall(blinds.chip)
    if ok and c then return c end
  end
  return { atlas = 'mp_player_blind_chip', pos = { x = 0, y = 0 }, blind_key = 'bl_mp_nemesis',
    colour = RU().MULTIPLAYER, showdown = false }
end

PH.applied = PH.applied or nil

local function money()
  return (G.C and G.C.MONEY) or { 0.918, 0.753, 0.345, 1 }
end

function PH.frame(view)
  local fg = view and view.on_pvp and (G.C and G.C.BLUE) or money()
  for i = 1, 4 do PH.reward_fg[i] = fg[i] or 1 end
  local b = G.GAME and G.GAME.blind
  local sprite = b and b.children and b.children.animatedSprite
  if not sprite or not G.ANIMATION_ATLAS then return end
  local want = PH.chip()
  if want then
    if not b.blind_set then return end
    local atlas = G.ANIMATION_ATLAS[want.atlas] or G.ANIMATION_ATLAS.blind_chips
    local anim = sprite.animation
    if sprite.atlas ~= atlas or not anim or anim.y ~= want.pos.y or anim.x ~= want.pos.x then
      sprite.atlas = atlas
      if sprite.set_sprite_pos then sprite:set_sprite_pos(want.pos) end
    end
    if PH.applied ~= want.blind_key and want.colour and b.change_colour then
      pcall(b.change_colour, b, want.colour)
    end
    PH.applied = want.blind_key
  elseif PH.applied then
    PH.applied = nil
    local base = G.ANIMATION_ATLAS.blind_chips
    if base and sprite.atlas ~= base then
      sprite.atlas = base
      local pos = b.config and b.config.blind and b.config.blind.pos
      if sprite.set_sprite_pos then sprite:set_sprite_pos(pos or { x = 0, y = 0 }) end
    end
  end
end

function PH.install()
  PH.applied = nil
  if G and G.FUNCS then
    G.FUNCS.mp_hud_blind_reward = function(e)
      if e.config.minh < 0.45 then
        e.config.minh = 0.45
        if e.UIBox and e.UIBox.recalculate then e.UIBox:recalculate(true) end
      end
    end
  end
  MP.hooks.wrap(_G, 'create_UIBox_HUD_blind', function(orig, ...)
    local def = orig(...)
    local ok, err = pcall(PH.patch, def)
    if not ok then MP.log('error', 'HUD blind patch failed: %s', tostring(err)) end
    return def
  end, { group = 'session', optional = true, id = 'ui.hud_blind' })
end

return PH
