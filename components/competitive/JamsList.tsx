import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from '@/components/Providers';

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
    <Badge variant={phase === 'open' ? 'accent' : phase === 'done' ? 'success' : 'outline'}>
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
    const iso = (k: string) => new Date(String(f.get(k))).toISOString();
    setBusy(true);
    try {
      const res = await fetch('/api/jams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: f.get('title'),
          description: f.get('description'),
          theme: f.get('theme'),
          startsAt: iso('startsAt'),
          submitEndsAt: iso('submitEndsAt'),
          ratingEndsAt: iso('ratingEndsAt'),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        toast.error(
          data.error ?? t('jam-create-failed', { defaultValue: 'Could not create the jam' }),
        );
      else {
        toast.success(t('jam-created', { defaultValue: 'Jam created' }));
        onCreated();
      }
    } catch {
      toast.error(t('jam-create-failed', { defaultValue: 'Could not create the jam' }));
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
  const [jams, setJams] = useState<JamSummary[] | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/jams');
    const data = await res.json().catch(() => ({ jams: [] }));
    setJams(res.ok ? data.jams : []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 max-w-3xl">
      {isAdmin && (
        <div className="space-y-3">
          <Button variant="secondary" onClick={() => setShowForm((v) => !v)}>
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
        <div className="h-32 rounded-site glass-fill animate-pulse" />
      ) : jams.length === 0 ? (
        <p className="text-site-text-dim py-8 text-center">
          {t('jam-none', { defaultValue: 'No game jams yet. Check back soon.' })}
        </p>
      ) : (
        jams.map((j) => (
          <Link key={j.slug} to="/jams/$slug" params={{ slug: j.slug }}>
            <Card className="p-4 space-y-1.5" interactive>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold truncate">{j.title}</h2>
                <PhaseBadge phase={j.phase} />
              </div>
              <p className="text-sm text-site-text-dim line-clamp-2">{j.description}</p>
              <p className="text-xs text-site-text-dim">
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
