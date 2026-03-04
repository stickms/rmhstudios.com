import { Howl, Howler } from 'howler';

// --- SFX definitions ---
const SFX_KEYS = [
  'shot',
  'hit',
  'graze',
  'itemGet',
  'spellCard',
  'death',
  'oneUp',
  'melee',
  'dash',
  'pause',
] as const;

export type SfxKey = (typeof SFX_KEYS)[number];

/** Path for a given SFX key. Files may not exist yet — load errors are handled gracefully. */
function sfxPath(key: string): string {
  return `/audio/dream-rift/${key}.wav`;
}

/**
 * AudioManager — wraps Howler.js for Dream Rift's SFX and BGM needs.
 *
 * - preload() eagerly loads all SFX so they play instantly during gameplay.
 * - play(key) fires-and-forgets an SFX.
 * - playBGM / stopBGM manage a single looping background music track.
 * - setVolume() adjusts global volume (0-1).
 * - destroy() tears everything down for cleanup.
 */
export class AudioManager {
  private sfx = new Map<string, Howl>();
  private bgm: Howl | null = null;
  private destroyed = false;

  /**
   * Preload every SFX into memory.
   * Individual load errors are caught so a missing file never crashes the game.
   */
  preload(): void {
    for (const key of SFX_KEYS) {
      if (this.sfx.has(key)) continue;

      const howl = new Howl({
        src: [sfxPath(key)],
        preload: true,
        volume: 1.0,
        onloaderror: (_id: number, err: unknown) => {
          // Missing audio files are expected during development.
          console.warn(`[AudioManager] Failed to load SFX "${key}":`, err);
        },
      });

      this.sfx.set(key, howl);
    }
  }

  /**
   * Play an SFX by key. If the key hasn't been preloaded or failed to load,
   * the call is silently ignored.
   */
  play(key: string): void {
    if (this.destroyed) return;

    const howl = this.sfx.get(key);
    if (!howl) {
      console.warn(`[AudioManager] Unknown SFX key "${key}"`);
      return;
    }

    // Only play if actually loaded (state() returns 'loaded' | 'loading' | 'unloaded')
    if (howl.state() === 'loaded') {
      howl.play();
    }
  }

  /**
   * Play looping background music. Stops any previously-playing BGM first.
   * @param src  URL / path of the audio file (e.g. `/audio/dream-rift/stage1.ogg`).
   */
  playBGM(src: string): void {
    if (this.destroyed) return;

    this.stopBGM();

    this.bgm = new Howl({
      src: [src],
      loop: true,
      volume: 0.6,
      preload: true,
      onloaderror: (_id: number, err: unknown) => {
        console.warn(`[AudioManager] Failed to load BGM "${src}":`, err);
        this.bgm = null;
      },
    });

    this.bgm.play();
  }

  /** Fade out and stop the current BGM (if any). */
  stopBGM(): void {
    if (this.bgm) {
      // Quick fade to avoid a hard cut.
      this.bgm.fade(this.bgm.volume(), 0, 300);
      const ref = this.bgm;
      setTimeout(() => {
        ref.stop();
        ref.unload();
      }, 300);
      this.bgm = null;
    }
  }

  /**
   * Set the global volume for all audio (SFX + BGM).
   * @param volume  0 (muted) to 1 (full).
   */
  setVolume(volume: number): void {
    Howler.volume(Math.max(0, Math.min(1, volume)));
  }

  /**
   * Tear down all audio resources. After calling this, the manager should
   * not be used again.
   */
  destroy(): void {
    this.destroyed = true;
    this.stopBGM();

    for (const howl of this.sfx.values()) {
      howl.unload();
    }
    this.sfx.clear();
  }
}
