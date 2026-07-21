'use client';

/**
 * SpacesColumn — the "Live Spaces" directory, extracted from the old
 * `/spaces` index route so it can be embedded as a tab inside `/communities`.
 * The former route SSR'd the live list via a loader; here the column fetches it
 * CLIENT-SIDE on mount (through the public, cached `/api/spaces/live` endpoint —
 * the same data the route's `listLiveSpaces` server fn returned) so the host
 * page's loader stays scoped to the communities directory.
 *
 * NOTE: this is only the directory. The live room lives at `/spaces/$id` and is
 * untouched — the "start a Space" composer still navigates there on create.
 */

import { useEffect, useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Radio, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { MobileTopBar } from '@/components/feed/MobileHeader';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useSession } from '@/components/Providers';
import type { LiveSpaceSummary } from '@/lib/spaces/types';

export function SpacesColumn({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation('site');
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState<LiveSpaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  // No route loader seeds this column anymore — pull the "Live now" list on mount.
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch('/api/spaces/live', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { spaces: [] }))
      .then((d) => {
        if (active) setSpaces(d.spaces ?? []);
      })
      .catch(() => {
        /* leave the list empty on failure */
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const create = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const res = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          data.error ?? t('space-create-failed', { defaultValue: 'Could not start the Space.' }),
        );
        return;
      }
      navigate({ to: '/spaces/$id', params: { id: data.space.id } });
    } catch {
      toast.error(t('space-create-failed', { defaultValue: 'Could not start the Space.' }));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen">
      {!embedded && <MobileTopBar title={t('spaces-title', { defaultValue: 'Spaces' })} />}

      <div className="border-b border-site-border p-4">
        <h1 className="mb-1 text-lg font-bold text-site-text">
          {t('spaces-title', { defaultValue: 'Spaces' })}
        </h1>
        <p className="text-sm text-site-text-dim">
          {t('spaces-subtitle', {
            defaultValue: 'Live rooms to chat, listen together, and hang out in real time.',
          })}
        </p>

        {session ? (
          <div className="mt-4 flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create();
              }}
              maxLength={120}
              placeholder={t('spaces-create-placeholder', {
                defaultValue: 'Give your Space a title…',
              })}
              className="min-w-0 flex-1 rounded-site border border-site-border bg-site-surface px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none"
            />
            <Button onClick={() => void create()} disabled={creating || !title.trim()}>
              <Plus className="mr-1 h-4 w-4" />
              {t('spaces-create-cta', { defaultValue: 'Start' })}
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-site-text-dim">
            {t('spaces-signin', { defaultValue: 'Sign in to start a Space.' })}
          </p>
        )}
      </div>

      <div className="p-4">
        <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-danger">
          <span className="h-2 w-2 animate-pulse rounded-full bg-site-danger" aria-hidden />
          {t('live-now', { defaultValue: 'Live now' })}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : spaces.length === 0 ? (
          <div className="rounded-site border border-dashed border-site-border p-8 text-center text-sm text-site-text-dim">
            {t('spaces-empty', { defaultValue: 'No live Spaces right now. Start one!' })}
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {spaces.map((s: LiveSpaceSummary) => (
              <li key={s.id}>
                <Link
                  to="/spaces/$id"
                  params={{ id: s.id }}
                  className="flex flex-col gap-1 rounded-site border border-site-border bg-site-surface p-4 transition-colors hover:border-site-border-bright"
                >
                  <div className="flex items-center gap-1.5 text-xs text-site-text-dim">
                    <Radio className="h-3.5 w-3.5 text-site-accent" aria-hidden />
                    {s.community?.name ??
                      s.host.name ??
                      t('space-fallback-host', { defaultValue: 'Space' })}
                  </div>
                  <div className="line-clamp-2 text-sm font-semibold text-site-text">{s.title}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
