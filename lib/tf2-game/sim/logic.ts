/**
 * Engine-generic logic entities every map leans on (logicrelay.cpp,
 * logicauto.cpp) and the tf_gamerules proxy's rule inputs. Mode-specific
 * logic (team_control_point*, item_teamflag, tf_logic_koth,
 * team_round_timer, math_counter, …) belongs to the map-entities module.
 */

import { TF_TEAM_BLUE, TF_TEAM_RED } from '../core/constants';
import { Entity, PointEntity } from './entity';
import { registerEntityClass } from './entity-registry';
import { GR_STATE_PREROUND } from './rules';

/** logic_relay spawnflags. */
export const SF_REMOVE_ON_FIRE = 0x001;
export const SF_ALLOW_FAST_RETRIGGER = 0x002;
/** logic_auto spawnflag: remove after firing. */
export const SF_AUTO_FIREONCE = 0x01;

/** SDK: CLogicRelay. */
export class LogicRelay extends Entity {
  disabled = false;
  waitForRefire = false;

  override spawn(): void {
    super.spawn();
    this.disabled = this.kvBool('StartDisabled');
  }

  override activate(): void {
    super.activate();
    if (this.outputs.get('onspawn')?.connected) this.setThink(this.spawnThink, this.world.curtime + 0.01);
  }

  private readonly spawnThink = (): void => {
    this.fireOutput('OnSpawn', this);
    if (this.spawnflags & SF_REMOVE_ON_FIRE) this.world.remove(this);
  };

  /** SDK: CLogicRelay::InputTrigger. */
  trigger(activator: Entity | null): void {
    if (this.disabled || this.waitForRefire) return;
    const out = this.outputs.get('ontrigger');
    let maxDelay = 0;
    if (out) for (const a of out.actions) maxDelay = Math.max(maxDelay, a.delay);
    this.fireOutput('OnTrigger', activator);
    if (this.spawnflags & SF_REMOVE_ON_FIRE) this.world.remove(this);
    else if (!(this.spawnflags & SF_ALLOW_FAST_RETRIGGER)) {
      this.waitForRefire = true;
      this.world.io.addEventTo(this, 'EnableRefire', '', maxDelay + 0.001, this, this);
    }
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'trigger':
        this.trigger(activator);
        return true;
      case 'enable':
        this.disabled = false;
        return true;
      case 'disable':
        this.disabled = true;
        return true;
      case 'toggle':
        this.disabled = !this.disabled;
        return true;
      case 'enablerefire':
        this.waitForRefire = false;
        return true;
      case 'cancelpending':
        this.world.io.cancelEventsFrom(this);
        this.waitForRefire = false;
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** SDK: CLogicAuto — fires 0.2 s after (re)spawn: OnMapSpawn, then OnMultiNewRound or OnMultiNewMap. */
export class LogicAuto extends Entity {
  override activate(): void {
    super.activate();
    this.setThink(this.autoThink, this.world.curtime + 0.2);
  }

  private readonly autoThink = (): void => {
    this.fireOutput('OnNewGame', null);
    this.fireOutput('OnMapSpawn', null);
    if (this.world.rules.state === GR_STATE_PREROUND) this.fireOutput('OnMultiNewRound', null);
    else this.fireOutput('OnMultiNewMap', null);
    if (this.spawnflags & SF_AUTO_FIREONCE) this.world.remove(this);
  };
}

/**
 * tf_gamerules (CTFGameRulesProxy): the map's handle on the rules — respawn
 * wave times and team score inputs, and the round outputs.
 */
export class TFGameRulesProxy extends Entity {
  override spawn(): void {
    super.spawn();
    this.preserved = true;
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    const rules = this.world.rules;
    const v = parseFloat(value) || 0;
    switch (input.toLowerCase()) {
      case 'setredteamrespawnwavetime':
        rules.setTeamRespawnWaveTime(TF_TEAM_RED, v);
        return true;
      case 'setblueteamrespawnwavetime':
        rules.setTeamRespawnWaveTime(TF_TEAM_BLUE, v);
        return true;
      case 'addredteamrespawnwavetime':
        rules.setTeamRespawnWaveTime(TF_TEAM_RED, Math.max(0, rules.respawnWaveBase(TF_TEAM_RED) + v));
        return true;
      case 'addblueteamrespawnwavetime':
        rules.setTeamRespawnWaveTime(TF_TEAM_BLUE, Math.max(0, rules.respawnWaveBase(TF_TEAM_BLUE) + v));
        return true;
      case 'addredteamscore':
        rules.addTeamScore(TF_TEAM_RED, v);
        return true;
      case 'addblueteamscore':
        rules.addTeamScore(TF_TEAM_BLUE, v);
        return true;
      case 'setstalemateontimelimit':
      case 'setredteamgoalstring':
      case 'setblueteamgoalstring':
      case 'setredteamrole':
      case 'setblueteamrole':
      case 'playvo':
      case 'playvored':
      case 'playvoblue':
      case 'roundspawn':
      case 'roundactivate':
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

registerEntityClass('logic_relay', LogicRelay);
registerEntityClass('logic_auto', LogicAuto);
registerEntityClass('tf_gamerules', TFGameRulesProxy);
registerEntityClass('info_target', PointEntity);
registerEntityClass('info_teleport_destination', PointEntity);
