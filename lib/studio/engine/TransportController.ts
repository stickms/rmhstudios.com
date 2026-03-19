import { StudioEngine } from './StudioEngine';

/**
 * TransportController — wraps Tone.Transport for play/pause/stop/record/loop.
 *
 * Bridges transport state changes to/from the Zustand store via callbacks.
 * Handles metronome click synthesis and position reporting.
 */
export class TransportController {
  private engine: StudioEngine;
  private metronomeScheduleId: number | null = null;
  private positionCallbackId: number | null = null;
  private onPositionUpdate: ((beat: number) => void) | null = null;
  private onStateChange: ((state: 'started' | 'stopped' | 'paused') => void) | null = null;

  constructor(engine: StudioEngine) {
    this.engine = engine;
  }

  private get transport() {
    const tone = this.engine.getTone();
    return tone.getTransport();
  }

  // ─── Transport Controls ─────────────────────────────────────────────────

  play(): void {
    this.transport.start();
    this.startPositionReporting();
    this.onStateChange?.('started');
  }

  pause(): void {
    this.transport.pause();
    this.stopPositionReporting();
    this.onStateChange?.('paused');
  }

  stop(): void {
    this.transport.stop();
    this.transport.position = 0;
    this.stopPositionReporting();
    this.onPositionUpdate?.(0);
    this.onStateChange?.('stopped');
  }

  playPause(): void {
    if (this.transport.state === 'started') {
      this.pause();
    } else {
      this.play();
    }
  }

  /** Toggle between play and full stop (return to start) */
  toggleStop(): void {
    if (this.transport.state === 'stopped') return;
    this.stop();
  }

  // ─── BPM & Time Signature ──────────────────────────────────────────────

  setBpm(bpm: number): void {
    this.transport.bpm.value = bpm;
  }

  setTimeSignature(numerator: number, denominator: number): void {
    this.transport.timeSignature = [numerator, denominator];
  }

  // ─── Loop ───────────────────────────────────────────────────────────────

  setLoop(enabled: boolean, startBeat?: number, endBeat?: number): void {
    this.transport.loop = enabled;
    if (startBeat !== undefined) this.transport.loopStart = `0:0:${startBeat * 4}`;
    if (endBeat !== undefined) this.transport.loopEnd = `0:0:${endBeat * 4}`;
  }

  setLoopPoints(startBeat: number, endBeat: number): void {
    const tone = this.engine.getTone();
    this.transport.loopStart = tone.Time(startBeat * (60 / this.transport.bpm.value)).toSeconds();
    this.transport.loopEnd = tone.Time(endBeat * (60 / this.transport.bpm.value)).toSeconds();
  }

  // ─── Position ───────────────────────────────────────────────────────────

  seekToBeat(beat: number): void {
    const tone = this.engine.getTone();
    this.transport.seconds = tone.Time(beat * (60 / this.transport.bpm.value)).toSeconds();
    this.onPositionUpdate?.(beat);
  }

  getCurrentBeat(): number {
    return this.transport.ticks / this.transport.PPQ;
  }

  getState(): 'started' | 'stopped' | 'paused' {
    return this.transport.state;
  }

  // ─── Metronome ──────────────────────────────────────────────────────────

  enableMetronome(): void {
    if (this.metronomeScheduleId !== null) return;

    const tone = this.engine.getTone();
    const synth = new tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.01 },
      volume: -12,
    }).toDestination();

    this.metronomeScheduleId = this.transport.scheduleRepeat((time) => {
      const beat = this.getCurrentBeat();
      const beatsPerBar = (this.transport.timeSignature as number[])?.[0] ?? 4;
      const isDownbeat = Math.round(beat) % beatsPerBar === 0;
      synth.triggerAttackRelease(isDownbeat ? 'C6' : 'C5', '32n', time);
    }, '4n');
  }

  disableMetronome(): void {
    if (this.metronomeScheduleId !== null) {
      this.transport.clear(this.metronomeScheduleId);
      this.metronomeScheduleId = null;
    }
  }

  toggleMetronome(): void {
    if (this.metronomeScheduleId !== null) {
      this.disableMetronome();
    } else {
      this.enableMetronome();
    }
  }

  // ─── Position Reporting ─────────────────────────────────────────────────

  setOnPositionUpdate(callback: (beat: number) => void): void {
    this.onPositionUpdate = callback;
  }

  setOnStateChange(callback: (state: 'started' | 'stopped' | 'paused') => void): void {
    this.onStateChange = callback;
  }

  private startPositionReporting(): void {
    if (this.positionCallbackId !== null) return;

    this.positionCallbackId = this.transport.scheduleRepeat(() => {
      this.onPositionUpdate?.(this.getCurrentBeat());
    }, '16n');
  }

  private stopPositionReporting(): void {
    if (this.positionCallbackId !== null) {
      this.transport.clear(this.positionCallbackId);
      this.positionCallbackId = null;
    }
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────

  dispose(): void {
    this.disableMetronome();
    this.stopPositionReporting();
    this.onPositionUpdate = null;
    this.onStateChange = null;
  }
}
