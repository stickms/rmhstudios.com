'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  REPORT_DETAILS_MAX,
  REPORT_REASONS,
  reportSchema,
  type ReportReason,
} from '@/lib/moderation/report-schema';

export type { ReportEntityType } from '@/lib/moderation/report-schema';
import type { ReportEntityType } from '@/lib/moderation/report-schema';

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: ReportEntityType;
  entityId: string;
}

/**
 * Reusable report dialog. Submits to /api/moderation/report. Styled with the
 * site design system (Dialog primitive + Button variants).
 */
export function ReportDialog({ open, onOpenChange, entityType, entityId }: ReportDialogProps) {
  const { t } = useTranslation("c-moderation");
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Labels only. The reason VALUES come from the shared schema, and the
  // `Record<ReportReason, string>` annotation means adding a reason server-side
  // fails to compile here until it has a label — instead of shipping a taxonomy
  // the dialog cannot offer.
  const REASON_LABELS: Record<ReportReason, string> = {
    SPAM: t("reason-spam", { defaultValue: "Spam or scam" }),
    HARASSMENT: t("reason-harassment", { defaultValue: "Harassment or bullying" }),
    HATE: t("reason-hate", { defaultValue: "Hate speech" }),
    VIOLENCE: t("reason-violence", { defaultValue: "Violence or threats" }),
    SEXUAL: t("reason-sexual", { defaultValue: "Sexual or explicit content" }),
    SELF_HARM: t("reason-self-harm", { defaultValue: "Self-harm" }),
    MISINFORMATION: t("reason-misinformation", { defaultValue: "Misinformation" }),
    ILLEGAL: t("reason-illegal", { defaultValue: "Illegal content" }),
    OTHER: t("reason-other", { defaultValue: "Something else" }),
  };

  const reset = () => {
    setReason('');
    setDetails('');
    setSubmitting(false);
  };

  const submit = async () => {
    if (!reason) return;
    // Validate with the schema the route enforces, so a limit can never be
    // enforced on one side only — the 400 would arrive with no field context.
    const parsed = reportSchema.safeParse({
      entityType,
      entityId,
      reason,
      details: details.trim() || undefined,
    });
    if (!parsed.success) {
      toast.error(t("toast-invalid", { defaultValue: "That report is missing something. Please check and try again." }));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/moderation/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(parsed.data),
      });
      if (res.ok) {
        toast.success(t("toast-success", { defaultValue: "Thanks — our team will review this." }));
        onOpenChange(false);
        reset();
      } else if (res.status === 401) {
        toast.error(t("toast-sign-in", { defaultValue: "Please sign in to report content." }));
      } else {
        toast.error(t("toast-error", { defaultValue: "Could not submit report. Please try again." }));
      }
    } catch {
      toast.error(t("toast-error", { defaultValue: "Could not submit report. Please try again." }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dialog-title", { defaultValue: "Report content" })}</DialogTitle>
          <DialogDescription>
            {t("dialog-description", { defaultValue: "Tell us what's wrong. Reports are anonymous to the person you're reporting." })}
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-1.5">
          {REPORT_REASONS.map((value) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-3 rounded-site-sm border px-3 py-2 text-sm transition-colors ${
                reason === value
                  ? 'border-site-accent bg-site-accent-dim text-site-text'
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

        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={REPORT_DETAILS_MAX}
          placeholder={t("details-placeholder", { defaultValue: "Add any details (optional)" })}
          rows={3}
          className="w-full resize-none rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none"
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button variant="accent" onClick={submit} disabled={!reason || submitting}>
            {submitting ? t("submitting", { defaultValue: "Submitting…" }) : t("submit-report", { defaultValue: "Submit report" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
