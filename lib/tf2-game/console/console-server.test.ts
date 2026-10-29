/**
 * The console's server half on a real match host (synthetic room): the
 * permission model (dedicated rooms lock sv_cheats and refuse host commands;
 * a listen server's host administers it and, with sv_cheats 1, everyone may
 * cheat), the effects in the simulation (noclip flies, god / buddha, setpos,
 * impulse 101, give, notarget, sv_gravity, tf_bot_add / kick, mp_*), the
 * replies through the real event codec, the rate limit — and a fuzz of every
 * server command and cvar with hostile arguments.
 */
import { describe, expect, it } from 'vitest';
import { CLASS_NAMES, FL_GODMODE, FL_NOTARGET, IN_FORWARD, MOVETYPE_NOCLIP, MOVETYPE_WALK, TF_CLASS_SOLDIER, TF_TEAM_BLUE } from '../core/constants';
import { STOCK_WEAPONS } from '../data/weapons';
import { UniformRandomStream } from '../core/random';
import { InputSender } from '../client/net/input';
import { SnapshotClient } from '../client/net/snapshot-client';
import { createDamageInfo } from '../sim/damage';
import type { SimEvent } from '../sim/events';
import { matchOptions, roomWorld } from '../server/match.test-support';
import { StandStillBrain, Tf2MatchHost } from '../server/tf2-match-host';
import type { MatchCommand } from '../server/match-host';
import { RATE_BURST } from './tf2-server';
import { argWords, parseBotAdd, SERVER_COMMANDS, SERVER_CVARS, validateServerArgs } from './server-commands';

type Policy = { kind: 'dedicated' | 'listen'; ownerId?: number };

const timescales: number[] = [];

function makeHost(policy?: Policy, over: Partial<ReturnType<typeof matchOptions>> = {}) {
  const host = new Tf2MatchHost(matchOptions({ maxPlayers: 12, ...over }), {
    world: roomWorld(),
    autoTeam: true,
    autoClass: true,
    botBrain: () => new StandStillBrain(),
    console: policy,
    // A listen server's runner paces its ticks (host_timescale); a dedicated room's has no such hook.
    setTimescale: policy?.kind === 'listen' ? (s) => timescales.push(s) : undefined,
  });
  return host;
}

/** Adds a human and runs the match until they are alive. */
function spawnHuman(host: Tf2MatchHost, id: number) {
  host.addPlayer(id, { name: `P${id}` });
  host.onCommand(id, { kind: 'class', cls: 'soldier' });
  for (let i = 0; i < 2000 && !host.playerOf(id)!.alive; i++) host.tick();
  host.drainOutgoing();
  host.world.drainEvents();
  const p = host.playerOf(id)!;
  expect(p.alive).toBe(true);
  return p;
}

function cmd(host: Tf2MatchHost, id: number, command: string, ...args: Array<string | number | boolean>): SimEvent[] {
  host.world.drainEvents();
  host.onCommand(id, { kind: 'extra', command, args } as MatchCommand);
  return host.world.drainEvents();
}

const replies = (evs: SimEvent[]) => evs.filter((e) => e.type === 'console').map((e) => (e as { text: string }).text);

describe('permissions', () => {
  it('a dedicated room locks sv_cheats, refuses cheats and host commands', () => {
    const host = makeHost(); // the default: dedicated, no admin
    const p = spawnHuman(host, 1);
    expect(replies(cmd(host, 1, 'sv_cheats', '1'))).toEqual(['sv_cheats is locked to 0 on dedicated servers.']);
    expect(host.serverConsole.cheats).toBe(false);
    expect(replies(cmd(host, 1, 'noclip'))[0]).toBe("Can't use cheat command noclip in multiplayer, unless the server has sv_cheats set to 1.");
    expect(p.move.moveType).not.toBe(MOVETYPE_NOCLIP);
    expect(replies(cmd(host, 1, 'tf_bot_add', '3'))[0]).toContain('dedicated servers have none');
    expect(replies(cmd(host, 1, 'mp_timelimit', '5'))[0]).toContain("Can't change");
    expect(host.world.rules.options.timeLimit).toBe(0);
    // Anyone may still use the player commands.
    expect(replies(cmd(host, 1, 'status')).some((t) => t.startsWith('hostname:'))).toBe(true);
    expect(replies(cmd(host, 1, 'getpos'))[0]).toMatch(/^setpos -?\d+\.\d{6} /);
  });

  it("a listen server's host administers it; with sv_cheats 1 every player may cheat", () => {
    const host = makeHost({ kind: 'listen', ownerId: 1 });
    spawnHuman(host, 1);
    const guest = spawnHuman(host, 2);
    expect(replies(cmd(host, 2, 'sv_cheats', '1'))[0]).toContain("only the listen server's host");
    const evs = cmd(host, 1, 'sv_cheats', '1');
    expect(host.serverConsole.cheats).toBe(true);
    expect(evs).toContainEqual({ type: 'cvar', name: 'sv_cheats', value: '1' });
    expect(replies(evs)).toContain("Server cvar 'sv_cheats' changed to 1");
    expect(replies(cmd(host, 2, 'noclip'))).toEqual(['noclip ON']);
    expect(guest.move.moveType).toBe(MOVETYPE_NOCLIP);
    // Host commands stay the host's.
    expect(replies(cmd(host, 2, 'tf_bot_add', '1'))[0]).toContain("only the listen server's host");
    // sv_cheats 0 ends everyone's cheats.
    cmd(host, 2, 'god');
    cmd(host, 1, 'sv_cheats', '0');
    expect(guest.move.moveType).toBe(MOVETYPE_WALK);
    expect(guest.flags & FL_GODMODE).toBe(0);
  });

  it('a late joiner learns the replicated cvars', () => {
    const host = makeHost({ kind: 'listen', ownerId: 1 });
    spawnHuman(host, 1);
    cmd(host, 1, 'sv_cheats', '1');
    cmd(host, 1, 'sv_gravity', '400');
    host.world.drainEvents();
    host.addPlayer(3, { name: 'late' });
    const evs = host.world.drainEvents().filter((e) => e.type === 'cvar');
    expect(evs).toEqual(
      expect.arrayContaining([
        { type: 'cvar', to: host.playerOf(3)!.id, name: 'sv_cheats', value: '1' },
        { type: 'cvar', to: host.playerOf(3)!.id, name: 'sv_gravity', value: '400' },
      ]),
    );
  });

  it('rate-limits a flood of commands', () => {
    const host = makeHost({ kind: 'listen', ownerId: 1 });
    spawnHuman(host, 1);
    host.world.drainEvents();
    for (let i = 0; i < 100; i++) host.onCommand(1, { kind: 'extra', command: 'getpos', args: [] });
    expect(host.world.drainEvents().filter((e) => e.type === 'console').length).toBe(RATE_BURST);
  });
});

describe('cheats in the simulation', () => {
  function cheatHost() {
    const host = makeHost({ kind: 'listen', ownerId: 1 });
    const p = spawnHuman(host, 1);
    // Past the preround freeze.
    for (let i = 0; i < 400; i++) host.tick();
    host.drainOutgoing();
    cmd(host, 1, 'sv_cheats', '1');
    return { host, p };
  }

  it('noclip flies where you look, through gravity, and the reply comes through the event codec', () => {
    const { host, p } = cheatHost();
    host.world.drainEvents();
    host.onCommand(1, { kind: 'extra', command: 'noclip', args: [] });
    // The reply reaches the client's snapshot stream as a reliable event.
    const client = new SnapshotClient();
    const events: unknown[] = [];
    host.tick();
    for (const pk of host.drainOutgoing()) if (pk.reliable) events.push(...(client.onReliable(pk.data)?.events ?? []).map((e) => e.event));
    expect(events).toContainEqual(expect.objectContaining({ type: 'console', text: 'noclip ON' }));

    const z0 = p.origin.z;
    const sender = new InputSender();
    for (let i = 0; i < 66; i++) {
      sender.createCommand(host.world.tickCount + 1, (c) => {
        c.viewAngles = { x: -89, y: 0, z: 0 };
        c.forwardMove = 450;
        c.buttons = IN_FORWARD;
      });
      host.onInput(1, sender.packet(0, 0)!);
      host.tick();
    }
    host.drainOutgoing();
    expect(p.move.moveType).toBe(MOVETYPE_NOCLIP);
    // Straight up a second at noclip speed: well above the room's 512-unit ceiling.
    expect(p.origin.z - z0).toBeGreaterThan(600);
  });

  it('god takes no damage, buddha never dies, impulse 101 refills', () => {
    const { host, p } = cheatHost();
    const hit = (n: number) => {
      const info = createDamageInfo();
      info.attacker = p.id;
      info.inflictor = p.id;
      info.damage = n;
      host.world.applyDamage(p, info);
    };
    // TF2 is deathmatch outside Mann vs. Machine: CC_God_f returns there (SDK client.cpp). No godmode.
    expect(replies(cmd(host, 1, 'god'))[0]).toContain('no effect in TF2 multiplayer');
    expect(p.flags & FL_GODMODE).toBe(0);
    hit(50);
    expect(p.health).toBe(p.maxHealth - 50);
    cmd(host, 1, 'impulse', 101);
    expect(replies(cmd(host, 1, 'buddha'))).toEqual(['Buddha Mode on...']);
    hit(5000);
    expect(p.alive).toBe(true);
    expect(p.health).toBe(1);
    cmd(host, 1, 'impulse', 101);
    expect(p.health).toBe(p.maxHealth);
  });

  it('host_timescale: the listen host only, with sv_cheats, clamped, replicated, reset by sv_cheats 0', () => {
    timescales.length = 0;
    const host = makeHost({ kind: 'listen', ownerId: 1 });
    spawnHuman(host, 1);
    spawnHuman(host, 2);
    expect(replies(cmd(host, 1, 'host_timescale', '2'))[0]).toContain("Can't use cheat cvar host_timescale");
    cmd(host, 1, 'sv_cheats', '1');
    expect(replies(cmd(host, 2, 'host_timescale', '3'))[0]).toContain("only the listen server's host");
    const evs = cmd(host, 1, 'host_timescale', '25');
    expect(timescales).toEqual([10]);
    expect(evs).toContainEqual({ type: 'cvar', name: 'host_timescale', value: '10' });
    cmd(host, 1, 'host_timescale', '0.5');
    cmd(host, 1, 'sv_cheats', '0');
    expect(timescales).toEqual([10, 0.5, 1]);
    expect(host.serverConsole.value('host_timescale')).toBe('1');
    // A dedicated room: sv_cheats stays 0, so never.
    const ded = makeHost();
    spawnHuman(ded, 1);
    expect(replies(cmd(ded, 1, 'host_timescale', '2'))[0]).toMatch(/Can't/);
  });

  it('sv_gravity reaches what falls: a dropped ammo pack falls by it (its own gravity scale × sv_gravity)', () => {
    const fall = (g: number | null) => {
      const host = makeHost({ kind: 'listen', ownerId: 1 });
      spawnHuman(host, 1);
      if (g !== null) cmd(host, 1, 'sv_gravity', String(g));
      host.tick();
      const pack = host.world.spawnEntity('tf_ammo_pack', (e) => {
        e.origin.x = 0;
        e.origin.y = 0;
        e.origin.z = 400;
      });
      for (let i = 0; i < 40; i++) host.tick();
      return 400 - pack.origin.z;
    };
    // The pack is tossed up at 100 u/s; after 40 ticks (0.6 s) the difference between two gravities is
    // ½·Δg·t² — what a projectile under sv_gravity falls by, as PhysicsAddGravityMove integrates it.
    const normal = fall(null);
    const low = fall(200);
    const t = 40 * 0.015;
    expect(normal - low).toBeGreaterThan(0.5 * 600 * t * t * 0.9);
    expect(normal - low).toBeLessThan(0.5 * 600 * t * t * 1.1);
  });

  it('setpos moves the player, setang tells the client, notarget hides from bots', () => {
    const { host, p } = cheatHost();
    cmd(host, 1, 'setpos', 100, -50, 64);
    expect(p.origin).toEqual({ x: 100, y: -50, z: 64 });
    const evs = cmd(host, 1, 'setang', 10, 90);
    expect(evs).toContainEqual(expect.objectContaining({ type: 'console', setang: { x: 10, y: 90, z: 0 } }));
    cmd(host, 1, 'notarget');
    expect(p.flags & FL_NOTARGET).not.toBe(0);
    expect(replies(cmd(host, 1, 'setpos', 'abc', 1))[0]).toContain('must be a number');
    expect(replies(cmd(host, 1, 'setpos', 99999, 1))[0]).toContain('between');
  });

  it('give spawns pickups and weapons of your class, refuses others', () => {
    const { host, p } = cheatHost();
    const before = host.world.findAllByClassname('item_healthkit_full').length;
    cmd(host, 1, 'give', 'item_healthkit_full');
    expect(host.world.findAllByClassname('item_healthkit_full').length).toBe(before + 1);
    // A stock weapon of the player's class (autoClass picked one), and one of another class.
    const mine = CLASS_NAMES[p.playerClass];
    const own = Object.values(STOCK_WEAPONS).flatMap((w) => Object.entries(w.perClass)).find(([c, e]) => c === mine && e?.slot === 'secondary')![1]!.scriptName;
    const other = Object.values(STOCK_WEAPONS).flatMap((w) => Object.entries(w.perClass)).find(([c, e]) => c !== mine && e?.slot === 'primary' && !Object.values(STOCK_WEAPONS).some((w2) => w2.perClass[mine as keyof typeof w2.perClass]?.scriptName === e?.scriptName))![1]!.scriptName;
    expect(replies(cmd(host, 1, 'give', own))).toEqual([`give: ${own}`]);
    expect(p.activeWeapon()?.classname).toBe(own);
    expect(replies(cmd(host, 1, 'give', other))[0]).toContain('not a pickup or a weapon your class');
    expect(replies(cmd(host, 1, 'give', 'point_servercommand'))[0]).toContain('not a pickup');
  });

  it('sv_gravity reaches every player, mp_* reach the rules', () => {
    const { host, p } = cheatHost();
    cmd(host, 1, 'sv_gravity', 200);
    host.tick();
    expect(p.moveCtx.params?.gravity).toBe(200);
    cmd(host, 1, 'sv_gravity', 800);
    host.tick();
    expect(p.moveCtx.params).toBeUndefined();
    cmd(host, 1, 'mp_timelimit', 15);
    cmd(host, 1, 'mp_winlimit', 3);
    cmd(host, 1, 'mp_friendlyfire', 1);
    expect(host.world.rules.options.timeLimit).toBe(15);
    expect(host.world.rules.options.winLimit).toBe(3);
    expect(host.world.options.friendlyFire).toBe(true);
  });
});

describe('bots from the console', () => {
  it('tf_bot_add adds bots (class, team, any order), tf_bot_kick removes them', () => {
    const host = makeHost({ kind: 'listen', ownerId: 1 });
    spawnHuman(host, 1);
    expect(replies(cmd(host, 1, 'tf_bot_add', 3))).toEqual(['Added 3 bots']);
    expect(host.summary().players.filter((x) => x.bot).length).toBe(3);
    cmd(host, 1, 'tf_bot_add', 'soldier', 2, 'blue', 'hard');
    const bots = host.summary().players.filter((x) => x.bot);
    expect(bots.length).toBe(5);
    for (let i = 0; i < 400; i++) host.tick();
    host.drainOutgoing();
    const blueSoldiers = host.world.players().filter((pl) => pl.isBot && pl.team === TF_TEAM_BLUE && pl.playerClass === TF_CLASS_SOLDIER);
    expect(blueSoldiers.length).toBeGreaterThanOrEqual(2);
    expect(host.serverConsole.value('tf_bot_quota')).toBe('5');
    // The quota holds them when the match rebalances.
    host.addPlayer(2, { name: 'P2' });
    expect(host.summary().players.filter((x) => x.bot).length).toBe(5);
    expect(replies(cmd(host, 1, 'tf_bot_kick', 'all'))).toEqual(['Kicked 5 bots']);
    expect(host.summary().players.filter((x) => x.bot).length).toBe(0);
    expect(replies(cmd(host, 1, 'tf_bot_kick', 'nobody'))[0]).toContain('no bot matches');
  });

  it('caps tf_bot_add at the server size', () => {
    const host = makeHost({ kind: 'listen', ownerId: 1 }, { maxPlayers: 4 });
    spawnHuman(host, 1);
    cmd(host, 1, 'tf_bot_add', 10);
    expect(host.summary().players.length).toBe(4);
    expect(replies(cmd(host, 1, 'tf_bot_add', 1))[0]).toContain('the server is full');
  });

  it('parses tf_bot_add like CTFBot (count, class, team, difficulty, name, noquota)', () => {
    expect(parseBotAdd(['3', 'heavyweapons', 'red', 'expert'])).toEqual({ count: 3, cls: 'heavy', team: 'red', difficulty: 'expert', name: null, quota: true });
    expect(parseBotAdd(['Gentlemanne', 'noquota'])).toMatchObject({ count: 1, name: 'Gentlemanne', quota: false });
    expect(parseBotAdd(['2', 'Named'])).toEqual({ error: "tf_bot_add: invalid argument 'Named'" });
  });
});

describe('server-side validation (fuzz)', () => {
  const rng = new UniformRandomStream(1234);
  const pick = <T>(a: readonly T[]): T => a[rng.randomInt(0, a.length - 1)];
  const nasty: Array<string | number | boolean> = [
    '',
    ' ',
    '1',
    '-1',
    '1e309',
    'NaN',
    'Infinity',
    '\u0000',
    '\u001b[2J',
    'a'.repeat(65),
    'a'.repeat(64),
    '"; quit',
    '../../etc/passwd',
    '__proto__',
    'constructor',
    '!picker',
    '*',
    'red',
    'soldier',
    'all',
    'ctf_2fort',
    'item_healthkit_full',
    'tf_weapon_rocketlauncher',
    0,
    1,
    -0,
    1e9,
    -1e9,
    3.5,
    true,
    false,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ];

  it('argWords refuses unusable raw arguments', () => {
    expect(argWords([1, 'a', true])).toEqual(['1', 'a', '1']);
    expect(argWords(['x'.repeat(65)])).toBeNull();
    expect(argWords([Number.NaN])).toBeNull();
    expect(argWords(['\u0007'])).toBeNull();
    expect(argWords(new Array(9).fill('a'))).toBeNull();
    expect(argWords([{}])).toBeNull();
    expect(argWords('nope')).toBeNull();
  });

  it('validateServerArgs never throws and only passes in-range values', () => {
    for (const spec of SERVER_COMMANDS) {
      for (let n = 0; n < 200; n++) {
        const words = Array.from({ length: rng.randomInt(0, 8) }, () => String(pick(nasty)));
        const r = validateServerArgs(spec, words);
        if (!r.ok) continue;
        r.args.forEach((v, i) => {
          const a = spec.args[i];
          if (a.kind === 'float' || a.kind === 'int') {
            expect(typeof v).toBe('number');
            expect(Number.isFinite(v as number)).toBe(true);
            if (a.min !== undefined) expect(v as number).toBeGreaterThanOrEqual(a.min);
            if (a.max !== undefined) expect(v as number).toBeLessThanOrEqual(a.max);
          } else expect((v as string).length).toBeLessThanOrEqual(64);
        });
      }
    }
  });

  it('every server command and cvar survives hostile arguments on both kinds of server', () => {
    for (const policy of [undefined, { kind: 'listen' as const, ownerId: 1 }]) {
      const host = makeHost(policy, { maxPlayers: 8 });
      spawnHuman(host, 1);
      spawnHuman(host, 2);
      if (policy) cmd(host, 1, 'sv_cheats', '1');
      const names = [...SERVER_COMMANDS.filter((c) => c.games.includes('tf2')).map((c) => c.name), ...SERVER_CVARS.filter((c) => c.games.includes('tf2')).map((c) => c.name)];
      for (let n = 0; n < 1500; n++) {
        const who = rng.randomInt(1, 2);
        const args = Array.from({ length: rng.randomInt(0, 9) }, () => pick(nasty));
        expect(() => host.onCommand(who, { kind: 'extra', command: pick(names), args } as MatchCommand)).not.toThrow();
        if (n % 25 === 0) {
          host.tick();
          host.drainOutgoing();
        }
        // Replies stay bounded text.
        for (const e of host.world.events) if (e.type === 'console') expect(e.text.length).toBeLessThanOrEqual(500);
      }
      expect(() => {
        for (let i = 0; i < 66; i++) host.tick();
      }).not.toThrow();
      // The match is still a match: ≤ maxPlayers, finite positions.
      expect(host.summary().players.length).toBeLessThanOrEqual(8);
      for (const pl of host.world.players()) {
        expect(Number.isFinite(pl.origin.x) && Number.isFinite(pl.origin.y) && Number.isFinite(pl.origin.z)).toBe(true);
      }
      if (!policy) expect(host.serverConsole.cheats).toBe(false);
    }
  });
});
