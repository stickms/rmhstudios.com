'use client';

import { useTranslation } from 'react-i18next';
import { Award } from 'lucide-react';
import { CopyButton } from '@/components/ui/copy-button';

/** D2 — copyable README snippets for the public stat badges. */
export function BadgeSnippets({ userId }: { userId: string }) {
  const { t } = useTranslation('f-devplatform');
  const who = userId;
  const origin = typeof window === 'undefined' ? 'https://rmhstudios.com' : window.location.origin;
  const rows = [
    {
      label: t('badges-streak', { defaultValue: 'Daily streak' }),
      path: `/api/badge/${who}/streak.svg`,
    },
    {
      label: t('badges-game', { defaultValue: 'Game score (replace GAME_ID)' }),
      path: `/api/badge/${who}/GAME_ID.svg`,
    },
  ];
  return (
    <section className="space-y-2" aria-labelledby="badges-heading">
      <div className="flex items-center gap-2">
        <Award className="h-4 w-4 text-site-accent" aria-hidden />
        <h2 id="badges-heading" className="text-sm font-bold text-site-text">
          {t('badges-title', { defaultValue: 'Stat badges' })}
        </h2>
      </div>
      <p className="text-xs text-site-text-muted">
        {t('badges-blurb', {
          defaultValue:
            'Public SVG badges for your README or site. They show your best score and rank, or your streak, and refresh every few minutes.',
        })}
      </p>
      {rows.map((r) => {
        const md = `![${r.label}](${origin}${r.path})`;
        return (
          <div key={r.path} className="glass-fill flex items-center gap-2 rounded-site p-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-site-text-dim">{r.label}</p>
              <code className="block truncate text-xs text-site-text">{md}</code>
            </div>
            <CopyButton
              value={md}
              variant="accent"
              size="icon-sm"
              label={t('badges-copy', { defaultValue: 'Copy Markdown' })}
            />
          </div>
        );
      })}
    </section>
  );
}
