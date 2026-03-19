import type * as ToneNS from 'tone';
import type { InstrumentPlugin } from '../plugin-types';
import type { PluginParam, PluginPreset } from '../../types';

/**
 * RMH Drums — 16-pad drum machine using synthesized sounds.
 * Each pad triggers a different synthesized drum hit.
 */
export class RMHDrums implements InstrumentPlugin {
  readonly id = 'rmh-drums';
  readonly name = 'RMH Drums';
  readonly type = 'instrument' as const;
  readonly category = 'Drums';

  private channel: ToneNS.Channel | null = null;
  private tone: typeof ToneNS | null = null;
  private synths: Map<number, ToneNS.Synth | ToneNS.NoiseSynth | ToneNS.MembraneSynth | ToneNS.MetalSynth> = new Map();
  private params: Record<string, number> = { volume: 0.8, pitch: 0 };

  createNode(tone: typeof ToneNS): ToneNS.ToneAudioNode {
    this.tone = tone;
    this.channel = new tone.Channel({ volume: 0 });
    this.initDrumSynths(tone);
    return this.channel;
  }

  private initDrumSynths(tone: typeof ToneNS) {
    if (!this.channel) return;

    // Pad 0: Kick
    const kick = new tone.MembraneSynth({
      pitchDecay: 0.05, octaves: 6, envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.1 },
    }).connect(this.channel);
    this.synths.set(36, kick); // C2

    // Pad 1: Snare
    const snare = new tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
    }).connect(this.channel);
    this.synths.set(38, snare); // D2

    // Pad 2: Closed HH
    const chh = new tone.MetalSynth({
      frequency: 400, envelope: { attack: 0.001, decay: 0.08, release: 0.01 },
      harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5,
    } as any).connect(this.channel);
    (chh as any).volume.value = -10;
    this.synths.set(42, chh); // F#2

    // Pad 3: Open HH
    const ohh = new tone.MetalSynth({
      frequency: 400, envelope: { attack: 0.001, decay: 0.3, release: 0.1 },
      harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5,
    } as any).connect(this.channel);
    (ohh as any).volume.value = -10;
    this.synths.set(46, ohh); // A#2

    // Pad 4: Clap
    const clap = new tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0, release: 0.1 },
    }).connect(this.channel);
    this.synths.set(39, clap); // D#2

    // Pad 5: Tom (high)
    const tomH = new tone.MembraneSynth({
      pitchDecay: 0.03, octaves: 4,
      envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.1 },
    }).connect(this.channel);
    this.synths.set(50, tomH); // D3

    // Pad 6: Tom (mid)
    const tomM = new tone.MembraneSynth({
      pitchDecay: 0.03, octaves: 4,
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
    }).connect(this.channel);
    this.synths.set(47, tomM); // B2

    // Pad 7: Tom (low)
    const tomL = new tone.MembraneSynth({
      pitchDecay: 0.04, octaves: 5,
      envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 },
    }).connect(this.channel);
    this.synths.set(45, tomL); // A2

    // Pad 8-15: Additional percussion using Synth with short envelopes
    const percNotes = [41, 43, 48, 49, 51, 52, 53, 54]; // Various MIDI
    for (const note of percNotes) {
      const perc = new tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 },
      }).connect(this.channel);
      this.synths.set(note, perc);
    }
  }

  getNode() { return this.channel; }
  connect(dest: ToneNS.InputNode) { this.channel?.connect(dest); }
  disconnect() { this.channel?.disconnect(); }

  dispose() {
    for (const synth of this.synths.values()) synth.dispose();
    this.synths.clear();
    this.channel?.dispose();
    this.channel = null;
  }

  triggerAttack(note: string | number, velocity = 0.8, time?: number) {
    const midi = typeof note === 'string' ? this.noteToMidi(note) : note;
    const synth = this.synths.get(midi) || this.synths.get(36); // fallback to kick
    if (!synth) return;

    if ('triggerAttack' in synth && 'triggerRelease' in synth) {
      if (synth instanceof (this.tone!.NoiseSynth)) {
        (synth as ToneNS.NoiseSynth).triggerAttack(time);
      } else if (synth instanceof (this.tone!.MetalSynth)) {
        (synth as ToneNS.MetalSynth).triggerAttack(time as any, velocity);
      } else {
        (synth as any).triggerAttack(note, time, velocity);
      }
    }
  }

  triggerRelease(note: string | number, time?: number) {
    const midi = typeof note === 'string' ? this.noteToMidi(note) : note;
    const synth = this.synths.get(midi);
    if (synth && 'triggerRelease' in synth) {
      (synth as any).triggerRelease(time);
    }
  }

  triggerAttackRelease(note: string | number, duration: number | string, time?: number, velocity = 0.8) {
    const midi = typeof note === 'string' ? this.noteToMidi(note) : note;
    const synth = this.synths.get(midi) || this.synths.get(36);
    if (!synth) return;

    if (synth instanceof (this.tone!.NoiseSynth)) {
      (synth as ToneNS.NoiseSynth).triggerAttackRelease(duration, time);
    } else if (synth instanceof (this.tone!.MetalSynth)) {
      (synth as ToneNS.MetalSynth).triggerAttackRelease(duration as any, time as any, velocity);
    } else {
      (synth as any).triggerAttackRelease(note, duration, time, velocity);
    }
  }

  releaseAll() {
    // Drums are one-shot, no sustained notes
  }

  getParams(): PluginParam[] { return []; }
  getParam(name: string) { return this.params[name] ?? 0; }
  getAllParams() { return { ...this.params }; }
  setParam(name: string, value: number) { this.params[name] = value; }
  setAllParams(p: Record<string, number>) { Object.assign(this.params, p); }
  getPresets(): PluginPreset[] { return []; }
  loadPreset(preset: PluginPreset) { this.setAllParams(preset.params); }

  /** Map of pad index (0-15) to MIDI note number */
  static PAD_NOTES = [36, 38, 42, 46, 39, 50, 47, 45, 41, 43, 48, 49, 51, 52, 53, 54];
  static PAD_LABELS = ['Kick', 'Snare', 'CH', 'OH', 'Clap', 'Tom H', 'Tom M', 'Tom L',
    'Perc 1', 'Perc 2', 'Perc 3', 'Perc 4', 'Perc 5', 'Perc 6', 'Perc 7', 'Perc 8'];

  private noteToMidi(note: string): number {
    const names: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
    const match = note.match(/^([A-G]#?)(\d+)$/);
    if (!match) return 60;
    return (parseInt(match[2]) + 1) * 12 + (names[match[1]] ?? 0);
  }
}
