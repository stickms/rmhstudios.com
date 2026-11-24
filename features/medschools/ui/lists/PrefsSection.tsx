import { useTranslation } from 'react-i18next';
import { MedSelect } from '../controls/MedSelect';
import { CHARTED_TYPES } from '../../engine/public-read';
import { ALL_PROGRAMS, normalizePrograms, type ProgramKey } from '../../engine/programs';
import type { Prefs } from '../../engine/prefs';
import { HOME_STATE_CODES } from '../../engine/tracker';
import type { MedChartedTypeId } from '../../medschools.contract';
import { CATEGORY_ORDER, toggleCategory } from '../CategoryToggles';
import { useMedLabels } from '../labels';
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
  const { eventLabel } = useMedLabels();
  const programs = prefs.programs.length > 0 ? normalizePrograms(prefs.programs) : [...ALL_PROGRAMS];
  const categories = (prefs.chartCategories.length > 0 ? prefs.chartCategories : CHARTED_TYPES) as MedChartedTypeId[];
  const draft = (over: Partial<PrefsDraft>): PrefsDraft => ({
    programs,
    homeState: prefs.homeState,
    chartCategories: prefs.chartCategories as MedChartedTypeId[],
    ...over,
  });

  const onCount = CATEGORY_ORDER.filter((c) => categories.includes(c)).length;

  return (
    <section
      id="preferences"
      aria-labelledby="medschools-prefs-heading"
      className="medapp-section medapp-section--panel scroll-mt-6"
    >
      <div className="medapp-head__text">
        <h2 id="medschools-prefs-heading" className="medapp-h2">
          {t('prefs-heading', { defaultValue: 'Preferences' })}
        </h2>
        <p className="medapp-meta">
          {t('prefs-note', {
            defaultValue: "These fill in a page's defaults only when its address does not say otherwise.",
          })}
        </p>
      </div>

      <div className="medapp-group medapp-fieldset">
        <span className="medapp-label">{t('prefs-programs', { defaultValue: 'Programs' })}</span>
        <ProgramSetToggles value={programs} onChange={(next) => onChange(draft({ programs: next }))} />
      </div>

      <div className="medapp-group medapp-fieldset">
        <label className="medapp-label" htmlFor="medschools-pref-home">
          {t('prefs-home-state', { defaultValue: 'Home state' })}
        </label>
        <MedSelect
          id="medschools-pref-home"
          containerClassName="w-full sm:max-w-60"
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

      {/* A setting, not a legend: one checkbox per category, the last one on cannot be turned off (O4). */}
      <div className="medapp-group medapp-fieldset">
        <span className="medapp-label" id="medschools-pref-categories">
          {t('prefs-categories', { defaultValue: 'Chart categories' })}
        </span>
        <div
          role="group"
          aria-label={t('category-toggles-label', { defaultValue: 'Show categories' })}
          className="grid grid-cols-1 gap-x-6 sm:grid-cols-2"
        >
          {CATEGORY_ORDER.map((type) => {
            const on = categories.includes(type);
            return (
              <label key={type} className="medapp-checkrow">
                <input
                  type="checkbox"
                  className="medapp-check"
                  checked={on}
                  disabled={busy || (on && onCount <= 1)}
                  onChange={() => {
                    const next = toggleCategory(categories, type);
                    onChange(draft({ chartCategories: next.length === CHARTED_TYPES.length ? [] : next }));
                  }}
                />
                {eventLabel(type)}
              </label>
            );
          })}
        </div>
      </div>
    </section>
  );
}
