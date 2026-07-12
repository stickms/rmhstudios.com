'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Swords, Trophy, Check, X, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from './UserAvatar';
import { HandleInput } from './HandleInput';
import { Reveal } from '@/components/motion';
import { LIFT_CARD } from '@/components/feed/motionHelpers';

interface Rating {
  game: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}
interface ChallengeRow {
  id: string;
  game: string;
  status: string;
  user: { id: string; name: string | null; handle: string | null; image: string | null };
}
interface GameDef {
  id: string;
  name: string;
}
interface LbRow {
  rank: number;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  user: { id: string; name: string | null; handle: string | null; image: string | null };
}

const fmt = (n: number) => n.toLocaleString();

export function RankedColumn({
  initialData,
}: {
  /** Primary Ranked payload prefetched by the route loader. */
  initialData?: {
    games: GameDef[];
    signedIn: boolean;
    ratings: Rating[];
    incoming: ChallengeRow[];
    outgoing: ChallengeRow[];
  } | null;
} = {}) {
  // Seed from the loader when provided so the page paints immediately.
  const seeded = useRef(initialData !== undefined && initialData !== null);
  const [games, setGames] = useState<GameDef[]>(initialData?.games ?? []);
  const [ratings, setRatings] = useState<Rating[]>(initialData?.ratings ?? []);
  const [incoming, setIncoming] = useState<ChallengeRow[]>(initialData?.incoming ?? []);
  const [outgoing, setOutgoing] = useState<ChallengeRow[]>(initialData?.outgoing ?? []);
  const [signedIn, setSignedIn] = useState(!!initialData?.signedIn);
  const [loading, setLoading] = useState(!initialData);
  const [busy, setBusy] = useState<string | null>(null);

  const { t } = useTranslation('feed');

  // Challenge form
  const [game, setGame] = useState(initialData?.games?.[0]?.id ?? '');
  const [opponent, setOpponent] = useState('');
  const [formMsg, setFormMsg] = useState<string | null>(null);

  // Leaderboard
  const [lbGame, setLbGame] = useState(initialData?.games?.[0]?.id ?? '');
  const [lb, setLb] = useState<LbRow[]>([]);
  const [lbLoading, setLbLoading] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/ranked', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setGames(data.games ?? []);
      setRatings(data.ratings ?? []);
      setIncoming(data.incoming ?? []);
      setOutgoing(data.outgoing ?? []);
      setSignedIn(!!data.signedIn);
      if (!game && data.games?.[0]) setGame(data.games[0].id);
      if (!lbGame && data.games?.[0]) setLbGame(data.games[0].id);
    }
  }, [game, lbGame]);

  useEffect(() => {
    if (seeded.current) return;
    let active = true;
    (async () => {
      try {
        await load();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLb = useCallback(async (g: string) => {
    if (!g) return;
    setLbLoading(true);
    try {
      const res = await fetch(`/api/ranked/${encodeURIComponent(g)}/leaderboard`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setLb(data.leaderboard ?? []);
      }
    } finally {
      setLbLoading(false);
    }
  }, []);

  useEffect(() => {
    if (lbGame) loadLb(lbGame);
  }, [lbGame, loadLb]);

  async function sendChallenge() {
    if (!game || !opponent.trim()) return;
    setBusy('send');
    setFormMsg(null);
    try {
      const res = await fetch('/api/ranked', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game, opponent: opponent.trim().replace(/^@/, '') }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormMsg(data.error ?? t('could-not-send', { defaultValue: 'Could not send' }));
        return;
      }
      setOpponent('');
      setFormMsg(t('challenge-sent', { defaultValue: 'Challenge sent!' }));
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function act(id: string, body: object, key: string) {
    setBusy(key);
    try {
      const res = await fetch(`/api/ranked/challenge/${id}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) await load();
      else {
        const b = await res.json().catch(() => ({}));
        if (b?.error) alert(b.error);
      }
    } finally {
      setBusy(null);
    }
  }

  const nameOf = (id: string) => games.find((g) => g.id === id)?.name ?? id;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <Swords className="h-5 w-5 text-site-accent" />
        <h1 className="text-lg font-bold text-site-text">{t('ranked', { defaultValue: 'Ranked' })}</h1>
      </header>

      <div className="space-y-6 p-4">
        {signedIn && (
          <>
            {/* Issue a challenge */}
            <Reveal as="section" className={`rounded-site border border-site-border bg-site-surface p-4 ${LIFT_CARD}`}>
              <h2 className="mb-2 text-sm font-bold text-site-text">{t('challenge-a-player', { defaultValue: 'Challenge a player' })}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={game}
                  onChange={(e) => setGame(e.target.value)}
                  className="rounded-site-sm border border-site-border bg-site-bg px-2.5 py-1.5 text-sm text-site-text outline-none focus:border-site-accent"
                >
                  {games.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <div className="flex-1">
                  <HandleInput
                    value={opponent}
                    onChange={setOpponent}
                    placeholder={t('handle-placeholder', { defaultValue: '@handle' })}
                    className="w-full rounded-site-sm border border-site-border bg-site-bg px-3 py-1.5 text-sm text-site-text outline-none focus:border-site-accent"
                  />
                </div>
                <Button size="sm" variant="accent" loading={busy === 'send'} disabled={!opponent.trim()} onClick={sendChallenge}>
                  {t('challenge-btn', { defaultValue: 'Challenge' })}
                </Button>
              </div>
              {formMsg && <p className="mt-2 text-xs text-site-text-muted">{formMsg}</p>}
            </Reveal>

            {/* Incoming challenges */}
            {incoming.length > 0 && (
              <Reveal as="section">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t('challenges-for-you', { defaultValue: 'Challenges for you' })}</h2>
                <div className="space-y-2">
                  {incoming.map((c) => (
                    <div key={c.id} className={`flex items-center gap-2 rounded-site border border-site-border bg-site-surface p-2.5 ${LIFT_CARD}`}>
                      <UserAvatar user={c.user} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-site-text">{c.user.name || c.user.handle || t('player-fallback', { defaultValue: 'Player' })}</p>
                        <p className="text-[11px] text-site-text-dim">{nameOf(c.game)} · {c.status}</p>
                      </div>
                      {c.status === 'pending' ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="accent" disabled={busy === `a:${c.id}`} onClick={() => act(c.id, { action: 'accept' }, `a:${c.id}`)} className="gap-1">
                            <Check className="h-3.5 w-3.5" /> {t('accept', { defaultValue: 'Accept' })}
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy === `a:${c.id}`} onClick={() => act(c.id, { action: 'decline' }, `a:${c.id}`)} className="text-site-text-muted hover:text-site-danger">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <ReportButtons id={c.id} busy={busy} act={act} />
                      )}
                    </div>
                  ))}
                </div>
              </Reveal>
            )}

            {/* Outgoing challenges */}
            {outgoing.length > 0 && (
              <Reveal as="section">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t('your-challenges', { defaultValue: 'Your challenges' })}</h2>
                <div className="space-y-2">
                  {outgoing.map((c) => (
                    <div key={c.id} className={`flex items-center gap-2 rounded-site border border-site-border bg-site-surface p-2.5 ${LIFT_CARD}`}>
                      <UserAvatar user={c.user} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-site-text">{c.user.name || c.user.handle || t('player-fallback', { defaultValue: 'Player' })}</p>
                        <p className="text-[11px] text-site-text-dim">{nameOf(c.game)} · {c.status}</p>
                      </div>
                      {c.status === 'accepted' && <ReportButtons id={c.id} busy={busy} act={act} />}
                    </div>
                  ))}
                </div>
              </Reveal>
            )}

            {/* Your ratings */}
            {ratings.length > 0 && (
              <Reveal as="section">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t('your-ratings', { defaultValue: 'Your ratings' })}</h2>
                <div className="space-y-1">
                  {ratings.map((r) => (
                    <div key={r.game} className={`flex items-center justify-between rounded-site border border-site-border bg-site-surface px-3 py-2.5 ${LIFT_CARD}`}>
                      <span className="text-sm font-medium text-site-text">{nameOf(r.game)}</span>
                      <span className="text-sm text-site-text-dim">
                        <strong className="text-site-text">{fmt(r.rating)}</strong> · {r.wins}W {r.losses}L {r.draws}D
                      </span>
                    </div>
                  ))}
                </div>
              </Reveal>
            )}
          </>
        )}

        {/* Leaderboard */}
        <Reveal as="section">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
              <Trophy className="h-3.5 w-3.5" /> {t('leaderboard', { defaultValue: 'Leaderboard' })}
            </h2>
            <select
              value={lbGame}
              onChange={(e) => setLbGame(e.target.value)}
              className="rounded-site-sm border border-site-border bg-site-bg px-2 py-1 text-xs text-site-text outline-none focus:border-site-accent"
            >
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          {lbLoading ? (
            <div className="flex justify-center py-8">
              <Spinner size={20} />
            </div>
          ) : lb.length === 0 ? (
            <p className="py-8 text-center text-sm text-site-text-muted">{t('no-ranked-players', { defaultValue: 'No ranked players yet.' })}</p>
          ) : (
            <div className="space-y-1">
              {lb.map((row) => (
                <div key={row.user.id} className={`flex items-center gap-3 rounded-site border border-site-border bg-site-surface p-2.5 ${LIFT_CARD}`}>
                  <span className="w-5 text-center text-xs font-bold text-site-text-dim">{row.rank}</span>
                  <UserAvatar user={row.user} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-site-text">{row.user.name || row.user.handle || t('player-fallback', { defaultValue: 'Player' })}</p>
                    <p className="text-[11px] text-site-text-dim">{row.wins}W {row.losses}L {row.draws}D</p>
                  </div>
                  <span className="text-sm font-bold text-site-text">{fmt(row.rating)}</span>
                </div>
              ))}
            </div>
          )}
        </Reveal>
      </div>
    </div>
  );
}

function ReportButtons({
  id,
  busy,
  act,
}: {
  id: string;
  busy: string | null;
  act: (id: string, body: object, key: string) => void;
}) {
  const { t } = useTranslation('feed');
  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 inline-flex items-center gap-1 text-[10px] text-site-text-dim">
        <Flag className="h-3 w-3" /> {t('report-label', { defaultValue: 'report:' })}
      </span>
      <Button size="sm" variant="outline" disabled={busy === `r:${id}`} onClick={() => act(id, { action: 'report', result: 'win' }, `r:${id}`)} className="h-7 px-2 text-xs">
        {t('won', { defaultValue: 'Won' })}
      </Button>
      <Button size="sm" variant="outline" disabled={busy === `r:${id}`} onClick={() => act(id, { action: 'report', result: 'loss' }, `r:${id}`)} className="h-7 px-2 text-xs">
        {t('lost', { defaultValue: 'Lost' })}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy === `r:${id}`} onClick={() => act(id, { action: 'report', result: 'draw' }, `r:${id}`)} className="h-7 px-2 text-xs text-site-text-muted">
        {t('draw', { defaultValue: 'Draw' })}
      </Button>
    </div>
  );
}
