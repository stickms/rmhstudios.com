'use client';

/** The other people in a shared world, standing where the host last saw them. */

import { SKIN_LOOKS } from '@/lib/hearthworks/skins';
import { useHearthworks } from '@/lib/hearthworks/store';
import { tileTop } from '@/lib/hearthworks/world';
import { Figure } from './Figure';

export function RemotePlayers() {
  const world = useHearthworks((s) => s.world);
  const me = useHearthworks((s) => s.playerId);
  const shared = useHearthworks((s) => s.driver !== null);
  useHearthworks((s) => s.rev);
  if (!shared) return null;
  return (
    <>
      {Object.values(world.players)
        .filter((p) => p.id !== me)
        .map((p) => (
          <group key={p.id} position={[p.x, tileTop(world, Math.round(p.x), Math.round(p.z)), p.z]}>
            <Figure look={SKIN_LOOKS[p.skin]} />
          </group>
        ))}
    </>
  );
}
