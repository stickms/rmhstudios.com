'use client';

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIdleReady } from '@/hooks/useIdleReady';
import { api } from './api';

/**
 * "Book office hours" on a profile. Renders nothing unless the member has
 * published windows. The check is one small CDN-cached GET made after idle, so
 * a profile view pays nothing at first paint.
 */
export function OfficeHoursProfileButton({ userId }: { userId: string }) {
  const { t } = useTranslation('f-calendar');
  const idle = useIdleReady();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!idle) return;
    let live = true;
    void api<{ available: boolean }>(
      `/api/office-hours/host/${encodeURIComponent(userId)}/summary`,
    ).then((r) => {
      if (live) setAvailable(!!r.data?.available);
    });
    return () => {
      live = false;
    };
  }, [idle, userId]);

  if (!available) return null;
  return (
    <Link to="/office-hours/$userId" params={{ userId }}>
      <Button variant="outline">
        <CalendarClock aria-hidden />
        <span className="hidden xs:inline">
          {t('book-office-hours', { defaultValue: 'Book office hours' })}
        </span>
        <span className="xs:hidden sr-only">
          {t('book-office-hours', { defaultValue: 'Book office hours' })}
        </span>
      </Button>
    </Link>
  );
}
