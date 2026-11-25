import { useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { deletePatchNoteApi, editPatchNoteApi, adminListPatchNotesApi } from '@/lib/arcade/updates.contract';
import type { PatchNoteItem } from '@/lib/arcade/updates';

/** The query key of a game's notes; publishing a note invalidates the whole prefix. */
export const notesKey = (gameId: string) => ['admin-patch-notes', gameId] as const;

/**
 * A game's existing patch notes under the publish form: edit the title and body, or delete. The version is
 * immutable (launch prompts compare it), so it is shown and never edited.
 */
export function AdminPatchNoteList({ gameId }: { gameId: string }) {
  const { t } = useTranslation('game-updates');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  // The admin read path: it lists a title played elsewhere too, which the public updates list answers 404.
  const list = useInfiniteQuery({
    queryKey: notesKey(gameId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api(adminListPatchNotesApi, {
        params: {
          gameId,
        },
        query: pageParam
          ? {
              cursor: pageParam,
            }
          : {},
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
  });
  const notes = list.isPending ? null : (list.data?.pages.flatMap((p) => p.notes) ?? []);
  const failed = list.isError;
  const arrival = useArrival(notes !== null);
  const reload = () =>
    queryClient.invalidateQueries({
      queryKey: notesKey(gameId),
    });

  const startEdit = (n: PatchNoteItem) => {
    setEditing(n.id);
    setTitle(n.title);
    setBody(n.body);
  };

  const save = async (id: string) => {
    setBusy(true);
    try {
      await api(editPatchNoteApi, {
        params: {
          id,
        },
        body: {
          title,
          body,
        },
      });
      await reload();
      setEditing(null);
      toast.success(
        t('admin-saved', {
          defaultValue: 'Patch note saved',
        }),
      );
    } catch {
      toast.error(
        t('admin-save-failed', {
          defaultValue: 'Could not save',
        }),
      );
    }
    setBusy(false);
  };

  const remove = async (n: PatchNoteItem) => {
    const ok = await confirm({
      title: t('admin-delete-title', {
        defaultValue: 'Delete this patch note?',
      }),
      description: t('admin-delete-body', {
        defaultValue: 'Version {{version}} disappears from the updates page. Players keep any notification they have.',
        version: n.version,
      }),
      confirmLabel: t('admin-delete', {
        defaultValue: 'Delete',
      }),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(deletePatchNoteApi, {
        params: {
          id: n.id,
        },
      });
      await reload();
    } catch {
      toast.error(
        t('admin-delete-failed', {
          defaultValue: 'Could not delete',
        }),
      );
    }
  };

  return (
    <section className="mt-6 border-t border-site-border pt-4" aria-labelledby="existing-notes">
      <h2 id="existing-notes" className="t-heading pb-2">
        {t('admin-existing', {
          defaultValue: 'Published notes',
        })}
      </h2>
      {notes === null ? (
        <Skeleton className="h-16 w-full" />
      ) : notes.length === 0 ? (
        <EmptyState
          title={
            failed
              ? t('admin-none-listed', {
                  defaultValue: 'No notes to list for this game',
                })
              : t('admin-none', {
                  defaultValue: 'No patch notes yet',
                })
          }
        />
      ) : (
        <ul className={arrival}>
          {notes.map((n) => (
            <li key={n.id} className="border-b border-site-border py-3">
              {editing === n.id ? (
                <div className="space-y-3">
                  <Input
                    value={title}
                    maxLength={120}
                    aria-label={t('admin-note-title', {
                      defaultValue: 'Headline',
                    })}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <Textarea
                    rows={5}
                    value={body}
                    maxLength={1000}
                    aria-label={t('admin-body', {
                      defaultValue: 'What changed',
                    })}
                    onChange={(e) => setBody(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setEditing(null)}>
                      {t('admin-cancel', {
                        defaultValue: 'Cancel',
                      })}
                    </Button>
                    <Button loading={busy} disabled={!title.trim() || !body.trim()} onClick={() => void save(n.id)}>
                      {t('admin-save', {
                        defaultValue: 'Save',
                      })}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="t-body font-semibold break-words">{n.title}</p>
                    <p className="t-meta">{n.version}</p>
                    <p className="t-body mt-1 whitespace-pre-line break-words text-site-text-muted">{n.body}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <IconButton
                      icon={Pencil}
                      label={t('admin-edit', {
                        defaultValue: 'Edit',
                      })}
                      onClick={() => startEdit(n)}
                    />
                    <IconButton
                      icon={Trash2}
                      className="text-site-danger"
                      label={t('admin-delete', {
                        defaultValue: 'Delete',
                      })}
                      onClick={() => void remove(n)}
                    />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage ? (
        <div className="pt-3">
          <Button variant="ghost" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
            {t('load-more', {
              defaultValue: 'Load more',
            })}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
