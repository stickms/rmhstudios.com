/**
 * The TF2 match host's half of the developer console: the server cvars
 * (`sv_cheats`, `sv_gravity`, `mp_*`, `tf_bot_*`) and the server commands
 * (`kill`, `status`, `tf_bot_add`, `noclip`, `give`…), run on the simulation
 * thread between ticks like every other `MatchCommand`. Commands arrive as
 * `MatchCommand { kind: 'extra' }` (the `tf2:extra` channel, rate-limited by
 * the hub and shaped by zExtraCommand) — and are validated again here
 * (./server-commands.ts) with the server's own permission model:
 *
 *   - a dedicated hub room (`policy.kind` 'dedicated', the default) has no
 *     admin: `sv_cheats` is locked to 0, host commands and server cvars are
 *     refused (a room that names an `ownerId` lets that player change the
 *     match settings, never cheats);
 *   - a listen server (offline play, or a peer-to-peer host) is administered
 *     by its host, `ownerId`: only they set server cvars, add bots, restart;
 *     with `sv_cheats 1` every player there may use cheats, as on a Source
 *     listen server.
 *
 * Replies go to the player as `console` events; replicated cvars go to
 * everyone as `cvar` events (and to each player who joins later). A player
 * may run at most RATE_BURST commands at once, refilled at RATE_PER_SECOND.
 *
 * Environment-agnostic (the hub's worker, the browser listen server, Vitest).
 */

import {
  CLASS_NAMES,
  MASK_PLAYERSOLID,
  MASK_SHOT,
  MOVETYPE_NOCLIP,
  MOVETYPE_WALK,
  TEAM_SPECTATOR,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
  TICK_INTERVAL,
  FL_GODMODE,
  FL_NOTARGET,
} from '../core/constants';
import { emptyTrace } from '../core/types';
import { copy, type Vec3 } from '../core/vec';
import { STOCK_WEAPONS } from '../data/weapons';
import type { BotDifficulty, ClassChoice, TeamChoice } from '../net/events';
import type { ExtraCommandArgs } from '../net/extra-commands';
import type { MatchOptions } from '../server/match-host';
import { createDamageInfo, DMG_PREVENT_PHYSICS_FORCE } from '../sim/damage';
import { weaponSpecFor } from '../sim/loadout';
import { TF_MOVE_PARAMS } from '../sim/movement';
import type { MoveParams } from '../sim/movement-types';
import type { Player } from '../sim/player';
import { GR_STATE_PREROUND } from '../sim/rules';
import { createWeapon } from '../sim/weapon-api';
import type { GameWorld } from '../sim/world';
import { getBotManager } from '../bots/brain/manager';
import { FCVAR_NOTIFY, FCVAR_REPLICATED } from './cvar';
import {
  argWords,
  CLASS_WORDS,
  DIFFICULTY_WORDS,
  isCheat,
  parseBotAdd,
  SERVER_CVARS,
  serverCommandSpec,
  serverCvarDefault,
  serverCvarSpec,
  TF2_GIVE_PICKUPS,
  validateCvarValue,
  validateServerArgs,
  type ConsoleGame,
  type ServerCvarSpec,
} from './server-commands';

export const RATE_BURST = 20;
export const RATE_PER_SECOND = 8;
/** Pickups a player may `give` before the oldest is removed. */
export const GIVE_MAX_ENTITIES = 16;

export interface ServerConsolePolicy {
  kind: 'dedicated' | 'listen';
  /** The match's admin (hub player id): the listen server's host, or a dedicated room's creator. */
  ownerId?: number;
}

/** What the console needs from the match host (Tf2MatchHost implements it). */
export interface ConsoleMatchHost {
  readonly world: GameWorld;
  readonly options: MatchOptions;
  humans(): Array<{ hubId: number; player: Player; rttMs: number }>;
  bots(): Player[];
  addBots(count: number, difficulty: BotDifficulty, prefs?: { team?: TeamChoice; cls?: ClassChoice; name?: string }): Player[];
  removeBot(entity: number): boolean;
  rebalanceBots(): void;
  /** host_timescale: the match runner paces ticks this much faster (a listen server only). False when it cannot. */
  setTimescale?(scale: number): boolean;
}

/** The console's own state, for a checkpoint (host migration). */
export interface ServerConsoleState {
  values: Array<[string, string]>;
  restartAt: number;
  fixedClasses: boolean;
  given: number[];
}

const LEVEL = { info: 0, warn: 1, error: 2, success: 3 } as const;
type Level = keyof typeof LEVEL;

interface Bucket {
  tokens: number;
  at: number;
}

/** A Player with the console's per-player toggles (buddha lives on the player: sim/player.ts reads it). */
type ConsolePlayer = Player & { buddha?: boolean };

export class Tf2ServerConsole {
  protected readonly values = new Map<string, string>();
  private readonly buckets = new Map<number, Bucket>();
  private restartAt = -1;
  private fixedClasses = false;
  private readonly given: number[] = [];
  private readonly trace = emptyTrace();

  readonly policy: ServerConsolePolicy;
  /**
   * Whose commands and cvars this console serves (server-commands.ts `games`). TF2's by default;
   * another multiplayer game on the engine subclasses it (lib/csgo-game/console.ts) and adds its own
   * through `runGame` / `applyGame`.
   */
  readonly game: ConsoleGame;

  constructor(
    protected readonly host: ConsoleMatchHost,
    policy: ServerConsolePolicy = { kind: 'dedicated' },
    game: ConsoleGame = 'tf2',
  ) {
    this.policy = { ...policy };
    this.game = game;
    for (const c of SERVER_CVARS) if (c.games.includes(game)) this.values.set(c.name, serverCvarDefault(c, game));
    // The match's own settings are the starting values.
    const o = host.options;
    if (game === 'tf2') {
      this.values.set('tf_bot_quota', String(o.botCount));
      this.values.set('tf_bot_difficulty', String(Math.max(0, DIFFICULTY_WORDS.indexOf(o.botDifficulty))));
      this.values.set('mp_winlimit', String(host.world.rules.options.winLimit));
    }
    if (this.values.has('mp_friendlyfire')) this.values.set('mp_friendlyfire', host.world.options.friendlyFire ? '1' : '0');
    if (this.values.has('mp_timelimit')) this.values.set('mp_timelimit', String(host.world.rules.options.timeLimit));
  }

  /** The movement parameters players use at the default sv_gravity (undefined: TF2's, the movement default). */
  protected baseMoveParams(): Readonly<MoveParams> | undefined {
    return undefined;
  }

  /** A game's own server command (a subclass's); true when handled. Runs before the shared ones. */
  protected runGame(_hubId: number, _p: Player, _name: string, _args: ReadonlyArray<string | number>): boolean {
    return false;
  }

  /** Applies a game's own cvar (a subclass's); true when handled. */
  protected applyGame(_name: string, _value: string): boolean {
    return false;
  }

  get cheats(): boolean {
    return this.values.get('sv_cheats') === '1';
  }

  /** What a checkpoint carries (host migration): every cvar's value and the pending restart. */
  exportState(): ServerConsoleState {
    return { values: [...this.values], restartAt: this.restartAt, fixedClasses: this.fixedClasses, given: [...this.given] };
  }

  /** Puts a checkpoint's state back (cvars the host applies itself — gravity, the clock — follow next tick). */
  importState(s: ServerConsoleState): void {
    for (const [k, v] of s.values) if (this.values.has(k)) this.values.set(k, v);
    this.restartAt = s.restartAt;
    this.fixedClasses = s.fixedClasses;
    this.given.length = 0;
    this.given.push(...s.given);
    const ts = Number(this.values.get('host_timescale') ?? 1);
    if (ts !== 1) this.host.setTimescale?.(ts);
  }

  value(name: string): string | null {
    return this.values.get(name) ?? null;
  }

  isHost(hubId: number): boolean {
    return this.policy.ownerId !== undefined && hubId === this.policy.ownerId;
  }

  /** A new admin: a dedicated room's owner changed (the hub says so), or a migrated listen server's host. */
  setOwner(hubId: number | null): void {
    if (hubId === null) delete this.policy.ownerId;
    else this.policy.ownerId = hubId;
  }

  /** A line in everyone's console (`Changing level…`, a failed load). */
  broadcast(text: string, level: Level = 'info'): void {
    this.print(null, text, level);
  }

  // ─── Output ──────────────────────────────────────────────────────────────

  protected print(p: Player | null, text: string, level: Level = 'info', extra?: { setang?: Vec3 }): void {
    this.host.world.events.push({ type: 'console', ...(p ? { to: p.id } : {}), text: text.slice(0, 500), level: LEVEL[level], ...(extra ?? {}) });
  }

  private replicate(name: string, value: string, to: Player | null = null): void {
    this.host.world.events.push({ type: 'cvar', ...(to ? { to: to.id } : {}), name, value });
  }

  /** A player joined: their console learns the replicated values that differ from the defaults. */
  playerJoined(p: Player): void {
    for (const c of SERVER_CVARS) {
      if (!c.games.includes(this.game) || !(c.flags & FCVAR_REPLICATED)) continue;
      const v = this.values.get(c.name)!;
      if (v !== serverCvarDefault(c, this.game)) this.replicate(c.name, v, p);
    }
  }

  // ─── Per tick ────────────────────────────────────────────────────────────

  tick(): void {
    const w = this.host.world;
    // Fixed classes of bots that left (entity ids are reused). Only once tf_bot_add named a class:
    // looking the bot manager up would make one (and its nav generator) for a match without bots.
    if (this.fixedClasses) {
      const fixed = getBotManager(w).fixedClass;
      for (const id of fixed.keys()) {
        const b = w.player(id);
        if (!b || !b.isBot) fixed.delete(id);
      }
    }
    if (this.restartAt >= 0 && w.curtime >= this.restartAt) {
      this.restartAt = -1;
      this.restartGame();
    }
    // sv_gravity reaches every player's movement (bots included) and everything that falls
    // (MOVETYPE_FLYGRAVITY: pipes, stickies, syringes, dropped packs — physics.ts physicsToss).
    const base = this.baseMoveParams();
    const baseParams = base ?? TF_MOVE_PARAMS;
    const g = Number(this.values.get('sv_gravity') ?? baseParams.gravity);
    const params = g === baseParams.gravity ? base : this.gravityParams(g, baseParams);
    w.gravity = g;
    w.forEachPlayer((p) => {
      if (p.moveCtx.params !== params) p.moveCtx.params = params;
    });
  }

  private gravityCache: { g: number; base: Readonly<MoveParams>; params: Readonly<MoveParams> } | null = null;
  private gravityParams(g: number, base: Readonly<MoveParams>): Readonly<MoveParams> {
    if (!this.gravityCache || this.gravityCache.g !== g || this.gravityCache.base !== base) {
      this.gravityCache = { g, base, params: Object.freeze({ ...base, gravity: g }) };
    }
    return this.gravityCache.params;
  }

  private rateOk(hubId: number): boolean {
    const now = this.host.world.curtime;
    const b = this.buckets.get(hubId) ?? { tokens: RATE_BURST, at: now };
    b.tokens = Math.min(RATE_BURST, b.tokens + (now - b.at) * RATE_PER_SECOND);
    b.at = now;
    this.buckets.set(hubId, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  // ─── Dispatch ────────────────────────────────────────────────────────────

  /**
   * Runs a console command from a human. False when `name` is not a console
   * command (the host then tries the game's own extra commands: build, taunt…).
   */
  handle(hubId: number, player: Player, name: string, rawArgs: ExtraCommandArgs): boolean {
    const cmdSpec = serverCommandSpec(name, this.game);
    const cvarSpec = cmdSpec ? null : serverCvarSpec(name, this.game);
    if (!cmdSpec && !cvarSpec) return false;
    if (!this.rateOk(hubId)) return true;
    const words = argWords(rawArgs);
    if (!words) {
      this.print(player, `${name}: invalid arguments`, 'error');
      return true;
    }
    if (cvarSpec) {
      this.handleCvar(hubId, player, cvarSpec, words);
      return true;
    }
    const spec = cmdSpec!;
    if (spec.access === 'host' && !this.isHost(hubId)) {
      this.print(player, this.notHost(spec.name), 'error');
      return true;
    }
    if (spec.access === 'cheat' && !this.cheats) {
      this.print(player, `Can't use cheat command ${spec.name} in multiplayer, unless the server has sv_cheats set to 1.`, 'error');
      return true;
    }
    if (spec.free) {
      if (words.some((w) => w.length > 64)) {
        this.print(player, `${spec.name}: invalid arguments`, 'error');
        return true;
      }
    } else {
      const v = validateServerArgs(spec, words);
      if (!v.ok) {
        this.print(player, v.error, 'warn');
        return true;
      }
      this.run(hubId, player as ConsolePlayer, spec.name, v.args);
      return true;
    }
    this.run(hubId, player as ConsolePlayer, spec.name, words);
    return true;
  }

  private notHost(name: string): string {
    return this.policy.kind === 'dedicated'
      ? `${name}: only the server operator can do that, and dedicated servers have none`
      : `${name}: only the listen server's host can do that`;
  }

  private handleCvar(hubId: number, p: Player, spec: ServerCvarSpec, words: string[]): void {
    const cur = this.values.get(spec.name)!;
    if (words.length === 0) {
      const range = spec.min !== undefined || spec.max !== undefined ? ` min. ${spec.min ?? ''} max. ${spec.max ?? ''}` : '';
      this.print(p, `"${spec.name}" = "${cur}" ( def. "${serverCvarDefault(spec, this.game)}" )${range}\n - ${spec.help}`);
      return;
    }
    if (spec.name === 'sv_cheats' && this.policy.kind === 'dedicated') {
      this.print(p, 'sv_cheats is locked to 0 on dedicated servers.', 'error');
      return;
    }
    if (!this.isHost(hubId)) {
      this.print(p, `Can't change "${spec.name}": ${this.notHost('it').replace(/^it: /, '')}`, 'error');
      return;
    }
    if (isCheat(spec) && !this.cheats) {
      this.print(p, `Can't use cheat cvar ${spec.name} in multiplayer, unless the server has sv_cheats set to 1.`, 'error');
      return;
    }
    const v = validateCvarValue(spec, words[0]);
    if (v === null) {
      this.print(p, `${spec.name}: invalid value "${words[0]}"`, 'error');
      return;
    }
    this.setCvar(spec, v);
  }

  /** Sets a server cvar (already permitted), applies it, tells whoever must hear. */
  setCvar(spec: ServerCvarSpec, value: string): void {
    const old = this.values.get(spec.name);
    if (old === value) return;
    this.values.set(spec.name, value);
    this.apply(spec.name, value);
    if (spec.flags & FCVAR_NOTIFY) this.print(null, `Server cvar '${spec.name}' changed to ${value}`);
    if (spec.flags & FCVAR_REPLICATED) this.replicate(spec.name, value);
    if (spec.name === 'sv_cheats' && value === '0') this.revertCheats();
  }

  private apply(name: string, value: string): void {
    const h = this.host;
    const n = Number(value);
    if (this.applyGame(name, value)) return;
    switch (name) {
      case 'mp_timelimit':
        h.world.rules.options.timeLimit = n;
        break;
      case 'mp_winlimit':
        h.world.rules.options.winLimit = n;
        break;
      case 'mp_friendlyfire':
        h.world.options.friendlyFire = n !== 0;
        break;
      case 'tf_bot_quota':
        h.options.botCount = Math.min(n, h.options.maxPlayers);
        h.rebalanceBots();
        break;
      case 'tf_bot_difficulty':
        h.options.botDifficulty = (DIFFICULTY_WORDS[n] ?? 'normal') as BotDifficulty;
        break;
      case 'tf_bot_force_class':
        getBotManager(h.world).forceClass = value ? CLASS_NAMES.indexOf(value as (typeof CLASS_NAMES)[number]) : 0;
        break;
      case 'host_timescale':
        h.setTimescale?.(Math.min(10, Math.max(0.1, n || 1)));
        break;
      default:
        break;
    }
  }

  /** sv_cheats 0: everyone's cheat toggles end (the cheat cvars go back to their defaults). */
  private revertCheats(): void {
    this.host.world.forEachPlayer((pl) => {
      const p = pl as ConsolePlayer;
      if (p.move.moveType === MOVETYPE_NOCLIP) this.setNoclip(p, false);
      p.flags &= ~(FL_GODMODE | FL_NOTARGET);
      p.buddha = false;
    });
    for (const c of SERVER_CVARS) {
      if (c.games.includes(this.game) && isCheat(c)) this.setCvar(c, serverCvarDefault(c, this.game));
    }
  }

  // ─── Commands ────────────────────────────────────────────────────────────

  private run(hubId: number, p: ConsolePlayer, name: string, args: ReadonlyArray<string | number>): void {
    const w = this.host.world;
    if (this.runGame(hubId, p, name, args)) return;
    switch (name) {
      case 'kill':
      case 'explode':
        p.commitSuicide(name === 'explode');
        return;
      case 'status':
        this.status(p);
        return;
      case 'ping':
        this.print(p, 'Client ping times:');
        for (const hm of this.host.humans()) this.print(p, `${String(Math.round(hm.rttMs)).padStart(4)} ms : ${hm.player.name}`);
        return;
      case 'getpos': {
        const o = p.origin;
        const a = p.eyeAngles;
        this.print(p, `setpos ${f6(o.x)} ${f6(o.y)} ${f6(o.z)};setang ${f6(a.x)} ${f6(a.y)} ${f6(a.z)}`);
        return;
      }
      case 'mp_restartgame': {
        const secs = Number(args[0]);
        if (secs <= 0) {
          this.print(null, 'Restarting the game');
          this.restartGame();
        } else {
          this.restartAt = w.curtime + secs;
          this.print(null, `Game will restart in ${secs} ${secs === 1 ? 'second' : 'seconds'}`);
        }
        return;
      }
      case 'tf_bot_add':
        this.botAdd(p, args as string[]);
        return;
      case 'tf_bot_kick':
      case 'tf_bot_kill':
        this.botRemove(p, String(args[0]), name === 'tf_bot_kill');
        return;
      case 'noclip':
        if (!p.alive) {
          this.print(p, 'noclip: you must be alive', 'warn');
          return;
        }
        this.setNoclip(p, p.move.moveType !== MOVETYPE_NOCLIP);
        return;
      case 'god':
        // SDK CC_God_f (game/server/client.cpp): under TF_DLL, `if (!IsPVEModeActive()) if
        // (gpGlobals->deathmatch) return;` — TF2 is always deathmatch outside Mann vs. Machine (which
        // this game does not have), so god changes nothing here. Source returns silently; we say why.
        this.print(p, 'god: has no effect in TF2 multiplayer (as in TF2; buddha keeps you at 1 health instead)', 'warn');
        return;
      case 'buddha':
        p.buddha = !p.buddha;
        this.print(p, p.buddha ? 'Buddha Mode on...' : 'Buddha Mode off...');
        return;
      case 'notarget':
        p.flags ^= FL_NOTARGET;
        this.print(p, p.flags & FL_NOTARGET ? 'notarget ON' : 'notarget OFF');
        return;
      case 'impulse':
        if (Number(args[0]) === 101) {
          if (!p.alive) return;
          p.regenerate(true);
          this.print(p, 'impulse 101: health and ammo refilled', 'success');
        }
        return;
      case 'give':
        this.give(p, String(args[0]));
        return;
      case 'setpos': {
        const o = { x: Number(args[0]), y: Number(args[1]), z: args.length > 2 ? Number(args[2]) : p.origin.z };
        w.teleportEntity(p, o, null, { x: 0, y: 0, z: 0 });
        if (this.stuck(p)) this.print(p, 'setpos into world, use noclip to unstick yourself!', 'warn');
        return;
      }
      case 'setang': {
        const ang = { x: Number(args[0]), y: Number(args[1]), z: args.length > 2 ? Number(args[2]) : 0 };
        ang.x = Math.max(-89, Math.min(89, ang.x));
        copy(p.eyeAngles, ang);
        p.angles.y = ang.y;
        // SnapEyeAngles: the client owns its view, so it is told to turn.
        this.print(p, `setang ${f6(ang.x)} ${f6(ang.y)} ${f6(ang.z)}`, 'info', { setang: ang });
        return;
      }
      case 'hurtme': {
        const info = createDamageInfo();
        info.attacker = p.id;
        info.inflictor = p.id;
        info.damage = args.length ? Number(args[0]) : 10;
        info.damageType = DMG_PREVENT_PHYSICS_FORCE;
        copy(info.position, p.origin);
        if (info.damage < 0) p.takeHealth(-info.damage);
        else w.applyDamage(p, info);
        return;
      }
      case 'ent_fire':
        this.entFire(p, args);
        return;
      default:
        void hubId;
        return;
    }
  }

  protected status(p: Player): void {
    const h = this.host;
    const o = p.origin;
    const humans = h.humans();
    const bots = h.bots();
    this.print(p, `hostname: ${h.options.name}`);
    this.print(p, this.game === 'tf2' ? `version : RMH TF2 (Source SDK 2013 rules)` : `version : RMH ${this.game.toUpperCase()} (browser Source engine)`);
    this.print(p, `map     : ${h.options.map} at: ${Math.round(o.x)} x, ${Math.round(o.y)} y, ${Math.round(o.z)} z`);
    this.print(p, `server  : ${this.policy.kind === 'listen' ? 'listen (your browser)' : 'dedicated (games hub)'}, sv_cheats ${this.values.get('sv_cheats')}`);
    this.print(p, `players : ${humans.length} humans, ${bots.length} bots (${h.options.maxPlayers} max)`);
    this.print(p, `# userid name                             ping state`);
    const rows: string[] = [];
    for (const hm of humans) rows.push(`# ${String(hm.player.id).padStart(6)} ${`"${hm.player.name}"`.padEnd(32)} ${String(Math.round(hm.rttMs)).padStart(4)} ${hm.player.alive ? 'active' : 'dead'}`);
    for (const b of bots) rows.push(`# ${String(b.id).padStart(6)} ${`"${b.name}"`.padEnd(32)} BOT  ${b.alive ? 'active' : 'dead'}`);
    for (const r of rows) this.print(p, r);
  }

  /** mp_restartgame: scores and the map clock reset, a full-map-reset preround begins. */
  protected restartGame(): void {
    const rules = this.host.world.rules;
    rules.resetGame();
    rules.transition(GR_STATE_PREROUND);
  }

  // ─── Bots ────────────────────────────────────────────────────────────────

  private botAdd(p: Player, words: string[]): void {
    const h = this.host;
    const req = parseBotAdd(words, h.options.maxPlayers);
    if ('error' in req) {
      this.print(p, req.error, 'warn');
      return;
    }
    const room = h.options.maxPlayers - h.humans().length - h.bots().length;
    const count = Math.min(req.count, Math.max(0, room));
    if (count <= 0) {
      this.print(p, `tf_bot_add: the server is full (${h.options.maxPlayers} players)`, 'warn');
      return;
    }
    // Quota-managed bots raise tf_bot_quota (fill mode keeps them when humans come and go).
    if (req.quota) h.options.botCount = Math.min(h.options.maxPlayers, h.bots().length + count);
    const difficulty = req.difficulty ?? h.options.botDifficulty;
    const added = h.addBots(count, difficulty, { team: req.team, cls: (req.cls ?? undefined) as ClassChoice | undefined, name: req.name ?? undefined });
    const mgr = getBotManager(h.world);
    // A bot added as a class keeps it (the TFBot roster would pick again at each death).
    if (req.cls) {
      this.fixedClasses = true;
      for (const b of added) mgr.fixedClass.set(b.id, CLASS_NAMES.indexOf(req.cls as (typeof CLASS_NAMES)[number]));
    }
    if (req.quota) this.values.set('tf_bot_quota', String(h.options.botCount));
    this.print(p, `Added ${added.length} bot${added.length === 1 ? '' : 's'}${req.cls ? ` (${req.cls})` : ''}`, 'success');
  }

  private botRemove(p: Player, who: string, killOnly: boolean): void {
    const h = this.host;
    const all = who.toLowerCase() === 'all';
    const targets = h.bots().filter((b) => all || b.name.toLowerCase() === who.toLowerCase() || CLASS_NAMES[b.playerClass] === who.toLowerCase() || teamWord(b.team) === who.toLowerCase());
    if (!targets.length) {
      this.print(p, `${killOnly ? 'tf_bot_kill' : 'tf_bot_kick'}: no bot matches "${who}"`, 'warn');
      return;
    }
    for (const b of targets) {
      if (killOnly) b.commitSuicide();
      else h.removeBot(b.id);
    }
    if (!killOnly) {
      h.options.botCount = Math.max(0, h.options.botCount - targets.length);
      this.values.set('tf_bot_quota', String(h.options.botCount));
    }
    this.print(p, `${killOnly ? 'Killed' : 'Kicked'} ${targets.length} bot${targets.length === 1 ? '' : 's'}`, 'success');
  }

  // ─── Cheats ──────────────────────────────────────────────────────────────

  private setNoclip(p: Player, on: boolean): void {
    if (on) {
      p.move.moveType = MOVETYPE_NOCLIP;
      p.moveType = MOVETYPE_NOCLIP;
      this.print(p, 'noclip ON');
      return;
    }
    p.move.moveType = MOVETYPE_WALK;
    p.moveType = MOVETYPE_WALK;
    this.print(p, 'noclip OFF');
    if (this.stuck(p) && !this.unstick(p)) this.print(p, "Can't find the world", 'warn');
  }

  private stuck(p: Player): boolean {
    const tr = this.trace;
    this.host.world.mapCollision.traceHull(p.origin, p.origin, p.mins, p.maxs, MASK_PLAYERSOLID, null, tr);
    return tr.startSolid || tr.allSolid;
  }

  /** FindPassableSpace: step out along forward, right, left, up, down, back. */
  private unstick(p: Player): boolean {
    const yaw = (p.eyeAngles.y * Math.PI) / 180;
    const fwd = { x: Math.cos(yaw), y: Math.sin(yaw), z: 0 };
    const right = { x: Math.sin(yaw), y: -Math.cos(yaw), z: 0 };
    const dirs: Vec3[] = [fwd, right, { x: -right.x, y: -right.y, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, { x: -fwd.x, y: -fwd.y, z: 0 }];
    const start = { ...p.origin };
    for (const d of dirs) {
      for (let dist = 4; dist <= 128; dist += 4) {
        p.origin.x = start.x + d.x * dist;
        p.origin.y = start.y + d.y * dist;
        p.origin.z = start.z + d.z * dist;
        if (!this.stuck(p)) {
          this.host.world.teleportEntity(p, { ...p.origin }, null, null);
          return true;
        }
      }
    }
    copy(p.origin, start);
    return false;
  }

  private give(p: Player, item: string): void {
    const w = this.host.world;
    if (!p.alive) return;
    if (TF2_GIVE_PICKUPS.includes(item)) {
      const e = w.spawnEntity(item, (ent) => {
        copy(ent.origin, p.origin);
        ent.origin.z += 8;
      });
      this.given.push(e.id);
      while (this.given.length > GIVE_MAX_ENTITIES) {
        const old = w.entity(this.given.shift()!);
        if (old && !old.removed) w.remove(old);
      }
      return;
    }
    // A stock weapon of the player's class, by script name or item definition index.
    const cls = CLASS_NAMES[p.playerClass] as string;
    let defindex = -1;
    for (const [id, sw] of Object.entries(STOCK_WEAPONS)) {
      const entry = sw.perClass[cls as keyof typeof sw.perClass];
      if (entry && (entry.scriptName === item || id === item)) {
        defindex = Number(id);
        break;
      }
    }
    const spec = defindex >= 0 ? weaponSpecFor(defindex, p.playerClass) : null;
    const weapon = spec ? createWeapon(spec) : null;
    if (!weapon || weapon.slot < 0 || weapon.slot >= p.weapons.length) {
      this.print(p, `give: "${item}" is not a pickup or a weapon your class (${cls || 'none'}) can use`, 'warn');
      return;
    }
    p.weapons[weapon.slot]?.onOwnerDeath();
    p.weapons[weapon.slot] = weapon;
    weapon.equip(p);
    p.switchToSlot(weapon.slot);
    this.print(p, `give: ${item}`, 'success');
  }

  private entFire(p: Player, args: ReadonlyArray<string | number>): void {
    const w = this.host.world;
    const target = String(args[0]);
    const input = args.length > 1 ? String(args[1]) : 'Use';
    const value = args.length > 2 ? String(args[2]) : '';
    const delay = args.length > 3 ? Number(args[3]) : 0;
    if (target === '!picker') {
      const eye = p.eyePosition({ x: 0, y: 0, z: 0 });
      const a = p.eyeAngles;
      const pr = (a.x * Math.PI) / 180;
      const yr = (a.y * Math.PI) / 180;
      const end = { x: eye.x + Math.cos(pr) * Math.cos(yr) * 8192, y: eye.y + Math.cos(pr) * Math.sin(yr) * 8192, z: eye.z - Math.sin(pr) * 8192 };
      const tr = w.traceLine(eye, end, MASK_SHOT, w.createEntityFilter(p, 0), this.trace);
      const e = tr.entity > 0 ? w.entity(tr.entity) : null;
      if (!e) {
        this.print(p, 'ent_fire: nothing under the crosshair', 'warn');
        return;
      }
      w.io.addEventTo(e, input, value, delay, p, p);
    } else {
      // The event queue resolves names (with !self / !player and `*`), then classnames, when it fires.
      const found = w.io.findByName(target, p, p, p, []);
      if (!found.length && !w.io.findByClassname(target, []).length) {
        this.print(p, `ent_fire: no entity named "${target}"`, 'warn');
        return;
      }
      w.io.addEvent(target, input, value, delay, p, p);
    }
    this.print(p, `ent_fire ${target} ${input}${value ? ` ${value}` : ''}`, 'success');
  }
}

function f6(v: number): string {
  return v.toFixed(6);
}

function teamWord(team: number): string {
  return team === TF_TEAM_RED ? 'red' : team === TF_TEAM_BLUE ? 'blue' : team === TEAM_SPECTATOR ? 'spectator' : 'none';
}

/** Ticks → seconds, for messages. */
export const ticksToSeconds = (t: number): number => t * TICK_INTERVAL;

export { CLASS_WORDS };
