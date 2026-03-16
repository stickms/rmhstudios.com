import type * as ToneNS from 'tone';
import type { InstrumentPlugin } from '../plugin-types';
import type { PluginParam, PluginPreset } from '../../types';

/**
 * RMH Keys — Synthesized piano-like instrument using FM synthesis.
 * (Real sample-based piano would need external samples; this provides
 * a playable piano-like sound out of the box.)
 */
export class RMHKeys implements InstrumentPlugin {
  readonly id = 'rmh-keys';
  readonly name = 'RMH Keys';
  readonly type = 'instrument' as const;
  readonly category = 'Keys';

  private synth: ToneNS.PolySynth | null = null;
  private reverb: ToneNS.Reverb | null = null;
  private filter: ToneNS.Filter | null = null;
  private channel: ToneNS.Channel | null = null;
  private params: Record<string, number> = { brightness: 0.7, reverb: 0.3 };

  createNode(tone: typeof ToneNS): ToneNS.ToneAudioNode {
    this.channel = new tone.Channel({ volume: 0 });

    this.filter = new tone.Filter({
      frequency: 2000 + this.params.brightness * 8000,
      type: 'lowpass',
    });

    this.reverb = new tone.Reverb({ decay: 2, wet: this.params.reverb });

    this.synth = new tone.PolySynth(tone.Synth, {
      maxPolyphony: 10,
      oscillator: { type: 'fmtriangle', modulationType: 'sine' },
      envelope: { attack: 0.005, decay: 1.2, sustain: 0.1, release: 1.5 },
      volume: -6,
    } as any);

    this.synth.chain(this.filter, this.reverb, this.channel);
    return this.channel;
  }

  getNode() { return this.channel; }
  connect(dest: ToneNS.InputNode) { this.channel?.connect(dest); }
  disconnect() { this.channel?.disconnect(); }

  dispose() {
    this.synth?.dispose();
    this.filter?.dispose();
    this.reverb?.dispose();
    this.channel?.dispose();
    this.synth = null; this.filter = null; this.reverb = null; this.channel = null;
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
      { id: 'brightness', name: 'Brightness', min: 0, max: 1, default: 0.7, step: 0.01 },
      { id: 'reverb', name: 'Reverb', min: 0, max: 1, default: 0.3, step: 0.01 },
    ];
  }

  getParam(name: string) { return this.params[name] ?? 0; }
  getAllParams() { return { ...this.params }; }

  setParam(name: string, value: number) {
    this.params[name] = value;
    if (name === 'brightness' && this.filter) {
      this.filter.frequency.value = 2000 + value * 8000;
    }
    if (name === 'reverb' && this.reverb) {
      this.reverb.wet.value = value;
    }
  }

  setAllParams(p: Record<string, number>) { for (const [k, v] of Object.entries(p)) this.setParam(k, v); }
  getPresets(): PluginPreset[] { return []; }
  loadPreset(preset: PluginPreset) { this.setAllParams(preset.params); }
}
