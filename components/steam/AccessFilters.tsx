import { useTranslation } from 'react-i18next';
import {
  ACCESS_OPTIONS,
  PLAY_OPTIONS,
  toggleOption,
  type AccessFilter,
  type AccessOption,
  type PlayOption,
} from '@/lib/games/access-filter';
import { accessOptionLabels, playOptionLabels } from './access-labels';

/**
 * The library's "Can be played with" and "Accessibility" filters: two labelled groups of toggle buttons
 * in the steam shell's own control style. The selection lives in the URL (the route owns it), so this
 * only reports changes. The number of matching titles is announced politely while a filter is on.
 */
export function AccessFilters({
  filter,
  onChange,
  matches,
}: {
  filter: AccessFilter;
  onChange: (next: AccessFilter) => void;
  matches: number;
}) {
  const { t } = useTranslation('game-access');
  const playLabels = playOptionLabels(t);
  const accessLabels = accessOptionLabels(t);
  const active = filter.play.length > 0 || filter.access.length > 0;

  return (
    <div className="stm-access-filters">
      <div
        className="stm-kinds stm-kinds-wrap"
        role="group"
        aria-label={t('filter-play-label', {
          defaultValue: 'Can be played with',
        })}
      >
        {PLAY_OPTIONS.map((o: PlayOption) => (
          <button
            key={o}
            type="button"
            aria-pressed={filter.play.includes(o)}
            onClick={() =>
              onChange({
                ...filter,
                play: toggleOption(filter.play, o, PLAY_OPTIONS),
              })
            }
          >
            {playLabels[o]}
          </button>
        ))}
      </div>
      <div
        className="stm-kinds stm-kinds-wrap"
        role="group"
        aria-label={t('filter-access-label', {
          defaultValue: 'Accessibility',
        })}
      >
        {ACCESS_OPTIONS.map((o: AccessOption) => (
          <button
            key={o}
            type="button"
            aria-pressed={filter.access.includes(o)}
            onClick={() =>
              onChange({
                ...filter,
                access: toggleOption(filter.access, o, ACCESS_OPTIONS),
              })
            }
          >
            {accessLabels[o]}
          </button>
        ))}
      </div>
      <p className="stm-sr" role="status" aria-live="polite">
        {active
          ? t('filter-count', {
              defaultValue: 'Matching titles: {{n}}',
              n: matches,
            })
          : ''}
      </p>
    </div>
  );
}

/** The library list's note when the access filters leave nothing. */
export function AccessEmpty() {
  const { t } = useTranslation('game-access');
  return (
    <>
      {t('filter-empty', {
        defaultValue: 'No game claims all of those. Turn one off to see more.',
      })}
    </>
  );
}
