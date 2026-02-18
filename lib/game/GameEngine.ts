import { AudioManager } from '../audio/AudioManager';
import { BeatMap, Slice, HitResult, HIT_WINDOWS } from './types';
import { useGameStore } from '../store/useGameStore'; // We will create this

export class GameEngine {
    private audioManager: AudioManager;
    private beatMap: BeatMap | null = null;
    private processedSliceIds: Set<string> = new Set();
    
    // Game State
    private score: number = 0;
    private combo: number = 0;
    private maxCombo: number = 0;
    private speedMultiplier: number = 1.0; // Global speed affecting playback
    
    constructor() {
        this.audioManager = AudioManager.getInstance();
    }

    public getActiveMap(): BeatMap | null {
        return this.beatMap;
    }

    public async loadMap(map: BeatMap) {
        this.beatMap = map;
        this.reset();
        await this.audioManager.loadTrack(map.audioUrl);
    }
    
    public reset() {
        this.processedSliceIds.clear();
        this.score = 0;
        this.combo = 0;
        this.speedMultiplier = 1.0;
        this.audioManager.stop();
        this.audioManager.setPlaybackRate(1.0);
    }
    
    public start() {
        this.audioManager.setPlaybackRate(this.speedMultiplier);
        this.audioManager.play();
    }

    public update() {
        // Called every frame by the Canvas loop
        const currentTime = this.audioManager.getCurrentTime();
        const duration = this.audioManager.getDuration();
        
        // Complete check
        if (duration > 0 && currentTime >= duration) {
            useGameStore.getState().setStatus('FINISHED');
            this.audioManager.stop();
        }
        
        if (this.beatMap) {
            this.beatMap.slices.forEach(slice => {
                if (this.processedSliceIds.has(slice.id)) return;
                
                // If time passed window + slice time, it's a miss
                if (currentTime > slice.time + HIT_WINDOWS.GOOD) {
                    this.handleHit(slice, 'MISS', 0);
                }
            });
        }
    }
    
    public submitInput(): HitResult {
        if (!this.beatMap) return 'NONE';
        const currentTime = this.audioManager.getCurrentTime();
        
        // Find closest unprocessed slice
        let closestSlice: Slice | null = null;
        let minDiff = Infinity;
        
        for (const slice of this.beatMap.slices) {
            if (this.processedSliceIds.has(slice.id)) continue;
            
            const diff = Math.abs(slice.time - currentTime);
            if (diff < minDiff) {
                minDiff = diff;
                closestSlice = slice;
            }
        }
        
        if (closestSlice && minDiff <= HIT_WINDOWS.GOOD) {
            const result: HitResult = minDiff <= HIT_WINDOWS.PERFECT ? 'PERFECT' : 'GOOD';
            this.handleHit(closestSlice, result, minDiff);
            return result;
        }
        
        // If input but no target in range, could be a "ghost tap" or punishment
        // For now, ignore or reset combo? Spec doesn't strictly say. 
        // Typically rhythm games punish spamming.
        // this.combo = 0; 
        return 'NONE';
    }
    
    private handleHit(slice: Slice, result: HitResult, diff: number) {
        this.processedSliceIds.add(slice.id);
        
        if (result === 'MISS') {
            this.combo = 0;
            console.log("MISS", slice.id);
        } else {
            const points = result === 'PERFECT' ? 100 : 50;
            this.combo++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            this.score += points * this.combo; // Basic combo scaling
            
            console.log(result, diff.toFixed(3));
            
            if (slice.type === 'SPEED' && slice.speedMultiplier) {
               this.speedMultiplier *= slice.speedMultiplier;
               this.audioManager.setPlaybackRate(this.speedMultiplier); // Apply speed change
            }
        }
        
        // Update store
        useGameStore.getState().setScore(this.score, this.combo, this.speedMultiplier);
    }
    
    public submitRelease() {
        if (!this.beatMap) return;
        const currentTime = this.audioManager.getCurrentTime();
        
        // Check if we were holding a LONG slice
        // Needs state tracking for current holding slice.
        // For simplicity in this milestone:
        // logic would be: check if we are within the end window of a Long slice that was previously hit?
        // Or if we release too early -> Miss/Break Combo.
        
        console.log("Release at", currentTime.toFixed(3));
    }

    public getState() {
        return {
            score: this.score,
            combo: this.combo,
            multiplier: this.speedMultiplier,
            currentTime: this.audioManager.getCurrentTime()
        };
    }
}
