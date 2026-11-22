/**
 * Moderator notes on one member, inside the admin user moderation panel (s03-04): internal, admin-only
 * notes with an edit window (previous text kept), pins, soft delete, an optional link to one of the
 * member's own reports or strikes, and search. Rows on rules; "Add note" is the section's only primary.
 * Note text is rendered as text; links are detected for display and never followed automatically.
 */
import { Fragment, useCallback, useId, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { SearchField } from '@/components/ui/search-field';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival } from '@/components/ui/arrive';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { cn } from '@/lib/utils';
import {
  createModeratorNoteApi,
  deleteModeratorNoteApi,
  listModeratorNotesApi,
  updateModeratorNoteApi,
  type ModeratorNoteRow,
  type ModeratorNotesPage,
} from '@/lib/moderation/notes.contract';
import { MAX_NOTE_LENGTH, MAX_PINNED_NOTES, splitNoteText } from '@/lib/moderation/notes';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

const NO_LINK = '';

function NoteText({ text }: { text: string }) {
  return (
    <p className="t-body whitespace-pre-wrap break-words text-site-text">
      {splitNoteText(text).map((seg, i) =>
        seg.kind === 'link' ? (
          <a key={i} href={seg.href} target="_blank" rel="noopener noreferrer nofollow" className="underline">
            {seg.text}
          </a>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        ),
      )}
    </p>
  );
}

export function ModeratorNotes({
  userId,
  reveal = false,
}: {
  userId: string;
  /** Scroll the section into view once it has loaded. */ reveal?: boolean;
}) {
  const fmt = useLocaleFormat();
  const { t } = useTranslation('mod-notes');
  const { data: session } = useSession();
  const viewerId = session?.user?.id ?? null;
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const ids = useId();

  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const [link, setLink] = useState(NO_LINK);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const q = search.trim();
  const queryKey = ['admin', 'user-notes', userId, q] as const;
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      api(listModeratorNotesApi, {
        params: {
          id: userId,
        },
        query: {
          ...(q
            ? {
                q,
              }
            : {}),
          ...(pageParam
            ? {
                cursor: pageParam,
              }
            : {}),
        },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: ModeratorNotesPage) => last.nextCursor,
    staleTime: 0,
  });

  const pages = query.data?.pages ?? [];
  const notes = pages.flatMap((p) => p.notes);
  const first = pages[0];
  const arrival = useArrival(!query.isPending);

  const loaded = first !== undefined;
  // Scroll the section into view once its notes have loaded: a ref on a marker that
  // only mounts then, so it runs once, at the moment the content arrives.
  const revealOnLoad = useCallback((el: HTMLSpanElement | null) => {
    el?.closest('section')?.scrollIntoView({
      block: 'start',
    });
  }, []);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ['admin', 'user-notes', userId],
    });
  const failed = (e: unknown) =>
    toast.error(
      serverError(e) ??
        t('action-failed', {
          defaultValue: 'That did not go through.',
        }),
    );

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await refresh();
      return true;
    } catch (e) {
      failed(e);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const body = text.trim();
    if (!body) return;
    const [kind, id] = link.split(':');
    const ok = await run(() =>
      api(createModeratorNoteApi, {
        params: {
          id: userId,
        },
        body: {
          body,
          ...(kind === 'report' && id
            ? {
                reportId: id,
              }
            : {}),
          ...(kind === 'strike' && id
            ? {
                strikeId: id,
              }
            : {}),
        },
      }),
    );
    if (ok) {
      setText('');
      setLink(NO_LINK);
      toast.success(
        t('added', {
          defaultValue: 'Note added.',
        }),
      );
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const body = editing.text.trim();
    if (!body) return;
    const ok = await run(() =>
      api(updateModeratorNoteApi, {
        params: {
          id: userId,
          noteId: editing.id,
        },
        body: {
          body,
        },
      }),
    );
    if (ok) setEditing(null);
  };

  const togglePin = (n: ModeratorNoteRow) =>
    run(() =>
      api(updateModeratorNoteApi, {
        params: {
          id: userId,
          noteId: n.id,
        },
        body: {
          pinned: !n.pinned,
        },
      }),
    );

  const remove = async (n: ModeratorNoteRow) => {
    const yes = await confirm({
      title: t('delete-title', {
        defaultValue: 'Delete this note?',
      }),
      description: t('delete-description', {
        defaultValue: 'It collapses to a "Deleted by" line for every admin. The member never sees notes.',
      }),
      confirmLabel: t('delete', {
        defaultValue: 'Delete',
      }),
      cancelLabel: t('cancel', {
        defaultValue: 'Cancel',
      }),
      danger: true,
    });
    if (!yes) return;
    await run(() =>
      api(deleteModeratorNoteApi, {
        params: {
          id: userId,
          noteId: n.id,
        },
      }),
    );
  };

  const who = (
    u: {
      name: string | null;
      handle: string | null;
    } | null,
  ) =>
    u
      ? u.name ||
        u.handle ||
        t('unknown-user', {
          defaultValue: 'Deleted user',
        })
      : t('unknown-user', {
          defaultValue: 'Deleted user',
        });
  const ago = (iso: string) => fmt.relative(new Date(iso));
  const day = (iso: string) =>
    fmt.date(new Date(iso), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const choices = first?.choices;
  const remaining = MAX_NOTE_LENGTH - text.length;

  return (
    <section id={`mod-notes-${userId}`} className="space-y-3" aria-labelledby={`${ids}-heading`}>
      {reveal && loaded ? <span ref={revealOnLoad} hidden /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${ids}-heading`} className="t-label">
          {t('heading', {
            defaultValue: 'Moderator notes',
          })}
          {first && (
            <span className="t-meta ml-2">
              {t('count', {
                count: first.total,
                defaultValue_one: '{{count}} note',
                defaultValue_other: '{{count}} notes',
                defaultValue: '{{count}} notes',
              })}
            </span>
          )}
        </h3>
      </div>
      <p className="t-meta">
        {t('internal', {
          defaultValue: 'Internal. Only admins see notes; the member never does.',
        })}
      </p>

      <div className="space-y-2">
        <label htmlFor={`${ids}-text`} className="t-label block">
          {t('new-note', {
            defaultValue: 'New note',
          })}
        </label>
        <Textarea
          id={`${ids}-text`}
          value={text}
          maxLength={MAX_NOTE_LENGTH}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          className="min-h-0 resize-none px-3 py-2"
        />
        <p className="t-meta" aria-live="polite">
          {t('remaining', {
            count: remaining,
            defaultValue_one: '{{count}} character left',
            defaultValue_other: '{{count}} characters left',
            defaultValue: '{{count}} characters left',
          })}
        </p>
        {choices && (choices.reports.length > 0 || choices.strikes.length > 0) && (
          <Select
            value={link}
            onChange={(e) => setLink(e.target.value)}
            aria-label={t('link-label', {
              defaultValue: 'Link to a report or strike (optional)',
            })}
          >
            <option value={NO_LINK}>
              {t('no-link', {
                defaultValue: 'No link',
              })}
            </option>
            {choices.reports.map((r) => (
              <option key={r.id} value={`report:${r.id}`}>
                {t('link-report', {
                  reason: r.reason,
                  date: day(r.createdAt),
                  defaultValue: 'Report: {{reason}}, {{date}}',
                })}
              </option>
            ))}
            {choices.strikes.map((s) => (
              <option key={s.id} value={`strike:${s.id}`}>
                {t('link-strike', {
                  reason: s.reason.slice(0, 60),
                  date: day(s.createdAt),
                  defaultValue: 'Strike: {{reason}}, {{date}}',
                })}
              </option>
            ))}
          </Select>
        )}
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={add} disabled={busy || !text.trim()}>
            {t('add', {
              defaultValue: 'Add note',
            })}
          </Button>
        </div>
      </div>

      <SearchField
        value={search}
        onValueChange={setSearch}
        placeholder={t('search-placeholder', {
          defaultValue: 'Search notes',
        })}
        aria-label={t('search-label', {
          defaultValue: 'Search this member’s notes',
        })}
      />

      {query.isPending ? (
        <div className="flex justify-center py-3 text-site-text-muted">
          <Spinner />
        </div>
      ) : query.isError ? (
        <p className="t-body text-site-danger">
          {t('load-failed', {
            defaultValue: 'Could not load the notes.',
          })}{' '}
          <Button variant="ghost" size="xs" onClick={() => void query.refetch()}>
            {t('retry', {
              defaultValue: 'Try again',
            })}
          </Button>
        </p>
      ) : notes.length === 0 ? (
        <p className={cn('t-body text-site-text-muted', arrival)}>
          {q
            ? t('no-matches', {
                defaultValue: 'No notes match.',
              })
            : t('empty', {
                defaultValue: 'No notes on this member yet.',
              })}
        </p>
      ) : (
        <ul className={cn('divide-y divide-site-border border-y border-site-border', arrival)}>
          {notes.map((n) => {
            const isEditing = editing?.id === n.id;
            const open = expanded.has(n.id);
            if (n.deleted) {
              return (
                <li key={n.id} className="t-meta py-3">
                  {t('deleted-line', {
                    name: who(n.deleted.by),
                    date: day(n.deleted.at),
                    defaultValue: 'Deleted by {{name}} on {{date}}',
                  })}
                </li>
              );
            }
            const canEdit = n.editableUntil !== null && n.author?.id === viewerId;
            return (
              <li key={n.id} className="space-y-2 py-3">
                <div className="t-meta flex flex-wrap items-center gap-x-2 gap-y-1">
                  {n.pinned && (
                    <span className="inline-flex items-center gap-1 text-site-text">
                      <Pin className="size-3" aria-hidden="true" />
                      {t('pinned', {
                        defaultValue: 'Pinned',
                      })}
                    </span>
                  )}
                  <span className="text-site-text">{who(n.author)}</span>
                  <time dateTime={n.createdAt} title={fmt.dateTime(new Date(n.createdAt))}>
                    {ago(n.createdAt)}
                  </time>
                  {n.editedFrom.length > 0 && (
                    <button
                      type="button"
                      className="underline"
                      aria-expanded={open}
                      onClick={() =>
                        setExpanded((cur) => {
                          const next = new Set(cur);
                          if (next.has(n.id)) next.delete(n.id);
                          else next.add(n.id);
                          return next;
                        })
                      }
                    >
                      {t('edited', {
                        defaultValue: 'edited',
                      })}
                    </button>
                  )}
                  {n.report && (
                    <span>
                      {t('about-report', {
                        reason: n.report.reason,
                        defaultValue: 'Report: {{reason}}',
                      })}
                    </span>
                  )}
                  {n.strike && (
                    <span>
                      {t('about-strike', {
                        reason: n.strike.reason.slice(0, 60),
                        defaultValue: 'Strike: {{reason}}',
                      })}
                    </span>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <label htmlFor={`${ids}-edit-${n.id}`} className="sr-only">
                      {t('edit-label', {
                        defaultValue: 'Edit note',
                      })}
                    </label>
                    <Textarea
                      id={`${ids}-edit-${n.id}`}
                      value={editing.text}
                      maxLength={MAX_NOTE_LENGTH}
                      rows={3}
                      onChange={(e) =>
                        setEditing({
                          id: n.id,
                          text: e.target.value,
                        })
                      }
                      className="min-h-0 resize-none px-3 py-2"
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
                        {t('cancel', {
                          defaultValue: 'Cancel',
                        })}
                      </Button>
                      <Button size="sm" onClick={saveEdit} disabled={busy || !editing.text.trim()}>
                        {t('save', {
                          defaultValue: 'Save',
                        })}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <NoteText text={n.body ?? ''} />
                )}

                {open && (
                  <div className="space-y-1 border-l border-site-border pl-3">
                    <p className="t-label">
                      {t('earlier-versions', {
                        defaultValue: 'Earlier versions',
                      })}
                    </p>
                    <ol className="space-y-1">
                      {n.editedFrom.map((prev, i) => (
                        <li key={i} className="t-body text-site-text-muted whitespace-pre-wrap break-words">
                          {prev}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {!isEditing && (
                  <div className="flex items-center gap-1">
                    {canEdit && (
                      <IconButton
                        icon={Pencil}
                        label={t('edit', {
                          defaultValue: 'Edit note',
                        })}
                        disabled={busy}
                        onClick={() =>
                          setEditing({
                            id: n.id,
                            text: n.body ?? '',
                          })
                        }
                      />
                    )}
                    <IconButton
                      icon={n.pinned ? PinOff : Pin}
                      label={
                        n.pinned
                          ? t('unpin', {
                              defaultValue: 'Unpin note',
                            })
                          : t('pin', {
                              max: MAX_PINNED_NOTES,
                              defaultValue: 'Pin note (up to {{max}})',
                            })
                      }
                      aria-pressed={n.pinned}
                      disabled={busy}
                      onClick={() => void togglePin(n)}
                    />
                    <IconButton
                      icon={Trash2}
                      label={t('delete', {
                        defaultValue: 'Delete',
                      })}
                      disabled={busy}
                      onClick={() => void remove(n)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? (
              <Spinner />
            ) : (
              t('load-more', {
                defaultValue: 'Load more',
              })
            )}
          </Button>
        </div>
      )}
    </section>
  );
}
