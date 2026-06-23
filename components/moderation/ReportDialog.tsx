'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export type ReportEntityType = 'rmhark' | 'comment' | 'user' | 'build' | 'dm';

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
  const [reason, setReason] = useState<string>('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const REASONS: { value: string; label: string }[] = [
    { value: 'SPAM', label: t("reason-spam", { defaultValue: "Spam or scam" }) },
    { value: 'HARASSMENT', label: t("reason-harassment", { defaultValue: "Harassment or bullying" }) },
    { value: 'HATE', label: t("reason-hate", { defaultValue: "Hate speech" }) },
    { value: 'VIOLENCE', label: t("reason-violence", { defaultValue: "Violence or threats" }) },
    { value: 'SEXUAL', label: t("reason-sexual", { defaultValue: "Sexual or explicit content" }) },
    { value: 'SELF_HARM', label: t("reason-self-harm", { defaultValue: "Self-harm" }) },
    { value: 'MISINFORMATION', label: t("reason-misinformation", { defaultValue: "Misinformation" }) },
    { value: 'ILLEGAL', label: t("reason-illegal", { defaultValue: "Illegal content" }) },
    { value: 'OTHER', label: t("reason-other", { defaultValue: "Something else" }) },
  ];

  const reset = () => {
    setReason('');
    setDetails('');
    setSubmitting(false);
  };

  const submit = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/moderation/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ entityType, entityId, reason, details: details.trim() || undefined }),
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
          {REASONS.map((r) => (
            <label
              key={r.value}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                reason === r.value
                  ? 'border-site-accent bg-site-accent-dim text-site-text'
                  : 'border-site-border text-site-text-muted hover:bg-site-surface'
              }`}
            >
              <input
                type="radio"
                name="report-reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="accent-(--site-accent)"
              />
              {r.label}
            </label>
          ))}
        </fieldset>

        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={1000}
          placeholder={t("details-placeholder", { defaultValue: "Add any details (optional)" })}
          rows={3}
          className="w-full resize-none rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none"
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
