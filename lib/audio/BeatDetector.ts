
import { BeatMap, Slice, Difficulty } from '../game/types';
import { BPMDetector, AudioBufferLike } from './BPMDetector';
import { BiquadFilter } from './BiquadFilter';

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
    public static async generateMap(buffer: AudioBufferLike, id: string, name: string, artist: string, overrideBpm?: number): Promise<BeatMap> {
        console.log(`BeatDetector: Generating map for ${name} (${id}). Buffer duration: ${buffer.duration}`);
        
        let bpm = overrideBpm && overrideBpm > 0 ? overrideBpm : await BPMDetector.detect(buffer);
        if (bpm <= 0) bpm = 120;
        
        const sampleRate = buffer.sampleRate;
        
        // Ensure minimum duration buffer and default to silent processing if somehow missing
        const channelData = buffer.getChannelData(0) || new Float32Array(sampleRate);

        // Define specific filters for spectral analysis
        const lowFilter = new BiquadFilter('lowpass', 150, 1.0, sampleRate); // Kicks/Sub
        const highFilter = new BiquadFilter('highpass', 2500, 1.0, sampleRate); // Hats/Snares
        const midFilter = new BiquadFilter('bandpass', 1000, 1.0, sampleRate); // Sustained vocals/synths

        // Process discrete separated bands
        const lowData = lowFilter.process(channelData);
        const midData = midFilter.process(channelData);
        const highData = highFilter.process(channelData);

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

        const globalAvgEnergy = combinedEnergy.reduce((a, b) => a + b, 0) / Math.max(1, combinedEnergy.length);
        const globalMidAvgEnergy = midEnergy.reduce((a, b) => a + b, 0) / Math.max(1, midEnergy.length);
        
        // Dynamic floor threshold to allow quieter parts to still map notes, while filtering true silence
        const minSilenceThreshold = Math.max(0.0001, globalAvgEnergy * 0.2);
        const minMidThreshold = Math.max(0.0001, globalMidAvgEnergy * 0.2);

        const peaks: { time: number, energy: number, isSustained: boolean }[] = [];
        let currentlySustained = false;
        let sustainedStartTime = 0;

        for (let i = historySize; i < combinedEnergy.length; i++) {
            const time = (i * stepSize) / sampleRate;

            // Transients (STANDARD hits)
            let localSum = 0;
            for (let h = 1; h <= historySize; h++) localSum += combinedEnergy[i - h];
            const localAvg = localSum / historySize;

            const isTransient = combinedEnergy[i] > localAvg * 1.4 && combinedEnergy[i] > minSilenceThreshold;
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
            const hasSustainedVolume = midEnergy[i] > minMidThreshold && midEnergy[i] > localMidAvg * 1.1;

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

        // Calculate actual track offset using circular mean of phases
        // This calculates the perfect grid offset by seeing where majority of peaks physically land
        let sumSin = 0;
        let sumCos = 0;
        peaks.forEach(p => {
            if (p.isSustained) return; // Only use transient beats to find offset
            const phase = (p.time % gridInterval) / gridInterval * Math.PI * 2;
            sumSin += Math.sin(phase);
            sumCos += Math.cos(phase);
        });
        
        let trackOffset = 0;
        if (peaks.length > 0) {
            let avgPhase = Math.atan2(sumSin, sumCos);
            if (avgPhase < 0) avgPhase += Math.PI * 2;
            trackOffset = (avgPhase / (Math.PI * 2)) * gridInterval;
        }

        // Quantize peaks to mathematical rhythm grid with calculated offset
        const processedGridIndices = new Set<number>();
        
        peaks.forEach(p => {
            // Find closest index accounting for the track offset
            const gridIndex = Math.round((p.time - trackOffset) / gridInterval);
            if (processedGridIndices.has(gridIndex)) return; 
            
            const gridTime = trackOffset + (gridIndex * gridInterval);
            
            // Snap if it's within 40% of the grid snapping distance
            if (Math.abs(p.time - gridTime) < gridInterval * 0.45) {
                processedGridIndices.add(gridIndex);
                const lane = rng() > 0.5 ? 1 : 0;
                
                if (p.isSustained) {
                    let duration = Math.min(p.energy, beatInterval * 4);
                    duration = Math.max(beatInterval * 0.5, Math.round(duration / gridInterval) * gridInterval);
                    slices.push({
                        id: `slice-${gridIndex}`,
                        time: gridTime,
                        type: 'LONG',
                        lane: lane,
                        duration: duration
                    });
                } else {
                    slices.push({ id: `slice-${gridIndex}`, time: gridTime, type: 'STANDARD', lane: lane });
                }
            }
        });

        // Cleanup filtering pass (remove overlapping notes in same lane)
        const normalSlices: Slice[] = [];
        slices.sort((a, b) => a.time - b.time);

        for (const slice of slices) {
            if (normalSlices.length === 0) {
                normalSlices.push(slice);
                continue;
            }
            
            const prevInLane = [...normalSlices].reverse().find(s => s.lane === slice.lane);
            let isValid = true;
            if (prevInLane) {
                const prevEnd = prevInLane.time + (prevInLane.type === 'LONG' ? (prevInLane.duration || 0) : 0);
                if (slice.time < prevEnd + (beatInterval / 2)) isValid = false;
            }
            if (isValid) normalSlices.push(slice);
        }

        if (normalSlices.length === 0) {
            const duration = buffer.duration || 180;
            const totalBeats = Math.floor((duration * bpm) / 60);
            for (let i = 0; i < totalBeats; i++) {
                normalSlices.push({ id: `fallback-${i}`, time: i * 60 / bpm, type: 'STANDARD', lane: i % 2 });
            }
        }

        // Pre-calculate difficulties
        const slicesRecord: Record<Difficulty, Slice[]> = {
            easy: this.applyDifficulty(normalSlices, 'easy', bpm, rng, trackOffset, gridInterval),
            normal: normalSlices,
            hard: this.applyDifficulty(normalSlices, 'hard', bpm, rng, trackOffset, gridInterval),
            expert: this.applyDifficulty(normalSlices, 'expert', bpm, rng, trackOffset, gridInterval),
        };

        return { id, name, artist, audioUrl: '', bpm, slices: slicesRecord };
    }

    private static applyDifficulty(baseSlices: Slice[], difficulty: Difficulty, bpm: number, rng: () => number, trackOffset: number, baseGridInterval: number): Slice[] {
        if (difficulty === 'normal') return baseSlices;

        // --- Easy: thin notes to ~70% ---
        if (difficulty === 'easy') {
            const keepRatio = 0.7;
            const minGap = 0.35;
            let lastKeptTime = -Infinity;

            return baseSlices.filter(slice => {
                if (slice.type === 'BOMB' || slice.type === 'SWITCH' || slice.type === 'LONG') {
                    lastKeptTime = slice.time;
                    return true;
                }
                const roll = rng();
                const timeSinceLast = slice.time - lastKeptTime;
                const maxGap = 60 / bpm * 4;
                if (timeSinceLast >= maxGap) { lastKeptTime = slice.time; return true; }
                if (timeSinceLast < minGap) return false;
                if (roll < keepRatio) { lastKeptTime = slice.time; return true; }
                return false;
            });
        }

        // --- Hard / Expert: densify by adding extra notes mathematically ---
        const extraRatio = difficulty === 'hard' ? 0.5 : 1.0;
        const validSlices = baseSlices.filter(s => s.type === 'STANDARD');
        const extraCount = Math.round(validSlices.length * extraRatio);
        
        // Allowed sub-grid for dense notes (1/16th notes usually if standard is 1/8)
        const subGridInterval = baseGridInterval / 2;
        
        const possibleDensities: { time: number; lane: number }[] = [];
        
        for (let i = 0; i < validSlices.length - 1; i++) {
            const gap = validSlices[i + 1].time - validSlices[i].time;
            
            // Only add notes in gaps larger than a 1/8 note
            if (gap > baseGridInterval * 1.5) {
                // Find all valid 1/16th note subdivisions within this gap
                const startSubGrid = Math.ceil((validSlices[i].time - trackOffset) / subGridInterval);
                const endSubGrid = Math.floor((validSlices[i+1].time - trackOffset) / subGridInterval);
                
                for (let j = startSubGrid + 1; j < endSubGrid; j++) {
                    const time = trackOffset + (j * subGridInterval);
                    // Leave padding near surrounding notes
                    if (time > validSlices[i].time + subGridInterval * 0.8 && time < validSlices[i+1].time - subGridInterval * 0.8) {
                        possibleDensities.push({
                            time,
                            lane: rng() < 0.5 ? 0 : 1
                        });
                    }
                }
            }
        }

        // Shuffle possible spots deterministically
        for (let i = possibleDensities.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [possibleDensities[i], possibleDensities[j]] = [possibleDensities[j], possibleDensities[i]];
        }
        
        const chosen = possibleDensities.slice(0, Math.min(extraCount, possibleDensities.length));
        const newNotes: Slice[] = [];
        
        chosen.forEach((g, index) => {
            // Final safety check: Ensure the new note doesn't overlap with ANY existing note in baseSlices (especially LONG notes)
            const overlap = baseSlices.find(s => 
                s.lane === g.lane && 
                g.time >= s.time - (baseGridInterval * 0.4) && 
                g.time <= s.time + (s.type === 'LONG' ? (s.duration || 0) : 0) + (baseGridInterval * 0.4)
            );
            
            if (!overlap) {
                newNotes.push({
                    id: `diff-${difficulty}-${index}-${Math.floor(g.time * 1000)}`,
                    time: g.time,
                    type: 'STANDARD' as any,
                    lane: g.lane,
                });
            }
        });

        return [...baseSlices, ...newNotes].sort((a, b) => a.time - b.time);
    }
}
