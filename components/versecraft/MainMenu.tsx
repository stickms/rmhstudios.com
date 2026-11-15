import {
  useState,
  useEffect,
} from 'react';
import {
  m as motion,
  AnimatePresence,
} from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '@/lib/versecraft/store';
import { useQuitGame } from '@/hooks/useQuitGame';
import { loadGame } from '@/lib/versecraft/persistence';
import { api } from '@/lib/contract/client';
import { loadVersecraftSaveApi } from '@/lib/versecraft/versecraft.contract';
import { spriteUrl } from '@/lib/versecraft/sprites/registry';
import { ShareSeed } from './ShareSeed';
import { PublishSeedButton } from './SeedGallery';
import { GeneratingState } from './GeneratingState';
import { DuskBackdrop } from './DuskBackdrop';
import './VersecraftMenu.css';

/** An open book with a quill, the game's mark: drawn once, tinted by `currentColor`. */
function BookQuill() {
  return (
    <svg
      viewBox="0 0 120 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M60 20C48 13 30 13 12 17V52C30 48 48 48 60 54Z"
        fill="rgba(255,243,220,0.12)"
      />
      <path
        d="M60 20C72 13 90 13 108 17V52C90 48 72 48 60 54Z"
        fill="rgba(255,243,220,0.12)"
      />
      <path d="M60 20V54" />
      <path
        d="M21 25C31 23 42 24 52 28M21 32C31 30 42 31 52 35M21 39C31 37 42 38 52 42"
        strokeWidth="1"
        opacity="0.7"
      />
      <path
        d="M68 28C78 24 88 24 98 26M68 35C78 31 88 31 98 33"
        strokeWidth="1"
        opacity="0.7"
      />
      <path
        d="M74 46L112 6C109 19 99 31 87 39Z"
        fill="currentColor"
        fillOpacity="0.35"
      />
      <path
        d="M74 46L110 8M90 22L98 24M84 29L93 30"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function MainMenu() {
  const {
    t,
  } =
    useTranslation(
      'c-versecraft',
    );
  const quit =
    useQuitGame();
  const continueGame =
    useGameStore(
      (
        s,
      ) =>
        s.continueGame,
    );
  const setScreen =
    useGameStore(
      (
        s,
      ) =>
        s.setScreen,
    );
  const isLoggedIn =
    useGameStore(
      (
        s,
      ) =>
        s.isLoggedIn,
    );
  const world =
    useGameStore(
      (
        s,
      ) =>
        s.world,
    );
  const chapterIndex =
    useGameStore(
      (
        s,
      ) =>
        s.currentChapterIndex,
    );
  const reducedMotion =
    useGameStore(
      (
        s,
      ) =>
        s
          .settings
          .reducedMotion,
    );

  const [
    hasSave,
    setHasSave,
  ] =
    useState(
      false,
    );
  const [
    checking,
    setChecking,
  ] =
    useState(
      true,
    );
  const [
    continuing,
    setContinuing,
  ] =
    useState(
      false,
    );
  const [
    tagline,
    setTagline,
  ] =
    useState(
      0,
    );

  const taglines =
    [
      t(
        'menu-tagline-1',
        {
          defaultValue:
            'A new emotional story every time — written for you.',
        },
      ),
      t(
        'menu-tagline-2',
        {
          defaultValue:
            'Your cast. Your bonds. Your seed to share.',
        },
      ),
      t(
        'menu-tagline-3',
        {
          defaultValue:
            'No two playthroughs are ever the same.',
        },
      ),
      t(
        'menu-tagline-4',
        {
          defaultValue:
            'Prompt a life, or let fate deal the cards.',
        },
      ),
    ];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (
        loadGame(
          0,
        )
      ) {
        if (
          !cancelled
        ) {
          setHasSave(
            true,
          );
          setChecking(
            false,
          );
        }
        return;
      }
      if (
        isLoggedIn
      ) {
        try {
          const d =
            await api(
              loadVersecraftSaveApi,
              {
                timeoutMs: 10_000,
                retries: 0,
              },
            );
          if (
            !cancelled &&
            d?.saveData
          )
            setHasSave(
              true,
            );
        } catch {
          /* ignore */
        }
      }
      if (
        !cancelled
      )
        setChecking(
          false,
        );
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isLoggedIn,
  ]);

  useEffect(() => {
    if (
      reducedMotion
    )
      return;
    const i =
      setInterval(
        () =>
          setTagline(
            (
              v,
            ) =>
              (v +
                1) %
              4,
          ),
        4200,
      );
    return () =>
      clearInterval(
        i,
      );
  }, [
    reducedMotion,
  ]);

  if (
    continuing
  ) {
    return (
      <GeneratingState
        title={t(
          'loading-your-story',
          {
            defaultValue:
              'Loading your story…',
          },
        )}
        note={t(
          'restoring-your-cast',
          {
            defaultValue:
              'Restoring your cast and where you left off.',
          },
        )}
        steps={[
          t(
            'step-finding-save',
            {
              defaultValue:
                'Finding your save…',
            },
          ),
          t(
            'step-waking-cast',
            {
              defaultValue:
                'Waking the cast…',
            },
          ),
          t(
            'step-returning-scene',
            {
              defaultValue:
                'Returning to the scene…',
            },
          ),
        ]}
      />
    );
  }

  const runContinue =
    async () => {
      setContinuing(
        true,
      );
      try {
        await continueGame();
      } finally {
        setContinuing(
          false,
        );
      }
    };

  return (
    <div
      className="vc-screen"
      data-reduced-motion={
        reducedMotion
          ? 'true'
          : undefined
      }
    >
      <DuskBackdrop />

      <div className="vc-menu__inner">
        <motion.header
          className="vc-hero"
          initial={{
            opacity: 0,
            y: -16,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            duration: 0.9,
          }}
        >
          <h1 className="vc-title">
            <img
              className="vc-logo"
              src="/images/games/logos/versecraft.svg"
              alt={t(
                'game-title',
                {
                  defaultValue:
                    'Versecraft',
                },
              )}
              width={
                1120
              }
              height={
                538
              }
              decoding="async"
            />
          </h1>
          <div className="vc-kicker">
            {t(
              'menu-kicker',
              {
                defaultValue:
                  '✦ poetry · romance · fate ✦',
              },
            )}
          </div>
          <div className="vc-tagline-wrap">
            <AnimatePresence mode="wait">
              <motion.p
                key={
                  tagline
                }
                className="vc-tagline"
                initial={{
                  opacity: 0,
                  y: 6,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                exit={{
                  opacity: 0,
                  y: -6,
                }}
                transition={{
                  duration: 0.5,
                }}
              >
                {
                  taglines[
                    tagline
                  ]
                }
              </motion.p>
            </AnimatePresence>
          </div>
          <div className="vc-ornament">
            <BookQuill />
          </div>
        </motion.header>

        <div className="vc-panel">
          {/* Active story panel */}
          <AnimatePresence>
            {world && (
              <motion.div
                className="vc-story"
                style={{
                  background: `linear-gradient(150deg, ${world.characters[0]?.color ?? '#4A3B6B'}33, rgba(36,16,70,0.85))`,
                }}
                initial={{
                  opacity: 0,
                  y: 12,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                exit={{
                  opacity: 0,
                }}
              >
                <p className="vc-story__label">
                  {t(
                    'current-story-label',
                    {
                      defaultValue:
                        'Your current story',
                    },
                  )}
                </p>
                <p className="vc-story__title">
                  {
                    world.title
                  }
                </p>
                <p className="vc-story__meta">
                  {t(
                    'chapter-progress',
                    {
                      defaultValue:
                        'Chapter {{current}} of {{total}}',
                      current:
                        chapterIndex +
                        1,
                      total:
                        world
                          .routePlan
                          .totalChapters,
                    },
                  )}
                </p>
                <div className="vc-avatars">
                  {world.characters
                    .slice(
                      0,
                      5,
                    )
                    .map(
                      (
                        c,
                      ) => {
                        const u =
                          spriteUrl(
                            c.packId,
                            'happy',
                          ) ??
                          spriteUrl(
                            c.packId,
                            'neutral',
                          );
                        return (
                          <div
                            key={
                              c.id
                            }
                            className="vc-avatar"
                            style={{
                              background: `linear-gradient(160deg, ${c.color}55, #241046)`,
                              border: `2px solid ${c.color}`,
                            }}
                          >
                            {u && (
                              <img
                                src={
                                  u
                                }
                                alt={
                                  c.name
                                }
                                onError={(
                                  e,
                                ) => {
                                  (
                                    e.currentTarget as HTMLImageElement
                                  ).style.display =
                                    'none';
                                }}
                              />
                            )}
                          </div>
                        );
                      },
                    )}
                </div>
                <div className="vc-story__actions">
                  <button
                    type="button"
                    onClick={
                      runContinue
                    }
                    className="vc-btn vc-btn--primary"
                  >
                    <span
                      className="vc-btn__mark"
                      aria-hidden="true"
                    >
                      ▸
                    </span>
                    {t(
                      'continue',
                      {
                        defaultValue:
                          'Continue',
                      },
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setScreen(
                        'cast',
                      )
                    }
                    className="vc-btn"
                  >
                    <span
                      className="vc-btn__mark"
                      aria-hidden="true"
                    >
                      ♥
                    </span>
                    {t(
                      'menu-cast',
                      {
                        defaultValue:
                          'Cast',
                      },
                    )}
                  </button>
                </div>
                <div className="vc-story__share">
                  <ShareSeed
                    seed={
                      world.seed
                    }
                    compact
                  />
                  <PublishSeedButton
                    seed={
                      world.seed
                    }
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hero: New Story */}
          <motion.button
            type="button"
            onClick={() =>
              setScreen(
                'world_setup',
              )
            }
            className="vc-btn vc-btn--primary vc-new"
            initial={{
              opacity: 0,
              y: 12,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            transition={{
              delay: 0.2,
            }}
          >
            <span className="vc-new__title">
              {t(
                'new-story',
                {
                  defaultValue:
                    'New Story',
                },
              )}
            </span>
            <span className="vc-new__note">
              {t(
                'new-story-note',
                {
                  defaultValue:
                    'Prompt the life you want, or roll the dice.',
                },
              )}
            </span>
          </motion.button>

          {/* Continue (if save exists but no world loaded yet) */}
          {hasSave &&
            !world && (
              <button
                type="button"
                className="vc-btn"
                onClick={
                  runContinue
                }
              >
                <span
                  className="vc-btn__mark"
                  aria-hidden="true"
                >
                  ▸
                </span>
                {t(
                  'continue',
                  {
                    defaultValue:
                      'Continue',
                  },
                )}
              </button>
            )}

          {/* Secondary pills */}
          <div className="vc-grid">
            <button
              type="button"
              className="vc-btn"
              onClick={() =>
                setScreen(
                  'world_setup',
                )
              }
            >
              <span
                className="vc-btn__mark"
                aria-hidden="true"
              >
                ⧉
              </span>
              {t(
                'play-a-seed',
                {
                  defaultValue:
                    'Play a seed',
                },
              )}
            </button>
            <button
              type="button"
              className="vc-btn"
              onClick={() =>
                setScreen(
                  'settings',
                )
              }
            >
              <span
                className="vc-btn__mark"
                aria-hidden="true"
              >
                ⚙
              </span>
              {t(
                'settings',
                {
                  defaultValue:
                    'Settings',
                },
              )}
            </button>
          </div>

          <button
            type="button"
            className="vc-btn"
            onClick={
              quit
            }
          >
            <span
              className="vc-btn__mark"
              aria-hidden="true"
            >
              ✕
            </span>
            {t(
              'quit',
              {
                defaultValue:
                  'Quit',
              },
            )}
          </button>
        </div>

        {!isLoggedIn &&
          !checking && (
            <p className="vc-hint">
              {t(
                'sign-in-hint',
                {
                  defaultValue:
                    'Sign in to save your stories to the cloud and replay them anywhere.',
                },
              )}
            </p>
          )}
        <p className="vc-brand">
          RMH
          STUDIOS
        </p>
      </div>
    </div>
  );
}
