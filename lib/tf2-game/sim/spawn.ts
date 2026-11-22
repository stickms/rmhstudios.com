/**
 * Spawn points: the info_player_teamspawn entity (CTFTeamSpawn,
 * entity_tfstart.cpp) and the selection rules — CTFPlayer::
 * SelectSpawnSpotByType (round-robin from the team's last spot; first a
 * clear spot that allows the class, then any clear spot, then ignoring
 * players), CTFGameRules::IsSpawnPointValid (team, enabled, hull clear) and
 * GetPlayerSpawnSpot's DropToGround. CTFGameRules::SetupSpawnPointsForRound
 * (mini-round spawn associations) is `setupSpawnPointsForRound`, called by
 * the control-point mode.
 */

import { emptyTrace, NO_ENTITY } from '../core/types';
import { MASK_PLAYERSOLID, TF_TEAM_BLUE, TF_TEAM_RED } from '../core/constants';
import { vec3 } from '../core/vec';
import { COLLISION_GROUP_PLAYER_MOVEMENT, Entity, type Entity as EntityT } from './entity';
import { registerEntityClass } from './entity-registry';
import type { Player } from './player';
import type { GameWorld } from './world';

/** PlayerTeamSpawnMode_t. */
export const PLAYER_TEAM_SPAWN_MODE_NORMAL = 0;
export const PLAYER_TEAM_SPAWN_MODE_TRIGGERED = 1;

export class TeamSpawn extends Entity {
  disabled = false;
  /** Associated control point name (SetupSpawnPointsForRound). */
  controlPointName = '';
  roundBlueSpawn = '';
  roundRedSpawn = '';
  spawnMode = PLAYER_TEAM_SPAWN_MODE_NORMAL;
  /** Match summary spawns are never used for play. */
  matchSummary = 0;

  /** Another game's team spawn entity (CS:GO's info_player_terrorist …) reuses this class under its name. */
  constructor(classname = 'info_player_teamspawn') {
    super(classname);
  }

  override spawn(): void {
    super.spawn();
    this.disabled = this.kvBool('StartDisabled');
    this.controlPointName = this.kvString('controlpoint');
    this.roundBlueSpawn = this.kvString('round_bluespawn');
    this.roundRedSpawn = this.kvString('round_redspawn');
    this.spawnMode = this.kvNumber('SpawnMode', 0);
    this.matchSummary = this.kvNumber('MatchSummary', 0);
  }

  override acceptInput(input: string, value: string, activator: EntityT | null, caller: EntityT | null): boolean {
    switch (input.toLowerCase()) {
      case 'enable':
        this.disabled = false;
        return true;
      case 'disable':
        this.disabled = true;
        return true;
      case 'roundspawn':
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

registerEntityClass('info_player_teamspawn', TeamSpawn);

const spawnTrace = emptyTrace();
const dropEnd = vec3();
const testMins = vec3();
const testMaxs = vec3();

export class SpawnSystem {
  private readonly world: GameWorld;
  /** g_pLastSpawnPoints per team: the round-robin cursor. */
  private readonly lastSpawn = new Map<number, number>();

  constructor(world: GameWorld) {
    this.world = world;
  }

  /** Every info_player_teamspawn, in entity order. */
  spawnPoints(): TeamSpawn[] {
    const out: TeamSpawn[] = [];
    this.world.forEachEntity((e) => {
      if (e instanceof TeamSpawn) out.push(e);
    });
    return out;
  }

  /** SDK: CTFGameRules::IsSpawnPointValid. */
  isSpawnPointValid(spot: TeamSpawn, player: Player, ignorePlayers: boolean): boolean {
    if (spot.team !== player.team) return false;
    if (spot.disabled) return false;
    if (spot.spawnMode && spot.spawnMode !== PLAYER_TEAM_SPAWN_MODE_NORMAL) return false;
    if (spot.matchSummary !== 0) return false;
    const filter = this.world.createEntityFilter(player, COLLISION_GROUP_PLAYER_MOVEMENT);
    // The player's own hull (TF2's 48 × 82; another game's player has its own).
    const hull = player.hull;
    if (!ignorePlayers) {
      // UTIL_IsSpaceEmpty: nothing solid, players included (teammates too).
      testMins.x = spot.origin.x + hull.min.x;
      testMins.y = spot.origin.y + hull.min.y;
      testMins.z = spot.origin.z + hull.min.z;
      testMaxs.x = spot.origin.x + hull.max.x;
      testMaxs.y = spot.origin.y + hull.max.y;
      testMaxs.z = spot.origin.z + hull.max.z;
      if (this.world.anyPlayerInBox(testMins, testMaxs, player)) return false;
    }
    const mask = MASK_PLAYERSOLID;
    this.world.traceHull(spot.origin, spot.origin, hull.min, hull.max, mask, filter, spawnTrace);
    return spawnTrace.fraction === 1 && !spawnTrace.allSolid && !spawnTrace.startSolid;
  }

  /**
   * SDK: CTFPlayer::SelectSpawnSpotByType("info_player_teamspawn"). Starts
   * after the team's last used spot; class spawnflags (bit class-1) are
   * honoured on the first pass when set.
   */
  selectSpawnPoint(player: Player): TeamSpawn | null {
    const spots = this.spawnPoints();
    if (spots.length === 0) return null;
    const last = this.lastSpawn.get(player.team) ?? NO_ENTITY;
    let start = spots.findIndex((s) => s.id === last);
    start = start < 0 ? 0 : (start + 1) % spots.length;
    const classBit = player.playerClass > 0 ? 1 << (player.playerClass - 1) : 0;
    for (let pass = 0; pass < 3; pass++) {
      const restrictByClass = pass === 0;
      const ignorePlayers = pass === 2;
      for (let n = 0; n < spots.length; n++) {
        const spot = spots[(start + n) % spots.length];
        if (spot.origin.x === 0 && spot.origin.y === 0 && spot.origin.z === 0) continue;
        if (restrictByClass && spot.spawnflags && !(spot.spawnflags & classBit)) continue;
        if (!this.isSpawnPointValid(spot, player, ignorePlayers)) continue;
        this.lastSpawn.set(player.team, spot.id);
        player.lastSpawnPoint = spot.id;
        return spot;
      }
    }
    return null;
  }

  /** SDK: DropToGround (tf_gamerules.cpp) + "GroundPos + Vector(0,0,1)". */
  dropToGround(player: Player): void {
    const o = player.origin;
    dropEnd.x = o.x;
    dropEnd.y = o.y;
    dropEnd.z = o.z - 256;
    const filter = this.world.createEntityFilter(player, COLLISION_GROUP_PLAYER_MOVEMENT);
    this.world.traceHull(o, dropEnd, player.mins, player.maxs, MASK_PLAYERSOLID, filter, spawnTrace);
    if (!spawnTrace.allSolid && !spawnTrace.startSolid && spawnTrace.fraction < 1) {
      o.z = spawnTrace.endPos.z + 1;
    } else if (!spawnTrace.startSolid) {
      o.z += 1;
    }
  }

  /**
   * SDK: CTFGameRules::SetupSpawnPointsForRound — for mini-round maps the
   * control-point mode passes the current round: spawns tied to a point in
   * the round take the point's owner, round spawns take their team, the rest
   * are disabled.
   */
  setupSpawnPointsForRound(
    isRoundName: (name: string) => boolean,
    pointInRound: (pointName: string) => boolean,
    pointOwner: (pointName: string) => number,
  ): void {
    for (const s of this.spawnPoints()) {
      if (s.controlPointName && pointInRound(s.controlPointName)) {
        s.disabled = false;
        s.changeTeam(pointOwner(s.controlPointName));
      } else if (s.roundBlueSpawn && isRoundName(s.roundBlueSpawn)) {
        s.disabled = false;
        s.changeTeam(TF_TEAM_BLUE);
      } else if (s.roundRedSpawn && isRoundName(s.roundRedSpawn)) {
        s.disabled = false;
        s.changeTeam(TF_TEAM_RED);
      } else {
        s.disabled = true;
      }
    }
  }

  /** Forgets the round-robin cursors (map reset). */
  reset(): void {
    this.lastSpawn.clear();
  }
}
