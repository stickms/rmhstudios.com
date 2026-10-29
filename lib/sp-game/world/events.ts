/**
 * What the SP simulation tells its host each tick (drained with
 * `SpWorld.drainEvents()`): sounds and captions, HUD effects (fades, shakes,
 * messages, game_text, hints), level changes, saves and reloads, and visual
 * effects. Plain data — the host plays, draws and loads.
 */

import type { Vec3 } from '../../tf2-game/core/vec';
import type { TransitionData } from '../level/transition';

export type SpEvent =
  | {
      type: 'sound';
      /** Sound script name or a raw "path.wav". */
      name: string;
      entity?: number;
      pos?: Vec3;
      volume?: number;
      pitch?: number;
      /** Looping ambient_generic / move sounds the host keeps until a matching stop. */
      loop?: boolean;
      /** Stops a playing sound of this name on this entity. */
      stop?: boolean;
      /** Audible radius in units (ambient_generic). */
      radius?: number;
      /** Fade in/out time, seconds. */
      fade?: number;
      /** Change the volume of a playing sound (0…10 as ambient_generic's Volume input). */
      setVolume?: number;
    }
  | { type: 'caption'; token: string; text: string; duration: number; entity?: number }
  | { type: 'fade'; color: [number, number, number, number]; duration: number; hold: number; fadeIn: boolean; modulate: boolean; stayOut: boolean }
  | { type: 'shake'; pos: Vec3; amplitude: number; frequency: number; duration: number; radius: number; stop?: boolean; global: boolean }
  | { type: 'message'; message: string; entity?: number }
  | {
      type: 'gametext';
      text: string;
      x: number;
      y: number;
      color: [number, number, number, number];
      color2: [number, number, number, number];
      effect: number;
      fadeIn: number;
      fadeOut: number;
      hold: number;
      fxTime: number;
      channel: number;
    }
  | { type: 'hudhint'; message: string; show: boolean }
  | { type: 'changelevel'; map: string; landmark: string; transition: TransitionData }
  | { type: 'autosave'; dangerous: boolean }
  | { type: 'death' }
  | { type: 'reload'; fromCheckpoint: boolean }
  | { type: 'zoom'; fov: number; rate: number }
  | { type: 'credits'; mode: 'logo' | 'roll' | 'outro' }
  | { type: 'clientcommand'; command: string }
  | { type: 'teleport'; entity: number }
  | { type: 'pickup'; entity: number; item: string }
  | {
      type: 'effect';
      kind:
        | 'spark'
        | 'impact'
        | 'physexplosion'
        | 'splash'
        | 'dissolve'
        | 'portal_open'
        | 'portal_fizzle'
        | 'portal_fail'
        | 'energy_ball_bounce'
        | 'energy_ball_explode'
        | 'break';
      pos: Vec3;
      normal?: Vec3;
      entity?: number;
      magnitude?: number;
    };
