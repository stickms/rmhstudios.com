/**
 * Static brush entities whose state changes by I/O:
 *
 * - func_brush (server/modelentities.cpp CFuncBrush): Solidity 0 toggles
 *   with Enable/Disable (TurnOn/TurnOff), 1 never solid, 2 always solid;
 *   StartDisabled hides it.
 * - func_wall_toggle (server/bmodels.cpp CFuncWallToggle).
 * - func_illusionary, func_lod: never solid, drawn (renderer reads the brush record).
 * - func_areaportal / func_areaportalwindow: open/closed state for visibility.
 * - func_occluder, func_dustmotes, func_smokevolume: render-only volumes
 *   (Activate/Deactivate, TurnOn/TurnOff accepted).
 * - func_respawnroomvisualizer / func_nobuild: the core classes extended
 *   with the inputs these maps send (Enable/Disable on the visualizer —
 *   CFuncBrush TurnOn/TurnOff — and SetActive/SetInactive/ToggleActive with
 *   DestroyBuildings on func_nobuild).
 */

import { EF_NODRAW, type Entity, FSOLID_NOT_SOLID, MOVETYPE_PUSH, SOLID_BSP } from '../entity';
import { registerEntityClass } from '../entity-registry';
import type { NetRecord, NetSchema } from '../net-schema';
import { FuncNoBuild, FuncRespawnRoomVisualizer } from '../triggers';
import { BaseObject } from '../building-api';
import { MapEntity, atoi } from './base';
import { NET_AREAPORTAL } from './net';

/** BrushSolidities_e. */
export const BRUSHSOLID_TOGGLE = 0;
export const BRUSHSOLID_NEVER = 1;
export const BRUSHSOLID_ALWAYS = 2;

/** func_brush. */
export class FuncBrush extends MapEntity {
  solidity = BRUSHSOLID_TOGGLE;
  startDisabled = false;

  override keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'solidity':
        this.solidity = atoi(value);
        return true;
      case 'startdisabled':
        this.startDisabled = atoi(value) !== 0;
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  /** SDK: CFuncBrush::Spawn. */
  override spawn(): void {
    super.spawn();
    this.moveType = MOVETYPE_PUSH;
    this.solid = SOLID_BSP;
    if (this.solidity === BRUSHSOLID_NEVER) this.setSolidNow(false);
    else this.setSolidNow(true);
    if (this.startDisabled) this.turnOff();
  }

  protected setSolidNow(solid: boolean): void {
    if (solid) this.solidFlags &= ~FSOLID_NOT_SOLID;
    else this.solidFlags |= FSOLID_NOT_SOLID;
    this.world.setBrushSolid(this, solid);
  }

  isOn(): boolean {
    return (this.effects & EF_NODRAW) === 0;
  }

  /** SDK: CFuncBrush::TurnOff. */
  turnOff(): void {
    if (!this.isOn()) return;
    if (this.solidity !== BRUSHSOLID_ALWAYS) this.setSolidNow(false);
    this.effects |= EF_NODRAW;
  }

  /** SDK: CFuncBrush::TurnOn. */
  turnOn(): void {
    if (this.isOn()) return;
    if (this.solidity !== BRUSHSOLID_NEVER) this.setSolidNow(true);
    this.effects &= ~EF_NODRAW;
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'turnon':
      case 'enable':
        this.turnOn();
        return true;
      case 'turnoff':
      case 'disable':
        this.turnOff();
        return true;
      case 'toggle':
        if (this.isOn()) this.turnOff();
        else this.turnOn();
        return true;
      case 'setexcluded':
      case 'setinvert':
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** SF_WALL_START_OFF. */
const SF_WALL_START_OFF = 0x0001;

/** func_wall_toggle (CFuncWallToggle): Toggle swaps solid+visible with off. */
export class FuncWallToggle extends MapEntity {
  override spawn(): void {
    super.spawn();
    this.moveType = MOVETYPE_PUSH;
    this.solid = SOLID_BSP;
    if (this.spawnflags & SF_WALL_START_OFF) this.turnOff();
    else this.turnOn();
  }

  isOn(): boolean {
    return (this.solidFlags & FSOLID_NOT_SOLID) === 0;
  }

  turnOff(): void {
    this.solidFlags |= FSOLID_NOT_SOLID;
    this.effects |= EF_NODRAW;
    this.world.setBrushSolid(this, false);
  }

  turnOn(): void {
    this.solidFlags &= ~FSOLID_NOT_SOLID;
    this.effects &= ~EF_NODRAW;
    this.world.setBrushSolid(this, true);
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'toggle':
        if (this.isOn()) this.turnOff();
        else this.turnOn();
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** func_illusionary / func_lod: drawn, never solid. */
export class FuncIllusionary extends MapEntity {
  override spawn(): void {
    super.spawn();
    this.solidFlags |= FSOLID_NOT_SOLID;
    this.world.setBrushSolid(this, false);
  }
}

/** func_areaportal / func_areaportalwindow (CAreaPortal): Open/Close/Toggle, opened by doors that target it. */
export class FuncAreaPortal extends MapEntity {
  open = false;
  portalNumber = 0;
  private targetLc = '';

  get targetLower(): string {
    return this.targetLc;
  }

  override keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'startopen':
        this.open = atoi(value) !== 0;
        return true;
      case 'portalnumber':
        this.portalNumber = atoi(value);
        return true;
      case 'target':
        this.targetLc = value.toLowerCase();
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  override spawn(): void {
    super.spawn();
    // func_areaportalwindow is always open for visibility; it only fades.
    if (this.classname === 'func_areaportalwindow') this.open = true;
  }

  setOpen(open: boolean): void {
    this.open = open;
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'open':
        this.open = true;
        return true;
      case 'close':
        this.open = false;
        return true;
      case 'toggle':
        this.open = !this.open;
        return true;
      case 'setfadestartdistance':
      case 'setfadeenddistance':
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }

  override netSchema(): NetSchema | null {
    return NET_AREAPORTAL;
  }

  override writeNet(out: NetRecord): void {
    out.portalNumber = this.portalNumber;
    out.open = this.open;
  }
}

/** func_occluder / func_dustmotes / func_smokevolume: render-only volumes with an on/off state. */
export class FuncRenderVolume extends MapEntity {
  override spawn(): void {
    super.spawn();
    this.solidFlags |= FSOLID_NOT_SOLID;
    this.world.setBrushSolid(this, false);
    const startOn =
      this.classname === 'func_occluder'
        ? this.kvBool('StartActive', true)
        : !this.kvBool('StartDisabled');
    if (!startOn) this.effects |= EF_NODRAW;
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'activate':
      case 'turnon':
      case 'enable':
        this.effects &= ~EF_NODRAW;
        return true;
      case 'deactivate':
      case 'turnoff':
      case 'disable':
        this.effects |= EF_NODRAW;
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** func_respawnroomvisualizer with CFuncBrush's Enable/Disable (visibility; solidity stays SetActive's). */
export class RespawnRoomVisualizer extends FuncRespawnRoomVisualizer {
  override spawn(): void {
    super.spawn();
    if (this.kvBool('StartDisabled')) this.effects |= EF_NODRAW;
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'enable':
      case 'turnon':
        this.effects &= ~EF_NODRAW;
        return true;
      case 'disable':
      case 'turnoff':
        this.effects |= EF_NODRAW;
        return true;
      case 'toggle':
        this.effects ^= EF_NODRAW;
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** func_nobuild with CFuncNoBuild::SetActive (DestroyBuildings removes the team's buildings inside). */
export class NoBuildZone extends FuncNoBuild {
  setActive(active: boolean): void {
    this.disabled = !active;
    if (!active || !this.kvBool('DestroyBuildings')) return;
    const denyTeam = this.team;
    const world = this.world;
    const doomed: BaseObject[] = [];
    world.forEachEntity((e) => {
      if (!(e instanceof BaseObject)) return;
      if (denyTeam && denyTeam !== e.team) return;
      if (this.pointIsWithin(e.origin) || this.pointIsWithin(world.centerOf(e))) doomed.push(e);
    });
    for (const o of doomed) o.detonate();
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'setactive':
        this.setActive(true);
        return true;
      case 'setinactive':
        this.setActive(false);
        return true;
      case 'toggleactive':
        this.setActive(this.disabled);
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

registerEntityClass('func_brush', FuncBrush);
registerEntityClass('func_wall', FuncBrush);
registerEntityClass('func_wall_toggle', FuncWallToggle);
registerEntityClass('func_illusionary', FuncIllusionary);
registerEntityClass('func_lod', FuncIllusionary);
registerEntityClass('func_areaportal', FuncAreaPortal);
registerEntityClass('func_areaportalwindow', FuncAreaPortal);
registerEntityClass('func_occluder', FuncRenderVolume);
registerEntityClass('func_dustmotes', FuncRenderVolume);
registerEntityClass('func_smokevolume', FuncRenderVolume);

/** Re-registers the classes that override core registrations (call after the core modules load). */
export function registerBrushOverrides(): void {
  registerEntityClass('func_respawnroomvisualizer', RespawnRoomVisualizer);
  registerEntityClass('func_nobuild', NoBuildZone);
}
registerBrushOverrides();
