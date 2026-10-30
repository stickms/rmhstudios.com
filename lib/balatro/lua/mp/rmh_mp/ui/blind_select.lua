-- rmh_mp/ui/blind_select.lua — the Nemesis pillar on blind select (HUD-04, HUD-05, FL-06 UI, D-01).
--
-- create_UIBox_blind_choice is wrapped while a session is mounted. For the PvP slot (the Boss slot
-- from pvp_start_round, rules/attrition.lua) the pillar is restyled by tree surgery:
--   name     -> the opponent title (live: ui/hud.lua RU.view.opponent_title)
--   text     -> "Life or Death" / "Most chips wins" ("Most chips wins" only on a bye and in practice)
--   amount   -> "????"  (also in the Run Info preview, HUD-05)   reward -> $5
--   chip     -> MP.content.blinds.chip() art (WS7), the plain Nemesis chip in practice
--   button   -> Ready (red) / Unready (green) / "Waiting for pairing..." (inactive, D-01)
-- G.FUNCS.blind_choice_handler (run every frame by the pillar) is wrapped to keep the button's
-- colour, label and clickability in step with MP.state.pvp. The click itself stays vanilla's
-- select_blind, which the core (hooks/flow.lua) turns into the Ready toggle; vanilla's one_press
-- would disable the button after the first press, so it is re-armed here until start_blind.
--
--   BS.patch(def, slot, run_info) -> true when the pillar is the PvP pillar and was restyled
--   BS.button_style(view)         -> { colour_key, clickable }   (pure; specs)
--   BS.labels                     live label table the pillar's button text points at

local MP = require 'rmh_mp.state'
local tree = require 'rmh_mp.util.tree'
local att = require 'rmh_mp.rules.attrition'

MP.ui = MP.ui or {}
local BS = MP.ui.blind_select or {}
MP.ui.blind_select = BS

BS.labels = BS.labels or { Boss = '' }
BS.sprites = BS.sprites or {}

local function RU() return MP.ui.run end
local function g(name) return rawget(_G, name) end

function BS.is_pvp_slot(slot)
  return att.slot_is_pvp(slot, G.GAME and G.GAME.round_resets and G.GAME.round_resets.ante)
end

--- Description lines for the pillar.
function BS.lines()
  local t = RU().t
  local most = t('k_bl_mostchips', 'Most chips wins')
  if MP.state.pvp.bye or MP.is_practice() then return { most } end
  return { t('k_bl_life', 'Life') .. ' ' .. t('k_bl_or', 'or') .. ' ' .. t('k_bl_death', 'Death'), most }
end

--- The chip art for the pillar (nil: keep the vanilla boss art, i.e. a bye).
function BS.chip()
  if MP.state.pvp.bye or not att.uses_nemesis_blind() then return nil end
  local blinds = MP.content and MP.content.blinds
  if MP.is_match() and blinds and blinds.chip then
    local ok, c = pcall(blinds.chip)
    if ok and c then return c end
  end
  return { atlas = 'mp_player_blind_chip', pos = { x = 0, y = 0 }, blind_key = 'bl_mp_nemesis' }
end

local function apply_chip(sprite)
  if not (sprite and G.ANIMATION_ATLAS) then return end
  local c = BS.chip()
  local atlas = c and (G.ANIMATION_ATLAS[c.atlas] or G.ANIMATION_ATLAS.blind_chips) or nil
  if not atlas or sprite.atlas == atlas and sprite.animation and sprite.animation.y == c.pos.y then return end
  sprite.atlas = atlas
  if sprite.set_sprite_pos then sprite:set_sprite_pos(c.pos) end
end

function BS.patch(def, slot, run_info)
  if type(def) ~= 'table' or not BS.is_pvp_slot(slot) then return false end
  local U = G.UIT
  local view = RU().view
  pcall(RU().compute, view)
  -- button
  local btn = tree.find_id(def, 'select_blind_button')
  if btn and not run_info then
    btn.config.one_press = nil
    local label = btn.nodes and btn.nodes[1]
    if label and label.config then
      BS.labels[slot] = view.ready_label or ''
      label.config.ref_table, label.config.ref_value = BS.labels, slot
    end
  end
  -- name
  local name_row = tree.find_id(def, 'blind_name')
  local name_obj = name_row and tree.find(name_row, function(n) return n.n == U.O end)
  if name_obj then
    name_obj.config.object = RU().dyna('opponent_title', { G.C.WHITE }, 0.45,
      { float = true, y_offset = -4, maxw = 2.8 })
  end
  -- description, chip, amount, reward
  local desc = tree.find_id(def, 'blind_desc')
  if desc and desc.nodes and desc.nodes[1] and desc.nodes[1].nodes then
    local top = desc.nodes[1]
    local anim_row = top.nodes[1]
    local anim = anim_row and anim_row.nodes and anim_row.nodes[1]
    if anim and anim.config and anim.config.object then
      BS.sprites[slot] = anim.config.object
      apply_chip(anim.config.object)
    end
    local rows = {}
    for i, line in ipairs(BS.lines()) do
      rows[i] = { n = U.R, config = { align = 'cm', maxw = 2.8 }, nodes = {
        { n = U.T, config = { text = line, scale = 0.32, colour = G.C.WHITE, shadow = true } } } }
    end
    top.nodes = { anim_row, { n = U.R, config = { align = 'cm', minh = 0.7, padding = 0.05, minw = 2.9 }, nodes = rows } }
  end
  local want = g('localize') and localize('ph_blind_score_at_least') or 'Score at least'
  local box = tree.find(def, function(n)
    local first = n.nodes and n.nodes[1]
    local t = first and first.nodes and first.nodes[1]
    return n.n == U.R and t and t.config and t.config.text == want
  end)
  if box then
    local amount_row = box.nodes[2]
    local amount = amount_row and amount_row.nodes and amount_row.nodes[3]
    if amount and amount.config then
      amount.config.text = '????'
      amount.config.scale = 0.9 * 0.6
    end
    local reward_row = box.nodes[3]
    if reward_row and reward_row.nodes and reward_row.nodes[2] and reward_row.nodes[2].config then
      reward_row.nodes[2].config.text = string.rep(g('localize') and localize('$') or '$', 5)
    end
  end
  return true
end

--- Button colour key and whether it can be pressed, for the current view.
function BS.button_style(view)
  local s = view.ready_state
  if s == 'waiting' or s == 'started' then return 'inactive', false end
  if s == 'ready' then return 'GREEN', true end
  return 'RED', true
end

function BS.handle(e)
  local id = e.config and e.config.id
  if not id or not BS.is_pvp_slot(id) then return end
  if e.config.ref_table and e.config.ref_table.run_info then return end
  local view = RU().view
  if BS.sprites[id] then apply_chip(BS.sprites[id]) end
  local top = e.UIBox and e.UIBox.get_UIE_by_ID and e.UIBox:get_UIE_by_ID('select_blind_button')
  if G.GAME.blind_on_deck ~= id then
    BS.labels[id] = (G.GAME.round_resets.loc_blind_states or {})[id] or ''
    return
  end
  BS.labels[id] = view.ready_label or ''
  if not top then return end
  local key, clickable = BS.button_style(view)
  if clickable then
    top.config.colour = G.C[key] or top.config.colour
    top.config.button = 'select_blind'
    top.disable_button = nil
  else
    top.config.colour = G.C.UI.BACKGROUND_INACTIVE
    top.config.button = nil
  end
end

function BS.install()
  BS.sprites = {}
  local wrap = MP.hooks.wrap
  wrap(_G, 'create_UIBox_blind_choice', function(orig, slot, run_info, ...)
    local def = orig(slot, run_info, ...)
    local ok, err = pcall(BS.patch, def, slot or 'Small', run_info)
    if not ok then MP.log('error', 'blind pillar patch failed: %s', tostring(err)) end
    return def
  end, { group = 'session', optional = true, id = 'ui.blind_choice' })
  if G and G.FUNCS and G.FUNCS.blind_choice_handler then
    wrap(G.FUNCS, 'blind_choice_handler', function(orig, e, ...)
      local r = orig(e, ...)
      local ok, err = pcall(BS.handle, e)
      if not ok and not BS.logged then
        BS.logged = true
        MP.log('error', 'blind pillar handler failed: %s', tostring(err))
      end
      return r
    end, { group = 'session', optional = true, id = 'ui.blind_handler' })
  end
end

return BS
