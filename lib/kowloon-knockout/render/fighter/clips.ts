/** Animation clip identity. Punch keys (jab/cross/hook/uppercut) deliberately
 *  match the sim's PunchType so the state machine can use rf.punch directly.
 *  `dance` is a render-only emote (not a sim state) — triggered locally by the
 *  player, never returned by resolveClip. */
export type ClipKey =
    | 'idle' | 'walk'
    | 'jab' | 'cross' | 'hook' | 'uppercut'
    | 'block' | 'hit' | 'stunned' | 'ko'
    | 'dance';

export interface ClipDef {
    /** FBX filename under FIGHTER_ASSET_DIR (Mixamo exports, loaded via FBXLoader). */
    file: string;
    /** true = looping clip; false = one-shot (LoopOnce + clamp). */
    loop: boolean;
    /** Crossfade duration into this clip, seconds. */
    fade: number;
}

export const CLIP_KEYS: ClipKey[] = [
    'idle', 'walk', 'jab', 'cross', 'hook', 'uppercut', 'block', 'hit', 'stunned', 'ko', 'dance',
];

/**
 * Clips that must be present before the skeletal fighter can replace the
 * procedural StickFighter.
 *
 * The rig plus all eleven clips is ~7.9 MB of uncompressed FBX, and awaiting
 * the whole set meant a 1.2 MB dance emote — which `resolveClip` never even
 * returns — delayed the upgrade for every player
 * (docs/3d-performance-audit.md §4.1). A fighter that can idle and walk looks
 * correct immediately; the rest stream in behind it, and until each arrives the
 * animation code simply holds the current clip.
 */
export const ESSENTIAL_CLIP_KEYS: ClipKey[] = ['idle', 'walk'];

/** Everything else — fetched after the swap, in this order. */
export const DEFERRED_CLIP_KEYS: ClipKey[] = CLIP_KEYS.filter(
    (k) => !ESSENTIAL_CLIP_KEYS.includes(k),
);

export const CLIPS: Record<ClipKey, ClipDef> = {
    idle:     { file: 'idle.fbx',     loop: true,  fade: 0.2 },
    walk:     { file: 'walk.fbx',     loop: true,  fade: 0.15 },
    jab:      { file: 'jab.fbx',      loop: false, fade: 0.08 },
    cross:    { file: 'cross.fbx',    loop: false, fade: 0.08 },
    hook:     { file: 'hook.fbx',     loop: false, fade: 0.08 },
    uppercut: { file: 'uppercut.fbx', loop: false, fade: 0.08 },
    block:    { file: 'block.fbx',    loop: true,  fade: 0.12 },
    hit:      { file: 'hit.fbx',      loop: false, fade: 0.1 },
    stunned:  { file: 'stunned.fbx',  loop: true,  fade: 0.15 },
    ko:       { file: 'ko.fbx',       loop: false, fade: 0.15 },
    dance:    { file: 'dance.fbx',    loop: true,  fade: 0.25 },
};

export const FIGHTER_ASSET_DIR = '/kowloon/fighter';
export const RIG_FILE = 'ybot.fbx';
