/**
 * Cold and shelters (plan H1.2). The player carries an exposure meter (`value`, 0..`COLD_MAX`).
 * Where they stand decides what happens to it each tick:
 *
 *   shelter  refills at `COLD_REFILL_SHELTER`/s
 *   outdoor  drains at `COLD_DRAIN_OUTDOOR`/s
 *   wind     drains at `COLD_DRAIN_OUTDOOR` x `COLD_WIND_MULTIPLIER`/s
 *
 * An enabled `harmonic_heater` within its radius adds up to `COLD_HEATER_REFILL`/s on top, falling
 * off linearly with distance (so a heater beats the outdoor drain near it, and speeds a shelter's
 * refill). At zero the player takes `COLD_DAMAGE` every `COLD_DAMAGE_INTERVAL` s through combat
 * (`'cold'`, no attacker). A death reload refills the meter.
 *
 * Modes come from `trigger_harmonic_exposure` brush volumes; outside every volume the level default
 * applies (worldspawn `harmonic_exposure` = `outdoor` | `shelter`; absent = `shelter`, so indoor
 * levels never drain and show no meter). Overlapping volumes: shelter wins, then wind, then outdoor.
 *
 * Entities
 *   trigger_harmonic_exposure  keys: mode (outdoor|shelter|wind), area (audio bed id),
 *                              hintkey + hint (text shown while inside).
 *   harmonic_heater            a prop (heater.mdl). Keys: radius, StartDisabled. Inputs: Enable,
 *                              Disable, Toggle. Output: OnPlayerWarm (the player steps into its warmth).
 *
 * Environment-agnostic: no DOM. State is not part of the checkpoint (it resets, by design).
 */
import type { Entity } from '../../tf2-game/sim/entity';
import { SF_TRIGGER_ALLOW_CLIENTS } from '../../tf2-game/sim/triggers';
import { registerSp } from '../../sp-game/entities/base';
import { PropDynamic } from '../../sp-game/entities/props';
import { SpTriggerMultiple } from '../../sp-game/entities/triggers';
import type { SpWorld } from '../../sp-game/world/sp-world';
import { modelPath } from '../assets/models/info';
import { AREAS, type AreaId } from '../audio/ambience';
import { harmonicSounds } from '../audio/events';
import type { HarmonicCombat } from './combat';
import {
  COLD_DAMAGE,
  COLD_DAMAGE_INTERVAL,
  COLD_DRAIN_OUTDOOR,
  COLD_FROST_START,
  COLD_HEATER_RADIUS,
  COLD_HEATER_REFILL,
  COLD_HINT_FRACTION,
  COLD_MAX,
  COLD_PLAYER_CENTER_Z,
  COLD_REFILL_SHELTER,
  COLD_WIND_MULTIPLIER,
} from './constants';

export type ExposureMode = 'outdoor' | 'shelter' | 'wind';

export function parseExposureMode(s: string | undefined | null): ExposureMode | null {
  const v = (s ?? '').trim().toLowerCase();
  return v === 'outdoor' || v === 'shelter' || v === 'wind' ? v : null;
}

const parseArea = (s: string): AreaId | null =>
  (AREAS as readonly string[]).includes(s) ? (s as AreaId) : null;

/** The slice of the cold state the HUD draws (`HarmonicHudState.cold`). */
export interface ColdHud {
  value: number;
  max: number;
  sheltered: boolean;
  /** 0..1 frost vignette strength. */
  frost: number;
}

/** Linear heater falloff: 1 at the heater, 0 at (and beyond) its radius. */
export function heaterWarmth(distance: number, radius: number): number {
  if (radius <= 0 || distance >= radius) return 0;
  return 1 - Math.max(0, distance) / radius;
}

/** Meter change per second for a mode and total heater warmth (0 = none; may exceed 1 with several). */
export function exposureRate(mode: ExposureMode, warmth: number): number {
  const base =
    mode === 'shelter'
      ? COLD_REFILL_SHELTER
      : -COLD_DRAIN_OUTDOOR * (mode === 'wind' ? COLD_WIND_MULTIPLIER : 1);
  return base + COLD_HEATER_REFILL * warmth;
}

const MODE_PRIORITY: Record<ExposureMode, number> = { outdoor: 0, wind: 1, shelter: 2 };

interface Registry {
  volumes: Set<HarmonicExposureVolume>;
  heaters: Set<HarmonicHeater>;
}
const registries = new WeakMap<SpWorld, Registry>();
function registry(w: SpWorld): Registry {
  let r = registries.get(w);
  if (!r) registries.set(w, (r = { volumes: new Set(), heaters: new Set() }));
  return r;
}

export class ColdService {
  value = COLD_MAX;
  readonly max = COLD_MAX;
  /** The mode applied on the last tick. */
  mode: ExposureMode;
  /** Total heater warmth on the last tick. */
  warmth = 0;
  private readonly defaultMode: ExposureMode;
  private readonly defaultArea: AreaId | null;
  private damageAt = 0;
  private wasDead = false;
  private area: AreaId | null = null;
  private activeHint: { key: string; defaultValue: string } | null = null;
  private readonly warm = new Set<HarmonicHeater>();

  constructor(
    readonly world: SpWorld,
    private readonly combat: HarmonicCombat,
  ) {
    const w = world.worldEntity;
    this.defaultMode = parseExposureMode(w.kvString('harmonic_exposure')) ?? 'shelter';
    this.defaultArea = parseArea(w.kvString('harmonic_area').trim().toLowerCase());
    this.mode = this.defaultMode;
    combat.on((ev) => {
      if (ev.type === 'playerHurt' && ev.dead) this.wasDead = true;
    });
  }

  /** Whether this level has cold at all (an outdoor default or any outdoor/wind volume). */
  get enabled(): boolean {
    if (this.defaultMode !== 'shelter') return true;
    for (const v of registry(this.world).volumes) if (v.mode !== 'shelter') return true;
    return false;
  }

  get sheltered(): boolean {
    return this.mode === 'shelter';
  }

  /** 0..1: how much frost creeps in at the screen edge. Eased so it arrives slowly and bites at the end. */
  get frost(): number {
    const f = 1 - this.value / this.max / COLD_FROST_START;
    if (f <= 0) return 0;
    const c = Math.min(1, f);
    return c * (2 - c);
  }

  /** The line the HUD shows (volume hint, else a cold warning), or null. */
  get hint(): { key: string; defaultValue: string } | null {
    if (this.activeHint) return this.activeHint;
    if (this.enabled && !this.sheltered && this.value / this.max < COLD_HINT_FRACTION)
      return {
        key: 'harmonic:hint_find_shelter',
        defaultValue: 'You are freezing. Find shelter or a heater.',
      };
    return null;
  }

  hudState(): ColdHud {
    return { value: this.value, max: this.max, sheltered: this.sheltered, frost: this.frost };
  }

  /** Back to a warm start (death reload, level restart). */
  reset(): void {
    this.value = this.max;
    this.damageAt = 0;
    this.wasDead = false;
    this.warm.clear();
  }

  /** Mode at the player's position, and the volume that decided it. */
  private resolve(): { mode: ExposureMode; volume: HarmonicExposureVolume | null } {
    let best: HarmonicExposureVolume | null = null;
    const player = this.world.player;
    for (const v of registry(this.world).volumes) {
      if (!v.isTouching(player)) continue;
      if (!best || MODE_PRIORITY[v.mode] > MODE_PRIORITY[best.mode]) best = v;
    }
    return best ? { mode: best.mode, volume: best } : { mode: this.defaultMode, volume: null };
  }

  private heaterWarmthAtPlayer(): number {
    const p = this.world.player.origin;
    let total = 0;
    for (const h of registry(this.world).heaters) {
      const dx = p.x - h.origin.x;
      const dy = p.y - h.origin.y;
      const dz = p.z + COLD_PLAYER_CENTER_Z - (h.origin.z + h.warmthHeight);
      const w = h.lit ? heaterWarmth(Math.hypot(dx, dy, dz), h.radius) : 0;
      if (w > 0) {
        total += w;
        if (!this.warm.has(h)) {
          this.warm.add(h);
          h.fireOutput('OnPlayerWarm', this.world.player);
        }
      } else this.warm.delete(h);
    }
    return total;
  }

  /** One simulation tick (`afterTick`). */
  tick(dt: number = this.world.tick): void {
    const player = this.world.player;
    if (player.dead) {
      this.wasDead = true;
      return;
    }
    if (this.wasDead) this.reset();
    const { mode, volume } = this.resolve();
    this.mode = mode;
    this.warmth = this.heaterWarmthAtPlayer();
    this.setArea(volume?.area ?? this.defaultArea);
    this.activeHint = volume?.hint ?? null;
    if (!this.enabled) {
      this.value = this.max;
      return;
    }
    this.value = Math.max(0, Math.min(this.max, this.value + exposureRate(mode, this.warmth) * dt));
    if (this.value > 0) {
      this.damageAt = 0;
      return;
    }
    if (this.damageAt === 0) this.damageAt = this.world.curtime + COLD_DAMAGE_INTERVAL;
    if (this.world.curtime >= this.damageAt) {
      this.damageAt += COLD_DAMAGE_INTERVAL;
      this.combat.hurt(player, COLD_DAMAGE, 'cold');
    }
  }

  private setArea(next: AreaId | null): void {
    if (!next || next === this.area) return;
    const first = this.area === null;
    this.area = next;
    harmonicSounds.emit({ type: 'area', area: next, instant: first });
  }
}

/**
 * `trigger_harmonic_exposure`: a brush volume that sets the player's exposure mode while they
 * stand inside (see the file header for keys). Outputs are those of `trigger_multiple`.
 */
export class HarmonicExposureVolume extends SpTriggerMultiple {
  mode: ExposureMode = 'outdoor';
  area: AreaId | null = null;
  hint: { key: string; defaultValue: string } | null = null;

  override spawn(): void {
    this.spawnflags |= SF_TRIGGER_ALLOW_CLIENTS;
    super.spawn();
    this.mode = parseExposureMode(this.kvString('mode')) ?? 'outdoor';
    this.area = parseArea(this.kvString('area').trim().toLowerCase());
    const text = this.kvString('hint');
    if (text)
      this.hint = { key: this.kvString('hintkey') || 'harmonic:hint_exposure', defaultValue: text };
    registry(this.world as unknown as SpWorld).volumes.add(this);
  }

  override onRemove(): void {
    registry(this.world as unknown as SpWorld).volumes.delete(this);
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    if (input.toLowerCase() === 'setmode') {
      const m = parseExposureMode(value);
      if (m) this.mode = m;
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

/**
 * `harmonic_heater`: heater.mdl as a warm spot. Keys: `radius` (default `COLD_HEATER_RADIUS`),
 * `StartDisabled`. Inputs: `Enable`, `Disable`, `Toggle` (it stays drawn; only the warmth goes).
 * Output: `OnPlayerWarm`, fired when the player steps into its radius.
 */
export class HarmonicHeater extends PropDynamic {
  lit = true;
  radius = COLD_HEATER_RADIUS;
  /** Height of the model's `warmth` attachment above its origin. */
  warmthHeight = 22;

  override spawn(): void {
    if (!this.model) this.model = modelPath('heater');
    super.spawn();
    this.radius = this.kvNumber('radius', 0) || COLD_HEATER_RADIUS;
    this.lit = !this.kvBool('StartDisabled');
    registry(this.sp).heaters.add(this);
  }

  override onRemove(): void {
    registry(this.sp).heaters.delete(this);
    super.onRemove();
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'enable':
        this.lit = true;
        return true;
      case 'disable':
        this.lit = false;
        return true;
      case 'toggle':
        this.lit = !this.lit;
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

registerSp(HarmonicExposureVolume, 'trigger_harmonic_exposure');
registerSp(HarmonicHeater, 'harmonic_heater');
