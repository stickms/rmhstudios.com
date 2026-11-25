import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { LABEL_ORDER } from '../../engine/builder/label';
import { formatUtcDay } from '../../engine/public-read';
import { SCHOOL_SEARCH_DEFAULTS } from '../../engine/search';
import { isPdfUrl, textFragmentUrl } from '../../engine/text-fragment';
import type {
  MedBuildComparisonDto,
  MedBuildFigureDto,
  MedBuildLabel,
  MedBuildRes,
  MedBuildSchoolDto,
} from '../../medschools.contract';
import { useKindLabel } from '../facts/EnteringClass';
import { SchoolCrest } from '../SchoolCrest';
import { SourceRef } from '../SourceRef';

export function useBuilderText() {
  const { t } = useTranslation('medschools');
  const label = (l: MedBuildLabel): string => {
    switch (l) {
      case 'reach':
        return t('builder-label-reach', { defaultValue: 'Reach' });
      case 'target':
        return t('builder-label-target', { defaultValue: 'Target' });
      case 'likely':
        return t('builder-label-likely', { defaultValue: 'Likely' });
      case 'not-enough-data':
        return t('builder-label-no-data', { defaultValue: 'Not enough published data' });
      default:
        return t('builder-label-not-compared', { defaultValue: 'Schools' });
    }
  };
  const groupNote = (l: MedBuildLabel): string => {
    switch (l) {
      case 'reach':
        return t('builder-group-reach', { defaultValue: 'One of your figures is below the class’s published figure.' });
      case 'target':
        return t('builder-group-target', { defaultValue: 'Your figures are near the class’s published figures.' });
      case 'likely':
        return t('builder-group-likely', {
          defaultValue: 'Both your MCAT and GPA are above the class’s published figures.',
        });
      case 'not-enough-data':
        return t('builder-group-no-data', {
          defaultValue: 'The school publishes no MCAT or GPA figure we could compare, so it is not labelled.',
        });
      default:
        return t('builder-group-not-compared', { defaultValue: 'Not compared with your stats.' });
    }
  };
  const comparison = (c: MedBuildComparisonDto): string => {
    const stat =
      c.stat === 'median'
        ? t('builder-stat-median', { defaultValue: 'median' })
        : c.stat === 'mean'
          ? t('builder-stat-mean', { defaultValue: 'mean' })
          : t('builder-stat-unnamed', { defaultValue: 'published figure' });
    return c.metric === 'MCAT'
      ? t('builder-compare-mcat', {
          defaultValue: 'Your MCAT {{yours}} vs the class’s {{stat}} {{theirs}}',
          yours: c.yours,
          stat,
          theirs: c.theirs,
        })
      : t('builder-compare-gpa', {
          defaultValue: 'Your GPA {{yours}} vs the class’s {{stat}} {{theirs}}',
          yours: c.yours,
          stat,
          theirs: c.theirs,
        });
  };
  return { label, groupNote, comparison };
}

function FigureRow({ f, schoolName }: { f: MedBuildFigureDto; schoolName: string }) {
  const { t } = useTranslation('medschools');
  const { locale } = useLocaleFormat();
  const kindLabel = useKindLabel();
  const checked = t('profile-checked', {
    defaultValue: 'Checked {{date}}',
    date: formatUtcDay(f.checkedOn, locale, { year: 'numeric', month: 'long', day: 'numeric' }),
  });
  if (f.kind === 'MDPHD_PROGRAM' || f.kind === 'MSTP_T32') {
    const name =
      f.kind === 'MDPHD_PROGRAM'
        ? t('builder-fig-mdphd', { defaultValue: 'MD-PhD program' })
        : t('builder-fig-mstp', { defaultValue: 'NIH MSTP' });
    const source =
      f.kind === 'MDPHD_PROGRAM'
        ? t('builder-src-mdphd', { defaultValue: '{{school}} MD-PhD page', school: schoolName })
        : t('builder-src-mstp', { defaultValue: 'NIH RePORTER' });
    return (
      <li className="medapp-srcrow medapp-build__fig" data-ref={f.ref}>
        <span>
          <span className="medapp-build__cite">{f.ref.replace(/^c\d+f/, '')}</span> {name}
          {f.value ? <span className="medapp-meta">{` · ${f.value}`}</span> : null}
        </span>
        <SourceRef name={source} detail={checked} href={f.sourceUrl} attribution={`${source}. ${checked}`} />
      </li>
    );
  }
  const source = t('profile-source-name', { defaultValue: '{{school}} class profile', school: schoolName });
  const cls =
    f.enteringYear === null
      ? f.classLabel
      : t('profile-class-entered', { defaultValue: 'Entered {{year}}', year: String(f.enteringYear) });
  const href = isPdfUrl(f.sourceUrl) || !f.evidence ? f.sourceUrl : textFragmentUrl(f.sourceUrl, f.evidence);
  return (
    <li className="medapp-srcrow medapp-build__fig" data-ref={f.ref}>
      <span>
        <span className="medapp-build__cite">{f.ref.replace(/^c\d+f/, '')}</span> {kindLabel(f.kind)}{' '}
        <strong className="medapp-build__num">{f.value}</strong>
        <span className="medapp-meta">{` · ${cls}`}</span>
      </span>
      <SourceRef
        name={source}
        detail={checked}
        quote={f.evidence || undefined}
        href={href}
        attribution={`${source}, ${cls}. ${checked}`}
      />
    </li>
  );
}

function SchoolRow({
  s,
  checked,
  onToggle,
  member,
}: {
  s: MedBuildSchoolDto;
  checked: boolean;
  onToggle: (on: boolean) => void;
  member: MedBuildRes['member'];
}) {
  const { t } = useTranslation('medschools');
  const { label, comparison } = useBuilderText();
  const id = `build-${s.slug}`;
  const citeNo = (ref: string): string => {
    const own = s.figures.find((f) => f.ref === ref);
    if (own) return ref.replace(/^c\d+f/, '');
    const m = member.find((x) => x.ref === ref);
    return m ? t('builder-cite-yours', { defaultValue: 'yours' }) : '';
  };
  return (
    <li className="medapp-item medapp-build__row">
      <div className="medapp-item__head">
        <label className="medapp-build__tick" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            className="medapp-check"
            checked={checked}
            onChange={(e) => onToggle(e.target.checked)}
            aria-label={t('builder-include', { defaultValue: 'Include {{school}}', school: s.name })}
          />
        </label>
        <SchoolCrest slug={s.slug} name={s.name} size={40} />
        <div className="medapp-item__title">
          <Link to="/med/$slug" params={{ slug: s.slug }} search={{ ...SCHOOL_SEARCH_DEFAULTS, tab: 'facts' }} className="medapp-name">
            {s.name}
          </Link>
          <span className="medapp-build__label medapp-build__label--under">{label(s.label)}</span>
          <span className="medapp-meta">
            {`${s.state} · ${s.degree}`}
            {s.notes.includes('home-state') ? ` · ${t('builder-note-home', { defaultValue: 'In your home state' })}` : ''}
            {s.notes.includes('mdphd') ? ` · ${t('builder-note-mdphd', { defaultValue: 'MD-PhD program' })}` : ''}
            {s.notes.includes('mstp') ? ` · ${t('builder-note-mstp', { defaultValue: 'NIH MSTP' })}` : ''}
          </span>
        </div>
        <span className="medapp-build__label medapp-build__label--side">{label(s.label)}</span>
      </div>
      <div className="medapp-build__body">
        {s.comparisons.length ? (
          <ul className="medapp-build__compare">
            {s.comparisons.map((c) => (
              <li key={c.metric}>{comparison(c)}</li>
            ))}
          </ul>
        ) : null}
        {s.reason ? (
          <p className="medapp-text">
            {s.reason.text}{' '}
            <span className="medapp-meta">
              {`[${s.reason.cites
                .map(citeNo)
                .filter(Boolean)
                .join(', ')}]`}
            </span>
          </p>
        ) : null}
        {s.figures.length ? (
          <ul className="medapp-build__figs" aria-label={t('builder-figures', { defaultValue: 'Figures used' })}>
            {s.figures.map((f) => (
              <FigureRow key={f.ref} f={f} schoolName={s.shortName} />
            ))}
          </ul>
        ) : (
          <p className="medapp-meta">
            {t('builder-no-figures', { defaultValue: 'No published class figures. See the school’s Facts tab.' })}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * A built list (phase D), grouped by the label code computed (never the model): reach, target, likely, then the
 * schools with not enough published data. Each school shows the comparison its label rests on, the model's reason
 * where the grounding check kept it, and every figure used with its source. Presentational: the page owns the ticks.
 */
export function BuildResult({
  res,
  selected,
  onToggle,
}: {
  res: MedBuildRes;
  selected: ReadonlySet<string>;
  onToggle: (slug: string, on: boolean) => void;
}) {
  const { t } = useTranslation('medschools');
  const { label, groupNote } = useBuilderText();
  const groups = LABEL_ORDER.map((l) => [l, res.schools.filter((s) => s.label === l)] as const).filter(
    ([, list]) => list.length > 0,
  );
  return (
    <div className="medapp-build">
      {res.notice === 'removed-ungrounded' ? (
        <p className="medapp-meta" role="status">
          {t('builder-notice-removed', {
            defaultValue: 'Some reasons were removed because a figure in them was not in the cited data.',
          })}
        </p>
      ) : null}
      {res.statsMissing ? (
        <p className="medapp-meta" role="status">
          {t('builder-stats-missing', {
            defaultValue: 'You have no MCAT or GPA saved, so nothing was compared.',
          })}{' '}
          <Link to="/med/stats" className="medapp-link">
            {t('builder-add-stats', { defaultValue: 'Add your stats' })}
          </Link>
        </p>
      ) : null}
      {res.filters.unused.length ? (
        <p className="medapp-meta">
          {t('builder-unused', {
            defaultValue: 'RMH has no public data on {{missions}}, so it did not choose any school.',
            missions: res.filters.unused.join(', '),
          })}
        </p>
      ) : null}
      {groups.map(([l, list]) => (
        <section key={l} className="medapp-build__group" aria-labelledby={`build-group-${l}`}>
          <div className="medapp-head__text">
            <h2 id={`build-group-${l}`} className="medapp-h2">
              {`${label(l)} (${list.length})`}
            </h2>
            <p className="medapp-meta">{groupNote(l)}</p>
          </div>
          <ul className="medapp-rows">
            {list.map((s) => (
              <SchoolRow
                key={s.slug}
                s={s}
                member={res.member}
                checked={selected.has(s.slug)}
                onToggle={(on) => onToggle(s.slug, on)}
              />
            ))}
          </ul>
        </section>
      ))}
      {res.member.length ? (
        <section className="medapp-build__group" aria-labelledby="build-yours">
          <h2 id="build-yours" className="medapp-h3">
            {t('builder-yours', { defaultValue: 'Your figures used' })}
          </h2>
          <ul className="medapp-build__yours">
            {res.member.map((m) => (
              <li key={m.ref} className="medapp-meta">
                {m.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
