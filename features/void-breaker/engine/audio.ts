// ── Void Breaker — procedural sound engine ───────────────────────────────────
// A self-contained WebAudio synthesizer. No audio asset files: every sound is
// generated on the fly from oscillators + filtered noise. The game simulation
// (game.ts) stays pure — it only records SfxEvent names into an array that the
// React component drains each frame and forwards to `VoidBreakerAudio.play()`.

export type SfxName =
  | 'shoot'
  | 'enemyShoot'
  | 'bossRing'
  | 'hit'
  | 'kill'
  | 'eliteKill'
  | 'bossHit'
  | 'bossKill'
  | 'bossSpawn'
  | 'bossPhase'
  | 'shardPickup'
  | 'shardBlock'
  | 'detonate'
  | 'dash'
  | 'focus'
  | 'voidPulse'
  | 'phaseShift'
  | 'reflect'
  | 'playerHurt'
  | 'heal'
  | 'heartbeat'
  | 'waveClear'
  | 'unlock'
  | 'gameOver'
  | 'uiClick'
  | 'slowmo'
  | 'surge';

export interface SfxEvent {
  name: SfxName;
  /** Optional pitch multiplier (e.g. shard pickup pitch climbs with count) */
  pitch?: number;
  /** Optional per-event gain scale (0–1) */
  gain?: number;
}

/** Minimum seconds between consecutive plays of the same sound (anti-machinegun). */
const THROTTLE: Partial<Record<SfxName, number>> = {
  shoot: 0.05,
  enemyShoot: 0.05,
  bossRing: 0.08,
  hit: 0.03,
  kill: 0.03,
  shardPickup: 0.035,
  shardBlock: 0.04,
};

export class VoidBreakerAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private volume = 0.7;
  private readonly lastPlayed = new Map<SfxName, number>();

  /** Create / resume the AudioContext. Must be called from a user gesture. */
  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyMasterGain();
      this.noiseBuffer = this.buildNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyMasterGain();
  }

  /** Master volume 0–1 (the SFX bus sits slightly under the music master). */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyMasterGain();
  }

  private applyMasterGain(): void {
    if (!this.master || !this.ctx) return;
    const target = this.muted ? 0 : this.volume;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.01);
  }

  private buildNoiseBuffer(): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * 1.0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ── Voice helpers ──────────────────────────────────────────────────────────

  /** A single oscillator with an attack/decay envelope and optional pitch glide. */
  private tone(opts: {
    freq: number; freqEnd?: number; type?: OscillatorType;
    dur: number; gain: number; attack?: number; delay?: number;
  }): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), t0 + opts.dur);
    }
    const atk = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opts.gain, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(g).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  }

  /** A filtered burst of white noise (impacts, explosions, whooshes). */
  private noise(opts: {
    dur: number; gain: number; filterType?: BiquadFilterType;
    freq: number; freqEnd?: number; q?: number; attack?: number; delay?: number;
  }): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.filterType ?? 'bandpass';
    filter.frequency.setValueAtTime(opts.freq, t0);
    if (opts.freqEnd !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), t0 + opts.dur);
    }
    filter.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const atk = opts.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opts.gain, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(t0);
    src.stop(t0 + opts.dur + 0.02);
  }

  // ── Dispatch ─────────────────────────────────────────────────────────────────

  play(name: SfxName, opts?: { pitch?: number; gain?: number }): void {
    if (!this.ctx || !this.master || this.muted) return;
    const now = this.ctx.currentTime;
    const minGap = THROTTLE[name];
    if (minGap !== undefined) {
      const last = this.lastPlayed.get(name) ?? -1;
      if (now - last < minGap) return;
    }
    this.lastPlayed.set(name, now);

    const p = opts?.pitch ?? 1;
    const gm = opts?.gain ?? 1;

    switch (name) {
      case 'shoot':
        this.tone({ freq: 720 * p, freqEnd: 280, type: 'square', dur: 0.09, gain: 0.10 * gm });
        this.tone({ freq: 1500 * p, freqEnd: 700, type: 'triangle', dur: 0.05, gain: 0.04 * gm });
        break;
      case 'enemyShoot':
        this.tone({ freq: 300 * p, freqEnd: 150, type: 'sawtooth', dur: 0.12, gain: 0.06 * gm });
        break;
      case 'bossRing':
        this.tone({ freq: 200, freqEnd: 90, type: 'sawtooth', dur: 0.22, gain: 0.10 * gm });
        this.noise({ dur: 0.18, gain: 0.05, freq: 600, freqEnd: 200, q: 0.7 });
        break;
      case 'hit':
        this.noise({ dur: 0.05, gain: 0.10 * gm, freq: 1800 * p, q: 0.8 });
        this.tone({ freq: 420 * p, freqEnd: 240, type: 'square', dur: 0.04, gain: 0.05 * gm });
        break;
      case 'kill':
        this.noise({ dur: 0.18, gain: 0.16 * gm, freq: 900, freqEnd: 120, q: 0.6, filterType: 'lowpass' });
        this.tone({ freq: 360 * p, freqEnd: 90, type: 'triangle', dur: 0.18, gain: 0.10 * gm });
        break;
      case 'eliteKill':
        this.noise({ dur: 0.28, gain: 0.22, freq: 1100, freqEnd: 110, q: 0.6, filterType: 'lowpass' });
        this.tone({ freq: 300, freqEnd: 70, type: 'sawtooth', dur: 0.3, gain: 0.14 });
        break;
      case 'bossHit':
        this.noise({ dur: 0.07, gain: 0.10, freq: 1400, q: 0.9 });
        this.tone({ freq: 200, freqEnd: 150, type: 'square', dur: 0.06, gain: 0.06 });
        break;
      case 'bossKill':
        this.noise({ dur: 0.9, gain: 0.3, freq: 1600, freqEnd: 60, q: 0.4, filterType: 'lowpass' });
        this.tone({ freq: 420, freqEnd: 50, type: 'sawtooth', dur: 0.9, gain: 0.2 });
        this.tone({ freq: 90, freqEnd: 36, type: 'sine', dur: 1.1, gain: 0.28 });
        this.tone({ freq: 700, freqEnd: 1400, type: 'triangle', dur: 0.5, gain: 0.08, delay: 0.05 });
        break;
      case 'bossSpawn':
        this.tone({ freq: 70, freqEnd: 42, type: 'sawtooth', dur: 1.2, gain: 0.3 });
        this.tone({ freq: 140, freqEnd: 90, type: 'sine', dur: 1.2, gain: 0.18 });
        this.noise({ dur: 1.0, gain: 0.07, freq: 220, freqEnd: 90, q: 0.5, filterType: 'lowpass' });
        break;
      case 'bossPhase':
        this.tone({ freq: 880, freqEnd: 880, type: 'square', dur: 0.12, gain: 0.10 });
        this.tone({ freq: 880, freqEnd: 880, type: 'square', dur: 0.12, gain: 0.10, delay: 0.18 });
        this.tone({ freq: 120, freqEnd: 60, type: 'sawtooth', dur: 0.6, gain: 0.2 });
        break;
      case 'shardPickup':
        this.tone({ freq: 740 * p, freqEnd: 1180 * p, type: 'triangle', dur: 0.07, gain: 0.07 * gm });
        break;
      case 'shardBlock':
        this.tone({ freq: 1300, freqEnd: 1900, type: 'sine', dur: 0.05, gain: 0.06 });
        this.noise({ dur: 0.04, gain: 0.04, freq: 3000, q: 1.2 });
        break;
      case 'detonate':
        this.noise({ dur: 0.6, gain: 0.34 * gm, freq: 1400, freqEnd: 60, q: 0.4, filterType: 'lowpass' });
        this.tone({ freq: 160, freqEnd: 36, type: 'sawtooth', dur: 0.55, gain: 0.26 * gm });
        this.tone({ freq: 80, freqEnd: 30, type: 'sine', dur: 0.7, gain: 0.3 * gm });
        break;
      case 'dash':
        this.noise({ dur: 0.22, gain: 0.13, freq: 400, freqEnd: 2600, q: 0.8 });
        this.tone({ freq: 520, freqEnd: 1100, type: 'triangle', dur: 0.16, gain: 0.05 });
        break;
      case 'focus':
        this.tone({ freq: 600, freqEnd: 180, type: 'sine', dur: 0.5, gain: 0.14 });
        this.tone({ freq: 900, freqEnd: 300, type: 'triangle', dur: 0.5, gain: 0.06 });
        break;
      case 'voidPulse':
        this.tone({ freq: 240, freqEnd: 1200, type: 'sine', dur: 0.3, gain: 0.16 });
        this.noise({ dur: 0.3, gain: 0.1, freq: 300, freqEnd: 2400, q: 0.6 });
        break;
      case 'phaseShift':
        this.tone({ freq: 1400, freqEnd: 500, type: 'sine', dur: 0.4, gain: 0.1 });
        this.tone({ freq: 700, freqEnd: 250, type: 'triangle', dur: 0.4, gain: 0.07 });
        break;
      case 'reflect':
        this.tone({ freq: 1000, freqEnd: 1600, type: 'square', dur: 0.12, gain: 0.1 });
        this.noise({ dur: 0.1, gain: 0.06, freq: 2600, q: 1.0 });
        break;
      case 'playerHurt':
        this.noise({ dur: 0.3, gain: 0.2, freq: 900, freqEnd: 140, q: 0.5, filterType: 'lowpass' });
        this.tone({ freq: 220, freqEnd: 70, type: 'sawtooth', dur: 0.28, gain: 0.16 });
        break;
      case 'heal':
        this.tone({ freq: 520, freqEnd: 780, type: 'sine', dur: 0.18, gain: 0.12 });
        this.tone({ freq: 780, freqEnd: 1040, type: 'sine', dur: 0.2, gain: 0.08, delay: 0.08 });
        break;
      case 'heartbeat':
        this.tone({ freq: 70, freqEnd: 40, type: 'sine', dur: 0.16, gain: 0.22 });
        this.tone({ freq: 70, freqEnd: 40, type: 'sine', dur: 0.16, gain: 0.16, delay: 0.22 });
        break;
      case 'waveClear':
        this.tone({ freq: 523, type: 'triangle', dur: 0.18, gain: 0.12 });
        this.tone({ freq: 659, type: 'triangle', dur: 0.18, gain: 0.12, delay: 0.1 });
        this.tone({ freq: 784, type: 'triangle', dur: 0.26, gain: 0.12, delay: 0.2 });
        break;
      case 'unlock':
        this.tone({ freq: 660, freqEnd: 990, type: 'sine', dur: 0.18, gain: 0.1 });
        this.tone({ freq: 990, freqEnd: 1320, type: 'triangle', dur: 0.22, gain: 0.08, delay: 0.1 });
        break;
      case 'gameOver':
        this.tone({ freq: 440, freqEnd: 110, type: 'sawtooth', dur: 1.4, gain: 0.2 });
        this.tone({ freq: 220, freqEnd: 55, type: 'sine', dur: 1.6, gain: 0.22 });
        break;
      case 'uiClick':
        this.tone({ freq: 900, freqEnd: 1300, type: 'square', dur: 0.04, gain: 0.06 });
        break;
      case 'slowmo':
        // Cinematic time-dilation whoosh for the boss-death slow-mo moment.
        // (Vocabulary only — not yet wired into the engine; see renderer Task 8.)
        this.tone({ freq: 600, freqEnd: 90, type: 'sine', dur: 0.7, gain: 0.18 });
        this.tone({ freq: 140, freqEnd: 55, type: 'sine', dur: 0.9, gain: 0.16 });
        this.noise({ dur: 0.8, gain: 0.10, freq: 1800, freqEnd: 200, q: 0.5, filterType: 'lowpass' });
        break;
      case 'surge':
        // Rising power swell signaling a surge takeover (state-change cue).
        // (Vocabulary only — not yet wired into the engine.)
        this.tone({ freq: 220, freqEnd: 880, type: 'sawtooth', dur: 0.5, gain: 0.14 });
        this.tone({ freq: 330, freqEnd: 1320, type: 'triangle', dur: 0.5, gain: 0.08, delay: 0.04 });
        this.noise({ dur: 0.4, gain: 0.06, freq: 400, freqEnd: 3000, q: 0.7 });
        break;
    }
  }
}
