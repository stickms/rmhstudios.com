import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { formatUtcDay } from '../../engine/public-read';
import type { MedAskCitationDto } from '../../medschools.contract';

/** Labels the server writes for a figure that comes from a source's counts: their time is the source's last refresh. */
const COUNT_LABELS: ReadonlySet<string> = new Set(['Applicant statistics', 'Reported events', 'Cycle history']);

/** The anchor a segment's "Sources" link points at. */
export const citeId = (n: number) => `cite-${n}`;

/**
 * The rows an answer used, numbered in the order the response lists them. Rows on rules (R3), no box. Each row names
 * what it is, where it came from, when that source was last refreshed (a count) or updated (a profile, a question, a
 * forecast), and links to the page that shows the figure and, where RMH knows one, to the source's own page.
 */
export function Citations({
  citations,
  schools,
}: {
  citations: readonly MedAskCitationDto[];
  schools: readonly { slug: string; shortName: string }[];
}) {
  const { t } = useTranslation('medschools');
  const { locale } = useLocaleFormat();
  if (citations.length === 0) return null;

  // Dates sit in an isolate so a right-to-left sentence does not reorder them.
  const day = (iso: string) =>
    `⁨${formatUtcDay(iso.slice(0, 10), locale, { year: 'numeric', month: 'short', day: 'numeric' })}⁩`;

  const labelText = (label: string): string => {
    switch (label) {
      case 'Applicant statistics':
        return t('ask-label-stats', { defaultValue: 'Applicant statistics' });
      case 'Interview profile':
        return t('ask-label-profile', { defaultValue: 'Interview profile' });
      case 'Interview question':
        return t('ask-label-question', { defaultValue: 'Interview question' });
      case 'Reported events':
        return t('ask-label-events', { defaultValue: 'Reported events' });
      case 'Cycle history':
        return t('ask-label-history', { defaultValue: 'Cycle history' });
      case 'Forecast':
        return t('ask-label-forecast', { defaultValue: 'Forecast' });
      default:
        return label;
    }
  };

  return (
    <section className="mt-6" aria-labelledby="ask-sources-heading">
      <h3 id="ask-sources-heading" className="medapp-label">
        {t('ask-sources-heading', { defaultValue: 'Sources' })}
      </h3>
      <ol className="medapp-list mt-1">
        {citations.map((c, i) => {
          const n = i + 1;
          const school = schools.find((s) => s.slug === c.schoolSlug)?.shortName ?? null;
          const when = c.updatedAt
            ? COUNT_LABELS.has(c.label)
              ? t('ask-source-refreshed', { defaultValue: 'source refreshed {{date}}', date: day(c.updatedAt) })
              : t('ask-source-updated', { defaultValue: 'updated {{date}}', date: day(c.updatedAt) })
            : t('ask-source-unknown', { defaultValue: 'update time unknown' });
          return (
            <li key={c.ref} id={citeId(n)}>
              <p className="medapp-text font-medium">
                <span className="medapp-meta">{n}</span> {labelText(c.label)}
              </p>
              <p className="medapp-meta mt-1 wrap-anywhere">
                {[school, c.sourceName, when].filter(Boolean).join(' · ')}
              </p>
              <p className="medapp-text mt-1 flex flex-wrap gap-x-4">
                <Link to={c.href as never} className="inline-flex items-center underline pointer-coarse:min-h-11">
                  {t('ask-source-open', { defaultValue: 'Open on RMH' })}
                </Link>
                {c.sourceHref ? (
                  <a
                    href={c.sourceHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center underline pointer-coarse:min-h-11"
                  >
                    {t('ask-source-external', { defaultValue: 'View at {{source}}', source: c.sourceName })}
                  </a>
                ) : null}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
