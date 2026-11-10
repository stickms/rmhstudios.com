/**
 * Dream Rift's master bus for its procedural sound system.
 *
 * Music and SFX are both synthesized at runtime — no audio files exist or are
 * allowed — so every voice in the game routes through the page's one shared
 * `AudioContext` (`getAudioContext()` in `lib/shared/platform`) and a single
 * master gain node made here, so one master volume controls the whole mix. When audio is unavailable (SSR, no Web Audio) the accessor
 * returns `null` and callers degrade to silent no-ops.
 */

import { getAudioContext } from '@/lib/shared/platform';

let master: GainNode | null = null;
let masterCtx: AudioContext | null = null;

/**
 * The shared master gain node (everything mixes through this), or `null` when
 * audio is unavailable. Triggers lazy context creation, so the first caller
 * after a user gesture is enough to bring the whole graph online.
 */
export function getMasterGain(): GainNode | null {
    const ctx = getAudioContext();
    if (!ctx) return null;
    if (!master || masterCtx !== ctx) {
        masterCtx = ctx;
        master = ctx.createGain();
        master.gain.value = 1;
        master.connect(ctx.destination);
    }
    return master;
}
