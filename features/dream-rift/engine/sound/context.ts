/**
 * Shared WebAudio context for Dream Rift's procedural sound system.
 *
 * Music and SFX are both synthesized at runtime — no audio files exist or are
 * allowed — so every voice in the game routes through one lazily-created
 * `AudioContext` and a single master gain node. Centralizing both here means a
 * single user-gesture resume unblocks all sound, and one master volume controls
 * the whole mix. Everything is guarded for SSR: when there is no `window`, the
 * accessors return `null` and callers degrade to silent no-ops.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let unavailable = false;

/**
 * Lazily create (and return) the one shared AudioContext.
 *
 * Returns `null` during SSR or when the browser has no WebAudio support. The
 * result is memoized; a single failed construction permanently disables audio
 * so we never spam the console on repeated calls.
 */
export function getAudioContext(): AudioContext | null {
    if (ctx) return ctx;
    if (unavailable) return null;
    if (typeof window === "undefined") return null;

    const Ctor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
    if (!Ctor) {
        unavailable = true;
        return null;
    }

    try {
        ctx = new Ctor();
    } catch {
        unavailable = true;
        return null;
    }

    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    return ctx;
}

/**
 * The shared master gain node (everything mixes through this).
 *
 * Triggers lazy context creation, so the first caller after a user gesture is
 * enough to bring the whole graph online. Returns `null` when audio is
 * unavailable.
 */
export function getMasterGain(): GainNode | null {
    if (!master) getAudioContext();
    return master;
}

/**
 * Resume the AudioContext — must be called from within a user gesture handler
 * (click / keydown / pointerdown), or browsers keep it suspended. Safe to call
 * repeatedly and safe during SSR (resolves immediately).
 */
export async function resumeAudio(): Promise<void> {
    const c = getAudioContext();
    if (!c) return;
    if (c.state === "suspended") {
        try {
            await c.resume();
        } catch {
            /* ignore — autoplay policy may still block until a real gesture */
        }
    }
}
