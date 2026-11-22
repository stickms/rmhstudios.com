import { useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { Tabs } from '@/components/ui/tabs';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { useArrival } from '@/components/ui/arrive';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { listAdminApiKeysApi, patchAdminApiKeyApi } from '@/lib/admin/api-keys.contract';
import {
  ADMIN_CAP_MAX,
  ADMIN_CAP_MIN,
  HIGH_ERROR_RATE,
  SUSPEND_REASON_MAX,
  SUSPEND_REASON_MIN,
  errorRate,
  type AdminApiKeyRow,
  type ApiKeyStatus,
} from '@/lib/admin/api-keys';

type StatusFilter = 'all' | ApiKeyStatus;

/**
 * The key table of /admin/api-keys: rows on rules, busiest key first, with the filters, the
 * suspend / lift / cap actions and a "Show more" for the next page of 50. No hash, secret or
 * address range is ever in a row: a count of ranges only.
 */
export function ApiKeysTable() {
  const { t } = useTranslation('admin-api-oversight');
  const fmt = useLocaleFormat();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [highErrors, setHighErrors] = useState(false);
  const [ownerText, setOwnerText] = useState('');
  const [owner, setOwner] = useState('');
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const filters = {
    ...(status === 'all'
      ? {}
      : {
          status,
        }),
    ...(highErrors
      ? {
          errors: 'high' as const,
        }
      : {}),
    ...(owner
      ? {
          owner,
        }
      : {}),
  };
  const list = useInfiniteQuery({
    queryKey: [listAdminApiKeysApi.path, filters],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api(listAdminApiKeysApi, {
        query: {
          ...filters,
          ...(pageParam
            ? {
                cursor: pageParam,
              }
            : {}),
        },
        signal,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.keys) ?? [];
  const arrival = useArrival(!list.isPending);

  const submitOwner = (e: FormEvent) => {
    e.preventDefault();
    const text = ownerText.trim();
    if (text.includes('@') && !text.startsWith('@')) {
      setOwnerError(
        t('owner-not-email', {
          defaultValue: 'Enter a handle, not an e-mail address.',
        }),
      );
      return;
    }
    if (text.length > 0 && !/^@?[A-Za-z0-9_.-]{1,40}$/.test(text)) {
      setOwnerError(
        t('owner-invalid', {
          defaultValue: 'A handle has letters, digits, dots, dashes and underscores.',
        }),
      );
      return;
    }
    setOwnerError(null);
    setOwner(text);
  };

  const change = async (
    row: AdminApiKeyRow,
    body: {
      suspend?: {
        reason: string;
      } | null;
      adminRateLimitPerMinute?: number | null;
    },
    done: string,
  ) => {
    setBusy(row.id);
    try {
      await api(patchAdminApiKeyApi, {
        params: {
          id: row.id,
        },
        body,
      });
      toast.success(done);
      await queryClient.invalidateQueries({
        queryKey: [listAdminApiKeysApi.path],
      });
    } catch (error) {
      toast.error(
        serverError(error) ??
          t('change-failed', {
            defaultValue: 'That change did not save. Try again.',
          }),
      );
    } finally {
      setBusy(null);
    }
  };

  const suspend = async (row: AdminApiKeyRow) => {
    const reason = await prompt({
      title: t('suspend-title', {
        defaultValue: 'Suspend this key',
      }),
      label: t('suspend-label', {
        defaultValue: 'Reason (the owner can read it)',
      }),
      confirmLabel: t('suspend-confirm', {
        defaultValue: 'Suspend',
      }),
      cancelLabel: t('cancel', {
        defaultValue: 'Cancel',
      }),
      validate: (v) => {
        const n = v.trim().length;
        return n < SUSPEND_REASON_MIN || n > SUSPEND_REASON_MAX
          ? t('suspend-reason-length', {
              count: Number(SUSPEND_REASON_MAX),
              defaultValue_one: 'The reason is {{min}} to {{max}} character.',
              defaultValue: 'The reason is {{min}} to {{max}} characters.',
              min: SUSPEND_REASON_MIN,
              max: SUSPEND_REASON_MAX,
            })
          : null;
      },
    });
    if (reason === null) return;
    await change(
      row,
      {
        suspend: {
          reason: reason.trim(),
        },
      },
      t('suspended-toast', {
        defaultValue: 'Key suspended.',
      }),
    );
  };

  const lift = async (row: AdminApiKeyRow) => {
    const ok = await confirm({
      title: t('lift-title', {
        defaultValue: 'Lift the suspension?',
      }),
      description: t('lift-description', {
        defaultValue: 'The same key works again, with no new secret. Its owner is told.',
      }),
      confirmLabel: t('lift-confirm', {
        defaultValue: 'Lift suspension',
      }),
      cancelLabel: t('cancel', {
        defaultValue: 'Cancel',
      }),
    });
    if (!ok) return;
    await change(
      row,
      {
        suspend: null,
      },
      t('lifted-toast', {
        defaultValue: 'Suspension lifted.',
      }),
    );
  };

  const cap = async (row: AdminApiKeyRow) => {
    const text = await prompt({
      title: t('cap-title', {
        defaultValue: 'Set a rate cap',
      }),
      label: t('cap-label', {
        defaultValue: 'Requests a minute, {{min}} to {{max}}. Leave empty to remove the cap.',
        min: ADMIN_CAP_MIN,
        max: ADMIN_CAP_MAX,
      }),
      initialValue: row.adminRateLimitPerMinute === null ? '' : String(row.adminRateLimitPerMinute),
      confirmLabel: t('cap-confirm', {
        defaultValue: 'Save cap',
      }),
      cancelLabel: t('cancel', {
        defaultValue: 'Cancel',
      }),
      validate: (v) => {
        const s = v.trim();
        if (s === '') return null;
        const n = Number(s);
        return /^\d+$/.test(s) && n >= ADMIN_CAP_MIN && n <= ADMIN_CAP_MAX
          ? null
          : t('cap-invalid', {
              defaultValue: 'Enter a whole number from {{min}} to {{max}}.',
              min: ADMIN_CAP_MIN,
              max: ADMIN_CAP_MAX,
            });
      },
    });
    if (text === null) return;
    const value = text.trim() === '' ? null : Number(text.trim());
    await change(
      row,
      {
        adminRateLimitPerMinute: value,
      },
      value === null
        ? t('cap-removed-toast', {
            defaultValue: 'Cap removed.',
          })
        : t('cap-saved-toast', {
            defaultValue: 'Cap saved.',
          }),
    );
  };

  const tabs = [
    {
      id: 'all',
      label: t('status-all', {
        defaultValue: 'All',
      }),
    },
    {
      id: 'active',
      label: t('status-active', {
        defaultValue: 'Active',
      }),
    },
    {
      id: 'suspended',
      label: t('status-suspended', {
        defaultValue: 'Suspended',
      }),
    },
    {
      id: 'expired',
      label: t('status-expired', {
        defaultValue: 'Expired',
      }),
    },
  ];
  const pct = (n: number) =>
    fmt.number(n, {
      style: 'percent',
      maximumFractionDigits: 1,
    });

  return (
    <div className="space-y-4">
      <Tabs
        tabs={tabs}
        value={status}
        onChange={(id) => setStatus(id as StatusFilter)}
        aria-label={t('status-filter', {
          defaultValue: 'Filter by status',
        })}
      />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <form onSubmit={submitOwner} className="flex min-w-0 flex-1 flex-wrap items-center gap-2" role="search">
          <SearchField
            value={ownerText}
            onValueChange={(v) => {
              setOwnerText(v);
              setOwnerError(null);
              if (v.trim() === '') setOwner('');
            }}
            placeholder={t('owner-placeholder', {
              defaultValue: 'Owner handle',
            })}
            aria-label={t('owner-label', {
              defaultValue: 'Filter by owner handle',
            })}
            containerClassName="min-w-0 flex-1 sm:max-w-xs"
            maxLength={41}
          />
          <Button type="submit" variant="default">
            {t('owner-apply', {
              defaultValue: 'Filter',
            })}
          </Button>
        </form>
        <label className="flex min-h-9 items-center gap-2 t-body text-site-text">
          <input
            type="checkbox"
            checked={highErrors}
            onChange={(e) => setHighErrors(e.target.checked)}
            className="accent-site-accent"
          />
          {t('errors-filter', {
            defaultValue: 'Errors above {{percent}}',
            percent: pct(HIGH_ERROR_RATE),
          })}
        </label>
      </div>
      {ownerError ? (
        <p role="alert" className="t-meta text-site-danger">
          {ownerError}
        </p>
      ) : null}

      {list.isPending ? (
        <div
          className="space-y-3"
          aria-busy="true"
          aria-label={t('loading', {
            defaultValue: 'Loading keys',
          })}
        >
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : list.isError ? (
        <div role="alert" className="space-y-3 border-b border-site-border py-4">
          <p className="t-body text-site-danger">
            {t('load-failed', {
              defaultValue: 'The keys did not load.',
            })}
          </p>
          <Button variant="default" onClick={() => void list.refetch()}>
            {t('retry', {
              defaultValue: 'Try again',
            })}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('empty-title', {
            defaultValue: 'No keys match',
          })}
          description={t('empty-description', {
            defaultValue: 'Change a filter to see more keys.',
          })}
        />
      ) : (
        <div className={arrival}>
          <ul className="divide-y divide-site-border border-y border-site-border">
            {rows.map((row) => {
              const rate4 = errorRate(row.week.clientErrors, row.week.requests);
              const rate5 = errorRate(row.week.serverErrors, row.week.requests);
              const working = busy === row.id;
              return (
                <li key={row.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="t-heading min-w-0 truncate text-site-text">{row.name}</span>
                    {row.testMode ? (
                      <span className="t-meta text-site-text-muted">
                        {t('test-mark', {
                          defaultValue: 'Test',
                        })}
                      </span>
                    ) : null}
                    <span
                      className={row.status === 'suspended' ? 't-meta text-site-danger' : 't-meta text-site-text-muted'}
                    >
                      {row.status === 'active'
                        ? t('row-status-active', {
                            defaultValue: 'Active',
                          })
                        : row.status === 'suspended'
                          ? t('row-status-suspended', {
                              defaultValue: 'Suspended',
                            })
                          : t('row-status-expired', {
                              defaultValue: 'Expired',
                            })}
                    </span>
                    <span className="t-meta text-site-text-muted">
                      {row.owner.handle
                        ? `@${row.owner.handle}`
                        : t('owner-unknown', {
                            defaultValue: 'No handle',
                          })}
                    </span>
                  </div>
                  <p className="t-meta break-words text-site-text-muted">
                    {row.prefix}…{row.lastFour ?? ''} ·{' '}
                    {t('row-scopes', {
                      defaultValue_one: '{{count}} scope',
                      defaultValue: '{{count}} scopes',
                      count: row.scopes.length,
                    })}{' '}
                    ·{' '}
                    {t('row-ranges', {
                      defaultValue_one: '{{count}} address range',
                      defaultValue: '{{count}} address ranges',
                      count: row.allowedCidrCount,
                    })}{' '}
                    ·{' '}
                    {t('row-created', {
                      defaultValue: 'created {{date}}',
                      date: fmt.date(row.createdAt),
                    })}{' '}
                    ·{' '}
                    {row.lastUsedAt
                      ? t('row-last-used', {
                          defaultValue: 'last used {{date}}',
                          date: fmt.date(row.lastUsedAt),
                        })
                      : t('row-never-used', {
                          defaultValue: 'never used',
                        })}
                    {row.adminRateLimitPerMinute !== null ? (
                      <>
                        {' · '}
                        {t('row-cap', {
                          defaultValue: 'capped at {{limit}} a minute',
                          limit: row.adminRateLimitPerMinute,
                        })}
                      </>
                    ) : null}
                  </p>
                  <p className="t-meta break-words text-site-text">
                    {t('row-today', {
                      defaultValue: 'Today {{requests}} requests, {{units}} units',
                      requests: fmt.number(row.today.requests),
                      units: fmt.number(row.today.units),
                    })}{' '}
                    ·{' '}
                    {t('row-week', {
                      defaultValue: '7 days {{requests}} requests, {{units}} units',
                      requests: fmt.number(row.week.requests),
                      units: fmt.number(row.week.units),
                    })}{' '}
                    ·{' '}
                    {t('row-4xx', {
                      defaultValue: '4xx {{rate}}',
                      rate: pct(rate4),
                    })}{' '}
                    ·{' '}
                    {t('row-5xx', {
                      defaultValue: '5xx {{rate}}',
                      rate: pct(rate5),
                    })}{' '}
                    ·{' '}
                    {t('row-refusals', {
                      defaultValue_one: '{{count}} address refusal',
                      defaultValue: '{{count}} address refusals',
                      count: row.refusals,
                    })}{' '}
                    ·{' '}
                    {t('row-webhooks', {
                      count: Number(row.webhooks.total),
                      defaultValue_one: '{{total}} webhook, {{disabled}} disabled',
                      defaultValue: '{{total}} webhooks, {{disabled}} disabled',
                      total: row.webhooks.total,
                      disabled: row.webhooks.disabled,
                    })}
                  </p>
                  {row.suspendedAt ? (
                    <p className="t-meta break-words text-site-text-muted">
                      {t('row-suspended-note', {
                        defaultValue: 'Suspended {{date}}: {{reason}}',
                        date: fmt.date(row.suspendedAt),
                        reason: row.suspendReason ?? '',
                      })}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {row.status === 'suspended' ? (
                      <Button variant="default" disabled={working} onClick={() => void lift(row)}>
                        {t('lift', {
                          defaultValue: 'Lift suspension',
                        })}
                      </Button>
                    ) : (
                      <Button variant="default" disabled={working} onClick={() => void suspend(row)}>
                        {t('suspend', {
                          defaultValue: 'Suspend',
                        })}
                      </Button>
                    )}
                    <Button variant="default" disabled={working} onClick={() => void cap(row)}>
                      {t('set-cap', {
                        defaultValue: 'Set cap',
                      })}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {list.hasNextPage ? (
            <div className="pt-4">
              <Button variant="default" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                {t('show-more', {
                  defaultValue: 'Show more',
                })}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
