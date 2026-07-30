'use client';

/**
 * Renders one `GarmentCloth` per live soft body.
 *
 * The solver mutates its garment array outside React, so this watches the
 * world's `revision` counter — bumped only when a garment is added or culled —
 * and re-renders on that. Positions change 60 times a second and must never
 * cause a render; they are uploaded straight to the GPU inside each cloth's
 * own `useFrame`.
 */

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { LaundryMatch } from '@/lib/laundry-sort/match';
import type { Garment } from '@/lib/laundry-sort/solver';
import type { QualityFlags } from '@/lib/render/tier';
import { GarmentCloth } from './GarmentCloth';

interface Props {
  matchRef: React.RefObject<LaundryMatch | null>;
  quality: QualityFlags;
}

export function Garments({ matchRef, quality }: Props) {
  const [garments, setGarments] = useState<Garment[]>([]);
  const revisionRef = useRef(-1);
  // Shared mutable channels so the cloth components can read per-frame values
  // without props changing (and therefore without re-rendering).
  const timeRef = useRef(0);
  const heldRef = useRef<number | null>(null);

  useFrame(() => {
    const match = matchRef.current;
    if (!match) {
      if (revisionRef.current !== -1) {
        revisionRef.current = -1;
        setGarments([]);
      }
      return;
    }

    timeRef.current = match.world.time;
    heldRef.current = match.world.heldGarmentId;

    if (match.world.revision !== revisionRef.current) {
      revisionRef.current = match.world.revision;
      setGarments(match.world.garments.slice());
    }
  });

  return (
    <>
      {garments.map((garment) => (
        <GarmentCloth
          key={garment.id}
          garment={garment}
          quality={quality}
          timeRef={timeRef}
          heldRef={heldRef}
        />
      ))}
    </>
  );
}
