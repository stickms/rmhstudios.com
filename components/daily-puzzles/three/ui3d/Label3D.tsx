'use client';

import { useMemo } from 'react';
import { Billboard } from '@react-three/drei';
import { makeLabelTexture, type LabelOptions } from './canvasLabel';

interface Label3DProps {
  text: string;
  /** World-space height of the text block. Width follows the text aspect. */
  height?: number;
  options?: LabelOptions;
  billboard?: boolean;
  position?: [number, number, number];
  renderOrder?: number;
  /** 'left' anchors the text's left edge at position.x (default centres it). */
  anchorX?: 'left' | 'center';
}

/**
 * A line (or wrapped block) of text rendered to a texture on a thin plane — a
 * real 3D object. Optionally billboards to always face the camera so it stays
 * readable while the scene rotates.
 */
export function Label3D({ text, height = 0.4, options, billboard = true, position = [0, 0, 0], renderOrder = 2, anchorX = 'center' }: Label3DProps) {
  const label = useMemo(() => makeLabelTexture(text, options), [text, options]);
  const width = height * label.aspect;
  const offsetX = anchorX === 'left' ? width / 2 : 0;

  const plane = (
    <mesh position={[offsetX, 0, 0]} renderOrder={renderOrder}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={label.texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );

  if (billboard) {
    return <Billboard position={position}>{plane}</Billboard>;
  }
  return <group position={position}>{plane}</group>;
}
