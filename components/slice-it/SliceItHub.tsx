'use client';

/**
 * V12 — the public Slice It! hub.
 *
 * A `_site` surface, so it follows the SITE tokens and the glass elevation
 * scale. `--slice-*` and `.neumorphic` stay inside the game: the hub is a page
 * on rmhstudios.com that happens to be about a game, and a page that adopts the
 * game's material reads as a broken theme everywhere except the one theme the
 * game was drawn for.
 */

import { Link } from '@tanstack/react-router';
import { Music, Play, Trophy, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/ui/card';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { EmptyState } from '@/components/ui/empty-state';
import type { HubPayload } from '@/lib/slice-it/hub.server';
import { formatCount } from '@/lib/utils';

function duration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function SliceItHub({ data }: { data: HubPayload }) {
  const { t } = useTranslation('r-slice-it');

  return (
    <div className="space-y-6">
      <Card pane className="p-5 space-y-3">
        <p className="text-site-text-secondary">
          {t('hub-pitch', {
            defaultValue:
              'Upload any track and Slice It! charts it — onsets, tempo and sections, four nested difficulties. Then race up to eight players on it.',
          })}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/slice-it"
            className="glass-fill glass-interactive rounded-site px-4 py-2 inline-flex items-center gap-2 font-medium text-site-text"
          >
            <Play className="size-4" aria-hidden />
            {t('hub-play', { defaultValue: 'Play Slice It!' })}
          </Link>
          <span className="text-sm text-site-text-secondary inline-flex items-center gap-1.5">
            <Music className="size-4" aria-hidden />
            {t('hub-total-songs', {
              defaultValue: '{{count}} charts',
              count: data.totals.songs,
            })}
          </span>
          <span className="text-sm text-site-text-secondary inline-flex items-center gap-1.5">
            <Trophy className="size-4" aria-hidden />
            {t('hub-total-runs', {
              defaultValue: '{{count}} scores set',
              count: data.totals.runs,
            })}
          </span>
        </div>
      </Card>

      <section aria-labelledby="hub-top-charts" className="space-y-3">
        <h2 id="hub-top-charts" className="text-lg font-semibold text-site-text">
          {t('hub-top-charts', { defaultValue: 'Most played' })}
        </h2>
        {data.topCharts.length === 0 ? (
          <EmptyState
            icon={Music}
            title={t('hub-no-charts', { defaultValue: 'No public charts yet' })}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.topCharts.map((chart) => (
              <li key={chart.id}>
                <Card className="p-3 flex items-center gap-3">
                  {chart.coverUrl ? (
                    <img
                      src={chart.coverUrl}
                      alt=""
                      loading="lazy"
                      className="size-12 rounded-site object-cover shrink-0"
                    />
                  ) : (
                    <span className="size-12 rounded-site glass-inset shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-site-text">{chart.title}</span>
                    <span className="block truncate text-sm text-site-text-secondary">
                      {chart.artist} · {duration(chart.duration)} ·{' '}
                      {t('hub-plays', { defaultValue: '{{count}} plays', count: chart.plays })}
                    </span>
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="hub-records" className="space-y-3">
        <h2 id="hub-records" className="text-lg font-semibold text-site-text">
          {t('hub-recent-records', { defaultValue: 'Recent records' })}
        </h2>
        {data.recentRecords.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title={t('hub-no-records', { defaultValue: 'No scores yet — go first' })}
          />
        ) : (
          <Card className="divide-y divide-site-border">
            {data.recentRecords.map((record) => (
              <div
                key={`${record.songId}:${record.user.id}:${record.at}`}
                className="flex items-center gap-3 p-3"
              >
                <UserAvatar
                  src={record.user.image ?? undefined}
                  alt={record.user.name ?? ''}
                  size={28}
                  fallbackName={record.user.name ?? undefined}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-site-text">
                    {record.user.name ?? record.user.username}
                  </span>
                  <span className="block truncate text-xs text-site-text-secondary">
                    {record.title} — {record.artist}
                  </span>
                </span>
                <span className="tabular-nums font-medium text-site-text">
                  {formatCount(record.score)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section aria-labelledby="hub-charters" className="space-y-3">
        <h2 id="hub-charters" className="text-lg font-semibold text-site-text">
          {t('hub-charters', { defaultValue: 'Most played uploaders' })}
        </h2>
        {data.featuredCharters.length === 0 ? (
          <EmptyState
            icon={Upload}
            title={t('hub-no-charters', { defaultValue: 'Nobody has uploaded yet' })}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.featuredCharters.map((charter) => (
              <li key={charter.user.id}>
                <Card className="p-3 flex items-center gap-3">
                  <UserAvatar
                    src={charter.user.image ?? undefined}
                    alt={charter.user.name ?? ''}
                    size={32}
                    fallbackName={charter.user.name ?? undefined}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-site-text">
                      {charter.user.name ?? charter.user.username}
                    </span>
                    <span className="block truncate text-sm text-site-text-secondary">
                      {t('hub-uploads', {
                        defaultValue: '{{count}} uploads',
                        count: charter.uploads,
                      })}
                    </span>
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
