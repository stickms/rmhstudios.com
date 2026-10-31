-- rmh_mp/hooks/economy.lua — money hooks (FL-14, FL-16, FL-17, FL-18, HUD-13 stats; A1 §7).
--
--   evaluate_round        PvP blind: always the $5 reward, no unused-hands money; failed normal
--                         blind: reward unless no_gold_on_round_loss (blind.dollars zeroed earlier)
--   add_round_eval_row    the comeback row before 'bottom' (and its dollars added to the total);
--                         RMH_MP.eval_row_label() labels it through the one-line source hook
--   ease_dollars          spend tracking (every negative change)
--   Game.update_shop      shop-open snapshot, location loc_shop-<next blind key> (HUD-02:
--                         "Shopping before Big Blind"; bare loc_shop when no blind is known)
--   G.FUNCS.toggle_shop   leaving the shop: opp_ctx {opponent_spent_in_shop}, interim player_result
--   Card.sell_card        opp_ctx {opponent_selling_card}; sells per ante
--   G.FUNCS.reroll_shop   reroll count and total cost (end-of-match stats)
--   MP.economy.comeback_amount()  default $4 ($2 at stake >= 6) · majorleague $4 × lives lost ·
--                         sandbox $3 × (ante − 1)

local MP = require 'rmh_mp.state'
local att = require 'rmh_mp.rules.attrition'

local E = {}
MP.economy = E

E.COMEBACK = { default = 4, default_high_stake = 2, high_stake = 6, majorleague = 4, sandbox = 3 }

function E.comeback_amount()
  local mode = (MP.resolved().flags or {}).comeback or 'default'
  local cb = MP.state.comeback
  if mode == 'majorleague' then return E.COMEBACK.majorleague * (cb.total_lost or 0) end
  if mode == 'sandbox' then return E.COMEBACK.sandbox * math.max(0, (G.GAME.round_resets.ante or 1) - 1) end
  if (G.GAME.stake or 1) >= E.COMEBACK.high_stake then return E.COMEBACK.default_high_stake end
  return E.COMEBACK.default
end

--- Called by the outcome handler on every change of my lives (D-04: arms only on a decrease).
--- The blind the player meets after this shop: vanilla's blind_on_deck rule (the first of
--- Small/Big/Boss not Defeated, Skipped or Hidden; cash_out has already reset the states after a
--- Boss), resolved through round_resets.blind_choices, or the Nemesis blind for a PvP Boss slot.
--- nil when the run has no blind table.
local DONE = { Defeated = true, Skipped = true, Hide = true }
function E.next_blind_key()
  local rr = G and G.GAME and G.GAME.round_resets
  local states, choices = rr and rr.blind_states, rr and rr.blind_choices
  if type(states) ~= 'table' or type(choices) ~= 'table' then return nil end
  local slot = 'Boss'
  if not DONE[states.Small] then slot = 'Small' elseif not DONE[states.Big] then slot = 'Big' end
  -- A PvP Boss slot plays the Nemesis blind (the real boss stays in blind_choices.Boss).
  if att.slot_is_pvp(slot, rr.ante) and att.uses_nemesis_blind() then return att.PVP_BLIND end
  local key = choices[slot]
  if type(key) ~= 'string' or key == '' then return nil end
  return key
end

function E.shop_location()
  local key = E.next_blind_key()
  return key and ('loc_shop-' .. key) or 'loc_shop'
end

function E.on_my_lives(prev, now)
  local cb = MP.state.comeback
  if prev and now and now < prev and prev > 0 then
    cb.count = (cb.count or 0) + 1
    cb.total_lost = (cb.total_lost or 0) + (prev - now)
    if MP.option('goldOnLifeLoss', true) then cb.armed = true end
  end
end

--- The (b) one-line hook in add_round_eval_row's label chain (requested from WS2's patch list):
---   elseif RMH_MP and RMH_MP.eval_row_label(config, left_text, scale, num_dollars) then
function E.eval_row_label(config, left_text, scale, num_dollars)
  if not (config and config.name == 'mp_comeback') then return false end
  local mode = (MP.resolved().flags or {}).comeback or 'default'
  local text
  if mode == 'sandbox' then
    text = rawget(_G, 'localize') and localize('k_comeback_money_sandbox') or 'Comeback Money'
  else
    local fmt = rawget(_G, 'localize') and localize('k_total_lives_lost') or ' Total Lives Lost'
    text = tostring(MP.state.comeback.count or 0) .. fmt
  end
  if rawget(_G, 'DynaText') then
    table.insert(left_text, { n = G.UIT.O, config = { object = DynaText({ string = { text },
      colours = { G.C.PURPLE or G.C.UI.TEXT_LIGHT }, shadow = true, pop_in = 0, scale = 0.4 * scale, silent = true }) } })
  else
    table.insert(left_text, { n = 'T', config = { text = text } })
  end
  return true
end
MP.eval_row_label = E.eval_row_label

function E.install()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'economy.' .. id } end
  local in_play = function() return MP.is_match() or MP.is_practice() end

  if G and G.FUNCS then
    wrap(G.FUNCS, 'evaluate_round', function(orig, ...)
      if not in_play() then return orig(...) end
      local mods = G.GAME.modifiers
      local on_pvp = MP.pvp and MP.pvp.on_pvp_blind()
      local saved_hand_money = mods.no_extra_hand_money
      local blind = G.GAME.blind
      local saved_chips = blind and blind.chips
      if on_pvp then
        mods.no_extra_hand_money = true
        if blind then blind.dollars = 5; blind.chips = math.min(blind.chips or 0, G.GAME.chips or 0) end
      end
      local ok, err = pcall(orig, ...)
      if on_pvp then mods.no_extra_hand_money = saved_hand_money; if blind then blind.chips = saved_chips end end
      if not ok then error(err, 0) end
    end, o('evaluate_round'))

    wrap(_G, 'add_round_eval_row', function(orig, config, ...)
      if in_play() and config and config.name == 'bottom' and MP.state.comeback.armed then
        local n = E.comeback_amount()
        MP.state.comeback.armed = false
        if n > 0 then
          -- Vanilla's 'bottom' row has no pitch, and a bonus row computes 1.5 * pitch (E2E-14
          -- crashed the losing player's round evaluation): give the row its own.
          orig({ name = 'mp_comeback', bonus = true, dollars = n, pitch = config.pitch or 1, disp = MP.state.comeback.count })
          config.dollars = (config.dollars or 0) + n
        end
      end
      return orig(config, ...)
    end, o('eval_row'))

    wrap(G.FUNCS, 'toggle_shop', function(orig, ...)
      local leaving = G.shop ~= nil
      local r = orig(...)
      if leaving and MP.is_match() then
        local sp = MP.state.spent
        sp.in_shop = math.max(0, (sp.total or 0) - (sp.before_shop or 0))
        MP.peer.send('opp_ctx', { ctx = { opponent_spent_in_shop = sp.in_shop } })
        if MP.report and MP.report.send_player_result then MP.report.send_player_result(true) end
      end
      return r
    end, o('toggle_shop'))

    wrap(G.FUNCS, 'reroll_shop', function(orig, ...)
      local cost = G.GAME.current_round and G.GAME.current_round.reroll_cost or 0
      local r = orig(...)
      local stats = MP.state.stats
      stats.reroll_count = (stats.reroll_count or 0) + 1
      stats.reroll_cost_total = (stats.reroll_cost_total or 0) + math.max(0, cost)
      return r
    end, o('reroll'))
  end

  wrap(_G, 'ease_dollars', function(orig, mod, ...)
    if (mod or 0) < 0 then
      local sp = MP.state.spent
      sp.total = (sp.total or 0) - mod
    end
    return orig(mod, ...)
  end, o('ease_dollars'))

  if rawget(_G, 'Game') then
    wrap(Game, 'update_shop', function(orig, self, dt, ...)
      if not G.STATE_COMPLETE then
        MP.state.spent.before_shop = MP.state.spent.total or 0
        if MP.pvp then MP.pvp.set_location(E.shop_location()) end
      end
      return orig(self, dt, ...)
    end, o('update_shop'))
  end

  if rawget(_G, 'Card') then
    wrap(Card, 'sell_card', function(orig, self, ...)
      local r = orig(self, ...)
      if MP.is_match() and not (self.ability and self.ability.mp_phantom) then
        local st = MP.state
        local ante = G.GAME.round_resets.ante
        st.enemy_sells_self = (st.enemy_sells_self or 0) + 1
        st.sells_per_ante = st.sells_per_ante or {}
        st.sells_per_ante[ante] = (st.sells_per_ante[ante] or 0) + 1
        MP.peer.send('opp_ctx', { ctx = { opponent_selling_card = true } })
      end
      return r
    end, o('sell_card'))
  end
end

return E
