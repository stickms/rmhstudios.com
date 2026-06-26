import type { PunchType } from '../fighters/types';
import { PUNCH_COMMIT_FRAMES } from './punches';

/** Hit-reaction state duration in frames (matches updateFighter's `hit` case). */
export const HIT_FRAMES = 12;
/** KO topple window in frames (matches the StickFighter KO fall). */
export const KO_FRAMES = 35;

export interface ActionProgressInput {
    state: string;
    punch: PunchType | null;
    punchFrame: number;
    stateFrame: number;
}

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** How far through the current one-shot action (punch/hit/KO) a fighter is, in
 *  [0,1]. Looping states return 0. Pure and derived only from snapshot-carried
 *  fields, so host and guest compute it identically. The renderer uses it to
 *  drive one-shot clip time so the animation always plays fully. */
export function actionProgress(f: ActionProgressInput): number {
    switch (f.state) {
        case 'punching':
            return f.punch ? clamp01(f.punchFrame / PUNCH_COMMIT_FRAMES[f.punch]) : 0;
        case 'hit':
            return clamp01(f.stateFrame / HIT_FRAMES);
        case 'knockedOut':
            return clamp01(f.stateFrame / KO_FRAMES);
        default:
            return 0;
    }
}
