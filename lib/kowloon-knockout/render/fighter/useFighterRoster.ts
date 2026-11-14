// Which roster models R2 actually holds, fetched once per page load and shared
// by every picker. Every failure is "not available", never an error: the roster
// then offers only the bundled Y-Bot.
import {
  useEffect,
  useState,
} from 'react';
import {
  DEFAULT_FIGHTER_MODEL,
  availableFighterModels,
  type FighterModelDef,
  type ModelAvailability,
} from './models';

type MdlGame =
  | 'hl2'
  | 'portal'
  | 'csgo';
const MDL_GAMES: readonly MdlGame[] =
  [
    'hl2',
    'portal',
    'csgo',
  ];

/** Raw fetch results → `ModelAvailability`. Pure; tolerant of any malformed body. */
export function buildAvailability(
  tf2Body: unknown,
  mdlBodies: Partial<
    Record<
      MdlGame,
      unknown
    >
  >,
): ModelAvailability {
  const ids =
    (
      tf2Body as {
        ids?: unknown;
      } | null
    )
      ?.ids;
  const tf2 =
    Array.isArray(
      ids,
    )
      ? new Set(
          ids.filter(
            (
              x,
            ): x is string =>
              typeof x ===
              'string',
          ),
        )
      : null;
  const mdl: ModelAvailability['mdl'] =
    {};
  for (const game of MDL_GAMES) {
    const body =
      mdlBodies[
        game
      ];
    mdl[
      game
    ] =
      body &&
      typeof body ===
        'object' &&
      !Array.isArray(
        body,
      )
        ? new Set(
            Object.keys(
              body as Record<
                string,
                unknown
              >,
            ).map(
              (
                k,
              ) =>
                k.toLowerCase(),
            ),
          )
        : null;
  }
  return {
    tf2,
    mdl,
  };
}

async function getJson(
  url: string,
): Promise<unknown> {
  try {
    const res =
      await fetch(
        url,
      );
    return res.ok
      ? await res.json()
      : null;
  } catch {
    return null;
  }
}

let pending: Promise<
  FighterModelDef[]
> | null =
  null;

export function loadFighterRoster(): Promise<
  FighterModelDef[]
> {
  pending ??=
    (async () => {
      const [
        tf2,
        hl2,
        portal,
        csgo,
      ] =
        await Promise.all(
          [
            getJson(
              '/api/tf2-loadout/models',
            ),
            ...MDL_GAMES.map(
              (
                g,
              ) =>
                getJson(
                  `/api/${g}-game/assets/mdl/index.json`,
                ),
            ),
          ],
        );
      return availableFighterModels(
        buildAvailability(
          tf2,
          {
            hl2,
            portal,
            csgo,
          },
        ),
      );
    })();
  return pending;
}

/** The roster R2 can serve; just the Y-Bot until the lookup lands. */
export function useFighterRoster(): FighterModelDef[] {
  const [
    roster,
    setRoster,
  ] =
    useState<
      FighterModelDef[]
    >(
      () =>
        availableFighterModels(
          {
            tf2: null,
            mdl: {},
          },
        ),
    );
  useEffect(() => {
    let alive = true;
    void loadFighterRoster().then(
      (
        r,
      ) => {
        if (
          alive
        )
          setRoster(
            r,
          );
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  return roster;
}

/**
 * Whether R2 holds `modelId`: 'unknown' until the lookup lands, then 'yes' / 'no'. The Y-Bot is
 * always 'yes'. Lets the renderer skip a model it already knows is missing instead of
 * attempting the load and throwing.
 */
export function useModelAvailability(
  modelId: string,
):
  | 'unknown'
  | 'yes'
  | 'no' {
  const [
    ids,
    setIds,
  ] =
    useState<ReadonlySet<string> | null>(
      null,
    );
  useEffect(() => {
    let alive = true;
    void loadFighterRoster().then(
      (
        r,
      ) => {
        if (
          alive
        )
          setIds(
            new Set(
              r.map(
                (
                  m,
                ) =>
                  m.id,
              ),
            ),
          );
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  if (
    modelId ===
    DEFAULT_FIGHTER_MODEL
  )
    return 'yes';
  if (
    !ids
  )
    return 'unknown';
  return ids.has(
    modelId,
  )
    ? 'yes'
    : 'no';
}
