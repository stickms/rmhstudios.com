/**
 * RmhStudyHeader — RMHStudy's bar. Layout and behaviour are the shared
 * `AppHeader`; this only supplies the name, the live connection status and
 * the link to the focus history.
 */

import { Link } from '@tanstack/react-router';
import { ChartColumn } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AppHeader, { type AppHeaderProps } from '@/components/shared/AppHeader';
import { useRmhStudyStore } from '@/lib/rmhstudy/store';

type Props = Omit<AppHeaderProps, 'title' | 'status'>;

export default function RmhStudyHeader({ rightActions, ...props }: Props) {
  const { t } = useTranslation('rmhstudy-focus');
  const status = useRmhStudyStore((s) => s.connectionStatus);
  return (
    <AppHeader
      {...props}
      title="RMH Study"
      status={status}
      rightActions={
        <>
          {/* Not inside a room: following the link would leave it without the leave handshake. */}
          {props.roomCode ? null : (
            <Link
              to="/rmhstudy/history"
              aria-label={t('header-history', {
                defaultValue: 'Focus history',
              })}
              className="inline-flex h-9 w-9 items-center justify-center rounded-app-sm text-app-text-muted hover:text-app-text aria-[current=page]:text-app-accent"
            >
              <ChartColumn className="h-5 w-5" aria-hidden />
            </Link>
          )}
          {rightActions}
        </>
      }
    />
  );
}
