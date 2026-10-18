'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Moon } from 'lucide-react';
import { localClock, type LocalClock } from '@/lib/profile/plus';
import { useIdleReady } from '@/hooks/useIdleReady';
import { useProfilePlus } from './useProfilePlus';
import { cn } from '@/lib/utils';

/**
 * "It's 2:14 AM for Ana" (P4). The clock is computed in the browser with Intl
 * from the member's opt-in IANA zone — nothing about the viewer is sent
 * anywhere, and it ticks once a minute, not per frame.
 */
function useLocalClock(timezone: string | null | undefined): LocalClock | null {
  const [clock, setClock] = useState<LocalClock | null>(null);
  useEffect(() => {
    if (!timezone) {
      setClock(null);
      return;
    }
    const tick = () => setClock(localClock(timezone, new Date(), document.documentElement.lang));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [timezone]);
  return clock;
}

export function LocalTimeChip({
  timezone,
  name,
  className,
}: {
  timezone: string | null | undefined;
  name: string;
  className?: string;
}) {
  const { t } = useTranslation('f-profile-plus');
  const clock = useLocalClock(timezone);
  if (!clock) return null;
  const Icon = clock.isNight ? Moon : Clock;
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-sm text-site-text-muted', className)}
      title={timezone ?? undefined}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span>
        {t('local-time', {
          time: clock.time,
          name,
          defaultValue: "It's {{time}} for {{name}}",
        })}
      </span>
    </span>
  );
}

/**
 * The DM header's version: fetches the other member's public extras (one small
 * cacheable request) once the header has rendered, and renders nothing for the
 * many members who have not shared a timezone.
 */
export default function DmLocalTime({ userId, name }: { userId: string; name: string }) {
  // After first paint and idle: the header must never wait on this.
  const idle = useIdleReady();
  const view = useProfilePlus(userId, idle);
  if (!view?.timezone) return null;
  return <LocalTimeChip timezone={view.timezone} name={name} className="text-xs" />;
}
