/**
 * A person drawn from a loaded skinned model: a per-person clone of the skin's template (own skeleton, shared
 * geometry and materials), scaled to the figure size contract, animated by a `CharacterAnimator`. It reads what the
 * person is doing from `drive` (a plain mutable object the owner updates every frame) and never re-renders for it.
 *
 * Who advances the animator: when the figure is registered with a `FigureSystem`, the system does, once per frame for
 * the whole crowd (nearest at full rate, farther ones slower, off-screen ones not at all). A lone figure (the wardrobe
 * preview) has no registry and updates itself.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal, useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { CharacterAnimator, type FigureDrive } from '@/lib/hearthworks/skins/animator';
import type { FigureHandle } from '@/lib/hearthworks/skins/figure-registry';
import { acquireModel, instantiate, type LoadedModel, type ModelInstance } from '@/lib/hearthworks/skins/model-loader';
import type { SkinLook } from '@/lib/hearthworks/skins';

/** Where a held prop sits when the model has no hand bone (and the procedural figure's gun position). */
export const HELD_FALLBACK: [number, number, number] = [-0.07, 0.2, 0.06];

export interface ModelFigureProps {
  model: LoadedModel;
  look: SkinLook;
  drive: FigureDrive;
  handle: FigureHandle | null;
  /** Something carried in the right hand: a gun, a tool. */
  held?: ReactNode;
  /** Called once the model is in the scene (the procedural stand-in can go). */
  onReady?: () => void;
}

interface Built {
  inst: ModelInstance;
  anim: CharacterAnimator;
}

export function ModelFigure({ model, look, drive, handle, held, onReady }: ModelFigureProps) {
  const [built, setBuilt] = useState<Built | null>(null);
  const tilt = useRef<THREE.Group>(null);

  useEffect(() => {
    const release = acquireModel(model);
    const inst = instantiate(model, look.height);
    const anim = new CharacterAnimator(inst.skeletonRoot, model.clips, model.entry);
    // Pose it before the first frame so it never shows the bind pose (T-pose) for a frame.
    anim.update(0, drive);
    if (handle) handle.animator = anim;
    setBuilt({ inst, anim });
    return () => {
      if (handle && handle.animator === anim) handle.animator = null;
      anim.dispose();
      inst.dispose();
      release();
    };
  }, [model, look.height, drive, handle]);

  useEffect(() => {
    if (built) onReady?.();
  }, [built, onReady]);

  useFrame((_, delta) => {
    if (!built) return;
    const dt = Math.min(delta, 0.1);
    if (!handle) built.anim.update(dt, drive);
    // A model with no death clip of its own topples instead of staying upright.
    const g = tilt.current;
    if (g && !built.anim.hasOwnClip('death')) {
      const target = drive.dead ? -Math.PI / 2 : 0;
      g.rotation.x += (target - g.rotation.x) * (1 - Math.exp(-6 * dt));
    }
  });

  if (!built) return null;
  const { inst } = built;
  const hold = model.entry.hold;
  return (
    <group ref={tilt}>
      <primitive object={inst.root} />
      {held &&
        (inst.handBone && inst.hand ? (
          createPortal(
            <group quaternion={inst.hand.quaternion} scale={inst.hand.scale}>
              <group position={hold?.pos ?? [0, 0, 0]} rotation={hold?.rot ?? [0, 0, 0]}>
                {held}
              </group>
            </group>,
            inst.handBone,
          )
        ) : (
          <group position={HELD_FALLBACK}>{held}</group>
        ))}
    </group>
  );
}
