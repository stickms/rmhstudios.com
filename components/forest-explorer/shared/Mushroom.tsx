'use client';

export function Mushroom({ position }: { position: [number, number, number] }) {
    return (
        <group position={position}>
            <mesh position={[0, 0.13, 0]}>
                <cylinderGeometry args={[0.04, 0.07, 0.26, 6]} />
                <meshLambertMaterial color="#ede0c8" />
            </mesh>
            <mesh position={[0, 0.32, 0]}>
                <coneGeometry args={[0.19, 0.23, 8]} />
                <meshLambertMaterial color="#c0392b" />
            </mesh>
        </group>
    );
}
