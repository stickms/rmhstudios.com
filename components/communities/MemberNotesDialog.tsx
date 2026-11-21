/**
 * s06-02 — the notes a community's moderators keep on one member: newest first (author, date, text, an
 * "Edited" marker), an "Add note" field with the section's one ink primary, edit (author, 15 minutes) and
 * delete (any moderator). Moderators only; the member never sees any of it. Rows on rules, dates `t-meta`.
 */
import {
  useId,
  useState,
} from 'react';
import {
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import {
  api,
  apiQuery,
} from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useArrival } from '@/components/ui/arrive';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import {
  addNoteApi,
  deleteNoteApi,
  editNoteApi,
  listNotesApi,
} from '@/lib/communities/member-notes.contract';
import {
  NOTE_MAX_LENGTH,
  type NoteDTO,
} from '@/lib/communities/member-notes';

export interface NotesMember {
  id: string;
  name: string | null;
  handle: string | null;
}

export function MemberNotesDialog({
  slug,
  member,
  onClose,
  onCount,
}: {
  slug: string;
  member: NotesMember;
  onClose: () => void;
  /** Called with the live count whenever it changes, so a row can update its "Notes (n)". */
  onCount?: (count: number) => void;
}) {
  const { t } = useTranslation('community-notes');
  const fmt = useLocaleFormat();
  const confirm = useConfirm();
  const ids = useId();
  const queryClient = useQueryClient();
  const listOptions = apiQuery(listNotesApi, {
    params: { slug, userId: member.id },
  });
  const listQuery = useQuery({
    ...listOptions,
    queryFn: async (ctx) => {
      const r = await listOptions.queryFn(ctx);
      onCount?.(r.notes.length);
      return r;
    },
    retry: false,
  });
  // `null` while loading; a failed read shows the error line over an empty list.
  const notes: NoteDTO[] | null = listQuery.data
    ? listQuery.data.notes
    : listQuery.isError
      ? []
      : null;
  const failed = listQuery.isError;
  const setNotes = (
    next: NoteDTO[] | ((prev: NoteDTO[] | null) => NoteDTO[] | null),
  ) =>
    queryClient.setQueryData(listOptions.queryKey, (old: { notes: NoteDTO[] } | undefined) => {
      const value = typeof next === 'function' ? next(old?.notes ?? null) : next;
      return value ? { ...old, notes: value } : old;
    });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const arrival = useArrival(notes !== null);
  const name =
    member.name ??
    (member.handle
      ? `@${member.handle}`
      : t('someone', { defaultValue: 'this member' }));

  const authorName = (n: NoteDTO) =>
    n.author
      ? (n.author.name ??
        (n.author.handle
          ? `@${n.author.handle}`
          : t('moderator', { defaultValue: 'A moderator' })))
      : t('former-moderator', { defaultValue: 'A former moderator' });

  const fail = (err: unknown) =>
    toast.error(
      serverError(err) ||
        t('action-failed', { defaultValue: 'Could not save that' }),
    );

  const save = async () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      const r = await api(addNoteApi, {
        params: { slug, userId: member.id },
        body: { body },
      });
      const next = [r.note, ...(notes ?? [])];
      setNotes(next);
      onCount?.(next.length);
      setDraft('');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (n: NoteDTO) => {
    const body = editText.trim();
    if (!body) return;
    setBusy(true);
    try {
      const r = await api(editNoteApi, {
        params: { slug, userId: member.id, noteId: n.id },
        body: { body },
      });
      setNotes((prev) => (prev ? prev.map((x) => (x.id === n.id ? r.note : x)) : prev));
      setEditing(null);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (n: NoteDTO) => {
    const ok = await confirm({
      title: t('delete-confirm', { defaultValue: 'Delete this note?' }),
      description: t('delete-confirm-hint', {
        defaultValue: 'Other moderators will no longer see it. The deletion is logged.',
      }),
      confirmLabel: t('delete', { defaultValue: 'Delete' }),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(deleteNoteApi, {
        params: { slug, userId: member.id, noteId: n.id },
      });
      const next = (notes ?? []).filter((x) => x.id !== n.id);
      setNotes(next);
      onCount?.(next.length);
    } catch (err) {
      fail(err);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('title', { name, defaultValue: 'Notes about {{name}}' })}
          </DialogTitle>
          <DialogDescription>
            {t('hint', {
              defaultValue:
                'Only this community’s moderators can see these. The member never does.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-new`}>
            {t('add-label', { defaultValue: 'Add note' })}
          </Label>
          <Textarea
            id={`${ids}-new`}
            value={draft}
            maxLength={NOTE_MAX_LENGTH}
            rows={3}
            onChange={(e) => setDraft(e.target.value)}
          />
          <p className="t-meta" role="status" aria-live="polite">
            {t('count', {
              used: draft.length,
              max: NOTE_MAX_LENGTH,
              defaultValue: '{{used}} of {{max}}',
            })}
          </p>
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={() => void save()}
              disabled={busy || !draft.trim()}
            >
              {t('save', { defaultValue: 'Save note' })}
            </Button>
          </div>
        </div>

        {notes === null ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : failed ? (
          <p className="t-body text-site-danger" role="alert">
            {t('load-failed', { defaultValue: 'Could not load the notes.' })}
          </p>
        ) : notes.length === 0 ? (
          <EmptyState
            title={t('empty', { defaultValue: 'No notes yet' })}
            description={t('empty-hint', {
              defaultValue: 'Write one so the other moderators know what happened.',
            })}
          />
        ) : (
          <ul className={cn('max-h-[40vh] overflow-y-auto', arrival)}>
            {notes.map((n) => (
              <li key={n.id} className="flex flex-col gap-1.5 border-b border-site-border py-3">
                <p className="t-meta">
                  {authorName(n)}
                  {' · '}
                  {fmt.dateTime(n.createdAt)}
                  {n.editedAt && (
                    <>
                      {' · '}
                      {t('edited', { defaultValue: 'Edited' })}
                    </>
                  )}
                </p>
                {editing === n.id ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${ids}-edit`} className="sr-only">
                      {t('edit-label', { defaultValue: 'Edit note' })}
                    </Label>
                    <Textarea
                      id={`${ids}-edit`}
                      value={editText}
                      maxLength={NOTE_MAX_LENGTH}
                      rows={3}
                      onChange={(e) => setEditText(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={busy}>
                        {t('cancel', { defaultValue: 'Cancel' })}
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => void saveEdit(n)}
                        disabled={busy || !editText.trim()}
                      >
                        {t('save-edit', { defaultValue: 'Save changes' })}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="t-body whitespace-pre-wrap break-words text-site-text">{n.body}</p>
                    <div className="flex gap-2">
                      {n.canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(n.id);
                            setEditText(n.body);
                          }}
                        >
                          {t('edit', { defaultValue: 'Edit' })}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => void remove(n)}>
                        {t('delete', { defaultValue: 'Delete' })}
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The "Notes (n)" control on a member row. Its accessible name carries the member and the count.
 */
export function NotesButton({
  member,
  count,
  onClick,
}: {
  member: NotesMember;
  count: number;
  onClick: () => void;
}) {
  const { t } = useTranslation('community-notes');
  const name =
    member.name ??
    (member.handle
      ? `@${member.handle}`
      : t('someone', { defaultValue: 'this member' }));
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      aria-label={t('notes-aria', {
        name,
        count,
        defaultValue: 'Notes about {{name}}: {{count}}',
      })}
    >
      {t('notes-button', { count, defaultValue: 'Notes ({{count}})' })}
    </Button>
  );
}
