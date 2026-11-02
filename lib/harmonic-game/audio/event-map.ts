/**
 * Engine sound events → bank sounds. The simulation (SpWorld) names sounds the way the engine's
 * entities do — footsteps from the surface property, `Buttons.snd3`, a door's `soundmove`, raw
 * paths on an `ambient_generic` — and this maps them onto Harmonic's own bank by name. Names it
 * does not know get a soft default (a one-shot) or are dropped (an unknown loop would never end).
 * Pure: no Web Audio.
 */
import type { SpEvent } from '../../sp-game/world/events';
import {
  isSoundName,
  type HarmonicSoundName,
  type ImpactSurface,
  type StepSurface,
} from './recipes';
import type { HarmonicSoundEvent } from './events';

export interface ResolvedSound {
  sound: HarmonicSoundName;
  /** Multiplies the event's volume. */
  gain: number;
  /** Playback-rate multiplier. */
  rate: number;
  /** Whether the name was recognised (false = the soft default). */
  known: boolean;
}

const known = (sound: HarmonicSoundName, gain = 1, rate = 1): ResolvedSound => ({
  sound,
  gain,
  rate,
  known: true,
});

/** A surface word (a prop name, a sound-script prefix) → the step surface it sounds like. */
export function stepSurfaceFor(word: string): StepSurface {
  const w = word.toLowerCase();
  if (/grat|chainlink|catwalk|mesh/.test(w)) return 'grating';
  if (/metal|steel|iron|solidmetal/.test(w)) return 'metal';
  if (/wood|crate|plank/.test(w)) return 'wood';
  if (/glass|ice|frozen/.test(w)) return 'ice';
  if (/snow|slush/.test(w)) return 'snow';
  if (/water|wade|slosh|mud|puddle/.test(w)) return 'water';
  return 'concrete';
}

export function impactSurfaceFor(word: string): ImpactSurface {
  return /glass|window/i.test(word) ? 'glass' : stepSurfaceFor(word);
}

/** Map one engine sound name. `loop` is true for an `ambient_generic` kept until stopped. */
export function resolveEngineSound(rawName: string, loop = false): ResolvedSound | null {
  const raw = rawName.trim();
  if (!raw) return null;
  const name = raw.replace(/^harmonic\./i, '');
  if (isSoundName(name)) return known(name);
  const n = name.toLowerCase();

  // Footsteps: "<Surface>.StepLeft" (and a ladder's), whatever the surface prop calls them.
  const stepMatch = /^(.*?)\.?step(?:left|right)$/.exec(n);
  if (stepMatch) return known(`step.${stepSurfaceFor(stepMatch[1])}`);
  if (/ladder/.test(n)) return known('step.metal', 0.8);

  if (/falldamage|land/.test(n)) return known('player.land');
  if (/jump/.test(n)) return known('player.jump');
  if (/flashlight/.test(n)) return known('radio.click', 0.7);
  if (/(hurt|pain)/.test(n)) return known('player.hurt');
  if (/(die|death)/.test(n)) return known('player.death');
  if (/(pickup|item|ammo|medkit|healthkit)/.test(n)) return known('pickup');

  if (/button|lever|switch/.test(n)) return known('button.press');
  if (/door|gate|hatch|move|latch/.test(n)) {
    return /close|stop|shut|latch|locked/.test(n) ? known('door.close') : known('door.open');
  }

  // Wind first: loops want the bed, one-shots the gust.
  if (/wind|gale|blizzard|howl/.test(n)) return known(loop ? 'wind.loop' : 'wind.gust');
  if (/creak|groan|ship|hull|strain|stress/.test(n)) return loop ? null : known('ship.groan');
  if (/static/.test(n)) return loop ? null : known('radio.static');
  if (/radio|comm/.test(n)) return known('radio.click');
  if (/unstrung|moan|whisper|voice/.test(n)) return loop ? null : known('unstrung.voice');
  if (/tuner/.test(n)) {
    if (/listen.*off/.test(n)) return known('tuner.listen_off');
    if (/listen/.test(n)) return known('tuner.listen_on');
    if (/ready|charge/.test(n)) return known('tuner.charge_ready');
    return known('tuner.shift');
  }
  if (/spark|zap|buzz/.test(n)) return known('impact.metal', 0.4);
  if (/splash|water/.test(n)) return known('impact.water');
  if (/break|impact|bullet|shatter/.test(n)) return known(`impact.${impactSurfaceFor(n)}`);
  if (/glass/.test(n)) return known('impact.glass');
  if (/metal|steel/.test(n)) return known('impact.metal');
  if (/wood|crate/.test(n)) return known('impact.wood');
  if (/ice/.test(n)) return known('impact.ice');
  if (/snow/.test(n)) return known('impact.snow');
  if (/concrete|rock|stone/.test(n)) return known('impact.concrete');

  // The soft default: a muted tick for one-shots; an unknown loop is dropped (it would never end).
  if (loop) return null;
  return { sound: 'misc.soft', gain: 1, rate: 1, known: false };
}

/**
 * Map a simulation event to the bus events it should cause (0..n). `sound` events go through
 * `resolveEngineSound`; pickups, deaths and impact effects have their own sounds.
 */
export function mapSimEvent(ev: SpEvent): HarmonicSoundEvent[] {
  switch (ev.type) {
    case 'sound': {
      if (ev.setVolume !== undefined) return [];
      const r = resolveEngineSound(ev.name, !!ev.loop);
      if (!r) return [];
      if (ev.stop) return [{ type: 'stop', sound: r.sound, entity: ev.entity }];
      // Beds and music are driven by area/music events, never by a stray sound name.
      if (r.sound.startsWith('bed.') || r.sound.startsWith('music.')) return [];
      return [
        {
          type: 'sfx',
          sound: r.sound,
          pos: ev.pos,
          entity: ev.entity,
          volume: (ev.volume ?? 1) * r.gain,
          // A script pitch is a percentage (100 = unchanged).
          rate: r.rate * (ev.pitch && ev.pitch > 0 ? ev.pitch / 100 : 1),
        },
      ];
    }
    case 'pickup':
      return [{ type: 'sfx', sound: 'pickup' }];
    case 'death':
      return [{ type: 'sfx', sound: 'player.death' }];
    case 'effect':
      switch (ev.kind) {
        case 'impact':
          return [
            { type: 'sfx', sound: 'impact.concrete', pos: ev.pos, entity: ev.entity, volume: 0.8 },
          ];
        case 'spark':
          return [{ type: 'sfx', sound: 'impact.metal', pos: ev.pos, volume: 0.35 }];
        case 'splash':
          return [{ type: 'sfx', sound: 'impact.water', pos: ev.pos }];
        case 'break':
          return [{ type: 'sfx', sound: 'impact.glass', pos: ev.pos }];
        default:
          return [];
      }
    default:
      return [];
  }
}
