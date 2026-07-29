/**
 * RmhTubeHeader — RMHTube's bar. Layout and behaviour are the shared
 * `AppHeader`; this only supplies the name and the live connection status.
 *
 * The hairline is drawn by the room/landing pages themselves, so the bar
 * doesn't draw its own.
 */
'use client';

import AppHeader, { type AppHeaderProps } from '@/components/shared/AppHeader';
import { useRmhTubeStore } from '@/lib/rmhtube/store';

type Props = Omit<AppHeaderProps, 'title' | 'status'>;

export default function RmhTubeHeader(props: Props) {
  const status = useRmhTubeStore((s) => s.connectionStatus);
  return <AppHeader bordered={false} {...props} title="RmhTube" status={status} />;
}
