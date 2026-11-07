/**
 * The one place `@audio/decode` is imported.
 *
 * ## Why this exists
 *
 * `@audio/decode` is ESM-only (`"type": "module"`), and the jobs worker that
 * charts uploaded songs is bundled by esbuild into **CommonJS** with
 * `--packages=external` (see the `build` script). The repo root is also
 * `"type": "module"`, so esbuild treats our TypeScript as Node-ESM and compiles
 *
 *     import decode from '@audio/decode'
 *
 * into `__toESM(require('@audio/decode'), 1)`. The `1` is "Node mode": it
 * ignores the module's `__esModule` flag and sets `.default` to the whole
 * *namespace object*. `decode(...)` is then `namespace(...)` and throws
 * `TypeError: (0, import_decode.default) is not a function`.
 *
 * That was the reason **every uploaded song's chart failed** in production:
 * `runAnalysis` threw on its first await, recorded `analysisState: 'failed'`,
 * and pg-boss retried it three times to the same end. Nothing failed in dev
 * (`tsx` and Vite both hand over the real default export) or in tests, which is
 * why it lasted.
 *
 * `decodeAudio` finds the function wherever the loader put it: the namespace
 * itself, `.default`, or `.default.default`. It is deliberately tiny and has a
 * test that builds it the way production does (`decode.server.test.ts`).
 */

import * as audioDecode from '@audio/decode';

export interface DecodedAudio {
  channelData: Float32Array[];
  sampleRate: number;
}

type DecodeFn = (source: Uint8Array | ArrayBuffer | Buffer) => Promise<DecodedAudio>;

/** Unwrap `.default` until a function turns up (at most three levels). */
export function resolveDecoder(moduleValue: unknown): DecodeFn {
  let candidate: unknown = moduleValue;
  for (let depth = 0; depth < 4; depth++) {
    if (typeof candidate === 'function') return candidate as DecodeFn;
    candidate = (candidate as { default?: unknown } | null | undefined)?.default;
  }
  throw new Error('@audio/decode did not expose a decode function');
}

let cached: DecodeFn | null = null;

/** Decode any container the upload route accepts (MP3, WAV, OGG, FLAC, Opus, M4A). */
export async function decodeAudio(source: Uint8Array | ArrayBuffer | Buffer): Promise<DecodedAudio> {
  cached ??= resolveDecoder(audioDecode);
  return cached(source);
}
