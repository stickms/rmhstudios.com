import { useTranslation } from 'react-i18next';
import { cycleLabelIsolated } from '../../engine/cycle';
import type { MedAskRes } from '../../medschools.contract';
import { Citations, citeId } from './Citations';
import { MyChance } from './MyChance';

/**
 * What the member reads after a question. Each kept sentence is a row on a rule with the numbers of the sources it
 * cites (R3); the figures are the response's own text, untouched. The wording around it (a removed-statement notice,
 * an empty state, the schools used) is the only copy added here. `mine` renders whatever the notice says, so a thin
 * answer still shows the member's own estimate. The panel wraps it in `useArrival` (M9): it replaces a skeleton.
 */
export function AnswerView({ res }: { res: MedAskRes }) {
  const { t } = useTranslation('medschools');
  const numberOf = new Map(res.citations.map((c, i) => [c.ref, i + 1] as const));

  const empty = (() => {
    if (res.segments.length > 0) return null;
    if (res.status === 'no-school' || res.decline === 'name-a-school')
      return t('ask-empty-no-school', { defaultValue: 'Name a school, or ask from its page.' });
    if (res.status === 'declined' || res.decline === 'out-of-scope')
      return t('ask-empty-declined', {
        defaultValue: 'I answer questions about reported admissions data. I cannot estimate your chance of admission.',
      });
    if (res.decline === 'ungrounded')
      return t('ask-empty-ungrounded', {
        defaultValue: 'I could not match an answer to RMH data. Try a question about one school’s figures.',
      });
    // `mine` can be the whole answer (a my-chance question with no public data to add).
    if (res.mine !== null) return null;
    return t('ask-empty-no-data', { defaultValue: 'RMH has no data for this question.' });
  })();

  const notice =
    res.notice === 'removed-ungrounded'
      ? t('ask-notice-removed', {
          defaultValue: 'Some statements were removed because their figures could not be matched to the data.',
        })
      : res.notice === 'thin'
        ? t('ask-notice-thin', { defaultValue: 'RMH has little data on this yet, so the answer may be incomplete.' })
        : null;

  const used =
    res.schools.length > 0
      ? res.cycleYear !== null
        ? t('ask-used-cycle', {
            defaultValue: 'Based on {{schools}} · {{cycle}}',
            schools: res.schools.map((s) => s.shortName).join(', '),
            cycle: cycleLabelIsolated(res.cycleYear),
          })
        : t('ask-used', {
            defaultValue: 'Based on {{schools}}',
            schools: res.schools.map((s) => s.shortName).join(', '),
          })
      : null;

  return (
    <div data-ask-status={res.status} data-testid="ask-answer">
      {res.segments.length > 0 ? (
        <ol className="m-0 list-none border-t border-site-border p-0">
          {res.segments.map((seg, i) => {
            const nums = [...new Set(seg.cites.flatMap((r) => numberOf.get(r) ?? []))].sort((a, b) => a - b);
            return (
              <li key={i} className="border-b border-site-border py-3">
                <p className="t-post m-0" dir="auto">
                  {seg.text}
                </p>
                {nums.length > 0 ? (
                  <p className="t-meta m-0 mt-1 flex flex-wrap items-center gap-x-1">
                    <span>{t('ask-segment-sources', { defaultValue: 'Sources:' })}</span>
                    {nums.map((n) => (
                      <a
                        key={n}
                        href={`#${citeId(n)}`}
                        aria-label={t('ask-segment-source-n', { defaultValue: 'Source {{n}}', n })}
                        className="inline-flex items-center justify-center underline pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                      >
                        {n}
                      </a>
                    ))}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
      {empty ? <p className="t-body m-0 py-3">{empty}</p> : null}
      {notice ? <p className="t-meta m-0 mt-2">{notice}</p> : null}
      {used ? <p className="t-meta m-0 mt-1">{used}</p> : null}
      {res.mine !== null ? <MyChance mine={res.mine} /> : null}
      <Citations citations={res.citations} schools={res.schools} />
    </div>
  );
}
