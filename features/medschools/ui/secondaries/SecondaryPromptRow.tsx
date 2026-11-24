import { useTranslation } from 'react-i18next';
import type { MedSecondaryPromptDto } from '../../medschools.contract';
import type { SecondaryLabels } from './labels';
import { useCycleRangeText } from './useCycleRangeText';

/**
 * One prompt on a rule (R3). Presentational: the data and the wording come in as props, it fetches nothing. The prompt is
 * the text style; beneath it, one muted line of the limit, the optional flag and the year-over-year mark, one of the cycles it
 * was seen in and its themes, and one of where it was read. A reworded prompt shows last cycle's wording. Nothing here
 * takes input: no draft is stored anywhere.
 */
export function SecondaryPromptRow({
  prompt,
  labels,
  schoolName,
  showStatus,
}: {
  prompt: MedSecondaryPromptDto;
  labels: SecondaryLabels;
  schoolName: string;
  showStatus: boolean;
}) {
  const { t } = useTranslation('medschools');
  const cycleText = useCycleRangeText();
  const facts = [
    prompt.limit ? (
      <span key="limit" className="font-mono">
        {labels.limit(prompt.limit)}
      </span>
    ) : null,
    prompt.optional ? <span key="optional">{labels.optional}</span> : null,
    showStatus && prompt.status ? <span key="status">{labels.status(prompt.status)}</span> : null,
  ].filter((x) => x !== null);
  const sources = prompt.sources.map((s) => labels.sourceName(s, schoolName)).join(', ');
  return (
    <li>
      <p className="medapp-text">{prompt.text}</p>
      {facts.length > 0 ? <p className="medapp-meta medapp-facts">{facts}</p> : null}
      {showStatus && prompt.status === 'reworded' && prompt.previousText ? (
        <p className="medapp-meta">
          {t('secondaries-previous', { defaultValue: 'Last cycle: {{text}}', text: prompt.previousText })}
        </p>
      ) : null}
      <p className="medapp-meta">
        {t('secondaries-seen', { defaultValue: 'Seen in {{cycles}}', cycles: cycleText(prompt.cycles) })}
        {prompt.themes.length > 0 ? ` · ${prompt.themes.map((id) => labels.theme(id)).join(' · ')}` : ''}
      </p>
      <p className="medapp-meta">
        {t('secondaries-row-checked', {
          defaultValue: '{{sources}}, checked {{date}}',
          sources,
          date: labels.date(prompt.lastCheckedAt),
        })}
      </p>
    </li>
  );
}
