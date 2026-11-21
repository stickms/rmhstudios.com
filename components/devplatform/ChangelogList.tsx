import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { NoteBody } from '@/components/devplatform/NoteBody';
import type { ReleaseNoteView } from '@/lib/developer/release-notes';
import { api } from '@/lib/contract/client';
import { releaseNotesApi } from '@/lib/site-reads.contract';
import { useArrival } from '@/components/ui/arrive';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

/**
 * The published release notes, newest first, as rows on rules. It is the
 * "Latest changes" part of /site-history (which absorbed /changelog in the
 * 2026-11-19 consolidation): the first `limit` notes show, and the rest are one
 * press away.
 */
export function ChangelogList({ limit }: { limit?: number }) { const fmt = useLocaleFormat(); 
  const { t } = useTranslation('f-devplatform');
  const [notes, setNotes] = useState<ReleaseNoteView[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const arrival = useArrival(notes !== null);

  useEffect(() => {
    api(releaseNotesApi)
      .then((d) => setNotes(d.notes))
      .catch(() => setNotes([]));
  }, []);

  if (notes === null) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  if (notes.length === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        className={arrival}
        title={t('changelog-empty', { defaultValue: 'No release notes yet.' })}
      />
    );
  }

  const shown = limit && !showAll ? notes.slice(0, limit) : notes;
  const hidden = notes.length - shown.length;

  return (
    <div className={arrival}>
      <ol className="border-t border-site-border">
        {shown.map((n) => (
          <li key={n.id} className="border-b border-site-border py-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="t-heading text-site-text">{n.title}</h3>
              <span className="t-meta shrink-0">
                {n.version}
                {n.publishedAt ? ` · ${fmt.date(new Date(n.publishedAt))}` : ''}
              </span>
            </div>
            <NoteBody body={n.body} />
          </li>
        ))}
      </ol>
      {hidden > 0 ? (
        <Button className="mt-4" onClick={() => setShowAll(true)}>
          {t('changelog-show-all', {
            defaultValue_one: 'Show {{count}} older note',
            defaultValue_other: 'Show {{count}} older notes',
            count: hidden,
          })}
        </Button>
      ) : null}
    </div>
  );
}
