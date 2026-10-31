-- rmh_mp/content/blinds.lua — the PvP blinds (BL-01…BL-03, A2 §5).
--
--   bl_mp_nemesis         "Your Nemesis": $5, mult 1, boss colour #AC3232, never in a boss roll (the
--                         Attrition slot logic, WS6 hooks/pvp_blind.lua, puts it in the Boss slot).
--                         Its receive-sync semantics (score / hands / skips mirror, ignored on a bye
--                         and from anyone but the ante nemesis) live in WS6 hooks/report.lua.
--                         Replaces the WS6 reference definition.
--   bl_mp_manhunt_hunter  "The Hunters" / bl_mp_manhunt_runner "The Runner": never played, sprite
--                         sources for the Nemesis blind in Manhunt (red / blue).
--
-- Art (BL-01): the chip shown for the PvP blind depends on who you face —
--   MP.content.blinds.chip(opponent_id?) -> { atlas, pos, blind_key, colour, showdown }
--   * Manhunt: the Runner sees the Hunters' chip, Hunters see the Runner's
--     (atlases mp_manhunt_hunter_blind_chip / mp_manhunt_runner_blind_chip, row 0);
--   * otherwise the opponent's blind colour (roster blindCol 1..25, D-10) picks a vanilla blind;
--     the chip is that blind's row of mp_player_blind_col (the vanilla BlindChips layout);
--   * when both sides are at <= 1 life (outside round eval) the colour maps to a showdown blind.
-- WS11's HUD and blind-select draw through it; the chip atlas for the plain PvP blind is
-- mp_player_blind_chip (MP.registry.atlas.blind_atlas('bl_mp_nemesis')).

local MP = require 'rmh_mp.state'
local R = require 'rmh_mp.registry'
local C = require 'rmh_mp.content.jokers.core'

local B = {}
MP.content.blinds = B

B.MULTIPLAYER = { 0.675, 0.196, 0.196, 1 } -- #AC3232
B.RED = { 0.996, 0.373, 0.333, 1 }         -- G.C.RED
B.BLUE = { 0, 0.616, 1, 1 }                -- G.C.BLUE

R.define({
  key = 'bl_mp_nemesis', kind = 'Blind', pos = { x = 0, y = 0 }, atlas = 'mp_player_blind_chip', pool = false,
  blind = { dollars = 5, mult = 1, boss_colour = B.MULTIPLAYER, vars = {}, debuff = {} },
  loc = { name = 'Your Nemesis', text = { 'Face another player,', 'most chips wins' } },
})

R.define({
  key = 'bl_mp_manhunt_hunter', kind = 'Blind', pos = { x = 0, y = 0 }, atlas = 'mp_manhunt_hunter_blind_chip',
  pool = false,
  blind = { dollars = 5, mult = 1, boss_colour = B.RED, vars = {}, debuff = {} },
  loc = { name = 'The Hunters', text = { 'Manhunt: the Runner faces', 'the Hunters in the PvP Blind' } },
})

R.define({
  key = 'bl_mp_manhunt_runner', kind = 'Blind', pos = { x = 0, y = 0 }, atlas = 'mp_manhunt_runner_blind_chip',
  pool = false,
  blind = { dollars = 5, mult = 1, boss_colour = B.BLUE, vars = {}, debuff = {} },
  loc = { name = 'The Runner', text = { 'Manhunt: the Hunters face', 'the Runner in the PvP Blind' } },
})

-- The 25 blind colours a player can pick (index = blindCol), as vanilla blind keys.
B.COLOURS = {
  'bl_tooth', 'bl_small', 'bl_big', 'bl_hook', 'bl_ox', 'bl_house', 'bl_wall', 'bl_wheel', 'bl_arm',
  'bl_club', 'bl_fish', 'bl_psychic', 'bl_goad', 'bl_water', 'bl_window', 'bl_manacle', 'bl_eye',
  'bl_mouth', 'bl_plant', 'bl_serpent', 'bl_pillar', 'bl_needle', 'bl_head', 'bl_flint', 'bl_mark',
}

-- The showdown blind each colour turns into when both players are on their last life.
B.SHOWDOWN = {
  'bl_final_heart', 'bl_final_bell', 'bl_final_acorn', 'bl_final_heart', 'bl_final_heart',
  'bl_final_bell', 'bl_final_vessel', 'bl_final_leaf', 'bl_final_vessel', 'bl_final_leaf',
  'bl_final_bell', 'bl_final_acorn', 'bl_final_vessel', 'bl_final_bell', 'bl_final_acorn',
  'bl_final_heart', 'bl_final_bell', 'bl_final_vessel', 'bl_final_leaf', 'bl_final_leaf',
  'bl_final_acorn', 'bl_final_leaf', 'bl_final_vessel', 'bl_final_acorn', 'bl_final_heart',
}

function B.colour_index(n)
  n = math.floor(tonumber(n) or 1)
  if n < 1 or n > #B.COLOURS then return 1 end
  return n
end

local function in_round_eval()
  return G.STATE ~= nil and G.STATES ~= nil and G.STATE == G.STATES.ROUND_EVAL
end

--- Both sides at <= 1 life (D-16: the current target's lives).
function B.showdown(opponent)
  local mine = C.my_lives()
  local theirs = opponent and MP.state.lives[opponent] or C.enemy().lives
  if not (mine and theirs) then return false end
  return mine <= 1 and theirs <= 1 and not in_round_eval()
end

--- The chip art for the PvP blind against `opponent` (default: the ante nemesis).
function B.chip(opponent)
  local sess = MP.state.session
  if sess and sess.shape and sess.shape.manhunt then
    local runner = MP.state.my_team == 'RUNNER'
    local key = runner and 'bl_mp_manhunt_hunter' or 'bl_mp_manhunt_runner'
    return { atlas = runner and 'mp_manhunt_hunter_blind_chip' or 'mp_manhunt_runner_blind_chip',
      pos = { x = 0, y = 0 }, blind_key = key, colour = runner and B.RED or B.BLUE, showdown = false }
  end
  opponent = opponent or C.target()
  local roster = sess and sess.roster or {}
  local col = B.colour_index(opponent and roster[opponent] and roster[opponent].blindCol)
  local key = B.COLOURS[col]
  local showdown = B.showdown(opponent)
  if showdown then key = B.SHOWDOWN[col] end
  local proto = G.P_BLINDS and G.P_BLINDS[key]
  return {
    atlas = 'mp_player_blind_col',
    pos = { x = 0, y = (proto and proto.pos and proto.pos.y) or 0 },
    blind_key = key,
    colour = (proto and proto.boss_colour) or B.MULTIPLAYER,
    showdown = showdown,
  }
end

return B
