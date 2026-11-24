import { useTranslation } from 'react-i18next';
import { BookOpen } from 'lucide-react';
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
  // A compact row: the word "Sources", then each source as a short icon link; the full attribution line is each link's
  // accessible name, so a reader of the page and a screen reader get the same "Source: …".
  return (
    <p className="medapp-sourcelinks">
      <span>{t('sources-label', { defaultValue: 'Sources' })}</span>
      {shown.map((l) => {
        const full =
          l.scope === 'summary'
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
              : t('source-line', { defaultValue: 'Source: {{name}}', name: SOURCE_NAMES[l.source] });
        const short =
          l.scope === 'summary'
            ? t('source-short-summary', { defaultValue: '{{name}} feedback', name: SOURCE_NAMES[l.source] })
            : l.cycleYear !== null
              ? t('source-short-cycle', {
                  defaultValue: '{{name}} {{year}}',
                  name: SOURCE_NAMES[l.source],
                  year: String(l.cycleYear),
                })
              : SOURCE_NAMES[l.source];
        return (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="medapp-sourcelink"
            aria-label={full}
            title={full}
          >
            <BookOpen aria-hidden="true" className="size-3.5" />
            {short}
          </a>
        );
      })}
    </p>
  );
}
