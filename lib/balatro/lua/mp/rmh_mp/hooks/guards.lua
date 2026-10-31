-- rmh_mp/hooks/guards.lua — stability and anti-desync guards (FL-12, C §1.2/§1.6/§1.7, A1 §8.1).
--
--   Game.update_round_eval   evaluate a round once (a second ROUND_EVAL entry only clears buttons)
--   CardArea.emplace         a card already in the area is not added twice
--   draw_card                a card already in the target area (and not in the source) is skipped
--   Controller.key_hold_update  holding R does not restart a session run
--   create_UIBox_options     no Restart button in a match/practice run
--   localize                 nil args return 'ERROR' instead of crashing
--   Moveable.align_to_major  missing major/T no longer crashes

local MP = require 'rmh_mp.state'
local tree = require 'rmh_mp.util.tree'

local GD = {}
MP.guards = GD

local function in_area(area, card)
  if not (area and area.cards) then return false end
  for _, c in ipairs(area.cards) do if c == card then return true end end
  return false
end
GD.in_area = in_area

function GD.install()
  local wrap = MP.hooks.wrap
  local function o(id) return { group = 'session', optional = true, id = 'guards.' .. id } end

  if rawget(_G, 'Game') then
    wrap(Game, 'update_round_eval', function(orig, self, dt, ...)
      local round = MP.state.round
      if not G.STATE_COMPLETE and round.eval_done and round.eval_token == round.token then
        if self.buttons then self.buttons:remove(); self.buttons = nil end
        if self.shop then self.shop:remove(); self.shop = nil end
        G.STATE_COMPLETE = true
        MP.log('warn', 'guards: duplicate round evaluation prevented')
        return
      end
      if not G.STATE_COMPLETE then
        round.eval_done = true
        round.eval_token = round.token
      end
      return orig(self, dt, ...)
    end, o('round_eval'))
  end

  if rawget(_G, 'CardArea') then
    wrap(CardArea, 'emplace', function(orig, self, card, ...)
      if card and in_area(self, card) then
        MP.log('debug', 'guards: double emplace ignored')
        return
      end
      return orig(self, card, ...)
    end, o('emplace'))
  end

  wrap(_G, 'draw_card', function(orig, from, to, percent, dir, sort, card, ...)
    if card and to and from ~= to and in_area(to, card) and not in_area(from, card) then
      MP.log('debug', 'guards: duplicate draw_card ignored')
      return
    end
    return orig(from, to, percent, dir, sort, card, ...)
  end, o('draw_card'))

  if rawget(_G, 'Controller') then
    wrap(Controller, 'key_hold_update', function(orig, self, key, dt, ...)
      if key == 'r' and (MP.is_match() or MP.is_practice()) and G.STAGE == G.STAGES.RUN then return end
      return orig(self, key, dt, ...)
    end, o('restart_key'))
  end

  wrap(_G, 'create_UIBox_options', function(orig, ...)
    local t = orig(...)
    if MP.is_match() and type(t) == 'table' then
      tree.remove(t, function(n) return n.config and (n.config.id == 'restart_button' or n.config.button == 'setup_run') end)
    end
    return t
  end, o('options'))

  wrap(_G, 'localize', function(orig, args, ...)
    if args == nil then return 'ERROR' end
    return orig(args, ...)
  end, o('localize'))

  if rawget(_G, 'Moveable') then
    wrap(Moveable, 'align_to_major', function(orig, self, ...)
      if not (self.role and self.role.major and self.role.major.T and self.T) then return end
      return orig(self, ...)
    end, o('align'))
  end
end

return GD
