import { BeatMap, Slice } from './types';

export class BeatMapGenerator {
    /**
     * Analyze audio buffer to generate a beatmap
     * @param buffer AudioBuffer to analyze
     * @param id Unique ID for the map
     * @param name Name of the track
     * @param artist Artist name
     */
    public static generateFromBuffer(buffer: AudioBuffer, id: string, name: string, artist: string): BeatMap {
        const slices: Slice[] = [];
        
        // Configuration
        const threshold = 0.6; // Peak detection threshold
        const minDistance = 0.2; // Min time between beats in seconds (limit spam)
        
        // Get channel data (usually 2 channels for stereo)
        const channelL = buffer.getChannelData(0);
        const channelR = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : channelL;
        
        const sampleRate = buffer.sampleRate;
        const length = buffer.length;
        
        // We will process in chunks (windows) to find peaks
        const windowSize = Math.floor(sampleRate / 10); // 0.1s windows
        
        let lastBeatTime = -minDistance;
        
        // Stereo analysis: 
        // If L is significantly louder -> Top Lane (0)
        // If R is significantly louder -> Bottom Lane (1)
        // If balanced -> Alternating or Double? 
        
        for (let i = 0; i < length; i += windowSize) {
            // Calculate RMS or Peak for this window in both channels
            let maxL = 0;
            let maxR = 0;
            
            for (let j = 0; j < windowSize && i + j < length; j++) {
                const valL = Math.abs(channelL[i + j]);
                const valR = Math.abs(channelR[i + j]);
                if (valL > maxL) maxL = valL;
                if (valR > maxR) maxR = valR;
            }
            
            const peak = Math.max(maxL, maxR);
            
            // Peak detection logic
            if (peak > threshold) {
                const currentTime = i / sampleRate;
                
                if (currentTime - lastBeatTime >= minDistance) {
                    // Determine lane
                    let lane = 0;
                    if (maxL > maxR * 1.2) {
                        lane = 0; // Top
                    } else if (maxR > maxL * 1.2) {
                        lane = 1; // Bottom
                    } else {
                        // Balanced: alternate or random
                        lane = Math.random() > 0.5 ? 1 : 0;
                    }
                    
                    slices.push({
                        id: `slice-${slices.length}`,
                        time: currentTime,
                        type: 'STANDARD',
                        lane: lane
                    });
                    
                    lastBeatTime = currentTime;
                }
            }
        }
        
        return {
            id,
            name,
            artist,
            audioUrl: '', // To be filled by caller or blob URL
            bpm: 120, // Estimated or default
            slices
        };
    }
}
