import { AudioManager } from '../audio/AudioManager';
import { BeatMap, Slice, HIT_WINDOWS, HitResult } from './types';
import { useGameStore, Difficulty } from '../store/useGameStore';
import { MultiplayerFactory } from "./MultiplayerFactory";

/**
 * Simple seeded PRNG (mulberry32) for deterministic difficulty filtering.
 */
function createSeededRandom(seed: string): () => number {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
        h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
    }
    return () => {
        h |= 0; h = h + 0x6D2B79F5 | 0;
        let t = Math.imul(h ^ h >>> 15, 1 | h);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

/**
 * Deterministically adjust note density based on difficulty.
 * Uses song id + bpm + difficulty as seed so the same song always
 * produces the same note pattern for a given difficulty.
 *
 * Easy    70% of notes  (thin)
 * Normal 100% of notes  (baseline – no change)
 * Hard   150% of notes  (add 50% extra notes between existing ones)
 * Expert 200% of notes  (double – add 100% extra notes)
 */
function applyDifficultyFilter(slices: Slice[], songId: string, bpm: number, difficulty: Difficulty): Slice[] {
    if (difficulty === 'normal') return slices;

    const rng = createSeededRandom(`${songId}-${bpm}-${difficulty}`);

    // --- Easy: thin notes to ~70% ---
    if (difficulty === 'easy') {
        const keepRatio = 0.7;
        const minGap = 0.35;
        let lastKeptTime = -Infinity;

        return slices.filter(slice => {
            if (slice.type === 'BOMB' || slice.type === 'SWITCH') return true;
            const roll = rng();
            const timeSinceLast = slice.time - lastKeptTime;
            const maxGap = 60 / bpm * 4;
            if (timeSinceLast >= maxGap) { lastKeptTime = slice.time; return true; }
            if (timeSinceLast < minGap) return false;
            if (roll < keepRatio) { lastKeptTime = slice.time; return true; }
            return false;
        });
    }

    // --- Hard / Expert: densify by adding extra notes ---
    // Hard adds ~50% extra notes, Expert adds ~100% extra notes
    const extraRatio = difficulty === 'hard' ? 0.5 : 1.0;
    const regularSlices = slices.filter(s => s.type !== 'BOMB' && s.type !== 'SWITCH');
    const specialSlices = slices.filter(s => s.type === 'BOMB' || s.type === 'SWITCH');
    const extraCount = Math.round(regularSlices.length * extraRatio);
    const newNotes: Slice[] = [];

    // Build a list of gaps between consecutive regular notes for insertion
    const gaps: { time: number; lane: number; index: number }[] = [];
    for (let i = 0; i < regularSlices.length - 1; i++) {
        const gap = regularSlices[i + 1].time - regularSlices[i].time;
        if (gap > 60 / bpm * 0.4) { // Only insert in gaps > ~0.4 beats
            gaps.push({
                time: regularSlices[i].time + gap * (0.3 + rng() * 0.4), // random position 30-70% through gap
                lane: rng() < 0.5 ? 0 : 1,
                index: i,
            });
        }
    }

    // Shuffle gaps deterministically and pick extraCount of them
    for (let i = gaps.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [gaps[i], gaps[j]] = [gaps[j], gaps[i]];
    }
    const chosen = gaps.slice(0, Math.min(extraCount, gaps.length));

    for (const g of chosen) {
        newNotes.push({
            id: `diff-${difficulty}-${g.index}-${Math.floor(g.time * 10000)}`,
            time: g.time,
            type: 'NORMAL' as any,
            lane: g.lane,
        });
    }

    return [...slices, ...newNotes].sort((a, b) => a.time - b.time);
}

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

        // Apply Difficulty Filter (deterministic thinning based on song+bpm+difficulty)
        const difficulty = m.difficulty || 'normal';
        slices = applyDifficultyFilter(slices, map.id, map.bpm, difficulty);

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

    // Get the effective lane for a slice at the given time
    // SWITCH notes flip lane at a certain time before the hit time
    public getEffectiveLane(slice: Slice, currentTime: number): number {
        if (slice.type !== 'SWITCH') return slice.lane;
        // Switch happens at switchTime seconds before the slice's hit time
        // Faster speeds → switch sooner (less reaction time in real seconds)
        const switchLeadTime = 0.8 / this.speedMultiplier; // 0.8s at 1x, 0.53s at 1.5x, 1.6s at 0.5x
        const switchTime = slice.time - switchLeadTime;
        if (currentTime >= switchTime) {
            return slice.lane === 0 ? 1 : 0; // Flipped
        }
        return slice.lane; // Original lane
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
            this.getEffectiveLane(s, currentTime) === lane && 
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
            .filter(s => this.getEffectiveLane(s, currentTime) === lane)
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
        // Difficulty multiplier
        if (m.difficulty === 'easy') scoreMultiplier *= 0.7;
        else if (m.difficulty === 'normal') scoreMultiplier *= 1.0;
        else if (m.difficulty === 'hard') scoreMultiplier *= 1.3;
        else if (m.difficulty === 'expert') scoreMultiplier *= 1.5;

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

            if (result === 'MARVELOUS') { points = 115; color = '#0891b2'; } // Dark Cyan
            else if (result === 'PERFECT') { points = 100; color = '#B4954A'; } // Dark Gold
            else if (result === 'GREAT') { points = 75; color = '#15803d'; } // Dark Green
            else if (result === 'GOOD') { points = 50; color = '#1d4ed8'; } // Dark Blue
            else if (result === 'BAD') { points = 10; color = '#7e22ce'; } // Dark Purple
            else { color = '#64748b'; } // Slate
            
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
