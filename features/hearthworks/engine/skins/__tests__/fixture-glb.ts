/**
 * Export the fixture character to a real binary glTF (GLB) in node, so tests and the browser harness load it through
 * the same GLTFLoader path as a shipped model.
 */

import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { AnimationClip } from 'three';
import { buildFixture } from './fixture-model';

/** GLTFExporter reads its Blob back with FileReader, which node does not have. */
function ensureFileReader(): void {
  if (
    typeof (
      globalThis as {
        FileReader?: unknown;
      }
    )
      .FileReader ===
    'function'
  )
    return;
  class NodeFileReader {
    result:
      | ArrayBuffer
      | string
      | null =
      null;
    onloadend:
      | (() => void)
      | null =
      null;
    onerror:
      | ((
          e: unknown,
        ) => void)
      | null =
      null;
    readAsArrayBuffer(
      blob: Blob,
    ) {
      blob
        .arrayBuffer()
        .then(
          (
            r,
          ) => {
            this.result =
              r;
            this.onloadend?.();
          },
          (
            e,
          ) =>
            this.onerror?.(
              e,
            ),
        );
    }
    readAsDataURL(
      blob: Blob,
    ) {
      blob
        .arrayBuffer()
        .then(
          (
            r,
          ) => {
            this.result = `data:${blob.type};base64,${Buffer.from(r).toString('base64')}`;
            this.onloadend?.();
          },
          (
            e,
          ) =>
            this.onerror?.(
              e,
            ),
        );
    }
  }
  (
    globalThis as {
      FileReader?: unknown;
    }
  ).FileReader =
    NodeFileReader;
}

/** The fixture character as a model channel's MESH GLB: skeleton and geometry, no animations (those are in the pack). */
export async function fixtureGlb(
  suit?: string,
): Promise<ArrayBuffer> {
  ensureFileReader();
  const {
    scene,
  } =
    buildFixture(
      suit,
    );
  const out =
    await new GLTFExporter().parseAsync(
      scene,
      {
        binary: true,
        animations:
          [],
        onlyVisible: false,
      },
    );
  return out as ArrayBuffer;
}

/** Rewrite a GLB's JSON chunk (the binary chunk is carried over untouched). */
export function patchGlbJson(
  glb: ArrayBuffer,
  patch: (
    json: Record<
      string,
      unknown
    >,
  ) => void,
): ArrayBuffer {
  const view =
    new DataView(
      glb,
    );
  const jsonLen =
    view.getUint32(
      12,
      true,
    );
  const json =
    JSON.parse(
      new TextDecoder().decode(
        new Uint8Array(
          glb,
          20,
          jsonLen,
        ),
      ),
    ) as Record<
      string,
      unknown
    >;
  patch(
    json,
  );
  const enc =
    new TextEncoder().encode(
      JSON.stringify(
        json,
      ),
    );
  const jsonChunk =
    enc.length +
    ((4 -
      (enc.length %
        4)) %
      4);
  const rest =
    new Uint8Array(
      glb,
      20 +
        jsonLen,
    );
  const out =
    new Uint8Array(
      20 +
        jsonChunk +
        rest.length,
    );
  const ov =
    new DataView(
      out.buffer,
    );
  out.set(
    new Uint8Array(
      glb,
      0,
      20,
    ),
  );
  ov.setUint32(
    8,
    out.length,
    true,
  );
  ov.setUint32(
    12,
    jsonChunk,
    true,
  );
  out.fill(
    0x20,
    20,
    20 +
      jsonChunk,
  );
  out.set(
    enc,
    20,
  );
  out.set(
    rest,
    20 +
      jsonChunk,
  );
  return out.buffer;
}

/**
 * An anim pack in the shape of the model channel's: the skeleton and a lot of animations, each with its `extras`
 * (fps, frames, delta, ...). `clips` are the ones a test cares about (`extras` by clip name); `junk` more are added
 * that the game never plays. Bone animations are exported by name, like the channel's.
 */
export async function packGlb(
  clips: AnimationClip[],
  extras: Record<
    string,
    Record<
      string,
      unknown
    >
  > = {},
  junk = 40,
): Promise<ArrayBuffer> {
  ensureFileReader();
  const {
    scene,
    animations,
  } =
    buildFixture();
  const noise =
    Array.from(
      {
        length:
          junk,
      },
      (
        _,
        i,
      ) => {
        const c =
          animations[
            i %
              animations.length
          ].clone();
        c.name = `junk_${i}`;
        return c;
      },
    );
  const out =
    (await new GLTFExporter().parseAsync(
      scene,
      {
        binary: true,
        animations:
          [
            ...clips,
            ...noise,
          ],
        onlyVisible: false,
      },
    )) as ArrayBuffer;
  return patchGlbJson(
    out,
    (
      json,
    ) => {
      for (const a of (json.animations ??
        []) as Array<{
        name: string;
        extras?: unknown;
      }>) {
        a.extras =
          {
            fps: 30,
            frames: 31,
            looping: false,
            delta: false,
            ...(extras[
              a
                .name
            ] ??
              {}),
          };
      }
      // The channel's pack carries its whole sequence table in the scene extras: dead weight for us.
      json.scenes =
        (
          json.scenes as Array<
            Record<
              string,
              unknown
            >
          >
        ).map(
          (
            s,
          ) => ({
            ...s,
            extras:
              {
                sequences:
                  new Array(
                    500,
                  ).fill(
                    {
                      name: 'x'.repeat(
                        40,
                      ),
                    },
                  ),
              },
          }),
        );
    },
  );
}
