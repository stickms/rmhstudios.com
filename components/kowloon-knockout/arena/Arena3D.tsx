'use client';

import { useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { GameSession, RenderFighter } from '@/lib/kowloon-knockout/net/session';
import Environment from './Environment';
import StickFighter from './StickFighter';
import CameraRig from './CameraRig';
import Fx from './Fx';

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
        <>
            <color attach="background" args={['#070010']} />
            <fog attach="fog" args={['#0a0118', 18, 60]} />

            <ambientLight intensity={0.55} color="#5a4a7a" />
            <hemisphereLight args={['#ff5588', '#1a0a2a', 0.5]} />
            <directionalLight
                position={[6, 14, 8]}
                intensity={1.1}
                color="#ffe0c0"
                castShadow
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
                shadow-camera-left={-12}
                shadow-camera-right={12}
                shadow-camera-top={12}
                shadow-camera-bottom={-12}
            />
            <pointLight position={[-8, 6, -4]} intensity={60} color="#33ccff" distance={40} />
            <pointLight position={[8, 6, 4]} intensity={60} color="#ff3366" distance={40} />

            <FrameSync session={session} framesRef={framesRef} shakeRef={shakeRef} />
            <CameraRig framesRef={framesRef} shakeRef={shakeRef} />

            <Environment />

            {seatIds.map((seat) => (
                <StickFighter key={seat} seat={seat} framesRef={framesRef} />
            ))}

            <Fx session={session} />
        </>
    );
}
