import { createFileRoute, redirect, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

const getAdminSession = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
    throw redirect({ to: '/' });
  }
  return null;
});

export const Route = createFileRoute('/_site/admin/library-storage')({
  head: () => ({ meta: [{ title: 'Library Storage Health | RMH Studios' }] }),
  beforeLoad: () => getAdminSession(),
  component: AdminLibraryStoragePage,
});

type Health = {
  durable: boolean;
  backend: string;
  bucket: string | null;
  total: number;
  missing: { slug: string; title: string; key: string }[];
};

function AdminLibraryStoragePage() {
  const { t } = useTranslation('admin');
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/library/storage-health').catch(() => null);
    if (res?.ok) setHealth((await res.json().catch(() => null)) as Health | null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageLayout title={t('library-storage-title', { defaultValue: 'Library Storage Health' })} wide>
      <div className="mb-4 flex items-center justify-between">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-site-text-muted hover:text-site-text">
          <ArrowLeft size={15} /> {t('back-to-admin', { defaultValue: 'Back to admin' })}
        </Link>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" size={15} /> : null} {t('refresh', { defaultValue: 'Refresh' })}
        </Button>
      </div>

      {loading && !health ? (
        <div className="flex items-center gap-2 text-site-text-muted">
          <Loader2 className="animate-spin" size={18} /> {t('checking-storage', { defaultValue: 'Checking storage…' })}
        </div>
      ) : !health ? (
        <p className="text-site-text-muted">{t('load-failed', { defaultValue: 'Could not load storage health.' })}</p>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Backend banner */}
          <div
            className={`rounded-site-sm border p-4 ${
              health.durable
                ? 'border-site-success/40 bg-site-success/10'
                : 'border-site-danger/50 bg-site-danger/10'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold text-site-text">
              {health.durable ? (
                <CheckCircle2 size={18} className="text-site-success" />
              ) : (
                <AlertTriangle size={18} className="text-site-danger" />
              )}
              {health.backend}
            </div>
            {health.bucket && (
              <p className="text-sm text-site-text-muted mt-1">
                {t('bucket-label', { bucket: health.bucket, defaultValue: 'Bucket: {{bucket}}' })}
              </p>
            )}
            {!health.durable && (
              <p className="text-sm text-site-danger mt-2">
                {t('storage-fix', {
                  defaultValue:
                    'Set S3_ENDPOINT / S3_REGION / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY / S3_BUCKET (Cloudflare R2) in the production runtime. Until then, uploads land on disposable local disk and disappear when the container recycles.',
                })}
              </p>
            )}
          </div>

          {/* Missing objects */}
          <div>
            <h2 className="text-lg font-semibold text-site-text mb-2">
              {t('missing-objects', {
                missing: health.missing.length,
                total: health.total,
                defaultValue: '{{missing}} of {{total}} books are missing their file in storage',
              })}
            </h2>
            {health.missing.length === 0 ? (
              <p className="text-site-text-muted">
                {t('all-present', { defaultValue: 'Every library file is present in storage. ✓' })}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {health.missing.map((m) => (
                  <li key={m.slug} className="rounded-site-sm border border-site-border bg-site-card px-3 py-2">
                    <p className="text-sm font-medium text-site-text">{m.title}</p>
                    <p className="text-xs text-site-text-muted font-mono">{m.key}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </PageLayout>
  );
}
