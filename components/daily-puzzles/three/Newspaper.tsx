'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { makeNewsprintTexture } from './newsprintTexture';
import { Label3D } from './ui3d/Label3D';
import { formatDateKey, getPuzzleNumber, getTodayEST } from '@/lib/daily-puzzles/seed';

export const PAGE_W = 6;
export const PAGE_H = PAGE_W * (1448 / 1024); // ≈ 8.48, matches texture aspect

export function Newspaper({ solvedCount, total }: { solvedCount: number; total: number }) {
  const today = getTodayEST();
  const dateText = formatDateKey(today);
  const issueText = `No. ${getPuzzleNumber(today)}`;
  const tex = useMemo(
    () => makeNewsprintTexture({ title: 'THE DAILY', dateText, issueText }),
    [dateText, issueText],
  );

  return (
    // Lay the page flat: rotate so the printed face points up (+Y).
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh receiveShadow>
        <planeGeometry args={[PAGE_W, PAGE_H]} />
        <meshStandardMaterial map={tex} roughness={0.95} metalness={0} side={THREE.DoubleSide} />
      </mesh>
      {/* SOLVED stamp, printed on the page near the masthead's right edge */}
      <Label3D
        text={`${solvedCount} / ${total} SOLVED`}
        height={0.34}
        billboard={false}
        options={{ color: solvedCount === total ? '#1f7a4d' : '#b23b2e', fontSize: 64, bold: true }}
        position={[PAGE_W / 2 - 1.4, PAGE_H / 2 - 0.55, 0.01]}
      />
    </group>
  );
}
