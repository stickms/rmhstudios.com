import { AudioManager } from '../audio/AudioManager';
import { BeatMap, Slice, HIT_WINDOWS, HitResult } from './types';
import { useGameStore } from '../store/useGameStore';

export class GameEngine {
    private audioManager: AudioManager;
    private beatMap: BeatMap | null = null;
    private processedSliceIds: Set<string> = new Set();
    
    // Feedback Queue for Rendering
    public feedbackQueue: { id: number, text: string, lane: number, time: number, color: string }[] = [];
    private feedbackIdCounter = 0;

    // Game State
    private score: number = 0;
    private combo: number = 0;
    private maxCombo: number = 0;
    private health: number = 100;
    private maxHealth: number = 100;
    private speedMultiplier: number = 1.0; // Global speed affecting playback
    
    constructor() {
        this.audioManager = AudioManager.getInstance();
    }

    public getActiveMap(): BeatMap | null {
        return this.beatMap;
    }

    public getProcessedSliceIds(): Set<string> {
        return this.processedSliceIds;
    }

    public async loadMap(map: BeatMap) {
        this.beatMap = map; // Initial assignment
        this.processedSliceIds.clear();
        this.reset();
        
        // APPLY MAP MODIFIERS (Bombs, Switching)
        const m = useGameStore.getState().modifiers;
        const speed = m.speed || 1.0;
        
        // Clone slices to avoid mutating original map ref if we reload
        let slices = [...map.slices];

        if (m.bombs) {
            // Inject bombs in empty spaces
            // Simple logic: Add a bomb between strict slices if gap > 1s
            const newSlices: Slice[] = [];
            for (let i = 0; i < slices.length - 1; i++) {
                newSlices.push(slices[i]);
                const gap = slices[i+1].time - slices[i].time;
                if (gap > 0.8 && Math.random() > 0.6) {
                    newSlices.push({
                        id: `bomb-${Date.now()}-${i}`,
                        time: slices[i].time + gap / 2,
                        type: 'BOMB',
                        lane: Math.random() > 0.5 ? 0 : 1
                    });
                }
            }
            newSlices.push(slices[slices.length-1]);
            slices = newSlices.sort((a,b) => a.time - b.time);
        }

        if (m.switching) {
            // Convert random STANDARD slices to SWITCH
            slices = slices.map(s => {
                if (s.type === 'STANDARD' && Math.random() > 0.7) {
                    return { ...s, type: 'SWITCH' };
                }
                return s;
            });
        }

        // Apply Speed to audio
        this.beatMap = { ...map, slices }; // Update beatMap with modified slices
        await this.audioManager.loadTrack(map.audioUrl);
        this.audioManager.setPlaybackRate(speed);
    }
    
    public reset() {
        this.processedSliceIds.clear();
        this.score = 0;
        this.combo = 0;
        this.health = 100;
        
        // Load modifiers
        // We need to re-fetch from store because reset() is called on restart
        if (useGameStore) {
             const store = useGameStore.getState();
             const modifiers = store.modifiers;
             this.speedMultiplier = modifiers.speed || 1.0;
        }

        this.audioManager.stop();
        this.audioManager.setPlaybackRate(this.speedMultiplier);
        
        // Reset store except modifiers/settings
        useGameStore.getState().setScore(0, 0, 1);
        useGameStore.getState().setHealth(100);
        useGameStore.getState().setIsPaused(false);
        // Do not call store.reset() here as it clears everything including status to MENU
    }
    
    public start() {
        this.audioManager.setPlaybackRate(this.speedMultiplier);
        this.audioManager.play();
    }
    
    public pause() {
        this.audioManager.pause();
        useGameStore.getState().setIsPaused(true);
    }

    public resume() {
        if (useGameStore.getState().status === 'PLAYING') {
             this.audioManager.play();
             useGameStore.getState().setIsPaused(false);
        }
    }

    public update() {
        // Called every frame by the Canvas loop
        // If not playing or paused, do nothing
        if (useGameStore.getState().status !== 'PLAYING' || useGameStore.getState().isPaused) return;

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
                    if (slice.type === 'BOMB') {
                         this.processedSliceIds.add(slice.id); // Just mark as processed, no penalty
                    } else {
                         this.handleHit(slice, 'MISS');
                    }
                }
            });
        }
    }
    

    
    public submitInput(lane: number) {
         if (useGameStore.getState().isPaused) return;
         if (this.health <= 0) return;
        
        const currentTime = this.audioManager.getCurrentTime();
        const map = this.beatMap; // Changed from activeMap to this.beatMap
        if (!map) return;
        
        // BOMB LOGIC: Check if hitting a bomb
        // Bombs are active if they are within standard hit window
        const bombs = map.slices.filter(s => 
            s.type === 'BOMB' && 
            s.lane === lane && 
            Math.abs(s.time - currentTime) <= HIT_WINDOWS.GOOD
        );
        
        if (bombs.length > 0) {
            // Hit a bomb!
            const bomb = bombs[0]; // Take the first one if overlapping
            if (!this.processedSliceIds.has(bomb.id)) {
                 this.processedSliceIds.add(bomb.id);
                 
                 // Penalty
                 this.health = Math.max(0, this.health - 20); // Big chunk damage
                 this.combo = 0;
                 this.score = Math.max(0, this.score - 500);
                 
                 // Feedback
                 this.feedbackQueue.push({
                    id: this.feedbackIdCounter++,
                    text: 'BOMB!',
                    lane: lane,
                    time: performance.now(),
                    color: '#ff0000'
                });
                this.audioManager.playSfX(150, 'sawtooth', 0.2); // Low buzz
                
                if (this.health <= 0) {
                    useGameStore.getState().setStatus('FAILED'); // Changed from this.status
                    this.audioManager.stop(); // Added stop audio
                }
            }
            return; // Stop processing normal hits if hitting bomb
        }

        // Find best hit ... (rest of logic)
        const hitWindow = HIT_WINDOWS.GOOD;
        const potentialHits = map.slices
            .filter(s => !this.processedSliceIds.has(s.id) && s.type !== 'SILENT' && s.type !== 'BOMB')
            .filter(s => s.lane === lane)
            .filter(s => Math.abs(s.time - currentTime) <= hitWindow);
            
        // ... (existing helper) ...
        // Logic continues...
        
        if (potentialHits.length === 0) {
            // Miss Click / Ghost Tap Penalty
            this.handleHit(null, 'MISS'); // Treat as miss
            return; 
        }

        // ... existing handleHit call ...
        const bestSlice = potentialHits.reduce((prev, curr) => {
            return Math.abs(curr.time - currentTime) < Math.abs(prev.time - currentTime) ? curr : prev;
        });
        
        this.processedSliceIds.add(bestSlice.id);
        const result = this.getHitResult(bestSlice.time, currentTime);
        this.handleHit(bestSlice, result);
    }
    
    private getHitResult(sliceTime: number, currentTime: number): HitResult {
        const diff = Math.abs(sliceTime - currentTime);
        if (diff <= HIT_WINDOWS.MARVELOUS) return 'MARVELOUS';
        if (diff <= HIT_WINDOWS.PERFECT) return 'PERFECT';
        if (diff <= HIT_WINDOWS.GREAT) return 'GREAT';
        if (diff <= HIT_WINDOWS.GOOD) return 'GOOD';
        return 'MISS';
    }
    
    private handleHit(slice: Slice | null, result: HitResult) { 
        if (slice) {
            this.processedSliceIds.add(slice.id);
            slice.hit = true;
        }
        
        // Calculate Score Multiplier
        const m = useGameStore.getState().modifiers;
        let scoreMultiplier = 1.0;
        // ... (modifiers logic is same, fine to re-calc)
        if (m.invisible) scoreMultiplier += 0.2;
        if (m.speed > 1.0) scoreMultiplier += (m.speed - 1.0) * 0.5;
        if (m.suddenDeath) scoreMultiplier += 0.3;
        if (m.bombs) scoreMultiplier += 0.15;
        if (m.switching) scoreMultiplier += 0.15;

        // Visual Feedback Params
        let feedbackLane = slice?.lane ?? 0; // Default to 0 if null, or pass it in? 
        // Issue: We don't know the lane if slice is null. 
        // Fix: `handleHit` needs lane if slice is missing.
        // Actually, just skip feedback lane specific logic or let it default.
        // Better: For miss click, we don't have a slice, but we know it's a MISS.
        
        if (result === 'MISS') {
            this.combo = 0;
            const penalty = slice ? 15 : 5; // 15 damage for real miss, 5 for ghost tap
            this.health = Math.max(0, this.health - penalty); 
            
            // SUDDEN DEATH
            // Strict Mode: Ghost tap kills? Maybe too harsh. 
            // Only kill if it was a real slice miss? 
            if (m.suddenDeath && slice) { // Only kill on actual note miss
                 this.health = 0;
            }

            if (this.health <= 0) {
                useGameStore.getState().setStatus('FAILED');
                this.audioManager.stop();
            }
        } else if (slice) {
            // Successful Hit Logic ...
            let points = 50;
            let color = '#fff';
            if (result === 'MARVELOUS') { points = 115; color = '#00ffff'; }
            else if (result === 'PERFECT') { points = 100; color = '#00ff00'; }
            else if (result === 'GREAT') { points = 75; color = '#ffff00'; }
            else { color = '#aaaaaa'; }
            
            this.combo++;
            this.health = Math.min(this.maxHealth, this.health + 2); 
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            
            this.score += Math.floor(points * this.combo * scoreMultiplier); 
            
            // Add Feedback
            this.feedbackQueue.push({
                id: this.feedbackIdCounter++,
                text: result,
                lane: slice.lane,
                time: performance.now(),
                color: color
            });
            if (this.feedbackQueue.length > 10) this.feedbackQueue.shift();

            // SFX
            const freq = (result === 'MARVELOUS' || result === 'PERFECT') ? 880 : 440; 
            this.audioManager.playSfX(freq, 'triangle', 0.1);
        }
        
        // Update store
        useGameStore.getState().setScore(this.score, this.combo, this.speedMultiplier);
        useGameStore.getState().setHealth(this.health);
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
