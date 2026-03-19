import type * as ToneNS from 'tone';
import type { InstrumentPlugin } from '../plugin-types';
import type { PluginParam, PluginPreset } from '../../types';
import { INSTRUMENT_DESCRIPTORS } from '../PluginRegistry';

const descriptor = INSTRUMENT_DESCRIPTORS.find((d) => d.id === 'rmh-pad')!;

/**
 * RMH Pad — lush atmospheric pad synth using detuned poly voices + filter.
 */
export class RMHPad implements InstrumentPlugin {
  readonly id = 'rmh-pad';
  readonly name = 'RMH Pad';
  readonly type = 'instrument' as const;
  readonly category = 'Pad';

  private synth: ToneNS.PolySynth | null = null;
  private filter: ToneNS.Filter | null = null;
  private chorus: ToneNS.Chorus | null = null;
  private channel: ToneNS.Channel | null = null;
  private params: Record<string, number> = { ...descriptor.defaultPreset };

  createNode(tone: typeof ToneNS): ToneNS.ToneAudioNode {
    this.channel = new tone.Channel({ volume: 0 });

    this.filter = new tone.Filter({
      frequency: this.params.filterFreq || 3000,
      type: 'lowpass',
      Q: 0.7,
    });

    this.chorus = new tone.Chorus({
      frequency: 0.5,
      delayTime: 3.5,
      depth: 0.7,
      wet: 0.5,
    }).start();

    this.synth = new tone.PolySynth(tone.Synth, {
      maxPolyphony: 8,
      oscillator: { type: 'fatsawtooth', spread: this.params.spread * 40 || 12, count: 3 },
      envelope: {
        attack: this.params.attack || 1.5,
        decay: 2,
        sustain: 0.8,
        release: this.params.release || 3,
      },
      detune: this.params.detune || 7,
    } as any);

    this.synth.chain(this.filter, this.chorus, this.channel);
    return this.channel;
  }

  getNode() { return this.channel; }
  connect(dest: ToneNS.InputNode) { this.channel?.connect(dest); }
  disconnect() { this.channel?.disconnect(); }

  dispose() {
    this.synth?.dispose();
    this.filter?.dispose();
    this.chorus?.dispose();
    this.channel?.dispose();
    this.synth = null; this.filter = null; this.chorus = null; this.channel = null;
  }

  triggerAttack(note: string | number, velocity = 0.6, time?: number) {
    this.synth?.triggerAttack(note as string, time, velocity);
  }
  triggerRelease(note: string | number, time?: number) {
    this.synth?.triggerRelease(note as string, time);
  }
  triggerAttackRelease(note: string | number, duration: number | string, time?: number, velocity = 0.6) {
    this.synth?.triggerAttackRelease(note as string, duration, time, velocity);
  }
  releaseAll(time?: number) { this.synth?.releaseAll(time); }

  getParams(): PluginParam[] { return descriptor.params; }
  getParam(name: string) { return this.params[name] ?? 0; }
  getAllParams() { return { ...this.params }; }
  getPresets(): PluginPreset[] { return descriptor.presets; }

  setParam(name: string, value: number) {
    this.params[name] = value;
    if (name === 'filterFreq' && this.filter) this.filter.frequency.value = value;
    if (name === 'attack' && this.synth) this.synth.set({ envelope: { attack: value } });
    if (name === 'release' && this.synth) this.synth.set({ envelope: { release: value } });
    if (name === 'detune' && this.synth) this.synth.set({ detune: value });
  }

  setAllParams(p: Record<string, number>) { for (const [k, v] of Object.entries(p)) this.setParam(k, v); }
  loadPreset(preset: PluginPreset) { this.setAllParams({ ...descriptor.defaultPreset, ...preset.params }); }
}
