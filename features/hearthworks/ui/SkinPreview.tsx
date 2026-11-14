/**
 * The wardrobe's turntable: a small canvas showing a skin as it will look in the world, turning slowly and cycling
 * idle → walk → run so the model's real animation is visible before buying it. The skin's skinned model when it has
 * one, the procedural figure otherwise (SkinFigure decides). It has no FigureSystem, so the figure animates itself,
 * at full rate, as a pinned figure. Loaded lazily by the Wardrobe: it brings a second WebGL context only while the
 * wardrobe is open.
 */

import {
  useMemo,
  useRef,
} from 'react';
import {
  Canvas,
  useFrame,
} from '@react-three/fiber';
import type * as THREE from 'three';
import { PALETTE } from '@features/hearthworks/engine/art';
import {
  WALK_SPEED,
  RUN_SPEED,
} from '@features/hearthworks/engine/avatar';
import type { SkinId } from '@features/hearthworks/engine/skins';
import {
  approach,
  newDrive,
} from '@features/hearthworks/engine/skins/animator';
import { SkinFigure } from './scene/SkinFigure';

/** Seconds spent in each gait. */
const STAGE_S = 3.2;
const STAGES =
  [
    0,
    WALK_SPEED,
    RUN_SPEED,
  ] as const;

function Turntable({
  skin,
}: {
  skin: SkinId;
}) {
  const spin =
    useRef<THREE.Group>(
      null,
    );
  const drive =
    useMemo(
      () =>
        newDrive(),
      [],
    );
  const clock =
    useRef(
      0,
    );

  useFrame(
    (
      _,
      delta,
    ) => {
      const dt =
        Math.min(
          delta,
          0.1,
        );
      clock.current +=
        dt;
      const stage =
        Math.floor(
          clock.current /
            STAGE_S,
        ) %
        STAGES.length;
      // The same smoothing the avatar's acceleration gives, so the blend between gaits is the one the game plays.
      drive.speed =
        approach(
          drive.speed,
          STAGES[
            stage
          ],
          dt,
          5,
        );
      if (
        spin.current
      )
        spin.current.rotation.y +=
          dt *
          0.55;
    },
  );

  return (
    <>
      <mesh
        position={[
          0,
          -0.005,
          0,
        ]}
        rotation-x={
          -Math.PI /
          2
        }
      >
        <circleGeometry
          args={[
            0.3,
            32,
          ]}
        />
        <meshStandardMaterial
          color={
            PALETTE.powder
          }
          roughness={
            0.95
          }
        />
      </mesh>
      <group
        ref={
          spin
        }
      >
        <SkinFigure
          skin={
            skin
          }
          drive={
            drive
          }
          pinned
        />
      </group>
    </>
  );
}

export default function SkinPreview({
  skin,
}: {
  skin: SkinId;
}) {
  return (
    <Canvas
      dpr={[
        1,
        2,
      ]}
      camera={{
        position:
          [
            0,
            0.27,
            1.3,
          ],
        fov: 28,
        near: 0.05,
        far: 20,
      }}
      onCreated={({
        camera,
      }) =>
        camera.lookAt(
          0,
          0.17,
          0,
        )
      }
      gl={{
        antialias: true,
        alpha: true,
      }}
      style={{
        touchAction:
          'none',
      }}
    >
      <ambientLight
        intensity={
          1.7
        }
      />
      <directionalLight
        position={[
          1.2,
          2,
          1.4,
        ]}
        intensity={
          1.3
        }
      />
      <Turntable
        key={
          skin
        }
        skin={
          skin
        }
      />
    </Canvas>
  );
}
