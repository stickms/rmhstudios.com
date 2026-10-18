'use client';

import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Pencil, Sparkles } from 'lucide-react';
import { WidgetFrame } from '@/components/ui/widget-frame';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { NOW_STALE_DAYS, nowIsStale, splitNowText } from '@/lib/profile/plus';
import { useProfilePlus } from './useProfilePlus';

/**
 * P2 — the /now block: what the member is doing these days, in plain text with
 * links, stamped with when it was last updated. After 60 days without an edit it
 * greys out and says so, rather than pretending to be current.
 */
export default function NowModule({
  title,
  userId,
  isOwner,
}: {
  title: string;
  userId: string;
  isOwner: boolean;
}) {
  const { t } = useTranslation('f-profile-plus');
  const view = useProfilePlus(userId);
  const text = view?.nowText ?? null;
  if (view !== undefined && !text && !isOwner) return null;

  const stale = nowIsStale(view?.nowUpdatedAt);
  const updated = view?.nowUpdatedAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
        new Date(view.nowUpdatedAt),
      )
    : null;

  return (
    <WidgetFrame
      title={title}
      icon={Sparkles}
      loading={view === undefined}
      empty={view !== undefined && !text}
      emptyTitle={t('now-empty', { defaultValue: 'What are you up to these days?' })}
      emptyAction={
        <Button asChild variant="accent" size="sm">
          <Link to="/settings/profile">{t('now-write', { defaultValue: 'Write your /now' })}</Link>
        </Button>
      }
      action={
        isOwner && text ? (
          <Button asChild variant="ghost" size="xs">
            <Link to="/settings/profile">
              <Pencil aria-hidden />
              {t('now-edit', { defaultValue: 'Update' })}
            </Link>
          </Button>
        ) : null
      }
    >
      {text ? (
        <div className={cn(stale && 'opacity-60')}>
          <p className="whitespace-pre-wrap break-words text-sm text-site-text">
            {splitNowText(text).map((seg, i) =>
              seg.type === 'link' ? (
                <a
                  key={i}
                  href={seg.href}
                  target="_blank"
                  rel="noopener noreferrer nofollow ugc"
                  className="text-site-accent hover:underline"
                >
                  {seg.value}
                </a>
              ) : (
                <span key={i}>{seg.value}</span>
              ),
            )}
          </p>
          {updated ? (
            <p className="mt-2 text-xs text-site-text-dim">
              {stale
                ? t('now-stale', {
                    date: updated,
                    days: NOW_STALE_DAYS,
                    defaultValue: 'Updated {{date}} — not refreshed in over {{days}} days',
                  })
                : t('now-updated', { date: updated, defaultValue: 'Updated {{date}}' })}
            </p>
          ) : null}
        </div>
      ) : null}
    </WidgetFrame>
  );
}
