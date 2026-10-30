/**
 * One game's developer console: the engine (./core.ts) with everything the
 * three games register on it, and the routing of each command to where it
 * runs.
 *
 *   - CLIENT (here, in the browser): the console itself, binds, aliases,
 *     cfgs, the settings-backed cvars (./settings-cvars.ts), `net_graph`,
 *     `cl_showfps`, `fps_max`, `r_drawviewmodel`, `screenshot`, the `+`/`-`
 *     action commands and impulses (written into the shared InputState, as a
 *     key would), `say`, `jointeam`, `build`… (sent as the HUD's own
 *     commands), `retry` / `disconnect` / `connect`, and — offline TF2 only —
 *     `changelevel` (the listen server restarts on the new map);
 *   - SERVER (the authority): every command and cvar of ./server-commands.ts
 *     is forwarded as `HudCommand { kind: 'extra' }` → the TF2 client's
 *     transport (`tf2:extra` to a hub room, the listen-server worker
 *     offline) or the single-player client's world. The authority validates
 *     and answers with `console` events; replicated cvars come back as `cvar`
 *     events and are mirrored here (`sv_cheats` gates client-side cheats such
 *     as `thirdperson`, as Source's client checks its replicated sv_cheats).
 *
 * The client mounts the console through ./runtime.ts (one per HUD store); the
 * React panel (components/tf2-game/console/Console.tsx) is a view of it.
 *
 * Environment-agnostic (the screenshot and `connect` touch the DOM only when
 * there is one).
 */

import type { Vec3 } from '../core/vec';
import { TF2_MAPS } from '../data/maps';
import { GAME_MAPS } from '../assets/game-maps';
import { TF2_ROOM_CODE_RE, type ClassChoice, type RoomAdminPayload, type TeamChoice } from '../net/events';
import { completeInputs, completeTargets, type EntityIndex } from './entity-complete';
import { EXTRA_COMMAND_NAME_RE } from '../net/extra-commands';
import type { ClientStats } from '../client/game-client';
import type { HudGame } from '../client/hud-state';
import type { HudCommand, HudStore } from '../client/hud-store';
import { FIXED_ACTIONS, HELD_ACTIONS, isAction, rebind, type Action, type Keybinds } from '../client/input/actions';
import { pushImpulse, setHeld, type InputState } from '../client/input/input-state';
import { defaultSettings, devConsoleEnabled, type GameSettings } from '../client/settings';
import { ConsoleCore, type ConsoleLevel } from './core';
import { ACTION_COMMANDS, actionCommand, allKeyNames, BindTable, codeToKeyName, commandAction, keyNameToCode } from './binds';
import { FCVAR_ARCHIVE, FCVAR_CHEAT, FCVAR_CLIENTDLL, FCVAR_GAMEDLL, type ConVar } from './cvar';
import { ConsoleFiles, cfgName, type ConsoleStorage } from './files';
import { NetGraphMeter, type NetCounters, type NetGraphStats } from './net-graph';
import { registerSettingsCvars, type SettingsCvars } from './settings-cvars';
import {
  CLASS_WORDS,
  DIFFICULTY_WORDS,
  SERVER_ARG_MAX,
  SERVER_COMMANDS,
  SERVER_CVARS,
  SP_GIVE_ITEMS,
  serverCvarDefault,
  tf2GiveItems,
  validateServerArgs,
  type ConsoleGame,
} from './server-commands';
import { quoteArg, unquoteArgS } from './tokenize';
import { captureGameScreenshot } from './screenshot';

/** What the running game client lends the console (all optional but `authority`). */
export interface ConsoleHost {
  /**
   * Who runs the match: `listen` (offline, or this browser hosting peer-to-peer), `remote`
   * (someone else's peer-to-peer room), `sp` (Half-Life 2 / Portal).
   */
  authority(): 'listen' | 'remote' | 'sp';
  stats?(): ClientStats;
  netCounters?(): NetCounters | null;
  /** The game canvas (screenshots are taken right after a frame renders: `frame()`). */
  canvas?(): HTMLCanvasElement | null;
  setFpsMax?(fps: number): void;
  setThirdPerson?(on: boolean): void;
  setViewAngles?(angles: Vec3): void;
  /**
   * TF2 `changelevel`: the listen server (offline, a peer-to-peer host) moves the match; every client
   * reloads the level from the new `hello`. False when this session cannot.
   */
  changeLevel?(map: string): boolean;
  /** Room administration (kick, ownership, lock, password, a server message); false when refused here. */
  admin?(action: RoomAdminPayload): Promise<boolean> | boolean;
  /** Whether this player runs the room (a listen server's host). */
  isAdmin?(): boolean;
  /** The room's other players (admin completion: `kick`). */
  players?(): Array<{ id: number; name: string }>;
  /** Entity names / classnames / map inputs for `ent_fire`'s completion (./entity-complete.ts). */
  entityIndex?(): EntityIndex | null;
  /** The HUD's root element, composited over the game view by `screenshot`. */
  hudRoot?(): HTMLElement | null;
  retry?(): void;
  /** cl_showpos. */
  position?(): { origin: Vec3; angles: Vec3; velocity: Vec3 } | null;
  /** A replicated cvar arrived (sv_gravity reaches the predicting client). */
  applyReplicated?(name: string, value: string): void;
  /** The map being played (screenshot names, `status` fallbacks). */
  mapName?(): string;
}

/** What the panel gives the console while it is mounted. */
export interface ConsoleUi {
  input: InputState | null;
  getSettings(): GameSettings;
  setSettings(next: GameSettings): void;
  /** Opens the cfg editor on a file. */
  editFile(name: string): void;
}

export interface GameConsoleOptions {
  storage?: ConsoleStorage | null;
  touchFirst?: boolean;
  /** Settings before a panel mounts (defaults otherwise). */
  settings?: GameSettings;
}

/** A server's console reply, as the simulation event carries it. */
export interface ServerConsoleEvent {
  type: 'console';
  text: string;
  level: number;
  setang?: Vec3;
}

const REPLY_LEVEL: readonly ConsoleLevel[] = ['info', 'warn', 'error', 'success'];
const TEAM_ARG: Readonly<Record<string, TeamChoice>> = { red: 'red', blue: 'blue', auto: 'auto', spectate: 'spectator', spectator: 'spectator' };
const CLASS_ALIASES: Readonly<Record<string, ClassChoice>> = { heavyweapons: 'heavy', demo: 'demoman', engy: 'engineer' };

/** Commands that run on the client even though a server spec exists for another game. */
const CLIENT_SIDE = new Set(['changelevel', 'map']);

export class GameConsole {
  readonly core: ConsoleCore;
  readonly binds = new BindTable();
  readonly net = new NetGraphMeter();
  readonly game: HudGame;
  readonly netGraph: ConVar;
  readonly fpsMax: ConVar;
  readonly drawViewModel: ConVar;
  readonly showPos: ConVar;
  private host: ConsoleHost | null = null;
  private ui: ConsoleUi | null = null;
  private settings: GameSettings;
  private readonly settingsCvars: SettingsCvars;
  private started = false;
  private open = false;
  private forced = false;
  private touchFirst: boolean;
  private shotPending = false;
  private thirdPerson = false;
  private readonly openListeners = new Set<() => void>();
  private configTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly store: HudStore,
    game: HudGame,
    opts: GameConsoleOptions = {},
  ) {
    this.game = game;
    this.touchFirst = opts.touchFirst ?? false;
    this.settings = opts.settings ?? defaultSettings(game);
    const files = new ConsoleFiles(game, opts.storage === undefined ? undefined : opts.storage);
    this.core = new ConsoleCore({
      files,
      cheatsAllowed: () => this.cheats,
      forwardServerCvar: (cv, value) => this.forward(cv.name, value === null ? [] : [value]),
      onArchiveChange: () => this.scheduleConfigWrite(),
    });
    this.core.configExtras = () => this.binds.configLines();
    this.settingsCvars = registerSettingsCvars(this.core, game, {
      get: () => this.settings,
      set: (next) => this.applySettings(next),
    });
    this.netGraph = this.core.registerCvar({
      name: 'net_graph',
      type: 'int',
      default: 0,
      min: 0,
      max: 4,
      flags: FCVAR_ARCHIVE | FCVAR_CLIENTDLL,
      help: 'Draw the network graph: 1 fps / ping / traffic, 2 + loss and choke, 3 + frame timings, 4 + a frame-time graph.',
      values: ['0', '1', '2', '3', '4'],
    });
    this.fpsMax = this.core.registerCvar({
      name: 'fps_max',
      type: 'int',
      default: 0,
      min: 0,
      max: 1000,
      flags: FCVAR_ARCHIVE | FCVAR_CLIENTDLL,
      help: 'Frame rate limiter (0 = the display rate).',
      values: ['0', '30', '60', '120', '144'],
      onChange: (cv) => this.host?.setFpsMax?.(cv.int > 0 ? Math.max(10, cv.int) : 0),
    });
    this.drawViewModel = this.core.registerCvar({
      name: 'r_drawviewmodel',
      type: 'bool',
      default: 1,
      flags: FCVAR_ARCHIVE | FCVAR_CLIENTDLL,
      help: 'Draw the weapon in your hands.',
    });
    this.showPos = this.core.registerCvar({
      name: 'cl_showpos',
      type: 'int',
      default: 0,
      min: 0,
      max: 1,
      flags: FCVAR_CLIENTDLL,
      help: 'Draw your position, angles and speed.',
    });
    this.core.registerCvar({
      name: 'hud_fastswitch',
      type: 'int',
      default: 1,
      min: 1,
      max: 1,
      flags: FCVAR_ARCHIVE | FCVAR_CLIENTDLL,
      help: 'Weapon selection switches at once (the only mode this game has).',
    });
    this.registerServerProxies();
    this.registerClientCommands();
  }

  // ─── Wiring ──────────────────────────────────────────────────────────────

  /** The game client mounted (or unmounted, null). */
  setHost(host: ConsoleHost | null): void {
    this.host = host;
    if (host) {
      if (this.fpsMax.int > 0) host.setFpsMax?.(Math.max(10, this.fpsMax.int));
      this.net.reset();
    }
  }

  get hostAttached(): boolean {
    return this.host !== null;
  }

  /** The panel mounted: settings become live, and the first time the cfgs run. */
  attachUi(ui: ConsoleUi | null): void {
    this.ui = ui;
    if (!ui) return;
    this.syncSettings(ui.getSettings());
    if (!this.started) {
      this.started = true;
      this.core.exec('config.cfg', 0, true);
      this.core.exec('autoexec.cfg', 0, true);
      this.core.execute();
    }
  }

  /** The settings changed outside the console (the Options panel). */
  syncSettings(s: GameSettings): void {
    this.settings = s;
    this.settingsCvars.sync(s);
  }

  private applySettings(next: GameSettings): void {
    this.settings = next;
    if (this.ui) this.ui.setSettings(next);
  }

  setTouchFirst(touch: boolean): void {
    this.touchFirst = touch;
  }

  // ─── Open / closed ───────────────────────────────────────────────────────

  /** Whether the console may open (con_enable, or `?console=1` this session). */
  get enabled(): boolean {
    return this.forced || devConsoleEnabled(this.settings, this.touchFirst);
  }

  get isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    const v = open && this.enabled;
    if (v === this.open) return;
    this.open = v;
    for (const l of this.openListeners) l();
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  /** `?console=1` turned the console on for this session. */
  get forcedOn(): boolean {
    return this.forced;
  }

  /** `-console` / `?console=1`: enabled for this session and open now. */
  forceOpen(): void {
    this.forced = true;
    this.setOpen(true);
  }

  subscribeOpen(fn: () => void): () => void {
    this.openListeners.add(fn);
    return () => this.openListeners.delete(fn);
  }

  // ─── Per frame (the client calls it right after rendering) ───────────────

  frame(): void {
    this.core.frame();
    if (this.shotPending) {
      this.shotPending = false;
      this.takeScreenshot();
    }
  }

  /** Samples the network counters (the panel calls it a few times a second). */
  sampleNet(now: number): NetGraphStats | null {
    const c = this.host?.netCounters?.();
    if (c) this.net.sample(now, c);
    return c ? this.net.stats() : null;
  }

  stats(): ClientStats | null {
    return this.host?.stats?.() ?? null;
  }

  position(): { origin: Vec3; angles: Vec3; velocity: Vec3 } | null {
    return this.host?.position?.() ?? null;
  }

  /** Whether third person is on (the client asks every frame). */
  get thirdPersonOn(): boolean {
    return this.thirdPerson;
  }

  // ─── From the server ─────────────────────────────────────────────────────

  /** The server's replicated sv_cheats (single-player: the local world's). */
  get cheats(): boolean {
    return this.core.cvar('sv_cheats')?.bool ?? false;
  }

  /** A console reply or a replicated cvar from the authority. True when it was one (the client drops it). */
  serverEvent(ev: { type: string } & Record<string, unknown>): boolean {
    if (ev.type === 'console') {
      const level = REPLY_LEVEL[Number(ev.level)] ?? 'info';
      this.core.print(String(ev.text ?? ''), level);
      const a = ev.setang as Vec3 | undefined;
      if (a && typeof a.x === 'number') this.host?.setViewAngles?.(a);
      return true;
    }
    if (ev.type === 'cvar') {
      const name = String(ev.name ?? '');
      const value = String(ev.value ?? '');
      this.core.setReplicated(name, value);
      this.host?.applyReplicated?.(name, value);
      if (name === 'sv_cheats' && value === '0' && this.thirdPerson) {
        this.thirdPerson = false;
        this.host?.setThirdPerson?.(false);
      }
      return true;
    }
    return false;
  }

  print(text: string, level: ConsoleLevel = 'info'): void {
    this.core.print(text, level);
  }

  // ─── Keys (the panel's window listener) ──────────────────────────────────

  private readonly downKeys = new Set<string>();

  /**
   * A key or mouse button with a console bind (not an action: those are the input layer's).
   * True when the console ran something for it.
   */
  keyEvent(code: string, down: boolean, repeat = false): boolean {
    const cmd = this.binds.get(code);
    if (!cmd) return false;
    if (down) {
      // Auto-repeat of a key already down: swallowed, not run again.
      if (repeat) return this.downKeys.has(code);
      const input = this.ui?.input;
      if (this.open || (input && input.suspended)) return false;
      this.downKeys.add(code);
      this.core.run(cmd, 'bind');
      return true;
    }
    if (!this.downKeys.delete(code)) return false;
    // Key_Event: a `+` binding runs its `-` form on release.
    if (cmd.trim().startsWith('+')) this.core.run(`-${cmd.trim().slice(1)}`, 'bind');
    return true;
  }

  /** Lets go of every `+` console bind held (focus lost, console opened). */
  releaseKeys(): void {
    for (const code of [...this.downKeys]) this.keyEvent(code, false);
  }

  // ─── Routing ─────────────────────────────────────────────────────────────

  private send(cmd: HudCommand): void {
    this.store.send(cmd);
  }

  /** Sends a server command or cvar to the authority (validated there again). */
  forward(name: string, words: readonly string[]): void {
    if (!EXTRA_COMMAND_NAME_RE.test(name)) {
      this.print(`${name}: not a server command`, 'error');
      return;
    }
    if (words.length > 8 || words.some((w) => w.length > SERVER_ARG_MAX)) {
      this.print(`${name}: too many or too long arguments (8 × ${SERVER_ARG_MAX} characters at most)`, 'warn');
      return;
    }
    if (!this.host) {
      this.print(`${name}: not connected to a server`, 'warn');
      return;
    }
    this.send({ kind: 'extra', command: name, args: [...words] });
  }

  private get consoleGame(): ConsoleGame {
    return this.game;
  }

  private maps(): string[] {
    return this.game === 'tf2' ? TF2_MAPS.map((m) => m.name) : GAME_MAPS[this.game].map((m) => m.name);
  }

  private registerServerProxies(): void {
    const g = this.consoleGame;
    for (const spec of SERVER_CVARS) {
      if (!spec.games.includes(g)) continue;
      this.core.registerCvar({
        name: spec.name,
        type: spec.type,
        default: serverCvarDefault(spec, g),
        min: spec.min,
        max: spec.max,
        values: spec.values ?? (spec.type === 'bool' ? ['0', '1'] : undefined),
        flags: spec.flags | FCVAR_GAMEDLL,
        help: spec.help,
      });
    }
    for (const spec of SERVER_COMMANDS) {
      if (!spec.games.includes(g) || (CLIENT_SIDE.has(spec.name) && g === 'tf2')) continue;
      if (spec.name === 'impulse') continue; // client-side first (impulse 100 is the flashlight)
      this.core.registerCommand({
        name: spec.name,
        help: spec.help,
        flags: spec.access === 'cheat' ? FCVAR_GAMEDLL | FCVAR_CHEAT : FCVAR_GAMEDLL,
        serverSide: true,
        complete: (i, argv) => this.completeServer(spec.name, i, argv),
        run: ({ argv }) => {
          const words = argv.slice(1);
          if (!spec.free) {
            // Usage errors print at once; the server checks everything again.
            const v = validateServerArgs(spec, words);
            if (!v.ok) {
              this.print(v.error, 'warn');
              return;
            }
          }
          this.forward(spec.name, words);
        },
      });
    }
  }

  private completeServer(name: string, i: number, argv: readonly string[]): readonly string[] {
    switch (name) {
      case 'give':
        return i === 1 ? (this.game === 'tf2' ? tf2GiveItems() : this.game === 'csgo' ? [] : SP_GIVE_ITEMS[this.game]) : [];
      case 'changelevel':
      case 'map':
        return i === 1 ? this.maps() : [];
      case 'tf_bot_add':
        return ['1', '3', '5', ...CLASS_WORDS, 'red', 'blue', 'auto', ...DIFFICULTY_WORDS, 'noquota'];
      case 'tf_bot_kick':
      case 'tf_bot_kill':
        return i === 1 ? ['all', ...this.botNames(), ...CLASS_WORDS, 'red', 'blue'] : [];
      case 'mp_restartgame':
        return i === 1 ? ['0', '5', '10'] : [];
      case 'ent_fire': {
        // Names and classnames the client knows (the map's lump, the registered classes), and the
        // inputs that target's class handles plus those the map's own outputs send it.
        const index = this.host?.entityIndex?.() ?? null;
        return i === 1 ? completeTargets(index) : i === 2 ? completeInputs(index, argv[1] ?? '') : [];
      }
      case 'portal_place':
        return i === 1 ? ['0', '1'] : [];
      case 'setang':
      case 'setpos':
        void argv;
        return [];
      default:
        return [];
    }
  }

  private botNames(): string[] {
    return this.store
      .getSnapshot()
      .scoreboard.filter((r) => r.bot)
      .map((r) => r.name);
  }

  // ─── Client commands ─────────────────────────────────────────────────────

  private registerClientCommands(): void {
    const c = this.core;
    const tf2 = this.game === 'tf2';
    const input = () => this.ui?.input ?? null;

    c.registerCommand({ name: 'toggleconsole', help: 'Show/hide the console.', run: () => this.toggle() });
    c.registerCommand({ name: 'showconsole', help: 'Show the console.', run: () => this.setOpen(true) });
    c.registerCommand({ name: 'hideconsole', help: 'Hide the console.', run: () => this.setOpen(false) });
    c.registerCommand({
      name: 'screenshot',
      help: 'Take a screenshot (the game view and its HUD, as a PNG download).',
      run: () => {
        if (!this.host?.canvas?.()) {
          this.print('screenshot: no game view', 'warn');
          return;
        }
        this.shotPending = true;
      },
    });
    c.registerCommand({ name: 'jpeg', help: 'Take a screenshot (saved as PNG here).', run: () => c.run('screenshot', 'alias') });

    // Held actions: +forward / -forward … write the input state like a key would.
    for (const [cmd, action] of Object.entries(ACTION_COMMANDS)) {
      if (!cmd.startsWith('+')) continue;
      const held = action as (typeof HELD_ACTIONS)[number];
      const set = (down: boolean) => {
        const st = input();
        if (st) setHeld(st, 'key', held, down);
      };
      c.registerCommand({ name: cmd, help: `Start ${held} (held until ${cmd.replace('+', '-')}).`, run: () => set(true) });
      c.registerCommand({ name: `-${cmd.slice(1)}`, help: `Stop ${held}.`, run: () => set(false) });
    }
    // Impulse actions: slot1, invnext, voice_menu_1, changeclass…
    const impulse = (action: Parameters<typeof pushImpulse>[1]) => {
      const st = input();
      if (st) pushImpulse(st, action);
      else this.store.dispatchImpulse(action);
    };
    const impulseNames: Array<[string, Parameters<typeof pushImpulse>[1]]> = [
      ['slot1', 'slot1'],
      ['slot2', 'slot2'],
      ['slot3', 'slot3'],
      ['slot4', 'slot4'],
      ['slot5', 'slot5'],
      ['slot6', 'slot6'],
      ['slot7', 'slot7'],
      ['slot8', 'slot8'],
      ['slot9', 'slot9'],
      ['lastinv', 'lastinv'],
      ['invnext', 'invnext'],
      ['invprev', 'invprev'],
      ['messagemode', 'say'],
      ['messagemode2', 'say_team'],
    ];
    if (tf2) {
      impulseNames.push(
        ['voice_menu_1', 'voice_menu_1'],
        ['voice_menu_2', 'voice_menu_2'],
        ['voice_menu_3', 'voice_menu_3'],
        ['changeclass', 'changeclass'],
        ['changeteam', 'changeteam'],
        ['taunt', 'taunt'],
        ['dropitem', 'dropitem'],
        ['lastdisguise', 'lastdisguise'],
      );
    }
    for (const [name, action] of impulseNames) c.registerCommand({ name, help: `The ${action} key.`, run: () => impulse(action) });

    c.registerCommand({
      name: 'impulse',
      help: 'impulse 100: flashlight (Half-Life 2); impulse 101 (cheat): full health, ammo and weapons.',
      complete: (i) => (i === 1 ? ['100', '101'] : []),
      run: ({ argv }) => {
        const n = Math.trunc(Number(argv[1]));
        if (!Number.isFinite(n) || argv.length < 2) {
          this.print('Usage:  impulse <n>', 'warn');
          return;
        }
        if (n === 100) {
          impulse('flashlight');
          return;
        }
        if (n !== 101) {
          this.print(`impulse ${n}: no effect in this game`, 'dev');
          return;
        }
        // The server checks sv_cheats (a line like `sv_cheats 1; impulse 101` reaches it in order).
        this.forward('impulse', ['101']);
      },
    });

    if (tf2) this.registerTf2Commands();
    else {
      c.registerCommand({
        name: 'say',
        help: 'Display player message (single-player: to the console).',
        run: ({ argS }) => this.print(unquoteArgS(argS)),
      });
    }

    // Leaving / joining.
    c.registerCommand({ name: 'disconnect', help: 'Disconnect from the server (back to the menu).', run: () => this.send({ kind: 'disconnect' }) });
    c.registerCommand({ name: 'quit', help: 'Leave the game.', run: () => this.send({ kind: 'disconnect' }) });
    c.registerCommand({ name: 'exit', help: 'Leave the game.', run: () => this.send({ kind: 'disconnect' }) });
    c.registerCommand({
      name: 'retry',
      help: 'Retry the connection (offline: restart the match).',
      run: () => {
        if (this.host?.retry) this.host.retry();
        else this.print('retry: nothing to retry', 'warn');
      },
    });

    this.registerBindCommands();
    this.registerCfgCommands();
    if (tf2) this.registerAdminCommands();
  }

  private registerTf2Commands(): void {
    const c = this.core;
    c.registerCommand({
      name: 'say',
      help: 'Display player message.',
      run: ({ argS }) => {
        const text = unquoteArgS(argS);
        if (text) this.send({ kind: 'chat', text, teamOnly: false });
        else if (this.ui?.input) pushImpulse(this.ui.input, 'say');
      },
    });
    c.registerCommand({
      name: 'say_team',
      help: 'Display player message to team.',
      run: ({ argS }) => {
        const text = unquoteArgS(argS);
        if (text) this.send({ kind: 'chat', text, teamOnly: true });
        else if (this.ui?.input) pushImpulse(this.ui.input, 'say_team');
      },
    });
    c.registerCommand({
      name: 'jointeam',
      help: 'Join a team: jointeam <red|blue|auto|spectate>.',
      complete: (i) => (i === 1 ? ['red', 'blue', 'auto', 'spectate'] : []),
      run: ({ argv }) => {
        const team = TEAM_ARG[(argv[1] ?? '').toLowerCase()];
        if (!team) this.print('Usage:  jointeam <red|blue|auto|spectate>', 'warn');
        else this.send({ kind: 'team', team });
      },
    });
    c.registerCommand({
      name: 'joinclass',
      help: 'Play as a class: joinclass <scout|soldier|pyro|demoman|heavyweapons|engineer|medic|sniper|spy|random>.',
      complete: (i) => (i === 1 ? [...CLASS_WORDS, 'heavyweapons', 'random'] : []),
      run: ({ argv }) => {
        const w = (argv[1] ?? '').toLowerCase();
        const cls = (CLASS_ALIASES[w] ?? w) as ClassChoice;
        if (![...CLASS_WORDS, 'random'].includes(cls)) this.print('Usage:  joinclass <class|random>', 'warn');
        else this.send({ kind: 'class', cls });
      },
    });
    c.registerCommand({
      name: 'voicemenu',
      help: 'Say a voice command: voicemenu <0-2> <0-7> (voicemenu 0 0 is MEDIC!).',
      complete: (i) => (i === 1 ? ['0', '1', '2'] : i === 2 ? ['0', '1', '2', '3', '4', '5', '6', '7'] : []),
      run: ({ argv }) => {
        const menu = Number(argv[1]);
        const item = Number(argv[2]);
        if (![0, 1, 2].includes(menu) || !Number.isInteger(item) || item < 0 || item > 7) this.print('Usage:  voicemenu <0-2> <0-7>', 'warn');
        else this.send({ kind: 'voice', menu: menu as 0 | 1 | 2, item });
      },
    });
    for (const action of ['build', 'destroy'] as const) {
      c.registerCommand({
        name: action,
        help: `${action === 'build' ? 'Build' : 'Destroy'} an Engineer building: ${action} <0 dispenser|1 teleporter|2 sentry> [0 entrance|1 exit].`,
        complete: (i) => (i === 1 ? ['0', '1', '2'] : i === 2 ? ['0', '1'] : []),
        run: ({ argv }) => {
          const type = Number(argv[1]);
          const mode = argv.length > 2 ? Number(argv[2]) : 0;
          if (![0, 1, 2, 3].includes(type) || ![0, 1].includes(mode)) this.print(`Usage:  ${action} <type> [mode]`, 'warn');
          else this.send({ kind: 'build', action, objectType: type, objectMode: mode });
        },
      });
    }
    c.registerCommand({
      name: 'disguise',
      help: 'Spy: disguise <class 1-9> <team: 2 red, 3 blue, -1 enemy, -2 friendly>.',
      complete: (i) => (i === 1 ? ['1', '2', '3', '4', '5', '6', '7', '8', '9'] : i === 2 ? ['-1', '-2', '2', '3'] : []),
      run: ({ argv }) => {
        const cls = Number(argv[1]);
        const team = argv.length > 2 ? Number(argv[2]) : -1;
        if (!Number.isInteger(cls) || cls < 1 || cls > 9 || ![2, 3, -1, -2].includes(team)) {
          this.print('Usage:  disguise <class 1-9> <team 2|3|-1|-2>', 'warn');
          return;
        }
        const local = this.store.getSnapshot().local;
        const own = local?.team ?? 2;
        const t = team === -1 ? (own === 2 ? 3 : 2) : team === -2 ? own : team;
        this.send({ kind: 'disguise', cls, team: t });
      },
    });
    c.registerCommand({
      name: 'firstperson',
      flags: FCVAR_CHEAT,
      help: 'Switch to firstperson camera.',
      run: () => {
        this.thirdPerson = false;
        this.host?.setThirdPerson?.(false);
      },
    });
    c.registerCommand({
      name: 'thirdperson',
      flags: FCVAR_CHEAT,
      help: 'Switch to thirdperson camera.',
      run: () => {
        this.thirdPerson = true;
        this.host?.setThirdPerson?.(true);
      },
    });
    c.registerCommand({
      name: 'changelevel',
      help: 'Change the map (offline: the listen server restarts on it).',
      complete: (i) => (i === 1 ? this.maps() : []),
      run: ({ argv }) => this.changeLevelTf2(argv[1]),
    });
    c.registerCommand({
      name: 'map',
      help: 'Start a map (offline: the listen server restarts on it).',
      complete: (i) => (i === 1 ? this.maps() : []),
      run: ({ argv }) => this.changeLevelTf2(argv[1]),
    });
    c.registerCommand({
      name: 'connect',
      help: 'Join a room by its code: connect <ABC234>.',
      run: ({ argv }) => {
        const code = (argv[1] ?? '').toUpperCase();
        if (!TF2_ROOM_CODE_RE.test(code)) {
          this.print('Usage:  connect <room code> (six letters and digits)', 'warn');
          return;
        }
        if (typeof window !== 'undefined') window.location.assign(`/tf2/play?lobby=${code}`);
      },
    });
  }

  private changeLevelTf2(raw: string | undefined): void {
    const map = (raw ?? '').toLowerCase();
    if (!map) {
      this.print('Usage:  changelevel <map>', 'warn');
      return;
    }
    if (!this.maps().includes(map)) {
      this.print(`changelevel: ${map} is not a published map (${this.maps().join(', ')})`, 'warn');
      return;
    }
    const auth = this.host?.authority();
    if (auth !== 'listen' || !this.host?.changeLevel) {
      this.print('changelevel: only the host can change the map', 'error');
      return;
    }
    if (!this.host.changeLevel(map)) this.print('changelevel: this match cannot change map', 'error');
    else this.print(`changelevel: loading ${map}…`);
  }

  /** A room-admin action from the console (`kick`, `rcon say`, `sv_password`…). */
  private admin(action: RoomAdminPayload): void {
    if (!this.host?.admin) {
      this.print(`${action.action}: not connected to a room`, 'warn');
      return;
    }
    void this.host.admin(action);
  }

  /** A player by name (case-insensitive, unique prefix) or `#<id>`. */
  private findPlayer(word: string): { id: number; name: string } | null {
    const list = this.host?.players?.() ?? [];
    const w = word.trim();
    if (/^#\d+$/.test(w)) return list.find((p) => p.id === Number(w.slice(1))) ?? null;
    const lw = w.toLowerCase();
    const exact = list.find((p) => p.name.toLowerCase() === lw);
    if (exact) return exact;
    const prefix = list.filter((p) => p.name.toLowerCase().startsWith(lw));
    return prefix.length === 1 ? prefix[0] : null;
  }

  private registerAdminCommands(): void {
    const c = this.core;
    const names = () => (this.host?.players?.() ?? []).map((p) => p.name);
    const kick = (argS: string) => {
      const who = unquoteArgS(argS);
      const p = who ? this.findPlayer(who) : null;
      if (!p) {
        this.print(who ? `kick: no player "${who}" (players: ${names().join(', ') || 'none'})` : 'Usage:  kick <name|#id>', 'warn');
        return;
      }
      this.admin({ action: 'kick', playerId: p.id });
    };
    c.registerCommand({ name: 'kick', help: "Kick a player (the room's owner / the host): kick <name|#id>.", complete: (i) => (i === 1 ? names() : []), run: ({ argS }) => kick(argS) });
    c.registerCommand({
      name: 'kickid',
      help: 'Kick a player by id: kickid <id>.',
      run: ({ argv }) => kick(`#${Number(argv[1]) || 0}`),
    });
    c.registerCommand({
      name: 'sv_password',
      help: 'Set the room password for new players (the owner / the host): sv_password "<password>" ("" clears it).',
      run: ({ argv }) => this.admin({ action: 'password', password: (argv[1] ?? '').slice(0, 32) }),
    });
    c.registerCommand({
      name: 'sv_lock',
      help: 'Lock the room to new players (the owner / the host): sv_lock <0|1>.',
      complete: (i) => (i === 1 ? ['0', '1'] : []),
      run: ({ argv }) => this.admin({ action: 'lock', locked: Number(argv[1] ?? '1') !== 0 }),
    });
    c.registerCommand({
      name: 'rcon',
      help: 'Run a server admin command (the owner / the host): rcon say <text> | kick <name> | changelevel <map> | sv_password <pw> | sv_lock <0|1> | <server cvar or command>.',
      complete: (i) => (i === 1 ? ['say', 'kick', 'changelevel', 'sv_password', 'sv_lock', 'mp_timelimit', 'mp_winlimit', 'tf_bot_quota', 'tf_bot_difficulty', 'mp_restartgame'] : []),
      run: ({ argv, argS }) => {
        const sub = (argv[1] ?? '').toLowerCase();
        const rest = argS.trim().slice(argv[1]?.length ?? 0).trim();
        if (!sub) {
          this.print('Usage:  rcon <command>', 'warn');
          return;
        }
        if (!this.host?.isAdmin?.()) {
          this.print('rcon: only the host has rcon here', 'error');
          return;
        }
        if (sub === 'say') {
          const text = unquoteArgS(rest);
          if (text) this.admin({ action: 'say', text: text.slice(0, 127) });
          return;
        }
        // Everything else runs as typed (kick, changelevel, sv_password, server cvars).
        c.run(`${argv[1]} ${rest}`.trim(), 'alias');
      },
    });
  }

  // ─── Binds ───────────────────────────────────────────────────────────────

  private registerBindCommands(): void {
    const c = this.core;
    const keybinds = (): Keybinds => this.settings.keybinds;
    const setKeybinds = (k: Keybinds) => this.applySettings({ ...this.settings, keybinds: k });
    const actionFor = (code: string): Action | null => {
      for (const [a, keys] of Object.entries(keybinds()) as Array<[Action, string[] | undefined]>) if (keys?.includes(code)) return a;
      return null;
    };
    const describe = (name: string, code: string): string => {
      const cmd = this.binds.get(code);
      if (cmd !== null) return `"${name}" = "${cmd}"`;
      const a = actionFor(code);
      return a ? `"${name}" = "${actionCommand(a)}"` : `"${name}" is not bound`;
    };
    const withoutCode = (code: string): Keybinds => {
      const out: Keybinds = {};
      for (const [a, keys] of Object.entries(keybinds()) as Array<[Action, string[] | undefined]>) {
        const kept = (keys ?? []).filter((k) => k !== code || FIXED_ACTIONS.has(a));
        if (kept.length) out[a] = kept;
      }
      return out;
    };
    const fixedKey = (code: string) => code === 'Backquote' || code === 'Escape';
    const bindNames = () => allKeyNames();
    const commandNames = () => [...Object.keys(ACTION_COMMANDS).filter((k) => !k.includes(' ')), ...c.matchNames('', 10_000)];

    c.registerCommand({
      name: 'bind',
      help: 'Bind a key: bind <key> "<command>" (bind <key> prints it).',
      complete: (i) => (i === 1 ? bindNames() : i === 2 ? commandNames() : []),
      run: ({ argv }) => {
        if (argv.length < 2) {
          this.print('bind <key> [command] : attach a command to a key');
          return;
        }
        const name = argv[1].toLowerCase();
        const code = keyNameToCode(name);
        if (!code) {
          this.print(`"${argv[1]}" isn't a valid key`, 'warn');
          return;
        }
        if (argv.length === 2) {
          this.print(describe(name, code));
          return;
        }
        if (fixedKey(code)) {
          this.print(`bind: "${name}" is reserved (${code === 'Escape' ? 'the menu' : 'the console'})`, 'warn');
          return;
        }
        // Cmd_Bind_f: the rest of the arguments make the command.
        const command = argv.slice(2).join(' ').trim();
        const action = commandAction(command);
        if (action && isAction(action) && !FIXED_ACTIONS.has(action)) {
          this.binds.remove(code);
          setKeybinds(rebind(withoutCode(code), action, code));
        } else {
          setKeybinds(withoutCode(code));
          this.binds.set(code, command);
        }
        this.scheduleConfigWrite();
      },
    });
    c.registerCommand({
      name: 'unbind',
      help: 'Unbind a key: unbind <key>.',
      complete: (i) => (i === 1 ? bindNames() : []),
      run: ({ argv }) => {
        const code = argv[1] ? keyNameToCode(argv[1]) : null;
        if (!code) {
          this.print(argv[1] ? `"${argv[1]}" isn't a valid key` : 'unbind <key> : remove commands from a key', 'warn');
          return;
        }
        if (fixedKey(code)) return;
        this.binds.remove(code);
        setKeybinds(withoutCode(code));
        this.scheduleConfigWrite();
      },
    });
    c.registerCommand({
      name: 'unbindall',
      help: 'Unbind all keys (Escape and the console key stay).',
      run: () => {
        this.binds.clear();
        const kept: Keybinds = {};
        for (const [a, keys] of Object.entries(keybinds()) as Array<[Action, string[] | undefined]>) if (FIXED_ACTIONS.has(a) && keys) kept[a] = keys;
        setKeybinds(kept);
        this.scheduleConfigWrite();
      },
    });
    c.registerCommand({
      name: 'bind_toggle',
      help: 'Bind a key to toggle a cvar: bind_toggle <key> <cvar>.',
      complete: (i) => (i === 1 ? bindNames() : i === 2 ? c.allCvars().map((v) => v.name) : []),
      run: ({ argv }) => {
        if (argv.length < 3 || !c.cvar(argv[2])) {
          this.print('Usage:  bind_toggle <key> <cvar>', 'warn');
          return;
        }
        c.run(`bind ${quoteArg(argv[1])} "toggle ${argv[2]}"`, 'alias');
      },
    });
    c.registerCommand({
      name: 'key_listboundkeys',
      help: 'List bound keys with bindings.',
      run: () => {
        const rows: string[] = [];
        for (const [a, keys] of Object.entries(keybinds()) as Array<[Action, string[] | undefined]>) {
          for (const k of keys ?? []) {
            const n = codeToKeyName(k);
            if (n) rows.push(`"${n}" = "${actionCommand(a)}"`);
          }
        }
        for (const [code, cmd] of this.binds.entries()) rows.push(`"${codeToKeyName(code) ?? code}" = "${cmd}"`);
        rows.sort();
        for (const r of rows) this.print(r);
      },
    });
  }

  // ─── cfg files ───────────────────────────────────────────────────────────

  private registerCfgCommands(): void {
    const c = this.core;
    const files = () => c.files?.list() ?? [];
    c.registerCommand({
      name: 'cfg_list',
      help: 'List your cfg files.',
      run: () => {
        const list = files();
        if (!list.length) this.print('No cfg files yet. cfg_edit autoexec.cfg makes one.');
        for (const f of list) this.print(f);
      },
    });
    c.registerCommand({
      name: 'cfg_edit',
      help: 'Edit a cfg file in the console (autoexec.cfg runs when the game starts).',
      complete: (i) => (i === 1 ? [...new Set(['autoexec.cfg', 'config.cfg', ...files()])] : []),
      run: ({ argv }) => {
        const n = cfgName(argv[1] ?? 'autoexec.cfg');
        if (!n) {
          this.print('cfg_edit: invalid file name', 'error');
          return;
        }
        if (n === 'config.cfg') this.print('config.cfg is rewritten when binds or archived cvars change; put your own commands in autoexec.cfg.', 'warn');
        if (this.ui) this.ui.editFile(n);
        else this.print('cfg_edit: the console panel is not open', 'warn');
      },
    });
    c.registerCommand({
      name: 'cfg_delete',
      help: 'Delete a cfg file: cfg_delete <name>.',
      complete: (i) => (i === 1 ? files() : []),
      run: ({ argv }) => {
        if (!argv[1] || !c.files?.read(argv[1])) {
          this.print('cfg_delete: no such file', 'warn');
          return;
        }
        c.files.remove(argv[1]);
        this.print(`Deleted ${cfgName(argv[1])}`);
      },
    });
  }

  /** The cfg editor's save. */
  writeFile(name: string, text: string): boolean {
    const ok = this.core.files?.write(name, text) ?? false;
    this.print(ok ? `Saved ${cfgName(name)}` : `Couldn't save ${name} (storage unavailable, full or the name is invalid)`, ok ? 'success' : 'error');
    return ok;
  }

  readFile(name: string): string {
    return this.core.files?.read(name) ?? '';
  }

  private scheduleConfigWrite(): void {
    if (!this.started) return;
    if (this.configTimer) clearTimeout(this.configTimer);
    this.configTimer = setTimeout(() => {
      this.configTimer = null;
      this.core.writeConfig();
    }, 250);
  }

  // ─── Screenshot ──────────────────────────────────────────────────────────

  private takeScreenshot(): void {
    const canvas = this.host?.canvas?.();
    if (!canvas || typeof document === 'undefined') return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = `${this.game}_${this.host?.mapName?.() ?? 'game'}_${stamp}.png`;
    // The game view with its HUD (./screenshot.ts); the 3D canvas is read now, right after its frame.
    void captureGameScreenshot(canvas, this.host?.hudRoot?.() ?? null)
      .then((blob) => {
        if (!blob) {
          this.print('screenshot: the browser returned no image', 'error');
          return;
        }
        this.lastScreenshot = blob;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        this.print(`Wrote ${name}`, 'success');
      })
      .catch((e: unknown) => this.print(`screenshot: ${e instanceof Error ? e.message : String(e)}`, 'error'));
  }

  /** The newest screenshot (tests and the smoke read it back). */
  lastScreenshot: Blob | null = null;

  /** Runs a line as the player typed it. */
  submit(line: string): void {
    this.core.submit(line);
  }

  dispose(): void {
    if (this.configTimer) clearTimeout(this.configTimer);
    this.releaseKeys();
    this.host = null;
    this.ui = null;
  }
}
