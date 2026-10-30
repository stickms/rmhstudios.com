/**
 * GameConsole: the settings ↔ cvar sync (both ways, no echo), binds into the
 * settings' key bindings vs the console's own table, `+`/`-` commands on the
 * input state, the routing of server commands to the authority (and of the
 * TF2 player commands to the HUD's own), the replicated sv_cheats gating the
 * client-side cheats, changelevel by authority, the net_graph meter, and the
 * single-player server half on a stand-in world.
 */
import { describe, expect, it } from 'vitest';
import { FL_NOTARGET, MOVETYPE_NOCLIP, MOVETYPE_WALK } from '../core/constants';
import { createHudStore, type HudCommand } from '../client/hud-store';
import { createInputState } from '../client/input/input-state';
import { defaultSettings, devConsoleEnabled, mouseToDegrees, sanitizeSettings, type GameSettings } from '../client/settings';
import { DAMAGE_NO, DAMAGE_YES } from '../sim/entity';
import { GameConsole, type ConsoleHost } from './game-console';
import type { ConsoleStorage } from './files';
import { NetGraphMeter } from './net-graph';
import { attachConsoleHost, gameConsoleFor, peekGameConsole } from './runtime';
import { settingsCvarNames } from './settings-cvars';
import { SpServerConsole } from './sp-server';

class MemoryStorage implements ConsoleStorage {
  readonly map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

function setup(game: 'tf2' | 'hl2' | 'portal' = 'tf2', host: Partial<ConsoleHost> = {}) {
  const store = createHudStore({ game });
  const input = createInputState();
  const sent: HudCommand[] = [];
  store.onCommand((c) => sent.push(c));
  let settings: GameSettings = defaultSettings(game);
  const saves: GameSettings[] = [];
  const con = new GameConsole(store, game, { storage: new MemoryStorage() });
  con.setHost({ authority: () => (game === 'tf2' ? 'listen' : 'sp'), ...host });
  con.attachUi({
    input,
    getSettings: () => settings,
    setSettings: (s) => {
      settings = s;
      saves.push(s);
      con.syncSettings(s);
    },
    editFile: () => {},
  });
  const out = () => con.core.lines.map((l) => l.text);
  return { store, input, sent, con, saves, out, settings: () => settings, setPanel: (s: GameSettings) => ((settings = s), con.syncSettings(s)) };
}

describe('settings ↔ cvars', () => {
  it('a cvar writes the settings record; the panel writes the cvars without an echo', () => {
    const t = setup();
    t.con.submit('sensitivity 2.5; fov_desired 80; volume 0.3; tf_dingalingaling 0; cl_showfps 1; viewmodel_fov 999');
    const s = t.settings();
    expect(s.sensitivity).toBe(2.5);
    expect(s.fov).toBe(80);
    expect(s.volume.master).toBe(0.3);
    expect(s.hitSound).toBe(false);
    expect(s.showFps).toBe(true);
    expect(s.viewmodelFov).toBe(70);
    const before = t.saves.length;
    t.setPanel({ ...s, sensitivity: 4, crosshair: { ...s.crosshair, color: 'rgb(10 20 30)', scale: 2 } });
    expect(t.saves.length).toBe(before);
    expect(t.con.core.cvar('sensitivity')!.float).toBe(4);
    expect(t.con.core.cvar('cl_crosshair_green')!.int).toBe(20);
    expect(t.con.core.cvar('cl_crosshair_scale')!.int).toBe(64);
  });

  it('m_pitch carries the invert, m_yaw the turn rate, and both reach the mouse maths', () => {
    const t = setup();
    t.con.submit('m_pitch -0.022; m_yaw 0.044');
    const s = t.settings();
    expect(s.invertY).toBe(true);
    expect(s.mPitch).toBeCloseTo(0.022);
    expect(mouseToDegrees(10, 0, s).yaw).toBeCloseTo(-10 * s.sensitivity * 0.044);
    expect(sanitizeSettings({ ...s, mYaw: 99 }, 'tf2').mYaw).toBe(0.2);
  });

  it('crosshair 0 / 1 keeps the style; con_enable drives the developer console setting', () => {
    const t = setup();
    t.con.submit('cl_crosshair_style dot; crosshair 0');
    expect(t.settings().crosshair.style).toBe('none');
    t.con.submit('crosshair 1');
    expect(t.settings().crosshair.style).toBe('dot');
    t.con.submit('con_enable off');
    expect(t.settings().devConsole).toBe('off');
    expect(devConsoleEnabled(t.settings(), false)).toBe(false);
    expect(devConsoleEnabled({ devConsole: 'auto' }, true)).toBe(false);
    expect(devConsoleEnabled({ devConsole: 'auto' }, false)).toBe(true);
    expect(t.con.enabled).toBe(false);
    t.con.forceOpen();
    expect(t.con.isOpen).toBe(true);
  });

  it('every game has its settings cvars (tf2 has the hit sound, HL2 does not)', () => {
    expect(settingsCvarNames('tf2')).toContain('tf_dingalingaling');
    expect(settingsCvarNames('hl2')).not.toContain('tf_dingalingaling');
    expect(settingsCvarNames('portal')).toContain('fov_desired');
  });
});

describe('binds', () => {
  it('an action bind sets the key in the settings; anything else goes to the console table', () => {
    const t = setup();
    t.con.submit('bind f +jump');
    expect(t.settings().keybinds.jump).toEqual(['KeyF', 'Space']);
    expect(t.settings().keybinds.inspect ?? []).not.toContain('KeyF');
    t.con.submit('bind q "say gg"');
    expect(t.settings().keybinds.lastinv ?? []).not.toContain('KeyQ');
    expect(t.con.binds.get('KeyQ')).toBe('say gg');
    expect(t.con.keyEvent('KeyQ', true)).toBe(true);
    expect(t.sent).toContainEqual({ kind: 'chat', text: 'gg', teamOnly: false });
    t.con.submit('bind q');
    expect(t.out().at(-1)).toBe('"q" = "say gg"');
    t.con.submit('bind mouse4 +attack2; bind kp_end slot1');
    expect(t.settings().keybinds.attack2).toContain('Mouse4');
    expect(t.settings().keybinds.slot1).toContain('Numpad1');
    t.con.submit('bind ` echo; bind nokey x');
    expect(t.out().some((l) => l.includes('is reserved'))).toBe(true);
    expect(t.out().at(-1)).toBe('"nokey" isn\'t a valid key');
    t.con.submit('unbindall');
    expect(Object.keys(t.settings().keybinds)).toEqual(['menu']);
    expect(t.con.binds.size).toBe(0);
  });

  it('a + bind runs its - form on release; key repeat and an open console are ignored', () => {
    const t = setup();
    t.con.submit('alias +spin "echo down"; alias -spin "echo up"; bind g +spin');
    t.con.keyEvent('KeyG', true);
    t.con.keyEvent('KeyG', true, true);
    t.con.keyEvent('KeyG', false);
    expect(t.out().filter((l) => l === 'down' || l === 'up')).toEqual(['down', 'up']);
    t.con.setOpen(true);
    expect(t.con.keyEvent('KeyG', true)).toBe(false);
  });

  it('binds survive in config.cfg and come back in a new console', () => {
    const storage = new MemoryStorage();
    const store = createHudStore({ game: 'tf2' });
    const con = new GameConsole(store, 'tf2', { storage });
    let settings = defaultSettings('tf2');
    con.attachUi({ input: null, getSettings: () => settings, setSettings: (s) => (settings = s), editFile: () => {} });
    con.submit('bind h "say hello"; net_graph 3; host_writeconfig');
    const con2 = new GameConsole(createHudStore({ game: 'tf2' }), 'tf2', { storage });
    con2.attachUi({ input: null, getSettings: () => settings, setSettings: (s) => (settings = s), editFile: () => {} });
    expect(con2.binds.get('KeyH')).toBe('say hello');
    expect(con2.netGraph.int).toBe(3);
  });
});

describe('commands and routing', () => {
  it('+/- commands hold actions on the input state; wait spans frames', () => {
    const t = setup();
    t.con.submit('+forward');
    expect(t.input.held.key.has('forward')).toBe(true);
    t.con.submit('-forward; +jump; wait; -jump');
    expect(t.input.held.key.has('forward')).toBe(false);
    expect(t.input.held.key.has('jump')).toBe(true);
    t.con.frame();
    expect(t.input.held.key.has('jump')).toBe(false);
    t.con.submit('slot2; invnext');
    expect(t.input.impulses).toEqual(['slot2', 'invnext']);
  });

  it('server commands go to the authority as extra commands, in order, unchecked locally', () => {
    const t = setup();
    t.con.submit('sv_cheats 1; noclip; impulse 101; tf_bot_add 3');
    expect(t.sent).toEqual([
      { kind: 'extra', command: 'sv_cheats', args: ['1'] },
      { kind: 'extra', command: 'noclip', args: [] },
      { kind: 'extra', command: 'impulse', args: ['101'] },
      { kind: 'extra', command: 'tf_bot_add', args: ['3'] },
    ]);
    t.sent.length = 0;
    t.con.submit('setpos 1 2 3; setpos one two');
    expect(t.sent).toEqual([{ kind: 'extra', command: 'setpos', args: ['1', '2', '3'] }]);
    expect(t.out().at(-1)).toContain('must be a number');
  });

  it("TF2's player commands become the HUD's own commands", () => {
    const t = setup();
    t.con.submit('jointeam blue; joinclass heavyweapons; voicemenu 0 0; build 2 0; say_team "push now"; disguise 9 -1');
    expect(t.sent).toEqual([
      { kind: 'team', team: 'blue' },
      { kind: 'class', cls: 'heavy' },
      { kind: 'voice', menu: 0, item: 0 },
      { kind: 'build', action: 'build', objectType: 2, objectMode: 0 },
      { kind: 'chat', text: 'push now', teamOnly: true },
      { kind: 'disguise', cls: 9, team: 3 },
    ]);
  });

  it('replies print, replicated sv_cheats gates the client cheats, setang turns the view', () => {
    const turned: unknown[] = [];
    let third = false;
    const t = setup('tf2', { setThirdPerson: (on) => (third = on), setViewAngles: (a) => turned.push(a) });
    t.con.submit('thirdperson');
    expect(third).toBe(false);
    expect(t.out().at(-1)).toContain("Can't use cheat command thirdperson");
    expect(t.con.serverEvent({ type: 'cvar', name: 'sv_cheats', value: '1' })).toBe(true);
    t.con.submit('thirdperson; sv_cheats');
    expect(third).toBe(true);
    expect(t.con.serverEvent({ type: 'console', text: 'setang 1 2 0', level: 0, setang: { x: 1, y: 2, z: 0 } })).toBe(true);
    expect(turned).toEqual([{ x: 1, y: 2, z: 0 }]);
    expect(t.out().at(-1)).toBe('setang 1 2 0');
    t.con.serverEvent({ type: 'cvar', name: 'sv_cheats', value: '0' });
    expect(third).toBe(false);
    expect(t.con.serverEvent({ type: 'death' })).toBe(false);
  });

  it("changelevel moves a listen server's match; a peer-to-peer member's console cannot", () => {
    const maps: string[] = [];
    const listen = setup('tf2', { changeLevel: (m) => (maps.push(m), true) });
    listen.con.submit('changelevel cp_dustbowl; changelevel de_dust2');
    expect(maps).toEqual(['cp_dustbowl']);
    expect(listen.out().at(-1)).toContain('not a published map');
    listen.con.submit('map koth_viaduct');
    expect(maps).toEqual(['cp_dustbowl', 'koth_viaduct']);
    // A peer-to-peer member is not the host.
    const member = setup('tf2', { authority: () => 'remote', changeLevel: () => true });
    member.con.submit('changelevel cp_dustbowl');
    expect(member.out().at(-1)).toContain('only the host');
  });

  it('room administration: kick by name or #id, sv_password, sv_lock, rcon say — through the host', async () => {
    const actions: unknown[] = [];
    const t = setup('tf2', {
      isAdmin: () => true,
      admin: (a) => (actions.push(a), true),
      players: () => [
        { id: 4, name: 'Pyro' },
        { id: 7, name: 'Pyromancer' },
        { id: 9, name: 'Medic' },
      ],
    });
    t.con.submit('kick medic; kick pyro; kickid 7; kick pyr; sv_password "hunter2"; sv_lock 1; rcon say gg all; rcon sv_lock 0');
    expect(actions).toEqual([
      { action: 'kick', playerId: 9 },
      { action: 'kick', playerId: 4 },
      { action: 'kick', playerId: 7 },
      { action: 'password', password: 'hunter2' },
      { action: 'lock', locked: true },
      { action: 'say', text: 'gg all' },
      { action: 'lock', locked: false },
    ]);
    // An ambiguous prefix is refused, with the names.
    expect(t.out().some((l) => l.includes('no player "pyr"'))).toBe(true);
    const notOwner = setup('tf2', { authority: () => 'remote', isAdmin: () => false, admin: (a) => (actions.push(a), true) });
    notOwner.con.submit('rcon say hi');
    expect(notOwner.out().at(-1)).toContain('only the host');
  });

  it("ent_fire completes the map's names, classnames and each target's inputs", async () => {
    const { indexFromLump } = await import('./entity-complete');
    const { BspEntity } = await import('../formats/keyvalues');
    const { registerAllSimModules } = await import('../sim/register-all');
    registerAllSimModules();
    const lump = [
      new BspEntity([['classname', 'func_door'], ['targetname', 'gate_door']]),
      new BspEntity([['classname', 'logic_relay'], ['targetname', 'open_relay'], ['OnTrigger', 'gate_door,Open,,0,-1']]),
      new BspEntity([['classname', 'logic_timer'], ['targetname', 'round_timer_logic']]),
    ];
    const index = indexFromLump(lump);
    const t = setup('tf2', { entityIndex: () => index });
    expect(t.con.core.complete('ent_fire gate').items).toEqual(['ent_fire gate_door']);
    expect(t.con.core.complete('ent_fire !pi').items).toEqual(['ent_fire !picker']);
    // The map's own spelling first, then what the class handles (lower-case, as Source matches inputs).
    const inputs = t.con.core.complete('ent_fire gate_door ').items;
    expect(inputs[0]).toBe('ent_fire gate_door Open');
    expect(inputs).toEqual(expect.arrayContaining(['ent_fire gate_door close', 'ent_fire gate_door kill']));
    expect(t.con.core.complete('ent_fire round_timer_logic ').items).toEqual(expect.arrayContaining(['ent_fire round_timer_logic enable']));
    // Classnames too (the map's and every class the simulation registers).
    expect(t.con.core.complete('ent_fire obj_sentr').items).toContain('ent_fire obj_sentrygun');
  });

  it('completes map, class and item arguments', () => {
    const t = setup();
    expect(t.con.core.complete('changelevel ctf_').items).toContain('changelevel ctf_2fort');
    expect(t.con.core.complete('joinclass sol').items).toEqual(['joinclass soldier']);
    expect(t.con.core.complete('give item_health').items).toContain('give item_healthkit_full');
    expect(t.con.core.complete('tf_bot_add 3 ').items).toContain('tf_bot_add 3 expert');
    expect(t.con.core.complete('bind mouse').items).toContain('bind mouse1');
  });

  it('the runtime gives the client and the panel the same console per store', () => {
    const store = createHudStore({ game: 'portal' });
    expect(peekGameConsole(store)).toBeNull();
    const link = attachConsoleHost(store, 'portal', { authority: () => 'sp' });
    expect(gameConsoleFor(store, 'portal')).toBe(link.console);
    expect(link.serverEvent({ type: 'sound' })).toBe(false);
    link.detach();
    expect(link.console.hostAttached).toBe(false);
  });
});

describe('net_graph', () => {
  it('measures traffic and loss from the counters', () => {
    const m = new NetGraphMeter();
    m.sample(0, { inBytes: 0, inPackets: 0, snapshots: 0, newestTick: 100, snapshotInterval: 2 });
    for (let i = 0; i < 66; i++) m.recordOut(40);
    // A second later: 66 ticks → 33 snapshots expected, 30 arrived.
    m.sample(1000, { inBytes: 30_000, inPackets: 40, snapshots: 30, newestTick: 166, snapshotInterval: 2 });
    const s = m.stats()!;
    expect(s.inBytesPerSec).toBeCloseTo(30_000);
    expect(s.outBytesPerSec).toBeCloseTo(2640);
    expect(s.outPacketsPerSec).toBeCloseTo(66);
    expect(s.lossPct).toBeCloseTo((1 - 30 / 33) * 100, 5);
    expect(s.chokePct).toBe(0);
    expect(s.updateRate).toBeCloseTo(30);
  });

  it('reads the client through the host', () => {
    let n = 0;
    const t = setup('tf2', {
      netCounters: () => ({ inBytes: (n += 1000), inPackets: n / 100, snapshots: n / 1000, newestTick: n / 500, snapshotInterval: 2 }),
    });
    expect(t.con.sampleNet(0)).toBeNull();
    expect(t.con.sampleNet(500)!.inBytesPerSec).toBeCloseTo(2000);
  });
});

describe('single-player server half', () => {
  function fakeWorld() {
    const player = {
      id: 1,
      health: 100,
      maxHealth: 100,
      armor: 0,
      hasSuit: false,
      portalgun: null as null | { canFire1: boolean; canFire2: boolean; nextFire: number },
      takeDamage: DAMAGE_YES,
      flags: 0,
      dead: false,
      buddha: false,
      origin: { x: 0, y: 0, z: 0 },
      eyeAngles: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      move: { moveType: MOVETYPE_WALK },
      placeAt(o: { x: number; y: number; z: number }, a: { x: number; y: number; z: number } | null) {
        Object.assign(this.origin, o);
        if (a) Object.assign(this.eyeAngles, a);
      },
      die() {
        this.dead = true;
      },
    };
    let saved = 0;
    const world = {
      player,
      mapName: 'testchmb_a_00',
      curtime: 1,
      checkpoint: null as null | object,
      portals: {},
      saveCheckpoint() {
        saved++;
        this.checkpoint = {};
      },
      reloadAfterDeath() {},
      damage(p: typeof player, n: number) {
        p.health -= n;
      },
    };
    return { world, player, saved: () => saved };
  }

  it('is its own host: sets sv_cheats, gates cheats, runs them on the world', () => {
    const printed: string[] = [];
    const cvars: Array<[string, string]> = [];
    const loads: string[] = [];
    const sp = new SpServerConsole('portal', {
      print: (t) => printed.push(t),
      cvar: (n, v) => cvars.push([n, v]),
      changeLevel: (m) => (loads.push(m), true),
      maps: () => ['testchmb_a_00', 'testchmb_a_01'],
    });
    const f = fakeWorld();
    sp.bind(f.world as never);
    sp.execute('noclip', []);
    expect(printed.at(-1)).toContain("Can't use cheat command noclip");
    sp.execute('sv_cheats', ['1']);
    expect(cvars).toContainEqual(['sv_cheats', '1']);
    sp.execute('noclip', []);
    expect(f.player.move.moveType).toBe(MOVETYPE_NOCLIP);
    sp.execute('god', []);
    expect(f.player.takeDamage).toBe(DAMAGE_NO);
    sp.execute('notarget', []);
    expect(f.player.flags & FL_NOTARGET).not.toBe(0);
    sp.execute('impulse', [101]);
    expect(f.player.portalgun).toEqual({ canFire1: true, canFire2: true, nextFire: 0 });
    sp.execute('setpos', ['10', '20', '30']);
    expect(f.player.origin).toEqual({ x: 10, y: 20, z: 30 });
    sp.execute('host_timescale', ['0.5']);
    expect(sp.timescale).toBe(0.5);
    sp.execute('changelevel', ['testchmb_a_01']);
    sp.execute('changelevel', ['d1_trainstation_01']);
    expect(loads).toEqual(['testchmb_a_01']);
    sp.execute('save', []);
    expect(f.saved()).toBe(1);
    // A new level's player gets the toggles back.
    const g = fakeWorld();
    sp.bind(g.world as never);
    expect(g.player.move.moveType).toBe(MOVETYPE_NOCLIP);
    expect(g.player.takeDamage).toBe(DAMAGE_NO);
    // sv_cheats 0 ends them and resets the cheat cvars.
    sp.execute('sv_cheats', ['0']);
    expect(g.player.move.moveType).toBe(MOVETYPE_WALK);
    expect(g.player.takeDamage).toBe(DAMAGE_YES);
    expect(sp.timescale).toBe(1);
    expect(sp.execute('not_a_command', [])).toBe(false);
    expect(sp.execute('setpos', ['\u0000'])).toBe(true);
  });
});
