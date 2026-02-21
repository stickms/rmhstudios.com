import { AudioManager } from '../audio/AudioManager';
import { BeatMap, Slice, HIT_WINDOWS, HitResult } from './types';
import { useGameStore, Difficulty } from '../store/useGameStore';
import { MultiplayerFactory } from "./MultiplayerFactory";
import { calculateScoreMultiplier } from './score';

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



export class GameEngine {
    private audioManager: AudioManager;
    private beatMap: BeatMap | null = null;
    private processedSliceIds: Set<string> = new Set();
    private activeHolds: Map<number, Slice> = new Map(); // lane -> Slice being held

    // Per-lane input cooldown to ensure one input = one note
    private lastInputTime: Map<number, number> = new Map();
    private static readonly INPUT_COOLDOWN_MS = 50;
    
    // Feedback Queue for Rendering
    public feedbackQueue: { id: number, text: string, lane: number, time: number, color: string, offset?: number }[] = [];
    private feedbackIdCounter = 0;

    // Game State
    private score: number = 0;
    private combo: number = 0;
    private maxCombo: number = 0;
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
        // Deep clone the slices to prevent mutations from leaking back to the asset or across retries
        let slices: Slice[] = [];
        const storeModifiers = useGameStore.getState().modifiers;
        const difficulty = storeModifiers.difficulty || 'normal';

        if (Array.isArray(map.slices)) {
            slices = map.slices.map(s => ({ ...s }));
        } else {
            const sourceSlices = (map.slices as Record<Difficulty, Slice[]>)[difficulty] || 
                             (map.slices as Record<Difficulty, Slice[]>).normal;
            slices = sourceSlices.map(s => ({ ...s }));
        }

        this.beatMap = { ...map, slices };
        this.processedSliceIds.clear();
        this.reset();
        
        // APPLY MAP MODIFIERS (Bombs, Switching)
        const m = useGameStore.getState().modifiers;
        const speed = m.speed || 1.0;
        
        if (m.switching) {
            // Pre-calculate which lanes are occupied by LONG notes at what times
            // to avoid switching a note into a hold trail.
            const longNotes = (this.beatMap.slices as Slice[]).filter(s => s.type === 'LONG');

            // Convert ~15% of normal slices into SWITCH notes
            this.beatMap.slices = (this.beatMap.slices as Slice[]).map(slice => {
                // Avoid converting BOMBs or LONGs to SWITCH
                if (slice.type !== 'BOMB' && slice.type !== 'LONG' && Math.random() < 0.15) {
                    const destLane = slice.lane === 0 ? 1 : 0;
                    
                    // Conflict Check: Is there a LONG note on destLane that covers this slice's time?
                    // We add a small buffer (e.g., 0.1s) to avoid very tight transitions
                    const buffer = 0.1;
                    const hasConflict = longNotes.some(long => 
                        long.lane === destLane && 
                        slice.time >= (long.time - buffer) && 
                        slice.time <= (long.time + (long.duration || 0) + buffer)
                    );

                    if (!hasConflict) {
                        return { ...slice, type: 'SWITCH', duration: undefined };
                    }
                }
                return slice;
            });
        }

        if (m.bombs) {
            // Convert ~5% of normal slices into bombs
            this.beatMap.slices = (this.beatMap.slices as Slice[]).map(slice => {
                if (slice.type !== 'SWITCH' && Math.random() < 0.05) {
                    return { ...slice, type: 'BOMB', duration: undefined };
                }
                return slice;
            });
        }

        // Apply Speed to audio
        this.songId = map.id;
        useGameStore.getState().setSongId(map.id);
        if (preloadedBuffer) {
            this.audioManager.loadFromBuffer(preloadedBuffer);
        } else {
            await this.audioManager.loadTrack(map.audioUrl);
        }
        this.audioManager.setPlaybackRate(speed);

        // Pre-load selected hit sound so first hit is instant
        const hitSound = useGameStore.getState().hitSound;
        if (hitSound && hitSound !== 'default') {
            this.audioManager.preloadHitSound(`/music/slice-it/sounds/${hitSound}`).catch(() => {});
        }
    }
    
    public reset() {
        this.processedSliceIds.clear();
        this.activeHolds.clear();
        this.lastInputTime.clear();
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.totalNotes = 0;
        this.hitPoints = 0;
        
        // RESET SLICE FLAGS on current beatMap
        if (this.beatMap && Array.isArray(this.beatMap.slices)) {
            (this.beatMap.slices as Slice[]).forEach(slice => {
                slice.hit = false;
                slice.hitTime = undefined;
            });
        }
        
        // Load modifiers
        // We need to re-fetch from store because reset() is called on restart
        if (useGameStore) {
             const store = useGameStore.getState();
             const modifiers = store.modifiers;
             this.speedMultiplier = modifiers.speed || 1.0;

             // Reset store except modifiers/settings
             store.setScore(0, 0, 1);
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
            // Process active holds
            const m = useGameStore.getState().modifiers;
            const scoreMultiplier = calculateScoreMultiplier(m);
            const strictFactor = m.strictTiming ? 0.7 : 1.0;
            // Overhold window: how long after the note ends before it counts as a miss
            const HOLD_MISS_WINDOW = HIT_WINDOWS.BAD * (m.strictTiming ? 0.7 : 1.0) * this.speedMultiplier;

            this.activeHolds.forEach((slice, lane) => {
                const holdEndTime = slice.time + (slice.duration || 0);

                if (currentTime > holdEndTime + HOLD_MISS_WINDOW) {
                    // Overhold — held too long past the end window, counts as a miss
                    this.activeHolds.delete(lane);
                    this.combo = 0;
                    this.feedbackQueue.push({
                        id: this.feedbackIdCounter++,
                        text: 'MISS',
                        lane: lane,
                        time: performance.now(),
                        color: '#64748b'
                    });
                    useGameStore.getState().setScore(this.score, this.combo, this.speedMultiplier);
                    useGameStore.getState().setMaxCombo(this.maxCombo);
                } else if (currentTime < holdEndTime) {
                    // Actively holding within the duration — accumulate score per frame
                    this.score += Math.floor(1 * (this.combo > 0 ? this.combo : 1) * scoreMultiplier);
                }
                // If currentTime is between holdEndTime and holdEndTime + HOLD_MISS_WINDOW,
                // the player is in the release window — just wait, don't accumulate or penalize
            });

            (this.beatMap.slices as Slice[]).forEach(slice => {
                // If it's a LONG note, it might be in processedSliceIds but still being held.
                // But MISS windows only apply when checking if it can be initially hit.
                if (this.processedSliceIds.has(slice.id)) return;
                
                // If time passed window + slice time, it's a miss
                if (currentTime > slice.time + HIT_WINDOWS.BAD * strictFactor * this.speedMultiplier) {
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
                    combo: this.combo
                });
            }
        }
    }
    

    
    public submitInput(lane: number) {
         if (useGameStore.getState().isPaused) return;

        // Per-lane cooldown: ignore rapid duplicate inputs so one press = one note
        const now = performance.now();
        const lastTime = this.lastInputTime.get(lane) ?? 0;
        if (now - lastTime < GameEngine.INPUT_COOLDOWN_MS) return;
        this.lastInputTime.set(lane, now);
        
        const offsetSeconds = (useGameStore.getState().audioOffset || 0) / 1000;
        const currentTime = this.audioManager.getCurrentTime() - offsetSeconds;
        const map = this.beatMap; // Changed from activeMap to this.beatMap
        if (!map) return;
        // Only the targeted (next sequential) note in this lane can be hit
        const hitWindow = HIT_WINDOWS.BAD * (useGameStore.getState().modifiers.strictTiming ? 0.7 : 1.0) * this.speedMultiplier;
        const targeted = this.getTargetedSlice(lane);

        if (!targeted || Math.abs(targeted.time - currentTime) > hitWindow) {
            // No targetable note in window — ghost tap penalty
            this.handleHit(null, 'MISS', lane);
            return;
        }

        // BOMB LOGIC: Check if hitting a bomb
        if (targeted.type === 'BOMB') {
            this.processedSliceIds.add(targeted.id);
            
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
            return;
        }

        this.processedSliceIds.add(targeted.id);
        const result = this.getHitResult(targeted.time, currentTime);
        const effectiveLane = this.getEffectiveLane(targeted, currentTime);
        this.handleHit(targeted, result, effectiveLane);
    }
    
    private getHitResult(sliceTime: number, currentTime: number): HitResult {
        const diff = Math.abs(sliceTime - currentTime);
        const strict = useGameStore.getState().modifiers.strictTiming;
        // Strict timing shrinks all hit windows to 70%
        const factor = (strict ? 0.7 : 1.0) * this.speedMultiplier;
        if (diff <= HIT_WINDOWS.MARVELOUS * factor) return 'MARVELOUS';
        if (diff <= HIT_WINDOWS.PERFECT * factor) return 'PERFECT';
        if (diff <= HIT_WINDOWS.GREAT * factor) return 'GREAT';
        if (diff <= HIT_WINDOWS.GOOD * factor) return 'GOOD';
        if (diff <= HIT_WINDOWS.BAD * factor) return 'BAD';
        return 'MISS';
    }
    
    private handleHit(slice: Slice | null, result: HitResult, effectiveLane?: number) { 
        if (slice) {
            this.processedSliceIds.add(slice.id);
            slice.hit = true;
            slice.hitTime = performance.now();
            if (slice.type === 'LONG') {
                this.activeHolds.set(effectiveLane ?? slice.lane, slice);
            }
        }
        
        // Calculate Score Multiplier
        const m = useGameStore.getState().modifiers;
        const scoreMultiplier = calculateScoreMultiplier(m);

        // Visual Feedback Params
        const feedbackLane = slice?.lane ?? 0; // Default to 0 if null, or pass it in? 
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

            if (result === 'MARVELOUS') { points = 250; color = '#0891b2'; } // Cyan
            else if (result === 'PERFECT') { points = 200; color = '#B4954A'; } // Gold
            else if (result === 'GREAT') { points = 125; color = '#15803d'; } // Green
            else if (result === 'GOOD') { points = 75; color = '#1d4ed8'; } // Blue
            else if (result === 'BAD') { points = 0; color = '#7e22ce'; } // Purple
            else { color = '#64748b'; } // Slate
            
            if (result === 'BAD') {
                this.combo = 0; // Break combo on Bad
            } else {
                this.combo++;
                this.maxCombo = Math.max(this.maxCombo, this.combo);
            }

            // Multiply by combo (combo is already incremented above for non-BAD hits)
            // For BAD: combo was reset to 0, use 1 as multiplier (but points are 0 anyway)
            this.score += Math.floor(points * (this.combo > 0 ? this.combo : 1) * scoreMultiplier);
            
            // Add Feedback
            this.feedbackQueue.push({
                id: this.feedbackIdCounter++,
                text: result,
                lane: effectiveLane ?? slice.lane,
                time: performance.now(),
                color: color,
                offset: offset
            });
            if (this.feedbackQueue.length > 20) this.feedbackQueue.shift(); // Increased buffer slightly

            // SFX
            const sfxVol = useGameStore.getState().sfxVolume / 100;
            const hitSound = useGameStore.getState().hitSound;
            if (hitSound && hitSound !== 'default') {
                const pitch = (result === 'MARVELOUS' || result === 'PERFECT') ? 1.0 : 0.85;
                this.audioManager.playHitSoundFile(`/music/slice-it/sounds/${hitSound}`, sfxVol, pitch);
            } else {
                const freq = (result === 'MARVELOUS' || result === 'PERFECT') ? 880 : 440;
                this.audioManager.playSfX(freq, 'triangle', 0.1, sfxVol);
            }
        }
        
        // Update store
        const accuracy = this.totalNotes > 0 ? this.hitPoints / (this.totalNotes * 100) : 0;
        useGameStore.getState().setScore(this.score, this.combo, this.speedMultiplier);
        useGameStore.getState().setAccuracy(accuracy);
        useGameStore.getState().setMaxCombo(this.maxCombo);

        // Multiplayer Sync
        if (this.lobbyId) {
             this.mp.updateScore(this.lobbyId, {
                 score: this.score,
                 combo: this.combo
             });
        }
    }    
    public submitRelease(lane: number) {
        if (!this.beatMap) return;

        const heldSlice = this.activeHolds.get(lane);
        if (!heldSlice) return;

        this.activeHolds.delete(lane);

        const offsetSeconds = (useGameStore.getState().audioOffset || 0) / 1000;
        const currentTime = this.audioManager.getCurrentTime() - offsetSeconds;
        const holdEndTime = heldSlice.time + (heldSlice.duration || 0);
        const m = useGameStore.getState().modifiers;
        const scoreMultiplier = calculateScoreMultiplier(m);
        const HOLD_MISS_WINDOW = HIT_WINDOWS.BAD * (m.strictTiming ? 0.7 : 1.0) * this.speedMultiplier;

        // Within the release window (from holdEndTime - HOLD_MISS_WINDOW to holdEndTime + HOLD_MISS_WINDOW)
        const inWindow = currentTime >= holdEndTime - HOLD_MISS_WINDOW && currentTime <= holdEndTime + HOLD_MISS_WINDOW;

        if (inWindow) {
            // Perfect release — award completion bonus
            this.score += Math.floor(100 * (this.combo > 0 ? this.combo : 1) * scoreMultiplier);
            this.feedbackQueue.push({
                id: this.feedbackIdCounter++,
                text: 'HOLD OK',
                lane: lane,
                time: performance.now(),
                color: '#0891b2'
            });
        } else {
            // Early release — award partial points based on duration held, but break combo
            const holdStart = heldSlice.time;
            const totalDuration = heldSlice.duration || 0;
            // The time they held it actually stopped when they released
            const heldDuration = Math.max(0, currentTime - holdStart);
            const ratio = Math.min(1.0, totalDuration > 0 ? heldDuration / totalDuration : 0);
            
            // Partial points
            this.score += Math.floor((100 * ratio) * (this.combo > 0 ? this.combo : 1) * scoreMultiplier);
            
            // Break combo because they dropped it early
            this.combo = 0;

            this.feedbackQueue.push({
                id: this.feedbackIdCounter++,
                text: 'DROPPED',
                lane: lane,
                time: performance.now(),
                color: '#64748b'
            });
        }
        useGameStore.getState().setScore(this.score, this.combo, this.speedMultiplier);
    }

    /**
     * Returns the next unhit note for a given lane — the "targeted" note.
     * This is the earliest unprocessed, non-bomb, non-silent slice in the lane
     * that hasn't fully passed the miss window yet.
     *
     * For SWITCH notes we use the **destination** (post-switch) lane so the
     * glow and targeting always reflect where the player will actually need
     * to press, even before the switch animation has finished.
     */
    public getTargetedSlice(lane: number): Slice | null {
        if (!this.beatMap) return null;
        const offsetSeconds = (useGameStore.getState().audioOffset || 0) / 1000;
        const currentTime = this.audioManager.getCurrentTime() - offsetSeconds;
        const strictFactor = useGameStore.getState().modifiers.strictTiming ? 0.7 : 1.0;
        const missWindow = HIT_WINDOWS.BAD * strictFactor * this.speedMultiplier;

        let best: Slice | null = null;
        for (const slice of (this.beatMap.slices as Slice[])) {
            if (this.processedSliceIds.has(slice.id)) continue;
            if (slice.type === 'SILENT') continue;

            // For SWITCH notes, always use the post-switch (destination) lane
            // so the note is targeted in the lane the player will actually hit.
            let sliceLane: number;
            if (slice.type === 'SWITCH') {
                sliceLane = slice.lane === 0 ? 1 : 0; // destination lane
            } else {
                sliceLane = this.getEffectiveLane(slice, currentTime);
            }
            if (sliceLane !== lane) continue;

            // Skip notes that have already fully passed the miss window
            if (currentTime > slice.time + missWindow) continue;

            // Bombs shouldn't be targeted once they're behind the reticle
            if (slice.type === 'BOMB' && currentTime > slice.time) continue;

            // Pick the earliest remaining note
            if (!best || slice.time < best.time) best = slice;
        }
        return best;
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
