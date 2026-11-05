'use client';

/** The small sidearm every shooter in the scene holds: the player, the police, and anyone else with a gun out. */

export function GunProp({ color }: { color: string }) {
  return (
    <mesh position={[0, 0, 0.07]}>
      <boxGeometry args={[0.022, 0.034, 0.15]} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  );
}
