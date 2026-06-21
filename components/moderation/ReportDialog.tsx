'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export type ReportEntityType = 'rmhark' | 'comment' | 'user' | 'build' | 'dm';

const REASONS: { value: string; label: string }[] = [
  { value: 'SPAM', label: 'Spam or scam' },
  { value: 'HARASSMENT', label: 'Harassment or bullying' },
  { value: 'HATE', label: 'Hate speech' },
  { value: 'VIOLENCE', label: 'Violence or threats' },
  { value: 'SEXUAL', label: 'Sexual or explicit content' },
  { value: 'SELF_HARM', label: 'Self-harm' },
  { value: 'MISINFORMATION', label: 'Misinformation' },
  { value: 'ILLEGAL', label: 'Illegal content' },
  { value: 'OTHER', label: 'Something else' },
];

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
  const [reason, setReason] = useState<string>('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
        toast.success('Thanks — our team will review this.');
        onOpenChange(false);
        reset();
      } else if (res.status === 401) {
        toast.error('Please sign in to report content.');
      } else {
        toast.error('Could not submit report. Please try again.');
      }
    } catch {
      toast.error('Could not submit report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report content</DialogTitle>
          <DialogDescription>
            Tell us what&apos;s wrong. Reports are anonymous to the person you&apos;re reporting.
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
          placeholder="Add any details (optional)"
          rows={3}
          className="w-full resize-none rounded-lg border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none"
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="accent" onClick={submit} disabled={!reason || submitting}>
            {submitting ? 'Submitting…' : 'Submit report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
