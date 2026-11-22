import { useEffect, useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/components/Providers';
import { deviceStoreText } from '@/components/settings/device-data-labels';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { useArrival } from '@/components/ui/arrive';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { clearEverything, clearStoreById, type ClearResult } from '@/lib/device-data/clear';
import {
  hasUnsentWork,
  inspectDevice,
  scaleBytes,
  type DeviceReport,
  type StoreReport,
} from '@/lib/device-data/inspect';
import { storeById } from '@/lib/device-data/registry';
import { readClearOnSignOut, writeClearOnSignOut } from '@/lib/device-data/sign-out';
import { toast } from '@/lib/toast';

/**
 * Settings > This device: everything the site keeps in this browser, read once when the page opens and again after
 * each clear (no polling, no observer), with Clear per row and for the whole device. Nothing found here is sent
 * anywhere. The page renders its frame on the server; the browser's storage is read only on the client, and the list
 * fades in when it replaces the skeleton.
 */
export function DeviceDataPanel() {
  const { t } = useTranslation('device-data');
  const format = useLocaleFormat();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);

  const report = useQuery<DeviceReport>({
    queryKey: ['device-data'],
    queryFn: () => inspectDevice(),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  const [announcement, setAnnouncement] = useState('');
  const [blocked, setBlocked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [clearOnSignOut, setClearOnSignOut] = useState(false);
  useEffect(() => {
    setClearOnSignOut(readClearOnSignOut());
  }, []);

  const texts = deviceStoreText(t);
  const switchLabelId = useId();
  const switchHintId = useId();

  const ready = !report.isPending;
  const listClass = useArrival(ready);

  const nameOf = (id: string) => texts[id]?.label ?? id;

  const sizeText = (bytes: number) => {
    const { value, unit } = scaleBytes(bytes);
    return format.number(value, {
      style: 'unit',
      unit,
      unitDisplay: 'short',
      maximumFractionDigits: value < 10 ? 1 : 0,
    });
  };

  const summaryOf = (r: StoreReport): string => {
    const store = storeById(r.id);
    if (r.id === 'studio')
      return [
        t('unsent-projects', {
          count: r.parts.projects ?? 0,
          defaultValue_one: '{{count}} Studio project',
          defaultValue_other: '{{count}} Studio projects',
          defaultValue: '{{count}} Studio projects',
        }),
        t('unsent-samples', {
          count: r.parts.samples ?? 0,
          defaultValue_one: '{{count}} Studio sample',
          defaultValue_other: '{{count}} Studio samples',
          defaultValue: '{{count}} Studio samples',
        }),
      ].join(' · ');
    if (store?.kind === 'indexeddb')
      return t('summary-records', {
        count: r.count,
        defaultValue_one: '{{count}} record',
        defaultValue_other: '{{count}} records',
        defaultValue: '{{count}} records',
      });
    if (store?.kind === 'cache-prefix')
      return t('summary-cached', {
        count: r.count,
        defaultValue_one: '{{count}} cached file',
        defaultValue_other: '{{count}} cached files',
        defaultValue: '{{count}} cached files',
      });
    return t('summary-keys', {
      count: r.count,
      defaultValue_one: '{{count}} saved item',
      defaultValue_other: '{{count}} saved items',
      defaultValue: '{{count}} saved items',
    });
  };

  /** Record what a clear did: which rows are stuck behind another tab, a polite announcement and a fresh read. */
  const finish = async (result: ClearResult, what: string) => {
    const stuck = new Set(result.rows.filter((row) => row.status === 'blocked').map((row) => row.storeId));
    setBlocked((prev) => {
      const next = new Set(prev);
      for (const row of result.rows) if (row.status === 'cleared') next.delete(row.storeId);
      for (const id of stuck) next.add(id);
      return next;
    });
    const failed = result.failed > 0;
    const message =
      stuck.size > 0
        ? t('announce-blocked', {
            name: what,
            defaultValue: 'Could not finish clearing {{name}}. Close other tabs of this site and try again.',
          })
        : failed
          ? t('announce-failed', {
              name: what,
              defaultValue: 'Could not clear {{name}}.',
            })
          : t('announce-cleared', {
              name: what,
              defaultValue: 'Cleared {{name}}.',
            });
    setAnnouncement(message);
    if (stuck.size > 0 || failed) toast.error(message);
    else toast.success(message);
    await queryClient.invalidateQueries({
      queryKey: ['device-data'],
    });
  };

  const clearRow = async (r: StoreReport) => {
    const name = nameOf(r.id);
    const ok = await confirm({
      title: t('confirm-row-title', {
        name,
        defaultValue: 'Clear {{name}}?',
      }),
      description: t('confirm-row-description', {
        summary: summaryOf(r),
        defaultValue: 'This removes {{summary}} from this browser. It cannot be undone.',
      }),
      confirmLabel: t('clear', {
        defaultValue: 'Clear',
      }),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await finish(await clearStoreById(r.id), name);
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    const unsent = report.data?.unsent;
    const ok = await confirm({
      title: t('confirm-all-title', {
        defaultValue: 'Clear everything on this device?',
      }),
      description:
        unsent && hasUnsentWork(unsent)
          ? t('confirm-all-description-unsent', {
              projects: unsent.projects,
              samples: unsent.samples,
              drafts: unsent.drafts,
              defaultValue:
                'This removes everything listed here, your settings included, and reloads the page. Studio projects: {{projects}}, samples: {{samples}}, unsent drafts: {{drafts}} exist only on this device. It cannot be undone.',
            })
          : t('confirm-all-description', {
              defaultValue:
                'This removes everything listed here, your settings included, and reloads the page. It cannot be undone.',
            }),
      confirmLabel: t('clear-all', {
        defaultValue: 'Clear everything on this device',
      }),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await clearEverything();
      await finish(
        result,
        t('everything', {
          defaultValue: 'everything on this device',
        }),
      );
      if (result.blocked === 0 && result.failed === 0) window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  const stores = report.data?.stores ?? [];
  const estimate = report.data?.estimate;

  return (
    <>
      <SettingsSection
        title={t('list-title', {
          defaultValue: 'Stored in this browser',
        })}
        description={t('list-description', {
          defaultValue: 'Everything this site keeps on this device. It is read here and never sent anywhere.',
        })}
      >
        {report.isPending ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : report.isError ? (
          <div className="flex flex-wrap items-center gap-3 border-b border-site-border py-3">
            <p className="t-body">
              {t('read-failed', {
                defaultValue: 'This browser would not say what is stored.',
              })}
            </p>
            <Button variant="default" onClick={() => void report.refetch()}>
              {t('retry', {
                defaultValue: 'Try again',
              })}
            </Button>
          </div>
        ) : stores.length === 0 ? (
          <EmptyState
            className={listClass}
            title={t('empty-title', {
              defaultValue: 'Nothing from this site is stored on this device',
            })}
          />
        ) : (
          <ul className={listClass}>
            {stores.map((r) => {
              const text = texts[r.id];
              const name = nameOf(r.id);
              return (
                <li key={r.id} className="settings-row border-b border-site-border">
                  <span className="settings-row__text">
                    <span className="settings-row__name block">{name}</span>
                    <span className="settings-row__hint block">{text?.hint}</span>
                    <span className="t-meta block">
                      {summaryOf(r)}
                      {r.bytes !== null ? ` · ${sizeText(r.bytes)}` : ''}
                    </span>
                    {blocked.has(r.id) ? (
                      <span className="t-meta block text-site-danger" role="status">
                        {t('blocked-row', {
                          defaultValue: 'Close other tabs of this site and try again.',
                        })}
                      </span>
                    ) : null}
                  </span>
                  <Button
                    variant="danger"
                    disabled={busy}
                    aria-label={t('clear-row-label', {
                      name,
                      defaultValue: 'Clear {{name}}',
                    })}
                    onClick={() => void clearRow(r)}
                  >
                    {t('clear', {
                      defaultValue: 'Clear',
                    })}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {estimate ? (
          <p className="t-meta mt-3">
            {t('estimate', {
              used: sizeText(estimate.usage),
              quota: sizeText(estimate.quota),
              defaultValue: 'This browser reports {{used}} used by this site, of {{quota}} available.',
            })}
          </p>
        ) : null}
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </SettingsSection>

      {signedIn ? (
        <SettingsSection
          title={t('signout-title', {
            defaultValue: 'Signing out',
          })}
        >
          <div className="settings-row">
            <span className="settings-row__text">
              <span id={switchLabelId} className="settings-row__name block">
                {t('signout-switch', {
                  defaultValue: 'Clear this device when I sign out',
                })}
              </span>
              <span id={switchHintId} className="settings-row__hint block">
                {t('signout-hint', {
                  defaultValue:
                    'Removes your saves, book pages and markers from this browser. Theme and language stay. If Studio work or unsent drafts exist only here, you are asked first.',
                })}
              </span>
            </span>
            <Switch
              checked={clearOnSignOut}
              onCheckedChange={(on) => {
                setClearOnSignOut(on);
                writeClearOnSignOut(on);
              }}
              aria-labelledby={switchLabelId}
              aria-describedby={switchHintId}
            />
          </div>
        </SettingsSection>
      ) : null}

      <SettingsSection
        title={t('all-title', {
          defaultValue: 'Everything',
        })}
        description={t('all-description', {
          defaultValue: 'Removes every item above, your theme and language included, and reloads the page.',
        })}
      >
        <Button variant="danger" disabled={busy || report.isPending} onClick={() => void clearAll()}>
          {t('clear-all', {
            defaultValue: 'Clear everything on this device',
          })}
        </Button>
      </SettingsSection>
    </>
  );
}
