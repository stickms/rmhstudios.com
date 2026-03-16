import type { StudioSettings } from './types';

// ─── Transport Defaults ─────────────────────────────────────────────────────

export const DEFAULT_BPM = 120;
export const MIN_BPM = 20;
export const MAX_BPM = 999;
export const DEFAULT_TIME_SIGNATURE: [number, number] = [4, 4];

// ─── Grid & Snap ────────────────────────────────────────────────────────────

/** Snap values in beats (fractions of a quarter note) */
export const SNAP_VALUES = [
  { label: '1 Bar', beats: 4 },
  { label: '1/2', beats: 2 },
  { label: '1/4', beats: 1 },
  { label: '1/8', beats: 0.5 },
  { label: '1/16', beats: 0.25 },
  { label: '1/32', beats: 0.125 },
  { label: '1/64', beats: 0.0625 },
] as const;

export const DEFAULT_SNAP_VALUE = 0.25; // 1/16th note

// ─── Track Defaults ─────────────────────────────────────────────────────────

export const DEFAULT_TRACK_HEIGHT = 80;
export const MIN_TRACK_HEIGHT = 40;
export const MAX_TRACK_HEIGHT = 200;

export const TRACK_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#f43f5e', '#14b8a6', '#6366f1', '#a855f7',
] as const;

// ─── MIDI ───────────────────────────────────────────────────────────────────

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const MIN_MIDI_NOTE = 0;
export const MAX_MIDI_NOTE = 127;
export const DEFAULT_VELOCITY = 100;
export const DEFAULT_NOTE_LENGTH = 0.25; // 1/16th note in beats

/** Middle C = C4 = MIDI 60 */
export const MIDDLE_C = 60;

// ─── Piano Roll ─────────────────────────────────────────────────────────────

export const PIANO_KEY_WIDTH = 48;
export const NOTE_HEIGHT = 16;
export const BEATS_PER_PIXEL_DEFAULT = 0.02; // zoom level

// ─── Mixer ──────────────────────────────────────────────────────────────────

export const MASTER_BUS_ID = 'master';
export const AUX_BUS_PREFIX = 'aux-';
export const MAX_CHANNEL_DB = 6;
export const MIN_CHANNEL_DB = -60;
export const VU_METER_FPS = 30;

// ─── Audio ──────────────────────────────────────────────────────────────────

export const SAMPLE_RATE = 44100;
export const BUFFER_SIZES = [128, 256, 512, 1024, 2048, 4096] as const;
export const DEFAULT_BUFFER_SIZE = 1024;

// ─── UI ─────────────────────────────────────────────────────────────────────

export const MOBILE_BREAKPOINT = 768;

// ─── Settings Defaults ──────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: StudioSettings = {
  audioDeviceId: null,
  bufferSize: DEFAULT_BUFFER_SIZE,
  defaultBpm: DEFAULT_BPM,
  defaultTimeSignature: DEFAULT_TIME_SIGNATURE,
  recentProjects: [],
  keybindOverrides: {},
  typingKeyboardVelocity: DEFAULT_VELOCITY,
  typingKeyboardOctave: 3,
};
