/**
 * The 3D canvas for one item model. Loaded lazily (three.js is large) and only
 * for items that have a GLB. Renders on demand — nothing is drawn while the
 * model is at rest — and the user orbits and zooms it.
 *
 * Paint: a material the converter flagged `extras.tint = true` has its base
 * colour multiplied by the paint colour (the converter writes those materials
 * with a white base colour and the tint mask baked into their texture).
 */
'use client';

import { Tf2GLTFLoader } from '@/lib/tf2-loadout/gltf-loader';
import StudioLight from './StudioLight';
import { ResetViewButton, ViewerOrbit, rememberView, useResetView } from './viewer-controls';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Box3, MathUtils, Sphere, Vector3, type Object3D, type PerspectiveCamera } from 'three';
import EffectParticles, { type EffectSpec } from './EffectParticles';
import {
  applyFestive,
  applyPaintTexture,
  applyTint,
  cloneWithMaterials,
  type WarPaint,
} from './model-utils';
import { useWarPaintTexture } from './use-war-paint';

function Model({
  url,
  tint,
  paint,
  festive,
  onFit,
}: {
  url: string;
  tint?: string;
  paint?: WarPaint;
  festive?: boolean;
  onFit: (radius: number, box: Box3, root: Object3D) => void;
}) {
  const { scene } = useLoader(Tf2GLTFLoader, url);
  const { camera, controls, invalidate } = useThree();
  // Own copy of the cached scene, so tinting never leaks into another viewer.
  const root = useMemo(() => cloneWithMaterials(scene), [scene]);

  useLayoutEffect(() => {
    applyFestive(root, festive);
    invalidate();
  }, [root, festive, invalidate]);

  useEffect(() => {
    applyTint(root, tint);
    // The canvas renders on demand, so a colour change has to ask for a frame.
    invalidate();
  }, [root, tint, invalidate]);

  const paintTexture = useWarPaintTexture(paint?.script, paint?.wear ?? 1, paint?.seed ?? 0);
  useEffect(() => {
    applyPaintTexture(root, paintTexture);
    invalidate();
  }, [root, paintTexture, invalidate]);

  // Frame the model: aim the camera at its centre from a distance that fits its
  // bounding sphere, whatever its size or origin.
  useLayoutEffect(() => {
    const box = new Box3().setFromObject(root);
    const sphere = box.getBoundingSphere(new Sphere());
    const radius = Math.max(sphere.radius, 0.01);
    const cam = camera as PerspectiveCamera;
    const dist = (radius / Math.sin(MathUtils.degToRad(cam.fov) / 2)) * 1.15;
    cam.position.copy(sphere.center).addScaledVector(new Vector3(0.7, 0.4, 1).normalize(), dist);
    cam.near = dist / 100;
    cam.far = dist * 100;
    cam.updateProjectionMatrix();
    cam.lookAt(sphere.center);
    const orbit = controls as unknown as { target: Vector3; update: () => void } | null;
    if (orbit) {
      orbit.target.copy(sphere.center);
      orbit.update();
    }
    rememberView(controls);
    onFit(radius, box, root);
    invalidate();
  }, [root, camera, controls, invalidate, onFit]);

  return <primitive object={root} />;
}

export default function Viewer3D({
  url,
  tint,
  paint,
  effect,
  festive,
}: {
  url: string;
  tint?: string;
  /** A war paint to draw the model with. */
  paint?: WarPaint;
  /** An unusual effect to draw around the model. */
  effect?: EffectSpec;
  festive?: boolean;
}) {
  const [radius, setRadius] = useState(1);
  const [box, setBox] = useState<Box3 | null>(null);
  const [owner, setOwner] = useState<Object3D>();
  const onFit = useMemo(
    () => (r: number, b: Box3, root: Object3D) => {
      setRadius(r);
      setBox(b);
      setOwner(root);
    },
    [],
  );
  const { ref, reset } = useResetView();
  return (
    <div className="relative size-full">
      <Canvas
        dpr={[1, 1.5]}
        flat
        frameloop="demand"
        camera={{ fov: 35, position: [2.2, 1.2, 3] }}
        gl={{ antialias: true, alpha: true }}
      >
        <StudioLight />
        <ViewerOrbit resetRef={ref} minDistance={radius * 1.2} maxDistance={radius * 8} />
        <Model url={url} tint={tint} paint={paint} festive={festive} onFit={onFit} />
        {effect && box ? <EffectParticles spec={effect} box={box} owner={owner} /> : null}
      </Canvas>
      <ResetViewButton onClick={reset} />
    </div>
  );
}
