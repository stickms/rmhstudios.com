import { useTranslation } from 'react-i18next';
import { silenceOf } from '../../engine/timeline';
import type { ChanceDto } from '../../medschools.contract';

/**
 * The silence check for one application that is complete with no invite and no closing decision: the weeks since
 * complete, set beside when invites tracked for this school came. Factual, never advice. A school with no shared curve
 * says so instead of guessing. Renders nothing when the check does not apply.
 */
export function SilenceLine({ chance }: { chance: ChanceDto | undefined }) {
  const { t } = useTranslation('medschools');
  const s = silenceOf(chance);
  if (!s) return null;

  const waited =
    s.weeks === 0
      ? t('silence-waited-zero', { defaultValue: 'No reply yet: less than a week since complete.' })
      : t('silence-waited', {
          count: s.weeks,
          n: s.weeks,
          defaultValue_one: 'No reply yet: {{n}} week since complete.',
          defaultValue_other: 'No reply yet: {{n}} weeks since complete.',
          defaultValue: 'No reply yet: {{n}} weeks since complete.',
        });

  const lines: string[] = [];
  if (s.kind === 'thin') {
    lines.push(t('silence-thin', { defaultValue: 'Not enough shared data for this school yet.' }));
  } else if (s.kind === 'silent') {
    lines.push(
      t('silence-typical', {
        defaultValue: 'Half of the invites tracked for this school came by week {{half}}, and most by week {{most}}.',
        half: s.halfWeek,
        most: s.mostWeek,
      }),
    );
    if (s.position === 'beyond-range') {
      lines.push(
        t('silence-beyond', {
          defaultValue: 'Tracked members are counted through week {{last}}; your wait is past that.',
          last: s.lastWeek,
        }),
      );
    }
  }

  return (
    <div className="medapp-subrule" data-silence={s.kind === 'silent' ? s.position : s.kind}>
      <p className="medapp-text">{waited}</p>
      {lines.map((line) => (
        <p key={line} className="medapp-meta mt-1">
          {line}
        </p>
      ))}
    </div>
  );
}
