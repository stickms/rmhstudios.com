"use client";
import { BUYERS } from '@/lib/cookgame/content';
import { Interactable } from '@/components/cookgame/world/Interactable';
import Character from '@/components/cookgame/models/Character';
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

  return (
    <group>
      {/* Character feet at local y=0; group placed at world position so feet rest on the ground. */}
      <group position={position}>
        <Character lookId={buyerId} moving={false} facing={Math.PI} />
      </group>
      {/* proximity marker reads world-space player position vs this absolute position */}
      <Interactable id={buyerId} position={position} />
    </group>
  );
}
