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
