'use client';

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Camera, ThumbsUp, Trash2 } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchJson } from '@/lib/http';
import { addDays } from '@/lib/delight/shared';

interface Entry {
  id: string;
  dayKey: string;
  imageUrl: string;
  caption: string;
  votes: number;
  mine: boolean;
  by: { name: string | null };
}
interface PageData {
  today: string;
  votedFor: string | null;
  nominations: Entry[];
  winners: Entry[];
}

/** Z6 — /photo-of-the-day: nominate by upload, one vote a day, yesterday's winner on top. */
export function PhotoPage() {
  const { t } = useTranslation('f-delight');
  const { data: session } = useSession();
  const isAdmin = !!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin;
  const q = useQuery({
    queryKey: ['delight', 'potd'],
    queryFn: () => fetchJson<PageData>('/api/photo-of-the-day'),
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      await q.refetch();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('potd-error', { defaultValue: 'Something went wrong' }),
      );
    } finally {
      setBusy(false);
    }
  };

  const upload = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('image', file);
    form.append('caption', caption);
    void act(
      () => fetchJson('/api/photo-of-the-day', { method: 'POST', body: form }),
      t('potd-nominated', { defaultValue: 'Nominated! Voting runs until midnight UTC.' }),
    ).then(() => {
      setCaption('');
      if (fileRef.current) fileRef.current.value = '';
    });
  };

  const d = q.data;
  const yesterday = d?.winners.find((w) => w.dayKey === addDays(d.today, -1));
  const older = d?.winners.filter((w) => w !== yesterday) ?? [];

  return (
    <PageLayout
      title={t('potd-title', { defaultValue: 'Photo of the day' })}
      description={t('potd-desc', {
        defaultValue:
          'Nominate one image a day, such as a photo-mode capture. Everyone gets one vote; the winner is featured tomorrow.',
      })}
    >
      <div className="space-y-6 px-4 pt-2 pb-12">
        {yesterday && (
          <section className="glass-pane space-y-2 rounded-site p-4" aria-labelledby="potd-winner">
            <h2 id="potd-winner" className="text-sm font-semibold text-site-text">
              {t('potd-winner', { defaultValue: 'Yesterday’s winner' })}
            </h2>
            <img src={yesterday.imageUrl} alt={yesterday.caption} className="w-full rounded-site" />
            <p className="text-sm text-site-text-muted">
              {t('potd-by', { defaultValue: 'By {{name}}', name: yesterday.by.name ?? '' })}
              {yesterday.caption && ` - ${yesterday.caption}`}
            </p>
          </section>
        )}

        {session && d && !d.nominations.some((n) => n.mine) && (
          <form
            className="glass-pane space-y-3 rounded-site p-4"
            onSubmit={(e) => {
              e.preventDefault();
              upload();
            }}
          >
            <label className="block text-sm text-site-text-muted">
              <span className="mb-1 block">
                {t('potd-image', { defaultValue: 'Your image (up to 5 MB)' })}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                required
                className="text-site-text"
              />
            </label>
            <Input
              value={caption}
              maxLength={140}
              onChange={(e) => setCaption(e.target.value)}
              aria-label={t('potd-caption', { defaultValue: 'Caption (optional)' })}
              placeholder={t('potd-caption', { defaultValue: 'Caption (optional)' })}
            />
            <Button type="submit" variant="accent" loading={busy}>
              <Camera className="size-4" aria-hidden />
              {t('potd-nominate', { defaultValue: 'Nominate' })}
            </Button>
          </form>
        )}

        <section aria-labelledby="potd-today">
          <h2 id="potd-today" className="mb-2 text-sm font-semibold text-site-text">
            {t('potd-today', { defaultValue: 'Today’s nominations' })}
          </h2>
          {q.isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : !d?.nominations.length ? (
            <EmptyState
              icon={Camera}
              title={t('potd-none', { defaultValue: 'No nominations yet. Be the first!' })}
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {d.nominations.map((n) => (
                <li key={n.id} className="glass-fill space-y-2 rounded-site p-3">
                  <img
                    src={n.imageUrl}
                    alt={n.caption}
                    loading="lazy"
                    className="aspect-video w-full rounded-site object-cover"
                  />
                  <p className="truncate text-sm text-site-text">
                    {n.caption || t('potd-untitled', { defaultValue: 'Untitled' })}
                    <span className="text-site-text-dim"> - {n.by.name}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    {session && !n.mine && (
                      <Button
                        size="sm"
                        variant={d.votedFor === n.id ? 'accent' : 'ghost'}
                        disabled={busy || d.votedFor !== null}
                        onClick={() =>
                          void act(() =>
                            fetchJson('/api/photo-of-the-day/vote', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ nominationId: n.id }),
                            }),
                          )
                        }
                      >
                        <ThumbsUp className="size-4" aria-hidden />
                        {t('potd-vote', { defaultValue: 'Vote' })}
                      </Button>
                    )}
                    <span className="text-sm tabular-nums text-site-text-muted">
                      {t('potd-votes', { defaultValue: '{{count}} votes', count: n.votes })}
                    </span>
                    {(n.mine || isAdmin) && (
                      <IconButton
                        icon={Trash2}
                        variant="ghost"
                        size="icon-sm"
                        className="ms-auto"
                        label={t('potd-remove', { defaultValue: 'Remove photo' })}
                        onClick={() =>
                          void act(() =>
                            fetchJson(`/api/photo-of-the-day/${n.id}`, { method: 'DELETE' }),
                          )
                        }
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {older.length > 0 && (
          <section aria-labelledby="potd-past">
            <h2 id="potd-past" className="mb-2 text-sm font-semibold text-site-text">
              {t('potd-past', { defaultValue: 'Recent winners' })}
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {older.map((w) => (
                <li key={w.id} className="glass-fill space-y-1 rounded-site p-2">
                  <img
                    src={w.imageUrl}
                    alt={w.caption}
                    loading="lazy"
                    className="aspect-video w-full rounded-site object-cover"
                  />
                  <p className="truncate text-xs text-site-text-muted">{w.dayKey}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PageLayout>
  );
}
