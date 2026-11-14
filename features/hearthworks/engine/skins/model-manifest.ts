/**
 * The manifest of skinned character models (features/hearthworks/engine/skins/models.manifest.json) and everything that can be
 * decided from it without touching WebGL: which skins have a model, where it lives, which animation plays for a
 * logical clip, and what to play when a model lacks a clip. The contract is documented in docs/hearthworks-models.md.
 *
 * Manifest v2 commits no model data. An entry names a REMOTE source: a model path (`game` + `mdl`) in the site's own
 * Steam-sourced asset channels (Cloudflare R2, see docs/tf2-game.md "Game assets"), the skin (material) family of that
 * model, and which of the model's Source sequences play for each gameplay clip. The loader resolves the files through
 * the channel's `mdl/index.json` (model-index.ts).
 *
 * Every failure here means "no models": a missing, unreachable or malformed manifest, or a bad entry in it, must
 * never throw and never stop the procedural figure from drawing.
 */

import { z } from 'zod';
import bundledManifest from './models.manifest.json';
import type { GameId } from '@/lib/tf2-game/assets/versions';
import {
  isSkinId,
  type SkinId,
} from './catalog';

export const CLIP_SLOTS =
  [
    'idle',
    'walk',
    'run',
    'jump',
    'fall',
    'shoot',
    'reload',
    'hurt',
    'death',
    'interact',
  ] as const;
export type ClipSlot =
  (typeof CLIP_SLOTS)[number];

/** Clips that play once on top of whatever the body is doing. */
export const ONE_SHOT_SLOTS =
  [
    'shoot',
    'reload',
    'hurt',
    'interact',
  ] as const;
export type OneShotSlot =
  (typeof ONE_SHOT_SLOTS)[number];

/** What stands in for a clip a model does not have, best first. `idle` is required, so every chain ends there. */
export const CLIP_FALLBACKS: Record<
  ClipSlot,
  readonly ClipSlot[]
> =
  {
    idle: [
      'idle',
    ],
    walk: [
      'walk',
      'idle',
    ],
    run: [
      'run',
      'walk',
      'idle',
    ],
    jump: [
      'jump',
      'idle',
    ],
    fall: [
      'fall',
      'idle',
    ],
    shoot:
      [
        'shoot',
        'idle',
      ],
    reload:
      [
        'reload',
        'idle',
      ],
    hurt: [
      'hurt',
      'idle',
    ],
    death:
      [
        'death',
        'hurt',
        'idle',
      ],
    interact:
      [
        'interact',
        'idle',
      ],
  };

const animName =
  z
    .string()
    .min(
      1,
    )
    .max(
      200,
    );

/**
 * Which Source sequence plays for a gameplay clip: its glTF animation name in the model's anim pack, as a bare string
 * or with a frame window. A member of a blend set is named with its cell, `walk_all@4`; the cell that walks FORWARD
 * is the one whose `movement` vector (Source units) points along +X, which is also what `move_yaw = 0` selects.
 */
export const clipSpecSchema =
  z
    .union(
      [
        animName,
        z.object(
          {
            clip: animName,
            /** `[first, last]` source frames to keep (30 fps): a knock-down borrowed from the middle of a longer sequence. */
            trim: z
              .tuple(
                [
                  z
                    .number()
                    .int()
                    .min(
                      0,
                    )
                    .max(
                      100_000,
                    ),
                  z
                    .number()
                    .int()
                    .min(
                      1,
                    )
                    .max(
                      100_000,
                    ),
                ],
              )
              .refine(
                ([
                  a,
                  b,
                ]) =>
                  b >
                  a,
                'trim must end after it starts',
              )
              .optional(),
          },
        ),
      ],
    )
    .transform(
      (
        v,
      ): ClipSpec =>
        typeof v ===
        'string'
          ? {
              clip: v,
            }
          : v,
    );

export interface ClipSpec {
  clip: string;
  trim?: [
    number,
    number,
  ];
}

const optionalClip =
  clipSpecSchema
    .nullish()
    .transform(
      (
        v,
      ) =>
        v ??
        undefined,
    )
    .optional();

const vec3 =
  z.tuple(
    [
      z
        .number()
        .finite(),
      z
        .number()
        .finite(),
      z
        .number()
        .finite(),
    ],
  );

const clipsSchema =
  z.object(
    {
      idle: clipSpecSchema,
      walk: clipSpecSchema,
      run: optionalClip,
      jump: optionalClip,
      fall: optionalClip,
      shoot:
        optionalClip,
      reload:
        optionalClip,
      hurt: optionalClip,
      death:
        optionalClip,
      interact:
        optionalClip,
    },
  );

/** The asset channels (lib/tf2-game/assets/versions.ts GAME_IDS; a test keeps the two lists equal). Types only from there, so this module stays light. */
export const MODEL_GAMES =
  [
    'tf2',
    'hl2',
    'portal',
    'csgo',
  ] as const satisfies readonly GameId[];
const gameId =
  z.enum(
    MODEL_GAMES,
  );

/** A model path in the game's `mdl/index.json`: lower-case, forward slashes, ends in `.mdl`. Never a URL. */
const mdlPath =
  z
    .string()
    .regex(
      /^models\/[a-z0-9_./-]{1,200}\.mdl$/,
    );

export const modelEntrySchema =
  z.object(
    {
      /** Which asset channel holds the model: `tf2` | `hl2` | `portal` | `csgo`. */
      game: gameId,
      mdl: mdlPath,
      /** Skin (material) family of the model: TF2 RED = 0, BLU = 1. */
      skin: z
        .number()
        .int()
        .min(
          0,
        )
        .max(
          63,
        )
        .default(
          0,
        ),
      /** Metres the model stands. Omitted: measured from the posed model at load. */
      height:
        z
          .number()
          .finite()
          .positive()
          .max(
            100,
          )
          .optional(),
      /** Radians added to face +Z (models from the channels already do). */
      yaw: z
        .number()
        .finite()
        .default(
          0,
        ),
      /** The right-hand bone, as named in the GLB (`valvebiped.bip01_r_hand`, `bip_hand_r`), or null. */
      handBone:
        z
          .string()
          .min(
            1,
          )
          .max(
            200,
          )
          .nullable()
          .default(
            null,
          ),
      provenance:
        z.literal(
          'steam-r2',
        ),
      /** Free text kept for people reading the file: which Source model this skin is and why. */
      note: z
        .string()
        .max(
          300,
        )
        .optional(),
      clips:
        clipsSchema,
      /**
       * Optional: extra offset for a prop held in the hand, applied after the prop is aligned to the model's own axes.
       * `pos` is in world units, `rot` in radians (XYZ).
       */
      hold: z
        .object(
          {
            pos: vec3.optional(),
            rot: vec3.optional(),
          },
        )
        .optional(),
    },
  );

/** A skin that has no source model in any channel: keeps its procedural stand-in. Nothing to load. */
export const standInSchema =
  z.object(
    {
      provenance:
        z.literal(
          'stand-in',
        ),
      reason:
        z
          .string()
          .max(
            300,
          )
          .optional(),
    },
  );

export type ModelEntry =
  z.infer<
    typeof modelEntrySchema
  >;
export type ClipSpecs =
  ModelEntry['clips'];

/** Clip names inside the loaded model: what the animator is handed. The loader renames each kept clip to its slot. */
export type ClipNames =
  {
    idle: string;
    walk: string;
  } & Partial<
    Record<
      Exclude<
        ClipSlot,
        | 'idle'
        | 'walk'
      >,
      string
    >
  >;

export interface Manifest {
  version: 2;
  models: Partial<
    Record<
      SkinId,
      ModelEntry
    >
  >;
  /** Skins the manifest says have no source model (they keep the procedural figure). */
  standIns: SkinId[];
}

export const EMPTY_MANIFEST: Manifest =
  Object.freeze(
    {
      version: 2,
      models:
        Object.freeze(
          {},
        ),
      standIns:
        Object.freeze(
          [],
        ),
    },
  ) as unknown as Manifest;

/**
 * Untrusted JSON → a manifest holding only the entries that are valid and name a skin in the catalog. A wrong
 * version (including the retired v1 file manifest), a non-object, or garbage gives the empty manifest; one bad entry
 * drops that entry only.
 */
export function parseManifest(
  json: unknown,
): Manifest {
  if (
    typeof json !==
      'object' ||
    json ===
      null
  )
    return EMPTY_MANIFEST;
  const raw =
    json as {
      version?: unknown;
      models?: unknown;
    };
  if (
    raw.version !==
      2 ||
    typeof raw.models !==
      'object' ||
    raw.models ===
      null ||
    Array.isArray(
      raw.models,
    )
  )
    return EMPTY_MANIFEST;
  const models: Partial<
    Record<
      SkinId,
      ModelEntry
    >
  > =
    {};
  const standIns: SkinId[] =
    [];
  for (const [
    id,
    value,
  ] of Object.entries(
    raw.models,
  )) {
    if (
      !isSkinId(
        id,
      )
    )
      continue;
    const parsed =
      modelEntrySchema.safeParse(
        value,
      );
    if (
      parsed.success
    ) {
      models[
        id
      ] =
        parsed.data;
      continue;
    }
    if (
      standInSchema.safeParse(
        value,
      )
        .success
    )
      standIns.push(
        id,
      );
  }
  return {
    version: 2,
    models,
    standIns,
  };
}

/** The animation names a manifest entry asks for, one per slot it fills. */
export function clipNamesOf(
  entry: Pick<
    ModelEntry,
    'clips'
  >,
): Record<
  string,
  string
> {
  const out: Record<
    string,
    string
  > =
    {};
  for (const slot of CLIP_SLOTS) {
    const spec =
      entry
        .clips[
        slot
      ];
    if (
      spec
    )
      out[
        slot
      ] =
        spec.clip;
  }
  return out;
}

export interface ResolvedClip {
  /** The logical clip that was actually found (`walk` when `run` was asked for and missing). */
  slot: ClipSlot;
  /** The animation's name inside the loaded model. */
  animation: string;
}

/**
 * The animation to play for a logical clip, following the fallback chain. `entry.clips` holds the animation name per
 * slot (the loaded model's, where every kept clip is named after its slot). When `available` (the animation names that
 * really exist) is given, a name the model does not contain counts as missing too.
 * `idle` is required, so this always answers; if even idle is not in `available` the answer is still idle's name,
 * and the caller (the loader) is expected to have refused such a model.
 */
export function resolveClip(
  entry: {
    clips: Partial<
      Record<
        ClipSlot,
        string
      >
    >;
  },
  clip: ClipSlot,
  available?: ReadonlySet<string>,
): ResolvedClip {
  for (const slot of CLIP_FALLBACKS[
    clip
  ]) {
    const animation =
      entry
        .clips[
        slot
      ];
    if (
      animation &&
      (!available ||
        available.has(
          animation,
        ))
    )
      return {
        slot,
        animation,
      };
  }
  return {
    slot: 'idle',
    animation:
      entry
        .clips
        .idle ??
      'idle',
  };
}

/** True when the entry has a real clip for this slot (not a fallback). */
export function hasClip(
  entry: {
    clips: Partial<
      Record<
        ClipSlot,
        string
      >
    >;
  },
  clip: ClipSlot,
  available?: ReadonlySet<string>,
): boolean {
  return (
    resolveClip(
      entry,
      clip,
      available,
    )
      .slot ===
    clip
  );
}

/** The two clips every model must have; without them the model cannot be shown. */
export function missingRequiredClips(
  entry: {
    clips: Partial<
      Record<
        ClipSlot,
        string
      >
    >;
  },
  available: ReadonlySet<string>,
): ClipSlot[] {
  const out: ClipSlot[] =
    [];
  for (const slot of [
    'idle',
    'walk',
  ] as const) {
    const name =
      entry
        .clips[
        slot
      ];
    if (
      !name ||
      !available.has(
        name,
      )
    )
      out.push(
        slot,
      );
  }
  return out;
}

export type { GameId };

// --- the bundled manifest -------------------------------------------------------------------------------------------

/**
 * The manifest ships INSIDE the app bundle (it is a few KB), not as a file under `public/`. `public/models/` is an
 * R2-hosted static directory (lib/storage/asset.ts): production serves nothing at `/models/...` from the app origin,
 * so a runtime fetch of it failed and every skin silently stayed procedural. Bundling also removes a request from
 * the critical path of the first figure.
 */
let current: Manifest =
  parseManifest(
    bundledManifest,
  );

type Listener =
  () => void;
const listeners =
  new Set<Listener>();

/** The manifest, already available (async only so callers need not change). Never rejects. */
export function loadManifest(): Promise<Manifest> {
  return Promise.resolve(
    current,
  );
}

/** The manifest. Stable between changes, for `useSyncExternalStore`. */
export function getManifest(): Manifest {
  return current;
}

export function subscribeManifest(
  listener: Listener,
): () => void {
  listeners.add(
    listener,
  );
  return () =>
    void listeners.delete(
      listener,
    );
}

/** Test seam: replace the manifest (default: the bundled one). */
export function resetManifestForTests(
  next: Manifest = parseManifest(
    bundledManifest,
  ),
): void {
  current =
    next;
  for (const l of [
    ...listeners,
  ])
    l();
}
