/** Animation clip identity. Punch keys (jab/cross/hook/uppercut) deliberately
 *  match the sim's PunchType so the state machine can use rf.punch directly. */
export type ClipKey =
    | 'idle' | 'walk'
    | 'jab' | 'cross' | 'hook' | 'uppercut'
    | 'block' | 'hit' | 'stunned' | 'ko';

export interface ClipDef {
    /** GLB filename under FIGHTER_ASSET_DIR. */
    file: string;
    /** true = looping clip; false = one-shot (LoopOnce + clamp). */
    loop: boolean;
    /** Crossfade duration into this clip, seconds. */
    fade: number;
}

export const CLIP_KEYS: ClipKey[] = [
    'idle', 'walk', 'jab', 'cross', 'hook', 'uppercut', 'block', 'hit', 'stunned', 'ko',
];

export const CLIPS: Record<ClipKey, ClipDef> = {
    idle:     { file: 'idle.glb',     loop: true,  fade: 0.2 },
    walk:     { file: 'walk.glb',     loop: true,  fade: 0.15 },
    jab:      { file: 'jab.glb',      loop: false, fade: 0.08 },
    cross:    { file: 'cross.glb',    loop: false, fade: 0.08 },
    hook:     { file: 'hook.glb',     loop: false, fade: 0.08 },
    uppercut: { file: 'uppercut.glb', loop: false, fade: 0.08 },
    block:    { file: 'block.glb',    loop: true,  fade: 0.12 },
    hit:      { file: 'hit.glb',      loop: false, fade: 0.1 },
    stunned:  { file: 'stunned.glb',  loop: true,  fade: 0.15 },
    ko:       { file: 'ko.glb',       loop: false, fade: 0.15 },
};

export const FIGHTER_ASSET_DIR = '/kowloon/fighter';
export const RIG_FILE = 'ybot.glb';
