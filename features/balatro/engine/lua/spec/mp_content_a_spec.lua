-- WS7 content A (L1): boot with every WS7 module, isolation, then one block per object.
local H = require 'spec.mp_helper'

describe('content A boot', function()
  after_each(H.teardown)
  it('loads every WS7 module without errors', function()
    local MP = H.boot()
    local errs = {}
    for _, l in ipairs(MP.log_ring) do if l.level == 'error' then errs[#errs + 1] = l.msg end end
    expect(errs).eq({})
    local loaded = MP.set_of(MP.content_loaded)
    for _, m in ipairs({ 'rmh_mp.content.jokers.core', 'rmh_mp.content.jokers.standard',
      'rmh_mp.content.jokers.experimental', 'rmh_mp.content.jokers.takeovers', 'rmh_mp.content.consumables',
      'rmh_mp.content.enhancements', 'rmh_mp.content.stickers', 'rmh_mp.content.blinds',
      'rmh_mp.content.vouchers', 'rmh_mp.content.stakes' }) do
      expect(loaded[m] or m).eq(true)
    end
  end)
end)
