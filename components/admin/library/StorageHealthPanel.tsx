'use client';

/**
 * Library storage health, formerly the whole of `/admin/library-storage`.
 * Now the second tab of `/admin/library` — see that route's docblock.
 *
 * `onRefreshStateChange` hands the loading flag back up so the page header can
 * own the single Refresh button: the button belongs to the page chrome, and the
 * panel is what knows whether a request is in flight.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileWarning,
  HardDrive,
  Library,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

type Health = {
  durable: boolean;
  backend: string;
  bucket: string | null;
  total: number;
  missing: { slug: string; title: string; key: string }[];
};

/** An etched glass stat tile: mono label above a display-font value. */
function StatTile({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'success' | 'danger';
}) {
  const toneText =
    tone === 'success'
      ? 'text-site-success'
      : tone === 'danger'
        ? 'text-site-danger'
        : 'text-site-text';
  return (
    <div className="glass-pane flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2 font-mono text-[0.68rem] tracking-widest text-site-text-dim uppercase">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className={`truncate font-display text-2xl font-bold tracking-tight ${toneText}`}>
        {value}
      </div>
    </div>
  );
}

export function StorageHealthPanel({
  reloadToken = 0,
  onRefreshStateChange,
}: {
  /** Bump to re-fetch — the page header's Refresh button increments it. */
  reloadToken?: number;
  onRefreshStateChange?: (loading: boolean) => void;
}) {
  const { t } = useTranslation('admin');
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    onRefreshStateChange?.(true);
    const res = await fetch('/api/admin/library/storage-health').catch(() => null);
    if (res?.ok) setHealth((await res.json().catch(() => null)) as Health | null);
    setLoading(false);
    onRefreshStateChange?.(false);
  }, [onRefreshStateChange]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  if (loading && !health) {
    // Skeleton mirrors the final layout so nothing pops in out of order.
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-site" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-site" />
      </div>
    );
  }

  if (!health) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={t('load-failed', { defaultValue: 'Could not load storage health.' })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Stat grid — reads at a glance on desktop, wraps to 2-up on phones. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          icon={health.durable ? CheckCircle2 : AlertTriangle}
          label={t('stat-durability', { defaultValue: 'Durability' })}
          value={
            health.durable
              ? t('stat-durable', { defaultValue: 'Durable' })
              : t('stat-ephemeral', { defaultValue: 'Ephemeral' })
          }
          tone={health.durable ? 'success' : 'danger'}
        />
        <StatTile
          icon={Database}
          label={t('stat-backend', { defaultValue: 'Backend' })}
          value={health.backend}
        />
        <StatTile
          icon={Library}
          label={t('stat-books', { defaultValue: 'Books' })}
          value={health.total.toLocaleString()}
        />
        <StatTile
          icon={FileWarning}
          label={t('stat-missing', { defaultValue: 'Missing files' })}
          value={health.missing.length.toLocaleString()}
          tone={health.missing.length > 0 ? 'danger' : 'success'}
        />
      </div>

      {health.bucket && (
        <div className="flex items-center gap-2 text-sm text-site-text-muted">
          <HardDrive className="size-4 shrink-0 text-site-text-dim" aria-hidden />
          <span>{t('bucket-label-inline', { defaultValue: 'Bucket' })}</span>
          <code className="glass-inset rounded-site-sm px-2 py-0.5 font-mono text-xs text-site-text">
            {health.bucket}
          </code>
        </div>
      )}

      {/* Durability warning — a danger-rimmed pane when storage is ephemeral. */}
      {!health.durable && (
        <Card
          pane
          className="gap-2 border-site-danger/40 p-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--site-danger)_35%,transparent)]"
        >
          <div className="flex items-center gap-2 font-semibold text-site-text">
            <AlertTriangle className="size-[18px] shrink-0 text-site-danger" aria-hidden />
            {t('storage-ephemeral-title', { defaultValue: 'Uploads are not durable' })}
          </div>
          <p className="text-sm text-site-danger">
            {t('storage-fix', {
              defaultValue:
                'Set S3_ENDPOINT / S3_REGION / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY / S3_BUCKET (Cloudflare R2) in the production runtime. Until then, uploads land on disposable local disk and disappear when the container recycles.',
            })}
          </p>
        </Card>
      )}

      {/* Missing objects */}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-site-text">
          {t('missing-objects', {
            missing: health.missing.length,
            total: health.total,
            defaultValue: '{{missing}} of {{total}} books are missing their file in storage',
          })}
        </h2>
        {health.missing.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title={t('all-present', {
              defaultValue: 'Every library file is present in storage.',
            })}
            description={t('all-present-hint', {
              defaultValue: 'Nothing to reconcile — the catalog and object store are in sync.',
            })}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {health.missing.map((m) => (
              <li key={m.slug} className="glass-fill flex flex-col gap-0.5 px-3.5 py-2.5">
                <p className="text-sm font-medium text-site-text">{m.title}</p>
                <p className="truncate font-mono text-xs text-site-text-muted">{m.key}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
