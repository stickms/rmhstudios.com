'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/spinner';
import { NoteBody } from '@/components/devplatform/NoteBody';
import type { ReleaseNoteView } from '@/lib/devplatform/release-notes';

/** Public changelog: the published release notes, newest first. */
export function ChangelogList() {
  const { t } = useTranslation('f-devplatform');
  const [notes, setNotes] = useState<ReleaseNoteView[] | null>(null);

  useEffect(() => {
    fetch('/api/release-notes')
      .then((r) => (r.ok ? r.json() : { notes: [] }))
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
      <p className="py-12 text-center text-sm text-site-text-muted">
        {t('changelog-empty', { defaultValue: 'No release notes yet.' })}
      </p>
    );
  }
  return (
    <ol className="space-y-4">
      {notes.map((n) => (
        <li key={n.id} className="glass-fill rounded-site p-4">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-base font-bold text-site-text">{n.title}</h2>
            <span className="shrink-0 text-xs text-site-text-dim">
              {n.version}
              {n.publishedAt ? ` · ${new Date(n.publishedAt).toLocaleDateString()}` : ''}
            </span>
          </div>
          <NoteBody body={n.body} />
        </li>
      ))}
    </ol>
  );
}
