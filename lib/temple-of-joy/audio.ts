/**
 * Temple of Joy — Audio Manager
 * Singleton that handles background music (soundtrack) and SFX (click, achievement).
 * Uses HTML5 Audio API with pooling for rapid SFX playback.
 */

const SOUNDTRACK_PATHS = [
  '/music/temple-of-joy/soundtrack/1.mp3',
  '/music/temple-of-joy/soundtrack/2.mp3',
];

const SFX_CLICK_PATH = '/music/temple-of-joy/sfx/click.mp3';
const SFX_ACHIEVEMENT_PATH = '/music/temple-of-joy/sfx/achievement.mp3';

const CLICK_POOL_SIZE = 4;

class TempleAudio {
  private musicTracks: HTMLAudioElement[] = [];
  private currentTrackIndex = 0;
  private clickPool: HTMLAudioElement[] = [];
  private clickPoolIndex = 0;
  private achievementSfx: HTMLAudioElement | null = null;

  private _musicVolume = 0.5;
  private _sfxVolume = 0.5;
  private _enabled = false;
  private _initialized = false;
  private _musicPlaying = false;
  private _userHasInteracted = false;

  // ── Initialization ──────────────────────────────────────────────────────

  init(): void {
    if (this._initialized || typeof window === 'undefined') return;
    this._initialized = true;

    // Preload soundtrack tracks
    this.musicTracks = SOUNDTRACK_PATHS.map((path) => {
      const audio = new Audio(path);
      audio.preload = 'auto';
      audio.volume = this._musicVolume;
      audio.addEventListener('ended', () => this.playNextTrack());
      return audio;
    });

    // Preload SFX click pool
    this.clickPool = Array.from({ length: CLICK_POOL_SIZE }, () => {
      const audio = new Audio(SFX_CLICK_PATH);
      audio.preload = 'auto';
      audio.volume = this._sfxVolume;
      return audio;
    });

    // Preload achievement SFX
    this.achievementSfx = new Audio(SFX_ACHIEVEMENT_PATH);
    this.achievementSfx.preload = 'auto';
    this.achievementSfx.volume = this._sfxVolume;
  }

  // ── Music ───────────────────────────────────────────────────────────────

  private playNextTrack(): void {
    if (!this._enabled || !this._musicPlaying) return;
    this.currentTrackIndex = (this.currentTrackIndex + 1) % this.musicTracks.length;
    const next = this.musicTracks[this.currentTrackIndex];
    if (next) {
      next.currentTime = 0;
      next.volume = this._musicVolume;
      next.play().catch(() => {});
    }
  }

  startMusic(): void {
    if (!this._initialized) this.init();
    this._musicPlaying = true;
    if (!this._enabled) return;
    const track = this.musicTracks[this.currentTrackIndex];
    if (track) {
      track.volume = this._musicVolume;
      track.play().catch(() => {});
    }
  }

  stopMusic(): void {
    this._musicPlaying = false;
    for (const track of this.musicTracks) {
      track.pause();
    }
  }

  /** Resume music playback if it should be playing (e.g. after user interaction). */
  tryResumeMusic(): void {
    if (!this._initialized) this.init();
    if (!this._enabled || !this._musicPlaying) return;
    const track = this.musicTracks[this.currentTrackIndex];
    if (track && track.paused) {
      track.play().catch(() => {});
    }
  }

  // ── Settings ────────────────────────────────────────────────────────────

  setEnabled(enabled: boolean): void {
    const wasEnabled = this._enabled;
    this._enabled = enabled;
    if (!this._initialized) this.init();

    if (enabled && !wasEnabled) {
      // Turning on: start music if it should be playing
      if (this._musicPlaying) {
        const track = this.musicTracks[this.currentTrackIndex];
        if (track) {
          track.volume = this._musicVolume;
          track.play().catch(() => {});
        }
      } else {
        // First time enabling — start music
        this.startMusic();
      }
    } else if (!enabled && wasEnabled) {
      this.stopMusic();
    }
  }

  setMusicVolume(vol: number): void {
    this._musicVolume = vol;
    for (const track of this.musicTracks) {
      track.volume = vol;
    }
  }

  setSfxVolume(vol: number): void {
    this._sfxVolume = vol;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  get userHasInteracted(): boolean {
    return this._userHasInteracted;
  }

  /** Mark that the user has interacted with the page (unlocks autoplay). */
  markInteracted(): void {
    if (this._userHasInteracted) return;
    this._userHasInteracted = true;
    // If music should be playing, try to start it now
    if (this._enabled && this._musicPlaying) {
      this.tryResumeMusic();
    } else if (this._enabled) {
      this.startMusic();
    }
  }

  // ── SFX ─────────────────────────────────────────────────────────────────

  playClick(): void {
    if (!this._enabled || this.clickPool.length === 0) return;
    const sfx = this.clickPool[this.clickPoolIndex];
    this.clickPoolIndex = (this.clickPoolIndex + 1) % this.clickPool.length;
    sfx.volume = this._sfxVolume;
    sfx.currentTime = 0;
    sfx.play().catch(() => {});
  }

  playAchievement(): void {
    if (!this._enabled || !this.achievementSfx) return;
    this.achievementSfx.volume = this._sfxVolume;
    this.achievementSfx.currentTime = 0;
    this.achievementSfx.play().catch(() => {});
  }
}

/** Singleton audio manager for Temple of Joy. */
export const templeAudio = new TempleAudio();
