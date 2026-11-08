/// <reference lib="webworker" />
/**
 * The globe cursor's worker: it owns the cursor's WebGL 2 surface (`./gl.ts` `GlobeGl`) on the `OffscreenCanvas` the
 * page transferred, and draws the newest frame the page posted once per animation frame of this worker (a 16 ms timer
 * where workers have no `requestAnimationFrame`). Frames that arrive faster than the GPU draws them are merged, newest
 * wins; each drawn frame is acknowledged so the page can hold back instead of queueing. Protocol: `./remote-gl.ts`.
 * No DOM access.
 */
import { GlobeGl, type GlFrame } from './gl';
import type { CursorWorkerIn, CursorWorkerOut } from './remote-gl';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: CursorWorkerOut) => scope.postMessage(m);

let gl: GlobeGl<OffscreenCanvas> | null = null;
let pending: GlFrame | null = null;
let pendingSeq = 0;
let scheduled = false;
let lost = false;

const draw = () => {
  scheduled = false;
  const f = pending;
  pending = null;
  if (!gl || !f) return;
  if (!gl.ok) {
    if (!lost) {
      lost = true;
      post({ type: 'lost' });
    }
    return;
  }
  gl.render(f);
  post({ type: 'ack', seq: pendingSeq });
};

const schedule = () => {
  if (scheduled) return;
  scheduled = true;
  if (typeof scope.requestAnimationFrame === 'function') scope.requestAnimationFrame(draw);
  else setTimeout(draw, 16);
};

scope.onmessage = (e: MessageEvent<CursorWorkerIn>) => {
  const m = e.data;
  if (m.type === 'init') {
    if (gl) return;
    void GlobeGl.createOn(m.canvas, m.software).then((g) => {
      gl = g;
      post({ type: 'ready', ok: !!g });
    });
    return;
  }
  if (m.type === 'frame') {
    pending = m.f;
    pendingSeq = m.seq;
    schedule();
  }
};
