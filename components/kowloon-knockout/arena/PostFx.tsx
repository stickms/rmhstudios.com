'use client';

import { useEffect, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { useRenderTier } from './RenderTierContext';

/** WebGPU TSL post pipeline: GTAO → scene → bloom on emissives → ACES tonemap.
 *  When the tier disables all post, renders nothing and lets R3F render
 *  normally. Takes over the render loop (useFrame priority 1) when active. */
export default function PostFx() {
    const { flags } = useRenderTier();
    const gl = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer;
    const scene = useThree((s) => s.scene);
    const camera = useThree((s) => s.camera);
    const size = useThree((s) => s.size);

    const enabled = flags.bloom || flags.gtao;

    const post = useMemo(() => {
        if (!enabled) return null;
        const pp = new THREE.PostProcessing(gl);
        const scenePass = pass(scene, camera);
        let color = scenePass.getTextureNode('output');

        // ── GTAO (runtime-risky path) ────────────────────────────────────────
        // Requires the scene pass to expose a normal buffer via MRT.
        // If this block throws ("normal" buffer missing) or produces a black
        // screen, disable by setting flags.gtao = false in tier.ts (ultra/high)
        // or commenting this block — bloom + tonemap below are unaffected.
        if (flags.gtao) {
            const aoPass = ao(scenePass.getTextureNode('depth'), scenePass.getTextureNode('normal'), camera);
            color = color.mul(aoPass);
        }
        // ── End GTAO ─────────────────────────────────────────────────────────

        if (flags.bloom) {
            color = color.add(bloom(color, 0.9, 0.4, 0.85));
        }
        pp.outputNode = color;
        return pp;
    }, [enabled, gl, scene, camera, flags.bloom, flags.gtao]);

    // ACES tonemapping on the renderer for the noir contrast curve.
    useEffect(() => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
    }, [gl]);

    useEffect(() => {
        if (post) post.setSize(size.width, size.height);
    }, [post, size.width, size.height]);

    // Priority > 0 disables R3F's automatic render; we drive it.
    useFrame(() => {
        if (post) post.renderAsync();
    }, 1);

    return null;
}
