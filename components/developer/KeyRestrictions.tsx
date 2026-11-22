import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ShieldAlert } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { updateDeveloperKeyApi, type DeveloperKeyListRow, type KeyRefusals } from '@/lib/developer/keys.contract';
import { MAX_ALLOWED_ENTRIES, parseAllowlist, type AllowlistError } from '@/lib/api/ip-allowlist';
import { parseLimitInput, type LimitInputError } from '@/lib/api/tier-limits';

/** Validate both fields the way the server will; the form and its Save button read this. */
export function restrictionsDraft(cidrText: string, limitText: string, maxLimit: number) {
  const list = parseAllowlist(cidrText);
  const limit = parseLimitInput(limitText, maxLimit);
  return {
    allowedCidrs: list.entries,
    rateLimitPerMinute: limit.ok ? limit.value : null,
    cidrErrors: list.errors,
    limitError: limit.ok ? null : limit.error,
    valid: list.errors.length === 0 && limit.ok,
  };
}

function cidrErrorText(t: TFunction, e: AllowlistError): string {
  switch (e.code) {
    case 'open_range':
      return t('error-open-range', {
        defaultValue:
          'Line {{line}}: a range covering every address is not a restriction. Leave the list empty to allow any address.',
        line: e.line,
      });
    case 'prefix_out_of_range':
      return t('error-prefix', {
        defaultValue: 'Line {{line}}: the prefix length must be between /{{min}} and /{{max}}.',
        line: e.line,
        min: e.min,
        max: e.max,
      });
    case 'too_many':
      return t('error-too-many', {
        count: Number(e.max),
        defaultValue_one: 'Line {{line}}: at most {{max}} address are allowed.',
        defaultValue: 'Line {{line}}: at most {{max}} addresses are allowed.',
        line: e.line,
        max: e.max,
      });
    case 'invalid_address':
      return t('error-invalid', {
        defaultValue:
          'Line {{line}}: {{value}} is not an IPv4 or IPv6 address or range. Hostnames and wildcards are not accepted.',
        line: e.line,
        value: e.value,
      });
  }
}

function limitErrorText(t: TFunction, error: LimitInputError, max: number): string {
  return error === 'not_whole_number'
    ? t('error-limit-whole', {
        defaultValue: 'Enter a whole number, or leave it blank.',
      })
    : t('error-limit-range', {
        defaultValue: 'Enter a number from 1 to {{max}}.',
        max,
      });
}

/** The two restriction fields, shared by the create form and each key's settings. */
export function KeyRestrictionFields({
  idPrefix,
  cidrText,
  onCidrText,
  limitText,
  onLimitText,
  maxLimit,
}: {
  idPrefix: string;
  cidrText: string;
  onCidrText: (value: string) => void;
  limitText: string;
  onLimitText: (value: string) => void;
  maxLimit: number;
}) {
  const { t } = useTranslation('key-restrictions');
  const draft = useMemo(() => restrictionsDraft(cidrText, limitText, maxLimit), [cidrText, limitText, maxLimit]);
  const cidrId = `${idPrefix}-cidrs`;
  const limitId = `${idPrefix}-limit`;
  const cidrDescribedBy = [`${cidrId}-help`, draft.cidrErrors.length > 0 ? `${cidrId}-errors` : null]
    .filter(Boolean)
    .join(' ');
  const limitDescribedBy = [`${limitId}-help`, draft.limitError ? `${limitId}-error` : null].filter(Boolean).join(' ');

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={cidrId} className="t-label block">
          {t('allowed-label', {
            defaultValue: 'Allowed addresses',
          })}
        </label>
        <p id={`${cidrId}-help`} className="t-meta">
          {t('allowed-help', {
            defaultValue:
              'One IPv4 or IPv6 address or range per line, such as 203.0.113.7 or 198.51.100.0/24. Up to {{max}}. Leave empty to allow any address.',
            max: MAX_ALLOWED_ENTRIES,
          })}
        </p>
        <Textarea
          id={cidrId}
          value={cidrText}
          onChange={(e) => onCidrText(e.target.value)}
          rows={4}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          className="font-mono"
          aria-invalid={draft.cidrErrors.length > 0}
          aria-describedby={cidrDescribedBy}
        />
        {draft.cidrErrors.length > 0 && (
          <ul id={`${cidrId}-errors`} className="space-y-0.5 text-sm text-site-danger">
            {draft.cidrErrors.map((e) => (
              <li key={`${e.line}-${e.code}`}>{cidrErrorText(t, e)}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor={limitId} className="t-label block">
          {t('limit-label', {
            defaultValue: 'Requests per minute',
          })}
        </label>
        <p id={`${limitId}-help`} className="t-meta">
          {t('limit-help', {
            defaultValue: 'Blank uses your plan limit of {{max}} a minute. A lower number applies to this key only.',
            max: maxLimit,
          })}
        </p>
        <Input
          id={limitId}
          type="number"
          inputMode="numeric"
          min={1}
          max={maxLimit}
          value={limitText}
          onChange={(e) => onLimitText(e.target.value)}
          placeholder={String(maxLimit)}
          className="max-w-40"
          aria-invalid={draft.limitError !== null}
          aria-describedby={limitDescribedBy}
        />
        {draft.limitError && (
          <p id={`${limitId}-error`} className="text-sm text-site-danger">
            {limitErrorText(t, draft.limitError, maxLimit)}
          </p>
        )}
      </div>
    </div>
  );
}

/** "Refused requests: 3 in the last 7 days, last from 203.0.113.x" (nothing when there are none). */
export function KeyRefusalLine({ refusals }: { refusals: KeyRefusals }) {
  const { t } = useTranslation('key-restrictions');
  if (refusals.count === 0) return null;
  return (
    <p className="t-meta mt-2 flex items-center gap-1.5 text-site-danger">
      <ShieldAlert className="size-3.5 shrink-0" aria-hidden />
      <span>
        {refusals.lastPrefix
          ? t('refused-with-address', {
              defaultValue: 'Refused requests: {{count}} in the last 7 days, last from {{address}}',
              count: refusals.count,
              address: refusals.lastPrefix,
            })
          : t('refused', {
              defaultValue: 'Refused requests: {{count}} in the last 7 days',
              count: refusals.count,
            })}
      </span>
    </p>
  );
}

/** One existing key's restrictions: both fields and one Save. */
export function KeyRestrictionsPanel({
  keyRow,
  maxLimit,
  onSaved,
}: {
  keyRow: DeveloperKeyListRow;
  maxLimit: number;
  onSaved: () => void | Promise<void>;
}) {
  const { t } = useTranslation('key-restrictions');
  const initialCidrs = keyRow.allowedCidrs.join('\n');
  const initialLimit = keyRow.rateLimitPerMinute === null ? '' : String(keyRow.rateLimitPerMinute);
  const [cidrText, setCidrText] = useState(initialCidrs);
  const [limitText, setLimitText] = useState(initialLimit);
  const [saving, setSaving] = useState(false);
  const draft = restrictionsDraft(cidrText, limitText, maxLimit);
  const changed = cidrText.trim() !== initialCidrs.trim() || limitText.trim() !== initialLimit;

  async function save() {
    if (!draft.valid) return;
    setSaving(true);
    try {
      await api(updateDeveloperKeyApi, {
        params: {
          id: keyRow.id,
        },
        body: {
          allowedCidrs: draft.allowedCidrs,
          rateLimitPerMinute: draft.rateLimitPerMinute,
        },
      });
      toast.success(
        t('saved', {
          defaultValue: 'Restrictions saved',
        }),
      );
      await onSaved();
    } catch (e) {
      toast.error(
        serverError(e) ||
          t('save-failed', {
            defaultValue: 'Could not save the restrictions',
          }),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="mt-3 space-y-4 border-t border-site-border pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <KeyRestrictionFields
        idPrefix={`key-${keyRow.id}`}
        cidrText={cidrText}
        onCidrText={setCidrText}
        limitText={limitText}
        onLimitText={setLimitText}
        maxLimit={maxLimit}
      />
      <Button type="submit" size="sm" variant="default" loading={saving} disabled={!draft.valid || !changed}>
        {t('save', {
          defaultValue: 'Save restrictions',
        })}
      </Button>
    </form>
  );
}
