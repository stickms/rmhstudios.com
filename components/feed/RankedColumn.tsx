'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Swords, Trophy, Check, X, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from './UserAvatar';

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

export function RankedColumn() {
  const [games, setGames] = useState<GameDef[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [incoming, setIncoming] = useState<ChallengeRow[]>([]);
  const [outgoing, setOutgoing] = useState<ChallengeRow[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Challenge form
  const [game, setGame] = useState('');
  const [opponent, setOpponent] = useState('');
  const [formMsg, setFormMsg] = useState<string | null>(null);

  // Leaderboard
  const [lbGame, setLbGame] = useState('');
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
        setFormMsg(data.error ?? 'Could not send');
        return;
      }
      setOpponent('');
      setFormMsg('Challenge sent!');
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
        <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <Swords className="h-5 w-5 text-site-accent" />
        <h1 className="text-lg font-bold text-site-text">Ranked</h1>
      </header>

      <div className="space-y-6 p-4">
        {signedIn && (
          <>
            {/* Issue a challenge */}
            <section className="rounded-xl border border-site-border bg-site-surface p-4">
              <h2 className="mb-2 text-sm font-bold text-site-text">Challenge a player</h2>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={game}
                  onChange={(e) => setGame(e.target.value)}
                  className="rounded-lg border border-site-border bg-site-bg px-2.5 py-1.5 text-sm text-site-text outline-none focus:border-site-accent"
                >
                  {games.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <input
                  value={opponent}
                  onChange={(e) => setOpponent(e.target.value)}
                  placeholder="@handle"
                  className="flex-1 rounded-lg border border-site-border bg-site-bg px-3 py-1.5 text-sm text-site-text outline-none focus:border-site-accent"
                />
                <Button size="sm" variant="accent" disabled={busy === 'send' || !opponent.trim()} onClick={sendChallenge}>
                  {busy === 'send' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Challenge'}
                </Button>
              </div>
              {formMsg && <p className="mt-2 text-xs text-site-text-muted">{formMsg}</p>}
            </section>

            {/* Incoming challenges */}
            {incoming.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">Challenges for you</h2>
                <div className="space-y-2">
                  {incoming.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 rounded-xl border border-site-border bg-site-surface p-2.5">
                      <UserAvatar user={c.user} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-site-text">{c.user.name || c.user.handle || 'Player'}</p>
                        <p className="text-[11px] text-site-text-dim">{nameOf(c.game)} · {c.status}</p>
                      </div>
                      {c.status === 'pending' ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="accent" disabled={busy === `a:${c.id}`} onClick={() => act(c.id, { action: 'accept' }, `a:${c.id}`)} className="gap-1">
                            <Check className="h-3.5 w-3.5" /> Accept
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
              </section>
            )}

            {/* Outgoing challenges */}
            {outgoing.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">Your challenges</h2>
                <div className="space-y-2">
                  {outgoing.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 rounded-xl border border-site-border bg-site-surface p-2.5">
                      <UserAvatar user={c.user} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-site-text">{c.user.name || c.user.handle || 'Player'}</p>
                        <p className="text-[11px] text-site-text-dim">{nameOf(c.game)} · {c.status}</p>
                      </div>
                      {c.status === 'accepted' && <ReportButtons id={c.id} busy={busy} act={act} />}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Your ratings */}
            {ratings.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">Your ratings</h2>
                <div className="space-y-1">
                  {ratings.map((r) => (
                    <div key={r.game} className="flex items-center justify-between rounded-xl border border-site-border bg-site-surface px-3 py-2.5">
                      <span className="text-sm font-medium text-site-text">{nameOf(r.game)}</span>
                      <span className="text-sm text-site-text-dim">
                        <strong className="text-site-text">{fmt(r.rating)}</strong> · {r.wins}W {r.losses}L {r.draws}D
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* Leaderboard */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
              <Trophy className="h-3.5 w-3.5" /> Leaderboard
            </h2>
            <select
              value={lbGame}
              onChange={(e) => setLbGame(e.target.value)}
              className="rounded-lg border border-site-border bg-site-bg px-2 py-1 text-xs text-site-text outline-none focus:border-site-accent"
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
              <Loader2 className="h-5 w-5 animate-spin text-site-accent" />
            </div>
          ) : lb.length === 0 ? (
            <p className="py-8 text-center text-sm text-site-text-muted">No ranked players yet.</p>
          ) : (
            <div className="space-y-1">
              {lb.map((row) => (
                <div key={row.user.id} className="flex items-center gap-3 rounded-xl border border-site-border bg-site-surface p-2.5">
                  <span className="w-5 text-center text-xs font-bold text-site-text-dim">{row.rank}</span>
                  <UserAvatar user={row.user} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-site-text">{row.user.name || row.user.handle || 'Player'}</p>
                    <p className="text-[11px] text-site-text-dim">{row.wins}W {row.losses}L {row.draws}D</p>
                  </div>
                  <span className="text-sm font-bold text-site-text">{fmt(row.rating)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
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
  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 inline-flex items-center gap-1 text-[10px] text-site-text-dim">
        <Flag className="h-3 w-3" /> report:
      </span>
      <Button size="sm" variant="outline" disabled={busy === `r:${id}`} onClick={() => act(id, { action: 'report', result: 'win' }, `r:${id}`)} className="h-7 px-2 text-xs">
        Won
      </Button>
      <Button size="sm" variant="outline" disabled={busy === `r:${id}`} onClick={() => act(id, { action: 'report', result: 'loss' }, `r:${id}`)} className="h-7 px-2 text-xs">
        Lost
      </Button>
      <Button size="sm" variant="ghost" disabled={busy === `r:${id}`} onClick={() => act(id, { action: 'report', result: 'draw' }, `r:${id}`)} className="h-7 px-2 text-xs text-site-text-muted">
        Draw
      </Button>
    </div>
  );
}
