/**
 * The client side of site moderation, in one module on purpose: the admin's
 * Moderate button and dialog, the feature-timeout list and the translated
 * labels, plus
 * the moderation contracts and constants re-exported for the dialog and the
 * admin users panel. Every page that uses one of them loads the same single
 * chunk, so the client entry's preload map names one file instead of four
 * (scripts/check-bundle-budget.ts measures that map as part of the entry).
 */

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/Providers';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  type FeatureRestrictionView,
  type RestrictableFeature,
} from '@/lib/moderation/restrictions';
import { cn } from '@/lib/utils';

export { RESTRICTABLE_FEATURES, TIMEOUT_PRESETS };
export {
  getAdminUserModerationApi,
  liftAdminRestrictionApi,
  moderateContentApi,
  restrictAdminUserApi,
} from '@/lib/moderation/admin-moderation.contract';

// ── Labels ────────────────────────────────────────────────────────────────
// Shared by the moderation dialog, the admin users page and the user's
// account-status page so a feature is named the same way everywhere.

export function useFeatureLabels(): Record<RestrictableFeature, string> {
  const { t } = useTranslation('c-moderation');
  return {
    post: t('restriction-feature-post', { defaultValue: 'Posting' }),
    comment: t('restriction-feature-comment', { defaultValue: 'Replying' }),
    message: t('restriction-feature-message', { defaultValue: 'Direct messages' }),
    community: t('restriction-feature-community', { defaultValue: 'Creating communities' }),
    space: t('restriction-feature-space', { defaultValue: 'Hosting spaces' }),
    vibe: t('restriction-feature-vibe', { defaultValue: 'Building vibes' }),
    persona: t('restriction-feature-persona', { defaultValue: 'Creating personas' }),
  };
}

/** "1 day", "7 days", "Permanent". */
export function useTimeoutLabel(): (days: number | null) => string {
  const { t } = useTranslation('c-moderation');
  return (days) =>
    days === null
      ? t('restriction-permanent', { defaultValue: 'Permanent' })
      : t('restriction-days', { count: days, defaultValue_one: '{{count}} day', defaultValue: '{{count}} days' });
}

// ── Feature timeouts as rows on rules ─────────────────────────────────────
// The account-status page shows them read only; the admin users page adds Lift.

export function RestrictionList({
  restrictions,
  onLift,
  liftingId,
}: {
  restrictions: FeatureRestrictionView[];
  /** Admin only: lift an active restriction. */
  onLift?: (id: string) => void;
  liftingId?: string | null;
}) {
  const { t } = useTranslation('c-moderation');
  const labels = useFeatureLabels();

  return (
    <ul className="divide-y divide-site-border border-y border-site-border">
      {restrictions.map((r) => (
        <li key={r.id} className={cn('flex flex-wrap items-start gap-x-4 gap-y-1 py-3', !r.active && 'opacity-60')}>
          <div className="min-w-0 flex-1">
            <p className="t-body font-semibold text-site-text">{labels[r.feature]}</p>
            <p className="t-body text-site-text-muted">{r.reason}</p>
            <p className="t-meta mt-1">
              {r.liftedAt ? (
                t('restriction-lifted', { defaultValue: 'Lifted early' })
              ) : !r.active ? (
                t('restriction-ended', { defaultValue: 'Ended' })
              ) : r.expiresAt ? (
                <>
                  {t('restriction-until', { defaultValue: 'Ends' })} {formatDistanceToNow(new Date(r.expiresAt), { addSuffix: true })}
                </>
              ) : (
                t('restriction-permanent', { defaultValue: 'Permanent' })
              )}
            </p>
          </div>
          {onLift && r.active && (
            <Button size="xs" variant="default" disabled={liftingId === r.id} onClick={() => onLift(r.id)}>
              {t('restriction-lift', { defaultValue: 'Lift' })}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

// ── The admin's entry point on a page about one thing ─────────────────────
// (a community, a space, a vibe, a persona, a removed post). Renders nothing
// for anyone who is not an admin; the dialog mounts on first open.

export interface AdminModerateButtonProps {
  entityType: ModeratableType;
  entityId: string;
  current?: Record<string, string | null | undefined>;
  removed?: boolean;
  onDone?: (action: ModerationAction) => void;
  className?: string;
  size?: 'default' | 'sm' | 'xs';
}

export function AdminModerateButton({
  entityType,
  entityId,
  current,
  removed,
  onDone,
  className,
  size = 'sm',
}: AdminModerateButtonProps) {
  const { t } = useTranslation('c-moderation');
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isAdmin = !!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin;
  if (!isAdmin) return null;

  return (
    <>
      <Button
        variant="danger"
        size={size}
        className={cn(className)}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      >
        <ShieldAlert aria-hidden />
        {removed
          ? t('moderate-button-restore', { defaultValue: 'Moderate: restore' })
          : t('moderate-button', { defaultValue: 'Moderate' })}
      </Button>
      {mounted && (
        <ModerateContentDialog
            open={open}
            onOpenChange={setOpen}
            entityType={entityType}
            entityId={entityId}
            {...(current ? { current } : {})}
            {...(removed !== undefined ? { removed } : {})}
          {...(onDone ? { onDone } : {})}
        />
      )}
    </>
  );
}

// ── The moderation dialog ─────────────────────────────────────────────────
// Remove, edit or restore one piece of user content with a reason the owner is
// told, optionally with a strike and a feature timeout. Talks to
// /api/admin/moderation/content (lib/moderation/content.server.ts). Lives in
// this module (not its own) so the button above can render it without an
// import cycle; the post and reply menus lazy-load this module for it.

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

  // Fresh form every time the dialog opens: reset during render on the
  // closed -> open transition (React's "adjust state when a prop changes"
  // pattern), so no effect runs and the first open frame is already clean.
  // `current` is read once per open on purpose: a live update mid-edit must
  // not clobber the form.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
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
    }
  }

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
