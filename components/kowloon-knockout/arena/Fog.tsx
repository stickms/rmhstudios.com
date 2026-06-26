'use client';

import { useMemo, useEffect, Component } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import {
    instancedArray, instanceIndex, Fn, deltaTime, time, mx_noise_vec3,
    vec3, float, uv, smoothstep,
} from 'three/tsl';
import { useRenderTier } from './RenderTierContext';
import { particleBudget } from '@/lib/kowloon-knockout/render/particles/budget';
import { seedFog, type ParticleBounds } from '@/lib/kowloon-knockout/render/particles/seed';

const FOG_BOUNDS: ParticleBounds = { radius: 13, floor: 0.1, ceiling: 2.5 };
const FOG_COLOR = new THREE.Color('#3a2f5a'); // dim violet haze

// ── GPU subcomponent ──────────────────────────────────────────────────────────

/** GPU compute fog motes (ultra/high + WebGPU only). A TSL kernel advects each
 *  mote along a curl-ish mx_noise_vec3 flow field each frame; positionNode
 *  reads the storage buffer directly so no CPU round-trip is needed.
 *
 *  SPIKE: SpriteNodeMaterial + positionNode = positions.toAttribute() + Sprite.count
 *  for instanced-sprite draw, and mx_noise_vec3 advection, are browser-only
 *  verifiable. If Sprite.count misbehaves, substitute InstancedMesh(PlaneGeometry,
 *  material, count) with the same positionNode (the Task-6 rain pattern). */
function FogGPU({ count }: { count: number }) {
    const gl = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer;

    const { mesh, update, positions } = useMemo(() => {
        const seeded = seedFog(count, FOG_BOUNDS, 909);
        const positions = instancedArray(seeded.positions, 'vec3');

        // Advect along a slow curl-ish noise flow, wrap within the fog cylinder height.
        const update = Fn(() => {
            const pos = positions.element(instanceIndex);
            const flow = mx_noise_vec3(pos.mul(0.15).add(vec3(time.mul(0.05), 0, time.mul(0.04))));
            pos.addAssign(flow.mul(0.4).mul(deltaTime));
            // wrap vertically inside the band
            pos.y.assign(pos.y.sub(FOG_BOUNDS.floor).mod(FOG_BOUNDS.ceiling - FOG_BOUNDS.floor).add(FOG_BOUNDS.floor));
        })().compute(count);

        const material = new THREE.SpriteNodeMaterial();
        material.color = FOG_COLOR;
        material.toneMapped = false;
        material.transparent = true;
        material.depthWrite = false;
        material.blending = THREE.AdditiveBlending;
        material.positionNode = positions.toAttribute();
        material.scaleNode = float(3.5);                       // large soft motes
        // radial soft alpha: fade from center (0.0) to edge (0.5) of the sprite uv
        material.opacityNode = smoothstep(0.5, 0.0, uv().sub(0.5).length()).mul(0.06);

        const mesh = new THREE.Sprite(material);
        mesh.count = count;                                    // instanced sprite draw
        mesh.frustumCulled = false;
        return { mesh, update, positions };
    }, [count]);

    useFrame(() => { void gl.computeAsync(update); });

    useEffect(() => {
        return () => {
            mesh.geometry?.dispose?.();
            mesh.material?.dispose?.();
            positions?.dispose?.();
        };
    }, [mesh, positions]);

    return <primitive object={mesh} />;
}

/** Error boundary wrapping FogGPU. On any render-phase error it logs a warning
 *  and renders null — fog has no CPU fallback by design. */
class FogGPUBoundary extends Component<{ count: number }, { error: boolean }> {
    state = { error: false };
    static getDerivedStateFromError() { return { error: true }; }
    componentDidCatch(error: unknown, info: { componentStack?: string }) {
        console.warn('[Fog] compute path failed, skipping fog:', error, info?.componentStack);
    }
    render() {
        if (this.state.error) return null;
        return <FogGPU count={this.props.count} />;
    }
}

// ── Main export ───────────────────────────────────────────────────────────────

/** Ambient ground fog — drifting violet haze. Compute-only (ultra/high); no CPU
 *  fallback by design (medium/low get no fog). */
export default function Fog() {
    const { tier, flags } = useRenderTier();
    const gl = useThree((s) => s.gl) as unknown as { backend?: { isWebGPUBackend?: boolean } };
    const isWebGPU = !!gl.backend?.isWebGPUBackend;
    const count = particleBudget(tier).fog;

    if (!(flags.gpuParticles && isWebGPU) || count === 0) return null;
    return <FogGPUBoundary count={count} />;
}
