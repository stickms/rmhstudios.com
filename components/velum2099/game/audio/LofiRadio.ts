// @ts-nocheck
/* ═══════════════════════════════════════════
   NEURODRIVE — Lo-Fi / Jazz Radio
   Procedural Web Audio API synthesizer
   Cycle: OFF → lo-fi → jazz → OFF
   No external audio files needed
   ═══════════════════════════════════════════ */

// Lo-fi chord progressions (MIDI note numbers)
const LOFI_PROGRESSIONS = [
    // Am7 → Fmaj7 → Cmaj7 → G
    [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 66]],
    // Dm7 → G7 → Cmaj7 → Am7
    [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [57, 60, 64, 67]],
    // Em7 → Am7 → Dm7 → G
    [[52, 55, 59, 62], [57, 60, 64, 67], [50, 53, 57, 60], [55, 59, 62, 66]],
];

// Jazz chord progressions — ii-V-I turnarounds
const JAZZ_PROGRESSIONS = [
    // Dm7 → G7 → Cmaj7 → A7
    [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [57, 61, 64, 67]],
    // Fm7 → Bb7 → Ebmaj7 → Cm7
    [[53, 56, 60, 63], [58, 62, 65, 68], [51, 55, 58, 62], [48, 51, 55, 58]],
];

function midiToFreq(n) { return 440 * Math.pow(2, (n - 69) / 12); }

export class LofiRadio {
    constructor() {
        this.ctx = null;
        this.playing = false;
        this._mode = 'off'; // 'off' | 'lofi' | 'jazz'
        this._masterGain = null;
        this._compressor = null;
        this._lopassMaster = null;

        // Timing
        this._bpm = 0;
        this._beatDur = 0;
        this._nextBeatTime = 0;
        this._beatIndex = 0;
        this._chordIndex = 0;
        this._progression = null;

        // Active nodes for cleanup
        this._padOscs = [];
        this._bassOsc = null;
        this._bassGain = null;
        this._crackleSource = null;
        this._lfoOsc = null;
        this._padFilter = null;
        this._padGain = null;
        this._noiseBuffer = null;
        this._popTimer = 0;
        this._trumpetOsc = null;
        this._trumpetGain = null;
        this._trumpetLfo = null;
        this._trumpetFilter = null;
        this._delayNode = null;
        this._delayFeedback = null;
    }

    toggle() {
        if (this._mode === 'off') {
            this._mode = 'lofi';
            this._startLofi();
            return 'lofi';
        } else if (this._mode === 'lofi') {
            this._playStatic();
            this._crossfadeToJazz();
            return 'jazz';
        } else {
            this._mode = 'off';
            this._stop();
            return 'off';
        }
    }

    /* ═══════════════════════════════════════
       LO-FI MODE
       ═══════════════════════════════════════ */

    _startLofi() {
        this._ensureCtx();
        this.playing = true;
        this._bpm = 75 + Math.random() * 10;
        this._beatDur = 60 / this._bpm;
        this._beatIndex = 0;
        this._chordIndex = 0;
        this._nextBeatTime = this.ctx.currentTime + 0.1;
        this._progression = LOFI_PROGRESSIONS[Math.floor(Math.random() * LOFI_PROGRESSIONS.length)];

        this._buildGraph();
        this._startCrackle();
        this._startPad('sawtooth', 800, 0.12);
        this._startBass(0.18, 300);
    }

    /* ═══════════════════════════════════════
       JAZZ MODE
       ═══════════════════════════════════════ */

    _crossfadeToJazz() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Fade out current sounds
        if (this._padGain) {
            this._padGain.gain.setValueAtTime(this._padGain.gain.value, now);
            this._padGain.gain.linearRampToValueAtTime(0, now + 0.4);
        }
        if (this._bassGain) {
            this._bassGain.gain.setValueAtTime(this._bassGain.gain.value, now);
            this._bassGain.gain.linearRampToValueAtTime(0, now + 0.4);
        }

        // Stop old nodes and rebuild after fade
        setTimeout(() => {
            this._cleanupNodes();
            this._mode = 'jazz';

            this._bpm = 100 + Math.random() * 20;
            this._beatDur = 60 / this._bpm;
            this._beatIndex = 0;
            this._chordIndex = 0;
            this._nextBeatTime = this.ctx.currentTime + 0.1;
            this._progression = JAZZ_PROGRESSIONS[Math.floor(Math.random() * JAZZ_PROGRESSIONS.length)];

            this._buildGraph();
            this._startRoomDelay();
            this._startPad('triangle', 600, 0.14);
            this._startBass(0.2, 250);
            this._startTrumpet();

            // Fade in
            if (this._masterGain) {
                this._masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
                this._masterGain.gain.linearRampToValueAtTime(0.15, this.ctx.currentTime + 0.3);
            }
        }, 450);
    }

    _startRoomDelay() {
        const ctx = this.ctx;
        // Simple delay feedback loop for smoky room feel
        this._delayNode = ctx.createDelay(0.2);
        this._delayNode.delayTime.value = 0.08;

        this._delayFeedback = ctx.createGain();
        this._delayFeedback.gain.value = 0.3;

        const delayFilter = ctx.createBiquadFilter();
        delayFilter.type = 'lowpass';
        delayFilter.frequency.value = 2000;

        this._compressor.connect(this._delayNode);
        this._delayNode.connect(delayFilter);
        delayFilter.connect(this._delayFeedback);
        this._delayFeedback.connect(this._delayNode);
        this._delayNode.connect(this._lopassMaster);
    }

    _startTrumpet() {
        const ctx = this.ctx;

        // Muted trumpet — square wave + heavy lowpass
        this._trumpetOsc = ctx.createOscillator();
        this._trumpetOsc.type = 'square';
        this._trumpetOsc.frequency.value = 0; // will be set in scheduling

        this._trumpetFilter = ctx.createBiquadFilter();
        this._trumpetFilter.type = 'lowpass';
        this._trumpetFilter.frequency.value = 1200;
        this._trumpetFilter.Q.value = 1;

        this._trumpetGain = ctx.createGain();
        this._trumpetGain.gain.value = 0; // silent until note played

        // Vibrato LFO
        this._trumpetLfo = ctx.createOscillator();
        this._trumpetLfo.frequency.value = 5;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 3; // ±3 Hz vibrato
        this._trumpetLfo.connect(lfoGain);
        lfoGain.connect(this._trumpetOsc.frequency);
        this._trumpetLfo.start();

        this._trumpetOsc.connect(this._trumpetFilter);
        this._trumpetFilter.connect(this._trumpetGain);
        this._trumpetGain.connect(this._compressor);
        this._trumpetOsc.start();
    }

    _scheduleTrumpetNote(time) {
        if (!this._trumpetOsc || !this._trumpetGain) return;

        // 30% chance to rest
        if (Math.random() < 0.3) {
            this._trumpetGain.gain.setValueAtTime(0, time);
            return;
        }

        const chord = this._progression[this._chordIndex % this._progression.length];
        const note = chord[Math.floor(Math.random() * chord.length)];
        const freq = midiToFreq(note + 12); // octave up for trumpet range

        this._trumpetOsc.frequency.setValueAtTime(freq, time);
        this._trumpetGain.gain.setValueAtTime(0, time);
        this._trumpetGain.gain.linearRampToValueAtTime(0.05, time + 0.03);

        // Hold for 1-2 beats then fade
        const holdBeats = 1 + Math.random();
        const holdTime = holdBeats * this._beatDur;
        this._trumpetGain.gain.setValueAtTime(0.05, time + holdTime * 0.8);
        this._trumpetGain.gain.exponentialRampToValueAtTime(0.001, time + holdTime);
    }

    /* ═══════════════════════════════════════
       SHARED AUDIO BUILDING BLOCKS
       ═══════════════════════════════════════ */

    _ensureCtx() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    _buildGraph() {
        const ctx = this.ctx;

        this._compressor = ctx.createDynamicsCompressor();
        this._compressor.threshold.value = -20;
        this._compressor.knee.value = 20;
        this._compressor.ratio.value = 4;

        this._lopassMaster = ctx.createBiquadFilter();
        this._lopassMaster.type = 'lowpass';
        this._lopassMaster.frequency.value = 11000;

        // Staircase waveshaper for subtle bitcrush
        const steps = 64;
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
            const x = (i / 255) * 2 - 1;
            curve[i] = Math.round(x * steps) / steps;
        }
        this._bitcrusher = ctx.createWaveShaper();
        this._bitcrusher.curve = curve;
        this._bitcrusher.oversample = 'none';

        this._masterGain = ctx.createGain();
        this._masterGain.gain.value = 0.15;

        this._compressor.connect(this._lopassMaster);
        this._lopassMaster.connect(this._bitcrusher);
        this._bitcrusher.connect(this._masterGain);
        this._masterGain.connect(ctx.destination);

        // Noise buffer
        const bufLen = ctx.sampleRate * 2;
        this._noiseBuffer = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const data = this._noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufLen; i++) {
            data[i] = Math.random() * 2 - 1;
        }
    }

    _startPad(waveType, filterFreq, gain) {
        const ctx = this.ctx;
        const chord = this._progression[this._chordIndex % this._progression.length];

        this._padFilter = ctx.createBiquadFilter();
        this._padFilter.type = 'lowpass';
        this._padFilter.frequency.value = filterFreq;
        this._padFilter.Q.value = 2;

        this._lfoOsc = ctx.createOscillator();
        this._lfoOsc.frequency.value = 0.12;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = filterFreq * 0.5;
        this._lfoOsc.connect(lfoGain);
        lfoGain.connect(this._padFilter.frequency);
        this._lfoOsc.start();

        this._padGain = ctx.createGain();
        this._padGain.gain.value = gain;

        this._padFilter.connect(this._padGain);
        this._padGain.connect(this._compressor);

        this._padOscs = [];
        for (const note of chord) {
            const freq = midiToFreq(note);
            for (const detune of [-7, 7]) {
                const osc = ctx.createOscillator();
                osc.type = waveType;
                osc.frequency.value = freq;
                osc.detune.value = detune;
                osc.connect(this._padFilter);
                osc.start();
                this._padOscs.push(osc);
            }
        }
    }

    _changePadChord() {
        if (!this.playing || !this.ctx) return;
        const chord = this._progression[this._chordIndex % this._progression.length];
        const now = this.ctx.currentTime;

        let oscIdx = 0;
        for (const note of chord) {
            const freq = midiToFreq(note);
            for (const detune of [-7, 7]) {
                if (oscIdx < this._padOscs.length) {
                    const osc = this._padOscs[oscIdx];
                    osc.frequency.setValueAtTime(osc.frequency.value, now);
                    osc.frequency.exponentialRampToValueAtTime(freq, now + 0.3);
                    osc.detune.value = detune;
                }
                oscIdx++;
            }
        }
    }

    _startBass(gain, filterFreq) {
        const ctx = this.ctx;
        this._bassOsc = ctx.createOscillator();
        this._bassOsc.type = 'sine';
        this._bassOsc.frequency.value = midiToFreq(this._progression[0][0] - 12);

        this._bassGain = ctx.createGain();
        this._bassGain.gain.value = gain;

        const bassFilter = ctx.createBiquadFilter();
        bassFilter.type = 'lowpass';
        bassFilter.frequency.value = filterFreq;

        this._bassOsc.connect(bassFilter);
        bassFilter.connect(this._bassGain);
        this._bassGain.connect(this._compressor);
        this._bassOsc.start();
    }

    _startCrackle() {
        const ctx = this.ctx;
        this._crackleSource = ctx.createBufferSource();
        this._crackleSource.buffer = this._noiseBuffer;
        this._crackleSource.loop = true;

        const crackleFilter = ctx.createBiquadFilter();
        crackleFilter.type = 'bandpass';
        crackleFilter.frequency.value = 2000;
        crackleFilter.Q.value = 3;

        const crackleGain = ctx.createGain();
        crackleGain.gain.value = 0.015;

        this._crackleSource.connect(crackleFilter);
        crackleFilter.connect(crackleGain);
        crackleGain.connect(this._masterGain);
        this._crackleSource.start();
    }

    /* ═══════════════════════════════════════
       SCHEDULING — HI-HATS, BASS, TRUMPET
       ═══════════════════════════════════════ */

    _scheduleLofiHiHat(time) {
        if (!this.ctx || !this._noiseBuffer) return;
        if (Math.random() < 0.1) return;

        const ctx = this.ctx;
        const source = ctx.createBufferSource();
        source.buffer = this._noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 8000;

        const env = ctx.createGain();
        const vel = 0.02 + Math.random() * 0.04;
        env.gain.setValueAtTime(vel, time);
        env.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

        source.connect(filter);
        filter.connect(env);
        env.connect(this._compressor);
        source.start(time);
        source.stop(time + 0.06);
    }

    _scheduleJazzBrush(time, swingOffset) {
        if (!this.ctx || !this._noiseBuffer) return;
        if (Math.random() < 0.1) return;

        const ctx = this.ctx;
        const t = time + swingOffset;
        const source = ctx.createBufferSource();
        source.buffer = this._noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 4000;

        const env = ctx.createGain();
        const vel = 0.01 + Math.random() * 0.02;
        env.gain.setValueAtTime(vel, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

        source.connect(filter);
        filter.connect(env);
        env.connect(this._compressor);
        source.start(t);
        source.stop(t + 0.12);
    }

    _scheduleJazzWalkingBass(time, beatInBar) {
        if (!this._bassOsc) return;
        const chord = this._progression[this._chordIndex % this._progression.length];
        const root = chord[0] - 12;
        // Walking pattern: root → 3rd → 5th → octave → 5th → 3rd...
        const walkPattern = [0, 4, 7, 12, 7, 4, 0, -5]; // semitone offsets
        const note = root + walkPattern[beatInBar % walkPattern.length];
        const freq = midiToFreq(note);
        this._bassOsc.frequency.setValueAtTime(this._bassOsc.frequency.value, time);
        this._bassOsc.frequency.exponentialRampToValueAtTime(freq, time + 0.04);
    }

    _schedulePop() {
        if (!this.ctx || !this._noiseBuffer) return;
        const ctx = this.ctx;
        const source = ctx.createBufferSource();
        source.buffer = this._noiseBuffer;

        const env = ctx.createGain();
        env.gain.setValueAtTime(0.06, ctx.currentTime);
        env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.012);

        source.connect(env);
        env.connect(this._masterGain);
        source.start();
        source.stop(ctx.currentTime + 0.015);
    }

    _playStatic() {
        if (!this.ctx || !this._noiseBuffer) return;
        const ctx = this.ctx;
        const source = ctx.createBufferSource();
        source.buffer = this._noiseBuffer;

        const bandpass = ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 3000;
        bandpass.Q.value = 1;

        const env = ctx.createGain();
        env.gain.setValueAtTime(0.08, ctx.currentTime);
        env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

        source.connect(bandpass);
        bandpass.connect(env);
        env.connect(this._masterGain);
        source.start();
        source.stop(ctx.currentTime + 0.35);
    }

    /* ═══════════════════════════════════════
       UPDATE — called every frame
       ═══════════════════════════════════════ */

    update(dt) {
        if (!this.playing || !this.ctx) return;

        const now = this.ctx.currentTime;
        const isJazz = this._mode === 'jazz';
        const eighthDur = this._beatDur / 2;
        const swingAmount = isJazz ? eighthDur * 0.22 : 0;

        while (this._nextBeatTime < now + 0.2) {
            const beatInBar = this._beatIndex % 16;

            // Hi-hats / brushes
            if (isJazz) {
                const swing = (this._beatIndex % 2 === 1) ? swingAmount : 0;
                this._scheduleJazzBrush(this._nextBeatTime, swing);
            } else {
                this._scheduleLofiHiHat(this._nextBeatTime);
            }

            // Bass
            if (isJazz) {
                // Walking bass on every 8th note
                this._scheduleJazzWalkingBass(this._nextBeatTime, beatInBar);
            } else {
                // Lo-fi bass on beats 1 and 3
                if (beatInBar % 4 === 0 && this._bassOsc) {
                    const chord = this._progression[this._chordIndex % this._progression.length];
                    const root = chord[0] - 12;
                    const isOctaveUp = (beatInBar % 8 === 4);
                    const freq = midiToFreq(isOctaveUp ? root + 12 : root);
                    this._bassOsc.frequency.setValueAtTime(this._bassOsc.frequency.value, this._nextBeatTime);
                    this._bassOsc.frequency.exponentialRampToValueAtTime(freq, this._nextBeatTime + 0.05);
                }
            }

            // Trumpet melody in jazz — every 4 8th-notes (every 2 beats)
            if (isJazz && beatInBar % 4 === 0) {
                this._scheduleTrumpetNote(this._nextBeatTime);
            }

            // Chord change every 8 eighth-notes
            if (beatInBar === 0 && this._beatIndex > 0) {
                this._chordIndex++;
                this._changePadChord();
            }

            this._nextBeatTime += eighthDur;
            this._beatIndex++;
        }

        // Random vinyl pops (lo-fi only)
        if (!isJazz) {
            this._popTimer += dt;
            if (this._popTimer > 0.5 + Math.random() * 1.5) {
                this._popTimer = 0;
                this._schedulePop();
            }
        }
    }

    /* ═══════════════════════════════════════
       LIFECYCLE
       ═══════════════════════════════════════ */

    _stop() {
        this.playing = false;
        if (this._masterGain) {
            const now = this.ctx.currentTime;
            this._masterGain.gain.setValueAtTime(this._masterGain.gain.value, now);
            this._masterGain.gain.linearRampToValueAtTime(0, now + 0.5);
        }
        setTimeout(() => this._cleanupNodes(), 600);
    }

    _cleanupNodes() {
        try {
            for (const osc of this._padOscs) { try { osc.stop(); } catch(e) {} }
            this._padOscs = [];
            if (this._bassOsc) { try { this._bassOsc.stop(); } catch(e) {} this._bassOsc = null; }
            if (this._lfoOsc) { try { this._lfoOsc.stop(); } catch(e) {} this._lfoOsc = null; }
            if (this._crackleSource) { try { this._crackleSource.stop(); } catch(e) {} this._crackleSource = null; }
            if (this._trumpetOsc) { try { this._trumpetOsc.stop(); } catch(e) {} this._trumpetOsc = null; }
            if (this._trumpetLfo) { try { this._trumpetLfo.stop(); } catch(e) {} this._trumpetLfo = null; }
            this._trumpetGain = null;
            this._trumpetFilter = null;
            this._delayNode = null;
            this._delayFeedback = null;
            this._padGain = null;
            this._bassGain = null;
        } catch(e) {}
    }

    dispose() {
        this._mode = 'off';
        this._stop();
        if (this.ctx && this.ctx.state !== 'closed') {
            this.ctx.close().catch(() => {});
        }
        this.ctx = null;
    }
}
