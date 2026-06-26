"use client";
import { BUYERS, EFFECTS } from '@/lib/cookgame/content';
import { Interactable } from '@/components/cookgame/world/Interactable';
import type { BuyerId } from '@/lib/cookgame/types';

export function BuyerNPC({
  buyerId,
  position,
}: {
  buyerId: BuyerId;
  position: [number, number, number];
}) {
  const buyer = BUYERS.find((b) => b.id === buyerId);
  if (!buyer) return null;

  const color = EFFECTS[buyer.preferredEffect].color;
  const [x, y, z] = position;

  return (
    <group>
      {/* capsule body */}
      <mesh position={[x, y + 1, z]} castShadow>
        <capsuleGeometry args={[0.4, 1, 8, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* sphere head */}
      <mesh position={[x, y + 2, z]} castShadow>
        <sphereGeometry args={[0.3, 12, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* proximity marker reads world-space player position vs this absolute position */}
      <Interactable id={buyerId} label={buyer.name} position={position} />
    </group>
  );
}
