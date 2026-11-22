import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useArrival } from '@/components/ui/arrive';
import { toast } from '@/lib/toast';
import { api, apiQuery } from '@/lib/contract/client';
import {
  getAdminFeedbackApi,
  listAdminFeedbackApi,
  updateAdminFeedbackApi,
  type AdminFeedbackDetail,
} from '@/lib/feedback/inbox.contract';
import {
  FEEDBACK_OUTCOMES,
  FEEDBACK_STATUSES,
  NOTE_MAX,
  REPLY_MAX,
  type FeedbackOutcome,
  type FeedbackStatus,
} from '@/lib/feedback/inbox';
import { useFeedbackLabels } from '@/components/feedback/feedback-labels';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

/** One feedback row: its message, its context, the member, and status, outcome, internal note and reply. */
export function FeedbackDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t } = useTranslation('feedback-inbox');
  const { data, isPending, isError } = useQuery({
    ...apiQuery(getAdminFeedbackApi, {
      params: {
        id: id ?? '',
      },
    }),
    enabled: id !== null,
  });
  const arrival = useArrival(!isPending);
  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto" aria-describedby="feedback-detail-desc">
        <DialogHeader>
          <DialogTitle>
            {t('detail-title', {
              defaultValue: 'Feedback',
            })}
          </DialogTitle>
          <DialogDescription id="feedback-detail-desc" className="t-meta">
            {t('detail-description', {
              defaultValue: 'Read it with its context, answer the member and close it.',
            })}
          </DialogDescription>
        </DialogHeader>
        {isPending ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : isError || !data ? (
          <p role="alert" className="t-body text-site-danger">
            {t('detail-error', {
              defaultValue: 'Could not load this feedback.',
            })}
          </p>
        ) : (
          // Keyed by id and last change so the form restarts from the saved values after a save.
          <div className={arrival}>
            <DetailBody
              key={`${data.feedback.id}:${data.feedback.reply ?? ''}:${data.feedback.status}`}
              row={data.feedback}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailBody({ row }: { row: AdminFeedbackDetail }) {
  const { t } = useTranslation('feedback-inbox');
  const fmt = useLocaleFormat();
  const labels = useFeedbackLabels();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<FeedbackStatus>(row.status as FeedbackStatus);
  const [outcome, setOutcome] = useState<FeedbackOutcome | ''>((row.outcome as FeedbackOutcome | null) ?? '');
  const [note, setNote] = useState(row.adminNote ?? '');
  const [reply, setReply] = useState(row.reply ?? '');
  const ctx = row.context;
  const techLabel: Record<string, string> = {
    screen_reader: t('tech-screen-reader', {
      defaultValue: 'Screen reader',
    }),
    magnifier: t('tech-magnifier', {
      defaultValue: 'Magnifier',
    }),
    voice_control: t('tech-voice-control', {
      defaultValue: 'Voice control',
    }),
    keyboard: t('tech-keyboard', {
      defaultValue: 'Keyboard only',
    }),
    switch: t('tech-switch', {
      defaultValue: 'Switch device',
    }),
    other: t('tech-other', {
      defaultValue: 'Something else',
    }),
  };
  const facts: Array<[string, string]> = [];
  if (row.assistiveTech)
    facts.push([
      t('field-tech', {
        defaultValue: 'What were you using?',
      }),
      techLabel[row.assistiveTech] ?? row.assistiveTech,
    ]);
  if (ctx?.where)
    facts.push([
      t('field-where', {
        defaultValue: 'Where',
      }),
      ctx.where,
    ]);
  if (ctx?.path)
    facts.push([
      t('context-path', {
        defaultValue: 'Page',
      }),
      ctx.path,
    ]);
  if (ctx?.viewport)
    facts.push([
      t('context-viewport', {
        defaultValue: 'Screen size',
      }),
      ctx.viewport,
    ]);
  if (ctx?.edition)
    facts.push([
      t('context-edition', {
        defaultValue: 'Day or Night',
      }),
      ctx.edition,
    ]);
  if (ctx?.locale)
    facts.push([
      t('context-locale', {
        defaultValue: 'Language',
      }),
      ctx.locale,
    ]);
  if (ctx?.build)
    facts.push([
      t('context-build', {
        defaultValue: 'Site version',
      }),
      ctx.build,
    ]);
  if (ctx?.errors?.length)
    facts.push([
      t('context-errors', {
        defaultValue: 'Recent errors',
      }),
      ctx.errors.join(' / '),
    ]);

  const save = useMutation({
    mutationFn: (body: Parameters<typeof api<typeof updateAdminFeedbackApi>>[1]['body']) =>
      api(updateAdminFeedbackApi, {
        params: {
          id: row.id,
        },
        body,
      }),
    onSuccess: async (res, body) => {
      toast.success(
        body.reply !== undefined && res.notified
          ? t('toast-replied', {
              defaultValue: 'Saved. The member has been told.',
            })
          : t('toast-saved', {
              defaultValue: 'Saved.',
            }),
      );
      queryClient.setQueryData(
        [
          getAdminFeedbackApi.path,
          {
            id: row.id,
          },
          null,
        ],
        {
          feedback: res.feedback,
        },
      );
      await queryClient.invalidateQueries({
        queryKey: [listAdminFeedbackApi.path],
      });
      await queryClient.invalidateQueries({
        queryKey: [getAdminFeedbackApi.path],
      });
    },
    onError: () =>
      toast.error(
        t('toast-failed', {
          defaultValue: 'Could not save. Try again.',
        }),
      ),
  });

  const statusChanged = status !== row.status || (status === 'closed' && outcome !== (row.outcome ?? ''));
  const closeNeedsOutcome = status === 'closed' && outcome === '';
  const noteChanged = note !== (row.adminNote ?? '');
  const replyChanged = reply.trim() !== '' && reply.trim() !== (row.reply ?? '');
  const dirty = statusChanged || noteChanged || replyChanged;

  const onSave = () => {
    save.mutate({
      ...(statusChanged
        ? {
            status,
            ...(status === 'closed' && outcome
              ? {
                  outcome,
                }
              : {}),
          }
        : {}),
      ...(noteChanged
        ? {
            adminNote: note,
          }
        : {}),
      ...(replyChanged
        ? {
            reply: reply.trim(),
          }
        : {}),
    });
  };

  return (
    <div className="space-y-5">
      <section>
        <p className="t-meta">
          {labels.categoryOf(row.category)} {' · '} {fmt.dateTime(row.createdAt)}
        </p>
        <p className="t-post mt-2 whitespace-pre-wrap break-words">{row.message}</p>
      </section>

      <section className="border-t border-site-border pt-3">
        <h3 className="t-label">
          {t('detail-member', {
            defaultValue: 'Member',
          })}
        </h3>
        <Link
          to="/admin/users"
          search={{
            q: row.user.handle || row.user.name,
            open: row.user.id,
          }}
          className="t-body underline"
        >
          {row.user.name}
        </Link>
      </section>

      <section className="border-t border-site-border pt-3">
        <h3 className="t-label">
          {t('detail-context', {
            defaultValue: 'Context',
          })}
        </h3>
        {facts.length === 0 ? (
          <p className="t-meta">
            {t('detail-no-context', {
              defaultValue: 'The member sent no context.',
            })}
          </p>
        ) : (
          <dl className="mt-1">
            {facts.map(([k, v]) => (
              <div key={k} className="flex flex-wrap gap-x-3 border-b border-site-border py-1.5">
                <dt className="t-meta w-32 shrink-0">{k}</dt>
                <dd className="t-body min-w-0 flex-1 break-words">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="space-y-3 border-t border-site-border pt-3">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-40 flex-1 space-y-1.5">
            <Label htmlFor="fb-status">
              {t('detail-status', {
                defaultValue: 'Status',
              })}
            </Label>
            <Select
              id="fb-status"
              value={status}
              onChange={(e) => {
                const next = e.target.value as FeedbackStatus;
                setStatus(next);
                // Moving off Closed leaves no outcome behind.
                if (next !== 'closed') setOutcome('');
              }}
            >
              {FEEDBACK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {labels.statusOf(s)}
                </option>
              ))}
            </Select>
          </div>
          {status === 'closed' && (
            <div className="min-w-40 flex-1 space-y-1.5">
              <Label htmlFor="fb-outcome">
                {t('detail-outcome', {
                  defaultValue: 'Close with outcome',
                })}
              </Label>
              <Select
                id="fb-outcome"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as FeedbackOutcome | '')}
              >
                <option value="">
                  {t('detail-outcome-choose', {
                    defaultValue: 'Choose an outcome',
                  })}
                </option>
                {FEEDBACK_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {labels.outcomeOf(o)}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fb-note">
            {t('detail-note', {
              defaultValue: 'Internal note',
            })}
          </Label>
          <Textarea id="fb-note" rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
          <p className="t-meta">
            {t('detail-note-hint', {
              defaultValue: 'Only admins see this.',
            })}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fb-reply">
            {t('detail-reply', {
              defaultValue: 'Reply to the member',
            })}
          </Label>
          <Textarea
            id="fb-reply"
            rows={3}
            maxLength={REPLY_MAX}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <p className="t-meta">
            {row.replyNotifiedAt
              ? t('detail-reply-sent', {
                  when: fmt.dateTime(row.replyNotifiedAt),
                  defaultValue: 'The member was told on {{when}}. Changing the reply tells them again.',
                })
              : t('detail-reply-hint', {
                  defaultValue: 'The member gets one notification and sees this under Your feedback.',
                })}
          </p>
        </div>

        {closeNeedsOutcome && (
          <p className="t-meta border-t border-site-border pt-2">
            {t('detail-outcome-required', {
              defaultValue: 'Choose an outcome to close this.',
            })}
          </p>
        )}
        <Button onClick={onSave} loading={save.isPending} disabled={!dirty || closeNeedsOutcome || save.isPending}>
          {t('detail-save', {
            defaultValue: 'Save',
          })}
        </Button>
      </section>
    </div>
  );
}
