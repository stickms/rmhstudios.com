/**
 * Site moderation of one piece of user content — admin only. Remove, edit or
 * restore it with a reason the owner is told, and optionally add a strike and
 * time the owner out of a feature in the same action. Talks to
 * `/api/admin/moderation/content` (`lib/moderation/content.server.ts`).
 *
 * Callers render it only for an admin; the endpoint enforces that anyway.
 */

import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { HttpError, serverError } from '@/lib/http';
import { moderateContentApi } from '@/lib/moderation/admin-moderation.contract';
import {
  DEFAULT_FEATURE,
  EDITABLE_FIELDS,
  RESTORABLE,
  type ModeratableType,
  type ModerationAction,
} from '@/lib/moderation/content';
import {
  RESTRICTABLE_FEATURES,
  TIMEOUT_PRESETS,
  type RestrictableFeature,
} from '@/lib/moderation/restrictions';
import { useFeatureLabels, useTimeoutLabel } from '@/components/moderation/moderation-labels';

export interface ModerateContentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: ModeratableType;
  entityId: string;
  /** Current values of the editable fields, to prefill the edit form. */
  current?: Record<string, string | null | undefined>;
  /** Already removed by moderation: offer Restore instead of Remove. */
  removed?: boolean;
  /** Called after the server accepted the action. */
  onDone?: (action: ModerationAction) => void;
}

const STRIKE_EXPIRY_PRESETS: readonly (number | null)[] = [30, 90, 365, null];

export function ModerateContentDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  current,
  removed = false,
  onDone,
}: ModerateContentDialogProps) {
  const { t } = useTranslation('c-moderation');
  const featureLabels = useFeatureLabels();
  const timeoutLabel = useTimeoutLabel();
  const ids = useId();
  const canRestore = RESTORABLE.has(entityType);
  const defaultAction: ModerationAction = removed && canRestore ? 'restore' : 'remove';

  const [action, setAction] = useState<ModerationAction>(defaultAction);
  const [reason, setReason] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [strike, setStrike] = useState(false);
  const [strikeDays, setStrikeDays] = useState<string>('90');
  const [timeout, setTimeoutOn] = useState(false);
  const [feature, setFeature] = useState<RestrictableFeature>(DEFAULT_FEATURE[entityType]);
  const [timeoutDays, setTimeoutDays] = useState<string>('7');
  const [submitting, setSubmitting] = useState(false);

  // Fresh form every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setAction(defaultAction);
    setReason('');
    const initial: Record<string, string> = {};
    for (const f of EDITABLE_FIELDS[entityType]) initial[f.key] = current?.[f.key] ?? '';
    setFields(initial);
    setStrike(false);
    setStrikeDays('90');
    setTimeoutOn(false);
    setFeature(DEFAULT_FEATURE[entityType]);
    setTimeoutDays('7');
    setSubmitting(false);
    // `current` is read once per open on purpose: a live update mid-edit must not clobber the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entityType, defaultAction]);

  const ACTION_LABELS: Record<ModerationAction, string> = {
    remove: t('moderate-action-remove', { defaultValue: 'Remove' }),
    edit: t('moderate-action-edit', { defaultValue: 'Edit' }),
    restore: t('moderate-action-restore', { defaultValue: 'Restore' }),
  };
  const FIELD_LABELS: Record<string, string> = {
    content: t('moderate-field-content', { defaultValue: 'Text' }),
    name: t('moderate-field-name', { defaultValue: 'Name' }),
    description: t('moderate-field-description', { defaultValue: 'Description' }),
    title: t('moderate-field-title', { defaultValue: 'Title' }),
    tagline: t('moderate-field-tagline', { defaultValue: 'Tagline' }),
  };
  const actions: ModerationAction[] = [
    removed ? null : 'remove',
    removed ? null : 'edit',
    removed && canRestore ? 'restore' : null,
  ].filter((a): a is ModerationAction => a !== null);
  const penalties = action !== 'restore';

  const submit = async () => {
    const why = reason.trim();
    if (!why) return;
    setSubmitting(true);
    try {
      const res = await api(moderateContentApi, {
        body: {
          entityType,
          entityId,
          action,
          reason: why,
          ...(action === 'edit' ? { fields } : {}),
          ...(penalties && strike
            ? { strike: strikeDays === 'never' ? {} : { expiresDays: Number(strikeDays) } }
            : {}),
          ...(penalties && timeout
            ? {
                restrict: {
                  feature,
                  durationDays: timeoutDays === 'permanent' ? null : Number(timeoutDays),
                },
              }
            : {}),
        },
      });
      toast.success(
        action === 'remove'
          ? t('moderate-toast-removed', { defaultValue: 'Removed. The owner has been notified.' })
          : action === 'edit'
            ? t('moderate-toast-edited', { defaultValue: 'Saved. The owner has been notified.' })
            : t('moderate-toast-restored', { defaultValue: 'Restored. The owner has been notified.' }),
      );
      if (res.strike?.autoBanned) {
        toast.info(
          t('moderate-toast-autobanned', {
            defaultValue: 'That strike reached the limit: the account is suspended for 7 days.',
          }),
        );
      }
      onOpenChange(false);
      onDone?.(action);
    } catch (e) {
      const msg = e instanceof HttpError ? serverError(e) : null;
      toast.error(
        msg ?? t('moderate-toast-error', { defaultValue: 'That did not go through. Try again.' }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('moderate-title', { defaultValue: 'Moderate' })}</DialogTitle>
          <DialogDescription>
            {t('moderate-description', {
              defaultValue: 'The owner is notified with the reason you give.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {actions.length > 1 && (
            <fieldset className="flex flex-wrap gap-2">
              <legend className="t-label mb-1.5">
                {t('moderate-action-legend', { defaultValue: 'Action' })}
              </legend>
              {actions.map((a) => (
                <label
                  key={a}
                  className={`flex cursor-pointer items-center gap-2 rounded-site-sm border px-3 py-1.5 text-sm transition-colors ${
                    action === a
                      ? 'border-site-text bg-site-bg-subtle text-site-text'
                      : 'border-site-border text-site-text-muted hover:bg-site-surface-hover'
                  }`}
                >
                  <input
                    type="radio"
                    name={`${ids}-action`}
                    value={a}
                    checked={action === a}
                    onChange={() => setAction(a)}
                    className="accent-(--site-accent)"
                  />
                  {ACTION_LABELS[a]}
                </label>
              ))}
            </fieldset>
          )}

          {action === 'edit' &&
            EDITABLE_FIELDS[entityType].map((f) => {
              const id = `${ids}-field-${f.key}`;
              return (
                <div key={f.key} className="space-y-1.5">
                  <label htmlFor={id} className="t-label block">
                    {FIELD_LABELS[f.key] ?? f.label}
                  </label>
                  {f.multiline ? (
                    <Textarea
                      id={id}
                      value={fields[f.key] ?? ''}
                      maxLength={f.max}
                      rows={4}
                      onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      className="min-h-0 px-3 py-2"
                    />
                  ) : (
                    <Input
                      id={id}
                      value={fields[f.key] ?? ''}
                      maxLength={f.max}
                      onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    />
                  )}
                </div>
              );
            })}

          <div className="space-y-1.5">
            <label htmlFor={`${ids}-reason`} className="t-label block">
              {t('moderate-reason-label', { defaultValue: 'Reason (sent to the owner)' })}
            </label>
            <Textarea
              id={`${ids}-reason`}
              value={reason}
              maxLength={500}
              rows={3}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('moderate-reason-placeholder', {
                defaultValue: 'For example: harassment of another member',
              })}
              className="min-h-0 resize-none px-3 py-2"
            />
          </div>

          {penalties && (
            <div className="divide-y divide-site-border border-y border-site-border">
              <div className="space-y-2 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span id={`${ids}-strike`} className="t-body text-site-text">
                    {t('moderate-strike-toggle', { defaultValue: 'Add a strike' })}
                  </span>
                  <Switch checked={strike} onCheckedChange={setStrike} aria-labelledby={`${ids}-strike`} />
                </div>
                {strike && (
                  <Select
                    value={strikeDays}
                    onChange={(e) => setStrikeDays(e.target.value)}
                    aria-label={t('moderate-strike-expiry', { defaultValue: 'Strike expires' })}
                  >
                    {STRIKE_EXPIRY_PRESETS.map((d) => (
                      <option key={d ?? 'never'} value={d === null ? 'never' : String(d)}>
                        {d === null
                          ? t('moderate-strike-never', { defaultValue: 'Never expires' })
                          : t('moderate-strike-days', { count: d, defaultValue_one: 'Expires after {{count}} day', defaultValue: 'Expires after {{count}} days' })}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
              <div className="space-y-2 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span id={`${ids}-timeout`} className="t-body text-site-text">
                    {t('moderate-timeout-toggle', { defaultValue: 'Time out the owner from a feature' })}
                  </span>
                  <Switch checked={timeout} onCheckedChange={setTimeoutOn} aria-labelledby={`${ids}-timeout`} />
                </div>
                {timeout && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select
                      value={feature}
                      onChange={(e) => setFeature(e.target.value as RestrictableFeature)}
                      aria-label={t('moderate-timeout-feature', { defaultValue: 'Feature' })}
                    >
                      {RESTRICTABLE_FEATURES.map((f) => (
                        <option key={f} value={f}>
                          {featureLabels[f]}
                        </option>
                      ))}
                    </Select>
                    <Select
                      value={timeoutDays}
                      onChange={(e) => setTimeoutDays(e.target.value)}
                      aria-label={t('moderate-timeout-duration', { defaultValue: 'Duration' })}
                    >
                      {TIMEOUT_PRESETS.map((d) => (
                        <option key={d ?? 'permanent'} value={d === null ? 'permanent' : String(d)}>
                          {timeoutLabel(d)}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            variant={action === 'remove' ? 'danger' : 'primary'}
            onClick={submit}
            disabled={!reason.trim() || submitting}
          >
            {submitting
              ? t('moderate-submitting', { defaultValue: 'Saving…' })
              : ACTION_LABELS[action]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
