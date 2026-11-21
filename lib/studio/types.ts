// ─── Core Project Types ─────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  bpm: number;
  timeSignature: [number, number];
  tracks: Track[];
  clips: Record<string, Clip>;
  patterns: Pattern[];
  masterVolume: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
}

// ─── Track Types ────────────────────────────────────────────────────────────

export type TrackType = 'audio' | 'midi' | 'automation';

export interface Send {
  busId: string;
  level: number; // 0–1
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  color: string;
  volume: number; // 0–1
  pan: number; // -1 to 1
  muted: boolean;
  soloed: boolean;
  armed: boolean;
  clipIds: string[];
  pluginChain: PluginInstance[];
  sends: Send[];
  height: number; // Track lane height in px
}

// ─── Clip Types ─────────────────────────────────────────────────────────────

export type ClipType = 'audio' | 'midi' | 'automation' | 'pattern';

export interface BaseClip {
  id: string;
  trackId: string;
  type: ClipType;
  name: string;
  startBeat: number;
  durationBeats: number;
  color: string;
}

export interface AudioClipData extends BaseClip {
  type: 'audio';
  bufferId: string; // Reference to SampleManager cache
  sampleOffset: number;
  fadeInBeats: number;
  fadeOutBeats: number;
}

export interface MidiClipData extends BaseClip {
  type: 'midi';
  notes: MidiNote[];
}

export interface AutomationClipData extends BaseClip {
  type: 'automation';
  automationParam: string;
  breakpoints: AutomationPoint[];
}

export interface PatternClipData extends BaseClip {
  type: 'pattern';
  patternId: string;
}

export type Clip = AudioClipData | MidiClipData | AutomationClipData | PatternClipData;

// ─── MIDI Types ─────────────────────────────────────────────────────────────

export interface MidiNote {
  id: string;
  pitch: number; // 0–127
  startBeat: number; // Relative to clip start
  durationBeats: number;
  velocity: number; // 0–127
}

export interface AutomationPoint {
  beat: number;
  value: number; // 0–1 normalized
  curve: 'linear' | 'exponential' | 'step';
}

// ─── Pattern Types ──────────────────────────────────────────────────────────

export interface PatternTrack {
  instrumentId: string;
  steps: PatternStep[];
}

export interface PatternStep {
  active: boolean;
  velocity: number;
  pitch?: number;
}

export interface Pattern {
  id: string;
  name: string;
  lengthBeats: number;
  stepsPerBeat: number; // e.g., 4 for 16th notes in 4/4
  tracks: PatternTrack[];
}

// ─── Plugin Types ───────────────────────────────────────────────────────────

export type PluginType = 'instrument' | 'effect';

export interface PluginParam {
  id: string;
  name: string;
  min: number;
  max: number;
  default: number;
  step: number;
  unit?: string; // e.g., 'Hz', 'dB', 'ms', '%'
}

export interface PluginPreset {
  id: string;
  name: string;
  params: Record<string, number>;
}

export interface PluginInstance {
  id: string;
  pluginId: string; // e.g., 'rmh-synth', 'studio-reverb'
  type: PluginType;
  params: Record<string, number>;
  preset: string | null;
  bypassed: boolean;
}

export interface PluginDescriptor {
  id: string;
  name: string;
  type: PluginType;
  category: string;
  description: string;
  defaultPreset: Record<string, number>;
  params: PluginParam[];
  presets: PluginPreset[];
}

// ─── Sample Types ───────────────────────────────────────────────────────────

export interface SampleMeta {
  id: string;
  name: string;
  duration: number; // seconds
  sampleRate: number;
  channels: number;
  size: number; // bytes
  folder: string;
  tags: string[];
}

export interface SamplePack {
  id: string;
  name: string;
  description: string;
  category: 'drums' | 'bass' | 'keys' | 'fx' | 'loops' | 'ir' | 'misc';
  samples: SamplePackEntry[];
  license: string;
  source: string;
}

export interface SamplePackEntry {
  name: string;
  url: string;
  category: string;
}

// ─── UI State Types ─────────────────────────────────────────────────────────

export type ViewMode = 'arrangement' | 'pianoRoll' | 'mixer' | 'pattern';
export type ToolMode = 'select' | 'draw' | 'erase' | 'slice' | 'mute';

// ─── Keybind Types ──────────────────────────────────────────────────────────

export interface KeybindAction {
  id: string;
  category: string;
  label: string;
  defaultKeys: string[];
  /** If true, this keybind works even when typing keyboard is enabled */
  allowInTypingKeyboard: boolean;
}

export type KeybindMap = Record<string, string[]>;

// ─── Settings ───────────────────────────────────────────────────────────────

export interface StudioSettings {
  audioDeviceId: string | null;
  bufferSize: number;
  defaultBpm: number;
  defaultTimeSignature: [number, number];
  recentProjects: ProjectMeta[];
  keybindOverrides: KeybindMap;
  typingKeyboardVelocity: number; // 0–127
  typingKeyboardOctave: number; // base octave for lower row
}
