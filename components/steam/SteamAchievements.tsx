'use client';

import { useTranslation } from 'react-i18next';
import type { DetailAchievement } from '@/lib/games/detail-types';
import { AchievementIcon } from './AchievementIcon';

/**
 * A title's achievements as Steam lists them: a summary line with a progress bar, then
 * each one with its square icon, name, what it asks and (for the long ones) how far
 * along you are. Renders nothing for a title with none.
 */
export function SteamAchievements({
  items,
  signedIn,
}: {
  items: DetailAchievement[];
  signedIn: boolean;
}) {
  const { t } = useTranslation('games-hub');
  if (items.length === 0) return null;
  const done = items.filter((a) => a.unlocked).length;
  const pct = Math.round((done / items.length) * 100);

  return (
    <section id="achievements" className="stm-card" aria-labelledby="stm-ach-h">
      <h2 id="stm-ach-h" className="stm-card-head">
        {t('steam-achievements', { defaultValue: 'Achievements' })}
      </h2>
      {signedIn ? (
        <div className="stm-ach-summary">
          <span>
            {t('steam-ach-summary', {
              defaultValue: 'You have unlocked {{done}} of {{total}} ({{pct}}%)',
              done,
              total: items.length,
              pct,
            })}
          </span>
          <div
            className="stm-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={items.length}
            aria-valuenow={done}
            aria-label={t('steam-achievements', { defaultValue: 'Achievements' })}
          >
            <div className="stm-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : (
        <p className="stm-muted stm-card-note">
          {t('steam-ach-signin', { defaultValue: 'Sign in to see which of these you have unlocked.' })}
        </p>
      )}
      <ul className="stm-ach-list">
        {items.map((a) => {
          const p = Math.min(a.progress, a.target);
          return (
            <li key={a.id} className="stm-ach" data-unlocked={a.unlocked ? 'true' : 'false'}>
              <AchievementIcon id={a.id} tier={a.tier} unlocked={a.unlocked} target={a.target} size={56} />
              <div className="stm-ach-body">
                <h3>{a.name}</h3>
                <p>{a.description}</p>
                {signedIn && a.target > 1 && !a.unlocked ? (
                  <div className="stm-ach-progress">
                    <div
                      className="stm-bar stm-bar-thin"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={a.target}
                      aria-valuenow={p}
                      aria-label={a.name}
                    >
                      <div className="stm-bar-fill" style={{ width: `${Math.round((p / a.target) * 100)}%` }} />
                    </div>
                    <span>
                      {p} / {a.target}
                    </span>
                  </div>
                ) : null}
              </div>
              <span className="stm-ach-state">
                {a.unlocked
                  ? t('steam-ach-unlocked', { defaultValue: 'Unlocked' })
                  : t('steam-ach-locked', { defaultValue: 'Locked' })}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
