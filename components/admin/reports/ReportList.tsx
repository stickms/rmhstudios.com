import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Flag, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { BanDialog } from '@/components/admin/BanDialog';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { QueueError } from '@/components/admin/reports/QueueError';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Button } from '@/components/ui/button';
import { NoteCount } from '@/components/admin/reports/NoteCount';
import { DmReportMessage } from '@/components/moderation/DmReportMessage';
import type { DmReportView } from '@/lib/messages/dm-report';
import { MacroField } from '@/components/safety/MacroField';
import { useArrival } from '@/components/ui/arrive';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import {
  actOnAdminReportApi,
  banAdminUserApi,
  getAdminReportsApi,
  strikeAdminUserApi,
} from '@/lib/admin/admin-ops.contract';
import { cn } from '@/lib/utils';
import { REMOVABLE_REPORT_ENTITY_TYPES } from '@/lib/moderation/report-schema';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

type Status = 'PENDING' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';

interface ReportUser {
  id: string;
  name: string | null;
  image: string | null;
  handle: string | null;
}
interface Report {
  id: string;
  reason: string;
  details: string | null;
  entityType: string;
  entityId: string;
  status: Status;
  withdrawn: boolean;
  createdAt: string;
  reporter: ReportUser;
  targetUser: ReportUser | null;
  targetNoteCount: number;
  dm?: DmReportView | null;
}

/** Where the reported thing lives, when the report names enough to link to it. */
export function entityLink(
  entityType: string,
  entityId: string,
  ownerHandle: string | null | undefined,
): string | null {
  if (entityType === 'rmhark' && ownerHandle) return `/u/${ownerHandle}/post/${entityId}`;
  if (entityType === 'user' && ownerHandle) return `/u/${ownerHandle}`;
  if (entityType === 'build') return `/builds/${entityId}`;
  return null;
}

/** The ungrouped queue: one row per report, newest first, one decision per report. */
export function ReportList({
  status,
  onCounts,
}: {
  status: Status;
  onCounts: (counts: Record<string, number>) => void;
}) {
  const fmt = useLocaleFormat();
  const { t } = useTranslation('admin');
  const queryClient = useQueryClient();
  const queryKey = ['admin', 'reports', status] as const;
  const reportsQuery = useQuery({
    queryKey,
    retry: false,
    queryFn: async () => {
      const data = await api(getAdminReportsApi, {
        query: {
          status,
        },
        retries: 0,
      });
      // The status tabs above show the counts from the latest answer.
      onCounts(data.counts ?? {});
      return data.items;
    },
  });
  const reports: Report[] = reportsQuery.data ?? [];
  const loading = reportsQuery.isFetching;
  const failed = reportsQuery.isError;
  /** Edit the cached list in place (a decided report leaves its status bucket). */
  const setReports = (update: (prev: Report[]) => Report[]) =>
    queryClient.setQueryData<Report[]>(queryKey, (prev) => update(prev ?? []));
  const load = (_status: Status) => reportsQuery.refetch();
  const [busyId, setBusyId] = useState<string | null>(null);
  const arrival = useArrival(!loading);
  // S4: per-report message to the author, filled from a macro.
  const [messages, setMessages] = useState<Record<string, string>>({});

  const act = async (id: string, action: 'review' | 'resolve' | 'dismiss', deleteContent = false) => {
    setBusyId(id);
    try {
      await api(actOnAdminReportApi, {
        params: {
          id,
        },
        body: {
          action,
          deleteContent,
          message: messages[id]?.trim() || undefined,
        },
      });
      // Remove from the current view when it leaves this status bucket.
      setReports((prev) => prev.filter((r) => r.id !== id));
      load(status);
    } catch {
      // A refused action (409, 500) leaves the row where it is.
    } finally {
      setBusyId(null);
    }
  };

  const prompt = usePrompt();
  const [banTarget, setBanTarget] = useState<string | null>(null);

  const moderateUser = async (userId: string, kind: 'strike' | 'ban') => {
    if (kind === 'ban') {
      setBanTarget(userId);
      return;
    }
    const reason = await prompt({
      title: t('strike-reason-prompt', {
        defaultValue: 'Strike reason:',
      }),
    });
    if (!reason) return;
    try {
      await api(strikeAdminUserApi, {
        params: {
          id: userId,
        },
        body: {
          reason,
        },
      });
      toast.success(
        t('strike-issued', {
          defaultValue: 'Strike issued',
        }),
      );
    } catch {
      toast.error(
        t('action-failed-appeals', {
          defaultValue: 'Action failed',
        }),
      );
    }
  };

  const banUser = async (reason: string, durationDays: number | null) => {
    const userId = banTarget;
    setBanTarget(null);
    if (!userId) return;
    try {
      await api(banAdminUserApi, {
        params: {
          id: userId,
        },
        body: {
          reason,
          durationDays,
        },
      });
      toast.success(
        t('user-banned', {
          defaultValue: 'User banned',
        }),
      );
    } catch {
      toast.error(
        t('action-failed-appeals', {
          defaultValue: 'Action failed',
        }),
      );
    }
  };

  return (
    <>
      <BanDialog
        open={banTarget !== null}
        onOpenChange={(open) => {
          if (!open) setBanTarget(null);
        }}
        onSubmit={banUser}
      />
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : failed ? (
        <QueueError onRetry={() => load(status)} />
      ) : reports.length === 0 ? (
        <EmptyState
          className={arrival}
          icon={Flag}
          title={t('queue-empty', {
            defaultValue: 'Nothing here. The queue is clear.',
          })}
        />
      ) : (
        <ul className={cn('divide-y divide-site-border', arrival)}>
          {reports.map((r) => {
            const link = entityLink(r.entityType, r.entityId, r.targetUser?.handle);
            return (
              <li key={r.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="danger">{r.reason.replace('_', ' ')}</Badge>
                  <Badge variant="default">{r.entityType}</Badge>
                  {r.withdrawn && (
                    <Badge variant="default">
                      {t('report-withdrawn', {
                        defaultValue: 'Withdrawn by the reporter',
                      })}
                    </Badge>
                  )}
                  <span className="t-meta">{fmt.relative(new Date(r.createdAt))}</span>
                  {link && (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="t-body ms-auto inline-flex items-center gap-1 text-site-text underline"
                    >
                      {t('view-content', {
                        defaultValue: 'View content',
                      })}{' '}
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  )}
                </div>

                {r.details && <p className="t-body text-site-text">{r.details}</p>}

                {r.dm && <DmReportMessage view={r.dm} />}

                <div className="t-body flex flex-wrap items-center gap-x-4 gap-y-2 text-site-text-muted">
                  <span className="inline-flex items-center gap-2">
                    <UserAvatar
                      src={r.reporter.image}
                      alt={
                        r.reporter.name ||
                        t('reporter', {
                          defaultValue: 'Reporter',
                        })
                      }
                      size={20}
                      fallbackName={r.reporter.name || 'R'}
                    />
                    {t('reported-by', {
                      defaultValue: 'reported by',
                    })}{' '}
                    <strong className="font-semibold text-site-text">{r.reporter.name || r.reporter.handle}</strong>
                  </span>
                  {r.targetUser && (
                    <span className="inline-flex items-center gap-2">
                      <UserAvatar
                        src={r.targetUser.image}
                        alt={
                          r.targetUser.name ||
                          t('user', {
                            defaultValue: 'User',
                          })
                        }
                        size={20}
                        fallbackName={r.targetUser.name || 'U'}
                      />
                      {t('against', {
                        defaultValue: 'against',
                      })}{' '}
                      <strong className="font-semibold text-site-text">
                        {r.targetUser.name || r.targetUser.handle}
                      </strong>
                      <NoteCount user={r.targetUser} count={r.targetNoteCount} />
                    </span>
                  )}
                </div>

                {(status === 'PENDING' || status === 'REVIEWING') && r.targetUser && (
                  <div>
                    <MacroField
                      scope={{
                        kind: 'admin',
                      }}
                      vars={{
                        user: r.targetUser.name || r.targetUser.handle || undefined,
                        reason: r.reason.replace('_', ' ').toLowerCase(),
                      }}
                      value={messages[r.id] ?? ''}
                      onChange={(v) =>
                        setMessages((m) => ({
                          ...m,
                          [r.id]: v,
                        }))
                      }
                    />
                  </div>
                )}

                {(status === 'PENDING' || status === 'REVIEWING') && (
                  <div className="flex flex-wrap gap-2">
                    {status === 'PENDING' && (
                      <Button
                        size="sm"
                        variant="default"
                        disabled={busyId === r.id}
                        onClick={() => act(r.id, 'review')}
                      >
                        {t('mark-reviewing', {
                          defaultValue: 'Mark reviewing',
                        })}
                      </Button>
                    )}
                    <Button size="sm" variant="default" disabled={busyId === r.id} onClick={() => act(r.id, 'resolve')}>
                      {t('resolve', {
                        defaultValue: 'Resolve',
                      })}
                    </Button>
                    {(REMOVABLE_REPORT_ENTITY_TYPES as readonly string[]).includes(r.entityType) && (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busyId === r.id}
                        onClick={() => act(r.id, 'resolve', true)}
                      >
                        {t('resolve-and-remove-content', {
                          defaultValue: 'Resolve & remove content',
                        })}
                      </Button>
                    )}
                    <Button size="sm" variant="default" disabled={busyId === r.id} onClick={() => act(r.id, 'dismiss')}>
                      {t('dismiss', {
                        defaultValue: 'Dismiss',
                      })}
                    </Button>
                    {r.targetUser && (
                      <>
                        <Button size="sm" variant="default" onClick={() => moderateUser(r.targetUser!.id, 'strike')}>
                          {t('strike-author', {
                            defaultValue: 'Strike author',
                          })}
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => moderateUser(r.targetUser!.id, 'ban')}>
                          {t('ban-author', {
                            defaultValue: 'Ban author',
                          })}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
