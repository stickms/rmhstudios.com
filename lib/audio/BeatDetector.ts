
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
        
        let bpm = overrideBpm && overrideBpm > 0 ? overrideBpm : await BPMDetector.detect(buffer);
        if (bpm <= 0) bpm = 120;
        
        const offlineCtx = new window.OfflineAudioContext(3, buffer.length, buffer.sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;

        // Create specific filters for spectral analysis
        const lowFilter = offlineCtx.createBiquadFilter();
        lowFilter.type = "lowpass";
        lowFilter.frequency.value = 150; // Kicks/Sub

        const highFilter = offlineCtx.createBiquadFilter();
        highFilter.type = "highpass";
        highFilter.frequency.value = 2500; // Hats/Snares

        const midFilter = offlineCtx.createBiquadFilter();
        midFilter.type = "bandpass";
        midFilter.frequency.value = 1000;
        midFilter.Q.value = 1.0; // Sustained vocals/synths

        // Splitter to route to 3 distinct channels we can analyze
        const merger = offlineCtx.createChannelMerger(3);

        source.connect(lowFilter);
        lowFilter.connect(merger, 0, 0);

        source.connect(midFilter);
        midFilter.connect(merger, 0, 1);

        source.connect(highFilter);
        highFilter.connect(merger, 0, 2);

        merger.connect(offlineCtx.destination);
        
        source.start(0);
        const renderedBuffer = await offlineCtx.startRendering();

        // 3 discrete separated bands
        const lowData = renderedBuffer.getChannelData(0);
        const midData = renderedBuffer.getChannelData(1);
        const highData = renderedBuffer.getChannelData(2);

        const sampleRate = renderedBuffer.sampleRate;
        const beatInterval = 60 / bpm;
        // Quantize strictly to 1/8 notes for fairness
        const gridInterval = beatInterval / 2; 

        const windowSize = Math.floor(sampleRate * 0.05); // 50ms window
        const stepSize = Math.floor(sampleRate * 0.01); // 10ms step

        const slices: Slice[] = [];
        const rng = createSeededRandom(`${id}-${bpm}`);

        // We will process chunk by chunk and calculate spectral flux for transients
        const historySize = 50; 
        
        // Profiles
        const combinedEnergy: number[] = [];
        const midEnergy: number[] = [];

        for (let i = 0; i < lowData.length; i += stepSize) {
            let sumL = 0, sumM = 0, sumH = 0;
            for (let j = 0; j < windowSize && i + j < lowData.length; j++) {
                sumL += lowData[i+j] * lowData[i+j];
                sumM += midData[i+j] * midData[i+j];
                sumH += highData[i+j] * highData[i+j];
            }
            // weighted combination favoring rhythmic hits (kicks + snares/hats)
            combinedEnergy.push((sumL * 1.5 + sumH * 1.2 + sumM * 0.3) / windowSize);
            midEnergy.push(sumM / windowSize);
        }

        const peaks: { time: number, energy: number, isSustained: boolean }[] = [];
        let currentlySustained = false;
        let sustainedStartTime = 0;

        for (let i = historySize; i < combinedEnergy.length; i++) {
            const time = (i * stepSize) / sampleRate;

            // Transients (STANDARD hits)
            let localSum = 0;
            for (let h = 1; h <= historySize; h++) localSum += combinedEnergy[i - h];
            const localAvg = localSum / historySize;

            const isTransient = combinedEnergy[i] > localAvg * 1.5 && combinedEnergy[i] > 0.002;
            const isLocalMax = combinedEnergy[i] > combinedEnergy[i-1] && combinedEnergy[i] >= combinedEnergy[i+1];

            if (isTransient && isLocalMax) {
                peaks.push({ time, energy: combinedEnergy[i], isSustained: false });
                i += 5; // skip 50ms forward
                continue;
            }

            // Sustained notes (LONG hits) from Mid band
            let localMidSum = 0;
            for (let h = 1; h <= historySize; h++) localMidSum += midEnergy[i - h];
            const localMidAvg = localMidSum / historySize;
            
            // Sustained energy exists when variance isn't sharp but volume is high
            const hasSustainedVolume = midEnergy[i] > 0.003 && midEnergy[i] > localMidAvg * 1.1;

            if (hasSustainedVolume && !currentlySustained) {
                currentlySustained = true;
                sustainedStartTime = time;
            } else if (!hasSustainedVolume && currentlySustained) {
                currentlySustained = false;
                const duration = time - sustainedStartTime;
                if (duration > beatInterval * 0.5) { // Needs to be at least half a beat
                    peaks.push({ time: sustainedStartTime, energy: duration, isSustained: true });
                }
            }
        }

        // Quantize peaks to mathematical rhythm grid
        const processedGridIndices = new Set<number>();
        
        peaks.forEach(p => {
            const gridIndex = Math.round(p.time / gridInterval);
            if (processedGridIndices.has(gridIndex)) return; 
            
            const gridTime = gridIndex * gridInterval;
            // Snap if it's within 40% of the grid snapping distance
            if (Math.abs(p.time - gridTime) < gridInterval * 0.4) {
                processedGridIndices.add(gridIndex);
                
                const lane = rng() > 0.5 ? 1 : 0;
                
                if (p.isSustained) {
                    // Maximum duration cap against the next nearest beat
                    let duration = Math.min(p.energy, beatInterval * 4);
                    // Snap duration to nearest beat intervals as well
                    duration = Math.max(beatInterval * 0.5, Math.round(duration / gridInterval) * gridInterval);
                    
                    slices.push({
                        id: `slice-${gridIndex}`,
                        time: gridTime,
                        type: 'LONG',
                        lane: lane,
                        duration: duration
                    });
                } else {
                    slices.push({
                        id: `slice-${gridIndex}`,
                        time: gridTime,
                        type: 'STANDARD',
                        lane: lane
                    });
                }
            }
        });

        // Cleanup filtering pass (remove overlapping notes in same lane)
        const finalSlices: Slice[] = [];
        slices.sort((a, b) => a.time - b.time);

        for (const slice of slices) {
            if (finalSlices.length === 0) {
                finalSlices.push(slice);
                continue;
            }
            
            const prevInLane = [...finalSlices].reverse().find(s => s.lane === slice.lane);
            let isValid = true;

            if (prevInLane) {
                // Cannot place a standard note directly over an active hold note
                const prevEnd = prevInLane.time + (prevInLane.type === 'LONG' ? (prevInLane.duration || 0) : 0);
                // Require at least a 1/8 beat gap between any note in the lane
                if (slice.time < prevEnd + (beatInterval / 2)) {
                    isValid = false;
                }
            }

            if (isValid) finalSlices.push(slice);
        }

        if (finalSlices.length === 0) {
            console.warn("BeatDetector: Generating fallback metronome.");
            const duration = buffer.duration || 180;
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

        return { id, name, artist, audioUrl: '', bpm, slices: finalSlices };
    }
}
