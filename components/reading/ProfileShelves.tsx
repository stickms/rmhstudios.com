'use client';

/** L7 on profiles — lazy-loaded when the Shelves tab opens. */

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { SHELVES } from '@/lib/reading/schema';
import { useShelfLabels } from './useShelfLabels';
import { useProfileShelves } from './useShelvesTab';

export default function ProfileShelvesPanel({ ownerId }: { ownerId: string }) {
  const { t } = useTranslation('f-reading');
  const labels = useShelfLabels();
  const { data, isPending } = useProfileShelves(ownerId, true);
  if (isPending) return <Skeleton className="m-4 h-32" />;
  const entries = data?.entries ?? [];
  if (entries.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-site-text-muted">
        {data?.isOwner ? (
          <>
            {t('profile-shelves-owner-empty', { defaultValue: 'Nothing on your shelves yet.' })}{' '}
            <Link
              to="/reading"
              search={{ tab: 'shelves' }}
              className="text-site-accent underline-offset-4 hover:underline"
            >
              {t('manage-shelves', { defaultValue: 'Manage shelves' })}
            </Link>
          </>
        ) : (
          t('profile-shelves-empty', { defaultValue: 'No public shelves.' })
        )}
      </p>
    );
  }
  return (
    <div className="space-y-4 p-4">
      {SHELVES.map((shelf) => {
        const items = entries.filter((e) => e.shelf === shelf);
        if (items.length === 0) return null;
        const pub =
          data?.prefs[
            shelf === 'want' ? 'wantPublic' : shelf === 'reading' ? 'readingPublic' : 'readPublic'
          ];
        return (
          <section key={shelf} className="glass-fill rounded-site p-4">
            <h3 className="font-display font-semibold text-site-text">
              {labels[shelf]} <span className="text-site-text-dim">({items.length})</span>
              {data?.isOwner && !pub ? (
                <span className="ms-2 text-xs font-normal text-site-text-dim">
                  {t('only-you', { defaultValue: 'Only you can see this shelf' })}
                </span>
              ) : null}
            </h3>
            <ul className="mt-2 space-y-1">
              {items.map((e) => (
                <li key={e.slug}>
                  <Link
                    to="/library/$slug"
                    params={{ slug: e.slug }}
                    className="text-site-text hover:underline"
                  >
                    {e.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
