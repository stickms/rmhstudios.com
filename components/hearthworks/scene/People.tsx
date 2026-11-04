'use client';

/** Everyone who is not the player: customers waiting at stalls and farmhands at work, standing at their tile. */

import { SKIN_LOOKS } from '@/lib/hearthworks/skins';
import { useHearthworks } from '@/lib/hearthworks/store';
import { tileTop } from '@/lib/hearthworks/world';
import { Figure } from './Figure';

export function People() {
  const world = useHearthworks((s) => s.world);
  useHearthworks((s) => s.rev);
  return (
    <>
      {world.npcs.map((n) => (
        <group key={`n${n.id}`} position={[n.x, tileTop(world, n.x, n.z), n.z]} rotation={[0, Math.PI * (n.id % 4) * 0.5, 0]}>
          <Figure look={SKIN_LOOKS[n.look]} />
        </group>
      ))}
      {world.workers.map((k) => (
        <group key={`w${k.id}`} position={[k.x, tileTop(world, k.x, k.z), k.z]} rotation={[0, (k.id % 7) * 0.9, 0]}>
          <Figure look={SKIN_LOOKS.worker} />
        </group>
      ))}
    </>
  );
}
