/**
 * Project Vega's title screen: the case file. The wordmark over a drawn specimen jar and scan grid, the map
 * picker (each map's corridor drawn from its layout), the start control behind the sign-in gate, the manual, the
 * tutorial and the board of best runs.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { asset } from '@/lib/storage/asset';
import { useSession } from '@/components/session/session-context';
import { useSiteNavigate } from '@/hooks/useSiteNavigate';
import { MAP_ORDER, MAPS, type MapId } from '@features/vega/engine/data';
import { useGameStore } from '@features/vega/engine/GameState';
import type { RunSave } from '@features/vega/engine/Simulation';
import { useVegaNames } from './names';

export interface BoardRow {
  username: string;
  highestLoop: number;
  highestLevel: number;
}

export function Menu({
  save,
  board,
  onStart,
  onResume,
  onTutorial,
}: {
  save: RunSave | null;
  /** The best runs, fetched by the app (null while loading). */
  board: BoardRow[] | null;
  onStart: (map: MapId) => void;
  onResume: () => void;
  onTutorial: () => void;
}) {
  const { t } = useTranslation('c-vega');
  const names = useVegaNames();
  const session = useSession();
  const navigate = useSiteNavigate();
  const mapId = useGameStore((s) => s.mapId);
  const setMap = useGameStore((s) => s.setMap);
  const setManualOpen = useGameStore((s) => s.setManualOpen);
  const signedIn = !!session.data;

  return (
    <main className="vg-menu">
      <MenuBackdrop />
      <section>
        <img
          src={asset('/images/games/logos/vega.webp')}
          alt={t('project-vega', { defaultValue: 'Project Vega' })}
          width={880}
          height={360}
          style={{ display: 'block', width: 'min(560px, 100%)', height: 'auto' }}
        />
        <p style={{ maxWidth: 520, fontSize: 16, lineHeight: 1.55, color: 'var(--vg-muted)', margin: '14px 0 0' }}>
          {t('menu-pitch', {
            defaultValue:
              'A clinical-horror tower defense. Specimens crawl the corridor toward containment; you hold them with eight instruments, wave after wave, until wave 40 or the case is closed.',
          })}
        </p>

        <h2 className="vg-tag" style={{ marginTop: 26 }}>
          {t('choose-map', { defaultValue: 'Choose the ward' })}
        </h2>
        <div className="vg-maps" role="group" aria-label={t('choose-map', { defaultValue: 'Choose the ward' })}>
          {MAP_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className="vg-map"
              aria-pressed={mapId === id}
              onClick={() => setMap(id)}
              data-vega-map={id}
            >
              <MapPreview id={id} />
              <span>
                <span className="vg-title" style={{ display: 'block', fontSize: 20 }}>
                  {names.map(id)}{' '}
                  <span className="vg-mono" style={{ fontSize: 13, color: 'var(--vg-mint)', fontWeight: 400 }}>
                    ×{MAPS[id].scoreMul}
                  </span>
                </span>
                <span
                  style={{ display: 'block', fontSize: 13, lineHeight: 1.4, color: 'var(--vg-muted)', marginTop: 2 }}
                >
                  {names.mapBlurb(id)}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
          {signedIn ? (
            <button type="button" className="vg-btn vg-btn-primary" data-vega-begin onClick={() => onStart(mapId)}>
              {t('begin-intake', { defaultValue: 'Begin intake' })}
            </button>
          ) : (
            <button type="button" className="vg-btn vg-btn-primary" onClick={() => navigate('/login')}>
              {t('sign-in-to-play', { defaultValue: 'Sign In to Play' })}
            </button>
          )}
          {signedIn && save && (
            <button type="button" className="vg-btn" onClick={onResume}>
              {t('resume-run', {
                defaultValue: 'Resume: {{map}}, after wave {{wave}}',
                map: names.map(save.map),
                wave: save.wave,
              })}
            </button>
          )}
          <button type="button" className="vg-btn" onClick={() => setManualOpen(true)}>
            {t('manual', { defaultValue: 'Manual' })}
          </button>
          {signedIn && (
            <button type="button" className="vg-btn" onClick={onTutorial}>
              {t('play-tutorial', { defaultValue: 'Tutorial' })}
            </button>
          )}
        </div>
        {!signedIn && (
          <p style={{ fontSize: 13, color: 'var(--vg-faint)', marginTop: 10 }}>
            {t('signin-note', {
              defaultValue: 'Runs, scores and achievements are kept on your account. The manual is open to everyone.',
            })}
          </p>
        )}
      </section>

      <section>
        <BestRuns board={board} />
      </section>
    </main>
  );
}

/** The board of best runs (best score, then best wave), from the game's own leaderboard. */
export function BestRuns({ board }: { board: BoardRow[] | null }) {
  const { t } = useTranslation('c-vega');
  const fmt = useLocaleFormat();
  return (
    <>
      <h2 className="vg-tag">{t('best-runs', { defaultValue: 'Best runs' })}</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
        <thead>
          <tr className="vg-board-row" style={{ textAlign: 'left', color: 'var(--vg-faint)' }}>
            <th scope="col" style={{ fontWeight: 600, width: 34 }}>
              #
            </th>
            <th scope="col" style={{ fontWeight: 600 }}>
              {t('board-operator', { defaultValue: 'Operator' })}
            </th>
            <th scope="col" style={{ fontWeight: 600, textAlign: 'right' }}>
              {t('board-wave', { defaultValue: 'Wave' })}
            </th>
            <th scope="col" style={{ fontWeight: 600, textAlign: 'right' }}>
              {t('board-score', { defaultValue: 'Score' })}
            </th>
          </tr>
        </thead>
        <tbody>
          {board === null ? (
            <tr className="vg-board-row">
              <td colSpan={4} style={{ color: 'var(--vg-faint)' }}>
                {t('board-loading', { defaultValue: 'Reading the files.' })}
              </td>
            </tr>
          ) : board.length === 0 ? (
            <tr className="vg-board-row">
              <td colSpan={4} style={{ color: 'var(--vg-faint)' }}>
                {t('board-empty', { defaultValue: 'No runs filed yet.' })}
              </td>
            </tr>
          ) : (
            board.map((r, i) => (
              <tr key={`${r.username}-${i}`} className="vg-board-row">
                <td className="vg-mono" style={{ color: 'var(--vg-faint)' }}>
                  {String(i + 1).padStart(2, '0')}
                </td>
                <td>{r.username}</td>
                <td className="vg-mono" style={{ textAlign: 'right' }}>
                  {r.highestLoop}
                </td>
                <td className="vg-mono" style={{ textAlign: 'right', color: 'var(--vg-mint)' }}>
                  {fmt.number(r.highestLevel)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}

/** A map's corridor, drawn from its layout: benches as dark tiles, the corridor as a tissue channel. */
export function MapPreview({ id }: { id: MapId }) {
  const rows = MAPS[id].layout;
  const cells: ReactElement[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '#' || ch === 'S' || ch === 'E') {
        cells.push(
          <rect
            key={`${x}-${y}`}
            x={x * 6}
            y={y * 6}
            width={6}
            height={6}
            fill={ch === 'E' ? '#e0393e' : ch === 'S' ? '#8ef0c4' : '#5a1a1f'}
          />,
        );
      } else if (ch === 'x') {
        cells.push(<circle key={`${x}-${y}`} cx={x * 6 + 3} cy={y * 6 + 3} r={2} fill="#3e8a6c" />);
      }
    }),
  );
  return (
    <svg viewBox="0 0 120 78" aria-hidden>
      <rect width="120" height="78" fill="#06100d" />
      {cells}
    </svg>
  );
}

/** The menu's backdrop: scan grid, registration marks, a specimen jar and a flat ECG trace. Static. */
export function MenuBackdrop() {
  return (
    <svg className="vg-menu-backdrop" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <pattern id="vg-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="#0c1f19" strokeWidth="1" />
          <path d="M-3 0H3M0 -3V3" stroke="#1c3a31" strokeWidth="1" />
        </pattern>
        <pattern id="vg-scan" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="1" fill="#000" opacity="0.35" />
        </pattern>
      </defs>
      <rect width="1600" height="1000" fill="#020504" />
      <rect width="1600" height="1000" fill="url(#vg-grid)" />
      {/* The jar: glass, fluid line, the curled thing inside, a tag. */}
      <g className="vg-menu-jar" transform="translate(1200 640) scale(0.85)" opacity="0.85">
        <rect x="-170" y="-330" width="340" height="40" rx="6" fill="#0b1613" stroke="#2f5d4f" strokeWidth="3" />
        <path
          d="M-150 -290 V280 Q-150 320 -110 320 H110 Q150 320 150 280 V-290"
          fill="#06120f"
          stroke="#2f5d4f"
          strokeWidth="3"
        />
        <path d="M-148 -200 H148" stroke="#3e8a6c" strokeWidth="2" opacity="0.6" />
        <path d="M-120 -170 V260" stroke="#e6f2ee" strokeWidth="6" opacity="0.08" />
        <g fill="none" stroke="#b98a86" strokeLinecap="round">
          <path
            d="M20 160 C-80 150 -95 40 -30 -10 C30 -55 95 -10 80 60 C68 115 0 120 -10 70"
            strokeWidth="26"
            opacity="0.85"
          />
          <path d="M-10 70 C-15 40 20 30 35 50" strokeWidth="14" opacity="0.85" />
        </g>
        <circle cx="-38" cy="-30" r="34" fill="#c58b8e" />
        <circle cx="-48" cy="-36" r="9" fill="#2a0d10" />
        <rect x="-110" y="190" width="150" height="60" fill="#e6f2ee" />
        <path d="M-100 210 H20 M-100 230 H-10" stroke="#0b1613" strokeWidth="5" />
      </g>
      {/* The ECG trace across the bottom. */}
      <path
        className="vg-menu-jar"
        d="M0 900 H520 l18 -16 l14 16 h30 l10 10 l14 -90 l16 120 l12 -40 h40 q20 -26 40 0 H1600"
        fill="none"
        stroke="#8ef0c4"
        strokeWidth="2"
        opacity="0.45"
      />
      {[
        [40, 40],
        [1560, 40],
        [40, 960],
        [1560, 960],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`} stroke="#5e8f80" fill="none" strokeWidth="1.5">
          <circle cx={x} cy={y} r="11" />
          <path d={`M${x! - 18} ${y}H${x! + 18}M${x} ${y! - 18}V${y! + 18}`} />
        </g>
      ))}
      <rect width="1600" height="1000" fill="url(#vg-scan)" />
    </svg>
  );
}
