import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  REPORT_ENTITY_TYPES,
  REPORT_REASONS,
  type ReportEntityType,
  type ReportReason,
} from '@/lib/moderation/report-schema';
import { parseReasons, type TriageSearch } from '@/lib/moderation/triage';
import { TRIAGE_SORTS, type TriageSort } from '@/lib/moderation/triage-schema';

/**
 * The queue's filters. Everything is in the URL search params (`TriageSearch`), so a filtered view can be linked;
 * this component only reads them and reports the next set.
 */
export function ReportFilters({ search, onChange }: { search: TriageSearch; onChange: (next: TriageSearch) => void }) {
  const { t } = useTranslation('report-triage');
  const { t: tr } = useTranslation('c-moderation');

  // The reason names are the report dialog's keys (`c-moderation`).
  const reasonLabels: Record<ReportReason, string> = {
    SPAM: tr('reason-spam', {
      defaultValue: 'Spam or scam',
    }),
    HARASSMENT: tr('reason-harassment', {
      defaultValue: 'Harassment or bullying',
    }),
    HATE: tr('reason-hate', {
      defaultValue: 'Hate speech',
    }),
    VIOLENCE: tr('reason-violence', {
      defaultValue: 'Violence or threats',
    }),
    SEXUAL: tr('reason-sexual', {
      defaultValue: 'Sexual or explicit content',
    }),
    SELF_HARM: tr('reason-self-harm', {
      defaultValue: 'Self-harm',
    }),
    MISINFORMATION: tr('reason-misinformation', {
      defaultValue: 'Misinformation',
    }),
    ILLEGAL: tr('reason-illegal', {
      defaultValue: 'Illegal content',
    }),
    OTHER: tr('reason-other', {
      defaultValue: 'Something else',
    }),
  };
  const sortLabels: Record<TriageSort, string> = {
    most: t('sort-most', {
      defaultValue: 'Most reported',
    }),
    oldest: t('sort-oldest', {
      defaultValue: 'Oldest first',
    }),
    newest: t('sort-newest', {
      defaultValue: 'Newest',
    }),
  };

  const active = parseReasons(search.reasons);
  const toggleReason = (reason: ReportReason, on: boolean) => {
    const next = REPORT_REASONS.filter((r) => (r === reason ? on : active.includes(r)));
    onChange({
      ...search,
      reasons: next.length ? next.join(',') : undefined,
    });
  };

  return (
    <div className="space-y-4 border-b border-site-border pb-4">
      {!search.flat && (
        <fieldset className="min-w-0">
          <legend className="t-label mb-2">
            {t('filter-reasons', {
              defaultValue: 'Reason',
            })}
          </legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {REPORT_REASONS.map((reason) => (
              <label key={reason} className="t-body inline-flex min-h-9 items-center gap-2 pointer-coarse:min-h-11">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={active.includes(reason)}
                  onChange={(e) => toggleReason(reason, e.target.checked)}
                />
                {reasonLabels[reason]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-end gap-4">
        {!search.flat && (
          <>
            <label className="grid gap-1">
              <span className="t-label">
                {t('filter-type', {
                  defaultValue: 'Kind',
                })}
              </span>
              <Select
                controlSize="sm"
                value={search.type ?? ''}
                onChange={(e) =>
                  onChange({
                    ...search,
                    type: (e.target.value || undefined) as ReportEntityType | undefined,
                  })
                }
              >
                <option value="">
                  {t('type-all', {
                    defaultValue: 'All kinds',
                  })}
                </option>
                {REPORT_ENTITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </label>

            <label className="grid gap-1">
              <span className="t-label">
                {t('filter-min', {
                  defaultValue: 'At least this many reports',
                })}
              </span>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={9999}
                className="w-28"
                value={search.min ?? ''}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  onChange({
                    ...search,
                    min: Number.isInteger(n) && n > 1 ? Math.min(n, 9999) : undefined,
                  });
                }}
              />
            </label>

            <label className="grid gap-1">
              <span className="t-label">
                {t('filter-sort', {
                  defaultValue: 'Order',
                })}
              </span>
              <Select
                controlSize="sm"
                value={search.sort ?? 'most'}
                onChange={(e) =>
                  onChange({
                    ...search,
                    sort: e.target.value as TriageSort,
                  })
                }
              >
                {TRIAGE_SORTS.map((sort) => (
                  <option key={sort} value={sort}>
                    {sortLabels[sort]}
                  </option>
                ))}
              </Select>
            </label>
          </>
        )}

        <div className="ms-auto flex items-center gap-2">
          <Switch
            checked={search.flat === true}
            onCheckedChange={(on) =>
              onChange({
                ...search,
                flat: on ? true : undefined,
              })
            }
            aria-labelledby="triage-flat-label"
          />
          <span id="triage-flat-label" className="t-body">
            {t('ungrouped', {
              defaultValue: 'Show each report',
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
