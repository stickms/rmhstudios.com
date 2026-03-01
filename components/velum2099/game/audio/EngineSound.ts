// @ts-nocheck
/* ═══════════════════════════════════════════
   NEURODRIVE — Engine Sound Synthesizer
   4-cylinder engine idle/rev + turbo spool + BOV
   + 6-speed automatic gearbox with shift sounds
   All Web Audio API — no external files
   ═══════════════════════════════════════════ */

// Speed ceiling for each gear (m/s) — gear 1 through 5
const GEAR_TOPS = [14, 26, 38, 50, 65];
const NUM_GEARS = GEAR_TOPS.length;
const UPSHIFT_POINT = 0.92;   // shift up at 92% of gear range
const DOWNSHIFT_POINT = 0.22; // shift down at 22% of gear range
const SHIFT_COOLDOWN = 0.55;  // seconds between shifts

export class EngineSound {
    constructor() {
        this.ctx = null;
        this._masterGain = null;
        this._running = false;

        // Engine state
        this._rpm = 0;            // 0-1 normalized within current gear
        this._turboSpool = 0;     // 0-1 pressure buildup
        this._wasThrustOn = false;

        // Gear state
        this.gear = 1;            // current gear (1-6)
        this._shiftTimer = 0;     // cooldown after shift

        // Nodes
        this._engineOsc1 = null;
        this._engineOsc2 = null;
        this._harmonicOsc = null;
        this._engineGain = null;
        this._engineFilter = null;
        this._turboOsc = null;
        this._turboGain = null;
        this._compressor = null;
        this._noiseBuffer = null;
    }

    start() {
        if (this._running) return;

        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();

        this._buildGraph();
        this._running = true;
    }

    _buildGraph() {
        const ctx = this.ctx;

        // Master chain: compressor → master gain → destination
        this._compressor = ctx.createDynamicsCompressor();
        this._compressor.threshold.value = -15;
        this._compressor.knee.value = 10;
        this._compressor.ratio.value = 3;

        this._masterGain = ctx.createGain();
        this._masterGain.gain.value = 0.07;

        this._compressor.connect(this._masterGain);
        this._masterGain.connect(ctx.destination);

        // ── A) Engine core — 2 detuned sawtooth oscillators ──
        this._engineFilter = ctx.createBiquadFilter();
        this._engineFilter.type = 'bandpass';
        this._engineFilter.frequency.value = 200;
        this._engineFilter.Q.value = 1.5;

        this._engineGain = ctx.createGain();
        this._engineGain.gain.value = 0.3;

        this._engineFilter.connect(this._engineGain);
        this._engineGain.connect(this._compressor);

        this._engineOsc1 = ctx.createOscillator();
        this._engineOsc1.type = 'sawtooth';
        this._engineOsc1.frequency.value = 35;
        this._engineOsc1.connect(this._engineFilter);
        this._engineOsc1.start();

        this._engineOsc2 = ctx.createOscillator();
        this._engineOsc2.type = 'sawtooth';
        this._engineOsc2.frequency.value = 35;
        this._engineOsc2.detune.value = 5;
        this._engineOsc2.connect(this._engineFilter);
        this._engineOsc2.start();

        // ── B) Second harmonic — square wave at 2× for 4-cyl buzz ──
        this._harmonicOsc = ctx.createOscillator();
        this._harmonicOsc.type = 'square';
        this._harmonicOsc.frequency.value = 70;

        const harmonicGain = ctx.createGain();
        harmonicGain.gain.value = 0.15;
        this._harmonicOsc.connect(harmonicGain);
        harmonicGain.connect(this._engineFilter);
        this._harmonicOsc.start();

        // ── C) Turbo spool whistle — sine through narrow bandpass ──
        this._turboOsc = ctx.createOscillator();
        this._turboOsc.type = 'sine';
        this._turboOsc.frequency.value = 2000;

        const turboFilter = ctx.createBiquadFilter();
        turboFilter.type = 'bandpass';
        turboFilter.frequency.value = 3000;
        turboFilter.Q.value = 5;

        this._turboGain = ctx.createGain();
        this._turboGain.gain.value = 0;

        this._turboOsc.connect(turboFilter);
        turboFilter.connect(this._turboGain);
        this._turboGain.connect(this._compressor);
        this._turboOsc.start();

        // ── Noise buffer for BOV ──
        const bufLen = ctx.sampleRate * 2;
        this._noiseBuffer = ctx.createBuffer(1, bufLen, ctx.sampleRate);
        const data = this._noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufLen; i++) {
            data[i] = Math.random() * 2 - 1;
        }
    }

    update(dt, vehicle) {
        if (!this._running || !this.ctx) return;

        const now = this.ctx.currentTime;
        const speed = Math.abs(vehicle.velocity);

        // ── 1. Gear shifting ──
        this._shiftTimer = Math.max(0, this._shiftTimer - dt);

        const gi = this.gear - 1;
        const gearBottom = gi === 0 ? 0 : GEAR_TOPS[gi - 1];
        const gearTop = GEAR_TOPS[gi];
        const gearRPM = Math.min(1, Math.max(0, (speed - gearBottom) / (gearTop - gearBottom)));

        if (this._shiftTimer <= 0) {
            if (gearRPM > UPSHIFT_POINT && this.gear < NUM_GEARS) {
                this.gear++;
                this._shiftTimer = SHIFT_COOLDOWN;
                this._triggerShiftThunk();
            } else if (gearRPM < DOWNSHIFT_POINT && this.gear > 1) {
                this.gear--;
                this._shiftTimer = SHIFT_COOLDOWN;
                this._triggerShiftThunk();
            }
        }

        // ── 2. Compute RPM within (possibly new) gear ──
        const gi2 = this.gear - 1;
        const bot = gi2 === 0 ? 0 : GEAR_TOPS[gi2 - 1];
        const top = GEAR_TOPS[gi2];
        const targetRPM = Math.min(1, Math.max(0, (speed - bot) / (top - bot)));

        // Smooth RPM — faster rise for rev, slower drop for shift
        const rpmRate = targetRPM > this._rpm ? 8 : 5;
        this._rpm += (targetRPM - this._rpm) * (1 - Math.exp(-rpmRate * dt));

        // ── 3. Engine frequency — sweep per gear ──
        // Idle ~30Hz, redline ~120Hz. Each gear adds +6Hz base for
        // a clear RPM drop on upshift while still climbing overall.
        const gearOffset = gi2 * 6;
        const baseFreq = 30 + gearOffset + this._rpm * 90;
        this._engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.04);
        this._engineOsc2.frequency.setTargetAtTime(baseFreq, now, 0.04);
        this._harmonicOsc.frequency.setTargetAtTime(baseFreq * 2, now, 0.04);

        // Bandpass filter tracks engine fundamental
        this._engineFilter.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.04);

        // ── 4. Engine volume — louder at higher RPM ──
        const engVol = 0.3 + this._rpm * 0.7;
        this._engineGain.gain.setTargetAtTime(engVol, now, 0.05);

        // ── 5. Turbo spool ──
        const thrusting = vehicle.throttle > 0 && speed > 8;
        if (thrusting) {
            this._turboSpool = Math.min(1, this._turboSpool + dt * 0.5);
        } else {
            this._turboSpool = Math.max(0, this._turboSpool - dt * 0.8);
        }
        this._turboOsc.frequency.setTargetAtTime(
            2000 + this._turboSpool * 4000, now, 0.05
        );
        this._turboGain.gain.setTargetAtTime(
            this._turboSpool * 0.08, now, 0.05
        );

        // ── 6. BOV trigger — throttle released after sustained spool ──
        if (this._wasThrustOn && vehicle.throttle === 0 && this._turboSpool > 0.3) {
            this._triggerBOV();
        }
        this._wasThrustOn = thrusting;
    }

    _triggerShiftThunk() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Short filtered noise burst — mechanical clunk
        const source = ctx.createBufferSource();
        source.buffer = this._noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        filter.Q.value = 1;

        const env = ctx.createGain();
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(0.04, now + 0.005);
        env.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

        source.connect(filter);
        filter.connect(env);
        env.connect(this._masterGain);
        source.start(now);
        source.stop(now + 0.08);
    }

    _triggerBOV() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        const source = ctx.createBufferSource();
        source.buffer = this._noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 3000;
        filter.Q.value = 2;

        const env = ctx.createGain();
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(0.06, now + 0.01);
        env.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        source.connect(filter);
        filter.connect(env);
        env.connect(this._masterGain);
        source.start(now);
        source.stop(now + 0.2);

        this._turboSpool = 0;
    }

    stop() {
        if (!this._running) return;
        this._running = false;

        if (this._masterGain) {
            const now = this.ctx.currentTime;
            this._masterGain.gain.setValueAtTime(this._masterGain.gain.value, now);
            this._masterGain.gain.linearRampToValueAtTime(0, now + 0.3);
        }

        setTimeout(() => this._cleanup(), 400);
    }

    _cleanup() {
        try {
            if (this._engineOsc1) { this._engineOsc1.stop(); this._engineOsc1 = null; }
            if (this._engineOsc2) { this._engineOsc2.stop(); this._engineOsc2 = null; }
            if (this._harmonicOsc) { this._harmonicOsc.stop(); this._harmonicOsc = null; }
            if (this._turboOsc) { this._turboOsc.stop(); this._turboOsc = null; }
        } catch (e) {}
    }

    dispose() {
        this.stop();
        if (this.ctx && this.ctx.state !== 'closed') {
            this.ctx.close().catch(() => {});
        }
        this.ctx = null;
    }
}
