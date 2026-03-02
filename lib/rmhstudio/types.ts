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

// ─── Channel ─────────────────────────────────────────────────────

export interface Channel {
  id: string;
  name: string;
  soundType: DrumSoundType;
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
];

export const DEFAULT_CHANNELS: Channel[] = [
  { id: 'ch-kick',    name: 'Kick',          soundType: 'kick',        volume: 0.8, pan: 0, mute: false, solo: false, color: DEFAULT_CHANNEL_COLORS[0] },
  { id: 'ch-snare',   name: 'Snare',         soundType: 'snare',       volume: 0.7, pan: 0, mute: false, solo: false, color: DEFAULT_CHANNEL_COLORS[1] },
  { id: 'ch-hh-c',    name: 'Hi-Hat (C)',     soundType: 'hihat-closed', volume: 0.5, pan: 0, mute: false, solo: false, color: DEFAULT_CHANNEL_COLORS[2] },
  { id: 'ch-hh-o',    name: 'Hi-Hat (O)',     soundType: 'hihat-open',  volume: 0.5, pan: 0, mute: false, solo: false, color: DEFAULT_CHANNEL_COLORS[3] },
  { id: 'ch-clap',    name: 'Clap',          soundType: 'clap',        volume: 0.65, pan: 0, mute: false, solo: false, color: DEFAULT_CHANNEL_COLORS[4] },
  { id: 'ch-tom',     name: 'Tom',           soundType: 'tom',         volume: 0.7, pan: 0, mute: false, solo: false, color: DEFAULT_CHANNEL_COLORS[5] },
  { id: 'ch-rim',     name: 'Rimshot',       soundType: 'rimshot',     volume: 0.6, pan: 0, mute: false, solo: false, color: DEFAULT_CHANNEL_COLORS[6] },
  { id: 'ch-cymbal',  name: 'Cymbal',        soundType: 'cymbal',      volume: 0.5, pan: 0, mute: false, solo: false, color: DEFAULT_CHANNEL_COLORS[7] },
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
