/**
 * The 3D canvas for the builder's player: the class body with the equipped
 * cosmetics on it. Loaded lazily with the rest of three.js.
 *
 * Placement: the converter writes each class model's bone matrices (`bones`) and, for a
 * cosmetic, the bone it follows and its pose on that bone (`attach`). A cosmetic sits at
 * `bones[attach.bone] × attach.pose` — the game's bone-merge in the reference pose — so the
 * hat is on the head and the backpack on the back whatever the class. Renders on demand; the
 * user turns the player around, there is no idle animation.
 */
'use client';

import { OrbitControls, useGLTF } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Box3, MathUtils, Matrix4, Vector3, type PerspectiveCamera } from 'three';
import { SilentErrorBoundary } from '@/components/errors/SilentErrorBoundary';
import { applyTint, cloneWithMaterials } from './model-utils';

export interface PlayerPart {
  key: string;
  url: string;
  /** Paint colour, `#rrggbb`. */
  tint?: string;
}

type Bones = Record<string, number[]>;

function Body({
  url,
  onReady,
}: {
  url: string;
  onReady: (bones: Bones, height: number) => void;
}) {
  const { scene } = useGLTF(url);
  const { camera, controls, invalidate } = useThree();
  const root = useMemo(() => cloneWithMaterials(scene), [scene]);

  // Frame the whole player, front on, from a distance that fits its height.
  useLayoutEffect(() => {
    const box = new Box3().setFromObject(root);
    const size = box.getSize(new Vector3());
    const centre = box.getCenter(new Vector3());
    const cam = camera as PerspectiveCamera;
    const dist = (size.y / 2 / Math.tan(MathUtils.degToRad(cam.fov) / 2)) * 1.05;
    cam.position.set(centre.x, centre.y, centre.z + dist);
    cam.near = dist / 100;
    cam.far = dist * 100;
    cam.updateProjectionMatrix();
    cam.lookAt(centre);
    const orbit = controls as unknown as { target: Vector3; update: () => void } | null;
    if (orbit) {
      orbit.target.copy(centre);
      orbit.update();
    }
    onReady((scene.userData.bones as Bones | undefined) ?? {}, size.y);
    invalidate();
  }, [root, scene, camera, controls, invalidate, onReady]);

  return <primitive object={root} />;
}

function Part({ url, tint, bones }: { url: string; tint?: string; bones: Bones }) {
  const { scene } = useGLTF(url);
  const { invalidate } = useThree();
  const root = useMemo(() => cloneWithMaterials(scene), [scene]);

  useLayoutEffect(() => {
    const attach = scene.userData.attach as { bone: string; pose: number[] } | undefined;
    const world = attach ? bones[attach.bone] : undefined;
    if (!attach || !world) {
      // No known attachment (an older file, or a bone this class lacks): show nothing rather than
      // a cosmetic floating at the feet.
      root.visible = false;
    } else {
      root.matrixAutoUpdate = false;
      root.matrix.fromArray(world).multiply(new Matrix4().fromArray(attach.pose));
      root.visible = true;
    }
    invalidate();
  }, [root, scene, bones, invalidate]);

  useEffect(() => {
    applyTint(root, tint);
    invalidate();
  }, [root, tint, invalidate]);

  return <primitive object={root} />;
}

export default function PlayerScene({ body, parts }: { body: string; parts: PlayerPart[] }) {
  const [ready, setReady] = useState<{ bones: Bones; height: number } | null>(null);
  const onReady = useMemo(
    () => (bones: Bones, height: number) => setReady({ bones, height }),
    [],
  );
  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop="demand"
      camera={{ fov: 30, position: [0, 1, 4] }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 4, 5]} intensity={2.2} />
      <directionalLight position={[-4, 1, -2]} intensity={0.8} color="#ffd9b0" />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={(Math.PI * 2) / 3}
        minDistance={ready ? ready.height * 0.8 : 1}
        maxDistance={ready ? ready.height * 3.5 : 8}
      />
      <Suspense fallback={null}>
        <Body url={body} onReady={onReady} />
      </Suspense>
      {ready
        ? parts.map((p) => (
            // One missing or broken cosmetic must not take the player down with it.
            <SilentErrorBoundary key={p.key} label="tf2-player-part" fallback={null}>
              <Suspense fallback={null}>
                <Part url={p.url} tint={p.tint} bones={ready.bones} />
              </Suspense>
            </SilentErrorBoundary>
          ))
        : null}
    </Canvas>
  );
}
