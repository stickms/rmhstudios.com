'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, CalendarClock, Send, Trash2, Globe, Users, Lock, BarChart3, Image as ImageIcon } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';

interface ScheduledRow {
  id: string;
  content: string;
  gifUrl: string | null;
  imageUrls: string[];
  audience: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
  unlockPrice: number | null;
  poll: { question?: string } | null;
  scheduledAt: string | null;
  createdAt: string;
}

const AUDIENCE_ICON = { PUBLIC: Globe, FOLLOWERS: Users, PRIVATE: Lock } as const;

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function DraftsColumn({
  initialData,
}: {
  /** Drafts + scheduled prefetched by the route loader; `null` when signed out. */
  initialData?: { drafts: ScheduledRow[]; scheduled: ScheduledRow[] } | null;
} = {}) {
  const { t } = useTranslation('feed');
  const seeded = useRef(initialData !== undefined && initialData !== null);
  const [drafts, setDrafts] = useState<ScheduledRow[]>(initialData?.drafts ?? []);
  const [scheduled, setScheduled] = useState<ScheduledRow[]>(initialData?.scheduled ?? []);
  const [loading, setLoading] = useState(!initialData);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/scheduled', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setDrafts(data.drafts ?? []);
      setScheduled(data.scheduled ?? []);
    }
  }, []);

  useEffect(() => {
    // Loader already seeded — skip the mount fetch (mutations like publish/
    // discard still call `load()` to refresh afterward).
    if (seeded.current) return;
    let active = true;
    (async () => {
      try {
        await load();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  async function publishNow(id: string) {
    setBusy(`p:${id}`);
    try {
      const res = await fetch(`/api/scheduled/${encodeURIComponent(id)}/publish`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) await load();
    } finally {
      setBusy(null);
    }
  }

  async function discard(id: string) {
    setBusy(`d:${id}`);
    try {
      const res = await fetch(`/api/scheduled/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) await load();
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const empty = drafts.length === 0 && scheduled.length === 0;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-site-accent" />
          <h1 className="text-lg font-bold text-site-text">{t('drafts-and-scheduled', { defaultValue: 'Drafts & Scheduled' })}</h1>
        </div>
      </header>

      {empty ? (
        <EmptyState description={t('no-drafts-yet', { defaultValue: 'No drafts yet. Use the "Save as draft" or "Schedule" options in the composer.' })} />
      ) : (
        <div className="space-y-8 p-4">
          <Section
            title={t('section-scheduled', { defaultValue: 'Scheduled' })}
            icon={CalendarClock}
            rows={scheduled}
            busy={busy}
            onPublish={publishNow}
            onDiscard={discard}
          />
          <Section
            title={t('section-drafts', { defaultValue: 'Drafts' })}
            icon={FileText}
            rows={drafts}
            busy={busy}
            onPublish={publishNow}
            onDiscard={discard}
          />
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  rows,
  busy,
  onPublish,
  onDiscard,
}: {
  title: string;
  icon: typeof FileText;
  rows: ScheduledRow[];
  busy: string | null;
  onPublish: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  const { t } = useTranslation('feed');
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
        <Icon className="h-3.5 w-3.5" /> {title}
      </h2>
      <div className="space-y-2">
        {rows.map((r) => {
          const AudienceIcon = AUDIENCE_ICON[r.audience];
          return (
            <div key={r.id} className="rounded-site border border-site-border bg-site-surface p-3">
              <p className="whitespace-pre-wrap break-words text-sm text-site-text">
                {r.content || <span className="text-site-text-dim">{t('no-text', { defaultValue: '(no text)' })}</span>}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-site-text-dim">
                {r.scheduledAt && (
                  <span className="inline-flex items-center gap-1 text-site-accent">
                    <CalendarClock className="h-3 w-3" /> {formatWhen(r.scheduledAt)}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <AudienceIcon className="h-3 w-3" /> {r.audience.toLowerCase()}
                </span>
                {r.poll?.question && (
                  <span className="inline-flex items-center gap-1">
                    <BarChart3 className="h-3 w-3" /> {t('poll-label', { defaultValue: 'poll' })}
                  </span>
                )}
                {(r.imageUrls.length > 0 || r.gifUrl) && (
                  <span className="inline-flex items-center gap-1">
                    <ImageIcon className="h-3 w-3" /> {t('media-label', { defaultValue: 'media' })}
                  </span>
                )}
                {r.unlockPrice && r.unlockPrice > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <CoinIcon className="h-3 w-3" /> {r.unlockPrice}
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="accent"
                  loading={busy === `p:${r.id}`}
                  onClick={() => onPublish(r.id)}
                  className="gap-1"
                >
                  {busy !== `p:${r.id}` && <Send className="h-3.5 w-3.5" />}
                  {t('post-now', { defaultValue: 'Post now' })}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy === `d:${r.id}`}
                  onClick={() => onDiscard(r.id)}
                  className="gap-1 text-site-text-muted hover:text-site-danger"
                >
                  {busy !== `d:${r.id}` && <Trash2 className="h-3.5 w-3.5" />}
                  {t('discard', { defaultValue: 'Discard' })}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
