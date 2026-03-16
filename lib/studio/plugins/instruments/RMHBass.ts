import type * as ToneNS from 'tone';
import type { InstrumentPlugin } from '../plugin-types';
import type { PluginParam, PluginPreset } from '../../types';
import { INSTRUMENT_DESCRIPTORS } from '../PluginRegistry';

const OSC_TYPES: OscillatorType[] = ['sawtooth', 'square', 'triangle', 'sine'];
const descriptor = INSTRUMENT_DESCRIPTORS.find((d) => d.id === 'rmh-bass')!;

export class RMHBass implements InstrumentPlugin {
  readonly id = 'rmh-bass';
  readonly name = 'RMH Bass';
  readonly type = 'instrument' as const;
  readonly category = 'Bass';

  private synth: ToneNS.MonoSynth | null = null;
  private subSynth: ToneNS.Synth | null = null;
  private distortion: ToneNS.Distortion | null = null;
  private channel: ToneNS.Channel | null = null;
  private tone: typeof ToneNS | null = null;
  private params: Record<string, number> = { ...descriptor.defaultPreset };

  createNode(tone: typeof ToneNS): ToneNS.ToneAudioNode {
    this.tone = tone;
    this.channel = new tone.Channel({ volume: 0 });

    this.distortion = new tone.Distortion({
      distortion: this.params.drive || 0,
      wet: this.params.drive > 0 ? 1 : 0,
    });

    this.synth = new tone.MonoSynth({
      oscillator: { type: OSC_TYPES[this.params.oscType] || 'sawtooth' },
      filter: {
        Q: this.params.filterRes,
        type: 'lowpass',
        frequency: this.params.filterFreq,
      },
      envelope: {
        attack: this.params.attack,
        decay: this.params.decay,
        sustain: this.params.sustain,
        release: this.params.release,
      },
      filterEnvelope: {
        attack: this.params.attack,
        decay: this.params.decay,
        sustain: 0.3,
        release: this.params.release,
        baseFrequency: 100,
        octaves: 2.5,
      },
    });

    this.synth.set({ portamento: this.params.glide || 0.05 });
    this.synth.chain(this.distortion, this.channel);

    // Sub oscillator — 1 octave down, sine
    this.subSynth = new tone.Synth({
      oscillator: { type: 'sine' },
      envelope: {
        attack: this.params.attack,
        decay: this.params.decay,
        sustain: this.params.sustain,
        release: this.params.release,
      },
      volume: -6 + (this.params.subLevel || 0.5) * 12 - 6,
    }).connect(this.channel);

    return this.channel;
  }

  getNode() { return this.channel; }
  connect(dest: ToneNS.InputNode) { this.channel?.connect(dest); }
  disconnect() { this.channel?.disconnect(); }

  dispose() {
    this.subSynth?.dispose();
    this.synth?.dispose();
    this.distortion?.dispose();
    this.channel?.dispose();
    this.synth = null;
    this.subSynth = null;
    this.distortion = null;
    this.channel = null;
  }

  triggerAttack(note: string | number, velocity = 0.8, time?: number) {
    this.synth?.triggerAttack(note as string, time, velocity);
    // Sub: 1 octave down
    const subNote = typeof note === 'number' ? note - 12 : this.transposeNote(note as string, -12);
    this.subSynth?.triggerAttack(subNote, time, velocity);
  }

  triggerRelease(note: string | number, time?: number) {
    this.synth?.triggerRelease(time);
    this.subSynth?.triggerRelease(time);
  }

  triggerAttackRelease(note: string | number, duration: number | string, time?: number, velocity = 0.8) {
    this.synth?.triggerAttackRelease(note as string, duration, time, velocity);
    const subNote = typeof note === 'number' ? note - 12 : this.transposeNote(note as string, -12);
    this.subSynth?.triggerAttackRelease(subNote, duration, time, velocity);
  }

  releaseAll(time?: number) {
    this.synth?.triggerRelease(time);
    this.subSynth?.triggerRelease(time);
  }

  getParams(): PluginParam[] { return descriptor.params; }
  getParam(name: string) { return this.params[name] ?? 0; }
  getAllParams() { return { ...this.params }; }
  getPresets(): PluginPreset[] { return descriptor.presets; }

  setParam(name: string, value: number) {
    this.params[name] = value;
    if (!this.synth) return;

    switch (name) {
      case 'oscType':
        this.synth.set({ oscillator: { type: OSC_TYPES[value] || 'sawtooth' } });
        break;
      case 'drive':
        this.distortion?.set({ distortion: value, wet: value > 0 ? 1 : 0 });
        break;
      case 'subLevel':
        if (this.subSynth) this.subSynth.volume.value = -6 + value * 12 - 6;
        break;
      case 'glide':
        this.synth.set({ portamento: value });
        break;
      case 'filterFreq':
        this.synth.set({ filter: { frequency: value } });
        break;
      case 'filterRes':
        this.synth.set({ filter: { Q: value } });
        break;
      case 'attack':
      case 'decay':
      case 'sustain':
      case 'release':
        this.synth.set({ envelope: { [name]: value } });
        this.subSynth?.set({ envelope: { [name]: value } });
        break;
    }
  }

  setAllParams(p: Record<string, number>) { for (const [k, v] of Object.entries(p)) this.setParam(k, v); }
  loadPreset(preset: PluginPreset) { this.setAllParams({ ...descriptor.defaultPreset, ...preset.params }); }

  private transposeNote(note: string, semitones: number): string {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const match = note.match(/^([A-G]#?)(\d+)$/);
    if (!match) return note;
    const idx = names.indexOf(match[1]);
    const octave = parseInt(match[2]);
    const midi = (octave + 1) * 12 + idx + semitones;
    return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
  }
}
