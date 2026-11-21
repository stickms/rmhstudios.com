/**
 * RmhTypeHeader — RMHType's bar. Layout and behaviour are the shared
 * `AppHeader`; this only supplies the name and the live connection status.
 */

import AppHeader, {
  type AppHeaderProps,
} from '@/components/shared/AppHeader';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useRmhTypeStore } from '@/lib/rmhtype/store';

type Props =
  Omit<
    AppHeaderProps,
    | 'title'
    | 'status'
  >;

export default function RmhTypeHeader(
  props: Props,
) {
  const status =
    useRmhTypeStore(
      (
        s,
      ) =>
        s.connectionStatus,
    );
  const {
    t,
  } =
    useTranslation(
      'rmhtype-progress',
    );
  // A room is a live race: the link to the member's history stays out of it.
  const progressLink =
    props.roomCode ? null : (
      <Link
        to="/rmhtype/progress"
        className="text-sm text-app-text-muted underline-offset-4 hover:text-app-text aria-[current=page]:text-app-text"
      >
        {t(
          'header-link',
          {
            defaultValue:
              'Progress',
          },
        )}
      </Link>
    );
  return (
    <AppHeader
      rightActions={
        progressLink
      }
      {...props}
      title="RMH Type"
      status={
        status
      }
    />
  );
}
