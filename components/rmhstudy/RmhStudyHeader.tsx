/**
 * RmhStudyHeader — RMHStudy's bar. Layout and behaviour are the shared
 * `AppHeader`; this only supplies the name and the live connection status.
 */
'use client';

import AppHeader, { type AppHeaderProps } from '@/components/shared/AppHeader';
import { useRmhStudyStore } from '@/lib/rmhstudy/store';

type Props = Omit<AppHeaderProps, 'title' | 'status'>;

export default function RmhStudyHeader(props: Props) {
  const status = useRmhStudyStore((s) => s.connectionStatus);
  return <AppHeader {...props} title="RMH Study" status={status} />;
}
