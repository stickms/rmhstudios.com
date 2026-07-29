/**
 * RmhTypeHeader — RMHType's bar. Layout and behaviour are the shared
 * `AppHeader`; this only supplies the name and the live connection status.
 */
'use client';

import AppHeader, { type AppHeaderProps } from '@/components/shared/AppHeader';
import { useRmhTypeStore } from '@/lib/rmhtype/store';

type Props = Omit<AppHeaderProps, 'title' | 'status'>;

export default function RmhTypeHeader(props: Props) {
  const status = useRmhTypeStore((s) => s.connectionStatus);
  return <AppHeader {...props} title="RMH Type" status={status} />;
}
