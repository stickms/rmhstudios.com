'use client';

import { useRef, useMemo, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import FighterTrappings from './FighterTrappings';
import type { RenderFighter } from '@/lib/kowloon-knockout/net/session';
import { bodyMaterialProps } from './materials';

type FramesRef = MutableRefObject<RenderFighter[]>;

const TMP = new THREE.Color();

/** Shortest-path angle damp. */
function dampAngle(current: number, target: number, t: number): number {
    let d = target - current;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return current + d * t;
}

/**
 * A single procedurally-animated 3D stick fighter. All animation is driven
 * imperatively from the session's RenderFighter each frame (no React state),
 * so four fighters stay cheap. Local model space: +Z is "forward" (where the
 * fighter punches), +Y is up.
 */
export default function StickFighter({ seat, framesRef, showNameplate = true }: { seat: number; framesRef: FramesRef; showNameplate?: boolean }) {
    const root = useRef<THREE.Group>(null);
    const body = useRef<THREE.Group>(null);
    const lArm = useRef<THREE.Group>(null);
    const rArm = useRef<THREE.Group>(null);
    const lLeg = useRef<THREE.Group>(null);
    const rLeg = useRef<THREE.Group>(null);
    const bodyMat = useRef<THREE.MeshStandardMaterial>(null);
    const headMat = useRef<THREE.MeshStandardMaterial>(null);
    const shadow = useRef<THREE.Mesh>(null);

    // Resolve this seat's static colours once (the first frame they appear).
    const initial = framesRef.current.find((f) => f.seat === seat);
    const colorHex = initial?.color ?? '#cccccc';
    const accentHex = initial?.accent ?? '#ffffff';
    const baseColor = useMemo(() => new THREE.Color(colorHex), [colorHex]);
    const plateColor = initial?.isLocal ? '#ffcc00' : accentHex;
    const plateLabel = `P${seat + 1}`;

    useFrame((state) => {
        const rf = framesRef.current.find((f) => f.seat === seat);
        if (!rf || !root.current) return;
        const r = root.current;

        // Hide cleanly if this seat isn't present.
        r.visible = true;

        // Position + facing (damped for sub-step smoothness).
        r.position.x += (rf.x - r.position.x) * 0.5;
        r.position.z += (rf.z - r.position.z) * 0.5;
        const faceY = Math.atan2(Math.cos(rf.yaw), Math.sin(rf.yaw));
        r.rotation.y = dampAngle(r.rotation.y, faceY, 0.4);

        const t = state.clock.elapsedTime;
        const b = body.current!;
        const la = lArm.current!, ra = rArm.current!;
        const ll = lLeg.current!, rl = rLeg.current!;

        // Reset pose accumulators.
        let bodyY = 0, bodyPitch = 0, bodyRoll = 0;
        let laX = -1.15, laZ = 0.25, raX = -1.15, raZ = -0.25; // guard pose
        let llX = 0, rlX = 0;

        const punchExt = (frames: number) => {
            const p = Math.min(1, frames / 10);
            return Math.sin(p * Math.PI); // 0 → 1 → 0
        };

        switch (rf.state) {
            case 'walking': {
                const ph = t * 9;
                llX = Math.sin(ph) * 0.5;
                rlX = -Math.sin(ph) * 0.5;
                bodyY = Math.abs(Math.sin(ph)) * 0.04;
                break;
            }
            case 'punching': {
                const ext = punchExt(rf.punchFrame);
                const lead = rf.punch === 'jab' || rf.punch === 'hook';
                if (rf.punch === 'uppercut') {
                    raX = -1.15 - ext * 1.2;
                    bodyPitch = -ext * 0.15;
                } else if (rf.punch === 'hook') {
                    laX = -1.4;
                    laZ = 0.25 + ext * 0.9;
                    bodyRoll = ext * 0.25;
                } else if (lead) {
                    laX = -1.15 - ext * 1.3;
                } else {
                    raX = -1.15 - ext * 1.3;
                    bodyPitch = -ext * 0.08;
                }
                break;
            }
            case 'blocking':
                laX = -2.0; raX = -2.0; laZ = 0.5; raZ = -0.5; bodyY = -0.05;
                break;
            case 'hit':
                bodyPitch = 0.25; laX = -0.7; raX = -0.7;
                break;
            case 'stunned':
                bodyRoll = Math.sin(t * 22) * 0.12; laX = -0.6; raX = -0.6;
                break;
            case 'knockedOut': {
                const k = Math.min(1, rf.stateFrame / 35);
                bodyPitch = k * (Math.PI / 2) * 0.92;
                bodyY = -k * 0.45;
                break;
            }
            default: // idle
                bodyY = Math.sin(t * 2) * 0.025;
                laX = -1.15 + Math.sin(t * 2) * 0.04;
                raX = -1.15 + Math.sin(t * 2 + 1) * 0.04;
                break;
        }

        b.position.y = 0.9 + bodyY;
        b.rotation.x += (bodyPitch - b.rotation.x) * 0.4;
        b.rotation.z += (bodyRoll - b.rotation.z) * 0.4;
        la.rotation.x += (laX - la.rotation.x) * 0.45;
        la.rotation.z += (laZ - la.rotation.z) * 0.45;
        ra.rotation.x += (raX - ra.rotation.x) * 0.45;
        ra.rotation.z += (raZ - ra.rotation.z) * 0.45;
        ll.rotation.x += (llX - ll.rotation.x) * 0.4;
        rl.rotation.x += (rlX - rl.rotation.x) * 0.4;

        // Hit flash → emissive red pulse.
        if (bodyMat.current && headMat.current) {
            const flash = rf.hitFlash > 0 ? Math.min(1, rf.hitFlash / 8) : 0;
            TMP.set('#ff2244').multiplyScalar(flash * 0.9);
            bodyMat.current.emissive.copy(TMP);
            headMat.current.emissive.copy(TMP);
            const dim = rf.alive ? 1 : 0.4;
            bodyMat.current.color.copy(baseColor).multiplyScalar(dim);
        }

        // Soft blob shadow follows the body.
        if (shadow.current) {
            const s = rf.state === 'knockedOut' ? 1.4 : 1;
            shadow.current.scale.setScalar(s);
        }
    });

    const limbMat = () => (
        <meshStandardMaterial {...bodyMaterialProps(colorHex)} />
    );

    return (
        <group ref={root}>
            <FighterTrappings showNameplate={showNameplate} plateColor={plateColor} plateLabel={plateLabel} shadowRef={shadow} />

            {/* Legs (pivot at hips) */}
            <group ref={lLeg} position={[-0.16, 0.78, 0]}>
                <mesh position={[0, -0.39, 0]} castShadow>
                    <cylinderGeometry args={[0.07, 0.05, 0.78, 6]} />
                    {limbMat()}
                </mesh>
            </group>
            <group ref={rLeg} position={[0.16, 0.78, 0]}>
                <mesh position={[0, -0.39, 0]} castShadow>
                    <cylinderGeometry args={[0.07, 0.05, 0.78, 6]} />
                    {limbMat()}
                </mesh>
            </group>

            {/* Body group: torso + head + arms (bobs / recoils / falls) */}
            <group ref={body} position={[0, 0.9, 0]}>
                {/* Torso */}
                <mesh position={[0, 0.28, 0]} castShadow>
                    <cylinderGeometry args={[0.13, 0.18, 0.62, 7]} />
                    <meshStandardMaterial ref={bodyMat} {...bodyMaterialProps(colorHex)} />
                </mesh>
                {/* Belt / trim */}
                <mesh position={[0, 0.0, 0]}>
                    <cylinderGeometry args={[0.19, 0.19, 0.08, 8]} />
                    <meshStandardMaterial {...bodyMaterialProps(accentHex)} />
                </mesh>
                {/* Head */}
                <mesh position={[0, 0.78, 0]} castShadow>
                    <sphereGeometry args={[0.2, 10, 8]} />
                    <meshStandardMaterial ref={headMat} {...bodyMaterialProps(accentHex)} />
                </mesh>
                {/* Headband tail */}
                <mesh position={[0, 0.82, -0.18]} rotation={[0.4, 0, 0]}>
                    <boxGeometry args={[0.06, 0.02, 0.22]} />
                    <meshStandardMaterial {...bodyMaterialProps(colorHex)} />
                </mesh>

                {/* Arms (pivot at shoulders, hang toward -Y at rest) */}
                <group ref={lArm} position={[-0.26, 0.5, 0]}>
                    <mesh position={[0, -0.26, 0]} castShadow>
                        <cylinderGeometry args={[0.055, 0.045, 0.52, 6]} />
                        {limbMat()}
                    </mesh>
                    <mesh position={[0, -0.54, 0]}>
                        <sphereGeometry args={[0.1, 8, 6]} />
                        <meshStandardMaterial {...bodyMaterialProps(accentHex)} />
                    </mesh>
                </group>
                <group ref={rArm} position={[0.26, 0.5, 0]}>
                    <mesh position={[0, -0.26, 0]} castShadow>
                        <cylinderGeometry args={[0.055, 0.045, 0.52, 6]} />
                        {limbMat()}
                    </mesh>
                    <mesh position={[0, -0.54, 0]}>
                        <sphereGeometry args={[0.1, 8, 6]} />
                        <meshStandardMaterial {...bodyMaterialProps(accentHex)} />
                    </mesh>
                </group>
            </group>
        </group>
    );
}
