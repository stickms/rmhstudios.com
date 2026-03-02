/**
 * WaveLabSynth — Subtractive Synthesizer Engine
 *
 * Signal chain:
 *   [Osc1] + [Osc2] → [Mix Gain] → [Filter] → [Amp Gain] → destination
 *
 * Each play() call creates self-contained Web Audio nodes that auto-disconnect.
 */

import type { WaveLabParams } from '../types';

/** Convert MIDI note to frequency in Hz */
function midiToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/** Apply ADSR envelope to an AudioParam */
function applyADSR(
  param: AudioParam,
  time: number,
  peak: number,
  env: { attack: number; decay: number; sustain: number; release: number },
  duration: number,
): void {
  const { attack, decay, sustain, release } = env;
  const sustainLevel = peak * sustain;

  param.setValueAtTime(0, time);
  param.linearRampToValueAtTime(peak, time + attack);
  param.linearRampToValueAtTime(sustainLevel, time + attack + decay);
  // Hold sustain until note off
  param.setValueAtTime(sustainLevel, time + duration);
  param.linearRampToValueAtTime(0, time + duration + release);
}

export class WaveLabSynth {
  constructor(
    private ctx: AudioContext,
    private destination: AudioNode,
  ) {}

  play(time: number, velocity: number, note: number, params: WaveLabParams): void {
    const v = Math.max(0, Math.min(1, velocity));
    const freq = midiToFreq(note);

    // Note duration — 1/4 of a beat at ~140 BPM, capped reasonably
    const duration = 0.15;

    // ── Oscillator 1 ──
    const osc1 = this.ctx.createOscillator();
    osc1.type = params.osc1.waveform;
    osc1.frequency.setValueAtTime(
      freq * Math.pow(2, params.osc1.coarse / 12 + params.osc1.fine / 1200),
      time,
    );
    const osc1Gain = this.ctx.createGain();
    osc1Gain.gain.setValueAtTime(params.osc1.level, time);
    osc1.connect(osc1Gain);

    // ── Oscillator 2 ──
    const osc2 = this.ctx.createOscillator();
    osc2.type = params.osc2.waveform;
    osc2.frequency.setValueAtTime(
      freq * Math.pow(2, params.osc2.coarse / 12 + params.osc2.fine / 1200),
      time,
    );
    const osc2Gain = this.ctx.createGain();
    osc2Gain.gain.setValueAtTime(params.osc2.level, time);
    osc2.connect(osc2Gain);

    // ── Mix → Filter → Amp → Destination ──
    const mixGain = this.ctx.createGain();
    mixGain.gain.setValueAtTime(1, time);
    osc1Gain.connect(mixGain);
    osc2Gain.connect(mixGain);

    // Filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = params.filter.type;
    filter.Q.setValueAtTime(params.filter.resonance, time);
    mixGain.connect(filter);

    // Filter envelope: modulate cutoff
    const baseCutoff = params.filter.cutoff;
    const envRange = params.filter.envAmount * (20000 - baseCutoff);
    applyADSR(
      filter.frequency,
      time,
      baseCutoff + envRange,
      params.filterEnv,
      duration,
    );
    // Set floor after envelope
    filter.frequency.setValueAtTime(baseCutoff, time);

    // Amp envelope
    const amp = this.ctx.createGain();
    filter.connect(amp);
    amp.connect(this.destination);

    applyADSR(amp.gain, time, v, params.ampEnv, duration);

    // Start & stop oscillators
    const totalDuration = duration + params.ampEnv.release + 0.1;
    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + totalDuration);
    osc2.stop(time + totalDuration);
  }
}
