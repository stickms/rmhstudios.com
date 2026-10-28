/** Actual TF2 PCF graphs, animated material textures and Source-space attachments. */
'use client';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import type { Box3, Object3D } from 'three';
import { jellyMotionLevel } from '@/lib/jelly/tiers';
import type { EffectPlacement } from '@/lib/tf2-loadout/catalog-types';
import { createParticleEnvironment } from '@/lib/tf2-loadout/particles/attachments';
import { acquireTextures, useParticleBundle } from '@/lib/tf2-loadout/particles/client';
import { acquireParticleCapture, ParticleRenderer } from '@/lib/tf2-loadout/particles/renderer';
import { ParticleSimulation } from '@/lib/tf2-loadout/particles/simulation';

export interface EffectSpec {
  id: number;
  placement: Required<EffectPlacement>;
  suffix?: string;
}
interface Runtime {
  renderer: ParticleRenderer;
  attachment: ReturnType<typeof createParticleEnvironment>;
}
export default function EffectParticles({
  spec,
  box,
  owner,
  body,
}: {
  spec: EffectSpec;
  box: Box3;
  owner?: Object3D;
  body?: Object3D;
}) {
  const { bundle } = useParticleBundle(spec.id, spec.suffix);
  const { gl, camera, invalidate } = useThree();
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const visible = useRef(true);
  const capture = useRef<ReturnType<typeof acquireParticleCapture> | null>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
      if (entry.isIntersecting) invalidate();
    });
    observer.observe(gl.domElement);
    const onVisibility = () => {
      if (!document.hidden) invalidate();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [gl, invalidate]);
  useEffect(() => {
    setRuntime(null);
    if (!bundle) return;
    let cancelled = false;
    let renderer: ParticleRenderer | undefined;
    void acquireTextures(bundle).then(
      (textures) => {
        if (cancelled) {
          textures.dispose();
          return;
        }
        try {
          const attachment = createParticleEnvironment(bundle, owner, body, box, spec.placement);
          const simulation = new ParticleSimulation(bundle, attachment.environment);
          simulation.warmup();
          renderer = new ParticleRenderer(simulation, textures);
          if (simulation.unsupported.size)
            console.warn('TF2 particle operators not implemented:', [...simulation.unsupported]);
          camera.layers.enable(1);
          if (renderer.needsScene) capture.current = acquireParticleCapture(gl);
          renderer.update(camera, spec.placement.s);
          setRuntime({ renderer, attachment });
          invalidate();
        } catch (e) {
          textures.dispose();
          console.warn('TF2 particle effect could not be initialized', e);
        }
      },
      (error) => {
        if (!cancelled) console.warn('TF2 particle textures could not be loaded', error);
      },
    );
    return () => {
      cancelled = true;
      renderer?.dispose();
      capture.current?.dispose();
      capture.current = null;
    };
  }, [bundle, owner, body, box, spec.placement, camera, gl, invalidate]);
  useFrame(({ scene, camera, clock }, delta) => {
    if (!runtime || !visible.current || document.hidden) return;
    runtime.attachment.update();
    if (jellyMotionLevel() !== 'still') runtime.renderer.simulation.advance(delta);
    const sceneCopy = capture.current?.update(scene, camera, clock.elapsedTime);
    runtime.renderer.update(camera, spec.placement.s, sceneCopy);
    if (jellyMotionLevel() !== 'still') invalidate();
  });
  return runtime ? <primitive object={runtime.renderer.group} /> : null;
}
