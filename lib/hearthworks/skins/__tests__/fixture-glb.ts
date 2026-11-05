/**
 * Export the fixture character to a real binary glTF (GLB) in node, so tests and the browser harness load it through
 * the same GLTFLoader path as a shipped model.
 */

import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { buildFixture } from './fixture-model';

/** GLTFExporter reads its Blob back with FileReader, which node does not have. */
function ensureFileReader(): void {
  if (typeof (globalThis as { FileReader?: unknown }).FileReader === 'function') return;
  class NodeFileReader {
    result: ArrayBuffer | string | null = null;
    onloadend: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    readAsArrayBuffer(blob: Blob) {
      blob.arrayBuffer().then(
        (r) => {
          this.result = r;
          this.onloadend?.();
        },
        (e) => this.onerror?.(e),
      );
    }
    readAsDataURL(blob: Blob) {
      blob.arrayBuffer().then(
        (r) => {
          this.result = `data:${blob.type};base64,${Buffer.from(r).toString('base64')}`;
          this.onloadend?.();
        },
        (e) => this.onerror?.(e),
      );
    }
  }
  (globalThis as { FileReader?: unknown }).FileReader = NodeFileReader;
}

export async function fixtureGlb(suit?: string): Promise<ArrayBuffer> {
  ensureFileReader();
  const { scene, animations } = buildFixture(suit);
  const out = await new GLTFExporter().parseAsync(scene, { binary: true, animations, onlyVisible: false });
  return out as ArrayBuffer;
}
