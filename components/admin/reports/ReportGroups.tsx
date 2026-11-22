import { useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronRight, ExternalLink, Flag, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SelectionBar } from '@/components/ui/selection-bar';
import { QueueError } from '@/components/admin/reports/QueueError';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival } from '@/components/ui/arrive';
import { MacroField } from '@/components/safety/MacroField';
import { entityLink } from '@/components/admin/reports/ReportList';
import { NoteCount } from '@/components/admin/reports/NoteCount';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import {
  REMOVABLE_REPORT_ENTITY_TYPES,
  type ReportEntityType,
  type ReportReason,
} from '@/lib/moderation/report-schema';
import { groupKey, isOpenQueueStatus, searchToQuery, type TriageSearch } from '@/lib/moderation/triage';
import { MAX_DECIDE_GROUPS, type TriageStatus } from '@/lib/moderation/triage-schema';
import { decideReportGroupsApi, listReportGroupsApi, type ReportGroupRow } from '@/lib/moderation/triage.contract';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

type Decision = 'resolve' | 'dismiss';

/**
 * The grouped queue: one row per reported target. A group row carries a checkbox for the selection bar (bulk
 * Resolve / Dismiss across groups); expanding it lists the individual reports and offers the full decision for that
 * one target, including content removal and the message to its author (never in bulk).
 */
export function ReportGroups({
  status,
  search,
  onCounts,
}: {
  status: TriageStatus;
  search: TriageSearch;
  onCounts: (counts: Record<string, number>) => void;
}) {
  const fmt = useLocaleFormat();
  const { t } = useTranslation('report-triage');
  const { t: tr } = useTranslation('c-moderation');
  const confirm = useConfirm();
  const open = isOpenQueueStatus(status);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // The view's own filters, so a change of any of them reloads from the first page.
  const query = useMemo(
    () =>
      searchToQuery({
        ...search,
        status,
      }),
    [search, status],
  );
  const queryKey = JSON.stringify(query);

  const list = useInfiniteQuery({
    queryKey: ['admin', 'report-groups', queryKey],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const data = await api(listReportGroupsApi, {
        query: {
          ...JSON.parse(queryKey),
          cursor: pageParam,
        },
        retries: 0,
      });
      // The status tabs above show the counts from the latest answer.
      onCounts(data.counts);
      return data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
  });
  const groups = list.data?.pages.flatMap((p) => p.groups) ?? [];
  const page = list.data?.pages.at(-1) ?? null;
  const loading = list.isPending || (list.isRefetching && !list.isFetchingNextPage);
  const more = list.isFetchingNextPage;
  const failed = list.isError;
  const load = async (cursor?: string) => {
    if (cursor) await list.fetchNextPage();
    else await list.refetch();
  };
  // A new filter or status starts with nothing selected or expanded (React's
  // "adjust state when a value changes" pattern: during render, not in an effect).
  const [shownKey, setShownKey] = useState(queryKey);
  if (shownKey !== queryKey) {
    setShownKey(queryKey);
    setSelected(new Set());
    setExpanded(new Set());
  }
  const arrival = useArrival(!loading);

  const reasonLabels: Record<ReportReason, string> = {
    SPAM: tr('reason-spam', {
      defaultValue: 'Spam or scam',
    }),
    HARASSMENT: tr('reason-harassment', {
      defaultValue: 'Harassment or bullying',
    }),
    HATE: tr('reason-hate', {
      defaultValue: 'Hate speech',
    }),
    VIOLENCE: tr('reason-violence', {
      defaultValue: 'Violence or threats',
    }),
    SEXUAL: tr('reason-sexual', {
      defaultValue: 'Sexual or explicit content',
    }),
    SELF_HARM: tr('reason-self-harm', {
      defaultValue: 'Self-harm',
    }),
    MISINFORMATION: tr('reason-misinformation', {
      defaultValue: 'Misinformation',
    }),
    ILLEGAL: tr('reason-illegal', {
      defaultValue: 'Illegal content',
    }),
    OTHER: tr('reason-other', {
      defaultValue: 'Something else',
    }),
  };

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (!next.delete(key)) next.add(key);
    return next;
  };

  const decide = async (
    targets: ReportGroupRow[],
    action: Decision,
    opts: {
      deleteContent?: boolean;
    } = {},
  ) => {
    if (busy || targets.length === 0) return;
    const reports = targets.reduce((n, g) => n + g.count, 0);
    const ok = await confirm({
      title:
        action === 'resolve'
          ? t('confirm-resolve-title', {
              count: reports,
              defaultValue_one: 'Resolve {{count}} report?',
              defaultValue_other: 'Resolve {{count}} reports?',
              defaultValue: 'Resolve {{count}} reports?',
            })
          : t('confirm-dismiss-title', {
              count: reports,
              defaultValue_one: 'Dismiss {{count}} report?',
              defaultValue_other: 'Dismiss {{count}} reports?',
              defaultValue: 'Dismiss {{count}} reports?',
            }),
      description: t('confirm-description', {
        count: targets.length,
        defaultValue_one: 'Every open report on this target is decided, and each reporter is told the outcome.',
        defaultValue_other:
          'Every open report on these {{count}} targets is decided, and each reporter is told the outcome.',
        defaultValue: 'Every open report on these {{count}} targets is decided, and each reporter is told the outcome.',
      }),
      confirmLabel: opts.deleteContent
        ? t('resolve-and-remove', {
            defaultValue: 'Resolve and remove content',
          })
        : action === 'resolve'
          ? t('resolve', {
              defaultValue: 'Resolve',
            })
          : t('dismiss', {
              defaultValue: 'Dismiss',
            }),
      danger: opts.deleteContent === true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const only = targets.length === 1 ? targets[0] : undefined;
      const message = only ? messages[groupKey(only.entityType, only.entityId)]?.trim() : undefined;
      const result = await api(decideReportGroupsApi, {
        body: {
          targets: targets.map((g) => ({
            entityType: g.entityType as ReportEntityType,
            entityId: g.entityId,
          })),
          action,
          deleteContent: opts.deleteContent || undefined,
          message: message || undefined,
        },
        retries: 0,
      });
      toast.success(
        t('decided', {
          count: result.decided,
          defaultValue_one: '{{count}} report decided',
          defaultValue_other: '{{count}} reports decided',
          defaultValue: '{{count}} reports decided',
        }),
      );
      if (result.skipped > 0) {
        toast.info(
          t('skipped', {
            count: result.skipped,
            defaultValue_one: '{{count}} report was already decided by someone else',
            defaultValue_other: '{{count}} reports were already decided by someone else',
            defaultValue: '{{count}} reports were already decided by someone else',
          }),
        );
      }
      if (result.takedownFailed > 0) {
        toast.error(
          t('takedown-failed', {
            defaultValue: 'The content could not be removed; its reports stay open.',
          }),
        );
      }
      setSelected(new Set());
      await load();
    } catch {
      toast.error(
        t('decide-failed', {
          defaultValue: 'The decision failed. Nothing was changed.',
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (failed && groups.length === 0) {
    return <QueueError onRetry={() => void load()} />;
  }
  if (groups.length === 0) {
    return (
      <EmptyState
        className={arrival}
        icon={Flag}
        title={t('empty', {
          defaultValue: 'Nothing here. The queue is clear.',
        })}
      />
    );
  }

  const selectedGroups = groups.filter((g) => selected.has(groupKey(g.entityType, g.entityId)));

  return (
    <div className={arrival}>
      <p className="t-meta pb-2" aria-live="polite">
        {t('group-total', {
          count: page?.totalGroups ?? groups.length,
          defaultValue_one: '{{count}} group',
          defaultValue_other: '{{count}} groups',
          defaultValue: '{{count}} groups',
        })}
      </p>
      <ul className="divide-y divide-site-border border-y border-site-border">
        {groups.map((g) => {
          const key = groupKey(g.entityType, g.entityId);
          const isOpen = expanded.has(key);
          const label = g.preview || `${g.entityType} ${g.entityId}`;
          const link = entityLink(g.entityType, g.entityId, g.targetUser?.handle);
          const panelId = `group-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          return (
            <li key={key} className="py-4">
              <div className="flex items-start gap-3">
                {open && (
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0"
                    checked={selected.has(key)}
                    disabled={!selected.has(key) && selected.size >= MAX_DECIDE_GROUPS}
                    onChange={() => setSelected((s) => toggle(s, key))}
                    aria-label={t('select-group', {
                      target: label,
                      defaultValue: 'Select {{target}}',
                    })}
                  />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="t-heading">
                      {t('report-count', {
                        count: g.count,
                        defaultValue_one: '{{count}} report',
                        defaultValue_other: '{{count}} reports',
                        defaultValue: '{{count}} reports',
                      })}
                    </span>
                    <Badge variant="default">{g.entityType}</Badge>
                    {g.reasons.map((r) => (
                      <Badge key={r.reason} variant="danger">
                        {reasonLabels[r.reason] ?? r.reason} {r.count}
                      </Badge>
                    ))}
                  </div>
                  {g.preview && <p className="t-body break-words text-site-text">{g.preview}</p>}
                  <p className="t-meta">
                    {t('group-times', {
                      first: fmt.relative(new Date(g.firstAt)),
                      last: fmt.relative(new Date(g.lastAt)),
                      defaultValue: 'First report {{first}}, latest {{last}}',
                    })}
                  </p>
                  <div className="t-body flex flex-wrap items-center gap-x-4 gap-y-1 text-site-text-muted">
                    {g.targetUser && (
                      <span className="inline-flex items-center gap-2">
                        <UserAvatar src={g.targetUser.image} alt="" size={20} fallbackName={g.targetUser.name || 'U'} />
                        {t('against', {
                          defaultValue: 'against',
                        })}{' '}
                        <strong className="font-semibold text-site-text">
                          {g.targetUser.name || g.targetUser.handle}
                        </strong>
                        <NoteCount user={g.targetUser} count={g.targetNoteCount} />
                      </span>
                    )}
                    {g.reliability.known > 0 && (
                      <span>
                        {t('group-reliability', {
                          reliable: g.reliability.reliable,
                          known: g.reliability.known,
                          defaultValue: '{{reliable}} of {{known}} reporters usually report things that are upheld',
                        })}
                      </span>
                    )}
                    {link && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-site-text underline"
                      >
                        {t('view-content', {
                          defaultValue: 'View content',
                        })}
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setExpanded((s) => toggle(s, key))}
                  >
                    {isOpen ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
                    {isOpen
                      ? t('hide-reports', {
                          defaultValue: 'Hide reports',
                        })
                      : t('show-reports', {
                          defaultValue: 'Show reports',
                        })}
                  </Button>

                  {isOpen && (
                    <div id={panelId} className="space-y-4 pt-2">
                      <ul className="divide-y divide-site-border border-t border-site-border">
                        {g.reports.map((r) => (
                          <li key={r.id} className="space-y-1 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="danger">{reasonLabels[r.reason as ReportReason] ?? r.reason}</Badge>
                              {r.withdrawn && (
                                <Badge variant="default">
                                  {t('withdrawn', {
                                    defaultValue: 'Withdrawn by the reporter',
                                  })}
                                </Badge>
                              )}
                              <span className="t-meta">{fmt.relative(new Date(r.createdAt))}</span>
                            </div>
                            {r.details && <p className="t-body break-words">{r.details}</p>}
                            <p className="t-body text-site-text-muted">
                              {t('reported-by', {
                                defaultValue: 'Reported by',
                              })}{' '}
                              <strong className="font-semibold text-site-text">
                                {r.reporter.name || r.reporter.handle}
                              </strong>
                              {r.reporterRecord &&
                                `. ${t('reporter-record', {
                                  upheld: r.reporterRecord.upheld,
                                  decided: r.reporterRecord.decided,
                                  defaultValue: 'Reports by this member were upheld {{upheld}} of {{decided}} times',
                                })}`}
                            </p>
                          </li>
                        ))}
                      </ul>
                      {g.count > g.reports.length && (
                        <p className="t-meta">
                          {t('reports-capped', {
                            shown: g.reports.length,
                            defaultValue: 'Showing the newest {{shown}}. A decision covers all of them.',
                          })}
                        </p>
                      )}
                      {open && (
                        <div className="space-y-3">
                          {g.targetUser && (
                            <MacroField
                              scope={{
                                kind: 'admin',
                              }}
                              vars={{
                                user: g.targetUser.name || g.targetUser.handle || undefined,
                                reason: g.reasons[0] ? reasonLabels[g.reasons[0].reason].toLowerCase() : undefined,
                              }}
                              value={messages[key] ?? ''}
                              onChange={(v) =>
                                setMessages((m) => ({
                                  ...m,
                                  [key]: v,
                                }))
                              }
                            />
                          )}
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={busy}
                              onClick={() => void decide([g], 'resolve')}
                            >
                              <Check aria-hidden />
                              {t('resolve', {
                                defaultValue: 'Resolve',
                              })}
                            </Button>
                            {(REMOVABLE_REPORT_ENTITY_TYPES as readonly string[]).includes(g.entityType) && (
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={busy}
                                onClick={() =>
                                  void decide([g], 'resolve', {
                                    deleteContent: true,
                                  })
                                }
                              >
                                {g.entityType === 'build-comment'
                                  ? t('delete-comment', {
                                      defaultValue: 'Delete comment',
                                    })
                                  : t('resolve-and-remove', {
                                      defaultValue: 'Resolve and remove content',
                                    })}
                              </Button>
                            )}
                            <Button size="sm" disabled={busy} onClick={() => void decide([g], 'dismiss')}>
                              <X aria-hidden />
                              {t('dismiss', {
                                defaultValue: 'Dismiss',
                              })}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {page?.nextCursor && (
        <div className="flex justify-center pt-4">
          <Button disabled={more} onClick={() => void load(page.nextCursor ?? undefined)}>
            {t('load-more', {
              defaultValue: 'Load more groups',
            })}
          </Button>
        </div>
      )}
      {failed && (
        <p className="t-body pt-2 text-site-danger" role="alert">
          {t('load-failed', {
            defaultValue: 'The queue could not be loaded.',
          })}
        </p>
      )}

      {open && (
        <SelectionBar
          count={selected.size}
          onClear={() => setSelected(new Set())}
          actions={[
            {
              id: 'resolve',
              label: t('resolve', {
                defaultValue: 'Resolve',
              }),
              variant: 'primary',
              disabled: busy,
              onClick: () => void decide(selectedGroups, 'resolve'),
            },
            {
              id: 'dismiss',
              label: t('dismiss', {
                defaultValue: 'Dismiss',
              }),
              variant: 'default',
              disabled: busy,
              onClick: () => void decide(selectedGroups, 'dismiss'),
            },
          ]}
        />
      )}
    </div>
  );
}
