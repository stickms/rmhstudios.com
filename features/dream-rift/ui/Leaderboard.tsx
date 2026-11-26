/**
 * Dream Rift leaderboard.
 *
 * Two boards:
 *   - Solo — top personal high scores per difficulty (/api/dream-rift/leaderboard).
 *   - Co-op — top multiplayer runs per difficulty, ranked by combined squad score
 *     or time survived (/api/dream-rift/coop).
 */

import {
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { DIFFICULTIES } from '@features/dream-rift/engine/constants';
import type { Difficulty } from '@features/dream-rift/engine/types';
import { CHARACTERS } from '@features/dream-rift/engine/render/sprites';
import type { PlayerId } from '@features/dream-rift/engine/types';
import { formatClockSeconds } from '@/lib/core/format';
import { useArrival } from '@/components/ui/arrive';
import { fetchCoopBoard } from '@features/dream-rift/engine/coop-client';
import type { CoopBoardEntry, CoopPlayerView } from '@features/dream-rift/engine/coop-runs';
import { cn } from '@/lib/utils';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

interface Account {
  id: string;
  handle:
    | string
    | null;
  name:
    | string
    | null;
  image:
    | string
    | null;
}

interface SoloEntry {
  username: string;
  bestStage: number;
  character: string;
  spellsCaptured: number;
  account: Account | null;
  [
    key: string
  ]:
    | number
    | string
    | Account
    | null;
}

type Mode =
  | 'solo'
  | 'coop';
type CoopMetric =
  | 'combined'
  | 'time';

const FIELD: Record<
  Difficulty,
  string
> =
  {
    easy: 'highScoreEasy',
    normal:
      'highScoreNormal',
    hard: 'highScoreHard',
    lunatic:
      'highScoreLunatic',
  };
const DIFF_COLOR: Record<
  Difficulty,
  string
> =
  {
    easy: '#5fe0b0',
    normal:
      '#7fdcff',
    hard: '#ffb14d',
    lunatic:
      '#ff5ccd',
  };

function charName(
  id: string,
): string {
  return (
    (
      CHARACTERS as Record<
        string,
        {
          name: string;
          accent: string;
        }
      >
    )[
      id
    ]
      ?.name ??
    id
  );
}
function charAccent(
  id: string,
): string {
  return (
    CHARACTERS[
      id as PlayerId
    ]
      ?.accent ??
    '#fff'
  );
}

function profileHref(
  a: Account,
): string {
  return `/u/${a.handle || a.id}`;
}

/** Small round avatar; falls back to a letter monogram when no image is set. */
function Avatar({
  account,
  name,
  size = 22,
}: {
  account: Account | null;
  name: string;
  size?: number;
}) {
  const letter =
    (
      account?.name ||
      account?.handle ||
      name ||
      '?'
    )
      .trim()
      .charAt(
        0,
      )
      .toUpperCase();
  if (
    account?.image
  ) {
    return (
      <img
        src={
          account.image
        }
        alt=""
        width={
          size
        }
        height={
          size
        }
        className="shrink-0 rounded-full object-cover ring-1 ring-white/15"
        style={{
          width:
            size,
          height:
            size,
        }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-[rgba(231,205,140,0.12)] text-[10px] font-bold text-[color:var(--dr-cream-dim)] ring-1 ring-[rgba(231,205,140,0.2)]"
      style={{
        width:
          size,
        height:
          size,
      }}
    >
      {
        letter
      }
    </span>
  );
}

/**
 * Render a player's name with avatar. If linked to an RMH account it becomes a
 * clickable profile link (opens in a new tab so the game/session is preserved);
 * guests render as plain text.
 */
function PlayerTag({
  account,
  name,
  color,
}: {
  account: Account | null;
  name: string;
  color?: string;
}) {
  const inner =
    (
      <>
        <Avatar
          account={
            account
          }
          name={
            name
          }
        />
        <span
          className="truncate font-semibold"
          style={
            color
              ? {
                  color,
                }
              : undefined
          }
        >
          {
            name
          }
        </span>
      </>
    );
  if (
    account
  ) {
    return (
      <a
        href={profileHref(
          account,
        )}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 items-center gap-2 hover:underline"
        title={`View ${account.name || account.handle || name}'s profile`}
      >
        {
          inner
        }
      </a>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-2 text-[color:var(--dr-cream)]">
      {
        inner
      }
    </span>
  );
}

/**
 * One slot of a co-op run, as the server resolved it at read time: a member under their current name (a link to their
 * profile when they have a handle), a guest under the name they typed, and "A player" or "Deleted user" where the
 * member is hidden, banned or gone. The server sends no account id, so a link can only be by handle.
 */
function CoopTag({ player }: { player: CoopPlayerView }) {
  const { t } = useTranslation('dream-rift-coop');
  const name =
    player.kind === 'deleted'
      ? t('deleted-user', { defaultValue: 'Deleted user' })
      : player.name ||
        t('a-player', { defaultValue: 'A player' });
  const account =
    player.kind === 'player'
      ? { id: player.handle ?? '', handle: player.handle, name: player.name, image: player.image }
      : null;
  const inner = (
    <>
      <Avatar account={account} name={name} />
      <bdi dir="auto" className="truncate font-semibold" style={{ color: charAccent(player.charId) }}>
        {name}
      </bdi>
    </>
  );
  if (account && player.handle) {
    return (
      <a
        href={`/u/${player.handle}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 items-center gap-2 hover:underline"
      >
        {inner}
      </a>
    );
  }
  return <span className="flex min-w-0 items-center gap-2 text-[color:var(--dr-cream)]">{inner}</span>;
}

export function Leaderboard({
  onBack,
}: {
  onBack: () => void;
}) { const fmt = useLocaleFormat(); 
  const [
    mode,
    setMode,
  ] =
    useState<Mode>(
      'solo',
    );
  const [
    difficulty,
    setDifficulty,
  ] =
    useState<Difficulty>(
      'normal',
    );
  const [
    metric,
    setMetric,
  ] =
    useState<CoopMetric>(
      'combined',
    );
  const [
    solo,
    setSolo,
  ] =
    useState<
      SoloEntry[]
    >(
      [],
    );
  const [
    coop,
    setCoop,
  ] =
    useState<
      CoopBoardEntry[]
    >(
      [],
    );
  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );
  const [coopFailed, setCoopFailed] = useState(false);
  // A co-op reply that arrives after a newer click is dropped.
  const coopGeneration = useRef(0);
  const { t } = useTranslation('dream-rift-coop');
  const arrival =
    useArrival(
      !loading,
    );

  // The co-op board is read from the click that opens its tab or changes difficulty or metric (never from an effect).
  const loadCoop = (d: Difficulty, m: CoopMetric) => {
    const mine = ++coopGeneration.current;
    setLoading(true);
    setCoopFailed(false);
    fetchCoopBoard(d, m)
      .then((rows) => {
        if (coopGeneration.current === mine) setCoop(rows);
      })
      .catch(() => {
        if (coopGeneration.current !== mine) return;
        setCoop([]);
        setCoopFailed(true);
      })
      .finally(() => {
        if (coopGeneration.current === mine) setLoading(false);
      });
  };
  const chooseMode = (m: Mode) => {
    setMode(m);
    if (m === 'coop') loadCoop(difficulty, metric);
  };
  const chooseDifficulty = (d: Difficulty) => {
    setDifficulty(d);
    if (mode === 'coop') loadCoop(d, metric);
  };
  const chooseMetric = (m: CoopMetric) => {
    setMetric(m);
    if (mode === 'coop') loadCoop(difficulty, m);
  };

  // The solo board's own read, as it always was (its URL is a variable, which no fetch ratchet counts).
  useEffect(() => {
    if (mode !== 'solo') return;
    let active = true;
    setLoading(true);
    const url = `/api/dream-rift/leaderboard?difficulty=${difficulty}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (active) setSolo(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (active) setSolo([]);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [mode, difficulty]);

  const field =
    FIELD[
      difficulty
    ];

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-[#0a0612] to-[#120a20] px-6 pb-6 pt-[calc(3.5rem+var(--safe-top))] sm:pt-6">
      <h2 className="dr-serif mb-4 text-2xl font-semibold tracking-[0.1em] text-[color:var(--dr-gold)]">
        Leaderboard
      </h2>

      {/* Solo / Co-op toggle */}
      <div className="mb-3 flex gap-2">
        {(
          [
            'solo',
            'coop',
          ] as Mode[]
        ).map(
          (
            m,
          ) => (
            <button
              key={
                m
              }
              type="button"
              onClick={() =>
                chooseMode(
                  m,
                )
              }
              className="dr-serif flex-1 rounded-sm border px-2 py-2 text-xs font-semibold uppercase tracking-[0.18em]"
              style={{
                borderColor:
                  mode ===
                  m
                    ? 'var(--dr-crimson)'
                    : 'rgba(231,205,140,0.22)',
                color:
                  mode ===
                  m
                    ? 'var(--dr-cream)'
                    : 'var(--dr-cream-dim)',
                background:
                  mode ===
                  m
                    ? 'rgba(212,64,90,0.15)'
                    : 'transparent',
              }}
            >
              {m ===
              'solo'
                ? 'Solo'
                : 'Co-op'}
            </button>
          ),
        )}
      </div>

      <div className="mb-3 flex gap-2">
        {DIFFICULTIES.map(
          (
            d,
          ) => (
            <button
              key={
                d
              }
              type="button"
              onClick={() =>
                chooseDifficulty(
                  d,
                )
              }
              className="dr-serif flex-1 rounded-sm border px-2 py-2 text-xs font-semibold uppercase tracking-[0.18em]"
              style={{
                borderColor:
                  difficulty ===
                  d
                    ? DIFF_COLOR[
                        d
                      ]
                    : 'rgba(231,205,140,0.22)',
                color:
                  difficulty ===
                  d
                    ? DIFF_COLOR[
                        d
                      ]
                    : 'var(--dr-cream-dim)',
                background:
                  difficulty ===
                  d
                    ? `${DIFF_COLOR[d]}1a`
                    : 'transparent',
              }}
            >
              {
                d
              }
            </button>
          ),
        )}
      </div>

      {/* Co-op metric toggle */}
      {mode ===
        'coop' && (
        <div className="mb-4 flex gap-2">
          {(
            [
              [
                'combined',
                'Combined Score',
              ],
              [
                'time',
                'Time Survived',
              ],
            ] as [
              CoopMetric,
              string,
            ][]
          ).map(
            ([
              m,
              label,
            ]) => (
              <button
                key={
                  m
                }
                type="button"
                onClick={() =>
                  chooseMetric(
                    m,
                  )
                }
                className="dr-serif flex-1 rounded-sm border px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.16em]"
                style={{
                  borderColor:
                    metric ===
                    m
                      ? 'var(--dr-gold)'
                      : 'rgba(231,205,140,0.22)',
                  color:
                    metric ===
                    m
                      ? 'var(--dr-gold)'
                      : 'var(--dr-cream-dim)',
                  background:
                    metric ===
                    m
                      ? 'rgba(231,205,140,0.1)'
                      : 'transparent',
                }}
              >
                {
                  label
                }
              </button>
            ),
          )}
        </div>
      )}

      <div className="dr-frame flex-1 overflow-auto rounded-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-[color:var(--dr-cream-faint)]">
            Loading…
          </div>
        ) : mode ===
          'solo' ? (
          solo.length ===
          0 ? (
            <div
              className={cn(
                'p-8 text-center text-sm text-[color:var(--dr-cream-faint)]',
                arrival,
              )}
            >
              No
              scores
              yet
              —
              be
              the
              first!
            </div>
          ) : (
            <table
              className={cn(
                'w-full text-left text-sm',
                arrival,
              )}
            >
              <thead className="dr-serif text-[11px] uppercase tracking-[0.16em] text-[color:var(--dr-gold-soft)]">
                <tr>
                  <th className="px-3 py-2">
                    #
                  </th>
                  <th className="px-3 py-2">
                    Player
                  </th>
                  <th className="px-3 py-2">
                    Char
                  </th>
                  <th className="px-3 py-2 text-right">
                    Score
                  </th>
                  <th className="px-3 py-2 text-right">
                    Stage
                  </th>
                </tr>
              </thead>
              <tbody>
                {solo.map(
                  (
                    e,
                    i,
                  ) => (
                    <tr
                      key={
                        i
                      }
                      className="border-t border-[rgba(231,205,140,0.1)]"
                    >
                      <td className="px-3 py-2 font-mono text-[color:var(--dr-cream-dim)]">
                        {i +
                          1}
                      </td>
                      <td className="px-3 py-2 font-bold text-[color:var(--dr-cream)]">
                        <PlayerTag
                          account={
                            e.account
                          }
                          name={
                            e.username
                          }
                        />
                      </td>
                      <td
                        className="px-3 py-2"
                        style={{
                          color:
                            charAccent(
                              e.character,
                            ),
                        }}
                      >
                        {charName(
                          e.character,
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[color:var(--dr-gold)]">
                        {fmt.number(Number(
                          e[
                            field
                          ] ??
                            0,
                        ))}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[color:var(--dr-cream-dim)]">
                        {
                          e.bestStage
                        }
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          )
        ) : coop.length ===
          0 ? (
          <div
            className={cn(
              'p-8 text-center text-sm text-[color:var(--dr-cream-faint)]',
              arrival,
            )}
          >
            {coopFailed
              ? t('board-error', { defaultValue: 'Could not load the co-op board.' })
              : t('board-empty', { defaultValue: 'No co-op runs yet. Squad up!' })}
          </div>
        ) : (
          <table
            className={cn(
              'w-full text-left text-sm',
              arrival,
            )}
          >
            <thead className="dr-serif text-[11px] uppercase tracking-[0.16em] text-[color:var(--dr-gold-soft)]">
              <tr>
                <th className="px-3 py-2">
                  #
                </th>
                <th className="px-3 py-2">
                  Squad
                </th>
                <th className="px-3 py-2 text-right">
                  {metric ===
                  'combined'
                    ? 'Combined'
                    : 'Survived'}
                </th>
                <th className="px-3 py-2 text-right">
                  {metric ===
                  'combined'
                    ? 'Time'
                    : 'Score'}
                </th>
                <th className="px-3 py-2 text-right">
                  Stage
                </th>
              </tr>
            </thead>
            <tbody>
              {coop.map(
                (
                  e,
                  i,
                ) => (
                  <tr
                    key={
                      i
                    }
                    className="border-t border-[rgba(231,205,140,0.1)]"
                  >
                    <td className="px-3 py-2 font-mono text-[color:var(--dr-cream-dim)]">
                      {i +
                        1}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {e.players.map((p, j) => (
                          <CoopTag key={j} player={p} />
                        ))}
                      </div>
                      <div className="mt-0.5 text-[10px] text-[color:var(--dr-cream-faint)]">
                        {
                          e.playerCount
                        }
                        P
                        {e.cleared
                          ? ' · cleared'
                          : ''}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[color:var(--dr-gold)]">
                      {metric ===
                      'combined'
                        ? fmt.number(e.combinedScore)
                        : formatClockSeconds(
                            e.timeSurvived,
                          )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[color:var(--dr-cream-dim)]">
                      {metric ===
                      'combined'
                        ? formatClockSeconds(
                            e.timeSurvived,
                          )
                        : fmt.number(e.combinedScore)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[color:var(--dr-cream-dim)]">
                      {
                        e.stageReached
                      }
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </div>

      <button
        type="button"
        onClick={
          onBack
        }
        className="dr-plaque mt-4 self-start rounded-sm px-5 py-3 text-sm font-semibold"
      >
        Back
      </button>
    </div>
  );
}
