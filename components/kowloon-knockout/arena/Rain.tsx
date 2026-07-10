'use client';

import { useMemo, useEffect, useRef, useState, Component, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import * as WEBGPU from 'three/webgpu';
import { instancedArray, instanceIndex, Fn, deltaTime, If, float, vec3, positionLocal } from 'three/tsl';
import { useRenderTier } from './RenderTierContext';
import { particleBudget } from '@/lib/kowloon-knockout/render/particles/budget';
import { seedRain, type ParticleBounds } from '@/lib/kowloon-knockout/render/particles/seed';

export const RAIN_BOUNDS: ParticleBounds = { radius: 16, floor: 0, ceiling: 18 };
const RAIN_COLOR = new THREE.Color('#7fd4ff'); // cool neon drizzle
const RAIN_SEED = 5150;

// ── GPU subcomponent ──────────────────────────────────────────────────────────

/** GPU compute rain (ultra/high + WebGPU only). Seeded from the same
 *  deterministic field as the CPU path. A TSL kernel integrates velocity and
 *  wraps drops at the floor each frame; positionNode reads the storage buffer
 *  directly so no CPU round-trip is needed.
 *
 *  The class boundary (RainGPUBoundary) catches construction-phase (useMemo)
 *  errors and renders the CPU fallback. The async .catch below handles
 *  dispatch-phase failures (e.g. device lost, shader compile error) — stops
 *  re-dispatching and escalates to the CPU path via onComputeError.
 *
 *  SPIKE: the positionNode / toAttribute() instance-offset wiring and
 *  gl.computeAsync dispatch are browser-only verifiable. */
function RainGPU({ count, onComputeError }: { count: number; onComputeError?: () => void }) {
    const gl = useThree((s) => s.gl) as unknown as WEBGPU.WebGPURenderer;

    const { mesh, update, positions, velocities } = useMemo(() => {
        const seeded = seedRain(count, RAIN_BOUNDS, RAIN_SEED);
        const positions = instancedArray(seeded.positions, 'vec3');
        const velocities = instancedArray(seeded.velocities, 'vec3');

        // Per-frame kernel: integrate velocity + wrap at the floor.
        const update = Fn(() => {
            const pos = positions.element(instanceIndex);
            const vel = velocities.element(instanceIndex);
            pos.addAssign(vel.mul(deltaTime));
            If(pos.y.lessThan(float(RAIN_BOUNDS.floor)), () => {
                pos.y.assign(float(RAIN_BOUNDS.ceiling));
            });
        })().compute(count);

        const material = new WEBGPU.MeshBasicNodeMaterial();
        material.color = RAIN_COLOR;   // base tint; no colorNode so .color applies
        material.toneMapped = false;
        material.transparent = true;
        material.opacity = 0.3;
        material.blending = WEBGPU.AdditiveBlending;
        material.depthWrite = false;
        // Offset each instance's local vertices by its storage-buffer position.
        material.positionNode = positionLocal.mul(vec3(0.02, 0.5, 0.02)).add(positions.toAttribute());

        const geometry = new WEBGPU.BoxGeometry(1, 1, 1);
        const mesh = new WEBGPU.InstancedMesh(geometry, material, count);
        mesh.frustumCulled = false;
        return { mesh, update, positions, velocities };
    }, [count]);

    const failedRef = useRef(false);
    useFrame(() => {
        if (failedRef.current) return;
        gl.computeAsync(update).catch((e) => {
            failedRef.current = true;
            console.warn('[Rain] compute dispatch failed, falling back to CPU rain:', e);
            onComputeError?.();
        });
    });

    useEffect(() => {
        return () => {
            mesh.geometry?.dispose?.();
            mesh.material?.dispose?.();
            positions?.dispose?.();
            velocities?.dispose?.();
        };
    }, [mesh, positions, velocities]);

    return <primitive object={mesh} />;
}

/** Error boundary wrapping RainGPU. Construction-phase (useMemo) errors are
 *  caught here and render the CPU fallback immediately. Async dispatch failures
 *  are handled inside RainGPU via the .catch handler, which calls onComputeError
 *  to trigger CPU escalation from the parent Rain() component. */
class RainGPUBoundary extends Component<
    { count: number; fallback: ReactNode; onComputeError?: () => void },
    { error: boolean }
> {
    state = { error: false };
    static getDerivedStateFromError() { return { error: true }; }
    componentDidCatch(error: unknown, info: { componentStack?: string }) {
        console.warn('[Rain] compute path failed, using CPU rain:', error, info?.componentStack);
    }
    render() {
        return this.state.error
            ? this.props.fallback
            : <RainGPU count={this.props.count} onComputeError={this.props.onComputeError} />;
    }
}

// ── Main export ───────────────────────────────────────────────────────────────

/** Ambient neon rain. CPU instanced integration (medium tier + fallback for
 *  ultra/high when compute is unavailable). Drops fall + drift and wrap back to
 *  the ceiling at the floor.
 *
 *  On ultra/high with a WebGPU backend the GPU compute path is attempted via
 *  RainGPUBoundary. Construction-phase failures are caught by the class boundary
 *  and render the CPU mesh immediately. Async dispatch failures (device lost, etc.)
 *  are caught inside RainGPU and escalate via gpuFailed state, causing Rain() to
 *  re-render into the CPU mesh path. */
export default function Rain() {
    const { tier, flags } = useRenderTier();
    const gl = useThree((s) => s.gl) as unknown as { backend?: { isWebGPUBackend?: boolean } };
    const isWebGPU = !!gl.backend?.isWebGPUBackend;
    const count = particleBudget(tier).rain;
    const [gpuFailed, setGpuFailed] = useState(false);
    const useGPU = flags.gpuParticles && isWebGPU && count > 0 && !gpuFailed;

    // ── CPU-path hooks — declared unconditionally so hook order is stable ──────
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const field = useMemo(() => (count > 0 ? seedRain(count, RAIN_BOUNDS, RAIN_SEED) : null), [count]);

    // CPU integration: no-ops naturally when meshRef.current is null (i.e. when
    // the GPU path has the instancedMesh unmounted) or when field is null.
    useFrame((_, deltaRaw) => {
        const mesh = meshRef.current;
        if (!mesh || !field) return;
        const dt = Math.min(0.05, deltaRaw);
        const { positions, velocities } = field;
        for (let i = 0; i < count; i++) {
            let y = positions[i * 3 + 1] + velocities[i * 3 + 1] * dt;
            const x = positions[i * 3] + velocities[i * 3] * dt;
            const z = positions[i * 3 + 2] + velocities[i * 3 + 2] * dt;
            if (y < RAIN_BOUNDS.floor) { y = RAIN_BOUNDS.ceiling; }   // recycle
            positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
            dummy.position.set(x, y, z);
            dummy.scale.set(0.02, 0.5, 0.02);                        // thin vertical streak
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    });

    // ── Render branch ──────────────────────────────────────────────────────────
    if (count === 0) return null;

    const cpuMesh = (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={RAIN_COLOR} toneMapped={false} transparent opacity={0.3}
                blending={THREE.AdditiveBlending} depthWrite={false} />
        </instancedMesh>
    );

    if (useGPU) return <RainGPUBoundary count={count} fallback={cpuMesh} onComputeError={() => setGpuFailed(true)} />;
    return cpuMesh;
}
