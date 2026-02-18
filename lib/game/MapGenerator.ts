import { BeatMap, Slice, SliceType } from './types';

export class MapGenerator {
    static generate(id: string, name: string, audioUrl: string, bpm: number, duration: number): BeatMap {
        console.log(`[MapGenerator] Generating map for ${name}. BPM: ${bpm}, Duration: ${duration}`);
        const slices: Slice[] = [];
        const secPerBeat = 60 / bpm;
        
        // Start after 2 seconds or 4 beats
        let currentTime = secPerBeat * 4;
        let beatCount = 0;

        while (currentTime < duration) { // Cover full duration
            // Determine type based on pattern
            let type: SliceType = 'STANDARD';
            
            // Every 16 beats: Speed up? No, too hard.
            // Every 8 beats: Moving
            // Every 32 beats: Speed wrapper (handled by engine, but we need type)
            // Let's keep it simple for now. 
            
            if (beatCount % 32 === 31) {
                // End of phrase, maybe speed up?
                // type = 'SPEED'; // Experimental
            } else if (beatCount % 8 === 7) {
                type = 'MOVING';
            } else if (beatCount % 16 === 0 && beatCount > 0) {
                 // Long note
                 type = 'LONG';
            }

            const slice: Slice = {
                id: `slice-${beatCount}`,
                time: currentTime,
                type: type,
                duration: type === 'LONG' ? secPerBeat : undefined
            };
            
            slices.push(slice);
            
            currentTime += secPerBeat;
            beatCount++;
        }

        console.log(`[MapGenerator] Generated ${slices.length} slices.`);

        return {
            id,
            name,
            artist: 'Custom Upload',
            audioUrl,
            bpm,
            slices
        };
    }
}
