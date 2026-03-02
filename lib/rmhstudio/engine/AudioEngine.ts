/**
 * RMHStudio — Audio Engine
 *
 * Owns the AudioContext, transport (play/pause/stop), look-ahead scheduler,
 * DrumSynth, and Mixer.  React components never touch the AudioContext
 * directly — they call engine methods and observe state via the Zustand store.
 *
 * Scheduling uses the well-known "look-ahead" technique:
 *   - A setInterval callback runs every ~25 ms
 *   - It looks ahead by SCHEDULE_AHEAD seconds into the future
 *   - Any steps falling within that window are scheduled via
 *     Web Audio API nodes at their exact audioContext.currentTime
 *   - This gives sample-accurate timing without blocking the main thread
 */

import type { Pattern, Channel, WaveLabParams, DriftParams } from '../types';
import { DrumSynth } from './DrumSynth';
import { WaveLabSynth } from './WaveLabSynth';
import { DriftSynth } from './DriftSynth';
import { Mixer } from './Mixer';

// How far ahead we schedule audio (seconds)
const SCHEDULE_AHEAD = 0.1;
// How often the scheduler runs (ms)
const SCHEDULER_INTERVAL = 25;

export type StepCallback = (step: number) => void;

export class AudioEngine {
  private static instance: AudioEngine | null = null;

  private ctx: AudioContext | null = null;
  private drumSynth: DrumSynth | null = null;
  private mixer: Mixer | null = null;

  // Transport state
  private _isPlaying = false;
  private _bpm = 140;
  private _swing = 0; // 0–1

  // Scheduler state
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private currentStep = 0;
  private nextStepTime = 0; // AudioContext time of the next step

  // Data references (set by the store before play)
  private pattern: Pattern | null = null;
  private channels: Channel[] = [];

  // Metronome
  private _metronomeEnabled = false;
  private _metronomeVolume = 0.3;

  // UI callback — fires on the main thread when a step is visually reached
  private stepCallback: StepCallback | null = null;

  private constructor() {}

  static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  // ─── Initialization ───────────────────────────────────────────

  init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.mixer = new Mixer(this.ctx);
    this.drumSynth = new DrumSynth(this.ctx, this.ctx.createGain()); // placeholder, re-wired per channel
  }

  private ensureCtx() {
    if (!this.ctx) this.init();
    if (this.ctx!.state === 'suspended') this.ctx!.resume();
  }

  getContext(): AudioContext | null {
    return this.ctx;
  }

  getMixer(): Mixer | null {
    return this.mixer;
  }

  // ─── Data Binding ─────────────────────────────────────────────

  /** Call before play() to give the engine the current pattern & channel data. */
  setData(pattern: Pattern, channels: Channel[]) {
    this.pattern = pattern;
    this.channels = channels;
    this.mixer?.initChannels(channels.length);
    // Apply current mixer state
    for (let i = 0; i < channels.length; i++) {
      this.mixer?.setChannelVolume(i, channels[i].volume);
      this.mixer?.setChannelPan(i, channels[i].pan);
      this.mixer?.setChannelMute(i, channels[i].mute);
      this.mixer?.setChannelSolo(i, channels[i].solo);
    }
  }

  /** Update a single channel's mixer state without a full setData. */
  updateChannel(index: number, ch: Channel) {
    this.channels[index] = ch;
    this.mixer?.setChannelVolume(index, ch.volume);
    this.mixer?.setChannelPan(index, ch.pan);
    this.mixer?.setChannelMute(index, ch.mute);
    this.mixer?.setChannelSolo(index, ch.solo);
  }

  onStep(cb: StepCallback | null) {
    this.stepCallback = cb;
  }

  // ─── Transport ────────────────────────────────────────────────

  get isPlaying() { return this._isPlaying; }

  set bpm(v: number) { this._bpm = Math.max(40, Math.min(300, v)); }
  get bpm() { return this._bpm; }

  set swing(v: number) { this._swing = Math.max(0, Math.min(1, v)); }
  get swing() { return this._swing; }

  set metronomeEnabled(v: boolean) { this._metronomeEnabled = v; }
  get metronomeEnabled() { return this._metronomeEnabled; }

  set metronomeVolume(v: number) { this._metronomeVolume = Math.max(0, Math.min(1, v)); }
  get metronomeVolume() { return this._metronomeVolume; }

  play() {
    this.ensureCtx();
    if (this._isPlaying) return;
    this._isPlaying = true;
    this.nextStepTime = this.ctx!.currentTime;
    this.startScheduler();
  }

  pause() {
    this._isPlaying = false;
    this.stopScheduler();
  }

  stop() {
    this._isPlaying = false;
    this.stopScheduler();
    this.currentStep = 0;
    this.stepCallback?.(0);
  }

  /** Get the step that the transport is currently on. */
  getCurrentStep(): number {
    return this.currentStep;
  }

  setMasterVolume(v: number) {
    this.mixer?.setMasterVolume(v);
  }

  // ─── Look-Ahead Scheduler ────────────────────────────────────

  private startScheduler() {
    this.stopScheduler();
    this.schedulerTimer = setInterval(() => this.schedule(), SCHEDULER_INTERVAL);
  }

  private stopScheduler() {
    if (this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  private schedule() {
    if (!this.ctx || !this._isPlaying || !this.pattern) return;

    const lookAheadEnd = this.ctx.currentTime + SCHEDULE_AHEAD;

    while (this.nextStepTime < lookAheadEnd) {
      this.scheduleStep(this.currentStep, this.nextStepTime);
      this.advanceStep();
    }
  }

  private scheduleStep(step: number, time: number) {
    if (!this.pattern || !this.ctx) return;

    // Fire UI callback (requestAnimationFrame to avoid scheduling jank)
    const s = step;
    const dt = Math.max(0, (time - this.ctx.currentTime) * 1000);
    setTimeout(() => this.stepCallback?.(s), dt);

    // Schedule sounds for each channel
    for (let ch = 0; ch < this.pattern.steps.length; ch++) {
      const row = this.pattern.steps[ch];
      if (!row || step >= row.length) continue;
      const stepData = row[step];
      if (!stepData.active) continue;

      const channel = this.channels[ch];
      if (!channel) continue;

      const dest = this.mixer!.getChannelInput(ch);
      const instrument = channel.instrument ?? 'drum';

      switch (instrument) {
        case 'drum': {
          const synth = new DrumSynth(this.ctx, dest);
          synth.play(channel.soundType, time, stepData.velocity);
          break;
        }
        case 'wavelab': {
          if (channel.synthParams) {
            const synth = new WaveLabSynth(this.ctx, dest);
            synth.play(time, stepData.velocity, channel.note ?? 60, channel.synthParams as WaveLabParams);
          }
          break;
        }
        case 'drift': {
          if (channel.synthParams) {
            const synth = new DriftSynth(this.ctx, dest);
            synth.play(time, stepData.velocity, channel.note ?? 60, channel.synthParams as DriftParams);
          }
          break;
        }
      }
    }

    // Metronome click
    if (this._metronomeEnabled && this.ctx) {
      const isDownbeat = step % 4 === 0;
      const freq = isDownbeat ? 1200 : 900;
      const dur = 0.03;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(this._metronomeVolume, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
      osc.connect(gain);
      gain.connect(this.mixer!.getMasterInput());
      osc.start(time);
      osc.stop(time + dur + 0.01);
    }
  }

  private advanceStep() {
    if (!this.pattern) return;

    // Calculate step duration with swing
    const stepDuration = 60 / this._bpm / 4; // 16th-note duration
    const isEvenStep = this.currentStep % 2 === 0;

    // Swing: even steps are longer, odd steps are shorter
    let duration = stepDuration;
    if (this._swing > 0) {
      const swingAmount = this._swing * 0.33; // max 33% swing
      if (isEvenStep) {
        duration = stepDuration * (1 + swingAmount);
      } else {
        duration = stepDuration * (1 - swingAmount);
      }
    }

    this.nextStepTime += duration;
    this.currentStep = (this.currentStep + 1) % this.pattern.stepCount;
  }

  // ─── Cleanup ──────────────────────────────────────────────────

  dispose() {
    this.stop();
    this.mixer?.dispose();
    this.ctx?.close();
    this.ctx = null;
    this.mixer = null;
    this.drumSynth = null;
    AudioEngine.instance = null;
  }
}
