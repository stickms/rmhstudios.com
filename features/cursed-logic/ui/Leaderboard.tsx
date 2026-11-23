/** The global top ten, as a terminal table. Refetches when `refreshKey` changes (after a submit). */
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import type { CursedLogicBoardRow } from '@features/cursed-logic/engine/cursed-logic.contract';
import { loadBoard } from '@features/cursed-logic/net/runs';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

export function Leaderboard({ refreshKey = 0 }: { refreshKey?: number }) {
  const { t } = useTranslation('c-cursed-logic');
  const fmt = useLocaleFormat();
  const [rows, setRows] = useState<CursedLogicBoardRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadBoard()
      .then((entries) => {
        if (live) setRows(entries);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [refreshKey]);

  return (
    <section className="cl-window">
      <div className="cl-window-title">{t('board-title', { defaultValue: 'ROOT LOG :: TOP RUNS' })}</div>
      <div className="px-3 py-2 text-[0.72rem]">
        {failed ? (
          <p className="cl-muted">{t('board-offline', { defaultValue: 'The board is unreachable right now.' })}</p>
        ) : rows === null ? (
          <p className="cl-muted">{t('board-loading', { defaultValue: 'Reading the log…' })}</p>
        ) : rows.length === 0 ? (
          <p className="cl-muted">{t('board-empty', { defaultValue: 'No runs logged yet. Be the first.' })}</p>
        ) : (
          <table className="w-full tabular-nums">
            <thead>
              <tr className="cl-muted text-left">
                <th className="font-normal py-1">#</th>
                <th className="font-normal">{t('board-player', { defaultValue: 'Player' })}</th>
                <th className="font-normal text-right">{t('board-reach', { defaultValue: 'Reached' })}</th>
                <th className="font-normal text-right">{t('board-score', { defaultValue: 'Score' })}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rank} className="border-t border-dashed border-[#3b2a5c]">
                  <td className="py-1 cl-violet">{r.rank}</td>
                  <td className="truncate max-w-[9rem]">{r.username}</td>
                  <td className="text-right cl-muted">
                    {r.victory
                      ? t('board-root', { defaultValue: 'ROOT' })
                      : t('board-sector', { defaultValue: 'S{{n}}', n: r.sector })}
                    {r.pacts > 0 ? ` +${r.pacts}` : ''}
                  </td>
                  <td className="text-right cl-acid">{fmt.number(r.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
