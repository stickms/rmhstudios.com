import * as THREE from 'three/webgpu';
import { extend } from '@react-three/fiber';

let extended = false;

/** Register the three/webgpu namespace with R3F's JSX catalogue exactly once.
 *  After this, <meshStandardMaterial/> etc. resolve to the node-material
 *  implementations that WebGPURenderer requires. */
export function extendKowloonThree(): void {
    if (extended) return;
    // R3F's catalogue is a runtime registry; the webgpu namespace is a superset
    // of core, so extending with it is safe for all existing intrinsics.
    extend(THREE as unknown as Record<string, unknown>);
    extended = true;
}

/** R3F `gl` factory. WebGPURenderer.init() is async (adapter/device request);
 *  R3F v9 awaits a promise returned from the gl factory before first render.
 *  The renderer auto-selects the WebGPU backend and falls back to WebGL2. */
export async function createKowloonRenderer(
    props: Record<string, unknown>,
): Promise<THREE.WebGPURenderer> {
    const renderer = new THREE.WebGPURenderer({
        ...props,
        antialias: true,
        powerPreference: 'high-performance',
    });
    await renderer.init();
    // Surface which backend actually won, for the [SMOKE] console check.
    const backend = renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
    // eslint-disable-next-line no-console
    console.info(`[kowloon] renderer backend: ${backend}`);
    return renderer;
}

export type KowloonRenderer = THREE.WebGPURenderer;
