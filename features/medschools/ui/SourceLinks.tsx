import { useTranslation } from 'react-i18next';
import { SOURCE_NAMES } from '../engine/public-read';
import type { SourceLinkDto } from '../medschools.contract';

/**
 * "Source: Student Doctor Network" lines, each a link to the school's page or thread on that source (D11, O3).
 * `cycleYear` keeps the links of that cycle and the cycle-less ones (a school page, the summary page).
 */
export function SourceLinks({ links, cycleYear }: { links: SourceLinkDto[]; cycleYear?: number }) {
  const { t } = useTranslation('medschools');
  const shown = links.filter((l) => cycleYear === undefined || l.cycleYear === null || l.cycleYear === cycleYear);
  if (shown.length === 0) return null;
  return (
    <ul className="medapp-list medapp-list--plain">
      {shown.map((l) => (
        <li key={l.href} className="medapp-meta">
          <a href={l.href} target="_blank" rel="noopener noreferrer" className="medapp-link">
            {l.scope === 'summary'
              ? t('source-line-summary', {
                  defaultValue: 'Source: {{name}}, interview feedback',
                  name: SOURCE_NAMES[l.source],
                })
              : l.cycleYear !== null
                ? t('source-line-cycle', {
                    defaultValue: 'Source: {{name}}, {{year}} cycle',
                    name: SOURCE_NAMES[l.source],
                    year: String(l.cycleYear),
                  })
                : t('source-line', { defaultValue: 'Source: {{name}}', name: SOURCE_NAMES[l.source] })}
          </a>
        </li>
      ))}
    </ul>
  );
}
