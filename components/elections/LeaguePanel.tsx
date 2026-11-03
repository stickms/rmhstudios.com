import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Copy, LogOut, Trophy } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { decodePicks } from '@/lib/elections/predict';
import { isLeagueCode, type LeagueListItem, type LeagueView } from '@/lib/elections/leagues';
import { SITE_URL } from '@/lib/seo';

const pickKey = (year: number) => `rmh-elections-picks:${year}`;

/** The picks painted in the Predict map on this device (the painter keeps them in localStorage). */
function readMyMap(year: number): Record<string, string> {
  try {
    return decodePicks(localStorage.getItem(pickKey(year)));
  } catch {
    return {};
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body as T;
}

/**
 * Friends leagues: make a league, share its code, everyone submits their painted map, and the board ranks
 * who called the most races right as they are called. No coins, no wagering — just bragging rights. A
 * member's map freezes when the first polls close.
 */
export function LeaguePanel({ year, initialCode }: { year: number; initialCode?: string }) {
  const { t } = useTranslation('c-elections');
  const { data: session } = useSession();
  const qc = useQueryClient();
  const [code, setCode] = useState<string | null>(initialCode && isLeagueCode(initialCode.toUpperCase()) ? initialCode.toUpperCase() : null);
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const signedIn = !!session?.user;

  const list = useQuery({
    queryKey: ['elections-leagues'],
    enabled: signedIn,
    queryFn: () => api<{ leagues: LeagueListItem[] }>('/api/elections/leagues'),
  });
  const view = useQuery({
    queryKey: ['elections-league', code],
    enabled: !!code,
    queryFn: () => api<{ league: LeagueView }>(`/api/elections/leagues/${code}`),
    refetchInterval: 30_000,
    retry: false,
  });
  const league = view.data?.league;

  // Open the first league automatically when there is only one and none was asked for.
  useEffect(() => {
    if (!code && list.data?.leagues.length === 1) setCode(list.data.leagues[0].code);
  }, [code, list.data]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['elections-leagues'] });
    void qc.invalidateQueries({ queryKey: ['elections-league'] });
  };
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg(ok);
      refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await api<{ code: string }>('/api/elections/leagues', { method: 'POST', body: JSON.stringify({ name, cycle: String(year) }) });
      setName('');
      setCode(r.code);
    });
  };
  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const c = joinCode.trim().toUpperCase();
    if (!isLeagueCode(c)) return setMsg(t('league.badCode', { defaultValue: 'That is not a league code.' }));
    void run(async () => {
      await api(`/api/elections/leagues/${c}`, { method: 'POST' });
      setJoinCode('');
      setCode(c);
    });
  };
  const submitMap = () =>
    league &&
    void run(async () => {
      const picks = readMyMap(year);
      const r = await api<{ saved: number }>(`/api/elections/leagues/${league.code}/picks`, { method: 'PUT', body: JSON.stringify({ picks }) });
      setMsg(t('league.saved', { defaultValue: 'Saved — {{n}} calls in your map.', n: r.saved }));
    });
  const leave = () =>
    league &&
    void run(async () => {
      await api(`/api/elections/leagues/${league.code}`, { method: 'DELETE' });
      setCode(null);
    });
  const invite = `${SITE_URL}/elections?cycle=${year}&league=${league?.code ?? ''}#predict`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <section className="el-league" aria-label={t('league.title', { defaultValue: 'Friends leagues' })}>
      <div className="el-box el-proj" style={{ margin: 0 }}>
        <h3 className="el-drawer__title" style={{ fontSize: 28 }}>
          <Trophy size={22} aria-hidden style={{ verticalAlign: -3, marginRight: 8 }} />
          {t('league.title', { defaultValue: 'Friends leagues' })}
        </h3>
        <p className="el-eyebrow" style={{ margin: '4px 0 14px' }}>
          {t('league.lede', {
            defaultValue: 'Paint your map, share a code, and see who calls the most races right. No coins needed.',
          })}
        </p>

        {!signedIn ? (
          <p className="el-eyebrow">
            <Link to="/login" search={{ callbackURL: code ? `/elections?league=${code}` : '/elections' }} style={{ textDecoration: 'underline' }}>
              {t('league.signin', { defaultValue: 'Sign in' })}
            </Link>{' '}
            {t('league.signinRest', { defaultValue: 'to start or join a league.' })}
          </p>
        ) : (
          <>
            {list.data?.leagues.length ? (
              <div className="el-pick-row" role="group" aria-label={t('league.mine', { defaultValue: 'My leagues' })}>
                {list.data.leagues.map((l) => (
                  <button key={l.code} type="button" className="el-btn el-btn--sm" aria-pressed={code === l.code} onClick={() => setCode(l.code)}>
                    {l.name} · {l.memberCount}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="el-league__forms">
              <form onSubmit={create} className="el-pick-row" style={{ flexWrap: 'nowrap', margin: 0 }}>
                <label className="el-sr" htmlFor="el-league-name">{t('league.name', { defaultValue: 'League name' })}</label>
                <input id="el-league-name" className="el-input" value={name} maxLength={60} placeholder={t('league.namePh', { defaultValue: 'Name your league' })} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 0, minHeight: 40 }} />
                <button type="submit" className="el-btn el-btn--sm el-btn--pink" disabled={name.trim().length < 2}>
                  {t('league.create', { defaultValue: 'Start' })}
                </button>
              </form>
              <form onSubmit={join} className="el-pick-row" style={{ flexWrap: 'nowrap', margin: 0 }}>
                <label className="el-sr" htmlFor="el-league-code">{t('league.codeLabel', { defaultValue: 'League code' })}</label>
                <input id="el-league-code" className="el-input" value={joinCode} maxLength={12} placeholder={t('league.codePh', { defaultValue: 'Join with a code' })} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} style={{ flex: 1, minWidth: 0, minHeight: 40 }} />
                <button type="submit" className="el-btn el-btn--sm" disabled={!joinCode.trim()}>
                  {t('league.join', { defaultValue: 'Join' })}
                </button>
              </form>
            </div>
          </>
        )}

        {msg ? <p className="el-eyebrow" role="status" style={{ margin: '10px 0 0' }}>{msg}</p> : null}
        {code && view.isError ? <p className="el-eyebrow" role="alert">{t('league.notFound', { defaultValue: 'League not found.' })}</p> : null}

        {league ? (
          <div className="el-league__board">
            <h4 className="el-league__name">{league.name}</h4>
            <p className="el-eyebrow" style={{ margin: '2px 0 10px' }}>
              {t('league.members', { defaultValue: '{{n}} in the league', n: league.memberCount })} ·{' '}
              {league.locked
                ? t('league.locked', { defaultValue: 'Maps are locked' })
                : league.lockAt
                  ? t('league.locksAt', { defaultValue: 'Maps lock when polls close ({{time}})', time: new Date(league.lockAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) })
                  : t('league.open', { defaultValue: 'Maps stay open' })}
            </p>

            {league.joined ? (
              <>
                <div className="el-pick-row" style={{ marginBottom: 12 }}>
                  <button type="button" className="el-btn el-btn--sm el-btn--pink" onClick={submitMap} disabled={league.locked}>
                    <Check size={14} aria-hidden />
                    {t('league.submit', { defaultValue: 'Submit my map' })}
                  </button>
                  <button type="button" className="el-btn el-btn--sm" onClick={copy}>
                    <Copy size={14} aria-hidden />
                    {copied ? t('league.copied', { defaultValue: 'Copied' }) : t('league.invite', { defaultValue: 'Invite link' })}{' '}
                    <span className="el-mono">{league.code}</span>
                  </button>
                  <button type="button" className="el-btn el-btn--sm el-btn--ghost" onClick={leave}>
                    <LogOut size={14} aria-hidden />
                    {league.isOwner ? t('league.close', { defaultValue: 'Close league' }) : t('league.leave', { defaultValue: 'Leave' })}
                  </button>
                </div>
                <ol className="el-league__rows" aria-label={t('league.board', { defaultValue: 'Leaderboard' })}>
                  {league.standings.map((s) => (
                    <li key={s.userId} className="el-league__row">
                      <span className="el-league__rank">{s.rank}</span>
                      <span className="el-league__who">{s.name ?? s.handle ?? t('league.anon', { defaultValue: 'Player' })}</span>
                      <span className="el-league__score">
                        <strong>{s.score.correct}</strong> {t('league.right', { defaultValue: 'right' })} · {s.score.wrong}{' '}
                        {t('league.wrong', { defaultValue: 'wrong' })}
                        <span className="el-eyebrow"> · {t('league.calls', { defaultValue: '{{n}} calls', n: s.calls })}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            ) : signedIn ? (
              <button type="button" className="el-btn el-btn--pink" onClick={() => run(() => api(`/api/elections/leagues/${league.code}`, { method: 'POST' }))}>
                {t('league.joinThis', { defaultValue: 'Join {{name}}', name: league.name })}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
