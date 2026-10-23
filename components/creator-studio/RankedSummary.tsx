/**
 * Create · Ranked summary.
 *
 * A compact panel pinned to the top of the Games tab — replacing the former
 * standalone /ranked sidebar tab. Shows the viewer's ranked standings (or a
 * sign-in / get-started nudge) behind a collapsible dropdown, plus a link out
 * to the full /ranked experience for challenges and leaderboards.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Swords, ChevronDown, ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Rating {
  game: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}
interface GameDef {
  id: string;
  name: string;
}

const fmt = (n: number) => n.toLocaleString();

export function RankedSummary() {
  const { t } = useTranslation('feed');
  const [games, setGames] = useState<GameDef[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [incoming, setIncoming] = useState(0);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/ranked', { credentials: 'include' });
        if (!res.ok || !active) return;
        const data = await res.json();
        if (!active) return;
        setGames(data.games ?? []);
        setRatings(data.ratings ?? []);
        setIncoming((data.incoming ?? []).length);
        setSignedIn(!!data.signedIn);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const nameFor = (id: string) => games.find((g) => g.id === id)?.name ?? id;
  const hasRatings = signedIn && ratings.length > 0;

  const subtitle = loading
    ? t('ranked-summary-loading', { defaultValue: 'Loading your standings…' })
    : hasRatings
      ? t('ranked-summary-rated', { defaultValue: 'Your current ranked standings.' })
      : signedIn
        ? t('ranked-summary-none', {
            defaultValue: 'Challenge other players to climb the leaderboards.',
          })
        : t('ranked-summary-signed-out', { defaultValue: 'Sign in to compete in ranked matches.' });

  return (
    <section className="glass-pane rounded-site">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span
          className="glass-inset flex size-9 shrink-0 items-center justify-center rounded-site-sm text-site-accent"
          aria-hidden="true"
        >
          <Swords className="size-4" />
        </span>
        <div className="min-w-0 flex-1 basis-40">
          <p className="flex items-center gap-2 font-semibold text-site-text">
            {t('ranked', { defaultValue: 'Ranked' })}
            {incoming > 0 && (
              <Badge variant="accent" size="sm">
                {t('ranked-summary-challenges', { count: incoming, defaultValue: '{{count}} new' })}
              </Badge>
            )}
          </p>
          <p className="hidden truncate text-sm text-site-text-muted sm:block">{subtitle}</p>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open
              ? t('ranked-summary-hide', { defaultValue: 'Hide' })
              : t('ranked-summary-show', { defaultValue: 'Standings' })}
            <ChevronDown
              className={cn('size-4 transition-transform', open && 'rotate-180')}
              aria-hidden
            />
          </Button>
          <Button asChild variant="accent-outline" size="sm" className="flex-1 sm:flex-none">
            <Link to="/ranked">
              {t('ranked-summary-view-all', { defaultValue: 'View all' })}
              <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t border-site-border px-4 py-3">
          {hasRatings ? (
            <ul className="flex flex-col gap-2">
              {ratings.map((r) => (
                <li key={r.game} className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-semibold text-site-text">
                    {nameFor(r.game)}
                  </span>
                  <span className="font-bold tabular-nums text-site-accent">{fmt(r.rating)}</span>
                  <span className="tabular-nums text-site-text-dim">
                    {t('ranked-summary-record', {
                      wins: r.wins,
                      losses: r.losses,
                      defaultValue: '{{wins}}W · {{losses}}L',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap gap-2">
              {games.map((g) => (
                <Badge key={g.id} variant="outline">
                  {g.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
