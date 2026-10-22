'use client';

import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Dices, Link2 } from 'lucide-react';
import { WidgetFrame } from '@/components/ui/widget-frame';
import { Button } from '@/components/ui/button';
import type { RingNeighbour, RingStrip } from '@/lib/profile/webrings';
import { useJson } from './useJson';

function label(person: RingNeighbour): string {
  return person.name ?? person.handle ?? person.id;
}

function Hop({
  person,
  dir,
  ring,
}: {
  person: RingNeighbour | null;
  dir: 'prev' | 'next';
  ring: string;
}) {
  const { t } = useTranslation('f-profile-plus');
  const text =
    dir === 'prev'
      ? t('ring-prev', { defaultValue: 'Previous' })
      : t('ring-next', { defaultValue: 'Next' });
  if (!person) {
    return (
      <span className="inline-flex items-center gap-1 text-site-text-dim" aria-hidden>
        {dir === 'prev' ? <ArrowLeft className="size-4" /> : null}
        {dir === 'next' ? <ArrowRight className="size-4" /> : null}
      </span>
    );
  }
  return (
    <Link
      to={`/u/${person.handle ?? person.id}` as string}
      className="inline-flex min-w-0 items-center gap-1 text-site-accent hover:underline"
      aria-label={t('ring-hop-label', {
        direction: text,
        name: label(person),
        ring,
        defaultValue: '{{direction}} in {{ring}}: {{name}}',
      })}
    >
      {dir === 'prev' ? <ArrowLeft className="size-4 shrink-0" aria-hidden /> : null}
      <span className="max-w-32 truncate">{label(person)}</span>
      {dir === 'next' ? <ArrowRight className="size-4 shrink-0" aria-hidden /> : null}
    </Link>
  );
}

/**
 * P6 — the `← prev · ring · next →` strip, plus a random hop, for each ring (at
 * most three) the profile's owner belongs to. Neighbours are chosen server-side
 * for THIS viewer, so a hop never lands on a deleted, banned or blocked member.
 */
export default function WebringStripModule({
  title,
  userId,
  isOwner,
}: {
  title: string;
  userId: string;
  isOwner: boolean;
}) {
  const { t } = useTranslation('f-profile-plus');
  const { data } = useJson<{ rings: RingStrip[] }>(
    `/api/profile/${encodeURIComponent(userId)}/webrings`,
  );
  const rings = data?.rings ?? [];
  if (data !== undefined && rings.length === 0 && !isOwner) return null;

  return (
    <WidgetFrame
      title={title}
      icon={Link2}
      loading={data === undefined}
      empty={data !== undefined && rings.length === 0}
      emptyTitle={t('rings-empty', { defaultValue: 'Not in a webring yet' })}
      emptyDescription={t('rings-empty-desc', {
        defaultValue: 'Join a ring of members who share your thing.',
      })}
      emptyAction={
        <Button asChild variant="accent" size="sm">
          <Link to="/rings">{t('rings-browse', { defaultValue: 'Browse rings' })}</Link>
        </Button>
      }
    >
      <ul className="space-y-2">
        {rings.map((ring) => (
          <li
            key={ring.slug}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm"
          >
            <Hop person={ring.prev} dir="prev" ring={ring.name} />
            <span className="flex min-w-0 items-center gap-2">
              <Link
                to={`/rings/${ring.slug}` as string}
                className="truncate font-semibold text-site-text hover:underline"
              >
                {ring.name}
              </Link>
              <span className="shrink-0 text-xs text-site-text-dim">
                {t('ring-position', {
                  position: ring.position,
                  size: ring.size,
                  defaultValue: '{{position}} of {{size}}',
                })}
              </span>
              <a
                href={`/api/webrings/${ring.slug}/hop?from=${encodeURIComponent(userId)}`}
                className="inline-flex shrink-0 items-center gap-1 text-xs text-site-text-muted hover:text-site-accent"
              >
                <Dices className="size-3.5" aria-hidden />
                {t('ring-random', { defaultValue: 'Random' })}
              </a>
            </span>
            <Hop person={ring.next} dir="next" ring={ring.name} />
          </li>
        ))}
      </ul>
    </WidgetFrame>
  );
}
