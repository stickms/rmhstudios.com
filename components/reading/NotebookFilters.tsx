/** Search, filters, sort and the "group by document" switch for the highlights notebook. */

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReadingDocKind } from '@/lib/reading/schema';
import { HIGHLIGHT_SORTS, type HighlightSort } from '@/lib/reading/highlights-search-schema';
import { SearchField } from '@/components/ui/search-field';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export interface NotebookFilterState {
  q: string;
  kind: ReadingDocKind | '';
  hasNote: boolean;
  visibility: 'public' | 'private' | '';
  sort: HighlightSort;
}

export const EMPTY_FILTERS: NotebookFilterState = {
  q: '',
  kind: '',
  hasNote: false,
  visibility: '',
  sort: 'newest',
};

const KINDS: readonly ReadingDocKind[] = ['blog', 'news', 'library'];

export function NotebookFilters({
  value,
  onChange,
  grouped,
  onGroupedChange,
}: {
  value: NotebookFilterState;
  onChange: (next: NotebookFilterState) => void;
  grouped: boolean;
  onGroupedChange: (grouped: boolean) => void;
}) {
  const { t } = useTranslation('highlights');
  const groupLabelId = useId();
  const kindLabel: Record<ReadingDocKind, string> = {
    blog: t('kind-logs', {
      defaultValue: 'Logs',
    }),
    news: t('kind-news', {
      defaultValue: 'News',
    }),
    library: t('kind-library', {
      defaultValue: 'Library',
    }),
  };
  const sortLabel: Record<HighlightSort, string> = {
    newest: t('sort-newest', {
      defaultValue: 'Newest first',
    }),
    oldest: t('sort-oldest', {
      defaultValue: 'Oldest first',
    }),
    document: t('sort-document', {
      defaultValue: 'By document',
    }),
  };

  return (
    <div className="space-y-3">
      <SearchField
        value={value.q}
        onValueChange={(q) =>
          onChange({
            ...value,
            q,
          })
        }
        placeholder={t('search-placeholder', {
          defaultValue: 'Search highlights and notes',
        })}
        aria-label={t('search-label', {
          defaultValue: 'Search highlights and notes',
        })}
        containerClassName="w-full"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Select
          controlSize="sm"
          className="w-36"
          aria-label={t('filter-kind', {
            defaultValue: 'Document type',
          })}
          value={value.kind}
          onChange={(e) => {
            const kind = KINDS.find((k) => k === e.target.value) ?? '';
            onChange({
              ...value,
              kind,
            });
          }}
        >
          <option value="">
            {t('kind-all', {
              defaultValue: 'All documents',
            })}
          </option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {kindLabel[k]}
            </option>
          ))}
        </Select>
        <Select
          controlSize="sm"
          className="w-36"
          aria-label={t('filter-note', {
            defaultValue: 'Notes',
          })}
          value={value.hasNote ? 'note' : ''}
          onChange={(e) =>
            onChange({
              ...value,
              hasNote: e.target.value === 'note',
            })
          }
        >
          <option value="">
            {t('note-any', {
              defaultValue: 'With or without note',
            })}
          </option>
          <option value="note">
            {t('note-with', {
              defaultValue: 'With a note',
            })}
          </option>
        </Select>
        <Select
          controlSize="sm"
          className="w-32"
          aria-label={t('filter-visibility', {
            defaultValue: 'Visibility',
          })}
          value={value.visibility}
          onChange={(e) =>
            onChange({
              ...value,
              visibility: e.target.value === 'public' || e.target.value === 'private' ? e.target.value : '',
            })
          }
        >
          <option value="">
            {t('visibility-any', {
              defaultValue: 'Public or private',
            })}
          </option>
          <option value="public">
            {t('visibility-public', {
              defaultValue: 'Public',
            })}
          </option>
          <option value="private">
            {t('visibility-private', {
              defaultValue: 'Private',
            })}
          </option>
        </Select>
        <Select
          controlSize="sm"
          className="w-36"
          aria-label={t('sort-label', {
            defaultValue: 'Sort',
          })}
          value={value.sort}
          onChange={(e) =>
            onChange({
              ...value,
              sort: HIGHLIGHT_SORTS.find((s) => s === e.target.value) ?? 'newest',
            })
          }
        >
          {HIGHLIGHT_SORTS.map((s) => (
            <option key={s} value={s}>
              {sortLabel[s]}
            </option>
          ))}
        </Select>
        <div className="ms-auto flex items-center gap-2">
          <span id={groupLabelId} className="t-body">
            {t('group-by-document', {
              defaultValue: 'Group by document',
            })}
          </span>
          <Switch checked={grouped} onCheckedChange={onGroupedChange} aria-labelledby={groupLabelId} />
        </div>
      </div>
    </div>
  );
}
