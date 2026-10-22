import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { swissTable } from '@/lib/tournaments/swiss-flow';
import type { SerializedTournament } from '@/lib/tournaments/tournament.server';

/** Live Swiss standings (points, Buchholz) derived from the match list. */
export function SwissStandings({ tournament }: { tournament: SerializedTournament }) {
  const { t } = useTranslation('f-competitive');
  const rows = useMemo(() => {
    const entrants = [...(tournament.entrants ?? [])].sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
    const names = new Map(entrants.map((e) => [e.id, e.user?.name ?? '?']));
    return swissTable(
      entrants.map((e) => e.id),
      tournament.matches ?? [],
    ).map((s, i) => ({ ...s, rank: i + 1, name: names.get(s.id) ?? '?' }));
  }, [tournament.entrants, tournament.matches]);

  if (rows.length === 0) return null;
  const done = Math.max(0, ...(tournament.matches ?? []).map((m) => m.round));
  return (
    <div>
      <h2 className="site-section-label mb-2">
        {t('swiss-standings', { defaultValue: 'Standings' })}
        {tournament.swissRounds ? ` · ${done}/${tournament.swissRounds}` : ''}
      </h2>
      <div className="glass-fill rounded-site overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-site-text-dim uppercase tracking-wide">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">{t('swiss-player', { defaultValue: 'Player' })}</th>
              <th className="px-3 py-2 text-right">{t('swiss-points', { defaultValue: 'Pts' })}</th>
              <th
                className="px-3 py-2 text-right"
                title={t('swiss-buchholz-hint', {
                  defaultValue: 'Sum of your opponents’ points — the first tiebreak',
                })}
              >
                {t('swiss-buchholz', { defaultValue: 'Buchholz' })}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-site-border">
                <td className="px-3 py-1.5 text-site-text-dim">{r.rank}</td>
                <td className="px-3 py-1.5 truncate max-w-[14rem]">
                  {r.name}
                  {r.hadBye && (
                    <span className="ml-2 text-xs text-site-text-dim">
                      {t('swiss-had-bye', { defaultValue: 'had a bye' })}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right font-medium">{r.points}</td>
                <td className="px-3 py-1.5 text-right text-site-text-dim">{r.buchholz}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The Swiss entry in the create-tournament format picker. */
export function SwissFormatOption() {
  const { t } = useTranslation('f-competitive');
  return (
    <option value="SWISS">
      {t('swiss-format', { defaultValue: 'Swiss (everyone plays every round)' })}
    </option>
  );
}

export function SwissLabel() {
  const { t } = useTranslation('f-competitive');
  return <>{t('swiss-short', { defaultValue: 'Swiss' })}</>;
}
