'use client';

import { useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { GameSession, RenderFighter } from '@/lib/kowloon-knockout/net/session';
import Environment from './Environment';
import Skyline from './Skyline';
import Atmosphere from './Atmosphere';
import Lighting from './Lighting';
import Fighter from './Fighter';
import CameraRig from './CameraRig';
import Fx from './Fx';
import PostFx from './PostFx';
import Rain from './Rain';
import Fog from './Fog';
import { RenderTierProvider } from './RenderTierContext';

type FramesRef = MutableRefObject<RenderFighter[]>;

/** Pulls fresh render state from the session once per frame, before the
 *  fighter/camera children read it. */
function FrameSync({ session, framesRef, shakeRef }: { session: GameSession; framesRef: FramesRef; shakeRef: MutableRefObject<number> }) {
    useFrame(() => {
        framesRef.current = session.getRenderFighters();
        const shake = session.getHud().screenShake;
        if (shake > shakeRef.current) shakeRef.current = shake;
    });
    return null;
}

export default function Arena3D({ session, seatIds }: { session: GameSession; seatIds: number[] }) {
    const framesRef = useRef<RenderFighter[]>(session.getRenderFighters());
    const shakeRef = useRef(0);

    return (
        <RenderTierProvider>
            <color attach="background" args={['#070010']} />
            <fog attach="fog" args={['#0a0118', 16, 55]} />

            <Lighting />

            <FrameSync session={session} framesRef={framesRef} shakeRef={shakeRef} />
            <CameraRig framesRef={framesRef} shakeRef={shakeRef} />

            <Environment />
            <Skyline />
            <Atmosphere />
            <Rain />
            <Fog />

            {seatIds.map((seat) => (
                <Fighter key={seat} seat={seat} framesRef={framesRef} />
            ))}

            <Fx session={session} />
            <PostFx />
        </RenderTierProvider>
    );
}
