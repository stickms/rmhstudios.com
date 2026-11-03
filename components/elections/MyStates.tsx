import { useTranslation } from 'react-i18next';
import type { Race } from '@/lib/elections/types';
import { fmtMargin, signedMargin } from '@/lib/elections/swing';
import { stateName } from '@/lib/elections/states';
import { useFollow } from './FollowContext';

/** The viewer's followed states at a glance: every race in each, with its status. */
export function MyStates({ races, onSelectState }: { races: Race[]; onSelectState: (postal: string) => void }) {
  const { t } = useTranslation('c-elections');
  const { states, toggle } = useFollow();
  if (!states.length) return null;
  return (
    <section aria-label={t('mine.title', { defaultValue: 'My states' })}>
      <p className="el-eyebrow" style={{ margin: '0 0 10px' }}>
        {t('mine.title', { defaultValue: 'My states' })}
      </p>
      <div className="el-watch__grid">
        {states.map((s) => {
          const rs = races.filter((r) => r.state === s).slice(0, 6);
          return (
            <div key={s} className="el-box el-proj" style={{ margin: 0 }}>
              <h3 className="el-drawer__title" style={{ fontSize: 22 }}>
                <button type="button" className="el-linkbtn" onClick={() => onSelectState(s)}>{stateName(s)}</button>{' '}
                <button type="button" className="el-btn el-btn--sm el-btn--ghost" onClick={() => toggle(s)} aria-label={t('mine.unfollow', { defaultValue: 'Stop following {{state}}', state: stateName(s) })}>×</button>
              </h3>
              {rs.length ? (
                <ul className="el-desk__list" style={{ margin: 0 }}>
                  {rs.map((r) => {
                    const lead = r.candidates.find((c) => c.won) ?? r.candidates.find((c) => c.leader);
                    const m = signedMargin(r);
                    return (
                      <li key={r.id}>
                        {r.label.replace(`${stateName(s)}`, '').replace(/\s·\s*$/, '')}
                        <span className="el-eyebrow" style={{ display: 'block' }}>
                          {r.status === 'called'
                            ? t('mine.called', { defaultValue: 'Called: {{who}}', who: lead ? `${lead.lastName} (${lead.party})` : '' })
                            : r.status === 'counting'
                              ? `${lead ? lead.lastName : ''} ${m != null ? fmtMargin(m) : ''} · ${Math.round(r.pctReporting ?? 0)}%`
                              : t('mine.awaiting', { defaultValue: 'Awaiting polls' })}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="el-eyebrow">{t('mine.none', { defaultValue: 'No federal or governor race here this year.' })}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
