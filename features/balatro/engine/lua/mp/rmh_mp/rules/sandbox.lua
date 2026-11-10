-- rmh_mp/rules/sandbox.lua — the `sandbox` layer's run-start hook and per-round globals (LY-09).
--
-- Layer hook 'sandbox' (WS4 layers.ts `hook: true`; runs in the pre-roll, run seed in effect):
--   keep ONE of the two idols: the sorted idol keys are shuffled with stream
--   'idol_selection_mp_sandbox' and every idol but the first is added to G.GAME.banned_keys, so
--   every peer (same seed) keeps the same one. ("Real Extra Credit mod present" -> n/a.)
--
-- Per-round globals (sandbox layer only; rolled after vanilla's own at run start and at every
-- round end — a post-layer on reset_castle_card, the last of vanilla's per-round resets):
--   current_round.zealot_idol = { id, rank }  rank weighted by copies in the deck (Stone excluded),
--                                             stream 'zealot_idol<ante>' (candidates sorted by count
--                                             desc, then rank order)
--   current_round.tuxedo_card = { suit }      a suit other than last round's, stream 'tux'
--   current_round.farmer_card = { suit }      a suit other than last round's, stream 'farm'
--   current_round.fish_rank   = { rank, id }  a rank other than last round's, stream 'fish'
-- They run for every player whether or not the jokers are held, so the streams stay in step.

local MP = require 'rmh_mp.state'
local C = require 'rmh_mp.content.jokers.core'
local S = require 'rmh_mp.content.jokers.sandbox'
local rng = require 'rmh_mp.util.rng'

local L = {}
S.rules = L

--- LY-09: ban every idol but the one the seeded shuffle keeps. Returns the kept key.
function L.pick_idol()
  local keys = {}
  for i, k in ipairs(S.IDOLS) do keys[i] = k end
  table.sort(keys)
  local order = rng.shuffle(keys, 'idol_selection_mp_sandbox')
  local banned = G.GAME.banned_keys
  for i = 2, #order do banned[order[i]] = true end
  return order[1]
end

function L.apply(ctx)
  local kept = L.pick_idol()
  if ctx then ctx.sandbox_idol = kept end
  return kept
end

MP.rules.layer_hook(S.LAYER, L.apply)

-- ── Per-round globals ───────────────────────────────────────────────────────

--- Zealot: a rank weighted by its copies in the deck (Stone excluded).
function L.reset_zealot()
  local cr = G.GAME.current_round
  cr.zealot_idol = { id = 14, rank = 'Ace' }
  if not G.playing_cards then return cr.zealot_idol end
  local by, list, total = {}, {}, 0
  for _, v in ipairs(G.playing_cards) do
    if not S.is_stone(v) and v.base and v.base.value then
      local e = by[v.base.value]
      if not e then
        e = { rank = v.base.value, id = v.base.id or S.RANK_ID[v.base.value], count = 0 }
        by[v.base.value] = e
        list[#list + 1] = e
      end
      e.count = e.count + 1
      total = total + 1
    end
  end
  if total == 0 then return cr.zealot_idol end
  table.sort(list, function(a, b)
    if a.count ~= b.count then return a.count > b.count end
    return (S.RANK_INDEX[a.rank] or 99) < (S.RANK_INDEX[b.rank] or 99)
  end)
  local roll = pseudorandom('zealot_idol' .. G.GAME.round_resets.ante)
  local acc = 0
  for _, e in ipairs(list) do
    acc = acc + e.count / total
    if roll < acc then
      cr.zealot_idol = { id = e.id, rank = e.rank }
      return cr.zealot_idol
    end
  end
  cr.zealot_idol = { id = list[1].id, rank = list[1].rank }
  return cr.zealot_idol
end

local function pick_other(list, current, key)
  local options = {}
  for _, v in ipairs(list) do if v ~= current then options[#options + 1] = v end end
  return rng.pick(options, key)
end

function L.reset_suit(field, key)
  local cr = G.GAME.current_round
  cr[field] = cr[field] or {}
  cr[field].suit = pick_other(S.SUIT_ORDER, cr[field].suit, key)
  return cr[field].suit
end

function L.reset_fish()
  local cr = G.GAME.current_round
  cr.fish_rank = cr.fish_rank or {}
  local r = pick_other(S.RANK_ORDER, cr.fish_rank.rank, 'fish')
  cr.fish_rank.rank, cr.fish_rank.id = r, S.RANK_ID[r]
  return r
end

function L.reset_globals()
  L.reset_zealot()
  L.reset_suit('tuxedo_card', 'tux')
  L.reset_suit('farmer_card', 'farm')
  L.reset_fish()
end

function L.install()
  MP.hooks.wrap(_G, 'reset_castle_card', function(orig, ...)
    local r = orig(...)
    if S.active() and G.GAME and G.GAME.current_round then
      local ok, err = pcall(L.reset_globals)
      if not ok then MP.log('error', 'sandbox per-round globals failed: %s', tostring(err)) end
    end
    return r
  end, { group = 'session', optional = true, id = 'content.sandbox.globals' })
end

C.add_installer(L.install)

return L
