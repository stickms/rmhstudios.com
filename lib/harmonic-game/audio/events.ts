/**
 * `HarmonicSoundEvent`: the typed bus other work packages (combat, tuner, dialogue, level scripts)
 * emit to. Pure — safe to import from sim code and Node tests; with no player attached `emit` is a
 * no-op, so emitting never needs a guard.
 *
 *   import { harmonicSounds } from '../audio/events';
 *   harmonicSounds.emit({ type: 'sfx', sound: 'pulse.fire', entity: player.id });
 *   harmonicSounds.sfx('tuner.shift');
 *   harmonicSounds.emit({ type: 'area', area: 'ship_1971' });
 *   harmonicSounds.emit({ type: 'music', intensity: 0.8 });
 *
 * Names (`HarmonicSoundName`, see `recipes.ts`):
 *   step.{concrete|metal|grating|wood|ice|snow|water}   impact.{concrete|metal|grating|wood|glass|ice|snow|water}
 *   player.{jump|land|hurt|death}   melee.{swing|hit}   pulse.{fire|reload|empty}   coil.{fire|reload|empty}
 *   door.{open|close}   button.press   pickup   tuner.{shift|listen_on|listen_off|charge_ready}
 *   unstrung.voice   wind.{loop|gust}   ship.groan   radio.{click|static}   misc.soft
 *   bed.{ice_open|camp_interior|ship_1971|ship_2030}   music.{drone|tone|pulse}
 * (the `bed.*` and `music.*` names are driven by `area` / `music` events, not played directly.)
 */
import type { Vec3 } from '../../tf2-game/core/vec';
import type { AreaId } from './ambience';
import type { HarmonicSoundName } from './recipes';

export type HarmonicSoundEvent =
  /** Play a bank sound once (or until stopped, for loops). */
  | {
      type: 'sfx';
      sound: HarmonicSoundName;
      /** World position (Source units); spatialised when given or when `entity` is known. */
      pos?: Vec3;
      /** The entity the sound follows. */
      entity?: number;
      /** 0..1, multiplies the bank's own level. */
      volume?: number;
      /** Playback-rate multiplier (1 = as rendered; 0.5 = an octave down). */
      rate?: number;
      /** Force a variation (default: random, never the previous one). */
      variant?: number;
    }
  /** Stop a (looping) sound: one entity's, or every instance when `entity` is omitted. */
  | { type: 'stop'; sound: HarmonicSoundName; entity?: number }
  /** Crossfade to an area's ambient bed and music key. */
  | { type: 'area'; area: AreaId; instant?: boolean }
  /** Music intensity 0..1 (0 exploration, 1 combat). */
  | { type: 'music'; intensity: number };

export type HarmonicSoundListener = (ev: HarmonicSoundEvent) => void;

export class HarmonicSoundBus {
  private readonly listeners = new Set<HarmonicSoundListener>();

  emit(ev: HarmonicSoundEvent): void {
    for (const l of [...this.listeners]) l(ev);
  }

  /** Shorthand for an `sfx` event. */
  sfx(
    sound: HarmonicSoundName,
    opts: Omit<Extract<HarmonicSoundEvent, { type: 'sfx' }>, 'type' | 'sound'> = {},
  ): void {
    this.emit({ type: 'sfx', sound, ...opts });
  }

  /** Subscribe; returns the unsubscribe function. */
  on(listener: HarmonicSoundListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

/** The shared bus: the audio player subscribes to it for the lifetime of a client. */
export const harmonicSounds = new HarmonicSoundBus();
