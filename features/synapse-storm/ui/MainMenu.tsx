import React, {
  useState,
  useEffect,
  useId,
} from 'react';
import {
  Zap,
  Brain,
  Activity,
  Target,
  Layers,
  Timer,
  Settings2,
  Users,
  LogOut,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuitGame } from '@/hooks/useQuitGame';
import { GlobalLeaderboard } from './GlobalLeaderboard';
import { MenuBackdrop } from './MenuBackdrop';
import './SynapseStormMenu.css';
import { CustomStormPicker } from './CustomStormPicker';
import type { PuzzleCategory } from '@features/synapse-storm/engine/types';
import {
  getSettings,
  setMusicVolume,
  setSfxVolume,
} from '@features/synapse-storm/engine/settings';
import { soundManager } from '@features/synapse-storm/engine/sounds';
import { synapseStormMusic } from '@features/synapse-storm/engine/music';

interface MainMenuProps {
  onStart: () => void;
  onMultiplayer?: () => void;
  onCustom?: (
    categories: PuzzleCategory[],
  ) => void;
  currentUserId?: string;
}

const FEATURE_KEYS =
  [
    {
      icon: (
        <Zap
          size={
            16
          }
        />
      ),
      key: 'feature-reaction',
      defaultValue:
        'Reaction',
    },
    {
      icon: (
        <Brain
          size={
            16
          }
        />
      ),
      key: 'feature-memory',
      defaultValue:
        'Memory',
    },
    {
      icon: (
        <Layers
          size={
            16
          }
        />
      ),
      key: 'feature-patterns',
      defaultValue:
        'Patterns',
    },
    {
      icon: (
        <Target
          size={
            16
          }
        />
      ),
      key: 'feature-spatial',
      defaultValue:
        'Spatial',
    },
    {
      icon: (
        <Activity
          size={
            16
          }
        />
      ),
      key: 'feature-math',
      defaultValue:
        'Math',
    },
    {
      icon: (
        <Timer
          size={
            16
          }
        />
      ),
      key: 'feature-fast-paced',
      defaultValue:
        'Fast-paced',
    },
  ];

export const MainMenu: React.FC<
  MainMenuProps
> = ({
  onStart,
  onMultiplayer,
  onCustom,
  currentUserId,
}) => {
  const {
    t,
  } =
    useTranslation(
      'c-synapse-storm',
    );
  const uid =
    useId();
  const quit =
    useQuitGame();
  const [
    settingsOpen,
    setSettingsOpen,
  ] =
    useState(
      false,
    );
  const [
    musicVol,
    setMusicVol,
  ] =
    useState(
      0.25,
    );
  const [
    sfxVol,
    setSfxVol,
  ] =
    useState(
      0.3,
    );

  useEffect(() => {
    const s =
      getSettings();
    setMusicVol(
      s.musicVolume,
    );
    setSfxVol(
      s.sfxVolume,
    );
  }, []);

  const handleMusicChange =
    (
      v: number,
    ) => {
      setMusicVol(
        v,
      );
      setMusicVolume(
        v,
      );
      synapseStormMusic.setVolume(
        v,
      );
    };

  const handleSfxChange =
    (
      v: number,
    ) => {
      setSfxVol(
        v,
      );
      setSfxVolume(
        v,
      );
      soundManager.setVolume(
        v,
      );
    };

  return (
    <div className="ssm-screen">
      <MenuBackdrop />

      <div className="ssm-scroll">
        <div className="ssm-main">
          <div className="ssm-play">
            <h1 className="ssm-title">
              <img
                className="ssm-logo"
                src="/images/games/logos/synapse-storm.svg"
                alt={t(
                  'game-title',
                  {
                    defaultValue:
                      'Synapse Storm',
                  },
                )}
                width={
                  1120
                }
                height={
                  502
                }
                decoding="async"
              />
            </h1>

            <p className="ssm-tagline">
              {t(
                'tagline',
                {
                  defaultValue:
                    'Juggle a storm of micro-challenges. Stay sharp. See how long your mind can keep up before the load becomes too great.',
                },
              )}
            </p>

            <ul className="ssm-chips">
              {FEATURE_KEYS.map(
                (
                  f,
                  i,
                ) => (
                  <li
                    key={
                      i
                    }
                    className="ssm-chip"
                  >
                    <span
                      className="ssm-chip__icon"
                      aria-hidden="true"
                    >
                      {
                        f.icon
                      }
                    </span>
                    {t(
                      f.key,
                      {
                        defaultValue:
                          f.defaultValue,
                      },
                    )}
                  </li>
                ),
              )}
            </ul>

            <div className="ssm-actions">
              <button
                className="ssm-btn ssm-btn--primary"
                onClick={
                  onStart
                }
              >
                <Zap
                  className="ssm-btn__icon"
                  size={
                    20
                  }
                  aria-hidden="true"
                />
                {t(
                  'solo-neural-link',
                  {
                    defaultValue:
                      'SOLO NEURAL LINK',
                  },
                )}
              </button>
              {onMultiplayer && (
                <button
                  className="ssm-btn ssm-btn--secondary"
                  onClick={
                    onMultiplayer
                  }
                >
                  <Users
                    className="ssm-btn__icon"
                    size={
                      20
                    }
                    aria-hidden="true"
                  />
                  {t(
                    'multiplayer-storm',
                    {
                      defaultValue:
                        'MULTIPLAYER STORM',
                    },
                  )}
                </button>
              )}
              {onCustom && (
                <CustomStormPicker
                  onStart={
                    onCustom
                  }
                />
              )}
              <button
                type="button"
                className="ssm-btn ssm-btn--ghost"
                onClick={
                  quit
                }
              >
                <LogOut
                  className="ssm-btn__icon"
                  size={
                    20
                  }
                  aria-hidden="true"
                />
                {t(
                  'quit',
                  {
                    defaultValue:
                      'Quit',
                  },
                )}
              </button>
            </div>

            <div className="ssm-settings">
              <button
                type="button"
                className="ssm-toggle"
                onClick={() =>
                  setSettingsOpen(
                    !settingsOpen,
                  )
                }
                aria-expanded={
                  settingsOpen
                }
              >
                <Settings2
                  size={
                    18
                  }
                  aria-hidden="true"
                />
                {t(
                  'settings',
                  {
                    defaultValue:
                      'Settings',
                  },
                )}
              </button>
              {settingsOpen && (
                <div className="ssm-panel ssm-panel--cyan">
                  <div className="ssm-row">
                    <label
                      htmlFor={`${uid}-music`}
                    >
                      {t(
                        'music',
                        {
                          defaultValue:
                            'Music',
                        },
                      )}
                    </label>
                    <input
                      id={`${uid}-music`}
                      className="ssm-range"
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(
                        musicVol *
                          100,
                      )}
                      style={
                        {
                          '--val': `${Math.round(musicVol * 100)}%`,
                        } as React.CSSProperties
                      }
                      onChange={(
                        e,
                      ) =>
                        handleMusicChange(
                          Number(
                            e
                              .target
                              .value,
                          ) /
                            100,
                        )
                      }
                    />
                    <output
                      htmlFor={`${uid}-music`}
                    >
                      {Math.round(
                        musicVol *
                          100,
                      )}
                      %
                    </output>
                  </div>
                  <div className="ssm-row">
                    <label
                      htmlFor={`${uid}-sfx`}
                    >
                      {t(
                        'sound-effects',
                        {
                          defaultValue:
                            'Sound effects',
                        },
                      )}
                    </label>
                    <input
                      id={`${uid}-sfx`}
                      className="ssm-range"
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(
                        sfxVol *
                          100,
                      )}
                      style={
                        {
                          '--val': `${Math.round(sfxVol * 100)}%`,
                        } as React.CSSProperties
                      }
                      onChange={(
                        e,
                      ) =>
                        handleSfxChange(
                          Number(
                            e
                              .target
                              .value,
                          ) /
                            100,
                        )
                      }
                    />
                    <output
                      htmlFor={`${uid}-sfx`}
                    >
                      {Math.round(
                        sfxVol *
                          100,
                      )}
                      %
                    </output>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="ssm-side">
            <section className="ssm-panel ssm-panel--pink">
              <h2 className="ssm-panel-title">
                <Brain
                  size={
                    18
                  }
                  aria-hidden="true"
                />
                {t(
                  'transmission-protocol',
                  {
                    defaultValue:
                      'Transmission Protocol:',
                  },
                )}
              </h2>
              <ul className="ssm-protocol">
                <li>
                  {t(
                    'instruction-solve-cards',
                    {
                      defaultValue:
                        'Solve cards before they expire to maintain system stability.',
                    },
                  )}
                </li>
                <li>
                  {t(
                    'instruction-combos',
                    {
                      defaultValue:
                        'Maintain combos to exponentially increase your score.',
                    },
                  )}
                </li>
                <li>
                  {t(
                    'instruction-integrity',
                    {
                      defaultValue:
                        'Integrity failure occurs after 5 data casualties (Misses).',
                    },
                  )}
                </li>
                <li>
                  {t(
                    'instruction-difficulty',
                    {
                      defaultValue:
                        'Difficulty scales dynamically with your neural efficiency.',
                    },
                  )}
                </li>
              </ul>
            </section>

            <GlobalLeaderboard
              currentUserId={
                currentUserId
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
};
