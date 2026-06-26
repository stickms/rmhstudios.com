'use client';

import { useEffect, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { useRenderTier } from './RenderTierContext';

/** Drives the priority-1 render takeover. Only mounted when `post` exists so
 *  that on low tier (no post) no priority>0 useFrame subscriber is registered
 *  and R3F resumes its automatic scene render. */
function PostFxRenderer({ post }: { post: THREE.PostProcessing }) {
    useFrame(() => { void post.renderAsync(); }, 1);
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

    const post = useMemo(() => {
        if (!enabled) return null;
        const pp = new THREE.PostProcessing(gl);
        const scenePass = pass(scene, camera);
        let color = scenePass.getTextureNode('output');

        // ── GTAO ─────────────────────────────────────────────────────────────
        // Pass `null` for the normal node: the default `pass()` does NOT write a
        // normal MRT buffer, so `getTextureNode('normal')` would sample an empty
        // (black) texture and multiply the whole scene to black. With null,
        // GTAONode reconstructs normals from the depth buffer in-shader
        // (GTAONode.js: `getNormalFromDepth`), which is the supported no-MRT path.
        if (flags.gtao) {
            try {
                const aoPass = ao(scenePass.getTextureNode('depth'), null, camera);
                color = color.mul(aoPass);
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
