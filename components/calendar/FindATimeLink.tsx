'use client';

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * "Find a time" — starts an availability poll attached to a group chat or a
 * community. The poll form (and everything heavy) lives on /when, so mounting
 * this adds one link to the page it sits on.
 */
export function FindATimeLink({
  groupChatId,
  communityId,
  variant = 'icon',
}: {
  groupChatId?: string;
  communityId?: string;
  variant?: 'icon' | 'button';
}) {
  const { t } = useTranslation('f-calendar');
  const label = t('find-a-time', { defaultValue: 'Find a time' });
  const search = groupChatId ? { groupChatId } : { communityId };
  if (variant === 'button') {
    return (
      <Link to="/when" search={search}>
        <Button size="sm" variant="outline">
          <CalendarCheck /> {label}
        </Button>
      </Link>
    );
  }
  return (
    <Link
      to="/when"
      search={search}
      aria-label={label}
      title={label}
      className="flex size-11 items-center justify-center rounded-full text-site-text-dim hover:bg-site-surface-hover hover:text-site-text focus-visible:ring-2 focus-visible:ring-site-accent"
    >
      <CalendarCheck className="size-5" aria-hidden />
    </Link>
  );
}
