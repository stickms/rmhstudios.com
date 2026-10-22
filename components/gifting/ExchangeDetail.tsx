'use client';

/** One gift / mixtape exchange: join, set exclusions, the draw result, gifting, the reveal. */
import { lazy, Suspense, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiJson, errorCode } from '@/components/economy-plus/api';
import {
  EXCHANGE_MIN_MEMBERS,
  type ExchangeUser,
  type ExchangeView,
  type MixtapeTrack,
} from '@/lib/gifting/exchange';

// The mixtape editor pulls in search; only members of an open mixtape exchange need it.
const MixtapeEditor = lazy(() => import('@/components/gifting/MixtapeEditor'));

const who = (u: ExchangeUser) => u.name ?? (u.handle ? `@${u.handle}` : '?');
const when = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );

function MixtapePlayer({ tracks }: { tracks: MixtapeTrack[] }) {
  const { t } = useTranslation('f-gifting');
  return (
    <ol className="space-y-2">
      {tracks.map((tr, i) => (
        <li key={tr.id} className="glass-fill space-y-1 rounded-site-sm p-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">
              {i + 1}. {tr.title} <span className="text-site-text-muted">· {tr.artist}</span>
            </span>
            <a
              href={`https://open.spotify.com/track/${tr.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1 text-xs text-site-accent hover:underline"
            >
              {t('mixtape-open', { defaultValue: 'Open in Spotify' })}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </div>
          {tr.previewUrl ? (
            <audio controls preload="none" src={tr.previewUrl} className="h-8 w-full" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export default function ExchangeDetail({ id }: { id: string }) {
  const { t } = useTranslation('f-gifting');
  const qc = useQueryClient();
  const key = ['gift-exchange', id] as const;
  const {
    data: ex,
    isLoading,
    isError,
  } = useQuery({
    queryKey: key,
    queryFn: () => apiJson<ExchangeView>(`/api/gift-exchanges/${id}`),
  });
  const [excludes, setExcludes] = useState<string | null>(null);
  const [amount, setAmount] = useState('');

  const act = useMutation({
    mutationFn: (a: { path?: string; method: string; body?: unknown }) =>
      apiJson(`/api/gift-exchanges/${id}${a.path ?? ''}`, { method: a.method, body: a.body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
    onError: (err) => toast.error(errorCode(err)),
  });

  if (isLoading) return <Skeleton className="m-4 h-64" />;
  if (isError || !ex) {
    return (
      <EmptyState icon={Gift} title={t('detail-missing', { defaultValue: 'Exchange not found' })} />
    );
  }

  const open = ex.status === 'OPEN';
  const isMixtape = ex.kind === 'MIXTAPE';
  const excludeText = excludes ?? ex.me?.excludeHandles.map((h) => `@${h}`).join(', ') ?? '';
  const statusLabel = {
    OPEN: t('status-open', { defaultValue: 'Open' }),
    DRAWN: t('status-drawn', { defaultValue: 'Drawn' }),
    FAILED: t('status-failed', { defaultValue: 'Not drawn' }),
    CANCELLED: t('status-cancelled', { defaultValue: 'Cancelled' }),
  }[ex.status];

  return (
    <div className="space-y-4 p-4">
      <header className="glass-pane space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-semibold">{ex.title}</h2>
          <Badge variant={ex.status === 'DRAWN' ? 'success' : 'default'}>{statusLabel}</Badge>
        </div>
        <p className="text-sm text-site-text-muted">
          {isMixtape
            ? t('detail-theme', { defaultValue: 'Theme: {{theme}}', theme: ex.theme ?? '' })
            : t('detail-budget', {
                defaultValue: 'Up to {{budget}} coins each',
                budget: ex.budget ?? 0,
              })}
          {' · '}
          {t('detail-draw', { defaultValue: 'Draw {{date}}', date: when(ex.drawAt) })}
          {' · '}
          {t('detail-reveal', { defaultValue: 'Reveal {{date}}', date: when(ex.revealAt) })}
        </p>
        <p className="text-xs text-site-text-muted">
          {t('detail-organiser', {
            defaultValue: 'Organised by {{name}}',
            name: who(ex.organizer),
          })}
        </p>
        {ex.canJoin ? (
          <Button
            variant="accent"
            size="sm"
            loading={act.isPending}
            onClick={() => act.mutate({ path: '/join', method: 'POST' })}
          >
            {t('detail-join', { defaultValue: 'Join this exchange' })}
          </Button>
        ) : null}
        {ex.isMember && open && !ex.isOrganizer ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => act.mutate({ path: '/join', method: 'DELETE' })}
          >
            {t('detail-leave', { defaultValue: 'Leave' })}
          </Button>
        ) : null}
        {ex.isOrganizer && open ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="accent"
              size="sm"
              disabled={ex.members.length < EXCHANGE_MIN_MEMBERS}
              onClick={() => act.mutate({ path: '/draw', method: 'POST' })}
            >
              {t('detail-draw-now', { defaultValue: 'Draw now' })}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => act.mutate({ method: 'DELETE' })}>
              {t('detail-cancel', { defaultValue: 'Cancel exchange' })}
            </Button>
          </div>
        ) : null}
      </header>

      {ex.me && open ? (
        <section className="glass-pane space-y-2 p-4">
          <label htmlFor="ex-excl" className="site-section-label block">
            {t('detail-exclude', { defaultValue: 'Rather not be paired with (handles, private)' })}
          </label>
          <div className="flex gap-2">
            <Input
              id="ex-excl"
              value={excludeText}
              onChange={(e) => setExcludes(e.target.value)}
              placeholder={t('detail-exclude-ph', { defaultValue: '@roommate, @partner' })}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                act.mutate({
                  path: '/me',
                  method: 'PUT',
                  body: {
                    excludeHandles: excludeText
                      .split(',')
                      .map((h) => h.trim().replace(/^@/, ''))
                      .filter(Boolean),
                  },
                })
              }
            >
              {t('detail-exclude-save', { defaultValue: 'Save' })}
            </Button>
          </div>
        </section>
      ) : null}

      {ex.me && open && isMixtape ? (
        <Suspense fallback={<Skeleton className="h-40" />}>
          <MixtapeEditor exchangeId={ex.id} initial={ex.me.tracks} />
        </Suspense>
      ) : null}

      {ex.status === 'DRAWN' && ex.me?.recipient ? (
        <section className="glass-pane space-y-3 p-4">
          <h2 className="site-section-label">
            {isMixtape
              ? t('result-mixtape', {
                  defaultValue: 'Your mixtape, curated by {{name}}',
                  name: who(ex.me.recipient),
                })
              : t('result-gift', {
                  defaultValue: 'You are gifting {{name}}',
                  name: who(ex.me.recipient),
                })}
          </h2>
          {isMixtape ? (
            <MixtapePlayer tracks={ex.me.receivedTracks ?? []} />
          ) : ex.me.giftedAt ? (
            <p className="text-sm text-site-text-muted">
              {t('result-sent', { defaultValue: 'Your gift is sent. Thank you!' })}
            </p>
          ) : (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                act.mutate({ path: '/gift', method: 'POST', body: { amount: Number(amount) } });
              }}
            >
              <Input
                type="number"
                min={10}
                max={ex.budget ?? 10000}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-32"
                aria-label={t('result-amount', { defaultValue: 'Coins to send' })}
                placeholder={t('result-amount', { defaultValue: 'Coins to send' })}
              />
              <Button
                type="submit"
                variant="accent"
                size="sm"
                loading={act.isPending}
                disabled={Number(amount) < 10 || Number(amount) > (ex.budget ?? 10000)}
              >
                <Gift />
                {t('result-send', { defaultValue: 'Send gift' })}
              </Button>
            </form>
          )}
        </section>
      ) : null}

      {ex.me?.leftOut ? (
        <p className="text-sm text-site-text-muted">
          {t('result-left-out', {
            defaultValue: 'You had no tracks at the deadline, so you were left out of the draw.',
          })}
        </p>
      ) : null}
      {ex.status === 'FAILED' ? (
        <p className="text-sm text-site-text-muted">
          {t('result-failed', {
            defaultValue:
              'The draw could not run: it needs at least 3 members whose exclusions allow a valid match.',
          })}
        </p>
      ) : null}

      {ex.pairings ? (
        <section className="glass-pane space-y-2 p-4">
          <h2 className="site-section-label">
            {t('reveal-title', { defaultValue: 'The reveal' })}
          </h2>
          <ul className="space-y-1 text-sm">
            {ex.pairings.map((p) => (
              <li key={p.giver.id}>
                {t('reveal-line', {
                  defaultValue: '{{giver}} → {{recipient}}',
                  giver: who(p.giver),
                  recipient: who(p.recipient),
                })}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="site-section-label px-1">
          {t('members-title', { defaultValue: 'Members ({{count}})', count: ex.members.length })}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {ex.members.map((m) => (
            <li key={m.id} className="glass-fill rounded-site-sm px-3 py-1 text-sm">
              {m.handle ? (
                <Link to="/u/$userid" params={{ userid: m.handle }} className="hover:underline">
                  {who(m)}
                </Link>
              ) : (
                who(m)
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
