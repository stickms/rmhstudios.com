/**
 * Web Audio side of the synthesis kit: recipes are rendered once by `dsp.ts` (deterministic PCM)
 * and cached as `AudioBuffer`s, so playback is just a buffer source. Browser only.
 *
 * Why PCM instead of building an OfflineAudioContext graph per sound: Web Audio's own filters and
 * oscillators are not bit-identical across engines, and a graph cannot be unit-tested under Node.
 * `renderOffline` still pushes a buffer through an `OfflineAudioContext`, which is how the smoke
 * script checks the real Web Audio path end to end.
 */
import { measure, renderRecipe, type Pcm } from './dsp';
import { recipeFor, SOUND_BANK, SOUND_NAMES, type HarmonicSoundName } from './recipes';

export function pcmToBuffer(ctx: BaseAudioContext, pcm: Pcm): AudioBuffer {
  const len = pcm.channels[0].length;
  const buf = ctx.createBuffer(pcm.channels.length, len, pcm.rate);
  pcm.channels.forEach((ch, i) => buf.copyToChannel(ch as Float32Array<ArrayBuffer>, i));
  return buf;
}

/** Renders and caches the bank's buffers on one context. */
export class SoundSynth {
  private readonly cache = new Map<string, AudioBuffer>();

  constructor(private readonly ctx: BaseAudioContext) {}

  /** The buffer for (name, variant), rendered on first use. */
  buffer(name: HarmonicSoundName, variant = 0): AudioBuffer {
    const def = SOUND_BANK[name];
    const v = ((Math.floor(variant) % def.variants) + def.variants) % def.variants;
    const key = `${name}#${v}`;
    let buf = this.cache.get(key);
    if (!buf) {
      buf = pcmToBuffer(this.ctx, renderRecipe(recipeFor(name, v)));
      this.cache.set(key, buf);
    }
    return buf;
  }

  has(name: HarmonicSoundName, variant: number): boolean {
    return this.cache.has(`${name}#${variant}`);
  }

  get size(): number {
    return this.cache.size;
  }

  /**
   * Render sounds one per macrotask so the main thread keeps drawing. Resolves when done, or when
   * `signal` aborts.
   */
  async prepare(
    names: readonly HarmonicSoundName[] = SOUND_NAMES,
    signal?: AbortSignal,
  ): Promise<void> {
    for (const name of names) {
      const def = SOUND_BANK[name];
      for (let v = 0; v < def.variants; v++) {
        if (signal?.aborted) return;
        if (this.has(name, v)) continue;
        this.buffer(name, v);
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }
  }
}

/** Play a rendered sound through an `OfflineAudioContext` and measure the result (smoke test). */
export async function renderOffline(
  name: HarmonicSoundName,
  variant = 0,
): Promise<{ peak: number; rms: number; seconds: number; channels: number; rate: number }> {
  const pcm = renderRecipe(recipeFor(name, variant));
  const frames = pcm.channels[0].length;
  const offline = new OfflineAudioContext(pcm.channels.length, frames, pcm.rate);
  const src = offline.createBufferSource();
  src.buffer = pcmToBuffer(offline, pcm);
  src.connect(offline.destination);
  src.start();
  const out = await offline.startRendering();
  const rendered: Pcm = {
    rate: out.sampleRate,
    channels: Array.from({ length: out.numberOfChannels }, (_, i) => out.getChannelData(i)),
  };
  const m = measure(rendered);
  return { ...m, channels: out.numberOfChannels, rate: out.sampleRate };
}
