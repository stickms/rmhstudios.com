import { BiquadFilter } from "./BiquadFilter";

export interface AudioBufferLike {
    length: number;
    duration: number;
    sampleRate: number;
    numberOfChannels: number;
    getChannelData(channel: number): Float32Array;
}

export class BPMDetector {
    /**
     * Detects BPM from an AudioBufferLike object.
     * Uses a simplified algorithm:
     * 1. Low-pass filter to isolate beats (kick/bass).
     * 2. Find peaks in signal.
     * 3. Calculate intervals between peaks.
     * 4. Find most common interval.
     */
    static async detect(buffer: AudioBufferLike): Promise<number> {
        try {
            // Lowpass filter to isolate bass/kick
            const filter = new BiquadFilter('lowpass', 150, 1.0, buffer.sampleRate);
            
            // We only need to analyze the first channel (mono) for timing
            const channelData = buffer.getChannelData(0);
            
            // Manually process the full array
            const filteredData = filter.process(channelData);
            
            const peaks = this.getPeaks([filteredData]);
            const groups = this.getIntervals(peaks, buffer.sampleRate);

            const top = groups.sort((a, b) => b.count - a.count).slice(0, 5);
            if (top.length === 0) return 120; // Default fallback

            // Weighted average of top guesses? Or just take top?
            // Usually the top one is correct or off by 2x.
            let bpm = top[0].tempo;
            
            // Constrain to reasonable 60-180 range
            while (bpm < 60) bpm *= 2;
            while (bpm > 180) bpm /= 2;

            return Math.round(bpm);
        } catch (e) {
            console.error("BPM Detection failed", e);
            return 120;
        }
    }

    private static getPeaks(data: Float32Array[]): number[] {
        const partSize = 22050; // Roughly half a second at 44.1kHz
        const parts = Math.floor(data[0].length / partSize);
        const peaks: number[] = [];

        for (let i = 0; i < parts; i++) {
            let max = 0;
            for (let j = i * partSize; j < (i + 1) * partSize; j++) {
                const vol = Math.abs(data[0][j]);
                if (!max || (vol > max)) {
                    max = vol;
                }
            }
            // Threshold
            for (let j = i * partSize; j < (i + 1) * partSize; j++) {
                const vol = Math.abs(data[0][j]);
                if (vol > max * 0.9) { // Only very high peaks
                     // Add index
                     peaks.push(j);
                     // Skip a bit to avoid double counting same peak
                     j += 10000;
                }
            }
        }
        return peaks;
    }

    private static getIntervals(peaks: number[], sampleRate: number): { tempo: number, count: number }[] {
        const groups: { tempo: number, count: number }[] = [];
        
        peaks.forEach((peak, index) => {
            for (let i = 1; i < 10 && (index + i) < peaks.length; i++) {
                const interval = peaks[index + i] - peak;
                const theoreticalBPM = 60 / (interval / sampleRate);
                
                // Round to integer BPM
                const bpm = Math.round(theoreticalBPM);
                if (bpm < 40 || bpm > 220) continue;

                const found = groups.find(p => p.tempo === bpm);
                if (found) {
                    found.count++;
                } else {
                    groups.push({ tempo: bpm, count: 1 });
                }
            }
        });
        return groups;
    }
}
