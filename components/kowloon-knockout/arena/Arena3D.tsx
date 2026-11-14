import {
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react';
import { useFrame } from '@react-three/fiber';
import type {
  GameSession,
  RenderFighter,
} from '@/lib/kowloon-knockout/net/session';
import { ImpactBus } from '@/lib/kowloon-knockout/render/impact';
import { particleBudget } from '@/lib/kowloon-knockout/render/particles/budget';
import Environment from './Environment';
import Skyline from './Skyline';
import Atmosphere from './Atmosphere';
import Lighting from './Lighting';
import Fighter from './Fighter';
import CameraRig from './CameraRig';
import Fx from './Fx';
import ImpactFx from './ImpactFx';
import ImpactDirector from './ImpactDirector';
import { ImpactProvider } from './ImpactContext';
import PostFx from './PostFx';
import Rain from './Rain';
import Fog from './Fog';
import {
  RenderTierProvider,
  useRenderTier,
} from './RenderTierContext';
import Governor from './Governor';

type FramesRef =
  MutableRefObject<
    RenderFighter[]
  >;

/** Pulls fresh render state from the session once per frame, before the
 *  impact director, the fighters and the camera read it. */
function FrameSync({
  session,
  framesRef,
}: {
  session: GameSession;
  framesRef: FramesRef;
}) {
  useFrame(
    () => {
      framesRef.current =
        session.getRenderFighters();
    },
    -200,
  );
  return null;
}

/** Impact effects sized to the render tier: fewer sparks and no camera-facing ring on the low tier. */
function ArenaImpactFx() {
  const {
    tier,
  } =
    useRenderTier();
  const cap =
    particleBudget(
      tier,
    ).burstCap;
  return (
    <ImpactFx
      sparkCap={Math.min(
        240,
        Math.max(
          60,
          Math.round(
            cap *
              0.2,
          ),
        ),
      )}
      lite={
        tier ===
        'low'
      }
    />
  );
}

export default function Arena3D({
  session,
  seatIds,
}: {
  session: GameSession;
  seatIds: number[];
}) {
  const framesRef =
    useRef<
      RenderFighter[]
    >(
      session.getRenderFighters(),
    );
  // One bus per arena: hits, blocks and knockouts are told to it, and the camera, fighters and effects react.
  const bus =
    useMemo(
      () =>
        new ImpactBus(),
      [],
    );

  return (
    <RenderTierProvider>
      <ImpactProvider
        value={
          bus
        }
      >
        <color
          attach="background"
          args={[
            '#070010',
          ]}
        />
        <fog
          attach="fog"
          args={[
            '#0a0118',
            16,
            55,
          ]}
        />

        <Lighting />
        <Governor />

        <FrameSync
          session={
            session
          }
          framesRef={
            framesRef
          }
        />
        <ImpactDirector
          session={
            session
          }
          framesRef={
            framesRef
          }
          bus={
            bus
          }
        />
        <CameraRig
          framesRef={
            framesRef
          }
        />

        <Environment />
        <Skyline />
        <Atmosphere />
        <Rain />
        <Fog />

        {seatIds.map(
          (
            seat,
          ) => (
            <Fighter
              key={
                seat
              }
              seat={
                seat
              }
              framesRef={
                framesRef
              }
            />
          ),
        )}

        <Fx />
        <ArenaImpactFx />
        <PostFx />
      </ImpactProvider>
    </RenderTierProvider>
  );
}
