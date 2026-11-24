import { useTranslation } from 'react-i18next';
import { MedSelect } from '../controls/MedSelect';
import { CHARTED_TYPES } from '../../engine/public-read';
import { ALL_PROGRAMS, normalizePrograms, type ProgramKey } from '../../engine/programs';
import type { Prefs } from '../../engine/prefs';
import { HOME_STATE_CODES } from '../../engine/tracker';
import type { MedChartedTypeId } from '../../medschools.contract';
import { CategoryToggles } from '../CategoryToggles';
import { ProgramSetToggles } from '../ProgramSetToggles';

/** What the section PUTs: the whole object every time, so a change never depends on what another tab saved. */
export interface PrefsDraft {
  programs: ProgramKey[];
  homeState: string | null;
  chartCategories: MedChartedTypeId[];
}

/**
 * Preferences (ruling Q9): rows on rules under the lists. They fill in a page's defaults only where its address does
 * not say otherwise. Every category on is stored as none chosen, so it is not reported as "from your preferences".
 */
export function PrefsSection({
  prefs,
  busy,
  onChange,
}: {
  prefs: Prefs;
  busy: boolean;
  onChange: (next: PrefsDraft) => void;
}) {
  const { t } = useTranslation('medschools');
  const programs = prefs.programs.length > 0 ? normalizePrograms(prefs.programs) : [...ALL_PROGRAMS];
  const categories = (prefs.chartCategories.length > 0 ? prefs.chartCategories : CHARTED_TYPES) as MedChartedTypeId[];
  const draft = (over: Partial<PrefsDraft>): PrefsDraft => ({
    programs,
    homeState: prefs.homeState,
    chartCategories: prefs.chartCategories as MedChartedTypeId[],
    ...over,
  });

  return (
    <section
      id="preferences"
      aria-labelledby="medschools-prefs-heading"
      className="medapp-section medapp-section--panel scroll-mt-6"
    >
      <h2 id="medschools-prefs-heading" className="medapp-h2 border-b border-app-border pb-2">
        {t('prefs-heading', { defaultValue: 'Preferences' })}
      </h2>
      <p className="medapp-meta mt-2">
        {t('prefs-note', {
          defaultValue: "These fill in a page's defaults only when its address does not say otherwise.",
        })}
      </p>

      <div className="flex flex-col gap-2 border-b border-app-border py-3">
        <span className="medapp-label">{t('prefs-programs', { defaultValue: 'Programs' })}</span>
        <ProgramSetToggles value={programs} onChange={(next) => onChange(draft({ programs: next }))} />
      </div>

      <div className="flex flex-col gap-2 border-b border-app-border py-3">
        <label className="medapp-label" htmlFor="medschools-pref-home">
          {t('prefs-home-state', { defaultValue: 'Home state' })}
        </label>
        <MedSelect
          id="medschools-pref-home"
          disabled={busy}
          value={prefs.homeState ?? ''}
          onChange={(e) => onChange(draft({ homeState: e.target.value || null }))}
        >
          <option value="">{t('prefs-home-state-none', { defaultValue: 'Not set' })}</option>
          {HOME_STATE_CODES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </MedSelect>
      </div>

      <div className="flex flex-col gap-2 py-3">
        <span className="medapp-label">{t('prefs-categories', { defaultValue: 'Chart categories' })}</span>
        <CategoryToggles
          value={categories}
          onChange={(next) => onChange(draft({ chartCategories: next.length === CHARTED_TYPES.length ? [] : next }))}
        />
      </div>
    </section>
  );
}
