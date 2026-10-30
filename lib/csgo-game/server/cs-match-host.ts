/**
 * `CsMatchHost`: a CS:GO match behind the shared `MatchHost` seam. It IS the TF2 host
 * (lib/tf2-game/server/tf2-match-host.ts) — the same command budgets, snapshots, reliable stream,
 * roster, bots-fill-seats, level change, checkpoints for host migration and console plumbing — with the
 * game hooks pointed at CS: a CsWorld (bomb defusal or deathmatch), CS teams with no class menu, CS
 * bots, the CS console, CS:GO's scoreboard points. So the shared MatchRunner, the browser listen
 * server, the peer-to-peer host session and migration host it unchanged.
 *
 * Importing this module registers the 'csgo' factory (server/game-registry.ts), so
 * `createTf2MatchHost({ game: 'csgo', … })` and `Tf2MatchHost.restore` reach it too.
 */

import { TEAM_SPECTATOR } from '../../tf2-game/core/constants';
import { findGameMap } from '../../tf2-game/assets/game-maps';
import { NAV_HULL_CS } from '../../tf2-game/bots/nav/generate';
import {
  configureNavGeneration,
  getBotManager,
  provideNavMesh,
} from '../../tf2-game/bots/brain/manager';
import type { BotDifficulty, ClassChoice, TeamChoice } from '../../tf2-game/net/events';
import type { MatchCommand, MatchOptions } from '../../tf2-game/server/match-host';
import { registerMatchGame, type GameMatchFactory } from '../../tf2-game/server/game-registry';
import {
  levelLoader,
  Tf2MatchHost,
  type GameObjectLoader,
  type PackagedMap,
  type Tf2MatchDeps,
  type Tf2MatchHostOptions,
} from '../../tf2-game/server/tf2-match-host';
import type {
  ConsoleMatchHost,
  ServerConsolePolicy,
  Tf2ServerConsole,
} from '../../tf2-game/console/tf2-server';
import type { LoadedMap } from '../../tf2-game/sim/map-loader';
import type { Player } from '../../tf2-game/sim/player';
import { GR_STATE_PREROUND, GR_STATE_RND_RUNNING } from '../../tf2-game/sim/rules';
import type { GameWorld } from '../../tf2-game/sim/world';
import { csBotBrainFactory } from '../bots/cs-bot-brain';
import { CsServerConsole } from '../console';
import { CS_PLAYER_CLASS, CS_TEAM_CT, CS_TEAM_T, type CsMode } from '../constants';
import { hasCsWeaponData, setCsWeaponData, type CsItemsDocument } from '../data/weapon-data';
import { registerCsGame } from '../register';
import type { CsPlayer } from '../player';
import type { CsSettings } from '../rules';
import { CsWorld } from '../world';

export interface CsMatchHostOptions extends Tf2MatchHostOptions {
  /** Overrides of the match settings (mp_* cvars). */
  settings?: Partial<CsSettings>;
}

export interface CsMatchDeps extends Tf2MatchDeps, CsMatchHostOptions {
  /** The weapon data document (the csgo-ui channel's data/<sha>.json), when not installed yet. */
  weaponData?: CsItemsDocument;
  /** Reads `csgo-game/<path>` (to load the weapon data from `ui/index.json`). */
  loader?: GameObjectLoader;
}

/** CS:GO's mode from the options (`variant` 'dm', else bomb defusal). */
export const csModeOf = (opts: Pick<MatchOptions, 'variant'>): CsMode =>
  opts.variant === 'dm' ? 'dm' : 'de';

/** CS:GO's scoreboard points: 2 a kill, 1 an assist, 2 a plant or defuse (CS:GO's scoring); deathmatch: its points. */
export function csScore(p: Player, mode: CsMode): number {
  const s = p.stats;
  if (mode === 'dm') return s.bonusPoints;
  return 2 * s.kills + s.assists + 2 * (s.captures + s.defenses);
}

export class CsMatchHost extends Tf2MatchHost {
  constructor(options: MatchOptions, opts: CsMatchHostOptions = {}) {
    registerCsGame();
    if (!hasCsWeaponData())
      throw new Error(
        'CS:GO weapon data is not loaded (setCsWeaponData, or CsMatchDeps.weaponData)',
      );
    super({ ...options, game: 'csgo' }, { ...opts, botBrain: opts.botBrain ?? csBotBrainFactory });
    configureNavGeneration(this.world, { hull: NAV_HULL_CS });
    // The bots' mesh, also for a world with no map package to cache it by (a synthetic world).
    if (opts.nav) getBotManager(this.world).setMesh(opts.nav);
  }

  get csWorld(): CsWorld {
    return this.world as CsWorld;
  }

  protected override createWorld(
    map: LoadedMap | null,
    startTick: number,
    prev: GameWorld | null,
  ): GameWorld {
    const settings = (this.opts as CsMatchHostOptions | undefined)?.settings;
    const world = new CsWorld({
      map,
      startTick,
      mode: csModeOf(this.options),
      options: {
        seed: this.options.seed >>> 0 || 1,
        isServer: true,
        lagCompensation: true,
        friendlyFire: prev ? prev.options.friendlyFire : false,
      },
      settings: prev ? { ...(prev as CsWorld).csRules.settings } : settings,
    });
    configureNavGeneration(world, { hull: NAV_HULL_CS });
    return world;
  }

  /** CsWorld installs its own mode. */
  protected override installMode(): void {}

  protected override createConsole(
    host: ConsoleMatchHost,
    policy: ServerConsolePolicy | undefined,
  ): Tf2ServerConsole {
    return new CsServerConsole(host, policy);
  }

  protected override findLevel(map: string): { name: string; mode: string } | null {
    return findGameMap('csgo', map);
  }

  /** CS bots carry nothing special (default loadouts, skinless). */
  protected override decorateBot(): void {}

  protected override playerScore(p: Player): number {
    return csScore(p, this.csWorld.csMode);
  }

  protected override helloMode(): string {
    return csModeOf(this.options);
  }

  /** CS teams: 'red' is the Terrorists, 'blue' the Counter-Terrorists; there is no class menu. */
  protected override joinTeam(p: Player, choice: TeamChoice): void {
    const w = this.csWorld;
    const team =
      choice === 'red'
        ? CS_TEAM_T
        : choice === 'blue'
          ? CS_TEAM_CT
          : choice === 'spectator'
            ? TEAM_SPECTATOR
            : p.team === CS_TEAM_T || p.team === CS_TEAM_CT
              ? p.team
              : w.smallerCsTeam();
    if (team !== p.team) p.requestTeam(team);
    if ((p.team === CS_TEAM_T || p.team === CS_TEAM_CT) && p.playerClass === 0)
      p.requestClass(CS_PLAYER_CLASS);
  }

  protected override joinClass(p: Player, _choice: ClassChoice): void {
    if ((p.team === CS_TEAM_T || p.team === CS_TEAM_CT) && p.playerClass === 0)
      p.requestClass(CS_PLAYER_CLASS);
  }

  override onCommand(id: number, cmd: MatchCommand): void {
    // No classes, TF voice menus or TF loadouts in CS:GO.
    if (cmd.kind === 'class' || cmd.kind === 'loadout' || cmd.kind === 'voice') return;
    super.onCommand(id, cmd);
  }

  /** Seconds on the HUD's clock: the freeze time, the round (or the bomb), the deathmatch match. */
  protected override roundTimeLeft(): number | null {
    const r = this.csWorld.csRules;
    const t = this.world.curtime;
    if (r.csMode === 'dm') return Math.max(0, Math.round(r.matchEndsAt - t));
    if (r.state === GR_STATE_PREROUND) return Math.max(0, Math.round(r.freezeEndsAt - t));
    if (r.state === GR_STATE_RND_RUNNING) return Math.max(0, Math.round(r.roundEndsAt - t));
    return null;
  }

  /** A human by hub id, as a CS player (tests, the listen server). */
  csPlayerOf(hubId: number): CsPlayer | null {
    return this.playerOf(hubId) as CsPlayer | null;
  }

  /** Adds bots to a CS team (the console's bot_add_t / bot_add_ct). */
  addCsBots(
    count: number,
    team: 't' | 'ct' | 'auto',
    difficulty: BotDifficulty = this.options.botDifficulty,
  ): Player[] {
    return this.addBots(count, difficulty, {
      team: team === 't' ? 'red' : team === 'ct' ? 'blue' : 'auto',
    });
  }
}

/** Loads the weapon data from the csgo-ui channel (`ui/index.json` → `weapons`). */
export async function loadCsWeaponData(loader: GameObjectLoader): Promise<CsItemsDocument> {
  const idx = await loader.get('ui/index.json');
  if (!idx) throw new Error('CS:GO ui/index.json is missing');
  const index = JSON.parse(new TextDecoder().decode(idx)) as { weapons?: string | null };
  if (!index.weapons)
    throw new Error('CS:GO weapon data is not published (ui/index.json has no weapons)');
  const bytes = await loader.get(`ui/${index.weapons}`);
  if (!bytes) throw new Error(`CS:GO weapon data missing (ui/${index.weapons})`);
  return JSON.parse(new TextDecoder().decode(bytes)) as CsItemsDocument;
}

/** Builds a CS:GO match: the weapon data, the map (unless given one), its nav mesh, the bots. */
export async function createCsMatchHost(
  opts: MatchOptions,
  deps: CsMatchDeps = {},
): Promise<CsMatchHost> {
  registerCsGame();
  if (deps.weaponData) setCsWeaponData(deps.weaponData);
  else if (!hasCsWeaponData() && deps.loader) setCsWeaponData(await loadCsWeaponData(deps.loader));
  let map = deps.map ?? null;
  if (!deps.world && !map) {
    if (!deps.loadMap) throw new Error('no map loader');
    map = await deps.loadMap(opts.map);
  }
  let nav = deps.nav ?? (map as PackagedMap | null)?.navMesh ?? null;
  if (!nav && deps.loadNav) nav = await deps.loadNav(opts.map);
  const host = new CsMatchHost(opts, {
    ...deps,
    map,
    nav,
    loadLevel: deps.loadLevel ?? levelLoader(deps),
  });
  if (nav) provideNavMesh(host.world, nav);
  return host;
}

/**
 * The 'csgo' entry of the engine's game registry. A TF2 bot brain handed in by a TF-minded caller
 * (the listen worker's `findBotBrain`) is never a CS brain: CS bots always play CsBotBrain.
 */
export const CSGO_MATCH_FACTORY: GameMatchFactory = {
  create: (opts, deps) =>
    createCsMatchHost(opts, { ...(deps as CsMatchDeps), botBrain: undefined }),
  restore: (opts, deps, cp, catalog) =>
    CsMatchHost.restore(
      { ...opts, game: 'csgo' },
      { ...deps, botBrain: csBotBrainFactory },
      cp,
      catalog,
    ),
};

registerMatchGame('csgo', CSGO_MATCH_FACTORY);
