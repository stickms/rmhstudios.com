import type { CSSProperties } from 'react';
import {
  m as motion,
  AnimatePresence,
} from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type {
  HudState,
  HudFighter,
} from '@/lib/kowloon-knockout/net/session';
import { TEAM_COLORS } from '@/lib/kowloon-knockout/game/config';
import {
  TIMER_URGENT_SECONDS,
  classifyRoundEnd,
  hpFraction,
  hpTone,
  hudColumns,
  isLowHealth,
  litSegments,
  secondsLeft,
} from '@/lib/kowloon-knockout/render/hudModel';
import './kk-hud.css';

/** Hong Kong shop-sign glyphs, one per seat: decoration only (aria-hidden). */
const SEAT_KANJI =
  [
    '龍',
    '武',
    '港',
    '夜',
  ] as const;
const HP_SEGMENTS = 10;

function FighterPanel({
  f,
  side,
  mode,
}: {
  f: HudFighter;
  side:
    | 'l'
    | 'r';
  mode:
    | 'ffa'
    | 'teams';
}) {
  const {
    t,
  } =
    useTranslation(
      'c-kowloon-knockout',
    );
  const hp =
    hpFraction(
      f.health,
      f.maxHealth,
    );
  const st =
    hpFraction(
      f.stamina,
      f.maxStamina,
    );
  const tone =
    hpTone(
      hp,
    );
  const low =
    isLowHealth(
      hp,
      f.alive,
    );
  const seatColor =
    mode ===
    'teams'
      ? (TEAM_COLORS[
          f
            .team
        ] ??
        f.color)
      : f.color;
  const wins =
    Math.max(
      0,
      f.roundWins,
    );
  const cls =
    [
      'kk-fp',
      `kk-fp--${side}`,
      f.isLocal
        ? 'is-local'
        : '',
      f.alive
        ? ''
        : 'is-down',
      low
        ? 'is-low'
        : '',
    ]
      .filter(
        Boolean,
      )
      .join(
        ' ',
      );
  return (
    <article
      className={
        cls
      }
      style={
        {
          '--seat':
            seatColor,
        } as CSSProperties
      }
    >
      <span
        className="kk-fp__kanji"
        aria-hidden="true"
      >
        {
          SEAT_KANJI[
            f.seat %
              4
          ]
        }
      </span>
      <header className="kk-fp__head">
        <span className="kk-fp__tag">
          P
          {f.seat +
            1}
        </span>
        {f.isLocal && (
          <span
            className="kk-fp__you"
            aria-hidden="true"
          >
            ▶
          </span>
        )}
        <span className="kk-fp__name">
          {
            f.name
          }
        </span>
        <span
          className="kk-fp__pips"
          role="img"
          aria-label={t(
            'hud-round-wins',
            {
              n: wins,
              defaultValue:
                'Round wins: {{n}}',
            },
          )}
        >
          {'◆'.repeat(
            wins,
          )}
          {'◇'.repeat(
            Math.max(
              0,
              2 -
                wins,
            ),
          )}
        </span>
      </header>
      <div
        className="kk-bar kk-bar--hp"
        data-tone={
          tone
        }
        role="meter"
        aria-valuemin={
          0
        }
        aria-valuemax={
          100
        }
        aria-valuenow={Math.round(
          hp *
            100,
        )}
        aria-label={t(
          'hud-health',
          {
            name: f.name,
            defaultValue:
              '{{name}} health',
          },
        )}
      >
        <i
          style={
            {
              '--lit':
                litSegments(
                  hp,
                  HP_SEGMENTS,
                ),
              '--cells':
                HP_SEGMENTS,
            } as CSSProperties
          }
        />
      </div>
      <div
        className="kk-bar kk-bar--st"
        role="meter"
        aria-valuemin={
          0
        }
        aria-valuemax={
          100
        }
        aria-valuenow={Math.round(
          st *
            100,
        )}
        aria-label={t(
          'hud-stamina',
          {
            name: f.name,
            defaultValue:
              '{{name}} stamina',
          },
        )}
      >
        <i
          style={{
            width: `${st * 100}%`,
          }}
        />
      </div>
    </article>
  );
}

export default function HUD({
  hud,
}: {
  hud: HudState;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-kowloon-knockout',
    );
  const seconds =
    secondsLeft(
      hud.roundTime,
    );
  const urgent =
    seconds <=
    TIMER_URGENT_SECONDS;
  const {
    left,
    right,
  } =
    hudColumns(
      hud.fighters,
    );
  const end =
    classifyRoundEnd(
      hud.roundEndText,
    );
  const endText =
    end.kind ===
    'ko'
      ? t(
          'hud-ko',
          {
            defaultValue:
              'K.O.',
          },
        )
      : end.kind ===
          'draw'
        ? t(
            'hud-draw',
            {
              defaultValue:
                'DRAW',
            },
          )
        : end.kind ===
            'decision'
          ? t(
              'hud-decision',
              {
                defaultValue:
                  'DECISION',
              },
            )
          : end.kind ===
              'wins'
            ? t(
                'hud-wins',
                {
                  name: end.name,
                  defaultValue:
                    '{{name}} WINS',
                },
              )
            : hud.roundEndText;
  const endKanji =
    end.kind ===
    'ko'
      ? '擊倒'
      : end.kind ===
          'draw'
        ? '平手'
        : '勝利';

  return (
    // `app-hud` insets the layer by the device's safe area, so nothing here sits under a
    // notch or home indicator; the panels keep ordinary small offsets from its edges.
    <div className="app-hud kk-hud">
      <div className="kk-hud__bar">
        <div className="kk-hud__col kk-hud__col--l">
          {left.map(
            (
              f,
            ) => (
              <FighterPanel
                key={
                  f.seat
                }
                f={
                  f
                }
                side="l"
                mode={
                  hud.mode
                }
              />
            ),
          )}
        </div>

        <div
          className={`kk-plate${urgent ? ' is-urgent' : ''}`}
          role="timer"
          aria-label={t(
            'hud-time-left',
            {
              n: seconds,
              defaultValue:
                'Seconds left: {{n}}',
            },
          )}
        >
          <div className="kk-plate__round">
            {t(
              'hud-round',
              {
                n: hud.round,
                defaultValue:
                  'ROUND {{n}}',
              },
            )}
          </div>
          <div
            className="kk-plate__time"
            aria-hidden="true"
          >
            {
              seconds
            }
          </div>
          <div className="kk-plate__mode">
            {hud.mode ===
            'teams'
              ? t(
                  'hud-teams',
                  {
                    defaultValue:
                      'TEAMS',
                  },
                )
              : t(
                  'hud-ffa',
                  {
                    defaultValue:
                      'FREE-FOR-ALL',
                  },
                )}
          </div>
        </div>

        <div className="kk-hud__col kk-hud__col--r">
          {right.map(
            (
              f,
            ) => (
              <FighterPanel
                key={
                  f.seat
                }
                f={
                  f
                }
                side="r"
                mode={
                  hud.mode
                }
              />
            ),
          )}
        </div>
      </div>

      {/* Combo / counter-strike callout */}
      <AnimatePresence>
        {hud.comboText && (
          <motion.div
            key={
              hud.comboText
            }
            className="kk-callout"
            style={
              {
                '--c':
                  hud.comboColor,
              } as CSSProperties
            }
            initial={{
              scale: 0.5,
              opacity: 0,
            }}
            animate={{
              scale: 1,
              opacity: 1,
            }}
            exit={{
              opacity: 0,
              y: -16,
            }}
            transition={{
              duration: 0.22,
            }}
            role="status"
          >
            {
              hud.comboText
            }
          </motion.div>
        )}
      </AnimatePresence>

      {/* Countdown: one slam per number, never a strobe */}
      {hud.phase ===
        'countdown' && (
        <div className="kk-banner-layer">
          <div
            key={
              hud.countdownValue
            }
            className={`kk-banner kk-banner--slam ${hud.countdownValue > 0 ? 'kk-banner--count' : 'kk-banner--fight'}`}
          >
            {hud.countdownValue >
            0
              ? hud.countdownValue
              : t(
                  'hud-fight',
                  {
                    defaultValue:
                      'FIGHT!',
                  },
                )}
          </div>
        </div>
      )}

      {/* Round end */}
      {hud.phase ===
        'roundEnd' && (
        <div className="kk-banner-layer kk-banner-layer--end">
          <div
            className={`kk-banner-band kk-banner-band--${end.kind}`}
            aria-hidden="true"
          />
          <div className="kk-banner-stack">
            <div
              className={`kk-banner kk-banner--slam kk-banner--end kk-banner--${end.kind}`}
              role="status"
            >
              {
                endText
              }
            </div>
            <div
              className="kk-banner-kanji"
              aria-hidden="true"
            >
              {
                endKanji
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
