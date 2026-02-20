
import { BeatMap, Slice } from '../game/types';
import { BPMDetector } from './BPMDetector';

/**
 * Simple seeded PRNG (mulberry32) for deterministic beatmap generation.
 * Seed is derived from songId + bpm so the same song/bpm always produces
 * the same map.
 */
function createSeededRandom(seed: string): () => number {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
        h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
    }
    // mulberry32
    return () => {
        h |= 0; h = h + 0x6D2B79F5 | 0;
        let t = Math.imul(h ^ h >>> 15, 1 | h);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

export class BeatDetector {
    /**
     * Advanced Beat Detection and Map Generation
     * Uses Spectral Flux and Energy Variance to find onsets
     * Aligns notes to a grid based on detected BPM
     *
     * @param overrideBpm  If provided (> 0), skip auto-detection and use this value.
     */
    public static async generateMap(buffer: AudioBuffer, id: string, name: string, artist: string, overrideBpm?: number): Promise<BeatMap> {
        console.log(`BeatDetector: Generating map for ${name} (${id}). Buffer duration: ${buffer.duration}`);
        // 1. Detect or use override BPM
        let bpm: number;
        if (overrideBpm && overrideBpm > 0) {
            bpm = overrideBpm;
            console.log(`Using override BPM: ${bpm}`);
        } else {
            bpm = await BPMDetector.detect(buffer);
            console.log(`Detected BPM: ${bpm}`);
            if (bpm <= 0) bpm = 120;
        }

        // 2. Prepare analysis
        const offlineCtx = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        
        // We want to analyze frequency bands
        // Low (Bass/Kick), Mid (Snare/Vocal), High (Hats)
        const lowFilter = offlineCtx.createBiquadFilter();
        lowFilter.type = "lowpass";
        lowFilter.frequency.value = 250;

        const highFilter = offlineCtx.createBiquadFilter();
        highFilter.type = "highpass";
        highFilter.frequency.value = 2000;

        // Connect source to filters? 
        // Actually, getting raw data and doing FFT manually is expensive in JS main thread (even offline).
        // Simpler approach for "Game":
        // Use the "Energy Variance" method on 2 bands (Low vs All)
        
        // Let's stick to the offline rendering for filtering if needed, or just raw PCM analysis.
        // Raw PCM analysis is faster for 1 minute songs.
        
        const channelData = buffer.getChannelData(0); // Mono analysis for timing
        const sampleRate = buffer.sampleRate;
        const beatInterval = 60 / bpm; // Seconds per beat
        
        // Quantization grid: 1/4 beats (16th notes)
        const gridInterval = beatInterval / 4; 
        const slices: Slice[] = [];
        
        // Parameters
        const windowSize = Math.floor(sampleRate * 0.05); // 50ms window
        const stepSize = Math.floor(sampleRate * 0.01); // 10ms step
        
        // Compute energy profile
        const energyProfile: number[] = [];
        for (let i = 0; i < channelData.length; i += stepSize) {
            let sum = 0;
            for (let j = 0; j < windowSize && i + j < channelData.length; j++) {
                sum += channelData[i+j] * channelData[i+j];
            }
            energyProfile.push(sum / windowSize);
        }
        
        // Find local maxima in energy (Onsets)
        // Compare local energy to running average
        const peaks: { time: number, energy: number }[] = [];
        const historySize = 43; // ~0.5s approx
        
        for (let i = historySize; i < energyProfile.length; i++) {
            // Local average of previous chunk
            let localSum = 0;
            for (let h = 1; h <= historySize; h++) {
                localSum += energyProfile[i - h];
            }
            const localAvg = localSum / historySize;
            const variance = energyProfile[i] / localAvg;
            
            // If energy spike
            if (variance > 1.3 && energyProfile[i] > 0.001) {
                // Check if it's a local peak (larger than neighbors)
                if (energyProfile[i] > energyProfile[i-1] && energyProfile[i] >= energyProfile[i+1]) {
                    const time = (i * stepSize) / sampleRate;
                    peaks.push({ time, energy: energyProfile[i] });
                    i += 5; // Skip ahead a bit (50ms)
                }
            }
        }
        
        // Quantize peaks to grid
        const quantizedPeaks: { time: number, energy: number }[] = [];
        const processedGridIndices = new Set<number>();
        
        peaks.forEach(p => {
            // Find closest grid point
            const gridIndex = Math.round(p.time / gridInterval);
            if (processedGridIndices.has(gridIndex)) return; // Already occupied
            
            // Check closeness (e.g. within 30% of interval)
            const gridTime = gridIndex * gridInterval;
            if (Math.abs(p.time - gridTime) < gridInterval * 0.4) {
                processedGridIndices.add(gridIndex);
                quantizedPeaks.push({ time: gridTime, energy: p.energy });
            }
        });
        
        // Create a deterministic PRNG seeded by songId + bpm
        const rng = createSeededRandom(`${id}-${bpm}`);

        // Convert to Slices
        quantizedPeaks.forEach((p, index) => {
            // Deterministic lane assignment based on seeded PRNG
            const lane = rng() > 0.5 ? 1 : 0;
            
            slices.push({
                id: `slice-${index}`,
                time: p.time,
                type: 'STANDARD',
                lane: lane
            });
        });

        // Filter out too dense sections? 
        // Already handled by quantization somewhat, but ensure min distance
        const finalSlices: Slice[] = [];
        if (slices.length > 0) {
            finalSlices.push(slices[0]);
            for (let i = 1; i < slices.length; i++) {
                if (slices[i].time - finalSlices[finalSlices.length - 1].time >= beatInterval * 0.45) { // At least 8th note distance roughly
                    finalSlices.push(slices[i]);
                }
            }
        }

        // Fallback: If no slices detected (e.g. silent or failed analysis), generate a simple metronome beat
        if (finalSlices.length === 0) {
            console.warn("BeatDetector: No slices found! Generating fallback metronome.");
            const duration = buffer.duration || 180; // Default 3 mins if duration missing
            const totalBeats = Math.floor((duration * bpm) / 60);
            for (let i = 0; i < totalBeats; i++) {
                finalSlices.push({
                    id: `fallback-${i}`,
                    time: i * 60 / bpm,
                    type: 'STANDARD',
                    lane: i % 2
                });
            }
        }

        return {
            id,
            name,
            artist,
            audioUrl: '',
            bpm,
            slices: finalSlices
        };
    }
}
