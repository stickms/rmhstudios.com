/**
 * The instruments RMH Music can sound, one {@link InstrumentMeta} each, and which sound a learner
 * gets by default. Pure data; the recorded zones are in the generated `zones-data.ts`.
 */
import type { Instrument } from '../../schemas';
import { ZONES } from './zones-data';
import { INSTRUMENT_IDS, type InstrumentId, type InstrumentMeta, type Zone } from './types';

export const INSTRUMENT_CATALOG: Readonly<Record<InstrumentId, InstrumentMeta>> = {
  piano: {
    id: 'piano',
    labelKey: 'sound-piano',
    range: [36, 96],
    polyphony: 'chord',
    maxVoices: 12,
    releaseMs: 300,
    strumMs: 0,
    busGain: 1,
    maxShift: 1,
    softLowpass: true,
    credit: 'salamander',
  },
  guitar: {
    id: 'guitar',
    labelKey: 'sound-guitar',
    // Zones E2 to F#5 (40 to 78) plus a semitone of shift.
    range: [40, 79],
    polyphony: 'chord',
    maxVoices: 8,
    releaseMs: 200,
    // A flat-pick strum on bronze strings is quick: a wider spread reads as an arpeggio.
    strumMs: 12,
    busGain: 1,
    maxShift: 1,
    softLowpass: false,
    credit: 'ella-gitauru',
  },
  violin: {
    id: 'violin',
    labelKey: 'sound-violin',
    range: [55, 96],
    polyphony: 'double-stop',
    maxVoices: 2,
    releaseMs: 250,
    strumMs: 0,
    busGain: 1,
    maxShift: 2,
    softLowpass: false,
    credit: 'vsco',
  },
  flute: {
    id: 'flute',
    labelKey: 'sound-flute',
    range: [60, 96],
    polyphony: 'mono',
    maxVoices: 1,
    releaseMs: 150,
    strumMs: 0,
    busGain: 1,
    maxShift: 2,
    softLowpass: false,
    credit: 'vsco',
  },
  cello: {
    id: 'cello',
    labelKey: 'sound-cello',
    // A cello section (VSCO 2 CE), zones a third apart from C2.
    range: [36, 77],
    polyphony: 'mono',
    maxVoices: 1,
    releaseMs: 250,
    strumMs: 0,
    busGain: 1,
    maxShift: 2,
    softLowpass: false,
    credit: 'vsco',
  },
  clarinet: {
    id: 'clarinet',
    labelKey: 'sound-clarinet',
    range: [50, 90],
    polyphony: 'mono',
    maxVoices: 1,
    releaseMs: 150,
    strumMs: 0,
    busGain: 1,
    maxShift: 2,
    softLowpass: false,
    credit: 'vsco',
  },
  oboe: {
    id: 'oboe',
    labelKey: 'sound-oboe',
    range: [58, 91],
    polyphony: 'mono',
    maxVoices: 1,
    releaseMs: 150,
    strumMs: 0,
    busGain: 1,
    maxShift: 2,
    softLowpass: false,
    credit: 'vsco',
  },
  'guitar-nylon': {
    id: 'guitar-nylon',
    labelKey: 'sound-guitar-nylon',
    range: [40, 84],
    polyphony: 'chord',
    maxVoices: 8,
    releaseMs: 200,
    // Fingers on nylon strings: a slightly slower spread than the steel-string pick.
    strumMs: 14,
    busGain: 1,
    maxShift: 1,
    softLowpass: false,
    credit: 'freepats-guitar',
  },
  ukulele: {
    id: 'ukulele',
    labelKey: 'sound-ukulele',
    // A tenor ukulele in re-entrant tuning: nothing below middle C.
    range: [60, 85],
    polyphony: 'chord',
    maxVoices: 4,
    releaseMs: 200,
    strumMs: 16,
    busGain: 1,
    maxShift: 1,
    softLowpass: false,
    credit: 'freepats-ukulele',
  },
  organ: {
    id: 'organ',
    labelKey: 'sound-organ',
    range: [48, 86],
    polyphony: 'chord',
    maxVoices: 8,
    // A pipe stops speaking quickly but the room rings on.
    releaseMs: 300,
    strumMs: 0,
    busGain: 1,
    maxShift: 2,
    softLowpass: false,
    credit: 'vcsl-organ',
  },
};

/**
 * The Sound dialog's families, in order: one radio group, a plain heading per family. Every id is
 * in exactly one family (catalog.test.ts).
 */
export const SOUND_FAMILIES: readonly {
  id: 'keyboards' | 'plucked' | 'bowed' | 'winds';
  ids: readonly InstrumentId[];
}[] = [
  {
    id: 'keyboards',
    ids: ['piano', 'organ'],
  },
  {
    id: 'plucked',
    ids: ['guitar', 'guitar-nylon', 'ukulele'],
  },
  {
    id: 'bowed',
    ids: ['violin', 'cello'],
  },
  {
    id: 'winds',
    ids: ['flute', 'clarinet', 'oboe'],
  },
];

export function isInstrumentId(value: unknown): value is InstrumentId {
  return typeof value === 'string' && (INSTRUMENT_IDS as readonly string[]).includes(value);
}

/** The recorded zones of an instrument (empty until its samples are built and committed). */
export function zonesOf(id: InstrumentId): readonly Zone[] {
  return ZONES[id];
}

/** Whether samples for `id` have been built; the Sound picker lists only these. */
export function isAvailable(id: InstrumentId): boolean {
  return ZONES[id].length > 0;
}

/** The sounds a learner can pick now, in the catalogue's order. */
export function availableSounds(): InstrumentId[] {
  return INSTRUMENT_IDS.filter(isAvailable);
}

/**
 * The sound a learner hears when they never chose one: their own instrument (a piano learner the
 * piano, a guitar learner the steel-string guitar, a singer the piano). Falls back to the piano
 * while the guitar's samples are not built.
 */
export function defaultSoundFor(instrument: Instrument): InstrumentId {
  return instrument === 'guitar' && isAvailable('guitar') ? 'guitar' : 'piano';
}

/**
 * The sound a learner hears: the one they chose, if its samples exist, else their instrument's
 * default (`defaultSoundFor`).
 */
export function resolveSound(profile: { instrument: Instrument; sound?: InstrumentId | null }): InstrumentId {
  return profile.sound && isAvailable(profile.sound) ? profile.sound : defaultSoundFor(profile.instrument);
}

/**
 * The sound a lesson that plays chords uses: the chosen sound if it plays chords, else the
 * learner's instrument default (violin and flute play single notes and intervals only).
 */
export function chordSoundFor(profile: { instrument: Instrument; sound?: InstrumentId | null }): InstrumentId {
  const sound = resolveSound(profile);
  return playsChords(sound) ? sound : defaultSoundFor(profile.instrument);
}

/**
 * `notes` moved by whole octaves into the range of `id`, when they fit in it (an interval or a
 * chord quality is the same an octave up), so a violin or flute question sounds on its own samples
 * instead of the synth. Notes that do not fit in any octave, or no sound, come back unchanged.
 */
export function fitToRange(notes: readonly number[], id: InstrumentId | undefined): number[] {
  if (!id || notes.length === 0) return [...notes];
  const [lo, hi] = INSTRUMENT_CATALOG[id].range;
  const min = Math.min(...notes);
  const max = Math.max(...notes);
  if (max - min > hi - lo) return [...notes];
  let shift = 0;
  while (min + shift < lo) shift += 12;
  while (max + shift > hi) shift -= 12;
  return min + shift < lo ? [...notes] : notes.map((n) => n + shift);
}

/** Whether a sound plays chords (block or strummed): the keyboards and plucked strings; the bowed strings and winds are single-note. */
export function playsChords(id: InstrumentId): boolean {
  return INSTRUMENT_CATALOG[id].polyphony === 'chord';
}

/**
 * Where a sound's files live under `public/` (served through `asset()`): one directory per
 * instrument.
 */
export const SAMPLE_DIR = '/music/rmhmusic/instruments';
