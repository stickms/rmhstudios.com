/**
 * The end of a run: a cooled ingot on defeat, a fresh-poured one on victory, the run's numbers, the score
 * submission and the achievements it unlocked.
 */
import { useTranslation } from 'react-i18next';
import { SIGNAL_FORGE_ACHIEVEMENT_NAMES } from '@features/signal-forge/engine/achievements';
import { finalScore, floorOf } from '@features/signal-forge/engine/run';
import type { RunState } from '@features/signal-forge/engine/types';
import { Icon } from './art/glyphs';
import { LeaderboardPanel } from './Modals';

export type SubmitStatus = 'idle' | 'sending' | 'done' | 'failed' | 'signed-out' | 'unranked';

interface Props {
  run: RunState;
  status: SubmitStatus;
  achievements: string[];
  unlockedAscension: number | null;
  onMenu: () => void;
  onAgain: () => void;
}

export function EndScreen({ run, status, achievements, unlockedAscension, onMenu, onAgain }: Props) {
  const { t } = useTranslation('c-signal-forge');
  const won = run.phase === 'victory';
  const s = run.stats;
  const stats: Array<[string, string | number]> = [
    [t('end.floor', { defaultValue: 'Floor' }), floorOf(run)],
    [t('end.bursts', { defaultValue: 'Forge Bursts' }), s.bursts],
    [t('end.perfects', { defaultValue: 'Perfects' }), run.mode === 'timed' ? s.perfects : '-'],
    [t('end.max-hit', { defaultValue: 'Biggest hit' }), s.maxHit],
    [t('end.elites', { defaultValue: 'Elites' }), s.elitesWon],
    [t('end.cards', { defaultValue: 'Cards played' }), s.cardsPlayed],
  ];
  return (
    <section className={`sf-end ${won ? 'is-won' : 'is-lost'}`} aria-labelledby="sf-end-title">
      <svg className="sf-ingot" viewBox="0 0 200 90" aria-hidden>
        <defs>
          <linearGradient id="sf-ingot-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={won ? '#FFF1C2' : '#5A4A40'} />
            <stop offset="45%" stopColor={won ? '#FFB23E' : '#3A2E28'} />
            <stop offset="100%" stopColor={won ? '#C2410C' : '#1A1410'} />
          </linearGradient>
        </defs>
        <path d="M30 20 H170 L190 75 H10 Z" fill="url(#sf-ingot-g)" stroke={won ? '#FFD27A' : '#6A5040'} strokeWidth={2} />
        <path d="M40 30 H160" stroke={won ? '#FFF1C2' : '#7A6050'} strokeOpacity={0.6} strokeWidth={2} />
      </svg>
      <span className="sf-label">{won ? t('end.won-kicker', { defaultValue: 'The forge is yours' }) : t('end.lost-kicker', { defaultValue: 'The fire went out' })}</span>
      <h2 id="sf-end-title" className="sf-title sf-title-xl">
        {won ? t('end.won', { defaultValue: 'Victory' }) : t('end.lost', { defaultValue: 'Run over' })}
      </h2>
      <p className="sf-end-score">
        <span className="sf-label">{t('end.score', { defaultValue: 'Score' })}</span>
        <b className="sf-mono">{finalScore(run).toLocaleString()}</b>
      </p>
      <dl className="sf-end-stats">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="sf-mono">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="sf-muted" role="status">
        {status === 'sending' && t('end.sending', { defaultValue: 'Recording the score.' })}
        {status === 'done' && t('end.sent', { defaultValue: 'Score recorded.' })}
        {status === 'unranked' && t('end.unranked', { defaultValue: 'Score recorded. Assisted runs stay off the leaderboard.' })}
        {status === 'failed' && t('end.failed', { defaultValue: 'The score could not be sent.' })}
        {status === 'signed-out' && t('end.signed-out', { defaultValue: 'Sign in to record scores.' })}
      </p>
      {unlockedAscension !== null && (
        <p className="sf-unlock">
          <Icon name="heat" size={16} color="#FF8A2A" /> {t('end.asc-unlocked', { defaultValue: 'Ascension {{n}} is open.', n: unlockedAscension })}
        </p>
      )}
      {achievements.length > 0 && (
        <ul className="sf-ach-list" aria-label={t('end.achievements', { defaultValue: 'Achievements unlocked' })}>
          {achievements.map((id) => (
            <li key={id}>
              <Icon name="trophy" size={14} color="#FFD27A" /> {t(`ach.${id}`, { defaultValue: SIGNAL_FORGE_ACHIEVEMENT_NAMES[id] ?? id })}
            </li>
          ))}
        </ul>
      )}
      <div className="sf-panel-foot">
        <button type="button" className="sf-btn sf-btn-hot" onClick={onAgain}>
          {t('end.again', { defaultValue: 'New run' })}
        </button>
        <button type="button" className="sf-btn" onClick={onMenu}>
          {t('end.menu', { defaultValue: 'Main menu' })}
        </button>
      </div>
      <LeaderboardPanel compact />
    </section>
  );
}
