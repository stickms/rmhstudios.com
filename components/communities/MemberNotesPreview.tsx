/**
 * s06-02 — the latest two notes about a member, inline (text on rules), with "All notes" opening the full
 * dialog. Used in a mod queue item and in the sanction dialog. Renders nothing when there are no notes,
 * while loading, or if the request fails (it is a convenience; the dialog has the full list).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiQuery } from '@/lib/contract/client';
import { Button } from '@/components/ui/button';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { listNotesApi } from '@/lib/communities/member-notes.contract';
import { MemberNotesDialog, type NotesMember } from '@/components/communities/MemberNotesDialog';
import {
  NOTE_PREVIEW_COUNT,
  type NoteDTO,
} from '@/lib/communities/member-notes';

export function MemberNotesPreview({
  slug,
  member,
}: {
  slug: string;
  member: NotesMember;
}) {
  const { t } = useTranslation('community-notes');
  const fmt = useLocaleFormat();
  // A preview is a convenience: a failed read shows nothing. Refetched when the full dialog closes.
  const { data, refetch } = useQuery({
    ...apiQuery(listNotesApi, { params: { slug, userId: member.id } }),
    retry: false,
  });
  const notes: NoteDTO[] = data?.notes ?? [];
  const [open, setOpen] = useState(false);

  if (notes.length === 0 && !open) return null;
  return (
    <div className="flex flex-col">
      <p className="t-label border-b border-site-border pb-1">
        {t('preview-title', { defaultValue: 'Moderator notes' })}
      </p>
      {notes.slice(0, NOTE_PREVIEW_COUNT).map((n) => (
        <div key={n.id} className="border-b border-site-border py-2">
          <p className="t-body whitespace-pre-wrap break-words text-site-text">{n.body}</p>
          <p className="t-meta">{fmt.date(n.createdAt)}</p>
        </div>
      ))}
      <div className="py-1">
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          {t('all-notes', { defaultValue: 'All notes' })}
        </Button>
      </div>
      {open && <MemberNotesDialog slug={slug} member={member} onClose={() => {
            setOpen(false);
            void refetch();
          }} />}
    </div>
  );
}
