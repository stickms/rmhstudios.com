/**
 * RmhTubeHeader — RMHTube's bar. Layout and behaviour are the shared
 * `AppHeader`; this only supplies the name and the live connection status.
 *
 * The hairline is drawn by the room/landing pages themselves, so the bar
 * doesn't draw its own.
 */

import AppHeader, { type AppHeaderProps } from '@/components/shared/AppHeader';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import ReportRoomButton from '@/components/rmhtube/ReportRoomButton';

type Props = Omit<AppHeaderProps, 'title' | 'status'> & {
  /** s14-10: a room's code puts "Report this room" in the bar (not on a room you host: pass `reportIsHost`). */
  reportRoomId?: string;
  reportIsHost?: boolean;
};

export default function RmhTubeHeader({ reportRoomId, reportIsHost, rightActions, ...props }: Props) {
  const status = useRmhTubeStore((s) => s.connectionStatus);
  return (
    <AppHeader
      bordered={false}
      {...props}
      rightActions={
        <>
          {rightActions}
          {reportRoomId && <ReportRoomButton roomId={reportRoomId} isHost={reportIsHost ?? false} variant="icon" />}
        </>
      }
      title="RmhTube"
      status={status}
    />
  );
}
