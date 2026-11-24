import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { GraduationCap } from 'lucide-react';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { formatUtcDay } from '../../engine/public-read';
import { isCurriculumKind, type CurriculumKindId } from '../../engine/school-facts';
import type { MedSchoolFactDto, MedSchoolFactsRes } from '../../medschools.contract';
import { schoolFactsQuery } from '../../medschools.queries';
import { MedEmpty } from '../MedEmpty';
import { SourceRef } from '../SourceRef';
import { ListSkeleton, SkeletonSwap } from '../skeletons';

/**
 * Curriculum: how the school grades the preclinical and clinical years, its shelf exams, MSPE, lecture attendance, AOA
 * chapter and home hospitals, as Admit.org lists them. A paper panel with rows on rules, one source line and one
 * sentence saying the table is Admit's and to confirm with the school. States what Admit lists, gives no advice and
 * ranks nothing (Admit's own ranking is never stored). Shown for MD and DO schools alike, whenever Admit has the school.
 * Shares the school-facts query with `AdmissionsFacts`, so the tab makes one request.
 */
export function Curriculum({ slug, admitHref }: { slug: string; admitHref?: string | undefined }) {
  const { t } = useTranslation('medschools');
  const query = useQuery(schoolFactsQuery(slug));
  if (query.isError) {
    return (
      <MedEmpty
        title={t('curriculum-load-failed', { defaultValue: 'Could not load the curriculum.' })}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return (
    <SkeletonSwap ready={!!query.data} skeleton={<ListSkeleton rows={4} />}>
      {query.data ? <CurriculumView data={query.data} admitHref={admitHref} /> : null}
    </SkeletonSwap>
  );
}

export function CurriculumView({ data, admitHref }: { data: MedSchoolFactsRes; admitHref?: string | undefined }) {
  const { t } = useTranslation('medschools');
  const { number, locale } = useLocaleFormat();
  const by = new Map<string, MedSchoolFactDto>(
    data.facts.filter((f) => isCurriculumKind(f.kind)).map((f) => [f.kind, f]),
  );

  const yesNo = (code: string | null): string | null =>
    code === 'YES'
      ? t('curriculum-yes', { defaultValue: 'Yes' })
      : code === 'NO'
        ? t('curriculum-no', { defaultValue: 'No' })
        : null;

  /** The words for a scale Admit writes in a shorthand we recognise, then Admit's own string; an unknown scale is only its string. */
  const grading = (f: MedSchoolFactDto): ReactNode => {
    const words: Record<string, string> = {
      PASS_FAIL: t('curriculum-pass-fail', { defaultValue: 'Pass / fail' }),
      P_F: t('curriculum-pass-fail', { defaultValue: 'Pass / fail' }),
      TIERED: t('curriculum-tiered', { defaultValue: 'Tiered grades' }),
      H_P_F: t('curriculum-h-p-f', { defaultValue: 'Honors, pass, fail' }),
      H_HP_P_F: t('curriculum-h-hp-p-f', { defaultValue: 'Honors, high pass, pass, fail' }),
    };
    const gloss = f.value ? words[f.value] : undefined;
    if (!gloss) return f.printed ?? null;
    return (
      <>
        {gloss}
        {f.printed ? <span className="medapp-meta"> · {f.printed}</span> : null}
      </>
    );
  };

  const rows: { kind: CurriculumKindId; label: string; value: (f: MedSchoolFactDto) => ReactNode }[] = [
    {
      kind: 'CURRICULUM_PRECLINICAL_GRADING',
      label: t('curriculum-preclinical-grading', { defaultValue: 'Preclinical grading' }),
      value: grading,
    },
    {
      kind: 'CURRICULUM_PRECLINICAL_LENGTH',
      label: t('curriculum-preclinical-length', { defaultValue: 'Preclinical length' }),
      value: (f) =>
        f.num === null
          ? f.printed
          : f.num === 1
            ? t('curriculum-one-year', { defaultValue: '1 year' })
            : t('curriculum-years', { defaultValue: '{{years}} years', years: number(f.num) }),
    },
    {
      kind: 'CURRICULUM_CLERKSHIP_GRADING',
      label: t('curriculum-clerkship-grading', { defaultValue: 'Clerkship grading' }),
      value: grading,
    },
    {
      kind: 'CURRICULUM_SHELF_EXAMS',
      label: t('curriculum-shelf-exams', { defaultValue: 'Shelf exams' }),
      value: (f) =>
        f.value === 'NBME'
          ? t('curriculum-shelf-nbme', { defaultValue: 'NBME shelf exams' })
          : f.value === 'IN_HOUSE'
            ? t('curriculum-shelf-in-house', { defaultValue: 'In-house exams' })
            : f.value === 'BOTH'
              ? t('curriculum-shelf-both', { defaultValue: 'NBME and in-house exams' })
              : f.printed,
    },
    { kind: 'CURRICULUM_MSPE', label: t('curriculum-mspe', { defaultValue: 'MSPE' }), value: (f) => yesNo(f.value) },
    {
      kind: 'CURRICULUM_LECTURE_ATTENDANCE',
      label: t('curriculum-lecture-attendance', { defaultValue: 'Lecture attendance' }),
      value: (f) =>
        f.value === 'YES'
          ? t('curriculum-attendance-required', { defaultValue: 'Required' })
          : f.value === 'NO'
            ? t('curriculum-attendance-not-required', { defaultValue: 'Not required' })
            : null,
    },
    {
      kind: 'AOA_CHAPTER',
      label: t('curriculum-aoa', { defaultValue: 'AOA chapter' }),
      value: (f) => yesNo(f.value),
    },
    {
      kind: 'HOME_HOSPITALS',
      label: t('curriculum-home-hospitals', { defaultValue: 'Home hospitals' }),
      value: (f) => f.printed,
    },
  ];

  const shown = rows.flatMap((r) => {
    const f = by.get(r.kind);
    if (!f) return [];
    const v = r.value(f);
    return v === null || v === '' ? [] : [{ r, f, v }];
  });

  if (shown.length === 0) {
    return (
      <MedEmpty
        title={t('curriculum-empty', { defaultValue: 'No curriculum details for this school yet.' })}
        description={t('curriculum-empty-body', {
          defaultValue: 'Admit.org does not list a curriculum for every school.',
        })}
      />
    );
  }

  const first = shown[0]!.f;
  // The newest day any row was read: the weekly refresh moves them together, so this is the table's own date.
  const checked = shown.map((x) => x.f.checkedOn).sort()[shown.length - 1]!;
  const checkedText = formatUtcDay(checked, locale, { year: 'numeric', month: 'long', day: 'numeric' });
  const sourceLine = t('curriculum-source', {
    defaultValue: 'Source: {{source}}, checked {{date}}',
    source: first.sourceLabel,
    date: checkedText,
  });
  const confirmLine = t('curriculum-confirm', { defaultValue: 'Compiled by Admit.org; confirm with the school.' });
  return (
    <section className="medapp-section medapp-section--panel" aria-labelledby="school-curriculum-heading">
      <div className="medapp-srcrow">
        <h2 id="school-curriculum-heading" className="medapp-h2">
          <span className="medapp-headicon">
            <GraduationCap aria-hidden="true" className="size-5" />
            {t('curriculum-heading', { defaultValue: 'Curriculum' })}
          </span>
        </h2>
        <SourceRef
          name={first.sourceLabel}
          detail={t('curriculum-source-detail', { defaultValue: 'Checked {{date}}', date: checkedText })}
          note={confirmLine}
          href={admitHref ?? first.sourceUrl}
          attribution={`${sourceLine}. ${confirmLine}`}
        />
      </div>
      <dl className="medapp-defs medapp-defs--facts">
        {shown.map(({ r, f, v }) => (
          <div key={r.kind} className={f.kind === 'HOME_HOSPITALS' ? 'is-stack' : undefined}>
            <dt>{r.label}</dt>
            <dd>{f.kind === 'HOME_HOSPITALS' ? hospitalList(v) : v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Admit's list is held as one "; "-joined string: one line per hospital reads better than a long run of commas. */
function hospitalList(v: ReactNode): ReactNode {
  if (typeof v !== 'string') return v;
  const items = v.split('; ').filter((x) => x !== '');
  if (items.length < 2) return v;
  return (
    <ul className="medapp-plain-list">
      {items.map((h) => (
        <li key={h}>{h}</li>
      ))}
    </ul>
  );
}
