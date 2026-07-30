/**
 * The temple's sound.
 *
 * Two layers, for two different jobs:
 *
 *  - **Music and the two signature stings** are the existing mp3s. A recorded
 *    soundtrack is the thing that makes a room feel like a place, and the
 *    click and trophy sounds are the ones a player hears thousands of times.
 *  - **Everything else is synthesised** — soft sine and triangle tones through
 *    the shared `AudioContext`. There are now two dozen distinct interactions
 *    (sowing, harvesting, seating a saint, striking a Sinner, a prayer going
 *    wrong) and shipping two dozen more audio files for sounds that should be
 *    barely-there chimes would cost a megabyte to make the game *worse*.
 *
 * Every tone is short, quiet, and pitched inside one consonant scale, so
 * rapid interactions layer into something that sounds intentional rather than
 * like a slot machine. Nothing plays before the first gesture, everything
 * respects the two volume sliders, and the whole thing goes silent when sound
 * is switched off.
 */
import { asset } from '@/lib/storage/asset';
import { getAudioContext, resumeAudioContext, vibrate } from '@/lib/shared/platform';

const SOUNDTRACK = [
  asset('/music/temple-of-joy/soundtrack/1.mp3'),
  asset('/music/temple-of-joy/soundtrack/2.mp3'),
];

const SFX_CLICK = asset('/music/temple-of-joy/sfx/click.mp3');
const SFX_TROPHY = asset('/music/temple-of-joy/sfx/achievement.mp3');

/** Enough voices that a fast clicker never cuts themselves off. */
const CLICK_VOICES = 5;

/**
 * A just-intoned pentatonic on C. Any two of these sound fine together, which
 * matters when six things chime at once during a halo storm.
 */
const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];

/** The synthesised cues, as `[scale degrees, shape, seconds, gain]`. */
const TONES = {
  /** Buying anything. Rises. */
  purchase: [[3, 5], 'sine', 0.18, 0.16],
  /** Buying something expensive and structural. */
  purchaseBig: [[0, 4, 7], 'sine', 0.42, 0.18],
  /** A blessing. Brighter than a source. */
  blessing: [[4, 7, 9], 'triangle', 0.5, 0.15],
  /** Catching a halo. The best sound in the game; it should be. */
  halo: [[5, 7, 9, 12], 'sine', 0.7, 0.22],
  /** A halo appearing, so it can be caught without watching. */
  haloAppear: [[9, 12], 'sine', 0.5, 0.1],
  /** A halo fading unclaimed. Falls. */
  haloMiss: [[4, 2], 'sine', 0.35, 0.07],
  /** Striking a Sinner. Low, wet, satisfying. */
  strike: [[0, 2], 'triangle', 0.3, 0.2],
  /** Sowing a seed. */
  sow: [[2], 'sine', 0.12, 0.1],
  /** Harvesting. */
  harvest: [[4, 7], 'sine', 0.24, 0.14],
  /** A seed discovered. */
  discover: [[7, 11, 14], 'triangle', 0.8, 0.16],
  /** Seating a saint. */
  choir: [[0, 4, 7, 11], 'sine', 1.1, 0.13],
  /** A trade on the exchange. */
  trade: [[5, 7], 'triangle', 0.15, 0.12],
  /** A prayer that worked. */
  prayer: [[7, 9, 12, 16], 'sine', 1.0, 0.15],
  /** A prayer that did not. */
  backfire: [[3, 1, 0], 'triangle', 0.6, 0.14],
  /** Manna ripening. */
  manna: [[9, 12], 'sine', 0.6, 0.13],
  /** Spending manna on a level. */
  level: [[4, 7, 12], 'sine', 0.55, 0.16],
  /** Ascension. The one moment that gets to be loud. */
  ascend: [[0, 4, 7, 12, 16], 'sine', 2.2, 0.2],
  /** Moving between tabs. Nearly inaudible on purpose. */
  tab: [[7], 'sine', 0.06, 0.05],
  /** A toggle or a slider settling. */
  tick: [[9], 'sine', 0.05, 0.045],
  /** Something went wrong / cannot afford. */
  refuse: [[1], 'triangle', 0.12, 0.06],
} as const satisfies Record<string, readonly [readonly number[], OscillatorType, number, number]>;

export type ToneName = keyof typeof TONES;

class TempleAudio {
  private music: HTMLAudioElement[] = [];
  private track = 0;
  private clicks: HTMLAudioElement[] = [];
  private clickVoice = 0;
  private trophy: HTMLAudioElement | null = null;

  private musicVolume = 0.35;
  private sfxVolume = 0.5;
  private on = false;
  private ready = false;
  private wantsMusic = false;
  private interacted = false;

  /** Bus for every synthesised tone, so one gain node carries the SFX slider. */
  private bus: GainNode | null = null;
  /** Tones started in the current frame, to stop a burst stacking into a roar. */
  private recentTones = 0;
  private recentToneReset = 0;

  /* ── Setup ─────────────────────────────────────────────────────────────── */

  init(): void {
    if (this.ready || typeof window === 'undefined') return;
    this.ready = true;

    this.music = SOUNDTRACK.map((src) => {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.volume = this.musicVolume;
      audio.addEventListener('ended', () => this.advance());
      return audio;
    });

    this.clicks = Array.from({ length: CLICK_VOICES }, () => {
      const audio = new Audio(SFX_CLICK);
      audio.preload = 'auto';
      audio.volume = this.sfxVolume;
      return audio;
    });

    this.trophy = new Audio(SFX_TROPHY);
    this.trophy.preload = 'auto';
    this.trophy.volume = this.sfxVolume;
  }

  /** The shared context, wired to the SFX bus on first use. */
  private context(): AudioContext | null {
    const ctx = getAudioContext();
    if (!ctx) return null;
    if (!this.bus) {
      this.bus = ctx.createGain();
      this.bus.gain.value = this.sfxVolume;
      this.bus.connect(ctx.destination);
    }
    return ctx;
  }

  /* ── Music ─────────────────────────────────────────────────────────────── */

  private advance(): void {
    if (!this.on || !this.wantsMusic) return;
    this.track = (this.track + 1) % this.music.length;
    const next = this.music[this.track];
    if (!next) return;
    next.currentTime = 0;
    next.volume = this.musicVolume;
    void next.play().catch(() => {});
  }

  startMusic(): void {
    if (!this.ready) this.init();
    this.wantsMusic = true;
    if (!this.on) return;
    const track = this.music[this.track];
    if (!track) return;
    track.volume = this.musicVolume;
    void track.play().catch(() => {});
  }

  stopMusic(): void {
    this.wantsMusic = false;
    for (const track of this.music) track.pause();
  }

  /* ── Settings ──────────────────────────────────────────────────────────── */

  setEnabled(enabled: boolean): void {
    const was = this.on;
    this.on = enabled;
    if (!this.ready) this.init();

    if (enabled && !was) {
      if (this.wantsMusic) {
        const track = this.music[this.track];
        if (track) {
          track.volume = this.musicVolume;
          void track.play().catch(() => {});
        }
      } else {
        this.startMusic();
      }
    } else if (!enabled && was) {
      this.stopMusic();
    }
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = clamp(volume);
    for (const track of this.music) track.volume = this.musicVolume;
    // Dragging the music slider to zero should stop the track rather than
    // leave a silent decoder running for the rest of the session.
    if (this.musicVolume === 0) {
      for (const track of this.music) track.pause();
    } else if (this.on && this.wantsMusic) {
      this.resumeMusic();
    }
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = clamp(volume);
    for (const voice of this.clicks) voice.volume = this.sfxVolume;
    if (this.trophy) this.trophy.volume = this.sfxVolume;
    if (this.bus) this.bus.gain.value = this.sfxVolume;
  }

  get enabled(): boolean {
    return this.on;
  }

  /** Called on the first pointer or key event. Browsers require it. */
  markInteracted(): void {
    if (this.interacted) return;
    this.interacted = true;
    resumeAudioContext();
    if (!this.on) return;
    if (this.wantsMusic) this.resumeMusic();
    else this.startMusic();
  }

  private resumeMusic(): void {
    if (!this.ready) this.init();
    if (!this.on || !this.wantsMusic || this.musicVolume === 0) return;
    const track = this.music[this.track];
    if (track?.paused) void track.play().catch(() => {});
  }

  /* ── Recorded cues ─────────────────────────────────────────────────────── */

  /** The offering. Pooled so a fast hand never truncates itself. */
  playClick(): void {
    if (!this.on || this.sfxVolume === 0 || this.clicks.length === 0) return;
    const voice = this.clicks[this.clickVoice];
    this.clickVoice = (this.clickVoice + 1) % this.clicks.length;
    if (!voice) return;
    voice.volume = this.sfxVolume;
    voice.currentTime = 0;
    void voice.play().catch(() => {});
  }

  playTrophy(): void {
    if (!this.on || this.sfxVolume === 0 || !this.trophy) return;
    this.trophy.volume = this.sfxVolume;
    this.trophy.currentTime = 0;
    void this.trophy.play().catch(() => {});
  }

  /* ── Synthesised cues ──────────────────────────────────────────────────── */

  /**
   * Play one of the named tones.
   *
   * Notes in a chord are spread across a few milliseconds rather than struck
   * together — an exactly simultaneous chord from three oscillators sounds
   * synthetic in a way a slightly rolled one does not.
   */
  play(name: ToneName): void {
    if (!this.on || this.sfxVolume === 0 || !this.interacted) return;

    const ctx = this.context();
    if (!ctx || !this.bus || ctx.state === 'closed') return;

    // A halo storm can fire a dozen cues in one frame. Past a handful they
    // stop being information and start being noise.
    const now = ctx.currentTime;
    if (now - this.recentToneReset > 0.1) {
      this.recentToneReset = now;
      this.recentTones = 0;
    }
    if (this.recentTones >= 4) return;
    this.recentTones++;

    const [degrees, shape, seconds, gain] = TONES[name];

    degrees.forEach((degree, i) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = shape;
      osc.frequency.value = frequencyFor(degree);

      const start = now + i * 0.028;
      const end = start + seconds;

      // A short attack and a long exponential tail: the shape of something
      // struck, which is what every one of these is meant to be.
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(gain, start + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(env);
      env.connect(this.bus!);
      osc.start(start);
      osc.stop(end + 0.02);
      // Oscillators are single-use; releasing the graph keeps a long session
      // from accumulating thousands of dead nodes.
      osc.onended = () => {
        osc.disconnect();
        env.disconnect();
      };
    });
  }

  /** A short pulse on devices that have one. Used only for the big moments. */
  buzz(pattern: number | number[]): void {
    if (!this.on) return;
    vibrate(pattern);
  }
}

/** Scale degrees past the top of the table wrap up an octave at a time. */
function frequencyFor(degree: number): number {
  const octave = Math.floor(degree / SCALE.length);
  return SCALE[degree % SCALE.length]! * Math.pow(2, octave);
}

function clamp(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

export const templeAudio = new TempleAudio();
