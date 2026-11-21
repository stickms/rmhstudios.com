import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/select';
import {
  ACHIEVEMENT_SORTS,
  ACHIEVEMENT_STATES,
  type AchievementSort,
  type AchievementState,
} from '@/lib/achievements/tracking';
import type { AchievementCategory } from '@/lib/achievements/catalog';

export interface AchievementListView {
  state: AchievementState;
  category:
    | AchievementCategory
    | 'all';
  sort: AchievementSort;
}

/** State, category and sort for the achievements list. The category names are the catalog's own labels. */
export function AchievementFilters({
  value,
  categories,
  onChange,
}: {
  value: AchievementListView;
  categories: ReadonlyArray<{
    id: AchievementCategory;
    label: string;
  }>;
  onChange: (
    next: AchievementListView,
  ) => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'achievement-tracker',
    );
  const stateLabel =
    (
      s: AchievementState,
    ) => {
      switch (
        s
      ) {
        case 'locked':
          return t(
            'state-locked',
            {
              defaultValue:
                'Locked',
            },
          );
        case 'unlocked':
          return t(
            'state-unlocked',
            {
              defaultValue:
                'Unlocked',
            },
          );
        case 'tracked':
          return t(
            'state-tracked',
            {
              defaultValue:
                'Tracked',
            },
          );
        default:
          return t(
            'state-all',
            {
              defaultValue:
                'All achievements',
            },
          );
      }
    };
  const sortLabel =
    (
      s: AchievementSort,
    ) => {
      switch (
        s
      ) {
        case 'closest':
          return t(
            'sort-closest',
            {
              defaultValue:
                'Closest to unlocking',
            },
          );
        case 'rarest':
          return t(
            'sort-rarest',
            {
              defaultValue:
                'Rarest',
            },
          );
        case 'recent':
          return t(
            'sort-recent',
            {
              defaultValue:
                'Recently unlocked',
            },
          );
        default:
          return t(
            'sort-catalog',
            {
              defaultValue:
                'Catalog order',
            },
          );
      }
    };
  return (
    <div className="flex flex-wrap gap-3 pt-6">
      <Select
        aria-label={t(
          'filter-state',
          {
            defaultValue:
              'Show',
          },
        )}
        controlSize="sm"
        containerClassName="w-44 max-w-full"
        value={
          value.state
        }
        onChange={(
          e,
        ) =>
          onChange(
            {
              ...value,
              state:
                e
                  .target
                  .value as AchievementState,
            },
          )
        }
      >
        {ACHIEVEMENT_STATES.map(
          (
            s,
          ) => (
            <option
              key={
                s
              }
              value={
                s
              }
            >
              {stateLabel(
                s,
              )}
            </option>
          ),
        )}
      </Select>
      <Select
        aria-label={t(
          'filter-category',
          {
            defaultValue:
              'Category',
          },
        )}
        controlSize="sm"
        containerClassName="w-44 max-w-full"
        value={
          value.category
        }
        onChange={(
          e,
        ) =>
          onChange(
            {
              ...value,
              category:
                e
                  .target
                  .value as AchievementListView['category'],
            },
          )
        }
      >
        <option value="all">
          {t(
            'category-all',
            {
              defaultValue:
                'All categories',
            },
          )}
        </option>
        {categories.map(
          (
            c,
          ) => (
            <option
              key={
                c.id
              }
              value={
                c.id
              }
            >
              {
                c.label
              }
            </option>
          ),
        )}
      </Select>
      <Select
        aria-label={t(
          'filter-sort',
          {
            defaultValue:
              'Sort by',
          },
        )}
        controlSize="sm"
        containerClassName="w-52 max-w-full"
        value={
          value.sort
        }
        onChange={(
          e,
        ) =>
          onChange(
            {
              ...value,
              sort: e
                .target
                .value as AchievementSort,
            },
          )
        }
      >
        {ACHIEVEMENT_SORTS.map(
          (
            s,
          ) => (
            <option
              key={
                s
              }
              value={
                s
              }
            >
              {sortLabel(
                s,
              )}
            </option>
          ),
        )}
      </Select>
    </div>
  );
}
