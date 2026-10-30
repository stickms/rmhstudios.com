/**
 * CS:GO's console through the shared server console: the mp_* cvars reach the rules, the host adds and
 * kicks bots per team, `buy` and `drop` work for players, the cheats (give, impulse 101, god, noclip)
 * need sv_cheats, and a dedicated-style policy refuses the host commands.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { MOVETYPE_NOCLIP, FL_GODMODE } from '../../tf2-game/core/constants';
import { matchOptions } from '../../tf2-game/server/match.test-support';
import { csTestWorld, setupCs } from '../__fixtures__/cs-world';
import { CS_TEAM_CT, CS_TEAM_T } from '../constants';
import { CsMatchHost } from './cs-match-host';

beforeAll(setupCs);

function host(policy: 'listen' | 'dedicated' = 'listen') {
  const h = new CsMatchHost(
    matchOptions({ game: 'csgo', variant: 'de', map: 'de_dust2', maxPlayers: 8 }),
    {
      world: csTestWorld({ settings: { freezeTime: 5 } }),
      console: policy === 'listen' ? { kind: 'listen', ownerId: 1 } : { kind: 'dedicated' },
    },
  );
  h.addPlayer(1, { name: 'Host', userId: 'u1' });
  h.onCommand(1, { kind: 'team', team: 'red' });
  for (let i = 0; i < 5; i++) h.tick();
  return h;
}

const run = (h: CsMatchHost, command: string, ...args: Array<string | number>) =>
  h.onCommand(1, { kind: 'extra', command, args });

describe('the CS:GO console', () => {
  it('sets the match cvars', () => {
    const h = host();
    run(h, 'mp_roundtime', '3');
    run(h, 'mp_freezetime', '7');
    run(h, 'mp_buytime', '30');
    run(h, 'mp_maxrounds', '24');
    run(h, 'mp_startmoney', '4000');
    run(h, 'mp_c4timer', '35');
    run(h, 'mp_friendlyfire', '1');
    const s = h.csWorld.csRules.settings;
    expect(s).toMatchObject({
      roundTime: 3,
      freezeTime: 7,
      buyTime: 30,
      maxRounds: 24,
      startMoney: 4000,
      c4Timer: 35,
    });
    expect(h.world.rules.options.preroundTime).toBe(7);
    expect(h.world.rules.options.winLimit).toBe(13);
    expect(h.world.options.friendlyFire).toBe(true);
    expect(h.serverConsole.value('mp_c4timer')).toBe('35');
  });

  it('adds bots to a team and kicks them', () => {
    const h = host();
    run(h, 'bot_add_ct');
    run(h, 'bot_add_ct');
    run(h, 'bot_add_t', 'hard');
    const bots = h.world.players().filter((p) => p.isBot);
    expect(bots.filter((b) => b.team === CS_TEAM_CT)).toHaveLength(2);
    expect(bots.filter((b) => b.team === CS_TEAM_T)).toHaveLength(1);
    run(h, 'bot_kick', 'ct');
    expect(h.world.players().filter((p) => p.isBot)).toHaveLength(1);
    run(h, 'bot_kick');
    expect(h.world.players().filter((p) => p.isBot)).toHaveLength(0);
  });

  it('buys and drops for players', () => {
    const h = host();
    const p = h.csPlayerOf(1)!;
    run(h, 'buy', 'vest');
    expect(p.armor).toBe(100);
    expect(p.money).toBe(150);
    p.money = 3000;
    run(h, 'buy', 'ak47');
    expect(p.weapons[0]?.classname).toBe('weapon_ak47');
    run(h, 'drop');
    expect(p.weapons[0]).toBeNull();
    expect(h.world.findAllByClassname('cs_dropped_weapon')).toHaveLength(1);
  });

  it('cheats need sv_cheats: give, impulse 101, god, noclip', () => {
    const h = host();
    const p = h.csPlayerOf(1)!;
    run(h, 'give', 'weapon_awp');
    expect(p.weapons[0]).toBeNull();
    run(h, 'sv_cheats', '1');
    run(h, 'give', 'weapon_awp');
    expect(p.weapons[0]?.classname).toBe('weapon_awp');
    run(h, 'impulse', 101);
    expect(p.money).toBe(16000);
    expect(p.armor).toBe(100);
    expect(p.helmet).toBe(true);
    run(h, 'god');
    expect(p.flags & FL_GODMODE).toBeTruthy();
    run(h, 'noclip');
    expect(p.move.moveType).toBe(MOVETYPE_NOCLIP);
  });

  it('a room with no admin refuses the host commands and keeps sv_cheats 0', () => {
    const h = host('dedicated');
    run(h, 'bot_add_t');
    expect(h.world.players().filter((p) => p.isBot)).toHaveLength(0);
    run(h, 'sv_cheats', '1');
    expect(h.serverConsole.value('sv_cheats')).toBe('0');
  });
});
