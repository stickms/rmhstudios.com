'use client';

import { useEffect, useState, useCallback, useRef } from'react';
import { useTranslation } from'react-i18next';
import { Swords, Trophy, Check, X, Flag } from'lucide-react';
import { Button } from'@/components/ui/button';
import { Spinner } from'@/components/ui/spinner';
import { toast } from'sonner';
import { Select } from'@/components/ui/select';
import { UserAvatar } from'./UserAvatar';
import { HandleInput } from'./HandleInput';
import { ColumnHeader } from'./ColumnHeader';
import { Reveal } from'@/components/motion';
import { LIFT_CARD } from'@/components/feed/motionHelpers';
import type { RankTier } from'@/lib/ranked/tiers';

interface Rating {
 game: string;
 rating: number;
 tier?: RankTier;
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
 tier?: RankTier;
 wins: number;
 losses: number;
 draws: number;
 user: { id: string; name: string | null; handle: string | null; image: string | null };
}

const fmt = (n: number) => n.toLocaleString();

/** Small colored pill for a ranked tier (Bronze → Master). */
function TierBadge({ tier }: { tier?: RankTier }) {
 if (!tier) return null;
 return (
 <span
 className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
 style={{
 color: tier.color,
 backgroundColor: `${tier.color}1a`,
 border: `1px solid ${tier.color}40`,
 }}
 >
 {tier.label}
 </span>
 );
}

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
 const [game, setGame] = useState(initialData?.games?.[0]?.id ??'');
 const [opponent, setOpponent] = useState('');
 const [formMsg, setFormMsg] = useState<string | null>(null);

 // Leaderboard
 const [lbGame, setLbGame] = useState(initialData?.games?.[0]?.id ??'');
 const [lb, setLb] = useState<LbRow[]>([]);
 const [lbLoading, setLbLoading] = useState(false);

 const load = useCallback(async () => {
 const res = await fetch('/api/ranked', { credentials:'include'});
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
 const res = await fetch(`/api/ranked/${encodeURIComponent(g)}/leaderboard`, {
 credentials:'include',
 });
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
 method:'POST',
 credentials:'include',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify({ game, opponent: opponent.trim().replace(/^@/,'') }),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok) {
 setFormMsg(data.error ?? t('could-not-send', { defaultValue:'Could not send'}));
 return;
 }
 setOpponent('');
 setFormMsg(t('challenge-sent', { defaultValue:'Challenge sent!'}));
 await load();
 } finally {
 setBusy(null);
 }
 }

 async function act(id: string, body: object, key: string) {
 setBusy(key);
 try {
 const res = await fetch(`/api/ranked/challenge/${id}`, {
 method:'POST',
 credentials:'include',
 headers: {'Content-Type':'application/json'},
 body: JSON.stringify(body),
 });
 if (res.ok) await load();
 else {
 const b = await res.json().catch(() => ({}));
 if (b?.error) toast.error(b.error);
 }
 } finally {
 setBusy(null);
 }
 }

 const nameOf = (id: string) => games.find((g) => g.id === id)?.name ?? id;

 if (loading) {
 return (
 <div className="flex justify-center px-4 pt-4 pb-12">
 <Spinner />
 </div>
 );
 }

 return (
 <div>
 <ColumnHeader icon={Swords} title={t('ranked', { defaultValue:'Ranked'})} />

 <div className="space-y-6 py-4">
 {signedIn && (
 <>
 {/* Issue a challenge */}
 <Reveal
 as="section"
 className={`rounded-site glass-fill p-5 ${LIFT_CARD}`}
 >
 <h2 id="ranked-challenge-heading"className="site-section-label mb-3">
 {t('challenge-a-player', { defaultValue:'Challenge a player'})}
 </h2>
 <div className="flex flex-wrap items-center gap-2">
 <Select
 aria-labelledby="ranked-challenge-heading"
 controlSize="sm"
 value={game}
 onChange={(e) => setGame(e.target.value)}
 >
 {games.map((g) => (
 <option key={g.id} value={g.id}>
 {g.name}
 </option>
 ))}
 </Select>
 <div className="flex-1">
 <HandleInput
 value={opponent}
 onChange={setOpponent}
 placeholder={t('handle-placeholder', { defaultValue:'@handle'})}
 className="glass-inset h-11 w-full rounded-[var(--site-control-radius)] px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim focus-visible:border-site-accent focus-visible:outline-none"
 />
 </div>
 <Button
 size="sm"
 variant="accent"
 loading={busy ==='send'}
 disabled={!opponent.trim()}
 onClick={sendChallenge}
 >
 {t('challenge-btn', { defaultValue:'Challenge'})}
 </Button>
 </div>
 {formMsg && <p className="mt-3 text-xs text-site-text-muted">{formMsg}</p>}
 </Reveal>

 {/* Incoming challenges */}
 {incoming.length > 0 && (
 <Reveal as="section">
 <h2 className="site-section-label mb-3">
 {t('challenges-for-you', { defaultValue:'Challenges for you'})}
 </h2>
 <div className="space-y-2">
 {incoming.map((c) => (
 <div
 key={c.id}
 className={`flex items-center gap-2 rounded-site glass-fill px-3 py-3 ${LIFT_CARD}`}
 >
 <UserAvatar user={c.user} />
 <div className="min-w-0 flex-1">
 <p className="truncate text-sm font-semibold text-site-text">
 {c.user.name ||
 c.user.handle ||
 t('player-fallback', { defaultValue:'Player'})}
 </p>
 <p className="text-xs text-site-text-dim">
 {nameOf(c.game)} · {c.status}
 </p>
 </div>
 {c.status ==='pending'? (
 <div className="flex gap-2">
 <Button
 size="sm"
 variant="accent"
 disabled={busy === `a:${c.id}`}
 onClick={() => act(c.id, { action:'accept'}, `a:${c.id}`)}
 >
 <Check className="h-3.5 w-3.5"aria-hidden />{''}
 {t('accept', { defaultValue:'Accept'})}
 </Button>
 <Button
 size="sm"
 variant="ghost"
 disabled={busy === `a:${c.id}`}
 onClick={() => act(c.id, { action:'decline'}, `a:${c.id}`)}
 className="text-site-text-muted hover:text-site-danger"
 aria-label={t('decline-challenge', { defaultValue:'Decline challenge'})}
 >
 <X className="h-3.5 w-3.5"aria-hidden />
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
 <h2 className="site-section-label mb-3">
 {t('your-challenges', { defaultValue:'Your challenges'})}
 </h2>
 <div className="space-y-2">
 {outgoing.map((c) => (
 <div
 key={c.id}
 className={`flex items-center gap-2 rounded-site glass-fill px-3 py-3 ${LIFT_CARD}`}
 >
 <UserAvatar user={c.user} />
 <div className="min-w-0 flex-1">
 <p className="truncate text-sm font-semibold text-site-text">
 {c.user.name ||
 c.user.handle ||
 t('player-fallback', { defaultValue:'Player'})}
 </p>
 <p className="text-xs text-site-text-dim">
 {nameOf(c.game)} · {c.status}
 </p>
 </div>
 {c.status ==='accepted'&& <ReportButtons id={c.id} busy={busy} act={act} />}
 </div>
 ))}
 </div>
 </Reveal>
 )}

 {/* Your ratings */}
 {ratings.length > 0 && (
 <Reveal as="section">
 <h2 className="site-section-label mb-3">
 {t('your-ratings', { defaultValue:'Your ratings'})}
 </h2>
 <div className="space-y-2">
 {ratings.map((r) => (
 <div
 key={r.game}
 className={`flex items-center justify-between gap-2 rounded-site glass-fill px-3 py-3 ${LIFT_CARD}`}
 >
 <span className="flex min-w-0 items-center gap-2">
 <span className="truncate text-sm font-medium text-site-text">
 {nameOf(r.game)}
 </span>
 <TierBadge tier={r.tier} />
 </span>
 <span className="shrink-0 text-sm text-site-text-dim">
 <strong className="text-site-text">{fmt(r.rating)}</strong> · {r.wins}W{' '}
 {r.losses}L {r.draws}D
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
 <div className="mb-3 flex items-center justify-between gap-2">
 <h2 id="ranked-leaderboard-heading"className="site-section-label flex items-center gap-2">
 <Trophy className="h-3.5 w-3.5"aria-hidden /> {t('leaderboard', { defaultValue:'Leaderboard'})}
 </h2>
 <Select
 aria-labelledby="ranked-leaderboard-heading"
 controlSize="sm"
 value={lbGame}
 onChange={(e) => setLbGame(e.target.value)}
 >
 {games.map((g) => (
 <option key={g.id} value={g.id}>
 {g.name}
 </option>
 ))}
 </Select>
 </div>
 {lbLoading ? (
 <div className="flex justify-center py-8">
 <Spinner size={20} />
 </div>
 ) : lb.length === 0 ? (
 <p className="py-8 text-center text-sm text-site-text-muted">
 {t('no-ranked-players', { defaultValue:'No ranked players yet.'})}
 </p>
 ) : (
 <div className="space-y-2">
 {lb.map((row) => (
 <div
 key={row.user.id}
 className={`flex items-center gap-3 rounded-site glass-fill px-3 py-3 ${LIFT_CARD}`}
 >
 <span className="w-5 text-center text-xs font-bold text-site-text-dim">
 {row.rank}
 </span>
 <UserAvatar user={row.user} />
 <div className="min-w-0 flex-1">
 <p className="truncate text-sm font-semibold text-site-text">
 {row.user.name ||
 row.user.handle ||
 t('player-fallback', { defaultValue:'Player'})}
 </p>
 <p className="flex items-center gap-2 text-xs text-site-text-dim">
 <TierBadge tier={row.tier} />
 {row.wins}W {row.losses}L {row.draws}D
 </p>
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
 <div className="flex items-center gap-2">
 <span className="inline-flex items-center gap-2 text-xs text-site-text-dim">
 <Flag className="h-3 w-3"aria-hidden /> {t('report-label', { defaultValue:'report:'})}
 </span>
 <Button
 size="xs"
 variant="outline"
 disabled={busy === `r:${id}`}
 onClick={() => act(id, { action:'report', result:'win'}, `r:${id}`)}
 >
 {t('won', { defaultValue:'Won'})}
 </Button>
 <Button
 size="xs"
 variant="outline"
 disabled={busy === `r:${id}`}
 onClick={() => act(id, { action:'report', result:'loss'}, `r:${id}`)}
 >
 {t('lost', { defaultValue:'Lost'})}
 </Button>
 <Button
 size="xs"
 variant="ghost"
 disabled={busy === `r:${id}`}
 onClick={() => act(id, { action:'report', result:'draw'}, `r:${id}`)}
 className="text-site-text-muted"
 >
 {t('draw', { defaultValue:'Draw'})}
 </Button>
 </div>
 );
}
