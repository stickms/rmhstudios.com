-- GENERATED FILE — do not edit by hand.
-- Source: lib/balatro/mp/bridge-protocol.ts (PLAN §3.c), via scripts/balatro/gen-lua-protocol.ts.
-- Regenerate with `pnpm balatro:gen-protocol`; lib/balatro/mp/__tests__/protocol-lua.test.ts fails when stale.
--
-- Usage:
--   local P = require 'rmh_mp.protocol'
--   local ok, err = P.validate('j2l', msg.t, msg.d)   -- inbound from JS
--   local ok, err = P.validate('l2j', t, d)           -- self-check before sending (tests)
--   P.L2J.ui_ready, P.J2L.lobby_view, P.ENUM.queueMode, P.PATHS.IN, P.LIMITS.LINE_MAX_BYTES
--
-- JSON null: a decoder may map it to nil or to a sentinel. P.NULL is one; a decoder with its
-- own sentinel registers it with P.set_null(sentinel). A nullable field may also be absent.
-- Not checked here (TS checks them): regex patterns and zod refinements.

local P = {}

P.VERSION = 1

P.ENTRY_L2J = { "mp_log", "mp_open" }
P.ENTRY_J2L = { "mp_pack" }

P.L2J = {
  deck_res_local = "deck_res_local",
  ev = "ev",
  flags = "flags",
  log = "log",
  match_left = "match_left",
  mp_log = "mp_log",
  mp_open = "mp_open",
  peer = "peer",
  snapshot = "snapshot",
  stats_local = "stats_local",
  test_res = "test_res",
  timer_input = "timer_input",
  ui_chat = "ui_chat",
  ui_continue_sp = "ui_continue_sp",
  ui_copy_code = "ui_copy_code",
  ui_create_lobby = "ui_create_lobby",
  ui_draft = "ui_draft",
  ui_invite = "ui_invite",
  ui_join = "ui_join",
  ui_join_clipboard = "ui_join_clipboard",
  ui_kick = "ui_kick",
  ui_leave = "ui_leave",
  ui_mute = "ui_mute",
  ui_party_queue = "ui_party_queue",
  ui_practice = "ui_practice",
  ui_queue = "ui_queue",
  ui_ready = "ui_ready",
  ui_replay = "ui_replay",
  ui_return_lobby = "ui_return_lobby",
  ui_seat = "ui_seat",
  ui_set_deck = "ui_set_deck",
  ui_set_option = "ui_set_option",
  ui_set_team = "ui_set_team",
  ui_settings = "ui_settings",
  ui_spectate = "ui_spectate",
  ui_spectate_list = "ui_spectate_list",
  ui_start = "ui_start",
  ui_vote = "ui_vote",
}

P.J2L = {
  chat_line = "chat_line",
  end_data = "end_data",
  glyphs = "glyphs",
  history = "history",
  host_changed = "host_changed",
  lobby_error = "lobby_error",
  lobby_view = "lobby_view",
  match_start = "match_start",
  mp_pack = "mp_pack",
  net_status = "net_status",
  outcome = "outcome",
  peer = "peer",
  practice_start = "practice_start",
  presence = "presence",
  queue_view = "queue_view",
  rejoin_restore = "rejoin_restore",
  replay_feed = "replay_feed",
  replay_view = "replay_view",
  setup_view = "setup_view",
  spectate_view = "spectate_view",
  tail = "tail",
  test_cmd = "test_cmd",
  timer_cue = "timer_cue",
  timer_state = "timer_state",
  toast = "toast",
  vote_progress = "vote_progress",
}

P.ENUM = {
  queueMode = { "pvp_nemesis", "pvp_royale", "pvp_manhunt", "pvp_teams", "pvp_smallworld" },
  team = { "A", "B", "HUNTER", "RUNNER" },
  lobbyOptionKey = { "ruleset", "gamemode", "trapCards", "manhuntHunterLives", "startingLives", "pvpStartRound", "timer", "timerBaseSeconds", "timerIncrementSeconds", "timerForgiveness", "pvpCountdownSeconds", "deathOnRoundLoss", "goldOnLifeLoss", "noGoldOnRoundLoss", "customSeed", "theOrder", "hideScoreUntilPlayed", "normalBosses", "differentSeeds", "differentDecks", "randomLoadout", "multiplayerJokers", "modifierLayers", "seatGraceMs" },
  gameEvent = { "set_ante", "new_round", "ready_blind", "unready_blind", "play_hand", "skip", "blind_result", "fail_round", "fail_timer", "fail_pvp_timer", "furthest_blind", "redeem_ante_voucher", "forfeit", "seed_vote", "draw_vote", "result_request" },
  refMsg = { "player_lives", "team_lives", "team_roster", "nemesis_pairing", "team_card_target", "royale_target", "manhunt_target", "team_score_board", "start_blind", "timer_hand_lost", "end_pvp", "death_pending", "eliminated", "win", "player_won", "reseed", "speedrun", "vote_progress" },
  peerKind = { "nemesis_info", "location", "timer", "sync", "opp_ctx", "trap_plant", "trap_held", "trap_fired", "player_result", "deck_req", "deck_res", "stats_req", "stats_res" },
  wireKind = { "hello", "welcome", "lobby", "player_info", "ready", "set_team", "kick", "leave", "setup", "vote_cast", "draft_choose", "start_game", "reseed", "chat", "game", "outcome", "checkpoint", "nemesis_info", "location", "timer", "sync", "opp_ctx", "trap_plant", "trap_held", "trap_fired", "player_result", "deck_req", "deck_res", "stats_req", "stats_res", "log", "presence", "visibility", "host_changed", "bye" },
  replayOp = { "match_manifest", "lobby_info", "run_info", "manifest", "end", "chk", "money_delta", "sell", "cashout", "reroll", "hand_scored", "buy", "open_pack", "voucher", "use", "pack_pick", "pack_skip", "reorder", "play", "discard", "select_blind", "skip_blind", "leave_shop", "ready_blind", "set_ante_key", "hand_result", "round_dollars", "net_pizza", "net_magnet", "life_lost", "net_trap", "net_in" },
}

P.PATHS = {
  GLYPHS = "/Balatro/rmh_mp/glyphs.bin",
  IN = "/rmh/net/in",
  IN_SIG = "/rmh/net/in.sig",
  MP_AUTOLOAD = "/rmh/mp/autoload",
  MP_READY = "/rmh/mp/ready",
  MP_RUN = "/rmh/mp/run.jkr",
  MP_SNAP_MARKER = "/rmh/mp/snap",
  MP_STATE = "/rmh/mp/state.json",
  OUT = "/rmh/net/out",
  OUT_TMP = "/rmh/net/out.tmp",
}

P.LIMITS = {
  BATCH_MAX_BYTES = 262144,
  LINE_MAX_BYTES = 65536,
}

-- Shared descriptors (T = kind; n = nullable; p/r = properties/required; ap = additional
-- properties (record values) or false; pn = property-name schema; i = items; o = options;
-- key/m = discriminated union).
local D = {}
D[1] = {T="string", max=8192}
D[2] = {T="object", p={cards=D[1]}, r={"cards"}}
D[3] = {T="integer", min=0, max=1000}
D[4] = {T="const", v="set_ante"}
D[5] = {T="object", p={ante=D[3],t=D[4]}, r={"ante","t"}}
D[6] = {T="const", v="new_round"}
D[7] = {T="object", p={t=D[6]}, r={"t"}}
D[8] = {T="const", v="ready_blind"}
D[9] = {T="object", p={starting_hands=D[3],t=D[8]}, r={"starting_hands","t"}}
D[10] = {T="const", v="unready_blind"}
D[11] = {T="object", p={t=D[10]}, r={"t"}}
D[12] = {T="integer", min=0, max=100}
D[13] = {T="string"}
D[14] = {T="integer", min=0}
D[15] = {T="const", v="play_hand"}
D[16] = {T="object", p={hands_left=D[3],lives=D[12],score=D[13],skips=D[14],t=D[15]}, r={"hands_left","score","skips","t"}}
D[17] = {T="const", v="skip"}
D[18] = {T="object", p={hands_left=D[3],lives=D[12],score=D[13],skips=D[14],t=D[17]}, r={"hands_left","score","skips","t"}}
D[19] = {T="boolean"}
D[20] = {T="enum", v={"Small","Big","Boss"}}
D[21] = {T="const", v="blind_result"}
D[22] = {T="object", p={ante=D[3],beaten=D[19],blind=D[20],t=D[21]}, r={"ante","beaten","blind","t"}}
D[23] = {T="const", v="fail_round"}
D[24] = {T="object", p={t=D[23]}, r={"t"}}
D[25] = {T="const", v="fail_timer"}
D[26] = {T="object", p={t=D[25]}, r={"t"}}
D[27] = {T="const", v="fail_pvp_timer"}
D[28] = {T="object", p={t=D[27]}, r={"t"}}
D[29] = {T="const", v="furthest_blind"}
D[30] = {T="object", p={t=D[29],value=D[14]}, r={"t","value"}}
D[31] = {T="const", v="redeem_ante_voucher"}
D[32] = {T="object", p={t=D[31]}, r={"t"}}
D[33] = {T="const", v="forfeit"}
D[34] = {T="object", p={t=D[33]}, r={"t"}}
D[35] = {T="const", v="seed_vote"}
D[36] = {T="object", p={t=D[35]}, r={"t"}}
D[37] = {T="const", v="draw_vote"}
D[38] = {T="object", p={t=D[37]}, r={"t"}}
D[39] = {T="const", v="result_request"}
D[40] = {T="object", p={t=D[39]}, r={"t"}}
D[41] = {T="union", key="t", m={set_ante=D[5],new_round=D[7],ready_blind=D[9],unready_blind=D[11],play_hand=D[16],skip=D[18],blind_result=D[22],fail_round=D[24],fail_timer=D[26],fail_pvp_timer=D[28],furthest_blind=D[30],redeem_ante_voucher=D[32],forfeit=D[34],seed_vote=D[36],draw_vote=D[38],result_request=D[40]}}
D[42] = {T="object", p={e=D[41]}, r={"e"}}
D[43] = {T="string", n=true}
D[44] = {T="string", max=32}
D[45] = {T="object", p={animBusy=D[19],ante=D[14],blindKey=D[43],countdown=D[19],handsLeft=D[14],inShop=D[19],onPvp=D[19],paused=D[19],ready=D[19],roundEval=D[19],state=D[44]}, r={"animBusy","ante","countdown","handsLeft","inShop","onPvp","paused","ready","roundEval","state"}}
D[46] = {T="any"}
D[47] = {T="string", max=64}
D[48] = {T="object", p={}, r={}, ap=D[46], pn=D[47]}
D[49] = {T="enum", v={"match_manifest","lobby_info","run_info","manifest","end","chk","money_delta","sell","cashout","reroll","hand_scored","buy","open_pack","voucher","use","pack_pick","pack_skip","reorder","play","discard","select_blind","skip_blind","leave_shop","ready_blind","set_ante_key","hand_result","round_dollars","net_pizza","net_magnet","life_lost","net_trap","net_in"}}
D[50] = {T="number", min=0}
D[51] = {T="object", p={d=D[48],i=D[14],op=D[49],t=D[50]}, r={"d","i","op","t"}}
D[52] = {T="array", i=D[51], max=1024}
D[53] = {T="object", p={batch=D[52]}, r={"batch"}}
D[54] = {T="enum", v={"leave","continue_sp","return_lobby"}}
D[55] = {T="object", p={how=D[54]}, r={"how"}}
D[56] = {T="enum", v={"debug","info","warn","error"}}
D[57] = {T="string", max=4096}
D[58] = {T="object", p={level=D[56],msg=D[57]}, r={"level","msg"}}
D[59] = {T="enum", v={"menu","join","rejoin","invite"}}
D[60] = {T="object", p={intent=D[59]}, r={"intent"}}
D[61] = {T="object", p={hands_left=D[14],lives=D[14],score=D[13],skips=D[14]}, r={"hands_left","lives","score","skips"}}
D[62] = {T="const", v="nemesis_info"}
D[63] = {T="object", p={d=D[61],k=D[62]}, r={"d","k"}}
D[64] = {T="object", p={loc=D[47]}, r={"loc"}}
D[65] = {T="const", v="location"}
D[66] = {T="object", p={d=D[64],k=D[65]}, r={"d","k"}}
D[67] = {T="enum", v={"start","pause"}}
D[68] = {T="number"}
D[69] = {T="object", p={isPvP=D[19],op=D[67],time=D[68]}, r={"isPvP","op","time"}}
D[70] = {T="const", v="timer"}
D[71] = {T="object", p={d=D[69],k=D[70]}, r={"d","k"}}
D[72] = {T="enum", v={"sync","phantom"}}
D[73] = {T="string", min=1, max=64}
D[74] = {T="object", p={data=D[48],kind=D[72],obj=D[13],to=D[73]}, r={"data","kind","obj"}}
D[75] = {T="const", v="sync"}
D[76] = {T="object", p={d=D[74],k=D[75]}, r={"d","k"}}
D[77] = {T="const", v=true}
D[78] = {T="object", p={opponent_selling_card=D[77],opponent_spent_in_shop=D[68]}, r={}}
D[79] = {T="object", p={ctx=D[78]}, r={"ctx"}}
D[80] = {T="const", v="opp_ctx"}
D[81] = {T="object", p={d=D[79],k=D[80]}, r={"d","k"}}
D[82] = {T="enum", v={"foil","holo","polychrome","negative"}, n=true}
D[83] = {T="any_of", o={D[68],D[47],D[19]}}
D[84] = {T="object", p={}, r={}, ap=D[83], pn=D[44]}
D[85] = {T="enum", v={"2","3","4","5","6","7","8","9","10","Jack","Queen","King","Ace"}}
D[86] = {T="enum", v={"Hearts","Diamonds","Clubs","Spades"}}
D[87] = {T="object", p={rank=D[85],suit=D[86]}, r={"rank","suit"}}
D[88] = {T="enum", v={"Red","Blue","Gold","Purple"}, n=true}
D[89] = {T="object", p={edition=D[82],enhancement=D[43],eternal=D[19],extra=D[84],front=D[87],key=D[13],perishable=D[19],rental=D[19],seal=D[88]}, r={"key"}}
D[90] = {T="object", p={card=D[89],owner=D[73],uid=D[44]}, r={"card","owner","uid"}}
D[91] = {T="const", v="trap_plant"}
D[92] = {T="object", p={d=D[90],k=D[91]}, r={"d","k"}}
D[93] = {T="object", p={key=D[13],owner=D[73],uid=D[44]}, r={"key","owner","uid"}}
D[94] = {T="array", i=D[93], max=64}
D[95] = {T="array", i=D[44], max=64}
D[96] = {T="object", p={cards=D[94],fired=D[95]}, r={"cards","fired"}}
D[97] = {T="const", v="trap_held"}
D[98] = {T="object", p={d=D[96],k=D[97]}, r={"d","k"}}
D[99] = {T="object", p={key=D[13],owner=D[73],payload=D[48],uid=D[44]}, r={"key","owner","payload","uid"}}
D[100] = {T="const", v="trap_fired"}
D[101] = {T="object", p={d=D[99],k=D[100]}, r={"d","k"}}
D[102] = {T="string", max=32, n=true}
D[103] = {T="object", p={edition=D[102],eternal=D[19],key=D[13],perishable=D[19]}, r={"edition","eternal","key","perishable"}}
D[104] = {T="array", i=D[103], max=64}
D[105] = {T="object", p={deck_back=D[13],highest_pvp_score=D[13],interim=D[19],jokers=D[104]}, r={"deck_back","highest_pvp_score","interim","jokers"}}
D[106] = {T="const", v="player_result"}
D[107] = {T="object", p={d=D[105],k=D[106]}, r={"d","k"}}
D[108] = {T="object", p={}, r={}}
D[109] = {T="const", v="deck_req"}
D[110] = {T="object", p={d=D[108],k=D[109]}, r={"d","k"}}
D[111] = {T="const", v="deck_res"}
D[112] = {T="object", p={d=D[2],k=D[111]}, r={"d","k"}}
D[113] = {T="const", v="stats_req"}
D[114] = {T="object", p={d=D[108],k=D[113]}, r={"d","k"}}
D[115] = {T="array", i=D[13], max=64}
D[116] = {T="object", p={reroll_cost_total=D[50],reroll_count=D[14],vouchers=D[115]}, r={"reroll_cost_total","reroll_count","vouchers"}}
D[117] = {T="const", v="stats_res"}
D[118] = {T="object", p={d=D[116],k=D[117]}, r={"d","k"}}
D[119] = {T="union", key="k", m={nemesis_info=D[63],location=D[66],timer=D[71],sync=D[76],opp_ctx=D[81],trap_plant=D[92],trap_held=D[98],trap_fired=D[101],player_result=D[107],deck_req=D[110],deck_res=D[112],stats_req=D[114],stats_res=D[118]}}
D[120] = {T="string", min=1, max=32}
D[121] = {T="object", p={runId=D[120]}, r={"runId"}}
D[122] = {T="object", p={data=D[46],id=D[47],ok=D[19]}, r={"id","ok"}}
D[123] = {T="enum", v={"press","skip","hand_played","opp_skip"}}
D[124] = {T="object", p={op=D[123]}, r={"op"}}
D[125] = {T="string", max=500}
D[126] = {T="object", p={text=D[125]}, r={"text"}}
D[127] = {T="enum", v={"private","party"}}
D[128] = {T="enum", v={"pvp_nemesis","pvp_royale","pvp_manhunt","pvp_teams","pvp_smallworld"}}
D[129] = {T="object", p={kind=D[127],queueMode=D[128]}, r={"kind","queueMode"}}
D[130] = {T="object", p={key=D[13],stepId=D[44]}, r={"key","stepId"}}
D[131] = {T="object", p={code=D[13]}, r={"code"}}
D[132] = {T="object", p={on=D[19],userId=D[73]}, r={"userId"}}
D[133] = {T="object", p={queueMode=D[128]}, r={"queueMode"}}
D[134] = {T="integer", min=1, max=8}
D[135] = {T="object", p={deck=D[13],ruleset=D[13],seed=D[43],stake=D[134]}, r={"deck","ruleset","stake"}}
D[136] = {T="enum", v={"join","leave"}}
D[137] = {T="object", p={op=D[136],queueMode=D[128]}, r={"op","queueMode"}}
D[138] = {T="object", p={ready=D[19]}, r={"ready"}}
D[139] = {T="enum", v={"list","open","speed","seek","pov","close"}}
D[140] = {T="any_of", o={D[68],D[47]}}
D[141] = {T="object", p={id=D[47],op=D[139],value=D[140]}, r={"op"}}
D[142] = {T="enum", v={"rejoin","abandon"}}
D[143] = {T="object", p={op=D[142]}, r={"op"}}
D[144] = {T="enum", v={"planet","spectral","spectralplus"}, n=true}
D[145] = {T="object", p={challenge=D[43],deck=D[13],mpStake=D[144],stake=D[134]}, r={"deck","stake"}}
D[146] = {T="enum", v={"ruleset","gamemode","trapCards","manhuntHunterLives","startingLives","pvpStartRound","timer","timerBaseSeconds","timerIncrementSeconds","timerForgiveness","pvpCountdownSeconds","deathOnRoundLoss","goldOnLifeLoss","noGoldOnRoundLoss","customSeed","theOrder","hideScoreUntilPlayed","normalBosses","differentSeeds","differentDecks","randomLoadout","multiplayerJokers","modifierLayers","seatGraceMs"}}
D[147] = {T="string", max=40}
D[148] = {T="array", i=D[147], max=32}
D[149] = {T="any_of", o={D[68],D[19],D[47],D[148]}}
D[150] = {T="object", p={key=D[146],value=D[149]}, r={"key","value"}}
D[151] = {T="enum", v={"A","B","HUNTER","RUNNER"}}
D[152] = {T="object", p={team=D[151]}, r={"team"}}
D[153] = {T="integer", min=1, max=25}
D[154] = {T="enum", v={"standard","mirrored","classic"}}
D[155] = {T="enum", v={"always","once","off"}}
D[156] = {T="object", p={avatarJoker=D[13],blindCol=D[153],chat=D[19],nemesisLayout=D[154],showMpContent=D[19],timerSound=D[155]}, r={}}
D[157] = {T="object", p={option=D[47],stepId=D[44]}, r={"option","stepId"}}
D[158] = {T="enum", v={"in","own","system"}}
D[159] = {T="object", p={from=D[73],kind=D[158],name=D[47],text=D[125]}, r={"from","kind","name","text"}}
D[160] = {T="object", p={}, r={}, ap=D[105], pn=D[73]}
D[161] = {T="object", p={deck=D[2],players=D[160],stats=D[116]}, r={"players"}}
D[162] = {T="const", v="/Balatro/rmh_mp/glyphs.bin"}
D[163] = {T="object", p={fontKey=D[47],path=D[162]}, r={"fontKey","path"}}
D[164] = {T="object", p={days=D[14],games=D[14],losses=D[14],pvpGames=D[14],streak=D[14],wins=D[14]}, r={"days","games","losses","pvpGames","streak","wins"}}
D[165] = {T="object", p={hostId=D[73]}, r={"hostId"}}
D[166] = {T="object", p={code=D[44]}, r={"code"}}
D[167] = {T="object", p={}, r={}, ap=D[120], pn=D[73]}
D[168] = {T="array", i=D[73], max=256}
D[169] = {T="enum", v={"private","casual","party"}}
D[170] = {T="const", v="random"}
D[171] = {T="any_of", o={D[170],D[13]}}
D[172] = {T="const", v="gamemode_mp_attrition"}
D[173] = {T="integer", min=7, max=16}
D[174] = {T="array", i=D[13], max=32}
D[175] = {T="integer", min=0, max=10}
D[176] = {T="integer", min=1, max=20}
D[177] = {T="integer", min=1000, max=600000}
D[178] = {T="integer", min=1, max=3600}
D[179] = {T="integer", min=0, max=3600}
D[180] = {T="object", p={customSeed=D[171],deathOnRoundLoss=D[19],differentDecks=D[19],differentSeeds=D[19],gamemode=D[172],goldOnLifeLoss=D[19],hideScoreUntilPlayed=D[19],manhuntHunterLives=D[173],modifierLayers=D[174],multiplayerJokers=D[19],noGoldOnRoundLoss=D[19],normalBosses=D[19],pvpCountdownSeconds=D[175],pvpStartRound=D[176],randomLoadout=D[19],ruleset=D[13],seatGraceMs=D[177],startingLives=D[176],theOrder=D[19],timer=D[19],timerBaseSeconds=D[178],timerForgiveness=D[175],timerIncrementSeconds=D[179],trapCards=D[19]}, r={"customSeed","deathOnRoundLoss","differentDecks","differentSeeds","gamemode","goldOnLifeLoss","hideScoreUntilPlayed","manhuntHunterLives","modifierLayers","multiplayerJokers","noGoldOnRoundLoss","normalBosses","pvpCountdownSeconds","pvpStartRound","randomLoadout","ruleset","seatGraceMs","startingLives","theOrder","timer","timerBaseSeconds","timerForgiveness","timerIncrementSeconds","trapCards"}}
D[181] = {T="string", max=512, n=true}
D[182] = {T="enum", v={"direct","turn","relay"}}
D[183] = {T="enum", v={"player","spectator"}}
D[184] = {T="object", p={avatarJoker=D[13],avatarUrl=D[181],away=D[19],blindCol=D[153],catchingUp=D[19],conn=D[182],connected=D[19],id=D[73],joinedAt=D[68],name=D[47],ready=D[19],role=D[183],team=D[151]}, r={"avatarJoker","avatarUrl","away","blindCol","catchingUp","conn","connected","id","joinedAt","name","ready","role"}}
D[185] = {T="array", i=D[184], max=24}
D[186] = {T="enum", v={"ban","pick"}}
D[187] = {T="string", min=1, max=64, n=true}
D[188] = {T="enum", v={"open","banned","picked"}}
D[189] = {T="object", p={deck=D[13],stake=D[134],state=D[188]}, r={"deck","stake","state"}}
D[190] = {T="array", i=D[189], max=9}
D[191] = {T="object", p={action=D[186],actor=D[187],remaining=D[14],tiles=D[190]}, r={"action","actor","remaining","tiles"}, n=true}
D[192] = {T="enum", v={"ruleset_vote","trap_vote","draft"}}
D[193] = {T="number", min=0, max=1}
D[194] = {T="object", p={chance=D[193],count=D[14],id=D[47]}, r={"id"}}
D[195] = {T="array", i=D[194], max=16}
D[196] = {T="enum", v={"voting","rolling","reveal","done"}}
D[197] = {T="string", max=64, n=true}
D[198] = {T="object", p={draft=D[191],kind=D[192],msLeft=D[14],options=D[195],phase=D[196],result=D[197],stepId=D[44],voted=D[14],voters=D[14]}, r={"draft","kind","msLeft","options","phase","result","stepId","voted","voters"}, n=true}
D[199] = {T="object", p={deck=D[13],seed=D[13],stake=D[134]}, r={}}
D[200] = {T="object", p={}, r={}, ap=D[199], pn=D[73]}
D[201] = {T="array", i=D[13], max=1024}
D[202] = {T="enum", v={"default","majorleague","sandbox"}}
D[203] = {T="number", n=true}
D[204] = {T="object", p={comeback=D[202],enemyLocationDisabled=D[19],theOrder=D[19],timerDisplayThreshold=D[203]}, r={"comeback","enemyLocationDisabled","theOrder","timerDisplayThreshold"}}
D[205] = {T="string", max=256}
D[206] = {T="any_of", o={D[68],D[19],D[205]}}
D[207] = {T="object", p={}, r={}, ap=D[206], pn=D[47]}
D[208] = {T="array", i=D[13], max=256}
D[209] = {T="object", p={}, r={}, ap=D[68], pn=D[47]}
D[210] = {T="integer"}
D[211] = {T="enum", v={"default","pressure","no_animation","speedlatro"}}
D[212] = {T="object", p={base=D[68],countdown=D[68],enabled=D[19],forgiveness=D[210],increment=D[68],mode=D[211],mult=D[68],pressurePlusHand=D[68],pvpBase=D[203],pvpHandIncrement=D[68]}, r={"base","countdown","enabled","forgiveness","increment","mode","mult","pressurePlusHand","pvpBase","pvpHandIncrement"}}
D[213] = {T="object", p={banned=D[201],bannedSilent=D[201],flags=D[204],gameModifiers=D[207],included=D[201],key=D[13],layers=D[115],multiplayerContent=D[19],reworked=D[208],setupHooks=D[115],spectralBannedEnhancements=D[174],startingParams=D[209],stickers=D[174],timer=D[212]}, r={"banned","bannedSilent","flags","gameModifiers","included","key","layers","multiplayerContent","reworked","setupHooks","spectralBannedEnhancements","startingParams","stickers","timer"}}
D[214] = {T="object", p={avatarJoker=D[13],blindCol=D[153],id=D[73],name=D[47],team=D[151]}, r={"avatarJoker","blindCol","id","name"}}
D[215] = {T="array", i=D[214], max=16}
D[216] = {T="object", p={manhunt=D[19],nemesisPairing=D[19],practice=D[19],teamBased=D[19]}, r={"manhunt","nemesisPairing","teamBased"}}
D[217] = {T="object", p={challenge=D[43],contentHash=D[13],deck=D[13],hostId=D[73],layers=D[115],mpStake=D[144],options=D[180],perPlayer=D[200],queueMode=D[128],resolved=D[213],roster=D[215],ruleset=D[13],runId=D[120],seed=D[13],shape=D[216],stake=D[134],startedAt=D[68]}, r={"challenge","contentHash","deck","hostId","layers","mpStake","options","queueMode","resolved","roster","ruleset","runId","seed","shape","stake","startedAt"}, n=true}
D[218] = {T="object", p={challenge=D[43],code=D[13],deck=D[13],forfeited=D[167],hostId=D[73],kicked=D[168],kind=D[169],mpStake=D[144],open=D[19],options=D[180],players=D[185],queueMode=D[128],setup=D[198],stake=D[134],started=D[217],successorId=D[187],version=D[14]}, r={"challenge","code","deck","forfeited","hostId","kicked","kind","mpStake","open","options","players","queueMode","setup","stake","started","successorId","version"}}
D[219] = {T="object", p={canStart=D[19],isHost=D[19],me=D[73],startBlockReason=D[47],state=D[218]}, r={"canStart","isHost","me","state"}}
D[220] = {T="object", p={challenge=D[43],contentHash=D[13],deck=D[13],hostId=D[73],layers=D[115],me=D[73],mpStake=D[144],options=D[180],perPlayer=D[200],queueMode=D[128],resolved=D[213],roster=D[215],ruleset=D[13],runId=D[120],seed=D[13],shape=D[216],stake=D[134],startedAt=D[68]}, r={"challenge","contentHash","deck","hostId","layers","me","mpStake","options","queueMode","resolved","roster","ruleset","runId","seed","shape","stake","startedAt"}}
D[221] = {T="enum", v={"loading","ready","error"}}
D[222] = {T="object", p={error=D[205],progress=D[193],status=D[221]}, r={"status"}}
D[223] = {T="object", p={avatarUrl=D[181],name=D[47]}, r={"avatarUrl","name"}}
D[224] = {T="enum", v={"connected","connecting","offline"}}
D[225] = {T="object", p={account=D[223],hub=D[224],reason=D[47]}, r={"account","hub"}}
D[226] = {T="const", v=1}
D[227] = {T="const", v="*all*"}
D[228] = {T="any_of", o={D[73],D[227]}}
D[229] = {T="const", v="player_lives"}
D[230] = {T="object", p={lives=D[12],lost=D[226],player_id=D[228],t=D[229]}, r={"lives","player_id","t"}}
D[231] = {T="const", v="team_lives"}
D[232] = {T="enum", v={"A","B"}}
D[233] = {T="object", p={lives=D[12],t=D[231],team_id=D[232]}, r={"lives","t","team_id"}}
D[234] = {T="object", p={}, r={}, ap=D[151], pn=D[73]}
D[235] = {T="const", v="team_roster"}
D[236] = {T="object", p={roster=D[234],t=D[235]}, r={"roster","t"}}
D[237] = {T="const", v=""}
D[238] = {T="any_of", o={D[73],D[237]}}
D[239] = {T="object", p={}, r={}, ap=D[238], pn=D[73]}
D[240] = {T="const", v="nemesis_pairing"}
D[241] = {T="object", p={ante=D[14],pairing=D[239],t=D[240]}, r={"ante","pairing","t"}}
D[242] = {T="const", v="team_card_target"}
D[243] = {T="object", p={pairing=D[239],t=D[242]}, r={"pairing","t"}}
D[244] = {T="const", v="royale_target"}
D[245] = {T="object", p={t=D[244],targets=D[239]}, r={"t","targets"}}
D[246] = {T="const", v="manhunt_target"}
D[247] = {T="object", p={t=D[246],target_id=D[238]}, r={"t","target_id"}}
D[248] = {T="const", v="team_score_board"}
D[249] = {T="object", p={A=D[13],B=D[13]}, r={"A","B"}}
D[250] = {T="object", p={t=D[248],team_scores=D[249]}, r={"t","team_scores"}}
D[251] = {T="object", p={}, r={}, ap=D[3], pn=D[73]}
D[252] = {T="const", v="start_blind"}
D[253] = {T="object", p={first_player=D[238],starting_hands=D[251],t=D[252]}, r={"first_player","starting_hands","t"}}
D[254] = {T="const", v="timer_hand_lost"}
D[255] = {T="object", p={player_id=D[73],t=D[254]}, r={"player_id","t"}}
D[256] = {T="const", v="end_pvp"}
D[257] = {T="object", p={loser_id=D[238],pvp_timer_lost=D[19],t=D[256]}, r={"loser_id","pvp_timer_lost","t"}}
D[258] = {T="const", v="death_pending"}
D[259] = {T="object", p={blind_key=D[44],opponent_id=D[73],player_id=D[73],t=D[258],team_id=D[151]}, r={"blind_key","t"}}
D[260] = {T="const", v="eliminated"}
D[261] = {T="object", p={player_id=D[73],t=D[260]}, r={"player_id","t"}}
D[262] = {T="integer", min=1}
D[263] = {T="object", p={}, r={}, ap=D[262], pn=D[73]}
D[264] = {T="const", v="win"}
D[265] = {T="object", p={draw=D[77],places=D[263],t=D[264],winner_id=D[73],winner_team_id=D[151]}, r={"t"}}
D[266] = {T="const", v="player_won"}
D[267] = {T="object", p={player_id=D[73],t=D[266]}, r={"player_id","t"}}
D[268] = {T="const", v="reseed"}
D[269] = {T="object", p={seed=D[13],t=D[268]}, r={"seed","t"}}
D[270] = {T="const", v="speedrun"}
D[271] = {T="object", p={player_id=D[73],t=D[270]}, r={"player_id","t"}}
D[272] = {T="enum", v={"seed","draw"}}
D[273] = {T="const", v="vote_progress"}
D[274] = {T="object", p={k=D[14],kind=D[272],n=D[14],t=D[273]}, r={"k","kind","n","t"}}
D[275] = {T="union", key="t", m={player_lives=D[230],team_lives=D[233],team_roster=D[236],nemesis_pairing=D[241],team_card_target=D[243],royale_target=D[245],manhunt_target=D[247],team_score_board=D[250],start_blind=D[253],timer_hand_lost=D[255],end_pvp=D[257],death_pending=D[259],eliminated=D[261],win=D[265],player_won=D[267],reseed=D[269],speedrun=D[271],vote_progress=D[274]}}
D[276] = {T="object", p={hs=D[14],o=D[275]}, r={"hs","o"}}
D[277] = {T="object", p={d=D[61],from=D[73],k=D[62]}, r={"d","from","k"}}
D[278] = {T="object", p={d=D[64],from=D[73],k=D[65]}, r={"d","from","k"}}
D[279] = {T="object", p={d=D[69],from=D[73],k=D[70]}, r={"d","from","k"}}
D[280] = {T="object", p={d=D[74],from=D[73],k=D[75]}, r={"d","from","k"}}
D[281] = {T="object", p={d=D[79],from=D[73],k=D[80]}, r={"d","from","k"}}
D[282] = {T="object", p={d=D[90],from=D[73],k=D[91]}, r={"d","from","k"}}
D[283] = {T="object", p={d=D[96],from=D[73],k=D[97]}, r={"d","from","k"}}
D[284] = {T="object", p={d=D[99],from=D[73],k=D[100]}, r={"d","from","k"}}
D[285] = {T="object", p={d=D[105],from=D[73],k=D[106]}, r={"d","from","k"}}
D[286] = {T="object", p={d=D[108],from=D[73],k=D[109]}, r={"d","from","k"}}
D[287] = {T="object", p={d=D[2],from=D[73],k=D[111]}, r={"d","from","k"}}
D[288] = {T="object", p={d=D[108],from=D[73],k=D[113]}, r={"d","from","k"}}
D[289] = {T="object", p={d=D[116],from=D[73],k=D[117]}, r={"d","from","k"}}
D[290] = {T="union", key="k", m={nemesis_info=D[277],location=D[278],timer=D[279],sync=D[280],opp_ctx=D[281],trap_plant=D[282],trap_held=D[283],trap_fired=D[284],player_result=D[285],deck_req=D[286],deck_res=D[287],stats_req=D[288],stats_res=D[289]}}
D[291] = {T="object", p={deck=D[13],resolved=D[213],seed=D[43],stake=D[134]}, r={"deck","resolved","seed","stake"}}
D[292] = {T="enum", v={"away","back","catching_up","caught_up","left","forfeited"}}
D[293] = {T="object", p={graceMsLeft=D[14],id=D[73],status=D[292]}, r={"id","status"}}
D[294] = {T="enum", v={"idle","searching","matched","cancelled"}}
D[295] = {T="object", p={queueMode=D[128],state=D[294],waiting=D[14]}, r={"queueMode","state"}}
D[296] = {T="const", v="/rmh/mp/run.jkr"}
D[297] = {T="const", v="/rmh/mp/state.json"}
D[298] = {T="object", p={runId=D[120],snapshotPath=D[296],statePath=D[297]}, r={"runId","snapshotPath","statePath"}}
D[299] = {T="object", p={events=D[52],pov=D[73]}, r={"events","pov"}}
D[300] = {T="array", i=D[47], max=16}
D[301] = {T="enum", v={"win","lose","draw"}, n=true}
D[302] = {T="object", p={at=D[68],id=D[47],players=D[300],queueMode=D[128],result=D[301],ruleset=D[13]}, r={"at","id","players","queueMode","result","ruleset"}}
D[303] = {T="array", i=D[302], max=30}
D[304] = {T="object", p={id=D[47],len=D[50],pos=D[50],pov=D[73]}, r={"id","len","pos","pov"}, n=true}
D[305] = {T="object", p={list=D[303],playing=D[304],speed=D[50]}, r={}}
D[306] = {T="object", p={draft=D[191],kind=D[192],msLeft=D[14],options=D[195],phase=D[196],result=D[197],stepId=D[44],voted=D[14],voters=D[14]}, r={"draft","kind","msLeft","options","phase","result","stepId","voted","voters"}}
D[307] = {T="integer", n=true}
D[308] = {T="object", p={ante=D[307],code=D[13],players=D[14],queueMode=D[128]}, r={"ante","code","players","queueMode"}}
D[309] = {T="array", i=D[308], max=50}
D[310] = {T="object", p={error=D[44],lobbies=D[309]}, r={"lobbies"}}
D[311] = {T="object", p={ante=D[14],at=D[50],hands_left=D[3],lives=D[12],score=D[13],skips=D[14]}, r={"ante","at","hands_left","score","skips"}}
D[312] = {T="array", i=D[311], max=256}
D[313] = {T="object", p={id=D[73],results=D[312]}, r={"id","results"}}
D[314] = {T="array", i=D[46], max=32}
D[315] = {T="object", p={args=D[314],cmd=D[47],id=D[47]}, r={"args","cmd","id"}}
D[316] = {T="enum", v={"normal","orange","important"}}
D[317] = {T="const", v=">>", n=true}
D[318] = {T="enum", v={"ante","pvp","speedlatro"}}
D[319] = {T="object", p={auto=D[19],beingTimered=D[19],color=D[316],display=D[317],mode=D[318],pressable=D[19],ticking=D[19],timering=D[19],value=D[68]}, r={"auto","beingTimered","color","display","mode","pressable","ticking","timering","value"}}
D[320] = {T="any_of", o={D[205],D[68]}}
D[321] = {T="object", p={}, r={}, ap=D[320], pn=D[44]}
D[322] = {T="object", p={key=D[47],vars=D[321]}, r={"key"}}
D[323] = {T="object", p={k=D[14],kind=D[272],n=D[14]}, r={"k","kind","n"}}

P.SCHEMA = {
  l2j = {
    deck_res_local = D[2],
    ev = D[42],
    flags = D[45],
    log = D[53],
    match_left = D[55],
    mp_log = D[58],
    mp_open = D[60],
    peer = D[119],
    snapshot = D[121],
    stats_local = D[116],
    test_res = D[122],
    timer_input = D[124],
    ui_chat = D[126],
    ui_continue_sp = D[108],
    ui_copy_code = D[108],
    ui_create_lobby = D[129],
    ui_draft = D[130],
    ui_invite = D[108],
    ui_join = D[131],
    ui_join_clipboard = D[108],
    ui_kick = D[132],
    ui_leave = D[108],
    ui_mute = D[132],
    ui_party_queue = D[133],
    ui_practice = D[135],
    ui_queue = D[137],
    ui_ready = D[138],
    ui_replay = D[141],
    ui_return_lobby = D[108],
    ui_seat = D[143],
    ui_set_deck = D[145],
    ui_set_option = D[150],
    ui_set_team = D[152],
    ui_settings = D[156],
    ui_spectate = D[131],
    ui_spectate_list = D[108],
    ui_start = D[108],
    ui_vote = D[157],
  },
  j2l = {
    chat_line = D[159],
    end_data = D[161],
    glyphs = D[163],
    history = D[164],
    host_changed = D[165],
    lobby_error = D[166],
    lobby_view = D[219],
    match_start = D[220],
    mp_pack = D[222],
    net_status = D[225],
    outcome = D[276],
    peer = D[290],
    practice_start = D[291],
    presence = D[293],
    queue_view = D[295],
    rejoin_restore = D[298],
    replay_feed = D[299],
    replay_view = D[305],
    setup_view = D[306],
    spectate_view = D[310],
    tail = D[313],
    test_cmd = D[315],
    timer_cue = D[108],
    timer_state = D[319],
    toast = D[322],
    vote_progress = D[323],
  },
}

-- ── Validator ──────────────────────────────────────────────────────────────

P.NULL = setmetatable({}, { __tostring = function() return 'null' end })
local null_sentinel = P.NULL

function P.set_null(sentinel)
  null_sentinel = sentinel
end

local function is_null(v)
  return v == nil or v == P.NULL or (null_sentinel ~= nil and v == null_sentinel)
end
P.is_null = is_null

local function cplen(s)
  local _, n = string.gsub(s, '[^\128-\191]', '')
  return n
end

local function is_array(t)
  local n = #t
  local count = 0
  for k in pairs(t) do
    if type(k) ~= 'number' or k < 1 or k > n or math.floor(k) ~= k then return false end
    count = count + 1
  end
  return count == n
end

local function describe(v)
  if is_null(v) then return 'null' end
  return type(v)
end

local check

local function fail(path, msg)
  return false, path .. ': ' .. msg
end

local function check_number(d, v, path)
  if type(v) ~= 'number' then return fail(path, 'expected number, got ' .. describe(v)) end
  if v ~= v or v == math.huge or v == -math.huge then return fail(path, 'not a finite number') end
  if d.T == 'integer' and math.floor(v) ~= v then return fail(path, 'expected integer') end
  if d.min and v < d.min then return fail(path, 'below minimum ' .. d.min) end
  if d.max and v > d.max then return fail(path, 'above maximum ' .. d.max) end
  if d.xmin and v <= d.xmin then return fail(path, 'not above ' .. d.xmin) end
  if d.xmax and v >= d.xmax then return fail(path, 'not below ' .. d.xmax) end
  return true
end

local function check_object(d, v, path)
  if type(v) ~= 'table' then return fail(path, 'expected object, got ' .. describe(v)) end
  if v[1] ~= nil then return fail(path, 'expected object, got array') end
  for _, k in ipairs(d.r) do
    local sub = d.p[k]
    if v[k] == nil and sub and not (sub.n or sub.T == 'any' or sub.T == 'null') then
      return fail(path .. '.' .. k, 'required')
    end
  end
  for k, sub in pairs(d.p) do
    local fv = v[k]
    if fv ~= nil then
      local ok, err = check(sub, fv, path .. '.' .. k)
      if not ok then return false, err end
    end
  end
  if d.ap ~= nil or d.pn ~= nil then
    for k, fv in pairs(v) do
      if d.p[k] == nil then
        if type(k) ~= 'string' then return fail(path, 'non-string key') end
        if d.ap == false then return fail(path .. '.' .. k, 'unknown key') end
        if d.pn then
          local ok, err = check(d.pn, k, path .. '[key ' .. k .. ']')
          if not ok then return false, err end
        end
        if d.ap then
          local ok, err = check(d.ap, fv, path .. '.' .. k)
          if not ok then return false, err end
        end
      end
    end
  end
  return true
end

check = function(d, v, path)
  local T = d.T
  if T == 'any' then return true end
  if is_null(v) then
    if T == 'null' or d.n then return true end
    return fail(path, 'expected ' .. T .. ', got null')
  end
  if T == 'null' then return fail(path, 'expected null, got ' .. describe(v)) end
  if T == 'boolean' then
    if type(v) ~= 'boolean' then return fail(path, 'expected boolean, got ' .. describe(v)) end
    return true
  elseif T == 'string' then
    if type(v) ~= 'string' then return fail(path, 'expected string, got ' .. describe(v)) end
    if d.min or d.max then
      local n = cplen(v)
      if d.min and n < d.min then return fail(path, 'shorter than ' .. d.min) end
      if d.max and n > d.max then return fail(path, 'longer than ' .. d.max) end
    end
    return true
  elseif T == 'number' or T == 'integer' then
    return check_number(d, v, path)
  elseif T == 'const' then
    if v ~= d.v then return fail(path, 'expected ' .. tostring(d.v)) end
    return true
  elseif T == 'enum' then
    for _, e in ipairs(d.v) do
      if v == e then return true end
    end
    return fail(path, 'not one of the allowed values')
  elseif T == 'array' then
    if type(v) ~= 'table' or not is_array(v) then return fail(path, 'expected array, got ' .. describe(v)) end
    local n = #v
    if d.min and n < d.min then return fail(path, 'fewer than ' .. d.min .. ' items') end
    if d.max and n > d.max then return fail(path, 'more than ' .. d.max .. ' items') end
    for i = 1, n do
      local ok, err = check(d.i, v[i], path .. '[' .. i .. ']')
      if not ok then return false, err end
    end
    return true
  elseif T == 'tuple' then
    if type(v) ~= 'table' or not is_array(v) then return fail(path, 'expected array, got ' .. describe(v)) end
    if #v ~= #d.i then return fail(path, 'expected ' .. #d.i .. ' items') end
    for i = 1, #d.i do
      local ok, err = check(d.i[i], v[i], path .. '[' .. i .. ']')
      if not ok then return false, err end
    end
    return true
  elseif T == 'object' then
    return check_object(d, v, path)
  elseif T == 'union' then
    if type(v) ~= 'table' then return fail(path, 'expected object, got ' .. describe(v)) end
    local tag = v[d.key]
    local branch = type(tag) == 'string' and d.m[tag] or nil
    if not branch then return fail(path .. '.' .. d.key, 'unknown variant ' .. tostring(tag)) end
    return check(branch, v, path)
  elseif T == 'any_of' then
    local first
    for _, o in ipairs(d.o) do
      local ok, err = check(o, v, path)
      if ok then return true end
      first = first or err
    end
    return false, first or fail(path, 'no option matched')
  end
  return fail(path, 'unknown descriptor ' .. tostring(T))
end

P.check = check

--- Validate one message. dir = 'l2j' | 'j2l'. Returns true, or false and a reason.
function P.validate(dir, t, d)
  local schemas = P.SCHEMA[dir]
  if not schemas then return false, 'unknown direction ' .. tostring(dir) end
  if type(t) ~= 'string' then return false, 'type is not a string' end
  local schema = schemas[t]
  if not schema then return false, 'unknown type ' .. t end
  if d == nil then d = {} end
  return check(schema, d, t)
end

--- True if the type exists in that direction.
function P.known(dir, t)
  local schemas = P.SCHEMA[dir]
  return schemas ~= nil and schemas[t] ~= nil
end

return P
