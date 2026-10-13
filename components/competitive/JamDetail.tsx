import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { useSession } from '@/components/Providers';
import { JAM_CATEGORIES, type JamCategory } from '@/lib/competitive/jam';
import { PhaseBadge } from './JamsList';

type Scores = Record<JamCategory, number>;
interface Entry {
  id: string;
  own: boolean;
  build: { slug: string; title: string; description: string; thumbnailUrl: string | null };
  user: { name?: string | null };
  averages: Scores | null;
  ratingCount: number;
  score: number;
}
interface Jam {
  slug: string;
  title: string;
  description: string;
  theme: string | null;
  startsAt: string;
  submitEndsAt: string;
  ratingEndsAt: string;
  phase: 'upcoming' | 'open' | 'rating' | 'done';
  entries: Entry[];
  myEntryId: string | null;
  myRatings: Record<string, Scores>;
  myBuilds: { id: string; title: string }[];
  results: boolean;
}

function RateForm({
  slug,
  entry,
  initial,
  onSaved,
}: {
  slug: string;
  entry: Entry;
  initial?: Scores;
  onSaved: () => void;
}) {
  const { t } = useTranslation('f-competitive');
  const [scores, setScores] = useState<Partial<Scores>>(initial ?? {});
  const [busy, setBusy] = useState(false);
  const names: Record<JamCategory, string> = {
    fun: t('cat-fun', { defaultValue: 'Fun' }),
    creativity: t('cat-creativity', { defaultValue: 'Creativity' }),
    theme: t('cat-theme', { defaultValue: 'Theme' }),
    polish: t('cat-polish', { defaultValue: 'Polish' }),
  };
  const ready = JAM_CATEGORIES.every((c) => scores[c]);
  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/jams/${slug}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId: entry.id, ...scores }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        toast.error(data.error ?? t('jam-rate-failed', { defaultValue: 'Could not save rating' }));
      else {
        toast.success(t('jam-rated', { defaultValue: 'Rating saved' }));
        onSaved();
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid grid-cols-2 gap-2 pt-2">
      {JAM_CATEGORIES.map((c) => (
        <label key={c} className="text-xs text-site-text-dim space-y-1">
          {names[c]}
          <Select
            value={scores[c] ?? ''}
            onChange={(e) => setScores((s) => ({ ...s, [c]: Number(e.target.value) }))}
          >
            <option value="">–</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </label>
      ))}
      <Button size="sm" className="col-span-2" disabled={!ready} loading={busy} onClick={save}>
        {t('jam-rate', { defaultValue: 'Save rating' })}
      </Button>
    </div>
  );
}

export function JamDetail({ slug }: { slug: string }) {
  const { t } = useTranslation('f-competitive');
  const { data: session } = useSession();
  const signedIn = !!session?.user?.id;
  const [jam, setJam] = useState<Jam | null | undefined>(undefined);
  const [buildId, setBuildId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/jams/${slug}`);
    const data = await res.json().catch(() => ({}));
    setJam(res.ok ? data.jam : null);
  }, [slug]);
  useEffect(() => {
    void load();
  }, [load, signedIn]);

  if (jam === undefined) return <div className="h-48 rounded-site glass-fill animate-pulse" />;
  if (jam === null) {
    return (
      <p className="text-site-text-dim py-12 text-center">
        {t('jam-missing', { defaultValue: 'This jam does not exist.' })}
      </p>
    );
  }

  const enter = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/jams/${slug}/entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        toast.error(data.error ?? t('jam-enter-failed', { defaultValue: 'Could not enter' }));
      else {
        toast.success(t('jam-entered', { defaultValue: 'Entry saved' }));
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const canRate = jam.phase === 'open' || jam.phase === 'rating';
  return (
    <div className="space-y-5 max-w-3xl">
      <Card className="p-4 space-y-2" pane>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm">{jam.description}</p>
          <PhaseBadge phase={jam.phase} />
        </div>
        <p className="text-sm">
          <span className="text-site-text-dim">{t('jam-theme', { defaultValue: 'Theme' })}: </span>
          <strong>
            {jam.theme ?? t('jam-theme-hidden', { defaultValue: 'Revealed when the jam starts' })}
          </strong>
        </p>
        <p className="text-xs text-site-text-dim">
          {new Date(jam.startsAt).toLocaleString()} → {new Date(jam.submitEndsAt).toLocaleString()}{' '}
          ·{' '}
          {t('jam-rating-until', {
            defaultValue: 'rating until {{when}}',
            when: new Date(jam.ratingEndsAt).toLocaleString(),
          })}
        </p>
      </Card>

      {jam.phase === 'open' && signedIn && (
        <Card className="p-4 space-y-2" pane>
          <h2 className="site-section-label">
            {t('jam-submit', { defaultValue: 'Submit a build' })}
          </h2>
          {jam.myBuilds.length === 0 ? (
            <p className="text-sm text-site-text-dim">
              {t('jam-no-builds', {
                defaultValue:
                  'Publish a public User Build during the jam, then come back to enter it.',
              })}{' '}
              <Link to="/user-builds" className="underline">
                {t('jam-builds-link', { defaultValue: 'Your builds' })}
              </Link>
            </p>
          ) : (
            <div className="flex gap-2">
              <Select
                value={buildId}
                onChange={(e) => setBuildId(e.target.value)}
                className="flex-1"
              >
                <option value="">{t('jam-pick-build', { defaultValue: 'Choose a build' })}</option>
                {jam.myBuilds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </Select>
              <Button onClick={enter} loading={busy} disabled={!buildId}>
                {jam.myEntryId
                  ? t('jam-swap', { defaultValue: 'Swap entry' })
                  : t('jam-enter', { defaultValue: 'Enter' })}
              </Button>
            </div>
          )}
        </Card>
      )}

      {jam.phase !== 'upcoming' && (
        <div className="space-y-3">
          <h2 className="site-section-label">
            {jam.results
              ? t('jam-results', { defaultValue: 'Results' })
              : t('jam-entries', { defaultValue: 'Entries' })}
          </h2>
          {jam.entries.length === 0 && (
            <p className="text-sm text-site-text-dim">
              {t('jam-no-entries', { defaultValue: 'No entries yet.' })}
            </p>
          )}
          {jam.entries.map((e, i) => (
            <Card key={e.id} className="p-4 space-y-1" interactive={false}>
              <div className="flex items-center justify-between gap-2">
                <Link
                  to="/user-builds/$slug"
                  params={{ slug: e.build.slug }}
                  className="font-semibold truncate"
                >
                  {jam.results ? `${i + 1}. ` : ''}
                  {e.build.title}
                </Link>
                {jam.results && <span className="font-medium">{e.score.toFixed(2)}</span>}
              </div>
              <p className="text-xs text-site-text-dim">
                {e.user.name}
                {jam.results &&
                  ` · ${t('jam-ratings', { defaultValue: '{{n}} ratings', n: e.ratingCount })}`}
              </p>
              {jam.results && e.averages && (
                <p className="text-xs text-site-text-dim">
                  {JAM_CATEGORIES.map((c) => `${c} ${e.averages![c].toFixed(1)}`).join(' · ')}
                </p>
              )}
              {canRate && signedIn && !e.own && (
                <RateForm slug={slug} entry={e} initial={jam.myRatings[e.id]} onSaved={load} />
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
