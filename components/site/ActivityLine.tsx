'use client';

import { useTranslation } from 'react-i18next';
import { Gamepad2, Music, MonitorPlay, Radio, Circle, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { PresenceActivity, PresenceActivityKind } from '@/lib/presence-types';

/**
 * ActivityLine (§9) — the shared one-line "what they're doing" renderer used by
 * the Friends rail, the mobile sheet, the profile header, and hover cards. A
 * null activity renders a plain "Online". Truncates to one line everywhere.
 */

const ACTIVITY_ICON: Record<PresenceActivityKind, LucideIcon> = {
  game: Gamepad2,
  music_room: Music,
  tube_room: MonitorPlay,
  space: Radio,
};

export function ActivityLine({
  activity,
  className,
}: {
  activity: PresenceActivity | null;
  className?: string;
}) {
  const { t } = useTranslation('site');

  if (!activity) {
    return (
      <span className={cn('flex items-center gap-1.5 text-xs text-site-text-dim', className)}>
        <Circle className="h-2 w-2 shrink-0 fill-site-success text-site-success" aria-hidden />
        <span className="truncate">{t('presence-online', { defaultValue: 'Online' })}</span>
      </span>
    );
  }

  const Icon = ACTIVITY_ICON[activity.kind] ?? Circle;
  return (
    <span className={cn('flex items-center gap-1.5 text-xs text-site-accent', className)}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">
        {t(`presence-activity-${activity.kind}`, { defaultValue: activity.label })}
      </span>
    </span>
  );
}
