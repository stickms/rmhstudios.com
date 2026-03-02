/**
 * DriftSynth — Analog-Modeled Monosynth Engine
 *
 * Signal chain:
 *   [Osc1] + [Osc2] + [Sub] → [Mix] → [Filter1 → Filter2 (24dB ladder)] → [Amp] → destination
 *
 * Features: glide, accent (velocity-driven filter spike), analog drift.
 * Each play() creates self-contained Web Audio nodes.
 */

import type { DriftParams } from '../types';

function midiToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

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
  param.setValueAtTime(sustainLevel, time + duration);
  param.linearRampToValueAtTime(0, time + duration + release);
}

/** Track last note frequency for glide */
let lastFreq = 0;

export class DriftSynth {
  constructor(
    private ctx: AudioContext,
    private destination: AudioNode,
  ) {}

  play(time: number, velocity: number, note: number, params: DriftParams): void {
    const v = Math.max(0, Math.min(1, velocity));
    const freq = midiToFreq(note);
    const duration = 0.15;

    // ── Oscillator 1 ──
    const osc1 = this.ctx.createOscillator();
    osc1.type = params.osc1.waveform;
    const osc1Gain = this.ctx.createGain();
    osc1Gain.gain.setValueAtTime(params.osc1.level, time);
    osc1.connect(osc1Gain);

    // ── Oscillator 2 ──
    const osc2 = this.ctx.createOscillator();
    osc2.type = params.osc2.waveform;
    const osc2Gain = this.ctx.createGain();
    osc2Gain.gain.setValueAtTime(params.osc2.level, time);
    osc2.connect(osc2Gain);

    // ── Sub Oscillator ──
    let subOsc: OscillatorNode | null = null;
    let subGain: GainNode | null = null;
    if (params.sub.enabled) {
      subOsc = this.ctx.createOscillator();
      subOsc.type = 'sine';
      subGain = this.ctx.createGain();
      subGain.gain.setValueAtTime(0.5, time);
      subOsc.connect(subGain);
    }

    // ── Glide: ramp from last note to current note ──
    const glideTime = params.glide;
    const startFreq = lastFreq > 0 && glideTime > 0 ? lastFreq : freq;

    osc1.frequency.setValueAtTime(startFreq, time);
    osc2.frequency.setValueAtTime(startFreq, time);
    if (subOsc) {
      const subMul = Math.pow(2, params.sub.octave);
      subOsc.frequency.setValueAtTime(startFreq * subMul, time);
      subOsc.frequency.linearRampToValueAtTime(freq * subMul, time + glideTime);
    }

    if (glideTime > 0 && startFreq !== freq) {
      osc1.frequency.linearRampToValueAtTime(freq, time + glideTime);
      osc2.frequency.linearRampToValueAtTime(freq, time + glideTime);
    }

    lastFreq = freq;

    // ── Analog drift: small random detune via LFO ──
    if (params.drift > 0) {
      const driftLfo = this.ctx.createOscillator();
      driftLfo.type = 'sine';
      driftLfo.frequency.setValueAtTime(0.3 + Math.random() * 2, time);

      const driftGain = this.ctx.createGain();
      driftGain.gain.setValueAtTime(freq * params.drift * 0.005, time);

      driftLfo.connect(driftGain);
      driftGain.connect(osc1.frequency);
      driftGain.connect(osc2.frequency);

      driftLfo.start(time);
      driftLfo.stop(time + duration + params.ampEnv.release + 0.1);
    }

    // ── Mix ──
    const mix = this.ctx.createGain();
    mix.gain.setValueAtTime(1, time);
    osc1Gain.connect(mix);
    osc2Gain.connect(mix);
    if (subGain) subGain.connect(mix);

    // ── 24dB Ladder filter (2 × 12dB BiquadFilter) ──
    const filter1 = this.ctx.createBiquadFilter();
    filter1.type = 'lowpass';
    filter1.Q.setValueAtTime(params.filter.resonance * 0.7, time);
    const filter2 = this.ctx.createBiquadFilter();
    filter2.type = 'lowpass';
    filter2.Q.setValueAtTime(params.filter.resonance * 0.3, time);

    mix.connect(filter1);
    filter1.connect(filter2);

    // ── Filter envelope + accent ──
    const baseCutoff = params.filter.cutoff;
    const envRange = params.filter.envAmount * (20000 - baseCutoff);
    // Accent: velocity > 0.8 adds extra spike
    const accentBoost = v > 0.8 ? params.accent * 3000 : 0;
    const peakCutoff = baseCutoff + envRange + accentBoost;

    // Apply filter ADSR to both filters
    for (const f of [filter1, filter2]) {
      f.frequency.setValueAtTime(baseCutoff, time);
      f.frequency.linearRampToValueAtTime(
        Math.min(20000, Math.max(20, peakCutoff)),
        time + params.filterEnv.attack,
      );
      const sustainCutoff = baseCutoff + (peakCutoff - baseCutoff) * params.filterEnv.sustain;
      f.frequency.linearRampToValueAtTime(
        Math.min(20000, Math.max(20, sustainCutoff)),
        time + params.filterEnv.attack + params.filterEnv.decay,
      );
      f.frequency.setValueAtTime(
        Math.min(20000, Math.max(20, sustainCutoff)),
        time + duration,
      );
      f.frequency.linearRampToValueAtTime(baseCutoff, time + duration + params.filterEnv.release);
    }

    // ── Drive (soft clip via waveshaper) ──
    let outputNode: AudioNode = filter2;
    if (params.filter.drive > 0) {
      const waveshaper = this.ctx.createWaveShaper();
      const amount = params.filter.drive * 50 + 1;
      const samples = 256;
      const curve = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
      }
      waveshaper.curve = curve;
      filter2.connect(waveshaper);
      outputNode = waveshaper;
    }

    // ── Amp envelope ──
    const amp = this.ctx.createGain();
    outputNode.connect(amp);
    amp.connect(this.destination);

    applyADSR(amp.gain, time, v, params.ampEnv, duration);

    // ── Start & stop ──
    const totalDuration = duration + params.ampEnv.release + 0.1;
    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + totalDuration);
    osc2.stop(time + totalDuration);
    if (subOsc) {
      subOsc.start(time);
      subOsc.stop(time + totalDuration);
    }
  }
}
