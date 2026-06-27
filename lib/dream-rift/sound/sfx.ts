/**
 * Procedural sound effects for Dream Rift — every blip synthesized at runtime.
 *
 * No audio files exist or are allowed, so each effect is a tiny WebAudio patch:
 * oscillators, noise bursts and envelopes shaped to read as a distinct game
 * cue. All effects route through the shared master gain (from `context.ts`) so
 * they share one context and the global volume path, but via their own sub-gain
 * so SFX volume is independent of music volume.
 *
 * `shot` and `graze` fire on almost every frame during heavy danmaku, so they
 * are deliberately cheap, very short and quiet, and are throttled internally:
 * a repeat within {@link RAPID_THROTTLE_MS} of the previous one is dropped so a
 * wall of fire never stacks into clipping or floods the audio graph.
 */

import { getAudioContext, getMasterGain } from "./context";

export type SfxName =
    | "shot"
    | "graze"
    | "hit"
    | "death"
    | "bomb"
    | "item"
    | "extend"
    | "spell"
    | "enemyDown"
    | "bossDown"
    | "menuMove"
    | "menuSelect"
    | "comment"
    | "pause";

/** Repeats of throttled effects within this window (ms) are ignored. */
const RAPID_THROTTLE_MS = 30;
/** Effects subject to rapid-fire throttling. */
const THROTTLED: ReadonlySet<SfxName> = new Set<SfxName>(["shot", "graze"]);

/** MIDI note number → frequency in Hz. */
function mtof(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Synthesized SFX player. One instance for the whole game; route every gameplay
 * and UI cue through {@link play}.
 */
export class Sfx {
    private enabled = true;
    private volume = 0.7;
    private gain: GainNode | null = null;
    private noiseBuffer: AudioBuffer | null = null;
    private lastPlayed: Partial<Record<SfxName, number>> = {};

    /** Resume the shared context (call from a user gesture). */
    async resume(): Promise<void> {
        const ctx = getAudioContext();
        if (!ctx) return;
        if (ctx.state === "suspended") {
            try {
                await ctx.resume();
            } catch {
                /* gesture may still be required */
            }
        }
    }

    /** Enable/disable all SFX. */
    setEnabled(on: boolean): void {
        this.enabled = on;
    }

    /** Set SFX volume in [0, 1], independent of music volume. */
    setVolume(v: number): void {
        this.volume = Math.max(0, Math.min(1, v));
        const ctx = getAudioContext();
        const bus = this.bus();
        if (bus && ctx) bus.gain.setTargetAtTime(this.volume, ctx.currentTime, 0.02);
    }

    /** Release the SFX bus. */
    dispose(): void {
        if (this.gain) {
            try {
                this.gain.disconnect();
            } catch {
                /* already gone */
            }
            this.gain = null;
        }
        this.noiseBuffer = null;
    }

    /** Play a named effect. No-op when disabled, during SSR, or when throttled. */
    play(name: SfxName): void {
        if (!this.enabled) return;
        const ctx = getAudioContext();
        const bus = this.bus();
        if (!ctx || !bus) return;

        if (THROTTLED.has(name)) {
            const last = this.lastPlayed[name] ?? 0;
            const nowMs = ctx.currentTime * 1000;
            if (nowMs - last < RAPID_THROTTLE_MS) return;
            this.lastPlayed[name] = nowMs;
        }

        const t = ctx.currentTime;
        switch (name) {
            case "shot":
                return this.shot(t);
            case "graze":
                return this.graze(t);
            case "hit":
                return this.hit(t);
            case "death":
                return this.death(t);
            case "bomb":
                return this.bomb(t);
            case "item":
                return this.item(t);
            case "extend":
                return this.extend(t);
            case "spell":
                return this.spell(t);
            case "enemyDown":
                return this.enemyDown(t);
            case "bossDown":
                return this.bossDown(t);
            case "menuMove":
                return this.menuMove(t);
            case "menuSelect":
                return this.menuSelect(t);
            case "comment":
                return this.comment(t);
            case "pause":
                return this.pause(t);
        }
    }

    // -------------------------------------------------------------------------
    // infrastructure
    // -------------------------------------------------------------------------

    /** Lazily create the dedicated SFX sub-gain hung off the master bus. */
    private bus(): GainNode | null {
        if (this.gain) return this.gain;
        const ctx = getAudioContext();
        const master = getMasterGain();
        if (!ctx || !master) return null;
        const g = ctx.createGain();
        g.gain.value = this.volume;
        g.connect(master);
        this.gain = g;
        return g;
    }

    private get noise(): AudioBuffer | null {
        const ctx = getAudioContext();
        if (!ctx) return null;
        if (this.noiseBuffer) return this.noiseBuffer;
        const len = Math.floor(ctx.sampleRate * 0.5);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.noiseBuffer = buf;
        return buf;
    }

    /** Disconnect a one-shot patch's nodes once finished. */
    private cleanup(src: AudioScheduledSourceNode, dead: number, ...nodes: AudioNode[]): void {
        const ctx = getAudioContext();
        const ms = ctx ? Math.max(0, (dead - ctx.currentTime) * 1000) + 30 : 0;
        const drop = () => {
            try {
                src.disconnect();
                for (const n of nodes) n.disconnect();
            } catch {
                /* already gone */
            }
        };
        src.onended = drop;
        setTimeout(drop, ms);
    }

    /** Convenience: enveloped oscillator tone into the SFX bus. */
    private tone(
        type: OscillatorType,
        f0: number,
        f1: number,
        peak: number,
        dur: number,
        t: number,
        dest?: AudioNode,
    ): void {
        const ctx = getAudioContext();
        const bus = this.bus();
        if (!ctx || !bus) return;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(f0, t);
        if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.008, dur * 0.2));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g).connect(dest ?? bus);
        osc.start(t);
        osc.stop(t + dur + 0.02);
        this.cleanup(osc, t + dur + 0.05, g);
    }

    /** Noise burst through a filter, enveloped. */
    private noiseHit(
        filter: BiquadFilterType,
        f0: number,
        f1: number,
        peak: number,
        dur: number,
        t: number,
    ): void {
        const ctx = getAudioContext();
        const bus = this.bus();
        const buf = this.noise;
        if (!ctx || !bus || !buf) return;
        const src = ctx.createBufferSource();
        const filt = ctx.createBiquadFilter();
        const g = ctx.createGain();
        src.buffer = buf;
        filt.type = filter;
        filt.Q.value = 2;
        filt.frequency.setValueAtTime(f0, t);
        if (f1 !== f0) filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        g.gain.setValueAtTime(peak, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(filt).connect(g).connect(bus);
        src.start(t);
        src.stop(t + dur + 0.02);
        this.cleanup(src, t + dur + 0.05, filt, g);
    }

    // ---- gameplay cues ------------------------------------------------------

    /** Tiny, quiet high tick — fired constantly while shooting. */
    private shot(t: number): void {
        this.tone("square", 1750, 1300, 0.05, 0.045, t);
    }

    /** Soft airy swish when a bullet grazes the hitbox. */
    private graze(t: number): void {
        this.noiseHit("bandpass", 2600, 5200, 0.06, 0.07, t);
    }

    /** Player took a hit: noise burst + downward pitch. */
    private hit(t: number): void {
        this.noiseHit("lowpass", 1800, 200, 0.5, 0.22, t);
        this.tone("triangle", 320, 90, 0.4, 0.25, t);
    }

    /** Player death: bigger noise + deep falling tone. */
    private death(t: number): void {
        this.noiseHit("lowpass", 2400, 120, 0.6, 0.5, t);
        this.tone("sawtooth", 260, 50, 0.5, 0.6, t);
    }

    /** Bomb deploy: rising filtered noise sweep. */
    private bomb(t: number): void {
        const ctx = getAudioContext();
        const bus = this.bus();
        const buf = this.noise;
        if (!ctx || !bus || !buf) return;
        const src = ctx.createBufferSource();
        const bp = ctx.createBiquadFilter();
        const g = ctx.createGain();
        src.buffer = buf;
        src.loop = true;
        bp.type = "bandpass";
        bp.Q.value = 1.2;
        bp.frequency.setValueAtTime(200, t);
        bp.frequency.exponentialRampToValueAtTime(6000, t + 0.55);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.45, t + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        src.connect(bp).connect(g).connect(bus);
        src.start(t);
        src.stop(t + 0.72);
        this.tone("sine", 80, 40, 0.4, 0.7, t);
        this.cleanup(src, t + 0.75, bp, g);
    }

    /** Item pickup: bright two-note ping. */
    private item(t: number): void {
        this.tone("triangle", mtof(84), mtof(84), 0.22, 0.08, t);
        this.tone("triangle", mtof(91), mtof(91), 0.18, 0.1, t + 0.05);
    }

    /** Extra life: ascending fanfare. */
    private extend(t: number): void {
        const notes = [72, 76, 79, 84];
        notes.forEach((n, i) => this.tone("square", mtof(n), mtof(n), 0.16, 0.12, t + i * 0.07));
    }

    /** Spell card declared: rising chord shimmer. */
    private spell(t: number): void {
        const notes = [60, 64, 67, 71, 74];
        notes.forEach((n, i) => {
            const tt = t + i * 0.04;
            this.tone("sawtooth", mtof(n - 12), mtof(n), 0.12, 0.5 - i * 0.04, tt);
        });
        this.noiseHit("highpass", 4000, 9000, 0.12, 0.4, t);
    }

    /** Small enemy destroyed: short bright pop. */
    private enemyDown(t: number): void {
        this.tone("square", 900, 1400, 0.18, 0.07, t);
        this.noiseHit("highpass", 3000, 6000, 0.16, 0.09, t);
    }

    /** Boss destroyed: big descending boom. */
    private bossDown(t: number): void {
        this.tone("sawtooth", 420, 40, 0.5, 1.1, t);
        this.tone("sine", 120, 30, 0.5, 1.2, t);
        this.noiseHit("lowpass", 4000, 150, 0.5, 1.0, t);
    }

    // ---- UI cues ------------------------------------------------------------

    /** Menu cursor move: short neutral blip. */
    private menuMove(t: number): void {
        this.tone("square", 660, 660, 0.12, 0.05, t);
    }

    /** Menu confirm: bright up-blip pair. */
    private menuSelect(t: number): void {
        this.tone("square", 660, 660, 0.14, 0.05, t);
        this.tone("square", 990, 990, 0.14, 0.08, t + 0.05);
    }

    /** Chat/comment notification: soft double tick. */
    private comment(t: number): void {
        this.tone("sine", 1200, 1200, 0.1, 0.04, t);
        this.tone("sine", 1600, 1600, 0.1, 0.05, t + 0.05);
    }

    /** Pause toggle: low neutral thunk. */
    private pause(t: number): void {
        this.tone("triangle", 300, 220, 0.18, 0.12, t);
    }
}
