'use client';

import type { RefObject } from 'react';
import { Html } from '@react-three/drei';
import type * as THREE from 'three';

/** Per-fighter decorations shared by StickFighter and SkeletalFighter: the
 *  floating ▼ + P-number nameplate and the soft blob shadow. The parent owns
 *  `shadowRef` so it can scale the shadow per state (e.g. larger on KO). */
export default function FighterTrappings({
    showNameplate, plateColor, plateLabel, shadowRef,
}: {
    showNameplate: boolean;
    plateColor: string;
    plateLabel: string;
    shadowRef: RefObject<THREE.Mesh | null>;
}) {
    return (
        <>
            {showNameplate && (
                <Html position={[0, 2.5, 0]} center distanceFactor={9} occlude={false} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
                    <div className="kk-nameplate" style={{ color: plateColor }}>
                        <div className="kk-nameplate-tag">{plateLabel}</div>
                        <div className="kk-nameplate-tri">▼</div>
                    </div>
                </Html>
            )}
            <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                <circleGeometry args={[0.42, 16]} />
                <meshBasicMaterial color="#000000" transparent opacity={0.35} />
            </mesh>
        </>
    );
}
