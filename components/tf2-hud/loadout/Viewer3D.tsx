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

import { OrbitControls, useGLTF } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Box3, MathUtils, Sphere, Vector3, type PerspectiveCamera } from 'three';
import EffectParticles, { type EffectSpec } from './EffectParticles';
import { applyTint, cloneWithMaterials } from './model-utils';

function Model({
  url,
  tint,
  onFit,
}: {
  url: string;
  tint?: string;
  onFit: (radius: number, box: Box3) => void;
}) {
  const { scene } = useGLTF(url);
  const { camera, controls, invalidate } = useThree();
  // Own copy of the cached scene, so tinting never leaks into another viewer.
  const root = useMemo(() => cloneWithMaterials(scene), [scene]);

  useEffect(() => {
    applyTint(root, tint);
    // The canvas renders on demand, so a colour change has to ask for a frame.
    invalidate();
  }, [root, tint, invalidate]);

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
    onFit(radius, box);
    invalidate();
  }, [root, camera, controls, invalidate, onFit]);

  return <primitive object={root} />;
}

export default function Viewer3D({
  url,
  tint,
  effect,
}: {
  url: string;
  tint?: string;
  /** An unusual effect to draw around the model. */
  effect?: EffectSpec;
}) {
  const [radius, setRadius] = useState(1);
  const [box, setBox] = useState<Box3 | null>(null);
  const onFit = useMemo(
    () => (r: number, b: Box3) => {
      setRadius(r);
      setBox(b);
    },
    [],
  );
  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop="demand"
      camera={{ fov: 35, position: [2.2, 1.2, 3] }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 4, 5]} intensity={2.2} />
      <directionalLight position={[-4, 1, -2]} intensity={0.8} color="#ffd9b0" />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        minDistance={radius * 1.2}
        maxDistance={radius * 8}
      />
      <Model url={url} tint={tint} onFit={onFit} />
      {effect && box ? <EffectParticles spec={effect} box={box} /> : null}
    </Canvas>
  );
}
