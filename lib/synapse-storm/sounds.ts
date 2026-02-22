class SoundManager {
    private ctx: AudioContext | null = null;
    private initialized = false;
    private masterVolume = 0.3;

    init(): void {
        if (this.initialized) return;
        this.ctx = new AudioContext();
        this.initialized = true;
    }

    private getCtx(): AudioContext | null {
        if (!this.ctx) {
            try {
                this.ctx = new AudioContext();
                this.initialized = true;
            } catch {
                return null;
            }
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        return this.ctx;
    }

    private playTone(
        frequency: number,
        duration: number,
        type: OscillatorType = 'sine',
        volume = 0.3
    ): void {
        const ctx = this.getCtx();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, ctx.currentTime);

        gain.gain.setValueAtTime(volume * this.masterVolume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
    }

    private playNoise(duration: number, volume = 0.1): void {
        const ctx = this.getCtx();
        if (!ctx) return;

        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.05;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume * this.masterVolume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, ctx.currentTime);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        source.start();
    }

    // --- Game Sounds ---

    solve(): void {
        this.playTone(880, 0.12, 'sine', 0.4);
        setTimeout(() => this.playTone(1100, 0.15, 'sine', 0.3), 60);
    }

    combo(comboLevel: number): void {
        const baseFreq = 600 + comboLevel * 80;
        this.playTone(baseFreq, 0.1, 'sine', 0.35);
        setTimeout(() => this.playTone(baseFreq * 1.25, 0.1, 'sine', 0.3), 50);
        setTimeout(() => this.playTone(baseFreq * 1.5, 0.15, 'sine', 0.25), 100);
    }

    wrong(): void {
        this.playTone(200, 0.15, 'square', 0.25);
        setTimeout(() => this.playTone(150, 0.2, 'square', 0.2), 80);
    }

    expire(): void {
        this.playTone(300, 0.1, 'sawtooth', 0.15);
        this.playTone(250, 0.2, 'sawtooth', 0.1);
    }

    spawn(): void {
        this.playTone(500, 0.05, 'sine', 0.1);
    }

    click(): void {
        this.playTone(700, 0.04, 'sine', 0.15);
    }

    gameOver(): void {
        const notes = [400, 350, 300, 200];
        notes.forEach((n, i) => {
            setTimeout(() => this.playTone(n, 0.3, 'sine', 0.3 - i * 0.05), i * 200);
        });
    }

    startGame(): void {
        const notes = [400, 500, 600, 800];
        notes.forEach((n, i) => {
            setTimeout(() => this.playTone(n, 0.15, 'sine', 0.25), i * 100);
        });
    }

    ambient(): void {
        this.playNoise(4, 0.03);
    }

    priority(): void {
        this.playTone(1000, 0.08, 'sine', 0.3);
        setTimeout(() => this.playTone(1200, 0.08, 'sine', 0.3), 80);
        setTimeout(() => this.playTone(1000, 0.08, 'sine', 0.3), 160);
    }

    warning(): void {
        this.playTone(800, 0.1, 'square', 0.2);
        setTimeout(() => this.playTone(600, 0.2, 'square', 0.2), 100);
    }
}

export const soundManager = new SoundManager();
