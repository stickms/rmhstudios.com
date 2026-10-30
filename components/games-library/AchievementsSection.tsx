'use client';

import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { DetailAchievement } from '@/lib/games/detail-types';
import { cn } from '@/lib/utils';

/**
 * A title's achievements, Steam-style: icon, name, what it asks, how far along.
 * Renders nothing for a title with none, so no page carries an empty section.
 */
export function AchievementsSection({
  items,
  signedIn,
}: {
  items: DetailAchievement[];
  signedIn: boolean;
}) {
  const { t } = useTranslation('games-hub');
  if (items.length === 0) return null;
  const done = items.filter((a) => a.unlocked).length;

  return (
    <section aria-labelledby="library-achievements">
      <h2 id="library-achievements" className="site-section-label pb-2">
        {t('detail-achievements', { defaultValue: 'Achievements' })}{' '}
        {signedIn ? (
          <span className="font-mono text-site-text-dim">
            {done} / {items.length}
          </span>
        ) : null}
      </h2>
      <ul className="grid gap-2 md:grid-cols-2">
        {items.map((a) => {
          const pct =
            a.target > 1
              ? Math.min(100, Math.round((a.progress / a.target) * 100))
              : a.unlocked
                ? 100
                : 0;
          return (
            <li key={a.id} className="glass-fill flex items-center gap-3 rounded-site px-4 py-3">
              <span aria-hidden className="text-2xl leading-none">
                {a.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p
                    className={cn(
                      'truncate text-sm font-medium',
                      a.unlocked ? 'text-site-text' : 'text-site-text-muted',
                    )}
                  >
                    {a.name}
                  </p>
                  {a.unlocked ? (
                    <>
                      <Check className="size-4 shrink-0 text-site-success" aria-hidden />
                      <span className="sr-only">
                        {t('detail-unlocked', { defaultValue: 'Unlocked' })}
                      </span>
                    </>
                  ) : null}
                </div>
                <p className="text-xs text-site-text-muted">{a.description}</p>
                {a.target > 1 && signedIn ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={a.target}
                      aria-valuenow={Math.min(a.progress, a.target)}
                      aria-label={a.name}
                      className="h-1.5 flex-1 rounded-site-sm bg-site-surface-active"
                    >
                      <div
                        className="h-full rounded-site-sm bg-site-accent"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs text-site-text-muted">
                      {Math.min(a.progress, a.target)} / {a.target}
                    </span>
                  </div>
                ) : null}
              </div>
              <Badge size="sm">{a.tier}</Badge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
