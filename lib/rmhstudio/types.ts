/**
 * RMHStudio — Core Type Definitions
 */

// ─── Drum Sound Types ────────────────────────────────────────────

export type DrumSoundType =
  | 'kick'
  | 'snare'
  | 'hihat-closed'
  | 'hihat-open'
  | 'clap'
  | 'tom'
  | 'rimshot'
  | 'cymbal'
  | 'perc';

// ─── Step & Pattern ──────────────────────────────────────────────

export interface Step {
  active: boolean;
  velocity: number; // 0–1
}

export interface Pattern {
  id: string;
  name: string;
  stepCount: number; // 16, 32, or 64
  /** steps[channelIndex][stepIndex] */
  steps: Step[][];
}

// ─── Instrument Types ────────────────────────────────────────────

export type InstrumentType = 'drum' | 'wavelab' | 'drift';

export type OscWaveform = 'sine' | 'sawtooth' | 'square' | 'triangle';

export interface OscParams {
  waveform: OscWaveform;
  coarse: number;  // semitones, -24 to +24
  fine: number;    // cents, -100 to +100
  level: number;   // 0–1
}

export interface ADSREnvelope {
  attack: number;  // seconds, 0.001–2
  decay: number;   // seconds, 0.001–2
  sustain: number; // 0–1
  release: number; // seconds, 0.001–4
}

export interface WaveLabParams {
  osc1: OscParams;
  osc2: OscParams;
  filter: {
    type: 'lowpass' | 'highpass' | 'bandpass';
    cutoff: number;     // Hz, 20–20000
    resonance: number;  // 0–30 (Q)
    envAmount: number;  // -1 to +1
  };
  ampEnv: ADSREnvelope;
  filterEnv: ADSREnvelope;
}

export interface DriftParams {
  osc1: { waveform: OscWaveform; level: number };
  osc2: { waveform: OscWaveform; level: number };
  sub: { enabled: boolean; octave: -1 | -2 };
  filter: {
    cutoff: number;     // Hz, 20–20000
    resonance: number;  // 0–30
    envAmount: number;  // -1 to +1
    drive: number;      // 0–1
  };
  ampEnv: ADSREnvelope;
  filterEnv: ADSREnvelope;
  glide: number;  // seconds, 0–0.5
  accent: number; // 0–1
  drift: number;  // 0–1
}

export type SynthParams = WaveLabParams | DriftParams;

// ─── Channel ─────────────────────────────────────────────────────

export interface Channel {
  id: string;
  name: string;
  instrument: InstrumentType;
  soundType: DrumSoundType; // used when instrument === 'drum'
  note: number; // MIDI note (e.g. 60 = C4), used by melodic synths
  synthParams?: SynthParams;
  volume: number; // 0–1
  pan: number; // -1 (L) to 1 (R)
  mute: boolean;
  solo: boolean;
  color: string; // hex color
}

// ─── Project ─────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  bpm: number;
  swing: number; // 0–1
  patterns: Pattern[];
  channels: Channel[];
  currentPatternId: string;
  masterVolume: number;
  createdAt: number; // timestamp
  updatedAt: number;
}

// ─── UI State ────────────────────────────────────────────────────

export type ActiveView = 'sequencer' | 'mixer';

export interface StudioSettings {
  theme: 'dark' | 'light';
  metronomeEnabled: boolean;
  metronomeVolume: number; // 0–1
}

// ─── Defaults ────────────────────────────────────────────────────

export const DEFAULT_CHANNEL_COLORS: string[] = [
  '#e74c3c', // kick — red
  '#f39c12', // snare — orange
  '#2ecc71', // hihat closed — green
  '#27ae60', // hihat open — dark green
  '#9b59b6', // clap — purple
  '#3498db', // tom — blue
  '#e67e22', // rimshot — dark orange
  '#1abc9c', // cymbal — teal
  '#8e44ad', // wavelab 1 — violet
  '#2980b9', // wavelab 2 — dark blue
  '#c0392b', // drift 1 — dark red
  '#d35400', // drift 2 — burnt orange
];

export function createDefaultWaveLabParams(): WaveLabParams {
  return {
    osc1: { waveform: 'sawtooth', coarse: 0, fine: 0, level: 0.7 },
    osc2: { waveform: 'square', coarse: 0, fine: -10, level: 0.3 },
    filter: { type: 'lowpass', cutoff: 4000, resonance: 2, envAmount: 0.4 },
    ampEnv: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.2 },
    filterEnv: { attack: 0.01, decay: 0.4, sustain: 0.3, release: 0.3 },
  };
}

export function createDefaultDriftParams(): DriftParams {
  return {
    osc1: { waveform: 'sawtooth', level: 0.7 },
    osc2: { waveform: 'square', level: 0.3 },
    sub: { enabled: true, octave: -1 },
    filter: { cutoff: 2000, resonance: 5, envAmount: 0.5, drive: 0.2 },
    ampEnv: { attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.15 },
    filterEnv: { attack: 0.005, decay: 0.3, sustain: 0.2, release: 0.2 },
    glide: 0.05,
    accent: 0.4,
    drift: 0.15,
  };
}

const drumChannel = (id: string, name: string, soundType: DrumSoundType, volume: number, color: string): Channel => ({
  id, name, instrument: 'drum', soundType, note: 60, volume, pan: 0, mute: false, solo: false, color,
});

const synthChannel = (id: string, name: string, instrument: InstrumentType, note: number, volume: number, color: string, synthParams: SynthParams): Channel => ({
  id, name, instrument, soundType: 'kick', note, volume, pan: 0, mute: false, solo: false, color, synthParams,
});

export const DEFAULT_CHANNELS: Channel[] = [
  drumChannel('ch-kick',   'Kick',       'kick',         0.8,  DEFAULT_CHANNEL_COLORS[0]),
  drumChannel('ch-snare',  'Snare',      'snare',        0.7,  DEFAULT_CHANNEL_COLORS[1]),
  drumChannel('ch-hh-c',   'Hi-Hat (C)', 'hihat-closed', 0.5,  DEFAULT_CHANNEL_COLORS[2]),
  drumChannel('ch-hh-o',   'Hi-Hat (O)', 'hihat-open',   0.5,  DEFAULT_CHANNEL_COLORS[3]),
  drumChannel('ch-clap',   'Clap',       'clap',         0.65, DEFAULT_CHANNEL_COLORS[4]),
  drumChannel('ch-tom',    'Tom',        'tom',          0.7,  DEFAULT_CHANNEL_COLORS[5]),
  drumChannel('ch-rim',    'Rimshot',    'rimshot',      0.6,  DEFAULT_CHANNEL_COLORS[6]),
  drumChannel('ch-cymbal', 'Cymbal',     'cymbal',       0.5,  DEFAULT_CHANNEL_COLORS[7]),
  synthChannel('ch-wl-1',  'WaveLab 1',  'wavelab', 60, 0.6, DEFAULT_CHANNEL_COLORS[8],  createDefaultWaveLabParams()),
  synthChannel('ch-wl-2',  'WaveLab 2',  'wavelab', 67, 0.6, DEFAULT_CHANNEL_COLORS[9],  createDefaultWaveLabParams()),
  synthChannel('ch-dr-1',  'Drift 1',    'drift',   48, 0.6, DEFAULT_CHANNEL_COLORS[10], createDefaultDriftParams()),
  synthChannel('ch-dr-2',  'Drift 2',    'drift',   55, 0.6, DEFAULT_CHANNEL_COLORS[11], createDefaultDriftParams()),
];

export function createEmptyPattern(id: string, name: string, channelCount: number, stepCount = 16): Pattern {
  const steps: Step[][] = [];
  for (let ch = 0; ch < channelCount; ch++) {
    const row: Step[] = [];
    for (let s = 0; s < stepCount; s++) {
      row.push({ active: false, velocity: 0.8 });
    }
    steps.push(row);
  }
  return { id, name, stepCount, steps };
}

export function createDefaultProject(): Project {
  const channels = DEFAULT_CHANNELS.map(ch => ({ ...ch }));
  const pattern = createEmptyPattern('pat-1', 'Pattern 1', channels.length, 16);
  return {
    id: crypto.randomUUID(),
    name: 'Untitled Project',
    bpm: 140,
    swing: 0,
    patterns: [pattern],
    channels,
    currentPatternId: pattern.id,
    masterVolume: 0.8,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
