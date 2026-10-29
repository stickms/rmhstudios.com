/**
 * Half-Life 2 / Portal's server half of the developer console: the single
 * player is always the host, so `sv_cheats` is theirs to set, and the
 * commands run straight on the `SpWorld` (lib/sp-game). The same command
 * table and validator as TF2's server (./server-commands.ts) check every
 * argument; replies and replicated cvars go back through `hooks`.
 *
 * What it changes on the world: the player's move type (noclip), damage
 * (god: DAMAGE_NO; buddha: SpPlayer.buddha), FL_NOTARGET, the suit / portal
 * gun / health / armor (impulse 101, give), position and eye angles
 * (setpos / setang), entity inputs (ent_fire), the checkpoint (save / load)
 * and, through the client, the level (changelevel / map, published maps
 * only) and the clock (host_timescale). Toggles survive a level change (they
 * are re-applied to the new world's player by `bind`).
 *
 * Environment-agnostic.
 */

import { FL_NOTARGET, MASK_SHOT, MOVETYPE_NOCLIP, MOVETYPE_WALK } from '../core/constants';
import { angleVectors, copy, vec3, type Vec3 } from '../core/vec';
import { emptyTrace } from '../core/types';
import { DAMAGE_NO, DAMAGE_YES } from '../sim/entity';
import type { SpWorld } from '../../sp-game/world/sp-world';
import type { SpPlayer } from '../../sp-game/player/sp-player';
import type { ExtraCommandArgs } from '../net/extra-commands';
import {
  argWords,
  serverCommandSpec,
  serverCvarDefault,
  serverCvarSpec,
  SERVER_CVARS,
  SP_GIVE_ITEMS,
  validateCvarValue,
  validateServerArgs,
  isCheat,
} from './server-commands';

export interface SpConsoleHooks {
  print(text: string, level: 'info' | 'warn' | 'error' | 'success'): void;
  /** A replicated cvar's value for the client console. */
  cvar(name: string, value: string): void;
  /** Loads a level (the client checks it is published). False when it cannot. */
  changeLevel(map: string): boolean;
  /** The published maps (completion and the check). */
  maps(): readonly string[];
  /** The client snaps its view (setang). */
  setViewAngles?(angles: Vec3): void;
}

type ConsolePlayer = SpPlayer & { buddha?: boolean };
type PortalSvc = SpWorld['portals'];

export class SpServerConsole {
  private readonly values = new Map<string, string>();
  private world: SpWorld | null = null;
  private god = false;
  private buddha = false;
  private noclip = false;
  private notarget = false;
  private readonly trace = emptyTrace();

  constructor(
    readonly game: 'hl2' | 'portal',
    private readonly hooks: SpConsoleHooks,
  ) {
    for (const c of SERVER_CVARS) if (c.games.includes(game)) this.values.set(c.name, serverCvarDefault(c, game));
  }

  get cheats(): boolean {
    return this.values.get('sv_cheats') === '1';
  }

  /** host_timescale (1 normally). */
  get timescale(): number {
    const v = Number(this.values.get('host_timescale') ?? 1);
    return Number.isFinite(v) && v > 0 ? v : 1;
  }

  value(name: string): string | null {
    return this.values.get(name) ?? null;
  }

  /** A new world (level load, transition): the toggles carry over; the console learns the cvars. */
  bind(world: SpWorld | null): void {
    this.world = world;
    if (!world) return;
    const p = world.player as ConsolePlayer;
    if (this.god) p.takeDamage = DAMAGE_NO;
    if (this.buddha) p.buddha = true;
    if (this.noclip) p.move.moveType = MOVETYPE_NOCLIP;
    if (this.notarget) p.flags |= FL_NOTARGET;
    this.applyPortalCheat();
  }

  /** Every replicated value, for a console that just attached. */
  replicateAll(): void {
    for (const [name, v] of this.values) this.hooks.cvar(name, v);
  }

  /** Runs one console command. False when `name` is not a server command of this game. */
  execute(name: string, rawArgs: ExtraCommandArgs): boolean {
    const spec = serverCommandSpec(name, this.game);
    const cvar = spec ? null : serverCvarSpec(name, this.game);
    if (!spec && !cvar) return false;
    const words = argWords(rawArgs);
    if (!words) {
      this.hooks.print(`${name}: invalid arguments`, 'error');
      return true;
    }
    if (cvar) {
      const cur = this.values.get(cvar.name)!;
      if (!words.length) {
        this.hooks.print(`"${cvar.name}" = "${cur}" ( def. "${serverCvarDefault(cvar, this.game)}" )\n - ${cvar.help}`, 'info');
        return true;
      }
      if (isCheat(cvar) && !this.cheats) {
        this.hooks.print(`Can't use cheat cvar ${cvar.name} in multiplayer, unless the server has sv_cheats set to 1.`, 'error');
        return true;
      }
      const v = validateCvarValue(cvar, words[0]);
      if (v === null) {
        this.hooks.print(`${cvar.name}: invalid value "${words[0]}"`, 'error');
        return true;
      }
      this.set(cvar.name, v);
      return true;
    }
    if (spec!.access === 'cheat' && !this.cheats) {
      this.hooks.print(`Can't use cheat command ${spec!.name} in multiplayer, unless the server has sv_cheats set to 1.`, 'error');
      return true;
    }
    const r = validateServerArgs(spec!, words);
    if (!r.ok) {
      this.hooks.print(r.error, 'warn');
      return true;
    }
    this.run(spec!.name, r.args);
    return true;
  }

  private set(name: string, value: string): void {
    if (this.values.get(name) === value) return;
    this.values.set(name, value);
    this.hooks.cvar(name, value);
    if (name === 'sv_cheats') this.hooks.print(`Server cvar 'sv_cheats' changed to ${value}`, 'info');
    if (name === 'sv_cheats' && value === '0') {
      // The cheat toggles end and the cheat cvars go back to their defaults.
      this.god = this.buddha = this.notarget = false;
      if (this.noclip) this.setNoclip(false);
      const p = this.world?.player as ConsolePlayer | undefined;
      if (p) {
        p.takeDamage = DAMAGE_YES;
        p.buddha = false;
        p.flags &= ~FL_NOTARGET;
      }
      for (const c of SERVER_CVARS) if (c.games.includes(this.game) && isCheat(c)) this.set(c.name, serverCvarDefault(c, this.game));
    }
    if (name === 'sv_portal_placement_never_fail') this.applyPortalCheat();
  }

  /** sv_portal_placement_never_fail: the portal service accepts every surface (an instance override, undone at 0). */
  private applyPortalCheat(): void {
    const svc = this.world?.portals as PortalSvc | undefined;
    if (!svc || this.game !== 'portal') return;
    if (this.values.get('sv_portal_placement_never_fail') === '1') {
      svc.surfacePortalable = () => true;
      svc.inNoPortalVolume = () => false;
    } else {
      // Back to the prototype's methods.
      const own = svc as unknown as Record<string, unknown>;
      delete own.surfacePortalable;
      delete own.inNoPortalVolume;
    }
  }

  private setNoclip(on: boolean): void {
    this.noclip = on;
    const p = this.world?.player;
    if (!p) return;
    p.move.moveType = on ? MOVETYPE_NOCLIP : MOVETYPE_WALK;
    this.hooks.print(on ? 'noclip ON' : 'noclip OFF', 'info');
  }

  private run(name: string, args: ReadonlyArray<string | number>): void {
    const w = this.world;
    const p = w?.player as ConsolePlayer | undefined;
    if (name === 'changelevel' || name === 'map') {
      const map = String(args[0]);
      if (!this.hooks.maps().includes(map)) {
        this.hooks.print(`${name}: ${map} is not a published map (${this.hooks.maps().join(', ')})`, 'warn');
        return;
      }
      if (!this.hooks.changeLevel(map)) this.hooks.print(`${name}: could not load ${map}`, 'error');
      return;
    }
    if (!w || !p) {
      this.hooks.print(`${name}: no level is running`, 'warn');
      return;
    }
    switch (name) {
      case 'kill':
      case 'explode':
        if (!p.dead) {
          p.health = 0;
          p.die();
        }
        return;
      case 'status':
        this.hooks.print(`map     : ${w.mapName} at: ${Math.round(p.origin.x)} x, ${Math.round(p.origin.y)} y, ${Math.round(p.origin.z)} z`, 'info');
        this.hooks.print(`server  : single-player (${this.game === 'hl2' ? 'Half-Life 2' : 'Portal'}), sv_cheats ${this.values.get('sv_cheats')}`, 'info');
        this.hooks.print(`players : 1 (time ${w.curtime.toFixed(1)} s)`, 'info');
        return;
      case 'getpos': {
        const o = p.origin;
        const a = p.eyeAngles;
        this.hooks.print(`setpos ${o.x.toFixed(6)} ${o.y.toFixed(6)} ${o.z.toFixed(6)};setang ${a.x.toFixed(6)} ${a.y.toFixed(6)} ${a.z.toFixed(6)}`, 'info');
        return;
      }
      case 'save':
        w.saveCheckpoint();
        this.hooks.print('Saved the checkpoint.', 'success');
        return;
      case 'load':
        if (!w.checkpoint) {
          this.hooks.print('load: no checkpoint yet', 'warn');
          return;
        }
        w.reloadAfterDeath();
        this.bind(w);
        this.hooks.print('Loaded the checkpoint.', 'success');
        return;
      case 'noclip':
        this.setNoclip(p.move.moveType !== MOVETYPE_NOCLIP);
        return;
      case 'god':
        this.god = p.takeDamage !== DAMAGE_NO;
        p.takeDamage = this.god ? DAMAGE_NO : DAMAGE_YES;
        this.hooks.print(this.god ? 'godmode ON' : 'godmode OFF', 'info');
        return;
      case 'buddha':
        this.buddha = !p.buddha;
        p.buddha = this.buddha;
        this.hooks.print(this.buddha ? 'Buddha Mode on...' : 'Buddha Mode off...', 'info');
        return;
      case 'notarget':
        p.flags ^= FL_NOTARGET;
        this.notarget = (p.flags & FL_NOTARGET) !== 0;
        this.hooks.print(this.notarget ? 'notarget ON' : 'notarget OFF', 'info');
        return;
      case 'impulse':
        if (Number(args[0]) === 101) {
          // CHL2_Player::CheatImpulseCommands 101: the suit, full health and armor, every weapon the game has.
          if (this.game === 'hl2') {
            p.hasSuit = true;
            p.armor = 100;
          } else p.portalgun = { canFire1: true, canFire2: true, nextFire: 0 };
          p.health = Math.max(p.health, p.maxHealth);
          this.hooks.print(this.game === 'hl2' ? 'impulse 101: suit, health and armor (the demo has no weapons)' : 'impulse 101: the dual portal gun and full health', 'success');
        }
        return;
      case 'give':
        this.give(p, String(args[0]));
        return;
      case 'setpos': {
        const o = { x: Number(args[0]), y: Number(args[1]), z: args.length > 2 ? Number(args[2]) : p.origin.z };
        p.placeAt(o, null, null);
        return;
      }
      case 'setang': {
        const a = { x: Math.max(-89, Math.min(89, Number(args[0]))), y: Number(args[1]), z: args.length > 2 ? Number(args[2]) : 0 };
        p.placeAt(p.origin, a, p.velocity);
        this.hooks.setViewAngles?.(a);
        return;
      }
      case 'hurtme': {
        const n = args.length ? Number(args[0]) : 10;
        if (n < 0) p.health = Math.min(p.maxHealth, p.health - n);
        else w.damage(p, n, 0, p, p);
        return;
      }
      case 'ent_fire':
        this.entFire(w, p, args);
        return;
      case 'portal_place':
        this.portalPlace(w, p, args);
        return;
      default:
        return;
    }
  }

  private give(p: ConsolePlayer, item: string): void {
    if (!SP_GIVE_ITEMS[this.game].includes(item)) {
      this.hooks.print(`give: unknown item "${item}" (${SP_GIVE_ITEMS[this.game].join(', ')})`, 'warn');
      return;
    }
    switch (item) {
      case 'item_suit':
        p.hasSuit = true;
        break;
      case 'item_battery':
        p.armor = Math.min(100, p.armor + 15);
        break;
      case 'item_healthkit':
        p.health = Math.min(p.maxHealth, p.health + 25);
        break;
      case 'item_healthvial':
        p.health = Math.min(p.maxHealth, p.health + 10);
        break;
      case 'weapon_portalgun':
        p.portalgun = { canFire1: true, canFire2: true, nextFire: 0 };
        break;
    }
    this.hooks.print(`give: ${item}`, 'success');
  }

  private entFire(w: SpWorld, p: SpPlayer, args: ReadonlyArray<string | number>): void {
    const target = String(args[0]);
    const input = args.length > 1 ? String(args[1]) : 'Use';
    const value = args.length > 2 ? String(args[2]) : '';
    const delay = args.length > 3 ? Number(args[3]) : 0;
    if (target === '!picker') {
      const eye = p.eyePosition(vec3());
      const fwd = vec3();
      angleVectors(p.eyeAngles, fwd);
      const end = { x: eye.x + fwd.x * 8192, y: eye.y + fwd.y * 8192, z: eye.z + fwd.z * 8192 };
      const tr = w.traceLine(eye, end, MASK_SHOT, (id) => id !== p.id, this.trace);
      const e = tr.entity > 0 ? w.entity(tr.entity) : null;
      if (!e || !e.targetname) {
        this.hooks.print('ent_fire: nothing named under the crosshair', 'warn');
        return;
      }
      w.fireInput(e.targetname, input, value, delay, p, p);
    } else {
      if (!target.startsWith('!') && !w.findByName(target, null, p, p) && !w.findAllByClassname(target).length) {
        this.hooks.print(`ent_fire: no entity named "${target}"`, 'warn');
        return;
      }
      w.fireInput(target, input, value, delay, p, p);
    }
    this.hooks.print(`ent_fire ${target} ${input}${value ? ` ${value}` : ''}`, 'success');
  }

  /** portal_place <0|1> [x y z pitch yaw roll]: a gun portal where you look, or exactly there. */
  private portalPlace(w: SpWorld, p: SpPlayer, args: ReadonlyArray<string | number>): void {
    const which = Number(args[0]) === 1 ? 1 : 0;
    if (args.length === 1) {
      const placed = w.portals.firePortal(p, which);
      this.hooks.print(placed ? `portal_place: ${which ? 'orange' : 'blue'} portal placed` : 'portal_place: that surface refuses portals', placed ? 'success' : 'warn');
      return;
    }
    if (args.length < 7) {
      this.hooks.print('Usage:  portal_place <0|1> [x y z pitch yaw roll]', 'warn');
      return;
    }
    const origin = { x: Number(args[1]), y: Number(args[2]), z: Number(args[3]) };
    const angles = { x: Number(args[4]), y: Number(args[5]), z: Number(args[6]) };
    let portal = w.portals.portals.find((q) => q.fromGun && q.which === which && q.linkage === 0 && !q.removed) ?? null;
    if (!portal) {
      portal = w.spawnEntity('prop_portal', (ent) => {
        const pe = ent as unknown as { which: 0 | 1; linkage: number; fromGun: boolean };
        pe.which = which;
        pe.linkage = 0;
        pe.fromGun = true;
      }) as unknown as NonNullable<typeof portal>;
    }
    const placeable = portal as unknown as { place?: (o: Vec3, a: Vec3) => void; origin: Vec3; angles: Vec3 };
    if (typeof placeable.place === 'function') placeable.place(origin, angles);
    else {
      copy(placeable.origin, origin);
      copy(placeable.angles, angles);
    }
    w.portals.open(portal);
    this.hooks.print(`portal_place: ${which ? 'orange' : 'blue'} portal at ${origin.x} ${origin.y} ${origin.z}`, 'success');
  }
}
