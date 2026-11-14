import {
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  ballotByState,
  statewideFirst,
} from '@/lib/elections/ballot-map';
import {
  STATE_CODES,
  stateName,
} from '@/lib/elections/states';
import {
  TileGrid,
  type TileCell,
} from './TileGrid';
import {
  MeasureCard,
  useMeasures,
} from './BallotMeasures';
import {
  OfficeCard,
  useOffices,
} from './OtherOffices';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

/**
 * "Pick your state": a tile map where every state with measures or local races is lit; selecting one lists that
 * state's ballot measures and local races together, so tracking your own ballot is one click.
 */
export function StateBallot({
  cycle,
  live,
  selected,
  onSelect,
}: {
  cycle: string;
  live: boolean;
  selected:
    | string
    | null;
  onSelect: (
    postal:
      | string
      | null,
  ) => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-elections',
    );
  const [
    all,
    setAll,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );
  const mapRef =
    useRef<HTMLDivElement | null>(
      null,
    );
  const drawerRef =
    useRef<HTMLElement | null>(
      null,
    );
  const meas =
    useMeasures(
      cycle,
      live,
    );
  const offs =
    useOffices(
      cycle,
      live,
    );
  const by =
    useMemo(
      () =>
        ballotByState(
          meas
            .data
            ?.measures ??
            [],
          offs
            .data
            ?.races ??
            [],
        ),
      [
        meas.data,
        offs.data,
      ],
    );

  const cells =
    useMemo(() => {
      const out =
        new Map<
          string,
          TileCell
        >();
      for (const code of STATE_CODES) {
        const e =
          by.get(
            code,
          );
        if (
          !e
        ) {
          out.set(
            code,
            {
              tone: 'none',
              caption:
                '',
              label: `${stateName(code)}: ${t('ballot.nothing', { defaultValue: 'no measures or local races' })}`,
            },
          );
          continue;
        }
        out.set(
          code,
          {
            tone: e.live
              ? 'DEM'
              : 'unrated',
            caption: `${e.measures.length}·${e.others.length}`,
            label:
              t(
                'ballot.tileAria',
                {
                  defaultValue:
                    '{{state}}: {{m}} ballot measures, {{o}} local races',
                  state:
                    stateName(
                      code,
                    ),
                  m: e
                    .measures
                    .length,
                  o: e
                    .others
                    .length,
                },
              ),
          },
        );
      }
      return out;
    }, [
      by,
      t,
    ]);
  const arrival =
    useArrival(
      !(
        (meas.isLoading ||
          offs.isLoading) &&
        !by.size
      ),
    );

  if (
    (meas.isLoading ||
      offs.isLoading) &&
    !by.size
  )
    return (
      <div
        className="el-box el-skel"
        aria-busy
      />
    );
  if (
    !by.size
  ) {
    return (
      <p
        className={cn(
          'el-eyebrow',
          arrival,
        )}
      >
        {t(
          'ballot.none',
          {
            defaultValue:
              'No ballot measures or local races are published for this election yet.',
          },
        )}
      </p>
    );
  }

  // On a narrow screen the details sit below the map: bring them into view on selection, and offer a way back.
  const pick =
    (
      p: string,
    ) => {
      const next =
        selected ===
        p
          ? null
          : p;
      onSelect(
        next,
      );
      if (
        next &&
        typeof window !==
          'undefined' &&
        window.matchMedia(
          '(max-width: 999px)',
        )
          .matches
      ) {
        window.setTimeout(
          () =>
            drawerRef.current?.scrollIntoView(
              {
                behavior:
                  'smooth',
                block:
                  'start',
              },
            ),
          60,
        );
      }
    };
  const entry =
    selected
      ? by.get(
          selected,
        )
      : undefined;
  const LIMIT = 8;
  const expanded =
    all ===
    selected;
  const measures =
    entry
      ? statewideFirst(
          entry.measures,
        )
      : [];
  const others =
    entry
      ? statewideFirst(
          entry.others,
        )
      : [];

  return (
    <div
      className={cn(
        'el-map',
        arrival,
      )}
    >
      <div
        ref={
          mapRef
        }
      >
        <TileGrid
          cells={
            cells
          }
          selected={
            selected
          }
          onSelect={
            pick
          }
          ariaLabel={t(
            'ballot.aria',
            {
              defaultValue:
                'Map of states. Select a state for its ballot measures and local races.',
            },
          )}
        />
        <div
          className="el-legend"
          aria-hidden
        >
          <span>
            <i
              style={{
                background:
                  'var(--el-dem)',
              }}
            />
            {t(
              'ballot.lLive',
              {
                defaultValue:
                  'Results coming in',
              },
            )}
          </span>
          <span>
            <i
              style={{
                background:
                  'var(--el-paper-2)',
              }}
            />
            {t(
              'ballot.lWait',
              {
                defaultValue:
                  'On the ballot, awaiting polls',
              },
            )}
          </span>
          <span>
            <i
              style={{
                background:
                  'transparent',
                borderStyle:
                  'dashed',
              }}
            />
            {t(
              'ballot.lNone',
              {
                defaultValue:
                  'None published',
              },
            )}
          </span>
        </div>
        <p
          className="el-eyebrow"
          style={{
            marginTop: 8,
          }}
        >
          {t(
            'ballot.how',
            {
              defaultValue:
                'Each tile: ballot measures · local races.',
            },
          )}
        </p>
      </div>

      <aside
        ref={
          drawerRef
        }
        className="el-drawer el-box el-ballot__drawer"
        aria-live="polite"
      >
        {selected ? (
          <div className="el-stack">
            <button
              type="button"
              className="el-btn el-btn--sm el-btn--ghost el-ballot__back"
              onClick={() =>
                mapRef.current?.scrollIntoView(
                  {
                    behavior:
                      'smooth',
                    block:
                      'start',
                  },
                )
              }
            >
              <ArrowUp
                size={
                  14
                }
                aria-hidden
              />
              {t(
                'ballot.back',
                {
                  defaultValue:
                    'Pick another state',
                },
              )}
            </button>
            <h3 className="el-drawer__title">
              {stateName(
                selected,
              )}
            </h3>
            {!entry ? (
              <p className="el-eyebrow">
                {t(
                  'ballot.noneHere',
                  {
                    defaultValue:
                      'No ballot measures or local races published for this state.',
                  },
                )}
              </p>
            ) : (
              <>
                <p className="el-eyebrow">
                  {t(
                    'ballot.summary',
                    {
                      defaultValue:
                        '{{m}} ballot measures · {{o}} local races',
                      m: measures.length,
                      o: others.length,
                    },
                  )}
                </p>
                {measures.length ? (
                  <h4 className="el-league__name">
                    {t(
                      'ballot.measures',
                      {
                        defaultValue:
                          'Ballot measures',
                      },
                    )}
                  </h4>
                ) : null}
                {(expanded
                  ? measures
                  : measures.slice(
                      0,
                      LIMIT,
                    )
                ).map(
                  (
                    m,
                  ) => (
                    <MeasureCard
                      key={
                        m.id
                      }
                      m={
                        m
                      }
                    />
                  ),
                )}
                {others.length ? (
                  <h4 className="el-league__name">
                    {t(
                      'ballot.local',
                      {
                        defaultValue:
                          'Local races',
                      },
                    )}
                  </h4>
                ) : null}
                {(expanded
                  ? others
                  : others.slice(
                      0,
                      LIMIT,
                    )
                ).map(
                  (
                    r,
                  ) => (
                    <OfficeCard
                      key={
                        r.id
                      }
                      r={
                        r
                      }
                    />
                  ),
                )}
                {!expanded &&
                (measures.length >
                  LIMIT ||
                  others.length >
                    LIMIT) ? (
                  <button
                    type="button"
                    className="el-btn"
                    onClick={() =>
                      setAll(
                        selected,
                      )
                    }
                  >
                    {t(
                      'ballot.showAll',
                      {
                        defaultValue:
                          'Show everything on this ballot',
                      },
                    )}
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <div className="el-stack">
            <h3 className="el-drawer__title">
              {t(
                'ballot.pick',
                {
                  defaultValue:
                    'Pick a state',
                },
              )}
            </h3>
            <p className="el-eyebrow">
              {t(
                'ballot.pickHint',
                {
                  defaultValue:
                    'See every statewide measure, city and county question, and local race on that state’s ballot.',
                },
              )}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
