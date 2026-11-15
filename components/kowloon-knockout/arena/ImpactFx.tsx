/**
 * What a hit, a block and a knockout look like: a ground shockwave, a camera-facing ring and a bright
 * contact flash at the point of impact, and sparks that streak along their velocity.
 *
 * What to draw is decided by `planImpactFx` (lib/kowloon-knockout/render/impactFxPlan.ts, tested); this
 * component only runs the plan: four pooled InstancedMeshes (ground rings, contact rings, flashes,
 * sparks) written compactly each frame, additive, no per-event allocation, nothing drawn while idle.
 * It reads the ImpactBus from context and works under both the WebGPU renderer the arena uses and a
 * plain WebGL renderer (the menu): only `meshBasicMaterial`, instancing and additive blending.
 *
 * The bus's slow motion slows these too (a knockout's sparks hang in the air).
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useImpactBus } from './ImpactContext';
import type {
  ImpactEvent,
  ImpactProfile,
} from '@/lib/kowloon-knockout/render/impact';
import {
  flashAt,
  planImpactFx,
  ringAt,
  sparkVelocity,
  streakLength,
} from '@/lib/kowloon-knockout/render/impactFxPlan';

interface RingP {
  active: boolean;
  age: number;
  life: number;
  size: number;
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
}
interface SparkP {
  active: boolean;
  age: number;
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  thick: number;
}

const GRAVITY = 7;
const FLOOR_Y = 0.03;
const Z_AXIS =
  new THREE.Vector3(
    0,
    0,
    1,
  );
const FLAT =
  new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      -Math.PI /
        2,
      0,
      0,
    ),
  );

// Scratch objects: the frame loop and the spawner allocate nothing.
const dummy =
  new THREE.Object3D();
const tint =
  new THREE.Color();
const dir =
  new THREE.Vector3();
const quat =
  new THREE.Quaternion();

const makeRings =
  (
    n: number,
  ): RingP[] =>
    Array.from(
      {
        length:
          n,
      },
      () => ({
        active: false,
        age: 0,
        life: 1,
        size: 1,
        x: 0,
        y: 0,
        z: 0,
        r: 1,
        g: 1,
        b: 1,
      }),
    );
const makeSparks =
  (
    n: number,
  ): SparkP[] =>
    Array.from(
      {
        length:
          n,
      },
      () => ({
        active: false,
        age: 0,
        life: 1,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        r: 1,
        g: 1,
        b: 1,
        thick: 0.03,
      }),
    );

function claim<
  T extends
    {
      active: boolean;
    },
>(
  pool: T[],
): T | null {
  for (
    let i = 0;
    i <
    pool.length;
    i++
  )
    if (
      !pool[
        i
      ]
        .active
    )
      return pool[
        i
      ];
  return null;
}

function setColor(
  p: {
    r: number;
    g: number;
    b: number;
  },
  hex: string,
): void {
  tint.set(
    hex,
  );
  p.r =
    tint.r;
  p.g =
    tint.g;
  p.b =
    tint.b;
}

export interface ImpactFxProps {
  /** Most sparks alive at once (scale this to the device). */
  sparkCap?: number;
  /** Weak device: no camera-facing contact ring. */
  lite?: boolean;
  /**
   * Drawing onto a TRANSPARENT canvas that sits over a page (the menu): plain additive blending would
   * write an opaque dim colour over the page where the effect fades, so the colour is added with
   * alpha 0 instead (premultiplied-additive) and the page shows through as light. An opaque canvas
   * (the arena) keeps ordinary additive blending.
   */
  overTransparent?: boolean;
}

/** Additive blending that adds light to the page behind a transparent, premultiplied-alpha canvas. */
const PREMULT_ADD =
  {
    blending:
      THREE.CustomBlending,
    blendEquation:
      THREE.AddEquation,
    blendSrc:
      THREE.OneFactor,
    blendDst:
      THREE.OneFactor,
    blendEquationAlpha:
      THREE.AddEquation,
    blendSrcAlpha:
      THREE.ZeroFactor,
    blendDstAlpha:
      THREE.OneFactor,
  } as const;
const PLAIN_ADD =
  {
    blending:
      THREE.AdditiveBlending,
  } as const;

export default function ImpactFx({
  sparkCap = 90,
  lite = false,
  overTransparent = false,
}: ImpactFxProps) {
  const blend =
    overTransparent
      ? PREMULT_ADD
      : PLAIN_ADD;
  const bus =
    useImpactBus();
  const ringCap =
    lite
      ? 4
      : 8;

  const ground =
    useRef<THREE.InstancedMesh>(
      null,
    );
  const contact =
    useRef<THREE.InstancedMesh>(
      null,
    );
  const flashes =
    useRef<THREE.InstancedMesh>(
      null,
    );
  const sparkMesh =
    useRef<THREE.InstancedMesh>(
      null,
    );

  const pools =
    useMemo(
      () => ({
        ground:
          makeRings(
            ringCap,
          ),
        contact:
          makeRings(
            ringCap,
          ),
        flash:
          makeRings(
            Math.max(
              2,
              ringCap /
                2,
            ),
          ),
        sparks:
          makeSparks(
            sparkCap,
          ),
      }),
      [
        ringCap,
        sparkCap,
      ],
    );
  const live =
    useRef(
      0,
    );

  // Nothing is drawn until something is alive; start with every instance hidden.
  useLayoutEffect(() => {
    tint.setRGB(
      0,
      0,
      0,
    );
    for (const m of [
      ground.current,
      contact.current,
      flashes.current,
      sparkMesh.current,
    ]) {
      if (
        !m
      )
        continue;
      // Create the per-instance colour buffer now, before the first draw: a renderer that compiles its
      // program on first use (WebGPU) must see it from the start, not gain it on the first spark.
      m.setColorAt(
        0,
        tint,
      );
      m.count = 0;
      m.visible = false;
    }
    live.current = 0;
  }, [
    pools,
  ]);

  useEffect(() => {
    if (
      !bus
    )
      return;
    return bus.subscribe(
      (
        e: ImpactEvent,
        prof: ImpactProfile,
      ) => {
        const freeSparks =
          pools.sparks.reduce(
            (
              n,
              s,
            ) =>
              n +
              (s.active
                ? 0
                : 1),
            0,
          );
        const plan =
          planImpactFx(
            e,
            prof,
            {
              sparkBudget:
                freeSparks,
              lite,
            },
          );
        for (const r of plan.rings) {
          const p =
            claim(
              r.kind ===
                'ground'
                ? pools.ground
                : pools.contact,
            );
          if (
            !p
          )
            continue;
          p.active = true;
          p.age = 0;
          p.life =
            r.life;
          p.size =
            r.size;
          p.x =
            e.x;
          p.y =
            r.kind ===
            'ground'
              ? 0.04
              : e.y;
          p.z =
            e.z;
          setColor(
            p,
            r.color,
          );
        }
        if (
          plan.flash
        ) {
          const p =
            claim(
              pools.flash,
            );
          if (
            p
          ) {
            p.active = true;
            p.age = 0;
            p.life =
              plan.flash.life;
            p.size =
              plan.flash.size;
            p.x =
              e.x;
            p.y =
              e.y;
            p.z =
              e.z;
            setColor(
              p,
              plan
                .flash
                .color,
            );
          }
        }
        for (const volley of plan.sparks) {
          for (
            let i = 0;
            i <
            volley.count;
            i++
          ) {
            const s =
              claim(
                pools.sparks,
              );
            if (
              !s
            )
              break;
            const [
              vx,
              vy,
              vz,
            ] =
              sparkVelocity(
                volley,
                Math.random(),
                Math.random(),
                Math.random(),
              );
            s.active = true;
            s.age = 0;
            s.life =
              volley.lifeMin +
              (volley.lifeMax -
                volley.lifeMin) *
                Math.random();
            s.x =
              e.x;
            s.y =
              e.y;
            s.z =
              e.z;
            s.vx =
              vx;
            s.vy =
              vy;
            s.vz =
              vz;
            s.thick =
              0.01 +
              Math.random() *
                0.012;
            setColor(
              s,
              volley.color,
            );
          }
        }
        live.current = 1;
      },
    );
  }, [
    bus,
    pools,
    lite,
  ]);

  useFrame(
    (
      state,
      deltaRaw,
    ) => {
      if (
        live.current ===
        0
      )
        return;
      const now =
        performance.now();
      const dt =
        Math.min(
          0.05,
          deltaRaw,
        ) *
        (bus
          ? bus.slowScaleAt(
              now,
            )
          : 1);
      let alive = 0;

      // Rings (ground = flat, contact = facing the camera) and flashes (spheres).
      const writeRings =
        (
          mesh: THREE.InstancedMesh | null,
          pool: RingP[],
          kind:
            | 'ground'
            | 'contact'
            | 'flash',
        ) => {
          if (
            !mesh
          )
            return;
          let n = 0;
          for (
            let i = 0;
            i <
            pool.length;
            i++
          ) {
            const p =
              pool[
                i
              ];
            if (
              !p.active
            )
              continue;
            p.age +=
              dt;
            if (
              p.age >=
              p.life
            ) {
              p.active = false;
              continue;
            }
            const a =
              kind ===
              'flash'
                ? flashAt(
                    p.age,
                    p.life,
                    p.size,
                  )
                : ringAt(
                    p.age,
                    p.life,
                    p.size,
                  );
            dummy.position.set(
              p.x,
              p.y,
              p.z,
            );
            dummy.quaternion.copy(
              kind ===
                'ground'
                ? FLAT
                : state
                    .camera
                    .quaternion,
            );
            dummy.scale.setScalar(
              Math.max(
                0.001,
                a.radius,
              ),
            );
            dummy.updateMatrix();
            mesh.setMatrixAt(
              n,
              dummy.matrix,
            );
            tint.setRGB(
              p.r *
                a.fade,
              p.g *
                a.fade,
              p.b *
                a.fade,
            );
            mesh.setColorAt(
              n,
              tint,
            );
            n++;
          }
          mesh.count =
            n;
          mesh.visible =
            n >
            0;
          mesh.instanceMatrix.needsUpdate = true;
          if (
            mesh.instanceColor
          )
            mesh.instanceColor.needsUpdate = true;
          alive +=
            n;
        };
      writeRings(
        ground.current,
        pools.ground,
        'ground',
      );
      writeRings(
        contact.current,
        pools.contact,
        'contact',
      );
      writeRings(
        flashes.current,
        pools.flash,
        'flash',
      );

      // Sparks: gravity, a floor bounce, drawn as a streak along the velocity.
      const sm =
        sparkMesh.current;
      if (
        sm
      ) {
        let n = 0;
        for (
          let i = 0;
          i <
          pools
            .sparks
            .length;
          i++
        ) {
          const s =
            pools
              .sparks[
              i
            ];
          if (
            !s.active
          )
            continue;
          s.age +=
            dt;
          if (
            s.age >=
            s.life
          ) {
            s.active = false;
            continue;
          }
          s.vy -=
            GRAVITY *
            dt;
          s.x +=
            s.vx *
            dt;
          s.y +=
            s.vy *
            dt;
          s.z +=
            s.vz *
            dt;
          if (
            s.y <
            FLOOR_Y
          ) {
            s.y =
              FLOOR_Y;
            s.vy *=
              -0.35;
            s.vx *= 0.7;
            s.vz *= 0.7;
          }
          const speed =
            Math.hypot(
              s.vx,
              s.vy,
              s.vz,
            );
          const fade =
            1 -
            s.age /
              s.life;
          dir
            .set(
              s.vx,
              s.vy,
              s.vz,
            )
            .multiplyScalar(
              speed >
                1e-6
                ? 1 /
                    speed
                : 0,
            );
          if (
            speed >
            1e-6
          )
            quat.setFromUnitVectors(
              Z_AXIS,
              dir,
            );
          else
            quat.identity();
          dummy.position.set(
            s.x,
            s.y,
            s.z,
          );
          dummy.quaternion.copy(
            quat,
          );
          dummy.scale.set(
            s.thick,
            s.thick,
            streakLength(
              speed,
            ) *
              (0.4 +
                0.6 *
                  fade),
          );
          dummy.updateMatrix();
          sm.setMatrixAt(
            n,
            dummy.matrix,
          );
          tint.setRGB(
            s.r *
              fade,
            s.g *
              fade,
            s.b *
              fade,
          );
          sm.setColorAt(
            n,
            tint,
          );
          n++;
        }
        sm.count =
          n;
        sm.visible =
          n >
          0;
        sm.instanceMatrix.needsUpdate = true;
        if (
          sm.instanceColor
        )
          sm.instanceColor.needsUpdate = true;
        alive +=
          n;
      }
      if (
        alive ===
        0
      )
        live.current = 0;
    },
  );

  return (
    <>
      <instancedMesh
        ref={
          ground
        }
        args={[
          undefined,
          undefined,
          pools
            .ground
            .length,
        ]}
        frustumCulled={
          false
        }
        renderOrder={
          5
        }
      >
        <ringGeometry
          args={[
            0.93,
            1,
            64,
          ]}
        />
        <meshBasicMaterial
          toneMapped={
            false
          }
          transparent
          {...blend}
          depthWrite={
            false
          }
          side={
            THREE.DoubleSide
          }
        />
      </instancedMesh>
      <instancedMesh
        ref={
          contact
        }
        args={[
          undefined,
          undefined,
          pools
            .contact
            .length,
        ]}
        frustumCulled={
          false
        }
        renderOrder={
          6
        }
      >
        <ringGeometry
          args={[
            0.9,
            1,
            56,
          ]}
        />
        <meshBasicMaterial
          toneMapped={
            false
          }
          transparent
          {...blend}
          depthWrite={
            false
          }
          side={
            THREE.DoubleSide
          }
        />
      </instancedMesh>
      <instancedMesh
        ref={
          flashes
        }
        args={[
          undefined,
          undefined,
          pools
            .flash
            .length,
        ]}
        frustumCulled={
          false
        }
        renderOrder={
          7
        }
      >
        <sphereGeometry
          args={[
            1,
            12,
            8,
          ]}
        />
        <meshBasicMaterial
          toneMapped={
            false
          }
          transparent
          {...blend}
          depthWrite={
            false
          }
        />
      </instancedMesh>
      <instancedMesh
        ref={
          sparkMesh
        }
        args={[
          undefined,
          undefined,
          pools
            .sparks
            .length,
        ]}
        frustumCulled={
          false
        }
        renderOrder={
          8
        }
      >
        <boxGeometry
          args={[
            1,
            1,
            1,
          ]}
        />
        <meshBasicMaterial
          toneMapped={
            false
          }
          transparent
          {...blend}
          depthWrite={
            false
          }
        />
      </instancedMesh>
    </>
  );
}
