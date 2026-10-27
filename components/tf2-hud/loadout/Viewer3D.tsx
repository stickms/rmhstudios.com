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
import {
  Box3,
  Color,
  MathUtils,
  Sphere,
  Vector3,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type PerspectiveCamera,
} from 'three';

function materialsOf(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function Model({
  url,
  tint,
  onFit,
}: {
  url: string;
  tint?: string;
  onFit: (radius: number) => void;
}) {
  const { scene } = useGLTF(url);
  const { camera, controls, invalidate } = useThree();
  // The loader caches one scene per URL; give this viewer its own copy, with its
  // own materials, so tinting never leaks into another viewer of the same model.
  const root = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((o: Object3D) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => m.clone())
        : mesh.material.clone();
    });
    return copy;
  }, [scene]);

  useEffect(() => {
    const colour = tint ? new Color(tint) : null;
    root.traverse((o: Object3D) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      for (const m of materialsOf(mesh)) {
        if (!m.userData?.tint || !('color' in m)) continue;
        const std = m as MeshStandardMaterial;
        std.userData.baseColor ??= std.color.clone();
        std.color.copy(std.userData.baseColor as Color);
        if (colour) std.color.multiply(colour);
        std.needsUpdate = true;
      }
    });
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
    onFit(radius);
    invalidate();
  }, [root, camera, controls, invalidate, onFit]);

  return <primitive object={root} />;
}

export default function Viewer3D({ url, tint }: { url: string; tint?: string }) {
  const [radius, setRadius] = useState(1);
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
      <Model url={url} tint={tint} onFit={setRadius} />
    </Canvas>
  );
}
