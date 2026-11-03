import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fmtInt } from './hooks';

/** The slice of GET /api/elections/markets this panel reads. */
interface Market {
  id: string;
  title: string;
  status: 'OPEN' | 'RESOLVED_YES' | 'RESOLVED_NO' | string;
  yesPercent: number;
  volume: number;
  closesAt: string | null;
  subjectUrl: string | null;
}

/**
 * The coin markets on this election, with live implied odds. Trading happens on
 * /predictions (one market UI on the site); this is the shop window.
 */
export function MarketsPanel({ cycle }: { cycle: string }) {
  const { t } = useTranslation('c-elections');
  const { data } = useQuery<{ markets: Market[] }>({
    queryKey: ['elections-markets', cycle],
    queryFn: async () => {
      const r = await fetch('/api/elections/markets');
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: 1,
  });

  const markets = (data?.markets ?? []).filter((m) => m.subjectUrl?.includes(`cycle=${cycle}`));

  if (!markets.length) {
    return (
      <p className="el-eyebrow">
        {t('markets.none', { defaultValue: 'Markets open a few weeks before Election Day.' })}
      </p>
    );
  }

  return (
    <div>
      <div className="el-cards">
        {markets.map((m) => {
          const resolved = m.status === 'RESOLVED_YES' || m.status === 'RESOLVED_NO';
          return (
            <article key={m.id} className="el-race el-box" aria-label={m.title}>
              <h3 className="el-race__label" style={{ fontSize: 18 }}>{m.title}</h3>
              <div className="el-race__cand">
                <span className="el-race__name">
                  <strong>{t('markets.yes', { defaultValue: 'Yes' })}</strong>
                </span>
                <span className="el-race__pct">{m.yesPercent}%</span>
                <div className="el-bar2 el-bar2--DEM" aria-hidden>
                  <i style={{ width: `${m.yesPercent}%` }} />
                </div>
              </div>
              <footer className="el-race__foot">
                <span>
                  {resolved
                    ? m.status === 'RESOLVED_YES'
                      ? t('markets.settledYes', { defaultValue: 'Settled: Yes' })
                      : t('markets.settledNo', { defaultValue: 'Settled: No' })
                    : t('markets.vol', { defaultValue: '{{n}} coins traded', n: fmtInt(m.volume) })}
                </span>
                {resolved ? null : (
                  <Link className="el-btn el-btn--sm el-btn--pink" to="/predictions">
                    {t('markets.trade', { defaultValue: 'Trade' })}
                  </Link>
                )}
              </footer>
            </article>
          );
        })}
      </div>
      <p className="el-eyebrow" style={{ marginTop: 16 }}>
        {t('markets.rules', {
          defaultValue:
            'Coins only. Trading closes at noon ET on Election Day and markets settle automatically from the results feed the next day.',
        })}
      </p>
    </div>
  );
}
