'use client';

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import type { TrendingWhy } from '@/lib/discovery/schema';

/** A2 · "Why is this trending?" on a tag chip; the data loads only when opened. */
export function WhyTrending({ tag }: { tag: string }) {
  const { t } = useTranslation('f-discovery');
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState<TrendingWhy | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || why) return;
    let live = true;
    fetch(`/api/discovery/trending/${encodeURIComponent(tag)}`)
      .then((r) =>
        r.ok ? (r.json() as Promise<TrendingWhy>) : Promise.reject(new Error(String(r.status))),
      )
      .then((d) => live && setWhy(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open, why, tag]);

  return (
    <>
      <IconButton
        icon={Info}
        variant="ghost"
        label={t('why-open', { tag, defaultValue: 'Why is #{{tag}} trending?' })}
        onClick={() => setOpen(true)}
      />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {t('why-title', { tag, defaultValue: 'Why #{{tag}} is trending' })}
            </SheetTitle>
            <SheetDescription>
              {t('why-desc', {
                defaultValue: 'When it started, what kicked it off, and how fast it is growing.',
              })}
            </SheetDescription>
          </SheetHeader>
          {failed && (
            <p className="pt-3 text-sm text-site-text-muted">
              {t('why-failed', { defaultValue: 'Could not load this right now.' })}
            </p>
          )}
          {!why && !failed && <Skeleton className="mt-3 h-32 w-full" />}
          {why && (
            <div className="space-y-4 pt-3">
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div className="glass-fill rounded-site p-2">
                  <dt className="text-xs text-site-text-muted">
                    {t('why-first-seen', { defaultValue: 'First seen' })}
                  </dt>
                  <dd className="text-sm font-semibold text-site-text">
                    {new Date(why.firstSeen).toLocaleDateString()}
                  </dd>
                </div>
                <div className="glass-fill rounded-site p-2">
                  <dt className="text-xs text-site-text-muted">
                    {t('why-last-day', { defaultValue: 'Last 24h' })}
                  </dt>
                  <dd className="text-sm font-semibold text-site-text">{why.last24h}</dd>
                </div>
                <div className="glass-fill rounded-site p-2">
                  <dt className="text-xs text-site-text-muted">
                    {t('why-growth', { defaultValue: 'Vs usual' })}
                  </dt>
                  <dd className="text-sm font-semibold text-site-text">
                    {why.growthPct === null
                      ? t('why-new', { defaultValue: 'New' })
                      : `${why.growthPct > 0 ? '+' : ''}${why.growthPct}%`}
                  </dd>
                </div>
              </dl>
              <section>
                <h3 className="site-section-label mb-2">
                  {t('why-started', { defaultValue: 'Where it started' })}
                </h3>
                {why.starters.length === 0 ? (
                  <p className="text-sm text-site-text-muted">
                    {t('why-none', { defaultValue: 'No public posts to show yet.' })}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {why.starters.map((p) => (
                      <li key={p.id}>
                        <Link
                          to={p.href}
                          onClick={() => setOpen(false)}
                          className="glass-fill block rounded-site p-3 hover:bg-site-surface-hover"
                        >
                          <p className="text-sm text-site-text">{p.snippet}</p>
                          <p className="mt-1 text-xs text-site-text-muted">{p.author}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
