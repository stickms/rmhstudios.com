'use client';

import { Suspense, Component, type ReactNode, type MutableRefObject } from 'react';
import type { RenderFighter } from '@/lib/kowloon-knockout/net/session';
import { useRenderTier } from './RenderTierContext';
import StickFighter from './StickFighter';
import SkeletalFighter from './SkeletalFighter';

type FramesRef = MutableRefObject<RenderFighter[]>;

/** Renders `fallback` if anything under it throws (e.g. a missing/failed
 *  fighter GLB) — keeps the match alive on the procedural StickFighter. */
class FighterBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { error: boolean }> {
    state = { error: false };
    static getDerivedStateFromError() { return { error: true }; }
    componentDidCatch(error: unknown, info: { componentStack?: string }) {
        console.warn('[Fighter] skeletal load failed, using StickFighter:', error, info?.componentStack);
    }
    render() {
        if (this.state.error) return this.props.fallback;
        return this.props.children;
    }
}

/** Per-seat fighter: skeletal Y-Bot on medium/high/ultra, procedural
 *  StickFighter on low and as the universal fallback (missing/loading/failed
 *  assets). */
export default function Fighter({ seat, framesRef }: { seat: number; framesRef: FramesRef }) {
    const { tier } = useRenderTier();
    const stick = <StickFighter seat={seat} framesRef={framesRef} />;
    if (tier === 'low') return stick;
    return (
        <FighterBoundary fallback={stick}>
            <Suspense fallback={stick}>
                <SkeletalFighter seat={seat} framesRef={framesRef} />
            </Suspense>
        </FighterBoundary>
    );
}
