'use client';

import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Flag, LogIn, LogOut, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useSession } from '@/components/Providers';
import type { RingDetail } from '@/lib/profile/webrings';
import { useJson } from '../useJson';

const ReportDialog = lazy(() =>
  import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);

/** P6 — one ring: its members in join order, and join / leave / close / report. */
export default function RingPage({ slug }: { slug: string }) {
  const { t } = useTranslation('f-profile-plus');
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { data: ring, reload } = useJson<RingDetail>(`/api/webrings/${encodeURIComponent(slug)}`);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);

  async function membership(join: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/webrings/${encodeURIComponent(slug)}/membership`, {
        method: join ? 'POST' : 'DELETE',
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? t('ring-join-failed', { defaultValue: "Couldn't update that" }));
        return;
      }
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    const ok = await confirm({
      title: t('ring-close-title', { defaultValue: 'Close this ring?' }),
      description: t('ring-close-desc', {
        defaultValue: 'It disappears for everyone in it. This can’t be undone.',
      }),
      confirmLabel: t('ring-close-confirm', { defaultValue: 'Close ring' }),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/webrings/${encodeURIComponent(slug)}`, { method: 'DELETE' });
      if (res.ok) void navigate({ to: '/rings' });
      else toast.error(t('ring-close-failed', { defaultValue: "Couldn't close the ring" }));
    } finally {
      setBusy(false);
    }
  }

  if (ring === undefined) return <Skeleton className="m-4 h-48" />;
  if (ring === null) {
    return (
      <EmptyState
        title={t('ring-missing', { defaultValue: 'That ring doesn’t exist' })}
        action={
          <Button asChild variant="accent" size="sm">
            <Link to="/rings">{t('rings-browse', { defaultValue: 'Browse rings' })}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 pb-12 pt-4">
      <header className="space-y-2">
        <h2 className="font-display text-2xl font-bold text-site-text">{ring.name}</h2>
        {ring.description ? (
          <p className="whitespace-pre-wrap break-words text-sm text-site-text-muted">
            {ring.description}
          </p>
        ) : null}
        <p className="text-xs text-site-text-dim">
          {t('ring-members', {
            count: ring.memberCount,
            defaultValue_one: '{{count}} member',
            defaultValue: '{{count}} members',
          })}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {signedIn ? (
            ring.isMember ? (
              <Button
                variant="outline"
                size="sm"
                loading={busy}
                onClick={() => void membership(false)}
              >
                <LogOut aria-hidden />
                {t('ring-leave', { defaultValue: 'Leave ring' })}
              </Button>
            ) : (
              <Button
                variant="accent"
                size="sm"
                loading={busy}
                onClick={() => void membership(true)}
              >
                <LogIn aria-hidden />
                {t('ring-join', { defaultValue: 'Join ring' })}
              </Button>
            )
          ) : (
            <Button asChild variant="accent" size="sm">
              <Link to="/login" search={{ callbackURL: `/rings/${slug}` }}>
                {t('ring-sign-in', { defaultValue: 'Sign in to join' })}
              </Link>
            </Button>
          )}
          {ring.isOwner ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void close()}>
              <Trash2 aria-hidden />
              {t('ring-close', { defaultValue: 'Close ring' })}
            </Button>
          ) : signedIn ? (
            <Button variant="ghost" size="sm" onClick={() => setReporting(true)}>
              <Flag aria-hidden />
              {t('ring-report', { defaultValue: 'Report' })}
            </Button>
          ) : null}
        </div>
      </header>

      <section aria-labelledby="ring-roster" className="space-y-3">
        <h3 id="ring-roster" className="site-section-label">
          {t('ring-roster', { defaultValue: 'In join order' })}
        </h3>
        {ring.members.length === 0 ? (
          <p className="text-sm text-site-text-muted">
            {t('ring-no-members', { defaultValue: 'Nobody you can see is in this ring yet.' })}
          </p>
        ) : (
          <ol className="space-y-2">
            {ring.members.map((m, i) => (
              <li key={m.id}>
                <Link
                  to={`/u/${m.handle ?? m.id}` as string}
                  className="glass-fill glass-interactive flex items-center gap-3 rounded-site-sm px-3 py-2"
                >
                  <span className="w-6 text-sm tabular-nums text-site-text-dim">{i + 1}</span>
                  <UserAvatar src={m.image} alt="" size={32} fallbackName={m.name ?? undefined} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-site-text">
                      {m.name ?? m.handle}
                    </span>
                    {m.handle ? (
                      <span className="block truncate text-xs text-site-text-dim">@{m.handle}</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      {reporting ? (
        <Suspense fallback={null}>
          <ReportDialog
            open={reporting}
            onOpenChange={setReporting}
            entityType="webring"
            entityId={ring.id}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
