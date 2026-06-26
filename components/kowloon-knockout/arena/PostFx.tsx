'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { pass, mix, float } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { useRenderTier } from './RenderTierContext';

/** Drives the priority-1 render takeover. Only mounted when `post` exists so
 *  that on low tier (no post) no priority>0 useFrame subscriber is registered
 *  and R3F resumes its automatic scene render. */
function PostFxRenderer({ post }: { post: THREE.PostProcessing }) {
    const gl = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer;
    const scene = useThree((s) => s.scene);
    const camera = useThree((s) => s.camera);
    // If the post pipeline ever rejects (driver/TSL-node incompatibility on a
    // given GPU), fall back to a direct scene render for good. Without this, a
    // failed renderAsync leaves R3F's auto-render suppressed (priority>0 is
    // mounted) and the canvas stays permanently black.
    const failed = useRef(false);
    useFrame(() => {
        if (failed.current) { gl.render(scene, camera); return; }
        post.renderAsync().catch((e) => {
            if (failed.current) return;
            failed.current = true;
            console.warn('[PostFx] post pipeline failed; falling back to direct render:', e);
        });
    }, 1);
    return null;
}

/** WebGPU TSL post pipeline: GTAO → scene → bloom on emissives → ACES tonemap.
 *  When the tier disables all post, renders nothing and lets R3F render
 *  normally. Takes over the render loop (useFrame priority 1) when active. */
export default function PostFx() {
    const { flags } = useRenderTier();
    const gl = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer;
    const scene = useThree((s) => s.scene);
    const camera = useThree((s) => s.camera);

    const enabled = flags.bloom || flags.gtao;
    const BLOOM_STRENGTH = 0.9;   // emissive bleed
    const EXPOSURE = 1.05;        // overall brightness post-ACES
    const AO_STRENGTH = 0.6;      // max scene darkening from GTAO (never to black)

    const post = useMemo(() => {
        if (!enabled) return null;
        const pp = new THREE.PostProcessing(gl);
        const scenePass = pass(scene, camera);
        let color = scenePass.getTextureNode('output');

        // ── GTAO ─────────────────────────────────────────────────────────────
        // normalNode = null: the default `pass()` writes no normal MRT buffer, so
        // GTAONode reconstructs normals from depth in-shader (GTAONode.js
        // `getNormalFromDepth`) — the supported no-MRT path.
        // Consume the AO via getTextureNode().r as a SCALAR: GTAO renders into a
        // single-channel RedFormat target (GTAONode.js: `format: RedFormat`), so
        // multiplying the scene by the raw node samples (ao, 0, 0) and zeroes the
        // green/blue channels — tinting everything red. `.r` darkens uniformly.
        if (flags.gtao) {
            try {
                const aoPass = ao(scenePass.getTextureNode('depth'), null, camera);
                // Blend the AO term toward 1 instead of multiplying by it raw.
                // The no-MRT GTAO path reconstructs normals from depth and on some
                // GPUs collapses to ~0 (fully occluded) — a raw multiply then
                // drives the whole frame to black. mix(1, ao, strength) caps the
                // darkening at `AO_STRENGTH`, so worst case the scene dims rather
                // than disappears.
                const aoScalar = aoPass.getTextureNode().r;
                color = color.mul(mix(float(1), aoScalar, float(AO_STRENGTH)));
            } catch (e) {
                console.warn('[PostFx] GTAO setup failed, skipping:', e);
            }
        }
        // ── End GTAO ─────────────────────────────────────────────────────────

        if (flags.bloom) {
            color = color.add(bloom(color, BLOOM_STRENGTH, 0.4, 0.85));
        }
        pp.outputNode = color;
        return pp;
    }, [enabled, gl, scene, camera, flags.bloom, flags.gtao]);

    // ACES tonemapping on the renderer for the noir contrast curve.
    useEffect(() => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = EXPOSURE;
    }, [gl]);

    // three's WebGPU PostProcessing tracks the renderer's drawing-buffer size
    // automatically each frame — it has no setSize(); calling one crashes.

    // Dispose the previous PostProcessing instance when flags/tier change or on
    // unmount, so swapping pipelines doesn't leak GPU resources.
    useEffect(() => () => { post?.dispose?.(); }, [post]);

    // Only mount the render takeover when post exists; otherwise no priority>0
    // useFrame subscriber is registered and R3F keeps its automatic render.
    return post ? <PostFxRenderer post={post} /> : null;
}
