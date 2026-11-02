import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PollClosing } from '@/lib/elections/types';
import { stateName } from '@/lib/elections/states';

/** Polls-close schedule: one row per closing hour (Eastern), states as chips. */
export function PollClosings({
  closings,
  now,
  onSelectState,
}: {
  closings: Record<string, PollClosing>;
  now: Date | null;
  onSelectState: (postal: string) => void;
}) {
  const { t } = useTranslation('c-elections');
  const rows = useMemo(() => {
    const by = new Map<string, { iso: string; display: string; states: string[] }>();
    for (const [postal, c] of Object.entries(closings)) {
      const row = by.get(c.iso) ?? { iso: c.iso, display: c.displayET, states: [] };
      row.states.push(postal);
      by.set(c.iso, row);
    }
    return [...by.values()]
      .sort((a, b) => a.iso.localeCompare(b.iso))
      .map((r) => ({ ...r, states: r.states.sort() }));
  }, [closings]);

  if (!rows.length) {
    return (
      <p className="el-eyebrow">
        {t('closings.none', { defaultValue: 'Poll-closing times appear once the ballots are certified for this cycle.' })}
      </p>
    );
  }

  return (
    <div className="el-closings">
      {rows.map((r) => {
        const past = now != null && new Date(r.iso).getTime() <= now.getTime();
        return (
          <div className="el-closing" key={r.iso} data-past={past}>
            <div className="el-closing__t">
              <span>
                {r.display}
                <br />
                <small className="el-eyebrow">{past ? t('closings.closed', { defaultValue: 'closed' }) : 'ET'}</small>
              </span>
            </div>
            <div className="el-closing__states">
              {r.states.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="el-btn el-btn--sm el-btn--ghost"
                  title={stateName(s)}
                  onClick={() => onSelectState(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
