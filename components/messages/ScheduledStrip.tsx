import { useRefusalText } from '@/components/errors/useRefusalText';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Clock, Pencil, RefreshCw, Send, Trash2 } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScheduleControl } from '@/components/ui/schedule-control';
import { Textarea } from '@/components/ui/textarea';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { api, apiQuery } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import {
  cancelScheduledMessageApi,
  listScheduledMessagesApi,
  sendScheduledMessageNowApi,
  updateScheduledMessageApi,
} from '@/lib/messages/scheduled.contract';
import {
  firstLine,
  type ScheduledFailCode,
  type ScheduledMessageRow,
  type SentMessage,
} from '@/lib/messages/scheduled';

/** `YYYY-MM-DDTHH:mm` in the browser's zone: what a `datetime-local` field holds. */
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/**
 * The Scheduled strip above a conversation's composer (s03-12): one quiet row
 * ("1 scheduled message") that opens into the list, each with Edit, Send now and
 * Cancel. A message that could not be delivered stays here with the reason and
 * a Delete. It renders nothing until the member has something scheduled here.
 */
export function ScheduledStrip({
  chatId,
  onDelivered,
}: {
  chatId: string;
  /** A "Send now" created this message: let the open thread show it. */
  onDelivered: (message: SentMessage) => void;
}) {
  const { t, i18n } = useTranslation('send-later');
  const refusalText = useRefusalText();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledMessageRow | null>(null);

  const list = useQuery(
    apiQuery(listScheduledMessagesApi, {
      query: {
        chatId,
      },
    }),
  );
  const rows = list.data?.messages ?? [];
  const arrival = useArrival(!list.isPending);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: [listScheduledMessagesApi.path],
    });

  const sendNow = useMutation({
    mutationFn: (id: string) =>
      api(sendScheduledMessageNowApi, {
        params: {
          id,
        },
      }),
    onSuccess: ({ message }) => {
      onDelivered(message);
      toast.success(
        t('sent-now-toast', {
          defaultValue: 'Message sent',
        }),
      );
    },
    onError: (error) => {
      toast.error(
        refusalText.maybe(error) ||
          t('send-now-failed', {
            defaultValue: 'Could not send the message',
          }),
      );
    },
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api(cancelScheduledMessageApi, {
        params: {
          id,
        },
      }),
    onError: (error) => {
      toast.error(
        refusalText.maybe(error) ||
          t('cancel-failed', {
            defaultValue: 'Could not remove the message',
          }),
      );
    },
    onSettled: refresh,
  });

  const failReason = (code: ScheduledFailCode | null): string => {
    switch (code) {
      case 'blocked':
        return t('fail-blocked', {
          defaultValue: 'you can no longer message this person',
        });
      case 'not-member':
        return t('fail-not-member', {
          defaultValue: 'you are no longer in this conversation',
        });
      case 'cannot-message':
        return t('fail-cannot-message', {
          defaultValue: 'this person is not accepting your messages',
        });
      case 'restricted':
        return t('fail-restricted', {
          defaultValue: 'messaging is restricted on your account',
        });
      case 'invalid-image':
        return t('fail-invalid-image', {
          defaultValue: 'an attached image could not be sent',
        });
      case 'invalid':
        return t('fail-invalid', {
          defaultValue: 'the message was empty',
        });
      default:
        return t('fail-error', {
          defaultValue: 'something went wrong while sending it',
        });
    }
  };

  const when = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language || undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));

  const preview = (row: ScheduledMessageRow) =>
    firstLine(row.content) ||
    (row.gifUrl
      ? t('media-gif', {
          defaultValue: 'GIF',
        })
      : t('media-photos', {
          defaultValue: 'Photo',
        }));

  const cancel = async (row: ScheduledMessageRow) => {
    const confirmed = await confirm({
      title: t('cancel-title', {
        defaultValue: 'Cancel this scheduled message?',
      }),
      description: t('cancel-description', {
        defaultValue: 'It will not be sent.',
      }),
      confirmLabel: t('cancel-confirm', {
        defaultValue: 'Cancel message',
      }),
      cancelLabel: t('cancel-keep', {
        defaultValue: 'Keep it',
      }),
      danger: true,
    });
    if (confirmed) remove.mutate(row.id);
  };

  if (list.isError && !list.data) {
    return (
      <div className="flex items-center gap-2 border-t border-site-border py-2">
        <p className="t-meta flex-1" role="status">
          {t('load-failed', {
            defaultValue: 'Scheduled messages did not load.',
          })}
        </p>
        <IconButton
          icon={RefreshCw}
          size="icon-xs"
          label={t('retry', {
            defaultValue: 'Retry',
          })}
          onClick={() => void list.refetch()}
        />
      </div>
    );
  }
  if (rows.length === 0) return null;

  const pending = rows.filter((row) => row.status === 'pending').length;
  const failed = rows.length - pending;
  const listId = `scheduled-strip-${chatId}`;

  return (
    <section
      aria-label={t('strip-label', {
        defaultValue: 'Scheduled messages',
      })}
      className={cn('border-t border-site-border', arrival)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="t-meta flex min-h-9 w-full items-center gap-2 py-2 text-start pointer-coarse:min-h-11"
      >
        <Clock className="size-3.5 shrink-0" aria-hidden />
        <span className="flex-1">
          {pending > 0 &&
            t('strip-pending', {
              count: pending,
              defaultValue_one: '{{count}} scheduled message',
              defaultValue: '{{count}} scheduled messages',
            })}
          {pending > 0 && failed > 0 && ' · '}
          {failed > 0 &&
            t('strip-failed', {
              count: failed,
              defaultValue: '{{count}} not sent',
            })}
        </span>
        {open ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
      </button>

      {open && (
        <ul id={listId}>
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-site-border py-2">
              <div className="min-w-0 flex-1">
                <p className="t-body truncate">{preview(row)}</p>
                {row.status === 'failed' ? (
                  <p className="t-meta text-site-danger">
                    {t('not-sent', {
                      reason: failReason(row.failCode),
                      defaultValue: 'Not sent: {{reason}}',
                    })}
                  </p>
                ) : (
                  <p className="t-meta">{when(row.sendAt)}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {row.status === 'pending' ? (
                  <>
                    <IconButton
                      icon={Pencil}
                      size="icon-xs"
                      label={t('edit', {
                        defaultValue: 'Edit',
                      })}
                      onClick={() => setEditing(row)}
                    />
                    <IconButton
                      icon={Send}
                      size="icon-xs"
                      label={t('send-now', {
                        defaultValue: 'Send now',
                      })}
                      disabled={sendNow.isPending}
                      onClick={() => sendNow.mutate(row.id)}
                    />
                    <IconButton
                      icon={Trash2}
                      size="icon-xs"
                      label={t('cancel', {
                        defaultValue: 'Cancel',
                      })}
                      disabled={remove.isPending}
                      onClick={() => void cancel(row)}
                    />
                  </>
                ) : (
                  <IconButton
                    icon={Trash2}
                    size="icon-xs"
                    label={t('delete', {
                      defaultValue: 'Delete',
                    })}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(row.id)}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <EditDialog
          row={editing}
          onClose={() => {
            setEditing(null);
            void refresh();
          }}
        />
      )}
    </section>
  );
}

/** Text and time of one pending message; images and the GIF stay as they were scheduled. */
function EditDialog({ row, onClose }: { row: ScheduledMessageRow; onClose: () => void }) {
  const { t } = useTranslation('send-later');
  const refusalText = useRefusalText();
  const [content, setContent] = useState(row.content);
  const [when, setWhen] = useState(toLocalInput(row.sendAt));
  const hasMedia = !!row.gifUrl || row.imageUrls.length > 0;

  const save = useMutation({
    mutationFn: (sendAt: string) =>
      api(updateScheduledMessageApi, {
        params: {
          id: row.id,
        },
        body: {
          content,
          sendAt,
        },
      }),
    onSuccess: () => {
      toast.success(
        t('saved-toast', {
          defaultValue: 'Scheduled message updated',
        }),
      );
      onClose();
    },
    onError: (error) => {
      toast.error(
        refusalText.maybe(error) ||
          t('save-failed', {
            defaultValue: 'Could not update the message',
          }),
      );
    },
  });

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('edit-title', {
              defaultValue: 'Edit scheduled message',
            })}
          </DialogTitle>
        </DialogHeader>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={2000}
          rows={4}
          aria-label={t('edit-text-label', {
            defaultValue: 'Message text',
          })}
          className="surface-field rounded-site px-3 py-2 text-sm text-site-text"
        />
        {hasMedia && (
          <p className="t-meta">
            {t('edit-media-note', {
              defaultValue: 'Images and GIFs cannot be changed. Cancel and schedule it again to swap them.',
            })}
          </p>
        )}
        <ScheduleControl
          id={`edit-scheduled-${row.id}`}
          value={when}
          onChange={setWhen}
          onSubmit={(iso) => save.mutate(iso)}
          submitting={save.isPending}
          disabled={!content.trim() && !hasMedia}
          submitLabel={t('edit-save', {
            defaultValue: 'Save',
          })}
        />
      </DialogContent>
    </Dialog>
  );
}
