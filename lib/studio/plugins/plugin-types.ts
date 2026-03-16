import type * as ToneNS from 'tone';
import type { PluginParam, PluginPreset, PluginType } from '../types';

/**
 * Common interface all studio plugins (instruments + effects) must implement.
 */
export interface StudioPlugin {
  readonly id: string;
  readonly name: string;
  readonly type: PluginType;
  readonly category: string;

  /** Create the underlying Tone.js audio node(s). */
  createNode(tone: typeof ToneNS): ToneNS.ToneAudioNode;

  /** Get the created node (after createNode). */
  getNode(): ToneNS.ToneAudioNode | null;

  /** Connect output to a destination. */
  connect(destination: ToneNS.InputNode): void;

  /** Disconnect from everything. */
  disconnect(): void;

  /** Dispose all audio resources. */
  dispose(): void;

  /** Get all parameter definitions. */
  getParams(): PluginParam[];

  /** Get current value of a parameter. */
  getParam(name: string): number;

  /** Set a parameter value. */
  setParam(name: string, value: number): void;

  /** Get all parameter values as a map. */
  getAllParams(): Record<string, number>;

  /** Set all parameter values from a map. */
  setAllParams(params: Record<string, number>): void;

  /** Get available presets. */
  getPresets(): PluginPreset[];

  /** Load a preset by setting all params. */
  loadPreset(preset: PluginPreset): void;
}

/**
 * Extended interface for instrument plugins that can receive MIDI.
 */
export interface InstrumentPlugin extends StudioPlugin {
  readonly type: 'instrument';

  triggerAttack(note: string | number, velocity?: number, time?: number): void;
  triggerRelease(note: string | number, time?: number): void;
  triggerAttackRelease(note: string | number, duration: number | string, time?: number, velocity?: number): void;
  releaseAll(time?: number): void;
}

/**
 * Extended interface for effect plugins.
 */
export interface EffectPlugin extends StudioPlugin {
  readonly type: 'effect';
  /** Wet/dry mix 0–1 */
  setWet(value: number): void;
  getWet(): number;
}
