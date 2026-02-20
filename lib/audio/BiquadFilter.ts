export class BiquadFilter {
    public type: 'lowpass' | 'highpass' | 'bandpass';
    public frequency: number;
    public Q: number;
    private sampleRate: number;

    private b0 = 0; private b1 = 0; private b2 = 0;
    private a1 = 0; private a2 = 0;
    private x1 = 0; private x2 = 0;
    private y1 = 0; private y2 = 0;

    constructor(type: 'lowpass' | 'highpass' | 'bandpass', frequency: number, Q: number, sampleRate: number) {
        this.type = type;
        this.frequency = frequency;
        this.Q = Q;
        this.sampleRate = sampleRate;
        this.updateCoefficients();
    }

    private updateCoefficients() {
        // Constrain frequency to nyquist
        const freq = Math.max(10, Math.min(this.frequency, this.sampleRate / 2 - 1));
        const omega = 2 * Math.PI * freq / this.sampleRate;
        const sinOmega = Math.sin(omega);
        const cosOmega = Math.cos(omega);
        const alpha = sinOmega / (2 * Math.max(0.0001, this.Q));

        let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;

        switch (this.type) {
            case 'lowpass':
                b0 = (1 - cosOmega) / 2;
                b1 = 1 - cosOmega;
                b2 = (1 - cosOmega) / 2;
                a0 = 1 + alpha;
                a1 = -2 * cosOmega;
                a2 = 1 - alpha;
                break;
            case 'highpass':
                b0 = (1 + cosOmega) / 2;
                b1 = -(1 + cosOmega);
                b2 = (1 + cosOmega) / 2;
                a0 = 1 + alpha;
                a1 = -2 * cosOmega;
                a2 = 1 - alpha;
                break;
            case 'bandpass':
                b0 = alpha;
                b1 = 0;
                b2 = -alpha;
                a0 = 1 + alpha;
                a1 = -2 * cosOmega;
                a2 = 1 - alpha;
                break;
        }

        this.b0 = b0 / a0;
        this.b1 = b1 / a0;
        this.b2 = b2 / a0;
        this.a1 = a1 / a0;
        this.a2 = a2 / a0;
    }

    public process(input: Float32Array): Float32Array {
        // If parameters change, we should call updateCoefficients()
        // But for our static offline use-case, they are set once.
        const output = new Float32Array(input.length);
        for (let i = 0; i < input.length; i++) {
            const x = input[i];
            const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
            
            this.x2 = this.x1;
            this.x1 = x;
            this.y2 = this.y1;
            this.y1 = y;
            
            output[i] = y;
        }
        return output;
    }
}
