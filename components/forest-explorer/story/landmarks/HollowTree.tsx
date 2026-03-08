'use client';


interface HollowTreeProps {
    position: [number, number, number];
    scale?: number;
}

export function HollowTree({ position, scale = 1 }: HollowTreeProps) {
    return (
        <group position={position} scale={scale}>
            {/* Massive trunk */}
            <mesh position={[0, 3, 0]} castShadow>
                <cylinderGeometry args={[1.5, 2.2, 6, 12]} />
                <meshLambertMaterial color="#5a3a1a" />
            </mesh>
            {/* Hollow opening */}
            <mesh position={[0, 1.5, 1.8]} rotation={[0.2, 0, 0]}>
                <cylinderGeometry args={[0.8, 0.9, 2.5, 8]} />
                <meshLambertMaterial color="#1a0e06" />
            </mesh>
            {/* Roots spreading out */}
            {Array.from({ length: 5 }, (_, i) => {
                const angle = (i / 5) * Math.PI * 2;
                return (
                    <mesh
                        key={i}
                        position={[Math.cos(angle) * 2.5, 0.3, Math.sin(angle) * 2.5]}
                        rotation={[0.3, angle, 0.2]}
                        castShadow
                    >
                        <cylinderGeometry args={[0.15, 0.3, 3, 5]} />
                        <meshLambertMaterial color="#4a2a10" />
                    </mesh>
                );
            })}
            {/* Upper canopy */}
            <mesh position={[0, 7, 0]}>
                <coneGeometry args={[4, 5, 8]} />
                <meshLambertMaterial color="#1a4d0f" />
            </mesh>
            <mesh position={[0, 9, 0]}>
                <coneGeometry args={[2.8, 4, 8]} />
                <meshLambertMaterial color="#276614" />
            </mesh>
        </group>
    );
}
