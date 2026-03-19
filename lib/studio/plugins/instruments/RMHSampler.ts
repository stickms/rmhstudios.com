import type * as ToneNS from 'tone';
import type { InstrumentPlugin } from '../plugin-types';
import type { PluginParam, PluginPreset } from '../../types';

/**
 * RMH Sampler — wraps Tone.Sampler for sample-based playback.
 * Users load their own samples; until then uses a basic sine placeholder.
 */
export class RMHSampler implements InstrumentPlugin {
  readonly id = 'rmh-sampler';
  readonly name = 'RMH Sampler';
  readonly type = 'instrument' as const;
  readonly category = 'Sampler';

  private synth: ToneNS.PolySynth | null = null;
  private channel: ToneNS.Channel | null = null;
  private params: Record<string, number> = { volume: 0.8, attack: 0, release: 0.5 };

  createNode(tone: typeof ToneNS): ToneNS.ToneAudioNode {
    this.channel = new tone.Channel({ volume: 0 });

    // Placeholder: a simple synth until real samples are loaded
    this.synth = new tone.PolySynth(tone.Synth, {
      maxPolyphony: 16,
      oscillator: { type: 'sine' },
      envelope: {
        attack: this.params.attack || 0,
        decay: 0.5,
        sustain: 0.5,
        release: this.params.release || 0.5,
      },
    } as any).connect(this.channel);

    return this.channel;
  }

  getNode() { return this.channel; }
  connect(dest: ToneNS.InputNode) { this.channel?.connect(dest); }
  disconnect() { this.channel?.disconnect(); }
  dispose() {
    this.synth?.dispose();
    this.channel?.dispose();
    this.synth = null; this.channel = null;
  }

  triggerAttack(note: string | number, velocity = 0.8, time?: number) {
    this.synth?.triggerAttack(note as string, time, velocity);
  }
  triggerRelease(note: string | number, time?: number) {
    this.synth?.triggerRelease(note as string, time);
  }
  triggerAttackRelease(note: string | number, duration: number | string, time?: number, velocity = 0.8) {
    this.synth?.triggerAttackRelease(note as string, duration, time, velocity);
  }
  releaseAll(time?: number) { this.synth?.releaseAll(time); }

  getParams(): PluginParam[] {
    return [
      { id: 'volume', name: 'Volume', min: 0, max: 1, default: 0.8, step: 0.01 },
      { id: 'attack', name: 'Attack', min: 0, max: 2, default: 0, step: 0.001, unit: 's' },
      { id: 'release', name: 'Release', min: 0, max: 5, default: 0.5, step: 0.01, unit: 's' },
    ];
  }

  getParam(name: string) { return this.params[name] ?? 0; }
  getAllParams() { return { ...this.params }; }
  setParam(name: string, value: number) { this.params[name] = value; }
  setAllParams(p: Record<string, number>) { Object.assign(this.params, p); }
  getPresets(): PluginPreset[] { return []; }
  loadPreset(preset: PluginPreset) { this.setAllParams(preset.params); }
}
