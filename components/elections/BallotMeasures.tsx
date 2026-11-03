import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { filterMeasures, measureStats, type BallotMeasure } from '@/lib/elections/measures';
import { STATE_CODES, stateName } from '@/lib/elections/states';
import { fmtInt } from './hooks';
import { useFollow } from './FollowContext';

const PAGE = 18;

function useMeasures(cycle: string, live: boolean) {
  return useQuery<{ measures: BallotMeasure[]; updatedAt: string }>({
    queryKey: ['elections-measures', cycle],
    queryFn: async () => {
      const r = await fetch(`/api/elections/measures?cycle=${encodeURIComponent(cycle)}`);
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    refetchInterval: live ? 30_000 : 10 * 60_000,
    staleTime: 15_000,
    retry: 1,
  });
}

function MeasureCard({ m }: { m: BallotMeasure }) {
  const { t } = useTranslation('c-elections');
  const [open, setOpen] = useState(false);
  const verdict =
    m.status === 'called'
      ? m.outcome === 'yes'
        ? t('measures.passes', { defaultValue: 'Passes' })
        : t('measures.fails', { defaultValue: 'Fails' })
      : m.status === 'counting'
        ? m.passing
          ? t('measures.passing', { defaultValue: 'Passing' })
          : t('measures.failing', { defaultValue: 'Failing' })
        : t('measures.awaiting', { defaultValue: 'Awaiting polls' });
  const started = m.totalVotes > 0;
  return (
    <article className="el-measure el-box" aria-label={m.title}>
      <header className="el-measure__head">
        <div>
          <h3 className="el-race__label">{m.title}</h3>
          <p className="el-eyebrow" style={{ margin: '4px 0 0' }}>
            {m.scope === 'local' ? `${m.place}, ${m.state}` : m.stateName}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <span className="el-chip el-chip--ink">{m.scope === 'local' ? t('measures.local', { defaultValue: 'Local' }) : t('measures.statewide', { defaultValue: 'Statewide' })}</span>
          <span className="el-chip">{m.kind}</span>
        </div>
      </header>

      {m.summary ? (
        <p className={open ? 'el-measure__summary' : 'el-measure__summary el-measure__summary--clamp'}>
          {m.summary}
        </p>
      ) : null}
      {m.summary && m.summary.length > 140 ? (
        <button type="button" className="el-linkbtn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? t('measures.less', { defaultValue: 'Less' }) : t('measures.more', { defaultValue: 'Read more' })}
        </button>
      ) : null}

      <div className="el-measure__bars" role="img" aria-label={t('measures.barAria', { defaultValue: 'Yes {{y}}%, No {{n}}%', y: m.yes.pct, n: m.no.pct })}>
        <div className="el-measure__bar">
          <i className="el-measure__yes" style={{ width: `${started ? m.yes.pct : 0}%` }} />
          <i className="el-measure__no" style={{ width: `${started ? m.no.pct : 0}%` }} />
          {m.threshold > 50 ? (
            <b className="el-measure__mark" style={{ left: `${m.threshold}%` }} title={t('measures.needs', { defaultValue: 'Needs {{n}}% to pass', n: m.threshold })} />
          ) : null}
        </div>
        <div className="el-measure__nums">
          <span>
            <strong>{t('measures.yes', { defaultValue: 'Yes' })}</strong> {started ? `${m.yes.pct}%` : '—'}
            {started ? <small className="el-eyebrow"> · {fmtInt(m.yes.votes)}</small> : null}
          </span>
          <span>
            <strong>{t('measures.no', { defaultValue: 'No' })}</strong> {started ? `${m.no.pct}%` : '—'}
            {started ? <small className="el-eyebrow"> · {fmtInt(m.no.votes)}</small> : null}
          </span>
        </div>
      </div>

      <footer className="el-race__foot">
        <span className={`el-chip ${m.status === 'called' ? (m.outcome === 'yes' ? 'el-chip--dem' : 'el-chip--gop') : ''}`}>{verdict}</span>
        <span className="el-eyebrow">
          {m.threshold > 50 ? `${t('measures.needs', { defaultValue: 'Needs {{n}}% to pass', n: m.threshold })} · ` : ''}
          {m.pctReporting != null ? t('measures.reporting', { defaultValue: '{{pct}}% in', pct: Math.round(m.pctReporting) }) : null}
        </span>
      </footer>
    </article>
  );
}

/** Statewide and local ballot measures: live yes/no counts, what each needs to pass, and the night's tallies. */
export function BallotMeasures({ cycle, live }: { cycle: string; live: boolean }) {
  const { t } = useTranslation('c-elections');
  const { data, isLoading, isError } = useMeasures(cycle, live);
  const follow = useFollow();
  const [scope, setScope] = useState<'all' | 'statewide' | 'local'>('all');
  const [state, setState] = useState<string>('all');
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const all = useMemo(() => data?.measures ?? [], [data]);
  const stats = useMemo(() => measureStats(all), [all]);
  const states = useMemo(() => STATE_CODES.filter((c) => all.some((m) => m.state === c)), [all]);
  const rows = useMemo(() => {
    const f = filterMeasures(all, { scope, state, q });
    return mine && follow.states.length ? f.filter((m) => follow.states.includes(m.state)) : f;
  }, [all, scope, state, q, mine, follow.states]);

  if (isLoading) return <div className="el-box el-skel" aria-busy />;
  if (isError || !all.length) {
    return (
      <p className="el-eyebrow">
        {isError
          ? t('measures.error', { defaultValue: 'Ballot measures are unavailable right now.' })
          : t('measures.none', { defaultValue: 'No ballot measures are published for this election yet.' })}
      </p>
    );
  }

  const stat = (n: number | string, label: string) => (
    <div className="el-box el-proj el-measure__stat" style={{ margin: 0 }}>
      <span className="el-stat__n" style={{ fontSize: 40 }}>{n}</span>
      <span className="el-stat__l">{label}</span>
    </div>
  );

  return (
    <div className="el-stack">
      <div className="el-measure__stats">
        {stat(stats.total, t('measures.sTotal', { defaultValue: 'measures on ballots' }))}
        {stat(`${stats.statewide} / ${stats.local}`, t('measures.sSplit', { defaultValue: 'statewide / local' }))}
        {stat(stats.states, t('measures.sStates', { defaultValue: 'states' }))}
        {stat(`${stats.passed} – ${stats.failed}`, t('measures.sCalled', { defaultValue: 'passed – failed (called)' }))}
        {stat(`${stats.passing} – ${stats.failing}`, t('measures.sNow', { defaultValue: 'passing – failing now' }))}
        {stat(stats.supermajority, t('measures.sSuper', { defaultValue: 'need a supermajority' }))}
      </div>

      {stats.closest.length ? (
        <div className="el-box el-proj" style={{ margin: 0 }}>
          <p className="el-eyebrow" style={{ margin: '0 0 8px' }}>{t('measures.closest', { defaultValue: 'Closest measures' })}</p>
          <ul className="el-desk__list" style={{ margin: 0 }}>
            {stats.closest.map((m) => (
              <li key={m.id}>
                {m.title} <span className="el-eyebrow">· {m.stateName} · {m.yes.pct}–{m.no.pct}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="el-pick-row" role="group" aria-label={t('measures.filters', { defaultValue: 'Filter measures' })}>
        {(['all', 'statewide', 'local'] as const).map((s) => (
          <button key={s} type="button" className="el-btn el-btn--sm" aria-pressed={scope === s} onClick={() => { setScope(s); setShown(PAGE); }}>
            {s === 'all' ? t('measures.fAll', { defaultValue: 'All' }) : s === 'statewide' ? t('measures.statewide', { defaultValue: 'Statewide' }) : t('measures.local', { defaultValue: 'Local' })}
          </button>
        ))}
        <label className="el-sr" htmlFor="el-measure-state">{t('measures.fState', { defaultValue: 'State' })}</label>
        <select id="el-measure-state" className="el-input" value={state} onChange={(e) => { setState(e.target.value); setShown(PAGE); }} style={{ minHeight: 36 }}>
          <option value="all">{t('measures.allStates', { defaultValue: 'All states' })}</option>
          {states.map((c) => (
            <option key={c} value={c}>{stateName(c)}</option>
          ))}
        </select>
        <label className="el-sr" htmlFor="el-measure-q">{t('measures.fSearch', { defaultValue: 'Search measures' })}</label>
        <input id="el-measure-q" className="el-input" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder={t('measures.searchPh', { defaultValue: 'Search: marijuana, tax, Fresno…' })} style={{ minHeight: 36, flex: 1, minWidth: 140 }} />
        {follow.states.length ? (
          <button type="button" className="el-btn el-btn--sm" aria-pressed={mine} onClick={() => { setMine((v) => !v); setShown(PAGE); }}>
            {t('measures.mine', { defaultValue: 'My states' })}
          </button>
        ) : null}
      </div>

      <p className="el-eyebrow" role="status">{t('measures.count', { defaultValue: '{{n}} measures', n: rows.length })}</p>
      <div className="el-measure__grid">
        {rows.slice(0, shown).map((m) => (
          <MeasureCard key={m.id} m={m} />
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
