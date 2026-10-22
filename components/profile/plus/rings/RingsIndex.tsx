'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Link2, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useSession } from '@/components/Providers';
import {
  RING_DESCRIPTION_MAX,
  RING_MAX_OWNED,
  RING_NAME_MAX,
  type RingSummary,
} from '@/lib/profile/webrings';
import { useJson } from '../useJson';

function RingCard({ ring }: { ring: RingSummary }) {
  const { t } = useTranslation('f-profile-plus');
  return (
    <li>
      <Link
        to={`/rings/${ring.slug}` as string}
        className="glass-fill glass-interactive block rounded-site p-4"
      >
        <p className="truncate font-display text-base font-bold text-site-text">{ring.name}</p>
        {ring.description ? (
          <p className="mt-1 line-clamp-2 text-sm text-site-text-muted">{ring.description}</p>
        ) : null}
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-site-text-dim">
          <Users className="size-3.5" aria-hidden />
          {t('ring-members', {
            count: ring.memberCount,
            defaultValue_one: '{{count}} member',
            defaultValue: '{{count}} members',
          })}
        </p>
      </Link>
    </li>
  );
}

/** P6 — the ring directory: rings you are in, popular rings, and starting one. */
export default function RingsIndex() {
  const { t } = useTranslation('f-profile-plus');
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);
  const navigate = useNavigate();
  const { data } = useJson<{ popular: RingSummary[]; mine: RingSummary[] }>('/api/webrings');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  async function create() {
    setCreating(true);
    try {
      const res = await fetch('/api/webrings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; ring?: RingSummary };
      if (!res.ok || !json.ring) {
        toast.error(
          json.error ?? t('ring-create-failed', { defaultValue: "Couldn't start that ring" }),
        );
        return;
      }
      toast.success(t('ring-created', { defaultValue: 'Ring started' }));
      void navigate({ to: `/rings/${json.ring.slug}` as string });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 pb-12 pt-4">
      <p className="text-sm text-site-text-muted">
        {t('rings-intro', {
          defaultValue:
            'A webring is a small circle of members who share a thing — pixel artists, speedrunners, night owls. Join one and your profile gets a previous / next strip so people can hop around the ring.',
        })}
      </p>

      {data === undefined ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          {data && data.mine.length > 0 ? (
            <section className="space-y-3" aria-labelledby="rings-mine">
              <h2 id="rings-mine" className="site-section-label">
                {t('rings-mine', { defaultValue: 'Your rings' })}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {data.mine.map((r) => (
                  <RingCard key={r.slug} ring={r} />
                ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-3" aria-labelledby="rings-popular">
            <h2 id="rings-popular" className="site-section-label">
              {t('rings-popular', { defaultValue: 'Popular rings' })}
            </h2>
            {data && data.popular.length > 0 ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {data.popular.map((r) => (
                  <RingCard key={r.slug} ring={r} />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Link2}
                title={t('rings-none', { defaultValue: 'No rings yet' })}
                description={t('rings-none-desc', { defaultValue: 'Start the first one below.' })}
              />
            )}
          </section>
        </>
      )}

      <section className="glass-pane space-y-3 rounded-site p-4" aria-labelledby="rings-start">
        <h2 id="rings-start" className="font-display text-base font-bold text-site-text">
          {t('rings-start', { defaultValue: 'Start a ring' })}
        </h2>
        {signedIn ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="ring-name">{t('ring-name', { defaultValue: 'Name' })}</Label>
              <Input
                id="ring-name"
                value={name}
                maxLength={RING_NAME_MAX}
                placeholder={t('ring-name-placeholder', { defaultValue: 'Pixel artists' })}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ring-description">
                {t('ring-description', { defaultValue: 'What is it about? (optional)' })}
              </Label>
              <Textarea
                id="ring-description"
                rows={3}
                value={description}
                maxLength={RING_DESCRIPTION_MAX}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="accent"
                loading={creating}
                disabled={name.trim().length < 3}
                onClick={() => void create()}
              >
                <Plus aria-hidden />
                {t('ring-create', { defaultValue: 'Start ring' })}
              </Button>
              <span className="text-xs text-site-text-dim">
                {t('ring-limit', {
                  max: RING_MAX_OWNED,
                  defaultValue: 'You can run up to {{max}} rings.',
                })}
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-site-text-muted">
            <Link
              to="/login"
              search={{ callbackURL: '/rings' }}
              className="text-site-accent hover:underline"
            >
              {t('rings-sign-in', { defaultValue: 'Sign in' })}
            </Link>{' '}
            {t('rings-sign-in-rest', { defaultValue: 'to join or start a ring.' })}
          </p>
        )}
      </section>
    </div>
  );
}
