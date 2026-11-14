import {
  useRef,
  type MutableRefObject,
} from 'react';
import {
  useFrame,
  useThree,
} from '@react-three/fiber';
import * as THREE from 'three';
import type { RenderFighter } from '@/lib/kowloon-knockout/net/session';
import { useImpactBus } from './ImpactContext';

type FramesRef =
  MutableRefObject<
    RenderFighter[]
  >;

/**
 * Cinematic auto-framing camera: keeps every (living) fighter on screen by
 * tracking their centroid and pulling back as they spread out. A 3/4 angle
 * preserves the brawler read while showing depth.
 *
 * Impacts come from the ImpactBus and are applied AFTER the smoothed framing each frame — a translation
 * and roll from the bus's trauma shake, and a field-of-view kick — so the shake never fights the follow
 * (the framing is recomputed from scratch every frame, so nothing accumulates). A knockout's slow motion
 * slows the camera's own drift too.
 */
export default function CameraRig({
  framesRef,
}: {
  framesRef: FramesRef;
}) {
  const {
    camera,
  } =
    useThree();
  const bus =
    useImpactBus();
  const target =
    useRef(
      new THREE.Vector3(
        0,
        1,
        0,
      ),
    );
  const lookAt =
    useRef(
      new THREE.Vector3(
        0,
        1,
        0,
      ),
    );
  const desired =
    useRef(
      new THREE.Vector3(),
    );
  const focus =
    useRef(
      new THREE.Vector3(
        0,
        1.1,
        0,
      ),
    );
  const baseFov =
    useRef<
      | number
      | null
    >(
      null,
    );

  useFrame(
    (
      _,
      deltaRaw,
    ) => {
      const fs =
        framesRef.current;
      const alive =
        fs.filter(
          (
            f,
          ) =>
            f.alive,
        );
      const pool =
        alive.length
          ? alive
          : fs;
      if (
        pool.length ===
        0
      )
        return;

      const slow =
        bus
          ? bus.slowScaleAt(
              performance.now(),
            )
          : 1;
      const delta =
        deltaRaw *
        slow;

      let cx = 0,
        cz = 0;
      for (const f of pool) {
        cx +=
          f.x;
        cz +=
          f.z;
      }
      cx /=
        pool.length;
      cz /=
        pool.length;

      let spread = 4;
      for (const f of pool)
        spread =
          Math.max(
            spread,
            Math.hypot(
              f.x -
                cx,
              f.z -
                cz,
            ) *
              2,
          );

      const dist =
        THREE.MathUtils.clamp(
          spread *
            1.25 +
            7,
          9,
          22,
        );
      const height =
        dist *
        0.62;

      // Desired camera position: in front-ish (+Z) and above.
      desired.current.set(
        cx *
          0.6,
        height,
        cz *
          0.6 +
          dist,
      );
      const k =
        1 -
        Math.pow(
          0.001,
          delta,
        ); // frame-rate independent damp
      target.current.lerp(
        desired.current,
        Math.min(
          1,
          k *
            1.4,
        ),
      );

      camera.position.copy(
        target.current,
      );
      focus.current.set(
        cx,
        1.1,
        cz,
      );
      lookAt.current.lerp(
        focus.current,
        Math.min(
          1,
          k *
            1.4,
        ),
      );
      camera.lookAt(
        lookAt.current,
      );

      if (
        !bus
      )
        return;
      // Impact shake: camera-local sideways/up offset and a roll about the view axis.
      const s =
        bus.shake();
      if (
        s.x !==
          0 ||
        s.y !==
          0 ||
        s.roll !==
          0
      ) {
        camera.translateX(
          s.x,
        );
        camera.translateY(
          s.y,
        );
        camera.rotateZ(
          s.roll,
        );
      }
      // Field-of-view kick: a quick punch-in that eases back. Rebuild the projection only when it moves.
      const cam =
        camera as THREE.PerspectiveCamera;
      if (
        cam.isPerspectiveCamera
      ) {
        if (
          baseFov.current ===
          null
        )
          baseFov.current =
            cam.fov +
            bus.fovKick;
        const fov =
          baseFov.current -
          bus.fovKick; // narrower view = zoom in
        if (
          Math.abs(
            cam.fov -
              fov,
          ) >
          0.005
        ) {
          cam.fov =
            fov;
          cam.updateProjectionMatrix();
        }
      }
    },
  );

  return null;
}
