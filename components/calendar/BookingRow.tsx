'use client';

import { useTranslation } from 'react-i18next';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { OfficeHoursBookingView } from '@/lib/calendar/types';

/** One upcoming office-hours booking, with its calendar download and cancel. */
export function BookingRow({
  booking,
  viewerId,
  onCancel,
}: {
  booking: OfficeHoursBookingView;
  viewerId: string;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation('f-calendar');
  const other = booking.host.id === viewerId ? booking.guest : booking.host;
  const when = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(booking.startsAt));
  return (
    <li className="glass-fill flex flex-wrap items-center justify-between gap-3 rounded-site p-3">
      <div className="flex min-w-0 items-center gap-2">
        <UserAvatar src={other.image} alt="" size={32} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-site-text">{when}</p>
          <p className="truncate text-xs text-site-text-muted">
            {other.name ?? other.handle}
            {booking.note ? ` · ${booking.note}` : ''}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <a href={`/api/office-hours/bookings/${booking.id}/ics`} download>
          <Button size="sm" variant="outline">
            <Download /> {t('oh-ics', { defaultValue: 'Calendar file' })}
          </Button>
        </a>
        <Button size="sm" variant="outline" onClick={onCancel}>
          <X /> {t('oh-cancel', { defaultValue: 'Cancel' })}
        </Button>
      </div>
    </li>
  );
}
