import type * as ToneNS from 'tone';
import type { EffectPlugin } from '../plugin-types';
import type { PluginParam, PluginPreset } from '../../types';
import { EFFECT_DESCRIPTORS } from '../PluginRegistry';

/**
 * Base class for effect plugins to reduce boilerplate.
 */
abstract class BaseEffect implements EffectPlugin {
  abstract readonly id: string;
  abstract readonly name: string;
  readonly type = 'effect' as const;
  abstract readonly category: string;

  protected node: ToneNS.ToneAudioNode | null = null;
  protected params: Record<string, number> = {};

  abstract createNode(tone: typeof ToneNS): ToneNS.ToneAudioNode;
  abstract applyParam(name: string, value: number): void;

  getNode() { return this.node; }
  connect(dest: ToneNS.InputNode) { this.node?.connect(dest); }
  disconnect() { this.node?.disconnect(); }
  dispose() { this.node?.dispose(); this.node = null; }

  getParams(): PluginParam[] {
    return EFFECT_DESCRIPTORS.find((d) => d.id === this.id)?.params ?? [];
  }
  getParam(name: string) { return this.params[name] ?? 0; }
  getAllParams() { return { ...this.params }; }
  setParam(name: string, value: number) { this.params[name] = value; this.applyParam(name, value); }
  setAllParams(p: Record<string, number>) { for (const [k, v] of Object.entries(p)) this.setParam(k, v); }
  getPresets(): PluginPreset[] { return EFFECT_DESCRIPTORS.find((d) => d.id === this.id)?.presets ?? []; }
  loadPreset(preset: PluginPreset) {
    const defaults = EFFECT_DESCRIPTORS.find((d) => d.id === this.id)?.defaultPreset ?? {};
    this.setAllParams({ ...defaults, ...preset.params });
  }
  setWet(value: number) { if (this.node && 'wet' in this.node) (this.node as any).wet.value = value; }
  getWet() { return (this.node && 'wet' in this.node) ? (this.node as any).wet.value : 0; }
}

// ─── Reverb ─────────────────────────────────────────────────────────────────

export class StudioReverb extends BaseEffect {
  readonly id = 'studio-reverb';
  readonly name = 'Reverb';
  readonly category = 'Reverb';

  createNode(tone: typeof ToneNS) {
    const desc = EFFECT_DESCRIPTORS.find((d) => d.id === this.id)!;
    this.params = { ...desc.defaultPreset };
    this.node = new tone.Reverb({
      decay: this.params.decay,
      preDelay: this.params.preDelay,
      wet: this.params.wet,
    });
    return this.node;
  }

  applyParam(name: string, value: number) {
    if (!this.node) return;
    const r = this.node as ToneNS.Reverb;
    if (name === 'decay') r.decay = value;
    if (name === 'preDelay') r.preDelay = value;
    if (name === 'wet') r.wet.value = value;
  }
}

// ─── Delay ──────────────────────────────────────────────────────────────────

export class StudioDelay extends BaseEffect {
  readonly id = 'studio-delay';
  readonly name = 'Delay';
  readonly category = 'Delay';

  createNode(tone: typeof ToneNS) {
    const desc = EFFECT_DESCRIPTORS.find((d) => d.id === this.id)!;
    this.params = { ...desc.defaultPreset };
    this.node = new tone.FeedbackDelay({
      delayTime: this.params.delayTime,
      feedback: this.params.feedback,
      wet: this.params.wet,
    });
    return this.node;
  }

  applyParam(name: string, value: number) {
    if (!this.node) return;
    const d = this.node as ToneNS.FeedbackDelay;
    if (name === 'delayTime') d.delayTime.value = value;
    if (name === 'feedback') d.feedback.value = value;
    if (name === 'wet') d.wet.value = value;
  }
}

// ─── Compressor ─────────────────────────────────────────────────────────────

export class StudioCompressor extends BaseEffect {
  readonly id = 'studio-compressor';
  readonly name = 'Compressor';
  readonly category = 'Dynamics';

  createNode(tone: typeof ToneNS) {
    const desc = EFFECT_DESCRIPTORS.find((d) => d.id === this.id)!;
    this.params = { ...desc.defaultPreset };
    this.node = new tone.Compressor({
      threshold: this.params.threshold,
      ratio: this.params.ratio,
      attack: this.params.attack,
      release: this.params.release,
      knee: this.params.knee,
    });
    return this.node;
  }

  applyParam(name: string, value: number) {
    if (!this.node) return;
    const c = this.node as ToneNS.Compressor;
    if (name === 'threshold') c.threshold.value = value;
    if (name === 'ratio') c.ratio.value = value;
    if (name === 'attack') c.attack.value = value;
    if (name === 'release') c.release.value = value;
    if (name === 'knee') c.knee.value = value;
  }
}

// ─── EQ ─────────────────────────────────────────────────────────────────────

export class StudioEQ extends BaseEffect {
  readonly id = 'studio-eq';
  readonly name = 'EQ';
  readonly category = 'EQ';

  createNode(tone: typeof ToneNS) {
    const desc = EFFECT_DESCRIPTORS.find((d) => d.id === this.id)!;
    this.params = { ...desc.defaultPreset };
    this.node = new tone.EQ3({
      low: this.params.lowGain,
      mid: this.params.midGain,
      high: this.params.highGain,
      lowFrequency: this.params.lowFreq,
      highFrequency: this.params.highFreq,
    });
    return this.node;
  }

  applyParam(name: string, value: number) {
    if (!this.node) return;
    const eq = this.node as ToneNS.EQ3;
    if (name === 'lowGain') eq.low.value = value;
    if (name === 'midGain') eq.mid.value = value;
    if (name === 'highGain') eq.high.value = value;
    if (name === 'lowFreq') eq.lowFrequency.value = value;
    if (name === 'highFreq') eq.highFrequency.value = value;
  }
}

// ─── Distortion ─────────────────────────────────────────────────────────────

export class StudioDistortion extends BaseEffect {
  readonly id = 'studio-distortion';
  readonly name = 'Distortion';
  readonly category = 'Distortion';

  createNode(tone: typeof ToneNS) {
    const desc = EFFECT_DESCRIPTORS.find((d) => d.id === this.id)!;
    this.params = { ...desc.defaultPreset };
    this.node = new tone.Distortion({
      distortion: this.params.drive,
      wet: this.params.wet,
    });
    return this.node;
  }

  applyParam(name: string, value: number) {
    if (!this.node) return;
    const d = this.node as ToneNS.Distortion;
    if (name === 'drive') d.distortion = value;
    if (name === 'wet') d.wet.value = value;
  }
}

// ─── Chorus ─────────────────────────────────────────────────────────────────

export class StudioChorus extends BaseEffect {
  readonly id = 'studio-chorus';
  readonly name = 'Chorus';
  readonly category = 'Modulation';

  createNode(tone: typeof ToneNS) {
    const desc = EFFECT_DESCRIPTORS.find((d) => d.id === this.id)!;
    this.params = { ...desc.defaultPreset };
    this.node = new tone.Chorus({
      frequency: this.params.frequency,
      depth: this.params.depth,
      delayTime: this.params.delayTime,
      wet: this.params.wet,
    }).start();
    return this.node;
  }

  applyParam(name: string, value: number) {
    if (!this.node) return;
    const c = this.node as ToneNS.Chorus;
    if (name === 'frequency') c.frequency.value = value;
    if (name === 'depth') c.depth = value;
    if (name === 'delayTime') c.delayTime = value;
    if (name === 'wet') c.wet.value = value;
  }
}

// ─── Filter ─────────────────────────────────────────────────────────────────

export class StudioFilter extends BaseEffect {
  readonly id = 'studio-filter';
  readonly name = 'Filter';
  readonly category = 'Filter';

  private static TYPES: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass', 'notch'];

  createNode(tone: typeof ToneNS) {
    const desc = EFFECT_DESCRIPTORS.find((d) => d.id === this.id)!;
    this.params = { ...desc.defaultPreset };
    this.node = new tone.Filter({
      frequency: this.params.frequency,
      Q: this.params.Q,
      type: StudioFilter.TYPES[this.params.type] || 'lowpass',
    });
    return this.node;
  }

  applyParam(name: string, value: number) {
    if (!this.node) return;
    const f = this.node as ToneNS.Filter;
    if (name === 'frequency') f.frequency.value = value;
    if (name === 'Q') f.Q.value = value;
    if (name === 'type') f.type = StudioFilter.TYPES[value] || 'lowpass';
  }
}

// ─── Limiter ────────────────────────────────────────────────────────────────

export class StudioLimiter extends BaseEffect {
  readonly id = 'studio-limiter';
  readonly name = 'Limiter';
  readonly category = 'Dynamics';

  createNode(tone: typeof ToneNS) {
    const desc = EFFECT_DESCRIPTORS.find((d) => d.id === this.id)!;
    this.params = { ...desc.defaultPreset };
    this.node = new tone.Limiter(this.params.threshold);
    return this.node;
  }

  applyParam(name: string, value: number) {
    if (!this.node) return;
    if (name === 'threshold') (this.node as ToneNS.Limiter).threshold.value = value;
  }
}
