import {
  useEffect,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollText } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { NoteBody } from '@/components/devplatform/NoteBody';
import type { ReleaseNoteView } from '@/lib/devplatform/release-notes';
import { api } from '@/lib/contract/client';
import { releaseNotesApi } from '@/lib/site-reads.contract';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

/** Public changelog: the published release notes, newest first. */
export function ChangelogList() {
  const {
    t,
  } =
    useTranslation(
      'f-devplatform',
    );
  const [
    notes,
    setNotes,
  ] =
    useState<
      | ReleaseNoteView[]
      | null
    >(
      null,
    );
  const arrival =
    useArrival(
      notes !==
        null,
    );

  useEffect(() => {
    api(
      releaseNotesApi,
    )
      .then(
        (
          d,
        ) =>
          setNotes(
            d.notes,
          ),
      )
      .catch(
        () =>
          setNotes(
            [],
          ),
      );
  }, []);

  if (
    notes ===
    null
  ) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  if (
    notes.length ===
    0
  ) {
    return (
      <EmptyState
        icon={
          ScrollText
        }
        className={
          arrival
        }
        title={t(
          'changelog-empty',
          {
            defaultValue:
              'No release notes yet.',
          },
        )}
      />
    );
  }
  return (
    <ol
      className={cn(
        'mx-auto max-w-2xl space-y-3',
        arrival,
      )}
    >
      {notes.map(
        (
          n,
        ) => (
          <li
            key={
              n.id
            }
            className="rounded-site px-4 py-3"
          >
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="text-base font-semibold text-site-text">
                {
                  n.title
                }
              </h2>
              <span className="shrink-0 text-xs text-site-text-muted">
                {
                  n.version
                }
                {n.publishedAt
                  ? ` · ${new Date(n.publishedAt).toLocaleDateString()}`
                  : ''}
              </span>
            </div>
            <NoteBody
              body={
                n.body
              }
            />
          </li>
        ),
      )}
    </ol>
  );
}
