/**
 * Procedural, fully-synthesized looping techno soundtrack for Dream Rift.
 *
 * No audio files exist or are allowed — every bar is generated at runtime with
 * WebAudio oscillators, noise and envelopes. Scheduling follows the canonical
 * "A Tale of Two Clocks" pattern: a coarse `setInterval` (~25ms) wakes up and
 * schedules every note whose time falls inside a short lookahead window
 * (~0.1s), using `AudioContext.currentTime` for sample-accurate placement. That
 * decouples sloppy JS timers from tight musical timing, so the loop never
 * drifts or glitches even under GC pressure from the bullet simulation.
 *
 * Nine tracks share one voice engine but differ in tempo, key, chord
 * progression, bassline and arp so they are recognizably distinct: a chill menu
 * loop, energetic stage themes, intense/faster boss themes, a triumphant major
 * victory sting and a somber game-over dirge. All nodes created per-note are
 * one-shot and self-disconnecting; switching tracks or stopping tears down the
 * shared per-track graph to avoid leaks.
 */

import { getAudioContext, getMasterGain } from "./context";

export type MusicTrack =
    | "menu"
    | "stage1"
    | "boss1"
    | "stage2"
    | "boss2"
    | "stage3"
    | "boss3"
    | "victory"
    | "gameover";

/** Semitone offsets from the track root for one octave of the chosen scale. */
const SCALES = {
    minor: [0, 2, 3, 5, 7, 8, 10],
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    major: [0, 2, 4, 5, 7, 9, 11],
    naturalMinor: [0, 2, 3, 5, 7, 8, 10],
} as const;

type ScaleName = keyof typeof SCALES;

interface TrackDef {
    /** Beats per minute. */
    bpm: number;
    /** MIDI note number of the tonic (e.g. 57 = A3). */
    root: number;
    scale: ScaleName;
    /** Chord roots as scale-degree indices, one per bar in the progression. */
    progression: readonly number[];
    /** 16-step bass pattern; values are scale-degree offsets or `null` (rest). */
    bass: readonly (number | null)[];
    /** 16-step arp pattern; values are scale-degree offsets or `null` (rest). */
    arp: readonly (number | null)[];
    /** 16-step kick pattern (1 = hit). */
    kick: readonly number[];
    /** 16-step hat pattern (1 = hit). */
    hat: readonly number[];
    /** Whether to layer a sustained pad/lead (boss + victory themes). */
    pad: boolean;
    /** Overall mood gain multiplier. */
    intensity: number;
}

const FOUR_FLOOR = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] as const;
const OFFBEAT_HAT = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0] as const;
const BUSY_HAT = [0, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1] as const;

/**
 * Per-track musical identity. Roots are picked in moody minor-ish keys for the
 * Touhou feel; victory flips to major and game-over slows to a dirge.
 */
const TRACKS: Record<MusicTrack, TrackDef> = {
    menu: {
        bpm: 124,
        root: 57, // A3
        scale: "naturalMinor",
        progression: [0, 5, 3, 4],
        bass: [0, null, 0, null, 4, null, 3, null, 0, null, 0, 2, 4, null, 3, null],
        arp: [0, 4, 2, 4, 7, 4, 2, 4, 0, 3, 2, 5, 7, 4, 2, null],
        kick: FOUR_FLOOR,
        hat: OFFBEAT_HAT,
        pad: true,
        intensity: 0.55,
    },
    stage1: {
        bpm: 142,
        root: 55, // G3
        scale: "minor",
        progression: [0, 3, 5, 4],
        bass: [0, 0, null, 0, 0, null, 3, 3, 5, 5, null, 5, 4, 4, null, 2],
        arp: [7, null, 4, 7, null, 4, 9, null, 7, 4, null, 2, 4, null, 7, 9],
        kick: FOUR_FLOOR,
        hat: OFFBEAT_HAT,
        pad: false,
        intensity: 0.7,
    },
    boss1: {
        bpm: 150,
        root: 53, // F3
        scale: "harmonicMinor",
        progression: [0, 4, 5, 4],
        bass: [0, 0, 0, null, 0, 0, 0, null, 5, 5, 5, null, 4, 4, 3, 2],
        arp: [0, 7, 6, 7, 9, 7, 6, 7, 11, 7, 6, 7, 9, 11, 9, 7],
        kick: [1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0],
        hat: BUSY_HAT,
        pad: true,
        intensity: 0.9,
    },
    stage2: {
        bpm: 144,
        root: 50, // D3
        scale: "phrygian",
        progression: [0, 1, 0, 4],
        bass: [0, 0, 1, null, 0, 0, null, 0, 4, 4, 3, null, 1, 1, null, 0],
        arp: [4, 7, 4, 8, 4, 7, 11, 7, 4, 7, 4, 8, 11, 7, 4, 7],
        kick: FOUR_FLOOR,
        hat: BUSY_HAT,
        pad: false,
        intensity: 0.75,
    },
    boss2: {
        bpm: 152,
        root: 49, // C#3
        scale: "phrygian",
        progression: [0, 5, 1, 0],
        bass: [0, 0, 0, 1, 0, 0, 0, 1, 5, 5, 5, 6, 4, 4, 3, 1],
        arp: [0, 8, 7, 8, 11, 8, 7, 8, 12, 8, 7, 11, 8, 12, 11, 8],
        kick: [1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1],
        hat: BUSY_HAT,
        pad: true,
        intensity: 0.95,
    },
    stage3: {
        bpm: 146,
        root: 52, // E3
        scale: "harmonicMinor",
        progression: [0, 3, 4, 5],
        bass: [0, 0, null, 3, 0, 0, null, 3, 4, 4, null, 5, 4, 4, 3, 2],
        arp: [7, 11, 7, 4, 9, 11, 7, 4, 7, 11, 14, 11, 9, 7, 4, 7],
        kick: FOUR_FLOOR,
        hat: BUSY_HAT,
        pad: false,
        intensity: 0.8,
    },
    boss3: {
        bpm: 156,
        root: 47, // B2
        scale: "harmonicMinor",
        progression: [0, 5, 4, 0],
        bass: [0, 0, 0, 0, 0, 0, 1, 0, 5, 5, 5, 5, 4, 3, 2, 1],
        arp: [0, 11, 8, 7, 11, 8, 7, 11, 12, 11, 8, 7, 14, 11, 8, 7],
        kick: [1, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1],
        hat: BUSY_HAT,
        pad: true,
        intensity: 1.0,
    },
    victory: {
        bpm: 132,
        root: 60, // C4
        scale: "major",
        progression: [0, 4, 5, 4],
        bass: [0, null, 0, null, 4, null, 4, null, 5, null, 5, null, 4, null, 4, null],
        arp: [0, 4, 7, 11, 7, 4, 7, 11, 12, 11, 7, 4, 7, 11, 14, 11],
        kick: FOUR_FLOOR,
        hat: OFFBEAT_HAT,
        pad: true,
        intensity: 0.85,
    },
    gameover: {
        bpm: 76,
        root: 45, // A2
        scale: "naturalMinor",
        progression: [0, 5, 3, 0],
        bass: [0, null, null, null, 5, null, null, null, 3, null, null, null, 0, null, null, null],
        arp: [0, null, 3, null, 7, null, 3, null, 5, null, 3, null, 0, null, null, null],
        kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
        hat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        pad: true,
        intensity: 0.5,
    },
};

/** How far ahead (seconds) we schedule notes each scheduler tick. */
const LOOKAHEAD = 0.1;
/** Scheduler wakeup interval (ms). */
const TICK_MS = 25;
/** Cross-fade time (seconds) when switching tracks. */
const FADE = 0.6;

/** MIDI note number → frequency in Hz. */
function mtof(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Resolve a scale-degree offset (which may exceed an octave) to a MIDI note. */
function degreeToMidi(root: number, scale: readonly number[], degree: number): number {
    const len = scale.length;
    const oct = Math.floor(degree / len);
    const idx = ((degree % len) + len) % len;
    return root + oct * 12 + scale[idx];
}

/**
 * Synthesized looping music engine. One instance drives the whole soundtrack;
 * call {@link play} to switch tracks (cross-faded) and {@link stop} to silence.
 */
export class Music {
    private enabled = true;
    private volume = 0.6;
    private track: MusicTrack | null = null;

    /** Per-track output bus (cross-faded on switch); null when stopped. */
    private trackGain: GainNode | null = null;
    private noiseBuffer: AudioBuffer | null = null;

    // --- scheduler state ---
    private timer: ReturnType<typeof setInterval> | null = null;
    private nextNoteTime = 0;
    private step = 0;
    private bar = 0;

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

    /** Enable/disable music. Disabling stops the scheduler immediately. */
    setEnabled(on: boolean): void {
        this.enabled = on;
        if (!on) {
            this.stop();
        }
    }

    /** Set music volume in [0, 1]. */
    setVolume(v: number): void {
        this.volume = Math.max(0, Math.min(1, v));
        const ctx = getAudioContext();
        if (this.trackGain && ctx) {
            const def = this.track ? TRACKS[this.track] : null;
            const target = this.volume * (def ? def.intensity : 1);
            this.trackGain.gain.setTargetAtTime(target, ctx.currentTime, 0.05);
        }
    }

    /** Currently playing track, or null if stopped. */
    getTrack(): MusicTrack | null {
        return this.track;
    }

    /**
     * Start (or switch to) a track. Cross-fades out any current track and
     * restarts the loop from the top of the progression so it always begins on
     * a downbeat. No-op if the requested track is already playing.
     */
    play(track: MusicTrack): void {
        if (!this.enabled) {
            this.track = track; // remember intent; honored when re-enabled
            return;
        }
        if (this.track === track && this.trackGain) return;

        const ctx = getAudioContext();
        const masterGain = getMasterGain();
        if (!ctx || !masterGain) {
            this.track = track;
            return;
        }

        this.fadeOutAndTeardown();

        const def = TRACKS[track];
        const bus = ctx.createGain();
        bus.gain.value = 0;
        bus.connect(masterGain);
        bus.gain.setTargetAtTime(this.volume * def.intensity, ctx.currentTime, FADE / 3);

        this.trackGain = bus;
        this.track = track;
        this.step = 0;
        this.bar = 0;
        this.nextNoteTime = ctx.currentTime + 0.05;

        if (this.timer === null) {
            this.timer = setInterval(() => this.scheduler(), TICK_MS);
        }
    }

    /** Stop playback and tear down all music nodes. */
    stop(): void {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.fadeOutAndTeardown();
        this.track = null;
    }

    /** Stop and release everything (alias of stop for lifecycle symmetry). */
    dispose(): void {
        this.stop();
        this.noiseBuffer = null;
    }

    // -------------------------------------------------------------------------
    // internals
    // -------------------------------------------------------------------------

    /** Fade the current track bus out and disconnect it shortly after. */
    private fadeOutAndTeardown(): void {
        const ctx = getAudioContext();
        const bus = this.trackGain;
        this.trackGain = null;
        if (!bus) return;
        if (!ctx) {
            try {
                bus.disconnect();
            } catch {
                /* already gone */
            }
            return;
        }
        const now = ctx.currentTime;
        bus.gain.cancelScheduledValues(now);
        bus.gain.setValueAtTime(bus.gain.value, now);
        bus.gain.linearRampToValueAtTime(0, now + FADE);
        setTimeout(
            () => {
                try {
                    bus.disconnect();
                } catch {
                    /* already disconnected */
                }
            },
            (FADE + 0.1) * 1000,
        );
    }

    /** The "tale of two clocks" lookahead loop. */
    private scheduler(): void {
        const ctx = getAudioContext();
        if (!ctx || !this.track || !this.trackGain) return;
        const def = TRACKS[this.track];
        const secPerStep = 60 / def.bpm / 4; // 16th notes

        while (this.nextNoteTime < ctx.currentTime + LOOKAHEAD) {
            this.scheduleStep(def, this.step, this.nextNoteTime);
            this.nextNoteTime += secPerStep;
            this.step += 1;
            if (this.step >= 16) {
                this.step = 0;
                this.bar = (this.bar + 1) % def.progression.length;
            }
        }
    }

    /** Schedule every voice that fires on a given 16th-note step. */
    private scheduleStep(def: TrackDef, step: number, time: number): void {
        const scale = SCALES[def.scale];
        const chordDegree = def.progression[this.bar];
        const stepSec = 60 / def.bpm / 4;

        if (def.kick[step]) this.kick(time, def.intensity);
        if (def.hat[step]) this.hat(time, step % 4 === 2 ? 0.5 : 0.32);

        const bassDeg = def.bass[step];
        if (bassDeg !== null && bassDeg !== undefined) {
            const note = degreeToMidi(def.root - 12, scale, chordDegree + bassDeg);
            this.bassNote(mtof(note), time, stepSec * 0.95);
        }

        const arpDeg = def.arp[step];
        if (arpDeg !== null && arpDeg !== undefined) {
            const note = degreeToMidi(def.root + 12, scale, chordDegree + arpDeg);
            this.pluck(mtof(note), time, stepSec * 1.6);
        }

        // Pad/lead: re-voice the chord at the top of each bar.
        if (def.pad && step === 0) {
            const barSec = stepSec * 16;
            this.padChord(def, chordDegree, scale, time, barSec);
        }
    }

    // ---- voices -------------------------------------------------------------

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

    /** Four-on-the-floor kick: pitch drops fast, amp snaps shut. */
    private kick(time: number, intensity: number): void {
        const ctx = getAudioContext();
        const bus = this.trackGain;
        if (!ctx || !bus) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(45, time + 0.12);
        const peak = 0.9 * intensity;
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(peak, time + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.25);
        osc.connect(gain).connect(bus);
        osc.start(time);
        osc.stop(time + 0.3);
        this.cleanup(osc, gain, time + 0.32);
    }

    /** Off-beat hi-hat: a short, brightly-filtered noise burst. */
    private hat(time: number, level: number): void {
        const ctx = getAudioContext();
        const bus = this.trackGain;
        const buf = this.noise;
        if (!ctx || !bus || !buf) return;
        const src = ctx.createBufferSource();
        const hp = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        src.buffer = buf;
        hp.type = "highpass";
        hp.frequency.value = 7000;
        gain.gain.setValueAtTime(level * 0.3, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
        src.connect(hp).connect(gain).connect(bus);
        src.start(time);
        src.stop(time + 0.06);
        this.cleanup(src, gain, time + 0.08, hp);
    }

    /** Driving 16th-note bass: saw through an enveloped lowpass. */
    private bassNote(freq: number, time: number, dur: number): void {
        const ctx = getAudioContext();
        const bus = this.trackGain;
        if (!ctx || !bus) return;
        const osc = ctx.createOscillator();
        const lp = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.value = freq;
        lp.type = "lowpass";
        lp.Q.value = 6;
        lp.frequency.setValueAtTime(Math.min(freq * 8, 2400), time);
        lp.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.5, 120), time + dur);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.34, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        osc.connect(lp).connect(gain).connect(bus);
        osc.start(time);
        osc.stop(time + dur + 0.02);
        this.cleanup(osc, gain, time + dur + 0.05, lp);
    }

    /** Syncopated pluck/arp: square with short decay through a feedback delay. */
    private pluck(freq: number, time: number, dur: number): void {
        const ctx = getAudioContext();
        const bus = this.trackGain;
        if (!ctx || !bus) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const delay = ctx.createDelay();
        const fb = ctx.createGain();
        const wet = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.16, time + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + dur * 0.5);
        delay.delayTime.value = 0.18;
        fb.gain.value = 0.32;
        wet.gain.value = 0.5;
        osc.connect(gain);
        gain.connect(bus); // dry
        gain.connect(delay);
        delay.connect(fb);
        fb.connect(delay); // feedback loop
        delay.connect(wet).connect(bus); // wet
        osc.start(time);
        osc.stop(time + dur * 0.5 + 0.02);
        const dead = time + dur * 0.5 + 0.7;
        this.cleanup(osc, gain, dead, undefined, [delay, fb, wet]);
    }

    /** Sustained pad/lead chord for boss / menu / victory themes. */
    private padChord(
        def: TrackDef,
        chordDegree: number,
        scale: readonly number[],
        time: number,
        dur: number,
    ): void {
        const ctx = getAudioContext();
        const bus = this.trackGain;
        if (!ctx || !bus) return;
        const voices = [0, 2, 4]; // triad
        const gain = ctx.createGain();
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 1800;
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(0.09, time + dur * 0.25);
        gain.gain.setValueAtTime(0.09, time + dur * 0.6);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        lp.connect(gain).connect(bus);

        const oscs: OscillatorNode[] = [];
        for (const v of voices) {
            const note = degreeToMidi(def.root, scale, chordDegree + v);
            const osc = ctx.createOscillator();
            osc.type = "sawtooth";
            osc.frequency.value = mtof(note);
            osc.detune.value = (Math.random() - 0.5) * 8;
            osc.connect(lp);
            osc.start(time);
            osc.stop(time + dur + 0.05);
            oscs.push(osc);
        }
        const dead = time + dur + 0.1;
        for (const osc of oscs) {
            osc.onended = () => {
                try {
                    osc.disconnect();
                } catch {
                    /* noop */
                }
            };
        }
        setTimeout(
            () => {
                try {
                    lp.disconnect();
                    gain.disconnect();
                } catch {
                    /* noop */
                }
            },
            (dead - ctx.currentTime + 0.1) * 1000,
        );
    }

    /** Disconnect a one-shot voice's nodes once it has finished playing. */
    private cleanup(
        src: AudioScheduledSourceNode,
        gain: GainNode,
        deadAt: number,
        extra?: AudioNode,
        extras?: AudioNode[],
    ): void {
        const ctx = getAudioContext();
        const ms = ctx ? Math.max(0, (deadAt - ctx.currentTime) * 1000) + 30 : 0;
        const drop = () => {
            try {
                src.disconnect();
                gain.disconnect();
                if (extra) extra.disconnect();
                if (extras) for (const n of extras) n.disconnect();
            } catch {
                /* already gone */
            }
        };
        src.onended = drop;
        setTimeout(drop, ms); // backstop in case onended never fires
    }
}
