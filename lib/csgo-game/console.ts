/**
 * CS:GO's half of the developer console, on the shared server console (lib/tf2-game/console/
 * tf2-server.ts: permissions, rate limits, validation, replicated cvars, the cheats — noclip, setpos,
 * ent_fire …). The commands and cvars are declared in the shared table (console/server-commands.ts,
 * games ['csgo']); this subclass runs the CS ones:
 *
 *   - cvars: mp_roundtime, mp_freezetime, mp_buytime, mp_maxrounds, mp_startmoney, mp_maxmoney,
 *     mp_c4timer, mp_round_restart_delay, mp_buy_anywhere, mp_teammates_are_enemies,
 *     mp_respawn_immunitytime, bot_quota, bot_difficulty (and the shared mp_friendlyfire, mp_timelimit
 *     — deathmatch's match length —, sv_gravity, sv_cheats, host_timescale);
 *   - commands: buy, drop, bot_add / bot_add_t / bot_add_ct, bot_kick, bot_kill, and CS's cheats —
 *     god (CS:GO honours it), give <weapon>, impulse 101 (CS's "give all": full money, armor and ammo).
 */

import { FL_GODMODE } from '../tf2-game/core/constants';
import {
  Tf2ServerConsole,
  type ConsoleMatchHost,
  type ServerConsolePolicy,
} from '../tf2-game/console/tf2-server';
import { serverCvarSpec } from '../tf2-game/console/server-commands';
import type { MoveParams } from '../tf2-game/sim/movement-types';
import type { Player } from '../tf2-game/sim/player';
import type { BotDifficulty, TeamChoice } from '../tf2-game/net/events';
import { BOT_DIFFICULTIES } from '../tf2-game/net/events';
import { CS_MAX_ARMOR, CS_TEAM_CT, CS_TEAM_T } from './constants';
import { csWeapon } from './data/weapon-data';
import { CS_MOVE_PARAMS } from './movement';
import type { CsPlayer } from './player';
import type { CsWeapon } from './weapons/base';
import { CsGrenadePouch } from './weapons/grenades';
import type { CsWorld } from './world';

export class CsServerConsole extends Tf2ServerConsole {
  constructor(host: ConsoleMatchHost, policy?: ServerConsolePolicy) {
    super(host, policy, 'csgo');
    const w = host.world as CsWorld;
    const s = w.csRules.settings;
    const o = host.options;
    const set = (name: string, v: string | number | boolean) => {
      if (this.values.has(name))
        this.values.set(name, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
    };
    set('mp_roundtime', s.roundTime);
    set('mp_freezetime', s.freezeTime);
    set('mp_buytime', s.buyTime);
    set('mp_maxrounds', s.maxRounds);
    set('mp_startmoney', s.startMoney);
    set('mp_maxmoney', s.maxMoney);
    set('mp_c4timer', s.c4Timer);
    set('mp_round_restart_delay', s.roundRestartDelay);
    set('mp_buy_anywhere', s.buyAnywhere);
    set('mp_teammates_are_enemies', s.teammatesAreEnemies);
    set('mp_respawn_immunitytime', s.respawnImmunity);
    set('mp_timelimit', w.csMode === 'dm' ? s.dmTimeLimit : 0);
    set('bot_quota', o.botCount);
    set('bot_difficulty', Math.max(0, BOT_DIFFICULTIES.indexOf(o.botDifficulty)));
  }

  private get cs(): CsWorld {
    return this.host.world as CsWorld;
  }

  protected override baseMoveParams(): Readonly<MoveParams> {
    return CS_MOVE_PARAMS;
  }

  protected override applyGame(name: string, value: string): boolean {
    const rules = this.cs.csRules;
    const s = rules.settings;
    const n = Number(value);
    switch (name) {
      case 'mp_roundtime':
        s.roundTime = n;
        break;
      case 'mp_freezetime':
        s.freezeTime = n;
        break;
      case 'mp_buytime':
        s.buyTime = n;
        break;
      case 'mp_maxrounds':
        s.maxRounds = n;
        break;
      case 'mp_startmoney':
        s.startMoney = n;
        break;
      case 'mp_maxmoney':
        s.maxMoney = n;
        break;
      case 'mp_c4timer':
        s.c4Timer = n;
        break;
      case 'mp_round_restart_delay':
        s.roundRestartDelay = n;
        break;
      case 'mp_buy_anywhere':
        s.buyAnywhere = n !== 0;
        break;
      case 'mp_teammates_are_enemies':
        s.teammatesAreEnemies = n !== 0;
        break;
      case 'mp_respawn_immunitytime':
        s.respawnImmunity = n;
        break;
      case 'mp_timelimit':
        // Deathmatch's match length (bomb defusal plays rounds, not a clock).
        s.dmTimeLimit = n;
        if (rules.csMode === 'dm' && n > 0) rules.matchEndsAt = rules.roundStartTime + n * 60;
        break;
      case 'bot_quota':
        this.host.options.botCount = Math.min(n, this.host.options.maxPlayers);
        this.host.rebalanceBots();
        break;
      case 'bot_difficulty':
        this.host.options.botDifficulty = (BOT_DIFFICULTIES[n] ?? 'normal') as BotDifficulty;
        break;
      default:
        return false;
    }
    rules.applySettings();
    return true;
  }

  protected override runGame(
    _hubId: number,
    player: Player,
    name: string,
    args: ReadonlyArray<string | number>,
  ): boolean {
    const p = player as CsPlayer;
    switch (name) {
      case 'buy': {
        const why = p.buy(String(args[0]));
        if (why) this.print(p, `buy ${args[0]}: ${why}`, 'warn');
        return true;
      }
      case 'drop':
        if (!p.alive || !p.dropActive()) this.print(p, 'drop: nothing to drop', 'warn');
        return true;
      case 'bot_add':
      case 'bot_add_t':
      case 'bot_add_ct': {
        const team: TeamChoice =
          name === 'bot_add_t'
            ? 'red'
            : name === 'bot_add_ct'
              ? 'blue'
              : args[0] === 't'
                ? 'red'
                : args[0] === 'ct'
                  ? 'blue'
                  : 'auto';
        const diffWord = name === 'bot_add' ? args[1] : args[0];
        const difficulty = (BOT_DIFFICULTIES as readonly string[]).includes(String(diffWord))
          ? (diffWord as BotDifficulty)
          : this.host.options.botDifficulty;
        if (this.host.humans().length + this.host.bots().length >= this.host.options.maxPlayers) {
          this.print(p, `${name}: the server is full`, 'warn');
          return true;
        }
        this.host.options.botCount = Math.min(
          this.host.options.maxPlayers,
          this.host.bots().length + 1,
        );
        const added = this.host.addBots(1, difficulty, { team });
        this.values.set('bot_quota', String(this.host.options.botCount));
        this.print(p, `Added ${added.length} bot`, 'success');
        return true;
      }
      case 'bot_kick':
      case 'bot_kill': {
        const who = String(args[0] ?? 'all').toLowerCase();
        const targets = this.host
          .bots()
          .filter(
            (b) =>
              who === 'all' ||
              b.name.toLowerCase() === who ||
              (who === 't' && b.team === CS_TEAM_T) ||
              (who === 'ct' && b.team === CS_TEAM_CT),
          );
        for (const b of targets) {
          if (name === 'bot_kill') b.commitSuicide();
          else this.host.removeBot(b.id);
        }
        if (name === 'bot_kick') {
          this.host.options.botCount = Math.max(0, this.host.bots().length);
          this.values.set('bot_quota', String(this.host.options.botCount));
        }
        this.print(
          p,
          `${name === 'bot_kill' ? 'Killed' : 'Kicked'} ${targets.length} bot${targets.length === 1 ? '' : 's'}`,
          'success',
        );
        return true;
      }
      case 'god':
        p.flags ^= FL_GODMODE;
        this.print(p, p.flags & FL_GODMODE ? 'godmode ON' : 'godmode OFF');
        return true;
      case 'impulse':
        if (Number(args[0]) === 101 && p.alive) {
          // CS's "give all": the money, armor, a kit for a CT, and every weapon full.
          p.money = this.cs.csRules.settings.maxMoney;
          p.armor = CS_MAX_ARMOR;
          p.helmet = true;
          if (p.team === CS_TEAM_CT) p.defuser = true;
          for (const w of p.weapons)
            if (w && !(w instanceof CsGrenadePouch)) (w as CsWeapon).fill();
          this.print(p, 'impulse 101: money, armor and ammo', 'success');
        }
        return true;
      case 'give': {
        if (!p.alive) return true;
        const item = String(args[0]);
        const info = csWeapon(item);
        if (!info) {
          this.print(p, `give: "${item}" is not a CS:GO weapon`, 'warn');
          return true;
        }
        if (info.category !== 'grenade') {
          const old = p.weapons[info.slot] as CsWeapon | null;
          if (old) p.dropWeapon(old);
        }
        const w = p.giveNamedWeapon(info.name);
        if (w) p.switchToSlot(w.slot);
        this.print(
          p,
          w ? `give: ${info.name}` : `give: cannot carry ${info.name}`,
          w ? 'success' : 'warn',
        );
        return true;
      }
      default:
        return false;
    }
  }

  /** Whether a name is one of this console's (server-commands.ts table, CS). */
  static isCsCvar(name: string): boolean {
    return serverCvarSpec(name, 'csgo') !== null;
  }
}
