import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { reportContentApi } from '@/lib/moderation/moderation.contract';
import { reportToModsApi } from '@/lib/communities/rules.contract';
import type { ReportableRules } from '@/lib/communities/rules';
import { REPORT_DETAILS_MAX, REPORT_REASONS, reportSchema, type ReportReason } from '@/lib/moderation/report-schema';

export type { ReportEntityType } from '@/lib/moderation/report-schema';
import type { ReportEntityType } from '@/lib/moderation/report-schema';

/** The option that reports to the community's own moderators instead of the site's. */
const COMMUNITY_RULE = 'COMMUNITY_RULE' as const;

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: ReportEntityType;
  entityId: string;
  /**
   * s03-13: the community this post belongs to, with its rules. When it has any,
   * the dialog also offers "Breaks a rule of <community>" (reported to that
   * community's moderators); the site reasons stay as they are.
   */
  community?: ReportableRules | undefined;
}

/**
 * Reusable report dialog. Submits to /api/moderation/report. Styled with the
 * site design system (Dialog primitive + Button variants).
 */
export function ReportDialog({ open, onOpenChange, entityType, entityId, community }: ReportDialogProps) {
  const { t: tr } = useTranslation('community-rules');
  const rules = entityType === 'rmhark' ? (community?.rules ?? []) : [];
  const [ruleId, setRuleId] = useState('');
  const { t } = useTranslation('c-moderation');
  const { t: tl } = useTranslation('my-reports');
  const navigate = useNavigate();
  const [reason, setReason] = useState<ReportReason | typeof COMMUNITY_RULE | ''>('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Labels only. The reason VALUES come from the shared schema, and the
  // `Record<ReportReason, string>` annotation means adding a reason server-side
  // fails to compile here until it has a label — instead of shipping a taxonomy
  // the dialog cannot offer.
  const REASON_LABELS: Record<ReportReason, string> = {
    SPAM: t('reason-spam', {
      defaultValue: 'Spam or scam',
    }),
    HARASSMENT: t('reason-harassment', {
      defaultValue: 'Harassment or bullying',
    }),
    HATE: t('reason-hate', {
      defaultValue: 'Hate speech',
    }),
    VIOLENCE: t('reason-violence', {
      defaultValue: 'Violence or threats',
    }),
    SEXUAL: t('reason-sexual', {
      defaultValue: 'Sexual or explicit content',
    }),
    SELF_HARM: t('reason-self-harm', {
      defaultValue: 'Self-harm',
    }),
    MISINFORMATION: t('reason-misinformation', {
      defaultValue: 'Misinformation',
    }),
    ILLEGAL: t('reason-illegal', {
      defaultValue: 'Illegal content',
    }),
    OTHER: t('reason-other', {
      defaultValue: 'Something else',
    }),
  };

  const reset = () => {
    setReason('');
    setRuleId('');
    setDetails('');
    setSubmitting(false);
  };

  const submit = async () => {
    if (!reason) return;
    if (reason === COMMUNITY_RULE) {
      if (!community || !ruleId) return;
      setSubmitting(true);
      try {
        await api(reportToModsApi, {
          params: {
            slug: community.slug,
          },
          body: {
            postId: entityId,
            ruleId,
          },
        });
        toast.success(
          tr('reported-to-mods', {
            name: community.name,
            defaultValue: 'Sent to the moderators of {{name}}.',
          }),
        );
        onOpenChange(false);
        reset();
      } catch (e) {
        toast.error(
          e instanceof HttpError && e.status === 429
            ? tr('report-rate-limited', {
                defaultValue: 'You have sent a lot of reports. Try again later.',
              })
            : tr('report-to-mods-error', {
                defaultValue: 'Could not send the report. Please try again.',
              }),
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }
    // Validate with the schema the route enforces, so a limit can never be
    // enforced on one side only — the 400 would arrive with no field context.
    const parsed = reportSchema.safeParse({
      entityType,
      entityId,
      reason,
      details: details.trim() || undefined,
    });
    if (!parsed.success) {
      toast.error(
        t('toast-invalid', {
          defaultValue: 'That report is missing something. Please check and try again.',
        }),
      );
      return;
    }
    setSubmitting(true);
    try {
      const sent = await api(reportContentApi, {
        body: parsed.data,
      });
      // s03-16: both answers point at "Your reports"; a duplicate says so instead of pretending
      // a second report was filed.
      const toYourReports = {
        label: tl('view-reports', {
          defaultValue: 'Your reports',
        }),
        onClick: () => {
          void navigate({
            to: '/settings/security',
          });
        },
      };
      if (sent.alreadyReported) {
        toast.info(
          tl('already-reported', {
            defaultValue: 'You already have an open report on this.',
          }),
          {
            action: toYourReports,
          },
        );
      } else {
        toast.success(
          t('toast-success', {
            defaultValue: 'Thanks — our team will review this.',
          }),
          {
            action: toYourReports,
          },
        );
      }
      onOpenChange(false);
      reset();
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        toast.error(
          t('toast-sign-in', {
            defaultValue: 'Please sign in to report content.',
          }),
        );
      } else {
        toast.error(
          t('toast-error', {
            defaultValue: 'Could not submit report. Please try again.',
          }),
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('dialog-title', {
              defaultValue: 'Report content',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('dialog-description', {
              defaultValue: "Tell us what's wrong. Reports are anonymous to the person you're reporting.",
            })}
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-1.5">
          {community && rules.length > 0 && (
            <>
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-site-sm border px-3 py-2 text-sm ${
                  reason === COMMUNITY_RULE
                    ? 'border-site-accent bg-site-bg-subtle text-site-text'
                    : 'border-site-border text-site-text-muted hover:bg-site-surface-hover'
                }`}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={COMMUNITY_RULE}
                  checked={reason === COMMUNITY_RULE}
                  onChange={() => setReason(COMMUNITY_RULE)}
                  className="accent-(--site-accent)"
                />
                {tr('breaks-rule', {
                  name: community.name,
                  defaultValue: 'Breaks a rule of {{name}}',
                })}
              </label>
              {reason === COMMUNITY_RULE && (
                <Select
                  value={ruleId}
                  onChange={(e) => setRuleId(e.target.value)}
                  aria-label={tr('rule-picker', {
                    defaultValue: 'Which rule',
                  })}
                >
                  <option value="">
                    {tr('rule-picker-ph', {
                      defaultValue: 'Choose a rule',
                    })}
                  </option>
                  {rules.map((r) => (
                    <option key={r.id} value={r.id}>
                      {tr('rule-option', {
                        n: r.position,
                        title: r.title,
                        defaultValue: '{{n}}. {{title}}',
                      })}
                    </option>
                  ))}
                </Select>
              )}
            </>
          )}
          {REPORT_REASONS.map((value) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-3 rounded-site-sm border px-3 py-2 text-sm transition-colors ${
                reason === value
                  ? 'border-site-accent bg-site-bg-subtle text-site-text'
                  : 'border-site-border text-site-text-muted hover:bg-site-surface-hover'
              }`}
            >
              <input
                type="radio"
                name="report-reason"
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
                className="accent-(--site-accent)"
              />
              {REASON_LABELS[value]}
            </label>
          ))}
        </fieldset>

        {reason !== COMMUNITY_RULE && (
          <Textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={REPORT_DETAILS_MAX}
            placeholder={t('details-placeholder', {
              defaultValue: 'Add any details (optional)',
            })}
            rows={3}
            className="min-h-0 resize-none px-3 py-2"
          />
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('cancel', {
              defaultValue: 'Cancel',
            })}
          </Button>
          <Button
            variant="default"
            onClick={submit}
            disabled={!reason || submitting || (reason === COMMUNITY_RULE && !ruleId)}
          >
            {submitting
              ? t('submitting', {
                  defaultValue: 'Submitting…',
                })
              : t('submit-report', {
                  defaultValue: 'Submit report',
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
