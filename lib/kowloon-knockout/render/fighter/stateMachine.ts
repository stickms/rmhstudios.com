import type { RenderFighter } from '@/lib/kowloon-knockout/net/session';
import { CLIPS, type ClipKey } from './clips';

/** Map a fighter's sim state to the animation clip it should be playing.
 *  Pure: same snapshot → same clip. The renderer crossfades to this each frame
 *  and (re)triggers one-shots on state-entry. */
export function resolveClip(rf: Pick<RenderFighter, 'state' | 'punch'>): { clip: ClipKey; loop: boolean } {
    let clip: ClipKey;
    switch (rf.state) {
        case 'walking':    clip = 'walk'; break;
        case 'punching':   clip = rf.punch ?? 'jab'; break; // PunchType ⊂ ClipKey
        case 'blocking':   clip = 'block'; break;
        case 'hit':        clip = 'hit'; break;
        case 'stunned':    clip = 'stunned'; break;
        case 'knockedOut': clip = 'ko'; break;
        case 'idle':
        default:           clip = 'idle'; break;
    }
    return { clip, loop: CLIPS[clip].loop };
}
