/**
 * Nightrail — procedural sound.
 *
 * No asset files: every sound is synthesised on the fly, which keeps the game's
 * payload to the code that draws it and means a sound can be pitched by the
 * thing that caused it (a drift release at full charge is audibly bigger than
 * one scraped in at the minimum).
 *
 * The simulation stays pure — `game.ts` only records {@link RunEvent} names —
 * and the React shell drains those each frame and forwards them here. That
 * split is what lets the sim be unit-tested with no audio context at all.
 */

import { getAudioContext } from '@/lib/shared/platform';
import type { RunEvent } from './game';

/** Minimum seconds between two plays of the same cue, so nothing machine-guns. */
const THROTTLE: Partial<Record<RunEvent['type'], number>> = {
  charm: 0.045,
  switch: 0.08,
  land: 0.06,
  trick: 0.05,
};

export class NightrailAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Continuous rolling noise — the train is always moving, so it is always on. */
  private rumble: {
    source: AudioBufferSourceNode;
    gain: GainNode;
    filter: BiquadFilterNode;
  } | null = null;
  private muted = false;
  private volume = 0.7;
  private readonly lastPlayed = new Map<string, number>();

  /**
   * Create or resume the shared context.
   *
   * Must be called from a user gesture — browsers will not start audio without
   * one, and a context created outside a gesture starts suspended and stays
   * that way with no error to tell you why.
   */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = getAudioContext();
      if (!this.ctx) return;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master && this.ctx && !this.muted) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  /**
   * Track the engine note to the train's speed.
   *
   * Filtered noise rather than a tone: a train on rails is broadband roar, and
   * a sawtooth at the same pitch reads as a car. Called every frame with the
   * current speed, so it is a `setTargetAtTime` glide rather than a step.
   */
  setSpeed(speed: number, maxSpeed: number, airborne: boolean): void {
    if (!this.ctx || !this.master) return;
    if (!this.rumble) this.startRumble();
    if (!this.rumble) return;

    const t = this.ctx.currentTime;
    const ratio = maxSpeed > 0 ? Math.min(1.4, speed / maxSpeed) : 0;
    // Off the railhead there is nothing to roar against, so the bed drops away
    // and the airtime reads as sudden quiet — which is what makes the landing
    // land.
    const level = airborne ? 0.05 : 0.06 + ratio * 0.16;
    this.rumble.gain.gain.setTargetAtTime(level, t, 0.08);
    this.rumble.filter.frequency.setTargetAtTime(180 + ratio * 900, t, 0.1);
  }

  /** Play everything the sim reported this frame. */
  playEvents(events: readonly RunEvent[]): void {
    for (const event of events) this.play(event);
  }

  play(event: RunEvent): void {
    if (!this.ctx || !this.master || this.muted) return;
    const now = this.ctx.currentTime;

    const gap = THROTTLE[event.type];
    if (gap !== undefined) {
      const last = this.lastPlayed.get(event.type) ?? -Infinity;
      if (now - last < gap) return;
      this.lastPlayed.set(event.type, now);
    }

    switch (event.type) {
      case 'jump':
        this.blip(now, 220, 520, 0.16, 'triangle', 0.22);
        break;
      case 'land':
        if (event.clean) this.thud(now, 0.18);
        else this.noiseBurst(now, 0.3, 900, 0.28);
        break;
      case 'trick':
        // Pitch rises with the trick's value, so the ear learns the table.
        this.blip(now, 480, 900 + Math.min(600, event.points), 0.12, 'square', 0.16);
        break;
      case 'bail':
        this.noiseBurst(now, 0.45, 500, 0.34);
        break;
      case 'driftStart':
        this.blip(now, 320, 260, 0.1, 'sawtooth', 0.1);
        break;
      case 'driftRelease':
        this.sweep(now, 260, 260 + 700 * event.charge, 0.35, 0.26 * (0.4 + event.charge));
        break;
      case 'grindStart':
        this.noiseBurst(now, 0.25, 2600, 0.16);
        break;
      case 'grindEnd':
        this.blip(now, 700, 400, 0.14, 'triangle', 0.12);
        break;
      case 'charm':
        this.blip(now, 1180, 1600, 0.09, 'sine', 0.13);
        break;
      case 'boostpad':
        this.sweep(now, 300, 1100, 0.3, 0.24);
        break;
      case 'checkpoint':
        this.chord(now, [523, 659, 784], 0.4, 0.15);
        break;
      case 'switch':
        this.blip(now, 640, 520, 0.05, 'square', 0.06);
        break;
      case 'crash':
        this.noiseBurst(now, 0.5, 320, 0.4);
        this.thud(now, 0.3);
        break;
      case 'combo':
        this.chord(now, [660, 880], 0.25, 0.1 + Math.min(0.14, event.multiplier * 0.01));
        break;
      case 'finish':
        this.chord(now, [523, 659, 784, 1047], 0.9, 0.2);
        break;
      case 'wrecked':
        this.sweep(now, 400, 70, 0.9, 0.3);
        break;
    }
  }

  /** Fade the rumble out and drop the nodes. Safe to call more than once. */
  stop(): void {
    if (this.rumble && this.ctx) {
      this.rumble.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      const { source } = this.rumble;
      // Let the fade finish before the node is torn down, or it clicks.
      window.setTimeout(() => {
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
      }, 300);
      this.rumble = null;
    }
    this.lastPlayed.clear();
  }

  // ── Synthesis primitives ──

  private startRumble(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const length = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Brown-ish noise: integrating white noise tilts the spectrum downward,
    // which is what makes it read as mass rather than as hiss.
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    this.rumble = { source, gain, filter };
  }

  private blip(
    at: number,
    from: number,
    to: number,
    duration: number,
    type: OscillatorType,
    gain: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + duration);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(env).connect(this.master);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  private sweep(at: number, from: number, to: number, duration: number, gain: number): void {
    this.blip(at, from, to, duration, 'sawtooth', gain);
  }

  private chord(at: number, freqs: number[], duration: number, gain: number): void {
    freqs.forEach((f, i) => {
      // Stagger the notes a little so a chord arpeggiates rather than thuds.
      this.blip(at + i * 0.045, f, f, duration, 'triangle', gain / freqs.length + 0.02);
    });
  }

  private thud(at: number, gain: number): void {
    this.blip(at, 140, 40, 0.24, 'sine', gain);
  }

  private noiseBurst(at: number, duration: number, cutoff: number, gain: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const env = ctx.createGain();
    env.gain.value = gain;
    source.connect(filter).connect(env).connect(this.master);
    source.start(at);
  }
}
