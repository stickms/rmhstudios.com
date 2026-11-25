/**
 * Project Vega's end screen: the case report. Score and how it was made, the run's facts, what it unlocked, and
 * whether it reached the board.
 */
import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { ACHIEVEMENTS } from '@/lib/achievements/catalog';
import { WAVES } from '@features/vega/engine/data';
import type { EndResult } from '@features/vega/engine/GameState';
import { useVegaNames } from './names';
import { BestRuns, MenuBackdrop, type BoardRow } from './Menu';
import { EndNotRanked } from './AssistBits';

export type SubmitState = 'idle' | 'sending' | 'saved' | 'record' | 'refused' | 'offline' | 'signed-out';

export function EndScreen({
  result,
  submit,
  ranked,
  assisted,
  board,
  onAgain,
  onMenu,
}: {
  result: EndResult;
  submit: SubmitState;
  /** The server's answer; false when assists kept the run off the board. */
  ranked: boolean | null;
  /** The run's claim said assists were on (decides the line before the server answers; achievements are withheld). */
  assisted: boolean;
  board: BoardRow[] | null;
  onAgain: () => void;
  onMenu: () => void;
}) {
  const { t } = useTranslation('c-vega');
  const fmt = useLocaleFormat();
  const names = useVegaNames();
  const s = result.stats;
  const minutes = Math.floor(result.durationMs / 60_000);
  const seconds = Math.floor((result.durationMs % 60_000) / 1000);
  const headline = result.complete
    ? t('end-complete', { defaultValue: 'Case complete' })
    : result.contained
      ? t('end-contained', { defaultValue: 'Contained, then filed' })
      : t('end-lost', { defaultValue: 'Containment lost' });
  const earned = result.achievements
    .map((id) => ACHIEVEMENTS.find((a) => a.id === id))
    .filter((a): a is (typeof ACHIEVEMENTS)[number] => !!a);

  let submitText = '';
  switch (submit) {
    case 'sending':
      submitText = t('submit-sending', { defaultValue: 'Filing the report.' });
      break;
    case 'saved':
      submitText = t('submit-saved', { defaultValue: 'Report filed.' });
      break;
    case 'record':
      submitText = t('submit-record', { defaultValue: 'Report filed. A new personal best.' });
      break;
    case 'refused':
      submitText = t('submit-refused', { defaultValue: 'The board refused this report.' });
      break;
    case 'offline':
      submitText = t('submit-offline', { defaultValue: 'Could not reach the board. The score was not filed.' });
      break;
    case 'signed-out':
      submitText = t('submit-signed-out', { defaultValue: 'Sign in to file reports to the board.' });
      break;
    default:
      break;
  }

  return (
    <main className="vg-menu">
      <MenuBackdrop />
      <section aria-labelledby="vg-end-title">
        <p className={result.contained ? 'vg-tag' : 'vg-tag is-danger'}>
          {t('end-kicker', { defaultValue: 'Case report · {{map}}', map: names.map(result.map) })}
        </p>
        <h1
          id="vg-end-title"
          className="vg-title"
          style={{
            margin: '10px 0 0',
            fontSize: 'clamp(40px, 8vw, 72px)',
            color: result.contained ? 'var(--vg-ink)' : 'var(--vg-blood)',
          }}
        >
          {headline}
        </h1>
        <Trace alive={result.contained} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
          <span
            className="vg-mono"
            style={{ fontSize: 'clamp(40px, 9vw, 64px)', color: 'var(--vg-mint)' }}
            data-vega-final-score
          >
            {fmt.number(result.score)}
          </span>
          <span style={{ color: 'var(--vg-muted)' }}>
            {t('end-waves', { defaultValue: '{{n}} waves held of {{goal}}', n: result.cleared, goal: WAVES.GOAL })}
          </span>
        </div>
        <p
          className="vg-mono"
          style={{
            fontSize: 13,
            color: submit === 'refused' || submit === 'offline' ? 'var(--vg-blood)' : 'var(--vg-faint)',
          }}
          aria-live="polite"
        >
          {submitText}
        </p>
        <EndNotRanked ranked={assisted ? false : ranked} />

        <hr className="vg-rule" style={{ margin: '18px 0' }} />
        <dl
          className="vg-stat-grid"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px 18px', fontSize: 18 }}
        >
          <div>
            <dt>{t('end-kills', { defaultValue: 'Specimens destroyed' })}</dt>
            <dd>{s.kills}</dd>
          </div>
          <div>
            <dt>{t('end-bosses', { defaultValue: 'Bosses' })}</dt>
            <dd>{s.bossesKilled}</dd>
          </div>
          <div>
            <dt>{t('end-perfect', { defaultValue: 'Clean waves' })}</dt>
            <dd>{s.perfectWaves}</dd>
          </div>
          <div>
            <dt>{t('end-early', { defaultValue: 'Called early' })}</dt>
            <dd>{s.earlyCalls}</dd>
          </div>
          <div>
            <dt>{t('end-integrity', { defaultValue: 'Integrity lost' })}</dt>
            <dd>{s.integrityLost}</dd>
          </div>
          <div>
            <dt>{t('end-instruments', { defaultValue: 'Instruments built' })}</dt>
            <dd>{s.towersBuilt}</dd>
          </div>
          <div>
            <dt>{t('end-serum', { defaultValue: 'Serum earned' })}</dt>
            <dd>{fmt.number(s.serumEarned)}</dd>
          </div>
          <div>
            <dt>{t('end-time', { defaultValue: 'Time' })}</dt>
            <dd>
              {minutes}:{String(seconds).padStart(2, '0')}
            </dd>
          </div>
        </dl>

        {earned.length > 0 && !assisted && (
          <>
            <hr className="vg-rule" style={{ margin: '18px 0' }} />
            <h2 className="vg-tag">{t('end-achievements', { defaultValue: 'Achievements this run' })}</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
              {earned.map((a) => (
                <li
                  key={a.id}
                  style={{
                    padding: '6px 0',
                    borderBottom: '1px solid var(--vg-line)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <span>
                    <strong style={{ fontWeight: 600 }}>{a.name}</strong>
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--vg-muted)' }}>{a.description}</span>
                  </span>
                  <span className="vg-mono" style={{ color: 'var(--vg-mint)', fontSize: 13 }}>
                    +{a.coinReward}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 24 }}>
          <button type="button" className="vg-btn vg-btn-primary" onClick={onAgain} data-vega-again>
            {t('new-intake', { defaultValue: 'New intake' })}
          </button>
          <button type="button" className="vg-btn" onClick={onMenu}>
            {t('to-menu', { defaultValue: 'Case files' })}
          </button>
        </div>
      </section>
      <section>
        <BestRuns board={board} />
      </section>
    </main>
  );
}

/** The monitor strip under the headline: a beating trace for a contained run, a flatline for a lost one. */
function Trace({ alive }: { alive: boolean }) {
  const beat = 'l14 -10 l10 10 h22 l8 8 l10 -64 l12 84 l10 -28 h30 q16 -20 32 0';
  const d = alive ? `M0 60 h40 ${beat} h70 ${beat} h70 ${beat} H760` : `M0 60 h40 ${beat} h70 l10 -6 l8 6 H760`;
  return (
    <svg
      viewBox="0 0 760 100"
      aria-hidden
      style={{ display: 'block', width: '100%', maxWidth: 620, height: 'auto', marginTop: 14 }}
    >
      <path d="M0 99.5H760" stroke="#1d3a31" />
      <path d={d} fill="none" stroke={alive ? '#8ef0c4' : '#ef5a5e'} strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}
