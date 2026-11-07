// ============================================================
// The character-select preview's routine: a fighter that bounces, throws a few punches, steps in and backpedals,
// guards, and bounces again — so the preview shows what the character does instead of standing still.
// Pure: `previewAt(t)` is the same frame for the same t and repeats every PREVIEW_PERIOD seconds, and
// returns just the fields the fighter renderers read.
// ============================================================
import type { PunchType } from '@/lib/kowloon-knockout/game/fighters/types';

export interface PreviewFrame {
    state: 'idle' | 'walking' | 'punching' | 'blocking';
    /** Ground offset from the stage centre (metres): the footwork segment steps in and backpedals out. */
    x: number; z: number;
    punch: PunchType | null;
    /** 0..1 through a punch (the renderer scrubs the one-shot clip by it). */
    actionProgress: number;
    /** Sim yaw (0 faces +X): a slow sway around a three-quarter view, so punches read from the side. */
    yaw: number;
}

interface Segment { state: PreviewFrame['state']; punch: PunchType | null; length: number }

const PUNCH = 0.55;
export const SEGMENTS: readonly Segment[] = [
    { state: 'idle', punch: null, length: 2.4 },
    { state: 'punching', punch: 'jab', length: PUNCH },
    { state: 'punching', punch: 'cross', length: PUNCH },
    { state: 'idle', punch: null, length: 1.1 },
    { state: 'punching', punch: 'hook', length: PUNCH },
    { state: 'idle', punch: null, length: 0.7 },
    { state: 'walking', punch: null, length: 1.8 },
    { state: 'punching', punch: 'uppercut', length: PUNCH },
    { state: 'idle', punch: null, length: 0.6 },
    { state: 'blocking', punch: null, length: 1.2 },
    { state: 'idle', punch: null, length: 1.8 },
];
export const PREVIEW_PERIOD = SEGMENTS.reduce((s, x) => s + x.length, 0);

/** How far the footwork segment steps in (and back out), metres. */
export const STEP_DISTANCE = 0.32;

export function previewAt(t: number): PreviewFrame {
    const yaw = -0.5 + 0.45 * Math.sin(t * 0.45);
    let u = ((t % PREVIEW_PERIOD) + PREVIEW_PERIOD) % PREVIEW_PERIOD;
    for (const seg of SEGMENTS) {
        if (u < seg.length) {
            // walking: step in along the facing direction and backpedal out again (a half sine: smooth at both ends,
            // moving forward for the first half and backward for the second, so the locomotion shows both)
            const along = seg.state === 'walking' ? STEP_DISTANCE * Math.sin((Math.PI * u) / seg.length) : 0;
            return {
                state: seg.state, punch: seg.punch, yaw,
                x: Math.cos(yaw) * along, z: Math.sin(yaw) * along,
                actionProgress: seg.state === 'punching' ? u / seg.length : 0,
            };
        }
        u -= seg.length;
    }
    return { state: 'idle', punch: null, actionProgress: 0, yaw, x: 0, z: 0 };
}
