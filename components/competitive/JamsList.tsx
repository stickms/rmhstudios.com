import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { jamsQuery } from '@/lib/competitive/jams.queries';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/components/Providers';
import { Hammer } from 'lucide-react';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { createJamApi } from '@/lib/competitive/jams.contract';

interface JamSummary {
  slug: string;
  title: string;
  description: string;
  theme: string | null;
  startsAt: string;
  submitEndsAt: string;
  ratingEndsAt: string;
  phase: 'upcoming' | 'open' | 'rating' | 'done';
}

export function PhaseBadge({ phase }: { phase: JamSummary['phase'] }) {
  const { t } = useTranslation('f-competitive');
  const label = {
    upcoming: t('jam-upcoming', { defaultValue: 'Upcoming' }),
    open: t('jam-open', { defaultValue: 'Submissions open' }),
    rating: t('jam-rating', { defaultValue: 'Rating' }),
    done: t('jam-done', { defaultValue: 'Results' }),
  }[phase];
  return (
    <Badge variant={phase === 'open' ? 'default' : phase === 'done' ? 'success' : 'default'}>
      {label}
    </Badge>
  );
}

function AdminForm({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation('f-competitive');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? '');
    // An unparseable date throws here, into the catch below (as `.toISOString()` did).
    const when = (k: string) => {
      const d = new Date(text(k));
      if (Number.isNaN(d.getTime())) throw new RangeError('Invalid time value');
      return d;
    };
    setBusy(true);
    try {
      await api(createJamApi, {
        body: {
          title: text('title'),
          description: text('description'),
          theme: text('theme'),
          startsAt: when('startsAt'),
          submitEndsAt: when('submitEndsAt'),
          ratingEndsAt: when('ratingEndsAt'),
        },
      });
      toast.success(t('jam-created', { defaultValue: 'Jam created' }));
      onCreated();
    } catch (e) {
      toast.error(
        serverError(e) ?? t('jam-create-failed', { defaultValue: 'Could not create the jam' }),
      );
    } finally {
      setBusy(false);
    }
  };
  const field = (name: string, label: string, type = 'text') => (
    <div className="space-y-1.5">
      <Label htmlFor={`jam-${name}`}>{label}</Label>
      <Input id={`jam-${name}`} name={name} type={type} required />
    </div>
  );
  return (
    <Card className="p-4" pane>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        {field('title', t('jam-f-title', { defaultValue: 'Title' }))}
        {field('theme', t('jam-f-theme', { defaultValue: 'Secret theme (revealed at start)' }))}
        <div className="sm:col-span-2">
          {field('description', t('jam-f-desc', { defaultValue: 'Description' }))}
        </div>
        {field('startsAt', t('jam-f-start', { defaultValue: 'Starts' }), 'datetime-local')}
        {field(
          'submitEndsAt',
          t('jam-f-submit', { defaultValue: 'Submissions close' }),
          'datetime-local',
        )}
        {field(
          'ratingEndsAt',
          t('jam-f-rating', { defaultValue: 'Rating closes' }),
          'datetime-local',
        )}
        <div className="sm:col-span-2">
          <Button type="submit" loading={busy}>
            {t('jam-create', { defaultValue: 'Create jam' })}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function JamsList() {
  const { t } = useTranslation('f-competitive');
  const { data: session } = useSession();
  const isAdmin = (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin ?? false;
  const [showForm, setShowForm] = useState(false);

  // Seeded by the /jams loader. A failed load shows the empty list, as before.
  const list = useQuery({ ...jamsQuery(), retry: false });
  const jams: JamSummary[] | null = list.isPending ? null : (list.data?.jams ?? []);
  const load = async () => {
    await list.refetch();
  };

  return (
    <div className="space-y-4 max-w-3xl">
      {isAdmin && (
        <div className="space-y-3">
          <Button variant="default" onClick={() => setShowForm((v) => !v)}>
            {t('jam-new', { defaultValue: 'New jam' })}
          </Button>
          {showForm && (
            <AdminForm
              onCreated={() => {
                setShowForm(false);
                void load();
              }}
            />
          )}
        </div>
      )}
      {jams === null ? (
        <Skeleton className="h-32 rounded-site" />
      ) : jams.length === 0 ? (
        <EmptyState
          icon={Hammer}
          title={t('jam-none', { defaultValue: 'No game jams yet. Check back soon.' })}
        />
      ) : (
        jams.map((j) => (
          <Link key={j.slug} to="/jams/$slug" params={{ slug: j.slug }}>
            <Card className="gap-2 px-4 py-4" interactive>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold truncate">{j.title}</h2>
                <PhaseBadge phase={j.phase} />
              </div>
              <p className="text-sm text-site-text-muted line-clamp-2">{j.description}</p>
              <p className="text-xs text-site-text-muted">
                {new Date(j.startsAt).toLocaleString()} →{' '}
                {new Date(j.submitEndsAt).toLocaleString()}
              </p>
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
