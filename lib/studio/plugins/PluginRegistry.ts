import type { PluginDescriptor } from '../types';

/**
 * Registry of all built-in instrument and effect plugins.
 * Used to populate "Add Plugin" menus and create new instances.
 */
export const INSTRUMENT_DESCRIPTORS: PluginDescriptor[] = [
  {
    id: 'rmh-synth',
    name: 'RMH Synth',
    type: 'instrument',
    category: 'Synthesizer',
    description: 'Subtractive synth with 2 oscillators, filter, ADSR, and LFO.',
    defaultPreset: {
      osc1Type: 0, osc1Detune: 0, osc2Type: 1, osc2Detune: 5, osc2Mix: 0.5,
      filterFreq: 2000, filterRes: 1, filterType: 0,
      attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.5,
      lfoRate: 2, lfoDepth: 0, lfoTarget: 0,
    },
    params: [
      { id: 'osc1Type', name: 'Osc 1 Type', min: 0, max: 4, default: 0, step: 1 },
      { id: 'osc1Detune', name: 'Osc 1 Detune', min: -100, max: 100, default: 0, step: 1, unit: 'cents' },
      { id: 'osc2Type', name: 'Osc 2 Type', min: 0, max: 4, default: 1, step: 1 },
      { id: 'osc2Detune', name: 'Osc 2 Detune', min: -100, max: 100, default: 5, step: 1, unit: 'cents' },
      { id: 'osc2Mix', name: 'Osc 2 Mix', min: 0, max: 1, default: 0.5, step: 0.01 },
      { id: 'filterFreq', name: 'Filter Freq', min: 20, max: 20000, default: 2000, step: 1, unit: 'Hz' },
      { id: 'filterRes', name: 'Filter Res', min: 0, max: 20, default: 1, step: 0.1, unit: 'Q' },
      { id: 'filterType', name: 'Filter Type', min: 0, max: 2, default: 0, step: 1 },
      { id: 'attack', name: 'Attack', min: 0.001, max: 5, default: 0.01, step: 0.001, unit: 's' },
      { id: 'decay', name: 'Decay', min: 0.001, max: 5, default: 0.3, step: 0.001, unit: 's' },
      { id: 'sustain', name: 'Sustain', min: 0, max: 1, default: 0.7, step: 0.01 },
      { id: 'release', name: 'Release', min: 0.001, max: 10, default: 0.5, step: 0.001, unit: 's' },
      { id: 'lfoRate', name: 'LFO Rate', min: 0.1, max: 30, default: 2, step: 0.1, unit: 'Hz' },
      { id: 'lfoDepth', name: 'LFO Depth', min: 0, max: 1, default: 0, step: 0.01 },
      { id: 'lfoTarget', name: 'LFO Target', min: 0, max: 2, default: 0, step: 1 },
    ],
    presets: [
      { id: 'init', name: 'Init', params: {} },
      { id: 'supersaw', name: 'Super Saw', params: { osc1Type: 0, osc2Type: 0, osc2Detune: 12, osc2Mix: 0.6, filterFreq: 5000, attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.3 } },
      { id: 'deep-bass', name: 'Deep Bass', params: { osc1Type: 0, osc2Type: 2, osc2Detune: 0, osc2Mix: 0.3, filterFreq: 400, filterRes: 3, attack: 0.005, decay: 0.4, sustain: 0.5, release: 0.2 } },
      { id: 'pluck', name: 'Pluck', params: { osc1Type: 1, filterFreq: 3000, filterRes: 2, attack: 0.001, decay: 0.15, sustain: 0, release: 0.3 } },
      { id: 'pad', name: 'Lush Pad', params: { osc1Type: 0, osc2Type: 2, osc2Detune: 7, osc2Mix: 0.5, filterFreq: 1500, attack: 0.8, decay: 1, sustain: 0.9, release: 2, lfoRate: 0.5, lfoDepth: 0.3, lfoTarget: 1 } },
    ],
  },
  {
    id: 'rmh-drums',
    name: 'RMH Drums',
    type: 'instrument',
    category: 'Drums',
    description: '16-pad drum machine with built-in step sequencer.',
    defaultPreset: {},
    params: [
      { id: 'volume', name: 'Volume', min: 0, max: 1, default: 0.8, step: 0.01 },
      { id: 'pitch', name: 'Pitch', min: -24, max: 24, default: 0, step: 1, unit: 'st' },
    ],
    presets: [],
  },
  {
    id: 'rmh-keys',
    name: 'RMH Keys',
    type: 'instrument',
    category: 'Keys',
    description: 'Sample-based piano with velocity layers.',
    defaultPreset: { brightness: 0.7, reverb: 0.3 },
    params: [
      { id: 'brightness', name: 'Brightness', min: 0, max: 1, default: 0.7, step: 0.01 },
      { id: 'reverb', name: 'Reverb', min: 0, max: 1, default: 0.3, step: 0.01 },
    ],
    presets: [],
  },
  {
    id: 'rmh-bass',
    name: 'RMH Bass',
    type: 'instrument',
    category: 'Bass',
    description: 'Mono bass synth with sub-oscillator and drive.',
    defaultPreset: {
      oscType: 0, subLevel: 0.5, drive: 0, glide: 0.05,
      filterFreq: 800, filterRes: 2,
      attack: 0.005, decay: 0.3, sustain: 0.6, release: 0.2,
    },
    params: [
      { id: 'oscType', name: 'Osc Type', min: 0, max: 3, default: 0, step: 1 },
      { id: 'subLevel', name: 'Sub Level', min: 0, max: 1, default: 0.5, step: 0.01 },
      { id: 'drive', name: 'Drive', min: 0, max: 1, default: 0, step: 0.01 },
      { id: 'glide', name: 'Glide', min: 0, max: 1, default: 0.05, step: 0.01, unit: 's' },
      { id: 'filterFreq', name: 'Filter Freq', min: 20, max: 10000, default: 800, step: 1, unit: 'Hz' },
      { id: 'filterRes', name: 'Filter Res', min: 0, max: 20, default: 2, step: 0.1 },
      { id: 'attack', name: 'Attack', min: 0.001, max: 2, default: 0.005, step: 0.001, unit: 's' },
      { id: 'decay', name: 'Decay', min: 0.001, max: 3, default: 0.3, step: 0.001, unit: 's' },
      { id: 'sustain', name: 'Sustain', min: 0, max: 1, default: 0.6, step: 0.01 },
      { id: 'release', name: 'Release', min: 0.001, max: 5, default: 0.2, step: 0.001, unit: 's' },
    ],
    presets: [
      { id: '808-sub', name: '808 Sub', params: { oscType: 2, subLevel: 0.8, drive: 0.1, filterFreq: 300, attack: 0.001, decay: 0.8, sustain: 0.2, release: 0.5 } },
      { id: 'reese', name: 'Reese', params: { oscType: 0, subLevel: 0.6, drive: 0.3, filterFreq: 600, filterRes: 4, attack: 0.01, decay: 0.5, sustain: 0.5, release: 0.3 } },
    ],
  },
  {
    id: 'rmh-sampler',
    name: 'RMH Sampler',
    type: 'instrument',
    category: 'Sampler',
    description: 'Multi-zone sampler with pitch shifting.',
    defaultPreset: {},
    params: [
      { id: 'volume', name: 'Volume', min: 0, max: 1, default: 0.8, step: 0.01 },
      { id: 'attack', name: 'Attack', min: 0, max: 2, default: 0, step: 0.001, unit: 's' },
      { id: 'release', name: 'Release', min: 0, max: 5, default: 0.5, step: 0.01, unit: 's' },
    ],
    presets: [],
  },
  {
    id: 'rmh-pad',
    name: 'RMH Pad',
    type: 'instrument',
    category: 'Pad',
    description: 'Granular pad synth for lush atmospheric textures.',
    defaultPreset: {
      grainSize: 0.2, overlap: 0.5, spread: 0.3, detune: 7,
      attack: 1.5, release: 3, filterFreq: 3000,
    },
    params: [
      { id: 'grainSize', name: 'Grain Size', min: 0.01, max: 1, default: 0.2, step: 0.01, unit: 's' },
      { id: 'overlap', name: 'Overlap', min: 0, max: 1, default: 0.5, step: 0.01 },
      { id: 'spread', name: 'Spread', min: 0, max: 1, default: 0.3, step: 0.01 },
      { id: 'detune', name: 'Detune', min: 0, max: 50, default: 7, step: 1, unit: 'cents' },
      { id: 'attack', name: 'Attack', min: 0.01, max: 10, default: 1.5, step: 0.01, unit: 's' },
      { id: 'release', name: 'Release', min: 0.01, max: 15, default: 3, step: 0.01, unit: 's' },
      { id: 'filterFreq', name: 'Filter', min: 100, max: 15000, default: 3000, step: 1, unit: 'Hz' },
    ],
    presets: [],
  },
];

export const EFFECT_DESCRIPTORS: PluginDescriptor[] = [
  {
    id: 'studio-reverb', name: 'Reverb', type: 'effect', category: 'Reverb',
    description: 'Reverb with decay and pre-delay.',
    defaultPreset: { decay: 2.5, preDelay: 0.01, wet: 0.3 },
    params: [
      { id: 'decay', name: 'Decay', min: 0.1, max: 20, default: 2.5, step: 0.1, unit: 's' },
      { id: 'preDelay', name: 'Pre-Delay', min: 0, max: 0.5, default: 0.01, step: 0.001, unit: 's' },
      { id: 'wet', name: 'Wet', min: 0, max: 1, default: 0.3, step: 0.01 },
    ],
    presets: [
      { id: 'hall', name: 'Hall', params: { decay: 4, preDelay: 0.03, wet: 0.35 } },
      { id: 'room', name: 'Room', params: { decay: 1.2, preDelay: 0.005, wet: 0.25 } },
      { id: 'plate', name: 'Plate', params: { decay: 2, preDelay: 0, wet: 0.3 } },
    ],
  },
  {
    id: 'studio-delay', name: 'Delay', type: 'effect', category: 'Delay',
    description: 'Sync-able feedback delay.',
    defaultPreset: { delayTime: 0.375, feedback: 0.35, wet: 0.25 },
    params: [
      { id: 'delayTime', name: 'Time', min: 0.01, max: 2, default: 0.375, step: 0.001, unit: 's' },
      { id: 'feedback', name: 'Feedback', min: 0, max: 0.95, default: 0.35, step: 0.01 },
      { id: 'wet', name: 'Wet', min: 0, max: 1, default: 0.25, step: 0.01 },
    ],
    presets: [
      { id: 'quarter', name: '1/4 Note', params: { delayTime: 0.5, feedback: 0.3, wet: 0.25 } },
      { id: 'eighth', name: '1/8 Note', params: { delayTime: 0.25, feedback: 0.4, wet: 0.3 } },
      { id: 'dotted', name: 'Dotted 1/8', params: { delayTime: 0.375, feedback: 0.45, wet: 0.3 } },
    ],
  },
  {
    id: 'studio-compressor', name: 'Compressor', type: 'effect', category: 'Dynamics',
    description: 'Dynamics compressor with visual gain reduction.',
    defaultPreset: { threshold: -24, ratio: 4, attack: 0.003, release: 0.25, knee: 10 },
    params: [
      { id: 'threshold', name: 'Threshold', min: -60, max: 0, default: -24, step: 0.5, unit: 'dB' },
      { id: 'ratio', name: 'Ratio', min: 1, max: 20, default: 4, step: 0.5 },
      { id: 'attack', name: 'Attack', min: 0, max: 1, default: 0.003, step: 0.001, unit: 's' },
      { id: 'release', name: 'Release', min: 0.01, max: 2, default: 0.25, step: 0.01, unit: 's' },
      { id: 'knee', name: 'Knee', min: 0, max: 40, default: 10, step: 1, unit: 'dB' },
    ],
    presets: [
      { id: 'gentle', name: 'Gentle', params: { threshold: -20, ratio: 2, attack: 0.01, release: 0.3, knee: 20 } },
      { id: 'punchy', name: 'Punchy', params: { threshold: -18, ratio: 6, attack: 0.001, release: 0.1, knee: 5 } },
    ],
  },
  {
    id: 'studio-eq', name: 'EQ', type: 'effect', category: 'EQ',
    description: 'Parametric EQ with low, mid, and high bands.',
    defaultPreset: { lowGain: 0, midGain: 0, highGain: 0, lowFreq: 300, highFreq: 3000 },
    params: [
      { id: 'lowGain', name: 'Low', min: -12, max: 12, default: 0, step: 0.5, unit: 'dB' },
      { id: 'midGain', name: 'Mid', min: -12, max: 12, default: 0, step: 0.5, unit: 'dB' },
      { id: 'highGain', name: 'High', min: -12, max: 12, default: 0, step: 0.5, unit: 'dB' },
      { id: 'lowFreq', name: 'Low Freq', min: 50, max: 1000, default: 300, step: 1, unit: 'Hz' },
      { id: 'highFreq', name: 'High Freq', min: 1000, max: 15000, default: 3000, step: 1, unit: 'Hz' },
    ],
    presets: [],
  },
  {
    id: 'studio-distortion', name: 'Distortion', type: 'effect', category: 'Distortion',
    description: 'Saturation and overdrive.',
    defaultPreset: { drive: 0.4, wet: 0.5 },
    params: [
      { id: 'drive', name: 'Drive', min: 0, max: 1, default: 0.4, step: 0.01 },
      { id: 'wet', name: 'Wet', min: 0, max: 1, default: 0.5, step: 0.01 },
    ],
    presets: [],
  },
  {
    id: 'studio-chorus', name: 'Chorus', type: 'effect', category: 'Modulation',
    description: 'Chorus modulation effect.',
    defaultPreset: { frequency: 1.5, depth: 0.7, delayTime: 3.5, wet: 0.5 },
    params: [
      { id: 'frequency', name: 'Rate', min: 0.1, max: 10, default: 1.5, step: 0.1, unit: 'Hz' },
      { id: 'depth', name: 'Depth', min: 0, max: 1, default: 0.7, step: 0.01 },
      { id: 'delayTime', name: 'Delay', min: 0.5, max: 20, default: 3.5, step: 0.1, unit: 'ms' },
      { id: 'wet', name: 'Wet', min: 0, max: 1, default: 0.5, step: 0.01 },
    ],
    presets: [],
  },
  {
    id: 'studio-filter', name: 'Filter', type: 'effect', category: 'Filter',
    description: 'Multi-mode filter with resonance.',
    defaultPreset: { frequency: 1000, Q: 1, type: 0, wet: 1 },
    params: [
      { id: 'frequency', name: 'Frequency', min: 20, max: 20000, default: 1000, step: 1, unit: 'Hz' },
      { id: 'Q', name: 'Resonance', min: 0.1, max: 20, default: 1, step: 0.1 },
      { id: 'type', name: 'Type', min: 0, max: 3, default: 0, step: 1 },
      { id: 'wet', name: 'Wet', min: 0, max: 1, default: 1, step: 0.01 },
    ],
    presets: [],
  },
  {
    id: 'studio-limiter', name: 'Limiter', type: 'effect', category: 'Dynamics',
    description: 'Brick-wall limiter.',
    defaultPreset: { threshold: -3 },
    params: [
      { id: 'threshold', name: 'Ceiling', min: -30, max: 0, default: -3, step: 0.5, unit: 'dB' },
    ],
    presets: [],
  },
];

export const ALL_PLUGIN_DESCRIPTORS = [...INSTRUMENT_DESCRIPTORS, ...EFFECT_DESCRIPTORS];

export function getPluginDescriptor(pluginId: string): PluginDescriptor | undefined {
  return ALL_PLUGIN_DESCRIPTORS.find((d) => d.id === pluginId);
}
