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
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useSession } from '@/components/Providers';
import type { LiveSpaceSummary } from '@/lib/spaces/types';

export function SpacesColumn() {
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
    <div className="space-y-[var(--site-section-gap)] pt-3 pb-12">
      <section className="glass-pane space-y-3 rounded-site p-5">
        <p className="text-sm text-site-text-muted">
          {t('spaces-subtitle', {
            defaultValue: 'Live rooms to chat, listen together, and hang out in real time.',
          })}
        </p>

        {session ? (
          <div className="flex gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create();
              }}
              maxLength={120}
              aria-label={t('spaces-create-placeholder', {
                defaultValue: 'Give your Space a title…',
              })}
              placeholder={t('spaces-create-placeholder', {
                defaultValue: 'Give your Space a title…',
              })}
              className="min-w-0 flex-1"
            />
            <Button
              variant="accent"
              onClick={() => void create()}
              loading={creating}
              disabled={!title.trim()}
            >
              <Plus aria-hidden />
              {t('spaces-create-cta', { defaultValue: 'Start' })}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-site-text-dim">
            {t('spaces-signin', { defaultValue: 'Sign in to start a Space.' })}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="site-section-label flex items-center gap-2">
          <span className="size-2 animate-pulse-settle rounded-full bg-site-danger" aria-hidden />
          {t('live-now', { defaultValue: 'Live now' })}
        </h2>

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : spaces.length === 0 ? (
          <EmptyState
            icon={Radio}
            description={t('spaces-empty', {
              defaultValue: 'No live Spaces right now. Start one!',
            })}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {spaces.map((s: LiveSpaceSummary) => (
              <li key={s.id}>
                <Link
                  to="/spaces/$id"
                  params={{ id: s.id }}
                  className="glass-fill glass-interactive flex flex-col gap-1 rounded-site px-4 py-3"
                >
                  <div className="flex items-center gap-2 text-xs text-site-text-dim">
                    <Radio className="size-3.5 text-site-accent" aria-hidden />
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
      </section>
    </div>
  );
}
