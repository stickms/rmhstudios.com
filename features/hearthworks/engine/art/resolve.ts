import {
  PROCEDURAL_MODELS,
  type ModelId,
  type ModelSpec,
} from './models';

/** Models that have a Source-engine counterpart in the asset channels. Empty until Phase 2's characters land. */
export const SOURCE_MODEL_MAP: Partial<
  Record<
    ModelId,
    string
  >
> =
  {};

export type ResolvedModel =
  | {
      kind: 'procedural';
      spec: ModelSpec;
    }
  | {
      kind: 'source';
      path: string;
      payload: unknown;
    };

/** Fetches a model from the Valve-derived asset channels (`/api/*-game/assets/`). Rejects if unreachable. */
export async function loadSourceModel(
  path: string,
): Promise<unknown> {
  const res =
    await fetch(
      `/api/hl2-game/assets/${path}`,
    );
  if (
    !res.ok
  )
    throw new Error(
      `source asset unavailable: ${path} (${res.status})`,
    );
  return res.arrayBuffer();
}

/**
 * The one door every renderer uses. A Source model wins where one is mapped and reachable; any failure
 * (channel down, 404, offline) falls back to the original procedural model, so the game always loads.
 */
export async function resolveModel(
  id: ModelId,
  opts: {
    loader?: (
      path: string,
    ) => Promise<unknown>;
    sourceMap?: Partial<
      Record<
        ModelId,
        string
      >
    >;
  } = {},
): Promise<ResolvedModel> {
  const path =
    (opts.sourceMap ??
      SOURCE_MODEL_MAP)[
      id
    ];
  if (
    path
  ) {
    try {
      return {
        kind: 'source',
        path,
        payload:
          await (
            opts.loader ??
            loadSourceModel
          )(
            path,
          ),
      };
    } catch {
      // fall through to the procedural model
    }
  }
  return {
    kind: 'procedural',
    spec: PROCEDURAL_MODELS[
      id
    ],
  };
}
