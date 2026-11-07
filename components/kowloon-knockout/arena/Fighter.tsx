'use client';

import { Suspense, Fragment, Component, useEffect, useRef, useState, type ReactNode, type MutableRefObject } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type * as THREE from 'three';
import type { RenderFighter } from '@/lib/kowloon-knockout/net/session';
import { FIGHTER_ASSET_DIR, RIG_FILE } from '@/lib/kowloon-knockout/render/fighter/clips';
import { chooseFighterView, type FighterFailures } from '@/lib/kowloon-knockout/render/fighter/fighterView';
import { sanitizeFighterModelId } from '@/lib/kowloon-knockout/render/fighter/models';
import FighterTrappings from './FighterTrappings';
import StickFighter from './StickFighter';
import SkeletalFighter from './SkeletalFighter';
import SourceFighter from './SourceFighter';
import { clearSourceModel } from '@/lib/kowloon-knockout/render/fighter/sourceModels';

type FramesRef = MutableRefObject<RenderFighter[]>;

/** Reports a load failure upward. The first failure of a renderer is retried once (a
 *  transient network blip must not demote the fighter for the whole match); the
 *  second is reported so the dispatcher can pick the next-best renderer. */
class FighterBoundary extends Component<
    { onFail: () => void; onRetryReset?: () => void; children: ReactNode },
    { error: boolean; attempt: number }
> {
    state = { error: false, attempt: 0 };
    static getDerivedStateFromError() { return { error: true }; }
    componentDidCatch(error: unknown, info: { componentStack?: string }) {
        console.warn('[Fighter] load failed:', error, info?.componentStack);
        if (this.state.attempt < 1) {
            this.props.onRetryReset?.();
            this.setState((s) => ({ error: false, attempt: s.attempt + 1 }));
        } else {
            this.props.onFail();
        }
    }
    render() {
        if (this.state.error) return null;
        return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
    }
}

/** Shown while a model loads: the shadow and nameplate follow the seat, the body
 *  appears when ready. Deliberately NOT a stick figure — that read as the "real"
 *  fighter being replaced by a low-poly one. */
function LoadingPlaceholder({ seat, framesRef }: { seat: number; framesRef: FramesRef }) {
    const root = useRef<THREE.Group>(null);
    const shadow = useRef<THREE.Mesh>(null);
    const initial = framesRef.current.find((f) => f.seat === seat);
    useFrame(() => {
        const rf = framesRef.current.find((f) => f.seat === seat);
        const r = root.current;
        if (!rf || !r) return;
        r.position.x += (rf.x - r.position.x) * 0.5;
        r.position.z += (rf.z - r.position.z) * 0.5;
    });
    return (
        <group ref={root}>
            <FighterTrappings
                showNameplate
                plateColor={initial?.isLocal ? '#ffcc00' : (initial?.accent ?? '#ffffff')}
                plateLabel={`P${seat + 1}`}
                shadowRef={shadow}
            />
        </group>
    );
}

/** Per-seat fighter: the seat's chosen Source model, else the animated Y-Bot (also
 *  the fallback if that model cannot load); the procedural StickFighter only if both fail. */
export default function Fighter({ seat, framesRef }: { seat: number; framesRef: FramesRef }) {
    const modelId = sanitizeFighterModelId(framesRef.current.find((f) => f.seat === seat)?.modelId);
    const [failed, setFailed] = useState<FighterFailures>({ source: false, skeletal: false });
    // A different model gets a fresh chance.
    useEffect(() => { setFailed({ source: false, skeletal: false }); }, [modelId]);

    const view = chooseFighterView(modelId, failed);
    const placeholder = <LoadingPlaceholder seat={seat} framesRef={framesRef} />;

    if (view === 'stick') return <StickFighter seat={seat} framesRef={framesRef} />;
    if (view === 'source') {
        return (
            <FighterBoundary
                key={`source-${modelId}`}
                onFail={() => setFailed((f) => ({ ...f, source: true }))}
                onRetryReset={() => clearSourceModel(modelId)}
            >
                <Suspense fallback={placeholder}>
                    <SourceFighter seat={seat} framesRef={framesRef} modelId={modelId} />
                </Suspense>
            </FighterBoundary>
        );
    }
    return (
        <FighterBoundary
            key="skeletal"
            onFail={() => setFailed((f) => ({ ...f, skeletal: true }))}
            onRetryReset={() => {
                useLoader.clear(GLTFLoader, `${FIGHTER_ASSET_DIR}/${RIG_FILE}`);
            }}
        >
            <Suspense fallback={placeholder}>
                <SkeletalFighter seat={seat} framesRef={framesRef} />
            </Suspense>
        </FighterBoundary>
    );
}
