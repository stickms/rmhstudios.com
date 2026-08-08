/**
 * Strike-appeal review queue. Admin only.
 *
 * Pending appeals are served oldest-first by the API — an appeal queue is a
 * commitment about response time, so the longest-waiting user is always the
 * next card. Overturning an appeal voids the strike and lifts the auto-ban it
 * caused; that happens server-side in POST /api/admin/appeals/$id.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Gavel, ShieldCheck, ShieldX, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';

export const Route = createFileRoute('/_site/admin/appeals')({
  head: () => ({ meta: [{ title: 'Strike Appeals | RMH Studios' }] }),
  component: AdminAppealsPage,
});

type View = 'PENDING' | 'UPHELD' | 'OVERTURNED';

interface QueueUser {
  id: string;
  name: string | null;
  image: string | null;
  handle: string | null;
}

interface Appeal {
  id: string;
  reason: string;
  createdAt: string;
  expiresAt: string | null;
  entityType: string | null;
  entityId: string | null;
  appealStatus: View;
  appealText: string | null;
  appealedAt: string | null;
  appealNote: string | null;
  decidedAt: string | null;
  user: QueueUser;
  issuedBy: QueueUser;
  decidedBy: QueueUser | null;
}

function AdminAppealsPage() {
  const { t } = useTranslation('admin');
  const [view, setView] = useState<View>('PENDING');
  const [items, setItems] = useState<Appeal[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async (v: View) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/appeals?status=${v}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
        setCounts(data.counts ?? {});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(view);
  }, [view, load]);

  const decide = async (id: string, action: 'uphold' | 'overturn') => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/appeals/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, note: notes[id]?.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t('action-failed', { defaultValue: 'Action failed' }));
        return;
      }
      toast.success(
        action === 'overturn'
          ? data.banLifted
            ? t('appeal-overturned-unbanned', {
                defaultValue: 'Strike removed and the automatic ban was lifted.',
              })
            : t('appeal-overturned-toast', { defaultValue: 'Strike removed.' })
          : t('appeal-upheld-toast', { defaultValue: 'Strike upheld.' })
      );
      setItems((prev) => prev.filter((a) => a.id !== id));
      load(view);
    } finally {
      setBusyId(null);
    }
  };

  const tabs: LiquidTab[] = [
    {
      id: 'PENDING',
      label: t('appeals-pending', { defaultValue: 'Pending' }),
      icon: Clock,
      badge: counts.PENDING || undefined,
    },
    {
      id: 'OVERTURNED',
      label: t('appeals-overturned', { defaultValue: 'Overturned' }),
      icon: ShieldCheck,
      count: counts.OVERTURNED || undefined,
    },
    {
      id: 'UPHELD',
      label: t('appeals-upheld', { defaultValue: 'Upheld' }),
      icon: ShieldX,
      count: counts.UPHELD || undefined,
    },
  ];

  return (
    <PageLayout title={t('appeals-queue', { defaultValue: 'Strike Appeals' })} wide backTo="/admin">
      <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
        <div className="flex items-center gap-2 text-sm text-site-text-muted">
          <Gavel className="h-5 w-5 shrink-0 text-site-accent" aria-hidden />
          {t('appeals-queue-description', {
            defaultValue:
              'Users contesting a strike. Overturning removes the strike and lifts any ban it triggered.',
          })}
        </div>

        <LiquidTabs
          tabs={tabs}
          value={view}
          onChange={(id) => setView(id as View)}
          aria-label={t('appeals-queue', { defaultValue: 'Strike Appeals' })}
        />

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Gavel}
            title={t('appeals-empty', { defaultValue: 'No appeals here. The queue is clear.' })}
          />
        ) : (
          <ul className="space-y-3">
            {items.map((a) => (
              <li key={a.id} className="glass-fill rounded-site p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="danger" size="sm">
                    {t('strike', { defaultValue: 'Strike' })}
                  </Badge>
                  {a.entityType && (
                    <Badge variant="outline" size="sm">
                      {a.entityType}
                    </Badge>
                  )}
                  <span className="text-xs text-site-text-dim">
                    {t('issued-ago', {
                      defaultValue: 'issued {{when}}',
                      when: formatDistanceToNow(new Date(a.createdAt), { addSuffix: true }),
                    })}
                  </span>
                  {a.appealedAt && (
                    <span className="text-xs text-site-text-dim">
                      ·{' '}
                      {t('appealed-ago', {
                        defaultValue: 'appealed {{when}}',
                        when: formatDistanceToNow(new Date(a.appealedAt), { addSuffix: true }),
                      })}
                    </span>
                  )}
                </div>

                <p className="mt-2 text-sm text-site-text">{a.reason}</p>

                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-site-text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <UserAvatar
                      src={a.user.image}
                      alt={a.user.name || t('user', { defaultValue: 'User' })}
                      size={20}
                      fallbackName={a.user.name || 'U'}
                    />
                    <strong className="text-site-text">{a.user.name || a.user.handle}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    {t('issued-by', { defaultValue: 'issued by' })}
                    <strong className="text-site-text">
                      {a.issuedBy.name || a.issuedBy.handle}
                    </strong>
                  </span>
                  {a.decidedBy && (
                    <span className="inline-flex items-center gap-1.5">
                      {t('decided-by', { defaultValue: 'decided by' })}
                      <strong className="text-site-text">
                        {a.decidedBy.name || a.decidedBy.handle}
                      </strong>
                    </span>
                  )}
                </div>

                {a.appealText && (
                  <div className="mt-3 rounded-site border border-site-border bg-site-bg/40 p-3">
                    <p className="text-xs font-semibold text-site-text-muted">
                      {t('user-appeal', { defaultValue: "User's appeal" })}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-site-text">
                      {a.appealText}
                    </p>
                  </div>
                )}

                {a.appealNote && view !== 'PENDING' && (
                  <div className="mt-3 rounded-site border border-site-border bg-site-bg/40 p-3">
                    <p className="text-xs font-semibold text-site-text-muted">
                      {t('decision-note', { defaultValue: 'Decision note' })}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-site-text">
                      {a.appealNote}
                    </p>
                  </div>
                )}

                {view === 'PENDING' && (
                  <div className="mt-4 space-y-2">
                    <Textarea
                      rows={2}
                      value={notes[a.id] ?? ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}
                      maxLength={1000}
                      placeholder={t('decision-note-placeholder', {
                        defaultValue: 'Optional note — the user sees this verbatim.',
                      })}
                      aria-label={t('decision-note', { defaultValue: 'Decision note' })}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={busyId === a.id}
                        onClick={() => decide(a.id, 'overturn')}
                      >
                        <ShieldCheck className="h-4 w-4" aria-hidden />
                        {t('overturn', { defaultValue: 'Overturn strike' })}
                      </Button>
                      <Button
                        variant="danger"
                        disabled={busyId === a.id}
                        onClick={() => decide(a.id, 'uphold')}
                      >
                        <ShieldX className="h-4 w-4" aria-hidden />
                        {t('uphold', { defaultValue: 'Uphold strike' })}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageLayout>
  );
}
