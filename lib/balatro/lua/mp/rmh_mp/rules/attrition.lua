-- rmh_mp/rules/attrition.lua — the Attrition content profile (FL-03/04/15, A1 §2.1).
--
--   att.BANS                      jokers / vouchers / tag / bosses banned in every match
--   att.slot_is_pvp(slot, ante)   the Boss slot from pvp_start_round is a PvP round
--   att.uses_nemesis_blind()      the PvP round is played on bl_mp_nemesis (not on a bye and not
--                                 with the normal_bosses option, where the vanilla boss is flagged)
--   att.current_slot()            'Small' | 'Big' | 'Boss' from G.GAME.round_resets.blind (the real
--                                 slot is always kept there; the PvP blind is substituted only in
--                                 Blind:set_blind, so vanilla bookkeeping keeps working)
--   att.furthest_blind(slot, ante) ante*10 + 1 / 2 / 3 (Boss counts as the cleared ante's 3)

local MP = require 'rmh_mp.state'

local A = {}
MP.attrition = A

A.BANS = {
  'j_mr_bones', 'j_luchador', 'j_matador', 'j_chicot',
  'v_hieroglyph', 'v_petroglyph', 'v_directors_cut', 'v_retcon',
  'tag_boss',
  'bl_wall', 'bl_final_vessel',
}

A.PVP_BLIND = 'bl_mp_nemesis'

function A.pvp_start_round()
  if MP.is_practice() then return 2 end
  return MP.option('pvpStartRound', 2)
end

--- Is this run one where PvP slots exist at all (match/practice; not a continued SP run)?
function A.pvp_enabled()
  local k = MP.session_kind()
  return k == 'match' or k == 'practice' or k == 'replay' or k == 'spectate'
end

function A.slot_is_pvp(slot, ante)
  if not A.pvp_enabled() then return false end
  ante = ante or (G.GAME and G.GAME.round_resets and G.GAME.round_resets.ante) or 1
  return slot == 'Boss' and ante >= A.pvp_start_round()
end

function A.uses_nemesis_blind()
  if MP.option('normalBosses', false) and not MP.is_practice() then return false end
  if MP.state.pvp.bye then return false end
  return G.P_BLINDS[A.PVP_BLIND] ~= nil
end

function A.current_slot()
  local rr = G.GAME and G.GAME.round_resets
  local b = rr and rr.blind
  if b and G.P_BLINDS.bl_small and b == G.P_BLINDS.bl_small then return 'Small' end
  if b and G.P_BLINDS.bl_big and b == G.P_BLINDS.bl_big then return 'Big' end
  if b then return 'Boss' end
  return G.GAME and G.GAME.blind_on_deck or 'Small'
end

function A.furthest_blind(slot, ante)
  local n = slot == 'Small' and 1 or slot == 'Big' and 2 or 3
  return math.max(0, ante) * 10 + n
end

return A
