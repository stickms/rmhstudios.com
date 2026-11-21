/** s03-04: "N notes" on a reported member in the moderation queue, linking to the Notes section of their panel. */
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export function NoteCount({
  user,
  count,
}: {
  user: {
    id: string;
    name:
      | string
      | null;
    handle:
      | string
      | null;
  };
  count: number;
}) {
  const {
    t,
  } =
    useTranslation(
      'mod-notes',
    );
  if (
    count <=
    0
  )
    return null;
  return (
    <Link
      to="/admin/users"
      search={{
        q:
          user.handle ||
          user.name ||
          '',
        open: user.id,
      }}
      className="t-meta underline"
    >
      {t(
        'queue-count',
        {
          count,
          defaultValue_one:
            '{{count}} note',
          defaultValue_other:
            '{{count}} notes',
          defaultValue:
            '{{count}} notes',
        },
      )}
    </Link>
  );
}
