import * as THREE from 'three/webgpu';
import { extend } from '@react-three/fiber';
import { reportFatal, reportFrameFail, reportFrameOk, resetRenderHealth, shouldForceWebGL } from './health';

let extended = false;

/** Register the three/webgpu namespace with R3F's JSX catalogue exactly once.
 *  After this, <meshStandardMaterial/> etc. resolve to the node-material
 *  implementations that WebGPURenderer requires. */
export function extendKowloonThree(): void {
    if (extended) return;
    // R3F's catalogue is a runtime registry; the webgpu namespace is a superset
    // of core, so extending with it is safe for all existing intrinsics.
    extend(THREE as unknown as Parameters<typeof extend>[0]);
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
        // Set by the render watchdog after the WebGPU backend failed to paint.
        forceWebGL: shouldForceWebGL(),
    });
    await renderer.init();
    // Surface which backend actually won, for the [SMOKE] console check.
    // `isWebGPUBackend` lives on the WebGPUBackend subclass, not the base
    // `Backend` type the renderer exposes — narrow it for the runtime check.
    const backend = (renderer.backend as { isWebGPUBackend?: boolean } | undefined)?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
    // eslint-disable-next-line no-console
    console.info(`[kowloon] renderer backend: ${backend}`);
    resetRenderHealth(backend === 'WebGPU');
    instrumentRenderer(renderer);
    return renderer;
}

export type KowloonRenderer = THREE.WebGPURenderer;

/** Record every frame's outcome so the watchdog (GameView) can tell a painting
 *  canvas from one that throws or never finishes. A failing frame must not take
 *  the loop down, so rejections are swallowed here after being counted. */
function instrumentRenderer(renderer: THREE.WebGPURenderer): void {
    const r = renderer as unknown as {
        render: (...a: unknown[]) => unknown;
        renderAsync?: (...a: unknown[]) => Promise<unknown>;
    };
    const render = r.render.bind(renderer);
    r.render = (...a) => {
        try {
            const out = render(...a);
            reportFrameOk();
            return out;
        } catch (e) {
            reportFrameFail(e);
            return undefined;
        }
    };
    if (r.renderAsync) {
        const renderAsync = r.renderAsync.bind(renderer);
        r.renderAsync = (...a) =>
            renderAsync(...a).then(
                (v) => { reportFrameOk(); return v; },
                (e) => { reportFrameFail(e); },
            );
    }
    // A lost or erroring WebGPU device paints nothing and often throws nowhere
    // we can catch; count it as a failed frame so the watchdog sees it.
    const device = (renderer.backend as { device?: GPUDevice } | undefined)?.device;
    device?.addEventListener?.('uncapturederror', (e) => reportFrameFail((e as GPUUncapturedErrorEvent).error));
    void device?.lost?.then((info) => reportFatal(info));
}
