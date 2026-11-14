import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Link,
  useNavigate,
} from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  MonitorPlay,
  RefreshCw,
} from 'lucide-react';
import { SITE_URL } from '@/lib/seo';
import {
  phaseOf,
  type Cycle,
} from '@/lib/elections/calendar';
import {
  buildFacts,
  deterministicSummary,
  headline,
} from '@/lib/elections/summary';
import type {
  ElectionSnapshot,
  Office,
} from '@/lib/elections/types';
import { Hero } from './Hero';
import { LiquidGlobe } from './LiquidGlobe';
import { chamberLean } from '@/lib/elections/liquid';
import { PathPanel } from './PathPanel';
import { WatchList } from './WatchList';
import { NightTimeline } from './NightTimeline';
import { LeaguePanel } from './LeaguePanel';
import {
  AlertsPanel,
  useAlertPrefs,
  useElectionAlerts,
} from './AlertsPanel';
import { FollowContext } from './FollowContext';
import { MyStates } from './MyStates';
import { NailBiters } from './NailBiters';
import { BallotMeasures } from './BallotMeasures';
import { OtherOffices } from './OtherOffices';
import { StateBallot } from './StateBallot';
import { toggleState } from '@/lib/elections/alerts';
import { BaselineContext } from './BaselineContext';
import { Ticker } from './Ticker';
import { BalanceOfPower } from './BalanceOfPower';
import { StateMap } from './StateMap';
import { RaceExplorer } from './RaceExplorer';
import { PollClosings } from './PollClosings';
import { PredictionPainter } from './PredictionPainter';
import { AiDesk } from './AiDesk';
import {
  BriefingPortrait,
  HOST_NAME,
} from './BriefingPortrait';
import { ElectionChat } from './ElectionChat';
import { WatchParty } from './WatchParty';
import { ShareBar } from './ShareBar';
import { MarketsPanel } from './MarketsPanel';
import { RoomLobby } from './room/RoomLobby';
import { RoomOverlay } from './room/RoomOverlay';
import type { RoomSource } from './room/useRoomState';
import { isRoomCode } from '@/lib/elections/room-config';
import { CalendarPanel } from './CalendarPanel';
import { NewsWire } from './NewsWire';
import {
  timeAgo,
  useBaseline,
  useElectionData,
  useElectionEvents,
  useNow,
  useReveal,
} from './hooks';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

export interface ElectionsPageProps {
  /** The election day the route resolved (from `?cycle=` or "the current one"). */
  cycle: Cycle;
  focusRaceId?: string;
  /** `?room=CODE`: open that watch room on arrival. */
  roomCode?: string;
  /** `?league=CODE`: open that friends league in the Predict section. */
  leagueCode?: string;
  /** `?state=PA`: open that state's races on the map on arrival. */
  focusState?: string;
  /** The cycles the switcher offers, computed server-side so SSR and hydration agree. */
  options: Cycle[];
}

function Section({
  id,
  tone,
  title,
  eyebrow,
  lede,
  children,
}: {
  id: string;
  tone?:
    | 'ink'
    | 'yellow'
    | 'pink';
  title: React.ReactNode;
  eyebrow: string;
  lede?: string;
  children: React.ReactNode;
}) {
  const ref =
    useReveal<HTMLDivElement>();
  return (
    <section
      id={
        id
      }
      className={`el-section${tone ? ` el-section--${tone}` : ''}`}
      aria-labelledby={`${id}-h`}
    >
      <div className="el-wrap">
        <div
          ref={
            ref
          }
          className="el-reveal"
          style={{
            ['--el-r' as string]:
              '-0.4deg',
          }}
        >
          <div className="el-section__head">
            <div>
              <p
                className="el-eyebrow"
                style={{
                  margin:
                    '0 0 10px',
                }}
              >
                <span className="el-chip el-chip--ink">
                  {
                    eyebrow
                  }
                </span>
              </p>
              <h2
                id={`${id}-h`}
                className="el-h2"
              >
                {
                  title
                }
              </h2>
              {lede ? (
                <p className="el-section__lede">
                  {
                    lede
                  }
                </p>
              ) : null}
            </div>
          </div>
          {
            children
          }
        </div>
      </div>
    </section>
  );
}

/**
 * The Briefing Room host standing on the top edge of a block of content, facing it: a parallax cut-out
 * that sits in the header's empty right-hand space on wide screens and in the flow above the block on
 * phones, so it never lies over text. `flip` mirrors a photo that would otherwise look away from the content.
 */
function Host({
  variant,
  flip,
  lead,
  className,
  children,
}: {
  variant: number;
  flip?: boolean;
  className?: string;
  /** Reserves a band above the block for the portrait on wide screens, with this text beside him. */
  lead?: React.ReactNode;
  children: React.ReactNode;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-elections',
    );
  return (
    <div
      className={cn(
        'el-briefing',
        lead
          ? 'el-briefing--reserve'
          : undefined,
        className,
      )}
    >
      {lead ? (
        <div className="el-briefing__lead">
          {
            lead
          }
        </div>
      ) : null}
      <BriefingPortrait
        variant={
          variant
        }
        flip={
          flip
        }
        className="el-briefing__portrait"
        drift={
          28
        }
        caption={`${HOST_NAME} · ${t('portrait.role', { defaultValue: 'Briefing Room host' })}`}
      />
      {
        children
      }
    </div>
  );
}

export function ElectionsPage({
  cycle,
  focusRaceId,
  roomCode,
  leagueCode,
  focusState,
  options,
}: ElectionsPageProps) {
  const {
    t,
  } =
    useTranslation(
      'c-elections',
    );
  const navigate =
    useNavigate();
  const rootRef =
    useRef<HTMLDivElement | null>(
      null,
    );
  const [
    selectedState,
    setSelectedState,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );
  const [
    room,
    setRoom,
  ] =
    useState<RoomSource | null>(
      () => {
        const c =
          roomCode?.toUpperCase();
        return c &&
          isRoomCode(
            c,
          )
          ? {
              kind: 'hosted',
              code: c,
            }
          : null;
      },
    );

  const year =
    cycle.year;
  /** What goes in `?cycle=`: a year for a general election, the date for any other election day. */
  const param =
    cycle.kind ===
    'other'
      ? cycle.date
      : String(
          cycle.year,
        );
  const isGeneral =
    cycle.kind !==
    'other';
  const {
    data,
    isError,
    isFetching,
    refetch,
    dataUpdatedAt,
  } =
    useElectionData(
      param,
    );
  const {
    events,
  } =
    useElectionEvents(
      param,
    );
  const [
    alertPrefs,
    setAlertPrefs,
  ] =
    useAlertPrefs();
  const [
    ballotState,
    setBallotState,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );
  useElectionAlerts(
    events,
    alertPrefs,
  );

  // A live event means the numbers just changed: pull the snapshot now instead of waiting for the next
  // 20-second poll, or a pane would announce "AP calls X" above numbers that still say "awaiting polls".
  const lastLiveEvent =
    useMemo(
      () =>
        [
          ...events,
        ]
          .reverse()
          .find(
            (
              e,
            ) =>
              e.fresh,
          )
          ?.id ??
        null,
      [
        events,
      ],
    );
  const lastRefetch =
    useRef(
      0,
    );
  useEffect(() => {
    if (
      !lastLiveEvent
    )
      return;
    const wait =
      Math.max(
        0,
        4000 -
          (Date.now() -
            lastRefetch.current),
      ); // at most once per 4 s, however many events land
    const id =
      window.setTimeout(
        () => {
          lastRefetch.current =
            Date.now();
          void refetch();
        },
        wait,
      );
    return () =>
      window.clearTimeout(
        id,
      );
  }, [
    lastLiveEvent,
    refetch,
  ]);
  const now =
    useNow(
      15_000,
      data?.serverTime,
    );

  // Reveal + parallax are progressive enhancement: the markup is fully visible until this flips.
  useEffect(() => {
    rootRef.current?.setAttribute(
      'data-animate',
      '',
    );
  }, []);

  const snapshot:
    | ElectionSnapshot
    | undefined =
    data?.snapshot;
  const arrival =
    useArrival(
      !!snapshot,
    );
  const phase =
    data?.phase ??
    phaseOf(
      cycle.date,
    );
  const offices: Office[] =
    useMemo(() => {
      if (
        !snapshot
      )
        return cycle.offices;
      const present =
        cycle.offices.filter(
          (
            o,
          ) =>
            snapshot.races.some(
              (
                r,
              ) =>
                r.office ===
                o,
            ),
        );
      return present.length
        ? present
        : cycle.offices;
    }, [
      snapshot,
      cycle.offices,
    ]);

  const facts =
    useMemo(
      () =>
        snapshot
          ? buildFacts(
              snapshot,
            )
          : null,
      [
        snapshot,
      ],
    );
  const bullets =
    useMemo(
      () =>
        snapshot
          ? deterministicSummary(
              snapshot,
            )
          : [],
      [
        snapshot,
      ],
    );
  const tickerItems =
    useMemo(() => {
      if (
        !snapshot ||
        !facts
      )
        return [];
      const items =
        [
          headline(
            snapshot,
          ),
        ];
      for (const r of facts.flips.slice(
        0,
        4,
      ))
        items.push(
          `Flip · ${r.label} → ${r.leader ?? 'called'}`,
        );
      for (const r of facts.closest.slice(
        0,
        3,
      ))
        items.push(
          `Too close · ${r.label}`,
        );
      if (
        !snapshot.live
      )
        items.push(
          t(
            'ticker.soon',
            {
              defaultValue:
                'Polls open soon',
            },
          ),
        );
      // What just happened beats what is generally true: the latest events lead the strip.
      const recent =
        events
          .filter(
            (
              e,
            ) =>
              e.kind !==
                'polls-closed' ||
              e.importance >
                1,
          )
          .slice(
            -6,
          )
          .reverse()
          .map(
            (
              e,
            ) =>
              e.text,
          );
      return [
        ...recent,
        ...items,
      ];
    }, [
      snapshot,
      facts,
      events,
      t,
    ]);

  const setCycle =
    (
      value: string,
    ) =>
      navigate(
        {
          to: '/elections',
          search:
            (
              s: Record<
                string,
                unknown
              >,
            ) => ({
              ...s,
              cycle:
                value,
              race: undefined,
              p: undefined,
            }),
          replace: true,
        },
      );
  const selectOptions =
    isGeneral
      ? options
      : [
          cycle,
          ...options,
        ];

  /** Open a room and keep the URL shareable: a hosted room is `?room=CODE`. */
  const openRoom =
    (
      source: RoomSource,
    ) => {
      setRoom(
        source,
      );
      navigate(
        {
          to: '/elections',
          search:
            (
              s: Record<
                string,
                unknown
              >,
            ) => ({
              ...s,
              room:
                source.kind ===
                'hosted'
                  ? source.code
                  : undefined,
            }),
          replace: true,
        },
      );
    };
  const closeRoom =
    () => {
      setRoom(
        null,
      );
      navigate(
        {
          to: '/elections',
          search:
            (
              s: Record<
                string,
                unknown
              >,
            ) => ({
              ...s,
              room: undefined,
            }),
          replace: true,
        },
      );
    };

  const share =
    async () => {
      const url = `${location.origin}/elections?cycle=${param}`;
      const text =
        snapshot
          ? headline(
              snapshot,
            )
          : cycle.title;
      try {
        if (
          navigator.share
        )
          await navigator.share(
            {
              title:
                cycle.title,
              text,
              url,
            },
          );
        else
          await navigator.clipboard.writeText(
            url,
          );
      } catch {
        /* dismissed */
      }
    };

  const selectFromElsewhere =
    (
      postal: string,
    ) => {
      setSelectedState(
        postal,
      );
      document
        .getElementById(
          'map',
        )
        ?.scrollIntoView(
          {
            block:
              'start',
          },
        );
    };

  const live =
    snapshot?.live ??
    false;
  const hasData =
    !!snapshot &&
    snapshot
      .races
      .length >
      0;
  const baseline =
    useBaseline(
      param,
    );
  const leans =
    useMemo(
      () => ({
        senate:
          chamberLean(
            'senate',
            snapshot
              ?.chambers
              .senate,
            snapshot?.races ??
              [],
          ),
        house:
          chamberLean(
            'house',
            snapshot
              ?.chambers
              .house,
            snapshot?.races ??
              [],
          ),
      }),
      [
        snapshot,
      ],
    );
  const followValue =
    useMemo(
      () => ({
        states:
          alertPrefs.states,
        toggle:
          (
            postal: string,
          ) =>
            setAlertPrefs(
              {
                ...alertPrefs,
                states:
                  toggleState(
                    alertPrefs.states,
                    postal,
                  ),
              },
            ),
      }),
      [
        alertPrefs,
        setAlertPrefs,
      ],
    );

  // The tab title carries the score, so a pinned tab is a scoreboard.
  useEffect(() => {
    if (
      !snapshot ||
      !snapshot.live
    )
      return;
    const prev =
      document.title;
    document.title = `${headline(snapshot)} | RMH Vote`;
    return () => {
      document.title =
        prev;
    };
  }, [
    snapshot,
  ]);

  // `?state=PA` opens that state on arrival (once the snapshot is in).
  const focused =
    useRef(
      false,
    );
  useEffect(
    () => {
      if (
        focused.current ||
        !focusState ||
        !snapshot
      )
        return;
      focused.current = true;
      selectFromElsewhere(
        focusState.toUpperCase(),
      );
    },
  );

  return (
    <BaselineContext.Provider
      value={
        baseline
      }
    >
      <FollowContext.Provider
        value={
          followValue
        }
      >
        <div
          className="el-root"
          ref={
            rootRef
          }
        >
          <a
            className="el-btn el-sr"
            href="#results"
            style={{
              position:
                'absolute',
            }}
          >
            {t(
              'a11y.skip',
              {
                defaultValue:
                  'Skip to results',
              },
            )}
          </a>

          <header className="el-bar">
            <div className="el-wrap el-bar__in">
              <Link
                to="/"
                className="el-bar__brand"
                aria-label={t(
                  'bar.home',
                  {
                    defaultValue:
                      'RMH Studios home',
                  },
                )}
              >
                <b>
                  RMH
                </b>
                {t(
                  'bar.vote',
                  {
                    defaultValue:
                      'Vote',
                  },
                )}
              </Link>
              <nav
                className="el-bar__nav"
                aria-label={t(
                  'bar.nav',
                  {
                    defaultValue:
                      'Sections',
                  },
                )}
              >
                <a href="#results">
                  {t(
                    'nav.results',
                    {
                      defaultValue:
                        'Results',
                    },
                  )}
                </a>
                <a href="#map">
                  {t(
                    'nav.map',
                    {
                      defaultValue:
                        'Map',
                    },
                  )}
                </a>
                <a href="#races">
                  {t(
                    'nav.races',
                    {
                      defaultValue:
                        'Races',
                    },
                  )}
                </a>
                <a href="#measures">
                  {t(
                    'nav.measures',
                    {
                      defaultValue:
                        'Measures',
                    },
                  )}
                </a>
                <a href="#offices">
                  {t(
                    'nav.offices',
                    {
                      defaultValue:
                        'Local',
                    },
                  )}
                </a>
                <a href="#polls">
                  {t(
                    'nav.polls',
                    {
                      defaultValue:
                        'Polls',
                    },
                  )}
                </a>
                <a href="#wire">
                  {t(
                    'nav.wire',
                    {
                      defaultValue:
                        'Wire',
                    },
                  )}
                </a>
                <a href="#timeline">
                  {t(
                    'nav.timeline',
                    {
                      defaultValue:
                        'Night',
                    },
                  )}
                </a>
                <a href="#live">
                  {t(
                    'nav.live',
                    {
                      defaultValue:
                        'Watch',
                    },
                  )}
                </a>
                <a href="#predict">
                  {t(
                    'nav.predict',
                    {
                      defaultValue:
                        'Predict',
                    },
                  )}
                </a>
              </nav>
              <div className="el-bar__tools">
                {live ? (
                  <span className="el-live">
                    {t(
                      'hero.live',
                      {
                        defaultValue:
                          'LIVE',
                      },
                    )}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="el-btn el-btn--sm el-btn--pink"
                  onClick={() =>
                    openRoom(
                      {
                        kind: 'solo',
                      },
                    )
                  }
                >
                  <MonitorPlay
                    size={
                      14
                    }
                    aria-hidden
                  />{' '}
                  <span className="el-room__lbl">
                    {t(
                      'bar.briefing',
                      {
                        defaultValue:
                          'Briefing Room',
                      },
                    )}
                  </span>
                </button>
                <label
                  className="el-sr"
                  htmlFor="el-cycle"
                >
                  {t(
                    'bar.cycle',
                    {
                      defaultValue:
                        'Election',
                    },
                  )}
                </label>
                <select
                  id="el-cycle"
                  className="el-input"
                  style={{
                    minHeight: 40,
                    padding:
                      '4px 8px',
                  }}
                  value={
                    param
                  }
                  onChange={(
                    e,
                  ) =>
                    setCycle(
                      e
                        .target
                        .value,
                    )
                  }
                >
                  {selectOptions.map(
                    (
                      c,
                    ) => (
                      <option
                        key={
                          c.date
                        }
                        value={
                          c.kind ===
                          'other'
                            ? c.date
                            : String(
                                c.year,
                              )
                        }
                      >
                        {
                          c.shortTitle
                        }
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>
          </header>

          <main>
            <Hero
              cycle={
                cycle
              }
              phase={
                phase
              }
              serverTime={
                data?.serverTime
              }
              racesCalled={
                facts?.racesCalled ??
                0
              }
              racesTotal={
                facts?.racesTotal ??
                0
              }
              onShare={
                share
              }
            />
            <LiquidGlobe
              leans={
                leans
              }
            />
            <Ticker
              label={t(
                'ticker.label',
                {
                  defaultValue:
                    'Election headlines',
                },
              )}
              items={
                tickerItems.length
                  ? tickerItems
                  : [
                      cycle.title,
                      cycle.date,
                    ]
              }
            />

            {isError &&
            !snapshot ? (
              <div
                className="el-wrap"
                style={{
                  paddingBlock: 32,
                }}
              >
                <div
                  className="el-box"
                  style={{
                    padding: 20,
                  }}
                  role="alert"
                >
                  <p
                    className="el-h2"
                    style={{
                      fontSize: 36,
                    }}
                  >
                    {t(
                      'error.title',
                      {
                        defaultValue:
                          'Can’t reach the results feed.',
                      },
                    )}
                  </p>
                  <button
                    type="button"
                    className="el-btn"
                    style={{
                      marginTop: 16,
                    }}
                    onClick={() =>
                      refetch()
                    }
                  >
                    <RefreshCw
                      size={
                        16
                      }
                      aria-hidden
                    />
                    {t(
                      'error.retry',
                      {
                        defaultValue:
                          'Try again',
                      },
                    )}
                  </button>
                </div>
              </div>
            ) : null}

            <Section
              id="results"
              tone="ink"
              eyebrow={t(
                'results.eyebrow',
                {
                  defaultValue:
                    'Balance of power',
                },
              )}
              title={
                <>
                  {t(
                    'results.title1',
                    {
                      defaultValue:
                        'Who’s',
                    },
                  )}{' '}
                  <em>
                    {t(
                      'results.title2',
                      {
                        defaultValue:
                          'winning',
                      },
                    )}
                  </em>
                </>
              }
              lede={
                hasData
                  ? bullets[0]
                  : t(
                      'results.empty',
                      {
                        defaultValue:
                          'The board fills in as each state’s polls report.',
                      },
                    )
              }
            >
              {!snapshot ? (
                <div
                  className="el-box el-skel"
                  aria-busy
                />
              ) : null}
              {snapshot ? (
                <div
                  className={
                    arrival
                  }
                >
                  <BalanceOfPower
                    chambers={
                      snapshot.chambers
                    }
                    live={
                      live
                    }
                    races={
                      snapshot.races
                    }
                  />
                </div>
              ) : null}
              {snapshot &&
              hasData ? (
                <div
                  className={
                    arrival
                  }
                  style={{
                    marginTop: 24,
                  }}
                >
                  <MyStates
                    races={
                      snapshot.races
                    }
                    onSelectState={
                      selectFromElsewhere
                    }
                  />
                </div>
              ) : null}
              {snapshot &&
              hasData ? (
                <div
                  className={
                    arrival
                  }
                  style={{
                    marginTop: 24,
                  }}
                >
                  <NailBiters
                    races={
                      snapshot.races
                    }
                    onSelectState={
                      selectFromElsewhere
                    }
                  />
                </div>
              ) : null}
              {snapshot &&
              hasData ? (
                <div
                  className={
                    arrival
                  }
                  style={{
                    marginTop: 24,
                  }}
                >
                  <PathPanel
                    chambers={
                      snapshot.chambers
                    }
                    races={
                      snapshot.races
                    }
                  />
                </div>
              ) : null}
              {hasData ? (
                <div
                  className={
                    arrival
                  }
                  style={{
                    marginTop: 24,
                  }}
                >
                  <Host
                    variant={
                      3
                    }
                    lead={
                      <>
                        <p className="el-eyebrow">
                          {t(
                            'briefing.leadEyebrow',
                            {
                              defaultValue:
                                'From the Briefing Room',
                            },
                          )}
                        </p>
                        <p className="el-briefing__leadtext">
                          {t(
                            'briefing.lead',
                            {
                              defaultValue:
                                'What changed, in plain English.',
                            },
                          )}
                        </p>
                      </>
                    }
                  >
                    <AiDesk
                      cycle={
                        param
                      }
                      live={
                        live
                      }
                      bullets={
                        bullets
                      }
                    />
                  </Host>
                </div>
              ) : null}
              <p
                className="el-eyebrow"
                style={{
                  marginTop: 18,
                  display:
                    'flex',
                  gap: 10,
                  alignItems:
                    'center',
                }}
              >
                {snapshot ? (
                  <>
                    <span>
                      {t(
                        'results.updated',
                        {
                          defaultValue:
                            'Updated {{ago}}',
                          ago: timeAgo(
                            new Date(
                              dataUpdatedAt,
                            ).toISOString(),
                            now,
                          ),
                        },
                      )}
                    </span>
                    {isFetching ? (
                      <RefreshCw
                        size={
                          12
                        }
                        aria-hidden
                      />
                    ) : null}
                  </>
                ) : null}
              </p>
            </Section>

            <Ticker
              tone="ink"
              label={t(
                'ticker.label',
                {
                  defaultValue:
                    'Election headlines',
                },
              )}
              items={[
                t(
                  'ticker.every',
                  {
                    defaultValue:
                      'Every race',
                  },
                ),
                t(
                  'ticker.every2',
                  {
                    defaultValue:
                      'Every margin',
                  },
                ),
                t(
                  'ticker.every3',
                  {
                    defaultValue:
                      'Every 20 seconds',
                  },
                ),
              ]}
            />

            <Section
              id="map"
              tone="yellow"
              eyebrow={t(
                'map.eyebrow',
                {
                  defaultValue:
                    'State by state',
                },
              )}
              title={
                <>
                  {t(
                    'map.title1',
                    {
                      defaultValue:
                        'The',
                    },
                  )}{' '}
                  <em>
                    {t(
                      'map.title2',
                      {
                        defaultValue:
                          'map',
                      },
                    )}
                  </em>
                </>
              }
              lede={t(
                'map.lede',
                {
                  defaultValue:
                    'Equal tiles, equal weight. Tap a state for every race on its ballot.',
                },
              )}
            >
              {snapshot ? (
                <div
                  className={
                    arrival
                  }
                >
                  <StateMap
                    races={
                      snapshot.races
                    }
                    offices={
                      offices
                    }
                    selected={
                      selectedState
                    }
                    onSelect={
                      setSelectedState
                    }
                  />
                </div>
              ) : (
                <div
                  className="el-box el-skel"
                  aria-busy
                />
              )}
            </Section>

            <Section
              id="races"
              eyebrow={t(
                'races.eyebrow',
                {
                  defaultValue:
                    'Every contest',
                },
              )}
              title={
                <>
                  {t(
                    'races.title1',
                    {
                      defaultValue:
                        'All the',
                    },
                  )}{' '}
                  <em>
                    {t(
                      'races.title2',
                      {
                        defaultValue:
                          'races',
                      },
                    )}
                  </em>
                </>
              }
              lede={t(
                'races.lede',
                {
                  defaultValue:
                    'Filter, search, sort by closest. Calls land as they happen.',
                },
              )}
            >
              {snapshot &&
              hasData ? (
                <Host
                  variant={
                    3
                  }
                  className={
                    arrival
                  }
                >
                  <RaceExplorer
                    races={
                      snapshot.races
                    }
                    offices={
                      offices
                    }
                    focusRaceId={
                      focusRaceId
                    }
                  />
                </Host>
              ) : snapshot ? (
                <p
                  className={cn(
                    'el-h2',
                    arrival,
                  )}
                  style={{
                    fontSize: 36,
                  }}
                >
                  {t(
                    'races.notYet',
                    {
                      defaultValue:
                        'Ballots for this election aren’t published yet.',
                    },
                  )}
                </p>
              ) : (
                <div
                  className="el-box el-skel"
                  aria-busy
                />
              )}
            </Section>

            <Section
              id="measures"
              eyebrow={t(
                'measures.eyebrow',
                {
                  defaultValue:
                    'On your ballot',
                },
              )}
              title={
                <>
                  {t(
                    'measures.title1',
                    {
                      defaultValue:
                        'Ballot',
                    },
                  )}{' '}
                  <em>
                    {t(
                      'measures.title2',
                      {
                        defaultValue:
                          'measures',
                      },
                    )}
                  </em>
                </>
              }
              lede={t(
                'measures.ledeMap',
                {
                  defaultValue:
                    'Pick a state to see its statewide measures, local city and county questions and local races — live yes and no counts and what each needs to pass.',
                },
              )}
            >
              <StateBallot
                cycle={
                  param
                }
                live={
                  live
                }
                selected={
                  ballotState
                }
                onSelect={
                  setBallotState
                }
              />
              <h3
                className="el-drawer__title"
                style={{
                  margin:
                    '40px 0 14px',
                }}
              >
                {t(
                  'ballot.allMeasures',
                  {
                    defaultValue:
                      'All ballot measures',
                  },
                )}
              </h3>
              <BallotMeasures
                cycle={
                  param
                }
                live={
                  live
                }
              />
              <h3
                id="offices"
                className="el-drawer__title"
                style={{
                  margin:
                    '40px 0 14px',
                }}
              >
                {t(
                  'ballot.allLocal',
                  {
                    defaultValue:
                      'All local and down-ballot races',
                  },
                )}
              </h3>
              <OtherOffices
                cycle={
                  param
                }
                live={
                  live
                }
              />
            </Section>

            <Section
              id="polls"
              tone="pink"
              eyebrow={t(
                'polls.eyebrow',
                {
                  defaultValue:
                    'Election night',
                },
              )}
              title={
                <>
                  {t(
                    'polls.title1',
                    {
                      defaultValue:
                        'When polls',
                    },
                  )}{' '}
                  <em>
                    {t(
                      'polls.title2',
                      {
                        defaultValue:
                          'close',
                      },
                    )}
                  </em>
                </>
              }
              lede={t(
                'polls.lede',
                {
                  defaultValue:
                    'Last polls in each state, Eastern time. Results follow within minutes.',
                },
              )}
            >
              {snapshot &&
              hasData ? (
                <div
                  className={
                    arrival
                  }
                  style={{
                    marginBottom: 28,
                  }}
                >
                  <WatchList
                    snapshot={
                      snapshot
                    }
                    now={
                      now
                    }
                    onSelectState={
                      selectFromElsewhere
                    }
                  />
                </div>
              ) : null}
              <Host
                variant={
                  2
                }
              >
                <PollClosings
                  closings={
                    snapshot?.pollClosings ??
                    {}
                  }
                  now={
                    now
                  }
                  onSelectState={
                    selectFromElsewhere
                  }
                />
              </Host>
            </Section>

            <Section
              id="wire"
              eyebrow={t(
                'wire.eyebrow',
                {
                  defaultValue:
                    'Live updates',
                },
              )}
              title={
                <>
                  {t(
                    'wire.title1',
                    {
                      defaultValue:
                        'The',
                    },
                  )}{' '}
                  <em>
                    {t(
                      'wire.title2',
                      {
                        defaultValue:
                          'wire',
                      },
                    )}
                  </em>
                </>
              }
              lede={t(
                'wire.lede',
                {
                  defaultValue:
                    'Headlines from NPR, PBS, Politico, the Guardian and more, as they land.',
                },
              )}
            >
              <Host
                variant={
                  1
                }
                flip
              >
                <NewsWire
                  state={
                    selectedState
                  }
                  live={
                    live
                  }
                />
              </Host>
            </Section>

            <Section
              id="timeline"
              eyebrow={t(
                'timeline.eyebrow',
                {
                  defaultValue:
                    'As it happened',
                },
              )}
              title={
                <>
                  {t(
                    'timeline.title1',
                    {
                      defaultValue:
                        'The',
                    },
                  )}{' '}
                  <em>
                    {t(
                      'timeline.title2',
                      {
                        defaultValue:
                          'night',
                      },
                    )}
                  </em>
                </>
              }
              lede={t(
                'timeline.lede',
                {
                  defaultValue:
                    'Every call, flip and closing poll, in order.',
                },
              )}
            >
              <div
                style={{
                  marginBottom: 20,
                }}
              >
                <AlertsPanel
                  prefs={
                    alertPrefs
                  }
                  onChange={
                    setAlertPrefs
                  }
                />
              </div>
              <Host
                variant={
                  4
                }
              >
                <NightTimeline
                  events={
                    events
                  }
                  onSelectState={
                    selectFromElsewhere
                  }
                />
              </Host>
            </Section>

            <Section
              id="days"
              tone="pink"
              eyebrow={t(
                'days.eyebrow',
                {
                  defaultValue:
                    'Primaries & specials',
                },
              )}
              title={
                <>
                  {t(
                    'days.title1',
                    {
                      defaultValue:
                        'Every',
                    },
                  )}{' '}
                  <em>
                    {t(
                      'days.title2',
                      {
                        defaultValue:
                          'election day',
                      },
                    )}
                  </em>
                </>
              }
              lede={t(
                'days.lede',
                {
                  defaultValue:
                    'Pick a primary, runoff or special election to see its results where a government feed covers it.',
                },
              )}
            >
              {!isGeneral ? (
                <p
                  style={{
                    marginBottom: 20,
                  }}
                >
                  <button
                    type="button"
                    className="el-btn"
                    onClick={() =>
                      setCycle(
                        String(
                          year -
                            (year %
                              2),
                        ),
                      )
                    }
                  >
                    {t(
                      'days.back',
                      {
                        defaultValue:
                          '← Back to the general election',
                      },
                    )}
                  </button>
                </p>
              ) : null}
              <CalendarPanel
                year={
                  year
                }
                current={
                  param
                }
                onOpen={(
                  d,
                ) =>
                  setCycle(
                    d,
                  )
                }
              />
            </Section>

            <Section
              id="live"
              tone="ink"
              eyebrow={t(
                'live.eyebrow',
                {
                  defaultValue:
                    'Together',
                },
              )}
              title={
                <>
                  {t(
                    'live.title1',
                    {
                      defaultValue:
                        'Watch &',
                    },
                  )}{' '}
                  <em>
                    {t(
                      'live.title2',
                      {
                        defaultValue:
                          'talk',
                      },
                    )}
                  </em>
                </>
              }
              lede={t(
                'live.lede',
                {
                  defaultValue:
                    'Put a stream on and argue about it in real time.',
                },
              )}
            >
              <div className="el-map">
                <WatchParty />
                <ElectionChat
                  cycle={
                    param
                  }
                />
              </div>
            </Section>

            <Section
              id="rooms"
              tone="yellow"
              eyebrow={t(
                'rooms.eyebrow',
                {
                  defaultValue:
                    'Split screen',
                },
              )}
              title={
                <>
                  {t(
                    'rooms.briefing1',
                    {
                      defaultValue:
                        'Briefing',
                    },
                  )}{' '}
                  <em>
                    {t(
                      'rooms.briefing2',
                      {
                        defaultValue:
                          'Room',
                      },
                    )}
                  </em>
                </>
              }
              lede={t(
                'rooms.lede',
                {
                  defaultValue:
                    'Full-screen, up to four panes: streams from different services at once, live graphs, the map, the wire and chat. Follow the action automatically or pick your states.',
                },
              )}
            >
              <Host
                variant={
                  2
                }
              >
                <RoomLobby
                  cycle={
                    param
                  }
                  onOpen={
                    openRoom
                  }
                />
              </Host>
            </Section>

            {isGeneral ? (
              <>
                <Section
                  id="predict"
                  eyebrow={t(
                    'predict.eyebrow',
                    {
                      defaultValue:
                        'Call it',
                    },
                  )}
                  title={
                    <>
                      {t(
                        'predict.title1',
                        {
                          defaultValue:
                            'Paint your',
                        },
                      )}{' '}
                      <em>
                        {t(
                          'predict.title2',
                          {
                            defaultValue:
                              'map',
                          },
                        )}
                      </em>
                    </>
                  }
                  lede={t(
                    'predict.lede',
                    {
                      defaultValue:
                        'Make your calls, share the link, get graded as races are called.',
                    },
                  )}
                >
                  {snapshot &&
                  hasData ? (
                    <Host
                      variant={
                        4
                      }
                      className={
                        arrival
                      }
                    >
                      <PredictionPainter
                        year={
                          year
                        }
                        cycle={
                          param
                        }
                        races={
                          snapshot.races
                        }
                        chambers={
                          snapshot.chambers
                        }
                        offices={
                          offices
                        }
                      />
                      <div
                        style={{
                          marginTop: 28,
                        }}
                      >
                        <LeaguePanel
                          year={
                            year
                          }
                          initialCode={
                            leagueCode
                          }
                        />
                      </div>
                      <div
                        style={{
                          marginTop: 28,
                        }}
                      >
                        <p className="el-eyebrow">
                          {t(
                            'share.board',
                            {
                              defaultValue:
                                'Share the live board',
                            },
                          )}
                        </p>
                        <ShareBar
                          url={`${SITE_URL}/elections?cycle=${param}`}
                          text={headline(
                            snapshot,
                          )}
                        />
                      </div>
                    </Host>
                  ) : (
                    <div
                      className="el-box el-skel"
                      aria-busy
                    />
                  )}
                </Section>
                <Section
                  id="markets"
                  tone="yellow"
                  eyebrow={t(
                    'markets.eyebrow',
                    {
                      defaultValue:
                        'Put coins on it',
                    },
                  )}
                  title={
                    <>
                      {t(
                        'markets.title1',
                        {
                          defaultValue:
                            'The',
                        },
                      )}{' '}
                      <em>
                        {t(
                          'markets.title2',
                          {
                            defaultValue:
                              'markets',
                          },
                        )}
                      </em>
                    </>
                  }
                  lede={t(
                    'markets.lede',
                    {
                      defaultValue:
                        'Back your call with coins. Odds move with every trade.',
                    },
                  )}
                >
                  <MarketsPanel
                    cycle={
                      param
                    }
                  />
                </Section>
              </>
            ) : null}
          </main>

          <footer className="el-foot">
            <div className="el-wrap">
              <p className="el-eyebrow">
                {t(
                  'foot.eyebrow',
                  {
                    defaultValue:
                      'About this page',
                  },
                )}
              </p>
              <p>
                {t(
                  'foot.data',
                  {
                    defaultValue:
                      'Results, ratings and race calls come from a free public results feed and can lag or differ from official state tallies. Calls are projections, not certifications. Always check your state’s election office for official results.',
                  },
                )}
              </p>
              {snapshot &&
              hasData ? (
                <p>
                  <a
                    href={`/api/elections/races.csv?cycle=${param}`}
                    download
                  >
                    {t(
                      'foot.csv',
                      {
                        defaultValue:
                          'Download every race as CSV',
                      },
                    )}
                  </a>
                  {
                    ' · '
                  }
                  <a
                    href={`/api/elections/public?cycle=${param}`}
                  >
                    {t(
                      'foot.json',
                      {
                        defaultValue:
                          'JSON summary',
                      },
                    )}
                  </a>
                </p>
              ) : null}
              {snapshot
                ?.providers
                .length ? (
                <p>
                  {t(
                    'foot.sources',
                    {
                      defaultValue:
                        'Sources: {{list}}.',
                      list: snapshot.providers.join(
                        '; ',
                      ),
                    },
                  )}
                </p>
              ) : null}
              <p>
                {t(
                  'foot.vote',
                  {
                    defaultValue:
                      'Need to vote or check your registration?',
                  },
                )}{' '}
                <a
                  href="https://vote.gov"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  vote.gov
                </a>
              </p>
            </div>
          </footer>

          {room ? (
            <RoomOverlay
              cycle={
                param
              }
              source={
                room
              }
              snapshot={
                snapshot
              }
              events={
                events
              }
              live={
                live
              }
              onClose={
                closeRoom
              }
              onUseSolo={() =>
                openRoom(
                  {
                    kind: 'solo',
                  },
                )
              }
            />
          ) : null}
        </div>
      </FollowContext.Provider>
    </BaselineContext.Provider>
  );
}
