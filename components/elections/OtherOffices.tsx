import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { filterOther, otherStats, type OtherRace } from '@/lib/elections/downballot';
import { STATE_CODES, stateName } from '@/lib/elections/states';
import { fmtInt } from './hooks';
import { useFollow } from './FollowContext';

const PAGE = 18;

function useOffices(cycle: string, live: boolean) {
  return useQuery<{ races: OtherRace[]; updatedAt: string }>({
    queryKey: ['elections-offices', cycle],
    queryFn: async () => {
      const r = await fetch(`/api/elections/offices?cycle=${encodeURIComponent(cycle)}`);
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    refetchInterval: live ? 30_000 : 10 * 60_000,
    staleTime: 15_000,
    retry: 1,
  });
}

const PARTY = { DEM: 'dem', GOP: 'gop', OTH: 'oth' } as const;
const WORD = { DEM: 'Dem', GOP: 'GOP', OTH: 'Ind' } as const;

function OfficeCard({ r }: { r: OtherRace }) {
  const { t } = useTranslation('c-elections');
  const started = r.totalVotes > 0;
  return (
    <article className="el-measure el-box" aria-label={r.title}>
      <header className="el-measure__head">
        <div>
          <h3 className="el-race__label">{r.title}</h3>
          <p className="el-eyebrow" style={{ margin: '4px 0 0' }}>{r.stateName}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <span className="el-chip el-chip--ink">{r.scope === 'local' ? t('measures.local', { defaultValue: 'Local' }) : t('measures.statewide', { defaultValue: 'Statewide' })}</span>
          <span className="el-chip">{r.office}</span>
        </div>
      </header>
      <div className="el-office__list">
        {r.candidates.slice(0, 3).map((c) => (
          <div key={c.id} className="el-office__cand">
            <span>
              {c.won ? '✔ ' : ''}
              <strong>{c.name}</strong>{' '}
              <span className={`el-chip el-chip--${PARTY[c.party]}`}>{WORD[c.party]}</span>
              {c.incumbent ? <small className="el-eyebrow"> · {t('card.incumbent', { defaultValue: 'incumbent' })}</small> : null}
            </span>
            <strong>{started ? `${c.pct}%` : '—'}</strong>
          </div>
        ))}
      </div>
      <footer className="el-race__foot">
        <span className={`el-chip ${r.status === 'called' && r.winnerParty ? `el-chip--${PARTY[r.winnerParty]}` : ''}`}>
          {r.status === 'called'
            ? t('office.called', { defaultValue: 'Called' })
            : r.status === 'counting'
              ? t('office.counting', { defaultValue: 'Counting' })
              : t('measures.awaiting', { defaultValue: 'Awaiting polls' })}
          {r.flipped ? ` · ${t('card.flip', { defaultValue: 'Flip' })}` : ''}
        </span>
        <span className="el-eyebrow">
          {r.pctReporting != null ? t('measures.reporting', { defaultValue: '{{pct}}% in', pct: Math.round(r.pctReporting) }) : null}
          {started ? ` · ${fmtInt(r.totalVotes)}` : ''}
        </span>
      </footer>
    </article>
  );
}

/** Statewide offices below the headline races and local offices (mayors…): live counts, filters, tallies. */
export function OtherOffices({ cycle, live }: { cycle: string; live: boolean }) {
  const { t } = useTranslation('c-elections');
  const { data, isLoading, isError } = useOffices(cycle, live);
  const follow = useFollow();
  const [office, setOffice] = useState('all');
  const [scope, setScope] = useState<'all' | 'statewide' | 'local'>('all');
  const [state, setState] = useState('all');
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const all = useMemo(() => data?.races ?? [], [data]);
  const stats = useMemo(() => otherStats(all), [all]);
  const states = useMemo(() => STATE_CODES.filter((c) => all.some((r) => r.state === c)), [all]);
  const rows = useMemo(() => {
    const f = filterOther(all, { office, scope, state, q });
    return mine && follow.states.length ? f.filter((r) => follow.states.includes(r.state)) : f;
  }, [all, office, scope, state, q, mine, follow.states]);

  if (isLoading) return <div className="el-box el-skel" aria-busy />;
  if (isError || !all.length) {
    return (
      <p className="el-eyebrow">
        {isError ? t('office.error', { defaultValue: 'Other offices are unavailable right now.' }) : t('office.none', { defaultValue: 'No other offices are published for this election yet.' })}
      </p>
    );
  }
  const reset = () => setShown(PAGE);

  return (
    <div className="el-stack">
      <div className="el-measure__stats">
        <div className="el-box el-proj el-measure__stat" style={{ margin: 0 }}>
          <span className="el-stat__n" style={{ fontSize: 40 }}>{stats.total}</span>
          <span className="el-stat__l">{t('office.sTotal', { defaultValue: 'other races' })}</span>
        </div>
        <div className="el-box el-proj el-measure__stat" style={{ margin: 0 }}>
          <span className="el-stat__n" style={{ fontSize: 40 }}>{stats.statewide} / {stats.local}</span>
          <span className="el-stat__l">{t('measures.sSplit', { defaultValue: 'statewide / local' })}</span>
        </div>
        <div className="el-box el-proj el-measure__stat" style={{ margin: 0 }}>
          <span className="el-stat__n" style={{ fontSize: 40 }}>{stats.called}</span>
          <span className="el-stat__l">{t('office.sCalled', { defaultValue: 'called' })}</span>
        </div>
        <div className="el-box el-proj el-measure__stat" style={{ margin: 0 }}>
          <span className="el-stat__n" style={{ fontSize: 40 }}>{stats.flips}</span>
          <span className="el-stat__l">{t('office.sFlips', { defaultValue: 'flips' })}</span>
        </div>
      </div>

      <div className="el-pick-row" role="group" aria-label={t('office.filters', { defaultValue: 'Filter offices' })}>
        {(['all', 'statewide', 'local'] as const).map((s) => (
          <button key={s} type="button" className="el-btn el-btn--sm" aria-pressed={scope === s} onClick={() => { setScope(s); reset(); }}>
            {s === 'all' ? t('measures.fAll', { defaultValue: 'All' }) : s === 'statewide' ? t('measures.statewide', { defaultValue: 'Statewide' }) : t('measures.local', { defaultValue: 'Local' })}
          </button>
        ))}
        <label className="el-sr" htmlFor="el-office-kind">{t('office.fOffice', { defaultValue: 'Office' })}</label>
        <select id="el-office-kind" className="el-input" value={office} onChange={(e) => { setOffice(e.target.value); reset(); }} style={{ minHeight: 36 }}>
          <option value="all">{t('office.allOffices', { defaultValue: 'All offices' })}</option>
          {stats.byOffice.map((o) => (
            <option key={o.office} value={o.office}>{o.office} ({o.count})</option>
          ))}
        </select>
        <label className="el-sr" htmlFor="el-office-state">{t('measures.fState', { defaultValue: 'State' })}</label>
        <select id="el-office-state" className="el-input" value={state} onChange={(e) => { setState(e.target.value); reset(); }} style={{ minHeight: 36 }}>
          <option value="all">{t('measures.allStates', { defaultValue: 'All states' })}</option>
          {states.map((c) => (
            <option key={c} value={c}>{stateName(c)}</option>
          ))}
        </select>
        <label className="el-sr" htmlFor="el-office-q">{t('office.fSearch', { defaultValue: 'Search offices and candidates' })}</label>
        <input id="el-office-q" className="el-input" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder={t('office.searchPh', { defaultValue: 'Search: mayor, attorney general, a name…' })} style={{ minHeight: 36, flex: 1, minWidth: 140 }} />
        {follow.states.length ? (
          <button type="button" className="el-btn el-btn--sm" aria-pressed={mine} onClick={() => { setMine((v) => !v); reset(); }}>
            {t('measures.mine', { defaultValue: 'My states' })}
          </button>
        ) : null}
      </div>

      <p className="el-eyebrow" role="status">{t('office.count', { defaultValue: '{{n}} races', n: rows.length })}</p>
      <div className="el-measure__grid">
        {rows.slice(0, shown).map((r) => (
          <OfficeCard key={r.id} r={r} />
        ))}
      </div>
      {rows.length > shown ? (
        <button type="button" className="el-btn" onClick={() => setShown((n) => n + PAGE)}>
          {t('measures.showMore', { defaultValue: 'Show more' })}
        </button>
      ) : null}
    </div>
  );
}
