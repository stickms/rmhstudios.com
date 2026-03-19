import type { SamplePack } from '../types';

/**
 * Metadata for curated CC0/royalty-free sample packs.
 * These are fetched on-demand, not bundled in the repo.
 */
export const SAMPLE_PACKS: SamplePack[] = [
  {
    id: '808-kit',
    name: '808 Drum Kit',
    description: 'Classic Roland TR-808 drum machine sounds. Kick, snare, hats, claps, toms, cowbell, and more.',
    category: 'drums',
    license: 'CC0 1.0',
    source: 'freesound.org',
    samples: [
      { name: '808 Kick', url: '', category: 'kick' },
      { name: '808 Snare', url: '', category: 'snare' },
      { name: '808 Closed HH', url: '', category: 'hihat' },
      { name: '808 Open HH', url: '', category: 'hihat' },
      { name: '808 Clap', url: '', category: 'clap' },
      { name: '808 Cowbell', url: '', category: 'perc' },
      { name: '808 Tom Low', url: '', category: 'tom' },
      { name: '808 Tom Mid', url: '', category: 'tom' },
      { name: '808 Tom High', url: '', category: 'tom' },
    ],
  },
  {
    id: '909-kit',
    name: '909 Drum Kit',
    description: 'Classic Roland TR-909 drum sounds. Punchy kicks, crisp snares, and sizzling hats.',
    category: 'drums',
    license: 'CC0 1.0',
    source: 'freesound.org',
    samples: [
      { name: '909 Kick', url: '', category: 'kick' },
      { name: '909 Snare', url: '', category: 'snare' },
      { name: '909 Closed HH', url: '', category: 'hihat' },
      { name: '909 Open HH', url: '', category: 'hihat' },
      { name: '909 Clap', url: '', category: 'clap' },
      { name: '909 Ride', url: '', category: 'cymbal' },
      { name: '909 Crash', url: '', category: 'cymbal' },
    ],
  },
  {
    id: 'lofi-kit',
    name: 'Lo-Fi Kit',
    description: 'Dusty, vinyl-textured drum sounds and textures for lo-fi beats.',
    category: 'drums',
    license: 'CC0 1.0',
    source: 'freesound.org/pixabay',
    samples: [
      { name: 'Lo-Fi Kick', url: '', category: 'kick' },
      { name: 'Lo-Fi Snare', url: '', category: 'snare' },
      { name: 'Lo-Fi Hat', url: '', category: 'hihat' },
      { name: 'Vinyl Crackle', url: '', category: 'texture' },
      { name: 'Tape Hiss', url: '', category: 'texture' },
    ],
  },
  {
    id: 'bass-one-shots',
    name: 'Bass One-Shots',
    description: '808 subs, reese bass, acid bass, and FM bass one-shots.',
    category: 'bass',
    license: 'CC0 1.0',
    source: 'freesound.org',
    samples: [
      { name: '808 Sub C', url: '', category: 'sub' },
      { name: '808 Sub Deep', url: '', category: 'sub' },
      { name: 'Reese Bass', url: '', category: 'reese' },
      { name: 'Acid Bass', url: '', category: 'acid' },
    ],
  },
  {
    id: 'impulse-responses',
    name: 'Impulse Responses',
    description: 'Hall, room, plate, and spring reverb impulse responses for convolution reverb.',
    category: 'ir',
    license: 'CC0 1.0',
    source: 'openair.hosted.york.ac.uk',
    samples: [
      { name: 'Large Hall', url: '', category: 'hall' },
      { name: 'Small Room', url: '', category: 'room' },
      { name: 'Plate', url: '', category: 'plate' },
      { name: 'Spring', url: '', category: 'spring' },
    ],
  },
  {
    id: 'fx-pack',
    name: 'FX & Transitions',
    description: 'Risers, impacts, sweeps, and vinyl scratches for transitions.',
    category: 'fx',
    license: 'CC0 1.0',
    source: 'pixabay/zapsplat',
    samples: [
      { name: 'Riser Up', url: '', category: 'riser' },
      { name: 'Impact Hit', url: '', category: 'impact' },
      { name: 'Sweep Down', url: '', category: 'sweep' },
      { name: 'Vinyl Scratch', url: '', category: 'scratch' },
    ],
  },
];
