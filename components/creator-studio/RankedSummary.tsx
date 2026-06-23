/**
 * Creator Studio · Ranked summary.
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
        ? t('ranked-summary-none', { defaultValue: 'Challenge other players to climb the leaderboards.' })
        : t('ranked-summary-signed-out', { defaultValue: 'Sign in to compete in ranked matches.' });

  return (
    <section className="cstudio-ranked">
      <div className="cstudio-ranked__head">
        <span className="cstudio-ranked__icon" aria-hidden="true">
          <Swords size={18} />
        </span>
        <div className="cstudio-ranked__titles">
          <p className="cstudio-ranked__title">
            {t('ranked', { defaultValue: 'Ranked' })}
            {incoming > 0 && (
              <span className="cstudio-ranked__badge">
                {t('ranked-summary-challenges', { count: incoming, defaultValue: '{{count}} new' })}
              </span>
            )}
          </p>
          <p className="cstudio-ranked__sub">{subtitle}</p>
        </div>

        <div className="cstudio-ranked__actions">
          <button
            type="button"
            className="cstudio-ranked__toggle"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open
              ? t('ranked-summary-hide', { defaultValue: 'Hide' })
              : t('ranked-summary-show', { defaultValue: 'Standings' })}
            <ChevronDown size={15} className={`cstudio-ranked__chev ${open ? 'is-open' : ''}`} />
          </button>
          <Link to="/ranked" className="cstudio-ranked__link">
            {t('ranked-summary-view-all', { defaultValue: 'View all' })}
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>

      {open && (
        <div className="cstudio-ranked__body">
          {hasRatings ? (
            <ul className="cstudio-ranked__list">
              {ratings.map((r) => (
                <li key={r.game} className="cstudio-ranked__row">
                  <span className="cstudio-ranked__game">{nameFor(r.game)}</span>
                  <span className="cstudio-ranked__rating">{fmt(r.rating)}</span>
                  <span className="cstudio-ranked__record">
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
            <div className="cstudio-ranked__games">
              {games.map((g) => (
                <span key={g.id} className="cstudio-ranked__chip">
                  {g.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
