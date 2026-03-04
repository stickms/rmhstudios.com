'use client';

export function Ground() {
    return (
        <>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[500, 500]} />
                <meshLambertMaterial color="#3a6b2e" />
            </mesh>
            {[
                [5, 5, 5] as [number, number, number],
                [-10, 0, 14] as [number, number, number],
                [18, 0, -8] as [number, number, number],
                [-6, 0, -20] as [number, number, number],
            ].map(([x, , z], i) => (
                <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.001, z]} receiveShadow>
                    <circleGeometry args={[3 + i * 1.5, 10]} />
                    <meshLambertMaterial color="#2b5220" transparent opacity={0.55} />
                </mesh>
            ))}
        </>
    );
}
