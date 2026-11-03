import { useTranslation } from 'react-i18next';
import type { Race } from '@/lib/elections/types';
import { fmtMargin, signedMargin } from '@/lib/elections/swing';
import { nailBiters } from '@/lib/elections/watch';

/** Too close to call: counting races with a thin lead, closest first. */
export function NailBiters({ races, onSelectState }: { races: Race[]; onSelectState: (postal: string) => void }) {
  const { t } = useTranslation('c-elections');
  const rows = nailBiters(races);
  if (!rows.length) return null;
  return (
    <section aria-label={t('nail.aria', { defaultValue: 'Nail-biters' })}>
      <p className="el-eyebrow" style={{ margin: '0 0 10px' }}>
        {t('nail.title', { defaultValue: 'Nail-biters — too close to call' })}
      </p>
      <ul className="el-desk__list el-box el-proj" style={{ margin: 0 }}>
        {rows.map((r) => {
          const lead = r.candidates.find((c) => c.leader) ?? r.candidates[0];
          const m = signedMargin(r);
          return (
            <li key={r.id}>
              <button type="button" className="el-linkbtn" onClick={() => onSelectState(r.state)}>
                {r.label}
              </button>{' '}
              <span className="el-eyebrow">
                {lead ? `${lead.lastName} ` : ''}
                {m != null ? fmtMargin(m) : ''} · {Math.round(r.pctReporting ?? 0)}% {t('nail.in', { defaultValue: 'in' })}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
