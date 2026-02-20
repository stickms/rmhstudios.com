import { AudioManager } from '../audio/AudioManager';
import { BeatMap, Slice, HIT_WINDOWS, HitResult } from './types';
import { useGameStore } from '../store/useGameStore';
import { MultiplayerFactory } from "./MultiplayerFactory";

export class GameEngine {
    private audioManager: AudioManager;
    private beatMap: BeatMap | null = null;
    private processedSliceIds: Set<string> = new Set();
    
    // Feedback Queue for Rendering
    public feedbackQueue: { id: number, text: string, lane: number, time: number, color: string, offset?: number }[] = [];
    private feedbackIdCounter = 0;

    // Game State
    private score: number = 0;
    private combo: number = 0;
    private maxCombo: number = 0;
    private health: number = 100;
    private maxHealth: number = 100;
    private speedMultiplier: number = 1.0;
    private totalNotes: number = 0;   // non-bomb/silent notes resolved
    private hitPoints: number = 0;    // weighted accuracy points earned
    private songId: string = '';
    private mp = MultiplayerFactory.getInstance();
    private lobbyId: string | null = null;
    
    constructor() {
        this.audioManager = AudioManager.getInstance();
    }

    public getActiveMap(): BeatMap | null {
        return this.beatMap;
    }

    public getProcessedSliceIds(): Set<string> {
        return this.processedSliceIds;
    }

    public async loadMap(map: BeatMap, preloadedBuffer?: AudioBuffer) {
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
            // Inject switching notes in gaps between existing slices
            const newSlices: Slice[] = [];
            for (let i = 0; i < slices.length - 1; i++) {
                newSlices.push(slices[i]);
                const gap = slices[i + 1].time - slices[i].time;
                if (gap > 0.6 && Math.random() > 0.5) {
                    // Place switch note in the opposite lane from the surrounding notes
                    const oppositeLane = slices[i].lane === 0 ? 1 : 0;
                    newSlices.push({
                        id: `switch-${i}-${Math.floor(slices[i].time * 1000)}`,
                        time: slices[i].time + gap / 2,
                        type: 'SWITCH',
                        lane: oppositeLane,
                    });
                }
            }
            newSlices.push(slices[slices.length - 1]);
            slices = newSlices.sort((a, b) => a.time - b.time);
        }

        // Apply Speed to audio
        this.beatMap = { ...map, slices }; // Update beatMap with modified slices
        this.songId = map.id;
        useGameStore.getState().setSongId(map.id);
        if (preloadedBuffer) {
            this.audioManager.loadFromBuffer(preloadedBuffer);
        } else {
            await this.audioManager.loadTrack(map.audioUrl);
        }
        this.audioManager.setPlaybackRate(speed);
    }
    
    public reset() {
        this.processedSliceIds.clear();
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.health = 100;
        this.totalNotes = 0;
        this.hitPoints = 0;
        
        // Load modifiers
        // We need to re-fetch from store because reset() is called on restart
        if (useGameStore) {
             const store = useGameStore.getState();
             const modifiers = store.modifiers;
             this.speedMultiplier = modifiers.speed || 1.0;

             // Reset store except modifiers/settings
             store.setScore(0, 0, 1);
             store.setHealth(100);
             store.setCombo(0);
             store.setMaxCombo(0);
             store.setAccuracy(0);
             store.setIsPaused(false);
             // Do not call store.reset() here as it clears everything including status to MENU
        }

        // NOTE: lobbyId and isMultiplayer are NOT reset here — they are set before
        // loadMap() and must survive through it. Clear them at exit-to-menu time instead.
        this.audioManager.stop();
        this.audioManager.setPlaybackRate(this.speedMultiplier);
    }
    
    public setLobbyId(id: string | null) {
        this.lobbyId = id;
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

        const offsetSeconds = (useGameStore.getState().audioOffset || 0) / 1000;
        const rawTime = this.audioManager.getCurrentTime();
        const currentTime = rawTime - offsetSeconds;
        const duration = this.audioManager.getDuration();
        
        // Complete check
        if (duration > 0 && currentTime >= duration) {
            useGameStore.getState().setStatus('FINISHED');
            this.audioManager.stop();
            
            if (this.lobbyId) {
                this.mp.finishGame(this.lobbyId, this.score);
            }
        }
        
        if (this.beatMap) {
            this.beatMap.slices.forEach(slice => {
                if (this.processedSliceIds.has(slice.id)) return;
                
                // If time passed window + slice time, it's a miss
                if (currentTime > slice.time + HIT_WINDOWS.BAD) {
                    if (slice.type === 'BOMB') {
                         this.processedSliceIds.add(slice.id); // Just mark as processed, no penalty
                    } else {
                         this.handleHit(slice, 'MISS');
                    }
                }
            });
            
            // Multiplayer Sync (Throttle)
            if (this.lobbyId && Math.random() < 0.05) { // Approx every 20 frames (~3 times/sec)
                this.mp.updateScore(this.lobbyId, {
                    score: this.score,
                    combo: this.combo,
                    health: this.health
                });
            }
        }
    }
    

    
    public submitInput(lane: number) {
         if (useGameStore.getState().isPaused) return;
         if (this.health <= 0) return;
        
        const offsetSeconds = (useGameStore.getState().audioOffset || 0) / 1000;
        const currentTime = this.audioManager.getCurrentTime() - offsetSeconds;
        const map = this.beatMap; // Changed from activeMap to this.beatMap
        if (!map) return;
        
        // BOMB LOGIC: Check if hitting a bomb
        // Bombs are active if they are within standard hit window
        const bombs = map.slices.filter(s => 
            s.type === 'BOMB' && 
            s.lane === lane && 
            Math.abs(s.time - currentTime) <= HIT_WINDOWS.BAD
        );
        
        if (bombs.length > 0) {
            // Hit a bomb!
            const bomb = bombs[0]; // Take the first one if overlapping
            if (!this.processedSliceIds.has(bomb.id)) {
                 this.processedSliceIds.add(bomb.id);
                 
                 // Penalty — bombs deal significant damage
                 this.health = Math.max(0, this.health - 40); // 40 HP chunk
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
                this.audioManager.playSfX(150, 'sawtooth', 0.3, useGameStore.getState().sfxVolume / 100);
                
                if (this.health <= 0) {
                    useGameStore.getState().setStatus('FAILED'); // Changed from this.status
                    this.audioManager.stop(); // Added stop audio
                }
            }
            return; // Stop processing normal hits if hitting bomb
        }

        // Find best hit ... (rest of logic)
        const hitWindow = HIT_WINDOWS.BAD;
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
        if (diff <= HIT_WINDOWS.BAD) return 'BAD';
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
            // Only count real note misses against accuracy, not ghost taps
            if (slice) {
                this.totalNotes++;
                // hitPoints += 0 (miss contributes nothing)
            }
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
                if (this.lobbyId) {
                    this.mp.finishGame(this.lobbyId, this.score);
                }
                useGameStore.getState().setStatus('FAILED');
                this.audioManager.stop();
            }
        } else if (slice) {
            // Successful Hit Logic ...
            let points = 50;
            let color = '#fff';

            // Accuracy tracking (weights: MARVELOUS/PERFECT=100, GREAT=75, GOOD=50, BAD=0)
            this.totalNotes++;
            if (result === 'MARVELOUS' || result === 'PERFECT') this.hitPoints += 100;
            else if (result === 'GREAT') this.hitPoints += 75;
            else if (result === 'GOOD') this.hitPoints += 50;
            // BAD = 0, adds to totalNotes but no hitPoints
            
            // Offset calculation for UI
             const offset = (this.audioManager.getCurrentTime() - (useGameStore.getState().audioOffset || 0) / 1000) - slice.time;

            if (result === 'MARVELOUS') { points = 115; color = '#00ffff'; } // Cyan
            else if (result === 'PERFECT') { points = 100; color = '#ffd700'; } // Gold
            else if (result === 'GREAT') { points = 75; color = '#00ff00'; } // Green
            else if (result === 'GOOD') { points = 50; color = '#3b82f6'; } // Blue
            else if (result === 'BAD') { points = 10; color = '#a855f7'; } // Purple
            else { color = '#aaaaaa'; } // Miss falls through or handled above
            
            if (result === 'BAD') {
                 this.combo = 0; // Break combo on Bad
                 this.health = Math.max(0, this.health - 2); // Small health penalty
            } else {
                this.combo++;
                this.health = Math.min(this.maxHealth, this.health + 2); 
                this.maxCombo = Math.max(this.maxCombo, this.combo);
            }
            
            this.score += Math.floor(points * (this.combo > 0 ? this.combo : 1) * scoreMultiplier); 
            
            // Add Feedback
            this.feedbackQueue.push({
                id: this.feedbackIdCounter++,
                text: result,
                lane: slice.lane,
                time: performance.now(),
                color: color,
                offset: offset
            });
            if (this.feedbackQueue.length > 20) this.feedbackQueue.shift(); // Increased buffer slightly

            // SFX
            const freq = (result === 'MARVELOUS' || result === 'PERFECT') ? 880 : 440;
            const sfxVol = useGameStore.getState().sfxVolume / 100;
            this.audioManager.playSfX(freq, 'triangle', 0.1, sfxVol);
        }
        
        // Update store
        const accuracy = this.totalNotes > 0 ? this.hitPoints / (this.totalNotes * 100) : 0;
        useGameStore.getState().setScore(this.score, this.combo, this.speedMultiplier);
        useGameStore.getState().setHealth(this.health);
        useGameStore.getState().setAccuracy(accuracy);
        useGameStore.getState().setMaxCombo(this.maxCombo);

        // Multiplayer Sync
        if (this.lobbyId) {
             this.mp.updateScore(this.lobbyId, {
                 score: this.score,
                 combo: this.combo,
                 health: this.health,
                 isDead: this.health <= 0
             });
        }
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
