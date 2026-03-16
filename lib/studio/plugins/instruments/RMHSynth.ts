import type * as ToneNS from 'tone';
import type { InstrumentPlugin } from '../plugin-types';
import type { PluginParam, PluginPreset } from '../../types';
import { INSTRUMENT_DESCRIPTORS } from '../PluginRegistry';

const OSC_TYPES: OscillatorType[] = ['sawtooth', 'square', 'triangle', 'sine'];
const FILTER_TYPES: BiquadFilterType[] = ['lowpass', 'highpass', 'bandpass'];
const descriptor = INSTRUMENT_DESCRIPTORS.find((d) => d.id === 'rmh-synth')!;

export class RMHSynth implements InstrumentPlugin {
  readonly id = 'rmh-synth';
  readonly name = 'RMH Synth';
  readonly type = 'instrument' as const;
  readonly category = 'Synthesizer';

  private synth: ToneNS.PolySynth | null = null;
  private filter: ToneNS.Filter | null = null;
  private lfo: ToneNS.LFO | null = null;
  private tone: typeof ToneNS | null = null;
  private params: Record<string, number> = { ...descriptor.defaultPreset };

  createNode(tone: typeof ToneNS): ToneNS.ToneAudioNode {
    this.tone = tone;

    this.filter = new tone.Filter({
      frequency: this.params.filterFreq,
      Q: this.params.filterRes,
      type: FILTER_TYPES[this.params.filterType] || 'lowpass',
    });

    this.synth = new tone.PolySynth(tone.Synth, {
      maxPolyphony: 16,
      oscillator: { type: OSC_TYPES[this.params.osc1Type] || 'sawtooth' },
      envelope: {
        attack: this.params.attack,
        decay: this.params.decay,
        sustain: this.params.sustain,
        release: this.params.release,
      },
    } as any).connect(this.filter);

    this.lfo = new tone.LFO({
      frequency: this.params.lfoRate,
      min: 0,
      max: 1,
    }).start();

    this.applyLfoTarget();

    return this.filter;
  }

  getNode() { return this.filter; }

  connect(dest: ToneNS.InputNode) { this.filter?.connect(dest); }
  disconnect() { this.filter?.disconnect(); }

  dispose() {
    this.lfo?.dispose();
    this.synth?.dispose();
    this.filter?.dispose();
    this.lfo = null;
    this.synth = null;
    this.filter = null;
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

  releaseAll(time?: number) {
    this.synth?.releaseAll(time);
  }

  getParams(): PluginParam[] { return descriptor.params; }
  getParam(name: string) { return this.params[name] ?? 0; }
  getAllParams() { return { ...this.params }; }
  getPresets(): PluginPreset[] { return descriptor.presets; }

  setParam(name: string, value: number) {
    this.params[name] = value;
    if (!this.synth || !this.filter || !this.lfo) return;

    switch (name) {
      case 'osc1Type':
        this.synth.set({ oscillator: { type: OSC_TYPES[value] || 'sawtooth' } });
        break;
      case 'filterFreq':
        this.filter.frequency.value = value;
        break;
      case 'filterRes':
        this.filter.Q.value = value;
        break;
      case 'filterType':
        this.filter.type = FILTER_TYPES[value] || 'lowpass';
        break;
      case 'attack':
      case 'decay':
      case 'sustain':
      case 'release':
        this.synth.set({ envelope: { [name]: value } });
        break;
      case 'lfoRate':
        this.lfo.frequency.value = value;
        break;
      case 'lfoDepth':
      case 'lfoTarget':
        this.applyLfoTarget();
        break;
    }
  }

  setAllParams(params: Record<string, number>) {
    for (const [k, v] of Object.entries(params)) this.setParam(k, v);
  }

  loadPreset(preset: PluginPreset) {
    const full = { ...descriptor.defaultPreset, ...preset.params };
    this.setAllParams(full);
  }

  private applyLfoTarget() {
    if (!this.lfo || !this.filter || !this.synth) return;
    this.lfo.disconnect();
    const depth = this.params.lfoDepth || 0;
    if (depth <= 0) return;

    this.lfo.min = -depth;
    this.lfo.max = depth;

    switch (Math.round(this.params.lfoTarget)) {
      case 0: // Pitch
        this.lfo.connect((this.synth as any).detune);
        this.lfo.min = -depth * 100;
        this.lfo.max = depth * 100;
        break;
      case 1: // Filter
        this.lfo.connect(this.filter.frequency as any);
        this.lfo.min = this.params.filterFreq * (1 - depth);
        this.lfo.max = this.params.filterFreq * (1 + depth);
        break;
      case 2: // Amplitude
        this.lfo.connect(this.synth.volume as any);
        this.lfo.min = -depth * 20;
        this.lfo.max = 0;
        break;
    }
  }
}
