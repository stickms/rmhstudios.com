/**
 * Bum's Rush sprite sheet loader — one decoded buffer per world with named offsets.
 *
 * Instead of decoding 60 individual audio files (which causes a 2-second
 * hitch on a phone), we decode one buffer per world and store byte offsets
 * in a JSON manifest.
 *
 * Design doc: docs/plans/2026-08-08-bums-rush-design.md §14.
 */

import { getContext } from './bus';

export interface SpriteManifest {
  version: 1;
  sprites: Record<
    string,
    {
      offset: number; // sample index
      duration: number; // sample count
    }
  >;
}

/**
 * A loaded and decoded sprite sheet, ready to play sprites from.
 */
export class SpriteSheet {
  readonly buffer: AudioBuffer;
  readonly manifest: SpriteManifest;

  constructor(buffer: AudioBuffer, manifest: SpriteManifest) {
    this.buffer = buffer;
    this.manifest = manifest;
  }

  /**
   * Play a named sprite (sound) from the sheet.
   * Returns a function to stop playback early.
   *
   * Returns null if the sprite is not found in the manifest.
   */
  play(name: string, gain = 1.0): (() => void) | null {
    const ctx = getContext();
    if (!ctx) return null;

    const sprite = this.manifest.sprites[name];
    if (!sprite) return null;

    const source = ctx.createBufferSource();
    source.buffer = this.buffer;

    const gainNode = ctx.createGain();
    gainNode.gain.value = gain;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Calculate the duration in seconds.
    const offsetSeconds = sprite.offset / this.buffer.sampleRate;
    const durationSeconds = sprite.duration / this.buffer.sampleRate;

    // Start playing from the sprite's offset.
    source.start(ctx.currentTime, offsetSeconds, durationSeconds);

    return () => {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    };
  }
}

/**
 * Load a sprite sheet from a decoded audio buffer and manifest.
 *
 * In a full implementation, this would fetch the buffer (e.g., a .webm or .mp3)
 * and the manifest (.json), decode the buffer, and return the SpriteSheet.
 * For now, this is a placeholder for the structure.
 */
export async function loadSpriteSheet(
  bufferUrl: string,
  manifestUrl: string,
): Promise<SpriteSheet> {
  const ctx = getContext();
  if (!ctx) throw new Error('AudioContext not available');

  // Fetch and decode the buffer.
  const bufferResponse = await fetch(bufferUrl);
  if (!bufferResponse.ok) {
    throw new Error(`Failed to fetch sprite buffer: ${bufferResponse.status}`);
  }

  const arrayBuffer = await bufferResponse.arrayBuffer();
  const buffer = await ctx.decodeAudioData(arrayBuffer);

  // Fetch the manifest.
  const manifestResponse = await fetch(manifestUrl);
  if (!manifestResponse.ok) {
    throw new Error(`Failed to fetch sprite manifest: ${manifestResponse.status}`);
  }

  const manifest = (await manifestResponse.json()) as SpriteManifest;

  return new SpriteSheet(buffer, manifest);
}

/**
 * Validate a sprite manifest.
 * Used at author time to catch mistakes in the manifest.
 */
export function validateSpriteManifest(manifest: unknown): string[] {
  // `unknown` rather than `SpriteManifest`: this validates a JSON file fetched
  // at runtime, so the one input it must handle is the one that does NOT match
  // the type. Typing the parameter as the shape it is checking for made the
  // function unable to accept anything worth checking — every call site had to
  // assert the value valid before asking whether it was.
  const errors: string[] = [];

  if (typeof manifest !== 'object' || manifest === null) {
    return ['manifest must be an object'];
  }
  const m = manifest as { version?: unknown; sprites?: unknown };

  if (m.version !== 1) {
    errors.push(`Invalid version: ${String(m.version)}, expected 1`);
  }

  if (typeof m.sprites !== 'object' || m.sprites === null || Array.isArray(m.sprites)) {
    errors.push('sprites must be an object');
    return errors;
  }

  for (const [name, sprite] of Object.entries(m.sprites as Record<string, unknown>)) {
    const s = sprite as { offset?: unknown; duration?: unknown } | null;
    if (typeof s !== 'object' || s === null) {
      errors.push(`Sprite "${name}": must be an object`);
      continue;
    }
    if (typeof s.offset !== 'number' || s.offset < 0) {
      errors.push(`Sprite "${name}": offset must be a non-negative number`);
    }
    if (typeof s.duration !== 'number' || s.duration <= 0) {
      errors.push(`Sprite "${name}": duration must be a positive number`);
    }
  }

  return errors;
}
