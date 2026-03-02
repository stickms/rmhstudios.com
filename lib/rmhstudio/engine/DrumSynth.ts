/**
 * RMHStudio — Drum Synthesizer
 *
 * All drum sounds are synthesized via Web Audio API — no samples required.
 * Each method schedules a sound at a specific AudioContext time for
 * sample-accurate timing.
 */

import type { DrumSoundType } from '../types';

export class DrumSynth {
  constructor(private ctx: AudioContext, private destination: AudioNode) {}

  /** Play a drum sound by type at the given time and velocity (0–1). */
  play(type: DrumSoundType, time: number, velocity: number) {
    const v = Math.max(0, Math.min(1, velocity));
    switch (type) {
      case 'kick':         return this.kick(time, v);
      case 'snare':        return this.snare(time, v);
      case 'hihat-closed': return this.hihatClosed(time, v);
      case 'hihat-open':   return this.hihatOpen(time, v);
      case 'clap':         return this.clap(time, v);
      case 'tom':          return this.tom(time, v);
      case 'rimshot':      return this.rimshot(time, v);
      case 'cymbal':       return this.cymbal(time, v);
      case 'perc':         return this.perc(time, v);
    }
  }

  // ─── Kick ────────────────────────────────────────────────────────
  private kick(t: number, vel: number) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    // Pitch envelope: 150Hz → 40Hz
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.07);

    // Click transient layer
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = 'square';
    clickOsc.frequency.setValueAtTime(800, t);
    clickOsc.frequency.exponentialRampToValueAtTime(100, t + 0.02);
    clickGain.gain.setValueAtTime(0.3 * vel, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    clickOsc.connect(clickGain);
    clickGain.connect(this.destination);
    clickOsc.start(t);
    clickOsc.stop(t + 0.04);

    // Main body
    gain.gain.setValueAtTime(vel, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc.connect(gain);
    gain.connect(this.destination);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  // ─── Snare ───────────────────────────────────────────────────────
  private snare(t: number, vel: number) {
    // Tone component
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.05);
    oscGain.gain.setValueAtTime(0.7 * vel, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(oscGain);
    oscGain.connect(this.destination);
    osc.start(t);
    osc.stop(t + 0.15);

    // Noise component
    this.playNoiseBurst(t, 0.18, vel * 0.8, 3000, 10000);
  }

  // ─── Hi-Hat (Closed) ────────────────────────────────────────────
  private hihatClosed(t: number, vel: number) {
    this.playNoiseBurst(t, 0.06, vel * 0.5, 7000, 16000);
  }

  // ─── Hi-Hat (Open) ──────────────────────────────────────────────
  private hihatOpen(t: number, vel: number) {
    this.playNoiseBurst(t, 0.35, vel * 0.5, 7000, 16000);
  }

  // ─── Clap ────────────────────────────────────────────────────────
  private clap(t: number, vel: number) {
    // Staggered noise bursts for the "clap" feel
    const offsets = [0, 0.01, 0.02, 0.035];
    for (const off of offsets) {
      this.playNoiseBurst(t + off, 0.04, vel * 0.35, 1500, 6000);
    }
    // Tail
    this.playNoiseBurst(t + 0.04, 0.15, vel * 0.5, 1200, 5000);
  }

  // ─── Tom ─────────────────────────────────────────────────────────
  private tom(t: number, vel: number) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.15);
    gain.gain.setValueAtTime(vel, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain);
    gain.connect(this.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  // ─── Rimshot ─────────────────────────────────────────────────────
  private rimshot(t: number, vel: number) {
    // High-freq tone
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(900, t);
    gain.gain.setValueAtTime(0.6 * vel, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain);
    gain.connect(this.destination);
    osc.start(t);
    osc.stop(t + 0.08);

    // Short noise
    this.playNoiseBurst(t, 0.04, vel * 0.4, 4000, 12000);
  }

  // ─── Cymbal ──────────────────────────────────────────────────────
  private cymbal(t: number, vel: number) {
    // Multiple detuned oscillators for metallic character
    const freqs = [587, 845, 1234, 1578, 2467];
    for (const freq of freqs) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.08 * vel, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      osc.connect(gain);
      gain.connect(this.destination);
      osc.start(t);
      osc.stop(t + 0.85);
    }
    // Noise layer
    this.playNoiseBurst(t, 0.6, vel * 0.3, 6000, 16000);
  }

  // ─── Perc (generic) ──────────────────────────────────────────────
  private perc(t: number, vel: number) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.04);
    gain.gain.setValueAtTime(vel * 0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain);
    gain.connect(this.destination);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  // ─── Noise Burst Helper ──────────────────────────────────────────
  private playNoiseBurst(
    t: number,
    duration: number,
    volume: number,
    hpFreq: number,
    lpFreq: number,
  ) {
    const bufferSize = Math.ceil(this.ctx.sampleRate * (duration + 0.05));
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = noiseBuffer;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(hpFreq, t);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(lpFreq, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(hp);
    hp.connect(lp);
    lp.connect(gain);
    gain.connect(this.destination);

    source.start(t);
    source.stop(t + duration + 0.02);
  }
}
