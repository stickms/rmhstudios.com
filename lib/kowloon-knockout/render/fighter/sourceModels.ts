// ============================================================
// Loading Source-engine fighter GLBs from R2 (via the site's asset routes).
//
// One cached promise per model id so two seats using the same character share a
// download and a parse. The cache holds the parsed glTF only; every seat clones
// its own skeleton (SourceFighter). `clearSourceModel` drops a failed entry so a
// retry is a real retry.
// ============================================================
import type { AnimationClip } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Tf2GLTFLoader } from '@/lib/tf2-loadout/gltf-loader';
import { MODEL_BUILDER_VERSION } from '@/lib/tf2-loadout/model-sync';
import { api } from '@/lib/contract/client';
import {
  getTf2AnimIndexApi,
  type Tf2AnimIndex,
} from '@/lib/tf2-loadout/models.contract';
import { gameAssetApi } from '@/lib/tf2-game/assets/urls';
import {
  modelSources,
  type FighterModelDef,
  type MdlGame,
  type SourceGame,
} from './models';

let loader: Tf2GLTFLoader | null =
  null;
const getLoader =
  () =>
    (loader ??=
      new Tf2GLTFLoader());

const cache =
  new Map<
    string,
    Promise<GLTF>
  >();
const mdlIndexCache =
  new Map<
    SourceGame,
    Promise<Record<
      string,
      {
        glb?: string;
      }
    > | null>
  >();

/** `mdl/index.json` of a game channel: lower-case MDL path -> entry. Null when unavailable. */
export function loadMdlIndex(
  game: SourceGame,
): Promise<Record<
  string,
  {
    glb?: string;
  }
> | null> {
  let p =
    mdlIndexCache.get(
      game,
    );
  if (
    !p
  ) {
    p =
      fetch(
        `${gameAssetApi(game)}mdl/index.json`,
      )
        .then(
          (
            r,
          ) =>
            r.ok
              ? (r.json() as Promise<
                  Record<
                    string,
                    {
                      glb?: string;
                    }
                  >
                >)
              : null,
        )
        .catch(
          () =>
            null,
        );
    mdlIndexCache.set(
      game,
      p,
    );
  }
  return p;
}

export const tf2BodyUrl =
  (
    cls: string,
  ): string =>
    `/api/tf2-loadout/models/class_${cls}.glb?v=${MODEL_BUILDER_VERSION}`;

async function resolveUrl(
  def: FighterModelDef,
): Promise<string> {
  if (
    def.game ===
    'tf2'
  )
    return tf2BodyUrl(
      def.tf2Class!,
    );
  if (
    def.game ===
    'ybot'
  )
    throw new Error(
      'ybot is not a Source model',
    );
  // The first game channel (then MDL path) whose index lists it.
  const sources =
    modelSources(
      def,
    );
  const indexes =
    new Map<
      MdlGame,
      Record<
        string,
        {
          glb?: string;
        }
      > | null
    >();
  for (const {
    game,
  } of sources)
    if (
      !indexes.has(
        game,
      )
    )
      indexes.set(
        game,
        await loadMdlIndex(
          game,
        ),
      );
  for (const {
    game,
    mdl,
  } of sources) {
    const entry =
      indexes.get(
        game,
      )?.[
        mdl
      ];
    if (
      !entry?.glb
    )
      continue;
    const path =
      entry.glb.startsWith(
        'mdl/',
      )
        ? entry.glb
        : `mdl/${entry.glb}`;
    return (
      gameAssetApi(
        game,
      ) +
      path
    );
  }
  throw new Error(
    `${def.id}: not in the ${[...indexes.keys()].join('/')} model index`,
  );
}

export function loadSourceModel(
  def: FighterModelDef,
): Promise<GLTF> {
  let p =
    cache.get(
      def.id,
    );
  if (
    !p
  ) {
    p =
      resolveUrl(
        def,
      ).then(
        (
          url,
        ) =>
          getLoader().loadAsync(
            url,
          ),
      );
    cache.set(
      def.id,
      p,
    );
    p.catch(
      () => {
        if (
          cache.get(
            def.id,
          ) ===
          p
        )
          cache.delete(
            def.id,
          );
      },
    );
  }
  return p;
}

export function clearSourceModel(
  id: string,
): void {
  cache.delete(
    id,
  );
}

// ---- TF2 native animations (the game's own sequences) ----------------------

let animIndex: Promise<Tf2AnimIndex | null> | null =
  null;
const loadAnimIndex =
  (): Promise<Tf2AnimIndex | null> =>
    (animIndex ??=
      api(
        getTf2AnimIndexApi,
        {
          query:
            {
              v: MODEL_BUILDER_VERSION,
            },
        },
      ).catch(
        () =>
          null,
      ));

/** First of `prefer` the class has. Pure, tested. */
export function pickNativeClip(
  available:
    | readonly string[]
    | undefined,
  prefer: readonly string[],
):
  | string
  | null {
  if (
    !available
  )
    return null;
  return (
    prefer.find(
      (
        p,
      ) =>
        available.includes(
          p,
        ),
    ) ??
    null
  );
}

const NATIVE_PREFER =
  {
    walk: [
      'run_melee',
      'run_primary',
      'run_secondary',
    ],
  } as const;

const clipCache =
  new Map<
    string,
    Promise<AnimationClip | null>
  >();

/** The game's own run clip for a TF2 class, or null (older sync, or the class lacks it). */
export function loadTf2NativeWalk(
  cls: string,
): Promise<AnimationClip | null> {
  let p =
    clipCache.get(
      cls,
    );
  if (
    !p
  ) {
    p =
      (async () => {
        const index =
          await loadAnimIndex();
        const name =
          pickNativeClip(
            index
              ?.clips[
              cls
            ],
            NATIVE_PREFER.walk,
          );
        if (
          !name
        )
          return null;
        const gltf =
          await getLoader().loadAsync(
            `/api/tf2-loadout/models/anim_${cls}_${name}.glb?v=${MODEL_BUILDER_VERSION}`,
          );
        return (
          gltf
            .animations[0] ??
          null
        );
      })().catch(
        () =>
          null,
      );
    clipCache.set(
      cls,
      p,
    );
  }
  return p;
}
